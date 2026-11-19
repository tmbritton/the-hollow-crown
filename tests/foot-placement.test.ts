import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { solveLeg } from '../src/footPlacement.ts';

function legFixture() {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const hip = new TransformNode('hip', scene),
    knee = new TransformNode('knee', scene),
    foot = new TransformNode('foot', scene);
  knee.parent = hip;
  knee.position.y = -0.25;
  foot.parent = knee;
  foot.position.y = -0.25;
  return {
    engine,
    sample(forward: number, down: number, side: number) {
      const pose = solveLeg(forward, down, side);
      assert.ok(Object.values(pose).every(Number.isFinite));
      hip.rotation.set(pose.hip, 0, pose.roll);
      knee.rotation.x = pose.knee;
      foot.computeWorldMatrix(true);
      const p = foot.getAbsolutePosition();
      return { pose, forward: p.z, down: -p.y, side: p.x };
    },
  };
}

test('leg inverse remains continuous through zero down-distance and subpixel lateral offsets', () => {
  const f = legFixture();
  try {
    for (const forward of [-0.3, 0.3]) {
      const reference = f.sample(forward, 0, 0);
      for (const down of [0, 1e-15, 1e-8])
        for (const side of [-1e-15, 0, 1e-15]) {
          const actual = f.sample(forward, down, side);
          assert.ok(
            Math.abs(actual.side - side) < 1e-7 &&
              Math.abs(actual.down - down) < 1e-7 &&
              Math.abs(actual.forward - forward) < 1e-7,
            JSON.stringify({ forward, down, side, actual }),
          );
          assert.ok(Math.abs(actual.pose.roll - reference.pose.roll) < 1e-7);
          assert.ok(Math.abs(actual.pose.hip - reference.pose.hip) < 1e-7);
        }
    }
  } finally {
    f.engine.dispose();
  }
});

test('leg inverse reaches the rendered Rx/Rz/knee chain throughout its feasible lateral workspace', () => {
  const f = legFixture();
  try {
    for (const distance of [0.06, 0.1, 0.2, 0.3, 0.42, 0.499]) {
      // Equal 0.25 bones: lateral reach at this extension is d² / (2 * 0.25).
      const lateralReach = (distance * distance) / 0.5;
      for (const latitude of [-0.99, -0.5, 0, 0.5, 0.99]) {
        const side = latitude * lateralReach,
          planar = Math.sqrt(distance * distance - side * side);
        for (const angle of [-Math.PI / 2, -Math.PI / 3, 0, Math.PI / 3, Math.PI / 2]) {
          const forward = planar * Math.sin(angle),
            down = planar * Math.cos(angle);
          const actual = f.sample(forward, down, side);
          assert.ok(
            Math.hypot(actual.forward - forward, actual.down - down, actual.side - side) < 2e-7,
            JSON.stringify({ forward, down, side, actual }),
          );
        }
      }
    }
  } finally {
    f.engine.dispose();
  }
});

test('unreachable and singular leg targets project continuously into bounded short-leg reach', () => {
  const f = legFixture();
  try {
    const neutral = f.sample(0, 0, 0);
    for (const [forward, down, side] of [
      [0, 0, 0],
      [1e-15, 0, 0],
      [-1e-15, 0, 0],
      [0, 0, 1e-15],
      [0, 0, -1e-15],
      [0.01, 0, 0.01],
      [0.02, 0.01, 0.03],
      [0, 0, 0.2],
      [0, 0.3, 0.4],
      [5, 5, 5],
      [5, 0, 0],
      [-5, 0.01, -5],
    ]) {
      const actual = f.sample(forward, down, side);
      const length = Math.hypot(actual.forward, actual.down, actual.side);
      assert.ok(length >= 0.04 - 1e-7 && length <= 0.499 + 1e-7 && actual.down >= -1e-7);
      if (Math.hypot(forward, down, side) < 1e-12) {
        assert.ok(
          Math.hypot(
            actual.forward - neutral.forward,
            actual.down - neutral.down,
            actual.side - neutral.side,
          ) < 1e-7,
        );
        assert.ok(Math.abs(actual.pose.roll - neutral.pose.roll) < 1e-7);
        assert.ok(Math.abs(actual.pose.hip - neutral.pose.hip) < 1e-7);
      }
    }
    const edge = (0.3 * 0.3) / 0.5;
    const samples = [-1e-10, 0, 1e-10].map((epsilon) => {
      const side = edge + epsilon;
      return f.sample(Math.sqrt(0.3 * 0.3 - side * side), 0, side);
    });
    for (const sample of samples) {
      assert.ok(Math.abs(sample.pose.hip - samples[1].pose.hip) < 0.0001);
      assert.ok(Math.abs(sample.pose.roll - samples[1].pose.roll) < 0.0001);
    }
  } finally {
    f.engine.dispose();
  }
});
