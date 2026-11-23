import type { Point, Spawn } from './worldTypes.ts';
import type { Bounds } from './collisionCandidates.ts';

export interface BodySize {
  radius: number;
  height: number;
}
export interface CollisionBody extends Spawn, BodySize {}
export type BodyLookup = (bounds: Bounds) => readonly CollisionBody[];
export type BodyInput = readonly CollisionBody[] | BodyLookup;

const EPSILON = 1e-7;
const SKIN = 0.0001;

/** Live cylindrical bodies, independent of allegiance, render meshes, and AI state. */
export class Occupancy {
  private readonly readSize: () => BodySize;
  readonly bodies: () => readonly CollisionBody[];
  readonly withView: <T>(read: (lookup: BodyLookup) => T) => T;
  /** Test-only instrumentation; never retains a query or a result in the motor. */
  contactProbe?: (sample: {
    from: Spawn;
    to: Spawn;
    size: BodySize;
    bodies: readonly CollisionBody[];
    hit: boolean;
    solveMs: number;
  }) => void;

  constructor(
    size: BodySize | (() => BodySize),
    bodies: () => readonly CollisionBody[],
    withView = <T>(read: (lookup: BodyLookup) => T) => {
      const snapshot = bodies();
      return read(() => snapshot);
    },
  ) {
    this.readSize = typeof size === 'function' ? size : () => size;
    this.bodies = bodies;
    this.withView = withView;
  }

  get size(): BodySize {
    return this.readSize();
  }

  private nearby(from: Spawn, to: Spawn, size: BodySize, input: BodyInput) {
    if (typeof input !== 'function') return input;
    const { radius, height } = size;
    return input({
      minX: Math.min(from.x, to.x) - radius - EPSILON,
      maxX: Math.max(from.x, to.x) + radius + EPSILON,
      minZ: Math.min(from.z, to.z) - radius - EPSILON,
      maxZ: Math.max(from.z, to.z) + radius + EPSILON,
      minY: Math.min(from.h, to.h) - EPSILON,
      maxY: Math.max(from.h, to.h) + height + EPSILON,
    });
  }

  canStand(point: Spawn, input?: BodyInput): boolean {
    if (!input) return this.withView((view) => this.canStand(point, view));
    const size = this.size;
    return this.nearby(point, point, size, input).every(
      (body) =>
        point.h >= body.h + body.height ||
        point.h + size.height <= body.h ||
        Math.hypot(point.x - body.x, point.z - body.z) >= size.radius + body.radius - EPSILON,
    );
  }

  /** Earliest swept contact, including height overlap. End-point tests alone permit tunnelling. */
  private contact(from: Spawn, to: Spawn, input: BodyInput, size: BodySize) {
    const dx = to.x - from.x,
      dz = to.z - from.z;
    if (dx * dx + dz * dz < EPSILON * EPSILON) return null;
    const bodies = this.nearby(from, to, size, input);
    const probe = import.meta.env?.DEV ? this.contactProbe : undefined;
    const start = probe ? performance.now() : 0;
    const hit = this.solveContact(from, to, bodies, size);
    probe?.({ from, to, size, bodies, hit: hit !== null, solveMs: performance.now() - start });
    return hit;
  }

  private solveContact(from: Spawn, to: Spawn, bodies: readonly CollisionBody[], size: BodySize) {
    const dx = to.x - from.x,
      dz = to.z - from.z,
      dh = to.h - from.h;
    const length2 = dx * dx + dz * dz;
    let first: { time: number; normal: Point } | null = null;
    for (const body of bodies) {
      const x = from.x - body.x,
        z = from.z - body.z;
      const radius = size.radius + body.radius;
      const dot = x * dx + z * dz;
      const separation = x * x + z * z - radius * radius;
      // An externally placed/respawned overlap may escape, but cannot move deeper through a body.
      if (separation <= EPSILON && dot >= -EPSILON) continue;
      const discriminant = dot * dot - length2 * separation;
      if (discriminant <= 0) continue;
      let enter = Math.max(0, (-dot - Math.sqrt(discriminant)) / length2);
      let exit = Math.min(1, (-dot + Math.sqrt(discriminant)) / length2);
      const low = body.h - size.height,
        high = body.h + body.height;
      if (Math.abs(dh) < EPSILON) {
        if (from.h <= low || from.h >= high) continue;
      } else {
        const a = (low - from.h) / dh,
          b = (high - from.h) / dh;
        enter = Math.max(enter, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
      }
      if (enter >= exit || (first && enter >= first.time)) continue;
      const nx = x + dx * enter,
        nz = z + dz * enter;
      const length = Math.hypot(nx, nz);
      first = {
        time: enter,
        normal:
          length > EPSILON
            ? { x: nx / length, z: nz / length }
            : { x: -dx / Math.sqrt(length2), z: -dz / Math.sqrt(length2) },
      };
    }
    return first;
  }

  segmentClear(from: Spawn, to: Spawn, input?: BodyInput): boolean {
    if (!input) return this.withView((view) => this.segmentClear(from, to, view));
    return this.contact(from, to, input, this.size) === null;
  }

  /** Clip and slide without displacing other actors. Every slide is checked against terrain too. */
  move(
    from: Spawn,
    displacement: Point,
    terrainMove: (from: Spawn, displacement: Point) => Spawn,
  ): Spawn {
    const size = { ...this.size };
    return this.withView((view) => this.slide(from, displacement, terrainMove, view, size));
  }

  private slide(
    from: Spawn,
    displacement: Point,
    terrainMove: (from: Spawn, displacement: Point) => Spawn,
    bodies: BodyLookup,
    size: BodySize,
  ): Spawn {
    let position: Spawn = { ...from };
    const steps = Math.max(1, Math.ceil(Math.hypot(displacement.x, displacement.z) / 0.15));
    for (let step = 0; step < steps; step++) {
      let remaining = { x: displacement.x / steps, z: displacement.z / steps };
      for (let slide = 0; slide < 3; slide++) {
        const next = terrainMove(position, remaining);
        const dx = next.x - position.x,
          dz = next.z - position.z;
        const hit = this.contact(position, next, bodies, size);
        if (!hit) {
          position = next;
          break;
        }
        const fraction = Math.max(0, hit.time - SKIN / Math.max(SKIN, Math.hypot(dx, dz)));
        position = {
          x: position.x + dx * fraction,
          z: position.z + dz * fraction,
          h: position.h + (next.h - position.h) * fraction,
        };
        remaining = { x: dx * (1 - fraction), z: dz * (1 - fraction) };
        const inward = Math.min(0, remaining.x * hit.normal.x + remaining.z * hit.normal.z);
        remaining.x -= inward * hit.normal.x;
        remaining.z -= inward * hit.normal.z;
        if (Math.hypot(remaining.x, remaining.z) < EPSILON) break;
      }
    }
    return position;
  }
}
