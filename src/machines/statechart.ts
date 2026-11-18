import { initialTransition, transition } from 'xstate';
import type { AnyStateMachine, EventFromLogic, InputFrom, SnapshotFrom } from 'xstate';

/** Synchronous XState snapshots: the caller owns clocks and executes returned effects.
 * These machines use assign/guards and explicit events, never after/invoke/spawn.
 * There are no running actors, subscriptions, or timers to leak on regeneration. */
export class Statechart<T extends AnyStateMachine> {
  private readonly machine: T;
  private current: SnapshotFrom<T>;

  constructor(
    machine: T,
    ...input: undefined extends InputFrom<T> ? [input?: InputFrom<T>] : [input: InputFrom<T>]
  ) {
    this.machine = machine;
    const [snapshot, effects] = initialTransition(machine, ...input);
    if (effects.length) throw new Error('Initial statechart effects must be handled explicitly');
    this.current = snapshot;
  }
  get snapshot(): SnapshotFrom<T> {
    return this.current;
  }
  send(event: EventFromLogic<T>) {
    const [snapshot, effects] = transition(this.machine, this.current, event);
    this.current = snapshot;
    return effects;
  }
}
