import { chromium, firefox } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { DebugWindow, TestReport } from './browserTypes.ts';
import type { EnemyKind } from '../src/ecs.ts';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';

declare const window: DebugWindow;
const browserName = process.env.BROWSER || 'chromium';
const browser = await (browserName === 'firefox' ? firefox : chromium).launch({
  headless: true,
  ...(browserName === 'chromium'
    ? { args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
    : {}),
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1.5,
});
const errors: string[] = [],
  report: TestReport = { checks: [] };
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await mkdir('test-results', { recursive: true });
const pass = (name: string) => {
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
const step = (frames: number) =>
  page.evaluate((frames) => window.__dungeon.step([], frames), frames);
async function fixture(kind: EnemyKind, x = 4, z = 0) {
  return page.evaluate(
    ({ kind, x, z }) => {
      const d = window.__dungeon,
        g = d.game;
      // Isolate each interaction while retaining real ECS, movement, combat and render systems.
      for (const a of g.combat.enemies) {
        a.entity.remove('brain');
        a.entity.remove('corpse');
        a.navigator.cancel();
        a.attack.reset();
        a.health.current = a.health.max;
        Object.assign(a.position, { x: 1000, z: 1000, h: 0 });
        a.motion.speed = 0;
      }
      for (const e of [...g.ecs.query('particle'), ...g.ecs.query('projectile')])
        g.ecs.remove(e.id);
      const target = g.combat.enemies.find((a) => a.kind === kind);
      if (!target) throw new Error('Missing enemy fixture');
      Object.assign(target.position, { x, z, h: 0 });
      d.teleport(0, 0);
      g.player.health = 100;
      g.player.actor.health.invulnerable = 0;
      g.player.actor.attack.cooldown = 0;
      g.camera.alpha = g.desiredAlpha = -Math.PI / 2;
      g.camera.beta = 0.64;
      g.camera.radius = g.desiredRadius = 20;
      d.step([], 1);
      g.scene.render();
      return target.id;
    },
    { kind, x, z },
  );
}
async function screen(x: number, z: number, h = 0) {
  return page.evaluate(
    ({ x, z, h }) => {
      const d = window.__dungeon,
        g = d.game;
      const V = g.camera.target.constructor as typeof Vector3,
        M = g.camera.getWorldMatrix().constructor as typeof Matrix;
      g.scene.render();
      const p = V.Project(
        new V(x, h, z),
        M.Identity(),
        g.scene.getTransformMatrix(),
        g.camera.viewport.toGlobal(d.engine.getRenderWidth(), d.engine.getRenderHeight()),
      );
      const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + (p.x * rect.width) / d.engine.getRenderWidth(),
        y: rect.top + (p.y * rect.height) / d.engine.getRenderHeight(),
      };
    },
    { x, z, h },
  );
}
async function clickEnemy(id: string, hold = false) {
  const p = await page.evaluate((id) => window.__dungeon.game.combat.actor(id)!.position, id);
  const point = await screen(p.x, p.z, p.h + 1);
  await page.mouse.move(point.x, point.y);
  if (hold) await page.mouse.down();
  else await page.mouse.click(point.x, point.y);
  assert.equal(await page.evaluate(() => window.__dungeon.game.player.actor.attack.target), id);
}
async function capture(name: string) {
  await page.evaluate(async () => {
    // Viewport changes can clear WebGL after a manual render while the game loop is paused.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    window.__dungeon.engine.resize();
    window.__dungeon.game.scene.render();
  });
  await page.screenshot({ path: `test-results/${browserName}-combat-${name}.png` });
}

try {
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  await page.evaluate(() => window.__dungeon.engine.stopRenderLoop());
  const counts = await page.evaluate(() => {
    const g = window.__dungeon.game;
    return {
      actors: g.ecs.query('actor').length,
      tiles: g.ecs.query('tile').length,
      expectedTiles: g.world.tiles.size,
      doors: g.ecs.query('door').length,
      rigs: g.ecs.query('rig').length,
      health: g.player.actor.entity.require('health').current,
    };
  });
  assert.equal(counts.actors, 22);
  assert.equal(counts.rigs, 22);
  assert.equal(counts.tiles, counts.expectedTiles);
  assert.ok(counts.doors > 0);
  assert.equal(counts.health, 100);
  pass('Player, enemies, tiles, doors and render rigs use the live ECS registry');

  for (const seed of ['VIOLET-7', 'inhabitant-0', 'MOURNING-731']) {
    await page.evaluate((seed) => window.__dungeon.regenerate(seed), seed);
    await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
    const named = await page.evaluate(() => {
      const g = window.__dungeon.game;
      const actors = g.combat.enemies.filter((a) => a.entity.has('inhabitant'));
      if (actors.length !== 1) throw new Error('Expected one named inhabitant');
      const actor = actors[0];
      return {
        ...actor.entity.require('inhabitant'),
        markers: actor.entity
          .require('render')
          .meshes.filter((m) => m.name.includes(':inhabitant:'))
          .map((m) => ({ name: m.name, enabled: m.isEnabled() })),
      };
    });
    assert.ok(named.markers.length >= 2 && named.markers.length <= 5);
    assert.ok(named.markers.every((m) => m.enabled));
    await fixture(named.kind);
    await page.evaluate((id) => {
      const d = window.__dungeon,
        g = d.game;
      for (const actor of g.combat.enemies)
        Object.assign(actor.position, { x: 1000, z: 1000, h: 0 });
      const actor = g.combat.actor(id)!;
      Object.assign(actor.position, { x: 4, z: 0, h: 0, heading: Math.PI });
      actor.entity.require('rig').socialBlend = 0;
      d.step([], 1);
    }, named.actorId);
    await clickEnemy(named.actorId);
    await step(1);
    const caption = await page.locator('#combat-target').textContent();
    assert.ok(caption?.includes(`${named.name}, ${named.title}`));
    assert.ok(caption?.includes(named.description));
    assert.ok(caption?.includes(named.kind.toUpperCase()));
    await capture(`named-${named.kind}`);
    for (const width of [600, 900]) {
      await page.setViewportSize({ width, height: 800 });
      const captionBounds = await page.locator('#combat-target').boundingBox();
      assert.ok(
        captionBounds && captionBounds.x >= 0 && captionBounds.x + captionBounds.width <= width,
      );
      for (const selector of ['.map-panel', '.quest-panel']) {
        if (!(await page.locator(selector).isVisible())) continue;
        const panel = await page.locator(selector).boundingBox();
        assert.ok(panel);
        const overlaps =
          captionBounds.x < panel.x + panel.width &&
          captionBounds.x + captionBounds.width > panel.x &&
          captionBounds.y < panel.y + panel.height &&
          captionBounds.y + captionBounds.height > panel.y;
        assert.ok(!overlaps, `${width}px caption overlaps ${selector}`);
      }
      await capture(`named-${named.kind}-${width}`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate((id) => {
      const g = window.__dungeon.game;
      const actor = g.combat.actor(id)!;
      g.camera.target.set(actor.position.x, actor.position.h + 1, actor.position.z);
      g.camera.radius = 7;
      g.camera.beta = 1.2;
      actor.entity.require('rig').root.rotation.y = Math.PI;
    }, named.actorId);
    await capture(`named-${named.kind}-detail`);
    await page.keyboard.press('KeyX');
    await step(1);
    assert.ok(await page.locator('#combat-target').isHidden());
  }
  pass('Named inhabitant has a bounded visible motif and factual responsive target caption');

  const blockingGoblin = await fixture('goblin', 1.3);
  await page.keyboard.down('KeyD');
  const blocked = await page.evaluate((id) => {
    const d = window.__dungeon,
      g = d.game,
      target = g.combat.actor(id)!;
    let minDistance = Infinity;
    for (let i = 0; i < 120; i++) {
      d.step(['KeyD', 'ShiftLeft'], 1);
      minDistance = Math.min(
        minDistance,
        Math.hypot(
          g.player.actor.position.x - target.position.x,
          g.player.actor.position.z - target.position.z,
        ),
      );
    }
    return {
      minDistance,
      x: g.player.actor.position.x,
      targetX: target.position.x,
      proxyX: g.player.proxy.position.x,
      speed: g.player.motion.actualSpeed,
    };
  }, blockingGoblin);
  await page.keyboard.up('KeyD');
  assert.ok(blocked.minDistance >= 0.9 - 1e-6, JSON.stringify(blocked));
  assert.ok(blocked.x > 0.35 && blocked.x < 0.41, JSON.stringify(blocked));
  assert.equal(blocked.targetX, 1.3);
  assert.equal(blocked.speed, 0);
  assert.ok(Math.abs(blocked.proxyX - blocked.x) < 1e-7);
  pass(
    'Running into a hostile stops at its body without pushing it or desynchronizing the collision proxy',
  );

  const corpseMovement = await page.evaluate((id) => {
    const d = window.__dungeon,
      g = d.game,
      target = g.combat.actor(id)!;
    target.position.heading = -Math.PI / 2;
    g.combat.damage(target, 100, g.player.actor);
    const start = g.player.actor.position.x;
    d.step(['KeyD'], 24);
    const slow = g.player.motion.speed;
    const travelled = g.player.actor.position.x - start;
    d.step(['KeyD'], 60);
    return { slow, travelled, x: g.player.actor.position.x, corpseX: target.position.x };
  }, blockingGoblin);
  assert.ok(Math.abs(corpseMovement.slow - 4.8 * 0.52) < 0.02, JSON.stringify(corpseMovement));
  assert.ok(corpseMovement.travelled > 0.6 && corpseMovement.travelled < 1.1);
  assert.ok(corpseMovement.x > corpseMovement.corpseX + 1);
  pass('A dead hostile becomes passable difficult ground, slowing movement at the water rate');

  const packLeader = await fixture('kobold', 3);
  const packCollision = await page.evaluate((id) => {
    const d = window.__dungeon,
      g = d.game;
    const leader = g.combat.actor(id)!;
    const pack = [
      leader,
      ...g.combat.enemies.filter((a) => a.kind === 'kobold' && a.id !== id).slice(0, 2),
    ];
    pack.forEach((actor, index) => {
      Object.assign(actor.position, { x: 3, z: index === 0 ? 0 : index === 1 ? 1.5 : -1.5, h: 0 });
      actor.enableAI('collision-pack', index);
      actor.brain!.social = {
        id: 'collision-gathering',
        activity: 'smoke',
        center: { x: 3, z: 0, h: 0 },
        members: pack.map((member) => member.id),
        phase: 0,
      };
    });
    g.player.actor.health.invulnerable = 100;
    let minDistance = Infinity;
    for (let i = 0; i < 240; i++) {
      d.step([], 1);
      const actors = [g.player.actor, ...pack];
      for (let a = 0; a < actors.length; a++)
        for (let b = a + 1; b < actors.length; b++)
          minDistance = Math.min(
            minDistance,
            Math.hypot(
              actors[a].position.x - actors[b].position.x,
              actors[a].position.z - actors[b].position.z,
            ),
          );
    }
    return {
      minDistance,
      engaged: pack.every((actor) => Math.hypot(actor.position.x, actor.position.z) < 2),
    };
  }, packLeader);
  assert.ok(packCollision.minDistance >= 0.9 - 1e-6, JSON.stringify(packCollision));
  assert.ok(packCollision.engaged, JSON.stringify(packCollision));
  pass('A live kobold pack reaches melee while staying separate from the hero and allied bodies');

  const skeleton = await fixture('skeleton');
  await clickEnemy(skeleton, true);
  const pursuit = await page.evaluate((id) => {
    const d = window.__dungeon,
      g = d.game,
      target = g.combat.actor(id)!;
    let moved = false,
      attackPose = false,
      dust = false,
      strikes = 0,
      lastHealth = target.health.current;
    for (let i = 0; i < 300 && target.alive; i++) {
      d.step([], 1);
      moved ||= g.player.motion.actualSpeed > 1;
      attackPose ||= !!g.player.actor.attack.swing && g.player.arms[1].rotation.x < -1;
      dust ||= g.ecs.query('particle').some((e) => e.require('particle').kind === 'dust');
      if (target.health.current < lastHealth) {
        strikes++;
        lastHealth = target.health.current;
      }
    }
    d.step([], 40);
    return {
      moved,
      attackPose,
      dust,
      strikes,
      dead: !target.alive,
      corpse: target.entity.has('corpse'),
      fallen: target.entity.require('rig').root.rotation.x,
      target: g.player.actor.attack.target,
      active: g.player.navigator.active,
    };
  }, skeleton);
  await page.mouse.up();
  assert.ok(
    pursuit.moved && pursuit.attackPose && pursuit.dust && pursuit.dead && pursuit.corpse,
    JSON.stringify(pursuit),
  );
  assert.equal(pursuit.strikes, 2);
  assert.equal(pursuit.target, null);
  assert.equal(pursuit.active, false);
  assert.ok(pursuit.fallen > 1.5);
  await capture('skeleton-corpse');
  pass(
    'Real held click pursues, blends movement into repeated sword strikes, emits dust, and leaves a corpse',
  );

  const goblin = await fixture('goblin', 1.3);
  await clickEnemy(goblin);
  await step(25);
  const hit = await page.evaluate((id) => {
    const g = window.__dungeon.game;
    return {
      health: g.combat.actor(id)!.health.current,
      blood: g.ecs.query('particle').some((e) => e.require('particle').kind === 'blood'),
      particles: (g.scene.getMeshByName('blood hit fragments') as Mesh | null)?.thinInstanceCount,
      pose: g.player.actor.entity.require('rig').attackBlend,
    };
  }, goblin);
  assert.equal(hit.health, 12);
  assert.ok(hit.blood && (hit.particles ?? 0) > 0 && hit.pose > 0.8);
  await capture('blood-strike');
  await step(100);
  assert.equal(
    await page.evaluate((id) => window.__dungeon.game.combat.actor(id)!.alive, goblin),
    false,
  );
  pass('Living enemies bleed on impact; released clicks retain the target until death');

  const moving = await fixture('kobold', 4);
  await clickEnemy(moving, true);
  await step(12);
  await page.evaluate((id) => {
    const a = window.__dungeon.game.combat.actor(id)!;
    a.position.x = 0;
    a.position.z = 3;
  }, moving);
  await step(300);
  await page.mouse.up();
  assert.equal(
    await page.evaluate((id) => window.__dungeon.game.combat.actor(id)!.alive, moving),
    false,
  );
  pass(
    'Target lock follows a moving enemy rather than steering toward the original cursor position',
  );

  for (const action of ['KeyX', 'KeyW', 'floor', 'pause', 'blur'] as const) {
    const id = await fixture('skeleton', 1.3);
    await clickEnemy(id);
    await step(4);
    if (action === 'floor') {
      const p = await screen(0, -3);
      await page.mouse.click(p.x, p.y);
    } else if (action === 'pause') {
      await page.locator('#menu-button').click();
      await page.keyboard.press('Escape');
    } else if (action === 'blur')
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else await page.keyboard.press(action);
    await step(60);
    const cancelled = await page.evaluate(
      (id) => ({
        target: window.__dungeon.game.player.actor.attack.target,
        health: window.__dungeon.game.combat.actor(id)!.health.current,
      }),
      id,
    );
    assert.equal(cancelled.target, null, action);
    assert.equal(cancelled.health, 48, action);
  }
  pass('Floor commands, WASD, X, pause and focus loss cancel pursuit and unresolved attacks');

  await fixture('skeleton', 1000);
  const door = await page.evaluate(() => {
    const g = window.__dungeon.game;
    const e = g.world.entities.find((e) => e.type === 'door' && !e.requiresAltar);
    if (e?.type !== 'door') throw new Error('No door');
    e.open = false;
    e.angle = 0;
    if (e.collider) e.collider.checkCollisions = true;
    if (e.pivot) e.pivot.rotation.y = 0;
    window.__dungeon.teleport(e.x - (e.axis === 'x' ? 3.5 : 0), e.z - (e.axis === 'z' ? 3.5 : 0));
    g.scene.render();
    return { id: e.id, x: e.x, z: e.z, h: e.h };
  });
  const doorScreen = await screen(door.x, door.z, door.h + 1.2);
  await page.mouse.click(doorScreen.x, doorScreen.y);
  assert.equal(
    await page.evaluate(() => window.__dungeon.game.player.actor.attack.interaction),
    door.id,
  );
  await step(180);
  const opened = await page.evaluate((id) => {
    const e = window.__dungeon.game.ecs.get(id)!.require('door');
    return {
      open: e.open,
      solid: e.collider?.checkCollisions,
      intent: window.__dungeon.game.player.actor.attack.interaction !== null,
    };
  }, door.id);
  assert.ok(opened.open && !opened.solid && !opened.intent, JSON.stringify(opened));
  pass('Clicking a real door mesh approaches and opens it through the shared interaction system');

  const fighter = await fixture('skeleton', 1.2);
  await page.evaluate((id) => {
    const g = window.__dungeon.game,
      a = g.combat.actor(id)!;
    a.enableAI();
  }, fighter);
  await step(25);
  assert.ok(await page.evaluate(() => window.__dungeon.game.player.health < 100));
  await page.evaluate((id) => {
    const g = window.__dungeon.game;
    g.player.health = 1;
    g.combat.actor(id)!.attack.cooldown = 0;
  }, fighter);
  await step(65);
  const respawn = await page.evaluate(() => {
    const g = window.__dungeon.game;
    return {
      health: g.player.health,
      immunity: g.player.actor.health.invulnerable,
      corpse: g.player.actor.entity.has('corpse'),
      target: g.player.actor.attack.target,
    };
  });
  assert.equal(respawn.health, 100);
  assert.ok(respawn.immunity > 0);
  assert.equal(respawn.corpse, false);
  assert.equal(respawn.target, null);
  pass(
    'Enemy attacks damage the shared player health component and death respawns with brief protection',
  );

  await fixture('skeleton', 1000);
  const sealed = await page.evaluate(() => {
    const d = window.__dungeon,
      g = d.game;
    const door = g.world.entities.find((e) => e.type === 'door' && e.requiresAltar);
    if (door?.type !== 'door') throw new Error('Missing sealed door');
    door.locked = true;
    door.open = false;
    door.angle = 0;
    if (door.collider) door.collider.checkCollisions = true;
    if (door.pivot) door.pivot.rotation.y = 0;
    d.teleport(door.x - (door.axis === 'x' ? 2.2 : 0), door.z - (door.axis === 'z' ? 2.2 : 0));
    d.step([], 1);
    g.scene.render();
    return { id: door.id, x: door.x, z: door.z, h: door.h };
  });
  const sealedScreen = await screen(sealed.x, sealed.z, sealed.h + 1.2);
  await page.mouse.click(sealedScreen.x, sealedScreen.y);
  await step(60);
  assert.equal(
    await page.evaluate((id) => window.__dungeon.game.ecs.get(id)!.require('door').open, sealed.id),
    false,
  );
  assert.match(await page.locator('#toast').innerText(), /altar/);
  pass('Clicking a locked door preserves the altar gate and explains the lock');

  await fixture('skeleton', -2.4, 1);
  await page.evaluate(() => {
    const d = window.__dungeon,
      g = d.game;
    const goblin = g.combat.enemies.find((a) => a.kind === 'goblin')!;
    const kobold = g.combat.enemies.find((a) => a.kind === 'kobold')!;
    Object.assign(goblin.position, { x: 0, z: 1, h: 0 });
    Object.assign(kobold.position, { x: 2.4, z: 1, h: 0 });
    for (const a of g.combat.enemies) {
      a.position.heading = Math.PI;
      a.entity.require('rig').root.rotation.y = Math.PI;
    }
    d.teleport(0, -2.5);
    d.step([], 1);
    g.camera.radius = g.desiredRadius = 13;
    g.camera.beta = 0.9;
    g.scene.render();
  });
  await capture('enemy-lineup');

  await page.evaluate(() => window.__dungeon.regenerate('COMBAT-RESET'));
  await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
  const reset = await page.evaluate(() => {
    const g = window.__dungeon.game;
    return {
      actors: g.ecs.query('actor').length,
      corpses: g.ecs.query('corpse').length,
      particles: g.ecs.query('particle').length,
      shots: g.ecs.query('projectile').length,
      target: g.player.actor.attack.target,
    };
  });
  assert.deepEqual(reset, { actors: 22, corpses: 0, particles: 0, shots: 0, target: null });
  pass(
    'Regeneration replaces the ECS world without stale targets, corpses, particles or projectiles',
  );
  assert.deepEqual(errors, []);
  report.success = true;
} catch (error) {
  report.success = false;
  report.error = error instanceof Error ? error.stack : String(error);
  report.errors = errors;
  console.error(error);
  process.exitCode = 1;
  await capture('failure').catch(() => {});
} finally {
  await writeFile(
    `test-results/${browserName}-combat-report.json`,
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
