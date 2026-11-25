import { validateScaling } from './cursor-scaling-policy.ts';

export type HitSurface = { mesh: string; instance: number; distance: number };
export type Hit =
  | ({ kind: 'floor' } & (HitSurface | { mesh?: never; instance?: never; distance?: never }))
  | ({ kind: 'enemy' | 'object'; id: string } & HitSurface);

export type HitSampler = () => { hit: Hit };
export type BatchClock = () => number;
export type EvidenceSink = (artifact: string, data: unknown) => Promise<void>;

// Demand units: visited tiles, list entries, dedup/order entries, bounds checks,
// compared memberships, removed memberships, inserted memberships, invalidations.
export const workKinds = [
  'traverse',
  'assemble',
  'order',
  'bounds',
  'diff',
  'remove',
  'insert',
  'invalidate',
] as const;
export type WorkKind = (typeof workKinds)[number];
export type WorkRates = Partial<Record<WorkKind, number>>;
export type WriterCoverage =
  | { kind: 'upper-bounded' }
  | { kind: 'unmeasured'; gaps: readonly string[] };

export type Frame = {
  pick: number;
  // Exclusive offsets inside the inclusive pick budget; gaps receive no credit.
  pickScopes: { start: number; end: number; work: 'off-ray' | 'retained' }[];
  ticks: number;
  rig: number;
  eligibilityOutline: number;
  renderCpu: number;
  gpu: number | null;
  demand: WorkRates;
};
export type Visit = {
  kind: 'shrine' | 'floor' | 'idle';
  frames: Frame[];
  registration: { ms: number; bytes: number };
  replay: { exhaustive: number; local: number; parity: boolean } | null;
  // Independent coarse, matched replay of disjoint removed pass stages.
  exclusiveReplayMean?: number;
};
export type Evidence = {
  hardware: 'matched' | 'software' | 'other';
  scaling: unknown;
  matched: boolean;
  completeWindows: boolean;
  writerCoverage: WriterCoverage;
  shrine: Visit[];
  floor: Visit;
  idle: Visit;
  // Upper-bound inputs in ms/operation, normalized from the three matched batches.
  unitBatches: WorkRates[];
};

const total = (values: number[]) => values.reduce((a, b) => a + b, 0);
const mean = (values: number[]) => total(values) / values.length;
const sorted = (values: number[]) => [...values].sort((a, b) => a - b);
const median = (values: number[]) => sorted(values)[1];
const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
const nonnegative = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0;

class InvalidEvidence extends Error {}

function requiredRate(rates: WorkRates, kind: WorkKind, integer = false) {
  const n = rates[kind];
  if (!nonnegative(n) || (integer && !Number.isInteger(n))) {
    throw new InvalidEvidence(`missing or invalid ${kind} ${integer ? 'demand' : 'unit cost'}`);
  }
  return n;
}

function exclusiveOffRay(frame: Frame) {
  let end = 0;
  let offRay = 0;
  for (const scope of [...frame.pickScopes].sort((a, b) => a.start - b.start)) {
    if (
      !nonnegative(scope.start) ||
      !nonnegative(scope.end) ||
      scope.start < end ||
      scope.end <= scope.start ||
      scope.end > frame.pick
    ) {
      throw new InvalidEvidence('overlapping or out-of-budget pick scopes');
    }
    end = scope.end;
    if (scope.work === 'off-ray') offRay += scope.end - scope.start;
  }
  return offRay;
}

export function ledger(visit: Visit, unitBatches: WorkRates[]) {
  const { frames, registration, replay } = visit;
  if (
    unitBatches.length !== 3 ||
    !frames.length ||
    !nonnegative(registration.ms) ||
    !nonnegative(registration.bytes)
  ) {
    throw new InvalidEvidence('missing frame, scratch batch or registration evidence');
  }
  const rates = workKinds.map((kind) => {
    const measured = unitBatches.map((batch) => requiredRate(batch, kind));
    if (
      measured.some((rate) => rate === 0) &&
      frames.some((frame) => requiredRate(frame.demand, kind, true) > 0)
    )
      throw new InvalidEvidence(`missing positive scratch measurement for observed ${kind} demand`);
    return Math.max(...measured);
  });
  for (const frame of frames) {
    if (
      ![frame.pick, frame.rig, frame.eligibilityOutline, frame.renderCpu].every(nonnegative) ||
      !nonnegative(frame.ticks) ||
      !Number.isInteger(frame.ticks) ||
      (!frame.ticks && frame.rig !== 0) ||
      (frame.gpu !== null && !nonnegative(frame.gpu)) ||
      (visit.kind === 'idle' && frame.pick !== 0)
    ) {
      throw new InvalidEvidence('invalid native frame');
    }
  }
  const pick = frames.map((f) => f.pick);
  const P = mean(pick);
  const nativeScopeTime = mean(frames.map(exclusiveOffRay));
  if (
    visit.exclusiveReplayMean !== undefined &&
    (!nonnegative(visit.exclusiveReplayMean) ||
      visit.exclusiveReplayMean > P ||
      frames.some((f) => f.pickScopes.length))
  ) {
    throw new InvalidEvidence('invalid or double-counted exclusive replay budget');
  }
  const attributable = visit.exclusiveReplayMean ?? nativeScopeTime;
  const U = mean(
    frames.map((f) =>
      total(workKinds.map((kind, i) => rates[i] * requiredRate(f.demand, kind, true))),
    ),
  );
  let R = 0;
  let calibration = 0;
  if (visit.kind !== 'idle' || replay) {
    if (!replay?.parity || !nonnegative(replay.exhaustive) || !nonnegative(replay.local)) {
      throw new InvalidEvidence('missing matched replay or broken hit parity');
    }
    calibration = Math.abs(replay.exhaustive - P);
    if ((visit.kind !== 'idle' && P === 0) || calibration > P * 0.1) {
      throw new InvalidEvidence('exhaustive replay outside native calibration tolerance');
    }
    R = Math.max(0, Math.min(attributable, replay.exhaustive - replay.local));
  }
  const S = R - U;
  if (![P, R, U, S, P - S].every(Number.isFinite))
    throw new InvalidEvidence('non-finite ledger totals');
  const ticks = total(frames.map((f) => f.ticks));
  const rig = total(frames.map((f) => f.rig));
  const gpu = frames.flatMap((f) => (f.gpu === null ? [] : [f.gpu]));
  return {
    P,
    R,
    U,
    S,
    Q: P - S,
    p95: sorted(pick)[Math.ceil(pick.length * 0.95) - 1],
    calibration,
    ticksPerFrame: ticks / frames.length,
    rigPerTick: ticks ? rig / ticks : null,
    rigPerFrame: rig / frames.length,
    eligibilityOutline: mean(frames.map((f) => f.eligibilityOutline)),
    renderCpu: mean(frames.map((f) => f.renderCpu)),
    gpu: gpu.length === frames.length ? mean(gpu) : null,
    registration,
  };
}

