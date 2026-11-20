import { chromium, firefox } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { DebugWindow } from './browserTypes.ts';

declare const window: DebugWindow;
const name = process.env.BROWSER || 'chromium';
const label = process.env.PROBE_LABEL || 'current';
assert.match(label, /^[a-z-]+$/);
const browser = await (name === 'firefox' ? firefox : chromium).launch({
  headless: true,
  ...(name === 'chromium'
    ? { args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
await mkdir('test-results', { recursive: true });
try {
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  const result = await page.evaluate(() => {
    const d = window.__dungeon,
      g = d.game;
    d.engine.stopRenderLoop();
    for (const actor of g.combat.enemies) {
      actor.entity.remove('brain');
      actor.navigator.cancel();
      actor.attack.reset();
      actor.health.invulnerable = 1e9;
    }
    const target = g.combat.enemies.find((actor) => actor.kind === 'goblin')!;
    Object.assign(target.position, { x: 1.4, z: 0, h: 0 });
    d.teleport(0, 0);
    g.player.actor.health.invulnerable = 1e9;
    g.camera.alpha = g.desiredAlpha = -Math.PI / 4;
    g.camera.beta = 0.64;
    g.camera.radius = g.desiredRadius = 27;
    g.combat.target(g.player.actor, target);
    const actual = g.observation.visible.bind(g.observation);
    for (let i = 0; i < 100; i++) d.step([], 1);
    if (!actual(target.entity.require('render')))
      throw new Error('CPU control fixture must be visible');
    const samples = [];
    try {
      for (const mode of ['actual-A', 'control-B', 'actual-A2']) {
        let observationMs = 0;
        g.observation.visible =
          mode === 'control-B'
            ? () => true
            : (render) => {
                const start = performance.now();
                const visible = actual(render);
                observationMs += performance.now() - start;
                return visible;
              };
        for (let i = 0; i < 100; i++) d.step([], 1);
        observationMs = 0;
        const timings: number[] = [];
        for (let i = 0; i < 400; i++) {
          const start = performance.now();
          d.step([], 1);
          timings.push(performance.now() - start);
        }
        const sorted = [...timings].sort((a, b) => a - b);
        samples.push({
          mode,
          meanMs: timings.reduce((a, b) => a + b, 0) / timings.length,
          observationMs: observationMs / timings.length,
          p95Ms: sorted[Math.floor(sorted.length * 0.95)],
        });
      }
    } finally {
      g.observation.visible = actual;
    }
    let matrixCalls = 0,
      forcedMatrices = 0,
      thinBoundRefreshes = 0,
      thinInstanceCandidates = 0;
    const candidateMeshes = new Set<string>();
    const restore: (() => void)[] = [];
    const pick = g.scene.pickWithRay;
    g.scene.pickWithRay = function (ray, predicate, ...rest) {
      return pick.call(
        this,
        ray,
        (mesh, index) => {
          if (index >= 0) thinInstanceCandidates++;
          const accepted = predicate ? predicate(mesh, index) : mesh.isPickable;
          if (accepted) candidateMeshes.add(mesh.name);
          return accepted;
        },
        ...rest,
      );
    };
    restore.push(() => {
      g.scene.pickWithRay = pick;
    });
    for (const node of [...g.scene.meshes, ...g.scene.transformNodes]) {
      const compute = node.computeWorldMatrix;
      node.computeWorldMatrix = function (...args) {
        matrixCalls++;
        if (args[0]) forcedMatrices++;
        return compute.apply(this, args);
      };
      restore.push(() => {
        node.computeWorldMatrix = compute;
      });
    }
    for (const mesh of g.scene.meshes) {
      if (!('thinInstanceRefreshBoundingInfo' in mesh)) continue;
      const instanceMesh = mesh as Mesh;
      const refresh = instanceMesh.thinInstanceRefreshBoundingInfo;
      instanceMesh.thinInstanceRefreshBoundingInfo = function (...args) {
        thinBoundRefreshes++;
        return refresh.apply(this, args);
      };
      restore.push(() => {
        instanceMesh.thinInstanceRefreshBoundingInfo = refresh;
      });
    }
    let visible: boolean;
    let stepQuery = { matrixCalls: 0, forcedMatrices: 0, thinBoundRefreshes: 0 };
    try {
      visible = actual(target.entity.require('render'));
      const warmQuery = { matrixCalls, forcedMatrices, thinBoundRefreshes, thinInstanceCandidates };
      g.observation.visible = (render) => {
        const before = { matrixCalls, forcedMatrices, thinBoundRefreshes };
        const visible = actual(render);
        stepQuery = {
          matrixCalls: matrixCalls - before.matrixCalls,
          forcedMatrices: forcedMatrices - before.forcedMatrices,
          thinBoundRefreshes: thinBoundRefreshes - before.thinBoundRefreshes,
        };
        return visible;
      };
      d.step([], 1);
      g.observation.visible = actual;
      ({ matrixCalls, forcedMatrices, thinBoundRefreshes, thinInstanceCandidates } = warmQuery);
    } finally {
      for (const callback of restore) callback();
    }
    return {
      seed: g.world.seed,
      meshes: g.scene.meshes.length,
      enabledRigs: g.ecs.query('rig').filter((e) => e.require('rig').root.isEnabled()).length,
      warmup: 100,
      measuredSteps: 400,
      samples,
      query: {
        visible,
        matrixCalls,
        forcedMatrices,
        thinBoundRefreshes,
        thinInstanceCandidates,
        candidateMeshes: [...candidateMeshes],
      },
      stepQuery,
    };
  });
  await writeFile(
    `test-results/${name}-observation-cpu-${label}.json`,
    JSON.stringify({ browser: name, ...result, errors }, null, 2),
  );
  console.log(JSON.stringify({ browser: name, ...result }, null, 2));
  if (process.env.CPU_TRACE && name === 'chromium') {
    const session = await page.context().newCDPSession(page);
    await session.send('Profiler.enable');
    await session.send('Profiler.start');
    await page.evaluate(() => {
      for (let i = 0; i < 800; i++) window.__dungeon.step([], 1);
    });
    const { profile } = await session.send('Profiler.stop');
    const hits = new Map<string, number>();
    for (const node of profile.nodes) {
      const key = `${node.callFrame.functionName} ${node.callFrame.url}:${node.callFrame.lineNumber}`;
      hits.set(key, (hits.get(key) ?? 0) + (node.hitCount ?? 0));
    }
    console.log([...hits].sort((a, b) => b[1] - a[1]).slice(0, 25));
    await session.detach();
  }
  assert.deepEqual(errors, []);
  assert.ok(result.query.visible);
  assert.equal(result.enabledRigs, 25);
  assert.ok(
    result.query.matrixCalls < 100,
    'warm visible-target query must not prepare the whole scene',
  );
  assert.equal(
    result.query.thinBoundRefreshes,
    0,
    'query must not regenerate unchanged instance bounds',
  );
  assert.ok(
    result.stepQuery.matrixCalls <= 64,
    'animated query must not prepare distant creature hierarchies',
  );
  assert.equal(result.stepQuery.forcedMatrices, 0);
  assert.equal(result.stepQuery.thinBoundRefreshes, 0);
} finally {
  await browser.close();
}
