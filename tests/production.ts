import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

let server: ChildProcess | undefined;
const base = 'http://localhost:4173';
try {
  await fetch(base);
} catch {
  server = spawn('npm', ['run', 'preview', '--', '--port', '4173'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(base);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}
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
  server?.kill();
}
