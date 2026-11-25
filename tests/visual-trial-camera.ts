import assert from 'node:assert/strict';
import { recipe, view } from './visual-trial-fixture.ts';

export interface CaptureCamera {
  alpha: number;
  beta: number;
  logicalRadius: number;
  radius: number;
  fov: number;
  target: number[];
  distortion: boolean;
  sampleX: number | null;
}

export function checkCaptureCamera(
  camera: CaptureCamera,
  alpha: number,
  radius: number,
  mode: 'original' | 'tuned',
  target?: number[],
) {
  const tuned = mode === 'tuned';
  const fov = tuned ? (recipe.lensDegrees * Math.PI) / 180 : 0.65;
  const distance = tuned ? (radius * Math.tan(0.65 / 2)) / Math.tan(fov / 2) : radius;
  assert.equal(camera.alpha, alpha, 'capture camera alpha');
  assert.equal(camera.beta, view.beta, 'capture camera beta');
  assert.equal(camera.logicalRadius, radius, 'capture camera logical radius');
  assert.equal(camera.radius, distance, 'capture camera physical radius');
  assert.equal(camera.fov, fov, 'capture camera FOV');
  assert.equal(camera.distortion, tuned, 'capture camera distortion pass');
  // On the center row at 75% width, the landscape radius squared is 0.25.
  const sampleX = tuned ? 0.5 + 0.25 * (1 - (0.75 * 0.42 * recipe.fisheyePercent) / 100) : 0.75;
  assert.ok(
    camera.sampleX !== null && Math.abs(camera.sampleX - sampleX) < 1e-12,
    'capture camera distortion sample',
  );
  if (target) assert.deepEqual(camera.target, target, 'capture camera target');
}
