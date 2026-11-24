import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acceptsGenerationReady, sessionMachine } from '../src/machines/ui/session.ts';
import { Statechart } from '../src/machines/statechart.ts';

test('failed loads cannot become ready and only the current publication may complete a retry', () => {
  const ui = new Statechart(sessionMachine);
  const old = {};
  const retry = {};
  for (let i = 0; i < 2; i++) {
    ui.send({ type: 'FAIL' });
    for (const token of [old, retry])
      assert.equal(
        acceptsGenerationReady(ui.snapshot.matches({ mode: 'loading' }), null, token),
        false,
      );
    ui.send({ type: 'READY' });
    assert.ok(ui.snapshot.matches({ mode: 'failed' }));
    ui.send({ type: 'LOAD' });
    assert.ok(ui.snapshot.matches({ mode: 'loading' }));
    assert.equal(acceptsGenerationReady(true, retry, old), false);
  }
  assert.equal(acceptsGenerationReady(true, retry, retry), true);
  ui.send({ type: 'READY' });
  assert.ok(ui.snapshot.matches({ mode: 'playing' }));
  assert.equal(acceptsGenerationReady(false, retry, retry), false);
});
