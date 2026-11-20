import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { ECS } from '../src/ecs.ts';
import type { Components } from '../src/ecs.ts';
import { createActor, moveActor, stopActor, teleportActor } from '../src/actors.ts';
import { createLocomotion, animateLocomotion } from '../src/locomotion.ts';
import { volumeScale } from '../src/animationCurves.ts';
import { placeFeet } from '../src/footPlacement.ts';
import { readCorpseTerrain } from '../src/corpseRendering.ts';
import { corpseHeightAt, corpseStep } from '../src/corpseTerrain.ts';
import { generateDungeon, heightAt, key } from '../src/world.ts';
import type { NavigationWorld } from '../src/navigation.ts';
import type { Tile } from '../src/worldTypes.ts';

function fixture() {
  const engine = new NullEngine();
  const scene = new Scene(engine),
    ecs = new ECS();
  const tiles = new Map<string, Tile>();
  for (let x = -5; x <= 5; x++)
    for (let z = -5; z <= 5; z++) tiles.set(key(x, z), { x, z, h: 0, surface: 'stone' });
  const world: NavigationWorld = { tiles, blockers: [], entities: [] };
  const root = new TransformNode('fallen root', scene);
  // A rotated, drawn box, not an actor-radius approximation. Top is exactly 0.4.
  const mesh = MeshBuilder.CreateBox(
    'fallen torso',
    { width: 0.6, height: 0.4, depth: 1.4 },
    scene,
  );
  mesh.parent = root;
  mesh.position.y = 0.2;
  const dead = createActor(ecs, world, 'dead', 'skeleton', { x: 0, z: 0, h: 0 });
  dead.health.current = 0;
  dead.entity.add('corpse', { age: 1 }).add('render', { root, meshes: [mesh] });
  return { engine, scene, ecs, world, dead, mesh, root };
}

test('corpse surface follows drawn boxes, rotation and height; excludes living, hidden and falling rigs', () => {
  const f = fixture();
  try {
    assert.ok(
      Math.abs(corpseHeightAt(readCorpseTerrain(f.ecs), { x: 0, z: 0, h: 0 }) - 0.4) < 1e-7,
    );
    assert.equal(corpseHeightAt(readCorpseTerrain(f.ecs), { x: 0.5, z: 0, h: 0 }), 0);
    f.root.rotation.y = Math.PI / 2;
    assert.ok(corpseHeightAt(readCorpseTerrain(f.ecs), { x: 0.5, z: 0, h: 0 }) > 0.39);
    assert.equal(corpseHeightAt(readCorpseTerrain(f.ecs), { x: 0, z: 0.5, h: 0 }), 0);
    assert.equal(corpseHeightAt(readCorpseTerrain(f.ecs), { x: 0, z: 0, h: 2 }), 0);
    f.root.position.y = 2;
    f.dead.position.h = 2;
    assert.equal(corpseHeightAt(readCorpseTerrain(f.ecs), { x: 0, z: 0, h: 0 }), 0);
    assert.ok(
      Math.abs(corpseHeightAt(readCorpseTerrain(f.ecs), { x: 0, z: 0, h: 2 }) - 0.4) < 1e-6,
    );
    f.mesh.isVisible = false;
    assert.equal(readCorpseTerrain(f.ecs).length, 0);
    f.mesh.isVisible = true;
    f.dead.entity.require('corpse').age = 0.1;
    assert.equal(readCorpseTerrain(f.ecs).length, 0);
    f.dead.entity.require('corpse').age = 1;
    f.dead.entity.remove('corpse');
    assert.equal(readCorpseTerrain(f.ecs).length, 0);
  } finally {
    f.engine.dispose();
  }
});

test('foot clearance anticipates only nearby bodies on the swing phase, is bounded and never stacks', () => {
  const f = fixture();
  try {
    const terrain = readCorpseTerrain(f.ecs);
    const point = { x: 0, z: -0.9, h: 0 },
      forward = { x: 0, z: 0.35 };
    const at = (phase: number) => corpseStep(terrain, point, forward, phase);
    assert.equal(at(0), 0);
    assert.equal(at(Math.PI), 0);
    assert.ok(at(Math.PI * 1.5) > 0.39);
    assert.ok(at(Math.PI * 1.1) < at(Math.PI * 1.5));
    assert.ok(at(Math.PI * 1.9) < at(Math.PI * 1.5));
    assert.ok(Math.abs(at(Math.PI * 2)) < 1e-7);
    for (let i = 0; i <= 200; i++) {
      const phase = (i * Math.PI) / 50;
      const step = at(phase);
      assert.ok(Number.isFinite(step) && step >= 0 && step <= 0.46);
      assert.equal(corpseStep([...terrain, ...terrain, ...terrain], point, forward, phase), step);
      assert.equal(corpseStep(terrain, { x: 3, z: 3, h: 0 }, forward, phase), 0);
    }
    assert.ok(Math.abs(corpseStep(terrain, { x: 0, z: 0, h: 0 }, forward, 0) - 0.4) < 1e-7);
  } finally {
    f.engine.dispose();
  }
});

