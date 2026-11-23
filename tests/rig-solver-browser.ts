import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { DebugWindow } from './browserTypes.ts';
import type { createSolverReview } from './rig-solver-browser-fixture.ts';
import { rendererKind } from '../src/cpuMetrics.ts';

declare const window: DebugWindow & {
  solverReview: ReturnType<typeof createSolverReview>;
  solverClip: ReturnType<ReturnType<typeof createSolverReview>['fixture']>;
};

const hardware = process.env.CPU_GPU === 'hardware';
const browser = await chromium.launch({
  headless: !hardware,
  args: hardware
    ? ['--ignore-gpu-blocklist']
    : ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const deadline = setTimeout(() => void browser.close().catch(() => {}), 180000);
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } }),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mkdir('test-results', { recursive: true });
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  await page.evaluate(() => {
    const d = window.__dungeon;
    d.animation.pause();
    d.engine.stopRenderLoop();
    d.regenerate('MOURNING-731');
  });
  await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
  if (hardware) {
    const { renderer, vendor } = await page.evaluate(() => window.__dungeon.engine.getGlInfo());
    assert.equal(rendererKind(renderer, vendor), 'hardware');
  }
  await page.addStyleTag({ content: 'body > :not(#game) { visibility: hidden !important; }' });
  const resources = await page.evaluate(async () => {
    const d = window.__dungeon;
    d.animation.pause();
    d.engine.stopRenderLoop();
    const path = '/tests/rig-solver-browser-fixture.ts';
    const { createSolverReview } = (await import(
      path
    )) as typeof import('./rig-solver-browser-fixture.ts');
    const before = d.animation.resources();
    window.solverReview = createSolverReview(d.game);
    return before;
  });
  const sequences = [];
  for (const profile of ['player', 'skeleton', 'goblin', 'shieldbearer', 'spearman'] as const) {
    await page.evaluate((profile) => {
      window.solverClip = window.solverReview.fixture(profile);
    }, profile);
    const frames = [];
    for (const stepping of [false, true]) {
      const measured = await page.evaluate((stepping) => {
        const values = [];
        for (let frame = 0; frame <= 120; frame++)
          values.push(window.solverClip.sample(frame, stepping));
        return values;
      }, stepping);
      for (const value of measured) {
        assert.equal(value.status, 'solved', `${profile}/${stepping}`);
        assert.ok(
          value.maximumFootError <= 0.001 && value.maximumHandError <= 0.01,
          JSON.stringify(value),
        );
        assert.ok(
          value.maximumOrientationError <= Math.PI / 180 && value.minimumCornerClearance >= -0.001,
          JSON.stringify(value),
        );
        assert.ok(value.passes <= 4 && value.limbSolves <= 16 && value.jointEvaluations <= 249);
      }
      for (const frame of [0, 30, 60, 90, 120]) {
        for (const view of ['side', 'gameplay'] as const) {
          await page.evaluate(
            ({ frame, stepping, view }) => {
              window.solverClip.sample(frame, stepping);
              const d = window.__dungeon;
              d.animation.camera(view, window.solverClip.id);
              d.animation.render();
            },
            { frame, stepping, view },
          );
          const name = `solver-${profile}-${stepping ? 'step' : 'support'}-${view}-${frame}.png`;
          await page.screenshot({ path: `test-results/${name}` });
          frames.push({ frame, stepping, view, name });
        }
      }
      // Real-time normal and quarter-speed sequential application, with explicit render calls.
      await page.evaluate(async (stepping) => {
        const d = window.__dungeon;
        d.animation.camera('side', window.solverClip.id);
        for (const rate of [1, 0.25]) {
          for (let frame = 0; frame <= 60; frame += 3) {
            window.solverClip.sample(frame, stepping);
            d.animation.render();
            await new Promise((resolve) => setTimeout(resolve, 50 / rate));
          }
        }
      }, stepping);
      sequences.push({ profile, stepping, measured });
    }
    await page.evaluate(() => {
      window.solverClip.sample(60, true);
      const d = window.__dungeon;
      d.animation.camera(null);
      d.game.camera.alpha = Math.PI / 3;
      d.game.camera.beta = 1.25;
      d.game.camera.radius = 6.5;
      d.game.camera.target.set(0, 0.9, 0);
      d.animation.render();
    });
    await page.screenshot({ path: `test-results/solver-${profile}-front.png` });
    await writeFile(`test-results/solver-${profile}-frames.json`, JSON.stringify(frames, null, 2));
  }
  const stable = await page.evaluate(() => {
    const d = window.__dungeon,
      p = d.game.combat.actor(window.solverClip.id)!.entity.require('rigPose').pose;
    window.solverClip.sample(30, true);
    const before = [...p.world],
      history = [...p.previousWorld],
      position = { ...d.game.combat.actor(window.solverClip.id)!.position };
    window.solverClip.sample(30, true);
    d.animation.render();
    window.solverClip.sample(30, true);
    return {
      before,
      after: [...p.world],
      history,
      afterHistory: [...p.previousWorld],
      position,
      afterPosition: { ...d.game.combat.actor(window.solverClip.id)!.position },
    };
  });
  assert.deepEqual(stable.before, stable.after);
  assert.deepEqual(stable.history, stable.afterHistory);
  assert.deepEqual(stable.position, stable.afterPosition);
  const client = await page.context().newCDPSession(page);
  await client.send('HeapProfiler.startSampling', {
    samplingInterval: 32768,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });
  const cost = await page.evaluate(() => window.solverReview.cost());
  const allocation = await client.send('HeapProfiler.stopSampling');
  const bytes = (node: typeof allocation.profile.head): number =>
    node.selfSize + node.children.reduce((sum, child) => sum + bytes(child), 0);
  const sampledBytes = bytes(allocation.profile.head);
  await client.detach();
  const legacyCost = await page.evaluate(() => window.solverReview.stage.baseline());
  await page.evaluate(() => window.solverReview.dispose());
  assert.deepEqual(await page.evaluate(() => window.__dungeon.animation.resources()), resources);
  const resets = [];
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.__dungeon.regenerate('MOURNING-731'));
    await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
    resets.push(await page.evaluate(() => window.__dungeon.animation.resources()));
    assert.deepEqual(resets[i], resources);
  }
  assert.deepEqual(errors, []);
  const report = {
    samples: sequences.reduce((n, s) => n + s.measured.length, 0),
    sequences,
    cost,
    legacyCost,
    sampledBytes,
    allocationScope:
      'isolated solver workload including setup/targets/yields; statistical sample, not retained heap',
    resources,
    resets,
    errors,
  };
  await writeFile('test-results/rig-solver-report.json', JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({ samples: report.samples, cost, legacyCost, sampledBytes, resources }),
  );
} finally {
  clearTimeout(deadline);
  await browser.close();
}
