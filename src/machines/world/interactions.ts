import { assign, setup } from 'xstate';
import { Statechart } from '../statechart.ts';
import type { ChestEntity, DoorEntity } from '../../worldTypes.ts';

const OPEN_ANGLE = Math.PI * 0.49;
export const doorMachine = setup({
  types: {
    input: {} as { locked: boolean; open: boolean; angle: number },
    context: {} as {
      initialLocked: boolean;
      initialOpen: boolean;
      angle: number;
      occupied: boolean;
    },
    events: {} as
      | { type: 'OPEN' | 'CLOSE' | 'LOCK' | 'UNLOCK' }
      | { type: 'TICK'; dt: number; occupied: boolean },
  },
  actions: {
    occupancy: assign({
      occupied: ({ context, event }) => (event.type === 'TICK' ? event.occupied : context.occupied),
    }),
    openStep: assign({
      angle: ({ context, event }) =>
        event.type === 'TICK'
          ? context.angle +
            (OPEN_ANGLE - context.angle) * (1 - Math.exp(-7 * Math.max(0, event.dt)))
          : context.angle,
    }),
    closeStep: assign({
      angle: ({ context, event }) =>
        event.type === 'TICK'
          ? context.angle * Math.exp(-7 * Math.max(0, event.dt))
          : context.angle,
    }),
  },
}).createMachine({
  id: 'door',
  initial: 'initializing',
  context: ({ input }) => ({
    initialLocked: input.locked,
    initialOpen: input.open,
    angle: input.angle,
    occupied: false,
  }),
  on: {
    LOCK: '.locked',
    TICK: { actions: 'occupancy' },
    OPEN: '.opening',
    CLOSE: [
      { guard: ({ context }) => context.occupied && context.angle > 0.05 },
      { target: '.closing' },
    ],
  },
  states: {
    initializing: {
      always: [
        { guard: ({ context }) => context.initialLocked, target: 'locked' },
        { guard: ({ context }) => context.initialOpen, target: 'opening' },
        { target: 'closing' },
      ],
    },
    locked: {
      on: { OPEN: {}, CLOSE: {}, UNLOCK: 'closing', TICK: { actions: ['occupancy', 'closeStep'] } },
    },
    closed: {},
    opening: {
      on: { TICK: { actions: ['occupancy', 'openStep'] } },
      always: {
        guard: ({ context }) => context.angle >= OPEN_ANGLE - 0.005,
        target: 'open',
        actions: assign({ angle: OPEN_ANGLE }),
      },
    },
    open: { on: { OPEN: {} } },
    closing: {
      on: {
        TICK: [
          {
            guard: ({ context, event }) => event.occupied && context.angle > 0.05,
            target: 'opening',
            actions: 'occupancy',
          },
          { actions: ['occupancy', 'closeStep'] },
        ],
      },
      always: [
        { guard: ({ context }) => context.occupied && context.angle > 0.05, target: 'opening' },
        {
          guard: ({ context }) => context.angle <= 0.005,
          target: 'closed',
          actions: assign({ angle: 0 }),
        },
      ],
    },
  },
});

export const chestMachine = setup({
  types: {
    input: {} as { open: boolean; angle: number },
    context: {} as { initialOpen: boolean; angle: number },
    events: {} as { type: 'OPEN' } | { type: 'TICK'; dt: number },
  },
}).createMachine({
  id: 'chest',
  initial: 'initializing',
  context: ({ input }) => ({ initialOpen: input.open, angle: input.angle }),
  states: {
    initializing: {
      always: [
        { guard: ({ context }) => context.initialOpen, target: 'opening' },
        { target: 'closed' },
      ],
    },
    closed: { on: { OPEN: 'opening' } },
    opening: {
      on: {
        TICK: {
          actions: assign({
            angle: ({ context, event }) =>
              context.angle + (-1.5 - context.angle) * (1 - Math.exp(-5 * Math.max(0, event.dt))),
          }),
        },
      },
      always: {
        guard: ({ context }) => context.angle <= -1.495,
        target: 'open',
        actions: assign({ angle: -1.5 }),
      },
    },
    open: {},
  },
});

export const progressionMachine = setup({
  types: { events: {} as { type: 'KINDLE' | 'CLAIM' } },
}).createMachine({
  id: 'progression',
  initial: 'seekingAltar',
  states: {
    seekingAltar: { on: { KINDLE: 'seekingCrown' } },
    seekingCrown: { on: { CLAIM: 'complete' } },
    complete: {},
  },
});

const doors = new WeakMap<DoorEntity, Statechart<typeof doorMachine>>();
const chests = new WeakMap<ChestEntity, Statechart<typeof chestMachine>>();

/** Bind only runtime objects. Generated blueprints remain plain deterministic data.
 * Existing door/interaction views read the chart rather than maintaining mirror flags. */
export function bindDoor(door: DoorEntity): Statechart<typeof doorMachine> {
  const existing = doors.get(door);
  if (existing) return existing;
  const chart = new Statechart(doorMachine, {
    locked: door.locked,
    open: door.open,
    angle: door.angle ?? 0,
  });
  doors.set(door, chart);
  Object.defineProperties(door, {
    locked: {
      enumerable: true,
      configurable: true,
      get: () => chart.snapshot.matches('locked'),
      set: (value: boolean) => {
        chart.send({ type: value ? 'LOCK' : 'UNLOCK' });
      },
    },
    open: {
      enumerable: true,
      configurable: true,
      get: () => chart.snapshot.matches('opening') || chart.snapshot.matches('open'),
      set: (value: boolean) => {
        chart.send({ type: value ? 'OPEN' : 'CLOSE' });
      },
    },
    angle: { enumerable: true, configurable: true, get: () => chart.snapshot.context.angle },
  });
  return chart;
}

export function animateDoor(door: DoorEntity, occupied: boolean, dt: number): void {
  const chart = bindDoor(door);
  const angle = chart.snapshot.context.angle;
  const desired = door.open ? OPEN_ANGLE : 0;
  if (angle !== desired || occupied !== chart.snapshot.context.occupied)
    chart.send({
      type: 'TICK',
      dt,
      occupied,
    });
  if (door.pivot) door.pivot.rotation.y = chart.snapshot.context.angle;
  if (door.collider)
    door.collider.checkCollisions = !door.open || chart.snapshot.context.angle <= 1.2;
}

export function bindChest(chest: ChestEntity): Statechart<typeof chestMachine> {
  const existing = chests.get(chest);
  if (existing) return existing;
  const chart = new Statechart(chestMachine, { open: chest.open, angle: chest.angle ?? 0 });
  chests.set(chest, chart);
  Object.defineProperties(chest, {
    open: {
      enumerable: true,
      configurable: true,
      get: () => !chart.snapshot.matches('closed'),
      set: (value: boolean) => {
        if (value) chart.send({ type: 'OPEN' });
      },
    },
    angle: { enumerable: true, configurable: true, get: () => chart.snapshot.context.angle },
  });
  return chart;
}

export function animateChest(chest: ChestEntity, dt: number): void {
  const chart = bindChest(chest);
  if (chart.snapshot.matches('opening')) {
    chart.send({
      type: 'TICK',
      dt,
    });
  }
  if (chest.lid) chest.lid.rotation.x = chart.snapshot.context.angle;
}
