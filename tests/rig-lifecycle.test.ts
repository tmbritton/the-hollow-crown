import assert from 'node:assert/strict';
import test from 'node:test';
import { createRigLifecycle } from '../src/rigLifecycle.ts';

test('retire while bound, ignore stale or duplicate events, bind the replacement', () => {
  const effects: string[] = [];
  const lifecycle = createRigLifecycle(() => effects.push('clear'));
  const target = (generation: number) => ({
    generation,
    stop: () => effects.push(`stop ${generation}`),
  });
  lifecycle.reset();
  assert.equal(lifecycle.bind(target(1)), true);
  lifecycle.reset();
  // Persisted hide/show uses the same reset without retirement.
  lifecycle.reset();
  lifecycle.reset();
  assert.equal(
    lifecycle.replace(1, () => {
      effects.push('dispose 1');
      lifecycle.reset();
    }),
    true,
  );
  assert.equal(lifecycle.bind(target(1)), false);
  assert.equal(lifecycle.bind(target(2)), true);
  assert.equal(
    lifecycle.replace(1, () => assert.fail('stale disposal')),
    false,
  );
  lifecycle.reset();
  assert.equal(
    lifecycle.terminate(() => {
      effects.push('dispose engine');
      lifecycle.reset();
    }),
    true,
  );
  lifecycle.reset();
  assert.equal(
    lifecycle.terminate(() => assert.fail('duplicate disposal')),
    false,
  );
  assert.equal(lifecycle.bind(target(3)), false);
  assert.deepEqual(effects, [
    'clear',
    'clear',
    'stop 1',
    'clear',
    'stop 1',
    'clear',
    'stop 1',
    'clear',
    'stop 1',
    'dispose 1',
    'clear',
    'clear',
    'stop 2',
    'clear',
    'stop 2',
    'dispose engine',
    'clear',
    'clear',
    'clear',
  ]);
});

test('terminal hide before binding cannot adopt a late owner; live cannot be overwritten', () => {
  const stop = () => assert.fail('unexpected stop');
  const clear = () => {};
  const early = createRigLifecycle(clear);
  assert.equal(
    early.replace(1, () => assert.fail('absent scene')),
    false,
  );
  assert.equal(
    early.terminate(() => {}),
    true,
  );
  assert.equal(early.terminal, true);
  assert.equal(early.generation, undefined);
  assert.equal(early.bind({ generation: 1, stop }), false);
  assert.equal(
    early.replace(1, () => assert.fail('terminal scene')),
    false,
  );
  const live = createRigLifecycle(clear);
  assert.equal(live.bind({ generation: 0, stop }), false);
  assert.equal(live.bind({ generation: 1, stop }), true);
  assert.equal(live.bind({ generation: 2, stop }), false);
  assert.equal(live.generation, 1);
});

for (const event of ['reset', 'replace', 'terminate'] as const) {
  test(`terminate from stop during ${event} is absorbing and releases once after stop`, () => {
    const effects: string[] = [];
    const lifecycle = createRigLifecycle(() => {});
    const release = () => effects.push('engine release');
    lifecycle.bind({
      generation: 1,
      stop() {
        effects.push('stop entry');
        assert.equal(lifecycle.terminate(release), event !== 'terminate');
        assert.equal(lifecycle.terminal, true);
        assert.equal(lifecycle.generation, undefined);
        effects.push('stop return');
      },
    });
    if (event === 'replace') lifecycle.replace(1, () => assert.fail('superseded scene release'));
    else if (event === 'terminate') lifecycle.terminate(release);
    else lifecycle.reset();
    assert.equal(lifecycle.terminal, true);
    assert.equal(lifecycle.bind({ generation: 2, stop: () => {} }), false);
    lifecycle.reset();
    assert.equal(
      lifecycle.terminate(() => assert.fail('duplicate release')),
      false,
    );
    assert.deepEqual(effects, ['stop entry', 'stop return', 'engine release']);
  });
}
