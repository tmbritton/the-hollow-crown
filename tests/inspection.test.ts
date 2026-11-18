import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { InspectionController } from '../src/inspection.ts';

function setup() {
  const camera = {
    target: new Vector3(1, 0.75, 2),
    alpha: -Math.PI / 4,
    beta: 0.64,
    radius: 27,
    fov: 0.65,
    minZ: 0.1,
  };
  let enters = 0,
    exits = 0,
    opens = 0,
    closes = 0;
  const viewport = { width: 1440, height: 900, footer: 190 };
  const controller = new InspectionController(camera, {
    getViewport: () => viewport,
    onOpen: () => opens++,
    onClose: () => closes++,
  });
  const target = {
    id: 'ancient-tablet',
    title: 'An arbitrary inspectable artifact',
    getView: () => ({
      focus: new Vector3(5, 1.8, 7),
      direction: new Vector3(0, 0, -1),
      distance: 2.35,
      width: 2.15,
      height: 2.8,
    }),
    onEnter: () => enters++,
    onExit: () => exits++,
  };
  return { camera, controller, target, viewport, counts: () => ({ enters, exits, opens, closes }) };
}
test('generic inspection frames a target and restores the complete camera pose', () => {
  const { camera, controller, target, counts } = setup(),
    saved = controller.capture();
  assert.equal(controller.open(target), true);
  controller.update(0.6);
  assert.equal(controller.state, 'viewing');
  assert.equal(camera.radius, 2.35);
  assert.equal(camera.beta, Math.PI / 2);
  assert.equal(camera.target.x, 5);
  assert.equal(camera.target.z, 7);
  assert.ok(camera.target.y < 1.8);
  assert.equal(controller.open(target), false);
  controller.close();
  controller.update(0.6);
  assert.deepEqual(controller.capture(), saved);
  assert.equal(controller.active, false);
  assert.deepEqual(counts(), { enters: 1, exits: 1, opens: 1, closes: 1 });
});
test('cancel during entry and disposal clean up target hooks exactly once', () => {
  const { controller, target, counts } = setup(),
    saved = controller.capture();
  controller.open(target);
  controller.update(0.15);
  controller.close();
  controller.update(0.6);
  assert.deepEqual(controller.capture(), saved);
  controller.open(target);
  controller.update(0.1);
  controller.dispose();
  controller.dispose();
  assert.deepEqual(controller.capture(), saved);
  assert.equal(controller.state, 'idle');
  assert.deepEqual(counts(), { enters: 2, exits: 2, opens: 2, closes: 2 });
});
test('inspection framing adapts to resize without losing its return pose', () => {
  const { camera, controller, target, viewport } = setup(),
    saved = controller.capture();
  controller.open(target);
  controller.update(0.6);
  const wideFov = camera.fov;
  viewport.width = 450;
  controller.update(0.016);
  assert.ok(camera.fov > wideFov);
  controller.close({ immediate: true });
  assert.deepEqual(controller.capture(), saved);
});
