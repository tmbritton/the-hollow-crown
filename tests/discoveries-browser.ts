import { chromium, firefox } from '@playwright/test';
import assert from 'node:assert/strict';
import { clickWorld } from './world-pointer.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { DebugWindow, TestReport } from './browserTypes.ts';

declare const window: DebugWindow & { discoveryTestLoops: (() => void)[] };
const browserName = process.env.BROWSER || 'chromium';
const browser = await (browserName === 'firefox' ? firefox : chromium).launch({
  headless: true,
  ...(browserName === 'chromium'
    ? { args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
const report: TestReport = { checks: [] };
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await mkdir('test-results', { recursive: true });
const pass = (name: string) => {
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
const snapshot = () =>
  page.evaluate(() => window.__dungeon.game.ecs.get('run')!.require('discoveries').snapshot());
const step = (frames = 1) => page.evaluate((frames) => window.__dungeon.step([], frames), frames);
async function regenerate(seed = 'MOURNING-731') {
  await page.evaluate((seed) => window.__dungeon.regenerate(seed), seed);
  await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
}
async function capture(name: string) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    window.__dungeon.engine.resize();
    window.__dungeon.game.scene.render();
  });
  await page.screenshot({ path: `test-results/${browserName}-discoveries-${name}.png` });
}
async function namedFixture() {
  return page.evaluate(() => {
    const d = window.__dungeon,
      g = d.game;
    for (const actor of g.combat.enemies) {
      actor.entity.remove('brain');
      actor.navigator.cancel();
      actor.attack.reset();
      Object.assign(actor.position, { x: 1000, z: 1000, h: 0 });
    }
    const named = g.combat.enemies.find(
      (a) => a.entity.get('inhabitant')?.id === 'inhabitant:standout',
    )!;
    d.teleport(0, 0);
    g.camera.alpha = g.desiredAlpha = -Math.PI / 2;
    g.camera.beta = 0.64;
    g.camera.radius = g.desiredRadius = 20;
    d.step([], 1);
    return { ...named.entity.require('inhabitant') };
  });
}
async function clickNamed(id: string) {
  const point = await page.evaluate((id) => {
    const d = window.__dungeon,
      g = d.game,
      actor = g.combat.actor(id)!;
    const V = g.camera.target.constructor as typeof Vector3;
    const M = g.camera.getWorldMatrix().constructor as typeof Matrix;
    g.scene.render();
    const p = V.Project(
      new V(actor.position.x, actor.position.h + 1, actor.position.z),
      M.Identity(),
      g.scene.getTransformMatrix(),
      g.camera.viewport.toGlobal(d.engine.getRenderWidth(), d.engine.getRenderHeight()),
    );
    return { x: p.x, y: p.y };
  }, id);
  await page.mouse.click(point.x, point.y);
  assert.equal(await page.evaluate(() => window.__dungeon.game.player.actor.attack.target), id);
  await step();
}
async function approach(type: 'chest' | 'altar' | 'throne') {
  return page.evaluate((type) => {
    const d = window.__dungeon;
    const e = d.game.world.entities.find((e) => e.type === type)!;
    if (!e.approach) throw new Error('Missing approach');
    d.teleport(e.approach.x, e.approach.z);
    d.step([], 1);
    return e.id;
  }, type);
}

async function pillarFixture() {
  await regenerate();
  const named = await namedFixture();
  const skeleton = await page.evaluate((id) => {
    const d = window.__dungeon,
      g = d.game;
    d.teleport(-4, 7);
    Object.assign(g.combat.actor(id)!.position, { x: 2.25, z: 5.25, h: 0 });
    const attacker = g.combat.enemies.find((a) => a.kind === 'skeleton')!;
    Object.assign(attacker.position, { x: 1.25, z: 5.25, h: 0 });
    g.camera.alpha = g.desiredAlpha = Math.PI / 4;
    g.camera.beta = 0.64;
    g.camera.radius = g.desiredRadius = 27;
    // Settle actual rendered cutaways and camera, not their generated collision proxies.
    for (let i = 0; i < 120; i++) d.step([], 1);
    g.scene.render();
    return attacker.id;
  }, named.actorId);
  return { named, skeleton };
}

/** Pixel oracle independent of the observation ray implementation; isolate the actor itself. */
async function changedActorPixels(id: string) {
  return page.evaluate(async (id) => {
    const d = window.__dungeon,
      g = d.game;
    const root = g.combat.actor(id)!.entity.require('render').root!;
    const shadows = g.scene.shadowsEnabled,
      glow = g.glow.isEnabled;
    g.scene.shadowsEnabled = false;
    g.glow.isEnabled = false;
    try {
      g.scene.render();
      const before = new Uint8Array(
        (await d.engine.readPixels(0, 0, d.engine.getRenderWidth(), d.engine.getRenderHeight()))
          .buffer,
      );
      root.setEnabled(false);
      g.scene.render();
      const after = new Uint8Array(
        (await d.engine.readPixels(0, 0, d.engine.getRenderWidth(), d.engine.getRenderHeight()))
          .buffer,
      );
      let changed = 0;
      for (let i = 0; i < before.length; i += 4)
        if (
          Math.abs(before[i] - after[i]) +
            Math.abs(before[i + 1] - after[i + 1]) +
            Math.abs(before[i + 2] - after[i + 2]) >
          3
        )
          changed++;
      return changed;
    } finally {
      root.setEnabled(true);
      g.scene.shadowsEnabled = shadows;
      g.glow.isEnabled = glow;
      g.scene.render();
    }
  }, id);
}

try {
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  await page.evaluate(() => {
    window.discoveryTestLoops = [...window.__dungeon.engine.activeRenderLoops];
    window.__dungeon.engine.stopRenderLoop();
  });
  assert.ok(
    await page.evaluate(() => window.__dungeon.game.ecs.get('run')?.has('discoveries')),
    'run-owned discovery component must exist',
  );
  const initial = await snapshot();
  assert.deepEqual(
    initial.discoveries.map((d) => d.id),
    ['landmark:entrance'],
  );
  assert.deepEqual(initial.factIds, ['fact:catastrophe']);
  assert.deepEqual(initial.events, []);
  pass('Initial presentation learns only the entrance caption, not world truth or inhabitants');

  const hidden = await pillarFixture();
  assert.equal(
    await changedActorPixels(hidden.named.actorId),
    0,
    'existing rendered pillar must completely hide the victim',
  );
  await capture('pillar-hidden-before');
  assert.ok(
    await page.evaluate(
      ({ victim, killer }) => {
        const g = window.__dungeon.game;
        g.combat.actor(victim)!.health.current = 9;
        return g.combat.startAttack(g.combat.actor(killer)!, g.combat.actor(victim)!);
      },
      { victim: hidden.named.actorId, killer: hidden.skeleton },
    ),
  );
  await step(14);
  assert.deepEqual((await snapshot()).events, [], 'no event before melee impact');
  await step(3);
  assert.equal(
    await page.evaluate(
      (id) => window.__dungeon.game.combat.actor(id)!.health.current,
      hidden.named.actorId,
    ),
    0,
  );
  await capture('pillar-hidden-after');
  assert.deepEqual(
    (await snapshot()).events,
    [],
    'camera-hidden melee victim is not a witnessed death or visible remains',
  );
  await page.evaluate(() => {
    window.__dungeon.game.desiredAlpha = -Math.PI / 2;
  });
  for (let i = 0; i < 120; i++) await step();
  assert.ok(
    (await changedActorPixels(hidden.named.actorId)) > 0,
    'rotating past the pillar must actually reveal the remains',
  );
  const revealed = await snapshot();
  assert.deepEqual(
    revealed.events.map((event) => event.kind),
    ['remains-found'],
  );
  assert.ok(!('killer' in revealed.events[0]));
  assert.ok(!JSON.stringify(revealed).includes(hidden.named.name));
  await capture('pillar-revealed-remains');
  await step(60);
  assert.deepEqual((await snapshot()).events, revealed.events);
  pass(
    'Rendered pillar hides an actual melee death; a later camera reveal grants only unidentified remains',
  );

  const captionHidden = await pillarFixture();
  await clickNamed(captionHidden.named.actorId);
  assert.ok(
    await page.locator('#combat-target').isHidden(),
    'selected but camera-occluded actors cannot present biography',
  );
  assert.ok(!(await snapshot()).discoveries.some((entry) => entry.kind === 'inhabitant'));
  await page.evaluate(() => {
    window.__dungeon.game.desiredAlpha = -Math.PI / 2;
  });
  for (let i = 0; i < 120; i++) await step();
  await clickNamed(captionHidden.named.actorId);
  assert.ok(await page.locator('#combat-target').isVisible());
  assert.equal(
    (await snapshot()).discoveries.filter((entry) => entry.kind === 'inhabitant').length,
    1,
  );
  pass(
    'Target captions use the rendered camera sightline and become discoverable after the occluder clears',
  );

  const shotFixture = await pillarFixture();
  const shooter = await page.evaluate(
    ({ victim, skeleton }) => {
      const d = window.__dungeon,
        g = d.game;
      Object.assign(g.combat.actor(skeleton)!.position, { x: 1000, z: 1000, h: 0 });
      Object.assign(g.combat.actor(victim)!.position, { x: 0.5, z: 5.25, h: 0 });
      const goblin = g.combat.enemies.find((a) => a.kind === 'goblin')!;
      Object.assign(goblin.position, { x: 2.55, z: 5.5, h: 0 });
      d.step([], 1);
      g.scene.render();
      return goblin.id;
    },
    { victim: shotFixture.named.actorId, skeleton: shotFixture.skeleton },
  );
  assert.equal(
    await changedActorPixels(shooter),
    0,
    'rendered pillar must hide the projectile source',
  );
  assert.ok(
    (await changedActorPixels(shotFixture.named.actorId)) > 0,
    'projectile victim must be rendered',
  );
  assert.ok(
    await page.evaluate(
      ({ victim, shooter }) => {
        const g = window.__dungeon.game;
        g.combat.actor(victim)!.health.current = 7;
        return g.combat.startAttack(g.combat.actor(shooter)!, g.combat.actor(victim)!, true);
      },
      { victim: shotFixture.named.actorId, shooter },
    ),
  );
  await step(26);
  assert.equal(await page.evaluate(() => window.__dungeon.game.ecs.query('projectile').length), 0);
  assert.deepEqual((await snapshot()).events, []);
  await step(2);
  assert.equal(await page.evaluate(() => window.__dungeon.game.ecs.query('projectile').length), 1);
  assert.equal(
    await page.evaluate(
      (id) => window.__dungeon.game.combat.actor(id)!.health.current,
      shotFixture.named.actorId,
    ),
    7,
  );
  assert.equal(await changedActorPixels(shooter), 0, 'the firing pose must also remain hidden');
  await capture('pillar-hidden-shooter');
  for (let i = 0; i < 20; i++) await step();
  assert.equal(
    await page.evaluate(
      (id) => window.__dungeon.game.combat.actor(id)!.health.current,
      shotFixture.named.actorId,
    ),
    0,
  );
  const shotEvents = (await snapshot()).events;
  assert.deepEqual(
    shotEvents.map((event) => event.kind),
    ['death-witnessed'],
  );
  assert.ok(
    !('killer' in shotEvents[0]),
    'actual projectile ownership must not identify a camera-hidden shooter',
  );
  pass(
    'An actual launched bolt travels before impact; visible victim death does not disclose its pillar-hidden shooter',
  );

  await regenerate();

  const portrait = await page.evaluate(() => {
    const d = window.__dungeon;
    const e = d.game.world.entities.find((e) => e.type === 'portrait' && e.room === 'entrance')!;
    if (e.type !== 'portrait') throw new Error('Missing portrait');
    d.teleport(e.approach.x, e.approach.z);
    d.step([], 1);
    return { title: e.royal.title, factIds: e.royal.factIds };
  });
  assert.deepEqual(
    (await snapshot()).discoveries,
    initial.discoveries,
    'proximity/prompt is not inspection',
  );
  await page.keyboard.press('KeyE');
  assert.ok(await page.locator('#inspection').isVisible());
  const inspected = await snapshot();
  assert.equal(inspected.discoveries.filter((d) => d.kind === 'portrait').length, 1);
  const portraitEntry = inspected.discoveries.find((d) => d.kind === 'portrait')!;
  assert.equal(portraitEntry.title, portrait.title);
  assert.deepEqual(portraitEntry.factIds, portrait.factIds);
  assert.ok(inspected.discoveries.some((d) => d.id === 'ember:old-rite'));
  assert.ok(!inspected.factIds.includes('fact:memorial'));
  await page.evaluate(() => {
    const g = window.__dungeon.game;
    g.inspection.update(1);
    g.scene.render();
  });
  await capture('inspection');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__dungeon.game.inspection.update(1));
  await page.keyboard.press('KeyE');
  assert.deepEqual(await snapshot(), inspected);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__dungeon.game.inspection.update(1));
  pass(
    'Real E inspection records the presented evidence once, including interrupted/repeated visits',
  );

  const named = await namedFixture();
  await page.evaluate((id) => {
    const d = window.__dungeon,
      g = d.game;
    g.combat.target(g.player.actor, g.combat.actor(id)!);
    d.step([], 1);
  }, named.actorId);
  assert.ok(!(await snapshot()).discoveries.some((d) => d.kind === 'inhabitant'));
  assert.ok(await page.locator('#combat-target').isHidden());
  await clickWorld(page, 1, -3);
  await page.evaluate((id) => {
    const d = window.__dungeon;
    Object.assign(d.game.combat.actor(id)!.position, { x: 4, z: 0, h: 0 });
    d.step([], 1);
  }, named.actorId);
  assert.ok(
    !(await snapshot()).discoveries.some((d) => d.kind === 'inhabitant'),
    'unselected actor has not presented biography',
  );
  await clickNamed(named.actorId);
  assert.ok((await page.locator('#combat-target').textContent())?.includes(named.description));
  const recognized = await snapshot();
  assert.equal(recognized.discoveries.filter((d) => d.kind === 'inhabitant').length, 1);
  assert.equal(recognized.discoveries.at(-1)!.id, named.id);
  await step(5);
  assert.deepEqual((await snapshot()).discoveries, recognized.discoveries);
  await capture('inhabitant');
  pass(
    'A visible real-click target caption teaches the named inhabitant once; distant selection leaks nothing',
  );

  await step(240);
  const killed = await snapshot();
  const death = killed.events.find((e) => e.kind === 'death-witnessed');
  assert.ok(death && death.kind === 'death-witnessed');
  assert.equal(death.subjectId, named.id);
  assert.equal(death.killer?.id, 'player');
  assert.ok(!killed.events.some((e) => e.kind === 'remains-found'));
  await step(120);
  assert.deepEqual((await snapshot()).events, killed.events);
  pass(
    'Ordinary pursuit impacts record a witnessed death and its actual observed killer exactly once',
  );

  await page.keyboard.press('Escape');
  await page.locator('#discovery-record summary').click();
  const journal = await page.locator('#discovery-entries').textContent();
  const menuBounds = await page.locator('#menu').boundingBox();
  assert.ok(
    menuBounds && menuBounds.width <= 600,
    'expanded record retains a compact readable measure',
  );
  assert.ok(journal?.includes(named.name) && journal.includes(portrait.title));
  assert.equal(
    await page.locator('#discovery-entries > li').count(),
    killed.discoveries.length + killed.events.length,
  );
  const time = await page.evaluate(() => window.__dungeon.game.playTime);
  const position = await page.evaluate(() => window.__dungeon.game.player.root.position.asArray());
  await page.evaluate(() => {
    for (const loop of window.discoveryTestLoops) window.__dungeon.engine.runRenderLoop(loop);
  });
  await clickWorld(page, position[0] + 2, position[2], position[1]);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__dungeon.game.playTime), time);
  assert.deepEqual(
    await page.evaluate(() => window.__dungeon.game.player.root.position.asArray()),
    position,
  );
  await page.evaluate(() => window.__dungeon.engine.stopRenderLoop());
  await capture('record');
  await page.locator('#discovery-entries > li').last().scrollIntoViewIfNeeded();
  assert.ok(
    (await page.locator('#discovery-entries > li').last().textContent())?.includes(
      'Killed by you.',
    ),
  );
  await capture('record-events');
  await page.setViewportSize({ width: 480, height: 750 });
  await capture('record-narrow');
  const bounds = await page.locator('#discovery-record').boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 480);
  assert.ok(
    await page.locator('#discovery-record').evaluate((e) => e.scrollWidth <= e.clientWidth),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press('Escape');
  pass(
    'Pause-menu record renders learned entries only, pauses controls, and fits a narrow viewport',
  );

  await page.evaluate(() => {
    const d = window.__dungeon,
      g = d.game;
    g.player.actor.health.invulnerable = 0;
    g.combat.damage(g.player.actor, 1000);
    d.step([], 1);
  });
  assert.deepEqual(await snapshot(), killed);
  assert.equal(await page.evaluate(() => window.__dungeon.game.player.health), 100);
  pass('Actual death and checkpoint respawn retain all discovery timestamps, facts and events');

  await regenerate();
  assert.deepEqual(
    (await snapshot()).discoveries.map((d) => d.id),
    ['landmark:entrance'],
  );
  assert.deepEqual((await snapshot()).events, []);
  assert.deepEqual((await snapshot()).factIds, initial.factIds);
  assert.deepEqual((await snapshot()).identity, initial.identity);
  assert.ok(
    await page
      .locator('#discovery-record')
      .evaluate((e) => e instanceof HTMLDetailsElement && !e.open),
  );
  pass(
    'Same-seed regeneration creates fresh knowledge and UI, with only the newly presented entrance',
  );

  const unseen = await namedFixture();
  await page.evaluate((id) => {
    const d = window.__dungeon,
      g = d.game;
    const victim = g.combat.actor(id)!;
    const killer = g.combat.enemies.find((a) => a.kind !== victim.kind)!;
    const tile = [...g.world.tiles.values()].find(
      (t) => t.surface === 'stone' && Math.hypot(t.x, t.z) > 15 && victim.navigator.canStand(t),
    )!;
    d.teleport(tile.x, tile.z);
    Object.assign(victim.position, { x: 3, z: 0, h: 0 });
    victim.entity.require('rigPose').reset(victim.position);
    g.combat.damage(victim, 1000, killer);
    for (let i = 0; i < 500 && !victim.entity.get('ragdoll')?.settled; i++) d.step([], 1);
  }, unseen.actorId);
  assert.deepEqual((await snapshot()).events, []);
  await page.evaluate((id) => {
    const d = window.__dungeon;
    // Find the physical resting place rather than moving only the old logical death coordinate.
    const p = d.game.combat.actor(id)!.position;
    d.teleport(p.x - 1, p.z);
    d.game.camera.target.set(p.x, p.h + 0.6, p.z);
    d.game.camera.radius = d.game.desiredRadius = 12;
    d.step([], 60);
  }, unseen.actorId);
  const aftermath = await snapshot();
  assert.equal(aftermath.events.length, 1);
  assert.equal(aftermath.events[0].kind, 'remains-found');
  assert.ok(!('killer' in aftermath.events[0]));
  assert.ok(!JSON.stringify(aftermath).includes(unseen.name));
  assert.ok(!aftermath.discoveries.some((d) => d.kind === 'inhabitant'));
  assert.ok((await page.locator('#toast').textContent())?.includes('remains'));
  await capture('aftermath');
  await step(60);
  assert.deepEqual((await snapshot()).events, aftermath.events);
  pass('Unseen AI death grants nothing; later visible remains reveal no name, biography or killer');

  await regenerate();
  const occluded = await namedFixture();
  await page.evaluate((id) => {
    const d = window.__dungeon,
      g = d.game;
    const victim = g.combat.actor(id)!;
    Object.assign(victim.position, { x: 4, z: 0, h: 0 });
    g.world.blockers.push({ id: 'observation-wall', x: 2, z: 0, w: 0.3, d: 3 });
    g.combat.target(g.player.actor, victim);
    d.step([], 1);
    g.combat.damage(victim, 1000);
    d.step([], 1);
  }, occluded.actorId);
  assert.ok(await page.locator('#combat-target').isHidden());
  assert.deepEqual((await snapshot()).events, []);
  assert.ok(!(await snapshot()).discoveries.some((d) => d.kind === 'inhabitant'));
  pass('Nearby but occluded targets and deaths cannot leak through selection or world state');

  await regenerate();
  const offscreen = await namedFixture();
  await page.evaluate((id) => {
    const d = window.__dungeon,
      g = d.game;
    const victim = g.combat.actor(id)!;
    Object.assign(victim.position, { x: 3, z: 0, h: 0 });
    g.camera.target.set(100, 0, 100);
    g.combat.target(g.player.actor, victim);
    d.step([], 1);
    g.combat.damage(victim, 1000);
    d.step([], 1);
  }, offscreen.actorId);
  assert.ok(await page.locator('#combat-target').isHidden());
  assert.deepEqual((await snapshot()).events, []);
  assert.ok(!(await snapshot()).discoveries.some((d) => d.kind === 'inhabitant'));
  pass('Nearby unobstructed actors outside the camera view do not reveal identities or deaths');

  await regenerate();
  const witnessed = await namedFixture();
  await page.evaluate((id) => {
    const d = window.__dungeon,
      g = d.game;
    const victim = g.combat.actor(id)!;
    Object.assign(victim.position, { x: 3, z: 0, h: 0 });
    d.step([], 1);
    const killer = g.combat.enemies.find((a) => a.kind !== victim.kind)!;
    g.combat.damage(victim, 1000, killer);
    d.step([], 1);
  }, witnessed.actorId);
  const partial = (await snapshot()).events;
  assert.equal(partial.length, 1);
  assert.equal(partial[0].kind, 'death-witnessed');
  assert.ok(!('killer' in partial[0]));
  assert.ok(!JSON.stringify(partial).includes(witnessed.name));
  pass(
    'A visible death with an unseen source records the death without attributing a killer or unknown identity',
  );

  await approach('throne');
  await page.keyboard.press('KeyE');
  assert.ok(!(await snapshot()).events.some((e) => e.kind === 'crown-claimed'));
  await approach('chest');
  await page.keyboard.press('KeyE');
  await page.keyboard.press('KeyE');
  await approach('altar');
  await page.keyboard.press('KeyE');
  await page.keyboard.press('KeyE');
  await approach('throne');
  await page.keyboard.press('KeyE');
  const progress = await snapshot();
  for (const kind of ['reliquary-claimed', 'altar-kindled', 'crown-claimed'])
    assert.equal(progress.events.filter((e) => e.kind === kind).length, 1, kind);
  assert.equal(progress.discoveries.filter((d) => d.id === 'landmark:throne').length, 1);
  pass(
    'Real interaction events record successful claims/kindling once; visiting a locked objective is not completion',
  );

  await page.locator('#continue').click();
  await page.evaluate(() => {
    const d = window.__dungeon,
      g = d.game;
    g.player.actor.health.invulnerable = 0;
    g.combat.damage(g.player.actor, 1000);
    d.step([], 2);
  });
  assert.deepEqual(await snapshot(), progress);
  assert.ok(
    await page.evaluate(() => {
      const g = window.__dungeon.game;
      return (
        g.active &&
        g.complete &&
        g.chests === 1 &&
        Math.hypot(
          g.player.actor.position.x - g.checkpoint.x,
          g.player.actor.position.z - g.checkpoint.z,
        ) < 1
      );
    }),
  );
  await page.evaluate(() => {
    window.__dungeon.game.player.health = 50;
  });
  await page.keyboard.press('KeyE');
  assert.equal(await page.evaluate(() => window.__dungeon.game.player.health), 100);
  assert.deepEqual(await snapshot(), progress);
  pass('Altar-checkpoint respawn retains claims; repeated rest still heals without another event');

  await regenerate('VIOLET-7');
  assert.equal((await snapshot()).identity.seed, 'VIOLET-7');
  assert.deepEqual((await snapshot()).events, []);
  assert.deepEqual(
    (await snapshot()).discoveries.map((d) => d.id),
    ['landmark:entrance'],
  );
  assert.deepEqual(errors, []);
  pass('Different-seed regeneration also resets the record without browser errors');
  report.success = true;
} catch (error) {
  report.success = false;
  report.error = error instanceof Error ? error.stack : String(error);
  report.errors = errors;
  await capture('failure').catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(
    `test-results/${browserName}-discoveries-report.json`,
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
