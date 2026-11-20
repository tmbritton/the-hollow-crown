import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECS } from '../src/ecs.ts';
import { createActor, requestDefense } from '../src/actors.ts';
import { animateLocomotion } from '../src/locomotion.ts';
import { humanoid, profiles } from '../src/rigs/humanoid.ts';
import { GroundedLocomotion } from '../src/rigs/grounding.ts';
import { ActionRig } from '../src/rigs/actions.ts';
import {
  createPose,
  evaluatePose,
  inverse,
  setEuler,
  socketPoint,
  transformPoint,
} from '../src/rigs/pose.ts';
import { copyLocal } from '../src/rigs/ikMath.ts';
import { WorkAction } from '../src/machines/actors/work.ts';
import { Cargo } from '../src/cargo.ts';
import { ATTACKS } from '../src/attackKinds.ts';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { FrameAttachment } from '../src/rigs/attachments.ts';

test('action-owned two-hand frames coordinate with support without changing gameplay', () => {
  for (const kind of ['player', 'goblin', 'kobold'] as const) {
    const world = { tiles: new Map(), blockers: [], entities: [] };
    const actor = createActor(new ECS(), world, kind, kind, { x: 3, z: -2, h: 0.3 });
    const definition = humanoid(profiles[kind]);
    const actions = new ActionRig(definition);
    const ground = new GroundedLocomotion(definition, [{ anchor: null }, { anchor: null }]);
    for (const mode of ['carry', 'crossbow', 'spear', 'guard', 'smoke'] as const) {
      if (mode === 'smoke' && kind === 'player') continue;
      if (mode === 'crossbow' && kind !== 'goblin') continue;
      if (mode === 'spear' && kind !== 'kobold') continue;
      for (let frame = 0; frame <= 60; frame++) {
        const motion = animateLocomotion(actor.motion.animation, 0, false, 1 / 60);
        actions.mode = mode;
        actions.extension = frame / 60;
        actions.pitch = mode === 'spear' ? (-Math.PI / 2) * (1 - frame / 60) : 0;
        actions.gate = mode === 'guard';
        actions.opening = mode === 'guard' ? frame / 60 : 0;
        const before = JSON.stringify(actor.position);
        const result = ground.sample(actor, motion, 0.7, undefined, [], actions);
        actions.finish(result.pose);
        for (const side of ['left', 'right'] as const) {
          const target = actions.targets[`${side}Grip`];
          if (target.release) continue;
          const actual = socketPoint(result.pose, `${side}Grip`);
          const expected = target.position;
          const error = Math.hypot(...actual.map((v, i) => v - expected[i]));
          assert.ok(error <= 0.01, `${kind}/${mode}/${frame}/${side}: ${error}`);
          assert.ok(result.residuals[`${side}Grip`].orientation <= Math.PI / 180);
        }
        assert.ok(ground.minimumClearance >= -0.001);
        assert.ok(result.passes <= 4 && result.limbSolves <= 16);
        assert.equal(JSON.stringify(actor.position), before);
        if (mode === 'carry') {
          for (const side of ['left', 'right'] as const) {
            const grip = transformPoint(actions.frames.cargo, 0, [
              side === 'left' ? -0.325 : 0.325,
              0.25,
              0,
            ]);
            const hand = socketPoint(result.pose, `${side}Grip`);
            assert.ok(Math.hypot(...hand.map((v, i) => v - grip[i])) < 0.01);
          }
        }
      }
    }
  }
});

function fixture(kind: keyof typeof profiles = 'player') {
  const ecs = new ECS();
  const world = { tiles: new Map(), blockers: [], entities: [] };
  const actor = createActor(ecs, world, kind, kind, { x: 3, z: -2, h: 0.3 });
  const definition = humanoid(profiles[kind]);
  const actions = new ActionRig(definition);
  const ground = new GroundedLocomotion(definition, [{ anchor: null }, { anchor: null }]);
  const motion = () => animateLocomotion(actor.motion.animation, 0, false, 0);
  return { ecs, actor, actions, ground, motion };
}

