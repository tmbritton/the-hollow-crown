import { chromium, firefox } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { DebugWindow } from './browserTypes.ts';

declare const window: DebugWindow;
const name = process.env.BROWSER || 'chromium';
const browser = await (name === 'firefox' ? firefox : chromium).launch({
  headless: true,
  ...(name === 'chromium'
    ? { args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [],
  checks: string[] = [],
  screenshots: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
const pass = (label: string) => {
  checks.push(label);
  console.log(`PASS ${label}`);
};
const step = (frames = 1) => page.evaluate((frames) => window.__dungeon.step([], frames), frames);
const state = () =>
  page.evaluate(() => {
    const g = window.__dungeon.game,
      run = g.ecs.get('run')!;
    return {
      state: run.require('lastEmber').state,
      reward: run.require('lastEmber').reward,
      focus: run.require('lastEmber').focusEnabled,
      objectives: run.require('objectives').snapshot(),
      hero: g.player.actor.entity.get('work')?.snapshot(),
      worker: g.ecs.get('goblin:smithy:0')!.get('work')?.snapshot(),
      knowledge: run.require('discoveries').snapshot(),
      steps: g.steps,
    };
  });
const progress = async (id: string) =>
  (await state()).objectives.objectives.find((o) => o.id === `ember:${id}`)!.progress;
const workerAtFocus = () =>
  page.evaluate(() => {
    const g = window.__dungeon.game;
    const worker = g.combat.actor('goblin:smithy:0')!;
    const at = g.ecs.get('run')!.require('lastEmber').sites.focus.approach;
    return {
      alive: worker.alive,
      hp: worker.health.current,
      work: worker.entity.get('work')?.snapshot(),
      targetsHero: worker.attack.target === g.player.actor.id,
      heroTarget: g.player.actor.attack.target,
      distance: Math.hypot(worker.position.x - at.x, worker.position.z - at.z),
    };
  });
async function reset(seed = 'MOURNING-731', liveWorker = false) {
  await page.evaluate((seed) => window.__dungeon.regenerate(seed), seed);
  await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
  await page.evaluate(async (liveWorker) => {
    const path = '/src/actors.ts';
    const { stopActor }: typeof import('../src/actors.ts') = await import(path);
    const g = window.__dungeon.game;
    for (const a of g.combat.enemies) {
      stopActor(a);
      if (a.id === 'goblin:smithy:0') {
        if (!liveWorker) {
          a.entity.remove('brain');
          Object.assign(a.position, g.ecs.get('run')!.require('lastEmber').sites.focus.approach);
        }
      } else {
        a.entity.remove('brain');
        Object.assign(a.position, { x: 1000, z: 1000, h: 0 });
      }
    }
    g.player.actor.health.invulnerable = 10000;
    window.__dungeon.step([], 1);
    g.scene.render();
  }, liveWorker);
}
async function at(kind: 'shrine' | 'focus' | 'clue') {
  await page.evaluate((kind) => {
    const d = window.__dungeon,
      g = d.game;
    const site = g.ecs.get('run')!.require('lastEmber').sites[kind];
    const p = site.approach;
    d.teleport(p.x, p.z);
    g.camera.alpha = g.desiredAlpha = Math.atan2(p.z - site.z, p.x - site.x);
    g.camera.radius = g.desiredRadius = 23;
    d.step([], 1);
    g.scene.render();
  }, kind);
}
async function capture(label: string) {
  await page.evaluate(() => {
    window.__dungeon.engine.resize();
    window.__dungeon.step([], 1);
    window.__dungeon.game.scene.render();
  });
  const path = `test-results/${name}-last-ember-${label}.png`;
  await page.screenshot({ path });
  screenshots.push(path);
}
async function clickWorker() {
  const p = await page.evaluate(() => {
    const d = window.__dungeon,
      g = d.game,
      a = g.combat.actor('goblin:smithy:0')!;
    const V = g.camera.target.constructor as typeof Vector3,
      M = g.camera.getWorldMatrix().constructor as typeof Matrix;
    g.scene.render();
    const v = V.Project(
      new V(a.position.x, a.position.h + 0.8, a.position.z),
      M.Identity(),
      g.scene.getTransformMatrix(),
      g.camera.viewport.toGlobal(d.engine.getRenderWidth(), d.engine.getRenderHeight()),
    );
    const rect = document.querySelector('canvas')!.getBoundingClientRect();
    return {
      x: (v.x * rect.width) / d.engine.getRenderWidth(),
      y: (v.y * rect.height) / d.engine.getRenderHeight(),
    };
  });
  await page.mouse.click(p.x, p.y);
}

try {
  await mkdir('test-results', { recursive: true });
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  await page.evaluate(() => window.__dungeon.engine.stopRenderLoop());
  assert.ok(
    await page.evaluate(() => !!window.__dungeon.game.ecs.get('run')?.get('lastEmber')),
    'normal worlds install O3',
  );
  await reset('MOURNING-731', true);
  await at('shrine');
  assert.equal(await page.locator('#agenda').isVisible(), true);
  assert.match(
    await page.locator('[data-objective="ember:profane"]').innerText(),
    /Goblin ward-breaker/i,
  );
  assert.equal(
    (await state()).knowledge.discoveries.some((d) => d.kind === 'inhabitant'),
    false,
  );
  await step(2400);
  assert.ok((await progress('profane')) >= 1);
  assert.match(await page.locator('[data-objective="ember:profane"]').innerText(), /working/i);
  pass('regional activation announces unnamed clock; real goblin navigates and works offscreen');
  await page.evaluate(() => {
    const g = window.__dungeon.game,
      site = g.ecs.get('run')!.require('lastEmber').sites.focus;
    g.camera.target.set(site.approach.x, site.h + 0.8, site.approach.z);
    g.camera.alpha = Math.atan2(site.approach.z - site.z, site.approach.x - site.x);
    g.camera.radius = 18;
    g.scene.render();
  });
  const goblinCapture = `test-results/${name}-last-ember-goblin-work.png`;
  await page.screenshot({ path: goblinCapture });
  screenshots.push(goblinCapture);
  await at('shrine');
  await page.keyboard.press('e');
  await step(120);
  assert.equal((await state()).hero?.status, 'working');
  const pose = await page.evaluate(() =>
    window.__dungeon.game.player.actor.entity.require('rig').arms.map((a) => a.rotation.x),
  );
  assert.ok(pose.every((x) => x < -0.9));
  await capture('working');
  await page.keyboard.down('f');
  await page.keyboard.up('f');
  await step();
  assert.equal((await state()).hero, undefined);
  assert.equal(await progress('restore'), 0);
  pass('real E starts readable work; guard cancels incomplete credit');

  await page.keyboard.press('e');
  await step(361);
  const committed = await progress('restore');
  assert.equal(committed, 1);
  await page.keyboard.press('Escape');
  const paused = await state();
  await step(600);
  assert.equal((await state()).steps, paused.steps);
  assert.equal((await state()).hero, undefined);
  await page.keyboard.press('Escape');
  await at('clue');
  await page.keyboard.press('e');
  assert.equal(await page.locator('#inspection').isVisible(), true);
  assert.match(await page.locator('#inspection-description').innerText(), /Pair the breaths/);
  const inspected = await state();
  await step(600);
  assert.equal((await state()).steps, inspected.steps);
  assert.ok(inspected.knowledge.factIds.includes('ember:old-rite'));
  await capture('clue');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    for (let i = 0; i < 120 && window.__dungeon.game.inspection.active; i++)
      window.__dungeon.step([], 1);
  });
  await at('shrine');
  await page.keyboard.press('e');
  await step(361);
  assert.equal(await progress('restore'), committed + 2);
  pass('menu and actual clue inspection pause clocks; reading teaches two-seal method');

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal((await state()).hero, undefined);
  await page.keyboard.press('e');
  await step(30);
  await page.evaluate(() => window.__dungeon.teleport(0, 0));
  assert.equal((await state()).hero, undefined);
  await at('shrine');
  await page.keyboard.press('e');
  await step(30);
  await page.evaluate(() => {
    const g = window.__dungeon.game;
    g.player.actor.health.invulnerable = 0;
    g.combat.damage(g.player.actor, 1000);
    window.__dungeon.step([], 1);
  });
  assert.equal((await state()).hero, undefined);
  assert.equal(await progress('restore'), committed + 2);
  pass('blur, teleport and death cancel unfinished work; respawn preserves committed seals');

  await at('shrine');
  await page.keyboard.press('e');
  await step(721);
  assert.equal((await state()).state, 'restored');
  assert.equal((await state()).reward, 30);
  const rewards = (await state()).reward;
  await page.keyboard.press('e');
  await step(400);
  assert.equal((await state()).reward, rewards);
  await capture('restored');
  pass('restoration-first thwarts rival and rewards once');

  await reset('ember-3');
  await at('shrine');
  await step(7201);
  assert.equal((await state()).state, 'corrupted');
  assert.equal(
    (await state()).objectives.objectives.find((o) => o.id === 'ember:restore')!.status,
    'lost',
  );
  assert.equal(
    (await state()).knowledge.discoveries.some((d) => d.id === 'ember:seen:corrupted'),
    false,
  );
  await page.keyboard.press('e');
  assert.equal((await state()).hero, undefined);
  assert.ok((await state()).knowledge.discoveries.some((d) => d.id === 'ember:seen:corrupted'));
  await page.evaluate(() => {
    const g = window.__dungeon.game;
    g.combat.damage(g.combat.actor('goblin:smithy:0')!, 1000);
  });
  await step();
  assert.equal((await state()).state, 'corrupted');
  await at('focus');
  await page.keyboard.press('e');
  await step();
  assert.equal((await state()).focus, false);
  await at('shrine');
  await page.keyboard.press('e');
  await step(361);
  assert.equal((await state()).state, 'cleansed');
  assert.equal((await state()).reward, 10);
  await capture('cleansed');
  pass(
    'monster-first closes restoration; later kill preserves outcome; real E disables focus and cleanses once',
  );
  for (const type of ['altar', 'throne'] as const) {
    await page.evaluate((type) => {
      const d = window.__dungeon,
        g = d.game;
      const entity = g.world.entities.find((e) => e.type === type);
      if (!entity?.approach) throw new Error('Missing required landmark');
      d.teleport(entity.approach.x, entity.approach.z);
      d.step([], 1);
    }, type);
    await page.keyboard.press('e');
  }
  assert.equal(await page.evaluate(() => window.__dungeon.game.complete), true);
  assert.equal(
    (await state()).objectives.objectives.find((o) => o.id === 'ember:restore')!.status,
    'lost',
  );
  pass(
    'losing the optional restoration still permits real altar and throne interactions and Crown victory',
  );

  await reset('ember-7');
  await at('shrine');
  // Real fixed-step race: wait 84s, then the 36s hero rite ties the rival's 120s rite.
  await step(5040);
  await page.keyboard.press('e');
  await step(2159);
  assert.equal((await state()).state, 'active');
  await step();
  assert.equal((await state()).state, 'fractured');
  await capture('fractured');
  await at('focus');
  // Move the stationary fixture worker aside using its ordinary teleport cancellation path.
  await page.evaluate(async () => {
    const path = '/src/actors.ts';
    const { teleportActor }: typeof import('../src/actors.ts') = await import(path);
    const g = window.__dungeon.game,
      a = g.combat.actor('goblin:smithy:0')!;
    teleportActor(a, g.world, g.scenario!.world.roomById.smithy);
  });
  await at('focus');
  await page.keyboard.press('e');
  await step();
  await at('shrine');
  await page.keyboard.press('e');
  await step(361);
  assert.equal((await state()).state, 'repaired');
  assert.equal((await state()).reward, 15);
  await page.keyboard.press('e');
  await step(400);
  assert.equal((await state()).reward, 15);
  pass(
    'same-step physical completion fractures, then focus intervention unlocks one finite repair',
  );

  await reset('MOURNING-731', true);
  await at('shrine');
  await step(2400);
  const beforeArrival = await workerAtFocus();
  const credited = await progress('profane');
  assert.ok(beforeArrival.alive && beforeArrival.distance < 0.5);
  assert.equal(beforeArrival.work?.objectiveId, 'ember:profane');
  assert.equal(beforeArrival.work?.status, 'working');
  assert.ok(credited > 0);
  await at('focus');
  await step(60);
  const interrupted = await workerAtFocus();
  assert.ok(
    interrupted.alive && interrupted.targetsHero && interrupted.distance > 0.5,
    JSON.stringify(interrupted),
  );
  assert.equal(interrupted.heroTarget, null);
  assert.equal(interrupted.hp, beforeArrival.hp);
  assert.notEqual(interrupted.work?.status, 'working');
  assert.equal(await progress('profane'), credited);
  await capture('interrupted');
  await at('shrine');
  let resumed = await workerAtFocus();
  for (let frames = 0; frames < 3600; frames += 60) {
    await step(60);
    resumed = await workerAtFocus();
    if (resumed.work?.status === 'working' && (await progress('profane')) > credited) break;
  }
  assert.ok(
    resumed.alive && resumed.distance < 0.5 && !resumed.targetsHero,
    JSON.stringify(resumed),
  );
  assert.equal(resumed.hp, beforeArrival.hp);
  assert.equal(resumed.work?.objectiveId, 'ember:profane');
  assert.equal(resumed.work?.status, 'working');
  assert.ok((await progress('profane')) > credited);
  pass(
    'living worker defends and leaves focus on player approach; it returns and resumes after losing the threat',
  );

  await reset();
  await at('shrine');
  await step(1201);
  await at('focus');
  await page.keyboard.press('e');
  await step();
  assert.equal((await state()).focus, false);
  assert.ok(
    await page.evaluate(() => window.__dungeon.game.combat.actor('goblin:smithy:0')!.alive),
  );
  assert.equal(
    (await state()).objectives.objectives.find((o) => o.id === 'ember:profane')!.status,
    'thwarted',
  );
  await capture('disabled-focus');
  pass(
    'real focus intervention thwarts incomplete profanation without killing or replacing its worker',
  );

  await reset();
  await at('shrine');
  await page.keyboard.press('e');
  await step(361);
  await at('focus');
  await clickWorker();
  await step();
  assert.ok((await state()).knowledge.discoveries.some((d) => d.kind === 'inhabitant'));
  await page.setViewportSize({ width: 600, height: 900 });
  await capture('named-worker');
  const captionBounds = await page.locator('#combat-target').boundingBox();
  const agendaBounds = await page.locator('#agenda').boundingBox();
  assert.ok(
    captionBounds && agendaBounds && captionBounds.y + captionBounds.height < agendaBounds.y,
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await step(120);
  assert.equal(
    await page.evaluate(() => window.__dungeon.game.combat.actor('goblin:smithy:0')!.alive),
    false,
  );
  assert.equal(
    (await state()).objectives.objectives.find((o) => o.id === 'ember:profane')!.status,
    'thwarted',
  );
  assert.equal(await progress('restore'), 1);
  assert.ok((await state()).knowledge.discoveries.some((d) => d.kind === 'inhabitant'));
  pass(
    'real pointer pursuit kills the unique executor; its known name is learned only by the visible caption',
  );

  await reset('ember-7');
  await at('shrine');
  await page.keyboard.press('e');
  await step(100);
  const click = await page.evaluate(() => {
    const d = window.__dungeon,
      g = d.game,
      p = g.world.spawn;
    const V = g.camera.target.constructor as typeof Vector3;
    const M = g.camera.getWorldMatrix().constructor as typeof Matrix;
    g.scene.render();
    const v = V.Project(
      new V(p.x, p.h, p.z),
      M.Identity(),
      g.scene.getTransformMatrix(),
      g.camera.viewport.toGlobal(d.engine.getRenderWidth(), d.engine.getRenderHeight()),
    );
    const r = document.querySelector('canvas')!.getBoundingClientRect();
    return {
      x: (v.x * r.width) / d.engine.getRenderWidth(),
      y: (v.y * r.height) / d.engine.getRenderHeight(),
    };
  });
  await page.mouse.click(click.x, click.y);
  await step(240);
  assert.equal((await state()).hero, undefined);
  assert.ok(
    await page.evaluate(
      () =>
        Math.hypot(
          window.__dungeon.game.player.actor.position.x,
          window.__dungeon.game.player.actor.position.z,
        ) < 0.1,
    ),
  );
  pass('real floor click cancels work and physically walks to entrance center');
  await at('shrine');
  await page.keyboard.press('e');
  await step(120);
  for (const viewport of [
    { width: 600, height: 900 },
    { width: 400, height: 800 },
    { width: 900, height: 600 },
  ]) {
    await page.setViewportSize(viewport);
    await capture(`compact-${viewport.width}x${viewport.height}`);
    const bounds = await page.locator('#agenda').boundingBox();
    const rival = await page.locator('[data-objective="ember:profane"]').boundingBox();
    assert.ok(
      bounds &&
        rival &&
        bounds.x >= 0 &&
        bounds.x + bounds.width <= viewport.width &&
        bounds.y + bounds.height < viewport.height - 115 &&
        rival.y < bounds.y + bounds.height,
    );
    assert.match(await page.locator('#agenda').innerText(), /Profane the Last Ember/);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await reset();
  assert.equal((await state()).reward, 0);
  assert.equal((await state()).focus, true);
  assert.ok((await state()).objectives.objectives.every((o) => o.progress === 0));
  pass('compact narrow clocks stay visible; regeneration resets every scenario commitment');
  await reset('ember-70');
  await at('clue');
  await page.keyboard.press('e');
  assert.equal(await page.locator('#inspection').isVisible(), true);
  assert.ok((await state()).knowledge.factIds.includes('ember:old-rite'));
  pass('overlapping-approach seed regression: shrine cannot steal the clue E interaction');
  assert.deepEqual(errors, []);
} finally {
  await writeFile(
    `test-results/${name}-last-ember.json`,
    JSON.stringify({ checks, screenshots, errors }, null, 2),
  );
  await browser.close();
}
