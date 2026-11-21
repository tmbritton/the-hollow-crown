import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PoseHistory } from '../src/rigs/history.ts';
import { humanoid, profiles } from '../src/rigs/humanoid.ts';
import { withTail } from '../src/rigs/tail.ts';
import { createPose, evaluatePose, setEuler } from '../src/rigs/pose.ts';
import { ECS } from '../src/ecs.ts';
import { createActor, moveActor, stopActor, requestDefense, teleportActor } from '../src/actors.ts';
import { CombatSystem } from '../src/combat.ts';
import type { NavigationWorld } from '../src/navigation.ts';
import { heightAt } from '../src/world.ts';

const near = (a: readonly number[], b: readonly number[], epsilon = 1e-8) => {
  assert.equal(a.length, b.length);
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < epsilon, `${i}: ${v} != ${b[i]}`));
};
function fixture() {
  const pose = createPose(withTail(humanoid(profiles.kobold)));
  const history = new PoseHistory(pose);
  evaluatePose(pose);
  history.publish(0);
  return { pose, history, root: pose.local[0] };
}

test('final pose history supplies detached world velocities, including the tail, without replay drift', () => {
  const { pose, history, root } = fixture();
  root.position.x = 0.1;
  setEuler(pose.local[pose.definition.tail![0].index], 0, 0.03, 0);
  evaluatePose(pose);
  history.publish(1 / 60);
  const first = history.snapshot();
  near(first.linear.slice(0, 3), [6, 0, 0]);
  near(
    first.angular.slice(pose.definition.tail![0].index * 3, pose.definition.tail![0].index * 3 + 3),
    [0, 1.8, 0],
  );
  assert.ok(first.bodies.some((b) => b.joint === 'tailTip'));
  for (let i = 0; i < 20; i++) history.publish(0);
  assert.deepEqual(history.snapshot(), first);
  assert.ok(
    Object.isFrozen(first) &&
      Object.isFrozen(first.world) &&
      Object.isFrozen(first.bodies[0].linear),
  );
  root.position.x = 0.2;
  evaluatePose(pose);
  history.publish(1 / 60);
  assert.notDeepEqual(history.snapshot().world, first.world);
  assert.equal(first.world[12], 0.1, 'detached handoff cannot follow later animation');
});

test('angular velocity uses shortest world quaternion delta across wrapping and nonuniform scale', () => {
  const { pose, history, root } = fixture();
  root.scale.set(0.8, 1.4, 1.1);
  setEuler(root, 0, Math.PI - 0.01, 0);
  evaluatePose(pose);
  history.invalidate();
  history.publish(0);
  setEuler(root, 0, -Math.PI + 0.01, 0);
  evaluatePose(pose);
  history.publish(1 / 60);
  near(history.snapshot().angular.slice(0, 3), [0, 1.2, 0]);
  assert.ok(history.snapshot().angular.every(Number.isFinite));
});

test('death rebasing replaces inherited translation exactly once and keeps articulation and stable body dimensions', () => {
  const { pose, history, root } = fixture();
  root.position.set(0.1, 0.05, 0);
  evaluatePose(pose);
  history.publish(1 / 60);
  const moved = history.snapshot({
    position: [8, 3, 2],
    heading: Math.PI / 2,
    velocity: [4, 2, -1],
  });
  near(moved.world.slice(12, 15), [8, 3, 2]);
  near(moved.linear.slice(0, 3), [4, 2, -1]);
  for (const b of moved.bodies) {
    near(b.linear, [4, 2, -1]);
    near(b.size, pose.definition.bodies.find((d) => d.joint === b.joint)!.size);
  }
  assert.ok(moved.bodies.every((b, i) => b.parent < i));
  assert.ok(moved.bodies.every((b) => Math.abs(Math.hypot(...b.rotation) - 1) < 1e-10));
  near(history.snapshot().world.slice(12, 15), [0.1, 0.05, 0]);
});

test('reset, first sample and changed zero-time poses never synthesize a launch velocity', () => {
  const { pose, history, root } = fixture();
  root.position.x = 1000;
  evaluatePose(pose);
  history.invalidate();
  history.publish(1 / 60);
  assert.ok(history.snapshot().linear.every((v) => v === 0));
  assert.deepEqual(pose.previousWorld, pose.world);
  root.position.z = -500;
  evaluatePose(pose);
  history.publish(0);
  assert.ok(history.snapshot().linear.every((v) => v === 0));
  assert.ok(history.snapshot().angular.every((v) => v === 0));
  assert.throws(() => history.publish(-1), /time|duration/);
});

