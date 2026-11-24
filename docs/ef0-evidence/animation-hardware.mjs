import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${process.env.DEMO_URL}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 60_000 });
  const result = await page.evaluate(async () => {
    const d = window.__dungeon;
    d.animation.pause();
    d.regenerate('MOURNING-731');
    const renderer = d.engine.getGlInfo().renderer;
    if (!renderer.includes('RTX 2070')) throw new Error(`Unmatched renderer: ${renderer}`);
    const { createReviewStage } = await import('/tests/animation-review-fixture.ts');
    const game = d.game;
    return {
      renderer,
      viewport: [innerWidth, innerHeight],
      devicePixelRatio,
      renderSize: [d.engine.getRenderWidth(), d.engine.getRenderHeight()],
      shadowsEnabled: game.scene.shadowsEnabled,
      resources: d.animation.resources(),
      cpu: await createReviewStage(game).baseline(),
    };
  });
  assert.deepEqual(errors, []);
  assert.equal(result.cpu.actors, 25);
  assert.equal(result.cpu.corpses, 4);
  console.log(JSON.stringify({ chromium: browser.version(), ...result }, null, 2));
} finally {
  await browser.close();
}