test('throw release is a same-clock input, and zero-time replays retain contacts and frame buffers', () => {
  const { actor, actions, ground, motion } = fixture('kobold');
  actions.mode = 'throw';
  actions.extension = 1;
  const pose = motion();
  const result = ground.sample(actor, pose, 0.7, undefined, [], actions);
  assert.equal(result.residuals.rightGrip.active, true);
  assert.equal(result.residuals.leftGrip.active, false, 'throw explicitly releases support hand');
  const saved = [...result.pose.world];
  const buffers = Object.values(actions.frames);
  for (let i = 0; i < 5; i++) {
    ground.sample(actor, pose, 0.7, undefined, [], actions);
    actions.finish(result.pose);
    assert.deepEqual([...result.pose.world], saved);
    assert.ok(Object.values(actions.frames).every((frame, i) => frame === buffers[i]));
  }
  actions.released = true;
  ground.sample(actor, pose, 0.7, undefined, [], actions);
  assert.equal(
    result.residuals.rightGrip.active,
    false,
    'release cannot reuse the prior cached grip',
  );
  actions.reset();
  ground.reset();
  ground.sample(actor, pose, 0.7, undefined, [], actions);
  assert.ok(!result.residuals.leftGrip.active && !result.residuals.rightGrip.active);
  assert.equal(actions.released, false);
});

test('work and interrupted attacks retain their current layer without advancing authoritative clocks', () => {
  const { ecs, actor, actions, motion } = fixture();
  const work = new WorkAction(actor.entity, 'fixture');
  actor.entity.add('work', work);
  work.chart.send({ type: 'START', id: 'cycle', duration: 6.9 });
  work.chart.send({ type: 'TICK', dt: 2.3 });
  const snapshot = work.snapshot();
  actions.layer(actor, ecs, motion(), 100, 1 / 60, false);
  assert.equal(actions.mode, 'work');
  const sampled = actions.socialPose;
  const weight = actions.socialBlend;
  actions.layer(actor, ecs, motion(), 500, 0, false);
  assert.deepEqual(actions.socialPose, sampled, 'work samples work.elapsed, never scene time');
  assert.deepEqual(work.snapshot(), snapshot);
  work.interrupt('fixture');
  actions.layer(actor, ecs, motion(), 501, 1 / 60, false);
  assert.equal(actions.mode, 'free');
  assert.ok(actions.socialBlend < weight && actions.socialBlend > 0);
  assert.deepEqual(actions.socialPose, sampled, 'interruption fades from current work pose');
  actor.attack.start(
    {
      target: 'target',
      elapsed: 0,
      resolved: false,
      kind: 'MELEE',
      duration: ATTACKS.MELEE.duration,
      impact: ATTACKS.MELEE.impact,
    },
    1,
  );
  actor.attack.advance(0.18);
  actions.layer(actor, ecs, motion(), 502, 1 / 60, false);
  const attack = { ...actor.attack.swing! };
  const strike = actions.attackPose;
  actions.layer(actor, ecs, motion(), 503, 0, false);
  assert.deepEqual(actor.attack.swing, attack);
  actor.attack.interrupt();
  actions.layer(actor, ecs, motion(), 504, 1 / 60, false);
  assert.deepEqual(actions.attackPose, strike);
  assert.ok(actions.attackBlend > 0);
  actions.reset();
  assert.equal(actions.attackPose, null);
  assert.equal(actions.socialPose, null);
});

test('porters explicitly free combat hands while cargo ownership survives guard and cancellation', () => {
  const { ecs, actor, actions, ground, motion } = fixture();
  const cargo = new Cargo();
  assert.equal(cargo.claim(actor.entity), true);
  cargo.commit(actor.entity, 'pickup');
  const sample = () => {
    const pose = motion();
    actions.layer(actor, ecs, pose, 0, 1 / 60, true);
    actions.equipment(actor, pose);
    const result = ground.sample(actor, pose, 0, undefined, [], actions);
    actions.finish(result.pose);
    return result;
  };
  sample();
  assert.equal(actions.mode, 'carry');
  assert.equal(actions.stowed, true);
  assert.equal(actions.targets.rightGrip.release, false);
  requestDefense(actor);
  sample();
  assert.equal(actions.mode, 'guard');
  assert.equal(actions.stowed, false, 'the real guard cannot be visually stowed');
  assert.equal(actions.targets.rightGrip.release, true);
  assert.equal(actions.carrying, true);
  assert.ok(actions.frames.cargo[14] < actor.position.z, 'cargo is explicitly slung for combat');
  assert.equal(cargo.state, 'carried');
  assert.equal(cargo.owner, actor.entity);
  actor.entity.require('defense').release();
  sample();
  assert.equal(actions.mode, 'carry');
  assert.ok(actions.frames.cargo[14] > actor.position.z);
});

