import { createOccupancy, offlineList, validateWindow } from './cursor-attribution-model.ts';
import type { Bounds, GroundRay, SweepDiff } from './cursor-attribution-model.ts';
import {
  detachedWorld,
  ownTransform,
  refreshWorld,
  sameGeometry,
  xz,
} from './cursor-attribution-writers.ts';
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
  o.world && !o.input.fallback
    ? xz(o.input.boundsDirty ? refreshWorld(o.input, false).world : o.world)
    : null;
const occupants = (scene: readonly Observation[]) =>
  scene.map((o) => ({ id: o.id, bounds: boundsOf(o) }));
const near = (a: number[], b: number[]) =>
  a.length === b.length && a.every((x, i) => Number.isFinite(x) && Math.abs(x - b[i]) <= 1e-4);
const unchangedSweep: SweepDiff = { sweepGap: null, crossed: [], diff: 0 };
const cachedSweep: SweepDiff = {
  sweepGap: 'unresolved authored sweep (cached transform)',
  crossed: null,
  diff: null,
};
const sourceSite = (kind: Write['kind']) =>
  kind === 'door' || kind === 'chest' || kind === 'pose' || kind === 'physics';

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
    (p.authored === undefined || numeric(p.authored)) &&
    (p.boundsDirty === undefined || typeof p.boundsDirty === 'boolean') &&
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
  const authoredChange =
    after && sourceSite(write.kind) && !same(before?.input.authored, after.input.authored);
  // Fallback occupants have no cell membership to sweep (including billboards).
  const detached = authoredChange && after && !after.input.fallback && detachedWorld(after.input);
  const unresolved =
    authoredChange &&
    after &&
    !after.input.fallback &&
    !detached &&
    (!after.world || same(before?.input.world, after.input.world));
  const unchanged =
    !!before &&
    !!after &&
    !write.refreshThin &&
    sameGeometry(before.input, after.input) &&
    same(before.world, after.world);
  const refreshed =
    after && !unchanged
      ? refreshWorld(
          detached ? { ...after.input, world: detached } : after.input,
          write.refreshThin ?? false,
        )
      : null;
  const bounds = after
    ? unchanged
      ? index.occupants.get(id)
      : after.input.fallback
        ? null
        : refreshed && (detached || after.input.boundsDirty)
          ? xz(refreshed.world)
          : boundsOf(after)
    : undefined;
  // A lazy cache check with no new matrix must not undo a source endpoint.
  const cachedCheck =
    !unchanged &&
    before &&
    after &&
    !detached &&
    !write.refreshThin &&
    same(before.input.world, after.input.world) &&
    same(boundsOf(before), bounds);
  const delta =
    unchanged || cachedCheck
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
    ...(unresolved ? cachedSweep : undefined),
    bounds: index.occupants.get(id) ?? null,
    refreshed,
    detached: !!detached,
    instances: refreshed?.instances.map((_, i) => i) ?? [],
    invalidated: Number(!unchanged),
    boundsChecks: Number(after !== null),
    boundsRefreshes: refreshed ? 1 + refreshed.instances.length : 0,
  };
}

// Native candidate parity uses only the independently observed publications, never
// the idealized endpoints used to charge the source's actual update work.
function applyNative(index: ReturnType<typeof createOccupancy>, { id, before, after }: Write) {
  if (!after) index.publish(id, undefined);
  else if (before !== after) {
    const bounds = boundsOf(after);
    if (!before || !same(index.occupants.get(id), bounds)) index.publish(id, bounds);
  }
}

