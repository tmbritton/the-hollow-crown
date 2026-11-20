import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECS } from '../src/ecs.ts';
import { createActor, moveActor, stopActor } from '../src/actors.ts';
import { animateLocomotion } from '../src/locomotion.ts';
import { humanoid, profiles } from '../src/rigs/humanoid.ts';
import { GroundedLocomotion, GROUNDING_BUDGET } from '../src/rigs/grounding.ts';
import { worldPoint } from '../src/rigs/pose.ts';
import type { NavigationWorld } from '../src/navigation.ts';
import type { Tile } from '../src/worldTypes.ts';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { corpseHeightAt } from '../src/corpseTerrain.ts';
import type { CorpseBox } from '../src/corpseTerrain.ts';
import { heightAt } from '../src/world.ts';
import { FullBodySolver } from '../src/rigs/solver.ts';
import { createPose, socketPoint } from '../src/rigs/pose.ts';
import type { RigTargets } from '../src/rigs/targets.ts';

function body(yaw: number, height = 0.38, x = 0, z = 0, floor = 0): CorpseBox {
  const matrix = Matrix.Compose(
    Vector3.One(),
    Quaternion.RotationYawPitchRoll(yaw, 0, 0),
    new Vector3(x, floor + height / 2, z),
  );
  const min = new Vector3(-0.6, -height / 2, -0.275),
    max = new Vector3(0.6, height / 2, 0.275);
  const corners = [];
  for (const x of [min.x, max.x])
    for (const y of [min.y, max.y])
      for (const z of [min.z, max.z])
        corners.push(Vector3.TransformCoordinates(new Vector3(x, y, z), matrix));
  return {
    min,
    max,
    inverse: Matrix.Invert(matrix).m,
    floor,
    worldMin: new Vector3(
      Math.min(...corners.map((p) => p.x)),
      Math.min(...corners.map((p) => p.y)),
      Math.min(...corners.map((p) => p.z)),
    ),
    worldMax: new Vector3(
      Math.max(...corners.map((p) => p.x)),
      Math.max(...corners.map((p) => p.y)),
      Math.max(...corners.map((p) => p.z)),
    ),
  };
}

function fixture(kind: keyof typeof profiles = 'player', slope = 0) {
  const tiles = new Map<string, Tile>();
  for (let x = -10; x <= 10; x++)
    for (let z = -10; z <= 10; z++)
      tiles.set(`${x},${z}`, {
        x,
        z,
        h: slope * z,
        surface: 'stone',
        ...(slope
          ? {
              ramp: {
                axis: 'z' as const,
                start: -10,
                distance: 20,
                sign: 1,
                a: -10 * slope,
                b: 10 * slope,
              },
            }
          : {}),
      });
  const world: NavigationWorld = { tiles, blockers: [], entities: [] };
  const actor = createActor(new ECS(), world, kind, kind, { x: 0, z: 0, h: 0 });
  const plants = [{ anchor: null }, { anchor: null }];
  const grounding = new GroundedLocomotion(humanoid(profiles[kind]), plants);
  const sample = (dt = 1 / 60) =>
    grounding.sample(
      actor,
      animateLocomotion(
        actor.motion.animation,
        actor.motion.actualSpeed,
        actor.motion.wantsMovement,
        dt,
        profiles[kind].gaitSpeed,
        actor.jump.airborne,
        profiles[kind].gait,
      ),
      actor.position.heading,
      world,
      [],
    );
  return { actor, world, grounding, sample };
}

test('locomotion uses coordinated sole targets with a fixed gameplay anchor and final corner clearance', () => {
  for (const kind of ['player', 'skeleton', 'goblin', 'kobold'] as const)
    for (const slope of [0, 0.25, -0.25]) {
      const f = fixture(kind, slope);
      for (let frame = 0; frame < 150; frame++) {
        moveActor(
          f.actor,
          f.world,
          { direction: { x: Math.sin(frame / 60) * 0.3, z: 1 }, speed: profiles[kind].gaitSpeed },
          1 / 60,
        );
        const before = JSON.stringify({
          position: f.actor.position,
          jump: f.actor.jump,
          speed: f.actor.motion.actualSpeed,
          path: f.actor.navigator.path,
        });
        const result = f.sample();
        assert.equal(
          JSON.stringify({
            position: f.actor.position,
            jump: f.actor.jump,
            speed: f.actor.motion.actualSpeed,
            path: f.actor.navigator.path,
          }),
          before,
        );
        assert.deepEqual(worldPoint(result.pose, 'root'), [
          f.actor.position.x,
          f.actor.elevation,
          f.actor.position.z,
        ]);
        assert.ok(f.grounding.terrainQueries <= GROUNDING_BUDGET.terrainQueries);
        assert.ok(result.passes <= 4 && result.limbSolves <= 16);
        assert.ok(
          f.grounding.minimumClearance >= -0.001,
          `${kind}/${slope}/${frame}: ${f.grounding.minimumClearance}`,
        );
        for (const contact of f.grounding.contacts)
          if (contact.plant.anchor)
            assert.ok(contact.anchorError <= 0.02, `${kind} plant drift ${contact.anchorError}`);
        const saved = [...result.pose.world];
        f.sample(0);
        f.sample(0);
        assert.deepEqual(
          [...f.grounding.result.pose.world],
          saved,
          `${kind}/${slope}/${frame}: zero-time resampling changed a contact decision`,
        );
      }
    }
});

