import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { withViteServer } from './testServer.ts';
import type { DebugWindow } from './browserTypes.ts';
declare const window: DebugWindow;

const base = process.env.DEMO_URL ?? 'http://127.0.0.1:5173';
await withViteServer(base, 'dev', async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const deadline = setTimeout(() => void browser.close(), 180000);
  try {
    await mkdir('test-results', { recursive: true });
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/?debug&seed=MOURNING-731`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
    const result = await page.evaluate(() => {
      const d = window.__dungeon,
        g = d.game;
      d.animation.pause();
      d.engine.stopRenderLoop();
      const original = g.combat.update;
      const nav = g.player.actor.navigator,
        goTo = nav.goTo;
      const door = g.world.entities.find((e) => e.type === 'door')!;
      const descriptor = Object.getOwnPropertyDescriptor(door, 'open')!;
      const initial = d.cpu.state();
      d.cpu.start('detailed');
      let nested = false,
        badFrame = false,
        thrown = false;
      try {
        d.cpu.start('coarse');
      } catch {
        nested = true;
      }
      try {
        d.cpu.frame([], 5);
      } catch {
        badFrame = true;
      }
      try {
        d.cpu.frame([], 0, false, () => {
          throw new Error('deliberate probe');
        });
      } catch {
        thrown = true;
      }
      d.cpu.stop();
      const restored =
        g.combat.update === original &&
        nav.goTo === goTo &&
        Object.getOwnPropertyDescriptor(door, 'open')?.get === descriptor.get;
      const unchanged = d.cpu.state().authority === initial.authority;
      d.cpu.start('coarse');
      d.cpu.frame([], 0);
      const empty = d.cpu.report().samples[0].counts.ticks === 0;
      d.cpu.stop();
      d.cpu.start('detailed');
      d.cpu.frame([], 1);
      const observed = d.cpu.report().samples[0];
      d.regenerate('MOURNING-731');
      return {
        nested,
        badFrame,
        thrown,
        restored,
        unchanged,
        empty,
        observed,
        retired: !d.cpu.active && g.combat.update === original && nav.goTo === goTo,
      };
    });
    await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
    const live = await page.evaluate(async () => {
      const d = window.__dungeon,
        g = d.game;
      d.engine.stopRenderLoop();
      d.animation.play();
      const step = g.steps;
      d.cpu.start('coarse');
      await d.cpu.live(4);
      const samples = d.cpu.report().samples;
      d.cpu.stop();
      d.animation.pause();
      const restored = d.engine.activeRenderLoops.length === 0;
      d.cpu.start('detailed');
      const pending = d.cpu.live(12);
      d.cpu.stop();
      let cancelled = false;
      try {
        await pending;
      } catch {
        cancelled = true;
      }
      const escape = () =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
      escape();
      d.cpu.start('off');
      d.cpu.frame([], 3);
      const paused = d.cpu.report().samples[0];
      d.cpu.stop();
      escape();
      return { samples, steps: g.steps - step, restored, cancelled, paused };
    });
    assert.equal(live.samples.length, 4);
    assert.equal(
      live.samples.reduce((sum, s) => sum + s.counts.ticks, 0),
      live.steps,
    );
    assert.ok(live.samples.some((s) => s.counts.ticks > 0));
    assert.ok(live.restored && live.cancelled);
    assert.equal(live.paused.counts.ticks, 0);
    assert.equal(live.paused.counts.requestedTicks, 3);
    for (const key of [
      'nested',
      'badFrame',
      'thrown',
      'restored',
      'unchanged',
      'empty',
      'retired',
    ] as const)
      assert.ok(result[key], key);
    assert.equal(result.observed.counts.ticks, 1);
    assert.ok(result.observed.counts['calls.grounding'] > 0);
    assert.ok(result.observed.counts['doors.open'] > 0);
    const resources = [];
    for (let i = 0; i < 3; i++) {
      resources.push(
        await page.evaluate(() => {
          const d = window.__dungeon;
          d.cpu.start('detailed');
          d.cpu.frame([], 1);
          d.cpu.stop();
          return d.cpu.state().resources;
        }),
      );
      if (i < 2) {
        await page.evaluate(() => window.__dungeon.regenerate('MOURNING-731'));
        await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
      }
    }
    assert.deepEqual(resources[0], resources[1]);
    assert.deepEqual(resources[1], resources[2]);
    assert.deepEqual(errors, []);
    await writeFile(
      'test-results/cpu0-lifecycle.json',
      JSON.stringify({ result, live, resources, errors }, null, 2),
    );
    console.log(
      'PASS CPU0: bounded sessions, zero-time/exception cleanup, exact restoration, retirement and regeneration plateau',
    );
  } finally {
    clearTimeout(deadline);
    await browser.close();
  }
});
