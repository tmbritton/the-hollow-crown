import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { withViteServer } from './testServer.ts';

const base = new URL(process.env.DEMO_URL || 'http://localhost:4173/');
if (!base.pathname.endsWith('/')) base.pathname += '/';
base.search = '';
base.hash = '';
const label = base.pathname === '/' ? 'root' : base.pathname.replace(/[^a-z0-9-]/gi, '');

await withViteServer(base.href, 'preview', async () => {
  await mkdir('test-results', { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    timeout: 15000,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  // Cold shader compilation across multiple scene rebuilds can exceed two
  // minutes in SwiftShader; keep per-operation limits while bounding the run.
  const deadline = setTimeout(() => void browser.close().catch(() => {}), 300000);
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(30000);
    const errors: string[] = [],
      requests: string[] = [],
      checks: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('request', (request) => requests.push(request.url()));
    page.on('requestfailed', (request) => errors.push(`Request failed: ${request.url()}`));
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
    });
    const checkAssets = () => {
      for (const request of requests) {
        const url = new URL(request);
        if (url.protocol === 'data:' || url.protocol === 'blob:') continue;
        assert.equal(url.origin, base.origin, `Runtime asset must be locally bundled: ${request}`);
        assert.ok(
          url.pathname.startsWith(base.pathname),
          `Runtime request escaped deployment base ${base.pathname}: ${request}`,
        );
        assert.doesNotMatch(url.pathname, /inspector|@vite|\/src\//i);
      }
      assert.ok(requests.some((url) => new URL(url).pathname.endsWith('.js')));
      assert.ok(requests.some((url) => new URL(url).pathname.endsWith('.css')));
      assert.deepEqual(errors, []);
    };
    const checkLocation = (seed: string | null) => {
      const current = new URL(page.url());
      assert.equal(current.origin, base.origin);
      assert.equal(current.pathname, base.pathname);
      assert.equal(current.searchParams.get('seed'), seed);
    };
    const ready = async () => {
      await page.waitForSelector('#loading.done', { state: 'attached', timeout: 45000 });
      // Both the overlay and toast reflect the current scene, not a retired run.
      await expect(page.locator('#toast')).toHaveClass(/visible/, { timeout: 45000 });
    };
    const capture = (name: string) =>
      page.screenshot({ path: `test-results/production-${label}-${name}.png` });
    const practice = new URL('?room=practice', base);
    const resetPractice = page.getByRole('button', { name: 'Reset practice', exact: true });
    const startFoe = page.getByRole('button', { name: 'Start single-foe practice' });
    const roundStatus = page.locator('#practice-round');
    const checkPractice = async () => {
      await page.waitForSelector('#loading.done', { state: 'attached', timeout: 45000 });
      await expect(page.locator('#room-name')).toHaveText('The Dojo');
      await expect(page.locator('.quest-panel')).toBeHidden();
      await expect(page.locator('#game')).toBeVisible();
      await page.waitForFunction(
        () => Number.parseInt(document.querySelector('#fps')!.textContent!) > 0,
      );
      assert.equal(await page.evaluate(() => '__dungeon' in window), false);
      assert.equal(new URL(page.url()).searchParams.get('room'), 'practice');
      checkAssets();
    };
    await page.goto(practice.href);
    await checkPractice();
    await expect(page.locator('#loading')).toHaveCSS('opacity', '0');
    await expect(resetPractice).toBeVisible({ timeout: 4500 });
    const documentSentinel = 'production-practice-rounds';
    await page.evaluate((sentinel) => {
      document.documentElement.dataset.practiceProbe = sentinel;
    }, documentSentinel);
    const checkRound = async (status: string) => {
      await checkPractice();
      await expect(roundStatus).toHaveText(status);
      await expect(page.locator('#loading')).toHaveCSS('opacity', '0');
      assert.equal(page.url(), practice.href);
      assert.equal(
        await page.evaluate(() => document.documentElement.dataset.practiceProbe),
        documentSentinel,
      );
    };
    await startFoe.click();
    await checkRound('Single-foe round');
    await expect(startFoe).toBeDisabled();
    await resetPractice.click();
    await checkRound('Empty room');
    await startFoe.click();
    await checkRound('Single-foe round');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(resetPractice).toBeFocused();
    await capture('practice-keyboard-focus');
    await page.keyboard.press('Space');
    await checkRound('Empty room');
    await expect(page.locator('#health-text')).toHaveText('100 / 100');
    await expect(startFoe).toBeEnabled();
    checks.push('practice opt-in and click/keyboard reset preserve document, URL and playable HUD');
    await capture('practice');
    practice.searchParams.set('seed', 'MOURNING-731');
    await page.goto(practice.href);
    await checkPractice();
    await page.reload();
    await checkPractice();
    await page.keyboard.press('Escape');
    await page.locator('#leave-practice').click();
    await ready();
    await expect(page.locator('.quest-panel')).toBeVisible();
    await expect(resetPractice).toBeHidden();
    await expect(startFoe).toBeHidden();
    await expect(page.locator('#room-name')).not.toHaveText('The Dojo');
    checkLocation(null);
    assert.equal(new URL(page.url()).searchParams.has('room'), false);
    checks.push(
      'direct practice entry and reload without debug, then bare base returns to dungeon',
    );
    const start = new URL(base);
    start.searchParams.set('debug', '');
    start.searchParams.set('generationFailure', '1');
    start.searchParams.set('seed', 'MOURNING-731');
    await page.goto(start.href);
    // Check real browser requests before waiting for bootstrap: a root-built bundle must fail
    // at a project mount, even if a permissive preview happens to serve its /assets requests.
    checkAssets();
    await ready();
    await expect(resetPractice).toBeHidden();
    await expect(startFoe).toBeHidden();
    await expect(page.locator('#retry-generation')).toBeHidden();
    await expect(page.locator('#seed-label')).toHaveText('MOURNING-731');
    checkLocation('MOURNING-731');
    await page.waitForFunction(
      () => Number.parseInt(document.querySelector('#fps')!.textContent!) > 0,
    );
    checks.push('seeded bootstrap, rendered frames, bundled JS/CSS under deployment base');
    const faultProbe = new URL(start);
    faultProbe.searchParams.set('seed', 'trial-23');
    await page.goto(faultProbe.href);
    await ready();
    await expect(page.locator('#retry-generation')).toBeHidden();
    assert.equal(await page.evaluate(() => '__dungeon' in window), false);
    await page.goto(start.href);
    await ready();

    await page.keyboard.press('Escape');
    await expect(page.locator('#menu')).toBeVisible();
    await page.locator('#quality').selectOption('low');
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu')).toBeHidden();
    await page.keyboard.press('KeyM');
    await expect(page.locator('.map-panel')).toBeHidden();
    await page.keyboard.press('KeyM');
    await expect(page.locator('.map-panel')).toBeVisible();
    const mapImage = () =>
      page.locator('#map').evaluate((map) => {
        if (!(map instanceof HTMLCanvasElement)) throw new Error('Missing minimap canvas');
        return map.toDataURL();
      });
    const beforeMove = await mapImage();
    await page.keyboard.down('KeyD');
    await expect.poll(mapImage).not.toBe(beforeMove);
    await page.keyboard.up('KeyD');
    await page.keyboard.press('KeyX');
    checks.push('real map toggle and keyboard movement update the minimap');

    // Production exposes no actor introspection. Capture ordinary held-F/release presentation
    // for visual review; detailed damage/latch assertions belong to the defense suite.
    await page.keyboard.press('KeyR');
    await page.mouse.move(480, 320);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -100);
    await page.waitForTimeout(700);
    await capture('lowered');
    await page.keyboard.down('KeyF');
    await page.waitForTimeout(300);
    await capture('defending');
    await page.keyboard.up('KeyF');
    checks.push('held F and release exercised; lowered/defending captures saved');

    await page.keyboard.press('Escape');
    await expect(page.locator('#menu')).toBeVisible();
    await page.locator('#seed-input').fill('BUILT-WORLD');
    await page.locator('#rebuild').click();
    await expect(page.locator('#seed-label')).toHaveText('BUILT-WORLD');
    await ready();
    checkLocation('BUILT-WORLD');
    await expect(page.locator('#menu')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#quality')).toHaveValue('low');
    await page.locator('#regenerate').click();
    await expect(page.locator('#seed-label')).not.toHaveText('BUILT-WORLD');
    await ready();
    checkLocation(null);
    await page.locator('#menu-button').click();
    await expect(page.locator('#menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu')).toBeHidden();
    checks.push(
      'seed entry, random regeneration, quality persistence and menu resume preserve base',
    );

    assert.equal(await page.evaluate(() => '__dungeon' in window), false);
    const requestCount = requests.length;
    await page.keyboard.press('F2');
    await page.waitForTimeout(300);
    assert.equal(requests.length, requestCount, 'F2 must not load the development Inspector');
    assert.equal(await page.evaluate(() => '__dungeon' in window), false);
    checkAssets();
    checks.push('no debug global, Inspector requests, external assets or browser/network errors');
    await writeFile(
      `test-results/production-${label}.json`,
      JSON.stringify({ url: base.href, checks, requests, errors }, null, 2),
    );
    console.log(`PASS production ${base.href}: ${checks.join('; ')}`);
  } finally {
    clearTimeout(deadline);
    await browser.close();
  }
});
