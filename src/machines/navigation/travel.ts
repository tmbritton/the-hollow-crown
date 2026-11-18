import { assign, setup } from 'xstate';
import type { Point } from '../../worldTypes.ts';

export const navigationMachine = setup({
  types: {
    context: {} as { route: Point[]; next: number; stuckTime: number; opensDoors: boolean },
    events: {} as
      | { type: 'PLAN'; route: Point[] }
      | { type: 'CONFIGURE'; opensDoors: boolean }
      | { type: 'PROBE'; clear: boolean; canOpen: boolean; next: number }
      | { type: 'PROGRESS'; moved: number; dt: number }
      | { type: 'CANCEL' | 'ARRIVE' },
  },
  actions: { clear: assign({ route: () => [], next: 0, stuckTime: 0 }) },
}).createMachine({
  id: 'navigation',
  initial: 'idle',
  context: { route: [], next: 0, stuckTime: 0, opensDoors: false },
  on: {
    CONFIGURE: { actions: assign({ opensDoors: ({ event }) => event.opensDoors }) },
    PLAN: {
      target: '.following',
      actions: assign({ route: ({ event }) => event.route, next: 0, stuckTime: 0 }),
    },
    CANCEL: { target: '.idle', actions: 'clear' },
    ARRIVE: { target: '.idle', actions: 'clear' },
    PROBE: [
      {
        guard: ({ event }) => event.clear,
        target: '.following',
        actions: assign({
          next: ({ context, event }) => Math.max(0, Math.min(context.route.length, event.next)),
        }),
      },
      {
        guard: ({ context, event }) => context.opensDoors && event.canOpen,
        target: '.waitingForDoor',
        actions: assign({
          next: ({ context, event }) => Math.max(0, Math.min(context.route.length, event.next)),
          stuckTime: 0,
        }),
      },
      { target: '.idle', actions: 'clear' },
    ],
    PROGRESS: {
      actions: assign({
        stuckTime: ({ context, event }) =>
          event.moved < 0.0001 ? context.stuckTime + Math.max(0, event.dt) : 0,
      }),
    },
  },
  states: {
    idle: { on: { PROGRESS: {}, PROBE: {} } },
    following: {
      always: {
        guard: ({ context }) => context.stuckTime > 0.4 || context.next >= context.route.length,
        target: 'idle',
        actions: 'clear',
      },
    },
    waitingForDoor: {
      on: { PROGRESS: {} },
      always: {
        guard: ({ context }) => !context.opensDoors || context.next >= context.route.length,
        target: 'idle',
        actions: 'clear',
      },
    },
  },
});
