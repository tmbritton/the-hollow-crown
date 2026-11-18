import { assign, setup } from 'xstate';
import { Statechart } from '../statechart.ts';
import { commandMachine } from './command.ts';

export interface Swing {
  target: string;
  elapsed: number;
  duration: number;
  impact: number;
  resolved: boolean;
  ranged: boolean;
}
interface AttackContext {
  swing: Swing | null;
  cooldown: number;
  impacts: number;
}
export const attackMachine = setup({
  types: {
    context: {} as AttackContext,
    events: {} as
      | { type: 'START'; swing: Swing; cooldown: number }
      | { type: 'TICK'; dt: number }
      | { type: 'COOLDOWN'; dt: number }
      | { type: 'SET_COOLDOWN'; value: number }
      | { type: 'CANCEL' | 'INTERRUPT' | 'DIE' | 'RESET' },
  },
  actions: {
    clearSwing: assign({ swing: null }),
    cancel: assign({ swing: null }),
  },
}).createMachine({
  id: 'attack',
  initial: 'ready',
  context: { swing: null, cooldown: 0, impacts: 0 },
  on: {
    COOLDOWN: {
      actions: assign({
        cooldown: ({ context, event }) => Math.max(0, context.cooldown - Math.max(0, event.dt)),
      }),
    },
    SET_COOLDOWN: { actions: assign({ cooldown: ({ event }) => Math.max(0, event.value) }) },
    CANCEL: { target: '.ready', actions: 'cancel' },
    INTERRUPT: { target: '.ready', actions: 'clearSwing' },
    DIE: { target: '.dead', actions: 'cancel' },
    RESET: { target: '.ready', actions: ['cancel', assign({ cooldown: 0 })] },
  },
  states: {
    ready: {
      on: {
        START: {
          guard: ({ context }) => context.cooldown <= 0,
          target: 'windup',
          actions: assign({
            swing: ({ event }) => event.swing,
            cooldown: ({ event }) => event.cooldown,
          }),
        },
      },
    },
    windup: {
      on: {
        TICK: {
          actions: assign({
            swing: ({ context, event }) =>
              context.swing && {
                ...context.swing,
                elapsed: context.swing.elapsed + Math.max(0, event.dt),
              },
          }),
        },
      },
      always: {
        guard: ({ context }) => !!context.swing && context.swing.elapsed >= context.swing.impact,
        target: 'recovery',
        actions: assign({
          impacts: ({ context }) => context.impacts + 1,
          swing: ({ context }) => context.swing && { ...context.swing, resolved: true },
        }),
      },
    },
    recovery: {
      on: {
        TICK: {
          actions: assign({
            swing: ({ context, event }) =>
              context.swing && {
                ...context.swing,
                elapsed: context.swing.elapsed + Math.max(0, event.dt),
              },
          }),
        },
      },
      always: {
        guard: ({ context }) => !!context.swing && context.swing.elapsed >= context.swing.duration,
        target: 'ready',
        actions: 'clearSwing',
      },
    },
    dead: { on: { CANCEL: {}, INTERRUPT: {} } },
  },
});

/** Attack timing is authoritative in the chart; pursuit counters are continuous data. */
export class Attack {
  readonly chart = new Statechart(attackMachine);
  readonly command = new Statechart(commandMachine);
  repath = 0;
  blocked = 0;
  get target() {
    return this.command.snapshot.matches('pursuing') ? this.command.snapshot.context.target : null;
  }
  set target(target: string | null) {
    this.command.send({ type: 'TARGET', target });
  }
  get interaction() {
    return this.command.snapshot.matches('interacting')
      ? this.command.snapshot.context.target
      : null;
  }
  interact(target: string): void {
    this.command.send({ type: 'DOOR', target });
  }
  releaseInteraction(): void {
    this.command.send({ type: 'RELEASE_DOOR' });
  }
  get swing() {
    return this.chart.snapshot.context.swing;
  }
  get cooldown() {
    return this.chart.snapshot.context.cooldown;
  }
  set cooldown(value: number) {
    this.chart.send({ type: 'SET_COOLDOWN', value });
  }
  start(swing: Swing, cooldown: number): boolean {
    if (!this.chart.snapshot.matches('ready') || this.cooldown > 0) return false;
    this.chart.send({ type: 'START', swing, cooldown });
    return true;
  }
  cool(dt: number): void {
    if (this.cooldown > 0) this.chart.send({ type: 'COOLDOWN', dt });
  }
  advance(dt: number): Swing | null {
    const { swing, impacts } = this.chart.snapshot.context;
    if (!swing) return null;
    this.chart.send({ type: 'TICK', dt });
    return this.chart.snapshot.context.impacts > impacts ? swing : null;
  }
  cancel(): void {
    this.chart.send({ type: 'CANCEL' });
    this.command.send({ type: 'CANCEL' });
    this.repath = this.blocked = 0;
  }
  interrupt(): void {
    this.chart.send({ type: 'INTERRUPT' });
  }
  die(): void {
    this.cancel();
    this.chart.send({ type: 'DIE' });
    this.command.send({ type: 'DIE' });
  }
  reset(): void {
    this.chart.send({ type: 'RESET' });
    this.command.send({ type: 'RESET' });
    this.repath = this.blocked = 0;
  }
}
