export const seeds = ['MOURNING-731', 'trial-23', 'trial-27', 'ember-70', 'tribute-12'] as const;
export const pairCount = 16;
export const warmCycles = 2;
export const cycles = 100;
export const processDeadline = 180_000;
export const activeDeadline = 2 * 60 * 60_000;
export const schedulingCutoff = 7 * 24 * 60 * 60_000;
export const interval = 30 * 60_000;
export const windowLength = 10 * 60_000;
export const initialLead = 5 * 60_000;
export const orderSeed = 0xef040001;
export const hostLimits = {
  sampleMs: 5000,
  maxGapMs: 8000,
  minIdle: 0.8,
  maxLoad: 3,
  maxRunnable: 6,
  maxTemp: 75_000,
} as const;
export type Label = 'A' | 'B';
export type Hashes = Record<Label, string>;
export type Schedule = readonly { id: number; order: 'AB' | 'BA'; start: number; end: number }[];
export type Arm = { id: number; label: Label; hash: string; seeds: string[]; samples: number[][] };
type Rank = 'median' | 'p95';
type Ranks = Record<Rank, number>;
const ranks = { median: 50, p95: 95 } as const;

export function buildSchedule(created: number): Schedule {
  const orders = [...Array<'AB'>(8).fill('AB'), ...Array<'BA'>(8).fill('BA')];
  let state = orderSeed;
  for (let i = orders.length - 1; i > 0; i--) {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [orders[i], orders[j]] = [orders[j], orders[i]];
  }
  const schedule = orders.map((order, i) => {
    const start = created + initialLead + i * interval;
    return { id: i + 1, order, start, end: start + windowLength };
  });
  validateSchedule(schedule);
  requireValid(schedule.at(-1)!.end <= created + schedulingCutoff, 'seven-day cutoff exceeded');
  return schedule;
}

export function validateBlockStart(slot: Schedule[number], actual: number) {
  requireValid(
    Number.isSafeInteger(actual) &&
      actual >= slot.start &&
      actual - slot.start < hostLimits.maxGapMs,
    'Missed block start',
  );
}

export type HostSample = {
  at: number;
  cpu: number[];
  load: number[];
  runnable: number;
  temperature: number;
  competitors: string[];
};
export function validateHostSample(sample: HostSample) {
  requireValid(
    Number.isSafeInteger(sample.at) &&
      sample.cpu.length === 8 &&
      Array.from(sample.cpu).every((n) => Number.isSafeInteger(n) && n >= 0),
    'unavailable CPU telemetry',
  );
  requireValid(
    sample.load.length === 3 &&
      Array.from(sample.load).every(duration) &&
      sample.load[0] <= hostLimits.maxLoad &&
      Number.isSafeInteger(sample.runnable) &&
      sample.runnable >= 1 &&
      sample.runnable <= hostLimits.maxRunnable,
    'host load exceeds limit or unavailable',
  );
  requireValid(
    Number.isFinite(sample.temperature) &&
      sample.temperature > 0 &&
      sample.temperature < hostLimits.maxTemp,
    'host temperature exceeds limit or unavailable',
  );
  requireValid(
    Array.isArray(sample.competitors) && sample.competitors.length === 0,
    'observed competing browser, build or benchmark',
  );
}

export function validateHostInterval(a: HostSample, b: HostSample) {
  validateHostSample(a);
  validateHostSample(b);
  const elapsed = b.at - a.at;
  requireValid(
    elapsed > 0 && elapsed <= hostLimits.maxGapMs,
    'missing or non-monotonic host sample',
  );
  const ticks = b.cpu.map((n, i) => n - a.cpu[i]);
  const total = ticks.reduce((sum, n) => sum + n, 0);
  requireValid(
    ticks.every((n) => n >= 0) && total > 0 && ticks[3] / total >= hostLimits.minIdle,
    'insufficient interval CPU idle or drifting counters',
  );
}

export function validateArmTelemetry(
  samples: readonly HostSample[],
  windowStart: number,
  start: number,
  end: number,
) {
  requireValid(
    samples.length >= 4 &&
      samples[0].at >= windowStart &&
      samples[1].at <= start &&
      start - samples[1].at < 1000 &&
      samples[1].at - samples[0].at >= hostLimits.sampleMs - 50 &&
      samples.slice(2, -1).every(({ at }) => at > start && at < end) &&
      samples.at(-1)!.at >= end,
    'Missing before, during or after arm telemetry',
  );
  for (let i = 1; i < samples.length; i++) validateHostInterval(samples[i - 1], samples[i]);
}

function requireValid(ok: unknown, message: string): asserts ok {
  if (!ok) throw Error(message);
}

export function validateSchedule(schedule: Schedule) {
  requireValid(Array.isArray(schedule) && schedule.length === pairCount, 'expected 16 slots');
  requireValid(schedule.filter((slot) => slot.order === 'AB').length === 8, 'unbalanced order');
  schedule.forEach(({ id, order, start, end }, i) => {
    requireValid(id === i + 1 && (order === 'AB' || order === 'BA'), 'invalid slot identity');
    requireValid(
      Number.isSafeInteger(start) && Number.isSafeInteger(end) && end - start > 2 * processDeadline,
      'invalid slot duration',
    );
    requireValid(i === 0 || start > schedule[i - 1].end, 'slots must be separate');
  });
  requireValid(
    schedule[pairCount - 1].end - schedule[0].start <= schedulingCutoff,
    'seven-day cutoff exceeded',
  );
}

