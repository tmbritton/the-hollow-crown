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
