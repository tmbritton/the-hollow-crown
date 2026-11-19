import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { withViteServer } from './testServer.ts';
import type { DebugWindow } from './browserTypes.ts';

declare const window: DebugWindow;
const base = process.env.DEMO_URL || 'http://localhost:5173';

await withViteServer(base, 'dev', async () => {
  await mkdir('test-results', { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    timeout: 15000,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    void browser.close().catch(() => {});
  }, 60000);
  const report: Record<string, unknown> = {
    seed: 'MOURNING-731',
    viewport: '640x360',
    quality: 'low',
  };
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    page.setDefaultTimeout(10000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await page.goto(`${base}/?debug&seed=MOURNING-731`, { timeout: 25000 });
    await page.waitForFunction(() => window.__dungeon?.ready);
    report.renderer = await page.evaluate(() => window.__dungeon.engine.getGlInfo());
    await page.keyboard.press('Escape');
    await page.locator('#quality').selectOption('low');
    await page.keyboard.press('Escape');
    // Vite's first dependency optimization can reload the page (which intentionally randomizes).
    await page.evaluate(() => window.__dungeon.regenerate('MOURNING-731'));
    await page.waitForFunction(() => window.__dungeon.ready);
    assert.equal(await page.evaluate(() => window.__dungeon.game.world.seed), 'MOURNING-731');
    // Real active frames, input, and menu pause, before the controlled/yielding probe.
    const start = await page.evaluate(() => window.__dungeon.game.player.root.position.asArray());
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(300);
    await page.keyboard.up('KeyD');
    assert.notDeepEqual(
      await page.evaluate(() => window.__dungeon.game.player.root.position.asArray()),
      start,
    );
    const sample = async (label: string) => {
      const raw = await cdp.send('Runtime.getHeapUsage');
      await cdp.send('HeapProfiler.collectGarbage');
      const collected = await cdp.send('Runtime.getHeapUsage');
      const dom = await cdp.send('Memory.getDOMCounters');
      const resources = await page.evaluate(() => {
        const d = window.__dungeon,
          g = d.game,
          s = d.snapshot();
        return {
          meshes: s.meshes,
          materials: s.materials,
          textures: s.textures,
          effects: s.effects,
          shaderSources: s.shaderSources,
          scenes: d.engine.scenes.length,
          renderLoops: d.engine.activeRenderLoops.length,
          entities: g.ecs.size,
          particles: g.ecs.query('particle').length,
          projectiles: g.ecs.query('projectile').length,
          workSystems: g.ecs.query('objectiveWork').length,
          steps: g.steps,
        };
      });
      const { metrics } = await cdp.send('Performance.getMetrics');
      return {
        label,
        raw,
        collected,
        dom,
        resources,
        cpu: Object.fromEntries(
          metrics
            .filter((m) => ['TaskDuration', 'ScriptDuration'].includes(m.name))
            .map((m) => [m.name, m.value]),
        ),
      };
    };
    await page.waitForTimeout(500);
    const active = await sample('active');
    await page.keyboard.press('Escape');
    const pausedStart = await sample('pause-start');
    await page.waitForTimeout(1000);
    const pausedEnd = await sample('pause-end');
    assert.equal(pausedStart.resources.steps, pausedEnd.resources.steps);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const resumed = await sample('resumed');
    assert.ok(resumed.resources.steps > pausedEnd.resources.steps);
    report.idle = [active, pausedStart, pausedEnd, resumed];
    await page.evaluate(() => window.__dungeon.engine.stopRenderLoop());

    // Bound synchronous work to 20 seal updates or 12 fixed steps per browser task.
    const costs = [];
    for (let batch = 0; batch < 12; batch++) {
      costs.push(
        await page.evaluate(() => {
          const g = window.__dungeon.game,
            record = g.ecs.get('run')!.require('objectives');
          const get = record.get;
          let reads = 0;
          record.get = function (id) {
            reads++;
            return get.call(this, id);
          };
          try {
            const start = performance.now();
            for (let i = 0; i < 20; i++) g.emberRendering.update();
            return { reads, updates: 20, ms: performance.now() - start };
          } finally {
            record.get = get;
          }
        }),
      );
      await page.waitForTimeout(0);
    }
    report.seals = costs;
    const regenerations = [];
    for (let cycle = 0; cycle < 3; cycle++) {
      const disposal = await page.evaluate(() => {
        const d = window.__dungeon,
          old = d.game;
        d.regenerate('MOURNING-731');
        return {
          sceneDisposed: old.scene.isDisposed,
          workRetired: !old.ecs.get('run')?.has('objectiveWork'),
        };
      });
      assert.deepEqual(disposal, { sceneDisposed: true, workRetired: true });
      await page.waitForFunction(
        () => {
          window.__dungeon.game.scene.render();
          return window.__dungeon.ready;
        },
        undefined,
        { polling: 50 },
      );
      for (let batch = 0; batch < 10; batch++) {
        await page.evaluate(() => {
          const d = window.__dungeon;
          d.step([], 12);
          d.game.scene.render();
        });
        await page.waitForTimeout(0);
      }
      regenerations.push(await sample(`regeneration-${cycle + 1}`));
    }
    report.regenerations = regenerations;
    const first = regenerations[0];
    for (const current of regenerations) {
      assert.equal(current.resources.steps, 120, 'all batched steps run after loading completes');
      assert.deepEqual(
        current.resources,
        first.resources,
        'same-seed render/ECS resources plateau',
      );
      assert.equal(current.resources.scenes, 1);
      assert.equal(current.resources.workSystems, 1);
      assert.ok(current.resources.particles <= 192 && current.resources.projectiles <= 32);
      // GC distinguishes short-lived allocation churn from retained heap. Allow warm JIT/DOM noise,
      // but not another complete world's heap (~tens of MB) on each regeneration.
      assert.ok(
        current.collected.usedSize <= first.collected.usedSize + 8 * 1024 * 1024,
        `retained heap grew: ${JSON.stringify(regenerations)}`,
      );
      assert.ok(current.dom.nodes <= first.dom.nodes + 50);
      assert.ok(current.dom.jsEventListeners <= first.dom.jsEventListeners + 5);
    }
    assert.deepEqual(errors, []);
    assert.ok(
      costs.every((c) => c.reads <= c.updates * 5),
      JSON.stringify(costs),
    );
    report.success = true;
    console.log(
      'PASS bounded software resource probe: input, active/pause/resume, seal reads, GC heap and 3 regenerations',
    );
  } catch (error) {
    report.success = false;
    report.error = String(error);
    throw error;
  } finally {
    clearTimeout(deadline);
    report.timedOut = timedOut;
    try {
      await browser.close();
    } finally {
      await writeFile(
        process.env.RESOURCE_REPORT || 'test-results/resource-report.json',
        JSON.stringify(report, null, 2),
      );
    }
  }
});
