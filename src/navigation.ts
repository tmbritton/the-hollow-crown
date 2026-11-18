import { heightAt, key, tileAt } from './world.ts';
import type { DoorEntity, Point, World } from './worldTypes.ts';

export type NavigationWorld = Pick<World, 'tiles' | 'blockers' | 'entities'>;
interface Point3 extends Point {
  y: number;
}
export interface GroundRay {
  origin: Point3;
  direction: Point3;
}
export interface SteeringTarget {
  point: Point;
  distance: number;
  remaining: number;
  final: boolean;
}

const CLEARANCE = 0.32;
const SAMPLE_SPACING = 0.18;
const CARDINALS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);

/** Pick the actual tile elevations, including stepped landings and liquid surfaces.
 * Decorative meshes and camera cutaways do not change the navigation surface. */
export function pickGround(world: Pick<World, 'tiles'>, ray: GroundRay): Point | null {
  if (ray.direction.y >= -1e-6) return null;
  let closest = Infinity;
  let point: Point | null = null;
  for (const tile of world.tiles.values()) {
    const surfaceOffset =
      tile.surface === 'water' || tile.surface === 'lava'
        ? 0.11
        : tile.surface === 'stair'
          ? 0.03
          : 0;
    const t = (tile.h + surfaceOffset - ray.origin.y) / ray.direction.y;
    if (t < 0 || t >= closest) continue;
    const x = ray.origin.x + ray.direction.x * t;
    const z = ray.origin.z + ray.direction.z * t;
    if (Math.abs(x - tile.x) <= 0.5 && Math.abs(z - tile.z) <= 0.5) {
      closest = t;
      point = { x, z };
    }
  }
  return point;
}

/** Tile graph routing followed by clearance-checked line-of-sight smoothing. */
export class Navigator {
  private readonly world: NavigationWorld;
  private readonly staticCells = new Map<string, boolean>();
  private readonly doors: DoorEntity[];
  private route: Point[] = [];
  private next = 0;
  private stuckTime = 0;

  constructor(world: NavigationWorld) {
    this.world = world;
    this.doors = world.entities.filter((entity) => entity.type === 'door');
  }

  get active(): boolean {
    return this.next < this.route.length;
  }
  get destination(): Point | null {
    return this.active ? this.route[this.route.length - 1] : null;
  }
  get path(): readonly Point[] {
    return this.route.slice(this.next);
  }

  cancel(): void {
    this.route = [];
    this.next = 0;
    this.stuckTime = 0;
  }

  private staticClear(point: Point): boolean {
    const tile = tileAt(this.world, point.x, point.z);
    if (!tile || tile.blocked || tile.surface === 'lava') return false;
    for (const dx of [-CLEARANCE, CLEARANCE])
      for (const dz of [-CLEARANCE, CLEARANCE]) {
        const support = tileAt(this.world, point.x + dx, point.z + dz);
        if (!support || support.surface === 'lava' || Math.abs(support.h - tile.h) > 0.65)
          return false;
      }
    return !this.world.blockers.some(
      (blocker) =>
        Math.abs(point.x - blocker.x) < blocker.w / 2 + CLEARANCE &&
        Math.abs(point.z - blocker.z) < blocker.d / 2 + CLEARANCE,
    );
  }

  private doorsClear(point: Point): boolean {
    return !this.doors.some((door) => {
      // An opening door remains solid until its physical collider is released.
      if (!door.locked && door.open && !door.collider?.checkCollisions) return false;
      const w = door.axis === 'x' ? 0.35 : 2.95;
      const d = door.axis === 'x' ? 2.95 : 0.35;
      return (
        Math.abs(point.x - door.x) < w / 2 + CLEARANCE &&
        Math.abs(point.z - door.z) < d / 2 + CLEARANCE
      );
    });
  }

  canStand(point: Point): boolean {
    return this.staticClear(point) && this.doorsClear(point);
  }

  private cellClear(point: Point): boolean {
    const id = key(point.x, point.z);
    let clear = this.staticCells.get(id);
    if (clear === undefined) {
      clear = this.staticClear(point);
      this.staticCells.set(id, clear);
    }
    return clear && this.doorsClear(point);
  }

