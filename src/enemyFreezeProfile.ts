export const PROFILE_SEED = 'MOURNING-731';
export type EnemyProfileMode = 'control' | 'decisions' | 'poses';

export function launchProfile({
  variants,
  practice,
  seed,
  reloading,
}: {
  variants: readonly string[];
  practice: boolean;
  seed: string | null;
  reloading: boolean;
}): {
  mode?: EnemyProfileMode;
  seed: string | null;
} {
  const [mode] = variants;
  if (
    !practice &&
    variants.length === 1 &&
    (mode === 'control' || mode === 'decisions' || mode === 'poses')
  )
    return { mode, seed: PROFILE_SEED };
  return { seed: reloading ? null : seed?.trim().slice(0, 40) || null };
}

export interface FrameWork {
  ticks: number;
  squad: number;
  individual: number;
  poses: number;
  decisionsMs: number;
  rigMs: number;
}

const emptyWork = (): FrameWork => ({
  ticks: 0,
  squad: 0,
  individual: 0,
  poses: 0,
  decisionsMs: 0,
  rigMs: 0,
});
const noWork = Object.freeze(emptyWork());
type Slice = 'squad' | 'individual' | 'poses';

export interface WorkRecorder {
  clock(): number | undefined;
  finish(slice: Slice, start: number | undefined, count?: number): void;
}

/** Owned by one scene. Outside an active window no timing calls reach the clock. */
export class ProfileWork implements WorkRecorder {
  private tally?: FrameWork;
  private readonly now: () => number;

  constructor(now: () => number) {
    this.now = now;
  }
  begin(): Readonly<FrameWork> {
    const previous = this.tally ?? noWork;
    this.tally = emptyWork();
    return previous;
  }
  stop(): void {
    this.tally = undefined;
  }
  tick(): void {
    if (this.tally) this.tally.ticks++;
  }
  clock(): number | undefined {
    return this.tally ? this.now() : undefined;
  }
  finish(slice: Slice, start: number | undefined, count = 1): void {
    if (!this.tally || start === undefined) return;
    const elapsed = this.now() - start;
    this.tally[slice] += count;
    this.tally[slice === 'poses' ? 'rigMs' : 'decisionsMs'] += elapsed;
  }
}

export const WARMUP_MS = 3000;
export const SAMPLE_MS = 10000;
const MAX_FRAMES = 16384;

export interface ProfileResult {
  readonly duration: number;
  readonly frames: number;
  readonly fps: number;
  readonly median: number;
  readonly p95: number;
  readonly mean: Readonly<FrameWork>;
}

interface Interval {
  readonly duration: number;
  readonly previous?: Interval;
}

export type ProfileState =
  | { phase: 'waiting'; reason?: string }
  | { phase: 'warmup'; anchor: number; last: number; reason?: string }
  | {
      phase: 'sampling';
      anchor: number;
      last: number;
      count: number;
      sum: Readonly<FrameWork>;
      intervals?: Interval;
    }
  | { phase: 'complete'; result: ProfileResult }
  | { phase: 'disposed' };

export type ProfileEvent =
  | { type: 'frame'; now: number; work: Readonly<FrameWork>; fps: number }
  | { type: 'pause' }
  | { type: 'dispose' };

export function transitionProfile(state: ProfileState, event: ProfileEvent): ProfileState {
  if (state.phase === 'disposed') return state;
  if (event.type === 'dispose') return { phase: 'disposed' };
  if (state.phase === 'complete') return state;
  if (event.type === 'pause') return state.phase === 'waiting' ? state : { phase: 'waiting' };
  const { now, work, fps } = event;
  if (!Number.isFinite(now) || (state.phase !== 'waiting' && now <= state.last))
    return { phase: 'waiting', reason: 'Invalid frame clock; retrying.' };
  if (state.phase === 'waiting')
    return { phase: 'warmup', anchor: now, last: now, reason: state.reason };
  if (state.phase === 'warmup')
    return now - state.anchor < WARMUP_MS
      ? { ...state, last: now }
      : { phase: 'sampling', anchor: now, last: now, count: 0, sum: noWork };

  if (state.count === MAX_FRAMES) return { phase: 'waiting', reason: 'Too many frames; retrying.' };
  const count = state.count + 1;
  const intervals = { duration: now - state.last, previous: state.intervals };
  const sum: FrameWork = {
    ticks: state.sum.ticks + work.ticks,
    squad: state.sum.squad + work.squad,
    individual: state.sum.individual + work.individual,
    poses: state.sum.poses + work.poses,
    decisionsMs: state.sum.decisionsMs + work.decisionsMs,
    rigMs: state.sum.rigMs + work.rigMs,
  };
  const duration = now - state.anchor;
  if (duration < SAMPLE_MS) return { ...state, last: now, count, sum, intervals };
  const sorted: number[] = [];
  for (let interval: Interval | undefined = intervals; interval; interval = interval.previous)
    sorted.push(interval.duration);
  sorted.sort((a, b) => a - b);
  const mid = Math.floor(count / 2);
  return {
    phase: 'complete',
    result: {
      duration,
      frames: count,
      fps,
      median: count % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
      p95: sorted[Math.ceil(count * 0.95) - 1],
      mean: {
        ticks: sum.ticks / count,
        squad: sum.squad / count,
        individual: sum.individual / count,
        poses: sum.poses / count,
        decisionsMs: sum.decisionsMs / count,
        rigMs: sum.rigMs / count,
      },
    },
  };
}
