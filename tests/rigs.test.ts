import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { humanoid, profiles, validateRig } from '../src/rigs/humanoid.ts';
import {
  createPose,
  evaluatePose,
  setEuler,
  worldPoint,
  localPoint,
  socketPoint,
  socketMatrix,
  resetHistory,
} from '../src/rigs/pose.ts';

const close = (a: ArrayLike<number>, b: ArrayLike<number>, epsilon = 1e-6) => {
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++)
    assert.ok(Math.abs(a[i] - b[i]) < epsilon, `${i}: ${a[i]} != ${b[i]}`);
};

test('humanoid profiles share semantic topology, valid chains/axes, immutable limits and sockets', () => {
  for (const profile of Object.values(profiles)) {
    const rig = humanoid(profile);
    validateRig(rig);
    assert.deepEqual(
      rig.joints.map((j) => j.name),
      humanoid(profiles.player).joints.map((j) => j.name),
    );
    assert.equal(rig.joints[rig.index.leftHand].parent, rig.index.leftForearm);
    assert.equal(rig.joints[rig.index.leftThigh].parent, rig.index.pelvis);
    assert.equal(rig.chains.leftArm.upperLength, 0.28);
    assert.equal(rig.chains.leftArm.lowerLength, 0.27);
    assert.equal(rig.chains.rightLeg.upperLength, 0.25);
    assert.equal(rig.chains.rightLeg.lowerLength, 0.25);
    assert.ok(Object.isFrozen(rig) && Object.isFrozen(rig.joints[0].rest));
    assert.equal(Reflect.set(rig.joints[0].rest, '0', 5), false);
  }
});

test('neutral humanoid soles, hands and profile proportions agree with authored geometry', () => {
  for (const profile of Object.values(profiles)) {
    const pose = createPose(humanoid(profile));
    evaluatePose(pose);
    close(socketPoint(pose, 'leftSole'), [-profile.hipWidth, 0, profile.soleForward]);
    close(worldPoint(pose, 'rightHand'), [profile.shoulderWidth, profile.shoulderHeight - 0.55, 0]);
    close(worldPoint(pose, 'head'), [0, profile.headHeight, 0]);
  }
});

test('pure quaternion FK and world/local round trips match an independent Babylon oracle', () => {
  const pose = createPose(humanoid(profiles.skeleton));
  const matrices: Matrix[] = [];
  for (const [i, joint] of pose.local.entries()) {
    const angles = [Math.sin(i * 2.1) * 2.8, Math.cos(i) * 1.4, Math.sin(i) * 0.8];
    setEuler(joint, ...(angles as [number, number, number]));
    if (i === 0) {
      joint.position.set(17, 3.2, -11);
      joint.scale.set(1.17, 0.83, 1.04);
    }
    const own = Matrix.Compose(
      new Vector3(joint.scale.x, joint.scale.y, joint.scale.z),
      Quaternion.RotationYawPitchRoll(angles[1], angles[0], angles[2]),
      new Vector3(joint.position.x, joint.position.y, joint.position.z),
    );
    const parent = pose.definition.joints[i].parent;
    matrices.push(parent < 0 ? own : own.multiply(matrices[parent]));
  }
  evaluatePose(pose);
  for (const [i, definition] of pose.definition.joints.entries()) {
    close(pose.world.subarray(i * 16, i * 16 + 16), matrices[i].m, 5e-6);
    const local = [0.17, -0.12, 0.31] as const;
    close(
      localPoint(pose, definition.name, worldPoint(pose, definition.name, local)),
      local,
      1e-10,
    );
  }
});

test('pose evaluation is idempotent, preallocated and keeps explicit previous-step history', () => {
  const pose = createPose(humanoid(profiles.player));
  evaluatePose(pose);
  resetHistory(pose);
  const previous = [...pose.previousWorld],
    world = pose.world,
    local = pose.local;
  pose.local[0].position.x = 5;
  evaluatePose(pose);
  assert.deepEqual([...pose.previousWorld], previous);
  const evaluated = [...pose.world];
  for (let i = 0; i < 100; i++) evaluatePose(pose);
  assert.deepEqual([...pose.world], evaluated);
  assert.equal(pose.world, world);
  assert.equal(pose.local, local);
  resetHistory(pose);
  assert.deepEqual([...pose.previousWorld], evaluated);
  assert.notEqual(createPose(pose.definition).world, world);
});

test('rig validation rejects cycles, malformed axes/limits and wrong chain anatomy', () => {
  const definition = humanoid(profiles.player);
  const cycle = {
    ...definition,
    joints: definition.joints.map((j, i) =>
      i === 1 ? { ...j, parent: definition.index.head } : j,
    ),
  };
  assert.throws(() => validateRig(cycle), /parent|topology/);
  const badAxis = {
    ...definition,
    joints: definition.joints.map((j) =>
      j.name === 'leftShin' ? { ...j, axis: [0, 0, 0] as const } : j,
    ),
  };
  assert.throws(() => validateRig(badAxis), /axis/);
  const badLimit = {
    ...definition,
    joints: definition.joints.map((j, i) =>
      i === 0
        ? {
            ...j,
            limits: [
              [1, -1],
              [0, 0],
              [0, 0],
            ] as const,
          }
        : j,
    ),
  };
  assert.throws(() => validateRig(badLimit), /limit/);
  const badSocket = {
    ...definition,
    sockets: {
      ...definition.sockets,
      gaze: { ...definition.sockets.gaze, forward: [NaN, 0, 1] as const },
    },
  };
  assert.throws(() => validateRig(badSocket), /socket/);
  const badBody = {
    ...definition,
    bodies: [{ ...definition.bodies[0], size: [1, -1, 1] as const }],
  };
  assert.throws(() => validateRig(badBody), /body/);
  const badChain = {
    ...definition,
    chains: { ...definition.chains, leftArm: { ...definition.chains.leftArm, upperLength: 0.1 } },
  };
  assert.throws(() => validateRig(badChain), /chain/);
});

test('logical wrist rotation changes the full grip frame without rotating the forearm', () => {
  const pose = createPose(humanoid(profiles.player)),
    frame = new Float64Array(16);
  evaluatePose(pose);
  socketMatrix(pose, 'leftGrip', frame);
  const before = [...frame],
    forearm = worldPoint(pose, 'leftForearm');
  setEuler(pose.local[pose.definition.index.leftHand], 0, Math.PI / 2, 0);
  evaluatePose(pose);
  socketMatrix(pose, 'leftGrip', frame);
  close(worldPoint(pose, 'leftForearm'), forearm);
  close(frame.subarray(12, 15), before.slice(12, 15));
  close(frame.subarray(8, 11), [1, 0, 0]);
});
