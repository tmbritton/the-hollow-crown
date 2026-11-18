import { setup } from 'xstate';
import type { MonsterEvent } from './types.ts';

export const goblinMachine = setup({
  types: { events: {} as MonsterEvent },
  actions: {
    returnHome: () => {},
    socialize: () => {},
    flee: () => {},
    rest: () => {},
    shoot: () => {},
    seekCover: () => {},
    peek: () => {},
  },
}).createMachine({
  id: 'goblin',
  initial: 'smoke',
  on: {
    DIE: '.dead',
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
      { guard: ({ event }) => event.threatened, target: '.flee', actions: 'flee' },
      { guard: ({ event }) => event.swinging, target: '.attack' },
      { guard: ({ event }) => event.hidden && !event.rested, target: '.hide', actions: 'rest' },
      { guard: ({ event }) => event.readyToShoot, target: '.attack', actions: 'shoot' },
      {
        guard: ({ event }) => !event.hidden && event.coolingDown,
        target: '.hide',
        actions: 'seekCover',
      },
      { target: '.peek', actions: 'peek' },
    ],
  },
  states: {
    cards: {},
    hackysack: {},
    smoke: {},
    returning: {},
    hide: {},
    flee: {},
    peek: {},
    attack: {},
    dead: { on: { THINK: {}, REVIVE: 'returning' } },
  },
});
