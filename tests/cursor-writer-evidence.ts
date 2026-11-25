import type { createOccupancy, SweepGap } from './cursor-attribution-model.ts';
import type { Write } from './cursor-attribution-writers.ts';

export const workKinds = ['publish', 'query'] as const;
export type WorkKind = (typeof workKinds)[number];
export type WorkRates = Partial<Record<WorkKind, number>>;
export type Demand = { publish: number | null; query: number };
export type Batch = Record<
  WorkKind,
  {
    active: { units: number; ms: number | null };
    control: { units: number; ms: number | null };
  }
>;

export const writerKinds = [
  'door',
  'chest',
  'pose',
  'physics',
  'world',
  'check',
  'reparent',
  'thin-edit',
  'thin-replace',
  'spawn',
  'dispose',
  'eligibility',
] as const;
export type WriterKind = (typeof writerKinds)[number];
export const phases = ['fixed', 'presentation', 'pick', 'render'] as const;
export type PublicationSite = Omit<Write, 'before' | 'after'>;
type PublicationEvidence = PublicationSite & { sweepGap: SweepGap | null };
export const sweepGapMessage = (site: PublicationSite, reason: string) =>
  `${site.kind} writer ${site.id} at frame ${site.frame} (write ${site.seq}): ${reason}`;
type Query = ReturnType<ReturnType<typeof createOccupancy>['walk']>;
export type WriterFrameEvidence = {
  frame: number;
  from: number;
  to: number;
  writes: PublicationEvidence[];
  query: Query | null;
  demand: Demand;
};
export type WriterDemand = Pick<WriterFrameEvidence, 'frame' | 'from' | 'to' | 'demand'>;
export type WriterCase<F extends WriterDemand = WriterFrameEvidence> = {
  runId: string;
  kind: 'shrine' | 'floor' | 'idle';
  gaps: string[];
  writers: Partial<Record<WriterKind, number>>;
  frames: F[];
  batches: Batch[][];
  registration: { ms: number | null; serializedBucketBytes: number; runtimeMemory: 'unmeasured' };
  msPerFrame: number | null;
};
export type WriterReport<F extends WriterDemand = WriterFrameEvidence> = {
  runId: string;
  provenance: 'matched' | 'software';
  framesPerBatch: number;
  consumed: number;
  cases: WriterCase<F>[];
};

// A demand summary is not by itself admission evidence. Only an in-process case
// verified from ordered raw records can supply compact inputs to the ledger.
const streamedCases = new WeakSet<WriterCase<WriterDemand>>();

export function writerCaseValidator(runId: string, kind: WriterCase['kind']) {
  let seq = 0;
  const frames: WriterDemand[] = [];
  const writers = Object.fromEntries(writerKinds.map((k) => [k, 0])) as Record<WriterKind, number>;
  function frame(row: unknown) {
    const previous = frames.at(-1);
    if (
      !record(row) ||
      !count(row.frame) ||
      !count(row.from) ||
      !count(row.to) ||
      row.from > row.to ||
      (previous && (row.frame !== previous.frame + 1 || row.from !== previous.to)) ||
      !record(row.demand) ||
      !Array.isArray(row.writes) ||
      (kind === 'idle' ? row.query !== null : !validQuery(row.query)) ||
      row.demand.query !== Number(row.query !== null)
    )
      throw new Error(`invalid ${kind} frame demand or query/write records`);
    let tick = row.from;
    let phase = 0;
    for (const w of row.writes as unknown[]) {
      if (
        !validSite(w) ||
        w.seq !== seq++ ||
        w.frame !== row.frame ||
        w.tick < tick ||
        w.tick > row.to ||
        phases.indexOf(w.phase) < phase
      )
        throw new Error(`invalid or out-of-order ${kind} write record`);
      if (!('sweepGap' in w)) throw new Error(`missing ${kind} write sweep evidence`);
      if (w.sweepGap !== null)
        throw new Error(
          typeof w.sweepGap === 'string' && w.sweepGap
            ? sweepGapMessage(w, w.sweepGap)
            : `missing or invalid ${kind} write sweep evidence`,
        );
      tick = w.tick;
      phase = phases.indexOf(w.phase);
      writers[w.kind]++;
    }
    if (row.demand.publish !== row.writes.length)
      throw new Error(`invalid ${kind} publication demand`);
    const demand = { publish: row.writes.length, query: Number(row.query !== null) };
    Object.freeze(demand);
    frames.push(Object.freeze({ frame: row.frame, from: row.from, to: row.to, demand }));
  }
  return {
    frame,
    finish(batches: Batch[][], registration: WriterCase['registration'], size: number) {
      const msPerFrame = publicationCost(
        frames.map((f) => f.demand),
        batches,
        size,
      );
      const result = { runId, kind, gaps: [], writers, frames, batches, registration, msPerFrame };
      Object.freeze(frames);
      Object.freeze(writers);
      Object.freeze(result.gaps);
      Object.freeze(result);
      streamedCases.add(result);
      return result satisfies WriterCase<WriterDemand>;
    },
    summary: () => frames.map((f) => f.demand),
    writers: () => ({ ...writers }),
  };
}

export const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
export const nonnegative = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0;
export const count = (n: unknown): n is number => nonnegative(n) && Number.isSafeInteger(n);

export function frameBlocks<T>(frames: readonly T[], size: number) {
  const blocks: T[][] = [];
  for (let i = 0; i < frames.length; i += size) blocks.push(frames.slice(i, i + size));
  return blocks;
}

