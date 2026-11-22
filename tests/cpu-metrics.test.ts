import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CpuMetrics,
  distribution,
  fingerprint,
  patchMethod,
  rendererKind,
} from '../src/cpuMetrics.ts';

test('CPU distributions are finite, detached and explicitly bounded', () => {
  assert.deepEqual(distribution([3, 1, 2, 4]), { count: 4, mean: 2.5, p50: 2, p95: 4, max: 4 });
  assert.deepEqual(distribution([]), { count: 0, mean: 0, p50: 0, p95: 0, max: 0 });
  assert.throws(() => distribution([NaN]), /finite/);
  let now = 0;
  const m = new CpuMetrics(() => now, 2);
  m.begin(1);
  m.measure('outer', () => {
    now++;
    m.measure('inner', () => {
      now += 2;
    });
    now++;
  });
  m.count('work', 3);
  m.end();
  const report = m.snapshot();
  assert.equal(report.samples[0].ms.outer, 4);
  assert.equal(report.samples[0].ms.inner, 2);
  assert.equal(report.samples[0].counts.work, 3);
  report.samples[0].counts.work = 999;
  assert.equal(m.snapshot().samples[0].counts.work, 3);
  m.begin(2);
  m.end();
  assert.throws(() => m.begin(3), /budget/);
});

test('hardware evidence rejects software fallbacks and generic renderer strings', () => {
  assert.equal(rendererKind('ANGLE (AMD Radeon RX 580)'), 'hardware');
  assert.equal(rendererKind('ANGLE (Google, Vulkan SwiftShader Device)', 'AMD'), 'software');
  assert.equal(rendererKind('llvmpipe (LLVM 20.1)'), 'software');
  assert.equal(rendererKind('WebKit WebGL', 'WebKit'), 'unknown');
});

test('instrumentation restores methods exactly, including exceptions and inherited methods', () => {
  class Fixture {
    run(x: number) {
      if (x < 0) throw new Error('expected');
      return x + 1;
    }
  }
  const a = new Fixture(),
    m = new CpuMetrics();
  const restore = patchMethod(
    a,
    'run',
    (original) =>
      function (x) {
        return m.measure('fixture', () => original.call(this, x));
      },
  );
  assert.equal(a.run(2), 3);
  assert.throws(() => a.run(-1), /expected/);
  restore();
  restore();
  assert.equal(Object.hasOwn(a, 'run'), false);
  assert.equal(a.run, Fixture.prototype.run);
  m.begin(1);
  assert.throws(
    () =>
      m.measure('throws', () => {
        throw new Error('probe');
      }),
    /probe/,
  );
  m.end();
  assert.equal(m.snapshot().samples[0].counts['calls.throws'], 1);
});

test('route phases account for early returns and retain only bounded slow-request details', () => {
  let now = 0;
  const m = new CpuMetrics(() => now);
  m.captureRequest = 0;
  m.begin(10);
  for (let id = 0; id < 40; id++) {
    m.startRoute({
      id,
      actor: 'player',
      from: { x: 0, z: 0 },
      to: { x: 2, z: 0 },
      reason: 'floor',
    });
    m.phase('search');
    m.count('route.expanded', id);
    now += id;
    m.phase('smoothing');
    now++;
    m.finishRoute({ accepted: true });
  }
  m.end();
  const r = m.snapshot();
  assert.equal(r.routes.length, 8);
  assert.equal(r.replay?.input.id, 0, 'a pinned request survives top-eight timing selection');
  assert.equal(r.routes[0].input.id, 39);
  assert.equal(r.routes[0].phases.search, 39);
  assert.equal(r.routes[0].phases.smoothing, 1);
  assert.equal(r.samples[0].counts['route.requests'], 40);
  assert.equal(r.routes[0].counts['route.expanded'], 39);
  assert.equal(fingerprint({ x: 1, nested: [2, 3] }), fingerprint({ x: 1, nested: [2, 3] }));
  assert.notEqual(fingerprint({ x: 1 }), fingerprint({ x: 2 }));
});

test('diagnostic metadata reads do not count as application work, including nested/throwing reads', () => {
  const m = new CpuMetrics();
  m.begin(1);
  m.count('reads');
  assert.throws(
    () =>
      m.inspect(() =>
        m.inspect(() => {
          m.count('reads', 10);
          m.measure('metadata', () => {
            throw new Error('metadata');
          });
        }),
      ),
    /metadata/,
  );
  m.count('reads');
  m.end();
  assert.equal(m.snapshot().samples[0].counts.reads, 2);
  assert.equal(m.snapshot().samples[0].ms.metadata, undefined);
});
