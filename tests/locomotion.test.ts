import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  animateLocomotion,
  createLocomotion,
  easeSpeed,
  RUN_SPEED,
  WALK_SPEED,
} from '../src/locomotion.ts';

test('increased movement speed accelerates smoothly within a short responsive window', () => {
  assert.ok(WALK_SPEED > 3.25 && RUN_SPEED > 5.1);
  let speed = 0;
  for (let i = 0; i < 12; i++) {
    const next = easeSpeed(speed, WALK_SPEED, 1 / 60);
    assert.ok(next > speed && next < WALK_SPEED);
    speed = next;
  }
  assert.ok(speed > WALK_SPEED * 0.9);
});

test('release produces a brief deceleration with bounded drift and a complete stop', () => {
  let speed = RUN_SPEED,
    travel = 0;
  const first = easeSpeed(speed, 0, 1 / 60);
  assert.ok(first > 0 && first < speed);
  for (let i = 0; i < 30; i++) {
    const next = easeSpeed(speed, 0, 1 / 60);
    assert.ok(next <= speed);
    travel += next / 60;
    speed = next;
  }
  assert.equal(speed, 0);
  assert.ok(travel > 0.1 && travel < 0.45);
});

test('easing produces consistent speed at different simulation rates', () => {
  const values = [30, 60, 120].map((rate) => {
    let speed = 0;
    for (let i = 0; i < rate / 2; i++) speed = easeSpeed(speed, RUN_SPEED, 1 / rate);
    return speed;
  });
  assert.ok(Math.max(...values) - Math.min(...values) < 1e-9);
});

test('start push-off and stopping brace transition back to a settled idle pose', () => {
  const state = createLocomotion();
  let pose = animateLocomotion(state, 2, true, 1 / 60);
  assert.equal(state.phase, 'starting');
  for (let i = 0; i < 5; i++) pose = animateLocomotion(state, 3, true, 1 / 60);
  assert.ok(pose.lean > 0.1 && Math.abs(pose.leftLeg) > 0.05);
  for (let i = 0; i < 20; i++) animateLocomotion(state, WALK_SPEED, true, 1 / 60);
  assert.equal(state.phase, 'moving');
  for (let i = 0; i < 8; i++) pose = animateLocomotion(state, 0, false, 1 / 60);
  assert.equal(state.phase, 'stopping');
  assert.ok(pose.lean < 0);
  for (let i = 0; i < 60; i++) pose = animateLocomotion(state, 0, false, 1 / 60);
  assert.equal(state.phase, 'idle');
  assert.ok(
    Math.abs(pose.leftLeg) < 0.001 &&
      Math.abs(pose.rightLeg) < 0.001 &&
      Math.abs(pose.cape + 0.16) < 0.001,
  );
});

test('blocked movement does not animate running in place', () => {
  const state = createLocomotion();
  for (let i = 0; i < 120; i++) animateLocomotion(state, 0, true, 1 / 60);
  assert.equal(state.phase, 'idle');
  assert.equal(state.stride, 0);
});
