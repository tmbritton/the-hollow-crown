import assert from 'node:assert/strict';
import test from 'node:test';
import {
  offlineList,
  publishDemand,
  validateWindow,
  offRayCredit,
} from './cursor-attribution-model.ts';

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
