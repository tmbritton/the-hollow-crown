import { test } from 'node:test';
import assert from 'node:assert/strict';
import { humanoid, profiles } from '../src/rigs/humanoid.ts';
import { createPose, evaluatePose, setEuler, socketPoint, worldPoint } from '../src/rigs/pose.ts';
import { FullBodySolver } from '../src/rigs/solver.ts';
import type { RigTargets } from '../src/rigs/targets.ts';
import { solverFixture } from './rig-solver-fixture.ts';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { limitJoint, copyLocal } from '../src/rigs/ikMath.ts';
import { withTail } from '../src/rigs/tail.ts';

test('refined solve returns complete FK including inactive limbs, root scale and tail', () => {
  for (const definition of [humanoid(profiles.player), withTail(humanoid(profiles.kobold))]) {
    const base = createPose(definition),
      reference = createPose(definition);
    base.local[0].position.set(3, 0.5, -1);
    base.local[0].scale.set(1.15, 0.9, 1.05);
    setEuler(base.local[0], 0, 1.2, 0);
    const { pose } = new FullBodySolver(definition, { pelvis: 0 }).solve(
      base,
      {
        leftSole: { space: 'rig', position: [-2, 0.12, 2], rotation: [0, 0, 0, 1], required: true },
      },
      () => false,
    );
    copyLocal(pose.local, reference.local);
    evaluatePose(reference);
    assert.deepEqual(pose.matrices, reference.matrices);
    assert.deepEqual(pose.world, reference.world);
  }
});

test('simultaneous planted soles and two-hand grip require bounded body compensation on every profile', () => {
  for (const profile of Object.values(profiles)) {
    const definition = humanoid(profile),
      base = createPose(definition);
    evaluatePose(base);
    const solver = new FullBodySolver(definition);
    const targets: RigTargets = {
      leftSole: {
        space: 'rig',
        position: socketPoint(base, 'leftSole'),
        rotation: [0, 0, 0, 1],
        required: true,
      },
      rightSole: {
        space: 'rig',
        position: socketPoint(base, 'rightSole'),
        rotation: [0, 0, 0, 1],
        required: true,
      },
      leftGrip: {
        space: 'rig',
        position: [-0.16, profile.shoulderHeight - 0.12, 0.53],
        rotation: [0, 0, 0, 1],
        required: true,
      },
      rightGrip: {
        space: 'rig',
        position: [0.16, profile.shoulderHeight - 0.12, 0.53],
        rotation: [0, 0, 0, 1],
        required: true,
      },
    };
    const locked = new FullBodySolver(definition, { pelvis: 0, spine: 0, chest: 0, shoulder: 0 });
    assert.equal(locked.solve(base, targets).status, 'infeasible');
    const result = solver.solve(base, targets);
    assert.equal(result.status, 'solved', `${profile.id}: ${JSON.stringify(result.residuals)}`);
    assert.ok(result.passes <= 4 && result.limbSolves <= 16);
    assert.ok(result.jointEvaluations <= 249);
    assert.equal(result.terrainQueries, 0);
    assert.deepEqual(result.pose.local[0], base.local[0]);
    assert.ok(Math.abs(result.pose.local[definition.index.spine].rotation.x) > 0.001);
    for (const chain of Object.values(definition.chains)) {
      const a = worldPoint(result.pose, chain.root),
        b = worldPoint(result.pose, chain.middle),
        c = worldPoint(result.pose, chain.end);
      assert.ok(Math.abs(Math.hypot(...a.map((v, i) => v - b[i])) - chain.upperLength) < 1e-10);
      assert.ok(Math.abs(Math.hypot(...b.map((v, i) => v - c[i])) - chain.lowerLength) < 1e-10);
    }
    const before = [...result.pose.world];
    for (let i = 0; i < 20; i++) solver.solve(base, targets);
    assert.deepEqual([...result.pose.world], before, 'zero-time solves start from authored pose');
  }
});

