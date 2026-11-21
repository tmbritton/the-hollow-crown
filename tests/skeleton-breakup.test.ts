import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ragdoll, deathImpulse } from '../src/ragdoll.ts';
import { humanoid, profiles } from '../src/rigs/humanoid.ts';
import { createPose, evaluatePose, transformPoint } from '../src/rigs/pose.ts';
import { PoseHistory } from '../src/rigs/history.ts';
import type { NavigationWorld } from '../src/navigation.ts';

function terrain(): NavigationWorld {
  const tiles: NavigationWorld['tiles'] = new Map();
  for (let x = -30; x <= 30; x++)
    for (let z = -6; z <= 6; z++) tiles.set(`${x},${z}`, { x, z, h: 0, surface: 'stone' });
  return { tiles, entities: [], blockers: [] };
}
function snapshot() {
  const pose = createPose(humanoid(profiles.skeleton));
  evaluatePose(pose);
  const history = new PoseHistory(pose);
  history.publish(0);
  return history.snapshot({ position: [0, 1, 0], heading: 0, velocity: [2, 1, 0] });
}

test('skeletons release eleven anatomical chunks at the exact entry pose with bounded seeded scatter', () => {
  const source = snapshot();
  const r = new Ragdoll(terrain(), source, [1, 0, 0], 20, 'bones');
  assert.equal(r.mode, 'separated');
  assert.equal(r.bodyCount, 11);
  assert.equal(r.constraintCount, 0);
  assert.deepEqual(Array.from(r.world), source.world);
  const impulse = deathImpulse([1, 0, 0], 20, 'bones');
  for (const [i, v] of r.velocities.entries()) {
    const extra = v.map((n, axis) => n - source.bodies[i].linear[axis] - impulse[axis]);
    assert.ok(Math.hypot(...extra) < 1.8);
    assert.ok(v[0] > 5, 'scatter cannot reverse the killing blow');
  }
  for (let i = 0; i < 30; i++) r.advance(0);
  assert.deepEqual(Array.from(r.world), source.world);
  for (let i = 0; i < 45; i++) r.advance(1 / 60);
  const pelvis = source.definition.index.pelvis * 16;
  const chest = source.definition.index.spine * 16;
  assert.ok(Math.hypot(...[12, 13, 14].map((a) => r.world[chest + a] - r.world[pelvis + a])) > 0.2);
  r.dispose();
});

test('scattered chunks retain terrain coverage and bounds far from the pelvis, then release all physics', () => {
  const source = snapshot();
  const fast = {
    ...source,
    bodies: source.bodies.map((b) =>
      b.joint === 'head' ? { ...b, linear: [24, 2, 0] as const } : b,
    ),
  };
  const r = new Ragdoll(terrain(), fast, null, 0);
  for (let i = 0; i < 500; i++) {
    r.advance(1 / 60);
    assert.ok(r.world.every(Number.isFinite));
    for (const body of source.bodies) {
      const joint = source.definition.joints.findIndex((j) => j.name === body.joint);
      const center = transformPoint(
        r.world,
        joint * 16,
        source.definition.bodies.find((b) => b.joint === body.joint)!.center,
      );
      assert.ok(center[1] > -0.02, `${body.joint} lost its floor`);
      assert.ok(Math.hypot(...center.map((n, a) => n - r.world[12 + a])) <= r.radius);
    }
    assert.ok(r.staticCount <= 11 * 25, 'flat-floor patch union is bounded');
  }
  const head = source.definition.index.head * 16;
  assert.ok(r.world[head + 12] - r.world[12] > 5, 'fixture separates beyond the old pelvis patch');
  assert.ok(r.settled && r.contacts > 0);
  assert.equal(r.bodyCount + r.constraintCount + r.staticCount, 0);
  const frozen = Array.from(r.world);
  r.advance(1);
  assert.deepEqual(Array.from(r.world), frozen);
  r.dispose();
  r.dispose();
});

test('breakup reproduces per death, varies between deaths, and hazards inherit motion only', () => {
  const source = snapshot();
  const outcomes = new Set<string>();
  for (let seed = 0; seed < 4; seed++) {
    const a = new Ragdoll(terrain(), source, [1, 0, 0], 20, `bones:${seed}`);
    const b = new Ragdoll(terrain(), source, [1, 0, 0], 20, `bones:${seed}`);
    for (let i = 0; i < 90; i++) {
      a.advance(1 / 60);
      b.advance(1 / 60);
    }
    assert.deepEqual(a.world, b.world);
    outcomes.add(JSON.stringify(Array.from(a.world)));
    a.dispose();
    b.dispose();
  }
  assert.equal(outcomes.size, 4);
  const hazard = new Ragdoll(terrain(), source, null, 1000);
  assert.deepEqual(
    hazard.velocities,
    source.bodies.map((b) => b.linear),
  );
  hazard.dispose();
});
