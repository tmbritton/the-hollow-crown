import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackPose, deathPose, hackySackKick } from '../src/actionPoses.ts';
import { volumeScale } from '../src/animationCurves.ts';

test('melee winds up before authoritative contact, extends through it, and returns to neutral', () => {
  for (const [duration, impact] of [
    [0.56, 0.23],
    [0.9, 0.6],
  ]) {
    const windup = attackPose(impact * 0.72, duration, impact, false);
    const contact = attackPose(impact, duration, impact, false);
    const followThrough = attackPose(impact + (duration - impact) * 0.16, duration, impact, false);
    assert.ok(windup.rightArm < -2 && windup.lean < 0 && windup.stretch < 1);
    assert.ok(contact.lean > 0.2 && contact.reach > 1 && contact.rightArm > windup.rightArm);
    assert.ok(followThrough.rightArm > contact.rightArm);
    assert.deepEqual(
      attackPose(duration, duration, impact, false),
      attackPose(0, duration, impact, false),
    );
  }
});

test('crossbow holds aim until release and recoils afterwards without a melee cut', () => {
  const impact = 0.45,
    duration = 0.85;
  const aim = attackPose(impact - 1 / 60, duration, impact, true);
  const release = attackPose(impact, duration, impact, true);
  const recoil = attackPose(impact + 0.056, duration, impact, true);
  assert.ok(aim.rightArm < -1.4 && release.rightArm < -1.4);
  assert.ok(recoil.lean < 0 && recoil.rightArm > release.rightArm && recoil.reach < 1);
  assert.deepEqual(
    attackPose(duration, duration, impact, true),
    attackPose(0, duration, impact, true),
  );
});

test('death has a preparatory buckle, floor compression, rebound and stable corpse', () => {
  const load = deathPose(0.055),
    impact = deathPose(0.4),
    rebound = deathPose(0.47);
  assert.ok(load.rotation < 0 && load.stretch < 1);
  assert.equal(impact.rotation, Math.PI / 2);
  assert.ok(impact.reach < 0.85 && rebound.height > impact.height);
  assert.deepEqual(deathPose(0.62), deathPose(20));
  for (let frame = 0; frame < 60; frame++) {
    const pose = deathPose(frame / 60),
      scale = volumeScale(pose.stretch, pose.reach);
    assert.ok(Math.abs(scale.x * scale.y * scale.z - 1) < 1e-12);
  }
});

test('hacky sack anticipation crosses the handoff continuously and follows through', () => {
  assert.ok(hackySackKick(0.9, true) > 0, 'draw the foot back before contact');
  assert.equal(hackySackKick(1, true), hackySackKick(0, false));
  assert.ok(hackySackKick(0.07, false) < hackySackKick(0, false));
  assert.ok(hackySackKick(0.2, false) > 0, 'brief recoil');
  assert.equal(hackySackKick(0.34, false), 0);
});