test('an incompatible required grip stays explicit, while released support is an authored choice', () => {
  const base = createPose(humanoid(profiles.player));
  evaluatePose(base);
  const solver = new FullBodySolver(base.definition);
  const targets: RigTargets = {
    leftSole: { space: 'world', position: socketPoint(base, 'leftSole'), required: true },
    rightSole: { space: 'world', position: socketPoint(base, 'rightSole'), required: true },
    rightGrip: { space: 'world', position: [12, 5, -9], required: true },
  };
  const result = solver.solve(base, targets);
  assert.equal(result.status, 'infeasible');
  assert.ok(result.residuals.rightGrip.position > 1);
  assert.ok(result.pose.world.every(Number.isFinite));
  assert.ok(result.passes <= 4);
  const released = solver.solve(base, {
    ...targets,
    rightGrip: { ...targets.rightGrip!, release: true },
  });
  assert.equal(released.status, 'solved');
  assert.equal(released.residuals.rightGrip.active, false);
});

test('turned, translated nonuniform anchors retain exact reachable world contacts and slope orientation', () => {
  const base = createPose(humanoid(profiles.goblin));
  base.local[0].position.set(17, 3, -11);
  base.local[0].scale.set(1.2, 0.9, 1.1);
  setEuler(base.local[0], 0, 1.1, 0);
  evaluatePose(base);
  const result = new FullBodySolver(base.definition).solve(base, {
    leftSole: { space: 'world', position: socketPoint(base, 'leftSole'), required: true },
    rightSole: {
      space: 'rig',
      position: [profiles.goblin.hipWidth, 0.12, 0.16],
      rotation: [Math.sin(0.1), 0, 0, Math.cos(0.1)],
      required: true,
    },
    leftGrip: { space: 'rig', position: [-0.3, 0.8, 0.3], required: true },
    rightGrip: { space: 'rig', position: [0.3, 0.8, 0.3], required: true },
  });
  assert.equal(result.status, 'solved', JSON.stringify(result.residuals));
  assert.ok(result.residuals.rightSole.orientation < Math.PI / 180);
  assert.deepEqual(result.pose.local[0], base.local[0]);
});

test('continuous turning and one-foot steps keep simultaneous grips and final support, with independent FK', () => {
  let samples = 0,
    maximum = 0;
  for (const profile of Object.values(profiles)) {
    const fixture = solverFixture(profile.id),
      solver = new FullBodySolver(fixture.base.definition);
    for (const step of [false, true]) {
      let previous: number[] | undefined;
      for (let frame = 0; frame <= 120; frame++) {
        fixture.sample(frame, step);
        const result = solver.solve(fixture.base, fixture.targets);
        assert.equal(
          result.status,
          'solved',
          `${profile.id}/${step}/${frame}: ${JSON.stringify(result.residuals)}`,
        );
        assert.ok(result.jointEvaluations <= 249);
        const matrices: Matrix[] = [];
        for (let i = 0; i < result.pose.local.length; i++) {
          const j = result.pose.local[i],
            q = j.rotation,
            p = j.position,
            s = j.scale;
          const own = Matrix.Compose(
            new Vector3(s.x, s.y, s.z),
            new Quaternion(q.x, q.y, q.z, q.w),
            new Vector3(p.x, p.y, p.z),
          );
          const parent = result.pose.definition.joints[i].parent;
          matrices.push(parent < 0 ? own : own.multiply(matrices[parent]));
        }
        for (const name of ['leftSole', 'rightSole', 'leftGrip', 'rightGrip'] as const) {
          const socket = result.pose.definition.sockets[name],
            expected = fixture.targets[name]!;
          const point = Vector3.TransformCoordinates(
            new Vector3(...socket.offset),
            matrices[result.pose.definition.index[socket.joint]],
          );
          const distance = Math.hypot(
            point.x - expected.position[0],
            point.y - expected.position[1],
            point.z - expected.position[2],
          );
          assert.ok(distance <= (name.endsWith('Sole') ? 0.001 : 0.01), `${name}: ${distance}`);
          maximum = Math.max(maximum, distance);
        }
        const positions = matrices.flatMap((m) => [m.m[12], m.m[13], m.m[14]]);
        if (previous)
          assert.ok(
            Math.max(...positions.map((v, i) => Math.abs(v - previous![i]))) < 0.035,
            'bounded inter-frame joint motion',
          );
        previous = positions;
        samples++;
      }
    }
  }
  console.log(JSON.stringify({ samples, maximumIndependentContactError: maximum }));
});

