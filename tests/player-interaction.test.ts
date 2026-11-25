import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideUse, idleUse, transitionUse } from '../src/playerInteraction.ts';

test('exact pending operation can approach, execute in reach, or be rejected when stale', () => {
  assert.equal(decideUse('open', 'open', false), 'approach');
  assert.equal(decideUse('open', 'open', true), 'use');
  assert.equal(decideUse('open', 'close', true), 'reject');
  assert.equal(decideUse('recover', null, true), 'reject');
});

test('approach requests one candidate at a time and consumes the exact command before use', () => {
  const ref = { id: 'door-a', operation: 'open' } as const;
  const point = { x: 1, z: 2, h: 0 };
  const start = transitionUse(idleUse, { type: 'select', ref, candidates: [point] });
  const active = transitionUse(start.state, {
    type: 'check',
    result: 'approach',
    travelling: false,
  });
  assert.deepEqual(active.effect, { type: 'route', point });
  assert.deepEqual(
    transitionUse(active.state, { type: 'check', result: 'approach', travelling: true }),
    { state: active.state },
  );
  const arrived = transitionUse(active.state, { type: 'check', result: 'use', travelling: true });
  assert.deepEqual(arrived, { state: idleUse, effect: { type: 'execute', ref } });
  assert.deepEqual(
    transitionUse(arrived.state, { type: 'check', result: 'use', travelling: false }),
    { state: idleUse },
  );
  assert.deepEqual(
    transitionUse(active.state, { type: 'check', result: 'reject', travelling: true }),
    { state: idleUse, effect: { type: 'stop' } },
  );
  assert.deepEqual(
    transitionUse(active.state, { type: 'check', result: 'approach', travelling: false }),
    { state: idleUse },
  );
  assert.deepEqual(transitionUse(active.state, { type: 'cancel' }), { state: idleUse });
});
