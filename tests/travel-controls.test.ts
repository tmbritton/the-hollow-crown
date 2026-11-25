import { test } from 'node:test';
import assert from 'node:assert/strict';
import { travelControl, initialTravelControl } from '../src/travelControls.ts';

test('fresh R toggles gait; duplicate and repeat input cannot toggle, including after cancellation', () => {
  const down = { type: 'down', repeat: false } as const;
  const running = travelControl(initialTravelControl, down);
  assert.equal(running.gait, 'run');
  assert.equal(travelControl(running, down), running);
  const released = travelControl(running, { type: 'up' });
  assert.equal(travelControl(released, down).gait, 'walk');
  const cancelled = travelControl(running, { type: 'cancel' });
  assert.equal(cancelled.gait, 'walk');
  assert.equal(travelControl(cancelled, { type: 'down', repeat: true }), cancelled);
  assert.equal(travelControl(cancelled, down), cancelled);
  assert.equal(travelControl(travelControl(cancelled, { type: 'up' }), down).gait, 'run');
});

test('input loss restores walk and releases R even when its keyup goes elsewhere', () => {
  const down = { type: 'down', repeat: false } as const;
  const lost = { type: 'input-lost' } as const;
  for (const gait of ['walk', 'run'] as const) {
    for (const key of ['held', 'released'] as const) {
      const reset = travelControl({ gait, key }, lost);
      assert.deepEqual(reset, initialTravelControl);
      assert.deepEqual(travelControl(reset, lost), reset);
      assert.deepEqual(travelControl(reset, { type: 'down', repeat: true }), reset);
      assert.deepEqual(travelControl(reset, down), { gait: 'run', key: 'held' });
    }
  }
});
