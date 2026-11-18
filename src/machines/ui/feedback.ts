import { assign, setup } from 'xstate';

/** UI-only deadlines use an explicit presentation timestamp; no setTimeout handles. */
export const feedbackMachine = setup({
  types: {
    context: {} as { until: number },
    events: {} as
      | { type: 'SHOW'; now: number; duration: number }
      | { type: 'TICK'; now: number }
      | { type: 'HIDE' },
  },
}).createMachine({
  id: 'feedback',
  initial: 'hidden',
  context: { until: 0 },
  on: {
    SHOW: {
      target: '.visible',
      actions: assign({ until: ({ event }) => event.now + Math.max(0, event.duration) }),
    },
    HIDE: '.hidden',
  },
  states: {
    hidden: {},
    visible: {
      on: { TICK: { guard: ({ context, event }) => event.now >= context.until, target: 'hidden' } },
    },
  },
});
