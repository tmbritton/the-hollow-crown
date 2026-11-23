import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Game } from '../src/gameTypes.ts';
import { FullBodySolver } from '../src/rigs/solver.ts';
import { copyLocal } from '../src/rigs/ikMath.ts';
import { solverFixture } from './rig-solver-fixture.ts';
import { createReviewStage } from './animation-review-fixture.ts';
import type { ReviewProfile } from './animation-review-fixture.ts';

export function createSolverReview(g: Game) {
  const stage = createReviewStage(g);
  const bar = MeshBuilder.CreateBox(
    'solver:two-grip-frame',
    { width: 0.4, height: 0.045, depth: 0.065 },
    g.scene,
  );
  const step = MeshBuilder.CreateBox(
    'solver:sloped-step',
    { width: 0.32, height: 0.03, depth: 0.43 },
    g.scene,
  );
  bar.material = g.scene.getMaterialByName('gold');
  step.material = g.scene.getMaterialByName('stone');
  return {
    stage,
    fixture(profile: ReviewProfile) {
      const clip = stage.fixture(profile, 'travel'),
        actor = g.combat.actor(clip.id)!;
      const binding = actor.entity.require('rigPose'),
        rig = actor.entity.require('rig');
      const fixture = solverFixture(binding.pose.definition),
        solver = new FullBodySolver(binding.pose.definition);
      Object.assign(actor.position, { x: 0, z: 0, h: 0, heading: 0 });
      return {
        id: actor.id,
        sample(frame: number, stepping: boolean) {
          fixture.sample(frame, stepping);
          const result = solver.solve(fixture.base, fixture.targets);
          copyLocal(result.pose.local, binding.pose.local);
          binding.apply();
          for (const node of [
            ...(rig.equipment ?? []),
            ...(rig.stowedEquipment ?? []),
            rig.shield,
            rig.spear,
            rig.javelin,
          ])
            node?.setEnabled(false);
          const a = fixture.targets.leftGrip!,
            b = fixture.targets.rightGrip!,
            foot = fixture.targets.rightSole!;
          bar.position.set(
            (a.position[0] + b.position[0]) / 2,
            (a.position[1] + b.position[1]) / 2,
            (a.position[2] + b.position[2]) / 2,
          );
          bar.rotation.y = 2 * Math.asin(a.rotation![1]);
          step.rotation.x = 2 * Math.asin(foot.rotation![0]);
          step.position.set(
            foot.position[0],
            foot.position[1] - 0.015 * Math.cos(step.rotation.x),
            foot.position[2] - 0.015 * Math.sin(step.rotation.x),
          );
          step.setEnabled(stepping);
          let maximumFootError = 0,
            maximumHandError = 0,
            maximumOrientationError = 0,
            minimumCornerClearance = Infinity;
          for (const [i, side] of (['left', 'right'] as const).entries()) {
            const footNode = rig.feet[i],
              forearm = rig.forearms[i];
            footNode.computeWorldMatrix(true);
            forearm.computeWorldMatrix(true);
            const f = Vector3.TransformCoordinates(
              new Vector3(0, -0.05, fixture.base.definition.profile.soleForward),
              footNode.getWorldMatrix(),
            );
            const h = Vector3.TransformCoordinates(
              new Vector3(0, -0.27, 0),
              forearm.getWorldMatrix(),
            );
            const ft = fixture.targets[`${side}Sole`]!,
              ht = fixture.targets[`${side}Grip`]!;
            maximumFootError = Math.max(
              maximumFootError,
              Math.hypot(f.x - ft.position[0], f.y - ft.position[1], f.z - ft.position[2]),
            );
            maximumHandError = Math.max(
              maximumHandError,
              Math.hypot(h.x - ht.position[0], h.y - ht.position[1], h.z - ht.position[2]),
            );
            const pitch = 2 * Math.asin(ft.rotation![0]);
            const up = new Vector3(0, Math.cos(pitch), Math.sin(pitch));
            const normal = Vector3.TransformNormal(
              new Vector3(0, 1, 0),
              footNode.getWorldMatrix(),
            ).normalize();
            maximumOrientationError = Math.max(
              maximumOrientationError,
              Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(up, normal)))),
            );
            const mesh = footNode.getChildMeshes()[0];
            mesh.computeWorldMatrix(true);
            const box = mesh.getBoundingInfo().boundingBox;
            for (const x of [box.minimum.x, box.maximum.x])
              for (const z of [box.minimum.z, box.maximum.z]) {
                const corner = Vector3.TransformCoordinates(
                  new Vector3(x, box.minimum.y, z),
                  mesh.getWorldMatrix(),
                );
                minimumCornerClearance = Math.min(
                  minimumCornerClearance,
                  (corner.x - ft.position[0]) * up.x +
                    (corner.y - ft.position[1]) * up.y +
                    (corner.z - ft.position[2]) * up.z,
                );
              }
          }
          return {
            status: result.status,
            passes: result.passes,
            limbSolves: result.limbSolves,
            jointEvaluations: result.jointEvaluations,
            maximumFootError,
            maximumHandError,
            maximumOrientationError,
            minimumCornerClearance,
          };
        },
      };
    },
    async cost() {
      const fixtures = g.combat.actors.map((a) =>
        solverFixture(a.entity.require('rigPose').pose.definition),
      );
      const solvers = fixtures.map((f) => new FullBodySolver(f.base.definition));
      const times: number[] = [];
      let maxPasses = 0,
        maxJoints = 0,
        maxLimbs = 0;
      for (let frame = -60; frame < 240; frame++) {
        for (const f of fixtures) f.sample((frame + 60) % 120, true);
        const start = performance.now();
        for (let i = 0; i < solvers.length; i++) {
          const r = solvers[i].solve(fixtures[i].base, fixtures[i].targets);
          maxPasses = Math.max(maxPasses, r.passes);
          maxJoints = Math.max(maxJoints, r.jointEvaluations);
          maxLimbs = Math.max(maxLimbs, r.limbSolves);
        }
        if (frame >= 0) times.push(performance.now() - start);
        if (frame % 12 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      times.sort((a, b) => a - b);
      return {
        actors: solvers.length,
        frames: 240,
        warmup: 60,
        meanMs: times.reduce((a, b) => a + b, 0) / times.length,
        p95Ms: times[Math.floor(times.length * 0.95)],
        maxPasses,
        maxJoints,
        maxLimbs,
        terrainQueries: 0,
        scope: 'isolated four-target solves; target sampling, rendering and gameplay excluded',
      };
    },
    dispose() {
      bar.dispose();
      step.dispose();
    },
  };
}