test('temporary collapse starts from solved local pose and is independent of sampling frequency', () => {
  const { actor, actions, ground, motion } = fixture('kobold');
  actions.mode = 'spear';
  actions.pitch = 0;
  actions.extension = 0.8;
  const authored = motion();
  authored.stretch = 0.94;
  authored.reach = 1 / Math.sqrt(0.94);
  const solved = ground.sample(actor, authored, 0.7, undefined, [], actions).pose;
  const pose = createPose(solved.definition),
    other = createPose(solved.definition);
  copyLocal(solved.local, pose.local);
  copyLocal(solved.local, other.local);
  evaluatePose(pose);
  evaluatePose(other);
  const start = [...pose.world];
  const direct = new ActionRig(solved.definition);
  actions.collapse(pose, actor, 0);
  direct.collapse(other, actor, 0);
  assert.ok(pose.world.every((v, i) => Math.abs(v - start[i]) < 1e-10));
  for (let i = 1; i <= 37; i++) actions.collapse(pose, actor, i / 60);
  direct.collapse(other, actor, 37 / 60);
  assert.deepEqual([...pose.world], [...other.world]);
  const once = [...pose.world];
  for (let i = 0; i < 5; i++) actions.collapse(pose, actor, 37 / 60);
  assert.deepEqual([...pose.world], once);
  actions.collapse(pose, actor, 1);
  assert.equal(pose.local[pose.definition.index.pelvis].position.x, 0);
  assert.equal(pose.local[pose.definition.index.pelvis].position.y, 0.55);
  assert.equal(actions.targets.leftGrip.release, true);
  assert.equal(actions.targets.rightGrip.release, true);
  actions.reset();
  copyLocal(solved.local, pose.local);
  setEuler(pose.local[pose.definition.index.spine], 0.25, 0, 0);
  actions.collapse(pose, actor, 0);
  assert.ok(
    Math.abs(pose.local[pose.definition.index.spine].rotation.x - Math.sin(0.125)) < 1e-12,
    'reset captures a fresh death pose',
  );
  actions.reset();
  actor.position.heading = 1.2;
  actions.collapse(pose, actor, 1);
  const expected = createPose(pose.definition);
  setEuler(expected.local[0], Math.PI / 2, 1.2, 0);
  assert.deepEqual(
    pose.local[0].rotation,
    expected.local[0].rotation,
    'a directly installed settled corpse uses its current world heading, not an unrelated old pose',
  );
});

test('actual attachment matrices preserve both grips under nonuniform authored scale', () => {
  const engine = new NullEngine();
  try {
    const scene = new Scene(engine),
      root = new TransformNode('root', scene),
      item = new TransformNode('item', scene);
    item.parent = root;
    const attachment = new FrameAttachment(item);
    const parentInverse = new Float64Array(16);
    const { actor, actions, ground, motion } = fixture('kobold');
    for (const mode of ['spear', 'guard', 'carry'] as const) {
      actions.mode = mode;
      for (let i = 0; i <= 60; i++) {
        actions.pitch = (-Math.PI / 2) * (1 - i / 60);
        actions.opening = i / 60;
        actions.extension = i / 60;
        const pose = motion();
        pose.stretch = 0.9 + i / 300;
        pose.reach = 1 / Math.sqrt(pose.stretch);
        const solved = ground.sample(actor, pose, 0.7, undefined, [], actions).pose;
        root.position.set(actor.position.x, actor.elevation, actor.position.z);
        root.rotation.y = 0.7;
        const scale = solved.local[0].scale;
        root.scaling.set(scale.x, scale.y, scale.z);
        const frame =
          actions.frames[mode === 'guard' ? 'shield' : mode === 'carry' ? 'cargo' : 'spear'];
        inverse(solved.world, 0, parentInverse);
        attachment.apply(frame, parentInverse);
        item.computeWorldMatrix(true);
        const actual = item.getWorldMatrix().m;
        assert.ok(
          frame.every((v, k) => Math.abs(v - actual[k]) < 1e-6),
          `${mode}/${i}: actual mesh matrix differs from its authored grip frame: ${JSON.stringify({ frame: [...frame], actual: [...actual], rotation: item.rotation.asArray() })}`,
        );
      }
    }
  } finally {
    engine.dispose();
  }
});
