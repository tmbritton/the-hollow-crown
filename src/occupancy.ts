import type { Point, Spawn } from './worldTypes.ts';

export interface BodySize {
  radius: number;
  height: number;
}
export interface CollisionBody extends Spawn, BodySize {}

const EPSILON = 1e-7;
const SKIN = 0.0001;

/** Live cylindrical bodies, independent of allegiance, render meshes, and AI state. */
export class Occupancy {
  readonly size: BodySize;
  readonly bodies: () => readonly CollisionBody[];
  private readonly slowingBodies: () => readonly CollisionBody[];

  constructor(
    size: BodySize,
    bodies: () => readonly CollisionBody[],
    slowingBodies: () => readonly CollisionBody[] = () => [],
  ) {
    this.size = size;
    this.bodies = bodies;
    this.slowingBodies = slowingBodies;
  }

  slowedAt(point: Spawn): boolean {
    return !this.canStand(point, this.slowingBodies());
  }

  canStand(point: Spawn, bodies = this.bodies()): boolean {
    return bodies.every(
      (body) =>
        point.h >= body.h + body.height ||
        point.h + this.size.height <= body.h ||
        Math.hypot(point.x - body.x, point.z - body.z) >= this.size.radius + body.radius - EPSILON,
    );
  }

  /** Earliest swept contact, including height overlap. End-point tests alone permit tunnelling. */
  private contact(from: Spawn, to: Spawn, bodies: readonly CollisionBody[]) {
    const dx = to.x - from.x,
      dz = to.z - from.z,
      dh = to.h - from.h;
    const length2 = dx * dx + dz * dz;
    let first: { time: number; normal: Point } | null = null;
    if (length2 < EPSILON * EPSILON) return first;
    for (const body of bodies) {
      const x = from.x - body.x,
        z = from.z - body.z;
      const radius = this.size.radius + body.radius;
      const dot = x * dx + z * dz;
      const separation = x * x + z * z - radius * radius;
      // An externally placed/respawned overlap may escape, but cannot move deeper through a body.
      if (separation <= EPSILON && dot >= -EPSILON) continue;
      const discriminant = dot * dot - length2 * separation;
      if (discriminant <= 0) continue;
      let enter = Math.max(0, (-dot - Math.sqrt(discriminant)) / length2);
      let exit = Math.min(1, (-dot + Math.sqrt(discriminant)) / length2);
      const low = body.h - this.size.height,
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

  segmentClear(from: Spawn, to: Spawn, bodies = this.bodies()): boolean {
    return this.contact(from, to, bodies) === null;
  }

  /** Clip and slide without displacing other actors. Every slide is checked against terrain too. */
  move(
    from: Spawn,
    displacement: Point,
    terrainMove: (from: Spawn, displacement: Point) => Spawn,
  ): Spawn {
    const bodies = this.bodies();
    let position: Spawn = { ...from };
    const steps = Math.max(1, Math.ceil(Math.hypot(displacement.x, displacement.z) / 0.15));
    for (let step = 0; step < steps; step++) {
      let remaining = { x: displacement.x / steps, z: displacement.z / steps };
      for (let slide = 0; slide < 3; slide++) {
        const next = terrainMove(position, remaining);
        const dx = next.x - position.x,
          dz = next.z - position.z;
        const hit = this.contact(position, next, bodies);
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
