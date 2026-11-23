import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { withViteServer } from './testServer.ts';
import { trialTraversal } from './cpu5-traversal-trial.ts';
import { rendererKind } from '../src/cpuMetrics.ts';
import type { DebugWindow } from './browserTypes.ts';
import type { Ray } from '@babylonjs/core/Culling/ray.js';
import type { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';

declare const window: DebugWindow;
const base = process.env.DEMO_URL ?? 'http://localhost:5173';
const reference = process.env.CPU5_REFERENCE === '1';
const trial = process.env.CPU5_TRIAL === '1';
const hardware = process.env.CPU_GPU === 'hardware';
const label = reference ? 'cpu4' : 'cpu5';
const artifact = (suffix: string) => `test-results/cpu5-r1-interactions-${suffix}`;
await withViteServer(base, 'dev', async () => {
  await mkdir('test-results', { recursive: true });
  const browser = await chromium.launch({
    headless: !hardware,
    args: hardware
      ? ['--no-sandbox', '--ignore-gpu-blocklist']
      : ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/?debug&seed=MOURNING-731`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
    await page.evaluate(() => {
      const d = window.__dungeon;
      d.engine.stopRenderLoop();
      d.regenerate('MOURNING-731');
    });
    await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
    if (trial) {
      const report = await page.evaluate(trialTraversal);
      if (hardware)
        assert.equal(rendererKind(report.renderer.renderer, report.renderer.vendor), 'hardware');
      await writeFile(artifact(`${label}-trial.json`), JSON.stringify(report, null, 2));
      assert.deepEqual(errors, []);
      return;
    }
    const result = await page.evaluate(async () => {
      const d = window.__dungeon,
        g = d.game;
      const path = '/src/observation.ts';
      const { CameraObservation } = (await import(path)) as typeof import('../src/observation.ts');
      const boxPath = '/src/geometry.ts';
      const { part } = (await import(boxPath)) as typeof import('../src/geometry.ts');
      const renderPath = '/src/actorRendering.ts';
      const { animateActors } = (await import(
        renderPath
      )) as typeof import('../src/actorRendering.ts');
      const setQuality = (value: string) => {
        const select = document.querySelector<HTMLSelectElement>('#quality')!;
        select.value = value;
        select.dispatchEvent(new Event('change'));
      };
      const run = g.ecs.get('run')!;
      const observed = g.combat.enemies.find((a) => a.entity.has('inhabitant'))!;
      const skeleton = g.combat.enemies.find((a) => a.kind === 'skeleton' && a.id !== observed.id)!;
      const persona = {
        ...observed.entity.require('inhabitant'),
        id: 'cpu5:unseen',
        actorId: skeleton.id,
      };
      skeleton.entity.add('inhabitant', persona);
      for (const a of g.combat.enemies) {
        a.entity.remove('brain');
        a.entity.remove('squadMember');
        a.navigator.cancel();
        a.attack.reset();
        a.entity.require('rig').root.setEnabled(a.id === observed.id || a.id === skeleton.id);
      }
      for (const group of g.ecs.query('koboldSquad')) group.remove('koboldSquad');
      const place = (a: typeof skeleton, x: number, z: number) => {
        Object.assign(a.position, { x, z, h: 0, heading: 0 });
        a.entity.require('collision').sync?.(a.position);
        a.entity.require('rigPose').reset(a.position);
      };
      place(observed, 0, 3);
      place(skeleton, 3, 3);
      d.teleport(0, 0);
      g.camera.alpha = g.desiredAlpha = -Math.PI / 2;
      g.camera.radius = g.desiredRadius = 12;
      for (let i = 0; i < 12; i++) d.step([], 1);
      g.scene.render();
      const V = g.camera.target.constructor as typeof Vector3;
      const M = g.camera.getWorldMatrix().constructor as typeof Matrix;
      const proxy = g.scene.getMeshByName(`${observed.id}:selection`)!;
      proxy.computeWorldMatrix(true);
      const point = V.Project(
        proxy.getBoundingInfo().boundingBox.centerWorld,
        M.Identity(),
        g.scene.getTransformMatrix(),
        g.camera.viewport.toGlobal(d.engine.getRenderWidth(), d.engine.getRenderHeight()),
      );
      const ray = g.scene.createPickingRay(point.x, point.y, M.Identity(), g.camera);
      const Ray = ray.constructor as typeof import('@babylonjs/core/Culling/ray.js').Ray;
      const hit = g.enemyRendering.pick(ray);
      if (hit?.actor.id !== observed.id)
        throw new Error(
          `Living pick mismatch: ${hit?.actor.id} toward ${proxy.getAbsolutePosition().asArray()}`,
        );
      g.combat.target(g.player.actor, hit.actor);
      const kill = (actor: typeof skeleton) =>
        g.combat.damage(actor, 1000, undefined, { kind: 'melee', travel: { x: 1, z: 0 } });
      const events = (id: string) =>
        run
          .require('discoveries')
          .snapshot()
          .events.filter((e) => 'subjectId' in e && e.subjectId === id);
      kill(observed);
      const witnessed = events(observed.entity.require('inhabitant').id);
      // Put the player beyond evidence range without moving the skeleton or its eventual chunks.
      Object.assign(g.player.actor.position, { x: 100, z: 100 });
      kill(skeleton);
      const unseen = events(persona.id);
      // Authored launch input only: the real solver still scatters, contacts, and settles the head.
      // Ordinary launches in this flat entrance settle too close to exercise off-root rejection.
      const handoff = skeleton.entity.require('deathHandoff');
      if (!handoff.pose) throw new Error('Missing captured skeleton pose');
      skeleton.entity.add('deathHandoff', {
        ...handoff,
        pose: {
          ...handoff.pose,
          bodies: handoff.pose.bodies.map((body) =>
            body.joint === 'head' ? { ...body, linear: [-12, 2, 0] } : body,
          ),
        },
      });
      d.teleport(0, 0);
      // Use only the physics/pose update until the negative visibility probes are complete.
      for (let i = 0; i < 60; i++) animateActors(g.ecs, 1 / 60, g.time, g.world);
      const binding = skeleton.entity.require('rigPose');
      const render = skeleton.entity.require('render');
      const ragdoll = skeleton.entity.require('ragdoll');
      const skull = binding.bodyMeshes.find((mesh) => mesh.name.endsWith(':skull'))!;
      for (const mesh of render.meshes) mesh.isVisible = mesh === skull;
      const slab = part(
        g.scene,
        g.materials.stone,
        'CPU5 authored occlusion control',
        [0.6, 0.6, 0.6],
        [0, 0, 0],
      );
      const checkBone = () => {
        skull.computeWorldMatrix(true);
        const center = skull.getBoundingInfo().boundingBox.centerWorld.clone();
        const rootDistance = Math.hypot(
          center.x - ragdoll.world[12],
          center.y - ragdoll.world[13],
          center.z - ragdoll.world[14],
        );
        g.camera.alpha = g.desiredAlpha = -Math.PI / 2;
        g.camera.beta = 1.22;
        g.camera.radius = 4;
        g.camera.target.copyFrom(center);
        g.camera.getViewMatrix(true);
        const eye = g.camera.globalPosition.clone();
        const offset = center.subtract(eye);
        const sight: Ray = new Ray(eye, offset.normalizeToNew(), offset.length());
        const surface = sight.intersectsMesh(skull);
        slab.setEnabled(false);
        const visible = g.observation.visible(render, [skull]);
        const tooFar = g.observation.visible(
          render,
          [skull],
          (p) => Math.hypot(p.x - (center.x + 9), p.z - center.z) <= 8,
        );
        slab.position.copyFrom(center.add(eye).scale(0.5));
        slab.setEnabled(true);
        slab.computeWorldMatrix(true);
        const occluded = g.observation.visible(render, [skull]);
        slab.setEnabled(false);
        // Reverse the same arrangement: the actual bone must obscure a smaller target behind it.
        const marker = part(
          g.scene,
          g.materials.stone,
          'CPU5 bone occludee',
          [0.025, 0.025, 0.025],
          center.add(offset.normalizeToNew().scale(0.32)).asArray() as [number, number, number],
        );
        const oracle = new CameraObservation(g.camera, [
          { root: render.root!, radius: 4.8, worldRadius: () => ragdoll.radius },
        ]);
        const subject = { root: marker, meshes: [marker] };
        const behindBone = oracle.visible(subject);
        skull.isVisible = false;
        const withoutBone = oracle.visible(subject);
        skull.isVisible = true;
        marker.dispose();
        return {
          settled: ragdoll.settled,
          surface: surface.hit,
          distance: surface.distance,
          visible,
          tooFar,
          occluded,
          behindBone,
          withoutBone,
          center: center.asArray(),
          rootDistance,
        };
      };
      const active = checkBone();
      for (let i = 0; i < 500; i++) animateActors(g.ecs, 1 / 60, g.time, g.world);
      const rest = checkBone();
      slab.dispose();
      const beforeDiscovery = events(persona.id);
      d.teleport(rest.center[0], rest.center[2] - 2);
      g.camera.alpha = g.desiredAlpha = -Math.PI / 2;
      g.camera.beta = 0.64;
      g.camera.radius = g.desiredRadius = 12;
      for (let i = 0; i < 24; i++) d.step([], 1);
      const later = events(persona.id);
      const stillWitnessed = events(observed.entity.require('inhabitant').id);
      const frames: ReturnType<typeof frame>[] = [];
      const frame = (name: string) => {
        g.scene.render();
        const activeMeshes = g.scene.getActiveMeshes();
        const rig = g.player.actor.entity.require('rig');
        return {
          name,
          step: g.steps,
          inspection: g.inspection.state,
          position: g.player.root.position.asArray(),
          camera: [g.camera.getViewMatrix(), g.camera.getProjectionMatrix()].map((m) =>
            Array.from(m.m),
          ),
          active: activeMeshes.data
            .slice(0, activeMeshes.length)
            .map((m) => `${g.scene.meshes.indexOf(m)}:${m.name}`),
          casters: g.shadowMap.renderList?.map((m) => `${g.scene.meshes.indexOf(m)}:${m.name}`),
          held: rig.equipment?.filter((m) => m.isEnabled()).map((m) => m.name),
          stowed: rig.stowedEquipment?.filter((m) => m.isEnabled()).map((m) => m.name),
          walls: g.ecs.query('cutaway').map((e) => e.require('cutaway').scale),
          image: d.engine.getRenderingCanvas()!.toDataURL().split(',')[1],
        };
      };
      const capture = (name: string) => frames.push(frame(name));
      setQuality('high');
      d.teleport(0, 8);
      g.camera.alpha = g.desiredAlpha = -Math.PI / 2;
      for (let i = 0; i < 24; i++) {
        d.step(['KeyW'], 1);
        if (i % 6 === 5) capture(`room-edge-${i + 1}`);
      }
      const portrait = g.world.entities.find((e) => e.type === 'portrait')!;
      d.teleport(portrait.approach.x, portrait.approach.z);
      g.inspection.open(portrait.inspection!);
      for (let i = 0; i < 36; i++) {
        d.step([], 1);
        if (i % 6 === 5) capture(`enter-${i + 1}`);
      }
      setQuality('low');
      capture('inspection-low');
      g.inspection.close();
      for (let i = 0; i < 36; i++) {
        d.step([], 1);
        if (i % 6 === 5) capture(`exit-${i + 1}`);
      }
      setQuality('high');
      // Drive the authored held/stowed binding output without starting a separate quest.
      const hero = g.player.actor.entity.require('rigPose');
      hero.actions.stowed = true;
      hero.apply();
      capture('stowed');
      hero.actions.stowed = false;
      hero.apply();
      capture('held');
      return {
        frames,
        active,
        rest,
        witnessed,
        stillWitnessed,
        unseen,
        beforeDiscovery,
        later,
        pick: { id: hit.actor.id, distance: hit.distance },
        renderer: d.engine.getGlInfo(),
      };
    });
    const frames = [];
    for (const { image, ...frame } of result.frames) {
      const png = Buffer.from(image, 'base64');
      await writeFile(artifact(`${label}-${frame.name}.png`), png);
      frames.push({ ...frame, pixels: createHash('sha256').update(png).digest('hex') });
    }
    const report = { ...result, frames, errors };
    const json = JSON.stringify(report, null, 2);
    await writeFile(artifact(`${label}.json`), json);
    assert.deepEqual(errors, []);
    assert.deepEqual(
      result.witnessed.map((e) => e.kind),
      ['death-witnessed'],
    );
    assert.deepEqual(result.stillWitnessed, result.witnessed);
    assert.deepEqual(result.unseen, []);
    assert.deepEqual(result.beforeDiscovery, []);
    assert.deepEqual(
      result.later.map((e) => e.kind),
      ['remains-found'],
    );
    assert.equal(result.active.settled, false);
    assert.equal(result.rest.settled, true);
    for (const probe of [result.active, result.rest]) {
      assert.ok(
        probe.rootDistance > 4.8,
        `bone must be outside the intact envelope: ${JSON.stringify(probe)}`,
      );
      assert.ok(probe.surface && probe.visible && probe.withoutBone, JSON.stringify(probe));
      assert.ok(!probe.tooFar && !probe.occluded && !probe.behindBone, JSON.stringify(probe));
    }
    assert.ok(frames.some((frame) => frame.inspection === 'viewing'));
    assert.ok(frames.at(-2)?.stowed?.length && frames.at(-1)?.held?.length);
    if (!reference)
      assert.equal(
        json,
        await readFile(artifact('cpu4.json'), 'utf8'),
        'CPU4 interaction, phase and pixel parity',
      );
    console.log(
      `PASS paired CPU5 interaction replay: ${frames.length} frames, picks and bone evidence`,
    );
  } finally {
    await browser.close();
  }
});
