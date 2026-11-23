import { distribution } from '../src/cpuMetrics.ts';
import type { CpuSample } from '../src/cpuMetrics.ts';

export interface Observation {
  recipe: number;
  host: string;
  viewport: string;
  quality: string;
  workload: string;
  script: string;
  mode: string;
  lane: 'native' | 'controlled';
  hardware: boolean;
  start: { actors: string; step: number } | null;
  samples: readonly CpuSample[];
}

type Eligibility = { status: 'eligible' } | { status: 'pending' | 'invalid'; reason: string };

function hasTicks(run: Observation) {
  let step = run.start?.step;
  const max = run.lane === 'native' ? 5 : 4;
  return run.samples.every((s) => {
    const ticks = s.counts.ticks;
    if (
      step !== s.step ||
      ticks === undefined ||
      !Number.isInteger(ticks) ||
      ticks < 0 ||
      ticks > max
    )
      return false;
    step += ticks;
    return true;
  });
}

export function comparePair(a: Observation, b: Observation): Eligibility {
  for (const key of [
    'recipe',
    'host',
    'viewport',
    'quality',
    'workload',
    'script',
    'mode',
    'lane',
  ] as const)
    if (a[key] !== b[key]) return { status: 'invalid', reason: `mismatched ${key}` };
  if (!a.start || !b.start || !a.samples.length || !b.samples.length)
    return { status: 'pending', reason: 'missing start or samples' };
  if (a.start.actors !== b.start.actors || a.start.step !== b.start.step)
    return { status: 'invalid', reason: 'mismatched start' };
  if (a.samples.length !== b.samples.length || !hasTicks(a) || !hasTicks(b))
    return { status: 'invalid', reason: 'unequal or malformed window' };
  if (a.lane === 'native' && (summarizeRun(a).fps === null || summarizeRun(b).fps === null))
    return { status: 'pending', reason: 'missing verified hardware cadence' };
  if (a.lane === 'controlled') {
    if ([...a.samples, ...b.samples].some((s) => s.counts.requestedTicks === undefined))
      return { status: 'pending', reason: 'missing requested tick schedule' };
    if (
      a.samples.some((s, i) => {
        const other = b.samples[i]!;
        return (
          s.counts.ticks !== s.counts.requestedTicks ||
          other.counts.ticks !== other.counts.requestedTicks ||
          s.counts.ticks !== other.counts.ticks ||
          s.counts.requestedTicks !== other.counts.requestedTicks
        );
      })
    )
      return { status: 'invalid', reason: 'mismatched tick schedule' };
  }
  return { status: 'eligible' };
}

export function sumScopes(samples: readonly CpuSample[], tick: string, ...required: string[]) {
  const sums = [];
  for (const sample of samples) {
    const scopes = sample.counts.ticks === 0 ? required : [tick, ...required];
    const values = scopes.map((name) => sample.ms[name]);
    if (values.some((value) => value === undefined || !Number.isFinite(value) || value < 0))
      return null;
    sums.push(values.reduce((sum, value) => sum + value, 0));
  }
  return sums.length ? distribution(sums) : null;
}

export function uniqueVisits(ids: readonly (string | null)[]) {
  const visits = ids.filter((id) => id !== null);
  return new Set(visits).size === visits.length;
}

export function summarizeRun(run: Observation) {
  const counters: Record<string, number> = {};
  const histogram = [0, 0, 0, 0, 0, 0];
  for (const sample of run.samples) {
    for (const [name, value] of Object.entries(sample.counts))
      counters[name] = (counters[name] ?? 0) + value;
    const ticks = sample.counts.ticks;
    if (ticks !== undefined && histogram[ticks] !== undefined) histogram[ticks]++;
  }
  const intervals = run.samples.map((s) => s.ms['frame.interval']);
  const cadence =
    intervals.length && intervals.every((ms) => ms !== undefined && Number.isFinite(ms) && ms > 0)
      ? distribution(intervals)
      : null;
  return {
    counters,
    tickHistogram: hasTicks(run) && run.samples.length ? histogram : null,
    ticks: hasTicks(run) ? (counters.ticks ?? null) : null,
    cadence,
    fps: run.lane === 'native' && run.hardware && cadence ? 1000 / cadence.mean : null,
    overBudget: cadence ? intervals.filter((ms) => ms! > 16.7).length / intervals.length : null,
    clampProximity: cadence ? intervals.filter((ms) => ms! >= 80).length : null,
  };
}

export function repeatVerdict(a: readonly number[], b: readonly number[]) {
  if (a.length !== 3 || b.length !== 3 || [...a, ...b].some((v) => !Number.isFinite(v)))
    return 'pending';
  if (Math.max(...b) < Math.min(...a)) return 'improved';
  if (Math.min(...b) > Math.max(...a)) return 'regressed';
  return 'inconclusive';
}
