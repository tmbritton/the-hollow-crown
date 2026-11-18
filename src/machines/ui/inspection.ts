import { assign, setup } from 'xstate';
import type { CameraPose, InspectionSession } from '../../inspection.ts';

export const inspectionMachine = setup({
  types: {
    input: {} as { duration: number },
    context: {} as { session: InspectionSession | null; duration: number },
    events: {} as
      | { type: 'OPEN'; session: InspectionSession }
      | { type: 'CLOSE'; immediate: boolean; from: CameraPose }
      | { type: 'TICK'; dt: number },
  },
  guards: {
    finished: ({ context }) => !!context.session && context.session.elapsed >= context.duration,
  },
  actions: {
    clear: assign({ session: null }),
    advance: assign({
      session: ({ context, event }) =>
        context.session && event.type === 'TICK'
          ? { ...context.session, elapsed: context.session.elapsed + Math.max(0, event.dt) }
          : context.session,
    }),
    leave: assign({
      session: ({ context, event }) =>
        context.session && event.type === 'CLOSE'
          ? { ...context.session, elapsed: 0, from: event.from }
          : context.session,
    }),
  },
}).createMachine({
  id: 'inspection',
  initial: 'idle',
  context: ({ input }) => ({ session: null, duration: Math.max(0, input.duration) }),
  on: {
    CLOSE: [
      { guard: ({ event }) => event.immediate, target: '.idle', actions: 'clear' },
      { target: '.leaving', actions: 'leave' },
    ],
  },
  states: {
    idle: {
      on: {
        CLOSE: {},
        OPEN: { target: 'entering', actions: assign({ session: ({ event }) => event.session }) },
      },
    },
    entering: {
      on: { TICK: { actions: 'advance' } },
      always: { guard: 'finished', target: 'viewing' },
    },
    viewing: {},
    leaving: {
      on: {
        TICK: { actions: 'advance' },
        CLOSE: { guard: ({ event }) => event.immediate, target: 'idle', actions: 'clear' },
      },
      always: { guard: 'finished', target: 'idle', actions: 'clear' },
    },
  },
});
