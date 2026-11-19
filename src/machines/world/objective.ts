import { assign, setup } from 'xstate';

export const MAX_OBJECTIVE_CAPACITY = 64;
export type ObjectiveTerminalStatus = 'completed' | 'thwarted' | 'lost' | 'contested';
export interface ObjectiveResolution {
  outcomeId: string;
  step: number;
  reason?: string;
}

/** Only the batch resolver decides outcomes. Filling a clock alone is not completion:
 * its rival must be considered before either exclusive endpoint can be installed. */
export const objectiveMachine = setup({
  types: {
    input: {} as { capacity: number },
    context: {} as {
      capacity: number;
      progress: number;
      resolution: ObjectiveResolution | null;
    },
    events: {} as
      | { type: 'CREDIT'; amount: number }
      | ({ type: 'RESOLVE'; status: ObjectiveTerminalStatus } & ObjectiveResolution),
  },
  actions: {
    resolve: assign({
      resolution: ({ context, event }) =>
        event.type === 'RESOLVE'
          ? {
              outcomeId: event.outcomeId,
              step: event.step,
              ...(event.reason ? { reason: event.reason } : {}),
            }
          : context.resolution,
    }),
  },
}).createMachine({
  id: 'objective',
  initial: 'unresolved',
  context: ({ input }) => {
    if (
      !Number.isSafeInteger(input.capacity) ||
      input.capacity < 1 ||
      input.capacity > MAX_OBJECTIVE_CAPACITY
    )
      throw new Error('Invalid objective capacity');
    return { capacity: input.capacity, progress: 0, resolution: null };
  },
  states: {
    unresolved: {
      on: {
        CREDIT: {
          guard: ({ event }) =>
            Number.isSafeInteger(event.amount) &&
            event.amount > 0 &&
            event.amount <= MAX_OBJECTIVE_CAPACITY,
          actions: assign({
            progress: ({ context, event }) =>
              Math.min(context.capacity, context.progress + event.amount),
          }),
        },
        RESOLVE: [
          {
            guard: ({ context, event }) =>
              event.status === 'completed' && context.progress === context.capacity,
            target: 'completed',
            actions: 'resolve',
          },
          {
            guard: ({ context, event }) =>
              event.status === 'contested' && context.progress === context.capacity,
            target: 'contested',
            actions: 'resolve',
          },
          {
            guard: ({ event }) => event.status === 'thwarted',
            target: 'thwarted',
            actions: 'resolve',
          },
          { guard: ({ event }) => event.status === 'lost', target: 'lost', actions: 'resolve' },
        ],
      },
    },
    completed: { type: 'final' },
    thwarted: { type: 'final' },
    lost: { type: 'final' },
    contested: { type: 'final' },
  },
});
