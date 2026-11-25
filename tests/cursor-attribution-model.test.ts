import assert from 'node:assert/strict';
import test from 'node:test';
import {
  offlineList,
  publishDemand,
  validateWindow,
  offRayCredit,
  createOccupancy,
} from './cursor-attribution-model.ts';

test('populated walk reads empty cells, corner neighbors, duplicate entries and fallback', () => {
  const occupants = [
    { id: 0, bounds: [1, 1, 5, 2] as const },
    { id: 1, bounds: [5, 1, 6, 2] as const },
    { id: 2, bounds: [13, 13, 14, 14] as const },
    { id: 3, bounds: null },
    { id: 4, bounds: [-200, 50, 200, 60] as const },
  ];
  const ray = { x: 1, z: 1, dx: 1, dz: 1, length: 13 };
  const result = createOccupancy(occupants).walk(ray);
  assert.deepEqual(result.ids, [0, 1, 2, 3, 4]);
  assert.deepEqual(result.ids, offlineList(occupants, ray).ids);
  assert.deepEqual(result.entries, [3, 4, 0, 0, 1, 2]);
  assert.deepEqual(result.reads, { empty: 7, occupied: 3, entries: 6, duplicates: 1 });
});

test('occupancy copy preserves the full walk after bucket and fallback reinsertion', () => {
  const spanning = [1, 1, 5, 2] as const;
  const first = [1, 1, 2, 2] as const;
  const index = createOccupancy([
    { id: 0, bounds: spanning },
    { id: 1, bounds: first },
    { id: 2, bounds: [5, 1, 6, 2] },
    { id: 3, bounds: null },
    { id: 4, bounds: null },
    { id: 5, bounds: [13, 1, 14, 2] },
  ]);
  index.publish(0, null);
  index.publish(0, spanning);
  index.publish(3, first);
  index.publish(3, null);
  index.publish(5, undefined);

  const ray = { x: 1, z: 1, dx: 1, dz: 0, length: 13 };
  const walk = index.walk(ray);
  assert.deepEqual(walk, {
    ids: [0, 1, 2, 3, 4],
    entries: [4, 3, 1, 0, 2, 0],
    tiles: [
      [0, 0],
      [1, 0],
    ],
    reads: { empty: 2, occupied: 2, entries: 6, duplicates: 1 },
  });

  const copy = index.copy();
  assert.deepEqual(copy.walk(ray), walk);
  index.publish(0, undefined);
  index.publish(3, undefined);
  assert.deepEqual(copy.walk(ray), walk);
});

test('extreme coordinates stay conservative instead of creating non-advancing cell loops', () => {
  const occupants = [{ id: 0, bounds: [1e30, 1, 1e30, 2] as const }];
  assert.deepEqual(
    createOccupancy(occupants).walk({ x: 0, z: 0, dx: 1, dz: 1, length: 1 }).ids,
    [0],
  );
});

test('offline tiles include boundary, uncertain and oversized occupants in scene order', () => {
  const occupants = [
    { id: 0, bounds: [1, 12, 2, 13] as const },
    { id: 1, bounds: null },
    { id: 2, bounds: [5, 4, 6, 5] as const },
    { id: 3, bounds: [-200, 50, 200, 60] as const },
    { id: 4, bounds: [-8, 3, -7, 4] as const },
  ];
  const local = offlineList(occupants, { x: 0, z: 4, dx: 1, dz: 0, length: 8 });
  assert.deepEqual(local.ids, [1, 2, 3]);
  assert.ok(local.tiles.length > 0);
  assert.ok(local.entries.length >= local.ids.length);
});

test('writer demand charges unchanged checks, crossed, retired and new memberships', () => {
  const first = [
    { id: 0, bounds: [1, 1, 2, 2] as const },
    { id: 1, bounds: null },
  ];
  const next = [
    { id: 0, bounds: [9, 1, 10, 2] as const },
    { id: 2, bounds: null },
  ];
  assert.deepEqual(publishDemand(first, next).rates, {
    bounds: 3,
    diff: 5,
    remove: 2,
    insert: 2,
    invalidate: 3,
  });
  assert.equal(publishDemand(first, first).rates.bounds, 2);
  assert.equal(publishDemand(first, first).rates.remove, 0);
});

