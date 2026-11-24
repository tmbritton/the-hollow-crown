interface ResetTarget {
  generation: number;
  stop(): void;
}

type State =
  | { kind: 'absent'; retired: number }
  | { kind: 'live'; target: ResetTarget }
  | { kind: 'terminal' };

type Event =
  | { type: 'bind'; target: ResetTarget }
  | { type: 'reset' }
  | { type: 'replace'; generation: number }
  | { type: 'terminate' };

interface Decision {
  state: State;
  clear?: true;
  stop?: ResetTarget;
  release?: true;
}

function transition(state: State, event: Event): Decision | null {
  switch (event.type) {
    case 'bind':
      return state.kind === 'absent' && event.target.generation > state.retired
        ? { state: { kind: 'live', target: event.target } }
        : null;
    case 'reset':
      return { state, clear: true, ...(state.kind === 'live' && { stop: state.target }) };
    case 'replace':
      if (state.kind !== 'live' || state.target.generation !== event.generation) return null;
      return {
        state: { kind: 'absent', retired: event.generation },
        clear: true,
        stop: state.target,
        release: true,
      };
    case 'terminate':
      return {
        state: { kind: 'terminal' },
        clear: true,
        ...(state.kind === 'live' && { stop: state.target }),
        ...(state.kind !== 'terminal' && { release: true }),
      };
  }
}

export function createRigLifecycle(clearIntent: () => void) {
  let state: State = { kind: 'absent', retired: 0 };
  let stopping = false;
  let terminalRelease: (() => void) | undefined;
  const terminal = () => state.kind === 'terminal';
  const send = (event: Event, release?: () => void) => {
    const decision = transition(state, event);
    if (!decision) return false;
    // Publish before calling ports: a synchronous terminal event must never be overwritten.
    state = decision.state;
    if (decision.clear) clearIntent();
    if (event.type === 'terminate' && decision.release) terminalRelease = release;
    if (decision.stop && state === decision.state && !stopping) {
      stopping = true;
      try {
        decision.stop.stop();
      } finally {
        stopping = false;
        const dispose = terminalRelease;
        terminalRelease = undefined;
        dispose?.();
      }
    } else if (!stopping && terminalRelease) {
      const dispose = terminalRelease;
      terminalRelease = undefined;
      dispose();
    }
    // Terminal engine disposal supersedes replacement scene disposal.
    if (event.type === 'replace' && !terminal()) release?.();
    return event.type !== 'terminate' || decision.release === true;
  };
  return {
    get generation() {
      return state.kind === 'live' ? state.target.generation : undefined;
    },
    get terminal() {
      return state.kind === 'terminal';
    },
    bind: (target: ResetTarget) => send({ type: 'bind', target }),
    reset: () => send({ type: 'reset' }),
    replace: (generation: number, release: () => void) =>
      send({ type: 'replace', generation }, release),
    terminate: (release: () => void) => send({ type: 'terminate' }, release),
  };
}
