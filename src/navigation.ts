import { heightAt, key, tileAt } from './world.ts';
import type { DoorEntity, Footprint, Point, World } from './worldTypes.ts';
import { Statechart } from './machines/statechart.ts';
import { navigationMachine } from './machines/navigation/travel.ts';
import type { CollisionBody, Occupancy } from './occupancy.ts';

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

/** Exact slab intersection avoids tunnelling through thin cover or clipping corners. */
export function segmentIntersectsBox(from: Point, to: Point, box: Footprint, padding = 0): boolean {
  let enter = 0,
    exit = 1;
  for (const axis of ['x', 'z'] as const) {
    const half = (axis === 'x' ? box.w : box.d) / 2 + padding;
    const delta = to[axis] - from[axis],
      low = box[axis] - half,
      high = box[axis] + half;
    if (Math.abs(delta) < 1e-10) {
      if (from[axis] <= low || from[axis] >= high) return false;
    } else {
      const a = (low - from[axis]) / delta,
        b = (high - from[axis]) / delta;
      enter = Math.max(enter, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
      if (enter >= exit) return false;
    }
  }
  return enter < exit;
}

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
  readonly occupancy?: Occupancy;
  private readonly staticCells = new Map<string, boolean>();
  private readonly doors: DoorEntity[];
  readonly chart = new Statechart(navigationMachine);
  private get route() {
    return this.chart.snapshot.context.route;
  }
  private get next() {
    return this.chart.snapshot.context.next;
  }
  private get opensDoors() {
    return this.chart.snapshot.context.opensDoors;
  }
  get waitingForDoor() {
    return this.chart.snapshot.matches('waitingForDoor');
  }

  constructor(world: NavigationWorld, occupancy?: Occupancy) {
    this.world = world;
    this.occupancy = occupancy;
    this.doors = world.entities.filter((entity) => entity.type === 'door');
  }

  get active(): boolean {
    return !this.chart.snapshot.matches('idle');
  }
  get destination(): Point | null {
    return this.active ? this.route[this.route.length - 1] : null;
  }
  get path(): readonly Point[] {
    return this.route.slice(this.next);
  }

  cancel(): void {
    this.chart.send({ type: 'CANCEL' });
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

  private doorsClear(point: Point, planning = false): boolean {
    return !this.doors.some((door) => {
      // An opening door remains solid until its physical collider is released.
      if (!door.locked && door.open && !door.collider?.checkCollisions) return false;
      if (planning && this.opensDoors && !door.locked) return false;
      const w = door.axis === 'x' ? 0.35 : 2.95;
      const d = door.axis === 'x' ? 2.95 : 0.35;
      return (
        Math.abs(point.x - door.x) < w / 2 + CLEARANCE &&
        Math.abs(point.z - door.z) < d / 2 + CLEARANCE
      );
    });
  }

  canStand(point: Point, planning = false): boolean {
    return this.staticClear(point) && this.doorsClear(point, planning);
  }

  canOccupy(point: Point, planning = false, bodies = this.occupancy?.bodies()): boolean {
    return this.canStand(point, planning) && this.bodyClear(point, bodies);
  }

  private bodyClear(point: Point, bodies?: readonly CollisionBody[]): boolean {
    const h = heightAt(this.world, point.x, point.z);
    return (
      !this.occupancy || !bodies || (h !== null && this.occupancy.canStand({ ...point, h }, bodies))
    );
  }

  /** Respawns use nearby reachable floor when a living actor occupies the checkpoint. */
  nearestOpenPoint(point: Point): Point | null {
    if (this.bodyClear(point, this.occupancy?.bodies())) return point;
    const terrain = new Navigator(this.world);
    const candidates = [...this.world.tiles.values()].sort(
      (a, b) => distance(a, point) - distance(b, point),
    );
    for (const candidate of candidates)
      if (this.canOccupy(candidate) && terrain.goTo(point, candidate)) return candidate;
    return null;
  }

  private cellClear(point: Point, bodies?: readonly CollisionBody[]): boolean {
    const id = key(point.x, point.z);
    let clear = this.staticCells.get(id);
    if (clear === undefined) {
      clear = this.staticClear(point);
      this.staticCells.set(id, clear);
    }
    return clear && this.doorsClear(point, true) && this.bodyClear(point, bodies);
  }

  segmentClear(
    from: Point,
    to: Point,
    planning = false,
    bodies?: readonly CollisionBody[],
  ): boolean {
    if (this.world.blockers.some((box) => segmentIntersectsBox(from, to, box, CLEARANCE)))
      return false;
    const steps = Math.max(1, Math.ceil(distance(from, to) / SAMPLE_SPACING));
    let previous = heightAt(this.world, from.x, from.z);
    if (previous === null) return false;
    let previousPoint = { ...from, h: previous };
    for (let i = 1; i <= steps; i++) {
      const point = {
        x: from.x + ((to.x - from.x) * i) / steps,
        z: from.z + ((to.z - from.z) * i) / steps,
      };
      const height = heightAt(this.world, point.x, point.z);
      if (!this.canStand(point, planning) || height === null || Math.abs(height - previous) > 0.65)
        return false;
      if (
        bodies &&
        this.occupancy &&
        !this.occupancy.segmentClear(previousPoint, { ...point, h: height }, bodies)
      )
        return false;
      previousPoint = { ...point, h: height };
      previous = height;
    }
    return true;
  }

  goTo(from: Point, requested: Point, options: { openDoors?: boolean } = {}): boolean {
    this.cancel();
    this.chart.send({ type: 'CONFIGURE', opensDoors: options.openDoors ?? false });
    const tile = tileAt(this.world, requested.x, requested.z);
    if (!tile) return false;
    // Snapshot once per search; moving actors must never enter the static-cell cache.
    const bodies = this.occupancy?.bodies();
    // Near a wall edge, use the clicked tile's center rather than an unsafe offset.
    const goal = this.canStand(requested, true) ? { ...requested } : { x: tile.x, z: tile.z };
    if (!this.canOccupy(goal, true, bodies)) return false;
    if (distance(from, goal) < 0.025) return true;
    if (this.segmentClear(from, goal, true, bodies)) {
      this.chart.send({ type: 'PLAN', route: [goal] });
      return true;
    }
    // Near another body the rounded starting cell can be occupied. Connect to nearby
    // free cells instead of abandoning a valid route around the creature.
    const parents = new Map<string, string | null>();
    const queue: Point[] = [];
    for (let x = Math.round(from.x) - 1; x <= Math.round(from.x) + 1; x++)
      for (let z = Math.round(from.z) - 1; z <= Math.round(from.z) + 1; z++) {
        const start = { x, z };
        if (this.cellClear(start, bodies) && this.segmentClear(from, start, true, bodies)) {
          parents.set(key(x, z), null);
          queue.push(start);
        }
      }
    queue.sort((a, b) => distance(a, from) - distance(b, from));
    let goalKey: string | null = null;
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      if (distance(current, goal) <= 1.5 && this.segmentClear(current, goal, true, bodies)) {
        goalKey = key(current.x, current.z);
        break;
      }
      const currentHeight = heightAt(this.world, current.x, current.z);
      if (currentHeight === null) continue;
      for (const [dx, dz] of CARDINALS) {
        const next = { x: current.x + dx, z: current.z + dz };
        const id = key(next.x, next.z);
        if (parents.has(id) || !this.cellClear(next, bodies)) continue;
        const nextHeight = heightAt(this.world, next.x, next.z);
        if (nextHeight === null || Math.abs(nextHeight - currentHeight) > 0.65) continue;
        if (
          this.occupancy &&
          bodies &&
          !this.occupancy.segmentClear(
            { ...current, h: currentHeight },
            { ...next, h: nextHeight },
            bodies,
          )
        )
          continue;
        parents.set(id, key(current.x, current.z));
        queue.push(next);
      }
    }
    if (goalKey === null) return false;
    const points: Point[] = [goal];
    for (let id: string | null = goalKey; id !== null; id = parents.get(id) ?? null) {
      const [x, z] = id.split(',').map(Number);
      points.unshift({ x, z });
    }
    let anchor = from;
    const route: Point[] = [];
    for (let i = 0; i < points.length;) {
      let farthest = points.length - 1;
      while (farthest >= i && !this.segmentClear(anchor, points[farthest], true, bodies))
        farthest--;
      if (farthest < i) {
        this.cancel();
        return false;
      }
      if (distance(anchor, points[farthest]) > 0.001) route.push(points[farthest]);
      anchor = points[farthest];
      i = farthest + 1;
    }
    this.chart.send({ type: 'PLAN', route });
    return true;
  }

  steer(position: Point, replan = true): SteeringTarget | null {
    if (!this.active) return null;
    let next = this.next;
    while (next < this.route.length - 1 && distance(position, this.route[next]) < 0.015) next++;
    const point = this.route[next];
    const d = distance(position, point);
    // Check a short swept segment each tick so closing doors cancel stale routes.
    const fraction = Math.min(1, 0.5 / Math.max(d, 0.001));
    const ahead = {
      x: position.x + (point.x - position.x) * fraction,
      z: position.z + (point.z - position.z) * fraction,
    };
    const clear = this.segmentClear(position, ahead);
    if (!clear || this.waitingForDoor || next !== this.next)
      this.chart.send({
        type: 'PROBE',
        clear,
        canOpen: !clear && this.opensDoors && this.segmentClear(position, ahead, true),
        next,
      });
    if (this.waitingForDoor) {
      for (const door of this.doors) {
        if (!door.locked && distance(position, door) < 2.2) door.open = true;
      }
      return null;
    }
    if (!this.active) return null;
    if (this.occupancy && !this.segmentClear(position, ahead, true, this.occupancy.bodies())) {
      const destination = this.destination!;
      const openDoors = this.opensDoors;
      if (replan && this.goTo(position, destination, { openDoors }))
        return this.steer(position, false);
      this.cancel();
      return null;
    }
    let remaining = d;
    for (let i = this.next; i < this.route.length - 1; i++)
      remaining += distance(this.route[i], this.route[i + 1]);
    return { point, distance: d, remaining, final: this.next === this.route.length - 1 };
  }

  recordProgress(moved: number, dt: number): void {
    if (
      !this.active ||
      this.waitingForDoor ||
      (moved >= 0.0001 && this.chart.snapshot.context.stuckTime === 0)
    )
      return;
    this.chart.send({ type: 'PROGRESS', moved, dt });
  }
}
