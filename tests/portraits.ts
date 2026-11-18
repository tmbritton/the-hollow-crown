import { firefox } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { RoyalPortrait } from '../src/royalty.ts';
import type { DebugWindow } from './browserTypes.ts';

declare const window: DebugWindow;

const browser = await firefox.launch({ headless: true });
await mkdir('test-results', { recursive: true });
const page = await browser.newPage({ viewport: { width: 480, height: 600 } }),
  errors: string[] = [],
  portraits: (RoyalPortrait & { pixelHash: number })[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
try {
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  await page.addStyleTag({ content: 'body > :not(#game){display:none!important}' });
  await page.evaluate(() => {
    const d = window.__dungeon,
      g = d.game;
    d.engine.stopRenderLoop();
    g.scene.shadowsEnabled = false;
    g.glow.isEnabled = false;
    g.scene.fogDensity = 0;
    g.ambient.intensity = 1;
    g.scene.ambientColor.set(0.25, 0.25, 0.25);
    for (const light of g.dungeon.lightPool) light.intensity = 0;
    for (const mesh of g.scene.meshes) mesh.setEnabled(false);
  });
  for (let index = 0; index < 4; index++) {
    const identity = await page.evaluate((index) => {
      const g = window.__dungeon.game;
      for (const mesh of g.scene.meshes) mesh.setEnabled(false);
      const p = g.dungeon.portraits[index],
        e = p.entity;
      p.root.setEnabled(true);
      for (const mesh of p.root.getChildMeshes()) mesh.setEnabled(true);
      g.camera.target.set(e.x, e.h + 1.8, e.z);
      g.camera.alpha = Math.atan2(-p.dz, -p.dx);
      g.camera.beta = Math.PI / 2;
      g.camera.radius = 4.3;
      g.scene.render();
      return e.royal;
    }, index);
    await page.waitForTimeout(250);
    const pixelHash = await page.evaluate(async () => {
      const d = window.__dungeon;
      d.game.scene.render();
      const pixels = new Uint8Array((await d.engine.readPixels(0, 0, 480, 600)).buffer);
      let hash = 2166136261;
      for (let i = 0; i < pixels.length; i++) hash = Math.imul(hash ^ pixels[i], 16777619);
      return hash >>> 0;
    });
    portraits.push({ ...identity, pixelHash });
    await page.screenshot({ path: `test-results/royal-portrait-${index}.png` });
  }
  assert.equal(new Set(portraits.map((p) => p.pixelHash)).size, 4);
  assert.deepEqual(errors, []);
  await writeFile(
    'test-results/portrait-report.json',
    JSON.stringify({ portraits, errors }, null, 2),
  );
  console.log('PASS four distinct GPU-generated royal portraits render with no shader errors');
} finally {
  await browser.close();
}
