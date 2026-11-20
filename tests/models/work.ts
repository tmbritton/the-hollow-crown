import assert from 'node:assert/strict';
import type { EventFromLogic } from 'xstate';
import { workMachine } from '../../src/machines/actors/work.ts';
import { modelCase } from './coverage.ts';

/** Everyday coverage partitions elapsed time around guard boundaries. Extended coverage
 * retains the original graph with every integer/decimal 60 Hz tick and all path replays. */
export function workModel(everyTick = false) {
  return modelCase(workMachine, {
    inputs: [undefined],
    abstractContext: ({ context }) => [
      context.duration,
      everyTick
        ? Math.round(context.units)
        : context.units === 0
          ? 'empty'
          : context.units === context.duration * 60
            ? 'full'
            : context.units >= context.duration * 60 - 1
              ? 'last-tick'
              : 'partial',
      context.cycleId !== null,
    ],
    events: ({ context }): EventFromLogic<typeof workMachine>[] => [
      ...[0, -1, NaN, Infinity, Number.MAX_VALUE, 2, 3, 3.7].map((duration) => ({
        type: 'START' as const,
        id: 'cycle',
        duration,
      })),
      ...[
        0,
        -1,
        NaN,
        Infinity,
        Number.MAX_VALUE,
        ...(context.duration > 2 ? [1 / 60, 4] : [1, 2, 3]),
        ...(!everyTick && context.duration > 0 ? [context.duration - 1 / 60] : []),
      ].map((dt) => ({ type: 'TICK' as const, dt })),
      { type: 'INTERRUPT', reason: 'Hit' },
      { type: 'BLOCK', reason: 'No access' },
      { type: 'CANCEL' },
      { type: 'SETTLE' },
    ],
    invariant: (state, before, event) => {
      const c = state.context;
      assert.ok(Number.isFinite(c.units) && c.units >= 0 && c.units <= c.duration * 60);
      assert.equal(c.cycleId !== null, state.matches('working') || state.matches('ready'));
      if (state.matches('ready')) assert.equal(c.units, c.duration * 60);
      if (state.matches('working')) assert.ok(c.units < c.duration * 60);
      if (!state.matches('working')) assert.equal(c.compensation, 0);
      if (event?.type === 'TICK' && before && !before.matches('working'))
        assert.deepEqual(state.context, before.context);
      if (
        event?.type === 'TICK' &&
        event.dt === 1 / 60 &&
        before?.matches('working') &&
        before.context.duration > 2
      )
        assert.equal(
          state.matches('ready'),
          Math.round(before.context.units) + 1 >= Math.round(before.context.duration * 60),
        );
    },
  });
}