test('publication and snapshot demand both flag unenumerable sweeps without losing endpoint changes', () => {
  const point = (x: number) => [x, 2, x, 2] as const;
  for (const [from, to, old, next, reason] of [
    [2, 262, '0:0', '65:0', 'sweep exceeds 64-cell limit'],
    [2, 258, '0:0', '64:0', 'sweep exceeds 64-cell limit'],
    [262, 2, '65:0', '0:0', 'sweep exceeds 64-cell limit'],
    [2, 1e30, '0:0', 'fallback', 'unsafe sweep tile coordinates'],
  ] as const) {
    const before = [{ id: 7, bounds: point(from) }];
    const after = [{ id: 7, bounds: point(to) }];
    const index = createOccupancy(before);
    const delta = index.publish(7, after[0].bounds);
    assert.deepEqual([delta.old, delta.next, delta.remove, delta.insert], [[old], [next], 1, 1]);
    assert.deepEqual([delta.sweepGap, delta.crossed, delta.diff], [reason, null, null]);
    assert.deepEqual(index.members(7), [next]);
    assert.deepEqual(
      index.representation().filter(([, ids]) => ids.length),
      [[next, [7]]],
    );
    const snapshot = publishDemand(before, after);
    assert.deepEqual(snapshot.gaps, [{ id: 7, reason }]);
    assert.deepEqual(snapshot.rates, {
      bounds: 1,
      diff: null,
      remove: 1,
      insert: 1,
      invalidate: 1,
    });
  }
});

test('the exact sweep cap, adjacent movement and lifecycle changes retain exact counts', () => {
  const before = [{ id: 7, bounds: [2, 2, 2, 2] as const }];
  for (const [x, crossed] of [
    [254, Array.from({ length: 62 }, (_, i) => `${i + 1}:0`)],
    [6, []],
  ] as const) {
    const next = [x, 2, x, 2] as const;
    const delta = createOccupancy(before).publish(7, next);
    assert.deepEqual(
      [delta.sweepGap, delta.crossed, delta.diff],
      [null, crossed, crossed.length + 2],
    );
    const snapshot = publishDemand(before, [{ id: 7, bounds: next }]);
    assert.deepEqual([snapshot.gaps, snapshot.rates.diff], [[], crossed.length + 2]);
  }
  const bounds = [2, 2, 262, 2] as const;
  const index = createOccupancy([]);
  for (const endpoint of [bounds, undefined]) {
    const delta = index.publish(7, endpoint);
    assert.deepEqual([delta.sweepGap, delta.crossed, delta.diff], [null, [], 1]);
  }
  assert.deepEqual(publishDemand([{ id: 7, bounds }], [{ id: 7, bounds }]).gaps, []);
});

test('native windows must cross both edges without gaps or unexpected target/cues', () => {
  const row = (from: number, to: number) => ({ from, to, ticks: to - from, valid: true });
  assert.equal(validateWindow([row(2, 4), row(4, 4), row(4, 7)], [3, 6]), null);
  assert.match(validateWindow([row(2, 4), row(5, 7)], [3, 6])!, /gap/);
  assert.match(validateWindow([row(2, 4)], [3, 6])!, /window/);
  assert.match(validateWindow([row(2, 4), { ...row(4, 7), valid: false }], [3, 6])!, /target/);
});

test('exclusive off-ray credit leaves ambiguous work uncredited, and rejects missing measurements', () => {
  const calibrated = { native: 10, exhaustive: 9.5, local: 4, offRay: 7, empty: 2 };
  assert.equal(offRayCredit(calibrated), 4.5);
  assert.throws(() => offRayCredit({ ...calibrated, offRay: NaN }), /missing/);
  assert.throws(() => offRayCredit({ ...calibrated, exhaustive: 8 }), /calibration/);
});
