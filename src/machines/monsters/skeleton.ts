import { setup } from 'xstate';
import type { MonsterEvent } from './types.ts';

export const skeletonMachine = setup({
  types: { events: {} as MonsterEvent },
  actions: { wander: () => {}, chase: () => {}, melee: () => {} },
}).createMachine({
  id: 'skeleton',
  initial: 'wander',
  on: {
    DIE: '.dead',
    ENGAGE: {
      guard: ({ event }) => event.melee && !event.swinging,
      target: '.attack',
      actions: 'melee',
    },
    THINK: [
      { guard: ({ event }) => event.hasTarget, target: '.chase', actions: 'chase' },
      { guard: ({ event }) => event.navigating },
      { target: '.wander', actions: 'wander' },
    ],
  },
  states: {
    wander: {},
    chase: {},
    attack: {},
    dead: { on: { THINK: {}, ENGAGE: {}, REVIVE: 'wander' } },
  },
});
