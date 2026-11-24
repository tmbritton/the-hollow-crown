import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkCaptureCamera, type CaptureCamera } from './visual-trial-camera.ts';
import { view } from './visual-trial-fixture.ts';

test('a different orbit, zoom, target, or recipe cannot pass as a treated capture', () => {
  const target = [3, 0.75, -4];
  const camera: CaptureCamera = {
    alpha: view.alpha,
    beta: view.beta,
    logicalRadius: 18,
    radius: (18 * Math.tan(0.65 / 2)) / Math.tan(Math.PI / 6),
    fov: Math.PI / 3,
    target,
    distortion: true,
    sampleX: 0.67125,
  };
  const check = (changes: Partial<CaptureCamera>) =>
    checkCaptureCamera({ ...camera, ...changes }, view.alpha, 18, 'tuned', target);
  check({});
  assert.throws(() => check({ alpha: camera.alpha + Math.PI / 2 }), /alpha/);
  assert.throws(() => check({ beta: camera.beta + 0.1 }), /beta/);
  assert.throws(() => check({ logicalRadius: 36 }), /logical radius/);
  assert.throws(() => check({ radius: 18 }), /physical radius/);
  assert.throws(() => check({ target: [3, 1, -4] }), /target/);
  assert.throws(() => check({ fov: 0.65 }), /FOV/);
  assert.throws(() => check({ distortion: false }), /distortion pass/);
  assert.throws(() => check({ sampleX: 0.75 }), /distortion sample/);
});
