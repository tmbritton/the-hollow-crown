import { test } from 'node:test';
import assert from 'node:assert/strict';
import { animateLocomotion, createLocomotion } from '../src/locomotion.ts';
import { createActor, moveActor, stopActor, teleportActor } from '../src/actors.ts';
import { ECS } from '../src/ecs.ts';
import type { NavigationWorld } from '../src/navigation.ts';
import { gaitFootPhase, skeletonLurch } from '../src/skeletonGait.ts';

const world: NavigationWorld = {
  tiles: new Map(
    Array.from({ length: 121 }, (_, i) => {
      const x = (i % 11) - 5,
        z = Math.floor(i / 11) - 5;
      return [`${x},${z}`, { x, z, h: 0, surface: 'stone' as const }];
    }),
  ),
  entities: [],
  blockers: [],
};

function sample(stride: number, skeleton = true) {
  const state = createLocomotion();
  for (let i = 0; i < 90; i++) animateLocomotion(state, 1.65, true, 1 / 60, 1.65);
  state.stride = stride;
  return animateLocomotion(state, 1.65, true, 0, 1.65, false, skeleton ? 'skeleton' : 'ordinary');
}

test('skeleton takes an uneven load/catch-up step instead of a mirrored ordinary walk', () => {
  const cycle = Array.from({ length: 120 }, (_, i) => sample((i / 120) * Math.PI * 2));
  const ordinary = cycle.map((_, i) => sample((i / 120) * Math.PI * 2, false));
  assert.ok(
    cycle.some((p) => Math.abs(p.leftLeg + p.rightLeg) > 0.2),
    'legs must not be mirrored',
  );
  assert.ok(
    Math.max(...cycle.map((p) => p.lean)) - Math.min(...cycle.map((p) => p.lean)) > 0.2,
    'visible forward collapse and recovery',
  );
  assert.ok(
    Math.max(...cycle.map((p) => p.roll)) - Math.min(...cycle.map((p) => p.roll)) > 0.18,
    'uneven lateral weight transfer',
  );
  assert.ok(ordinary.every((p) => p.roll === 0 && Math.abs(p.leftLeg + p.rightLeg) < 1e-9));
});

test('lurch is periodic, bounded, fades at a stop, and cannot cycle against a blocked motor', () => {
  for (let i = 0; i < 240; i++) {
    const p = sample((i / 240) * Math.PI * 2),
      next = sample((i / 240) * Math.PI * 2 + 2 * Math.PI);
    for (const key of Object.keys(p) as (keyof typeof p)[]) {
      assert.ok(Number.isFinite(p[key]));
      assert.ok(Math.abs(p[key] - next[key]) < 1e-10);
    }
    assert.ok(Math.abs(p.roll) <= 0.2 && Math.abs(p.lean) <= 0.5 && Math.abs(p.bob) < 0.15);
    assert.equal(p.lift, 0, 'lurch must not invent flight');
  }
  const state = createLocomotion();
  for (let i = 0; i < 120; i++)
    animateLocomotion(state, 1.65, true, 1 / 60, 1.65, false, 'skeleton');
  const stride = state.stride;
  let pose = sample(stride);
  for (let i = 0; i < 120; i++)
    pose = animateLocomotion(state, 0, true, 1 / 60, 1.65, false, 'skeleton');
  assert.equal(state.stride, stride);
  assert.ok(Math.abs(pose.roll) < 1e-8 && Math.abs(pose.lean) < 1e-8);
  assert.ok(Math.abs(pose.leftLeg) < 1e-8 && Math.abs(pose.rightLeg) < 1e-8);
});

test('unequal stance durations stay complementary and skull follow-through is bounded and continuous', () => {
  const stances = [0, 0];
  let previous = skeletonLurch(-0.001);
  for (let i = 0; i < 1000; i++) {
    const stride = (i / 1000) * Math.PI * 2;
    const stance = [0, 1].map((foot) => gaitFootPhase(stride, foot, 'skeleton') < Math.PI);
    assert.notEqual(stance[0], stance[1], 'one load-bearing foot throughout the cycle');
    stance.forEach((planted, foot) => (stances[foot] += Number(planted)));
    const pose = skeletonLurch(stride);
    for (const key of Object.keys(pose) as (keyof typeof pose)[])
      assert.ok(Math.abs(pose[key] - previous[key]) < 0.025, `no pose discontinuity: ${key}`);
    assert.ok(Math.abs(pose.headPitch) <= 0.21 && Math.abs(pose.headRoll) <= 0.15);
    previous = pose;
  }
  assert.ok(stances[0] >= 639 && stances[0] <= 641 && stances[1] >= 359 && stances[1] <= 361);
});

test('gait sampling preserves actual 1.65 movement, navigation, support, jump and attack clocks', () => {
  const make = () => createActor(new ECS(), world, 'walker', 'skeleton', { x: 0, z: 0, h: 0 });
  const animated = make(),
    control = make();
  for (const actor of [animated, control]) {
    actor.navigator.goTo(actor.position, { x: 0, z: 4 });
    actor.attack.start(
      {
        target: 'target',
        elapsed: 0,
        duration: 0.62,
        impact: 0.25,
        resolved: false,
        ranged: false,
      },
      1,
    );
  }
  for (let frame = 0; frame < 90; frame++) {
    for (const actor of [animated, control]) {
      moveActor(actor, world, {}, 1 / 60);
      actor.attack.advance(1 / 60);
    }
    animateLocomotion(
      animated.motion.animation,
      animated.motion.actualSpeed,
      animated.motion.wantsMovement,
      1 / 60,
      1.65,
      animated.jump.airborne,
      'skeleton',
    );
    assert.deepEqual(animated.position, control.position);
    assert.equal(animated.motion.speed, control.motion.speed);
    assert.equal(animated.entity.require('actor').speed, 1.65);
    assert.equal(animated.elevation, control.elevation);
    assert.deepEqual(animated.jump, control.jump);
    assert.deepEqual(animated.attack.swing, control.attack.swing);
    assert.deepEqual(animated.navigator.path, control.navigator.path);
  }
  assert.ok(animated.motion.actualSpeed > 1.649);
  const stride = animated.motion.animation.stride;
  for (let i = 0; i < 30; i++)
    animateLocomotion(animated.motion.animation, 1.65, true, 1 / 60, 1.65, true, 'skeleton');
  assert.equal(
    animated.motion.animation.stride,
    stride,
    'airborne travel does not advance ground cadence',
  );
  for (const reset of [
    () => stopActor(animated),
    () => teleportActor(animated, world, { x: 1, z: 0 }),
  ]) {
    reset();
    const pose = animateLocomotion(animated.motion.animation, 0, false, 0, 1.65, false, 'skeleton');
    assert.equal(animated.motion.animation.stride, 0);
    assert.equal(pose.roll, 0);
    assert.equal(pose.lean, 0);
  }
});
