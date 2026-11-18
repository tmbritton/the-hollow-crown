import { assign, setup } from 'xstate';

/** Pursuit and door interaction are mutually exclusive commands. */
export const commandMachine = setup({
  types: {
    context: {} as { target: string | null },
    events: {} as
      | { type: 'TARGET'; target: string | null }
      | { type: 'DOOR'; target: string }
      | { type: 'CANCEL' | 'RELEASE_DOOR' | 'DIE' | 'RESET' },
  },
  actions: { clear: assign({ target: null }) },
}).createMachine({
  id: 'command',
  initial: 'idle',
  context: { target: null },
  on: {
    TARGET: [
      {
        guard: ({ event }) => event.target !== null,
        target: '.pursuing',
        actions: assign({ target: ({ event }) => event.target }),
      },
      { target: '.idle', actions: 'clear' },
    ],
    DOOR: { target: '.interacting', actions: assign({ target: ({ event }) => event.target }) },
    CANCEL: { target: '.idle', actions: 'clear' },
    DIE: { target: '.dead', actions: 'clear' },
    RESET: { target: '.idle', actions: 'clear' },
  },
  states: {
    idle: {},
    pursuing: {},
    interacting: { on: { RELEASE_DOOR: { target: 'idle', actions: 'clear' } } },
    dead: { on: { TARGET: {}, DOOR: {}, CANCEL: {} } },
  },
});
