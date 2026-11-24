import { Cause, Context, Effect, Exit, Fiber, Result } from 'effect';

interface GeneratorInput {
  readonly base: number;
}
const GeneratorInput = Context.Service<GeneratorInput>('ef0/GeneratorInput');
const required = Effect.map(GeneratorInput, (input) => input.base + 2);
const rejection = { _tag: 'Rejected', stage: 'placement' } as const;

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function verifyEffect() {
  // Type-only negative check: the project settings must reject a missing service.
  const missingServiceMustNotRun = () => {
    // @ts-expect-error The required environment is not never.
    return Effect.runSyncExit(required);
  };
  void missingServiceMustNotRun;

  const success = Effect.runSyncExit(Effect.provideService(required, GeneratorInput, { base: 40 }));
  check(Exit.isSuccess(success), 'provided service did not succeed');
  const failed = Effect.runSyncExit(Effect.fail(rejection));
  check(Exit.isFailure(failed), 'typed failure was not Failure');
  const error = Cause.findError(failed.cause);
  const exact: typeof rejection = Result.isSuccess(error) ? error.success : rejection;
  check(Result.isSuccess(error) && exact === rejection, 'typed error did not unwrap by identity');

  const defect = new Error('unexpected');
  const died = Effect.runSyncExit(Effect.die(defect));
  check(Exit.isFailure(died), 'defect was not Failure');
  const unwrapped = Cause.findDefect(died.cause);
  const defectIdentity = Result.isSuccess(unwrapped) && unwrapped.success === defect;
  check(!Result.isSuccess(Cause.findError(died.cause)), 'defect appeared in typed error channel');

  let mismatchSignal: AbortSignal | undefined;
  const mismatch = Effect.runSyncExit(
    Effect.callback((_resume, signal) => {
      mismatchSignal = signal;
    }),
  );
  check(Exit.isFailure(mismatch), 'sync runner accepted suspended callback');
  const asyncDefect = Cause.findDefect(mismatch.cause);
  check(
    Result.isSuccess(asyncDefect) && Cause.isAsyncFiberError(asyncDefect.success),
    'missing AsyncFiberError defect',
  );
  await Effect.runPromise(Fiber.interrupt(asyncDefect.success.fiber));
  const asyncMismatchCleaned = mismatchSignal?.aborted === true;

  let markEntered!: (signal: AbortSignal) => void;
  const entered = new Promise<AbortSignal>((resolve) => {
    markEntered = resolve;
  });
  let callbackCleanup = 0;
  let finalizer = 0;
  const sleeping = Effect.callback((_resume, signal) => {
    markEntered(signal);
    return Effect.sync(() => {
      callbackCleanup++;
    });
  });
  const fiber = Effect.runFork(
    Effect.ensuring(
      sleeping,
      Effect.sync(() => {
        finalizer++;
      }),
    ),
  );
  const signal = await entered;
  await Effect.runPromise(Fiber.interrupt(fiber));
  const cancelled = await Effect.runPromise(Fiber.await(fiber));
  return {
    service: success.value,
    failure: exact.stage,
    defectIdentity,
    asyncMismatch: true,
    asyncMismatchCleaned,
    signalAborted: signal.aborted,
    interrupted: Exit.isFailure(cancelled) && Cause.hasInterrupts(cancelled.cause),
    callbackCleanup,
    finalizer,
  };
}
