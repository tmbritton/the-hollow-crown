import assert from 'node:assert/strict';
import test from 'node:test';
import { BASE_FOV, DEFAULT_VIEW, lensRadius, lensFov, sceneSample } from '../src/visualTrial.ts';
import { createVisualTrial } from '../src/machines/ui/visualTrial.ts';

test('Corner wear is clamped, saved in Original and restored only in Tuned', () => {
  let copied = '';
  const trial = createVisualTrial({
    applyView: () => {},
    copySettings: (value) => (copied = value),
  });
  const edit = (value: number) => trial.send({ type: 'EDIT', key: 'cornerWear', value });
  assert.equal(trial.settings.cornerWear, 0);
  assert.equal(edit(50), false);
  trial.send({ type: 'SELECT', mode: 'tuned' });
  assert.equal(edit(Infinity), false);
  for (const [value, expected] of [
    [-1, 0],
    [46, 46],
    [200, 100],
  ]) {
    assert.equal(edit(value), true);
    assert.deepEqual(trial.settings, { ...DEFAULT_VIEW, cornerWear: expected });
  }
  trial.send({ type: 'SELECT', mode: 'original' });
  assert.deepEqual(trial.settings, DEFAULT_VIEW);
  trial.send({ type: 'COPY' });
  assert.deepEqual(JSON.parse(copied), { mode: 'original', ...DEFAULT_VIEW, cornerWear: 100 });
  trial.send({ type: 'SELECT', mode: 'tuned' });
  assert.equal(trial.settings.cornerWear, 100);
  trial.send({ type: 'RESET' });
  assert.deepEqual(trial.settings, DEFAULT_VIEW);
});

test('ink width is an independent whole-pixel Tuned setting with saved and effective values', () => {
  const applied: unknown[] = [];
  const copied: string[] = [];
  const trial = createVisualTrial({
    applyView: (view) => applied.push(view),
    copySettings: (text) => copied.push(text),
  });
  const edit = (value: number) => trial.send({ type: 'EDIT', key: 'inkWidth', value });
  assert.equal(edit(4), false);
  assert.deepEqual(applied, []);
  trial.send({ type: 'SELECT', mode: 'tuned' });
  assert.equal(edit(NaN), false);
  assert.equal(edit(Infinity), false);
  for (const [input, width] of [
    [9, 4],
    [-2, 0],
    [2.6, 3],
    [2, 2],
  ]) {
    assert.equal(edit(input), true);
    assert.deepEqual(applied.at(-1), { ...DEFAULT_VIEW, inkWidth: width });
  }
  trial.send({ type: 'SELECT', mode: 'original' });
  assert.deepEqual(applied.at(-1), { ...DEFAULT_VIEW, inkWidth: 0 });
  trial.send({ type: 'COPY' });
  assert.deepEqual(JSON.parse(copied[0]), { mode: 'original', ...DEFAULT_VIEW, inkWidth: 2 });
  trial.send({ type: 'SELECT', mode: 'tuned' });
  assert.deepEqual(applied.at(-1), { ...DEFAULT_VIEW, inkWidth: 2 });
  trial.send({ type: 'RESET' });
  assert.deepEqual(applied.at(-1), { ...DEFAULT_VIEW, inkWidth: 0 });
});

test('Lens preserves the target-plane scale at both zoom ends and has an exact neutral', () => {
  for (const zoom of [18, 36]) {
    assert.equal(lensFov(DEFAULT_VIEW.lensDegrees), 0.65);
    assert.equal(lensRadius(zoom, BASE_FOV), zoom);
    for (const degrees of [25, 60]) {
      const fov = lensFov(degrees);
      assert.ok(
        Math.abs(lensRadius(zoom, fov) * Math.tan(fov / 2) - zoom * Math.tan(0.325)) < 1e-12,
      );
    }
  }
});

