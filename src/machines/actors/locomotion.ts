import { assign, setup } from 'xstate';

export const locomotionMachine = setup({
  types: {
    context: {} as { phaseTime: number },
    events: {} as { type: 'SAMPLE'; moving: boolean; wantsMovement: boolean; dt: number },
  },
  guards: {
    travelling: ({ event }) => event.moving && event.wantsMovement,
    stopping: ({ event }) => !event.moving || !event.wantsMovement,
    started: ({ context }) => context.phaseTime >= 0.18,
    settled: ({ context, event }) => context.phaseTime >= 0.24 && !event.moving,
  },
  actions: {
    reset: assign({ phaseTime: 0 }),
    advance: assign({
      phaseTime: ({ context, event }) => context.phaseTime + Math.max(0, event.dt),
    }),
  },
}).createMachine({
  id: 'locomotion',
  initial: 'idle',
  context: { phaseTime: 0 },
  states: {
    idle: {
      entry: 'reset',
      on: { SAMPLE: [{ guard: 'travelling', target: 'starting' }, { actions: 'advance' }] },
    },
    starting: {
      entry: 'reset',
      on: {
        SAMPLE: [
          { guard: 'stopping', target: 'stopping' },
          { guard: 'started', target: 'moving' },
          { actions: 'advance' },
        ],
      },
    },
    moving: {
      entry: 'reset',
      on: { SAMPLE: [{ guard: 'stopping', target: 'stopping' }, { actions: 'advance' }] },
    },
    stopping: {
      entry: 'reset',
      on: {
        SAMPLE: [
          { guard: 'travelling', target: 'starting' },
          { guard: 'settled', target: 'idle' },
          { actions: 'advance' },
        ],
      },
    },
  },
});
