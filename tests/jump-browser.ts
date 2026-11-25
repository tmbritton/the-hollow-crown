import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { DebugWindow } from './browserTypes.ts';
import { clickWorld } from './world-pointer.ts';

declare const window: DebugWindow;
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const errors: string[] = [],
  checks: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
const pass = (name: string) => {
  checks.push(name);
  console.log(`PASS ${name}`);
};
const step = (frames: number, codes: string[] = []) =>
  page.evaluate(({ frames, codes }) => window.__dungeon.step(codes, frames), { frames, codes });
const state = () =>
  page.evaluate(() => {
    const g = window.__dungeon.game,
      actor = g.player.actor;
    return {
      x: actor.position.x,
      z: actor.position.z,
      height: actor.jump.height,
      phase: actor.jump.phase,
      landings: actor.jump.landings,
      destination: actor.navigator.destination,
      health: actor.health.current,
      renderY: g.player.root.position.y,
      elevation: actor.elevation,
      proxyY: g.player.proxy.position.y,
      ground: actor.position.h,
      markerY: g.player.marker.position.y,
      cameraY: g.camera.target.y,
      scale: g.player.root.scaling.asArray(),
    };
  });
const reset = async (x = 0, z = 0) =>
  page.evaluate(
    ({ x, z }) => {
      const d = window.__dungeon,
        g = d.game;
      d.teleport(x, z);
      g.player.health = 100;
      g.player.actor.health.invulnerable = 0;
      g.camera.alpha = g.desiredAlpha = -Math.PI / 2;
      g.camera.target.set(x, g.player.actor.position.h + 0.75, z);
      d.step([], 1);
    },
    { x, z },
  );

await mkdir('test-results', { recursive: true });
try {
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  await page.evaluate(() => {
    const d = window.__dungeon;
    d.engine.stopRenderLoop();
    for (const enemy of d.game.combat.enemies) {
      enemy.entity.remove('brain');
      enemy.entity.remove('body');
      enemy.entity.require('rig').root.setEnabled(false);
    }
  });
  await reset();
  // A complete tap between simulation ticks must still be queued.
  await page.keyboard.press('Space');
  assert.equal((await state()).phase, 'anticipation');
  await step(1);
  assert.equal((await state()).height, 0);
  await step(20);
  const apex = await state();
  assert.ok(apex.height > 1 && apex.height < 1.03);
  assert.ok(Math.abs(apex.renderY - apex.elevation) < 1e-9);
  assert.ok(Math.abs(apex.proxyY - apex.elevation - 0.72) < 1e-9);
  assert.ok(Math.abs(apex.markerY - apex.ground - 0.035) < 1e-9);
  assert.ok(Math.abs(apex.cameraY - apex.ground - 0.75) < 1e-9);
  await step(45);
  assert.equal((await state()).height, 0);
  assert.equal((await state()).landings, 1);
  pass(
    'A short Space tap loads, jumps, and lands; body height follows flight while marker and camera remain grounded',
  );

  await reset();
  await page.keyboard.down('Space');
  await step(120);
  assert.equal((await state()).landings, 1);
  assert.equal((await state()).phase, 'grounded');
  await page.keyboard.up('Space');
  await step(1);
  await page.keyboard.press('Space');
  await step(60);
  assert.equal((await state()).landings, 2);
  pass('Holding Space does not auto-repeat jumps; releasing and pressing again starts a new jump');

  await reset(-2);
  await clickWorld(page, 3, 0);
  await step(10);
  await page.keyboard.press('Space');
  const destination = (await state()).destination;
  assert.ok(destination && Math.hypot(destination.x - 3, destination.z) < 0.04);
  await step(22);
  assert.ok((await state()).height > 0.9);
  await step(100);
  assert.ok(Math.abs((await state()).x - 3) < 0.04);
  pass('Jump preserves a click route and completes it after landing');

  await reset(-2);
  await page.keyboard.press('KeyR');
  await clickWorld(page, 4, 0);
  await step(10);
  const before = await state();
  await page.keyboard.press('Space');
  await step(22);
  const running = await state();
  assert.ok(running.x - before.x > 2.5 && running.height > 0.9);
  await step(40);
  assert.equal((await state()).height, 0);
  pass('R-running retains horizontal speed and steering through flight and landing');

  const gate = await page.evaluate(() => {
    const g = window.__dungeon.game;
    const door = g.world.entities.find((e) => e.type === 'door' && e.requiresAltar);
    if (door?.type !== 'door') throw new Error('Missing gate');
    const connection = g.world.connections.find((c) => c.door === door.id)!;
    const sign = connection.b === 'throne' ? connection.sign : -connection.sign;
    return {
      x: door.x,
      z: door.z,
      axis: door.axis,
      sign,
      fromX: door.x - (door.axis === 'x' ? sign * 2.2 : 0),
      fromZ: door.z - (door.axis === 'z' ? sign * 2.2 : 0),
    };
  });
  await reset(gate.fromX, gate.fromZ);
  await page.keyboard.press('KeyR');
  await page.keyboard.press('Space');
  await clickWorld(page, 2 * gate.x - gate.fromX, 2 * gate.z - gate.fromZ, (await state()).ground);
  await step(60);
  const blocked = await state();
  assert.ok((gate.axis === 'x' ? blocked.x - gate.x : blocked.z - gate.z) * gate.sign < -0.1);
  pass('Jumping cannot bypass the sealed gate or its ground-navigation clearance');

  const lava = await page.evaluate(() =>
    [...window.__dungeon.game.world.tiles.values()].find((tile) => tile.surface === 'lava')!,
  );
  await reset(lava.x, lava.z);
  await page.keyboard.press('Space');
  await step(20);
  await page.evaluate(() => {
    const g = window.__dungeon.game;
    g.player.health = 100;
    g.damageCooldown = 0;
  });
  await step(5);
  assert.equal((await state()).health, 100);
  await step(30);
  assert.ok((await state()).health < 100);
  pass('Lava contact damage pauses above the surface and resumes on landing');

  await reset();
  await page.keyboard.press('Space');
  await step(8);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal((await state()).height, 0);
  assert.ok((await state()).scale.every((v) => Math.abs(v - 1) < 1e-9));
  await page.keyboard.press('Space');
  await step(8);
  await page.keyboard.press('Escape');
  assert.equal((await state()).height, 0);
  await page.keyboard.press('Space');
  assert.equal((await state()).phase, 'grounded');
  await page.keyboard.press('Escape');
  await step(10);
  assert.equal((await state()).height, 0);
  pass('Focus loss and menus clear flight and spring poses; Space is ignored while paused');

  await page.keyboard.press('Space');
  await step(8);
  await reset(1, 0);
  assert.equal((await state()).height, 0);
  await page.keyboard.press('Space');
  await step(8);
  await page.evaluate(() => window.__dungeon.regenerate('JUMP-RESET'));
  await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
  assert.equal((await state()).height, 0);
  assert.equal((await state()).landings, 0);
  pass('Teleport and regeneration discard airborne state and landing impulses');
  assert.deepEqual(errors, []);
  await writeFile(
    'test-results/chromium-jump-report.json',
    JSON.stringify({ success: true, checks, errors }, null, 2),
  );
} finally {
  await browser.close();
}