export function publicationCost(frames: Demand[], batches: unknown, size: number) {
  if (!Array.isArray(frames) || !frames.length || !count(size) || !size || !Array.isArray(batches))
    return null;
  const complete = [...frames];
  if (
    !complete.every(
      (f): f is Record<WorkKind, number> => record(f) && workKinds.every((k) => count(f[k])),
    )
  )
    return null;
  const blocks = frameBlocks(complete, size);
  if (batches.length !== blocks.length) return null;
  let cost = 0;
  for (const [i, block] of blocks.entries()) {
    const samples: unknown = batches[i];
    if (!Array.isArray(samples) || samples.length !== 3) return null;
    const repeats = Math.floor(size / block.length);
    for (const group of workKinds) {
      const units = repeats * block.reduce((n, f) => n + f[group], 0);
      if (!count(units)) return null;
      let upper = 0;
      for (const sample of samples as unknown[]) {
        const pair = record(sample) ? sample[group] : null;
        if (!record(pair)) return null;
        const { active, control } = pair;
        if (
          !record(active) ||
          !record(control) ||
          active.units !== units ||
          control.units !== units ||
          !nonnegative(active.ms) ||
          !nonnegative(control.ms) ||
          (units > 0 && active.ms === 0)
        )
          return null;
        upper = Math.max(upper, active.ms);
      }
      // Full active cost of the exact observed mix; do not dilute it with another
      // block, a different case, or a partial repeat. Zero-work groups cost zero.
      if (units) cost += upper / repeats;
    }
  }
  return Number.isFinite(cost) ? cost / frames.length : null;
}

function validQuery(q: unknown) {
  if (!record(q)) return false;
  const { ids, entries, tiles, reads } = q;
  if (!Array.isArray(ids) || !Array.isArray(entries) || !Array.isArray(tiles) || !record(reads))
    return false;
  if (![...ids, ...entries].every(count) || !count(reads.empty)) return false;
  const seen = new Set<string>();
  for (const tile of tiles) {
    if (!Array.isArray(tile) || tile.length !== 2 || ![...tile].every(Number.isSafeInteger))
      return false;
    const key = tile.join(':');
    if (seen.has(key)) return false;
    seen.add(key);
  }
  const ordered = [...new Set<number>(entries)].sort((a, b) => a - b);
  return (
    reads.occupied === tiles.length &&
    reads.occupied <= entries.length &&
    reads.entries === entries.length &&
    reads.duplicates === entries.length - ordered.length &&
    ids.length === ordered.length &&
    ids.every((id, i) => id === ordered[i])
  );
}

export function validSite(w: unknown): w is PublicationSite {
  return (
    record(w) &&
    count(w.seq) &&
    count(w.frame) &&
    count(w.tick) &&
    count(w.id) &&
    phases.some((p) => p === w.phase) &&
    writerKinds.some((k) => k === w.kind) &&
    (w.slot === undefined || (w.kind === 'thin-edit' && count(w.slot))) &&
    (w.refreshThin === undefined ||
      ((w.kind === 'thin-edit' || w.kind === 'thin-replace') && typeof w.refreshThin === 'boolean'))
  );
}

export function validateWriterReport(runId: string | undefined, report: unknown) {
  if (
    typeof runId !== 'string' ||
    !runId ||
    !record(report) ||
    report.runId !== runId ||
    report.provenance !== 'matched' ||
    report.framesPerBatch !== 240 ||
    !Array.isArray(report.cases) ||
    report.cases.length !== 3 ||
    !Number.isSafeInteger(report.consumed)
  )
    return 'missing or unmatched writer report';
  for (const [i, kind] of (['shrine', 'floor', 'idle'] as const).entries()) {
    const c: unknown = report.cases[i];
    if (!record(c) || c.kind !== kind || c.runId !== runId)
      return `missing or stale ${kind} writer case`;
    if (!Array.isArray(c.gaps) || ![...c.gaps].every((g) => typeof g === 'string' && g.length))
      return `invalid ${kind} coverage gaps`;
    if (c.gaps.length) return c.gaps.join('; ');
    if (
      !Array.isArray(c.frames) ||
      !c.frames.length ||
      !record(c.registration) ||
      !nonnegative(c.registration.ms) ||
      !count(c.registration.serializedBucketBytes) ||
      c.registration.runtimeMemory !== 'unmeasured'
    )
      return `incomplete ${c.kind} writer case`;
    const streamed = streamedCases.has(c as WriterCase<WriterDemand>);
    const validator = writerCaseValidator(runId, kind);
    if (!streamed)
      try {
        for (const row of c.frames as unknown[]) validator.frame(row);
      } catch (error) {
        return (error as Error).message;
      }
    const declared = c.writers;
    if (
      !record(declared) ||
      Object.keys(declared).length !== writerKinds.length ||
      (!streamed && !writerKinds.every((k) => declared[k] === validator.writers()[k]))
    )
      return `missing or inconsistent ${kind} writer-kind counts`;
    const cost = publicationCost(
      streamed ? (c.frames as WriterDemand[]).map((f) => f.demand) : validator.summary(),
      c.batches,
      report.framesPerBatch,
    );
    if (cost === null || cost !== c.msPerFrame)
      return `missing or inconsistent ${kind} publish/query batch cost`;
  }
  return null;
}
