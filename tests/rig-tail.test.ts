import { test } from 'node:test';
import assert from 'node:assert/strict';
import { humanoid, profiles, validateRig } from '../src/rigs/humanoid.ts';
import { withTail, TailRig, TAIL_BUDGET } from '../src/rigs/tail.ts';
import { createPose, evaluatePose, setEuler } from '../src/rigs/pose.ts';
import { deathPose } from '../src/actionPoses.ts';
import { TailClearance } from '../src/rigs/tailClearance.ts';
import { ActionRig } from '../src/rigs/actions.ts';
import { ECS } from '../src/ecs.ts';
import { createActor } from '../src/actors.ts';
import type { NavigationWorld } from '../src/navigation.ts';
import type { DoorEntity } from '../src/worldTypes.ts';

test('tailed family extends the immutable humanoid core and maps all four anatomical bodies', () => {
  const core = humanoid(profiles.kobold),
    rig = withTail(core);
  validateRig(rig);
  assert.equal(rig.family, 'humanoid-with-tail');
  assert.equal(rig.joints.length, core.joints.length + 4);
  assert.equal(rig.chains, core.chains);
  assert.equal(rig.sockets, core.sockets);
  assert.equal(withTail(core), rig);
  assert.ok(Object.isFrozen(rig.tail));
  for (const [i, segment] of rig.tail!.entries()) {
    assert.equal(rig.joints[segment.index].parent, i ? rig.tail![i - 1].index : rig.index.pelvis);
    assert.ok(rig.bodies.some((b) => b.joint === segment.name));
    if (i) assert.ok(segment.width < rig.tail![i - 1].width);
  }
  assert.equal(core.joints.length, 20);
});

test('tail follows measured turns, stops settling, preserves core pose and has bounded clearance work', () => {
  const definition = withTail(humanoid(profiles.kobold)),
    pose = createPose(definition);
  const tail = new TailRig(definition);
  const input = { dt: 1 / 60, speed: 2.1, stride: 0, forward: 2.1, airborne: false, attack: 0 };
  let movement = 0;
  let previous = 0;
  for (let frame = 0; frame < 360; frame++) {
    input.speed = frame < 120 ? 2.1 : 0;
    input.stride = Math.min(frame, 120) * 0.09;
    pose.local[0].position.z = Math.min(frame, 120) * 0.02;
    setEuler(pose.local[0], 0, Math.min(frame, 120) * 0.01, 0);
    evaluatePose(pose);
    const core = pose.world.slice(0, 320);
    tail.sample(pose, input, (b) => b.minY >= 0);
    assert.deepEqual(pose.world.slice(0, 320), core);
    assert.ok(tail.queries <= TAIL_BUDGET.queries);
    assert.ok(tail.evaluations <= TAIL_BUDGET.evaluations);
    assert.equal(tail.blocked, false);
    movement = Math.max(movement, Math.abs(tail.angles[1] - previous));
    previous = tail.angles[1];
    assert.ok([...pose.world].every(Number.isFinite));
  }
  assert.ok(movement > 0.001);
  assert.ok(Math.max(...tail.velocities.map(Math.abs)) < 0.001);
  const once = [...pose.world],
    angles = [...tail.angles],
    velocities = [...tail.velocities];
  for (let i = 0; i < 20; i++) tail.sample(pose, { ...input, dt: 0 }, (b) => b.minY >= 0);
  assert.deepEqual([...pose.world], once);
  assert.deepEqual([...tail.angles], angles);
  assert.deepEqual([...tail.velocities], velocities);
  tail.reset();
  assert.ok(tail.velocities.every((v) => v === 0));
});

test('tail tucks against a rear wall without stretching or changing the actor anchor', () => {
  const definition = withTail(humanoid(profiles.kobold)),
    pose = createPose(definition);
  const tail = new TailRig(definition);
  evaluatePose(pose);
  const input = { dt: 1 / 60, speed: 0, stride: 0, forward: 0, airborne: false, attack: 0 };
  for (let i = 0; i < 60; i++) tail.sample(pose, input, (b) => b.minY >= 0 && b.minZ >= -0.48);
  assert.equal(tail.blocked, false);
  assert.ok(tail.tucked);
  assert.equal(pose.local[0].position.z, 0);
  for (const segment of definition.tail!) {
    assert.deepEqual(Object.values(pose.local[segment.index].position), [
      ...definition.joints[segment.index].rest,
    ]);
    assert.deepEqual(Object.values(pose.local[segment.index].scale), [1, 1, 1]);
  }
});

