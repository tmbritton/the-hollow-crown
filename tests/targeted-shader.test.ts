import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { selectWork, createPreparation } from '../src/targetedShader.ts';
import { signatures } from '../src/targetedShaderSignatures.ts';

test('shipping keeps the 21 measured signatures, exact defines and request order', () => {
  assert.equal(signatures.length, 21);
  assert.equal(
    createHash('sha256').update(JSON.stringify(signatures)).digest('hex'),
    '10031bb029a70f1a94f3cace6a7261c2bb150aeee7a2456d883df77e3b0a1506',
  );
});

test('deduplicate by exact draw identity, omit ready keys and exclude Low shadow', () => {
  const base = {
    pass: 'camera',
    key: 'custom@full defines',
    layout: 'positions/colors',
    compile: () => {},
  } as const;
  const layout = { ...base, layout: 'positions' };
  const shadow = { ...base, key: 'shadow@defines', pass: 'shadow' } as const;
  const present = { ...base, key: 'ready' };
  const rows = [base, base, layout, shadow, present];
  assert.deepEqual(selectWork(rows, 'low', new Set(['ready'])), [base, layout]);
  assert.deepEqual(selectWork(rows, 'high', new Set(['ready'])), [base, layout, shadow]);
  assert.deepEqual(selectWork([], 'high', new Set()), []);
});

test('current empty, failure, timeout and quality replacement are generation-owned', () => {
  const effects: string[] = [];
  const lifecycle = createPreparation({
    compile: (revision) => effects.push(`compile ${revision}`),
    cancel: (revision) => effects.push(`cancel ${revision}`),
    ready: (revision) => effects.push(`ready ${revision}`),
    fail: (revision, reason) => effects.push(`fail ${revision}: ${reason}`),
  });
  assert.equal(lifecycle.send({ type: 'complete', revision: 1 }), false);
  assert.equal(lifecycle.send({ type: 'begin', revision: 1, empty: false }), true);
  assert.equal(lifecycle.send({ type: 'begin', revision: 1, empty: false }), false);
  assert.equal(lifecycle.send({ type: 'begin', revision: 2, empty: true }), true);
  assert.equal(lifecycle.send({ type: 'complete', revision: 1 }), false);
  assert.equal(lifecycle.send({ type: 'complete', revision: 2 }), false);
  assert.equal(lifecycle.send({ type: 'begin', revision: 3, empty: false }), true);
  assert.equal(lifecycle.send({ type: 'failed', revision: 3, reason: 'shader error' }), true);
  assert.equal(lifecycle.send({ type: 'begin', revision: 4, empty: false }), true);
  assert.equal(lifecycle.send({ type: 'failed', revision: 4, reason: 'timeout' }), true);
  assert.equal(lifecycle.send({ type: 'begin', revision: 5, empty: false }), true);
  assert.equal(lifecycle.send({ type: 'complete', revision: 5 }), true);
  assert.equal(lifecycle.send({ type: 'begin', revision: 6, empty: false }), true);
  assert.equal(lifecycle.send({ type: 'retire', revision: 6 }), true);
  assert.equal(lifecycle.send({ type: 'begin', revision: 7, empty: true }), false);
  assert.deepEqual(effects, [
    'compile 1',
    'cancel 1',
    'ready 2',
    'compile 3',
    'cancel 3',
    'fail 3: shader error',
    'compile 4',
    'cancel 4',
    'fail 4: timeout',
    'compile 5',
    'ready 5',
    'compile 6',
    'cancel 6',
  ]);
});

test('invalid terminal events never release control or cancel the current revision', () => {
  const calls: string[] = [];
  const owner = createPreparation({
    compile: () => calls.push('compile'),
    cancel: () => calls.push('cancel'),
    ready: () => calls.push('ready'),
    fail: () => calls.push('fail'),
  });
  assert.equal(owner.send({ type: 'failed', revision: 0, reason: 'idle' }), false);
  owner.send({ type: 'begin', revision: 1, empty: false });
  assert.equal(owner.send({ type: 'retire', revision: 2 }), false);
  assert.equal(owner.send({ type: 'failed', revision: 0, reason: 'stale' }), false);
  owner.send({ type: 'failed', revision: 1, reason: 'context lost' });
  assert.equal(owner.send({ type: 'complete', revision: 1 }), false);
  assert.equal(owner.send({ type: 'failed', revision: 1, reason: 'duplicate' }), false);
  assert.equal(owner.send({ type: 'retire', revision: 1 }), true);
  assert.equal(owner.send({ type: 'retire', revision: 1 }), false);
  assert.deepEqual(calls, ['compile', 'cancel', 'fail']);
});
