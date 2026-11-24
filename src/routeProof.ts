import type { CollisionBody, Occupancy } from './occupancy.ts';
import type { DoorEntity, Point, Spawn } from './worldTypes.ts';
type Leg = { from: Point; to: Point };

type Probe = {
  a: Spawn;
  b?: Spawn;
  clear: boolean;
  needed?: (clear: boolean) => boolean;
  travel?: Leg;
};
type Envelope = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  low: number;
  high: number;
};
type Chunk = Envelope & { probes: Probe[]; legs?: Set<Leg> };
const cell = (v: number) => Math.floor(v);
function span(x: number, z: number, X: number, Z: number, each: (key: string) => void) {
  for (let i = cell(x); i <= cell(X); i++)
    for (let j = cell(z); j <= cell(Z); j++) each(`${i},${j}`);
}
const shape = (b: CollisionBody) => `${b.x}/${b.z}/${b.h}/${b.radius}/${b.height}`;

function* changedBodies(previous: readonly CollisionBody[], current: readonly CollisionBody[]) {
  const before = new Map(previous.map((b) => [shape(b), b]));
  const after = new Map(current.map((b) => [shape(b), b]));
  for (const [first, other] of [
    [before, after],
    [after, before],
  ] as const)
    for (const [id, b] of first) if (!other.has(id)) yield b;
}

type BodyCheck = { a: Spawn; b?: Spawn };
export type Exit = { checks: BodyCheck[]; doors: readonly DoorEntity[]; from: Point; to: Point };
export type ExitSnapshot = {
  bodies: readonly CollisionBody[];
  gates: ReadonlyMap<DoorEntity, boolean>;
  masked: ReadonlySet<Exit>;
};

export function* exitClear(
  exit: Exit,
  occ: Occupancy | undefined,
  bodies: readonly CollisionBody[],
  blocks: (door: DoorEntity) => boolean,
): Generator<void, boolean> {
  if (exit.doors.some(blocks)) return false;
  if (occ)
    for (let i = 0; i < exit.checks.length; i++) {
      if (i && i % 64 === 0) yield;
      const { a, b } = exit.checks[i];
      if (!(b ? occ.segmentClear(a, b, bodies) : occ.canStand(a, bodies))) return false;
    }
  return true;
}

/** A witness opens only when its entire supported exit clears. Individual sweep
 * samples and door slabs are dependencies, never independent reasons to retry. */
export class FailureProof {
  private readonly root: Point;
  private readonly chunks = new Map<string, Set<Exit>>();
  private readonly gates = new Map<DoorEntity, Set<Exit>>();
  private readonly incoming = new Map<Point, Exit[]>();
  private readonly linkChunks = new Set<string>();
  private readonly linkGates = new Set<DoorEntity>();

  constructor(root: Point) {
    this.root = root;
  }

  *add(exit: Exit, link: boolean): Generator<void> {
    if (link) {
      const incoming = this.incoming.get(exit.to);
      if (incoming) incoming.push(exit);
      else this.incoming.set(exit.to, [exit]);
    }
    for (const door of exit.doors) {
      let exits = this.gates.get(door);
      if (!exits) this.gates.set(door, (exits = new Set()));
      if (link) this.linkGates.add(door);
      else exits.add(exit);
    }
    for (let i = 0; i < exit.checks.length; i++) {
      if (i && i % 64 === 0) yield;
      const { a, b = a } = exit.checks[i];
      span(
        Math.min(a.x, b.x),
        Math.min(a.z, b.z),
        Math.max(a.x, b.x),
        Math.max(a.z, b.z),
        (key) => {
          if (link) this.linkChunks.add(key);
          else {
            let exits = this.chunks.get(key);
            if (!exits) this.chunks.set(key, (exits = new Set()));
            exits.add(exit);
          }
        },
      );
    }
  }

  snapshot(
    bodies: readonly CollisionBody[] = [],
    blocks: (door: DoorEntity) => boolean,
  ): ExitSnapshot {
    return {
      bodies,
      gates: new Map([...this.gates.keys()].map((door) => [door, blocks(door)])),
      masked: new Set(),
    };
  }

  *recheck(
    occ: Occupancy | undefined,
    previous: ExitSnapshot,
    current: ExitSnapshot,
  ): Generator<void, ExitSnapshot | undefined> {
    const groups = new Set<ReadonlySet<Exit>>();
    let linksChanged = false;
    // Closing a gate alone cannot open an exit. Body changes use both the old
    // and new bounds; shape identity is only a broad-phase negative filter.
    for (const [door, blocked] of previous.gates) {
      if (!blocked || current.gates.get(door)) continue;
      groups.add(this.gates.get(door)!);
      linksChanged ||= this.linkGates.has(door);
    }
    if (occ)
      for (const b of changedBodies(previous.bodies, current.bodies)) {
        const r = b.radius + occ.size.radius;
        span(b.x - r, b.z - r, b.x + r, b.z + r, (key) => {
          const exits = this.chunks.get(key);
          if (exits) groups.add(exits);
          linksChanged ||= this.linkChunks.has(key);
        });
      }
    if (linksChanged) groups.add(previous.masked);
    const masked = new Set(previous.masked);
    const seen = new Set<Exit>();
    const reachable = new Set([this.root]);
    let count = 0;
    const clear = (exit: Exit) =>
      exitClear(exit, occ, current.bodies, (door) => !!current.gates.get(door));
    // Only a locally open exit needs a reachability query. Walk backwards on the
    // retained component, not the world: includes alternate approaches if a
    // previously clear path has since closed. Cache proven paths for this snapshot.
    const canReach = function* (this: FailureProof, anchor: Point): Generator<void, boolean> {
      const queue = [anchor];
      const towardExit = new Map<Point, Point>();
      const visited = new Set(queue);
      for (let i = 0; i < queue.length; i++) {
        if (++count % 64 === 0) yield;
        const node = queue[i];
        if (reachable.has(node)) {
          for (let p = towardExit.get(node); p; p = towardExit.get(p)) reachable.add(p);
          return true;
        }
        for (const link of this.incoming.get(node) ?? []) {
          if (++count % 16 === 0) yield;
          if (visited.has(link.from) || !(yield* clear(link))) continue;
          visited.add(link.from);
          towardExit.set(link.from, node);
          queue.push(link.from);
        }
      }
      return false;
    }.bind(this);
    for (const group of groups)
      for (const exit of group) {
        if (++count % 16 === 0) yield;
        if (seen.has(exit)) continue;
        seen.add(exit);
        if (!(yield* clear(exit))) masked.delete(exit);
        else if (yield* canReach(exit.from)) return undefined;
        else masked.add(exit);
      }
    return { ...current, masked };
  }
}

