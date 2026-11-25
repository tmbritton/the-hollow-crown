import assert from 'node:assert/strict';
import test from 'node:test';
import { createReferenceFixture, measureScaling, sameHit } from './cursor-reference.ts';
import { scalingTiming, validateScaling } from './cursor-scaling-policy.ts';
import type { Hit } from './cursor-evidence.ts';

test('exhaustive picks pin the shrine aperture, cover, translated instance and tie rules', () => {
  const fixture = createReferenceFixture(0);
  const expect = (expected: Hit) => {
    const { hit } = fixture.sample();
    assert.ok(sameHit(hit, expected), JSON.stringify({ hit, expected }));
  };
  try {
    fixture.batch.setEnabled(false);
    expect({ kind: 'object', id: 'shrine', mesh: 'shrine-back', instance: -1, distance: 7.5 });
    fixture.writeDoor(true);
    expect({ kind: 'floor', mesh: 'door', instance: -1, distance: 2.5 });
    fixture.writeDoor(false);
    fixture.batch.setEnabled(true);
    expect({ kind: 'object', id: 'shrine', mesh: 'shrine-batch', instance: 1, distance: 5.5 });
    fixture.batch.setEnabled(false);
    fixture.equalOwner.setEnabled(true);
    expect({ kind: 'object', id: 'shrine', mesh: 'shrine-back', instance: -1, distance: 7.5 });
    fixture.proxy.position.set(8.00009, 1, 0);
    expect({ kind: 'enemy', id: 'guard', mesh: 'proxy', instance: -1, distance: 7.50009 });
    fixture.proxy.position.x = 8.0002;
    expect({ kind: 'object', id: 'shrine', mesh: 'shrine-back', instance: -1, distance: 7.5 });
  } finally {
    fixture.dispose();
  }
});

test('scaling guard rejects matching wrong hits/writes, wrong work, order and absent timing', () => {
  let now = 0;
  const measured = measureScaling(() => ++now);
  assert.equal(validateScaling(measured), null);
  for (const corrupt of [
    (r: typeof measured) => {
      for (const v of r.pairs[0]) v.samples[0].hit = { kind: 'floor' };
    },
    (r: typeof measured) => {
      for (const v of r.pairs[0]) v.samples[0].write = 0;
    },
    (r: typeof measured) => {
      r.pairs[0][1].samples[0].work.meshExact--;
    },
    (r: typeof measured) => {
      r.pairs[1].reverse();
    },
    (r: typeof measured) => {
      r.pairs[2][0].samples.pop();
    },
    (r: typeof measured) => {
      r.pairs[0][0].ownerBuildMs = NaN;
    },
    (r: typeof measured) => {
      r.pairs[0][0].meanMs = 0;
    },
  ]) {
    const broken = structuredClone(measured);
    corrupt(broken);
    assert.notEqual(validateScaling(broken), null);
  }
  assert.notEqual(validateScaling(measureScaling(() => 0)), null);
});

test('serialized scaling reference passes with both exposed shrine and blocked floor hits', () => {
  let now = 0;
  const report: ReturnType<typeof measureScaling> = JSON.parse(
    JSON.stringify(measureScaling(() => ++now)),
  );
  const visit = report.pairs[2][1];
  assert.equal(visit.samples[238].hit.kind, 'object');
  assert.equal(visit.samples[239].hit.kind, 'floor');
  assert.equal(validateScaling(report), null);

  visit.samples[239].ms = 0;
  Object.assign(visit, scalingTiming(visit.samples.map((sample) => sample.ms)));
  assert.equal(validateScaling(report), null);
});

for (const field of ['meanMs', 'p95Ms'] as const) {
  test(`scaling guard rejects a positive but inconsistent ${field} in the final visit`, () => {
    let now = 0;
    const report: ReturnType<typeof measureScaling> = JSON.parse(
      JSON.stringify(measureScaling(() => ++now)),
    );
    report.pairs[2][1][field] += 1;
    assert.match(validateScaling(report) ?? '', /inconsistent scaling timings in 2\/1/);
  });
}

test('three fresh pairs retain local hits and writes but grow exhaustive work', () => {
  const report = measureScaling(() => 0);
  assert.deepEqual(
    report.pairs.map((pair) => pair.map((visit) => visit.rooms)),
    [
      [0, 10],
      [10, 0],
      [0, 10],
    ],
  );
  for (const pair of report.pairs) {
    const local = pair.find((visit) => visit.rooms === 0)!;
    const remote = pair.find((visit) => visit.rooms === 10)!;
    assert.equal(local.samples.length, 240);
    assert.deepEqual(
      remote.samples.map((row) => [row.write, row.hit]),
      local.samples.map((row) => [row.write, row.hit]),
    );
    for (const [i, row] of local.samples.entries()) {
      const distant = remote.samples[i].work;
      assert.equal(row.write, i % 2 === 0 ? 4 : 0);
      assert.equal(row.hit.kind, i % 2 === 0 ? 'object' : 'floor');
      assert.equal(row.work.instanceExact, 2);
      assert.equal(distant.instanceExact, row.work.instanceExact);
      assert.equal(distant.visits - row.work.visits, 210);
      assert.equal(distant.syncs - row.work.syncs, 10);
      assert.equal(distant.meshExact - row.work.meshExact, 70);
      assert.equal(distant.batchBounds - row.work.batchBounds, 10);
    }
  }
});
