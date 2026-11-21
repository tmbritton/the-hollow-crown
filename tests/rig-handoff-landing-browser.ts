import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { DebugWindow } from './browserTypes.ts';
declare const window: DebugWindow;
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const deadline = setTimeout(() => void browser.close(), 180000);
try {
  await mkdir('test-results', { recursive: true });
  const page = await browser.newPage(),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const fresh = async () => {
    await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
    await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  };
  await fresh();
  const boundaries = await page.evaluate(async () => {
    const actorsPath = '/src/actors.ts',
      renderPath = '/src/actorRendering.ts',
      fixturePath = '/tests/animation-review-fixture.ts';
    const { moveActor, stopActor, requestJump } = (await import(
      actorsPath
    )) as typeof import('../src/actors.ts');
    const { animateActors, resetActorRig } = (await import(
      renderPath
    )) as typeof import('../src/actorRendering.ts');
    const { createReviewStage } = (await import(
      fixturePath
    )) as typeof import('./animation-review-fixture.ts');
    const d = window.__dungeon,
      g = d.game;
    d.animation.pause();
    d.engine.stopRenderLoop();
    const rows = [];
    for (const beforeRender of [true, false]) {
      for (const e of g.ecs.query('koboldSquad')) e.remove('koboldSquad');
      for (const a of g.combat.actors) {
        stopActor(a);
        a.attack.reset();
        a.entity.remove('brain');
        a.entity.remove('squadMember');
        a.entity.remove('corpse');
        a.health.current = 0;
        Object.assign(a.position, { x: 1000, z: 1000, h: 0 });
      }
      const source = g.player.actor,
        target = g.combat.enemies.find((a) => a.kind === 'skeleton')!;
      const tile = g.world.tiles.get('-1,0')!;
      g.world.tiles.set('-1,0', { ...tile, h: 0.2 });
      Object.assign(source.position, { x: -1, z: 0, h: 0.2, heading: Math.PI / 2 });
      source.health.current = 100;
      Object.assign(target.position, { x: 0, z: 0, h: 0, heading: 0 });
      target.health.current = 1;
      for (const a of [source, target]) resetActorRig(a.entity.require('rig'), a.position);
      requestJump(target);
      let started = false;
      for (let frame = 1; frame <= 50; frame++) {
        if (frame === 26) started = g.combat.startAttack(source, target);
        const support = target.position.h;
        moveActor(target, g.world, {}, 1 / 60);
        const grounded = !target.jump.airborne,
          expected = (target.position.h - support) * 60;
        if (!beforeRender) animateActors(g.ecs, 1 / 60, frame / 60, g.world);
        g.combat.update(1 / 60);
        if (!target.alive) {
          const h = target.entity.require('deathHandoff');
          rows.push({
            beforeRender,
            started,
            frame,
            grounded,
            expected,
            actual: h.velocity[1],
            root: h.pose!.linear[1],
          });
          break;
        }
        if (beforeRender) animateActors(g.ecs, 1 / 60, frame / 60, g.world);
      }
    }
    // Independent expected support derivative from actual motor positions, including both stair directions.
    const stage = createReviewStage(g),
      stairs = [];
    for (const clip of ['stairs', 'stairs-down'] as const) {
      const f = stage.fixture('player', clip),
        a = g.player.actor;
      let expected = 0;
      for (let frame = 0; frame < 120 && Math.abs(expected) < 0.01; frame++) {
        const previous = a.position.h;
        f.advance(1);
        expected = (a.position.h - previous) * 60;
      }
      g.combat.damage(a, 1000);
      stairs.push({ clip, expected, actual: a.entity.require('deathHandoff').velocity[1] });
    }
    return { rows, stairs };
  });
  await fresh();
  const lava = await page.evaluate(() => {
    const d = window.__dungeon,
      g = d.game;
    d.animation.pause();
    d.engine.stopRenderLoop();
    for (const a of g.combat.enemies) {
      a.entity.remove('brain');
      a.health.current = 0;
      Object.assign(a.position, { x: 1000, z: 1000, h: 0 });
    }
    const a = g.player.actor;
    d.teleport(0, 0);
    a.health.invulnerable = 0;
    const damage = g.combat.damage.bind(g.combat),
      events: { velocity: number; root: number; grounded: boolean }[] = [];
    g.combat.damage = (...args) => {
      const grounded = !args[0].jump.airborne;
      const result = damage(...args),
        h = args[0].entity.get('deathHandoff');
      if (h) events.push({ velocity: h.velocity[1], root: h.pose!.linear[1], grounded });
      return result;
    };
    d.step(['Space'], 3);
    const key = `${Math.round(a.position.x)},${Math.round(a.position.z)}`,
      tile = g.world.tiles.get(key)!;
    g.world.tiles.set(key, { ...tile, surface: 'lava' });
    a.health.current = 1;
    g.damageCooldown = 0;
    for (let i = 0; i < 60 && !events.length; i++) d.step([], 1);
    return { events, health: a.health.current, retired: !a.entity.has('deathHandoff') };
  });
  await writeFile(
    'test-results/rig-handoff-landing-report.json',
    JSON.stringify({ ...boundaries, lava, errors }, null, 2),
  );
  assert.deepEqual(errors, []);
  assert.equal(boundaries.rows.length, 2);
  for (const r of boundaries.rows) {
    assert.ok(r.started && r.grounded && r.frame === 41, JSON.stringify(r));
    assert.ok(
      Math.abs(r.actual - r.expected) < 1e-8 && Math.abs(r.root - r.expected) < 1e-8,
      JSON.stringify(r),
    );
  }
  for (const r of boundaries.stairs)
    assert.ok(
      Math.abs(r.expected) > 0.01 && Math.abs(r.actual - r.expected) < 1e-8,
      JSON.stringify(r),
    );
  assert.deepEqual(lava.events, [{ velocity: 0, root: 0, grounded: true }]);
  assert.equal(lava.health, 100);
  assert.equal(lava.retired, true);
  console.log(
    'PASS landing handoff: real melee before/after publication, full-tick lava/respawn and both stair directions',
  );
} finally {
  clearTimeout(deadline);
  await browser.close();
}
