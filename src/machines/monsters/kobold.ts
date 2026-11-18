import { setup } from 'xstate';
import type { MonsterEvent } from './types.ts';

export const koboldMachine = setup({
  types: { events: {} as MonsterEvent },
  actions: {
    returnHome: () => {},
    socialize: () => {},
    regroup: () => {},
    melee: () => {},
    flank: () => {},
  },
}).createMachine({
  id: 'kobold',
  initial: 'smoke',
  on: {
    DIE: '.dead',
    ENGAGE: {
      guard: ({ event }) => event.melee && !event.swinging,
      target: '.attack',
      actions: 'melee',
    },
    THINK: [
      {
        guard: ({ event }) => !event.hasTarget && !event.atHome,
        target: '.returning',
        actions: 'returnHome',
      },
      {
        guard: ({ event }) => !event.hasTarget && event.activity === 'cards',
        target: '.cards',
        actions: 'socialize',
      },
      {
        guard: ({ event }) => !event.hasTarget && event.activity === 'hackysack',
        target: '.hackysack',
        actions: 'socialize',
      },
      { guard: ({ event }) => !event.hasTarget, target: '.smoke', actions: 'socialize' },
      { guard: ({ event }) => event.regroup, target: '.regroup', actions: 'regroup' },
      { guard: ({ event }) => event.melee, target: '.attack', actions: 'melee' },
      { target: '.flank', actions: 'flank' },
    ],
  },
  states: {
    cards: {},
    hackysack: {},
    smoke: {},
    returning: {},
    regroup: {},
    flank: {},
    attack: {},
    dead: { on: { THINK: {}, ENGAGE: {}, REVIVE: 'returning' } },
  },
});
