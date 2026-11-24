import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { generateDungeonWithReport } from '../src/world.ts';
import { createGenerationReport } from '../src/generation/report.ts';
import type { DebugWindow } from './browserTypes.ts';
import { assertGenerationReportsMatch } from './generationGallery.ts';

declare const window: DebugWindow;

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const base = process.env.DEMO_URL || 'http://localhost:5173';
  {
    await page.goto(`${base}/?debug&seed=trial-23&generationFailure=1`);
    await page.locator('#retry-generation').waitFor({ timeout: 12000 });
    assert.match(
      await page.locator('#loading p').innerText(),
      /trial-23.*Furniture front inaccessible/i,
    );
    await page.waitForFunction(() => !!window.__dungeon);
    assert.deepEqual(
      await page.evaluate(() => [
        window.__dungeon.ready,
        window.__dungeon.engine.scenes.length,
        window.__dungeon.engine.activeRenderLoops.length,
      ]),
      [false, 0, 1],
    );
    await page.locator('#retry-generation').click();
    await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
    const recovery = await page.evaluate(() => [
      window.__dungeon.game.world.seed,
      window.__dungeon.engine.activeRenderLoops.length,
    ]);
    assert.deepEqual(recovery, ['trial-23', 1]);
    const observed = await page.evaluate(() => {
      const d = window.__dungeon;
      const trace = d.generationExecution();
      const closed = trace.runs.map((run) => [run.seed, run.outcome]);
      trace.runs.length = 0;
      return [closed, d.generationExecution().runs.length];
    });
    assert.deepEqual(observed, [
      [
        ['trial-23', 'exhausted'],
        ['trial-23', 'success'],
      ],
      2,
    ]);
    await page.evaluate(() => {
      const d = window.__dungeon;
      const old = d.game;
      const counts = { renders: 0, disposes: 0 };
      old.scene.onBeforeRenderObservable.add(() => counts.renders++);
      old.scene.onDisposeObservable.addOnce(() => counts.disposes++);
      Object.assign(window, { retiredGeneration: () => ({ ...counts, old, steps: old.steps }) });
      d.failNextGeneration();
    });
    await page.keyboard.press('Escape');
    await page.locator('#seed-input').fill('trial-23');
    await page.locator('#rebuild').click();
    await page.locator('#retry-generation').waitFor();
    const failed = async () =>
      page.evaluate(() => {
        const d = window.__dungeon;
        const { old, ...retired } = (
          window as DebugWindow & {
            retiredGeneration(): {
              old: typeof d.game;
              renders: number;
              disposes: number;
              steps: number;
            };
          }
        ).retiredGeneration();
        const unavailable = (read: () => unknown) => {
          try {
            read();
            return false;
          } catch {
            return true;
          }
        };
        d.step(['KeyW'], 3);
        return {
          ...retired,
          disposed: old.scene.isDisposed,
          ready: d.ready,
          scenes: d.engine.scenes.length,
          loops: d.engine.activeRenderLoops.length,
          noGame: unavailable(() => d.game),
          noReport: unavailable(() => d.generationReport()),
        };
      });
    const retired = await failed();
    assert.deepEqual(retired, {
      ...retired,
      disposes: 1,
      disposed: true,
      ready: false,
      scenes: 0,
      loops: 1,
      noGame: true,
      noReport: true,
    });
    await page.keyboard.press('KeyW');
    await page.evaluate(async () => {
      for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
    });
    assert.deepEqual(await failed(), retired);
    // Fail the first retry too, then recover without replacing the engine or URL.
    await page.evaluate(() => window.__dungeon.failNextGeneration());
    await page.locator('#retry-generation').click();
    await page.locator('#retry-generation').waitFor();
    assert.deepEqual(await failed(), retired);
    await page.locator('#retry-generation').click();
    await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
    assert.deepEqual(
      await page.evaluate(() => [
        window.__dungeon.engine.scenes.length,
        window.__dungeon.engine.activeRenderLoops.length,
      ]),
      [1, 1],
    );
    assert.deepEqual(errors, []);
  }
  await page.goto(`${base}/?seed=MOURNING-731`);
  await page.waitForSelector('#loading.done', { state: 'attached', timeout: 90000 });
  assert.equal(await page.evaluate(() => typeof window.__dungeon), 'undefined');
  await page.goto(`${base}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  assert.equal(await page.evaluate(() => typeof window.__dungeon.generationReport), 'function');
  const initial = await page.evaluate(() => window.__dungeon.generationReport());
  const { world, report } = generateDungeonWithReport('MOURNING-731');
  assertGenerationReportsMatch(initial, createGenerationReport(world, report));
  const afterChanges = await page.evaluate(() => {
    const d = window.__dungeon;
    const detached = d.generationReport();
    detached.trace.identity.seed = 'caller mutation';
    detached.rooms[0].name = 'caller mutation';
    detached.scenes[0].sockets[0].reason = 'omitted';
    d.game.world.scenes[0].reserved[0].x += 100;
    d.game.world.rooms[0].name = 'mutated live blueprint';
    const enemy = d.game.combat.enemies[0];
    d.game.combat.damage(enemy, 1000);
    for (const entity of d.game.world.entities) if (entity.type === 'door') entity.locked = false;
    d.step([], 2);
    return d.generationReport();
  });
  assert.deepEqual(
    afterChanges,
    initial,
    'report must describe initial generation, not mutable play',
  );
  await page.evaluate(() => window.__dungeon.regenerate('trial-23'));
  await page.waitForFunction(
    () => window.__dungeon.ready && window.__dungeon.game.world.seed === 'trial-23',
  );
  const regenerated = await page.evaluate(() => window.__dungeon.generationReport());
  const retry = generateDungeonWithReport('trial-23');
  assertGenerationReportsMatch(regenerated, createGenerationReport(retry.world, retry.report));
  assert.deepEqual(errors, []);
  console.log(
    'PASS development-only generation reports, Node/browser agreement, detached initial state and regeneration',
  );
} finally {
  await browser.close();
}