test('tilted surfaces use oriented geometry; unchanged draws reuse samples and removal cannot leave phantom steps', () => {
  const f = fixture();
  try {
    f.mesh.rotation.z = Math.PI / 6;
    f.mesh.position.y = 0.1;
    const first = readCorpseTerrain(f.ecs);
    const left = corpseHeightAt(first, { x: -0.1, z: 0, h: 0 });
    const right = corpseHeightAt(first, { x: 0.1, z: 0, h: 0 });
    assert.ok(right > left + 0.1, 'the top slopes rather than using the whole AABB maximum');
    // The animator assigns identical transforms on settled corpses every fixed step.
    for (let i = 0; i < 60; i++) {
      f.root.position.set(0, 0, 0);
      f.mesh.position.set(0, 0.1, 0);
      assert.equal(readCorpseTerrain(f.ecs)[0], first[0], 'no repeated inverse/box allocation');
    }
    const upper = MeshBuilder.CreateBox('overlapping fallen head', { size: 0.4 }, f.scene);
    upper.position.y = 0.3;
    f.dead.entity.require('render').meshes.push(upper);
    assert.equal(
      corpseHeightAt(readCorpseTerrain(f.ecs), { x: 0, z: 0, h: 0 }),
      0.46,
      'higher overlaps take a capped maximum rather than accumulating offsets',
    );
    upper.setEnabled(false);
    assert.ok(corpseHeightAt(readCorpseTerrain(f.ecs), { x: 0, z: 0, h: 0 }) < 0.34);
    f.ecs.remove(f.dead.id);
    assert.equal(corpseHeightAt(readCorpseTerrain(f.ecs), { x: 0, z: 0, h: 0 }), 0);
    assert.equal(readCorpseTerrain(new ECS()).length, 0);
  } finally {
    f.engine.dispose();
  }
});

function rigFor(scene: Scene): Components['rig'] {
  const root = new TransformNode('walker', scene),
    body = new TransformNode('body', scene);
  body.parent = root;
  const legs = [-1, 1].map((sign) => {
    const leg = new TransformNode('leg', scene);
    leg.parent = root;
    leg.position.set(sign * 0.18, 0.55, 0);
    return leg;
  });
  const knees = legs.map((leg) => {
    const knee = new TransformNode('knee', scene);
    knee.parent = leg;
    knee.position.y = -0.25;
    return knee;
  });
  const feet = knees.map((knee) => {
    const foot = new TransformNode('foot', scene);
    foot.parent = knee;
    foot.position.y = -0.25;
    return foot;
  });
  return {
    root,
    body,
    legs,
    knees,
    feet,
    arms: [],
    forearms: [],
    footPlants: [{ anchor: null }, { anchor: null }],
    attackBlend: 0,
    attackPose: null,
    socialBlend: 0,
    socialPose: null,
  };
}

test('skeleton long load and quick catch-up use the same contact phase as the visible legs', () => {
  const f = fixture();
  try {
    const actor = createActor(f.ecs, f.world, 'lurch', 'skeleton', { x: 3, z: 0, h: 0 });
    const rig = rigFor(f.scene);
    actor.entity.add('rig', rig);
    actor.motion.actualSpeed = 1.65;
    actor.motion.velocity = { x: 0, z: 1.65 };
    actor.motion.animation.blend = 1;
    // Late in the long left load: ordinary half-cycle timing has already lifted this foot.
    actor.motion.animation.stride = Math.PI * 2 * 0.52;
    const pose = animateLocomotion(actor.motion.animation, 1.65, true, 0, 1.65, false, 'skeleton');
    rig.root.position.set(3, 0, 0);
    placeFeet(actor, rig, pose, f.world);
    assert.ok(rig.footPlants[0].anchor, 'left load must still be planted at 52% of the cycle');
    assert.equal(rig.footPlants[1].anchor, null, 'right foot is still recovering');
    rig.feet.forEach((foot) => foot.computeWorldMatrix(true));
    const soles = rig.feet.map((foot) => foot.getAbsolutePosition().y - 0.05);
    assert.ok(soles[0] < 0.015 && soles[0] > -0.005 && soles[1] > 0.025, String(soles));
  } finally {
    f.engine.dispose();
  }
});

