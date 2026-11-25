import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doorRetreat } from '../src/doorEscape.ts';

test('closed threshold overlap permits only an outward retreat on the same side', () => {
  for (const axis of ['x', 'z'] as const) {
    const door = { axis, x: 0, z: 0 };
    for (const side of [-1, 1] as const) {
      const from = { x: 0, z: 0, [axis]: side * 0.05 };
      const out = { ...from, [axis]: side * 0.14 };
      assert.ok(doorRetreat(door, from, out, -side));
      assert.ok(!doorRetreat(door, from, { ...from, [axis]: -side * 0.14 }, side));
      assert.ok(!doorRetreat(door, from, from, side));
      assert.ok(doorRetreat(door, { x: 0, z: 0 }, out, side));
      assert.ok(!doorRetreat(door, { x: 0, z: 0 }, out, -side));
    }
  }
});
