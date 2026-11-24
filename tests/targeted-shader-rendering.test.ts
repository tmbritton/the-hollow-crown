import assert from 'node:assert/strict';
import test from 'node:test';
import { Observable } from '@babylonjs/core/Misc/observable.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { prepareScalePrograms, type ScaleSignature } from '../src/targetedShaderRendering.ts';
import { signatures } from '../src/targetedShaderSignatures.ts';

function fixture(
  selected: readonly ScaleSignature[] = (['high', 'low'] as const).map((quality) => ({
    quality,
    pass: 'camera',
    source: 'standard',
    sibling: 'base',
    scaled: `${quality} scaled`,
  })),
  quality: ScaleSignature['quality'] = 'high',
) {
  const readySibling = (source: string, defines: string) => ({
    key: `${source}+${source}@${defines}`,
    name: source,
    defines,
    isReady: () => true,
    getAttributesNames: () => ['position'],
    getUniformNames: () => [],
    getUniformBuffersNames: () => [],
    getSamplers: () => [],
    getIndexParameters: () => undefined,
  });
  const cache: Record<string, { key: string; isReady(): boolean }> = {};
  function addSibling({ source, sibling }: ScaleSignature) {
    const effect = readySibling(source, sibling);
    cache[effect.key] = effect;
    return effect;
  }
  const initial = selected.find((s) => s.quality === quality);
  const representative = initial ? addSibling(initial) : undefined;
  const effects: { key: string; ready: boolean; disposed: number; error: string }[] = [];
  const engine = {
    _compiledEffects: cache,
    onContextLostObservable: new Observable<void>(),
    createEffect(name: string, { defines }: { defines: string }) {
      const key = `${name}+${name}@${defines}`;
      const status = { key, ready: false, disposed: 0, error: '' };
      effects.push(status);
      const effect = {
        key,
        isReady: () => status.ready,
        getCompilationError: () => status.error,
        dispose: () => {
          status.disposed++;
          delete cache[key];
        },
      };
      return (cache[key] = effect);
    },
  };
  const readyCallbacks: (() => void)[] = [];
  const onDispose = new Observable<void>();
  const scene = {
    getEngine: () => engine,
    materials: [],
    onDisposeObservable: onDispose,
    executeWhenReady: (fn: () => void) => readyCallbacks.push(fn),
  };
  const state = { quality, now: 0 };
  const events: string[] = [];
  const replace = prepareScalePrograms(
    scene as unknown as Scene,
    selected,
    () => state.quality,
    () => events.push('ready'),
    (reason) => events.push(reason),
    () => state.now,
  );
  return {
    state,
    engine,
    readyCallbacks,
    onDispose,
    effects,
    events,
    replace,
    representative,
    addSibling,
  };
}

test('pre-READY Low to High waits for the new scene readiness and compiles the new sibling', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stone = signatures.filter((s) => s.source === 'stone');
  const low = stone.find((s) => s.quality === 'low')!;
  const high = stone.find((s) => s.quality === 'high')!;
  assert.notEqual(low.sibling, high.sibling);
  assert.notEqual(low.scaled, high.scaled);
  const f = fixture(stone, 'low');
  f.readyCallbacks[0]!();
  assert.deepEqual(
    f.effects.map((e) => e.key),
    [`stone+stone@${low.scaled}`],
  );

  f.state.quality = 'high';
  f.replace();
  assert.deepEqual(
    f.events,
    [],
    'missing High sibling is not empty work until High scene readiness',
  );
  assert.equal(f.effects[0]!.disposed, 1);
  f.effects[0]!.ready = true;
  t.mock.timers.tick(8);
  f.readyCallbacks[0]!();
  assert.deepEqual(f.events, [], 'late Low compilation/readiness cannot release High');
  assert.equal(f.effects.length, 1);

  f.addSibling(high);
  f.readyCallbacks[1]!();
  assert.deepEqual(
    f.effects.map((e) => e.key),
    [`stone+stone@${low.scaled}`, `stone+stone@${high.scaled}`],
  );
  assert.deepEqual(f.events, []);
  f.effects[1]!.ready = true;
  t.mock.timers.tick(8);
  assert.deepEqual(f.events, ['ready']);
  f.onDispose.notifyObservers();
  assert.equal(f.effects[1]!.disposed, 1);
});

test('superseded readiness cannot accept empty work; the current readiness can', () => {
  const f = fixture([]);
  f.state.quality = 'low';
  f.replace();
  f.readyCallbacks[0]!();
  assert.deepEqual(f.events, []);
  f.readyCallbacks[1]!();
  f.readyCallbacks[1]!();
  assert.deepEqual(f.events, ['ready']);
  assert.deepEqual(f.effects, []);
});

test('a cache lookup failure while replacing quality fails loading and retires pending effects', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  f.readyCallbacks[0]!();
  f.representative!.isReady = () => {
    throw new Error('cache lookup failed');
  };
  f.state.quality = 'low';
  f.replace();
  f.readyCallbacks[1]!();
  f.effects[0]!.ready = true;
  t.mock.timers.tick(8);
  assert.deepEqual(f.events, ['Error: cache lookup failed']);
  assert.equal(f.effects[0]!.disposed, 1);
});

test('preparing High can be replaced by Low; only the current revision enables input', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  f.readyCallbacks[0]!();
  assert.equal(f.effects.length, 1);
  f.state.quality = 'low';
  f.replace();
  f.readyCallbacks[1]!();
  assert.equal(f.effects.length, 2);
  const [high, low] = f.effects;
  assert.equal(high!.disposed, 1);
  high!.ready = true;
  t.mock.timers.tick(8);
  assert.deepEqual(f.events, []);
  low!.ready = true;
  t.mock.timers.tick(8);
  assert.deepEqual(f.events, ['ready']);
  f.replace();
  assert.equal(f.effects.length, 2);
  f.onDispose.notifyObservers();
  assert.equal(low!.disposed, 1);
  assert.equal(high!.disposed, 1);
});

test('a retired scene cannot compile on late Babylon readiness or finish a pending revision', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const ready of [false, true]) {
    const f = fixture();
    if (ready) f.readyCallbacks[0]!();
    f.onDispose.notifyObservers();
    f.replace();
    f.readyCallbacks[0]!();
    f.engine.onContextLostObservable.notifyObservers();
    if (ready) f.effects[0]!.ready = true;
    t.mock.timers.tick(8);
    assert.deepEqual(f.events, []);
    assert.deepEqual(
      f.effects.map((e) => e.disposed),
      ready ? [1] : [],
    );
  }
});

test('compiler error, timeout and context loss fail closed, with no late READY', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const reason of ['compile error', 'timeout', 'lost before scene ready', 'lost']) {
    const f = fixture();
    if (reason !== 'lost before scene ready') f.readyCallbacks[0]!();
    if (reason === 'compile error') f.effects[0]!.error = reason;
    else if (reason === 'timeout') f.state.now = 12000;
    else f.engine.onContextLostObservable.notifyObservers();
    t.mock.timers.tick(8);
    f.readyCallbacks[0]!();
    if (f.effects[0]) f.effects[0].ready = true;
    f.replace();
    t.mock.timers.tick(8);
    assert.deepEqual(f.events, [
      reason === 'timeout'
        ? 'Scale program preparation timed out'
        : reason.startsWith('lost')
          ? 'WebGL context lost during loading'
          : reason,
    ]);
    assert.deepEqual(
      f.effects.map((e) => e.disposed),
      reason === 'lost before scene ready' ? [] : [1],
    );
    f.onDispose.notifyObservers();
  }
});
