import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { DebugWindow } from './browserTypes.ts';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { ActorKind } from '../src/ecs.ts';

declare const window: DebugWindow;
type Clip =
  | 'start'
  | 'walk'
  | 'run'
  | 'stop'
  | 'melee'
  | 'running-melee'
  | 'ranged'
  | 'death'
  | 'jump';
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 500 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const captures: { title: string; image: string }[] = [];
  await mkdir('test-results', { recursive: true });

  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  await page.evaluate(async () => {
    window.__dungeon.engine.stopRenderLoop();
    await window.__dungeon.regenerate('MOURNING-731');
  });
  await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
  await page.evaluate(() => window.__dungeon.engine.stopRenderLoop());
  await page.addStyleTag({
    content:
      'body > :not(#game) { display: none !important; } body::after { display: none !important; }',
  });
  const crossCorpse = async (
    kind: ActorKind,
    speed: number,
    angle: number,
    captureFrame?: number,
    location: 'flat' | 'uphill' | 'downhill' = 'flat',
  ) =>
    page.evaluate(
      async ({ kind, speed, angle, captureFrame, location }) => {
        const actorsPath = '/src/actors.ts',
          renderPath = '/src/actorRendering.ts',
          terrainPath = '/src/corpseRendering.ts',
          samplePath = '/src/corpseTerrain.ts',
          worldPath = '/src/world.ts';
        const { heightAt } = (await import(worldPath)) as typeof import('../src/world.ts');
        const { moveActor, stopActor } = (await import(
          actorsPath
        )) as typeof import('../src/actors.ts');
        const { animateActors, resetActorRig } = (await import(
          renderPath
        )) as typeof import('../src/actorRendering.ts');
        const { readCorpseTerrain } = (await import(
          terrainPath
        )) as typeof import('../src/corpseRendering.ts');
        const { corpseHeightAt } = (await import(
          samplePath
        )) as typeof import('../src/corpseTerrain.ts');
        const g = window.__dungeon.game;
        const mover =
          kind === 'player' ? g.player.actor : g.combat.enemies.find((a) => a.kind === kind)!;
        const dead = g.combat.enemies.find(
          (a) => a.id !== mover.id && a.kind === (kind === 'player' ? 'goblin' : kind),
        )!;
        for (const actor of g.combat.actors) {
          stopActor(actor);
          actor.attack.reset();
          actor.entity.remove('brain');
          actor.entity.remove('corpse');
          actor.health.current = actor.health.max;
          Object.assign(actor.position, { x: 1000, z: 1000, h: 0 });
          const rig = actor.entity.require('rig');
          resetActorRig(rig);
          rig.root.setEnabled(actor.id === mover.id || actor.id === dead.id);
        }
        const center = location === 'flat' ? { x: 0, z: 0 } : { x: -52, z: 14.5 };
        const corpseHeading = angle + (location === 'flat' ? 0 : Math.PI / 2);
        const direction =
          location === 'flat' ? { x: 1, z: 0 } : { x: 0, z: location === 'uphill' ? -1 : 1 };
        const start = { x: center.x - direction.x * 2, z: center.z - direction.z * 2 };
        const corpsePoint = {
          x: center.x - Math.sin(corpseHeading) * 0.8,
          z: center.z - Math.cos(corpseHeading) * 0.8,
        };
        const startHeight = heightAt(g.world, start.x, start.z),
          corpseFloor = heightAt(g.world, corpsePoint.x, corpsePoint.z);
        if (startHeight === null || corpseFloor === null)
          throw new Error('Crossing needs real supported terrain');
        Object.assign(dead.position, { ...corpsePoint, h: corpseFloor, heading: corpseHeading });
        dead.entity.require('rig').root.rotation.y = corpseHeading;
        dead.health.current = 0;
        dead.entity.add('corpse', { age: 1 });
        Object.assign(mover.position, {
          ...start,
          h: startHeight,
          heading: Math.atan2(direction.x, direction.z),
        });
        const rig = mover.entity.require('rig');
        rig.root.rotation.y = mover.position.heading;
        let worst = {
          penetration: 0,
          frame: 0,
          foot: 0,
          surface: 0,
          sole: 0,
          x: 0,
          z: 0,
          anchor: null as { x: number; z: number; h: number } | null,
        };
        let contacts = 0;
        const frames = captureFrame ?? Math.ceil((4.5 / speed) * 60) + 12;
        for (let frame = 1; frame <= frames; frame++) {
          moveActor(mover, g.world, { direction, speed }, 1 / 60);
          animateActors(g.ecs, 1 / 60, frame / 60, g.world);
          const terrain = readCorpseTerrain(g.ecs);
          for (const [i, foot] of rig.feet.entries()) {
            foot.computeWorldMatrix(true);
            const p = foot.getAbsolutePosition(),
              floor = heightAt(g.world, p.x, p.z);
            if (floor === null) throw new Error('Rendered foot left the supported crossing');
            const contactHeight = corpseHeightAt(terrain, { x: p.x, z: p.z, h: floor });
            const surface = floor + contactHeight;
            const sole = p.y - 0.05 * rig.root.scaling.y;
            if (contactHeight > 0) {
              contacts++;
              if (surface - sole > worst.penetration)
                worst = {
                  penetration: surface - sole,
                  frame,
                  foot: i,
                  surface,
                  sole,
                  x: p.x,
                  z: p.z,
                  anchor: rig.footPlants[i].anchor ? { ...rig.footPlants[i].anchor! } : null,
                };
            }
            if (!Number.isFinite(sole) || sole - mover.position.h > 0.65)
              throw new Error('Unbounded foot solve');
          }
          if (
            mover.position.h !== heightAt(g.world, mover.position.x, mover.position.z) ||
            mover.elevation !== mover.position.h ||
            mover.jump.landings !== 0
          )
            throw new Error('Visual foot correction changed authoritative support/jump');
          if (frame % 12 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
        }
        if (captureFrame) {
          g.player.marker.setEnabled(false);
          g.player.destinationMarker.setEnabled(false);
          g.camera.alpha = -Math.PI / 2 + (location === 'flat' ? 0.28 : 0.03);
          g.camera.beta = location === 'flat' ? 1.25 : 1.15;
          g.camera.radius = location === 'flat' ? 6.5 : 5;
          g.camera.target.set(center.x, corpseFloor + 0.7, center.z);
          g.scene.render();
        }
        return {
          kind,
          speed,
          angle,
          location,
          startHeight,
          endHeight: mover.position.h,
          contacts,
          worst,
        };
      },
      { kind, speed, angle, captureFrame, location },
    );
  const crossings = [];
  for (const [kind, speed] of [
    ['goblin', 3.7],
    ['goblin', 5.2],
    ['kobold', 2.9],
    ['skeleton', 1.65],
    ['player', 4.8],
    ['player', 7.4],
  ] as const)
    for (const angle of [0, 0.61]) {
      crossings.push(await crossCorpse(kind, speed, angle));
    }
  for (const location of ['uphill', 'downhill'] as const)
    for (const [kind, speed] of [
      ['goblin', 3.7],
      ['kobold', 2.9],
      ['player', 4.8],
      ['player', 7.4],
    ] as const)
      for (const angle of [0, 0.61]) {
        const crossing = await crossCorpse(kind, speed, angle, undefined, location);
        assert.ok(
          location === 'uphill'
            ? crossing.endHeight > crossing.startHeight + 0.5
            : crossing.endHeight < crossing.startHeight - 0.5,
        );
        crossings.push(crossing);
      }
  assert.ok(
    crossings.every((c) => c.worst.penetration < 0.005),
    JSON.stringify(crossings, null, 2),
  );
  assert.ok(
    crossings.every((c) => c.contacts > 0),
    JSON.stringify(crossings, null, 2),
  );
  for (const [kind, speed, angle, frame] of [
    ['goblin', 3.7, 0, 37],
    ['goblin', 3.7, 0, 43],
    ['kobold', 2.9, 0.61, 47],
    ['player', 4.8, 0.61, 25],
  ] as const) {
    await crossCorpse(kind, speed, angle, frame);
    captures.push({
      title: `${kind}: moving edge contact, ${speed}/s, frame ${frame}`,
      image: (await page.screenshot()).toString('base64'),
    });
  }
  for (const [kind, speed, angle, frame, location] of [
    ['goblin', 3.7, 0, 36, 'uphill'],
    ['kobold', 2.9, 0.61, 46, 'uphill'],
    ['player', 7.4, 0, 22, 'downhill'],
    ['goblin', 3.7, 0.61, 36, 'downhill'],
  ] as const) {
    await crossCorpse(kind, speed, angle, frame, location);
    captures.push({
      title: `${kind}: ${location} contact, ${speed}/s, frame ${frame}`,
      image: (await page.screenshot()).toString('base64'),
    });
  }
  const sample = async (
    clip: Clip,
    frames: number,
    title: string,
    overCorpse = false,
    kind: ActorKind = 'player',
  ) => {
    const result = await page.evaluate(
      async ({ clip, frames, overCorpse, kind }) => {
        // Sample the production rig system in a stationary inspection fixture, independently
        // of the motor. Real-input traversal and attack damage run in the existing suites.
        const renderingPath = '/src/actorRendering.ts',
          locomotionPath = '/src/locomotion.ts',
          jumpPath = '/src/jump.ts';
        const { Jump } = (await import(jumpPath)) as typeof import('../src/jump.ts');
        const { animateActors, resetActorRig, ACTOR_OBSERVATION_RADIUS } = (await import(
          renderingPath
        )) as typeof import('../src/actorRendering.ts');
        const { createLocomotion, WALK_SPEED, RUN_SPEED } = (await import(
          locomotionPath
        )) as typeof import('../src/locomotion.ts');
        const d = window.__dungeon,
          g = d.game;
        const actor =
          clip === 'ranged'
            ? g.combat.enemies.find((a) => a.kind === 'goblin')!
            : clip === 'death'
              ? g.combat.enemies.find((a) => a.kind === 'skeleton')!
              : kind === 'player'
                ? g.player.actor
                : g.combat.enemies.find((a) => a.kind === kind)!;
        for (const other of g.combat.actors) {
          other.entity.remove('brain');
          other.entity.remove('corpse');
          other.entity.require('rig').root.setEnabled(other.id === actor.id);
        }
        const rig = actor.entity.require('rig');
        if (!rig.root.isEnabled()) throw new Error('Pose fixture actor must be visible');
        resetActorRig(rig);
        actor.attack.reset();
        actor.motion.animation = createLocomotion();
        actor.entity.add('jump', new Jump());
        actor.motion.velocity = { x: 0, z: 0 };
        actor.motion.acceleration = { x: 0, z: 0 };
        actor.motion.actualSpeed = 0;
        actor.motion.wantsMovement = false;
        Object.assign(actor.position, { x: 0, z: 0, h: 0, heading: Math.PI / 2 });
        actor.entity.get('collision')?.sync?.(actor.position);
        rig.root.rotation.y = actor.position.heading;
        if (overCorpse) {
          const dead = g.combat.enemies.find((a) => a.kind === 'skeleton' && a.id !== actor.id)!;
          dead.entity.add('corpse', { age: 1 });
          Object.assign(dead.position, { x: 0, z: -0.95, h: 0, heading: 0 });
          const fallen = dead.entity.require('rig');
          resetActorRig(fallen);
          fallen.root.rotation.y = 0;
          fallen.root.setEnabled(true);
        }
        if (clip === 'walk' || clip === 'run' || clip === 'stop' || clip === 'running-melee') {
          actor.motion.actualSpeed = clip === 'walk' ? WALK_SPEED : RUN_SPEED;
          actor.motion.velocity.x = actor.motion.actualSpeed;
          actor.motion.wantsMovement = true;
          for (let i = 0; i < 120; i++) animateActors(g.ecs, 1 / 60, 0, g.world);
          actor.motion.animation.stride = 0;
          for (const plant of rig.footPlants) plant.anchor = null;
        }
        if (clip === 'start') {
          actor.motion.actualSpeed = 2;
          actor.motion.wantsMovement = true;
        }
        if (clip === 'stop') {
          actor.motion.actualSpeed = 0;
          actor.motion.wantsMovement = false;
        }
        if (clip === 'melee' || clip === 'running-melee' || clip === 'ranged') {
          const ranged = clip === 'ranged' || kind === 'goblin';
          actor.attack.start(
            {
              target: 'pose-fixture',
              elapsed: 0,
              duration: ranged ? 0.85 : 0.62,
              impact: ranged ? 0.45 : 0.25,
              resolved: false,
              ranged,
            },
            1,
          );
        }
        if (clip === 'jump') actor.jump.request();
        for (let i = 0; i < frames; i++) {
          if (clip === 'jump') actor.jump.advance(1 / 60);
          if (clip === 'death') actor.entity.add('corpse', { age: (i + 1) / 60 });
          actor.attack.advance(1 / 60);
          animateActors(g.ecs, 1 / 60, 0, g.world);
        }
        g.player.marker.setEnabled(false);
        g.camera.alpha = -Math.PI / 2 + 0.28;
        g.camera.beta = 1.25;
        g.camera.radius = 6.5;
        g.camera.target.set(clip === 'death' ? 0.6 : 0, clip === 'jump' ? 1.25 : 0.9, 0);
        g.scene.render();
        for (const creature of g.dungeon.creatures) {
          const radius =
            creature.observationRadius *
            Math.max(
              Math.abs(creature.root.scaling.x),
              Math.abs(creature.root.scaling.y),
              Math.abs(creature.root.scaling.z),
            );
          if (!Number.isFinite(radius))
            throw new Error('Ambient creature needs an authored observation envelope');
          for (const mesh of creature.root.getChildMeshes())
            for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld)
              if (corner.subtract(creature.root.position).length() > radius)
                throw new Error(`Ambient observation envelope missed ${mesh.name}`);
        }
        const radius =
          ACTOR_OBSERVATION_RADIUS *
          Math.max(
            Math.abs(rig.root.scaling.x),
            Math.abs(rig.root.scaling.y),
            Math.abs(rig.root.scaling.z),
          );
        for (const mesh of rig.root.getChildMeshes()) {
          if (!mesh.isVisible || !mesh.isEnabled()) continue;
          for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld)
            if (corner.subtract(rig.root.position).length() > radius)
              throw new Error(`Authored observation envelope missed ${mesh.name} in ${clip}`);
        }
        const blade =
          clip === 'melee' || clip === 'running-melee'
            ? g.scene.getMeshByName('sword blade')
            : null;
        const stock =
          clip === 'ranged' ? g.scene.getMeshByName(`${actor.id}:crossbow stock`) : null;
        const V = g.camera.target.constructor as typeof Vector3;
        const muzzle = stock
          ? V.TransformNormal(new V(0, 0, 1), stock.getWorldMatrix()).normalize()
          : null;
        const scale = rig.root.scaling;
        const result = {
          scale: scale.asArray(),
          volume: scale.x * scale.y * scale.z,
          lean: rig.body.rotation.x,
          elbow: rig.forearms[1].rotation.x,
          arm: rig.arms[1].rotation.x,
          leg: rig.legs[0].rotation.x,
          lift: rig.root.position.y,
          x: rig.root.position.x,
          z: rig.root.position.z,
          cape: rig.cape?.rotation.x,
          swordReach: blade?.getBoundingInfo().boundingBox.maximumWorld.x,
          muzzle: muzzle?.asArray(),
          jumpHeight: actor.jump.height,
          knee: rig.knees[0].rotation.x,
          knees: rig.knees.map((k) => k.rotation.x),
          support: actor.position.h,
          elevation: actor.elevation,
          attackElapsed: actor.attack.swing?.elapsed ?? null,
          compression: actor.motion.animation.compression.value,
          soles: rig.feet.map(
            (foot) => foot.getAbsolutePosition().y - 0.05 * scale.y - actor.position.h,
          ),
        };
        return result;
      },
      { clip, frames, overCorpse, kind },
    );
    assert.ok(Math.abs(result.volume - 1) < 1e-10);
    assert.equal(result.x, 0);
    assert.equal(result.z, 0);
    assert.ok(result.scale.every((value) => value > 0 && Number.isFinite(value)));
    captures.push({ title, image: (await page.screenshot()).toString('base64') });
    if (clip === 'run' && kind === 'player') {
      // Capture the gait first, then verify immediate focus cleanup (without a render tick).
      assert.ok(
        await page.evaluate(() => {
          const actor = window.__dungeon.game.player.actor,
            rig = actor.entity.require('rig');
          window.dispatchEvent(new Event('blur'));
          return (
            rig.root.scaling.equalsToFloats(1, 1, 1) &&
            rig.forearms.every((arm) => arm.rotation.x === 0) &&
            rig.body.rotation.equalsToFloats(0, 0, 0) &&
            rig.footPlants.every((plant) => plant.anchor === null) &&
            rig.root.position.y === actor.position.h
          );
        }),
        'focus clears running/corpse contact deformation and anchors immediately',
      );
    }
    return result;
  };
  const load = await sample('start', 2, 'Start: anticipate / compress');
  const push = await sample('start', 6, 'Start: push off / extend');
  await sample('stop', 7, 'Stop: brace / compress');
  await sample('stop', 13, 'Stop: recoil / settle');
  assert.ok(load.lean < 0 && load.scale[1] < 1 && push.lean > 0.1 && push.scale[1] > 1);
  const walkContact = await sample('walk', 7, 'Walk: reach');
  await sample('walk', 14, 'Walk: passing');
  const runContact = await sample('run', 6, 'Run: extended stride / landing');
  const runFlight = await sample('run', 12, 'Run: passing / flight');
  assert.ok(runContact.lean > 0.25 && runContact.elbow < -0.8 && runContact.scale[1] < 0.94);
  assert.ok(
    Math.min(...runContact.soles) >= -0.02 && Math.min(...runContact.soles) < 0.06,
    'a rendered stance foot supports the running body',
  );
  assert.ok(runFlight.lift > 0.015 && runFlight.lift < 0.04);
  await sample('melee', 10, 'Sword: wind-up');
  const contact = await sample('melee', 15, 'Sword: contact');
  assert.ok(contact.swordReach! > 0.9, 'blade reaches forward into the target at damage time');
  await sample('melee', 19, 'Sword: follow-through');
  const recovered = await sample('melee', 45, 'Sword: recovered');
  assert.ok(Math.abs(recovered.arm) < 0.02);
  const movingWindup = await sample('running-melee', 10, 'Running sword: wind-up');
  const movingContact = await sample('running-melee', 15, 'Running sword: contact');
  const movingFollowThrough = await sample('running-melee', 19, 'Running sword: follow-through');
  const movingRecovery = await sample('running-melee', 28, 'Running sword: recovery');
  assert.ok(movingWindup.arm < -1.5 && movingContact.swordReach! > 0.9);
  const movingLegs = [movingWindup, movingContact, movingFollowThrough, movingRecovery].map(
    (pose) => pose.leg,
  );
  assert.ok(
    Math.max(...movingLegs) - Math.min(...movingLegs) > 0.4,
    'legs keep striding through the swing',
  );
  const corpseWalk = await sample('walk', 7, 'Corpse: walk / high contact', true);
  const corpseRun = await sample('run', 6, 'Corpse: run / bent knee contact', true);
  const corpseFlight = await sample('run', 12, 'Corpse: run / swing clearance', true);
  const corpseStrike = await sample('running-melee', 15, 'Corpse: running sword / contact', true);
  const corpseResults = [corpseWalk, corpseRun, corpseFlight, corpseStrike];
  assert.ok(Math.max(...corpseWalk.soles) > Math.max(...walkContact.soles) + 0.2);
  assert.ok(Math.max(...corpseRun.knees) > Math.max(...runContact.knees) + 0.4);
  assert.equal(corpseStrike.attackElapsed, movingContact.attackElapsed);
  assert.equal(corpseStrike.arm, movingContact.arm);
  for (const kind of ['goblin', 'kobold', 'skeleton'] as const) {
    const flat = await sample('running-melee', 15, `${kind}: moving attack / flat`, false, kind);
    const stepping = await sample(
      'running-melee',
      15,
      `${kind}: moving attack / corpse`,
      true,
      kind,
    );
    assert.ok(Math.max(...stepping.soles) > Math.max(...flat.soles) + 0.15, kind);
    assert.equal(stepping.arm, flat.arm);
    assert.equal(stepping.attackElapsed, flat.attackElapsed);
    corpseResults.push(stepping);
  }
  for (const pose of corpseResults) {
    assert.equal(pose.support, 0);
    assert.equal(pose.elevation, 0);
    assert.equal(pose.jumpHeight, 0);
    assert.ok(
      pose.soles.every((h) => h >= -0.02 && h <= 0.6),
      JSON.stringify(pose),
    );
    assert.ok(pose.lift >= 0 && pose.lift <= 0.18);
  }
  const aim = await sample('ranged', 26, 'Crossbow: aim');
  const recoil = await sample('ranged', 30, 'Crossbow: recoil');
  assert.ok(aim.arm < -1.4 && recoil.lean < 0);
  assert.ok(
    aim.muzzle![0] > 0.95 && Math.abs(aim.muzzle![1]) < 0.15,
    'crossbow points down the firing line',
  );
  await sample('death', 3, 'Death: buckle before falling');
  await sample('death', 24, 'Death: contact squash');
  const preload = await sample('jump', 1, 'Jump: two-frame preload');
  await sample('jump', 4, 'Jump: takeoff extension');
  await sample('jump', 12, 'Jump: rising / tuck');
  const apex = await sample('jump', 21, 'Jump: apex');
  await sample('jump', 32, 'Jump: reach for landing');
  await sample('jump', 41, 'Jump: floor contact');
  const landing = await sample('jump', 44, 'Jump: impact-driven compression');
  await sample('jump', 65, 'Jump: spring settle');
  assert.equal(preload.jumpHeight, 0);
  assert.ok(preload.scale[1] < 1 && apex.jumpHeight > 1 && apex.knee > 1);
  assert.ok(landing.compression < -0.06 && landing.scale[1] < 1);
  assert.ok(
    landing.soles.every((height) => Math.abs(height) < 0.04),
    'landing feet meet the floor while the knees absorb compression',
  );
  assert.deepEqual(errors, []);
  const sheet = await browser.newPage({ viewport: { width: 1200, height: 1100 } });
  await sheet.setContent(
    `<style>body{margin:0;background:#14191c;color:#e1d4ae;font:14px system-ui;display:grid;grid-template-columns:repeat(4,1fr)}figure{margin:0}img{width:100%;display:block}figcaption{padding:5px 10px}</style>${captures.map(({ title, image }) => `<figure><img src="data:image/png;base64,${image}"><figcaption>${title}</figcaption></figure>`).join('')}`,
  );
  await sheet.screenshot({ path: 'test-results/chromium-animation-poses.png', fullPage: true });
  await writeFile(
    'test-results/chromium-animation-report.json',
    JSON.stringify(
      {
        success: true,
        captures: captures.map(({ title }) => title),
        corpseResults,
        crossings,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS Rendered start/stop, gaits, weapon timing, death, jump/landing, foot contact, volume, and focus reset',
  );
} finally {
  await browser.close();
}