type Row = ReturnType<typeof ledger>;
type Stopped = { kind: 'stopped'; reason: string };
type Measured = {
  kind: 'positive' | 'negative';
  shrine: Row[];
  floor: Row;
  idle: Row;
  median: Record<'P' | 'R' | 'U' | 'S' | 'Q' | 'calibration', number>;
  spread: Measured['median'];
  noise: number;
};

export function decide(data: Evidence): Measured | Stopped {
  if (
    data.hardware !== 'matched' ||
    !data.matched ||
    !data.completeWindows ||
    data.shrine.length !== 3 ||
    data.shrine.some((v) => v.kind !== 'shrine') ||
    data.floor.kind !== 'floor' ||
    data.idle.kind !== 'idle'
  ) {
    return {
      kind: 'stopped',
      reason: 'incomplete or unmatched hardware or capture evidence',
    };
  }
  const scalingError = validateScaling(data.scaling);
  if (scalingError) return { kind: 'stopped', reason: scalingError };
  if (data.writerCoverage?.kind !== 'upper-bounded')
    return {
      kind: 'stopped',
      reason: `writer costs not upper-bounded: ${data.writerCoverage?.gaps.join('; ') || 'missing coverage'}`,
    };
  try {
    const shrine = data.shrine.map((visit) => ledger(visit, data.unitBatches));
    const floor = ledger(data.floor, data.unitBatches);
    const idle = ledger(data.idle, data.unitBatches);
    const stats = (fn: (values: number[]) => number) => ({
      P: fn(shrine.map((r) => r.P)),
      R: fn(shrine.map((r) => r.R)),
      U: fn(shrine.map((r) => r.U)),
      S: fn(shrine.map((r) => r.S)),
      Q: fn(shrine.map((r) => r.Q)),
      calibration: fn(shrine.map((r) => r.calibration)),
    });
    const center = stats(median);
    const width = stats(spread);
    const noise = Math.max(width.P, width.Q) + Math.max(...shrine.map((r) => r.calibration));
    const pass = shrine.every((r) => r.S > 0) && center.Q <= 0.5 * center.P && center.S > noise;
    return {
      kind: pass ? 'positive' : 'negative',
      shrine,
      floor,
      idle,
      median: center,
      spread: width,
      noise,
    };
  } catch (error) {
    if (!(error instanceof InvalidEvidence)) throw error;
    return { kind: 'stopped', reason: error.message };
  }
}

export type RunState =
  | { kind: 'planned' }
  | { kind: 'collecting' }
  | { kind: 'pending'; reason: string }
  | Stopped
  | Measured;
export type RunEvent =
  | { type: 'unavailable' | 'invalid' | 'fault'; reason: string }
  | { type: 'preflightOK' }
  | { type: 'complete'; evidence: Evidence };

export function transition(
  state: RunState,
  event: RunEvent,
): { state: RunState; effects: ('report' | 'stop')[] } {
  const terminate = (state: RunState) => ({
    state,
    effects: ['report', 'stop'] as ('report' | 'stop')[],
  });
  if (state.kind === 'planned' || state.kind === 'collecting') {
    if (event.type === 'invalid' || event.type === 'fault')
      return terminate({ kind: 'stopped', reason: event.reason });
    if (state.kind === 'planned' && event.type === 'unavailable')
      return terminate({ kind: 'pending', reason: event.reason });
    if (state.kind === 'planned' && event.type === 'preflightOK')
      return { state: { kind: 'collecting' }, effects: [] };
    if (state.kind === 'collecting' && event.type === 'complete')
      return terminate(decide(event.evidence));
  }
  throw new Error(`invalid run event ${event.type} in ${state.kind}`);
}
