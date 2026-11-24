import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Effect } from 'effect';
import { createLocalGenerationDiagnostics } from '../src/generation/localDiagnostics.ts';
import {
  GenerationDiagnostics,
  noDiagnostics,
  startDiagnostics,
} from '../src/generation/diagnostics.ts';
import { generationPipeline } from '../src/generation/pipeline.ts';
import { runGeneration, runGenerationSync } from '../src/generation/run.ts';
import { GenerationError, generationIdentity } from '../src/generation/identity.ts';
import type { DiagnosticRun, Outcome } from '../src/generation/diagnostics.ts';

test('sink writes cannot escape into keep generation or rejection reports', () => {
  const port: GenerationDiagnostics = {
    begin(identity) {
      identity.seed = 'wrong';
      identity.contentVersion = 'wrong';
      return {
        open: () => 0,
        end(_id: number, _outcome: Outcome, reasons?: string[]) {
          if (reasons?.length) reasons.splice(0, reasons.length, 'wrong');
        },
        finish() {},
      };
    },
  };
  assert.deepEqual(runGeneration('trial-23', 3, port), runGeneration('trial-23', 3));
  const exhaustion = (diagnostics?: GenerationDiagnostics) => {
    try {
      runGeneration('trial-23', 1, diagnostics);
      assert.fail('expected exhaustion');
    } catch (error) {
      assert.ok(error instanceof GenerationError);
      return { message: error.message, report: error.report };
    }
  };
  assert.deepEqual(exhaustion(port), exhaustion());
});

test('diagnostic getters and methods are guarded, including a throwing warning sink', () => {
  const identity = generationIdentity('test');
  const boom = () => {
    throw new Error('sink failed');
  };
  const run: DiagnosticRun = { open: () => 0, end() {}, finish() {} };
  for (const accessor of [true, false]) {
    for (const name of ['begin', 'open', 'end', 'finish'] as const) {
      let warnings = 0;
      const port: GenerationDiagnostics = {
        begin: () => run,
        get warn() {
          warnings++;
          return accessor ? boom() : boom;
        },
      };
      const sink = { ...run };
      port.begin = () => sink;
      Object.defineProperty(
        name === 'begin' ? port : sink,
        name,
        accessor ? { get: boom } : { value: boom },
      );
      const trace = startDiagnostics(port, identity);
      for (let i = 0; i < 2; i++) {
        trace?.open('generation', null);
        trace?.end(0, 'success');
        trace?.finish('success');
      }
      assert.equal(warnings, 1, name);
    }
  }
});

test('the disabled capability stays inert and cannot be modified into a sink', () => {
  assert.ok(Object.isFrozen(noDiagnostics));
  assert.equal(startDiagnostics(noDiagnostics, generationIdentity('test')), undefined);
  assert.throws(() => {
    noDiagnostics.begin = () => assert.fail('disabled sink');
  }, TypeError);
});

test('real trial-23 stages close in order with deterministic reasons and local timing', () => {
  let time = 0;
  const local = createLocalGenerationDiagnostics(() => ++time);
  const { report } = runGeneration('trial-23', 3, local.port);
  const [run] = local.snapshot().runs;
  const root = run.spans[0];
  assert.equal(root.stage, 'generation');
  assert.equal(root.outcome, 'success');
  const recipes = run.spans.filter((span) => span.stage === 'recipe');
  assert.deepEqual([...new Set(recipes.map(({ room }) => room))].sort(), ['bakery', 'smithy']);
  for (const recipe of recipes) {
    assert.ok(recipe.recipe);
    assert.equal(run.spans[recipe.parent!].stage, 'placement');
  }
  for (const attempt of report.attempts) {
    const parent = run.spans.find(
      ({ stage, attempt: index }) => stage === 'attempt' && index === attempt.attempt,
    )!;
    assert.equal(parent.parent, root.id);
    assert.deepEqual(
      run.spans.filter((entry) => entry.parent === parent.id).map(({ stage }) => stage),
      ['layout', 'reservation', 'placement', 'validation'],
    );
    assert.deepEqual(parent.reasons, attempt.reasons);
    assert.equal(parent.outcome, attempt.stage === 'accepted' ? 'success' : 'validation-rejected');
    assert.ok(parent.elapsedMs! < root.elapsedMs!);
  }
  assert.deepEqual(runGeneration('trial-23', 3).report, report);
});

test('byte, record and run bounds apply before export, and retired handles cannot write', () => {
  const local = createLocalGenerationDiagnostics(() => 42);
  const identity = {
    seed: '💎'.repeat(10_000),
    generatorVersion: '\u0000'.repeat(10_000),
    contentVersion: 'y',
    scenarioVersion: 'z',
  };
  let retired = local.port.begin(identity);
  const initial = local.snapshot().runs[0];
  assert.equal(initial.truncated, true, 'clipping identity alone must be visible');
  assert.equal(initial.dropped, 2, 'each clipped identity string is counted');
  for (let i = 0; i < 5; i++) {
    const run = local.port.begin(identity);
    for (let j = 0; j < 500; j++) {
      const span = run?.open('placement', null, 0);
      if (span !== undefined)
        run?.end(span, 'placement-rejected', ['\u0000'.repeat(10000), '💎'.repeat(10000)]);
    }
    if (i === 0) retired = run;
  }
  const snapshot = local.snapshot();
  assert.equal(snapshot.runs.length, 4);
  for (const run of snapshot.runs) {
    assert.ok(Buffer.byteLength(JSON.stringify(run)) <= 65536);
    assert.ok(Buffer.byteLength(run.seed) <= 256);
    assert.ok(Buffer.byteLength(run.generatorVersion) <= 256);
    assert.ok(run.spans.length <= 256);
    assert.ok(run.truncated && run.dropped > 0);
  }
  retired?.open('layout', null, 0);
  assert.deepEqual(local.snapshot(), snapshot);
  snapshot.runs[0].spans.length = 0;
  assert.notEqual(local.snapshot().runs[0].spans.length, 0);
  local.reset();
  retired?.end(0, 'defect');
  assert.deepEqual(local.snapshot().runs, []);
  local.dispose();
  assert.equal(local.port.begin(identity), undefined);
});

test('defects close retained spans by identity; broken diagnostics cannot substitute a result', () => {
  const local = createLocalGenerationDiagnostics(() => 1);
  const sentinel = new Error('💎'.repeat(10000));
  sentinel.cause = sentinel;
  const program = generationPipeline('x', 1, {
    place() {
      throw sentinel;
    },
  });
  assert.throws(
    () => runGenerationSync(Effect.provideService(program, GenerationDiagnostics, local.port)),
    (error) => error === sentinel,
  );
  const [run] = local.snapshot().runs;
  assert.deepEqual(
    run.spans.map(({ outcome }) => outcome),
    ['defect', 'success', 'defect', 'success', 'success', 'defect'],
  );
  let warnings = 0;
  const broken = {
    begin() {
      return {
        open() {
          return 0;
        },
        end() {
          throw sentinel;
        },
        finish() {},
      };
    },
    warn() {
      warnings++;
      throw sentinel;
    },
  };
  assert.deepEqual(
    runGeneration('trial-23', 3, broken).report,
    runGeneration('trial-23', 3).report,
  );
  assert.equal(warnings, 1);
});
