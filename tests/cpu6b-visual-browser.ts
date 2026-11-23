import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { rendererKind } from '../src/cpuMetrics.ts';
import { withViteServer } from './testServer.ts';
import type { DebugWindow } from './browserTypes.ts';

declare const window: DebugWindow;
const base = process.env.DEMO_URL ?? 'http://127.0.0.1:5173';
const output = 'test-results/cpu6b-subset-cadence';
await mkdir(output, { recursive: true });
await withViteServer(base, 'dev', async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--ignore-gpu-blocklist'],
  });
  const deadline = setTimeout(() => void browser.close(), 180000);
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/?debug&seed=MOURNING-731`);
    await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
    const renderer = await page.evaluate(() => window.__dungeon.engine.getGlInfo());
    assert.equal(rendererKind(renderer.renderer, renderer.vendor), 'hardware');
    const rows: {
      quality: string;
      hz: number;
      sample: Awaited<ReturnType<typeof import('./presentation-events.ts').eventReplay>>;
      files: string[];
    }[] = [];
    for (const quality of ['low', 'high']) {
      for (const [hz, batches] of [
        [60, [1]],
        [30, [2]],
        [120, [1, 0]],
      ] as const) {
        const { sample, frames } = await page.evaluate(
          async ({ quality, batches }) => {
            const path = '/tests/presentation-events.ts';
            const { eventReplay } = (await import(
              path
            )) as typeof import('./presentation-events.ts');
            const canvas = window.__dungeon.engine.getRenderingCanvas()!;
            const frames: { tick: number; count: number; rgba: string }[] = [];
            const sample = await eventReplay(
              window.__dungeon,
              batches,
              2,
              false,
              quality,
              true,
              (tick, count) => {
                // Capture the submitted framebuffer before WebGL's discard at the end of the task.
                if ([4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24].includes(tick))
                  frames.push({ tick, count, rgba: canvas.toDataURL('image/png') });
              },
            );
            return { sample, frames };
          },
          { quality, batches: [...batches] },
        );
        const oracle = rows.find((row) => row.hz === 60);
        if (oracle) {
          assert.deepEqual(sample.trace, oracle.sample.trace);
          const byTick = new Map(oracle.sample.displays.map((s) => [s.tick, s.meshes]));
          for (const display of sample.displays)
            assert.equal(display.meshes, byTick.get(display.tick));
        }
        assert.equal(frames.length, hz === 120 ? 22 : 11);
        const files = [];
        for (const { tick, count, rgba } of frames) {
          assert.ok(rgba.startsWith('data:image/png;base64,'));
          const png = Buffer.from(rgba.slice('data:image/png;base64,'.length), 'base64');
          assert.ok(png.length > 4000, 'Capture must contain drawn geometry, not an empty canvas');
          const path = `${output}/${quality}-${hz}hz-${tick}${count ? '' : '-zero'}.png`;
          await writeFile(path, png);
          files.push(path);
        }
        rows.push({ quality, hz, sample, files });
      }
    }
    assert.deepEqual(errors, []);
    await writeFile(`${output}/report.json`, JSON.stringify({ renderer, rows }));
    console.log(
      'PASS CPU6b cadence: six hardware sequences, matched tick matrices and 88 framebuffer samples',
    );
  } finally {
    clearTimeout(deadline);
    await browser.close();
  }
});
