import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { ECS } from '../src/ecs.ts';
import type { Components } from '../src/ecs.ts';
import { createActor, moveActor, stopActor } from '../src/actors.ts';
import { animateActors, resetActorRig } from '../src/actorRendering.ts';
import { bindHumanoid } from '../src/rigs/bindings.ts';
import { profiles } from '../src/rigs/humanoid.ts';
import type { NavigationWorld } from '../src/navigation.ts';
import type { Tile } from '../src/worldTypes.ts';

test('review: stop/reset and settled death clear all IK hip translations and rotations', () => {
  const engine = new NullEngine();
  try {
    const scene = new Scene(engine),
      ecs = new ECS(),
      tiles = new Map<string, Tile>();
    for (let x = -10; x <= 10; x++)
      for (let z = -10; z <= 10; z++)
        tiles.set(`${x},${z}`, {
          x,
          z,
          h: x * 0.25,
          surface: 'stone',
          ramp: { axis: 'x', start: -10, distance: 20, sign: 1, a: -2.5, b: 2.5 },
        });
    const world: NavigationWorld = { tiles, blockers: [], entities: [] },
      actor = createActor(ecs, world, 'test', 'goblin', { x: 0, z: 0, h: 0 });
    const node = (name: string, parent: TransformNode | null, x = 0, y = 0) => {
      const n = new TransformNode(name, scene);
      n.parent = parent;
      n.position.set(x, y, 0);
      return n;
    };
    const root = node('root', null),
      body = node('body', root);
    body.setPivotPoint(new Vector3(0, 0.55, 0));
    const arms: TransformNode[] = [],
      forearms: TransformNode[] = [],
      legs: TransformNode[] = [],
      knees: TransformNode[] = [],
      feet: TransformNode[] = [];
    for (const side of [-1, 1]) {
      const arm = node('arm', body, side * 0.37, 1.02),
        forearm = node('forearm', arm, 0, -0.28),
        leg = node('leg', root, side * 0.18, 0.55),
        knee = node('knee', leg, 0, -0.25),
        foot = node('foot', knee, 0, -0.25);
      arms.push(arm);
      forearms.push(forearm);
      legs.push(leg);
      knees.push(knee);
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
    actor.entity.add('rig', rig);
    const binding = bindHumanoid(actor.entity, profiles.goblin);
    root.rotation.y = 1.3;
    const move = () => {
      for (let frame = 0; frame < 14; frame++) {
        moveActor(
          actor,
          world,
          { direction: { x: Math.sin(1.3), z: Math.cos(1.3) }, speed: 2.5 },
          1 / 60,
        );
        animateActors(ecs, 1 / 60, frame / 60, world);
      }
    };
    move();
    assert.ok(
      legs.some((l) => Math.abs(l.position.z) > 0.05),
      'fixture must produce real IK hip compensation',
    );
    const before = legs.map((l) => l.position.asArray());
    binding.captureLegacy();
    binding.commit();
    for (let i = 0; i < 2; i++)
      assert.ok(
        legs[i].position.asArray().every((v, k) => Math.abs(v - before[i][k]) < 1e-6),
        'handoff starts from current pose',
      );
    forearms[0].scaling.set(1 + Number.EPSILON, 1 - Number.EPSILON, 1);
    binding.captureLegacy();
    stopActor(actor);
    resetActorRig(rig, actor.position);
    assert.ok(
      forearms[0].scaling.equalsToFloats(1, 1, 1),
      'reset discards decomposed scale roundoff as well as rotations',
    );
    for (let i = 0; i < 2; i++) {
      assert.ok(
        legs[i].position
          .asArray()
          .every((v, k) => Math.abs(v - [i ? 0.18 : -0.18, 0.55, 0][k]) < 1e-10),
        'neutral anatomical hip',
      );
      assert.ok(legs[i].rotation.equalsToFloats(0, 0, 0));
    }
    assert.equal(binding.grounding.active, false);
    move();
    stopActor(actor);
    actor.entity.add('corpse', { age: 1 });
    animateActors(ecs, 1 / 60, 1, world);
    for (let i = 0; i < 2; i++) {
      assert.ok(
        legs[i].position
          .asArray()
          .every((v, k) => Math.abs(v - [i ? 0.18 : -0.18, 0.55, 0][k]) < 1e-10),
        'settled anatomical hip',
      );
      assert.ok(
        Math.abs(legs[i].rotation.y) < 1e-10 && Math.abs(legs[i].rotation.z) < 1e-10,
        'settled IK yaw/roll',
      );
    }
  } finally {
    engine.dispose();
  }
});