test('grounding preserves skeleton stance timing, releases flight and resets independent contacts', () => {
  const f = fixture('skeleton');
  f.actor.motion.actualSpeed = 1.65;
  f.actor.motion.wantsMovement = true;
  f.actor.motion.animation.blend = 1;
  f.actor.motion.animation.stride = Math.PI * 2 * 0.52;
  f.sample(0);
  assert.ok(f.grounding.contacts[0].plant.anchor);
  assert.equal(f.grounding.contacts[1].plant.anchor, null);
  assert.equal(f.grounding.contacts[0].target.required, true);
  assert.equal(f.grounding.contacts[1].target.required, false);
  const before = [...f.grounding.result.pose.world];
  for (let i = 0; i < 20; i++) f.sample(0);
  assert.deepEqual([...f.grounding.result.pose.world], before);
  f.actor.jump.request();
  f.actor.jump.advance(0.1);
  f.sample();
  assert.ok(f.grounding.contacts.every((c) => c.mode === 'flight' && c.plant.anchor === null));
  assert.equal(f.grounding.terrainQueries, 0);
  stopActor(f.actor);
  f.grounding.reset();
  assert.ok(f.grounding.contacts.every((c) => c.plant.anchor === null));
  assert.equal(f.grounding.active, false);
});

test('moving sloped corpse edges are checked at final soles after every pelvis correction', () => {
  for (const kind of ['player', 'skeleton', 'goblin', 'kobold'] as const)
    for (const slope of [0, 0.22, -0.22])
      for (const yaw of [0, 0.61]) {
        const f = fixture(kind, slope),
          corpses = [body(yaw)],
          profile = profiles[kind];
        Object.assign(f.actor.position, { z: -2, h: -2 * slope });
        for (let frame = 0; frame < Math.ceil((4.5 / profile.gaitSpeed) * 60) + 12; frame++) {
          moveActor(
            f.actor,
            f.world,
            { direction: { x: 0, z: 1 }, speed: profile.gaitSpeed },
            1 / 60,
          );
          const pose = animateLocomotion(
            f.actor.motion.animation,
            f.actor.motion.actualSpeed,
            true,
            1 / 60,
            profile.gaitSpeed,
            false,
            profile.gait,
          );
          const result = f.grounding.sample(f.actor, pose, 0, f.world, corpses);
          for (const side of ['leftFoot', 'rightFoot'] as const)
            for (const x of [-profile.soleHalfWidth, profile.soleHalfWidth])
              for (const z of [
                profile.soleForward - profile.soleHalfDepth,
                profile.soleForward + profile.soleHalfDepth,
              ]) {
                const p = worldPoint(result.pose, side, [x, -0.05, z]),
                  h = heightAt(f.world, p[0], p[2])!;
                const surface = h + corpseHeightAt(corpses, { x: p[0], z: p[2], h });
                assert.ok(
                  p[1] - surface >= -0.001,
                  `${kind}/${slope}/${yaw}/${frame}: ${p[1] - surface} ${result.status}`,
                );
              }
          assert.ok(f.grounding.corpseRise <= 0.14);
          const saved = [...result.pose.world];
          f.grounding.sample(f.actor, pose, 0, f.world, corpses);
          assert.deepEqual(
            [...f.grounding.result.pose.world],
            saved,
            `${kind}/${slope}/${yaw}/${frame}: repeated contact correction drifted`,
          );
        }
      }
});

