import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import { GenerationError, MAX_GENERATION_ATTEMPTS } from './identity.ts';
import { generationPipeline } from './pipeline.ts';
import type { GenerationFailure, GenerationResult } from './pipeline.ts';
import { GenerationDiagnostics, noDiagnostics } from './diagnostics.ts';

/** The only interpreter. Contract: no suspension, even on a failed attempt. */
export function runGenerationSync<A>(program: Effect.Effect<A, GenerationFailure>): A {
  // Keep program exits (including user-thrown AsyncFiberErrors) inside the runtime exit.
  // Only the outer sync interpreter can report a suspension owned by this invocation.
  const boundary = Effect.runSyncExit(Effect.exit(program));
  if (Exit.isFailure(boundary)) {
    const reason = boundary.cause.reasons[0];
    if (reason && Cause.isDieReason(reason) && Cause.isAsyncFiberError(reason.defect)) {
      const { fiber } = reason.defect;
      let terminated = false;
      const unsubscribe = fiber.addObserver((completion) => {
        terminated = Exit.isFailure(completion) && Cause.hasInterrupts(completion.cause);
      });
      try {
        fiber.interruptUnsafe();
      } finally {
        unsubscribe();
      }
      throw new Error(
        terminated
          ? 'Synchronous generation suspended; interrupted before returning'
          : 'Synchronous generation suspended; interruption did not complete synchronously',
      );
    }
    throw new Error('Unexpected synchronous generation boundary exit', { cause: boundary.cause });
  }
  const exit = boundary.value;
  if (Exit.isSuccess(exit)) return exit.value;
  for (const reason of exit.cause.reasons) if (Cause.isDieReason(reason)) throw reason.defect;
  const failure = exit.cause.reasons.length === 1 ? exit.cause.reasons[0] : undefined;
  if (failure && Cause.isFailReason(failure)) {
    switch (failure.error.tag) {
      case 'InvalidGenerationOptions':
        throw new RangeError(`maxAttempts must be an integer from 1 to ${MAX_GENERATION_ATTEMPTS}`);
      case 'GenerationExhausted':
        throw new GenerationError(failure.error.report);
    }
  }
  throw new Error('Unexpected synchronous generation exit', { cause: exit.cause });
}

export function runGeneration(
  seed: string,
  maxAttempts: number,
  diagnostics = noDiagnostics,
): GenerationResult {
  return runGenerationSync(
    Effect.provideService(
      generationPipeline(seed, maxAttempts),
      GenerationDiagnostics,
      diagnostics,
    ),
  );
}