const isRecord = (input: unknown): input is Record<string, unknown> =>
  typeof input === 'object' && input !== null;
const duration = (input: unknown): input is number =>
  typeof input === 'number' && Number.isFinite(input) && input >= 0;
const isHash = (input: unknown): input is string =>
  typeof input === 'string' && /^[0-9a-f]{64}$/.test(input);

function validateArm(input: unknown): asserts input is Arm {
  requireValid(isRecord(input), 'missing arm');
  const { id, label, hash, seeds: names, samples } = input;
  requireValid(
    Number.isSafeInteger(id) && (label === 'A' || label === 'B') && isHash(hash),
    'invalid arm identity',
  );
  requireValid(
    Array.isArray(names) &&
      names.length === seeds.length &&
      seeds.every((name, i) => name === names[i]),
    'wrong seed order',
  );
  requireValid(Array.isArray(samples) && samples.length === cycles, 'incomplete cycles');
  for (const cycle of samples) {
    requireValid(
      Array.isArray(cycle) &&
        cycle.length === seeds.length &&
        seeds.every((_, i) => duration(cycle[i])),
      'invalid cycle',
    );
  }
}

export function parseArm(json: string): Arm {
  const arm: unknown = JSON.parse(json);
  validateArm(arm);
  return arm;
}

function checkArm(input: unknown, id: number, label: Label, hashes: Hashes): Arm {
  validateArm(input);
  requireValid(
    input.id === id && input.label === label && input.hash === hashes[label],
    `wrong arm ID, label, order or hash for ${id}/${label}`,
  );
  return input;
}

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
const midpoint = (a: number, b: number) => (a + b) / 2;

export function bounds(differences: number[]) {
  requireValid(
    differences.length === pairCount && Array.from(differences).every(Number.isFinite),
    'invalid differences',
  );
  const ordered = sorted(differences);
  return { lower: ordered[4], upper: ordered[11] };
}

export function margin(rank: Rank, B: number, original: number) {
  const [floor, fraction] = rank === 'median' ? [2, 0.1] : [5, 0.15];
  const addition = (ms: number) => Math.max(floor, fraction * ms);
  return Math.min(addition(B), addition(original));
}

function summarize(arm: Arm) {
  return seeds.map((_, i) => {
    const sample = sorted(arm.samples.map((cycle) => cycle[i]));
    return { median: sample[ranks.median - 1], p95: sample[ranks.p95 - 1] };
  });
}

export function analyze(schedule: Schedule, hashes: Hashes, originals: Ranks[], raw: unknown[]) {
  validateSchedule(schedule);
  requireValid(
    originals.length === seeds.length &&
      seeds.every((_, i) => duration(originals[i]?.median) && duration(originals[i]?.p95)),
    'invalid original midpoints',
  );
  requireValid(raw.length === pairCount, 'incomplete pairs');
  const pairs = schedule.map(({ id, order }, i) => {
    const pair = raw[i];
    requireValid(Array.isArray(pair) && pair.length === 2, 'missing pair or arm');
    const first = checkArm(pair[0], id, order === 'AB' ? 'A' : 'B', hashes);
    const second = checkArm(pair[1], id, order === 'AB' ? 'B' : 'A', hashes);
    const [A, B] = order === 'AB' ? [first, second] : [second, first];
    return { id, order, A: summarize(A), B: summarize(B) };
  });
  const endpoints = seeds.flatMap((seed, i) =>
    (['median', 'p95'] as const).map((rank) => {
      const reference = sorted(pairs.map(({ A }) => A[i][rank]));
      const B = midpoint(reference[7], reference[8]);
      const M = margin(rank, B, originals[i][rank]);
      const differences = pairs.map((pair) => pair.B[i][rank] - pair.A[i][rank]);
      const { lower, upper } = bounds(differences);
      return {
        seed,
        rank,
        B,
        M,
        ceiling: B + M,
        differences,
        lower,
        upper,
        resolved: lower >= -M && upper <= M,
      };
    }),
  );
  return { pairs, endpoints, resolved: endpoints.every((endpoint) => endpoint.resolved) };
}

