import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ragdoll, deathImpulse, physicalTerrain } from '../src/ragdoll.ts';
import { humanoid, profiles } from '../src/rigs/humanoid.ts';
import { withTail } from '../src/rigs/tail.ts';
import { createPose, evaluatePose, setEuler } from '../src/rigs/pose.ts';
import { PoseHistory } from '../src/rigs/history.ts';
import type { NavigationWorld } from '../src/navigation.ts';
import type { XYZ } from '../src/rigs/types.ts';

function terrain(stairs = false): NavigationWorld {
  const tiles: NavigationWorld['tiles'] = new Map();
  for (let x = -10; x <= 10; x++)
    for (let z = -5; z <= 5; z++)
      tiles.set(`${x},${z}`, {
        x,
        z,
        h: stairs ? Math.max(0, 3 - Math.max(0, x) * 0.35) : 0,
        surface: stairs ? 'stair' : 'stone',
      });
  return { tiles, entities: [], blockers: [] };
}
function snapshot(position: XYZ = [0, 0, 0], velocity: XYZ = [0, 0, 0]) {
  const pose = createPose(withTail(humanoid(profiles.kobold)));
  setEuler(pose.local[pose.definition.index.leftUpperArm], -0.8, 0.2, 0.1);
  evaluatePose(pose);
  const history = new PoseHistory(pose);
  history.publish(0);
  return history.snapshot({ position, heading: 0, velocity });
}
function run(r: Ragdoll, frames: number) {
  for (let i = 0; i < frames; i++) r.advance(1 / 60);
}

test('active physics checks door state only in streamed patches', () => {
  const w = terrain();
  let reads = 0;
  w.entities.push({
    type: 'door',
    id: 'far',
    axis: 'z',
    x: 30,
    z: -30,
    h: 0,
    locked: false,
    requiresAltar: false,
    get open() {
      reads++;
      return false;
    },
  });
  const r = new Ragdoll(w, snapshot(), null, 0);
  run(r, 2);
  r.dispose();
  assert.equal(reads, 0);
});

test('death impulse follows 3D travel, is bounded, and hazards invent no horizontal blow', () => {
  assert.deepEqual(deathImpulse(null, 1000), [0, 0, 0]);
  for (const direction of [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    [0, -0.6, 0.8],
  ] as const) {
    const v = deathImpulse(direction, 1000);
    assert.ok(Math.hypot(...v) <= 9);
    assert.ok(v[0] * direction[0] + v[2] * direction[2] > 4);
  }
});

test('physics inherits the exact solved pose and velocity once, including tail, and pauses at zero time', () => {
  const start = snapshot([0, 2, 0], [3, 2, -1]);
  const r = new Ragdoll(terrain(), start, null, 0);
  assert.equal(r.bodyCount, 15);
  assert.equal(r.constraintCount, 14);
  start.world.forEach((v, i) => assert.ok(Math.abs(v - r.world[i]) < 1e-9));
  r.velocities.forEach((v) => assert.deepEqual(v, [3, 2, -1]));
  const first = Array.from(r.world);
  for (let i = 0; i < 20; i++) r.advance(0);
  assert.deepEqual(Array.from(r.world), first);
  run(r, 3);
  assert.ok(r.world[12] > 0.1);
  assert.ok(r.world.every(Number.isFinite));
  r.dispose();
  assert.equal(r.bodyCount + r.constraintCount + r.staticCount, 0);
});

test('directional deaths travel several feet, stay joined, settle and release active resources', () => {
  for (const direction of [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
  ] as const) {
    const r = new Ragdoll(terrain(), snapshot(), direction, 20);
    run(r, 120);
    assert.ok(r.world[12] * direction[0] + r.world[14] * direction[2] > 1.5);
    assert.ok(r.maxJointError < 0.12, `joint separation ${r.maxJointError}`);
    run(r, 480);
    assert.ok(r.settled);
    assert.equal(r.bodyCount + r.constraintCount + r.staticCount, 0);
    const settled = Array.from(r.world);
    run(r, 60);
    assert.deepEqual(Array.from(r.world), settled);
  }
});

test('walls stop launched bodies, and actual discrete treads permit a constrained stair fall', () => {
  const w = terrain();
  w.blockers.push({ id: 'wall', x: 2.8, z: 0, w: 0.5, d: 10 });
  const wall = new Ragdoll(w, snapshot(), [1, 0, 0], 100);
  run(wall, 180);
  assert.ok(wall.world[12] < 2.55);
  assert.ok(wall.contacts > 0);
  const stairs = terrain(true);
  const treads = physicalTerrain(stairs, [3, 2, 0]);
  assert.ok(treads.some((b) => b.name === 'floor:3,0' && Math.abs(b.top - 1.98) < 1e-9));
  const fall = new Ragdoll(stairs, snapshot([0, 3.03, 0]), [1, 0, 0], 30);
  run(fall, 240);
  assert.ok(fall.world[12] > 2);
  assert.ok(fall.world[13] < 2.2);
  assert.ok(fall.contacts > 10);
  assert.ok(fall.maxJointError < 0.12);
  wall.dispose();
  fall.dispose();
});

test('per-death variation is reproducible, diverse, and preserves the incoming direction', () => {
  const poses = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const seed = `MOURNING-731:victim:${i}`;
    const impulse = deathImpulse([1, 0, 0], 20, seed);
    assert.ok(impulse[0] > 5 && Math.abs(impulse[2]) < impulse[0] * 0.2);
    const a = new Ragdoll(terrain(), snapshot(), [1, 0, 0], 20, seed);
    const b = new Ragdoll(terrain(), snapshot(), [1, 0, 0], 20, seed);
    run(a, 30);
    run(b, 30);
    assert.deepEqual(a.world, b.world);
    poses.add(JSON.stringify(Array.from(a.world).map((v) => Math.round(v * 1000))));
    a.dispose();
    b.dispose();
  }
  assert.equal(poses.size, 12);
});

test('closed doors retain the full collision aperture and opening removes the local barrier', () => {
  const w = terrain();
  w.entities.push({
    id: 'gate',
    type: 'door',
    axis: 'x',
    x: 2,
    z: 0,
    h: 0,
    open: false,
    locked: true,
    requiresAltar: true,
  });
  const closed = physicalTerrain(w, [0, 0, 0]).find((b) => b.name === 'door:gate');
  assert.deepEqual(closed?.size, [0.4, 2.8, 2.96]);
  const door = w.entities[0];
  if (door.type !== 'door') throw new Error('door fixture');
  door.open = true;
  assert.equal(
    physicalTerrain(w, [0, 0, 0]).some((b) => b.name === 'door:gate'),
    false,
  );
});

test('the physical torso joins the pelvis at the authored waist rather than pivoting at the chest center', () => {
  const start = snapshot();
  const r = new Ragdoll(terrain(), start, [1, 0, 0], 20, 'waist');
  const spine = start.definition.index.spine * 16,
    pelvis = start.definition.index.pelvis * 16;
  for (let i = 0; i < 180; i++) {
    r.advance(1 / 60);
    const gap = Math.hypot(
      ...[12, 13, 14].map((axis) => r.world[spine + axis] - r.world[pelvis + axis]),
    );
    assert.ok(gap < 0.06, `waist gap ${gap}`);
  }
  r.dispose();
});
