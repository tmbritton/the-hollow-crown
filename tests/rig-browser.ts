import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { DebugWindow } from './browserTypes.ts';
import type { createReviewStage } from './animation-review-fixture.ts';

declare const window: DebugWindow & {
  rigReview: ReturnType<typeof createReviewStage>;
  rigClip: ReturnType<ReturnType<typeof createReviewStage>['fixture']>;
  rigIdentityCheck?: () => void;
};
const record = (value: unknown): Record<string, unknown> => {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
};
const baseline = new Map<string, { frame: number; pose: unknown }[]>();
if (process.env.A0_POSE_REPORT) {
  const report: unknown = JSON.parse(await readFile(process.env.A0_POSE_REPORT, 'utf8'));
  const sequences = record(report).sequences;
  assert.ok(Array.isArray(sequences));
  for (const value of sequences) {
    const sequence = record(value);
    if (sequence.view !== 'side') continue;
    assert.equal(typeof sequence.name, 'string');
    assert.ok(Array.isArray(sequence.frames));
    baseline.set(
      String(sequence.name),
      sequence.frames.map((f: unknown) => {
        const frame = record(f);
        assert.equal(typeof frame.frame, 'number');
        return { frame: Number(frame.frame), pose: frame.pose };
      }),
    );
  }
  assert.equal(baseline.size, 30, 'A0 comparison requires the complete catalog');
}
let maximumDifference = 0;
function compare(actual: unknown, expected: unknown, path: string): void {
  if (typeof expected === 'number') {
    assert.equal(typeof actual, 'number', path);
    const difference = Math.abs(Number(actual) - expected);
    maximumDifference = Math.max(maximumDifference, difference);
    assert.ok(difference < 1e-5, `${path}: ${actual} != ${expected}`);
  } else if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), path);
    assert.equal(actual.length, expected.length, path);
    expected.forEach((value, i) => compare(actual[i], value, `${path}[${i}]`));
  } else if (expected && typeof expected === 'object') {
    const a = record(actual);
    for (const [key, value] of Object.entries(expected)) compare(a[key], value, `${path}.${key}`);
  } else assert.equal(actual, expected, path);
}

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const deadline = setTimeout(() => void browser.close().catch(() => {}), 240000);
const errors: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
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
  const catalog = await page.evaluate(async () => {
    const path = '/tests/animation-review-fixture.ts';
    const { createReviewStage, reviewCatalog } = (await import(
      path
    )) as typeof import('./animation-review-fixture.ts');
    const g = window.__dungeon.game;
    if (g.ecs.query('rigPose').length !== 25)
      throw new Error('Every actor requires its own pose buffer');
    const kobolds = g.combat.enemies.filter((a) => a.kind === 'kobold');
    if (
      !kobolds.every(
        (a) =>
          a.entity.require('rigPose').pose.definition ===
          kobolds[0].entity.require('rigPose').pose.definition,
      )
    )
      throw new Error('Equipment roles must share anatomical definition');
    window.rigReview = createReviewStage(g);
    const meshes = g.scene.meshes.map((node) => ({
      node,
      parent: node.parent,
      material: node.material,
      pickable: node.isPickable,
      vertices: node.getTotalVertices(),
    }));
    const shadows = [...(g.shadowMap.renderList ?? [])];
    const renders = g.combat.actors.map((a) => ({
      entity: a.entity,
      render: a.entity.require('render'),
      root: a.entity.require('render').root,
      meshes: a.entity.require('render').meshes,
    }));
    const selection = g.combat.enemies.map((a) => ({
      id: a.id,
      mesh: g.scene.getMeshByName(`${a.id}:selection`),
    }));
    window.rigIdentityCheck = () => {
      for (const saved of meshes)
        if (
          saved.node.isDisposed() ||
          !g.scene.meshes.includes(saved.node) ||
          saved.node.parent !== saved.parent ||
          saved.node.material !== saved.material ||
          saved.node.isPickable !== saved.pickable ||
          saved.node.getTotalVertices() !== saved.vertices
        )
          throw new Error(`Mesh/material/parent identity changed: ${saved.node.name}`);
      const current = g.shadowMap.renderList ?? [];
      if (current.length !== shadows.length || current.some((m, i) => m !== shadows[i]))
        throw new Error('Shadow registrations changed');
      for (const saved of renders)
        if (
          saved.entity.require('render') !== saved.render ||
          saved.render.root !== saved.root ||
          saved.render.meshes !== saved.meshes
        )
          throw new Error('Observation surfaces changed identity');
      for (const saved of selection)
        if (g.scene.getMeshByName(`${saved.id}:selection`) !== saved.mesh)
          throw new Error('Selection proxy changed identity');
    };
    return reviewCatalog;
  });
  const resources = await page.evaluate(() => window.__dungeon.animation.resources());
  const boundaries = await page.evaluate(async () => {
    const path = '/src/player.ts';
    const { movePlayer } = (await import(path)) as typeof import('../src/player.ts');
    window.rigReview.fixture('player', 'travel');
    const g = window.__dungeon.game,
      a = g.player.actor;
    const tiles = new Map(g.world.tiles);
    for (const x of [0, 1]) {
      const tile = tiles.get(`${x},0`)!;
      tiles.set(`${x},0`, { ...tile, surface: x ? 'lava' : 'stone' });
    }
    const world = { ...g.world, tiles };
    g.camera.alpha = -Math.PI / 2;
    return [1, -1].map((direction) => {
      Object.assign(a.position, { x: direction > 0 ? 0.49 : 0.51, z: 0, h: 0 });
      g.player.root.position.set(a.position.x, 0, 0);
      a.motion.speed = 4.8;
      const tile = movePlayer(
        g.player,
        world,
        new Set([direction > 0 ? 'KeyD' : 'KeyA']),
        g.camera,
        1 / 60,
      );
      return { direction, x: a.position.x, surface: tile?.surface };
    });
  });
  assert.ok(boundaries[0].x > 0.5 && boundaries[1].x < 0.5);
  assert.deepEqual(
    boundaries.map((b) => b.surface),
    ['lava', 'stone'],
    'terrain follows current motor position before rig application',
  );
  let samples = 0,
    maximumJointError = 0;
  const frames = [];
  for (const item of catalog) {
    const name = `${item.profile}/${item.clip}`;
    await page.evaluate((item) => {
      window.rigClip = window.rigReview.fixture(item.profile, item.clip);
    }, item);
    for (let frame = 6; frame <= (item.clip === 'opening' ? 132 : 84); frame += 6) {
      const result = await page.evaluate(async () => {
        window.rigClip.advance(6);
        const d = window.__dungeon,
          actor = d.game.combat.actor(window.rigClip.id)!;
        const rig = actor.entity.require('rig'),
          binding = actor.entity.require('rigPose');
        const path = '/src/rigs/pose.ts';
        const { worldPoint } = (await import(path)) as typeof import('../src/rigs/pose.ts');
        const snapshot = d.animation.sample(actor.id);
        let error = 0;
        for (const [i, side] of (['left', 'right'] as const).entries()) {
          for (const [name, node] of [
            [`${side}UpperArm`, rig.arms[i]],
            [`${side}Forearm`, rig.forearms[i]],
            [`${side}Thigh`, rig.legs[i]],
            [`${side}Shin`, rig.knees[i]],
            [`${side}Foot`, rig.feet[i]],
          ] as const) {
            node.computeWorldMatrix(true);
            const expected = worldPoint(binding.pose, name),
              actual = node.getAbsolutePosition();
            error = Math.max(
              error,
              Math.hypot(actual.x - expected[0], actual.y - expected[1], actual.z - expected[2]),
            );
          }
        }
        return { snapshot, error };
      });
      assert.ok(result.error < 1e-5, `${name}/${frame} joint error ${result.error}`);
      maximumJointError = Math.max(maximumJointError, result.error);
      samples++;
      if (baseline.size)
        compare(
          result.snapshot,
          baseline.get(name)!.find((f) => f.frame === frame)!.pose,
          `${name}/${frame}`,
        );
      frames.push({ name, frame, pose: result.snapshot });
      if (
        frame === 30 &&
        (item.clip === 'travel' || item.clip === 'thrust' || item.clip === 'carry')
      ) {
        await page.evaluate(() => {
          const d = window.__dungeon;
          d.animation.camera('side', window.rigClip.id);
          d.animation.render();
        });
        if (item.clip === 'travel' && item.profile !== 'player')
          assert.ok(
            await page.evaluate(() => {
              const g = window.__dungeon.game;
              return (
                g.enemyRendering.pick(g.camera.getForwardRay(100))?.actor.id === window.rigClip.id
              );
            }),
            'rendered subject remains selectable through its original proxy',
          );
        await page.screenshot({ path: `test-results/rig-${name.replace('/', '-')}.png` });
      }
    }
  }
  const stable = await page.evaluate(() => {
    const d = window.__dungeon;
    const before = d.animation.sample(window.rigClip.id);
    const buffer = d.game.combat.actor(window.rigClip.id)!.entity.require('rigPose');
    const history = [...buffer.pose.previousWorld];
    buffer.apply();
    buffer.apply();
    d.animation.render();
    return {
      before,
      after: d.animation.sample(window.rigClip.id),
      history,
      afterHistory: [...buffer.pose.previousWorld],
      resources: d.animation.resources(),
    };
  });
  assert.deepEqual(stable.before, stable.after);
  assert.deepEqual(stable.history, stable.afterHistory);
  for (const key of ['meshes', 'nodes', 'materials', 'textures'] as const)
    assert.equal(stable.resources[key], resources[key]);
  const client = await page.context().newCDPSession(page);
  await client.send('HeapProfiler.startSampling', {
    samplingInterval: 32768,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });
  const cost = await page.evaluate(() => window.rigReview.baseline());
  const allocation = await client.send('HeapProfiler.stopSampling');
  const allocated = (node: typeof allocation.profile.head): number =>
    node.selfSize + node.children.reduce((n, child) => n + allocated(child), 0);
  const sampledBytes = allocated(allocation.profile.head);
  await client.detach();
  await page.evaluate(() => {
    window.rigIdentityCheck!();
    delete window.rigIdentityCheck;
  });
  assert.equal(cost.maxTileQueries, 42, 'A1 bridge adds no contact queries');
  const resets = [];
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.__dungeon.regenerate('MOURNING-731'));
    await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
    resets.push(
      await page.evaluate(() => {
        const d = window.__dungeon;
        if (
          !d.game.ecs.query('rigPose').every((e) => {
            const p = e.require('rigPose').pose;
            return p.world.every((v, i) => v === p.previousWorld[i]);
          })
        )
          throw new Error('Fresh pose history must equal current pose');
        return d.animation.resources();
      }),
    );
  }
  assert.deepEqual(resets[0], resources);
  assert.deepEqual(resets[0], resets[1]);
  assert.deepEqual(resets[1], resets[2]);
  assert.deepEqual(errors, []);
  await writeFile(
    'test-results/rig-report.json',
    JSON.stringify(
      {
        samples,
        baselineCompared: baseline.size > 0,
        maximumDifference,
        maximumJointError,
        identityPreserved: true,
        selectionPassed: true,
        boundaries,
        resources,
        cost,
        allocation: {
          sampledBytes,
          interval: 32768,
          includesCollected: true,
          scope:
            'setup/warmup/yields/instrumentation included; not exact allocation count or retained heap',
        },
        resets,
        frames,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS rig binding: ${samples} samples; A0 delta ${maximumDifference}; FK delta ${maximumJointError}; mean/p95 ${cost.meanMs}/${cost.p95Ms}ms`,
  );
} finally {
  clearTimeout(deadline);
  await browser.close();
}
