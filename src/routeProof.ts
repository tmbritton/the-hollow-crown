import type { CollisionBody, Occupancy } from './occupancy.ts';
import type { Spawn } from './worldTypes.ts';

type Probe = { a: Spawn; b?: Spawn; clear: boolean };
const cell = (v: number) => Math.floor(v);
function span(x: number, z: number, X: number, Z: number, each: (key: string) => void) {
  for (let i = cell(x); i <= cell(X); i++)
    for (let j = cell(z); j <= cell(Z); j++) each(`${i},${j}`);
}
const shape = (b: CollisionBody) => `${b.x}/${b.z}/${b.h}/${b.radius}/${b.height}`;

/** Replay only occupancy decisions that a changed cylinder could affect, including
 * rejected graph edges and candidate endpoints. A distant actor doesn't invalidate a job. */
export class RouteProof {
  private readonly chunks = new Map<string, { low: number; high: number; probes: Probe[] }>();
  watch(a: Spawn, b: Spawn | undefined, clear: boolean) {
    const end = b ?? a,
      probe = { a, b, clear };
    span(
      Math.min(a.x, end.x),
      Math.min(a.z, end.z),
      Math.max(a.x, end.x),
      Math.max(a.z, end.z),
      (key) => {
        const group = this.chunks.get(key);
        if (group) {
          group.probes.push(probe);
          group.low = Math.min(group.low, a.h, end.h);
          group.high = Math.max(group.high, a.h, end.h);
        } else
          this.chunks.set(key, {
            low: Math.min(a.h, end.h),
            high: Math.max(a.h, end.h),
            probes: [probe],
          });
      },
    );
    return clear;
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
        const r = b.radius + occ.size.radius;
        span(b.x - r, b.z - r, b.x + r, b.z + r, (k) => {
          const g = this.chunks.get(k);
          if (g && b.h < g.high + occ.size.height && b.h + b.height > g.low) keys.add(k);
        });
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
