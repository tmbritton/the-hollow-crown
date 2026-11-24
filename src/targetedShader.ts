type Quality = 'low' | 'high';

interface JobKey {
  pass: 'camera' | 'shadow';
  key: string;
  layout: string;
}

export function selectWork<T extends JobKey>(
  jobs: readonly T[],
  quality: Quality,
  ready: ReadonlySet<string>,
) {
  const seen = new Set<string>();
  return jobs.filter(({ pass, key, layout }) => {
    if ((pass === 'shadow' && quality === 'low') || ready.has(key)) return false;
    const identity = JSON.stringify([pass, key, layout]);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

type State = { kind: 'idle' | 'preparing' | 'complete' | 'failed' | 'retired'; revision: number };
type Event =
  | { type: 'begin'; revision: number; empty: boolean }
  | { type: 'failed'; revision: number; reason: string }
  | { type: 'complete' | 'retire'; revision: number };
type Command =
  | { type: 'compile' | 'cancel' | 'ready'; revision: number }
  | { type: 'fail'; revision: number; reason: string };

function transition(state: State, event: Event): { next: State; commands: Command[] } | null {
  const { revision } = event;
  if (state.kind === 'retired') return null;
  const cancel: Command[] =
    state.kind === 'preparing' ? [{ type: 'cancel', revision: state.revision }] : [];
  if (event.type === 'begin') {
    if (revision <= state.revision) return null;
    return {
      next: { kind: event.empty ? 'complete' : 'preparing', revision },
      commands: [...cancel, { type: event.empty ? 'ready' : 'compile', revision }],
    };
  }
  if (revision !== state.revision) return null;
  if (event.type === 'retire') return { next: { kind: 'retired', revision }, commands: cancel };
  if (state.kind !== 'preparing') return null;
  if (event.type === 'failed')
    return {
      next: { kind: 'failed', revision },
      commands: [...cancel, { type: 'fail', revision, reason: event.reason }],
    };
  return { next: { kind: 'complete', revision }, commands: [{ type: 'ready', revision }] };
}

interface PreparationPorts {
  compile(revision: number): void;
  cancel(revision: number): void;
  ready(revision: number): void;
  fail(revision: number, reason: string): void;
}

export function createPreparation(ports: PreparationPorts) {
  let state: State = { kind: 'idle', revision: 0 };
  return {
    send(event: Event) {
      const decision = transition(state, event);
      if (!decision) return false;
      state = decision.next;
      for (const command of decision.commands) {
        if (command.type === 'fail') ports.fail(command.revision, command.reason);
        else ports[command.type](command.revision);
      }
      return true;
    },
  };
}
