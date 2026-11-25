import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { captureWriters } from './cursor-attribution-writers.ts';
import { oversizedWriterTrace, writerFixture } from './cursor-attribution-fixture.ts';
import { reconcileWriters, measurePublications } from './cursor-publication-replay.ts';
import { validateWriterReport } from './cursor-writer-evidence.ts';

test('ancestor effective-enable transitions publish even when undone before the next checkpoint', () => {
  const engine = new NullEngine();
  try {
    const scene = new Scene(engine);
    const root = new TransformNode('root', scene);
    const branch = new TransformNode('branch', scene);
    branch.parent = root;
    const mesh = CreateBox('enabled child', {}, scene);
    const disabled = CreateBox('locally disabled child', {}, scene);
    mesh.parent = disabled.parent = branch;
    disabled.setEnabled(false);
    const capture = captureWriters(scene, {
      runId: 'enable',
      kind: 'idle',
      provenance: 'software',
    });
    capture.begin(0, 0);
    capture.phase('fixed', 1);
    root.setEnabled(false);
    root.setEnabled(false);
    root.setEnabled(true);
    capture.checkpoint();
    capture.phase('render', 1);
    capture.checkpoint();
    capture.end(1);
    capture.close();
    assert.deepEqual(
      capture.trace.frames[0].writes.map((w) => [
        w.kind,
        w.id,
        w.before?.input.eligible,
        w.after?.input.eligible,
      ]),
      [
        ['eligibility', 0, true, false],
        ['eligibility', 0, false, true],
      ],
    );
    assert.deepEqual(reconcileWriters(capture.trace).gaps, []);
    assert.equal(mesh.onEffectiveEnabledStateChangedObservable.hasObservers(), false);
  } finally {
    engine.dispose();
  }
});

test('actual Babylon publications replay in order even when an idle frame undoes a door write', () => {
  const { traces, ids } = writerFixture();
  const idle = traces.find((t) => t.kind === 'idle')!;
  const reconciled = reconcileWriters(idle);
  assert.deepEqual(reconciled.gaps, []);
  const frame = reconciled.frames[0];
  const door = frame.writes.filter((w) => w.kind === 'door' && w.id === ids.door);
  assert.deepEqual(
    door.map((w) => w.tick),
    [1, 2],
  );
  assert.deepEqual(
    door.map((w) => w.bounds),
    [
      [9, 1, 11, 3],
      [1, 1, 3, 3],
    ],
  );
  assert.deepEqual(
    door.map((w) => [w.old, w.next, w.crossed]),
    [
      [['0:0'], ['2:0'], ['1:0']],
      [['2:0'], ['0:0'], ['1:0']],
    ],
  );
  assert.deepEqual(
    frame.writes.find((w) => w.id === ids.child && w.kind === 'reparent')?.bounds,
    [6, 1, 8, 3],
  );
  assert.deepEqual(
    frame.writes
      .filter((w) => w.kind === 'thin-edit' || w.kind === 'thin-replace')
      .map((w) => [w.kind, w.instances]),
    [
      ['thin-edit', [0, 1]],
      ['thin-replace', [0]],
    ],
  );
  for (const kind of ['spawn', 'dispose', 'check', 'eligibility', 'world'])
    assert.ok(
      frame.writes.some((w) => w.kind === kind),
      kind,
    );
  assert.equal(frame.query, null);
  assert.equal(frame.demand.publish, frame.writes.length);
  assert.ok(frame.writes.length > 0);
  assert.equal(frame.demand.query, 0);
  for (const trace of traces.filter((t) => t.kind !== 'idle')) {
    const result = reconcileWriters(trace);
    assert.deepEqual(result.gaps, []);
    assert.ok(result.frames[0].query!.reads.occupied > 0);
    assert.ok(result.frames[0].query!.ids.length > 0);
  }
});

test('batches retain raw times, demand, cold size and withhold fixture timing from admission', () => {
  const { traces } = writerFixture();
  let now = 0;
  const report = measurePublications(traces, () => ++now);
  assert.equal(report.framesPerBatch, 240);
  assert.ok(
    report.cases.every(
      (c) =>
        c.batches.length === 1 &&
        c.batches[0].length === 3 &&
        c.batches[0].every((b) => b.publish.active.units > 0 && (b.publish.active.ms ?? 0) > 0),
    ),
  );
  assert.ok(
    report.cases.every(
      (c) =>
        c.registration.serializedBucketBytes > 0 &&
        c.registration.runtimeMemory === 'unmeasured' &&
        c.registration.ms === 1,
    ),
  );
  assert.ok(report.cases.every((c) => c.msPerFrame !== null));
  const saved = JSON.parse(JSON.stringify(report));
  assert.match(validateWriterReport(report.runId, saved)!, /unmatched/);
  // Exercise the real serialized producer against the pure matched-shape validator.
  assert.equal(validateWriterReport(report.runId, { ...saved, provenance: 'matched' }), null);
});