test('shared player/enemy feet step on drawn height without changing support/jump; reset and repeated samples stay stable', () => {
  const f = fixture();
  try {
    for (const kind of ['player', 'goblin', 'kobold', 'skeleton'] as const) {
      const actor = createActor(f.ecs, f.world, kind, kind, { x: 0, z: 0, h: 0 });
      const rig = rigFor(f.scene);
      actor.entity.add('rig', rig);
      actor.motion.actualSpeed = 4.8;
      actor.motion.animation = createLocomotion();
      const pose = animateLocomotion(actor.motion.animation, 4.8, true, 1 / 60);
      const terrain = readCorpseTerrain(f.ecs);
      const sample = () => {
        rig.root.position.set(0, 0, 0);
        placeFeet(actor, rig, pose, f.world, terrain);
        rig.root.computeWorldMatrix(true);
        return rig.feet.map((foot, i) => {
          rig.legs[i].computeWorldMatrix(true);
          rig.knees[i].computeWorldMatrix(true);
          foot.computeWorldMatrix(true);
          return foot.getAbsolutePosition().y - 0.05;
        });
      };
      const soles = sample();
      assert.ok(
        soles.every((h) => h >= 0.39 && h <= 0.56),
        `${kind}: ${soles}`,
      );
      for (let i = 0; i < 300; i++) assert.deepEqual(sample(), soles);
      assert.equal(actor.position.h, 0);
      assert.equal(actor.elevation, 0);
      assert.equal(actor.jump.active, false);
      stopActor(actor);
      assert.ok(rig.footPlants.every((p) => p.anchor === null));
      teleportActor(actor, f.world, { x: 3, z: 3 });
      rig.root.position.set(actor.position.x, 0, actor.position.z);
      placeFeet(
        actor,
        rig,
        animateLocomotion(actor.motion.animation, 0, false, 0),
        f.world,
        terrain,
      );
      assert.ok(rig.footPlants.every((p) => p.anchor === null));
      assert.ok(rig.knees.every((k) => k.rotation.x < 0.2));
      teleportActor(actor, f.world, { x: 0, z: 0 });
      rig.root.position.set(0, 0, 0);
      actor.jump.request();
      actor.jump.advance(0.1);
      placeFeet(actor, rig, pose, f.world, terrain);
      assert.ok(rig.footPlants.every((p) => p.anchor === null));
      assert.equal(
        rig.knees[0].rotation.x,
        pose.leftKnee,
        'flight over a corpse keeps the jump leg pose',
      );
      assert.equal(
        rig.root.position.y,
        actor.elevation + pose.lift,
        'no corpse rise during flight',
      );
      f.ecs.remove(actor.id);
    }
  } finally {
    f.engine.dispose();
  }
});

