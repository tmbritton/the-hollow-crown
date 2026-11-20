import { assign, setup } from 'xstate';
import type { Entity } from '../../ecs.ts';
import type { AttackKind } from '../../attackKinds.ts';

export const PHALANX = {
  speed: 1.1,
  retreatSpeed: 0.85,
  turnSpeed: 0.65,
  assemble: 6,
  advance: 1.25,
  opening: 0.6,
  recovery: 1.25,
  retry: 1,
  routeLimit: 12,
  reformProgress: 0.25,
  healthFraction: 0.35,
  spacing: 1.15,
  rear: 1.2,
  lane: 0.575,
} as const;
type Tick = {
  type: 'TICK';
  dt: number;
  survivors: number;
  valid: boolean;
  cohesive: boolean;
  home: boolean;
  losing?: boolean;
  blocked?: boolean;
  canReform?: boolean;
  attack?: AttackKind | null;
  attackDone?: boolean;
};
interface Context {
  target: Entity | null;
  memory: number;
  elapsed: number;
  survivors: number;
  attack: AttackKind | null;
}
/** Only direct perception/hits refresh memory. Every phase advances on caller-owned fixed ticks. */
export const koboldSquadMachine = setup({
  types: { context: {} as Context, events: {} as Tick | { type: 'ALERT'; target: Entity } },
  guards: {
    empty: ({ event }) => event.type === 'TICK' && event.survivors === 0,
    lost: ({ context, event }) =>
      event.type === 'TICK' && (!event.valid || event.dt >= context.memory),
    losing: ({ event }) => event.type === 'TICK' && !!event.losing,
    assembled: ({ event }) => event.type === 'TICK' && event.cohesive,
    timeout: ({ context, event }) =>
      event.type === 'TICK' && context.elapsed + event.dt >= PHALANX.assemble,
    blocked: ({ event }) => event.type === 'TICK' && !!event.blocked,
    reform: ({ context, event }) =>
      event.type === 'TICK' && !!event.canReform && context.elapsed + event.dt >= PHALANX.retry,
    ready: ({ context, event }) =>
      event.type === 'TICK' &&
      !!event.attack &&
      event.cohesive &&
      context.elapsed + event.dt >= PHALANX.advance,
    openingDone: ({ context, event }) =>
      event.type === 'TICK' && context.elapsed + event.dt >= PHALANX.opening,
    invalidAttack: ({ context, event }) =>
      event.type === 'TICK' && (!event.cohesive || event.attack !== context.attack),
    attackDone: ({ event }) => event.type === 'TICK' && !!event.attackDone,
    recovered: ({ context, event }) =>
      event.type === 'TICK' && context.elapsed + event.dt >= PHALANX.recovery,
    casualty: ({ context, event }) => event.type === 'TICK' && event.survivors < context.survivors,
    home: ({ event }) => event.type === 'TICK' && event.home,
    newTarget: ({ context, event }) => event.type === 'ALERT' && context.target !== event.target,
  },
  actions: {
    alert: assign(({ event }) =>
      event.type === 'ALERT' ? { target: event.target, memory: 5 } : {},
    ),
    clear: assign({ target: null, memory: 0, elapsed: 0, attack: null }),
    phase: assign({ elapsed: 0 }),
    prepare: assign(({ event }) => (event.type === 'TICK' ? { attack: event.attack ?? null } : {})),
    tick: assign(({ context, event }) =>
      event.type === 'TICK'
        ? {
            memory: Math.max(0, context.memory - event.dt),
            elapsed: Math.min(6, context.elapsed + event.dt),
            survivors: event.survivors,
          }
        : {},
    ),
  },
}).createMachine({
  id: 'koboldSquad',
  initial: 'idle',
  context: { target: null, memory: 0, elapsed: 0, survivors: 4, attack: null },
  on: {
    ALERT: [
      { guard: 'newTarget', target: '.assembling', actions: ['alert', 'phase'] },
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
          { guard: 'losing', target: 'retreating', actions: ['tick', 'phase'] },
          { guard: 'assembled', target: 'engaging', actions: ['tick', 'phase'] },
          { guard: 'timeout', target: 'holding', actions: ['tick', 'phase'] },
          { actions: 'tick' },
        ],
      },
    },
    engaging: {
      on: {
        TICK: [
          { guard: 'empty', target: 'defeated', actions: 'clear' },
          { guard: 'lost', target: 'returning', actions: 'clear' },
          { guard: 'losing', target: 'retreating', actions: ['tick', 'phase'] },
          { guard: 'casualty', target: 'assembling', actions: ['tick', 'phase'] },
          { guard: 'blocked', target: 'holding', actions: ['tick', 'phase'] },
          { guard: 'ready', target: 'opening', actions: ['tick', 'prepare', 'phase'] },
          { actions: 'tick' },
        ],
      },
    },
    holding: {
      on: {
        TICK: [
          { guard: 'empty', target: 'defeated', actions: 'clear' },
          { guard: 'lost', target: 'returning', actions: 'clear' },
          { guard: 'losing', target: 'retreating', actions: ['tick', 'phase'] },
          { guard: 'reform', target: 'assembling', actions: ['tick', 'phase'] },
          { actions: 'tick' },
        ],
      },
    },
    opening: {
      on: {
        TICK: [
          { guard: 'empty', target: 'defeated', actions: 'clear' },
          { guard: 'lost', target: 'returning', actions: 'clear' },
          { guard: 'losing', target: 'retreating', actions: ['tick', 'phase'] },
          { guard: 'invalidAttack', target: 'recovering', actions: ['tick', 'phase'] },
          { guard: 'openingDone', target: 'attacking', actions: ['tick', 'phase'] },
          { actions: 'tick' },
        ],
      },
    },
    attacking: {
      on: {
        TICK: [
          { guard: 'empty', target: 'defeated', actions: 'clear' },
          { guard: 'lost', target: 'returning', actions: 'clear' },
          { guard: 'losing', target: 'retreating', actions: ['tick', 'phase'] },
          { guard: 'attackDone', target: 'recovering', actions: ['tick', 'phase'] },
          { actions: 'tick' },
        ],
      },
    },
    recovering: {
      on: {
        TICK: [
          { guard: 'empty', target: 'defeated', actions: 'clear' },
          { guard: 'lost', target: 'returning', actions: 'clear' },
          { guard: 'losing', target: 'retreating', actions: ['tick', 'phase'] },
          { guard: 'recovered', target: 'assembling', actions: ['tick', 'phase'] },
          { actions: 'tick' },
        ],
      },
    },
    retreating: {
      on: {
        ALERT: { actions: 'alert' },
        TICK: [
          { guard: 'empty', target: 'defeated', actions: 'clear' },
          { guard: 'lost', target: 'returning', actions: 'clear' },
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