test('an idle long move archives the gap and endpoint updates but does not price incomplete upkeep', () => {
  const trace = oversizedWriterTrace();
  assert.deepEqual(trace.gaps, []);
  const replay = reconcileWriters(JSON.parse(JSON.stringify(trace)));
  const {
    frames: [frame],
    gaps,
  } = JSON.parse(JSON.stringify(replay));
  assert.deepEqual(gaps, ['door writer 0 at frame 7 (write 0): sweep exceeds 64-cell limit']);
  const [move, check] = frame.writes;
  assert.deepEqual([move.old, move.next, move.remove, move.insert], [['0:0'], ['65:0'], 1, 1]);
  assert.deepEqual(
    [move.sweepGap, move.crossed, move.diff],
    ['sweep exceeds 64-cell limit', null, null],
  );
  assert.deepEqual([check.old, check.next, check.crossed, check.diff], [['65:0'], ['65:0'], [], 0]);
  assert.deepEqual(frame.demand, { publish: null, query: 0 });
  let clockCalls = 0;
  const {
    cases: [idle],
  } = measurePublications([trace], () => ++clockCalls);
  assert.equal(clockCalls, 2); // Cold registration only.
  assert.equal(idle.msPerFrame, null);
  assert.deepEqual(idle.batches, []);
  assert.deepEqual(idle.gaps, gaps);
  const saved = JSON.parse(JSON.stringify(idle.frames[0].writes[0]));
  assert.deepEqual([saved.id, saved.frame, saved.sweepGap], [0, 7, move.sweepGap]);
});

test('a pick after a very long move does not prevent the sweep gap from being retained', () => {
  const trace = oversizedWriterTrace('long-query', 'floor', 1_000_002);
  const {
    frames: [frame],
    gaps,
  } = reconcileWriters(trace);
  assert.deepEqual(gaps, ['door writer 0 at frame 7 (write 0): sweep exceeds 64-cell limit']);
  assert.deepEqual(frame.demand, { publish: null, query: 1 });
  assert.equal(frame.query, null);
  assert.deepEqual(frame.writes[0].next, ['250000:0']);
});

test('fake batch clock charges the expensive case rather than blending it with cheaper cases', () => {
  const { traces } = writerFixture();
  let call = 0;
  let elapsed = 0;
  const report = measurePublications(
    traces,
    () => {
      const i = call++;
      if (i % 2) elapsed += i >= 38 && i < 70 ? 240 : 1;
      return elapsed;
    },
    1,
  );
  const [, floor, idle] = report.cases;
  assert.equal(floor.msPerFrame, 480);
  assert.equal(idle.msPerFrame, 1);
});

test('a retained render snapshot cannot hide a missing tick checkpoint or a dropped write', () => {
  const idle = writerFixture().traces[2];
  idle.frames[0].checks.shift();
  assert.match(reconcileWriters(idle).gaps.join(), /fixed.*tick/);
  const shrine = writerFixture().traces[0];
  shrine.frames[0].writes.splice(1, 1);
  assert.match(reconcileWriters(shrine).gaps.join(), /sequence|operands/);
});

test('malformed raw writer operands cannot reach scratch geometry', () => {
  for (const corrupt of [
    (trace: ReturnType<typeof writerFixture>['traces'][number]) =>
      Object.assign(trace.frames[0].writes[0].after!.input, { eligible: 'true' }),
    (trace: ReturnType<typeof writerFixture>['traces'][number]) =>
      Object.assign(trace.frames[0].checks.at(-1)!, { scene: [null] }),
    (trace: ReturnType<typeof writerFixture>['traces'][number]) =>
      Object.assign(trace.frames[0].checks.find((c) => c.ray)!.ray!, { length: '20' }),
  ]) {
    const [trace] = writerFixture().traces;
    corrupt(trace);
    assert.match(reconcileWriters(trace).gaps.join(), /malformed/);
  }
});