/** Keep the checks that justify the result, then replay only those that a changed
 * cylinder could affect. A failed search keeps its full proof. */
export class RouteProof {
  scope?: Probe['needed'];
  travel?: Leg;
  private probes: Probe[] = [];
  private readonly chunks = new Map<string, Chunk>();
  private readonly settledChunks = new Map<string, Envelope>();
  watch(a: Spawn, b: Spawn | undefined, clear: boolean) {
    this.probes.push({
      a,
      b,
      clear,
      needed: this.scope,
      travel: this.travel,
    });
    return clear;
  }
  *seal(success: boolean): Generator<void> {
    for (let i = 0; i < this.probes.length; i++) {
      if (i && i % 64 === 0) yield;
      const probe = this.probes[i];
      if (!success || !probe.needed || probe.needed(probe.clear)) {
        probe.needed = undefined;
        if (!probe.clear) probe.travel = undefined;
        this.index(probe);
      }
    }
    this.probes = [];
  }
  private nearby(
    body: CollisionBody,
    occ: Occupancy,
    each: (key: string) => void,
    settled = false,
  ) {
    const r = body.radius + occ.size.radius;
    const chunks = settled ? this.settledChunks : this.chunks;
    span(body.x - r, body.z - r, body.x + r, body.z + r, (key) => {
      const g = chunks.get(key);
      if (!g || body.h >= g.high + occ.size.height || body.h + body.height <= g.low) return;
      const dx = Math.max(g.minX - body.x, body.x - g.maxX, 0);
      const dz = Math.max(g.minZ - body.z, body.z - g.maxZ, 0);
      if (dx * dx + dz * dz > r * r) return;
      // A swept leg occupies a capsule, not its diagonal bounding box. Test
      // each distinct leg once, not every sampled sweep along it.
      if (settled || this.settledChunks.has(key)) return each(key);
      const legs = this.chunks.get(key)?.legs;
      if (!legs) return;
      for (const { from, to } of legs) {
        const x = to.x - from.x,
          z = to.z - from.z;
        const t = Math.max(
          0,
          Math.min(1, ((body.x - from.x) * x + (body.z - from.z) * z) / (x * x + z * z || 1)),
        );
        if (Math.hypot(body.x - from.x - x * t, body.z - from.z - z * t) <= r + 1e-7)
          return each(key);
      }
    });
  }
  /** Cheap conservative identity for an unchanged held command, not a clearance test. */
  fingerprint(occ: Occupancy, bodies: readonly CollisionBody[], settled = false) {
    const relevant: string[] = [];
    for (const body of bodies) {
      let near = false;
      this.nearby(body, occ, () => (near = true), settled);
      if (near) relevant.push(shape(body));
    }
    return relevant.sort();
  }
  private index(probe: Probe) {
    const { a, b } = probe;
    const end = b ?? a;
    const bounds = {
      minX: Math.min(a.x, end.x),
      maxX: Math.max(a.x, end.x),
      minZ: Math.min(a.z, end.z),
      maxZ: Math.max(a.z, end.z),
      low: Math.min(a.h, end.h),
      high: Math.max(a.h, end.h),
    };
    const extend = (g: Envelope) => {
      g.minX = Math.min(g.minX, bounds.minX);
      g.maxX = Math.max(g.maxX, bounds.maxX);
      g.minZ = Math.min(g.minZ, bounds.minZ);
      g.maxZ = Math.max(g.maxZ, bounds.maxZ);
      g.low = Math.min(g.low, bounds.low);
      g.high = Math.max(g.high, bounds.high);
    };
    span(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ, (key) => {
      const group = this.chunks.get(key);
      if (group) {
        group.probes.push(probe);
        extend(group);
      } else this.chunks.set(key, { ...bounds, probes: [probe] });
      if (probe.travel) {
        const chunk = this.chunks.get(key)!;
        (chunk.legs ??= new Set()).add(probe.travel);
      } else {
        const settled = this.settledChunks.get(key);
        if (settled) extend(settled);
        else this.settledChunks.set(key, { ...bounds });
      }
    });
  }
  *validate(
    occ: Occupancy,
    previous: readonly CollisionBody[],
    current: readonly CollisionBody[],
  ): Generator<void, boolean> {
    const keys = new Set<string>();
    for (const b of changedBodies(previous, current)) this.nearby(b, occ, (k) => keys.add(k));
    const seen = new Set<Probe>();
    let count = 0;
    for (const key of keys)
      for (const p of this.chunks.get(key)?.probes ?? []) {
        if (seen.has(p)) continue;
        seen.add(p);
        if ((p.b ? occ.segmentClear(p.a, p.b, current) : occ.canStand(p.a, current)) !== p.clear)
          return false;
        if (++count % 64 === 0) yield;
      }
    return true;
  }
}
