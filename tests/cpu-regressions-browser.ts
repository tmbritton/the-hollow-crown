import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { withViteServer } from './testServer.ts';
import type { DebugWindow } from './browserTypes.ts';
import { fingerprint, rendererKind } from '../src/cpuMetrics.ts';
declare const window: DebugWindow;

const base = process.env.DEMO_URL ?? 'http://127.0.0.1:5173';
await withViteServer(base, 'dev', async () => {
  const hardware = process.env.CPU_GPU === 'hardware';
  const browser = await chromium.launch({
    headless: !hardware,
    args: hardware
      ? ['--no-sandbox', '--ignore-gpu-blocklist']
      : ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const deadline = setTimeout(() => void browser.close(), 480000);
  try {
    await mkdir('test-results', { recursive: true });
    const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/?debug&seed=MOURNING-731`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
    if (hardware) {
      const gl = await page.evaluate(() => window.__dungeon.engine.getGlInfo());
      assert.equal(rendererKind(gl.renderer, gl.vendor), 'hardware');
      console.log('CPU6b hardware replay:', gl.renderer);
    }
    const presentation = await page.evaluate(async () => {
      const path = '/tests/presentation-replay.ts';
      const { presentationReplay } = (await import(
        path
      )) as typeof import('./presentation-replay.ts');
      const rows = [];
      for (const [slot, batches] of [
        [1, [0, 1]],
        [2, [2]],
        [3, [4]],
        [4, [0, 1, 3, 0, 4]],
      ] as const) {
        const oracle = await presentationReplay(window.__dungeon, [1], slot);
        const grouped = await presentationReplay(window.__dungeon, [...batches], slot);
        const four =
          batches[0] === 4 ? grouped : await presentationReplay(window.__dungeon, [4], slot);
        rows.push({ slot, oracle, grouped, four });
      }
      return rows;
    });
    await writeFile(
      `test-results/cpu6b-${process.env.CPU_LABEL ?? 'replay'}.json`,
      JSON.stringify(presentation),
    );
    // Recorded from the original CPU6a writer at 96849ae in the same Chromium fixture.
    const cpu6a = [
      ['19c92940', 'b497bfdb'],
      ['bc3381e3', '34881ea2'],
      ['f1618a84', '22180d1d'],
      ['18a50745', '9438c05c'],
    ];
    for (const { slot, oracle, grouped, four } of presentation) {
      assert.deepEqual([fingerprint(oracle.ticks), fingerprint(oracle.meshes)], cpu6a[slot - 1]);
      assert.equal(oracle.accepted, 4);
      assert.deepEqual(oracle.islands, [null, 'separated', 'articulated']);
      assert.equal(oracle.heroHealth, 100);
      for (const candidate of [grouped, four]) {
        assert.equal(candidate.ticks.length, oracle.ticks.length);
        assert.equal(
          candidate.ticks.findIndex((tick, i) => tick !== oracle.ticks[i]),
          -1,
          `fixed-step trace, slot ${slot}: first differing index`,
        );
        assert.deepEqual(candidate.diagnostic, oracle.diagnostic, `physical shapes, slot ${slot}`);
        for (const [tick, sample] of Object.entries(candidate.meshes))
          if (Number(tick) > 0)
            assert.equal(sample, oracle.meshes[Number(tick)], `draw at ${tick}`);
      }
      assert.equal(four.writeCounts[0], 4, 'full-rate binding writes all four poses');
    }
    assert.equal(presentation[0].grouped.writeCounts[0], 0, 'zero ticks do not write a body');
    console.log('PASS CPU6b: CPU6a oracle, four lethal offsets and grouped draw parity');
    const eventRows = await page.evaluate(async () => {
      const path = '/tests/presentation-events.ts';
      const { eventReplay } = (await import(path)) as typeof import('./presentation-events.ts');
      const rows = [];
      for (const [slot, opening] of [
        [1, false],
        [2, false],
        [3, false],
        [4, false],
        [1, true],
      ] as const) {
        const oracle = await eventReplay(window.__dungeon, [1], slot, opening, 'low');
        const grouped = await eventReplay(window.__dungeon, [4, 0], slot, opening, 'low');
        rows.push({ slot, opening, oracle, grouped });
      }
      for (const quality of ['low', 'high']) {
        for (const [hz, batch] of [
          [30, [2]],
          [60, [1]],
          [120, [1, 0]],
        ] as const)
          rows.push({
            hz,
            quality,
            sample: await eventReplay(window.__dungeon, [...batch], 2, false, quality, true),
          });
      }
      return rows;
    });
    await writeFile(
      `test-results/cpu6b-r1-events-${process.env.CPU_LABEL ?? 'current'}.json`,
      JSON.stringify(eventRows),
    );
    for (const row of eventRows) {
      if (!row.oracle) continue;
      const { oracle, grouped, slot, opening } = row;
      assert.deepEqual(
        grouped.trace,
        oracle.trace,
        `tick state at grouped slot ${slot}, opening=${opening}`,
      );
      assert.deepEqual(grouped.diagnostics, oracle.diagnostics);
      assert.ok(grouped.entry.length && grouped.entry.every(Boolean));
      assert.equal(grouped.settled.length, grouped.entry.length);
      assert.deepEqual(grouped.settled, oracle.settled);
      assert.ok(grouped.boxes > 0 && grouped.retired && oracle.retired);
      assert.equal(grouped.final, oracle.final);
      assert.deepEqual(grouped.resources, oracle.resources);
      assert.ok(
        grouped.resources.every(
          ([, settled, bodies, constraints, statics]) =>
            settled && bodies + constraints + statics === 0,
        ),
      );
      assert.deepEqual(grouped.witness, oracle.witness);
      if (opening) assert.equal(grouped.lethal, grouped.openingPose + 1);
      else {
        assert.equal(grouped.lethal, 8 + slot);
        assert.equal(grouped.accepted, 4);
        assert.ok(grouped.reacted && grouped.landing);
        assert.equal(grouped.witness.length, 1);
        assert.ok(
          grouped.witness[0].kind === 'death-witnessed' &&
            grouped.witness[0].killer?.id === 'player',
        );
      }
      const match = new Map(oracle.displays.map((display) => [display.tick, display.meshes]));
      for (const [i, display] of grouped.displays.entries()) {
        assert.equal(display.meshes, match.get(display.tick));
        if (display.count === 0)
          assert.deepEqual(display, { ...grouped.displays[i - 1], count: 0 });
      }
    }
    const cadence = eventRows.find((row) => row.hz === 60 && row.quality === 'low')!.sample!;
    for (const { sample } of eventRows) {
      if (!sample) continue;
      assert.deepEqual(sample.trace, cadence.trace);
      const byTick = new Map(cadence.displays.map((s) => [s.tick, s.meshes]));
      for (const [i, display] of sample.displays.entries()) {
        assert.equal(display.meshes, byTick.get(display.tick));
        if (display.count === 0) assert.deepEqual(display, { ...sample.displays[i - 1], count: 0 });
      }
    }
    console.log(
      'PASS CPU6b: blocked owner lethal offsets, landing/opening, witness/contact/retirement and ordered cadence',
    );
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
