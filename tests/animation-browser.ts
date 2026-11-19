import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { DebugWindow } from './browserTypes.ts';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';

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
const page = await browser.newPage({ viewport: { width: 600, height: 500 } });
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
const captures: { title: string; image: string }[] = [];
await mkdir('test-results', { recursive: true });

try {
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  await page.evaluate(() => window.__dungeon.engine.stopRenderLoop());
  await page.addStyleTag({
    content:
      'body > :not(#game) { display: none !important; } body::after { display: none !important; }',
  });
  const sample = async (clip: Clip, frames: number, title: string) => {
    const result = await page.evaluate(
      async ({ clip, frames }) => {
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
              : g.player.actor;
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
        if (clip === 'walk' || clip === 'run' || clip === 'stop' || clip === 'running-melee') {
          actor.motion.actualSpeed = clip === 'walk' ? WALK_SPEED : RUN_SPEED;
          actor.motion.wantsMovement = true;
          for (let i = 0; i < 120; i++) animateActors(g.ecs, 1 / 60, 0, g.world);
          actor.motion.animation.stride = 0;
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
          actor.attack.start(
            {
              target: 'pose-fixture',
              elapsed: 0,
              duration: clip === 'ranged' ? 0.85 : 0.62,
              impact: clip === 'ranged' ? 0.45 : 0.25,
              resolved: false,
              ranged: clip === 'ranged',
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
          compression: actor.motion.animation.compression.value,
          soles: rig.feet.map(
            (foot) => foot.getAbsolutePosition().y - 0.05 * scale.y - actor.position.h,
          ),
        };
        if (clip === 'run') {
          // Focus loss must clear every added presentation channel immediately.
          window.dispatchEvent(new Event('blur'));
          const clean =
            rig.root.scaling.equalsToFloats(1, 1, 1) &&
            rig.forearms.every((arm) => arm.rotation.x === 0) &&
            rig.body.rotation.equalsToFloats(0, 0, 0) &&
            rig.root.position.y === actor.position.h;
          if (!clean) throw new Error('Modal/focus reset retained a deformed running pose');
        }
        return result;
      },
      { clip, frames },
    );
    assert.ok(Math.abs(result.volume - 1) < 1e-10);
    assert.equal(result.x, 0);
    assert.equal(result.z, 0);
    assert.ok(result.scale.every((value) => value > 0 && Number.isFinite(value)));
    captures.push({ title, image: (await page.screenshot()).toString('base64') });
    return result;
  };
  const load = await sample('start', 2, 'Start: anticipate / compress');
  const push = await sample('start', 6, 'Start: push off / extend');
  await sample('stop', 7, 'Stop: brace / compress');
  await sample('stop', 13, 'Stop: recoil / settle');
  assert.ok(load.lean < 0 && load.scale[1] < 1 && push.lean > 0.1 && push.scale[1] > 1);
  await sample('walk', 7, 'Walk: reach');
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
      { success: true, captures: captures.map(({ title }) => title), errors },
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
