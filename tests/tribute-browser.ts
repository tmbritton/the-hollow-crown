import { chromium, firefox } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import type { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import type { DebugWindow } from './browserTypes.ts';

declare const window: DebugWindow;
const name = process.env.BROWSER || 'chromium';
const browser = await (name === 'firefox' ? firefox : chromium).launch({
  headless: true,
  ...(name === 'chromium'
    ? { args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
    : {}),
});
const checks: string[] = [],
  screenshots: string[] = [],
  errors: string[] = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => errors.push(e.message));
const pass = (s: string) => {
  checks.push(s);
  console.log(`PASS ${s}`);
};
const step = (n = 1) => page.evaluate((n) => window.__dungeon.step([], n), n);
const state = () =>
  page.evaluate(() => {
    const g = window.__dungeon.game,
      run = g.ecs.get('run')!,
      t = run.require('tribute');
    return {
      clock: t.clock,
      ember: run.require('lastEmber').state,
      steps: g.steps,
      recovered: t.recovered,
      knowledge: run.require('discoveries').snapshot(),
      cargo: t.cargo.map((e) => ({
        id: e.id,
        state: e.require('cargo').state,
        owner: e.require('cargo').owner?.id,
        work: e.require('cargo').owner?.get('work')?.snapshot(),
        at: e.require('workSite').approach,
      })),
    };
  });
async function reset(live = true) {
  await page.evaluate(() => window.__dungeon.regenerate('MOURNING-731'));
  await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
  await page.evaluate(async (live) => {
    const path = '/src/actors.ts';
    const { stopActor }: typeof import('../src/actors.ts') = await import(path);
    const g = window.__dungeon.game,
      t = g.ecs.get('run')!.require('tribute');
    for (const a of g.combat.enemies) {
      if (live && t.sites.workers.includes(a.id)) continue;
      stopActor(a);
      a.entity.remove('brain');
      Object.assign(a.position, { x: 1000, z: 1000, h: 0 });
    }
    g.player.actor.health.invulnerable = 10000;
    window.__dungeon.step([], 1);
  }, live);
}
async function at(kind: 'shrine' | 'clue' | 'cache' | 'exit', index = 0) {
  await page.evaluate(
    ({ kind, index }) => {
      const d = window.__dungeon,
        g = d.game,
        run = g.ecs.get('run')!,
        t = run.require('tribute');
      const at =
        kind === 'cache'
          ? t.cargo[index].require('workSite').approach
          : kind === 'exit'
            ? t.sites.exit
            : run.require('lastEmber').sites[kind].approach;
      d.teleport(at.x, at.z);
      d.step([], 1);
      g.scene.render();
    },
    { kind, index },
  );
}
async function capture(label: string, focus?: 'carrier' | 'exit' | 'cache') {
  await page.evaluate((focus) => {
    const d = window.__dungeon,
      g = d.game,
      t = g.ecs.get('run')!.require('tribute');
    d.engine.resize();
    d.step([], 1);
    const p =
      focus === 'carrier'
        ? t.cargo.find((e) => e.require('cargo').state === 'carried')?.require('transform')
        : focus === 'exit'
          ? t.sites.exit
          : focus === 'cache'
            ? t.sites.cargo[0]
            : undefined;
    if (p) {
      g.camera.target.set(p.x, p.h + 0.7, p.z);
      g.camera.radius = 14;
    }
    g.scene.render();
  }, focus);
  const path = `test-results/${name}-tribute-${label}.png`;
  await page.screenshot({ path });
  screenshots.push(path);
}
async function until(predicate: (s: Awaited<ReturnType<typeof state>>) => boolean, limit = 24000) {
  for (let n = 0; n < limit; n += 120) {
    if (predicate(await state())) return;
    await step(120);
  }
  assert.ok(predicate(await state()), JSON.stringify(await state()));
}

try {
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  await page.evaluate(() => window.__dungeon.engine.stopRenderLoop());
  await reset();
  await at('shrine');
  let s = await state();
  assert.equal(s.clock.activated, true);
  assert.equal(s.clock.capacity, 4);
  assert.equal(s.ember, 'active');
  assert.equal(
    s.knowledge.discoveries.some((d) => d.kind === 'inhabitant'),
    false,
  );
  assert.match(
    await page.locator('[data-objective="tribute:carry-away"]').innerText(),
    /Kobold porters/i,
  );
  pass(
    'ordinary installation and shrine approach announce both independent threats without identity knowledge',
  );

  await until((s) => s.cargo.some((c) => c.state === 'claimed' && c.work?.status === 'working'));
  assert.equal((await state()).clock.progress, 0, 'packing alone must not fill the clock');
  await capture('packing', 'cache');

  await page.keyboard.press('e');
  await step(2161);
  s = await state();
  assert.equal(s.ember, 'restored');
  assert.equal(s.clock.status, 'unresolved');
  await until((s) => s.cargo.some((c) => c.state === 'carried'));
  await capture('carrier', 'carrier');
  const carried = await state();
  assert.ok(carried.cargo.some((c) => c.state === 'carried'));
  pass('real E restores shrine while tribute continues with a visible physically carried coffer');

  await page.keyboard.press('Escape');
  const paused = await state();
  await step(600);
  assert.deepEqual(await state(), paused);
  await page.keyboard.press('Escape');
  await at('clue');
  await page.keyboard.press('e');
  assert.equal(await page.locator('#inspection').isVisible(), true);
  const inspecting = await state();
  await step(600);
  assert.deepEqual(await state(), inspecting);
  await page.keyboard.press('Escape');
  await step(120);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal((await state()).cargo.filter((c) => c.state === 'carried').length, 1);
  pass('menu and actual inspection pause cargo/work; focus cleanup preserves committed ownership');

  await at('shrine');
  await until((s) => s.clock.status === 'completed');
  s = await state();
  assert.equal(s.clock.progress, 4);
  assert.ok(s.cargo.every((c) => c.state === 'delivered'));
  assert.equal(s.ember, 'restored');
  await capture('delivered-exit', 'exit');
  await page.evaluate(() => {
    const g = window.__dungeon.game,
      t = g.ecs.get('run')!.require('tribute');
    for (const id of t.sites.workers) g.combat.damage(g.combat.actor(id)!, 1000);
    g.player.actor.health.invulnerable = 0;
    g.combat.damage(g.player.actor, 1000);
    window.__dungeon.step([], 1);
  });
  assert.equal((await state()).clock.status, 'completed');
  assert.equal((await state()).clock.progress, 4);
  await at('exit');
  await page.keyboard.press('e');
  assert.equal((await state()).recovered, 0);
  pass(
    'offscreen real AI delivers all four; later worker deaths and hero respawn cannot restore delivered loot',
  );

  await reset();
  await at('shrine');
  await until((s) => s.cargo.some((c) => c.state === 'carried'));
  const victim = (await state()).cargo.find((c) => c.state === 'carried')!.owner!;
  await page.evaluate(async (id) => {
    const path = '/src/actors.ts';
    const { stopActor }: typeof import('../src/actors.ts') = await import(path);
    const d = window.__dungeon,
      g = d.game,
      a = g.combat.actor(id)!;
    stopActor(a);
    a.entity.remove('brain');
    const offsets = [
      { x: 1.25, z: 0 },
      { x: -1.25, z: 0 },
      { x: 0, z: 1.25 },
      { x: 0, z: -1.25 },
    ];
    const p = offsets
      .map((o) => ({ x: a.position.x + o.x, z: a.position.z + o.z }))
      .find((p) => g.player.actor.navigator.canOccupy(p))!;
    d.teleport(p.x, p.z);
    d.step([], 1);
    g.scene.render();
  }, victim);
  const pixel = await page.evaluate((id) => {
    const d = window.__dungeon,
      g = d.game,
      a = g.combat.actor(id)!;
    const V = g.camera.target.constructor as typeof Vector3,
      M = g.camera.getWorldMatrix().constructor as typeof Matrix;
    const p = V.Project(
      new V(a.position.x, a.position.h + 0.7, a.position.z),
      M.Identity(),
      g.scene.getTransformMatrix(),
      g.camera.viewport.toGlobal(d.engine.getRenderWidth(), d.engine.getRenderHeight()),
    );
    const rect = document.querySelector('canvas')!.getBoundingClientRect();
    return {
      x: (p.x * rect.width) / d.engine.getRenderWidth(),
      y: (p.y * rect.height) / d.engine.getRenderHeight(),
    };
  }, victim);
  await page.mouse.click(pixel.x, pixel.y);
  await step(150);
  assert.ok(await page.evaluate((id) => window.__dungeon.game.ecs.get(id)!.has('corpse'), victim));
  s = await state();
  assert.equal(s.clock.progress, 0);
  const dropped =
    s.cargo.find((c) => c.owner !== victim && c.state !== 'loose' && c.state !== 'delivered') ??
    s.cargo[0];
  const droppedIndex = s.cargo.findIndex((c) => c.id === dropped.id);
  await at('cache', droppedIndex);
  await capture('dropped');
  await page.keyboard.press('e');
  await step();
  assert.equal((await state()).recovered, 1);
  await page.keyboard.press('e');
  await step();
  assert.equal((await state()).recovered, 1);
  await at('shrine');
  await until((s) => s.clock.progress > 0);
  assert.equal((await state()).clock.status, 'unresolved');
  pass(
    'real pointer combat kills carrier, E recovers its undelivered cargo once, surviving pack physically takes over',
  );

  await until((s) => s.clock.status === 'thwarted');
  s = await state();
  assert.equal(s.clock.progress, 3);
  assert.equal(s.recovered, 1);
  assert.equal(s.ember, 'active');
  pass(
    'denied unique cargo thwarts after remaining deliveries; partial progress persists and unrelated shrine stays active',
  );

  await reset(false);
  await at('shrine');
  for (let i = 0; i < 4; i++) {
    await at('cache', i);
    await page.keyboard.press('e');
    await step();
  }
  assert.equal((await state()).clock.status, 'thwarted');
  assert.equal((await state()).recovered, 4);
  await capture('recovered-cache', 'cache');
  pass('all four optional crates can be recovered without changing the three core reliquaries');

  await reset();
  await at('shrine');
  for (const [width, height] of [
    [1440, 900],
    [600, 900],
    [400, 800],
    [900, 600],
  ]) {
    await page.setViewportSize({ width, height });
    await step();
    const layout = await page.evaluate(() => {
      const el = document.getElementById('agenda')!,
        r = el.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: innerWidth,
        height: innerHeight,
        scroll: el.scrollHeight,
        client: el.clientHeight,
      };
    });
    assert.ok(
      layout.left >= 0 && layout.right <= width && layout.top >= 0 && layout.bottom <= height,
    );
    for (const id of ['tribute:carry-away', 'ember:profane', 'ember:restore']) {
      await page.locator(`[data-objective="${id}"]`).scrollIntoViewIfNeeded();
      assert.equal(await page.locator(`[data-objective="${id}"]`).isVisible(), true);
    }
    await capture(`hud-${width}x${height}`);
  }
  pass('both threats and selected goal remain reachable in scrolling desktop/narrow/short HUD');
  await page.setViewportSize({ width: 1440, height: 900 });
  const resources = [];
  for (let i = 0; i < 3; i++) {
    await reset();
    assert.equal((await state()).clock.progress, 0);
    assert.equal((await state()).recovered, 0);
    resources.push(
      await page.evaluate(() => {
        const s = window.__dungeon.snapshot();
        return {
          meshes: s.meshes,
          materials: s.materials,
          textures: s.textures,
          effects: s.effects,
          shaderSources: s.shaderSources,
        };
      }),
    );
  }
  assert.deepEqual(resources[1], resources[0]);
  assert.deepEqual(resources[2], resources[0]);
  assert.deepEqual(errors, []);
  pass(
    'same-seed regeneration resets cargo/claims/clocks with stable scene resources and no browser errors',
  );
  await writeFile(
    `test-results/${name}-tribute.json`,
    JSON.stringify({ checks, screenshots, errors, resources }, null, 2),
  );
} catch (error) {
  await page.screenshot({ path: `test-results/${name}-tribute-failure.png` });
  throw error;
} finally {
  await browser.close();
}