test('singular folds, straight reach and opposite bend hints stay finite with a deterministic projection', () => {
  const base = createPose(humanoid(profiles.player));
  evaluatePose(base);
  const solver = new FullBodySolver(base.definition, {
    pelvis: 0,
    spine: 0,
    chest: 0,
    shoulder: 0,
  });
  for (const hint of [
    [0, 0, 1],
    [0, 0, -1],
  ] as const) {
    for (const y of [0, 1e-10, -1e-10, 0.01, -0.01, 0.4999999, 0.5, 0.5000001, 2]) {
      const result = solver.solve(base, {
        leftSole: {
          space: 'rig',
          position: [-0.2, 0.55 - y - 0.05, 0.06],
          rotation: [0, 0, 0, 1],
          bendHint: hint,
          required: true,
        },
      });
      assert.ok(result.pose.world.every(Number.isFinite));
      const knee = worldPoint(result.pose, 'leftShin');
      assert.ok(knee[2] * hint[2] > -1e-10);
      const old = [...result.pose.world];
      solver.solve(base, {
        leftSole: {
          space: 'rig',
          position: [-0.2, 0.55 - y - 0.05, 0.06],
          rotation: [0, 0, 0, 1],
          bendHint: hint,
          required: true,
        },
      });
      assert.deepEqual([...result.pose.world], old);
    }
  }
});

test('joint limits remain hard constraints, residuals expose their conflict, and soft goals cannot move support', () => {
  const original = humanoid(profiles.player);
  const definition = {
    ...original,
    joints: original.joints.map((j) =>
      j.name === 'leftThigh' || j.name === 'leftShin' || j.name === 'leftFoot'
        ? {
            ...j,
            limits: [
              [0, 0],
              [0, 0],
              [0, 0],
            ] as const,
          }
        : j,
    ),
  };
  const base = createPose(definition),
    solver = new FullBodySolver(definition);
  evaluatePose(base);
  const result = solver.solve(base, {
    leftSole: {
      space: 'rig',
      position: [-0.2, 0.22, 0.24],
      rotation: [0, 0, 0, 1],
      required: true,
    },
  });
  assert.equal(result.status, 'infeasible');
  for (let i = 1; i < result.pose.local.length; i++) {
    const q = { ...result.pose.local[i].rotation };
    limitJoint(result.pose.local[i], definition.joints[i]);
    assert.ok(
      Math.abs(
        q.x * result.pose.local[i].rotation.x +
          q.y * result.pose.local[i].rotation.y +
          q.z * result.pose.local[i].rotation.z +
          q.w * result.pose.local[i].rotation.w,
      ) >
        1 - 1e-10,
    );
  }
  const normal = createPose(original);
  evaluatePose(normal);
  const other = new FullBodySolver(original);
  const feet: RigTargets = {
    leftSole: { space: 'rig', position: socketPoint(normal, 'leftSole'), required: true },
    rightSole: { space: 'rig', position: socketPoint(normal, 'rightSole'), required: true },
  };
  const support = other
    .solve(normal, feet)
    .pose.world.slice(original.index.pelvis * 16, original.index.pelvis * 16 + 16);
  const soft = other.solve(normal, {
    ...feet,
    rightGrip: { space: 'rig', position: [12, 3, 1], priority: 2 },
  });
  assert.equal(soft.status, 'relaxed');
  assert.deepEqual(
    soft.pose.world.slice(original.index.pelvis * 16, original.index.pelvis * 16 + 16),
    support,
  );
  assert.ok(soft.residuals.leftSole.satisfied && soft.residuals.rightSole.satisfied);
});

test('joint-local goals sample the base once, scaled ancestors preserve contacts, and invalid requests are transactional', () => {
  const base = createPose(humanoid(profiles.player));
  base.local[base.definition.index.spine].scale.set(1.1, 0.9, 1.2);
  evaluatePose(base);
  const solver = new FullBodySolver(base.definition);
  const result = solver.solve(base, {
    leftGrip: { space: 'joint', joint: 'chest', position: [-0.32, 0, 0.24], required: true },
  });
  assert.equal(result.status, 'solved');
  const saved = [...result.pose.world],
    local = createPose(base.definition);
  copyLocal(base.local, local.local);
  local.local[base.definition.index.leftShin].scale.y = 2;
  assert.throws(() => solver.solve(local, {}), /individual IK links/);
  assert.throws(
    () => solver.solve(base, { leftGrip: { space: 'world', position: [NaN, 0, 0] } }),
    /Invalid rig target/,
  );
  assert.throws(
    () =>
      solver.solve(base, {
        leftGrip: { space: 'world', position: [0, 0, 0], rotation: [NaN, 0, 0, 1] },
      }),
    /Invalid rig target/,
  );
  assert.throws(() => solver.solve(result.pose, {}), /separate authored/);
  assert.deepEqual([...result.pose.world], saved);
});

