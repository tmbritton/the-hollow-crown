import { firefox } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { DebugWindow, InspectionReport } from './browserTypes.ts';

declare const window: DebugWindow;

const browser = await firefox.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors: string[] = [];
const report: InspectionReport = { checks: [] };
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await mkdir('test-results', { recursive: true });
const pass = (name: string) => {
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
const waitForView = () =>
  page.waitForFunction(() => window.__dungeon.game.inspection.state === 'viewing');
const waitForReturn = () => page.waitForFunction(() => !window.__dungeon.game.inspection.active);
try {
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  for (const room of ['entrance', 'crypt', 'altar'] as const) {
    const evidence = await page.evaluate((room) => {
      const d = window.__dungeon,
        w = d.game.scenario!.world;
      d.teleport(w.roomById[room].x, w.roomById[room].z);
      d.step([], 1);
      return { description: w.roomById[room].description, title: w.keep.monarchs[2].title };
    }, room);
    assert.equal(await page.locator('#room-description').textContent(), evidence.description);
    assert.ok(evidence.description.includes(evidence.title));
  }
  await page.screenshot({ path: 'test-results/keep-altar-history.png' });
  await page.evaluate(() => {
    const d = window.__dungeon;
    d.teleport(d.game.world.spawn.x, d.game.world.spawn.z);
    d.step([], 1);
  });
  pass('Three separated room captions display the shared keep history and altar instruction');
  const prevented = await page.evaluate(() => {
    const canvas = document.getElementById('game'),
      results = [];
    if (!canvas) throw new Error('Missing game canvas');
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD'])
      for (const repeat of [false, true]) {
        const event = new KeyboardEvent('keydown', {
          key: code.slice(-1).toLowerCase(),
          code,
          repeat,
          bubbles: true,
          cancelable: true,
        });
        canvas.dispatchEvent(event);
        results.push(event.defaultPrevented);
        canvas.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
      }
    return results;
  });
  assert.ok(prevented.every(Boolean));
  pass('Gameplay letters suppress native text input on initial and repeated keydown');
  await page.keyboard.press('Escape');
  await page.locator('#seed-input').fill('');
  await page.locator('#seed-input').focus();
  await page.keyboard.type('wasd-42');
  assert.equal(await page.locator('#seed-input').inputValue(), 'wasd-42');
  const editableCancelled = await page.locator('#seed-input').evaluate((input) => {
    const event = new KeyboardEvent('keydown', {
      key: 'a',
      code: 'KeyA',
      repeat: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert.equal(editableCancelled, false);
  await page.keyboard.press('Escape');
  pass('Seed editing retains normal keyboard behavior');

  const portraitId = await page.evaluate(() => {
    const d = window.__dungeon,
      e = d.game.world.entities.find((e) => e.type === 'portrait');
    if (!e) throw new Error('Missing portrait');
    d.teleport(e.x - e.wallDirection[0] * 1.5, e.z - e.wallDirection[1] * 1.5);
    return e.id;
  });
  await page.waitForTimeout(1100);
  await page.keyboard.press('KeyE');
  await waitForView();
  const royal = await page.evaluate((id) => {
    const entity = window.__dungeon.game.world.entities.find((e) => e.id === id);
    if (entity?.type !== 'portrait') throw new Error('Missing portrait identity');
    return entity.royal;
  }, portraitId);
  assert.equal(await page.locator('#inspection-title').textContent(), royal.title);
  assert.equal(
    await page.locator('#inspection-subtitle').textContent(),
    `HOUSE ${royal.house.toUpperCase()} · YEAR ${royal.year}`,
  );
  assert.ok(royal.description);
  assert.ok(
    (await page.locator('#inspection-description').textContent())?.includes(royal.description),
  );
  pass('Portrait inspection displays the linked monarch, house, date and founding history');
  const before = await page.evaluate((id) => {
    const g = window.__dungeon.game,
      p = g.dungeon.portraits.find((p) => p.entity.id === id);
    if (!p || !g.inspection.saved) throw new Error('Inspection not initialized');
    const traits = p.panel.getVerticesData('royalTraits');
    if (!traits) throw new Error('Missing royal traits');
    return {
      position: g.player.root.position.asArray(),
      health: g.player.health,
      time: g.playTime,
      detail: p.detailScale,
      radius: g.camera.radius,
      beta: g.camera.beta,
      alpha: g.camera.alpha,
      traits: Array.from(traits),
      playerVisible: g.player.root.isEnabled(),
      saved: { ...g.inspection.saved, target: g.inspection.saved.target.asArray() },
      textures: g.scene.textures.length,
    };
  }, portraitId);
  assert.equal(before.detail, 4);
  assert.equal(before.radius, 2.35);
  assert.equal(before.beta, Math.PI / 2);
  assert.equal(before.playerVisible, false);
  assert.equal(
    await page.locator('#inspection').evaluate((e) => e instanceof HTMLDialogElement && e.open),
    true,
  );
  pass('Inspection enters an eye-level close view and activates 128 × 160 detail');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyQ');
  await page.keyboard.press('KeyR');
  await page.mouse.wheel(0, 600);
  const held = await page.evaluate(() => {
    const g = window.__dungeon.game;
    return {
      position: g.player.root.position.asArray(),
      time: g.playTime,
      health: g.player.health,
      alpha: g.camera.alpha,
      radius: g.camera.radius,
    };
  });
  assert.deepEqual(held.position, before.position);
  assert.equal(held.time, before.time);
  assert.equal(held.health, before.health);
  assert.equal(held.alpha, before.alpha);
  assert.equal(held.radius, before.radius);
  pass('Inspection blocks movement, orbit, zoom, damage, and run timer');
  await page.screenshot({ path: 'test-results/inspection-high-detail.png' });

  report.detailProbe = await page.evaluate(async (id) => {
    const d = window.__dungeon,
      g = d.game,
      engine = d.engine,
      p = g.dungeon.portraits.find((p) => p.entity.id === id),
      loops = [...engine.activeRenderLoops];
    if (!p) throw new Error('Missing portrait');
    engine.stopRenderLoop();
    try {
      g.scene.render();
      const high = new Uint8Array(
        (await engine.readPixels(0, 0, engine.getRenderWidth(), engine.getRenderHeight())).buffer,
      );
      p.panel.updateVerticesData('royalDetail', [1, 1, 1, 1]);
      g.scene.render();
      const low = new Uint8Array(
        (await engine.readPixels(0, 0, engine.getRenderWidth(), engine.getRenderHeight())).buffer,
      );
      let changedPixels = 0;
      for (let i = 0; i < high.length; i += 4)
        if (
          Math.abs(high[i] - low[i]) +
            Math.abs(high[i + 1] - low[i + 1]) +
            Math.abs(high[i + 2] - low[i + 2]) >
          15
        )
          changedPixels++;
      const traits = p.panel.getVerticesData('royalTraits');
      if (!traits) throw new Error('Missing royal traits');
      return { changedPixels, traits: Array.from(traits) };
    } finally {
      p.panel.updateVerticesData('royalDetail', [4, 4, 4, 4]);
      for (const loop of loops) engine.runRenderLoop(loop);
    }
  }, portraitId);
  assert.ok(report.detailProbe.changedPixels > 1000);
  assert.deepEqual(report.detailProbe.traits, before.traits);
  pass('Close-up adds rendered detail while preserving the portrait identity');
  await page.setViewportSize({ width: 480, height: 750 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/inspection-narrow.png' });
  const framing = await page.evaluate((id) => {
    const d = window.__dungeon,
      g = d.game,
      p = g.dungeon.portraits.find((p) => p.entity.id === id),
      engine = d.engine,
      V = g.camera.target.constructor as typeof Vector3,
      M = g.camera.getWorldMatrix().constructor as typeof Matrix;
    const caption = document.getElementById('inspection');
    if (!p || !caption) throw new Error('Missing inspection presentation');
    const points = p.panel
      .getBoundingInfo()
      .boundingBox.vectorsWorld.map((v) =>
        V.Project(
          v,
          M.Identity(),
          g.scene.getTransformMatrix(),
          g.camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()),
        ),
      );
    return {
      minX: Math.min(...points.map((p) => p.x)),
      maxX: Math.max(...points.map((p) => p.x)),
      minY: Math.min(...points.map((p) => p.y)),
      maxY: Math.max(...points.map((p) => p.y)),
      captionTop: caption.getBoundingClientRect().top,
    };
  }, portraitId);
  assert.ok(
    framing.minX > 0 && framing.maxX < 480 && framing.minY > 0 && framing.maxY < framing.captionTop,
    JSON.stringify(framing),
  );
  pass('Portrait stays framed above its caption after resizing');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press('Escape');
  await waitForReturn();
  const returned = await page.evaluate((id) => {
    const g = window.__dungeon.game,
      p = g.dungeon.portraits.find((p) => p.entity.id === id);
    const menu = document.getElementById('menu');
    if (!p || !(menu instanceof HTMLDialogElement)) throw new Error('Missing portrait or menu');
    return {
      alpha: g.camera.alpha,
      beta: g.camera.beta,
      radius: g.camera.radius,
      fov: g.camera.fov,
      minZ: g.camera.minZ,
      detail: p.detailScale,
      playerVisible: g.player.root.isEnabled(),
      position: g.player.root.position.asArray(),
      textures: g.scene.textures.length,
      menu: menu.open,
    };
  }, portraitId);
  for (const field of ['alpha', 'beta', 'radius', 'fov', 'minZ'] as const)
    assert.ok(Math.abs(returned[field] - before.saved[field]) < 1e-6, field);
  assert.equal(returned.detail, 1);
  assert.equal(returned.playerVisible, true);
  assert.deepEqual(returned.position, before.position);
  assert.equal(returned.textures, before.textures);
  assert.equal(returned.menu, false);
  pass('Escape restores overhead camera, player, low detail, and gameplay');
  await page.keyboard.press('KeyE');
  await page.keyboard.press('Escape');
  await waitForReturn();
  pass('Inspection can be cancelled during camera entry');
  await page.keyboard.press('KeyE');
  await waitForView();
  await page.locator('#inspection-close').click();
  await waitForReturn();
  pass('Visible close button exits inspection');
  await page.keyboard.press('KeyE');
  await waitForView();
  await page.keyboard.press('KeyE');
  await waitForReturn();
  pass('Interact key also exits inspection');
  await page.keyboard.press('KeyE');
  await waitForView();
  await page.evaluate(() => window.__dungeon.regenerate('INSPECTION-RESET'));
  await page.waitForFunction(() => window.__dungeon.ready);
  assert.equal(
    await page.locator('#inspection').evaluate((e) => e instanceof HTMLDialogElement && e.open),
    false,
  );
  assert.ok(
    await page.evaluate(
      () =>
        !window.__dungeon.game.inspection.active && window.__dungeon.game.player.root.isEnabled(),
    ),
  );
  pass('Regeneration disposes an active inspection cleanly');
  assert.deepEqual(errors, []);
  report.success = true;
} catch (error) {
  report.success = false;
  report.error = error instanceof Error ? error.stack : String(error);
  report.errors = errors;
  await page.screenshot({ path: 'test-results/inspection-failure.png' }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile('test-results/inspection-report.json', JSON.stringify(report, null, 2));
  await browser.close();
}
