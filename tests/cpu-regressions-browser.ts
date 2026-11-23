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
    const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/?debug&seed=MOURNING-731`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
    const collision = await page.evaluate(async () => {
      const path = '/tests/collision-replay.ts';
      const { collisionCosts } = (await import(path)) as typeof import('./collision-replay.ts');
      return collisionCosts(window.__dungeon);
    });
    console.log('CPU4 collision costs', JSON.stringify(collision));
    const result = await page.evaluate(async () => {
      const d = window.__dungeon,
        engine = d.engine;
      const application = [...engine.activeRenderLoops];
      engine.stopRenderLoop();
      d.animation.pause();
      d.regenerate('MOURNING-731');
      while (!d.ready) await new Promise((resolve) => setTimeout(resolve, 10));
      d.animation.play();
      const native = [];
      for (const order of ['first', 'second'] as const) {
        let calls = 0,
          observers = 0;
        const app = () => {
          calls++;
          for (const callback of application) callback();
        };
        const observer = () => {
          observers++;
        };
        const previous = order === 'first' ? [app, observer] : [observer, app];
        for (const callback of previous) engine.runRenderLoop(callback);
        const before = d.game.steps;
        d.cpu.start('coarse');
        await d.cpu.live(3);
        const samples = d.cpu.report().samples;
        const restored =
          previous.every((callback, i) => callback === engine.activeRenderLoops[i]) &&
          engine.activeRenderLoops.length === 2;
        engine.stopRenderLoop();
        d.cpu.stop();
        native.push({
          order,
          calls,
          observers,
          samples: samples.length,
          actual: d.game.steps - before,
          reported: samples.reduce((sum, s) => sum + s.counts.ticks, 0),
          restored,
        });
      }
      const interrupted = [];
      for (const mode of ['throw', 'cancel-inside', 'cancel-before'] as const) {
        let first = 0,
          second = 0;
        const a = () => {
          first++;
          if (mode === 'cancel-inside') d.cpu.stop();
        };
        const b = () => {
          second++;
          if (mode === 'throw' && second === 1) throw new Error('CPU callback probe');
        };
        for (const callback of [a, b]) engine.runRenderLoop(callback);
        d.cpu.start('coarse');
        const pending = d.cpu.live(3);
        if (mode === 'cancel-before') d.cpu.stop();
        let rejected = false;
        try {
          await pending;
        } catch {
          rejected = true;
        }
        const restored =
          engine.activeRenderLoops.length === 2 &&
          engine.activeRenderLoops[0] === a &&
          engine.activeRenderLoops[1] === b;
        engine.stopRenderLoop();
        d.cpu.stop();
        interrupted.push({ mode, first, second, rejected, restored });
      }
      const before = d.game.scene.onBeforeActiveMeshesEvaluationObservable;
      const after = d.game.scene.onAfterActiveMeshesEvaluationObservable;
      const count = () => before.observers.filter((o) => !o._willBeUnregistered).length;
      const initial = [...before.observers],
        baseline = count();
      const descriptor = Object.getOwnPropertyDescriptor(after, 'add');
      Object.defineProperty(after, 'add', {
        configurable: true,
        value() {
          throw new Error('CPU observer acquisition probe');
        },
      });
      let rejected = false;
      try {
        d.cpu.start('coarse');
      } catch {
        rejected = true;
      }
      const leaked = count() - baseline;
      if (descriptor) Object.defineProperty(after, 'add', descriptor);
      else Reflect.deleteProperty(after, 'add');
      // Keep a failing test's injected environment isolated from later checks.
      for (const o of before.observers) if (!initial.includes(o)) before.remove(o);
      d.cpu.start('coarse');
      d.cpu.stop();
      const setup = { rejected, leaked, restarted: !d.cpu.active };
      d.regenerate('MOURNING-731');
      while (!d.ready) await new Promise((resolve) => setTimeout(resolve, 10));
      const path = '/tests/cpu-workloads.ts';
      const { cpuWorkload } = (await import(path)) as typeof import('./cpu-workloads.ts');
      const workload = cpuWorkload(d, 'phalanx'),
        g = d.game;
      const group = g.ecs.get('pack:stable')!.require('koboldSquad');
      const phases = new Set<string>(),
        attacks = new Set<string>();
      const positions = group.members.map((m) => ({ ...m.entity.require('transform') }));
      let resolved = 0,
        moved = false;
      d.cpu.start('off');
      for (let frame = 0; frame < workload.frames; frame++) {
        d.cpu.frame(workload.keys(frame), workload.ticks(frame), false, () =>
          workload.event(frame),
        );
        phases.add(group.state);
        group.members.forEach((m, i) => {
          const a = g.combat.actor(m.entity.id)!;
          if (Math.hypot(a.position.x - positions[i].x, a.position.z - positions[i].z) > 0.001)
            moved = true;
          if (a.attack.swing) attacks.add(a.attack.swing.kind);
          resolved += a.attack.swing?.resolved ? 1 : 0;
        });
        if (frame % 12 === 11) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      let valid = true;
      try {
        workload.validate();
      } catch {
        valid = false;
      }
      d.cpu.stop();
      return {
        native,
        interrupted,
        setup,
        phalanx: {
          phases: [...phases],
          attacks: [...attacks],
          resolved,
          moved,
          valid,
          health: g.player.health,
        },
      };
    });
    await writeFile(
      'test-results/cpu0-regressions.json',
      JSON.stringify({ result, errors }, null, 2),
    );
    assert.deepEqual(errors, []);
    for (const row of result.native) {
      assert.equal(row.calls, 3, JSON.stringify(row));
      assert.equal(row.observers, 3, JSON.stringify(row));
      assert.equal(row.actual, row.reported, JSON.stringify(row));
      assert.ok(row.restored);
    }
    for (const row of result.interrupted) {
      assert.equal(row.first, row.mode === 'cancel-before' ? 0 : 1, JSON.stringify(row));
      assert.equal(row.second, row.mode === 'throw' ? 1 : 0, JSON.stringify(row));
      assert.ok(row.rejected && row.restored);
    }
    assert.ok(result.setup.rejected && result.setup.restarted);
    assert.equal(result.setup.leaked, 0);
    assert.ok(result.phalanx.valid && result.phalanx.moved && result.phalanx.resolved > 0);
    for (const phase of ['opening', 'attacking', 'recovering'])
      assert.ok(result.phalanx.phases.includes(phase));
    assert.ok(result.phalanx.attacks.includes('LONG_THRUST'));
    console.log(
      'PASS CPU0 review regressions: exact native callback/tick counts, exceptional rollback and real phalanx opening/thrust/recovery',
    );
  } finally {
    clearTimeout(deadline);
    await browser.close();
  }
});
