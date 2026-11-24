import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { generateDungeonWithReport } from '../src/world.ts';
import { createGenerationReport } from '../src/generation/report.ts';
import type { GenerationReport } from '../src/generation/report.ts';
import { GENERATION_CORPUS_SEEDS, selectGallerySeeds } from '../src/generation/corpus.ts';
import {
  assertGenerationReportsMatch,
  createCapturePlan,
  galleryHtml,
  galleryResources,
} from './generationGallery.ts';
import type { DebugWindow } from './browserTypes.ts';
import type { Snapshot } from '../src/gameTypes.ts';

declare const window: DebugWindow;

const reports = GENERATION_CORPUS_SEEDS.map((seed) => {
  const { world, report } = generateDungeonWithReport(seed);
  return createGenerationReport(world, report);
});
const plan = createCapturePlan(selectGallerySeeds(reports));
const directory = 'test-results/generation-gallery';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors: string[] = [];
const results: {
  seed: string;
  generation: GenerationReport;
  captures: { file: string; resources: ReturnType<typeof galleryResources> }[];
}[] = [];
const stability: Pick<
  Snapshot,
  'meshes' | 'materials' | 'textures' | 'effects' | 'shaderSources'
>[] = [];
let success = false;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(90000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready);
  // All later regenerations/captures use explicit steps. Shader warm-up cannot advance AI.
  await page.evaluate(() => window.__dungeon.engine.stopRenderLoop());
  async function regenerate(seed: string) {
    await page.evaluate((seed) => window.__dungeon.regenerate(seed), seed);
    await page.waitForFunction((seed) => {
      const d = window.__dungeon;
      d.game.scene.render();
      return d.ready && d.game.world.seed === seed;
    }, seed);
    assert.equal(await page.evaluate(() => window.__dungeon.game.steps), 0);
  }
  for (const entry of plan) {
    await regenerate(entry.seed);
    const generation = await page.evaluate(() => window.__dungeon.generationReport());
    const expected = reports.find((r) => r.trace.identity.seed === entry.seed);
    assert.ok(expected);
    assertGenerationReportsMatch(generation, expected);
    if (entry.seed === process.env.GENERATION_TRACE_SEED) {
      try {
        const execution = await page.evaluate(() => window.__dungeon.generationExecution());
        const run = execution.runs.at(-1);
        if (run?.seed === entry.seed) {
          await writeFile(
            `${directory}/execution.json`,
            JSON.stringify({ ...execution, runs: [run] }) + '\n',
          );
        }
      } catch {
        console.warn('Local gallery execution export failed');
      }
    }
    const captures: { file: string; resources: ReturnType<typeof galleryResources> }[] = [];
    for (const capture of entry.captures) {
      await page.evaluate((room) => {
        const d = window.__dungeon,
          g = d.game;
        const position = g.world.roomById[room];
        d.teleport(position.x, position.z);
        g.player.actor.health.invulnerable = 1000;
        g.camera.alpha = g.desiredAlpha = -Math.PI / 4;
        g.camera.beta = 0.64;
        g.camera.radius = g.desiredRadius = 40;
        g.nearLights = [];
        d.step([], 1);
        // Settle the production cutaway/camera/lighting path without advancing simulation.
        for (let frame = 0; frame < 120; frame++) d.step([], 0);
        g.scene.render();
      }, capture.room);
      await page.waitForFunction(() => {
        window.__dungeon.game.scene.render();
        return window.__dungeon.game.scene.isReady();
      });
      await page.screenshot({
        path: `${directory}/${capture.file}`,
        style: 'body > :not(#game) { visibility: hidden !important; }',
      });
      captures.push({
        file: capture.file,
        resources: galleryResources(await page.evaluate(() => window.__dungeon.snapshot())),
      });
    }
    assert.equal(await page.evaluate(() => window.__dungeon.game.steps), 4);
    results.push({ seed: entry.seed, generation, captures });
    console.log(`PASS gallery ${entry.seed}: four fixed-camera views`);
  }
  // Same-seed disposal/rebuild counts must settle without accumulating GPU resources.
  for (let i = 0; i < 5; i++) {
    await regenerate('MOURNING-731');
    const snapshot = await page.evaluate(() => window.__dungeon.snapshot());
    stability.push({
      meshes: snapshot.meshes,
      materials: snapshot.materials,
      textures: snapshot.textures,
      effects: snapshot.effects,
      shaderSources: snapshot.shaderSources,
    });
  }
  for (const sample of stability.slice(1)) assert.deepEqual(sample, stability[0]);
  assert.deepEqual(errors, []);
  await writeFile(`${directory}/index.html`, galleryHtml(plan));
  const overview = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await overview.goto(pathToFileURL(resolve(directory, 'index.html')).href);
  // Eager image loading makes the full-page overview independent of scroll position.
  await overview.evaluate(async () => {
    for (const image of document.images) image.loading = 'eager';
    await Promise.all([...document.images].map((image) => image.decode()));
  });
  await overview.screenshot({ path: `${directory}/overview.png`, fullPage: true });
  await overview.locator('#grayscale').check();
  await overview.screenshot({ path: `${directory}/overview-grayscale.png`, fullPage: true });
  success = true;
  console.log(
    'PASS 48 captures, Node/browser report agreement, five stable regenerations, color/grayscale overview',
  );
} finally {
  try {
    await writeFile(
      `${directory}/report.json`,
      JSON.stringify(
        {
          schemaVersion: 1,
          success,
          browser: browser.version(),
          renderer: 'Chromium SwiftShader (software)',
          viewport: { width: 1280, height: 800 },
          camera: { alpha: -Math.PI / 4, beta: 0.64, radius: 40 },
          quality: 'high',
          seeds: results,
          stability,
          errors,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await browser.close();
  }
}