test('infeasible tail contacts report a bounded fallback with hard limits and finite buffers', () => {
  const definition = withTail(humanoid(profiles.kobold)),
    pose = createPose(definition);
  const tail = new TailRig(definition);
  evaluatePose(pose);
  tail.sample(
    pose,
    { dt: 1 / 60, speed: 8, stride: 200, forward: -8, airborne: true, attack: 1 },
    () => false,
  );
  assert.equal(tail.blocked, true);
  assert.equal(tail.queries, 60);
  assert.ok(tail.evaluations <= TAIL_BUDGET.evaluations);
  for (const [i, s] of definition.tail!.entries())
    for (let axis = 0; axis < 2; axis++) {
      const [min, max] = definition.joints[s.index].limits[axis];
      assert.ok(tail.angles[i * 2 + axis] >= min && tail.angles[i * 2 + axis] <= max);
    }
  assert.ok([...pose.world].every(Number.isFinite));
});

test('tail death handoff retains entry pose, samples age independently and retires live inertia', () => {
  const definition = withTail(humanoid(profiles.kobold));
  const setup = () => {
    const pose = createPose(definition),
      tail = new TailRig(definition);
    for (let frame = 0; frame < 30; frame++) {
      setEuler(pose.local[0], 0, frame * 0.02, 0);
      evaluatePose(pose);
      tail.sample(pose, {
        dt: 1 / 60,
        speed: 2.1,
        stride: frame * 0.13,
        forward: 2.1,
        airborne: false,
        attack: 0,
      });
    }
    tail.captureDeath(pose);
    return { pose, tail };
  };
  const sample = (s: ReturnType<typeof setup>, age: number) => {
    const fall = deathPose(age);
    setEuler(s.pose.local[0], fall.rotation, 0.58, 0);
    s.pose.local[0].position.y = fall.height;
    evaluatePose(s.pose);
    s.tail.sample(
      s.pose,
      { dt: 0, speed: 0, stride: 0, forward: 0, airborne: false, attack: 0, age },
      (b) => b.minY >= 0,
    );
  };
  const direct = setup(),
    progressive = setup();
  const entry = [...direct.pose.world];
  sample(direct, 0);
  direct.pose.world.forEach((v, i) => assert.ok(Math.abs(v - entry[i]) < 1e-12));
  for (let frame = 0; frame <= 60; frame++) sample(progressive, frame / 60);
  sample(direct, 1);
  assert.deepEqual([...progressive.pose.world], [...direct.pose.world]);
  assert.ok(direct.tail.velocities.every((v) => v === 0));
  assert.equal(direct.tail.blocked, false);
});

test('tail clearance reads only nearby live door state and ignores inflated prop navigation cells', () => {
  let reads = 0,
    open = false;
  const door: DoorEntity = {
    id: 'door',
    type: 'door',
    x: 20,
    z: -0.5,
    h: 0,
    axis: 'z',
    requiresAltar: false,
    get locked() {
      reads++;
      return false;
    },
    get open() {
      reads++;
      return open;
    },
  };
  const world: NavigationWorld = { tiles: new Map(), blockers: [], entities: [door] };
  for (let x = -3; x <= 3; x++)
    for (let z = -3; z <= 3; z++)
      world.tiles.set(`${x},${z}`, {
        x,
        z,
        h: 0,
        surface: 'stone',
        blocked: true,
        room: 'entrance',
      });
  const ecs = new ECS(),
    actor = createActor(ecs, world, 'tail-test', 'kobold', { x: 0, z: 0, h: 0 });
  const definition = withTail(humanoid(profiles.kobold)),
    pose = createPose(definition);
  const tail = new TailRig(definition),
    clearance = new TailClearance(),
    actions = new ActionRig(definition);
  evaluatePose(pose);
  tail.apply(pose);
  actions.finish(pose);
  clearance.prepare(pose, actor, ecs, actions, world);
  for (let i = 0; i < 4; i++) assert.ok(clearance.clear(tail.segmentBounds(pose, i), i));
  assert.equal(reads, 0, 'distant chart-backed doors need no snapshot reads');
  door.x = 0;
  assert.equal(clearance.clear(tail.segmentBounds(pose, 1), 1), false);
  assert.ok(reads > 0);
  open = true;
  assert.equal(clearance.clear(tail.segmentBounds(pose, 1), 1), true);
});
