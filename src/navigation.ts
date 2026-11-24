import { heightAt, key, tileAt } from './worldSpatial.ts';
import type { DoorEntity, Footprint, Point, Spawn, Tile, World } from './worldTypes.ts';
import { segmentIntersectsBox } from './generation/placement.ts';
export { segmentIntersectsBox } from './generation/placement.ts';
import { Statechart } from './machines/statechart.ts';
import { navigationMachine } from './machines/navigation/travel.ts';
import { Occupancy, type BodyInput, type CollisionBody } from './occupancy.ts';
import { cpuTrace, cpuTiming } from './cpuMetrics.ts';
import { nearSegment, segmentBounds } from './queryBounds.ts';
import { CARDINALS, CLEARANCE, TERRAIN_RADIUS, routeGrid } from './routeGrid.ts';
import type { RouteCell } from './routeGrid.ts';
import type { RouteBudget, RouteJob } from './routeBudget.ts';
import { exitClear, FailureProof, RouteProof, type Exit, type ExitSnapshot } from './routeProof.ts';
type Options = { openDoors?: boolean; partial?: boolean };
export type RouteResult = 'ready' | 'pending' | 'unreachable' | 'invalidated';
function finish<T>(g: Generator<void, T>): T {
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
  }
}

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
  floor: boolean;
}

const SAMPLE_SPACING = 0.18;
const FRONTIER_REACH = 1.5;
const FRONTIER_TIE = 0.001;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);

function insideMargin(point: Point, box: Footprint): boolean {
  return (
    Math.abs(point.x - box.x) < box.w / 2 + CLEARANCE &&
    Math.abs(point.z - box.z) < box.d / 2 + CLEARANCE
  );
}

/** The normal to the nearest point of the solid defines a separating half-plane,
 * including at rounded ellipsoid contacts with a corner. */
function separates(from: Point, to: Point, box: Footprint): boolean {
  const x = from.x - box.x,
    z = from.z - box.z;
  const w = box.w / 2,
    d = box.d / 2;
  const nx = Math.sign(x) * Math.max(0, Math.abs(x) - w),
    nz = Math.sign(z) * Math.max(0, Math.abs(z) - d);
  return (
    Math.hypot(nx, nz) >= TERRAIN_RADIUS - 1e-9 && nx * (to.x - from.x) + nz * (to.z - from.z) >= 0
  );
}

function doorFootprint(door: DoorEntity): Footprint {
  return {
    x: door.x,
    z: door.z,
    w: door.axis === 'x' ? 0.35 : 2.95,
    d: door.axis === 'x' ? 2.95 : 0.35,
  };
}
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
  settledEnvironment?: string;
  footprint: string;
  accepted: boolean;
  partial: boolean;
  proof?: RouteProof;
  failure?: { proof: FailureProof; snapshot: ExitSnapshot };
};
type GridExit = RouteCell['edges'][number];
type RejectedExit =
  | { from: Point; to: Point; stand: boolean; connector?: RouteCell }
  | { from: RouteCell; edge: GridExit };

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

/** A missed surface can still name a destination; it never proves support. */
export function projectGroundAim(
  world: Pick<World, 'tiles'>,
  ray: GroundRay,
  referenceHeight: number,
): Point | null {
  const hit = pickGround(world, ray);
  if (hit) return hit;
  if (!(ray.direction.y < -1e-6)) return null;
  const t = (referenceHeight - ray.origin.y) / ray.direction.y;
  if (!Number.isFinite(t) || t < 0) return null;
  const x = ray.origin.x + ray.direction.x * t;
  const z = ray.origin.z + ray.direction.z * t;
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}

/** Tile graph routing followed by clearance-checked line-of-sight smoothing. */
export class Navigator {
  private budget?: RouteBudget;
  private readonly capability: () => boolean;
  private sequence = 0;
  get requestSequence() {
    return this.sequence;
  }
  private owner?: () => Point | null;
  private work?: { key: string; job: RouteJob; floor: Point | null };
  private outcome: RouteResult | null = null;
  get planningResult() {
    return this.pending ? 'pending' : this.outcome;
  }
  private failure?: { key: string; stamp: string };
  private proof?: RouteProof;
  private gates?: Map<DoorEntity, boolean>;
  private rejectedExits?: RejectedExit[];
  private reached?: Search;
  get pending() {
    return !!this.work;
  }
  scheduleWith(budget: RouteBudget, owner: () => Point | null) {
    this.cancel();
    this.budget = budget;
    this.owner = owner;
  }
  private readonly world: NavigationWorld;
  readonly occupancy?: Occupancy;
  private readonly staticCells = new Map<string, boolean>();
  private readonly doors: DoorEntity[];
  private grid: ReturnType<typeof routeGrid>;
  // Input/search caches only. The chart remains the authority for active travel.
  private floorCommand: FloorCommand | null = null;
  private floorBounds: ReturnType<typeof segmentBounds> | null = null;
  private floorSearch:
    | (Search & { environment: string; geometry: string; footprint: string })
    | null = null;
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

  constructor(
    world: NavigationWorld,
    occupancy?: Occupancy,
    capability: () => boolean = () => true,
  ) {
    this.capability = capability;
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
    this.sequence++;
    if (this.work) {
      this.budget?.remove(this.work.job);
      this.work = undefined;
    }
    this.failure = undefined;
    this.outcome = null;
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

  private moverFootprint(): string {
    const size = this.occupancy?.size;
    return size ? `${size.radius}:${size.height}` : '';
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

  private environment(
    bodies: readonly CollisionBody[] = [],
    command?: FloorCommand,
    settled = false,
  ): string {
    const gates = this.doors.map((door) => [
      door.locked,
      door.open,
      !!door.collider?.checkCollisions,
    ]);
    if (command?.proof && this.occupancy)
      return JSON.stringify([
        this.opensDoors,
        gates,
        command.proof.fingerprint(this.occupancy, bodies, settled),
      ]);
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
      gates,
      [...blocked].sort(),
      command ? this.bodyGeometry(bodies.filter((body) => this.nearCommand(body, command))) : null,
    ]);
  }

