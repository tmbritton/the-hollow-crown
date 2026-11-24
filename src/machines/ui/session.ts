import { setup } from 'xstate';

export type SessionEvent = {
  type:
    | 'LOAD'
    | 'READY'
    | 'FAIL'
    | 'TOGGLE_MENU'
    | 'CLOSE_MENU'
    | 'INSPECT'
    | 'CLOSE_INSPECTION'
    | 'VICTORY'
    | 'CONTINUE'
    | 'HIDE'
    | 'SHOW'
    | 'TOGGLE_MAP';
};

/** The asynchronous renderer may only complete the current load. */
export function acceptsGenerationReady(
  loading: boolean,
  current: object | null,
  callback: object,
): boolean {
  return loading && current === callback;
}

/** Visibility is orthogonal to the modal mode, so tab changes preserve open menus. */
export const sessionMachine = setup({
  types: { events: {} as SessionEvent },
}).createMachine({
  id: 'session',
  type: 'parallel',
  states: {
    mode: {
      initial: 'loading',
      on: { LOAD: '.loading', FAIL: '.failed' },
      states: {
        loading: { on: { READY: 'playing' } },
        playing: { on: { TOGGLE_MENU: 'menu', INSPECT: 'inspecting', VICTORY: 'victory' } },
        menu: { on: { TOGGLE_MENU: 'playing', CLOSE_MENU: 'playing' } },
        inspecting: { on: { CLOSE_INSPECTION: 'playing', TOGGLE_MENU: 'menu' } },
        victory: { on: { CONTINUE: 'playing' } },
        failed: {},
      },
    },
    visibility: {
      initial: 'visible',
      states: { visible: { on: { HIDE: 'hidden' } }, hidden: { on: { SHOW: 'visible' } } },
    },
    map: {
      initial: 'visible',
      states: {
        visible: { on: { TOGGLE_MAP: 'hidden' } },
        hidden: { on: { TOGGLE_MAP: 'visible' } },
      },
    },
  },
});
