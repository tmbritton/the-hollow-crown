import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { withViteServer } from './testServer.ts';

const base = 'http://localhost:4173';
await withViteServer(base, 'preview', async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto(`${base}/?debug&seed=PRODUCTION`);
    await page.waitForSelector('#loading.done', { state: 'attached', timeout: 90000 });
    assert.equal(await page.evaluate(() => typeof window.__dungeon), 'undefined');
    await page.keyboard.press('Escape');
    await page.locator('#seed-input').fill('BUILT-WORLD');
    await page.locator('#rebuild').click();
    await page.waitForFunction(
      () => document.querySelector('#seed-label')?.textContent === 'BUILT-WORLD',
    );
    await page.waitForTimeout(1500);
    await page.keyboard.press('Escape');
    await page.locator('#quality').selectOption('low');
    await page.keyboard.press('Escape');
    assert.equal(
      await page.locator('#menu').evaluate((e) => e instanceof HTMLDialogElement && e.open),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS production shaders/rendering, seed regeneration, menus, quality settings, and absence of development hooks',
    );
  } finally {
    await browser.close();
  }
});