test('moving feet clear corpse edges at their final rendered positions, including retained plants and reach limits', (t) => {
  const f = fixture();
  try {
    // Exact settled goblin vest from the review case: death root (0,-0.8), height 0.24,
    // local torso (0,0.82,0), dimensions (0.58,0.55,0.36), rotated forward onto the floor.
    f.mesh.scaling.set(0.58 / 0.6, 0.36 / 0.4, 0.55 / 1.4);
    f.mesh.position.set(0, 0.24, 0.02);
    const cases = [
      ['goblin', 3.7, 2.5],
      ['goblin', 5.2, 2.5],
      ['kobold', 2.9, 2.1],
      ['skeleton', 1.65, 1.65],
      ['player', 4.8, 4.8],
      ['player', 7.4, 4.8],
    ] as const;
    let contacts = 0,
      anchoredContacts = 0,
      samples = 0,
      worstPenetration = 0;
    const failures: object[] = [];
    for (const [kind, speed, walkSpeed] of cases)
      for (const angle of [0, Math.PI / 6, Math.PI / 2, 2.3]) {
        f.root.rotation.y = angle;
        const terrain = readCorpseTerrain(f.ecs);
        const direction = { x: Math.cos(angle), z: -Math.sin(angle) };
        const actor = createActor(f.ecs, f.world, 'mover', kind, {
          x: -2 * direction.x,
          z: -2 * direction.z,
          h: 0,
        });
        const rig = rigFor(f.scene);
        actor.entity.add('rig', rig);
        rig.root.rotation.y = actor.position.heading = Math.atan2(direction.x, direction.z);
        for (let frame = 1; frame <= Math.ceil((4.5 / speed) * 60) + 12; frame++) {
          moveActor(actor, f.world, { direction, speed }, 1 / 60);
          const pose = animateLocomotion(
            actor.motion.animation,
            actor.motion.actualSpeed,
            true,
            1 / 60,
            walkSpeed,
            false,
            kind === 'skeleton' ? 'skeleton' : 'ordinary',
          );
          const scale = volumeScale(pose.stretch, pose.reach);
          rig.root.scaling.set(scale.x, scale.y, scale.z);
          rig.root.position.set(actor.position.x, actor.position.h + pose.lift, actor.position.z);
          placeFeet(actor, rig, pose, f.world, terrain);
          for (const [footIndex, foot] of rig.feet.entries()) {
            foot.computeWorldMatrix(true);
            const position = foot.getAbsolutePosition();
            const surface = corpseHeightAt(terrain, { x: position.x, z: position.z, h: 0 });
            const sole = position.y - 0.05 * scale.y;
            samples++;
            if (surface > 0) {
              contacts++;
              worstPenetration = Math.max(worstPenetration, surface - sole);
              if (rig.footPlants[footIndex].anchor) anchoredContacts++;
            }
            if (
              ((surface > 0 && surface - sole > 0.005) || !Number.isFinite(sole) || sole >= 0.65) &&
              failures.length < 8
            )
              failures.push({
                kind,
                speed,
                angle,
                frame,
                footIndex,
                surface,
                sole,
                x: position.x,
                z: position.z,
                anchor: rig.footPlants[footIndex].anchor,
              });
          }
          assert.equal(actor.position.h, 0);
          assert.equal(actor.elevation, 0);
          assert.equal(actor.jump.landings, 0);
          assert.ok(rig.root.position.y <= pose.lift + 0.14);
        }
        rig.root.dispose();
        f.ecs.remove(actor.id);
      }
    assert.ok(
      contacts > 100 && anchoredContacts > 20,
      'exercise actual surface contact and retained plants',
    );
    t.diagnostic(
      JSON.stringify({ crossings: 24, samples, contacts, anchoredContacts, worstPenetration }),
    );
    assert.deepEqual(
      failures,
      [],
      'a reachable rendered foot must clear the surface at its own x/z',
    );
  } finally {
    f.engine.dispose();
  }
});

test('translated uphill/downhill corpse crossings preserve contact at actual feet on real seeded stairs', (t) => {
  const f = fixture();
  try {
    const world = generateDungeon('MOURNING-731');
    f.mesh.scaling.set(0.58 / 0.6, 0.36 / 0.4, 0.55 / 1.4);
    f.mesh.position.set(0, 0.24, 0.02);
    const floor = heightAt(world, -52, 14.5)!;
    f.root.position.set(-52, floor, 14.5);
    f.dead.position.h = floor;
    let samples = 0,
      contacts = 0,
      worstPenetration = 0;
    const failures: object[] = [];
    for (const [kind, speed, walkSpeed] of [
      ['goblin', 3.7, 2.5],
      ['kobold', 2.9, 2.1],
      ['skeleton', 1.65, 1.65],
      ['player', 4.8, 4.8],
      ['player', 7.4, 4.8],
    ] as const)
      for (const direction of [-1, 1])
        for (const angle of [0, 0.61]) {
          f.root.rotation.y = Math.PI / 2 + angle;
          const terrain = readCorpseTerrain(f.ecs);
          const z = 14.5 - 2 * direction;
          const actor = createActor(f.ecs, world, 'mover', kind, {
            x: -52,
            z,
            h: heightAt(world, -52, z)!,
          });
          const startHeight = actor.position.h;
          const rig = rigFor(f.scene);
          actor.entity.add('rig', rig);
          rig.root.rotation.y = actor.position.heading = direction < 0 ? Math.PI : 0;
          for (let frame = 1; frame <= Math.ceil((4.5 / speed) * 60) + 12; frame++) {
            moveActor(actor, world, { direction: { x: 0, z: direction }, speed }, 1 / 60);
            const pose = animateLocomotion(
              actor.motion.animation,
              actor.motion.actualSpeed,
              true,
              1 / 60,
              walkSpeed,
              false,
              kind === 'skeleton' ? 'skeleton' : 'ordinary',
            );
            const scale = volumeScale(pose.stretch, pose.reach);
            rig.root.scaling.set(scale.x, scale.y, scale.z);
            rig.root.position.set(actor.position.x, actor.position.h + pose.lift, actor.position.z);
            placeFeet(actor, rig, pose, world, terrain);
            for (const [index, foot] of rig.feet.entries()) {
              foot.computeWorldMatrix(true);
              const p = foot.getAbsolutePosition(),
                h = heightAt(world, p.x, p.z)!;
              const surface = corpseHeightAt(terrain, { x: p.x, z: p.z, h });
              const sole = p.y - 0.05 * scale.y;
              samples++;
              if (surface > 0) {
                contacts++;
                const penetration = h + surface - sole;
                worstPenetration = Math.max(worstPenetration, penetration);
                if (penetration > 0.005 && failures.length < 6)
                  failures.push({
                    kind,
                    speed,
                    direction,
                    angle,
                    frame,
                    index,
                    surface: h + surface,
                    sole,
                    x: p.x,
                    z: p.z,
                    roll: rig.legs[index].rotation.z,
                  });
              }
              if (
                (!Number.isFinite(sole) || sole - actor.position.h >= 0.65) &&
                failures.length < 6
              )
                failures.push({
                  kind,
                  speed,
                  direction,
                  angle,
                  frame,
                  index,
                  sole,
                  support: actor.position.h,
                  reason: 'unbounded sole',
                });
            }
            assert.equal(actor.position.h, heightAt(world, actor.position.x, actor.position.z));
            assert.equal(actor.elevation, actor.position.h);
            assert.equal(actor.jump.landings, 0);
          }
          assert.ok(
            direction < 0
              ? actor.position.h > startHeight + 0.5
              : actor.position.h < startHeight - 0.5,
          );
          rig.root.dispose();
          f.ecs.remove(actor.id);
        }
    assert.ok(contacts > 100);
    t.diagnostic(JSON.stringify({ crossings: 20, samples, contacts, worstPenetration }));
    assert.deepEqual(failures, []);
  } finally {
    f.engine.dispose();
  }
});

