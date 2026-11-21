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
import { Ragdoll } from '../src/ragdoll.ts';
import { readCorpseTerrain } from '../src/corpseRendering.ts';
import { DeathPhysics } from '../src/deathPhysics.ts';
import type { DeathHandoff } from '../src/deathHandoff.ts';

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
    };
    const ecs = new ECS();
    const entity = ecs
      .create('actor')
      .add('rig', rig)
      .add('render', { root, meshes: [head] });
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
    binding.sampleSurfaces();
    assert.equal(binding.surfaces.length, 2);
    const corners = binding.surfaces[0].bounds.corners!;
    const bounds = head.getBoundingInfo().boundingBox;
    for (let i = 0; i < 8; i++) {
      const point = Vector3.TransformCoordinates(
        new Vector3(
          i & 4 ? bounds.maximum.x : bounds.minimum.x,
          i & 2 ? bounds.maximum.y : bounds.minimum.y,
          i & 1 ? bounds.maximum.z : bounds.minimum.z,
        ),
        head.getWorldMatrix(),
      );
      assert.ok(point.asArray().every((v, axis) => Math.abs(v - corners[i * 3 + axis]) < 1e-6));
    }
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
    assert.equal(rig.footPlants[0], binding.grounding.contacts[0].plant);
    assert.ok(!('legacy' in binding) && !('attackBlend' in rig));
    const current = [...binding.pose.world];
    binding.apply();
    assert.deepEqual([...binding.pose.world], current);
    binding.begin(1 / 60);
    binding.pose.local[0].position.x = 10;
    binding.apply();
    assert.deepEqual([...binding.pose.previousWorld], current);
    binding.begin(0);
    binding.apply();
    assert.deepEqual(
      [...binding.pose.previousWorld],
      current,
      'zero-time application keeps previous-step history',
    );
    binding.invalidateHistory();
    binding.pose.local[0].position.x = 1000;
    binding.apply();
    assert.deepEqual(
      [...binding.pose.previousWorld],
      [...binding.pose.world],
      'teleport/reset cannot become velocity',
    );
    binding.reset({ x: 0, h: 3, z: 0 }, 0);
    binding.pose.local[0].scale.set(0.8, 1.3, 0.9);
    setEuler(binding.pose.local[binding.pose.definition.index.leftUpperArm], -0.6, 0.3, 0.4);
    binding.apply();
    const physics = new Ragdoll(
      { tiles: new Map(), blockers: [], entities: [] },
      binding.history.snapshot(),
      [1, 0, 0],
      20,
    );
    entity.add('ragdoll', physics);
    for (let frame = 0; frame < 30; frame++) {
      physics.advance(1 / 60);
      binding.applyPhysics(physics.world);
      forearms[0].computeWorldMatrix(true);
      const actual = Vector3.TransformCoordinates(
        new Vector3(0, -0.27, 0),
        forearms[0].getWorldMatrix(),
      );
      const expected = worldPoint(binding.pose, 'leftHand');
      assert.ok(
        actual.asArray().every((v, i) => Math.abs(v - expected[i]) < 1e-5),
        'rigid physics must not introduce parent-scale shear',
      );
    }
    physics.freeze();
    entity.add('corpse', { age: 1 }).add('transform', { x: 0, h: 0, z: 0, heading: 0 });
    head.computeWorldMatrix(true);
    const physicalHead = [...head.getWorldMatrix().m];
    readCorpseTerrain(ecs);
    assert.deepEqual(
      [...head.getWorldMatrix().m],
      physicalHead,
      'settled surface reads cannot rewrite frozen physics matrices',
    );
    binding.reset();
    assert.equal(root.isWorldMatrixFrozen, false);
    assert.equal(entity.has('ragdoll'), false);
    assert.equal(physics.bodyCount, 0);
    const handoff: DeathHandoff = {
      run: ecs,
      target: entity,
      source: null,
      time: 0,
      kind: 'melee',
      magnitude: 20,
      travel: [1, 0, 0],
      position: [0, 0, 0],
      heading: 0,
      velocity: [0, 0, 0],
      pose: binding.history.snapshot(),
    };
    entity.add('deathHandoff', handoff);
    const owner = new DeathPhysics(ecs, { tiles: new Map(), blockers: [], entities: [] });
    owner.advance(0);
    assert.equal(entity.require('ragdoll').bodyCount, 11);
    const firstIsland = entity.require('ragdoll');
    entity.remove('ragdoll');
    owner.advance(0);
    assert.equal(
      entity.has('ragdoll'),
      false,
      'removing physical ownership cannot replay its lethal handoff',
    );
    assert.equal(firstIsland.bodyCount, 0);
    entity.add('deathHandoff', handoff);
    owner.advance(0);
    assert.equal(entity.has('ragdoll'), false, 'consumed handoff identity cannot be resubmitted');
    entity.add('deathHandoff', { ...handoff, time: 1 });
    owner.advance(0);
    assert.equal(entity.require('ragdoll').bodyCount, 11);
    owner.dispose();
    owner.advance(1 / 60);
    assert.equal(entity.has('ragdoll'), false, 'disposed run cannot readmit deaths');
    assert.equal(root.isWorldMatrixFrozen, false, 'disposing physics restores binding ownership');
    scene.dispose();
    assert.throws(() => binding.apply(), /retired/);
    assert.throws(() => binding.history.snapshot(), /retired/);
    assert.equal(entity.has('rigPose'), false);
  } finally {
    engine.dispose();
  }
});
