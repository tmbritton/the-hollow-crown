import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { DebugWindow } from './browserTypes.ts';
declare const window: DebugWindow;

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const deadline = setTimeout(() => void browser.close(), 360000);
try {
  await mkdir('test-results', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`, {
    waitUntil: 'commit',
  });
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  await page.evaluate(() => {
    window.__dungeon.animation.pause();
    window.__dungeon.engine.stopRenderLoop();
    window.__dungeon.regenerate('MOURNING-731');
  });
  await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
  const report = await page.evaluate(
    async (selected) => {
      const fixturePath = '/tests/animation-review-fixture.ts',
        renderPath = '/src/actorRendering.ts',
        worldPath = '/src/world.ts',
        corpsePath = '/src/corpseRendering.ts';
      const { createReviewStage } = (await import(
        fixturePath
      )) as typeof import('./animation-review-fixture.ts');
      const { animateActors, resetActorRig } = (await import(
        renderPath
      )) as typeof import('../src/actorRendering.ts');
      const { tileAt } = (await import(worldPath)) as typeof import('../src/world.ts');
      const { readCorpseTerrain } = (await import(
        corpsePath
      )) as typeof import('../src/corpseRendering.ts');
      const d = window.__dungeon,
        g = d.game;
      d.animation.pause();
      d.engine.stopRenderLoop();
      const stage = createReviewStage(g),
        rows = [],
        captures: { name: string; image: string }[] = [];
      for (const clip of [
        'travel',
        'melee',
        'moving-melee',
        'jump',
        'stairs-down',
        'wall',
        'hazard',
      ] as const) {
        const f = stage.fixture('skeleton', clip === 'wall' || clip === 'hazard' ? 'travel' : clip);
        const a = g.combat.actor(f.id)!,
          binding = a.entity.require('rigPose');
        f.advance(clip === 'jump' ? 26 : 18);
        if (clip === 'wall') {
          const tile = g.world.tiles.get('9,1')!;
          Object.assign(a.position, { x: tile.x - 0.3, z: tile.z, h: tile.h });
          resetActorRig(a.entity.require('rig'), a.position);
          animateActors(g.ecs, 0, g.time, g.world);
        }
        const meshes = a.entity.require('render').meshes;
        const matrices = () =>
          meshes.map((m) => {
            m.computeWorldMatrix(true);
            return [...m.getWorldMatrix().m];
          });
        const initial = matrices(),
          resources = d.animation.resources();
        const skull = meshes.find((m) => m.name.endsWith(':skull'))!;
        const details = meshes.filter(
          (m) => m.name.endsWith(':jaw') || m.name.endsWith(':eye socket'),
        );
        const center = (m: typeof skull) => {
          m.computeWorldMatrix(true);
          return m.getBoundingInfo().boundingBox.centerWorld;
        };
        const distances = details.map((m) => center(m).subtract(center(skull)).length());
        g.combat.damage(
          a,
          1000,
          undefined,
          clip === 'hazard'
            ? undefined
            : {
                kind: 'melee',
                travel: clip === 'stairs-down' ? { x: 0, z: 1 } : { x: 1, z: 0 },
              },
        );
        animateActors(g.ecs, 0, g.time, g.world);
        const r = a.entity.require('ragdoll');
        if (g.ecs.living.has(a.entity))
          throw new Error('Skeleton remains entered living collision');
        if (selected.length && !selected.includes(clip)) {
          r.freeze();
          continue;
        }
        const entry = Math.max(
          ...matrices().flatMap((m, i) => m.map((v, j) => Math.abs(v - initial[i][j]))),
        );
        if (
          r.mode !== 'separated' ||
          r.bodyCount !== 11 ||
          r.constraintCount !== 0 ||
          binding.bodyMeshes.length !== 11
        )
          throw new Error(
            `Missing anatomical breakup: ${clip}, ${binding.bodyMeshes.length} samples`,
          );
        let detailError = 0,
          boundError = 0,
          minFloor = Infinity,
          lowest = '',
          gap = 0;
        const start = { ...a.position },
          path = [];
        for (let frame = 0; frame <= 500; frame++) {
          if (frame) animateActors(g.ecs, 1 / 60, (g.time += 1 / 60), g.world);
          const chest = center(meshes.find((m) => m.name.endsWith(':spine'))!);
          const hip = center(meshes.find((m) => m.name.endsWith(':pelvis'))!);
          if (frame === 45) gap = chest.subtract(hip).length();
          detailError = Math.max(
            detailError,
            ...details.map((m, i) =>
              Math.abs(center(m).subtract(center(skull)).length() - distances[i]),
            ),
          );
          for (const m of meshes) {
            if (!m.isEnabled() || !m.isVisible) continue;
            m.computeWorldMatrix(true);
            for (const p of m.getBoundingInfo().boundingBox.vectorsWorld) {
              boundError = Math.max(
                boundError,
                Math.hypot(p.x - r.world[12], p.y - r.world[13], p.z - r.world[14]) - r.radius,
              );
              if (frame === 500) {
                const tile = tileAt(g.world, p.x, p.z);
                if (tile) {
                  // A corner resting against a tread's vertical side is not buried by the entire
                  // step height. Measure entry into the solid box along its shallowest axis.
                  const clearance = Math.max(
                    p.y - tile.h - (tile.surface === 'stair' ? 0.03 : 0),
                    Math.abs(p.x - tile.x) - 0.5,
                    Math.abs(p.z - tile.z) - 0.5,
                  );
                  if (clearance < minFloor) {
                    minFloor = clearance;
                    lowest = `${m.name}: ${p.asArray()} tile ${tile.x},${tile.z},${tile.h}`;
                  }
                }
              }
            }
          }
          if ((frame <= 180 && frame % 6 === 0) || frame === 500) {
            path.push({ frame, x: a.position.x, z: a.position.z, radius: r.radius });
            for (const camera of ['gameplay', 'side'] as const) {
              g.camera.alpha = camera === 'side' ? -0.28 - start.heading : -Math.PI / 4;
              g.camera.beta = camera === 'side' ? 1.25 : 0.64;
              g.camera.radius = 11;
              g.camera.target.set(a.position.x, a.position.h + 0.6, a.position.z);
              for (const e of g.ecs.query('cutaway')) {
                const wall = e.require('cutaway');
                const facing =
                  wall.dx * Math.cos(g.camera.alpha) + wall.dz * Math.sin(g.camera.alpha);
                for (const m of wall.meshes) m.scaling.y = facing > 0.15 ? 0.05 : 1;
              }
              g.scene.render();
              captures.push({
                name: `${clip}-${camera}-${frame}`,
                image: d.engine.getRenderingCanvas()!.toDataURL().split(',')[1],
              });
            }
          }
        }
        const frozen = matrices();
        const surfaces = readCorpseTerrain(g.ecs, g.world).length;
        for (let i = 0; i < 30; i++) animateActors(g.ecs, 1 / 60, (g.time += 1 / 60), g.world);
        const stable = matrices().every((m, i) => m.every((v, j) => v === frozen[i][j]));
        const settled = r.settled,
          remaining = r.bodyCount + r.constraintCount + r.staticCount;
        const newMeshes = d.animation.resources().meshes - resources.meshes;
        a.entity.remove('corpse');
        a.health.current = a.health.max;
        resetActorRig(a.entity.require('rig'), start);
        animateActors(g.ecs, 0, g.time, g.world);
        const reset =
          !a.entity.has('ragdoll') &&
          !a.entity.has('deathHandoff') &&
          !a.entity.require('rig').root.isWorldMatrixFrozen;
        rows.push({
          clip,
          entry,
          detailError,
          boundError,
          minFloor,
          lowest,
          gap,
          settled,
          remaining,
          newMeshes,
          stable,
          surfaces,
          reset,
          path,
        });
      }
      return { rows, captures };
    },
    process.env.P9_CLIPS?.split(',') ?? [],
  );
  for (const c of report.captures)
    await writeFile(`test-results/p9-${c.name}.png`, Buffer.from(c.image, 'base64'));
  await writeFile(
    'test-results/p9-breakup-report.json',
    JSON.stringify({ rows: report.rows, errors }, null, 2),
  );
  for (const row of report.rows) {
    assert.ok(
      row.entry < 1e-5 && row.detailError < 1e-5 && row.boundError < 1e-5,
      JSON.stringify(row),
    );
    assert.ok(row.minFloor > -0.015 && row.gap > 0.25, JSON.stringify(row));
    assert.ok(row.settled && row.stable && row.reset && row.surfaces > 0, JSON.stringify(row));
    assert.equal(row.remaining + row.newMeshes, 0);
  }
  // Real generated named skeleton: unseen death, later discovery of a detached chunk, one identity.
  let found = false;
  for (let i = 0; i < 12 && !found; i++) {
    await page.evaluate((seed) => window.__dungeon.regenerate(seed), `P9-NAMED-${i}`);
    await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
    found = await page.evaluate(() =>
      window.__dungeon.game.combat.enemies.some(
        (a) => a.kind === 'skeleton' && a.entity.has('inhabitant'),
      ),
    );
  }
  assert.ok(found, 'bounded named-skeleton seed selection');
  const discovery = await page.evaluate(async () => {
    const renderPath = '/src/actorRendering.ts';
    const { animateActors } = (await import(
      renderPath
    )) as typeof import('../src/actorRendering.ts');
    const d = window.__dungeon,
      g = d.game;
    d.animation.pause();
    d.engine.stopRenderLoop();
    const a = g.combat.enemies.find((a) => a.kind === 'skeleton' && a.entity.has('inhabitant'))!;
    const identity = a.entity.require('inhabitant').id;
    for (const actor of g.combat.enemies) {
      actor.entity.remove('brain');
      actor.entity.remove('squadMember');
      actor.navigator.cancel();
      actor.attack.reset();
      actor.entity.require('rig').root.setEnabled(false);
    }
    for (const group of g.ecs.query('koboldSquad')) group.remove('koboldSquad');
    Object.assign(a.position, { x: 0, z: 0, h: 0, heading: 0 });
    a.entity.require('rig').root.setEnabled(true);
    a.entity.require('rigPose').reset(a.position);
    animateActors(g.ecs, 0, g.time, g.world);
    Object.assign(g.player.actor.position, { x: 1000, z: 1000, h: 0 });
    g.player.actor.entity.require('rigPose').reset(g.player.actor.position);
    g.combat.damage(a, 1000, undefined, { kind: 'melee', travel: { x: 1, z: 0 } });
    animateActors(g.ecs, 0, g.time, g.world);
    for (let i = 0; i < 500; i++) animateActors(g.ecs, 1 / 60, (g.time += 1 / 60), g.world);
    const record = g.ecs.get('run')!.require('discoveries');
    const before = record
      .snapshot()
      .events.filter((e) => 'subjectId' in e && e.subjectId === identity);
    const binding = a.entity.require('rigPose'),
      skull = binding.bodyMeshes.find((m) => m.name.endsWith(':skull'))!;
    skull.computeWorldMatrix(true);
    const p = skull.getBoundingInfo().boundingBox.centerWorld;
    // The selected chunk, not a remote pelvis or another visible piece, must pass both gates.
    for (const mesh of a.entity.require('render').meshes) mesh.isVisible = mesh === skull;
    d.teleport(p.x, p.z - 2);
    g.camera.alpha = g.desiredAlpha = -Math.PI / 2;
    g.camera.beta = 0.64;
    g.camera.radius = g.desiredRadius = 12;
    for (let i = 0; i < 12; i++) d.step([], 1);
    const after = record
      .snapshot()
      .events.filter((e) => 'subjectId' in e && e.subjectId === identity);
    const resources = a.entity.require('ragdoll');
    d.regenerate('MOURNING-731');
    return {
      before,
      after,
      retired: resources.bodyCount + resources.constraintCount + resources.staticCount === 0,
    };
  });
  await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
  await writeFile(
    'test-results/p9-discovery-report.json',
    JSON.stringify({ discovery, errors }, null, 2),
  );
  assert.deepEqual(discovery.before, []);
  assert.equal(discovery.after.length, 1);
  assert.equal(discovery.after[0].kind, 'remains-found');
  assert.ok(discovery.retired);
  assert.deepEqual(errors, []);
  console.log(
    `PASS P9: ${report.rows.length} breakup sequences, actual chunk geometry, named remains discovery and reset`,
  );
} finally {
  clearTimeout(deadline);
  await browser.close();
}
