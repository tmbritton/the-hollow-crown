import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector.js';
import type { DebugWindow } from './browserTypes.ts';

declare const window: DebugWindow;
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const deadline = setTimeout(() => void browser.close().catch(() => {}), 180000);
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
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
  const report = await page.evaluate(async () => {
    const d = window.__dungeon,
      g = d.game;
    const stagePath = '/tests/animation-review-fixture.ts';
    const renderPath = '/src/actorRendering.ts';
    const actorPath = '/src/actors.ts';
    const attackPath = '/src/attackKinds.ts';
    const { createReviewStage } = (await import(
      stagePath
    )) as typeof import('./animation-review-fixture.ts');
    const { animateActors, ACTOR_OBSERVATION_RADIUS } = (await import(
      renderPath
    )) as typeof import('../src/actorRendering.ts');
    const { stopActor, requestDefense } = (await import(
      actorPath
    )) as typeof import('../src/actors.ts');
    const { ATTACKS } = (await import(attackPath)) as typeof import('../src/attackKinds.ts');
    const stage = createReviewStage(g);
    const V = g.camera.target.constructor as typeof Vector3;
    const M = g.player.root.getWorldMatrix().constructor as typeof Matrix;
    const spear = [];
    for (const clip of ['thrust', 'stairs', 'stairs-down'] as const) {
      const fixture = stage.fixture('spearman', clip);
      const a = g.combat.actor(fixture.id)!,
        rig = a.entity.require('rig'),
        b = a.entity.require('rigPose');
      const shaft = g.scene.getMeshByName(`${a.id}:long spear haft`)!;
      const vest = g.scene.getMeshByName(`${a.id}:leather vest`)!;
      let intersections = 0,
        maxGrip = 0,
        maxLaneError = 0,
        maxPenetration = 0,
        worstGrip = 0,
        worstFoot = 0;
      for (let i = 1; i <= 84; i++) {
        if (i === 12 && clip !== 'thrust')
          a.attack.start(
            {
              target: 'review',
              kind: 'LONG_THRUST',
              elapsed: 0,
              resolved: false,
              duration: ATTACKS.LONG_THRUST.duration,
              impact: ATTACKS.LONG_THRUST.impact,
            },
            1,
          );
        fixture.advance(1);
        shaft.computeWorldMatrix(true);
        vest.computeWorldMatrix(true);
        rig.spear!.computeWorldMatrix(true);
        const box = shaft.getBoundingInfo().boundingBox;
        const start = V.TransformCoordinates(new V(0, 0, box.minimum.z), shaft.getWorldMatrix());
        const end = V.TransformCoordinates(new V(0, 0, box.maximum.z), shaft.getWorldMatrix());
        const inverse = M.Invert(vest.getWorldMatrix());
        const localStart = V.TransformCoordinates(start, inverse),
          localEnd = V.TransformCoordinates(end, inverse);
        const torso = vest.getBoundingInfo().boundingBox;
        let enter = 0,
          exit = 1;
        // Actual torso OBB inflated by the haft radius plus a small clearance margin.
        for (const axis of ['x', 'y', 'z'] as const) {
          const delta = localEnd[axis] - localStart[axis],
            min = torso.minimum[axis] - 0.05,
            max = torso.maximum[axis] + 0.05;
          if (Math.abs(delta) < 1e-9) {
            if (localStart[axis] < min || localStart[axis] > max) enter = 2;
          } else {
            const t0 = (min - localStart[axis]) / delta,
              t1 = (max - localStart[axis]) / delta;
            enter = Math.max(enter, Math.min(t0, t1));
            exit = Math.min(exit, Math.max(t0, t1));
          }
        }
        if (enter <= exit) intersections++;
        const origin = rig.spear!.getAbsolutePosition(),
          p = a.position;
        maxLaneError = Math.max(
          maxLaneError,
          Math.abs(
            (origin.x - p.x) * Math.cos(p.heading) - (origin.z - p.z) * Math.sin(p.heading) - 0.4,
          ),
        );
        for (let side = 0; side < 2; side++) {
          rig.forearms[side].computeWorldMatrix(true);
          const hand = V.TransformCoordinates(
            new V(0, -0.27, 0),
            rig.forearms[side].getWorldMatrix(),
          );
          const grip = V.TransformCoordinates(
            new V(0, 0, side ? -0.4 : -0.1),
            rig.spear!.getWorldMatrix(),
          );
          const error = V.Distance(hand, grip);
          if (error > maxGrip) {
            maxGrip = error;
            worstGrip = i;
          }
        }
        if (-b.grounding.minimumClearance > maxPenetration) {
          maxPenetration = -b.grounding.minimumClearance;
          worstFoot = i;
        }
      }
      spear.push({
        clip,
        intersections,
        maxGrip,
        maxLaneError,
        maxPenetration,
        worstGrip,
        worstFoot,
      });
    }
    const carry = [];
    for (const profile of ['shieldbearer', 'spearman'] as const) {
      const fixture = stage.fixture(profile, 'carry'),
        a = g.combat.actor(fixture.id)!,
        b = a.entity.require('rigPose');
      const cargo = g.ecs
        .query('cargo')
        .find((e) => e.require('cargo').owner === a.entity)!
        .require('cargo');
      const index = g.ecs
        .get('run')!
        .require('tribute')
        .cargo.findIndex((e) => e.require('cargo') === cargo);
      const crate = g.scene.getTransformNodeByName(`Royal tribute crate ${index}`)!;
      fixture.advance(18);
      for (const phase of ['carry', 'combat', 'resumed'] as const) {
        if (phase === 'combat') {
          a.attack.target = 'review';
          if (profile === 'shieldbearer') requestDefense(a);
          else
            a.attack.start(
              {
                target: 'review',
                kind: 'LONG_THRUST',
                elapsed: 0,
                resolved: false,
                duration: ATTACKS.LONG_THRUST.duration,
                impact: ATTACKS.LONG_THRUST.impact,
              },
              1,
            );
        } else if (phase === 'resumed') {
          a.attack.interrupt();
          a.attack.target = null;
          a.entity.get('defense')?.release();
        }
        let maxMatrixError = 0,
          maxCornerError = 0;
        for (let i = 0; i < 24; i++) {
          fixture.advance(1);
          crate.computeWorldMatrix(true);
          const actual = crate.getWorldMatrix().m,
            frame = b.actions.frames.cargo;
          maxMatrixError = Math.max(
            maxMatrixError,
            ...frame.map((v, k) => Math.abs(v - actual[k])),
          );
          for (const mesh of crate.getChildMeshes())
            for (const corner of mesh.getBoundingInfo().boundingBox.vectors) {
              const local = corner.add(mesh.position),
                point = V.TransformCoordinates(local, crate.getWorldMatrix());
              const expected = [0, 1, 2].map(
                (row) =>
                  frame[12 + row] +
                  frame[row] * local.x +
                  frame[4 + row] * local.y +
                  frame[8 + row] * local.z,
              );
              maxCornerError = Math.max(
                maxCornerError,
                Math.hypot(point.x - expected[0], point.y - expected[1], point.z - expected[2]),
              );
            }
          if (cargo.state !== 'carried' || cargo.owner !== a.entity)
            throw new Error('Presentation changed cargo ownership');
        }
        carry.push({ profile, phase, maxMatrixError, maxCornerError });
      }
    }
    const deaths = [];
    for (const [profile, clip, at] of [
      ['spearman', 'thrust', 32],
      ...Array.from({ length: 55 }, (_, i) => i + 12).map(
        (frame) => ['spearman', 'throw', frame] as const,
      ),
      ['spearman', 'carry', 28],
      ['goblin', 'crossbow', 28],
      ['shieldbearer', 'carry', 28],
    ] as const) {
      const fixture = stage.fixture(profile, clip);
      fixture.advance(at);
      const a = g.combat.actor(fixture.id)!,
        rig = a.entity.require('rig'),
        b = a.entity.require('rigPose');
      const before = [...b.pose.world];
      stopActor(a);
      a.health.current = 0;
      a.entity.add('corpse', { age: 0 });
      animateActors(g.ecs, 0, g.time, g.world);
      const initialError = Math.max(...b.pose.world.map((v, k) => Math.abs(v - before[k])));
      let maxRadius = 0,
        minimumSpearY = Infinity,
        repeatError = 0,
        maxSpearGrip = 0,
        worstRadiusAge = 0,
        worstHeightAge = 0;
      for (let i = 0; i <= 45; i++) {
        a.entity.require('corpse').age = i / 60;
        animateActors(g.ecs, 1 / 60, g.time, g.world);
        const saved = [...b.pose.world];
        for (let repeat = 0; repeat < 3; repeat++) animateActors(g.ecs, 0, g.time, g.world);
        repeatError = Math.max(repeatError, ...b.pose.world.map((v, k) => Math.abs(v - saved[k])));
        for (const mesh of rig.root.getChildMeshes()) {
          if (!mesh.isEnabled() || !mesh.isVisible) continue;
          mesh.computeWorldMatrix(true);
          for (const p of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
            const radius =
              p.subtract(rig.root.position).length() /
              Math.max(rig.root.scaling.x, rig.root.scaling.y, rig.root.scaling.z);
            if (radius > maxRadius) {
              maxRadius = radius;
              worstRadiusAge = i / 60;
            }
            if (mesh.parent === rig.spear && p.y - a.position.h < minimumSpearY) {
              minimumSpearY = p.y - a.position.h;
              worstHeightAge = i / 60;
            }
          }
        }
        if (rig.spear) {
          rig.spear.computeWorldMatrix(true);
          rig.forearms[1].computeWorldMatrix(true);
          maxSpearGrip = Math.max(
            maxSpearGrip,
            V.Distance(
              V.TransformCoordinates(new V(0, -0.27, 0), rig.forearms[1].getWorldMatrix()),
              V.TransformCoordinates(new V(0, 0, -0.4), rig.spear.getWorldMatrix()),
            ),
          );
        }
      }
      deaths.push({
        profile,
        clip,
        entryFrame: at,
        initialError,
        maxRadius,
        minimumSpearY,
        repeatError,
        maxSpearGrip,
        worstRadiusAge,
        worstHeightAge,
      });
    }
    return { spear, carry, deaths, observationRadius: ACTOR_OBSERVATION_RADIUS };
  });
  await writeFile(
    'test-results/rig-actions-report.json',
    JSON.stringify({ ...report, errors }, null, 2),
  );
  const failures: string[] = [];
  for (const r of report.spear) {
    if (r.intersections) failures.push(`spear/${r.clip}: ${r.intersections} torso intersections`);
    if (r.maxGrip > 0.01 || r.maxLaneError > 1e-5 || r.maxPenetration > 0.001)
      failures.push(`spear/${r.clip}: ${JSON.stringify(r)}`);
  }
  for (const r of report.carry)
    if (r.maxMatrixError > 1e-5 || r.maxCornerError > 1e-5)
      failures.push(`cargo: ${JSON.stringify(r)}`);
  for (const r of report.deaths)
    if (
      r.maxRadius > report.observationRadius ||
      r.minimumSpearY < -0.001 ||
      r.initialError > 1e-8 ||
      r.repeatError > 1e-10 ||
      r.maxSpearGrip > 0.01
    )
      failures.push(`death: ${JSON.stringify(r)}`);
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  console.log(
    'PASS action geometry: shaft/body clearance, both-role cargo handoffs, scaled actual geometry, death equipment clearance/bounds and repeated-pose identity',
  );
} finally {
  clearTimeout(deadline);
  await browser.close();
}
