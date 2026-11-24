import type { CollisionBody, Occupancy } from './occupancy.ts';
import type { Point, Spawn } from './worldTypes.ts';
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

/** Keep the checks that justify the result, then replay only those that a changed
 * cylinder could affect. A failed search keeps its full proof. */
export class RouteProof {
  scope?: Probe['needed'];
  travel?: Leg;
  private probes: Probe[] = [];
  private readonly chunks = new Map<string, Chunk>();
  private readonly settledChunks = new Map<string, Envelope>();
  watch(a: Spawn, b: Spawn | undefined, clear: boolean) {
    this.probes.push({ a, b, clear, needed: this.scope, travel: this.travel });
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
    const before = new Map(previous.map((b) => [shape(b), b])),
      after = new Map(current.map((b) => [shape(b), b]));
    const keys = new Set<string>();
    for (const [first, other] of [
      [before, after],
      [after, before],
    ] as const)
      for (const [id, b] of first) {
        if (other.has(id)) continue;
        this.nearby(b, occ, (k) => keys.add(k));
      }
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