test('unequal authored links, rotated socket bases and weighted conflicts retain anatomy and stable ordering', () => {
  const original = humanoid(profiles.skeleton);
  const definition = {
    ...original,
    joints: original.joints.map((j) =>
      j.name === 'leftForearm'
        ? { ...j, rest: [0, -0.36, 0] as const }
        : j.name === 'leftHand'
          ? { ...j, rest: [0, -0.19, 0] as const }
          : j,
    ),
    chains: {
      ...original.chains,
      leftArm: { ...original.chains.leftArm, upperLength: 0.36, lowerLength: 0.19 },
    },
    sockets: {
      ...original.sockets,
      leftGrip: {
        ...original.sockets.leftGrip,
        offset: [0.03, 0, 0.02] as const,
        up: [0, 1, 0] as const,
        forward: [1, 0, 0] as const,
      },
    },
  };
  const base = createPose(definition),
    solver = new FullBodySolver(definition);
  const result = solver.solve(base, {
    leftGrip: { space: 'rig', position: [-0.3, 1, 0.25], rotation: [0, 0, 0, 1], required: true },
  });
  assert.equal(result.status, 'solved', JSON.stringify(result.residuals));
  const a = worldPoint(result.pose, 'leftUpperArm'),
    b = worldPoint(result.pose, 'leftForearm'),
    c = worldPoint(result.pose, 'leftHand');
  assert.ok(Math.abs(Math.hypot(...a.map((v, i) => v - b[i])) - 0.36) < 1e-10);
  assert.ok(Math.abs(Math.hypot(...b.map((v, i) => v - c[i])) - 0.19) < 1e-10);
  const targets: RigTargets = {
    leftGrip: { space: 'rig', position: [-4, 1, 1], required: true, weight: 0.25 },
    rightGrip: { space: 'rig', position: [4, 1, 1], required: true, weight: 1 },
  };
  assert.equal(solver.solve(base, targets).status, 'infeasible');
  const first = [...solver.result.pose.world];
  solver.solve(base, { rightGrip: targets.rightGrip, leftGrip: targets.leftGrip });
  assert.deepEqual(
    [...solver.result.pose.world],
    first,
    'named slot order, not object insertion order',
  );
  solver.solve(base, {
    leftGrip: { ...targets.leftGrip!, weight: 1 },
    rightGrip: { ...targets.rightGrip!, weight: 0.25 },
  });
  assert.notDeepEqual(
    [...solver.result.pose.world],
    first,
    'weights affect bounded body compromise',
  );
  assert.ok(solver.result.jointEvaluations <= 249 && solver.result.limbSolves <= 16);
});

test('review: a tiny target crossing the bend pole cannot flip the knee', () => {
  const base = createPose(humanoid(profiles.player)),
    solver = new FullBodySolver(base.definition, { pelvis: 0, spine: 0, chest: 0, shoulder: 0 });
  let previous: number[] | undefined;
  for (let i = -20; i <= 20; i++) {
    const result = solver.solve(base, {
      leftSole: {
        space: 'rig',
        position: [-0.2, 0.5 + i * 1e-6, 0.26],
        rotation: [0, 0, 0, 1],
        required: true,
      },
    });
    assert.equal(result.status, 'solved');
    const knee = worldPoint(result.pose, 'leftShin');
    if (previous)
      assert.ok(
        Math.hypot(...knee.map((v, k) => v - previous![k])) < 0.0001,
        `${previous} -> ${knee}`,
      );
    previous = knee;
  }
  previous = undefined;
  for (let i = -20; i <= 20; i++) {
    const result = solver.solve(base, {
      leftSole: {
        space: 'rig',
        position: [-0.2 + i * 1e-6, 0.7, 0.06],
        rotation: [0, 0, 0, 1],
        required: true,
      },
    });
    assert.equal(
      result.status,
      'infeasible',
      'antipodal cone exposes the bounded direction projection',
    );
    const knee = worldPoint(result.pose, 'leftShin');
    if (previous) assert.ok(Math.hypot(...knee.map((v, k) => v - previous![k])) < 0.0001);
    previous = knee;
  }
});

