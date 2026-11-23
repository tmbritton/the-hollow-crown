import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearanceBox, overlaps, setClearanceBox } from '../src/rigs/tailClearance.ts';

test('tail clearance separates sheared boxes despite overlapping broad-phase bounds', () => {
  // The long axis is (1, 0, 1); the short axis (0, 0, 1) is not perpendicular to it.
  const box = (x: number, z: number, oriented = true) => {
    const bounds = clearanceBox(true);
    setClearanceBox(
      bounds,
      [1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1],
      0,
      [0, 0, 0],
      [2, 1, 0.25],
    );
    return oriented ? bounds : { ...bounds, corners: undefined };
  };
  const a = box(0, 0);
  for (const [z, intersects] of [
    [0.125, true],
    [0.25, false],
    [0.5, false],
  ] as const) {
    const b = box(0, z);
    assert.ok(overlaps(a, box(0, z, false)), 'bounds alone cannot classify this pair');
    assert.equal(overlaps(a, b), intersects);
    assert.equal(overlaps(b, a), intersects);
  }
});