  /** Held-floor input reuses an unchanged command, including arrival/failure. Small cursor
   * drift on partial routes retries at most twice/second; explicit clicks are immediate. */
  followFloor(from: Point, requested: Point, now: number): boolean {
    if (this.work?.floor && distance(this.work.floor, requested) < 0.08) return true;
    if (this.floorCommand) this.refreshGrid();
    const cached = this.floorCommand;
    // Cursor drift can wait, but a changed footprint can make the old route unsafe
    // even when every body and discrete cell/edge decision is unchanged.
    if (cached && cached.footprint === this.moverFootprint()) {
      const sameRequest = distance(cached.requested, requested) < 0.08;
      const following = this.active && this.route === cached.route;
      const settled = distance(from, cached.endpoint ?? cached.from) < 0.025;
      const atEnd = settled && !following && !!cached.settledEnvironment;
      const baseline = atEnd ? cached.settledEnvironment : cached.environment;
      const bodies = this.occupancy?.bodies();
      const unchanged = cached.failure
        ? this.reuseFailure(cached.failure, bodies)
        : baseline === this.environment(bodies, cached, atEnd);
      if (sameRequest && unchanged && (following || settled)) return cached.accepted;
      if (
        !(cached.failure && sameRequest && !unchanged) &&
        (cached.partial || !unchanged) &&
        distance(cached.requested, requested) < 0.5 &&
        now - this.floorSearchTime < 500
      )
        return cached.accepted;
    }
    const accepted = this.intent(from, requested, { partial: true });
    this.floorSearchTime = now;
    return accepted;
  }

  private reuseFailure(
    failure: NonNullable<FloorCommand['failure']>,
    bodies?: readonly CollisionBody[],
  ) {
    const live = failure.proof.snapshot(
      bodies?.map((body) => ({ ...body })),
      (door) => this.doorBlocks(door, true),
    );
    const settled = finish(failure.proof.recheck(this.occupancy, failure.snapshot, live));
    if (!settled) return false;
    failure.snapshot = settled;
    return true;
  }

  private staticClear(
    point: Point,
    blockers: readonly Footprint[] = this.world.blockers,
    escapingTile?: Tile,
  ): boolean {
    if (import.meta.env?.DEV) cpuTrace?.count('route.staticClear');
    const tile = tileAt(this.world, point.x, point.z);
    if (!tile || (tile.blocked && tile !== escapingTile) || tile.surface === 'lava') return false;
    for (const dx of [-CLEARANCE, CLEARANCE])
      for (const dz of [-CLEARANCE, CLEARANCE]) {
        const support = tileAt(this.world, point.x + dx, point.z + dz);
        if (!support || support.surface === 'lava' || Math.abs(support.h - tile.h) > 0.65)
          return false;
      }
    return !blockers.some((box) => insideMargin(point, box));
  }

  private blockingDoorAt(point: Point, planning = false, doors = this.doors) {
    return doors.find(
      (door) => insideMargin(point, doorFootprint(door)) && this.doorBlocks(door, planning),
    );
  }

  private doorsClear(point: Point, planning = false, doors = this.doors): boolean {
    return !this.blockingDoorAt(point, planning, doors);
  }

  private doorBlocks(door: DoorEntity, planning: boolean): boolean {
    if (this.gates && planning) {
      const saved = this.gates.get(door);
      if (saved !== undefined) return saved;
    }
    const blocks =
      door.locked ||
      (!(planning && this.opensDoors) && (!door.open || !!door.collider?.checkCollisions));
    if (planning) this.gates?.set(door, blocks);
    return blocks;
  }

  private blockingDoorAlong(from: Point, to: Point, planning: boolean, doors = this.doors) {
    return doors.find((door) => {
      return (
        segmentIntersectsBox(from, to, doorFootprint(door), CLEARANCE) &&
        this.doorBlocks(door, planning)
      );
    });
  }

  canStand(point: Point, planning = false): boolean {
    return this.staticClear(point) && this.doorsClear(point, planning);
  }

  canOccupy(point: Point, planning = false, bodies?: BodyInput): boolean {
    return (
      this.canStand(point, planning) &&
      (bodies || !this.occupancy
        ? this.bodyClear(point, bodies)
        : this.occupancy.withView((view) => this.bodyClear(point, view)))
    );
  }

  private bodyClear(point: Point, bodies?: BodyInput): boolean {
    const h = heightAt(this.world, point.x, point.z);
    return (
      !this.occupancy ||
      !bodies ||
      (h !== null && this.standBody({ x: point.x, z: point.z, h }, bodies))
    );
  }
  private standBody(p: Spawn, bodies: BodyInput) {
    const ok = this.occupancy!.canStand(p, bodies);
    return this.proof?.watch(p, undefined, ok) ?? ok;
  }
  private sweepBody(a: Spawn, b: Spawn, bodies: BodyInput) {
    const ok = this.occupancy!.segmentClear(a, b, bodies);
    return this.proof?.watch(a, b, ok) ?? ok;
  }

  /** Respawns use nearby reachable floor when a living actor occupies the checkpoint. */
  nearestOpenPoint(point: Point): Point | null {
    return this.occupancy
      ? this.occupancy.withView((view) => this.nearest(point, view))
      : this.nearest(point);
  }

  private nearest(point: Point, bodies?: BodyInput): Point | null {
    if (this.bodyClear(point, bodies)) return point;
    const terrain = new Navigator(this.world);
    const candidates = [...this.world.tiles.values()].sort(
      (a, b) => distance(a, point) - distance(b, point),
    );
    for (const candidate of candidates)
      if (this.canOccupy(candidate, false, bodies) && terrain.goTo(point, candidate))
        return candidate;
    return null;
  }