test('review: omitted orientation is still required, and only explicit release disables a required grip', () => {
  const original = humanoid(profiles.player);
  const definition = {
    ...original,
    joints: original.joints.map((j) =>
      j.name === 'leftHand'
        ? {
            ...j,
            limits: [
              [0, 0],
              [0, 0],
              [0, 0],
            ] as const,
          }
        : j,
    ),
  };
  const base = createPose(definition),
    solver = new FullBodySolver(definition, { pelvis: 0, spine: 0, chest: 0, shoulder: 0 });
  const r = solver.solve(base, {
    leftGrip: { space: 'rig', position: [-0.4, 0.95, 0.3], required: true },
  });
  assert.equal(r.status, 'infeasible');
  assert.ok(r.residuals.leftGrip.orientation > 1);
  assert.throws(
    () =>
      solver.solve(base, {
        rightGrip: { space: 'world', position: [12, 5, -9], required: true, weight: 0 },
      }),
    /required.*weight/i,
  );
  assert.equal(
    solver.solve(base, {
      rightGrip: {
        space: 'world',
        position: [12, 5, -9],
        required: true,
        weight: 0,
        release: true,
      },
    }).status,
    'solved',
  );
});

test('review: partial antipodal projection and the near-fold boundary stay continuous', () => {
  const base = createPose(humanoid(profiles.player)),
    solver = new FullBodySolver(base.definition, { pelvis: 0, spine: 0, chest: 0, shoulder: 0 });
  for (const pair of [
    [
      [-0.15225065353829936, 0.694, 0.06916514661532899],
      [-0.15225065537132965, 0.694, 0.0691651561651981],
    ],
    [
      [-0.2, 0.5, 0.06000999999],
      [-0.2, 0.5, 0.06001000001],
    ],
  ] as const) {
    const first = solver.solve(base, {
      leftSole: { space: 'rig', position: pair[0], rotation: [0, 0, 0, 1], required: true },
    });
    const before = [...first.pose.world];
    const second = solver.solve(base, {
      leftSole: { space: 'rig', position: pair[1], rotation: [0, 0, 0, 1], required: true },
    });
    assert.ok(
      Math.max(...before.map((v, i) => Math.abs(v - second.pose.world[i]))) < 0.001,
      'joint frames must not snap for nanometre target changes',
    );
  }
});

test('review: hinge limits choose the nearest rotational endpoint across pi and retain noncanonical valid poses', () => {
  const definition = humanoid(profiles.player),
    pose = createPose(definition),
    shin = pose.local[definition.index.leftShin];
  for (const angle of [Math.PI - 1e-8, Math.PI, Math.PI + 1e-8]) {
    setEuler(shin, angle, 0, 0);
    limitJoint(shin, definition.joints[definition.index.leftShin]);
    assert.ok(Math.abs(shin.rotation.x) > 1 - 1e-10);
  }
  const limited = {
    ...definition.joints[definition.index.spine],
    limits: [
      [1.8, 2.4],
      [-0.3, 0.3],
      [-0.3, 0.3],
    ] as const,
  };
  const spine = pose.local[definition.index.spine];
  setEuler(spine, 2, 0.1, 0.1);
  const q = { ...spine.rotation };
  limitJoint(spine, limited);
  assert.ok(
    Math.abs(
      q.x * spine.rotation.x +
        q.y * spine.rotation.y +
        q.z * spine.rotation.z +
        q.w * spine.rotation.w,
    ) >
      1 - 1e-10,
  );
});

test('review: unrenderable or cumulatively singular scale is rejected without changing the published result', () => {
  const definition = humanoid(profiles.player),
    solver = new FullBodySolver(definition),
    base = createPose(definition);
  solver.solve(base, {});
  const saved = [...solver.result.pose.world];
  for (const name of ['pelvis', 'chest', 'leftShoulder'] as const) {
    const invalid = createPose(definition);
    invalid.local[definition.index[name]].scale.set(1.1, 0.9, 1.2);
    assert.throws(() => solver.solve(invalid, {}), /scale/i);
    assert.deepEqual([...solver.result.pose.world], saved);
  }
  const invalid = createPose(definition);
  for (const name of ['root', 'pelvis', 'spine', 'chest'] as const)
    invalid.local[definition.index[name]].scale.setAll(0.01);
  assert.throws(
    () =>
      solver.solve(invalid, {
        leftGrip: { space: 'rig', position: [-0.3, 0.8, 0.2], required: true },
      }),
    /scale|transform/i,
  );
  assert.deepEqual([...solver.result.pose.world], saved);
});