  segmentClear(from: Point, to: Point): boolean {
    const steps = Math.max(1, Math.ceil(distance(from, to) / SAMPLE_SPACING));
    let previous = heightAt(this.world, from.x, from.z);
    if (previous === null) return false;
    for (let i = 1; i <= steps; i++) {
      const point = {
        x: from.x + ((to.x - from.x) * i) / steps,
        z: from.z + ((to.z - from.z) * i) / steps,
      };
      const height = heightAt(this.world, point.x, point.z);
      if (!this.canStand(point) || height === null || Math.abs(height - previous) > 0.65)
        return false;
      previous = height;
    }
    return true;
  }

  goTo(from: Point, requested: Point): boolean {
    this.cancel();
    const tile = tileAt(this.world, requested.x, requested.z);
    if (!tile) return false;
    // Near a wall edge, use the clicked tile's center rather than an unsafe offset.
    const goal = this.canStand(requested) ? { ...requested } : { x: tile.x, z: tile.z };
    if (!this.canStand(goal)) return false;
    if (distance(from, goal) < 0.025) return true;
    if (this.segmentClear(from, goal)) {
      this.route = [goal];
      return true;
    }
    const start = { x: Math.round(from.x), z: Math.round(from.z) };
    if (!this.segmentClear(from, start)) return false;
    const startKey = key(start.x, start.z),
      goalKey = key(tile.x, tile.z);
    const parents = new Map<string, string | null>([[startKey, null]]);
    const queue = [start];
    for (let i = 0; i < queue.length && !parents.has(goalKey); i++) {
      const current = queue[i];
      const currentHeight = heightAt(this.world, current.x, current.z);
      if (currentHeight === null) continue;
      for (const [dx, dz] of CARDINALS) {
        const next = { x: current.x + dx, z: current.z + dz };
        const id = key(next.x, next.z);
        if (parents.has(id) || !this.cellClear(next)) continue;
        const nextHeight = heightAt(this.world, next.x, next.z);
        if (nextHeight === null || Math.abs(nextHeight - currentHeight) > 0.65) continue;
        parents.set(id, key(current.x, current.z));
        queue.push(next);
      }
    }
    if (!parents.has(goalKey)) return false;
    const points: Point[] = [goal];
    for (let id: string | null = goalKey; id !== null; id = parents.get(id) ?? null) {
      const [x, z] = id.split(',').map(Number);
      points.unshift({ x, z });
    }
    let anchor = from;
    for (let i = 0; i < points.length;) {
      let farthest = points.length - 1;
      while (farthest >= i && !this.segmentClear(anchor, points[farthest])) farthest--;
      if (farthest < i) {
        this.cancel();
        return false;
      }
      if (distance(anchor, points[farthest]) > 0.001) this.route.push(points[farthest]);
      anchor = points[farthest];
      i = farthest + 1;
    }
    return true;
  }

  steer(position: Point): SteeringTarget | null {
    while (this.next < this.route.length - 1 && distance(position, this.route[this.next]) < 0.015)
      this.next++;
    if (!this.active) return null;
    const point = this.route[this.next];
    const d = distance(position, point);
    // Check a short swept segment each tick so closing doors cancel stale routes.
    const fraction = Math.min(1, 0.5 / Math.max(d, 0.001));
    const ahead = {
      x: position.x + (point.x - position.x) * fraction,
      z: position.z + (point.z - position.z) * fraction,
    };
    if (!this.segmentClear(position, ahead)) {
      this.cancel();
      return null;
    }
    let remaining = d;
    for (let i = this.next; i < this.route.length - 1; i++)
      remaining += distance(this.route[i], this.route[i + 1]);
    return { point, distance: d, remaining, final: this.next === this.route.length - 1 };
  }

  recordProgress(moved: number, dt: number): void {
    if (!this.active) return;
    this.stuckTime = moved < 0.0001 ? this.stuckTime + dt : 0;
    if (this.stuckTime > 0.4) this.cancel();
  }
}