test('lethal damage captures blow and pre-stop airborne motion once; respawn retires the handoff', () => {
  const ecs = new ECS();
  const world: NavigationWorld = { tiles: new Map(), blockers: [], entities: [] };
  for (let x = -3; x <= 3; x++)
    for (let z = -3; z <= 3; z++) world.tiles.set(`${x},${z}`, { x, z, h: 0, surface: 'stone' });
  const a = createActor(ecs, world, 'victim', 'player', { x: 0, z: 0, h: 0 });
  const source = createActor(ecs, world, 'source', 'skeleton', { x: 0, z: 1, h: 0 });
  const combat = new CombatSystem(ecs, world, [a, source]);
  a.motion.velocity = { x: 3, z: -2 };
  a.jump.height = 0.5;
  a.jump.velocity = 4;
  const travel = { x: 3, z: -4, h: 12 };
  combat.damage(a, 1000, source, { kind: 'projectile', travel });
  const handoff = a.entity.require('deathHandoff');
  assert.equal(handoff.run, ecs);
  assert.equal(handoff.target, a.entity);
  assert.equal(handoff.source, source.entity);
  near(handoff.velocity, [3, 4, -2]);
  near(handoff.position, [0, 0.5, 0]);
  near(handoff.travel!, [3 / 13, 12 / 13, -4 / 13]);
  travel.z = 100;
  assert.equal(handoff.travel![2], -4 / 13);
  assert.equal(a.motion.velocity.x, 0);
  assert.equal(a.jump.height, 0);
  assert.equal(handoff.pose, null, 'headless simulation has no invented render pose');
  combat.damage(a, 1000, source);
  assert.equal(a.entity.require('deathHandoff'), handoff);
  a.entity.remove('corpse');
  a.health.current = 100;
  teleportActor(a, world, { x: 1, z: 0 });
  assert.equal(a.entity.has('deathHandoff'), false);
});

test('nonlethal hits, guard and invulnerability do not install a death handoff; hazards have no invented blow', () => {
  const ecs = new ECS(),
    world: NavigationWorld = { tiles: new Map(), blockers: [], entities: [] };
  const a = createActor(ecs, world, 'a', 'player', { x: 0, z: 0, h: 0 });
  const combat = new CombatSystem(ecs, world, [a]);
  a.position.heading = 0;
  requestDefense(a);
  combat.damage(a, 1000, undefined, { kind: 'melee', travel: { x: 0, z: -1 } });
  assert.equal(a.entity.has('deathHandoff'), false);
  a.entity.require('defense').release();
  combat.damage(a, 1);
  assert.equal(a.entity.has('deathHandoff'), false);
  a.health.invulnerable = 1;
  combat.damage(a, 1000);
  assert.equal(a.entity.has('deathHandoff'), false);
  a.health.invulnerable = 0;
  combat.damage(a, 1000);
  assert.equal(a.entity.require('deathHandoff').travel, null);
});

test('grounded handoff uses current motor support motion and stop/teleport/locked steps clear it', () => {
  for (const direction of [-1, 1]) {
    const ecs = new ECS(),
      world: NavigationWorld = { tiles: new Map(), blockers: [], entities: [] };
    for (let x = -4; x <= 4; x++)
      for (let z = -2; z <= 2; z++)
        world.tiles.set(`${x},${z}`, {
          x,
          z,
          h: x / 4,
          surface: 'stone',
          ramp: { axis: 'x', start: -4, distance: 8, sign: 1, a: -1, b: 1 },
        });
    const a = createActor(ecs, world, 'a', 'player', { x: 0, z: 0, h: heightAt(world, 0, 0)! });
    const move = () => moveActor(a, world, { direction: { x: direction, z: 0 }, speed: 4 }, 1 / 60);
    move();
    assert.ok(Math.abs(a.motion.supportVelocity) > 0.01);
    moveActor(a, world, { locked: true }, 1 / 60);
    assert.equal(a.motion.supportVelocity, 0);
    move();
    stopActor(a);
    assert.equal(a.motion.supportVelocity, 0);
    move();
    teleportActor(a, world, { x: -direction, z: 0 });
    assert.equal(a.motion.supportVelocity, 0);
    const before = a.position.h;
    move();
    const expected = (a.position.h - before) * 60;
    const combat = new CombatSystem(ecs, world, [a]);
    combat.damage(a, 1000);
    assert.ok(Math.abs(expected) > 0.01);
    assert.ok(Math.abs(a.entity.require('deathHandoff').velocity[1] - expected) < 1e-10);
    assert.equal(a.motion.supportVelocity, 0);
  }
});
