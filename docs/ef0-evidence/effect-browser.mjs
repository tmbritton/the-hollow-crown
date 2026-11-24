import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const url = new URL(process.argv[2]);
assert.equal(url.hostname, '127.0.0.1');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const paths = [];
  const unexpected = [];
  page.on('pageerror', (error) => unexpected.push(String(error)));
  page.on('requestfailed', (request) => unexpected.push(request.url()));
  await page.route('**/*', async (route) => {
    const request = new URL(route.request().url());
    if (request.origin !== url.origin || !request.pathname.startsWith(url.pathname)) {
      unexpected.push(request.href);
      await route.abort();
      return;
    }
    paths.push(request.pathname);
    await route.continue();
  });
  assert.equal((await page.goto(url.href, { timeout: 15_000 }))?.status(), 200);
  await page.waitForFunction(
    () => document.querySelector('#result')?.textContent?.startsWith('{'),
    {},
    { timeout: 10_000 },
  );
  const result = JSON.parse(await page.locator('#result').innerText());
  assert.deepEqual(result, {
    service: 42,
    failure: 'placement',
    defectIdentity: true,
    asyncMismatch: true,
    asyncMismatchCleaned: true,
    signalAborted: true,
    interrupted: true,
    callbackCleanup: 1,
    finalizer: 1,
  });
  assert.deepEqual(unexpected, []);
  assert.ok(paths.some((path) => path.endsWith('.js') && path.includes('/assets/')));
  console.log(JSON.stringify({ chromium: browser.version(), paths, result }, null, 2));
} finally {
  await browser.close();
}
