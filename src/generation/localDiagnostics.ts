import type {
  DiagnosticRun,
  GenerationDiagnostics,
  Outcome,
  RecipeContext,
  Stage,
} from './diagnostics.ts';
import type { GenerationIdentity } from './identity.ts';

type Span = {
  id: number;
  parent: number | null;
  stage: Stage;
  attempt?: number;
  outcome: Outcome | 'open';
  elapsedMs: number | null;
  reasons: string[];
  room?: RecipeContext['room'];
  recipe?: string;
};
type Run = GenerationIdentity & {
  schema: 1;
  id: number;
  outcome: Outcome | 'open';
  spans: Span[];
  truncated: boolean;
  dropped: number;
};
export type GenerationExecutionSnapshot = {
  schema: 1;
  warning: 'diagnostic-sink-failed' | null;
  runs: Run[];
};

const maxBytes = 64 * 1024;
// Includes the run header, maximal escaped identity fields, counters and terminal status.
const headerReserve = 8192;
const encoder = new TextEncoder();
const bytes = (value: unknown) => encoder.encode(JSON.stringify(value)).length;
function bounded(text: string): string {
  let clipped = '';
  let size = 0;
  for (const char of text) {
    const point = char.codePointAt(0)!;
    size += point < 128 ? 1 : point < 2048 ? 2 : point < 65536 ? 3 : 4;
    if (size > 256) break;
    clipped += char;
  }
  return clipped;
}

export function createLocalGenerationDiagnostics(now: () => number = () => performance.now()) {
  const runs = new Map<number, { run: Run; used: number; starts: Map<number, number> }>();
  let id = 0;
  let disposed = false;
  let warning: GenerationExecutionSnapshot['warning'] = null;
  const drop = (run: Run) => {
    run.truncated = true;
    run.dropped = Math.min(65535, run.dropped + 1);
  };
  const clip = (run: Run, value: string) => {
    const result = bounded(value);
    if (result !== value) drop(run);
    return result;
  };
  const port = {
    begin(identity: GenerationIdentity): DiagnosticRun | undefined {
      if (disposed) return undefined;
      if (runs.size === 4) {
        const oldest = runs.keys().next();
        if (!oldest.done) runs.delete(oldest.value);
      }
      const key = ++id;
      const run: Run = {
        schema: 1,
        id: key,
        seed: '',
        generatorVersion: '',
        contentVersion: '',
        outcome: 'open',
        spans: [],
        truncated: false,
        dropped: 0,
      };
      run.seed = clip(run, identity.seed);
      run.generatorVersion = clip(run, identity.generatorVersion);
      run.contentVersion = clip(run, identity.contentVersion);
      if (identity.scenarioVersion !== undefined)
        run.scenarioVersion = clip(run, identity.scenarioVersion);
      runs.set(key, { used: headerReserve, starts: new Map(), run });
      return {
        open(stage, parent, attempt, context) {
          const entry = runs.get(key);
          if (!entry || entry.run.outcome !== 'open') return undefined;
          const { run, starts } = entry;
          if ((parent !== null && !starts.has(parent)) || run.spans.length >= 256) {
            drop(run);
            return undefined;
          }
          let depth = 0;
          for (let ancestor = parent; ancestor !== null; ancestor = run.spans[ancestor].parent) {
            if (++depth > 3) {
              drop(run);
              return undefined;
            }
          }
          const span: Span = {
            id: run.spans.length,
            parent,
            stage,
            attempt,
            outcome: 'open',
            elapsedMs: null,
            reasons: [],
            room: context?.room,
            recipe: context ? clip(run, context.recipe) : undefined,
          };
          // Reserve space for the longest terminal outcome, a float and punctuation.
          const cost = bytes(span) + 64;
          if (entry.used + cost > maxBytes) {
            drop(run);
            return undefined;
          }
          const start = now();
          starts.set(span.id, start);
          entry.used += cost;
          run.spans.push(span);
          return span.id;
        },
        end(spanId, outcome, reasons = []) {
          const entry = runs.get(key);
          const start = entry?.starts.get(spanId);
          if (!entry || start === undefined) return;
          const span = entry.run.spans[spanId];
          entry.starts.delete(spanId);
          span.outcome = outcome;
          const elapsed = now() - start;
          span.elapsedMs = Number.isFinite(elapsed) ? Math.max(0, elapsed) : null;
          for (const reason of reasons.slice(0, 8)) {
            const clipped = bounded(reason);
            const cost = bytes(clipped) + 1;
            if (entry.used + cost > maxBytes) {
              drop(entry.run);
              break;
            }
            span.reasons.push(clipped);
            entry.used += cost;
            if (clipped !== reason) drop(entry.run);
          }
          if (reasons.length > 8) drop(entry.run);
        },
        finish(outcome) {
          const entry = runs.get(key);
          if (!entry || entry.run.outcome !== 'open') return;
          entry.run.outcome = outcome;
          for (const spanId of entry.starts.keys()) entry.run.spans[spanId].outcome = outcome;
          entry.starts.clear();
        },
      };
    },
    warn() {
      warning = 'diagnostic-sink-failed';
    },
  } satisfies GenerationDiagnostics;
  const reset = () => {
    runs.clear();
    warning = null;
  };
  return {
    port,
    reset,
    dispose() {
      disposed = true;
      reset();
    },
    snapshot(): GenerationExecutionSnapshot {
      return {
        schema: 1,
        warning,
        runs: [...runs.values()].map(({ run }) => structuredClone(run)),
      };
    },
  };
}
