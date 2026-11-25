import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Ray } from '@babylonjs/core/Culling/ray.js';
import { cachedBounds, captureWriters, writerDiagnostic } from './cursor-attribution-writers.ts';
import { pose } from './cursor-attribution-probe.ts';
import { oversizedWriterTrace, writerFixture } from './cursor-attribution-fixture.ts';
import {
  reconcileWriters,
  measurePublications,
  scratchPass,
  scratchSchedule,
} from './cursor-publication-replay.ts';
import { validateWriterReport } from './cursor-writer-evidence.ts';

test('scratch restarts prefix, repeats whole blocks, and charges equal active/control demand', async () => {
  const trace = writerFixture().traces[0];
  const [template] = trace.frames;
  const demand = { publish: template.writes.length, query: 1 };
  const invocations: [number, number, string, boolean][] = [];
  const report = await scratchSchedule(
    7,
    async ({ start, length, group, active, repeats, pad }) => {
      invocations.push([start, length, group, active]);
      return { units: demand[group] * length * repeats, ms: pad + 1, consumed: 1 };
    },
    5,
  );
  assert.equal(report.batches.length, 2);
  assert.deepEqual(report.blocks, [
    { start: 0, length: 5, repeats: 1, pad: 0 },
    { start: 5, length: 2, repeats: 2, pad: 1 },
  ]);
  assert.deepEqual(
    invocations.slice(0, 16).map(([, , group, active]) => [group, active]),
    [
      ['publish', true],
      ['publish', false],
      ['query', true],
      ['query', false],
      ['publish', true],
      ['publish', false],
      ['query', true],
      ['query', false],
      ['publish', false],
      ['publish', true],
      ['query', false],
      ['query', true],
      ['publish', true],
      ['publish', false],
      ['query', true],
      ['query', false],
    ],
  );
  assert.equal(report.batches[1][2].publish.active.units, demand.publish * 4);

  for (const group of ['publish', 'query'] as const)
    for (const active of [true, false]) {
      let calls = 0;
      const pass = scratchPass(
        trace,
        { start: 0, length: 1, group, active, repeats: 1, pad: 4 },
        () => ++calls,
      );
      pass.frame(template);
      assert.equal(pass.result().units, demand[group]);
      assert.equal(calls, 2);
    }
});

test('seed, authored write, native sample and checkpoint leave a same-render cached child unchanged', () => {
  function run(record: boolean) {
    const engine = new NullEngine();
    try {
      const scene = new Scene(engine);
      const root = new TransformNode('moving parent', scene);
      const branch = new TransformNode('nested parent', scene);
      branch.parent = root;
      const child = CreateBox('native child', {}, scene);
      child.parent = branch;
      child.computeWorldMatrix(true);
      child.getBoundingInfo();
      const recorder =
        record &&
        captureWriters(scene, {
          runId: 'neutral',
          kind: 'idle',
          provenance: 'software',
        });
      if (recorder) recorder.begin(0, 0);
      writerDiagnostic('pose', root, () => {
        root.position.x = 9;
      });
      if (record) pose(child);
      if (recorder) recorder.checkpoint();
      const cached = child.computeWorldMatrix().m[12];
      const dirty = child.position._isDirty;
      scene.incrementRenderId();
      const natural = child.computeWorldMatrix().m[12];
      if (recorder) recorder.close();
      return { cached, dirty, natural };
    } finally {
      engine.dispose();
    }
  }
  const control = run(false);
  assert.equal(control.cached, 0);
  assert.deepEqual(run(true), control);
});

