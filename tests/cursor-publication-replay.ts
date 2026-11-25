import { createOccupancy, offlineList, validateWindow } from './cursor-attribution-model.ts';
import type { Bounds, GroundRay, SweepDiff } from './cursor-attribution-model.ts';
import { refreshWorld, sameGeometry, xz } from './cursor-attribution-writers.ts';
import type { Observation, Write, WriterTrace } from './cursor-attribution-writers.ts';
import type { BatchClock } from './cursor-evidence.ts';
import {
  count,
  frameBlocks,
  nonnegative,
  phases,
  publicationCost,
  record,
  sweepGapMessage,
  validSite,
  workKinds as groups,
  writerKinds,
} from './cursor-writer-evidence.ts';
import type { Batch, WorkKind as Group, WriterReport } from './cursor-writer-evidence.ts';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const boundsOf = (o: Observation): Bounds | null =>
  o.world && !o.input.fallback ? xz(o.world) : null;
const occupants = (scene: readonly Observation[]) =>
  scene.map((o) => ({ id: o.id, bounds: boundsOf(o) }));
const near = (a: number[], b: number[]) =>
  a.length === b.length && a.every((x, i) => Number.isFinite(x) && Math.abs(x - b[i]) <= 1e-4);
const unchangedSweep: SweepDiff = { sweepGap: null, crossed: [], diff: 0 };

const numeric = (v: unknown, length?: number): v is number[] =>
  Array.isArray(v) &&
  (length === undefined || v.length === length) &&
  [...v].every(Number.isFinite);
const extrema = (v: Record<string, unknown>) => numeric(v.min, 3) && numeric(v.max, 3);

function observation(v: unknown, identities: number): v is Observation {
  if (!record(v) || !count(v.id) || v.id >= identities || !record(v.input)) return false;
  const p = v.input;
  return (
    (v.world === null || numeric(v.world, 6)) &&
    extrema(p) &&
    numeric(p.world, 16) &&
    Array.isArray(p.lineage) &&
    [...p.lineage].every(count) &&
    typeof p.eligible === 'boolean' &&
    typeof p.fallback === 'boolean' &&
    (p.aggregate === null || (record(p.aggregate) && extrema(p.aggregate))) &&
    (p.thin === null || (numeric(p.thin) && p.thin.length % 16 === 0))
  );
}

function traceProblem(trace: unknown) {
  if (
    !record(trace) ||
    typeof trace.runId !== 'string' ||
    !trace.runId ||
    (trace.kind !== 'shrine' && trace.kind !== 'floor' && trace.kind !== 'idle') ||
    (trace.provenance !== 'software' && trace.provenance !== 'matched') ||
    !Array.isArray(trace.gaps) ||
    ![...trace.gaps].every((g) => typeof g === 'string' && g.length) ||
    !Array.isArray(trace.identities) ||
    !Array.isArray(trace.frames)
  )
    return 'malformed writer trace';
  const meshes = new Set<number>();
  for (const [id, entry] of trace.identities.entries()) {
    if (
      !record(entry) ||
      entry.id !== id ||
      !count(entry.mesh) ||
      meshes.has(entry.mesh) ||
      typeof entry.name !== 'string'
    )
      return 'malformed writer identity';
    meshes.add(entry.mesh);
  }
  const n = trace.identities.length;
  const scene = (v: unknown) => {
    if (!Array.isArray(v)) return false;
    const ids = new Set<number>();
    for (const o of v as unknown[]) {
      if (!observation(o, n) || ids.has(o.id)) return false;
      ids.add(o.id);
    }
    return true;
  };
  if (!scene(trace.seed)) return 'malformed writer seed';
  for (const f of trace.frames as unknown[]) {
    if (
      !record(f) ||
      !count(f.frame) ||
      !count(f.from) ||
      !count(f.to) ||
      f.from > f.to ||
      !Array.isArray(f.writes) ||
      !Array.isArray(f.checks)
    )
      return 'malformed writer frame';
    for (const w of f.writes as unknown[]) {
      if (!record(w)) return 'malformed writer site';
      const { before, after } = w;
      if (
        !validSite(w) ||
        w.id >= n ||
        (before !== null && (!observation(before, n) || before.id !== w.id)) ||
        (after !== null && (!observation(after, n) || after.id !== w.id)) ||
        (after === null && (w.kind !== 'dispose' || before === null)) ||
        (w.kind === 'dispose' && after !== null)
      )
        return 'malformed writer operands';
    }
    for (const c of f.checks as unknown[]) {
      if (
        !record(c) ||
        !count(c.at) ||
        !count(c.tick) ||
        c.tick < f.from ||
        c.tick > f.to ||
        !phases.some((p) => p === c.phase) ||
        !scene(c.scene) ||
        (c.phase === 'pick'
          ? !record(c.ray) ||
            ![c.ray.x, c.ray.z, c.ray.dx, c.ray.dz].every(Number.isFinite) ||
            !nonnegative(c.ray.length)
          : c.ray !== null)
      )
        return 'malformed writer checkpoint or ray';
    }
  }
  return null;
}

