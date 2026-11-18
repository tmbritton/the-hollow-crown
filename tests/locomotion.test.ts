import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  animateLocomotion,
  createLocomotion,
  easeSpeed,
  RUN_SPEED,
  WALK_SPEED,
} from '../src/locomotion.ts';
import { volumeScale } from '../src/animationCurves.ts';

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

test('start loads against travel before the push, then stopping recoils and settles', () => {
  const state = createLocomotion();
  animateLocomotion(state, 1, true, 1 / 60);
  const anticipation = animateLocomotion(state, 2, true, 1 / 60);
  assert.ok(anticipation.lean < 0 && anticipation.stretch < 0.97);
  let push = anticipation;
  for (let i = 0; i < 4; i++) push = animateLocomotion(state, 3, true, 1 / 60);
  assert.ok(push.lean > 0.1 && push.stretch > 1);
  for (let i = 0; i < 30; i++) animateLocomotion(state, WALK_SPEED, true, 1 / 60);
  const stopping = Array.from({ length: 60 }, () => animateLocomotion(state, 0, false, 1 / 60));
  assert.ok(stopping.some((pose) => pose.lean < -0.1 && pose.stretch < 1));
  assert.ok(stopping.slice(10, 15).some((pose) => pose.lean > 0));
  assert.ok(Math.abs(stopping.at(-1)!.stretch - 1) < 1e-6);
});

test('running lengthens the stride and changes lean, arm pumps, flight and landing', () => {
  const sample = (speed: number) => {
    const state = createLocomotion();
    for (let i = 0; i < 120; i++) animateLocomotion(state, speed, true, 1 / 60);
    const start = state.stride;
    const poses = Array.from({ length: 120 }, () => animateLocomotion(state, speed, true, 1 / 60));
    return { poses, radiansPerUnit: (state.stride - start) / (speed * 2) };
  };
  const walk = sample(WALK_SPEED),
    run = sample(RUN_SPEED);
  const peak = (poses: typeof walk.poses, key: keyof (typeof poses)[number]) =>
    Math.max(...poses.map((pose) => Math.abs(pose[key])));
  assert.ok(run.radiansPerUnit < walk.radiansPerUnit * 0.8, 'more distance per running stride');
  assert.ok(peak(run.poses, 'leftLeg') > peak(walk.poses, 'leftLeg') * 1.5);
  assert.ok(peak(run.poses, 'leftArm') > peak(walk.poses, 'leftArm') * 2);
  assert.ok(run.poses.every((pose) => pose.lean > 0.25 && pose.leftElbow > 0.8));
  assert.ok(peak(run.poses, 'lift') > 0.015 && peak(run.poses, 'lift') < 0.04);
  assert.ok(walk.poses.every((pose) => pose.lift === 0));
  assert.ok(run.poses.some((pose) => pose.stretch < 0.93 && pose.lift === 0));
});

test('gait changes preserve phase and deformation volume, including collision and restart', () => {
  const state = createLocomotion();
  for (const [speed, wantsMovement] of [
    [WALK_SPEED, true],
    [RUN_SPEED, true],
    [0, true],
    [RUN_SPEED, true],
    [0, false],
  ] as const) {
    for (let i = 0; i < 60; i++) {
      const previous = state.stride;
      const pose = animateLocomotion(state, speed, wantsMovement, 1 / 60);
      const scale = volumeScale(pose.stretch, pose.reach);
      assert.ok(Object.values(pose).every(Number.isFinite));
      assert.ok(Math.abs(scale.x * scale.y * scale.z - 1) < 1e-12);
      assert.ok(state.stride >= previous && state.stride - previous <= (RUN_SPEED / 60) * 2.7);
      if (!speed) assert.equal(state.stride, previous);
    }
  }
});
