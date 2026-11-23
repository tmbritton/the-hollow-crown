/** Untimed evidence collector; DEMO_URL must identify a known checkout. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import type { DebugWindow } from './browserTypes.ts';

declare const window: DebugWindow;
const base = process.env.DEMO_URL;
const label = process.env.CPU_LABEL ?? 'current';
assert.ok(base, 'Supply DEMO_URL for the checkout being observed');
assert.match(label, /^[a-zA-Z0-9_-]{1,30}$/);
const artifact = (suffix: string) => `test-results/cpu7/${label}-${suffix}`;
await mkdir('test-results/cpu7', { recursive: true });
const hardware = process.env.CPU_GPU === 'hardware';
const browser = await chromium.launch({
  headless: !hardware,
  args: hardware
    ? ['--no-sandbox', '--ignore-gpu-blocklist']
    : ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const deadline = setTimeout(() => void browser.close(), 300000);
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/?debug&seed=MOURNING-731`, { waitUntil: 'commit' });
  const ready = () => page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  await ready();
  const cycles = [];
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => {
      const d = window.__dungeon;
      d.animation.pause();
      d.engine.stopRenderLoop();
    });
    cycles.push(
      await page.evaluate(() => {
        const d = window.__dungeon;
        const g = d.game;
        const dimensions = {} as Record<string, number[]>;
        const quality = document.querySelector<HTMLSelectElement>('#quality')!;
        for (const level of ['low', 'high', 'low']) {
          quality.value = level;
          quality.dispatchEvent(new Event('change'));
          dimensions[level] = [d.engine.getRenderWidth(), d.engine.getRenderHeight()];
        }
        for (let step = 0; step < 120; step++) d.step([], 1);
        g.scene.render();
        const targets = new Set([
          ...g.scene.customRenderTargets,
          ...g.scene.textures.filter((t) => t.isRenderTarget),
        ]).size;
        const resources = { ...d.cpu.state().resources, targets, scenes: d.engine.scenes.length };
        const old = g.scene;
        let disposed = false;
        old.onDisposeObservable.addOnce(() => {
          disposed = true;
        });
        d.cpu.start('off');
        const started = performance.now();
        d.regenerate('MOURNING-731');
        return {
          resources,
          oldSceneDisposed: disposed && old.isDisposed && !d.engine.scenes.includes(old),
          observerRetired: !d.cpu.active,
          transitionMs: performance.now() - started,
          dimensions,
          dpr: devicePixelRatio,
          renderer: d.engine.getGlInfo(),
        };
      }),
    );
    await ready();
  }

  const inspection = await page.evaluate(() => {
    const d = window.__dungeon;
    const g = d.game;
    d.animation.pause();
    d.engine.stopRenderLoop();
    const portrait = g.world.entities.find((e) => e.type === 'portrait');
    if (portrait?.type !== 'portrait' || !portrait.inspection) throw new Error('Missing portrait');
    d.teleport(portrait.approach.x, portrait.approach.z);
    for (let i = 0; i < 36; i++) d.step([], 1);
    const camera = () => ({
      alpha: g.camera.alpha,
      beta: g.camera.beta,
      radius: g.camera.radius,
      fov: g.camera.fov,
      minZ: g.camera.minZ,
      target: g.camera.target.asArray(),
    });
    g.inspection.open(portrait.inspection);
    const saved = g.inspection.saved;
    if (!saved) throw new Error('Missing inspection camera snapshot');
    const before = { ...saved, target: saved.target.asArray() };
    for (let i = 0; i < 36; i++) d.step([], 1);
    const during = {
      camera: camera(),
      state: g.inspection.state,
      playTime: g.playTime,
      steps: g.steps,
    };
    for (let i = 0; i < 12; i++) d.step(['KeyW', 'KeyQ'], 1);
    const held = {
      camera: camera(),
      state: g.inspection.state,
      playTime: g.playTime,
      steps: g.steps,
    };
    g.scene.render();
    const png = d.engine.getRenderingCanvas()!.toDataURL().split(',')[1]!;
    g.inspection.close();
    for (let i = 0; i < 36 && g.inspection.active; i++) d.step([], 1);
    return { before, during, held, after: camera(), finalState: g.inspection.state, png };
  });
  const { png, ...cameraEvidence } = inspection;
  await writeFile(artifact('inspection.png'), Buffer.from(png, 'base64'));

  const checkpoints = {
    entrance: [0, 239],
    stable: [0, 239],
    hitch: [0, 299],
    movement: [0, 89, 149, 239],
    doorway: [0, 60, 239],
    phalanx: [0, 89, 179, 359],
    shield: [4, 6, 31, 179],
    cargo: [0, 31, 91, 179],
    ragdoll: [0, 12, 499],
    bones: [0, 12, 499],
    burst: [0, 12, 499],
    settled: [0, 75, 179],
  };
  const scenarios = [];
  for (const [name, frames] of Object.entries(checkpoints)) {
    await page.evaluate(() => window.__dungeon.regenerate('MOURNING-731'));
    await ready();
    const result = await page.evaluate(
      async ({ name, frames }) => {
        const path = '/tests/cpu-workloads.ts';
        const { cpuCases, cpuWorkload } = (await import(
          path
        )) as typeof import('./cpu-workloads.ts');
        const selected = cpuCases.find((candidate) => candidate === name)!;
        const d = window.__dungeon;
        const g = d.game;
        d.animation.pause();
        d.engine.stopRenderLoop();
        const workload = cpuWorkload(d, selected);
        const samples = [];
        const state = () => ({
          steps: g.steps,
          time: g.time,
          camera: [g.camera.alpha, g.camera.beta, g.camera.radius, ...g.camera.target.asArray()],
          doors: g.world.entities.flatMap((e) =>
            e.type === 'door' ? [[e.id, e.open, e.locked, e.angle]] : [],
          ),
          actors: d.cpu.state(),
          cargo: g.ecs
            .query('cargo')
            .map((e) => [e.id, e.require('cargo').state, e.require('cargo').owner?.id]),
          poses: g.combat.actors
            .filter((a) => a.entity.require('rig').root.isEnabled())
            .map((a) => {
              const b = a.entity.require('rigPose');
              return {
                id: a.id,
                mode: b.actions.mode,
                shield: b.actions.shield.snapshot(),
                world: Array.from(b.pose.world),
              };
            }),
        });
        for (let step = 0; step < workload.warmup; step++) d.step([], 1);
        g.scene.render();
        g.scene.render();
        const initial = state();
        d.cpu.start('off');
        try {
          for (let i = 0; i < workload.frames; i++) {
            d.cpu.frame(workload.keys(i), workload.ticks(i), false, () => workload.event(i));
            if (frames.includes(i)) {
              g.scene.render();
              samples.push({
                i,
                state: state(),
                png: d.engine.getRenderingCanvas()!.toDataURL().split(',')[1]!,
              });
            }
          }
          workload.validate();
          return { name, initial, samples, evidence: workload.evidence(), final: state() };
        } finally {
          d.cpu.stop();
        }
      },
      { name, frames },
    );
    const samples = [];
    for (const { i, state, png } of result.samples) {
      const capture = artifact(`${name}-${i}.png`);
      await writeFile(capture, Buffer.from(png, 'base64'));
      samples.push({ i, state, capture });
    }
    scenarios.push({ ...result, samples });
  }
  await writeFile(
    artifact('witnesses.json'),
    JSON.stringify({ base, cycles, inspection: cameraEvidence, scenarios, errors }, null, 2),
  );
  assert.deepEqual(errors, []);
  assert.equal(inspection.during.state, 'viewing');
  assert.deepEqual(inspection.held, inspection.during);
  assert.equal(inspection.finalState, 'idle');
  for (const key of ['alpha', 'beta', 'radius', 'fov', 'minZ'] as const)
    assert.ok(Math.abs(inspection.after[key] - inspection.before[key]) < 1e-6, key);
  assert.deepEqual(inspection.after.target, inspection.before.target);
  for (const cycle of cycles) {
    assert.ok(cycle.oldSceneDisposed && cycle.observerRetired);
    assert.deepEqual(cycle.resources, cycles[0]!.resources);
  }
  console.log(`PASS ${label}: three post-warmup resource samples plus untimed scenario witnesses`);
} finally {
  clearTimeout(deadline);
  await browser.close();
}
