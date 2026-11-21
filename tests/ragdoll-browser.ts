import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { DebugWindow } from './browserTypes.ts';
declare const window: DebugWindow;

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const deadline = setTimeout(() => void browser.close(), 360000);
try {
  await mkdir('test-results', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`, {
    waitUntil: 'commit',
  });
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  await page.evaluate(() => {
    window.__dungeon.animation.pause();
    window.__dungeon.engine.stopRenderLoop();
    window.__dungeon.regenerate('MOURNING-731');
  });
  await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
  const report = await page.evaluate(async () => {
    const fixturePath = '/tests/animation-review-fixture.ts',
      renderPath = '/src/actorRendering.ts',
      worldPath = '/src/world.ts',
      actorsPath = '/src/actors.ts',
      corpsePath = '/src/corpseRendering.ts';
    const { createReviewStage } = (await import(
      fixturePath
    )) as typeof import('./animation-review-fixture.ts');
    const { animateActors, resetActorRig } = (await import(
      renderPath
    )) as typeof import('../src/actorRendering.ts');
    const { tileAt, heightAt } = (await import(worldPath)) as typeof import('../src/world.ts');
    const { requestJump, moveActor } = (await import(
      actorsPath
    )) as typeof import('../src/actors.ts');
    const { readCorpseTerrain } = (await import(
      corpsePath
    )) as typeof import('../src/corpseRendering.ts');
    const d = window.__dungeon,
      g = d.game;
    d.animation.pause();
    d.engine.stopRenderLoop();
    const stage = createReviewStage(g);
    const rows = [],
      captures: { name: string; image: string }[] = [];
    for (const [profile, clip] of [
      ['goblin', 'travel'],
      ['skeleton', 'melee'],
      ['spearman', 'thrust'],
      ['spearman', 'throw'],
      ['shieldbearer', 'guard'],
      ['shieldbearer', 'carry'],
      ['goblin', 'focus'],
      ['goblin', 'jump'],
      ['shieldbearer', 'stairs-down'],
      ['goblin', 'wall'],
      ['goblin', 'turning'],
    ] as const) {
      const f = stage.fixture(
        profile,
        clip === 'jump' || clip === 'wall' || clip === 'turning' ? 'travel' : clip,
      );
      const a = g.combat.actor(f.id)!,
        b = a.entity.require('rigPose');
      f.advance(clip === 'thrust' ? 50 : 18);
      if (clip === 'wall') {
        const tile = [...g.world.tiles.values()].find(
          (t) =>
            t.room === 'entrance' &&
            !g.world.tiles.has(`${t.x + 1},${t.z}`) &&
            g.world.tiles.has(`${t.x - 1},${t.z}`),
        )!;
        Object.assign(a.position, { x: tile.x - 0.3, z: tile.z, h: tile.h });
        resetActorRig(a.entity.require('rig'), a.position);
        animateActors(g.ecs, 0, g.time, g.world);
      }
      if (clip === 'turning') {
        moveActor(a, g.world, { direction: { x: 0, z: 1 } }, 1 / 60);
        animateActors(g.ecs, 1 / 60, g.time, g.world);
      }
      if (clip === 'guard') {
        const blocked = g.combat.damage(a, 10, undefined, {
          kind: 'melee',
          travel: { x: -Math.sin(a.position.heading), z: -Math.cos(a.position.heading) },
        });
        if (blocked) throw new Error('recoil fixture did not block');
        animateActors(g.ecs, 1 / 60, g.time, g.world);
      }
      if (clip === 'jump') {
        requestJump(a);
        for (let i = 0; i < 12; i++) {
          moveActor(a, g.world, {}, 1 / 60);
          animateActors(g.ecs, 1 / 60, g.time, g.world);
        }
      }
      const start = { ...a.position };
      const direction = clip === 'stairs-down' ? { x: 0, z: 1 } : { x: 1, z: 0 };
      if (!g.combat.damage(a, 1000, undefined, { kind: 'melee', travel: direction }))
        throw new Error('kill rejected');
      const handoff = a.entity.require('deathHandoff');
      animateActors(g.ecs, 0, g.time, g.world);
      const r = a.entity.require('ragdoll');
      const entryError = Math.max(
        ...handoff.pose!.world.map((v, i) => Math.abs(v - b.pose.world[i])),
      );
      const saved = Array.from(r.world);
      for (let i = 0; i < 10; i++) animateActors(g.ecs, 0, g.time, g.world);
      const repeatError = Math.max(...saved.map((v, i) => Math.abs(v - r.world[i])));
      let minFloor = Infinity,
        lowestMesh = '',
        meshes = 0;
      const path: { frame: number; x: number; y: number; z: number }[] = [];
      const times: number[] = [];
      for (let frame = 0; frame <= 500; frame++) {
        const now = performance.now();
        if (frame) animateActors(g.ecs, 1 / 60, g.time + frame / 60, g.world);
        times.push(performance.now() - now);
        if ((frame <= 180 && frame % 6 === 0) || frame === 500) {
          path.push({ frame, x: r.world[12], y: r.world[13], z: r.world[14] });
          for (const camera of ['side', 'gameplay'] as const) {
            g.camera.alpha =
              clip === 'stairs-down' && camera === 'side'
                ? -Math.PI / 2
                : camera === 'side'
                  ? -0.28 - start.heading
                  : -Math.PI / 4;
            g.camera.beta = camera === 'side' ? 1.25 : 0.64;
            g.camera.radius = 9;
            g.camera.target.set(
              a.position.x,
              Math.max(a.position.h + 0.7, b.pose.world[b.pose.definition.index.chest * 16 + 13]),
              a.position.z,
            );
            // Same camera-facing structural cutaway presentation as active play.
            for (const e of g.ecs.query('cutaway')) {
              const wall = e.require('cutaway');
              const facing =
                wall.dx * Math.cos(g.camera.alpha) + wall.dz * Math.sin(g.camera.alpha);
              for (const mesh of wall.meshes) mesh.scaling.y = facing > 0.15 ? 0.05 : 1;
            }
            g.scene.render();
            captures.push({
              name: `${profile}-${clip}-${camera}-${frame}`,
              image: d.engine.getRenderingCanvas()!.toDataURL('image/png').split(',')[1],
            });
          }
        }
      }
      for (const mesh of a.entity.require('render').meshes) {
        if (!mesh.isEnabled() || !mesh.isVisible) continue;
        mesh.computeWorldMatrix(true);
        for (const point of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
          const tile = tileAt(g.world, point.x, point.z);
          if (tile) {
            const clearance = point.y - tile.h - (tile.surface === 'stair' ? 0.03 : 0);
            if (clearance < minFloor) {
              minFloor = clearance;
              lowestMesh = mesh.name;
            }
          }
        }
        meshes++;
      }
      const surfaces = readCorpseTerrain(g.ecs, g.world);
      const frozen = Array.from(r.world);
      for (let i = 0; i < 60; i++) animateActors(g.ecs, 1 / 60, g.time, g.world);
      const stable = frozen.every((v, i) => v === r.world[i]);
      rows.push({
        profile,
        clip,
        start,
        entryError,
        repeatError,
        minFloor,
        lowestMesh,
        meshes,
        settled: r.settled,
        remaining: r.bodyCount + r.constraintCount + r.staticCount,
        jointError: r.maxJointError,
        contacts: r.contacts,
        surfaces: surfaces.length,
        stable,
        path,
        mean: times.reduce((a, b) => a + b, 0) / times.length,
      });
      a.entity.remove('corpse');
      a.health.current = a.health.max;
      resetActorRig(a.entity.require('rig'), a.position);
      if (a.entity.has('ragdoll') || a.entity.has('deathHandoff'))
        throw new Error('reset retained ownership');
    }
    // Actual timed melee and released/flying crossbow and javelin paths.
    const real = [];
    for (const kind of ['MELEE', 'CROSSBOW', 'THROW_JAVELIN'] as const) {
      const f = stage.fixture('skeleton', 'travel'),
        target = g.combat.actor(f.id)!;
      f.advance(1);
      for (const a of g.combat.actors) {
        a.entity.remove('brain');
        a.entity.remove('squadMember');
      }
      for (const e of g.ecs.query('koboldSquad')) e.remove('koboldSquad');
      const source =
        kind === 'CROSSBOW'
          ? g.combat.enemies.find((a) => a.kind === 'goblin')!
          : kind === 'THROW_JAVELIN'
            ? g.combat.enemies.find((a) => a.entity.require('rig').spear)!
            : g.player.actor;
      Object.assign(target.position, { x: 0, z: 0, h: 0, heading: 0 });
      target.health.current = 1;
      Object.assign(source.position, {
        x: kind === 'MELEE' ? -1 : -3,
        z: kind === 'THROW_JAVELIN' ? 0.4 : 0,
        h: 0,
        heading: Math.PI / 2,
      });
      source.health.current = source.health.max;
      source.entity.require('rig').root.setEnabled(true);
      for (const a of [source, target]) resetActorRig(a.entity.require('rig'), a.position);
      animateActors(g.ecs, 0, g.time, g.world);
      const started = g.combat.startAttack(source, target, kind);
      for (let i = 0; i < 120 && target.alive; i++) {
        g.combat.update(1 / 60);
        animateActors(g.ecs, 1 / 60, g.time, g.world);
      }
      const h = target.entity.get('deathHandoff');
      real.push({
        kind,
        started,
        dead: !target.alive,
        handoff: h?.kind,
        ragdoll: target.entity.has('ragdoll'),
        travel: h?.travel,
      });
    }
    // All original enemies at once: bounded islands, no extra meshes/entities, no living-body motor.
    stage.fixture('skeleton', 'travel');
    const before = d.animation.resources();
    for (const [i, a] of g.combat.enemies.entries()) {
      a.health.current = a.health.max;
      Object.assign(a.position, { x: ((i % 6) - 3) * 1.1, z: (Math.floor(i / 6) - 2) * 1.1, h: 0 });
      a.position.h = heightAt(g.world, a.position.x, a.position.z) ?? 0;
      resetActorRig(a.entity.require('rig'), a.position);
      a.entity.require('rig').root.setEnabled(true);
    }
    animateActors(g.ecs, 0, g.time, g.world);
    for (const a of g.combat.enemies)
      g.combat.damage(a, 1000, undefined, { kind: 'melee', travel: { x: 1, z: 0 } });
    animateActors(g.ecs, 0, g.time, g.world);
    const all = g.ecs.query('ragdoll').map((e) => e.require('ragdoll'));
    const budget = {
      count: all.length,
      bodies: all.reduce((n, r) => n + r.bodyCount, 0),
      constraints: all.reduce((n, r) => n + r.constraintCount, 0),
      meshes: d.animation.resources().meshes - before.meshes,
    };
    const timings: number[] = [];
    for (let i = 0; i < 500; i++) {
      const t = performance.now();
      animateActors(g.ecs, 1 / 60, g.time, g.world);
      timings.push(performance.now() - t);
    }
    timings.sort((a, b) => a - b);
    const mass = {
      ...budget,
      mean: timings.reduce((a, b) => a + b, 0) / timings.length,
      p95: timings[Math.floor(timings.length * 0.95)],
      remaining: all.reduce((n, r) => n + r.bodyCount + r.constraintCount + r.staticCount, 0),
    };
    // Disposal of in-flight and settled bodies must retire their solver resources immediately.
    const owned = g.ecs.query('ragdoll').map((e) => e.require('ragdoll'));
    g.scene.dispose();
    const disposed = owned.every((r) => r.bodyCount + r.constraintCount + r.staticCount === 0);
    return { rows, real, mass, disposed, captures };
  });
  for (const c of report.captures)
    await writeFile(`test-results/p8-${c.name}.png`, Buffer.from(c.image, 'base64'));
  await writeFile(
    'test-results/p8-ragdoll-report.json',
    JSON.stringify({ ...report, captures: report.captures.map((c) => c.name), errors }, null, 2),
  );
  assert.deepEqual(errors, []);
  assert.ok(report.disposed);
  assert.equal(report.mass.count, 24);
  assert.equal(report.mass.bodies, 312);
  assert.equal(report.mass.constraints, 208); // Eight skeletons release their ten joints each.
  assert.equal(report.mass.meshes, 0);
  assert.equal(report.mass.remaining, 0);
  for (const r of report.rows) {
    assert.ok(r.entryError < 1e-8 && r.repeatError === 0, JSON.stringify(r));
    assert.ok(r.settled && r.remaining === 0 && r.stable && r.surfaces > 0, JSON.stringify(r));
    assert.ok(r.minFloor > -0.015 && r.jointError < 0.15, JSON.stringify(r));
    if (r.clip === 'wall')
      assert.ok(Math.max(...r.path.map((p) => p.x)) - r.start.x < 1, JSON.stringify(r));
  }
  for (const r of report.real) assert.ok(r.started && r.dead && r.ragdoll, JSON.stringify(r));
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  const lifecycle = await page.evaluate(async () => {
    const path = '/src/actors.ts';
    const { stopActor } = (await import(path)) as typeof import('../src/actors.ts');
    const d = window.__dungeon,
      g = d.game;
    d.animation.pause();
    d.engine.stopRenderLoop();
    for (const actor of g.combat.enemies) {
      stopActor(actor);
      actor.entity.remove('brain');
      actor.entity.remove('squadMember');
      actor.health.current = 0;
      Object.assign(actor.position, { x: 1000, z: 1000, h: 0 });
      actor.entity.require('rig').root.setEnabled(false);
    }
    for (const group of g.ecs.query('koboldSquad')) group.remove('koboldSquad');
    const a = g.combat.enemies.find((a) => a.kind === 'skeleton')!;
    Object.assign(a.position, { x: 1.5, z: 0, h: 0 });
    a.health.current = a.health.max;
    a.entity.require('rig').root.setEnabled(true);
    a.entity.require('rigPose').reset(a.position);
    g.combat.damage(a, 1000, undefined, { kind: 'melee', travel: { x: 1, z: 0 } });
    d.step([], 1);
    const r = a.entity.require('ragdoll');
    const pose = () => JSON.stringify(Array.from(r.world));
    const first = pose();
    const escape = () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape' }));
    };
    escape();
    d.step([], 6);
    const menu = first === pose();
    escape();
    const portrait = g.world.entities.find(
      (e) => e.type === 'portrait' && e.inspection,
    )!.inspection!;
    g.inspection.open(portrait);
    d.step([], 6);
    const inspection = first === pose();
    g.inspection.close({ immediate: true });
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    d.step([], 6);
    const hidden = first === pose();
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('blur'));
    d.step([], 6);
    const visibleBlurContinues = first !== pose();
    const start = g.time;
    g.player.health = 1;
    g.player.actor.health.invulnerable = 0;
    g.combat.damage(g.player.actor, 1000);
    d.step([], 1);
    const respawn =
      g.player.health === 100 &&
      !g.player.actor.entity.has('corpse') &&
      !g.player.actor.entity.has('ragdoll') &&
      g.time > start;
    const oldScene = g.scene,
      old = r;
    d.regenerate('MOURNING-731');
    return {
      menu,
      inspection,
      hidden,
      visibleBlurContinues,
      respawn,
      retired: old.bodyCount + old.constraintCount + old.staticCount === 0,
      disposed: oldScene.isDisposed,
    };
  });
  await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
  assert.ok(Object.values(lifecycle).every(Boolean), JSON.stringify(lifecycle));
  const resources = [];
  for (let i = 0; i < 3; i++) {
    resources.push(await page.evaluate(() => window.__dungeon.animation.resources()));
    if (i < 2) {
      await page.evaluate(() => window.__dungeon.regenerate('MOURNING-731'));
      await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
    }
  }
  assert.deepEqual(resources[1], resources[0]);
  assert.deepEqual(resources[2], resources[0]);
  await writeFile(
    'test-results/p8-ragdoll-lifecycle.json',
    JSON.stringify({ lifecycle, resources, errors }, null, 2),
  );
  assert.deepEqual(errors, []);
  console.log(
    `PASS P8: ${report.rows.length} articulated death sequences; real melee/bolt/javelin, settled contact, pause/reset/disposal`,
  );
} finally {
  clearTimeout(deadline);
  await browser.close();
}
