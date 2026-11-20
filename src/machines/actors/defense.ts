import { setup } from 'xstate';
import { Statechart } from '../statechart.ts';
import type { Point } from '../../worldTypes.ts';

/** A cancelled physical hold must release before another press can raise the shield. */
export const defenseMachine = setup({
  types: {
    events: {} as
      | { type: 'PRESS'; eligible: boolean; repeat: boolean }
      | { type: 'RELEASE' | 'CANCEL' },
  },
}).createMachine({
  id: 'actorDefense',
  initial: 'lowered',
  on: { RELEASE: { target: '.lowered' } },
  states: {
    lowered: {
      on: {
        PRESS: [
          { guard: ({ event }) => event.eligible && !event.repeat, target: 'raised' },
          { guard: ({ event }) => !event.repeat, target: 'latched' },
        ],
      },
    },
    raised: { on: { CANCEL: { target: 'latched' } } },
    latched: {},
  },
});

/** Opt-in actor capability. Controllers supply presses; no timers or background actors. */
export class Defense {
  readonly chart = new Statechart(defenseMachine);
  get raised(): boolean {
    return this.chart.snapshot.matches('raised');
  }
  press(eligible: boolean, repeat = false): boolean {
    const wasRaised = this.raised;
    this.chart.send({ type: 'PRESS', eligible, repeat });
    return !wasRaised && this.raised;
  }
  release(): void {
    this.chart.send({ type: 'RELEASE' });
  }
  cancel(): void {
    this.chart.send({ type: 'CANCEL' });
  }
}

/** Inclusive +/-60 degrees around authoritative +Z-facing heading. Travel points INTO the hit. */
export function inGuardArc(heading: number, travel: Point): boolean {
  const length = Math.hypot(travel.x, travel.z);
  if (!Number.isFinite(heading) || !Number.isFinite(length) || length <= 1e-8) return false;
  const dot = -(Math.sin(heading) * travel.x + Math.cos(heading) * travel.z) / length;
  // Only absorb roundoff at the inclusive boundary, not a gameplay-sized arc extension.
  return dot >= 0.5 - 1e-12;
}
