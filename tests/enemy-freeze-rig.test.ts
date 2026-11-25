import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { createActor } from '../src/actors.ts';
import { animateActors } from '../src/actorRendering.ts';
import { captureDeath } from '../src/deathHandoff.ts';
import { ECS } from '../src/ecs.ts';
import { ProfileWork } from '../src/enemyFreezeProfile.ts';
import { bindHumanoid } from '../src/rigs/bindings.ts';
import { profiles } from '../src/rigs/humanoid.ts';
import { worldPoint } from '../src/rigs/pose.ts';

function fixture(scene: Scene) {
  const ecs = new ECS();
  const world = { tiles: new Map(), blockers: [], entities: [] };
  const make = (kind: 'player' | 'goblin') => {
    const actor = createActor(ecs, world, kind, kind, { x: 0, z: 0, h: 0 });
    const node = (name: string, parent: TransformNode | null) => {
      const n = new TransformNode(name, scene);
      n.parent = parent;
      return n;
    };
    const pair = (name: string, parents: TransformNode[]) => parents.map((p) => node(name, p));
    const root = node('root', null),
      body = node('body', root);
    const arms = pair('arm', [body, body]),
      forearms = pair('forearm', arms);
    const legs = pair('leg', [root, root]),
      knees = pair('knee', legs),
      feet = pair('foot', knees);
    const equipment = [new Mesh('equipment', scene)];
    equipment[0].parent = root;
    actor.entity.add('rig', {
      root,
      body,
      arms,
      forearms,
      legs,
      knees,
      feet,
      equipment,
      footPlants: [{ anchor: null }, { anchor: null }],
    });
    return { actor, binding: bindHumanoid(actor.entity, profiles[kind]), root, equipment };
  };
  return { ecs, enemy: make('goblin'), hero: make('player') };
}

const close = (actual: readonly number[], expected: readonly number[]) =>
  assert.ok(
    actual.every((v, i) => Math.abs(v - expected[i]) < 1e-8),
    `${actual} != ${expected}`,
  );

test('held social foot and lethal handoff use rigid root translation and yaw, not limb velocity', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const {
    ecs,
    enemy: { actor, binding },
  } = fixture(new Scene(engine));
  const dt = 1 / 60;
  animateActors(ecs, 0);
  animateActors(ecs, dt, dt, undefined, 'poses');
  const offset = [0, 0.07, binding.pose.definition.profile.soleForward] as const;
  const foot = worldPoint(binding.pose, 'rightFoot', offset);
  Object.assign(actor.position, { x: 3, z: -2, h: 1, heading: Math.PI / 2 });
  animateActors(ecs, dt, 2 * dt, undefined, 'poses');
  close(binding.jointPoint('rightFoot', offset), [3 + foot[2], 1 + foot[1], -2 - foot[0]]);

  // Lethal combat can run after the motor but before this tick's render sync.
  actor.position.heading += Math.PI / 4;
  actor.position.x += 0.1;
  actor.motion.velocity = { x: 6, z: -1 };
  const { pose } = captureDeath(ecs, actor, 3 * dt, 1000);
  assert.ok(pose);
  const yawRate = Math.PI / 4 / dt;
  close(pose.world.slice(12, 15), [3.1, 1, -2]);
  close(pose.world.slice(8, 11), [Math.SQRT1_2, 0, -Math.SQRT1_2]);
  for (const body of pose.bodies) {
    close(body.angular, [0, yawRate, 0]);
    close(body.linear, [
      6 + yawRate * (body.position[2] + 2),
      0,
      -1 - yawRate * (body.position[0] - 3.1),
    ]);
  }
  animateActors(ecs, dt, 3 * dt, undefined, 'poses');
  const postSync = captureDeath(ecs, actor, 3 * dt, 1000).pose!;
  assert.deepEqual(postSync.angular, pose.angular);
  const stoppedBeforeSync = captureDeath(ecs, actor, 4 * dt, 1000).pose!;
  assert.ok(stoppedBeforeSync.angular.every((v) => v === 0));
  for (const body of stoppedBeforeSync.bodies) close(body.linear, [6, 0, -1]);
  animateActors(ecs, dt, 4 * dt, undefined, 'poses');
  assert.ok(captureDeath(ecs, actor, 4 * dt, 1000).pose!.angular.every((v) => v === 0));
});

test('animateActors records skipped prep and local work but not root writes, visibility, or hero work', (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const { ecs, enemy, hero } = fixture(new Scene(engine));
  animateActors(ecs, 0);
  let now = 0;
  const work = new ProfileWork(() => now);
  const charge =
    <A extends unknown[], R>(fn: (...args: A) => R, cost: number) =>
    (...args: A): R => {
      now += cost;
      return fn(...args);
    };
  enemy.binding.begin = charge(enemy.binding.begin.bind(enemy.binding), 2);
  enemy.binding.actions.layer = charge(enemy.binding.actions.layer.bind(enemy.binding.actions), 3);
  const limb = enemy.actor.entity.require('rig').body.position;
  limb.set = charge(limb.set.bind(limb), 5);
  enemy.root.position.set = charge(enemy.root.position.set.bind(enemy.root.position), 11);
  const equipment = enemy.equipment[0];
  equipment.setEnabled = charge(equipment.setEnabled.bind(equipment), 13);
  hero.binding.begin = charge(hero.binding.begin.bind(hero.binding), 17);
  hero.binding.actions.layer = charge(hero.binding.actions.layer.bind(hero.binding.actions), 19);
  work.begin();
  animateActors(ecs, 1 / 60, 0, undefined, 'control', work);
  assert.equal(now, 70);
  const live = work.begin();
  now = 0;
  animateActors(ecs, 1 / 60, 0, undefined, 'poses', work);
  const held = work.begin();
  assert.equal(now, 60);
  assert.equal(live?.poses, 1);
  assert.equal(live?.rigMs, 10);
  assert.equal(held?.poses, 0);
  assert.equal(held?.rigMs, 0);
});