test('a dirty lazy box is indexed from its published matrix, not swept from the origin', () => {
  const engine = new NullEngine();
  try {
    const scene = new Scene(engine);
    const mesh = CreateBox('collision proxy', {}, scene);
    mesh.isVisible = mesh.isPickable = false;
    mesh.getBoundingInfo();
    mesh.position.set(-50, 0, 28);
    mesh.computeWorldMatrix(true);
    const capture = captureWriters(scene, {
      runId: 'dirty-box',
      kind: 'idle',
      provenance: 'software',
    });
    capture.begin(0, 0);
    assert.deepEqual(capture.trace.seed[0].world, [-0.5, -0.5, -0.5, 0.5, 0.5, 0.5]);
    assert.deepEqual(pose(mesh).bounds, [-50.5, 27.5, -49.5, 28.5]);
    assert.equal(cachedBounds(mesh).dirty, true);
    capture.phase('fixed', 1);
    writerDiagnostic('physics', mesh, () => {
      mesh.position.x -= 0.25;
    });
    // A lazy read publishes the old matrix's bounds, not the new authored pose.
    mesh.getBoundingInfo();
    mesh.computeWorldMatrix(true);
    capture.checkpoint();
    capture.phase('presentation', 1);
    capture.checkpoint();
    capture.phase('render', 1);
    mesh.getBoundingInfo();
    capture.checkpoint();
    capture.end(1);
    capture.close();
    const {
      frames: [frame],
      gaps,
    } = reconcileWriters(capture.trace);
    assert.deepEqual(gaps, []);
    const [move, lazy] = frame.writes;
    assert.deepEqual(move.bounds, [-50.75, 27.5, -49.75, 28.5]);
    assert.deepEqual(
      [move.old, move.next, move.crossed],
      [['-13:6', '-13:7'], ['-13:6', '-13:7'], []],
    );
    assert.deepEqual(lazy.bounds, move.bounds);
  } finally {
    engine.dispose();
  }
});

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
    capture.phase('presentation', 1);
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
    [4, -1, 6, 1], // the newly published matrix, before the lazy bounds cache refresh
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

test('an authored out-and-back is priced from both detached endpoints, not cached no-ops', () => {
  const engine = new NullEngine();
  try {
    const scene = new Scene(engine);
    const parent = new TransformNode('parent', scene);
    const child = CreateBox('child', {}, scene);
    child.parent = parent;
    child.computeWorldMatrix(true);
    const capture = captureWriters(scene, {
      runId: 'cached',
      provenance: 'software',
      kind: 'idle',
    });
    capture.begin(0, 0);
    capture.phase('fixed', 1);
    for (const x of [10, 0, 262, 0])
      writerDiagnostic('door', parent, () => {
        parent.position.x = x;
      });
    capture.checkpoint();
    capture.phase('presentation', 1);
    capture.checkpoint();
    capture.phase('render', 1);
    capture.checkpoint();
    capture.end(1);
    capture.close();
    const {
      frames: [frame],
      gaps,
    } = reconcileWriters(capture.trace);
    assert.deepEqual(
      frame.writes.slice(0, 2).map((w) => w.bounds),
      [
        [9.5, -0.5, 10.5, 0.5],
        [-0.5, -0.5, 0.5, 0.5],
      ],
    );
    assert.ok(frame.writes.slice(0, 2).every((w) => w.crossed?.length === 2));
    assert.equal(frame.demand.publish, null);
    assert.equal(gaps.length, 2);
    assert.ok(
      frame.writes
        .slice(2)
        .every(
          (w) =>
            w.sweepGap === 'sweep exceeds 64-cell limit' && w.diff === null && w.crossed === null,
        ),
    );
    assert.equal(child.worldMatrixFromCache.m[12], 0);
  } finally {
    engine.dispose();
  }
});

test('an ordinary natural publication cannot stand in for a missing authored site', () => {
  const trace = oversizedWriterTrace('omitted');
  const frame = trace.frames[0];
  // Keep all actual native cache evidence and cursor boundaries, but remove the source provenance.
  frame.writes[0].kind = 'world';
  const result = reconcileWriters(trace);
  assert.match(result.gaps.join(), /missing source.*long move.*authored/);
});

