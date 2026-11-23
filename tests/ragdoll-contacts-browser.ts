import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { DebugWindow } from './browserTypes.ts';
declare const window: DebugWindow;

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const deadline = setTimeout(() => void browser.close(), 240000);
try {
  await mkdir('test-results', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  await page.evaluate(() => {
    window.__dungeon.animation.pause();
    window.__dungeon.engine.stopRenderLoop();
    window.__dungeon.regenerate('MOURNING-731');
  });
  await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
  const report = await page.evaluate(async () => {
    const fixturePath = '/tests/animation-review-fixture.ts',
      renderPath = '/src/actorRendering.ts',
      actorsPath = '/src/actors.ts',
      wallPath = '/src/wallGeometry.ts';
    const { createReviewStage } = (await import(
      fixturePath
    )) as typeof import('./animation-review-fixture.ts');
    const { animateActors, resetActorRig } = (await import(
      renderPath
    )) as typeof import('../src/actorRendering.ts');
    const { requestJump, moveActor } = (await import(
      actorsPath
    )) as typeof import('../src/actors.ts');
    const { WALL_BASE, WALL_OFFSET, WALL_THICKNESS, WALL_LENGTH } = (await import(
      wallPath
    )) as typeof import('../src/wallGeometry.ts');
    const d = window.__dungeon,
      g = d.game;
    d.animation.pause();
    d.engine.stopRenderLoop();
    const stage = createReviewStage(g),
      rows = [],
      captures: { name: string; image: string }[] = [];
    type Box = { min: number[]; max: number[] };
    const wallBoxes: Box[] = [];
    for (const t of g.world.tiles.values())
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (g.world.tiles.has(`${t.x + dx},${t.z + dz}`)) continue;
        for (const section of WALL_BASE) {
          const center = [t.x + dx * WALL_OFFSET, t.h + section.center, t.z + dz * WALL_OFFSET];
          const size = [
            (dx ? WALL_THICKNESS : WALL_LENGTH) + section.overhang,
            section.height,
            (dz ? WALL_THICKNESS : WALL_LENGTH) + section.overhang,
          ];
          wallBoxes.push({
            min: center.map((v, i) => v - size[i] / 2),
            max: center.map((v, i) => v + size[i] / 2),
          });
        }
      }
    for (const type of ['door-x', 'door-z', 'wall', 'corner'] as const)
      for (const profile of ['skeleton', 'shieldbearer'] as const)
        for (let variant = 0; variant < 3; variant++) {
          const f = stage.fixture(profile, 'travel'),
            a = g.combat.actor(f.id)!;
          f.advance(18);
          let boxes: Box[], travel: { x: number; z: number; h?: number };
          if (type.startsWith('door')) {
            const axis = type === 'door-x' ? 'x' : 'z';
            const door = g.world.entities.find((e) => e.type === 'door' && e.axis === axis)!;
            if (door.type !== 'door' || !door.collider || !door.pivot)
              throw new Error('door fixture');
            door.open = false;
            door.collider.checkCollisions = true;
            door.pivot.rotation.y = 0;
            Object.assign(a.position, {
              x: door.x - (axis === 'x' ? 2 : 0),
              z: door.z - (axis === 'z' ? 2 : 0),
              h: door.h,
              heading: axis === 'x' ? Math.PI / 2 : 0,
            });
            resetActorRig(a.entity.require('rig'), a.position);
            animateActors(g.ecs, 0, g.time, g.world);
            requestJump(a);
            for (let i = 0; i < 14 + variant * 2; i++) {
              moveActor(a, g.world, {}, 1 / 60);
              animateActors(g.ecs, 1 / 60, (g.time += 1 / 60), g.world);
            }
            boxes = door.pivot
              .getChildMeshes()
              .filter((m) => m.name === 'door plank')
              .map((m) => {
                m.computeWorldMatrix(true);
                const b = m.getBoundingInfo().boundingBox;
                return { min: b.minimumWorld.asArray(), max: b.maximumWorld.asArray() };
              });
            travel = { x: axis === 'x' ? 1 : 0, z: axis === 'z' ? 1 : 0, h: 0.3 };
          } else {
            const t =
              type === 'wall'
                ? g.world.tiles.get('9,1')!
                : [...g.world.tiles.values()].find(
                    (t) =>
                      t.room === 'entrance' &&
                      !g.world.tiles.has(`${t.x + 1},${t.z}`) &&
                      !g.world.tiles.has(`${t.x},${t.z + 1}`),
                  )!;
            Object.assign(a.position, {
              x: t.x - 0.3,
              z: t.z - (type === 'corner' ? 0.3 : 0),
              h: t.h,
              heading: Math.PI / 2,
            });
            resetActorRig(a.entity.require('rig'), a.position);
            animateActors(g.ecs, 0, g.time, g.world);
            boxes = wallBoxes.filter(
              (b) =>
                Math.abs((b.min[0] + b.max[0]) / 2 - a.position.x) < 5 &&
                Math.abs((b.min[2] + b.max[2]) / 2 - a.position.z) < 5,
            );
            travel = { x: 1, z: type === 'corner' ? 1 : 0 };
          }
          const overlap = () => {
            let worst = 0;
            for (const m of a.entity.require('render').meshes) {
              if (!m.isVisible || !m.isEnabled()) continue;
              m.computeWorldMatrix(true);
              for (const p of m.getBoundingInfo().boundingBox.vectorsWorld) {
                const v = p.asArray();
                for (const box of boxes)
                  worst = Math.max(
                    worst,
                    Math.min(...v.flatMap((x, i) => [x - box.min[i], box.max[i] - x])),
                  );
              }
            }
            return worst;
          };
          const initial = overlap();
          if (!g.combat.damage(a, 1000, undefined, { kind: 'projectile', travel }))
            throw new Error('lethal fixture rejected');
          animateActors(g.ecs, 0, g.time, g.world);
          let worst = initial;
          for (let frame = 1; frame <= 500; frame++) {
            animateActors(g.ecs, 1 / 60, (g.time += 1 / 60), g.world);
            if (type.startsWith('door') && frame <= 180) worst = Math.max(worst, overlap());
          }
          const r = a.entity.require('ragdoll');
          if (g.ecs.living.has(a.entity)) throw new Error('Ragdoll entered living collision');
          rows.push({
            type,
            profile,
            variant,
            initial,
            worst,
            final: overlap(),
            settled: r.settled,
            seed: r.seed,
          });
          g.camera.alpha = -Math.PI / 4;
          g.camera.beta = 0.6;
          g.camera.radius = 9;
          g.camera.target.set(a.position.x, a.position.h + 0.7, a.position.z);
          g.scene.render();
          captures.push({
            name: `${type}-${profile}-${variant}`,
            image: d.engine.getRenderingCanvas()!.toDataURL().split(',')[1],
          });
        }
    return { rows, captures };
  });
  for (const c of report.captures)
    await writeFile(`test-results/p8-contact-${c.name}.png`, Buffer.from(c.image, 'base64'));
  await writeFile(
    'test-results/p8-contacts-report.json',
    JSON.stringify({ rows: report.rows, errors }, null, 2),
  );
  assert.deepEqual(errors, []);
  for (const row of report.rows) {
    assert.ok(row.initial < 0.001 && row.settled, JSON.stringify(row));
    assert.ok((row.type.startsWith('door') ? row.worst : row.final) < 0.015, JSON.stringify(row));
  }
  console.log(
    `PASS P8 structural contacts: ${report.rows.length} actual-mesh door/wall/corner cases`,
  );
} finally {
  clearTimeout(deadline);
  await browser.close();
}
