import { assign, setup } from 'xstate';
import { Statechart } from '../statechart.ts';

export const healthMachine = setup({
  types: {
    input: {} as { max: number },
    context: {} as { current: number; max: number; invulnerable: number },
    events: {} as
      | { type: 'DAMAGE'; amount: number }
      | { type: 'SET_HP' | 'SET_MAX' | 'PROTECT'; value: number }
      | { type: 'TICK'; dt: number },
  },
}).createMachine({
  id: 'health',
  initial: 'checking',
  context: ({ input }) => ({ current: input.max, max: input.max, invulnerable: 0 }),
  on: {
    SET_HP: {
      target: '.checking',
      actions: assign({
        current: ({ context, event }) => Math.max(0, Math.min(context.max, event.value)),
      }),
    },
    SET_MAX: {
      target: '.checking',
      actions: assign({
        max: ({ event }) => Math.max(1, event.value),
        current: ({ context, event }) => Math.min(context.current, Math.max(1, event.value)),
      }),
    },
    PROTECT: {
      target: '.checking',
      actions: assign({ invulnerable: ({ event }) => Math.max(0, event.value) }),
    },
    TICK: {
      actions: assign({
        invulnerable: ({ context, event }) =>
          Math.max(0, context.invulnerable - Math.max(0, event.dt)),
      }),
    },
  },
  states: {
    checking: {
      always: [
        { guard: ({ context }) => context.current <= 0, target: 'dead' },
        { guard: ({ context }) => context.invulnerable > 0, target: 'protected' },
        { target: 'alive' },
      ],
    },
    alive: {
      on: {
        DAMAGE: {
          target: 'checking',
          actions: assign({
            current: ({ context, event }) =>
              Math.max(0, context.current - Math.max(0, event.amount)),
          }),
        },
      },
    },
    protected: { always: { guard: ({ context }) => context.invulnerable <= 0, target: 'alive' } },
    dead: {},
  },
});

export class Health {
  readonly chart: Statechart<typeof healthMachine>;
  constructor(max: number) {
    this.chart = new Statechart(healthMachine, { max });
  }
  get current() {
    return this.chart.snapshot.context.current;
  }
  set current(value: number) {
    this.chart.send({ type: 'SET_HP', value });
  }
  get max() {
    return this.chart.snapshot.context.max;
  }
  set max(value: number) {
    this.chart.send({ type: 'SET_MAX', value });
  }
  get invulnerable() {
    return this.chart.snapshot.context.invulnerable;
  }
  set invulnerable(value: number) {
    this.chart.send({ type: 'PROTECT', value });
  }
  damage(amount: number): boolean {
    if (!this.chart.snapshot.can({ type: 'DAMAGE', amount })) return false;
    this.chart.send({ type: 'DAMAGE', amount });
    return true;
  }
  advance(dt: number): void {
    if (this.invulnerable > 0) this.chart.send({ type: 'TICK', dt });
  }
}
