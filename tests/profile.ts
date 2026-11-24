import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import type { DebugWindow, ProfileReport } from './browserTypes.ts';
import type { RoomId } from '../src/worldTypes.ts';

declare const window: DebugWindow;

// Run on the local desktop GPU, separately from software-rendered smoke tests.
const browser = await chromium.launch({
  headless: false,
  args: ['--no-sandbox', '--ignore-gpu-blocklist', '--enable-precise-memory-info'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await mkdir('test-results', { recursive: true });
const report: ProfileReport = {
  date: new Date().toISOString(),
  viewport: '1920 × 1080',
  quality: 'high',
  samples: [],
};
try {
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  report.renderer = await page.evaluate(() => window.__dungeon.engine.getGlInfo().renderer);
  report.browser = await browser.version();
  const rooms: RoomId[] = [
    'entrance',
    'water',
    'stairs',
    'lava',
    'altar',
    'throne',
    'butchery',
    'smithy',
    'bakery',
    'stable',
  ];
  for (const room of rooms) {
    await page.evaluate((id) => {
      const d = window.__dungeon,
        w = d.game.scenario!.world;
      let target = w.entities.find((e) => e.type === id)?.approach || w.roomById[id];
      if (id === 'stairs') {
        const c = w.connections.find((c) => c.ramp);
        if (!c) throw new Error('Missing stairs');
        const middle = (c.start + c.end) / 2;
        target = c.axis === 'x' ? { x: middle, z: c.cross } : { x: c.cross, z: middle };
      }
      d.teleport(target.x, target.z);
    }, room);
    await page.waitForTimeout(1400);
    const metrics = await page.evaluate(async () => {
      const samples: number[] = [];
      let last = performance.now();
      for (let i = 0; i < 120; i++)
        await new Promise<void>((resolve) =>
          requestAnimationFrame((now) => {
            samples.push(now - last);
            last = now;
            resolve();
          }),
        );
      samples.shift();
      samples.sort((a, b) => a - b);
      const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
      return {
        meanMs: samples.reduce((a, b) => a + b, 0) / samples.length,
        p95Ms: samples[Math.floor(samples.length * 0.95)],
        ...window.__dungeon.snapshot(),
        heapBytes: perf.memory?.usedJSHeapSize,
      };
    });
    report.samples.push({ ...metrics, room });
    console.log(room, `${(1000 / metrics.meanMs).toFixed(1)} FPS`, `${metrics.drawCalls} draws`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    const d = window.__dungeon,
      p = d.game.world.entities.find((e) => e.type === 'altar')?.approach;
    if (!p) throw new Error('Missing altar');
    d.teleport(p.x, p.z);
  });
  for (let angle = 0; angle < 4; angle++) {
    await page.evaluate((angle) => {
      const g = window.__dungeon.game;
      g.desiredAlpha = -Math.PI / 4 + (angle * Math.PI) / 2;
    }, angle);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `test-results/camera-${angle}.png` });
  }
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game');
    if (!canvas) throw new Error('Missing canvas');
    canvas.style.filter = 'grayscale(1)';
  });
  await page.screenshot({ path: 'test-results/grayscale.png' });
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game');
    if (!canvas) throw new Error('Missing canvas');
    canvas.style.filter = '';
  });
  await page.keyboard.press('F2');
  await page.waitForFunction(
    () => document.body.innerText.includes('Scene Explorer'),
    {},
    { timeout: 60000 },
  );
  await page.keyboard.press('F2');
  report.inspector = 'opened and closed';
  report.errors = errors;
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await writeFile('test-results/hardware-profile.json', JSON.stringify(report, null, 2));
  await browser.close();
}