test('display-to-source mapping is neutral at zero, symmetric and monotone, with black corners not pickable', () => {
  for (const aspect of [16 / 9, 3 / 4]) {
    assert.deepEqual(sceneSample(0.9, 0.3, aspect, 0), { u: 0.9, v: 0.3 });
    assert.deepEqual(sceneSample(0.5, 0.5, aspect, 100), { u: 0.5, v: 0.5 });
    let prev = 0.5;
    for (const u of [0.6, 0.7, 0.8, 0.9]) {
      const sample = sceneSample(u, 0.5, aspect, 100);
      assert.ok(sample && sample.u > prev && sample.u < u);
      assert.equal(sample.v, 0.5);
      prev = sample.u;
    }
    assert.equal(sceneSample(1, 1, aspect, 100), null);
    assert.equal(sceneSample(-0.01, 0.5, aspect, 0), null);
  }
});

test('trial applies only effective settings, preserves the saved preset and copies losslessly', () => {
  const applied: unknown[] = [];
  const copied: string[] = [];
  const trial = createVisualTrial({
    applyView: (view) => applied.push(view),
    copySettings: (text) => copied.push(text),
  });
  assert.equal(trial.mode, 'original');
  assert.equal(trial.send({ type: 'EDIT', key: 'lensDegrees', value: 25 }), false);
  trial.send({ type: 'SELECT', mode: 'tuned' });
  assert.equal(trial.send({ type: 'EDIT', key: 'lensDegrees', value: Infinity }), false);
  assert.equal(trial.send({ type: 'EDIT', key: 'unknown', value: 25 }), false);
  trial.send({ type: 'EDIT', key: 'lensDegrees', value: 30.123456789 });
  trial.send({ type: 'EDIT', key: 'fisheyePercent', value: 120 });
  const preset = { ...DEFAULT_VIEW, lensDegrees: 30.123456789, fisheyePercent: 100 };
  assert.deepEqual(trial.settings, preset);
  trial.send({ type: 'SELECT', mode: 'original' });
  assert.deepEqual(trial.settings, DEFAULT_VIEW);
  trial.send({ type: 'COPY' });
  assert.deepEqual(JSON.parse(copied[0]), {
    mode: 'original',
    ...preset,
  });
  trial.send({ type: 'SELECT', mode: 'tuned' });
  assert.deepEqual(applied.at(-1), preset);
  trial.send({ type: 'RESET' });
  assert.deepEqual(applied.at(-1), DEFAULT_VIEW);
});

test('palette-only edits clamp, remain separate from camera settings, and copy saved Tuned values', () => {
  const applied: unknown[] = [];
  let copied = '';
  const trial = createVisualTrial({
    applyView: (v) => applied.push(v),
    copySettings: (v) => (copied = v),
  });
  const enable = { type: 'PALETTE', enabled: true } as const;
  const edit = (key: string, value: number) => trial.send({ type: 'EDIT', key, value });
  assert.equal(trial.settings.paletteEnabled, false);
  assert.equal(trial.send(enable), false);
  assert.equal(edit('roomHue', 0), false);
  trial.send({ type: 'SELECT', mode: 'tuned' });
  assert.equal(trial.settings.paletteEnabled, false);
  assert.equal(trial.send(enable), true);
  assert.equal(edit('roomHue', NaN), false);
  assert.equal(edit('shadowCoverage', Infinity), false);
  assert.equal(edit('roomHue', -1), true);
  assert.equal(edit('shadowCoverage', 101), true);
  assert.deepEqual(trial.settings, {
    ...DEFAULT_VIEW,
    paletteEnabled: true,
    roomHue: 0,
    shadowCoverage: 100,
  });
  edit('roomHue', 361);
  edit('shadowCoverage', -1);
  const preset = { ...DEFAULT_VIEW, paletteEnabled: true, roomHue: 360, shadowCoverage: 0 };
  assert.deepEqual(trial.settings, preset);
  trial.send({ type: 'SELECT', mode: 'original' });
  assert.deepEqual(trial.settings, DEFAULT_VIEW);
  trial.send({ type: 'COPY' });
  assert.deepEqual(JSON.parse(copied), { mode: 'original', ...preset });
  trial.send({ type: 'SELECT', mode: 'tuned' });
  assert.deepEqual(applied.at(-1), preset);
  trial.send({ type: 'PALETTE', enabled: false });
  assert.deepEqual(trial.settings, { ...preset, paletteEnabled: false });
  trial.send({ type: 'RESET' });
  assert.deepEqual(applied.at(-1), DEFAULT_VIEW);
});