test('a valid native scene and sequence do not excuse a missing, duplicate or wrong-phase seam', () => {
  for (const corrupt of [
    (trace: ReturnType<typeof writerFixture>['traces'][number]) => {
      trace.frames[0].checks.splice(-2, 1);
    },
    (trace: ReturnType<typeof writerFixture>['traces'][number]) => {
      trace.frames[0].checks.push(trace.frames[0].checks.at(-1)!);
    },
    (trace: ReturnType<typeof writerFixture>['traces'][number]) => {
      trace.frames[0].checks.at(-1)!.tick--;
    },
    (trace: ReturnType<typeof writerFixture>['traces'][number]) => {
      const frame = trace.frames[0];
      const late = frame.writes[frame.checks[1].at - 1];
      assert.equal(late.phase, 'fixed');
      assert.equal(late.kind, 'dispose');
      // Use the scene from before the disposal so the fixed snapshot itself still matches.
      const fixed = frame.checks[1];
      fixed.at--;
      fixed.scene.push(late.before!);
    },
  ]) {
    const idle = writerFixture().traces[2];
    corrupt(idle);
    assert.match(reconcileWriters(idle).gaps.join(), /checkpoint/);
  }
  const [shrine] = writerFixture().traces;
  shrine.frames[0].checks.find((c) => c.phase === 'pick')!.scene.reverse();
  assert.match(reconcileWriters(shrine).gaps.join(), /scene order/);
});

test('moving-camera billboard lineage preserves native caches, matrix, and hit in all observation modes', () => {
  function run(mode: 'none' | 'sample' | 'full') {
    const engine = new NullEngine();
    try {
      const scene = new Scene(engine);
      const camera = new FreeCamera('camera', new Vector3(0, 0, -12), scene);
      camera.setTarget(Vector3.Zero());
      scene.activeCamera = camera;
      const parent = new TransformNode('billboard', scene);
      parent.billboardMode = TransformNode.BILLBOARDMODE_ALL;
      const branch = new TransformNode('billboard branch', scene);
      branch.parent = parent;
      const child = CreateBox('billboard child', { width: 3, depth: 0.2 }, scene);
      child.parent = branch;
      const initial = Array.from(child.computeWorldMatrix(true).m);
      child.getBoundingInfo();
      const capture =
        mode === 'full'
          ? captureWriters(scene, {
              runId: 'billboard',
              provenance: 'software',
              kind: 'idle',
            })
          : null;
      capture?.begin(0, 0);
      camera.position.set(10, 4, -6);
      camera.setTarget(Vector3.Zero());
      capture?.phase('fixed', 1);
      writerDiagnostic('pose', parent, () => {
        parent.position.y = 0.75;
      });
      const state = () => ({
        world: Array.from(child.worldMatrixFromCache.m),
        matrixVersion: child.worldMatrixFromCache.updateFlag,
        renderId: child._currentRenderId,
        childDirty: child.position._isDirty,
        parentDirty: parent.position._isDirty,
        boundsDirty: cachedBounds(child).dirty,
        bounds: cachedBounds(child).info!.boundingBox.minimumWorld.asArray(),
      });
      const before = state();
      if (mode !== 'none') assert.equal(pose(child).bounds, null);
      capture?.checkpoint();
      capture?.phase('presentation', 1);
      capture?.checkpoint();
      assert.deepEqual(state(), before);
      assert.deepEqual(before.world, initial);
      capture?.phase('render', 1);
      scene.incrementRenderId();
      camera.getViewMatrix();
      const world = Array.from(child.computeWorldMatrix(true).m);
      const ray = new Ray(
        camera.position.clone(),
        new Vector3(0, 0.75, 0).subtract(camera.position).normalize(),
        30,
      );
      const hit = scene.pickWithRay(ray);
      assert.ok(hit?.hit && hit.pickedMesh === child);
      capture?.checkpoint();
      capture?.end(1);
      if (capture) {
        assert.ok(capture.trace.seed[0].input.fallback);
        assert.deepEqual(reconcileWriters(capture.trace).gaps, []);
        capture.close();
      }
      assert.notDeepEqual(world.slice(0, 12), initial.slice(0, 12));
      const { matrixVersion: _version, ...native } = state();
      return { state: native, world, distance: hit.distance, point: hit.pickedPoint!.asArray() };
    } finally {
      engine.dispose();
    }
  }
  const unobserved = run('none');
  assert.deepEqual(run('sample'), unobserved);
  assert.deepEqual(run('full'), unobserved);
});
