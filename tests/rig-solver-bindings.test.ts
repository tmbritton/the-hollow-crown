import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { ECS } from '../src/ecs.ts';
import type { Components } from '../src/ecs.ts';
import { bindHumanoid } from '../src/rigs/bindings.ts';
import { profiles } from '../src/rigs/humanoid.ts';
import { FullBodySolver } from '../src/rigs/solver.ts';
import { copyLocal } from '../src/rigs/ikMath.ts';
import { solverFixture } from './rig-solver-fixture.ts';
import { socketPoint } from '../src/rigs/pose.ts';

test('review: every accepted scale-bearing node agrees with actual bound endpoints, including combined scale and turns', () => {
  const engine = new NullEngine();
  try {
    const scene = new Scene(engine);
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
    for (const sign of [-1, 1]) {
      const arm = node('arm', body, sign * 0.48, 1.18),
        forearm = node('forearm', arm, 0, -0.28);
      const leg = node('leg', root, sign * 0.2, 0.55),
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
    const binding = bindHumanoid(new ECS().create('actor').add('rig', rig), profiles.player);
    let maximumMismatch = 0,
      samples = 0;
    for (const scaled of [['root'], ['spine'], ['root', 'spine']] as const) {
      const fixture = solverFixture('player'),
        solver = new FullBodySolver(fixture.base.definition);
      for (const name of scaled)
        fixture.base.local[fixture.base.definition.index[name]].scale.set(1.1, 0.9, 1.2);
      for (let frame = 0; frame <= 120; frame += 5) {
        fixture.sample(frame, true);
        const result = solver.solve(fixture.base, fixture.targets);
        copyLocal(result.pose.local, binding.pose.local);
        binding.apply();
        for (const [i, side] of (['left', 'right'] as const).entries()) {
          for (const [end, n, offset] of [
            ['Sole', feet[i], [0, -0.05, 0.06]],
            ['Grip', forearms[i], [0, -0.27, 0]],
          ] as const) {
            n.computeWorldMatrix(true);
            const actual = Vector3.TransformCoordinates(
              new Vector3(...offset),
              n.getWorldMatrix(),
            ).asArray();
            const predicted = socketPoint(result.pose, `${side}${end}`),
              target = fixture.targets[`${side}${end}`]!;
            const mismatch = Math.hypot(...actual.map((v, k) => v - predicted[k]));
            maximumMismatch = Math.max(maximumMismatch, mismatch);
            assert.ok(mismatch < 1e-6, `${scaled}/${frame}/${side}${end}: ${mismatch}`);
            const actualError = Math.hypot(...actual.map((v, k) => v - target.position[k]));
            assert.ok(Math.abs(actualError - result.residuals[`${side}${end}`].position) < 1e-6);
            if (result.status === 'solved')
              assert.ok(actualError <= (end === 'Sole' ? 0.001 : 0.01));
            samples++;
          }
        }
      }
    }
    console.log(JSON.stringify({ scaledBindingSamples: samples, maximumMismatch }));
  } finally {
    engine.dispose();
  }
});
