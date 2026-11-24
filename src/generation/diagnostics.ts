import * as Context from 'effect/Context';
import type { GenerationIdentity } from './identity.ts';
import type { SceneRoom } from './scenes.ts';

export const GenerationDiagnostics = Context.Service<GenerationDiagnostics>(
  'dungeon/GenerationDiagnostics',
);
export type Stage =
  | 'generation'
  | 'keep'
  | 'attempt'
  | 'layout'
  | 'reservation'
  | 'placement'
  | 'recipe'
  | 'validation'
  | 'presentation';
export type RecipeContext = { room: SceneRoom; recipe: string };
export type Outcome =
  | 'success'
  | 'placement-rejected'
  | 'validation-rejected'
  | 'exhausted'
  | 'defect';
export interface DiagnosticRun {
  open(
    stage: Stage,
    parent: number | null,
    attempt?: number,
    context?: RecipeContext,
  ): number | undefined;
  end(span: number, outcome: Outcome, reasons?: readonly string[]): void;
  finish(outcome: Outcome): void;
}
export interface GenerationDiagnostics {
  begin?(identity: GenerationIdentity): DiagnosticRun | undefined;
  warn?(): void;
}
export const noDiagnostics: GenerationDiagnostics = Object.freeze({});

function warn(port: GenerationDiagnostics): void {
  try {
    port.warn?.();
  } catch {
    /* Diagnostics never own the generation result. */
  }
}

export function startDiagnostics(port: GenerationDiagnostics, identity: GenerationIdentity) {
  if (port === noDiagnostics) return undefined;
  let run: DiagnosticRun | undefined;
  try {
    const begin = port.begin;
    if (!begin) return undefined;
    run = Reflect.apply(begin, port, [{ ...identity }]);
  } catch {
    warn(port);
    return undefined;
  }
  if (!run) return undefined;
  let warned = false;
  const safe = <A>(operation: () => A): A | undefined => {
    try {
      return operation();
    } catch {
      if (!warned) {
        warned = true;
        warn(port);
      }
    }
  };
  const sink = run;
  return {
    open: (stage: Stage, parent: number | null, attempt?: number, context?: RecipeContext) =>
      safe(() => sink.open(stage, parent, attempt, context)),
    end: (id: number | undefined, outcome: Outcome, reasons?: readonly string[]) => {
      if (id !== undefined) safe(() => sink.end(id, outcome, reasons?.slice()));
    },
    finish: (outcome: Outcome) => safe(() => sink.finish(outcome)),
  };
}

export type Diagnostics = ReturnType<typeof startDiagnostics>;

export function traceStage<A>(
  trace: Diagnostics,
  stage: Stage,
  parent: number | undefined,
  attempt: number | undefined,
  work: (span?: number) => A,
  classify?: (value: A) => { outcome: Outcome; reasons: readonly string[] },
  context?: RecipeContext,
): A {
  if (!trace || parent === undefined) return work();
  const span = trace.open(stage, parent, attempt, context);
  try {
    const result = work(span);
    const status = span === undefined ? undefined : classify?.(result);
    trace.end(span, status?.outcome ?? 'success', status?.reasons);
    return result;
  } catch (error) {
    trace.end(span, 'defect');
    throw error;
  }
}
