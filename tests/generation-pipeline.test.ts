import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Cause, Effect, Exit } from 'effect';
import { generationPipeline, generationStages } from '../src/generation/pipeline.ts';
import { GenerationDiagnostics, noDiagnostics } from '../src/generation/diagnostics.ts';
import { runGenerationSync } from '../src/generation/run.ts';
import { GenerationError } from '../src/generation/identity.ts';

const close = (program: ReturnType<typeof generationPipeline>) =>
  Effect.provideService(program, GenerationDiagnostics, noDiagnostics);

test('execution state is fresh, including reentrant execution and rejected candidates', () => {
  let history = 0;
  const program = generationPipeline('trial-23', 3, {
    keep(identity) {
      history++;
      return generationStages.keep(identity);
    },
    place(candidate) {
      if (!candidate.world.attempt) {
        candidate.world.tiles.clear();
        runGenerationSync(close(generationPipeline('MOURNING-731', 1)));
        return { tag: 'PlacementRejected', reasons: ['test veto'] };
      }
      return generationStages.place(candidate);
    },
  });
  const compileOnly = () => {
    // @ts-expect-error The required diagnostics service has not been provided.
    return runGenerationSync(program);
  };
  // Deliberately bypass the type safety above to exercise the runtime wiring failure.
  assert.throws(compileOnly, /Service not found: dungeon\/GenerationDiagnostics/);
  assert.equal(history, 0);
  const first = runGenerationSync(close(program));
  const second = runGenerationSync(close(program));
  assert.equal(history, 2);
  assert.equal(first.report.acceptedAttempt, 2);
  assert.notEqual(first.world.tiles, second.world.tiles);
  assert.notEqual(first.report.attempts, second.report.attempts);
  assert.deepEqual(first, second);
});

test('only typed rejections recur and option checking precedes all work', () => {
  let placed = 0;
  let validated = 0;
  const stages = {
    place() {
      placed++;
      return { tag: 'PlacementRejected' as const, reasons: ['test veto'] };
    },
    validate() {
      validated++;
      return null;
    },
  };
  for (const limit of [0, NaN, 1.5, 41])
    assert.throws(
      () => runGenerationSync(close(generationPipeline('bounded', limit, stages))),
      RangeError,
    );
  assert.equal(placed, 0);
  assert.throws(
    () => runGenerationSync(close(generationPipeline('bounded', 40, stages))),
    (error) => {
      assert.ok(error instanceof GenerationError);
      assert.deepEqual(
        error.report.attempts,
        Array.from({ length: 40 }, (_, attempt) => ({
          attempt,
          stage: 'placement',
          reasons: ['test veto'],
        })),
      );
      return true;
    },
  );
  assert.equal(placed, 40);
  assert.equal(validated, 0);
  const sentinel = { tag: 'PlacementRejected', reasons: ['test veto'] };
  assert.throws(
    () =>
      runGenerationSync(
        close(
          generationPipeline('bounded', 3, {
            place(candidate) {
              if (candidate.world.attempt) throw sentinel;
              return stages.place();
            },
          }),
        ),
      ),
    (error) => error === sentinel,
  );
  assert.equal(placed, 41);
});

test('the synchronous boundary interrupts suspended work before reporting it', async () => {
  let resume!: (effect: Effect.Effect<void>) => void;
  let signal!: AbortSignal;
  let cleanup = 0;
  let finalizers = 0;
  let publications = 0;
  const program = Effect.ensuring(
    Effect.callback<void>((complete, abort) => {
      resume = complete;
      signal = abort;
      return Effect.sync(() => {
        cleanup++;
      });
    }),
    Effect.sync(() => {
      finalizers++;
    }),
  );
  assert.throws(() => runGenerationSync(program), /synchronous generation suspended/i);
  assert.equal(signal.aborted, true);
  assert.equal(cleanup, 1);
  assert.equal(finalizers, 1);
  resume(
    Effect.sync(() => {
      publications++;
    }),
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(publications, 0);
  const failure = Effect.runSyncExit(Effect.fail({ tag: 'PlacementRejected' }));
  assert.ok(Exit.isFailure(failure) && Cause.hasFails(failure.cause));
});

test('a thrown foreign AsyncFiberError escapes by identity without touching its fiber', (t) => {
  const fiber = Effect.runFork(Effect.never);
  const foreign = new Cause.AsyncFiberError(fiber);
  const observe = t.mock.method(fiber, 'addObserver');
  const interrupt = t.mock.method(fiber, 'interruptUnsafe');
  try {
    assert.throws(
      () =>
        runGenerationSync(
          Effect.sync(() => {
            throw foreign;
          }),
        ),
      (error) => error === foreign,
    );
    assert.equal(observe.mock.callCount(), 0);
    assert.equal(interrupt.mock.callCount(), 0);
    assert.equal(fiber.pollUnsafe(), undefined);
  } finally {
    fiber.interruptUnsafe();
  }
});