type TimingPin = {
  seed: string;
  median: readonly [number, number];
  p95: readonly [number, number];
};
export function analyzeCandidate(
  schedule: Schedule,
  hashes: Hashes,
  pins: readonly TimingPin[],
  raw: unknown[],
) {
  requireValid(
    pins.length === seeds.length &&
      seeds.every(
        (seed, i) =>
          pins[i].seed === seed &&
          [pins[i].median, pins[i].p95].every(
            (row) => row.length === 2 && [...row].every(duration),
          ),
      ),
    'invalid frozen timing pins',
  );
  const { pairs } = analyze(
    schedule,
    hashes,
    pins.map(({ median, p95 }) => ({ median: median[0], p95: p95[0] })),
    raw,
  );
  const endpoints = pins.flatMap(({ seed, median, p95 }, i) =>
    (['median', 'p95'] as const).map((rank) => {
      const [midpointMs, addition] = rank === 'median' ? median : p95;
      const a = sorted(pairs.map(({ A }) => A[i][rank]));
      const control = midpoint(a[7], a[8]);
      const differences = pairs.map(({ A, B }) => B[i][rank] - A[i][rank]);
      const { lower, upper } = bounds(differences);
      const decision =
        control < midpointMs - addition || control > midpointMs + addition
          ? 'unmatched'
          : lower > addition
            ? 'regression'
            : upper <= addition
              ? 'pass'
              : 'inconclusive';
      return {
        seed,
        rank,
        midpointMs,
        addition,
        control,
        differences,
        min: Math.min(...differences),
        max: Math.max(...differences),
        lower,
        upper,
        decision,
      };
    }),
  );
  const decision =
    (['unmatched', 'regression', 'inconclusive'] as const).find((state) =>
      endpoints.some((row) => row.decision === state),
    ) ?? 'pass';
  return { pairs, endpoints, decision };
}

type Endpoint = { seed: string; rank: Rank; B: number; M: number; lower: number; upper: number };
export function decideCandidate(frozen: Endpoint[], concurrent: Endpoint[]) {
  const ordered = (rows: Endpoint[]) =>
    rows.length === 10 &&
    seeds.every(
      (seed, i) =>
        rows[2 * i]?.seed === seed &&
        rows[2 * i]?.rank === 'median' &&
        rows[2 * i + 1]?.seed === seed &&
        rows[2 * i + 1]?.rank === 'p95',
    );
  requireValid(ordered(frozen) && ordered(concurrent), 'invalid endpoint order');
  requireValid(
    frozen.every(
      ({ B, M, lower, upper }) =>
        duration(B) && duration(M) && lower >= -M && upper <= M && lower <= upper,
    ),
    'unqualified frozen reference',
  );
  requireValid(
    concurrent.every(
      ({ B, lower, upper }) =>
        duration(B) && Number.isFinite(lower) && Number.isFinite(upper) && lower <= upper,
    ),
    'invalid concurrent comparison',
  );
  if (concurrent.some((row, i) => Math.abs(row.B - frozen[i].B) > frozen[i].M)) return 'unmatched';
  if (concurrent.every((row, i) => row.upper <= frozen[i].M)) return 'pass';
  return concurrent.some((row, i) => row.lower > frozen[i].M) ? 'regression' : 'inconclusive';
}

type State = 'scheduled' | 'collecting' | 'complete' | 'analyzed' | 'stopped';
type Event = 'begin' | 'finish' | 'analyze' | 'fail';
const transitions: Record<State, Partial<Record<Event, State>>> = {
  scheduled: { begin: 'collecting', fail: 'stopped' },
  collecting: { finish: 'complete', fail: 'stopped' },
  complete: { analyze: 'analyzed', fail: 'stopped' },
  analyzed: {},
  stopped: {},
};
export function transition(state: State, event: Event): State {
  const next = transitions[state][event];
  requireValid(next, `invalid transition ${state}/${event}`);
  return next;
}

export interface CollectionPort {
  now(): number;
  elapsed?(): number;
  waitUntil(at: number): Promise<void>;
  prepare(): void;
  observe(id: number, boundary: 'start' | 'end'): void;
  launch(id: number, label: Label, timeout: number): unknown | Promise<unknown>;
  stop(reason: string): void;
}

export async function collect(schedule: Schedule, hashes: Hashes, port: CollectionPort) {
  let state = 'scheduled' as State;
  try {
    validateSchedule(schedule);
    port.prepare();
    state = transition(state, 'begin');
    const raw: Arm[][] = [];
    let active = 0;
    const elapsed = () => port.elapsed?.() ?? port.now();
    for (const { id, order, start, end } of schedule) {
      await port.waitUntil(start);
      const started = elapsed();
      const check = () => {
        requireValid(port.now() >= start && port.now() < end, 'missed slot');
        requireValid(active + elapsed() - started < activeDeadline, 'active deadline');
      };
      check();
      port.observe(id, 'start');
      const pair: Arm[] = [];
      const labels: Label[] = order === 'AB' ? ['A', 'B'] : ['B', 'A'];
      for (const label of labels) {
        check();
        const timeout = Math.floor(
          Math.min(
            processDeadline,
            end - port.now(),
            activeDeadline - active - (elapsed() - started),
          ),
        );
        requireValid(timeout > 0, 'measurement deadline');
        pair.push(checkArm(await port.launch(id, label, timeout), id, label, hashes));
        check();
      }
      port.observe(id, 'end');
      check();
      active += elapsed() - started;
      raw.push(pair);
    }
    transition(state, 'finish');
    return { state: 'complete' as const, raw };
  } catch (error) {
    transition(state, 'fail');
    const reason = error instanceof Error ? error.message : String(error);
    if (state === 'collecting') port.stop(reason);
    return { state: 'stopped' as const, reason };
  }
}
