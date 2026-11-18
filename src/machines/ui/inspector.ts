import { assign, setup } from 'xstate';

/** A request generation rejects async imports from cancelled or disposed scenes. */
export const inspectorMachine = setup({
  types: {
    context: {} as { request: number },
    events: {} as { type: 'TOGGLE' | 'CLOSE' } | { type: 'RESOLVE' | 'REJECT'; request: number },
  },
  actions: { invalidate: assign({ request: ({ context }) => context.request + 1 }) },
}).createMachine({
  id: 'inspector',
  initial: 'closed',
  context: { request: 0 },
  on: { CLOSE: { target: '.closed', actions: 'invalidate' } },
  states: {
    closed: { on: { TOGGLE: { target: 'loading', actions: 'invalidate' } } },
    loading: {
      on: {
        TOGGLE: { target: 'closed', actions: 'invalidate' },
        RESOLVE: {
          guard: ({ context, event }) => context.request === event.request,
          target: 'open',
        },
        REJECT: {
          guard: ({ context, event }) => context.request === event.request,
          target: 'closed',
        },
      },
    },
    open: { on: { TOGGLE: { target: 'closed', actions: 'invalidate' } } },
  },
});
