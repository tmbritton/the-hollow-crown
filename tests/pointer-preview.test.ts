import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointerFeedback } from '../src/pointerPreview.ts';

test('cursor, enemy ring and object outline share one mutually exclusive pick', () => {
  assert.deepEqual(pointerFeedback(null), { kind: 'inactive' });
  assert.deepEqual(pointerFeedback({ kind: 'floor' }), { kind: 'hand' });
  assert.deepEqual(pointerFeedback({ kind: 'enemy', id: 'foe' }), { kind: 'sword', id: 'foe' });
  assert.deepEqual(pointerFeedback({ kind: 'object', id: 'door', usable: true }), {
    kind: 'outline',
    id: 'door',
  });
  assert.deepEqual(pointerFeedback({ kind: 'object', id: 'door', usable: false }), {
    kind: 'hand',
  });
});