test('ordinary turning plants stay bounded on flat floor and continuous stairs at walk/run speeds', (t) => {
  const f = fixture();
  try {
    let plants = 0;
    for (const slope of [0, 0.2])
      for (const speed of [2.9, 4.8, 7.4]) {
        for (const tile of f.world.tiles.values()) {
          tile.h = -1;
          tile.ramp = { axis: 'z', start: -5, distance: 10, sign: 1, a: -1, b: -1 + slope * 10 };
        }
        const actor = createActor(f.ecs, f.world, 'turner', 'player', {
          x: -1,
          z: -1,
          h: heightAt(f.world, -1, -1)!,
        });
        const rig = rigFor(f.scene);
        actor.entity.add('rig', rig);
        for (let frame = 0; frame < 192; frame++) {
          const heading = (Math.floor(frame / 24) * Math.PI) / 2;
          moveActor(
            actor,
            f.world,
            { direction: { x: Math.sin(heading), z: Math.cos(heading) }, speed },
            1 / 60,
          );
          rig.root.rotation.y +=
            Math.atan2(
              Math.sin(actor.position.heading - rig.root.rotation.y),
              Math.cos(actor.position.heading - rig.root.rotation.y),
            ) *
            (1 - Math.exp(-18 / 60));
          const pose = animateLocomotion(
            actor.motion.animation,
            actor.motion.actualSpeed,
            true,
            1 / 60,
          );
          const scale = volumeScale(pose.stretch, pose.reach);
          rig.root.scaling.set(scale.x, scale.y, scale.z);
          rig.root.position.set(actor.position.x, actor.position.h + pose.lift, actor.position.z);
          placeFeet(actor, rig, pose, f.world);
          for (const [i, foot] of rig.feet.entries()) {
            foot.computeWorldMatrix(true);
            assert.ok(
              [rig.legs[i].rotation.x, rig.legs[i].rotation.z, rig.knees[i].rotation.x].every(
                Number.isFinite,
              ),
            );
            if (!rig.footPlants[i].anchor) continue;
            plants++;
            const p = foot.getAbsolutePosition(),
              ground = heightAt(f.world, p.x, p.z)!;
            assert.ok(
              p.y - 0.05 * scale.y >= ground - 0.03,
              JSON.stringify({ slope, speed, frame, foot: i, p: p.asArray(), ground }),
            );
            assert.ok(Math.hypot(p.x - actor.position.x, p.z - actor.position.z) < 0.55);
          }
          assert.equal(actor.position.h, heightAt(f.world, actor.position.x, actor.position.z));
        }
        rig.root.dispose();
        f.ecs.remove(actor.id);
      }
    assert.ok(plants > 300);
    t.diagnostic(`${plants} ordinary turning stance samples`);
  } finally {
    f.engine.dispose();
  }
});
