import { heightAt, key, tileAt } from './world.ts';
import type { DoorEntity, Footprint, Point, World } from './worldTypes.ts';
import { segmentIntersectsBox } from './generation/placement.ts';
export { segmentIntersectsBox } from './generation/placement.ts';
import { Statechart } from './machines/statechart.ts';
import { navigationMachine } from './machines/navigation/travel.ts';
import type { CollisionBody, Occupancy } from './occupancy.ts';
import { cpuTrace } from './cpuMetrics.ts';
import { nearSegment, segmentBounds } from './queryBounds.ts';
import { CARDINALS, CLEARANCE, routeGrid } from './routeGrid.ts';
import type { RouteCell } from './routeGrid.ts';

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

const SAMPLE_SPACING = 0.18;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
type Search = {
  from: Point;
  parents: Int32Array;
  costs: Float64Array;
  queue: RouteCell[];
};
type FloorCommand = {
  requested: Point;
  from: Point;
  endpoint: Point | null;
  route: readonly Point[];
  environment: string;
  accepted: boolean;
  partial: boolean;
};

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
  private grid: ReturnType<typeof routeGrid>;
  // Input/search caches only. The chart remains the authority for active travel.
  private floorCommand: FloorCommand | null = null;
  private floorBounds: ReturnType<typeof segmentBounds> | null = null;
  private floorSearch: (Search & { environment: string; geometry: string }) | null = null;
  private floorSearchTime = -Infinity;
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
    this.grid = routeGrid(world, this.doors);
  }

  private refreshGrid(): void {
    const current = routeGrid(this.world, this.doors);
    if (this.grid === current) return;
    this.grid = current;
    this.staticCells.clear();
    this.cancel();
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
    this.floorCommand = null;
    this.floorBounds = null;
    this.floorSearch = null;
    this.floorSearchTime = -Infinity;
  }

  arrive(): void {
    this.chart.send({ type: 'ARRIVE' });
  }

  private bodyGeometry(bodies: readonly CollisionBody[] = []): string {
    return JSON.stringify(bodies.map(({ x, z, h, radius, height }) => [x, z, h, radius, height]));
  }

  private nearCommand(body: CollisionBody, command: FloorCommand): boolean {
    const radius = body.radius + (this.occupancy?.size.radius ?? 0);
    // Include every frontier that could beat the current endpoint, not just the chosen
    // route. A remote body releasing a better approach must still invalidate the hold.
    if (
      distance(body, command.requested) <=
      distance(command.endpoint ?? command.from, command.requested) + 1.5 + radius
    )
      return true;
    let from = command.from;
    for (const to of command.route) {
      const dx = to.x - from.x,
        dz = to.z - from.z;
      const t = Math.max(
        0,
        Math.min(1, ((body.x - from.x) * dx + (body.z - from.z) * dz) / (dx * dx + dz * dz || 1)),
      );
      if (distance(body, { x: from.x + dx * t, z: from.z + dz * t }) <= radius + 1.5) return true;
      from = to;
    }
    return distance(body, command.from) <= radius + 1.5;
  }

  private environment(bodies: readonly CollisionBody[] = [], command?: FloorCommand): string {
    // A moving cylinder affects only a small neighborhood of graph cells/edges. Cache
    // their actual occupancy decisions, not rounded positions or all-world coordinates.
    // Continuous connectors, smoothing and motor probes always use current geometry.
    const blocked = new Set<string>();
    if (this.occupancy)
      for (const body of bodies) {
        const radius = body.radius + this.occupancy.size.radius;
        // The exhausted component, attempted direct segment and goal bound all reachable
        // anchors. Include rejected neighbors, start connectors and continuous refinements.
        const bounds = command && this.floorBounds;
        if (
          bounds &&
          (body.x < bounds.minX - radius - 3 ||
            body.x > bounds.maxX + radius + 3 ||
            body.z < bounds.minZ - radius - 3 ||
            body.z > bounds.maxZ + radius + 3)
        )
          continue;
        const sample = [body];
        for (let x = Math.floor(body.x - radius) - 1; x <= Math.ceil(body.x + radius); x++)
          for (let z = Math.floor(body.z - radius) - 1; z <= Math.ceil(body.z + radius); z++) {
            const h = heightAt(this.world, x, z);
            if (h === null) continue;
            const point = { x, z, h },
              id = key(x, z);
            if (!this.occupancy.canStand(point, sample)) {
              blocked.add(`cell:${id}`);
              continue;
            }
            for (const [dx, dz] of [
              [1, 0],
              [0, 1],
            ] as const) {
              const nextHeight = heightAt(this.world, x + dx, z + dz);
              if (nextHeight === null) continue;
              const next = { x: x + dx, z: z + dz, h: nextHeight };
              if (!this.occupancy.canStand(next, sample)) continue;
              const nextId = key(next.x, next.z);
              if (!this.occupancy.segmentClear(point, next, sample))
                blocked.add(`edge:${id}>${nextId}`);
              if (!this.occupancy.segmentClear(next, point, sample))
                blocked.add(`edge:${nextId}>${id}`);
            }
          }
      }
    return JSON.stringify([
      this.opensDoors,
      this.doors.map((door) => [door.locked, door.open, !!door.collider?.checkCollisions]),
      [...blocked].sort(),
      command ? this.bodyGeometry(bodies.filter((body) => this.nearCommand(body, command))) : null,
    ]);
  }

  /** Held-floor input reuses an unchanged command, including arrival/failure. Small cursor
   * drift on partial routes retries at most twice/second; explicit clicks are immediate. */
  followFloor(from: Point, requested: Point, now: number): boolean {
    if (this.floorCommand) this.refreshGrid();
    const cached = this.floorCommand;
    if (cached) {
      const sameRequest = distance(cached.requested, requested) < 0.08;
      const following = this.active && this.route === cached.route;
      const settled = distance(from, cached.endpoint ?? cached.from) < 0.025;
      const unchanged = cached.environment === this.environment(this.occupancy?.bodies(), cached);
      if (sameRequest && unchanged && (following || settled)) return cached.accepted;
      if (
        (cached.partial || !unchanged) &&
        distance(cached.requested, requested) < 0.5 &&
        now - this.floorSearchTime < 500
      )
        return cached.accepted;
    }
    const accepted = this.goTo(from, requested, { partial: true });
    this.floorSearchTime = now;
    return accepted;
  }

  private staticClear(point: Point, blockers: readonly Footprint[] = this.world.blockers): boolean {
    if (import.meta.env?.DEV) cpuTrace?.count('route.staticClear');
    const tile = tileAt(this.world, point.x, point.z);
    if (!tile || tile.blocked || tile.surface === 'lava') return false;
    for (const dx of [-CLEARANCE, CLEARANCE])
      for (const dz of [-CLEARANCE, CLEARANCE]) {
        const support = tileAt(this.world, point.x + dx, point.z + dz);
        if (!support || support.surface === 'lava' || Math.abs(support.h - tile.h) > 0.65)
          return false;
      }
    return !blockers.some(
      (blocker) =>
        Math.abs(point.x - blocker.x) < blocker.w / 2 + CLEARANCE &&
        Math.abs(point.z - blocker.z) < blocker.d / 2 + CLEARANCE,
    );
  }

  private doorsClear(point: Point, planning = false): boolean {
    return !this.doors.some((door) => {
      const w = door.axis === 'x' ? 0.35 : 2.95;
      const d = door.axis === 'x' ? 2.95 : 0.35;
      return (
        Math.abs(point.x - door.x) < w / 2 + CLEARANCE &&
        Math.abs(point.z - door.z) < d / 2 + CLEARANCE &&
        this.doorBlocks(door, planning)
      );
    });
  }

  private doorBlocks(door: DoorEntity, planning: boolean): boolean {
    return (
      door.locked ||
      (!(planning && this.opensDoors) && (!door.open || !!door.collider?.checkCollisions))
    );
  }

  private doorsSegmentClear(from: Point, to: Point, planning: boolean): boolean {
    return !this.doors.some((door) => {
      return (
        segmentIntersectsBox(
          from,
          to,
          {
            x: door.x,
            z: door.z,
            w: door.axis === 'x' ? 0.35 : 2.95,
            d: door.axis === 'x' ? 2.95 : 0.35,
          },
          CLEARANCE,
        ) && this.doorBlocks(door, planning)
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
      !this.occupancy ||
      !bodies ||
      (h !== null && this.occupancy.canStand({ x: point.x, z: point.z, h }, bodies))
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

  /** A short reverse flood can prove that a small goal pocket has no path from the
   * current forward frontier. Treat unknown static edges as open: this proof may
   * decline to prune, but must never exclude a route the ordinary search could take. */
  private sealedGoal(goal: Point, reached: Int32Array, bodies?: readonly CollisionBody[]): boolean {
    const queue: Point[] = [],
      seen = new Set<string>();
    for (let x = Math.floor(goal.x - 1.5); x <= Math.ceil(goal.x + 1.5); x++)
      for (let z = Math.floor(goal.z - 1.5); z <= Math.ceil(goal.z + 1.5); z++) {
        const p = { x, z };
        if (
          distance(p, goal) > 1.5 ||
          !this.cellClear(p, bodies) ||
          !this.segmentClear(p, goal, true, bodies)
        )
          continue;
        const id = key(x, z);
        const cell = this.grid.cells.get(id);
        if (cell && reached[cell.index] !== 0) return false;
        queue.push(p);
        seen.add(id);
      }
    for (let i = 0; i < queue.length; i++) {
      if (i === 16) return false;
      if (import.meta.env?.DEV) cpuTrace?.count('route.reverseCells');
      const p = queue[i],
        h = heightAt(this.world, p.x, p.z)!;
      for (const [dx, dz] of CARDINALS) {
        const prev = { x: p.x + dx, z: p.z + dz },
          id = key(prev.x, prev.z);
        if (seen.has(id) || !this.cellClear(prev, bodies)) continue;
        const ph = heightAt(this.world, prev.x, prev.z);
        if (
          ph === null ||
          Math.abs(h - ph) > 0.65 ||
          !this.doorsSegmentClear(prev, p, true) ||
          (this.occupancy &&
            bodies &&
            !this.occupancy.segmentClear({ ...prev, h: ph }, { ...p, h }, bodies))
        )
          continue;
        const cell = this.grid.cells.get(id);
        if (cell && reached[cell.index] !== 0) return false;
        seen.add(id);
        queue.push(prev);
      }
    }
    return true;
  }

  /** Probe the first crossed tile rows/columns before doing the full swept test. A
   * missing center tile over an open interval is necessarily rejected by segmentClear. */
  private crossesVoid(from: Point, to: Point): boolean {
    for (const axis of ['x', 'z'] as const) {
      const other = axis === 'x' ? 'z' : 'x',
        d = to[axis] - from[axis];
      if (Math.abs(d) < 1) continue;
      const sign = Math.sign(d),
        start = Math.round(from[axis]);
      for (let n = 1; n <= 3; n++) {
        const v = start + sign * n,
          t = (v - from[axis]) / d;
        if (t >= 1) break;
        const cross = from[other] + t * (to[other] - from[other]);
        // At a corner the ray can merely graze a missing tile.
        for (const offset of [-CLEARANCE, CLEARANCE]) {
          const side = cross + offset,
            cell = Math.round(side);
          if (Math.abs(side - cell) >= 0.49999999) continue;
          if (!this.world.tiles.has(axis === 'x' ? key(v, cell) : key(cell, v))) return true;
        }
      }
    }
    return false;
  }

  segmentClear(
    from: Point,
    to: Point,
    planning = false,
    bodies?: readonly CollisionBody[],
    terrainOnly = false,
  ): boolean {
    if (import.meta.env?.DEV) cpuTrace?.count('route.segmentClear');
    const bounds = segmentBounds(from, to);
    const nearby = this.world.blockers.filter((box) => nearSegment(bounds, box, CLEARANCE));
    if (nearby.some((box) => segmentIntersectsBox(from, to, box, CLEARANCE))) return false;
    if (!terrainOnly && !this.doorsSegmentClear(from, to, planning)) return false;
    // Uniform samples can miss a very short unsupported interval at a room corner.
    // Partition at every center/corner tile crossing; support is constant between
    // these boundaries. A long smoothed route and its short steering probes agree.
    const crossings = [0, 1];
    for (const axis of ['x', 'z'] as const) {
      const delta = to[axis] - from[axis];
      if (Math.abs(delta) < 1e-12) continue;
      for (const offset of [-CLEARANCE, 0, CLEARANCE]) {
        const a = from[axis] + offset,
          b = to[axis] + offset;
        for (let edge = Math.floor(Math.min(a, b) + 0.5) + 0.5; edge < Math.max(a, b); edge++) {
          const t = (edge - a) / delta;
          if (t > 0 && t < 1) crossings.push(t);
        }
      }
    }
    crossings.sort((a, b) => a - b);
    for (let i = 1; i < crossings.length; i++) {
      const t = (crossings[i - 1] + crossings[i]) / 2;
      if (
        !this.staticClear(
          { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t },
          nearby,
        )
      )
        return false;
    }
    const steps = Math.max(1, Math.ceil(distance(from, to) / SAMPLE_SPACING));
    let previous = heightAt(this.world, from.x, from.z);
    if (previous === null) return false;
    // Point-compatible vectors may expose coordinates through prototype accessors.
    let previousPoint = { x: from.x, z: from.z, h: previous };
    for (let i = 1; i <= steps; i++) {
      if (import.meta.env?.DEV) cpuTrace?.count('route.segmentSamples');
      const point = {
        x: from.x + ((to.x - from.x) * i) / steps,
        z: from.z + ((to.z - from.z) * i) / steps,
      };
      const height = heightAt(this.world, point.x, point.z);
      if (
        !this.staticClear(point, nearby) ||
        (!terrainOnly && !this.doorsClear(point, planning)) ||
        height === null ||
        Math.abs(height - previous) > 0.65
      )
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

  /** Exact-goal routing remains the default for AI, pursuit and work. Floor input explicitly
   * opts into a reachable frontier; destination/path always describe the effective route. */
  goTo(
    from: Point,
    requested: Point,
    options: { openDoors?: boolean; partial?: boolean } = {},
  ): boolean {
    const bodies = this.occupancy?.bodies();
    this.refreshGrid();
    this.floorBounds = null;
    if (!options.partial) this.cancel();
    else this.chart.send({ type: 'CANCEL' });
    this.chart.send({ type: 'CONFIGURE', opensDoors: options.openDoors ?? false });
    const environment = options.partial ? this.environment(bodies) : '';
    const accepted = this.plan(from, requested, !!options.partial, bodies, environment);
    if (import.meta.env?.DEV) cpuTrace?.phase('publication');
    this.floorCommand = options.partial
      ? {
          requested: { x: requested.x, z: requested.z },
          from: { x: from.x, z: from.z },
          endpoint: this.destination,
          route: this.route,
          environment,
          accepted,
          partial: !this.destination || distance(this.destination, requested) > 0.025,
        }
      : null;
    if (this.floorCommand)
      this.floorCommand.environment = this.environment(bodies, this.floorCommand);
    return accepted;
  }

  private plan(
    from: Point,
    requested: Point,
    partial: boolean,
    bodies: readonly CollisionBody[] | undefined,
    environment: string,
  ): boolean {
    if (import.meta.env?.DEV) cpuTrace?.phase('goal');
    const tile = tileAt(this.world, requested.x, requested.z);
    if (!tile) return false;
    // Snapshot once per search; moving actors must never enter the static-cell cache.
    // Near a wall edge, use the clicked tile's center rather than an unsafe offset.
    let goal =
      partial || this.canStand(requested, true)
        ? { x: requested.x, z: requested.z }
        : { x: tile.x, z: tile.z };
    const exact = this.canOccupy(goal, true, bodies);
    if (!exact && !partial) return false;
    if (exact && distance(from, goal) < 0.025) return true;
    if (exact && this.segmentClear(from, goal, true, bodies)) {
      this.chart.send({ type: 'PLAN', route: [goal] });
      return true;
    }
    // Near another body the rounded starting cell can be occupied. Connect to nearby
    // free cells instead of abandoning a valid route around the creature.
    if (import.meta.env?.DEV) cpuTrace?.phase('connectors');
    const cached =
      partial && this.floorSearch?.environment === environment ? this.floorSearch : null;
    const geometry = this.bodyGeometry(bodies);
    const sameOrigin = cached && distance(from, cached.from) < 1e-9 && cached.geometry === geometry;
    // Reuse checked connectivity, not a tree rooted at an earlier command. After actual
    // travel the parents/costs must be rebuilt from today's supported starting connectors.
    const search: Search = sameOrigin
      ? cached
      : {
          from: { x: from.x, z: from.z },
          parents: new Int32Array(this.grid.cells.size),
          costs: new Float64Array(this.grid.cells.size),
          queue: [],
        };
    const { parents, costs, queue } = search;
    const grid = this.grid;
    const closed = new Map<DoorEntity, boolean>();
    if (!sameOrigin)
      for (let x = Math.round(from.x) - 1; x <= Math.round(from.x) + 1; x++)
        for (let z = Math.round(from.z) - 1; z <= Math.round(from.z) + 1; z++) {
          const start = { x, z };
          const cell = grid.get(start);
          if (
            cell &&
            this.cellClear(start, bodies) &&
            this.segmentClear(from, start, true, bodies)
          ) {
            parents[cell.index] = -1;
            costs[cell.index] = distance(from, start);
            queue.push(cell);
          }
        }
    if (!sameOrigin) queue.sort((a, b) => distance(a, from) - distance(b, from));
    let goalKey: number | null = null;
    if (import.meta.env?.DEV) cpuTrace?.phase('search');
    for (let i = 0; i < queue.length; i++) {
      // Let short successful routes finish before paying for a reverse probe. Its
      // fixed cap is independent of time and it never changes successful BFS ordering.
      if (i === 12 && !partial) {
        if (import.meta.env?.DEV) cpuTrace?.phase('goalPocket');
        if (this.sealedGoal(goal, parents, bodies)) return false;
        if (import.meta.env?.DEV) cpuTrace?.phase('search');
      }
      if (import.meta.env?.DEV) cpuTrace?.count('route.visited');
      const current = queue[i];
      if (
        exact &&
        distance(current, goal) <= 1.5 &&
        this.segmentClear(current, goal, true, bodies)
      ) {
        goalKey = current.index;
        break;
      }
      if (sameOrigin) continue;
      if (import.meta.env?.DEV) cpuTrace?.count('route.expanded');
      const cell = current;
      for (const edge of cell.edges) {
        if (import.meta.env?.DEV) cpuTrace?.count('route.edges');
        const next = edge.next,
          id = next.index;
        if (parents[id] !== 0) continue;
        if (
          edge.doors.length &&
          edge.doors.some((door) => {
            if (!closed.has(door)) closed.set(door, this.doorBlocks(door, true));
            return closed.get(door);
          })
        )
          continue;
        if (this.occupancy && bodies?.length) {
          if (
            !this.occupancy.canStand(next, bodies) ||
            !this.occupancy.segmentClear(cell, next, bodies)
          )
            continue;
        }
        parents[id] = current.index + 1;
        costs[id] = costs[current.index] + 1;
        queue.push(next);
      }
    }
    if (goalKey === null) {
      if (!partial) return false;
      // Only an exhausted component can be reused for a different cursor request. The
      // finite tile graph visits each cell once; terrain caches are world-local/immutable.
      this.floorSearch = { ...search, environment, geometry };
      const bounds = segmentBounds(from, requested);
      for (const p of queue) {
        bounds.minX = Math.min(bounds.minX, p.x);
        bounds.maxX = Math.max(bounds.maxX, p.x);
        bounds.minZ = Math.min(bounds.minZ, p.z);
        bounds.maxZ = Math.max(bounds.maxZ, p.z);
      }
      this.floorBounds = bounds;
      const fallback = this.closestReachable(from, requested, search, bodies);
      if (!fallback) return false;
      goal = { x: fallback.point.x, z: fallback.point.z };
      goalKey = fallback.anchor === from ? null : grid.get(fallback.anchor)!.index;
    }
    if (import.meta.env?.DEV) cpuTrace?.phase('reconstruction');
    const chain = (end: number | null) => {
      const points: Point[] = [];
      for (let id = end ?? -1; id >= 0; id = parents[id] - 1) {
        if (import.meta.env?.DEV) cpuTrace?.count('route.chainNodes');
        const { x, z } = grid.byIndex[id];
        points.push({ x, z });
      }
      return points.reverse();
    };
    const points = [...chain(goalKey), goal];
    let anchor = from;
    const route: Point[] = [];
    if (import.meta.env?.DEV) cpuTrace?.phase('smoothing');
    for (let i = 0; i < points.length;) {
      let farthest = points.length - 1;
      while (
        farthest >= i &&
        (this.crossesVoid(anchor, points[farthest]) ||
          !this.segmentClear(anchor, points[farthest], true, bodies))
      )
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

  /** Search the reachable component first, then refine its closest frontier. Every candidate
   * has a swept connection to a reached anchor; no world-nearest or through-gate projection.
   * Local refinement is bounded (1.5 units, 12 bisections, then ten eight-way passes). */
  private closestReachable(
    from: Point,
    requested: Point,
    search: Search,
    bodies?: readonly CollisionBody[],
  ) {
    if (import.meta.env?.DEV) cpuTrace?.phase('frontierSort');
    let best = { point: { x: from.x, z: from.z }, anchor: from };
    let score = distance(from, requested);
    let travel = 0;
    // Bisection/refinement precision must not choose the opposite face on roundoff.
    // Within 0.001 units of the best target distance, prefer shorter routed travel.
    const tie = 0.001;
    const cost = (anchor: Point) =>
      anchor === from ? 0 : search.costs[this.grid.get(anchor)!.index];
    // Every reached cell is itself a feasible candidate, and refinements stay within
    // 1.5 units of their anchor. Only this band can beat the closest cell (or origin).
    let cutoff = score;
    for (const p of search.queue) cutoff = Math.min(cutoff, distance(p, requested));
    const anchors = [from, ...search.queue]
      .filter((p) => distance(p, requested) - 1.5 <= cutoff + tie)
      .sort(
        (a, b) =>
          distance(a, requested) - distance(b, requested) ||
          cost(a) - cost(b) ||
          a.x - b.x ||
          a.z - b.z,
      );
    const consider = (point: Point, anchor: Point, refining = false) => {
      if (import.meta.env?.DEV) cpuTrace?.count('route.candidates');
      const d = distance(point, requested);
      if (
        d <= score + tie &&
        this.canOccupy(point, true, bodies) &&
        this.segmentClear(anchor, point, true, bodies)
      ) {
        score = Math.min(score, d);
        const nextTravel = cost(anchor) + distance(anchor, point);
        if (
          refining
            ? d < distance(best.point, requested) - 1e-9
            : distance(best.point, requested) > score + tie ||
              nextTravel < travel - 1e-9 ||
              (Math.abs(nextTravel - travel) <= 1e-9 && d < distance(best.point, requested))
        ) {
          best = { point, anchor };
          travel = nextTravel;
        }
      }
    };
    if (import.meta.env?.DEV) cpuTrace?.phase('frontier');
    for (const anchor of anchors) {
      if (distance(anchor, requested) - 1.5 > score + tie) continue;
      consider(anchor, anchor);
      for (const start of [
        anchor,
        { x: anchor.x, z: requested.z },
        { x: requested.x, z: anchor.z },
      ]) {
        if (
          distance(start, anchor) > 1.5 ||
          !this.canOccupy(start, true, bodies) ||
          !this.segmentClear(anchor, start, true, bodies)
        )
          continue;
        let low = 0,
          high = Math.min(1, 1.5 / Math.max(distance(start, requested), 0.001));
        for (let i = 0; i < 12; i++) {
          const t = (low + high) / 2;
          const point = {
            x: start.x + (requested.x - start.x) * t,
            z: start.z + (requested.z - start.z) * t,
          };
          if (
            distance(anchor, point) <= 1.5 &&
            this.canOccupy(point, true, bodies) &&
            this.segmentClear(anchor, point, true, bodies)
          )
            low = t;
          else high = t;
        }
        consider(
          {
            x: start.x + (requested.x - start.x) * low,
            z: start.z + (requested.z - start.z) * low,
          },
          anchor,
        );
      }
    }
    // Sub-cell alignment, including off-centre clicks and curved living-body boundaries.
    if (import.meta.env?.DEV) cpuTrace?.phase('refinement');
    for (let step = 0.25; step >= 0.00048; step /= 2) {
      const origin = best.point;
      for (const dx of [-step, 0, step])
        for (const dz of [-step, 0, step]) {
          const point = { x: origin.x + dx, z: origin.z + dz };
          if (distance(point, best.anchor) <= 1.5) consider(point, best.anchor, true);
        }
    }
    return distance(from, requested) - distance(best.point, requested) >= 0.025 &&
      distance(from, best.point) >= 0.025
      ? best
      : null;
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
    // A floor command still means its requested point when the environment changes.
    // Preserve exact-goal/door-capable callers' existing PROBE and waiting semantics.
    const floor = this.floorCommand?.route === this.route ? this.floorCommand : null;
    if (!clear && floor && replan) {
      if (this.goTo(position, floor.requested, { partial: true }))
        return this.steer(position, false);
      return null;
    }
    if (!clear || this.waitingForDoor || next !== this.next)
      this.chart.send({
        type: 'PROBE',
        clear,
        canOpen: !clear && this.opensDoors && this.segmentClear(position, ahead, true),
        next,
      });
    if (this.waitingForDoor) {
      for (const door of this.doors) {
        if (distance(position, door) < 2.2 && !door.locked) door.open = true;
      }
      return null;
    }
    if (!this.active) return null;
    if (this.occupancy && !this.segmentClear(position, ahead, true, this.occupancy.bodies())) {
      const destination = floor?.requested ?? this.destination!;
      const openDoors = this.opensDoors;
      if (replan && this.goTo(position, destination, { openDoors, partial: !!floor }))
        return this.steer(position, false);
      this.chart.send({ type: 'CANCEL' });
      return null;
    }
    let remaining = d;
    for (let i = this.next; i < this.route.length - 1; i++)
      remaining += distance(this.route[i], this.route[i + 1]);
    return { point, distance: d, remaining, final: this.next === this.route.length - 1 };
  }

  recordProgress(moved: number, dt: number, position: Point): void {
    if (
      !this.active ||
      this.waitingForDoor ||
      (moved >= 0.0001 && this.chart.snapshot.context.stuckTime === 0)
    )
      return;
    const floor = this.floorCommand?.route === this.route ? this.floorCommand : null;
    this.chart.send({ type: 'PROGRESS', moved, dt });
    if (floor && !this.active) {
      // Remember the actual stop after the chart's stuck timeout. Held input must not
      // restart an immobile motor; a new click, reset or changed environment can retry.
      floor.endpoint = { x: position.x, z: position.z };
      floor.accepted = false;
      floor.partial = true;
      floor.environment = this.environment(this.occupancy?.bodies(), floor);
    }
  }
}
