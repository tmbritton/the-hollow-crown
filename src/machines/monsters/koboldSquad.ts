import { assign, setup } from 'xstate';
import type { Entity } from '../../ecs.ts';

type Tick = {
  type: 'TICK';
  dt: number;
  survivors: number;
  valid: boolean;
  cohesive: boolean;
  home: boolean;
};
type SquadEvent = Tick | { type: 'ALERT'; target: Entity };
interface Context {
  target: Entity | null;
  memory: number;
  elapsed: number;
  survivors: number;
}

/** One shared threat lifetime. Only direct sightings/hits send ALERT, never member relays. */
export const koboldSquadMachine = setup({
  types: { context: {} as Context, events: {} as SquadEvent },
  guards: {
    empty: ({ event }) => event.type === 'TICK' && event.survivors === 0,
    lost: ({ context, event }) =>
      event.type === 'TICK' && (!event.valid || event.dt >= context.memory),
    assembled: ({ context, event }) =>
      event.type === 'TICK' &&
      (context.elapsed + event.dt >= 1.2 || (event.cohesive && context.elapsed + event.dt >= 0.35)),
    casualty: ({ context, event }) => event.type === 'TICK' && event.survivors < context.survivors,
    home: ({ event }) => event.type === 'TICK' && event.home,
    newTarget: ({ context, event }) => event.type === 'ALERT' && context.target !== event.target,
  },
  actions: {
    alert: assign(({ event }) =>
      event.type === 'ALERT' ? { target: event.target, memory: 5 } : {},
    ),
    clear: assign({ target: null, memory: 0, elapsed: 0 }),
    assemble: assign({ elapsed: 0 }),
    tick: assign(({ context, event }) =>
      event.type === 'TICK'
        ? {
            memory: Math.max(0, context.memory - event.dt),
            elapsed: Math.min(1.2, context.elapsed + event.dt),
            survivors: event.survivors,
          }
        : {},
    ),
  },
}).createMachine({
  id: 'koboldSquad',
  initial: 'idle',
  context: { target: null, memory: 0, elapsed: 0, survivors: 4 },
  on: {
    ALERT: [
      { guard: 'newTarget', target: '.assembling', actions: ['alert', 'assemble'] },
      { actions: 'alert' },
    ],
  },
  states: {
    idle: {
      on: { TICK: [{ guard: 'empty', target: 'defeated', actions: 'clear' }, { actions: 'tick' }] },
    },
    assembling: {
      on: {
        TICK: [
          { guard: 'empty', target: 'defeated', actions: 'clear' },
          { guard: 'lost', target: 'returning', actions: 'clear' },
          { guard: 'assembled', target: 'engaging', actions: 'tick' },
          { actions: 'tick' },
        ],
      },
    },
    engaging: {
      on: {
        TICK: [
          { guard: 'empty', target: 'defeated', actions: 'clear' },
          { guard: 'lost', target: 'returning', actions: 'clear' },
          { guard: 'casualty', target: 'assembling', actions: ['tick', 'assemble'] },
          { actions: 'tick' },
        ],
      },
    },
    returning: {
      on: {
        TICK: [
          { guard: 'empty', target: 'defeated', actions: 'clear' },
          { guard: 'home', target: 'idle', actions: 'tick' },
          { actions: 'tick' },
        ],
      },
    },
    defeated: { on: { ALERT: {}, TICK: {} } },
  },
});
