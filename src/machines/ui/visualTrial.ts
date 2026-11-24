import { assign, setup } from 'xstate';
import { Statechart } from '../statechart.ts';
import { DEFAULT_VIEW, VIEW_RANGES, viewKey } from '../../visualTrial.ts';
import type { ViewSettings } from '../../visualTrial.ts';

export type ViewMode = 'original' | 'tuned';
export type VisualTrialEvent =
  | { type: 'SELECT'; mode: ViewMode }
  | { type: 'EDIT'; key: string; value: number }
  | { type: 'RESET' | 'COPY' };

const originalSelection = ({ event }: { event: VisualTrialEvent }) =>
  event.type === 'SELECT' && event.mode === 'original';
const tunedSelection = ({ event }: { event: VisualTrialEvent }) =>
  event.type === 'SELECT' && event.mode === 'tuned';

export const visualTrialMachine = setup({
  types: {
    context: {} as { saved: ViewSettings },
    events: {} as VisualTrialEvent,
  },
  actions: {
    // Statechart returns these effect markers; no adapters run inside the decision.
    apply: () => {},
    copy: () => {},
  },
}).createMachine({
  id: 'visualTrial',
  initial: 'original',
  context: { saved: DEFAULT_VIEW },
  on: {
    RESET: { actions: [assign({ saved: DEFAULT_VIEW }), 'apply'] },
    COPY: { actions: 'copy' },
  },
  states: {
    original: {
      on: {
        SELECT: [
          { guard: tunedSelection, target: 'tuned', actions: 'apply' },
          { guard: originalSelection, actions: 'apply' },
        ],
        // Edits in Original are rejected (no effect).
      },
    },
    tuned: {
      on: {
        SELECT: [
          { guard: originalSelection, target: 'original', actions: 'apply' },
          { guard: tunedSelection, actions: 'apply' },
        ],
        EDIT: {
          guard: ({ event }) => viewKey(event.key) && Number.isFinite(event.value),
          actions: [
            assign({
              saved: ({ context, event }) => {
                if (!viewKey(event.key)) return context.saved;
                const [min, max] = VIEW_RANGES[event.key];
                return { ...context.saved, [event.key]: Math.min(max, Math.max(min, event.value)) };
              },
            }),
            'apply',
          ],
        },
      },
    },
  },
});

export interface VisualTrialPorts {
  applyView(settings: ViewSettings): void;
  copySettings(text: string): void;
}

export function createVisualTrial(ports: VisualTrialPorts) {
  const chart = new Statechart(visualTrialMachine);
  const mode = (): ViewMode => (chart.snapshot.matches('tuned') ? 'tuned' : 'original');
  const settings = () => (mode() === 'tuned' ? chart.snapshot.context.saved : DEFAULT_VIEW);
  return {
    get mode() {
      return mode();
    },
    get settings() {
      return settings();
    },
    send(event: VisualTrialEvent): boolean {
      const effects = chart.send(event);
      for (const effect of effects) {
        if (effect.type === 'apply') ports.applyView(settings());
        if (effect.type === 'copy')
          ports.copySettings(JSON.stringify({ mode: mode(), ...chart.snapshot.context.saved }));
      }
      return effects.length > 0;
    },
  };
}
