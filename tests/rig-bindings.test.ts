import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { ECS } from '../src/ecs.ts';
import type { Components } from '../src/ecs.ts';
import { bindHumanoid } from '../src/rigs/bindings.ts';
import { profiles } from '../src/rigs/humanoid.ts';
import { setEuler, worldPoint } from '../src/rigs/pose.ts';

test('semantic binding preserves neutral geometry and writes independent head/limb poses without new nodes', () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const root = new TransformNode('root', scene),
      body = new TransformNode('body', scene);
    body.parent = root;
    body.setPivotPoint(new Vector3(0, 0.55, 0));
    const head = MeshBuilder.CreateBox('head', { size: 0.4 }, scene);
    head.parent = body;
    head.position.set(0, 1.57, 0);
    const arms = [],
      forearms = [],
      legs = [],
      knees = [],
      feet = [];
    for (const sign of [-1, 1]) {
      const arm = new TransformNode('arm', scene);
      arm.parent = body;
      arm.position.set(sign * 0.48, 1.18, 0);
      arms.push(arm);
      const forearm = new TransformNode('forearm', scene);
      forearm.parent = arm;
      forearm.position.y = -0.28;
      forearms.push(forearm);
      const leg = new TransformNode('leg', scene);
      leg.parent = root;
      leg.position.set(sign * 0.2, 0.55, 0);
      legs.push(leg);
      const knee = new TransformNode('knee', scene);
      knee.parent = leg;
      knee.position.y = -0.25;
      knees.push(knee);
      const foot = new TransformNode('foot', scene);
      foot.parent = knee;
      foot.position.y = -0.25;
      feet.push(foot);
    }
    const rig: Components['rig'] = {
      root,
      body,
      arms,
      forearms,
      legs,
      knees,
      feet,
      footPlants: [{ anchor: null }, { anchor: null }],
      attackBlend: 0,
      attackPose: null,
      socialBlend: 0,
      socialPose: null,
    };
    const entity = new ECS().create('actor').add('rig', rig);
    const nodes = scene.transformNodes.length,
      meshes = scene.meshes.length;
    head.computeWorldMatrix(true);
    const before = [...head.getWorldMatrix().m];
    const binding = bindHumanoid(entity, profiles.player, [head]);
    assert.equal(entity.require('rigPose'), binding);
    head.computeWorldMatrix(true);
    assert.ok(
      before.every((v, i) => Math.abs(v - head.getWorldMatrix().m[i]) < 1e-6),
      JSON.stringify({
        before,
        after: [...head.getWorldMatrix().m],
        root: root.position,
        body: body.position,
        head: head.position,
      }),
    );
    setEuler(binding.pose.local[binding.pose.definition.index.head], 0.4, 0.2, 0);
    binding.apply();
    head.computeWorldMatrix(true);
    assert.notDeepEqual(
      [...head.getWorldMatrix().m],
      before,
      'logical head joint really drives existing head geometry',
    );
    const hand = binding.pose.local[binding.pose.definition.index.leftForearm];
    setEuler(hand, -0.8, 0, 0);
    binding.apply();
    forearms[0].computeWorldMatrix(true);
    const actual = Vector3.TransformCoordinates(
      new Vector3(0, -0.27, 0),
      forearms[0].getWorldMatrix(),
    );
    const expected = worldPoint(binding.pose, 'leftHand');
    assert.ok(actual.asArray().every((v, i) => Math.abs(v - expected[i]) < 1e-6));
    assert.equal(scene.transformNodes.length, nodes);
    assert.equal(scene.meshes.length, meshes);
    assert.equal(head.parent, body);
    assert.equal(rig.footPlants, binding.legacy.footPlants);
    rig.attackBlend = 0.7;
    assert.equal(binding.legacy.attackBlend, 0.7);
    const current = [...binding.pose.world];
    binding.apply();
    assert.deepEqual([...binding.pose.world], current);
    binding.begin(1 / 60);
    binding.legacy.root.position.x = 10;
    binding.commit();
    assert.deepEqual([...binding.pose.previousWorld], current);
    binding.begin(0);
    binding.commit();
    assert.deepEqual(
      [...binding.pose.previousWorld],
      current,
      'zero-time application keeps previous-step history',
    );
    binding.invalidateHistory();
    binding.legacy.root.position.x = 1000;
    binding.commit();
    assert.deepEqual(
      [...binding.pose.previousWorld],
      [...binding.pose.world],
      'teleport/reset cannot become velocity',
    );
    scene.dispose();
    assert.throws(() => binding.apply(), /retired/);
  } finally {
    engine.dispose();
  }
});
