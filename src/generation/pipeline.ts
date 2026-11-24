import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import { generationIdentity, MAX_GENERATION_ATTEMPTS } from './identity.ts';
import type { GenerationTrace } from './identity.ts';
import { generateKeepIdentity } from './keep.ts';
import { applyKeepPresentation } from './keepPresentation.ts';
import { layoutCandidate, reserveCandidate, placeCandidate, validateCandidate } from './stages.ts';
import type { PlacementRejected, ValidationRejected } from './stages.ts';
import { GenerationDiagnostics, startDiagnostics, traceStage } from './diagnostics.ts';
import type { Outcome } from './diagnostics.ts';
import type { World } from '../worldTypes.ts';

export type GenerationResult = { world: World; report: GenerationTrace };
export type GenerationFailure =
  | { tag: 'InvalidGenerationOptions' }
  | { tag: 'GenerationExhausted'; report: GenerationTrace };

export const generationStages = {
  keep: generateKeepIdentity,
  layout: layoutCandidate,
  reserve: reserveCandidate,
  place: placeCandidate,
  validate: validateCandidate,
  present: applyKeepPresentation,
};

const describeSuccess = { outcome: 'success' as const, reasons: [] };
function describe(failure: PlacementRejected | ValidationRejected): {
  outcome: Outcome;
  reasons: readonly string[];
} {
  return {
    outcome: failure.tag === 'PlacementRejected' ? 'placement-rejected' : 'validation-rejected',
    reasons: failure.reasons,
  };
}

export function generationPipeline(
  seed: string,
  maxAttempts: number,
  overrides?: Partial<typeof generationStages>,
): Effect.Effect<GenerationResult, GenerationFailure, GenerationDiagnostics> {
  const stages = overrides ? { ...generationStages, ...overrides } : generationStages;
  return Effect.gen(function* () {
    const port = yield* GenerationDiagnostics;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_GENERATION_ATTEMPTS)
      return yield* Effect.fail({ tag: 'InvalidGenerationOptions' } as const);
    const report: GenerationTrace = {
      identity: generationIdentity(seed),
      acceptedAttempt: null,
      attempts: [],
    };
    const trace = startDiagnostics(port, report.identity);
    const root = trace?.open('generation', null);
    const execute = Effect.suspend(() => {
      const keep = trace
        ? traceStage(trace, 'keep', root, undefined, () => stages.keep(report.identity))
        : stages.keep(report.identity);
      const attemptWork = (
        attempt: number,
        parent?: number,
      ): World | PlacementRejected | ValidationRejected => {
        const candidate = trace
          ? traceStage(trace, 'layout', parent, attempt, () => stages.layout(seed, attempt, keep))
          : stages.layout(seed, attempt, keep);
        if (trace)
          traceStage(trace, 'reservation', parent, attempt, () => stages.reserve(candidate));
        else stages.reserve(candidate);
        const placed = trace
          ? traceStage(
              trace,
              'placement',
              parent,
              attempt,
              (placement) =>
                stages.place(candidate, (room, recipe, plan) =>
                  traceStage(
                    trace,
                    'recipe',
                    placement,
                    attempt,
                    plan,
                    (result) =>
                      result.status === 'rejected'
                        ? { outcome: 'placement-rejected', reasons: [result.reason] }
                        : describeSuccess,
                    { room, recipe },
                  ),
                ),
              (value) => (value.tag === 'PlacementRejected' ? describe(value) : describeSuccess),
            )
          : stages.place(candidate);
        if (placed.tag === 'PlacementRejected') return placed;
        const rejected = trace
          ? traceStage(
              trace,
              'validation',
              parent,
              attempt,
              () => stages.validate(placed.world),
              (value) => (value ? describe(value) : describeSuccess),
            )
          : stages.validate(placed.world);
        return rejected ?? placed.world;
      };
      const build = (
        attempt: number,
      ): Effect.Effect<World, PlacementRejected | ValidationRejected> =>
        Effect.suspend(() => {
          const result = trace
            ? traceStage(
                trace,
                'attempt',
                root,
                attempt,
                (span) => attemptWork(attempt, span),
                (value) => ('tag' in value ? describe(value) : describeSuccess),
              )
            : attemptWork(attempt);
          return 'tag' in result ? Effect.fail(result) : Effect.succeed(result);
        });
      const select = (attempt: number): Effect.Effect<GenerationResult, GenerationFailure> =>
        Effect.matchEffect(build(attempt), {
          onFailure: (failure) => {
            report.attempts.push({
              attempt,
              stage: failure.tag === 'PlacementRejected' ? 'placement' : 'validation',
              reasons: failure.reasons,
            });
            return attempt + 1 < maxAttempts
              ? select(attempt + 1)
              : Effect.fail({ tag: 'GenerationExhausted', report });
          },
          onSuccess: (world) =>
            Effect.sync(() => {
              report.attempts.push({ attempt, stage: 'accepted', reasons: [] });
              report.acceptedAttempt = attempt;
              if (trace)
                traceStage(trace, 'presentation', root, attempt, () => stages.present(world));
              else stages.present(world);
              return { world, report };
            }),
        });
      return select(0);
    });
    return yield* trace
      ? Effect.onExit(execute, (exit) =>
          Effect.sync(() => {
            const outcome = Exit.isSuccess(exit)
              ? 'success'
              : Cause.hasFails(exit.cause)
                ? 'exhausted'
                : 'defect';
            trace.end(root, outcome);
            trace.finish(outcome);
          }),
        )
      : execute;
  });
}
