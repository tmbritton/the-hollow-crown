import { assign, setup } from 'xstate';
import { Statechart } from '../statechart.ts';
import type { Entity } from '../../ecs.ts';

export const WORK_UNITS_PER_SECOND = 60;

/** Convert relative to a simulation boundary. This makes authored N/60 seconds exactly
 * N units while preserving the signed fractional remainder, including adjacent doubles.
 * Plain seconds*60 can round 8.3 above 498 or collapse values on either side of a boundary. */
function workUnits(seconds: number): number {
  const boundary = Math.round(seconds * WORK_UNITS_PER_SECOND);
  return boundary + (seconds - boundary / WORK_UNITS_PER_SECOND) * WORK_UNITS_PER_SECOND;
}

interface WorkContext {
  cycleId: string | null;
  units: number;
  /** Kahan carry in work units; a normal 1/60 step contributes exactly one unit. */
  compensation: number;
  duration: number;
  reason: string | null;
}

export const workMachine = setup({
  types: {
    context: {} as WorkContext,
    events: {} as
      | { type: 'START'; id: string; duration: number }
      | { type: 'TICK'; dt: number }
      | { type: 'BLOCK' | 'INTERRUPT'; reason: string }
      | { type: 'CANCEL' | 'SETTLE' },
  },
  actions: {
    clear: assign({ cycleId: null, units: 0, compensation: 0, duration: 0, reason: null }),
  },
}).createMachine({
  id: 'objectiveWork',
  initial: 'idle',
  context: { cycleId: null, units: 0, compensation: 0, duration: 0, reason: null },
  on: {
    START: {
      guard: ({ context, event }) =>
        context.cycleId === null &&
        !!event.id &&
        Number.isFinite(event.duration * WORK_UNITS_PER_SECOND) &&
        event.duration > 0,
      target: '.working',
      actions: assign(({ event }) => ({
        cycleId: event.id,
        duration: event.duration,
        units: 0,
        compensation: 0,
        reason: null,
      })),
    },
    BLOCK: {
      target: '.blocked',
      actions: ['clear', assign({ reason: ({ event }) => event.reason })],
    },
    INTERRUPT: {
      target: '.interrupted',
      actions: ['clear', assign({ reason: ({ event }) => event.reason })],
    },
    CANCEL: { target: '.idle', actions: 'clear' },
  },
  states: {
    idle: {},
    blocked: {},
    interrupted: {},
    working: {
      on: {
        TICK: {
          guard: ({ event }) => Number.isFinite(event.dt) && event.dt > 0,
          actions: assign(({ context, event }) => {
            // Clip overfill before conversion; finite seconds can overflow when scaled.
            const increment =
              workUnits(Math.min(event.dt, context.duration)) - context.compensation;
            const units = context.units + increment;
            return {
              units: Math.min(workUnits(context.duration), units),
              compensation: units - context.units - increment,
            };
          }),
        },
      },
      always: {
        guard: ({ context }) => context.units >= workUnits(context.duration),
        target: 'ready',
        actions: assign({ units: ({ context }) => workUnits(context.duration), compensation: 0 }),
      },
    },
    ready: { on: { SETTLE: { target: 'idle', actions: 'clear' } } },
  },
});

/** Actor-owned assignment. Entity identity, not an ID or an ephemeral Actor view, owns it. */
export class WorkAction {
  readonly objectiveId: string;
  private readonly actor: Entity;
  readonly chart = new Statechart(workMachine);

  constructor(actor: Entity, objectiveId: string) {
    this.actor = actor;
    this.objectiveId = objectiveId;
  }
  belongsTo(entity: Entity): boolean {
    return this.actor === entity;
  }
  interrupt(reason: string): void {
    this.chart.send({ type: 'INTERRUPT', reason });
  }
  snapshot() {
    const { cycleId, units, duration, reason } = this.chart.snapshot.context;
    return {
      objectiveId: this.objectiveId,
      status: this.chart.snapshot.value,
      cycleId,
      elapsed: units / WORK_UNITS_PER_SECOND,
      duration,
      reason,
    };
  }
}
