import { setup } from 'xstate';

/** Essential equipment cannot silently repair itself or reopen a completed race. */
export const focusMachine = setup({
  types: { events: {} as { type: 'DISABLE' } },
}).createMachine({
  id: 'ritualFocus',
  initial: 'enabled',
  states: {
    enabled: { on: { DISABLE: 'disabled' } },
    disabled: {},
  },
});