function writerReplay(trace: Omit<WriterTrace, 'frames'>) {
  const summary = new Set(trace.gaps);
  const gaps = {
    add(reason: string) {
      if (summary.size < 64) summary.add(reason);
      else if (!summary.has(reason))
        summary.add('additional replay gaps; inspect ordered frame evidence');
    },
  };
  const index = createOccupancy(occupants(trace.seed));
  const native = createOccupancy(occupants(trace.seed));
  const last = new Map(trace.seed.map((o) => [o.id, o]));
  const authored = new Map(trace.seed.map((o) => [o.id, o.input.authored]));
  let seq = 0;
  let sweepIncomplete = false;
  type ReplayQuery = { index: ReturnType<typeof createOccupancy>; ray: GroundRay };
  const step = (frame: WriterTrace['frames'][number]) => {
    let wi = 0;
    const writes: (Omit<Write, 'before' | 'after'> & ReturnType<typeof apply>)[] = [];
    let query: ReturnType<typeof index.walk> | null = null;
    let replayQuery: ReplayQuery | null = null;
    let picked = false;
    let publicationIncomplete = false;
    let tick = frame.from;
    let phase = 0;
    let fixedThrough = frame.from - 1;
    const checkpointDifferences: {
      phase: Write['phase'];
      tick: number;
      at: number;
      meshes: { id: number; name: string; fields: string[] }[];
    }[] = [];
    function advance(site: { tick: number; phase: Write['phase'] }) {
      const p = phases.indexOf(site.phase);
      if (site.tick < tick || p < phase || (p > 0 && site.tick !== frame.to))
        gaps.add(`out-of-order sites at frame ${frame.frame}`);
      tick = site.tick;
      phase = p;
    }
    function next() {
      const w = frame.writes[wi++];
      const { before, after, ...site } = w;
      if (
        (w.phase === 'fixed' && w.tick <= fixedThrough) ||
        (trace.kind === 'idle' && w.phase === 'pick')
      )
        gaps.add(`write on wrong side of checkpoint at frame ${frame.frame}, sequence ${w.seq}`);
      if (
        w.seq !== seq++ ||
        w.frame !== frame.frame ||
        w.tick < frame.from ||
        w.tick > frame.to ||
        !same(last.get(w.id) ?? null, before)
      )
        gaps.add(`writer sequence/operands mismatch at ${w.seq}`);
      advance(w);
      if (!after) authored.delete(w.id);
      else if (sourceSite(w.kind) || w.kind === 'spawn') authored.set(w.id, after.input.authored);
      else {
        const known = authored.get(w.id);
        // Reparenting may change the ancestor operands, not the mesh's own locals.
        if (
          w.kind === 'reparent' &&
          before &&
          same(ownTransform(before.input), ownTransform(after.input))
        )
          authored.set(w.id, after.input.authored);
        else if (!same(known, after.input.authored)) {
          gaps.add(
            `missing source for mesh ${w.id} ${trace.identities[w.id].name}: authored (${w.phase}, tick ${w.tick})`,
          );
          publicationIncomplete = true;
        }
      }
      const delta = apply(index, w);
      applyNative(native, w);
      if (delta.sweepGap !== null) {
        publicationIncomplete = sweepIncomplete = true;
        gaps.add(sweepGapMessage(w, delta.sweepGap));
      }
      if (
        delta.refreshed &&
        !delta.detached &&
        after &&
        !after.input.boundsDirty &&
        (!after.world || !near(delta.refreshed.world, after.world))
      )
        gaps.add(`world bounds mismatch for ${w.kind} mesh ${w.id}`);
      if (after) last.set(w.id, after);
      else last.delete(w.id);
      writes.push({ ...site, ...delta });
    }
    for (const check of frame.checks) {
      while (wi < frame.writes.length && frame.writes[wi].seq < check.at) next();
      if (seq !== check.at) gaps.add(`checkpoint sequence mismatch at frame ${frame.frame}`);
      advance(check);
      if (check.phase === 'fixed') fixedThrough = check.tick;
      const expected = occupants(check.scene);
      const differences: (typeof checkpointDifferences)[number]['meshes'] = [];
      const seen = new Set<number>();
      const order = native.occupants.keys();
      for (const o of check.scene) {
        if (order.next().value !== o.id)
          gaps.add(`scene order mismatch at ${check.phase} checkpoint, frame ${frame.frame}`);
        seen.add(o.id);
        const previous = last.get(o.id);
        const fields = previous ? [] : ['missing publication'];
        if (previous && !sameGeometry(previous.input, o.input)) {
          for (const key of Object.keys(o.input) as (keyof Observation['input'])[])
            if (!same(previous.input[key], o.input[key])) fields.push(key);
        }
        if (previous && !same(previous.world, o.world)) fields.push('observed bounds');
        if (!same(authored.get(o.id), o.input.authored)) fields.push('missing source: authored');
        if (!same(native.occupants.get(o.id), boundsOf(o))) fields.push('occupancy bounds');
        if (fields.length)
          differences.push({ id: o.id, name: trace.identities[o.id].name, fields });
      }
      for (const id of native.occupants.keys())
        if (!seen.has(id))
          differences.push({
            id,
            name: trace.identities[id].name,
            fields: ['missing from checkpoint'],
          });
      if (differences.length) {
        checkpointDifferences.push({
          at: check.at,
          tick: check.tick,
          phase: check.phase,
          meshes: differences,
        });
        gaps.add(`unreconciled ${check.phase} checkpoint at tick ${check.tick}`);
      }
      if (check.ray) {
        if (picked || trace.kind === 'idle') {
          gaps.add(`unexpected pick at frame ${frame.frame}`);
          continue;
        }
        picked = true;
        // Preserve and reconcile writes after a gap without starting a potentially large walk.
        if (sweepIncomplete) continue;
        query = native.walk(check.ray);
        if (!same(query.ids, offlineList(expected, check.ray).ids))
          gaps.add(`populated/offline list mismatch at frame ${frame.frame}`);
        // Query batches use a copy of the synchronized index, excluding setup from query timing.
        replayQuery = { index: native.copy(), ray: check.ray };
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
      frame.checks.length !== frame.to - frame.from + 2 ||
      frame.checks.at(-2)?.phase !== (trace.kind === 'idle' ? 'presentation' : 'pick') ||
      frame.checks.at(-2)?.tick !== frame.to ||
      frame.checks.at(-1)?.phase !== 'render' ||
      frame.checks.at(-1)?.tick !== frame.to
    )
      gaps.add(`incomplete checkpoints at frame ${frame.frame}`);
    while (wi < frame.writes.length) next();
    return {
      replayQuery,
      evidence: {
        frame: frame.frame,
        from: frame.from,
        to: frame.to,
        writes,
        query,
        checkpointDifferences,
        demand: { publish: publicationIncomplete ? null : writes.length, query: Number(picked) },
      },
    };
  };
  return { step, gaps: () => [...summary] };
}

export function reconcileWriters(trace: WriterTrace) {
  const malformed = traceProblem(trace);
  if (malformed) return { frames: [], gaps: [malformed], queries: [] };
  const replay = writerReplay(trace);
  const result = trace.frames.map(replay.step);
  return {
    frames: result.map((r) => r.evidence),
    gaps: replay.gaps(),
    queries: result.map((r) => r.replayQuery),
  };
}

// Use only for offline, one-frame-at-a-time inspection. Scratch timing still
// needs its own bounded adapter; this does not admit a native visit.
export function streamWriterReplay(header: Omit<WriterTrace, 'frames'>) {
  const problem = traceProblem({ ...header, frames: [] });
  if (problem) throw new Error(problem);
  const replay = writerReplay(header);
  return {
    frame(frame: WriterTrace['frames'][number]) {
      const problem = traceProblem({ ...header, seed: [], frames: [frame] });
      if (problem) throw new Error(problem);
      return replay.step(frame).evidence;
    },
    gaps: replay.gaps,
  };
}

type Arm = { units: number; ms: number | null };

type Block = { start: number; length: number; repeats: number; pad: number };
export type ScratchArm = Block & { group: Group; active: boolean };

export async function scratchSchedule(
  frames: number,
  run: (arm: ScratchArm) => Promise<Arm & { consumed: number }>,
  size = 240,
) {
  if (!count(frames) || !frames || !count(size) || !size) throw new Error('invalid scratch window');
  const blocks: Block[] = [];
  const batches: Batch[][] = [];
  let consumed = 0;
  for (let start = 0; start < frames; start += size) {
    const length = Math.min(size, frames - start);
    const repeats = Math.floor(size / length);
    const block = { start, length, repeats, pad: size - repeats * length };
    blocks.push(block);
    const invoke = async (group: Group, active: boolean) => {
      const { consumed: value, ...result } = await run({ ...block, group, active });
      consumed = (consumed + value) | 0;
      return result;
    };
    for (const group of groups) for (const active of [true, false]) await invoke(group, active);
    const samples: Batch[] = [];
    for (let sample = 0; sample < 3; sample++) {
      const results = {} as Batch;
      for (const group of groups) {
        const first = await invoke(group, sample !== 1);
        const second = await invoke(group, sample === 1);
        results[group] =
          sample === 1 ? { active: second, control: first } : { active: first, control: second };
      }
      samples.push(results);
    }
    batches.push(samples);
  }
  return { blocks, batches, consumed };
}

export function scratchPass(
  header: Omit<WriterTrace, 'frames'>,
  arm: ScratchArm,
  clock: BatchClock | null,
  pad = arm.pad,
) {
  const index = createOccupancy(occupants(header.seed));
  const update = arm.group === 'query' ? applyNative : apply;
  let seen = 0,
    units = 0,
    ms = 0,
    consumed = 0;
  const end = arm.start + arm.length;
  const done = () => seen === end;
  function timed(run: () => void) {
    const start = clock?.();
    run();
    if (start !== undefined) ms += clock!() - start;
  }
  function padding() {
    if (done()) for (let i = 0; i < pad; i++) consumed = (consumed + 1) | 0;
  }
  return {
    done,
    frame(frame: WriterTrace['frames'][number]) {
      if (done()) throw new Error('scratch pass already complete');
      if (seen++ < arm.start) {
        for (const w of frame.writes) update(index, w);
        return;
      }
      if (arm.group === 'publish') {
        timed(() => {
          for (const write of frame.writes) {
            units++;
            consumed = (consumed + (arm.active ? apply(index, write).insert : write.id) + 1) | 0;
          }
          padding();
        });
      } else {
        const check = frame.checks.find((c) => c.phase === 'pick');
        const ray = check?.ray;
        let i = 0;
        if (check)
          while (i < frame.writes.length && frame.writes[i].seq < check.at)
            applyNative(index, frame.writes[i++]);
        timed(() => {
          if (ray) {
            units++;
            consumed =
              (consumed + (arm.active ? index.walk(ray).entries.length : frame.frame) + 1) | 0;
          }
          padding();
        });
        while (i < frame.writes.length) applyNative(index, frame.writes[i++]);
      }
    },
    result() {
      if (!done()) throw new Error('scratch pass incomplete');
      return { units, ms: clock ? ms : null, consumed };
    },
  };
}

export function scratchRegistration(header: Omit<WriterTrace, 'frames'>, clock: BatchClock | null) {
  const start = clock?.();
  const index = createOccupancy(occupants(header.seed));
  const ms = start === undefined ? null : clock!() - start;
  return {
    ms,
    serializedBucketBytes: new TextEncoder().encode(JSON.stringify(index.representation()))
      .byteLength,
    runtimeMemory: 'unmeasured' as const,
  };
}

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
