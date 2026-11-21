import type { ECS, Entity } from './ecs.ts';
import type { Point, Spawn } from './worldTypes.ts';

export interface AcceptedBlock {
  readonly type: 'BLOCK_ACCEPTED';
  readonly run: ECS;
  readonly target: Entity;
  readonly source: Entity | null;
  readonly sequence: number;
  readonly time: number;
  readonly kind: 'melee' | 'projectile';
  readonly magnitude: number;
  readonly travel: Readonly<Point>;
  readonly contact: Readonly<Spawn>;
  readonly estimatedContact: boolean;
}
export interface BlockBatch {
  readonly count: number;
  readonly power: number;
  readonly travel: Readonly<Point>;
  readonly time: number;
}
type BlockInput = Pick<
  AcceptedBlock,
  'source' | 'time' | 'kind' | 'magnitude' | 'travel' | 'contact' | 'estimatedContact'
>;
const QUANTUM = 1024;
const SUM_LIMIT = 64 * QUANTUM;
const MAX_AGE = 1 / 30;

/** One actor/run-owned pending batch, not an event backlog. Signed impulse contributions are
 * stored in separate nonnegative integer bins: saturation and combination are order-independent.
 * Only CombatSystem's accepted guard branch publishes; rendering consumes at most once. */
export class BlockFeedback {
  readonly run: ECS;
  readonly target: Entity;
  private readonly sums = new Uint32Array(5);
  private count = 0;
  private time = -Infinity;
  private sequence = 0;
  private event: AcceptedBlock | null = null;
  constructor(run: ECS, target: Entity) {
    this.run = run;
    this.target = target;
  }
  get pendingCount(): number {
    return this.count;
  }
  get last(): AcceptedBlock | null {
    return this.event;
  }
  private current(): boolean {
    return (
      this.run.get(this.target.id) === this.target && this.target.get('blockFeedback') === this
    );
  }
  private clearBatch(): void {
    this.sums.fill(0);
    this.count = 0;
    this.time = -Infinity;
  }
  reset(): void {
    this.clearBatch();
    this.event = null;
  }
  publish(run: ECS, input: BlockInput): boolean {
    const length = Math.hypot(input.travel.x, input.travel.z);
    if (
      run !== this.run ||
      !this.current() ||
      !Number.isFinite(input.time) ||
      !Number.isFinite(input.magnitude) ||
      input.magnitude <= 0 ||
      !Number.isFinite(length) ||
      length <= 1e-8 ||
      ![input.contact.x, input.contact.z, input.contact.h].every(Number.isFinite)
    )
      return false;
    if (input.time !== this.time) {
      this.clearBatch();
      this.time = input.time;
    }
    const x = input.travel.x / length,
      z = input.travel.z / length;
    this.event = Object.freeze({
      ...input,
      type: 'BLOCK_ACCEPTED',
      run: this.run,
      target: this.target,
      sequence: ++this.sequence,
      travel: Object.freeze({ x, z }),
      contact: Object.freeze({ ...input.contact }),
    });
    const magnitude = Math.round(Math.min(40, input.magnitude) * QUANTUM);
    const add = (index: number, value: number) => {
      this.sums[index] = Math.min(SUM_LIMIT, this.sums[index] + Math.round(value));
    };
    add(0, magnitude);
    add(x < 0 ? 2 : 1, Math.abs(x) * magnitude);
    add(z < 0 ? 4 : 3, Math.abs(z) * magnitude);
    this.count = Math.min(65535, this.count + 1);
    return true;
  }
  consume(now: number): BlockBatch | null {
    if (!this.count) return null;
    if (
      !this.current() ||
      (this.target.get('health')?.current ?? 0) <= 0 ||
      this.target.has('corpse') ||
      !Number.isFinite(now) ||
      now < this.time - 1e-9 ||
      now - this.time > MAX_AGE + 1e-9
    ) {
      this.clearBatch();
      return null;
    }
    const scale = Math.max(1, this.sums[0]);
    let x = (this.sums[1] - this.sums[2]) / scale,
      z = (this.sums[3] - this.sums[4]) / scale;
    const length = Math.max(1, Math.hypot(x, z));
    x /= length;
    z /= length;
    const batch = {
      count: this.count,
      power: Math.min(2, this.sums[0] / (24 * QUANTUM)),
      travel: { x, z },
      time: this.time,
    };
    this.clearBatch();
    return batch;
  }
}
