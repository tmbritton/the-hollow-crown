import { cpuTiming, cpuTrace } from './cpuMetrics.ts';

/** One run-owned allowance shared by pointer events and all agents between fixed ticks.
 * A unit advances exactly one resumable planner slice; elapsed wall time is never an input. */
export interface RouteJob {
  cost(): number;
  advance(): boolean;
  retire(): void;
}
export class RouteBudget {
  readonly limit: number;
  used = 0;
  ticks = 0;
  private queue: RouteJob[] = [];
  private disposed = false;
  constructor(limit = 24) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid route budget');
    this.limit = limit;
  }
  get size() {
    return this.queue.length;
  }
  submit(job: RouteJob) {
    if (this.disposed || this.queue.length >= 32) {
      job.retire();
      return;
    }
    this.queue.push(job);
    this.pump();
  }
  remove(job: RouteJob) {
    this.queue = this.queue.filter((j) => j !== job);
  }
  tick() {
    if (this.disposed) return;
    this.used = 0;
    this.ticks++;
    this.pump();
  }
  dispose() {
    this.disposed = true;
    const queue = this.queue;
    this.queue = [];
    for (const job of queue) job.retire();
  }
  private pump() {
    while (this.queue.length && this.used < this.limit) {
      const job = this.queue[0],
        cost = Math.min(this.limit, job.cost());
      if (this.used + cost > this.limit) break;
      this.queue.shift();
      this.used += cost;
      const timing = import.meta.env?.DEV ? cpuTiming : null,
        started = timing?.clock() ?? 0;
      if (import.meta.env?.DEV) cpuTrace?.count('route.slices');
      try {
        if (!job.advance()) this.queue.push(job);
      } catch (e) {
        job.retire();
        throw e;
      } finally {
        timing?.finish('route.work', started);
      }
    }
  }
}