function apply(index: ReturnType<typeof createOccupancy>, write: Write) {
  const { id, after, before } = write;
  const unchanged =
    !!before && !!after && !write.refreshThin && sameGeometry(before.input, after.input);
  const refreshed =
    after && !unchanged ? refreshWorld(after.input, write.refreshThin ?? false) : null;
  const bounds = after
    ? after.input.fallback
      ? null
      : refreshed
        ? xz(refreshed.world)
        : boundsOf(after)
    : undefined;
  const delta = unchanged
    ? {
        old: index.members(id),
        next: index.members(id),
        ...unchangedSweep,
        remove: 0,
        insert: 0,
        allocated: 0,
        cleaned: 0,
      }
    : index.publish(id, bounds);
  return {
    ...delta,
    bounds: bounds ?? null,
    refreshed,
    instances: refreshed?.instances.map((_, i) => i) ?? [],
    invalidated: Number(!unchanged),
    boundsChecks: Number(after !== null),
    boundsRefreshes: refreshed ? 1 + refreshed.instances.length : 0,
  };
}

export function reconcileWriters(trace: WriterTrace) {
  const malformed = traceProblem(trace);
  if (malformed) return { frames: [], gaps: [malformed], queries: [] };
  const gaps = new Set(trace.gaps);
  const index = createOccupancy(occupants(trace.seed));
  const last = new Map(trace.seed.map((o) => [o.id, o]));
  let seq = 0;
  let sweepIncomplete = false;
  type ReplayQuery = { index: ReturnType<typeof createOccupancy>; ray: GroundRay };
  const queries: (ReplayQuery | null)[] = [];
  const frames = trace.frames.map((frame) => {
    let wi = 0;
    const writes: (Omit<Write, 'before' | 'after'> & ReturnType<typeof apply>)[] = [];
    let query: ReturnType<typeof index.walk> | null = null;
    let replayQuery: ReplayQuery | null = null;
    let picked = false;
    let publicationIncomplete = false;
    let tick = frame.from;
    let phase = 0;
    function advance(site: { tick: number; phase: Write['phase'] }) {
      const p = phases.indexOf(site.phase);
      if (site.tick < tick || p < phase) gaps.add(`out-of-order sites at frame ${frame.frame}`);
      tick = site.tick;
      phase = p;
    }
    function next() {
      const w = frame.writes[wi++];
      const { before, after, ...site } = w;
      if (
        w.seq !== seq++ ||
        w.frame !== frame.frame ||
        w.tick < frame.from ||
        w.tick > frame.to ||
        !same(last.get(w.id) ?? null, before)
      )
        gaps.add(`writer sequence/operands mismatch at ${w.seq}`);
      advance(w);
      const delta = apply(index, w);
      if (delta.sweepGap !== null) {
        publicationIncomplete = sweepIncomplete = true;
        gaps.add(sweepGapMessage(w, delta.sweepGap));
      }
      if (delta.refreshed && (!after?.world || !near(delta.refreshed.world, after.world)))
        gaps.add(`world bounds mismatch for ${w.kind} mesh ${w.id}`);
      if (after) last.set(w.id, after);
      else last.delete(w.id);
      writes.push({ ...site, ...delta });
    }
    for (const check of frame.checks) {
      while (wi < frame.writes.length && frame.writes[wi].seq < check.at) next();
      if (seq !== check.at) gaps.add(`checkpoint sequence mismatch at frame ${frame.frame}`);
      advance(check);
      const expected = occupants(check.scene);
      if (
        expected.length !== index.occupants.size ||
        check.scene.some((o) => {
          const previous = last.get(o.id);
          return (
            !previous ||
            !sameGeometry(previous.input, o.input) ||
            !same(index.occupants.get(o.id), boundsOf(o))
          );
        })
      )
        gaps.add(`unreconciled ${check.phase} checkpoint at tick ${check.tick}`);
      if (check.ray) {
        if (picked || trace.kind === 'idle') {
          gaps.add(`unexpected pick at frame ${frame.frame}`);
          continue;
        }
        picked = true;
        // Preserve and reconcile writes after a gap without starting a potentially large walk.
        if (sweepIncomplete) continue;
        query = index.walk(check.ray);
        if (!same(query.ids, offlineList(expected, check.ray).ids))
          gaps.add(`populated/offline list mismatch at frame ${frame.frame}`);
        // Query batches use a copy of the synchronized index, excluding setup from query timing.
        replayQuery = { index: index.copy(), ray: check.ray };
      }
    }
    const fixed = frame.checks.filter((c) => c.phase === 'fixed').map((c) => c.tick);
    if (
      fixed.length !== frame.to - frame.from ||
      fixed.some((tick, i) => tick !== frame.from + i + 1)
    )
      gaps.add(`missing or out-of-order fixed tick checkpoint at frame ${frame.frame}`);
    if (
      wi < frame.writes.length ||
      frame.checks.at(-1)?.phase !== 'render' ||
      (trace.kind !== 'idle' && !picked)
    )
      gaps.add(`incomplete checkpoints at frame ${frame.frame}`);
    while (wi < frame.writes.length) next();
    queries.push(replayQuery);
    return {
      frame: frame.frame,
      from: frame.from,
      to: frame.to,
      writes,
      query,
      demand: { publish: publicationIncomplete ? null : writes.length, query: Number(picked) },
    };
  });
  return { frames, gaps: [...gaps], queries };
}

