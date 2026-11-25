import type { Spawn } from './worldTypes.ts';

export type Operation =
  | 'open'
  | 'close'
  | 'kindle'
  | 'rest'
  | 'claim'
  | 'inspect'
  | 'recover'
  | 'restore'
  | 'cleanse'
  | 'repair'
  | 'disable';
export type UseRef = { id: string; operation: Operation };
export type UseState = { kind: 'idle' } | { kind: 'approaching'; ref: UseRef; remaining: Spawn[] };
export const idleUse: UseState = { kind: 'idle' };

export function decideUse(expected: Operation, current: Operation | null, inReach: boolean) {
  return expected !== current ? 'reject' : inReach ? 'use' : 'approach';
}

type Event =
  | { type: 'cancel' }
  | { type: 'select'; ref: UseRef; candidates: Spawn[] }
  | { type: 'check'; result: ReturnType<typeof decideUse>; travelling: boolean };
type Effect = { type: 'route'; point: Spawn } | { type: 'stop' } | { type: 'execute'; ref: UseRef };

export function transitionUse(state: UseState, event: Event): { state: UseState; effect?: Effect } {
  switch (event.type) {
    case 'cancel':
      return { state: idleUse };
    case 'select':
      return { state: { kind: 'approaching', ref: event.ref, remaining: event.candidates } };
    case 'check': {
      if (state.kind === 'idle') return { state };
      if (event.result === 'reject') return { state: idleUse, effect: { type: 'stop' } };
      if (event.result === 'use')
        return { state: idleUse, effect: { type: 'execute', ref: state.ref } };
      if (event.travelling) return { state };
      const [point, ...remaining] = state.remaining;
      return point
        ? { state: { ...state, remaining }, effect: { type: 'route', point } }
        : { state: idleUse };
    }
  }
}