  private cellClear(point: Point, bodies?: BodyInput): boolean {
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
  private sealedGoal(goal: Point, reached: Int32Array, bodies?: BodyInput): boolean {
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
          this.blockingDoorAlong(prev, p, true) ||
          (this.occupancy && bodies && !this.sweepBody({ ...prev, h: ph }, { ...p, h }, bodies))
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
    bodies?: BodyInput,
    terrainOnly = false,
  ): boolean {
    return this.sweptClear(
      from,
      to,
      planning,
      bodies,
      terrainOnly,
      this.world.blockers,
      this.doors,
    );
  }

  /** Preserve the legacy terrain-only default of segmentClear and explicit body lists. */
  liveSegmentClear(from: Point, to: Point, planning = false): boolean {
    return this.occupancy
      ? this.occupancy.withView((view) => this.segmentClear(from, to, planning, view))
      : this.segmentClear(from, to, planning);
  }

  private sweptClear(
    from: Point,
    to: Point,
    planning: boolean,
    bodies: BodyInput | undefined,
    terrainOnly: boolean,
    blockers: readonly Footprint[],
    doors: DoorEntity[],
  ): boolean {
    return finish(this.sweep(from, to, planning, bodies, terrainOnly, blockers, doors, false));
  }
  private *checkedSegment(a: Point, b: Point, bodies?: BodyInput): Generator<void, boolean> {
    if (!this.proof || distance(a, b) <= 2) return this.segmentClear(a, b, true, bodies);
    return yield* this.sweep(a, b, true, bodies, false, this.world.blockers, this.doors, true);
  }

  private *sealFailure(
    root: Point,
    exits: readonly RejectedExit[],
    bodies: readonly CollisionBody[] = [],
  ): Generator<void, FailureProof> {
    const proof = new FailureProof(root);
    const reached = this.reached;
    const wasReached = (cell: RouteCell) => !!reached?.parents[cell.index];
    const graphExit = (from: RouteCell, { next, doors }: GridExit): Exit => ({
      from,
      to: next,
      doors,
      checks: this.occupancy ? [{ a: next }, { a: from, b: next }] : [],
    });
    if (reached) {
      for (let i = 0; i < reached.queue.length; i++) {
        if (i && i % 16 === 0) yield;
        const cell = reached.queue[i];
        for (const edge of cell.edges)
          if (wasReached(edge.next)) yield* proof.add(graphExit(cell, edge), true);
      }
      for (let x = Math.round(root.x) - 1; x <= Math.round(root.x) + 1; x++)
        for (let z = Math.round(root.z) - 1; z <= Math.round(root.z) + 1; z++) {
          const cell = this.grid.get({ x, z });
          if (!cell || !wasReached(cell)) continue;
          const link = yield* this.compileExit(root, cell, true);
          if (link) yield* proof.add(link, true);
        }
    }
    const seen = new Set<string>();
    let count = 0;
    for (const exit of exits) {
      if (++count % 16 === 0) yield;
      if ('edge' in exit) {
        if (!wasReached(exit.edge.next)) yield* proof.add(graphExit(exit.from, exit.edge), false);
        continue;
      }
      const { from, to, stand, connector } = exit;
      if (connector && wasReached(connector)) continue;
      const id = JSON.stringify([from.x, from.z, to.x, to.z, stand]);
      if (seen.has(id)) continue;
      seen.add(id);
      const witness = yield* this.compileExit(from, to, stand);
      // A derived progress prefix may have been clear even though the actual
      // sample failed. Only a blocked-to-open transition can wake this hold.
      if (
        witness &&
        !(yield* exitClear(witness, this.occupancy, bodies, (door) => this.doorBlocks(door, true)))
      )
        yield* proof.add(witness, false);
    }
    return proof;
  }

  private *compileExit(from: Point, to: Point, stand: boolean): Generator<void, Exit | undefined> {
    const doors = new Set<DoorEntity>();
    const checks: Exit['checks'] = [];
    if (stand) {
      if (!this.staticClear(to)) return undefined;
      for (const door of this.doors) if (insideMargin(to, doorFootprint(door))) doors.add(door);
      if (this.occupancy)
        checks.push({ a: { x: to.x, z: to.z, h: heightAt(this.world, to.x, to.z)! } });
    }
    if (
      yield* this.sweep(from, to, true, undefined, false, this.world.blockers, this.doors, true, {
        doors,
        checks,
      })
    )
      return { from, to, checks, doors: [...doors] };
  }

  private *sweep(
    from: Point,
    to: Point,
    planning: boolean,
    bodies: BodyInput | undefined,
    terrainOnly: boolean,
    blockers: readonly Footprint[],
    doors: DoorEntity[],
    paced: boolean,
    witness?: { doors: Set<DoorEntity>; checks: Exit['checks'] },
  ): Generator<void, boolean> {
    if (import.meta.env?.DEV) cpuTrace?.count('route.segmentClear');
    const bounds = segmentBounds(from, to);
    const escaping = (box: Footprint) => insideMargin(from, box) && separates(from, to, box);
    const nearby = blockers.filter((box) => nearSegment(bounds, box, CLEARANCE) && !escaping(box));
    if (nearby.some((box) => segmentIntersectsBox(from, to, box, CLEARANCE))) return false;
    const sweptDoors = terrainOnly
      ? []
      : doors.filter((door) => {
          const box = doorFootprint(door);
          return nearSegment(bounds, box, CLEARANCE) && !escaping(box);
        });
    if (witness) {
      for (const door of sweptDoors)
        if (segmentIntersectsBox(from, to, doorFootprint(door), CLEARANCE)) witness.doors.add(door);
    } else if (this.blockingDoorAlong(from, to, planning, sweptDoors)) return false;
    // Generation marks the centers of prop-covered tiles. The tile can extend
    // well outside the solid: leave only the initial tile, and only on the safe
    // side of every footprint that could have marked it.
    const startTile = tileAt(this.world, from.x, from.z);
    const claims = startTile?.blocked ? blockers.filter((box) => insideMargin(startTile, box)) : [];
    const escapingTile =
      claims.length && claims.every((box) => separates(from, to, box)) ? startTile : undefined;
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
          if (paced && crossings.length % 64 === 0) yield;
        }
      }
    }
    crossings.sort((a, b) => a - b);
    for (let i = 1; i < crossings.length; i++) {
      if (paced && i % 32 === 0) yield;
      const t = (crossings[i - 1] + crossings[i]) / 2;
      if (
        !this.staticClear(
          { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t },
          nearby,
          escapingTile,
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
      if (paced && i % 16 === 0) yield;
      if (import.meta.env?.DEV) cpuTrace?.count('route.segmentSamples');
      const point = {
        x: from.x + ((to.x - from.x) * i) / steps,
        z: from.z + ((to.z - from.z) * i) / steps,
      };
      const height = heightAt(this.world, point.x, point.z);
      if (
        !this.staticClear(point, nearby, escapingTile) ||
        height === null ||
        Math.abs(height - previous) > 0.65
      )
        return false;
      if (witness) {
        for (const door of sweptDoors)
          if (insideMargin(point, doorFootprint(door))) witness.doors.add(door);
        if (this.occupancy) witness.checks.push({ a: previousPoint, b: { ...point, h: height } });
      } else if (this.blockingDoorAt(point, planning, sweptDoors)) return false;
      if (
        bodies &&
        this.occupancy &&
        !this.sweepBody(previousPoint, { ...point, h: height }, bodies)
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
    if (this.work) this.cancel();
    const occupancy = this.occupancy;
    if (!occupancy) return finish(this.steps(from, requested, options, undefined, undefined));
    return occupancy.withView((view) => {
      // Probe the pinned view locally; only partial-cache identity needs the complete list.
      const fingerprintBodies = options.partial ? occupancy.bodies() : undefined;
      return finish(this.steps(from, requested, options, view, fingerprintBodies));
    });
  }
  private *steps(
    from: Point,
    requested: Point,
    options: Options,
    bodies: BodyInput | undefined,
    fingerprintBodies: readonly CollisionBody[] | undefined,
  ): Generator<void, boolean> {
    this.refreshGrid();
    this.floorBounds = null;
    if (!options.partial) this.cancel();
    else this.chart.send({ type: 'CANCEL' });
    this.chart.send({ type: 'CONFIGURE', opensDoors: options.openDoors ?? false });
    const footprint = options.partial ? this.moverFootprint() : '';
    const environment =
      options.partial && this.floorSearch ? this.environment(fingerprintBodies) : null;
    const accepted = yield* this.plan(
      from,
      requested,
      !!options.partial,
      bodies,
      fingerprintBodies,
      environment,
      footprint,
    );
    if (import.meta.env?.DEV) cpuTrace?.phase('publication');
    this.floorCommand = options.partial
      ? {
          requested: { x: requested.x, z: requested.z },
          from: { x: from.x, z: from.z },
          endpoint: this.destination,
          route: this.route,
          environment: '',
          footprint,
          accepted,
          partial: !this.destination || distance(this.destination, requested) > 0.025,
        }
      : null;
    if (this.floorCommand && !this.proof)
      this.floorCommand.environment = this.environment(fingerprintBodies, this.floorCommand);
    return accepted;
  }

  /** Intent accepted into planning, or a route installed immediately. Neither pending
   * nor an invalidated attempt is evidence that a goal is unreachable. */
  intent(from: Point, goal: Point, options: Options = {}): boolean {
    const state = this.request(from, goal, options);
    return state === 'ready' || state === 'pending';
  }
  request(from: Point, requested: Point, options: Options = {}): RouteResult {
    const budget = this.budget,
      owner = this.owner;
    if (!budget || !owner)
      return this.goTo(from, requested, {
        ...options,
        openDoors: !!options.openDoors && this.capability(),
      })
        ? 'ready'
        : 'unreachable';
    const goal = { x: requested.x, z: requested.z };
    options = { ...options };
    const id = JSON.stringify([goal.x, goal.z, !!options.partial, !!options.openDoors]);
    if (this.work?.key === id) return 'pending';
    const stamp = () =>
      JSON.stringify([
        from.x,
        from.z,
        this.capability(),
        this.occupancy?.size.radius,
        this.occupancy?.size.height,
        this.bodyGeometry(this.occupancy?.bodies()),
        this.doors.map((d) => [d.locked, d.open, !!d.collider?.checkCollisions]),
      ]);
    if (
      this.failure?.key === id &&
      this.failure.stamp === stamp() &&
      this.grid.matches(this.world, this.doors)
    ) {
      this.failure = undefined;
      return 'unreachable';
    }
    this.cancel();
    this.chart.send({ type: 'CONFIGURE', opensDoors: !!options.openDoors });
    let state: RouteResult = 'pending';
    const load = { cost: 6 };
    const submitted = budget.ticks;
    const run = this.scheduledPlan(goal, options, budget, owner, load);
    const job: RouteJob = {
      cost: () => load.cost,
      advance: () => {
        load.cost = 1;
        const result = run.next();
        if (!result.done) return false;
        this.outcome = state = result.value;
        if (import.meta.env?.DEV) {
          cpuTiming?.count(`route.outcome.${state}`);
          cpuTiming?.count('route.latencyTicks', budget.ticks - submitted);
        }
        this.work = undefined;
        // A floor failure keeps its own checked snapshot. Stamping newer live
        // geometry here could swallow the retry when the next hold sees an opening.
        if (state === 'unreachable' && !this.floorCommand?.failure)
          this.failure = { key: id, stamp: stamp() };
        return true;
      },
      retire: () => {
        this.outcome = state = 'invalidated';
        this.work = undefined;
        run.return('invalidated');
      },
    };
    this.work = { key: id, job, floor: options.partial ? goal : null };
    budget.submit(job);
    return state;
  }
  private *scheduledPlan(
    goal: Point,
    options: Options,
    budget: RouteBudget,
    owner: () => Point | null,
    load: { cost: number },
  ): Generator<void, RouteResult> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const admitted = budget.ticks;
      const live = owner();
      if (!live) return 'invalidated';
      const start = { x: live.x, z: live.z };
      const opens = !!options.openDoors && this.capability();
      this.chart.send({ type: 'CONFIGURE', opensDoors: opens });
      const bodies = this.occupancy?.bodies().map((b) => ({ ...b }));
      // An exact direct command needs only current continuous geometry, not a new
      // search chart or a whole-grid compatibility walk. Admission is still charged.
      if (
        !options.partial &&
        distance(start, goal) <= 4 &&
        this.canOccupy(goal, true, bodies) &&
        (distance(start, goal) < 0.025 || this.segmentClear(start, goal, true, bodies))
      ) {
        if (distance(start, goal) >= 0.025) this.chart.send({ type: 'PLAN', route: [goal] });
        return 'ready';
      }
      const radius = this.occupancy?.size.radius,
        height = this.occupancy?.size.height;
      const footprint = this.occupancy
        ? new Occupancy({ ...this.occupancy.size }, () => bodies ?? [])
        : undefined;
      const draft = new Navigator(this.world, footprint);
      draft.proof = new RouteProof();
      draft.gates = new Map();
      if (options.partial) draft.rejectedExits = [];
      const work = draft.steps(
        start,
        goal,
        { ...options, openDoors: opens },
        bodies,
        options.partial ? bodies : undefined,
      );
      let tick = budget.ticks;
      const current = () => {
        const p = owner();
        return (
          p &&
          opens === (!!options.openDoors && this.capability()) &&
          p.x === start.x &&
          p.z === start.z &&
          radius === this.occupancy?.size.radius &&
          height === this.occupancy?.size.height &&
          draft.grid.matches(this.world, this.doors)
        );
      };
      let result = work.next();
      while (!result.done) {
        yield;
        if (tick !== budget.ticks && !current()) break;
        tick = budget.ticks;
        result = work.next();
      }
      if (result.done) {
        const failed = !result.value && draft.rejectedExits;
        const failureProof = failed ? yield* draft.sealFailure(start, failed, bodies) : undefined;
        const failureStart = failureProof?.snapshot(bodies, (door) => draft.doorBlocks(door, true));
        if (!failureProof) yield* draft.proof.seal(result.value);
        if (budget.ticks !== admitted) {
          load.cost = 6;
          yield;
        }
        let checked = bodies;
        const proof = draft.proof;
        const signature = (snapshot: readonly CollisionBody[] = []) =>
          footprint ? JSON.stringify(proof.fingerprint(footprint, snapshot)) : '';
        let verified = failureProof ? '' : signature(checked);
        for (let pass = 0; pass < 8; pass++) {
          const now = this.occupancy?.bodies().map((b) => ({ ...b }));
          const live = failureProof?.snapshot(now, (door) => this.doorBlocks(door, true));
          let settledFailure: ExitSnapshot | undefined;
          const liveSignature = failureProof ? '' : signature(now);
          if (failureProof && failureStart && live) {
            // A negative installs no route. Publish against the snapshot actually
            // checked, even if it took several ticks. The next hold checks changes
            // since that snapshot; resampling here can chase masked motion forever.
            const validation = failureProof.recheck(footprint, failureStart, live);
            let step = validation.next();
            while (!step.done) {
              yield;
              if (!current()) break;
              step = validation.next();
            }
            if (!step.done || !step.value) break;
            settledFailure = step.value;
          }
          if (verified === liveSignature) {
            if (
              !current() ||
              (!failureProof &&
                [...draft.gates].some(([d, blocked]) => this.doorBlocks(d, true) !== blocked))
            )
              break;
            this.grid = draft.grid;
            this.staticCells.clear();
            this.floorBounds = draft.floorBounds;
            this.floorSearch = null;
            if (draft.active)
              this.chart.send({ type: 'PLAN', route: draft.path.map((p) => ({ ...p })) });
            this.floorCommand = draft.floorCommand
              ? {
                  ...draft.floorCommand,
                  route: this.route,
                  proof:
                    draft.active && !tileAt(this.world, goal.x, goal.z) ? draft.proof : undefined,
                  failure:
                    failureProof && settledFailure
                      ? { proof: failureProof, snapshot: settledFailure }
                      : undefined,
                }
              : null;
            if (this.floorCommand && !failureProof) {
              this.floorCommand.environment = this.environment(now, this.floorCommand);
              if (this.floorCommand.proof)
                this.floorCommand.settledEnvironment = this.environment(
                  now,
                  this.floorCommand,
                  true,
                );
            }
            return result.value ? 'ready' : 'unreachable';
          }
          if (!footprint || !(yield* proof.validate(footprint, checked ?? [], now ?? []))) break;
          checked = now;
          verified = liveSignature;
        }
      }
      load.cost = 6;
      yield;
    }
    return 'invalidated';
  }

  private *plan(
    from: Point,
    requested: Point,
    partial: boolean,
    bodies: BodyInput | undefined,
    fingerprintBodies: readonly CollisionBody[] | undefined,
    environment: string | null,
    footprint: string,
  ): Generator<void, boolean> {
    if (import.meta.env?.DEV) cpuTrace?.phase('goal');
    const tile = tileAt(this.world, requested.x, requested.z);
    if (!tile && !partial) return false;
    // Near a wall edge, use the clicked tile's center rather than an unsafe offset.
    let goal =
      !tile || partial || this.canStand(requested, true)
        ? { x: requested.x, z: requested.z }
        : { x: tile.x, z: tile.z };
    const goalStand = this.canStand(goal, true);
    const exact = goalStand && this.bodyClear(goal, bodies);
    if (!exact && !partial) return false;
    if (exact && distance(from, goal) < 0.025) return true;
    if (this.proof && distance(from, goal) > 4) yield;
    let usedFrontier = false;
    if (exact && (yield* this.travelSegment(from, goal, bodies, () => usedFrontier))) {
      this.chart.send({ type: 'PLAN', route: [goal] });
      return true;
    }
    this.rejectedExits?.push({ from, to: goal, stand: true });
    // Near another body the rounded starting cell can be occupied. Connect to nearby
    // free cells instead of abandoning a valid route around the creature.
    if (import.meta.env?.DEV) cpuTrace?.phase('connectors');
    if (this.proof) yield;
    const cached =
      partial &&
      this.floorSearch?.environment === environment &&
      this.floorSearch.footprint === footprint
        ? this.floorSearch
        : null;
    const geometry = cached ? this.bodyGeometry(fingerprintBodies) : undefined;
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
    if (this.rejectedExits) this.reached = search;
    const grid = this.grid;
    const closed = new Map<DoorEntity, boolean>();
    let goalKey: number | null = null;
    let approaches: Set<number> | undefined;
    // An unused edge becoming blocked cannot improve a successful plan. An edge
    // reopening into the unreached component can expose a better partial endpoint.
    const watchConnector = (cell: RouteCell) => {
      if (this.proof) this.proof.scope = (clear) => !clear && !!approaches?.has(cell.index);
    };
    if (!sameOrigin)
      for (let x = Math.round(from.x) - 1; x <= Math.round(from.x) + 1; x++)
        for (let z = Math.round(from.z) - 1; z <= Math.round(from.z) + 1; z++) {
          const start = { x, z };
          const cell = grid.get(start);
          if (cell) watchConnector(cell);
          if (
            cell &&
            this.cellClear(start, bodies) &&
            this.segmentClear(from, start, true, bodies)
          ) {
            parents[cell.index] = -1;
            costs[cell.index] = distance(from, start);
            queue.push(cell);
          } else if (cell)
            this.rejectedExits?.push({ from, to: cell, stand: true, connector: cell });
        }
    if (this.proof) this.proof.scope = undefined;
    if (!sameOrigin) queue.sort((a, b) => distance(a, from) - distance(b, from));
    // A blocked near click can finish as soon as all potentially winning anchors
    // have their ordinary FIFO costs. Never cache this prefix as an exhausted tree.
    let pending =
      partial && !exact && !sameOrigin && distance(from, goal) <= 8
        ? this.localFrontier(from, goal, bodies)
        : null;
    if (pending) for (const cell of queue) pending.delete(cell.index);
    if (import.meta.env?.DEV) cpuTrace?.phase('search');
    for (let i = 0; i < queue.length; i++) {
      if (this.proof && i % 16 === 0) yield;
      if (pending && pending.size === 0) {
        const local = yield* this.closestReachable(from, requested, search, bodies, true);
        if (local && (yield* this.travelSegment(from, local.point, bodies))) {
          usedFrontier = true;
          if (this.proof)
            approaches = yield* this.frontierApproaches(local.point, requested, parents);
          this.bodyClear(local.point, bodies);
          if (import.meta.env?.DEV) cpuTrace?.count('route.localApproaches');
          this.floorSearch = null;
          this.floorBounds = this.searchBounds(from, requested, queue);
          this.chart.send({ type: 'PLAN', route: [{ x: local.point.x, z: local.point.z }] });
          return true;
        }
        pending = null;
      }
      if (i === 384) pending = null;
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
      if (distance(current, goal) <= FRONTIER_REACH)
        this.rejectedExits?.push({ from: current, to: goal, stand: true });
      if (sameOrigin) continue;
      if (import.meta.env?.DEV) cpuTrace?.count('route.expanded');
      const cell = current;
      for (const edge of cell.edges) {
        if (import.meta.env?.DEV) cpuTrace?.count('route.edges');
        const next = edge.next,
          id = next.index;
        if (parents[id] !== 0) continue;
        const gate = edge.doors.find((door) => {
          if (!closed.has(door)) closed.set(door, this.doorBlocks(door, true));
          return closed.get(door);
        });
        if (gate) {
          this.rejectedExits?.push({ from: cell, edge });
          continue;
        }
        if (
          this.occupancy &&
          bodies &&
          (typeof bodies === 'function' || bodies.length || this.proof)
        ) {
          watchConnector(next);
          const clear = this.standBody(next, bodies) && this.sweepBody(cell, next, bodies);
          if (this.proof) this.proof.scope = undefined;
          if (!clear) {
            this.rejectedExits?.push({ from: cell, edge });
            continue;
          }
        }
        parents[id] = current.index + 1;
        costs[id] = costs[current.index] + 1;
        queue.push(next);
        pending?.delete(id);
      }
    }
    if (goalKey === null) {
      if (!partial) return false;
      // Only an exhausted component can be reused for a different cursor request. The
      // finite tile graph visits each cell once; terrain caches are world-local/immutable.
      this.floorSearch = {
        ...search,
        environment: environment ?? this.environment(fingerprintBodies),
        geometry: geometry ?? this.bodyGeometry(fingerprintBodies),
        footprint,
      };
      this.floorBounds = this.searchBounds(from, requested, queue);
      const fallback = yield* this.closestReachable(from, requested, search, bodies);
      if (!fallback) return false;
      usedFrontier = true;
      goal = { x: fallback.point.x, z: fallback.point.z };
      if (this.proof) approaches = yield* this.frontierApproaches(goal, requested, parents);
      this.bodyClear(goal, bodies);
      goalKey = fallback.anchor === from ? null : grid.get(fallback.anchor)!.index;
    }
    if (import.meta.env?.DEV) cpuTrace?.phase('reconstruction');
    const points: Point[] = [];
    for (let id = goalKey ?? -1; id >= 0; id = parents[id] - 1) {
      if (this.proof && points.length % 64 === 0) yield;
      if (import.meta.env?.DEV) cpuTrace?.count('route.chainNodes');
      const { x, z } = grid.byIndex[id];
      points.push({ x, z });
    }
    points.reverse().push(goal);
    let anchor = from;
    const route: Point[] = [];
    if (import.meta.env?.DEV) cpuTrace?.phase('smoothing');
    for (let i = 0; i < points.length;) {
      let farthest = points.length - 1;
      let rejects = 0;
      for (; farthest >= i; farthest--) {
        if (this.crossesVoid(anchor, points[farthest])) {
          if (this.proof && ++rejects % 16 === 0) yield;
          continue;
        }
        if (this.proof) yield;
        if (yield* this.travelSegment(anchor, points[farthest], bodies)) break;
        this.rejectedExits?.push({ from: anchor, to: points[farthest], stand: false });
      }
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

  private searchBounds(from: Point, goal: Point, queue: readonly Point[]) {
    const bounds = segmentBounds(from, goal);
    for (const p of queue) {
      bounds.minX = Math.min(bounds.minX, p.x);
      bounds.maxX = Math.max(bounds.maxX, p.x);
      bounds.minZ = Math.min(bounds.minZ, p.z);
      bounds.maxZ = Math.max(bounds.maxZ, p.z);
    }
    return bounds;
  }

  private *travelSegment(from: Point, to: Point, bodies?: BodyInput, keepRejection = () => false) {
    let chosen = false;
    if (this.proof) {
      this.proof.scope = (clear) => chosen || (!clear && keepRejection());
      this.proof.travel = { from, to };
    }
    chosen = yield* this.checkedSegment(from, to, bodies);
    if (this.proof) {
      this.proof.scope = undefined;
      this.proof.travel = undefined;
    }
    return chosen;
  }

  /** An opening can improve a reachable endpoint only if it leads to an unseen
   * competitive anchor. Trace those anchors backwards through the unseen graph,
   * ignoring bodies but respecting the pinned door decisions. A previously
   * reached cell already supplied all its forward edges to the search. */
  private *frontierApproaches(end: Point, goal: Point, reached: Int32Array) {
    const band = distance(end, goal) + FRONTIER_REACH + FRONTIER_TIE;
    const unseen = new Set<number>();
    const queue: RouteCell[] = [];
    const add = (cell: RouteCell) => {
      if (!reached[cell.index] && !unseen.has(cell.index)) {
        unseen.add(cell.index);
        queue.push(cell);
      }
    };
    for (const cell of this.grid.byIndex) {
      if (cell.index && cell.index % 128 === 0) yield;
      if (distance(cell, goal) <= band) add(cell);
    }
    for (let i = 0; i < queue.length; i++) {
      if (i && i % 16 === 0) yield;
      const cell = queue[i];
      for (const [dx, dz] of CARDINALS) {
        const previous = this.grid.cells.get(key(cell.x + dx, cell.z + dz));
        if (!previous || reached[previous.index] || unseen.has(previous.index)) continue;
        if (
          previous.edges.some(
            (edge) => edge.next === cell && !edge.doors.some((door) => this.doorBlocks(door, true)),
          )
        )
          add(previous);
      }
    }
    return unseen;
  }

  private localFrontier(from: Point, goal: Point, bodies?: BodyInput): Set<number> | null {
    // The closest reached center gives an upper bound on target distance. Every
    // refinement stays within FRONTIER_REACH of its anchor. Enumerate a superset
    // of the anchors exhaustive selection could sort, including distance ties.
    const cells: RouteCell[] = [];
    let closest = distance(from, goal);
    for (let x = Math.floor(goal.x - 5); x <= Math.ceil(goal.x + 5); x++)
      for (let z = Math.floor(goal.z - 5); z <= Math.ceil(goal.z + 5); z++) {
        const cell = this.grid.cells.get(key(x, z));
        // Door traversal uses directed edge slabs. A point test on a tangent can
        // disagree at floating-point boundaries, so keep it as a possible contender.
        if (!cell || !this.bodyClear(cell, bodies)) continue;
        closest = Math.min(closest, distance(cell, goal));
        cells.push(cell);
      }
    if (closest + FRONTIER_REACH + FRONTIER_TIE >= 5) return null;
    return new Set(
      cells
        .filter((p) => distance(p, goal) - FRONTIER_REACH <= closest + FRONTIER_TIE)
        .map((p) => p.index),
    );
  }

  /** Search the reachable component first, then refine its closest frontier. Every candidate
   * has a swept connection to a reached anchor; no world-nearest or through-gate projection.
   * Local refinement is bounded (1.5 units, 12 bisections, then ten eight-way passes). */
  private *closestReachable(
    from: Point,
    requested: Point,
    search: Search,
    bodies?: BodyInput,
    local = false,
  ) {
    if (import.meta.env?.DEV) cpuTrace?.phase('frontierSort');
    let best = { point: { x: from.x, z: from.z }, anchor: from };
    let score = distance(from, requested);
    let travel = 0;
    // Bisection/refinement precision must not choose the opposite face on roundoff.
    // Within 0.001 units of the best target distance, prefer shorter routed travel.
    const tie = FRONTIER_TIE;
    const cost = (anchor: Point) =>
      anchor === from ? 0 : search.costs[this.grid.get(anchor)!.index];
    // Every reached cell is itself a feasible candidate, and refinements stay within
    // 1.5 units of their anchor. Only this band can beat the closest cell (or origin).
    let cutoff = score;
    let count = 0;
    for (const p of search.queue) {
      if (this.proof && ++count % 128 === 0) yield;
      cutoff = Math.min(cutoff, distance(p, requested));
    }
    const anchors: Point[] = [];
    for (const p of [from, ...search.queue]) {
      if (this.proof && ++count % 128 === 0) yield;
      if (distance(p, requested) - FRONTIER_REACH <= cutoff + tie) anchors.push(p);
    }
    anchors.sort(
      (a, b) =>
        distance(a, requested) - distance(b, requested) ||
        cost(a) - cost(b) ||
        a.x - b.x ||
        a.z - b.z,
    );
    // Every candidate and its connecting segment lie within reach of one of these
    // anchors. Filter once for the whole local refinement, retaining exact narrow tests.
    const region = local ? this.searchBounds(from, requested, anchors) : null;
    const blockers = region
      ? this.world.blockers.filter((b) => nearSegment(region, b, FRONTIER_REACH + CLEARANCE))
      : this.world.blockers;
    const doors = region
      ? this.doors.filter((d) =>
          nearSegment(region, { x: d.x, z: d.z, w: 2.95, d: 2.95 }, FRONTIER_REACH + CLEARANCE),
        )
      : this.doors;
    const relevant =
      region && typeof bodies !== 'function'
        ? bodies?.filter((b) =>
            nearSegment(
              region,
              { x: b.x, z: b.z, w: b.radius * 2, d: b.radius * 2 },
              FRONTIER_REACH + (this.occupancy?.size.radius ?? 0),
            ),
          )
        : bodies;
    const advances = (point: Point) => {
      const gain = distance(from, requested) - distance(point, requested);
      return (
        distance(from, point) >= 0.025 &&
        (tileAt(this.world, requested.x, requested.z) ? gain >= 0.025 : gain > 1e-9)
      );
    };
    const minimumProgress: { anchor: Point; point: Point }[] = [];
    const rememberMinimumProgress = (anchor: Point, start: Point, end: Point) => {
      if (advances(start) || !advances(end)) return;
      // This ray can cross the progress threshold between ordinary samples. Test
      // its minimum advancing point only if ordinary selection finds no endpoint.
      let low = 0,
        high = 1;
      const at = (t: number) => ({
        x: start.x + (end.x - start.x) * t,
        z: start.z + (end.z - start.z) * t,
      });
      for (let i = 0; i < 24; i++) {
        const t = (low + high) / 2;
        if (advances(at(t))) high = t;
        else low = t;
      }
      const point = at(high);
      if (distance(anchor, point) <= FRONTIER_REACH) minimumProgress.push({ anchor, point });
    };
    const connected = (anchor: Point, point: Point) => {
      if (!this.staticClear(point, blockers)) return false;
      const rejected = () => {
        if (this.rejectedExits && advances(point))
          this.rejectedExits.push({ from: anchor, to: point, stand: true });
        return false;
      };
      if (!this.doorsClear(point, true, doors)) return rejected();
      const sweep = () => this.sweptClear(anchor, point, true, relevant, false, blockers, doors);
      const stand =
        this.occupancy && !relevant && !local
          ? this.occupancy.withView((view) => this.bodyClear(point, view))
          : this.bodyClear(point, relevant);
      return (stand && sweep()) || rejected();
    };
    const consider = (point: Point, anchor: Point, refining = false) => {
      if (import.meta.env?.DEV) cpuTrace?.count('route.candidates');
      const d = distance(point, requested);
      if (d <= score + tie && connected(anchor, point)) {
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
      if (this.proof) yield;
      if (distance(anchor, requested) - 1.5 > score + tie) continue;
      if (this.proof)
        this.proof.scope = (clear) =>
          !clear && distance(anchor, requested) - FRONTIER_REACH <= score + tie;
      consider(anchor, anchor);
      for (const start of [
        anchor,
        { x: anchor.x, z: requested.z },
        { x: requested.x, z: anchor.z },
      ]) {
        if (distance(start, anchor) > 1.5 || !connected(anchor, start)) continue;
        let low = 0,
          high = Math.min(1, 1.5 / Math.max(distance(start, requested), 0.001));
        rememberMinimumProgress(anchor, start, {
          x: start.x + (requested.x - start.x) * high,
          z: start.z + (requested.z - start.z) * high,
        });
        for (let i = 0; i < 12; i++) {
          if (this.proof && i % 4 === 0) yield;
          const t = (low + high) / 2;
          const point = {
            x: start.x + (requested.x - start.x) * t,
            z: start.z + (requested.z - start.z) * t,
          };
          if (distance(anchor, point) <= 1.5 && connected(anchor, point)) low = t;
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
      if (this.proof) yield;
      const origin = best.point;
      if (this.proof) this.proof.scope = (clear) => !clear;
      for (const dx of [-step, 0, step])
        for (const dz of [-step, 0, step]) {
          const point = { x: origin.x + dx, z: origin.z + dz };
          if (distance(point, best.anchor) <= 1.5) consider(point, best.anchor, true);
        }
    }
    if (this.proof) this.proof.scope = undefined;
    // Off-floor aims can be far enough that a useful lateral step barely changes
    // target distance. Keep the arrival dead zone on movement, not on that gain.
    if (advances(best.point)) return best;
    for (let i = 0; i < minimumProgress.length; i++) {
      if (this.proof && i && i % 8 === 0) yield;
      const { point, anchor } = minimumProgress[i];
      if (connected(anchor, point)) return { point, anchor };
    }
    return null;
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
      if (this.intent(position, floor.requested, { partial: true }))
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
    if (this.occupancy && !this.liveSegmentClear(position, ahead, true)) {
      const destination = floor?.requested ?? this.destination!;
      const openDoors = this.opensDoors;
      if (replan && this.intent(position, destination, { openDoors, partial: !!floor }))
        return this.steer(position, false);
      this.chart.send({ type: 'CANCEL' });
      return null;
    }
    let remaining = d;
    for (let i = this.next; i < this.route.length - 1; i++)
      remaining += distance(this.route[i], this.route[i + 1]);
    return {
      point,
      distance: d,
      remaining,
      final: this.next === this.route.length - 1,
      floor: !!floor,
    };
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
      floor.proof = undefined;
      floor.settledEnvironment = undefined;
      floor.environment = this.environment(this.occupancy?.bodies(), floor);
    }
  }
}