type Arm = { units: number; ms: number | null };

export function writerFrameEvidence(frames: ReturnType<typeof reconcileWriters>['frames']) {
  return frames.map(({ writes, ...frame }) => ({
    ...frame,
    writes: writes.map(({ seq, frame, tick, phase, id, kind, slot, refreshThin, sweepGap }) => ({
      seq,
      frame,
      tick,
      phase,
      id,
      kind,
      slot,
      refreshThin,
      sweepGap,
    })),
  }));
}

export function measurePublications(
  traces: readonly WriterTrace[],
  clock: BatchClock | null,
  framesPerBatch = 240,
) {
  for (const trace of traces) {
    const problem = traceProblem(trace);
    if (problem) throw new Error(problem);
  }
  const first = traces[0];
  if (!first || !traces.every((t) => t.runId === first.runId && t.provenance === first.provenance))
    throw new Error('missing or mixed writer trace provenance');
  if (!Number.isSafeInteger(framesPerBatch) || framesPerBatch <= 0)
    throw new Error('invalid scratch batch size');
  const cases = traces.map((trace) => {
    const start = clock?.();
    const index = createOccupancy(occupants(trace.seed));
    const ms = start === undefined ? null : clock!() - start;
    const registration = {
      ms,
      serializedBucketBytes: new TextEncoder().encode(JSON.stringify(index.representation()))
        .byteLength,
      runtimeMemory: 'unmeasured' as const,
    };
    return { trace, registration, ...reconcileWriters(trace) };
  });
  let consumed = 0;
  const measured = cases.map((c) => {
    if (c.gaps.length) return { ...c, batches: [] };
    const schedule = c.trace.frames.map((frame, i) => ({
      frame,
      query: c.queries[i],
    }));
    const batches = frameBlocks(schedule, framesPerBatch).map((block, i) => {
      const repeats = Math.floor(framesPerBatch / block.length);
      const prefix = c.trace.frames.slice(0, i * framesPerBatch);
      function batch(group: Group, active: boolean): Arm {
        let units = 0,
          ms = 0;
        for (let repeat = 0; repeat < repeats; repeat++) {
          const index = group === 'publish' ? createOccupancy(occupants(c.trace.seed)) : null;
          if (index) for (const frame of prefix) for (const w of frame.writes) apply(index, w);
          const start = clock?.();
          for (const row of block) {
            if (index) {
              for (const write of row.frame.writes) {
                units++;
                consumed = (consumed + (active ? apply(index, write).insert : write.id) + 1) | 0;
              }
            } else if (row.query) {
              units++;
              consumed =
                (consumed +
                  (active ? row.query.index.walk(row.query.ray).entries.length : row.frame.frame) +
                  1) |
                0;
            }
          }
          // Empty slots leave the mix unchanged when the block does not divide 240.
          if (repeat === repeats - 1)
            for (let pad = repeats * block.length; pad < framesPerBatch; pad++)
              consumed = (consumed + 1) | 0;
          if (start !== undefined) ms += clock!() - start;
        }
        return { units, ms: clock ? ms : null };
      }
      for (const group of groups) for (const active of [true, false]) batch(group, active);
      return Array.from(
        { length: 3 },
        (_, sample) =>
          Object.fromEntries(
            groups.map((group) => {
              const [active, control] =
                sample % 2
                  ? [batch(group, false), batch(group, true)].reverse()
                  : [batch(group, true), batch(group, false)];
              return [group, { active, control }];
            }),
          ) as Batch,
      );
    });
    return { ...c, batches };
  });
  const result: WriterReport = {
    runId: first.runId,
    provenance: first.provenance,
    framesPerBatch,
    consumed,
    cases: measured.map(({ trace, registration, frames, gaps, batches }) => {
      const writers: Record<string, number> = Object.fromEntries(
        writerKinds.map((kind) => [kind, 0]),
      );
      for (const f of frames)
        for (const w of f.writes) writers[w.kind] = (writers[w.kind] ?? 0) + 1;
      return {
        runId: trace.runId,
        kind: trace.kind,
        gaps,
        writers,
        frames: writerFrameEvidence(frames),
        batches,
        registration,
        msPerFrame: publicationCost(
          frames.map((f) => f.demand),
          batches,
          framesPerBatch,
        ),
      };
    }),
  };
  return result;
}

export function windowGap(trace: WriterTrace, window: [number, number]) {
  return validateWindow(
    trace.frames.map((f) => ({ ...f, ticks: f.to - f.from, valid: true })),
    window,
  );
}
