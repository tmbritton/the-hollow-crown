import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { DebugWindow } from './browserTypes.ts';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
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
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  const report = await page.evaluate(async () => {
    const path = '/tests/animation-review-fixture.ts',
      renderPath = '/src/actorRendering.ts';
    const { createReviewStage, reviewCatalog } = (await import(
      path
    )) as typeof import('./animation-review-fixture.ts');
    const { animateActors, resetActorRig } = (await import(
      renderPath
    )) as typeof import('../src/actorRendering.ts');
    const d = window.__dungeon,
      g = d.game;
    d.animation.pause();
    d.engine.stopRenderLoop();
    const stage = createReviewStage(g),
      V = g.camera.target.constructor as typeof Vector3;
    const rows = [],
      captures: { name: string; image: string }[] = [];
    for (const { profile, clip } of reviewCatalog.filter((c) => c.clip !== 'death')) {
      for (const frame of [12, 36, 72]) {
        const f = stage.fixture(profile, clip),
          a = g.combat.actor(f.id)!;
        const b = a.entity.require('rigPose'),
          r = a.entity.require('rig');
        const measure = () => {
          r.root.computeWorldMatrix(true);
          for (const n of r.root.getDescendants()) n.computeWorldMatrix(true);
          return [
            { index: 0, point: r.root.getAbsolutePosition().asArray() },
            ...(['left', 'right'] as const).flatMap((side, i) => [
              {
                index: b.pose.definition.index[`${side}Hand`],
                point: V.TransformCoordinates(
                  new V(0, -0.27, 0),
                  r.forearms[i].getWorldMatrix(),
                ).asArray(),
              },
              {
                index: b.pose.definition.index[`${side}Foot`],
                point: r.feet[i].getAbsolutePosition().asArray(),
              },
            ]),
            ...(r.tail ?? []).map((n, i) => ({
              index: b.pose.definition.tail![i].index,
              point: n.getAbsolutePosition().asArray(),
            })),
          ];
        };
        f.advance(frame - 1);
        const previous = measure();
        const previousSupport = a.position.h;
        f.advance(1);
        const current = measure(),
          snapshot = b.history.snapshot();
        let poseError = 0,
          velocityError = 0;
        for (let i = 0; i < current.length; i++)
          for (let axis = 0; axis < 3; axis++) {
            const joint = current[i].index;
            poseError = Math.max(
              poseError,
              Math.abs(current[i].point[axis] - snapshot.world[joint * 16 + 12 + axis]),
            );
            velocityError = Math.max(
              velocityError,
              Math.abs(
                (current[i].point[axis] - previous[i].point[axis]) * 60 -
                  snapshot.linear[joint * 3 + axis],
              ),
            );
          }
        const stable = JSON.stringify(snapshot);
        for (let i = 0; i < 3; i++) animateActors(g.ecs, 0, g.time, g.world);
        const repeated = JSON.stringify(b.history.snapshot()) === stable;
        // The kill can occur after motor movement but before this step's presentation.
        a.position.x += 0.025;
        a.position.heading += 0.13;
        const preStop = [
          a.motion.velocity.x,
          a.jump.airborne ? a.jump.velocity : (a.position.h - previousSupport) * 60,
          a.motion.velocity.z,
        ];
        const deathPosition = [a.position.x, a.elevation, a.position.z];
        const accepted = g.combat.damage(a, 1000, undefined, {
          kind: 'melee',
          travel: { x: Math.sin(a.position.heading), z: Math.cos(a.position.heading) },
        });
        const handoff = a.entity.require('deathHandoff'),
          frozen = JSON.stringify(handoff.pose);
        const rootError = Math.max(
          ...deathPosition.map((v, i) => Math.abs(v - handoff.pose!.world[12 + i])),
        );
        const inheritedError = Math.max(
          ...preStop.map((v, i) => Math.abs(v - handoff.pose!.linear[i])),
        );
        animateActors(g.ecs, 0, g.time, g.world);
        a.entity.require('corpse').age = 0.62;
        animateActors(g.ecs, 1 / 60, g.time + 1 / 60, g.world);
        const detached = frozen === JSON.stringify(handoff.pose);
        rows.push({
          profile,
          clip,
          frame,
          accepted,
          repeated,
          detached,
          poseError,
          velocityError,
          rootError,
          inheritedError,
          bodies: handoff.pose!.bodies.length,
        });
        if (frame === 36 && ['opening', 'jump', 'moving-melee'].includes(clip)) {
          d.animation.camera('side', a.id);
          g.scene.render();
          captures.push({
            name: `${profile}-${clip}`,
            image: d.engine.getRenderingCanvas()!.toDataURL('image/png').split(',')[1],
          });
        }
        a.entity.remove('corpse');
        a.health.current = a.health.max;
        resetActorRig(r, a.position);
        if (a.entity.has('deathHandoff') || b.history.snapshot().linear.some((v) => v !== 0))
          throw new Error('reset retained death/history');
      }
    }
    return { rows, captures };
  });
  for (const c of report.captures)
    await writeFile(`test-results/a7-handoff-${c.name}.png`, Buffer.from(c.image, 'base64'));
  await writeFile(
    'test-results/rig-handoff-report.json',
    JSON.stringify({ rows: report.rows, errors }, null, 2),
  );
  assert.deepEqual(errors, []);
  for (const row of report.rows) {
    assert.ok(row.accepted && row.repeated && row.detached, JSON.stringify(row));
    assert.ok(row.poseError < 1e-5 && row.velocityError < 0.001, JSON.stringify(row));
    assert.ok(row.rootError < 1e-8 && row.inheritedError < 1e-8, JSON.stringify(row));
  }
  console.log(
    `PASS A7 handoff: ${report.rows.length} catalog death entries, actual joint velocities, detached/rebased poses and reset retirement`,
  );
} finally {
  clearTimeout(deadline);
  await browser.close();
}
