import { assign, setup } from 'xstate';

export interface HeldPointer {
  id: number;
  x: number;
  y: number;
}
export const pointerMachine = setup({
  types: {
    context: {} as { pointer: HeldPointer | null; referenceHeight: number | null },
    events: {} as
      | { type: 'DOWN'; pointer: HeldPointer; referenceHeight: number }
      | { type: 'MOVE'; pointer: HeldPointer; pressed: boolean }
      | { type: 'UP'; id: number }
      | { type: 'SELECT_TARGET' | 'CANCEL' },
  },
  actions: { clear: assign({ pointer: null, referenceHeight: null }) },
}).createMachine({
  id: 'pointer',
  initial: 'idle',
  context: { pointer: null, referenceHeight: null },
  on: {
    DOWN: {
      target: '.floor',
      actions: assign(({ event }) => ({
        pointer: event.pointer,
        referenceHeight: event.referenceHeight,
      })),
    },
    CANCEL: { target: '.idle', actions: 'clear' },
    UP: {
      guard: ({ context, event }) => context.pointer?.id === event.id,
      target: '.idle',
      actions: 'clear',
    },
    MOVE: [
      { guard: ({ context, event }) => context.pointer?.id !== event.pointer.id },
      { guard: ({ event }) => !event.pressed, target: '.idle', actions: 'clear' },
      { actions: assign({ pointer: ({ event }) => event.pointer }) },
    ],
  },
  states: {
    idle: { on: { MOVE: {} } },
    floor: {
      on: { SELECT_TARGET: { target: 'target', actions: assign({ referenceHeight: null }) } },
    },
    target: {},
  },
});
