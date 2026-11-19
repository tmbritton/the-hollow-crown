import { assign, setup } from 'xstate';

export const cargoMachine = setup({
  types: {
    context: {} as { owner: string | null; revision: number },
    events: {} as
      | { type: 'CLAIM' | 'PICKUP' | 'DELIVER'; actor: string }
      | { type: 'DROP' | 'RECOVER' },
  },
  guards: {
    named: ({ event }) => 'actor' in event && !!event.actor.trim(),
    owns: ({ context, event }) => 'actor' in event && context.owner === event.actor,
  },
  actions: {
    claim: assign({ owner: ({ event }) => ('actor' in event ? event.actor : null) }),
    release: assign({ owner: null }),
    revise: assign({ revision: ({ context }) => context.revision + 1 }),
  },
}).createMachine({
  id: 'tributeCargo',
  initial: 'loose',
  context: { owner: null, revision: 0 },
  states: {
    loose: {
      on: {
        CLAIM: { guard: 'named', target: 'claimed', actions: ['claim', 'revise'] },
        RECOVER: { target: 'recovered', actions: 'revise' },
      },
    },
    claimed: {
      on: {
        PICKUP: { guard: 'owns', target: 'carried', actions: 'revise' },
        DROP: { target: 'loose', actions: ['release', 'revise'] },
        RECOVER: { target: 'recovered', actions: ['release', 'revise'] },
      },
    },
    carried: {
      on: {
        DELIVER: { guard: 'owns', target: 'delivered', actions: ['release', 'revise'] },
        DROP: { target: 'loose', actions: ['release', 'revise'] },
      },
    },
    delivered: {},
    recovered: {},
  },
});