test('final-contact refinement shares the four-pass budget and never restores a stale earlier candidate', () => {
  const base = createPose(humanoid(profiles.player)),
    solver = new FullBodySolver(base.definition);
  const left: [number, number, number] = [-0.2, 0, 0.06],
    right: [number, number, number] = [0.2, 0, 0.06];
  const targets: RigTargets = {
    leftSole: { space: 'rig', position: left, required: true },
    rightSole: { space: 'rig', position: right, required: true },
  };
  let calls = 0;
  const result = solver.solve(base, targets, () => {
    calls++;
    if (calls === 1) {
      left[1] = 0.12;
      return true;
    }
    return false;
  });
  assert.equal(result.status, 'solved');
  assert.equal(calls, result.passes);
  assert.ok(Math.abs(socketPoint(result.pose, 'leftSole')[1] - 0.12) < 0.001);
  assert.ok(Math.abs(socketPoint(result.pose, 'rightSole')[1]) < 0.001);
  let last: number[] = [];
  calls = 0;
  const conflict = solver.solve(base, targets, (p) => {
    calls++;
    last = [...p.world];
    left[1] += 2;
    return true;
  });
  assert.equal(calls, 4);
  assert.equal(conflict.passes, 4);
  assert.equal(conflict.status, 'infeasible');
  assert.deepEqual([...conflict.pose.world], last);
  assert.ok(conflict.limbSolves <= 16 && conflict.jointEvaluations <= 249);
});

test('corpse support unions overlaps, drops retired geometry, and retains full-speed authoritative travel', () => {
  const f = fixture('player'),
    corpse = body(0.61);
  const pose = animateLocomotion(f.actor.motion.animation, 0, false, 0);
  const first = f.grounding.sample(f.actor, pose, 0, f.world, [corpse]);
  const snapshot = [...first.pose.world],
    rise = f.grounding.corpseRise;
  f.grounding.sample(f.actor, pose, 0, f.world, [corpse, corpse, corpse]);
  assert.deepEqual([...f.grounding.result.pose.world], snapshot);
  assert.equal(f.grounding.corpseRise, rise);
  f.grounding.sample(f.actor, pose, 0, f.world, []);
  assert.equal(f.grounding.corpseRise, 0);
  assert.ok(socketPoint(f.grounding.result.pose, 'leftSole')[1] < 0.002);
  const control = fixture('player');
  for (let frame = 0; frame < 150; frame++) {
    for (const actor of [f.actor, control.actor])
      moveActor(actor, f.world, { direction: { x: 0, z: 1 }, speed: 7.4 }, 1 / 60);
    const sampled = animateLocomotion(
      f.actor.motion.animation,
      f.actor.motion.actualSpeed,
      true,
      1 / 60,
    );
    f.grounding.sample(f.actor, sampled, 0, f.world, [corpse]);
    assert.deepEqual(f.actor.position, control.actor.position);
    assert.equal(f.actor.motion.actualSpeed, control.actor.motion.actualSpeed);
    assert.equal(f.actor.jump.height, 0);
  }
});

test('review: a release frame is a single presentation snapshot even when inspected repeatedly', () => {
  for (const kind of ['goblin', 'kobold'] as const) {
    const f = fixture(kind),
      slope = 0.25,
      heading = 1.3;
    for (const tile of f.world.tiles.values()) {
      tile.h = tile.x * slope;
      tile.ramp = { axis: 'x', start: -10, distance: 20, sign: 1, a: -10 * slope, b: 10 * slope };
    }
    Object.assign(f.actor.position, {
      x: -Math.sin(heading) * 1.4,
      z: -Math.cos(heading) * 1.4,
      h: -Math.sin(heading) * 1.4 * slope,
    });
    const corpses = [body(0.61, 0.46, 0.13, -0.07, 0.13 * slope)];
    for (let frame = 0; frame < 70; frame++) {
      moveActor(
        f.actor,
        f.world,
        { direction: { x: Math.sin(heading), z: Math.cos(heading) }, speed: 2.5 },
        1 / 60,
      );
      const pose = animateLocomotion(
        f.actor.motion.animation,
        f.actor.motion.actualSpeed,
        true,
        1 / 60,
        2.5,
      );
      const result = f.grounding.sample(f.actor, pose, heading, f.world, corpses);
      const snapshot = [...result.pose.world],
        releases = f.grounding.contacts.map((c) => c.releases);
      for (let repeat = 0; repeat < 3; repeat++)
        f.grounding.sample(f.actor, pose, heading, f.world, corpses);
      assert.deepEqual(
        [...result.pose.world],
        snapshot,
        `${kind}/${frame}: repeated sample changed the solved frame`,
      );
      assert.deepEqual(
        f.grounding.contacts.map((c) => c.releases),
        releases,
      );
    }
  }
});
