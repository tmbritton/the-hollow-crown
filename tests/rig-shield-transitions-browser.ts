import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { DebugWindow } from './browserTypes.ts';

declare const window: DebugWindow;
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const deadline = setTimeout(() => void browser.close().catch(() => {}), 240000);
try {
  await mkdir('test-results', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } }),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  await page.evaluate(() => {
    const d = window.__dungeon;
    d.animation.pause();
    d.engine.stopRenderLoop();
    d.regenerate('MOURNING-731');
  });
  await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
  await page.evaluate(() => {
    const d = window.__dungeon,
      g = d.game;
    for (const a of g.combat.enemies) {
      a.entity.remove('brain');
      a.attack.reset();
      a.health.current = 0;
      a.entity.require('rig').root.setEnabled(false);
    }
    d.teleport(-2, 0);
    g.camera.alpha = g.desiredAlpha = -Math.PI / 2;
    d.step([], 1);
  });
  await page.keyboard.down('f');
  await page.evaluate(() => window.__dungeon.step(['KeyD', 'ShiftLeft'], 40));
  await page.keyboard.up('f');
  const report = await page.evaluate(async () => {
    const fixturePath = '/tests/animation-review-fixture.ts',
      actorPath = '/src/actors.ts',
      renderPath = '/src/actorRendering.ts',
      worldPath = '/src/world.ts';
    const { createReviewStage } = (await import(
      fixturePath
    )) as typeof import('./animation-review-fixture.ts');
    const { requestDefense, moveActor } = (await import(
      actorPath
    )) as typeof import('../src/actors.ts');
    const { animateActors } = (await import(
      renderPath
    )) as typeof import('../src/actorRendering.ts');
    const { heightAt } = (await import(worldPath)) as typeof import('../src/world.ts');
    const g = window.__dungeon.game,
      stage = createReviewStage(g);
    const V = g.camera.target.constructor as typeof Vector3,
      M = g.player.root.getWorldMatrix().constructor as typeof Matrix;
    const cross = (a: number[], b: number[]) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
    const box = (mesh: AbstractMesh) => {
      mesh.computeWorldMatrix(true);
      const m = mesh.getWorldMatrix().m;
      return {
        points: mesh.getBoundingInfo().boundingBox.vectorsWorld.map((v) => v.asArray()),
        edges: [0, 4, 8].map((i) => [m[i], m[i + 1], m[i + 2]]),
      };
    };
    const depth = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => {
      const axes = [a, b].flatMap((v) => [
        cross(v.edges[0], v.edges[1]),
        cross(v.edges[1], v.edges[2]),
        cross(v.edges[2], v.edges[0]),
      ]);
      for (const x of a.edges) for (const y of b.edges) axes.push(cross(x, y));
      let result = Infinity;
      for (const axis of axes) {
        const length = Math.hypot(...axis);
        if (length < 1e-9) continue;
        const n = axis.map((v) => v / length),
          aa = a.points.map((p) => dot(p, n)),
          bb = b.points.map((p) => dot(p, n));
        const amount =
          Math.min(Math.max(...aa), Math.max(...bb)) - Math.max(Math.min(...aa), Math.min(...bb));
        if (amount <= 1e-6) return 0;
        result = Math.min(result, amount);
      }
      return result;
    };
    const measure = (a: typeof g.player.actor) => {
      const r = a.entity.require('rig'),
        b = a.entity.require('rigPose');
      r.root.computeWorldMatrix(true);
      for (const n of r.root.getDescendants()) n.computeWorldMatrix(true);
      const mesh = r
        .shield!.getChildMeshes()
        .find((m) => m.name === 'shield' || m.name.endsWith(':squad shield'))!;
      const shape = box(mesh),
        m = r.shield!.getWorldMatrix().m;
      const normal = V.Cross(new V(m[4], m[5], m[6]), new V(m[8], m[9], m[10]))
        .normalize()
        .scaleInPlace(-1);
      const hand = V.TransformCoordinates(new V(0, -0.27, 0), r.forearms[0].getWorldMatrix()),
        grip = V.TransformCoordinates(new V(0, -0.12, -0.28), r.shield!.getWorldMatrix());
      let sole = Infinity;
      for (const foot of r.feet)
        for (const part of foot.getChildMeshes())
          for (const p of part.getBoundingInfo().boundingBox.vectorsWorld)
            sole = Math.min(sole, p.y - (heightAt(g.world, p.x, p.z) ?? a.position.h));
      const overlaps: Record<string, number> = {};
      for (const part of r.root.getChildMeshes())
        if (
          part.isEnabled() &&
          part.isVisible &&
          /(surcoat|belt|buckle|skirt|hood|mask|vest|thigh|shin|boot|greave|pauldron)/.test(
            part.name,
          )
        ) {
          const amount = depth(shape, box(part));
          if (amount > 1e-5) overlaps[part.name] = Math.max(overlaps[part.name] ?? 0, amount);
        }
      const gate = a.entity.get('squadMember');
      const lane = gate?.group.require('koboldSquad').isGate(gate) ? 0.575 : 0;
      const inv = M.Invert(mesh.getWorldMatrix()),
        bounds = mesh.getBoundingInfo().boundingBox,
        sin = Math.sin(a.position.heading),
        cos = Math.cos(a.position.heading);
      const from = V.TransformCoordinates(
          new V(
            a.position.x + cos * lane - sin * 3,
            a.elevation + 0.85,
            a.position.z - sin * lane - cos * 3,
          ),
          inv,
        ),
        to = V.TransformCoordinates(
          new V(
            a.position.x + cos * lane + sin * 4,
            a.elevation + 0.85,
            a.position.z - sin * lane + cos * 4,
          ),
          inv,
        );
      let enter = 0,
        exit = 1;
      for (const axis of ['x', 'y', 'z'] as const) {
        const d = to[axis] - from[axis];
        if (Math.abs(d) < 1e-9) {
          if (from[axis] < bounds.minimum[axis] || from[axis] > bounds.maximum[axis]) enter = 2;
        } else {
          const t0 = (bounds.minimum[axis] - from[axis]) / d,
            t1 = (bounds.maximum[axis] - from[axis]) / d;
          enter = Math.max(enter, Math.min(t0, t1));
          exit = Math.min(exit, Math.max(t0, t1));
        }
      }
      return {
        corners: shape.points,
        hand: hand.asArray(),
        pose: [...b.pose.world],
        motion: b.actions.shield.snapshot(),
        normal: normal.x * sin + normal.z * cos,
        covered: enter <= exit,
        grip: V.Distance(hand, grip),
        sole,
        overlaps,
      };
    };
    const delta = (a: ReturnType<typeof measure>, b: ReturnType<typeof measure>) =>
      Math.max(...a.corners.map((p, i) => Math.hypot(...p.map((v, j) => v - b.corners[i][j]))));
    const captures: { name: string; image: string }[] = [];
    const capture = (a: typeof g.player.actor, name: string) => {
      window.__dungeon.animation.camera(null);
      g.camera.alpha = Math.PI / 2 - a.position.heading + 0.6;
      g.camera.beta = 1.1;
      g.camera.radius = 5;
      g.camera.target.set(a.position.x, a.elevation + 0.9, a.position.z);
      g.scene.render();
      captures.push({
        name,
        image: window.__dungeon.engine.getRenderingCanvas()!.toDataURL('image/png').split(',')[1],
      });
    };
    const realRelease: Record<string, number> = {};
    for (let frame = 0; frame < 30; frame++) {
      window.__dungeon.step(['KeyD', 'ShiftLeft'], 1);
      for (const [name, amount] of Object.entries(measure(g.player.actor).overlaps))
        realRelease[name] = Math.max(realRelease[name] ?? 0, amount);
    }
    const tick = (dt = 1 / 60) => {
      g.time += dt;
      g.combat.time = g.time;
      animateActors(g.ecs, dt, g.time, g.world);
    };
    const releases = [];
    for (const profile of ['player', 'shieldbearer'] as const)
      for (const phase of [12, 20, 32, 40, 55])
        for (const guarded of [false, true]) {
          const f = stage.fixture(profile, 'travel'),
            a = g.combat.actor(f.id)!;
          if (guarded) requestDefense(a);
          f.advance(phase);
          a.entity.require('defense').release();
          let maxGrip = 0,
            minSole = Infinity;
          const overlaps: Record<string, number> = {};
          for (let frame = 0; frame < 30; frame++) {
            moveActor(
              a,
              g.world,
              { direction: { x: 1, z: 0 }, speed: profile === 'player' ? 7.4 : 2.9 },
              1 / 60,
            );
            tick();
            const m = measure(a);
            if (guarded && phase === 40 && frame === (profile === 'player' ? 1 : 4))
              capture(a, `${profile}-moving-release`);
            maxGrip = Math.max(maxGrip, m.grip);
            minSole = Math.min(minSole, m.sole);
            for (const [name, depth] of Object.entries(m.overlaps))
              overlaps[name] = Math.max(overlaps[name] ?? 0, depth);
          }
          releases.push({ profile, phase, guarded, maxGrip, minSole, overlaps });
        }
    const reversals = [];
    for (const profile of ['player', 'shieldbearer'] as const)
      for (const frames of [1, 3, 6, 10, 16, 24]) {
        const f = stage.fixture(profile, 'guard'),
          a = g.combat.actor(f.id)!;
        requestDefense(a);
        for (let i = 0; i < 60; i++) tick();
        a.entity.require('defense').release();
        for (let i = 0; i < frames; i++) tick();
        const before = measure(a);
        if (frames === 1 || frames === 10) capture(a, `${profile}-reversal-${frames}-before`);
        requestDefense(a);
        tick(0);
        const after = measure(a);
        if (frames === 1 || frames === 10) capture(a, `${profile}-reversal-${frames}-after`);
        reversals.push({
          profile,
          frames,
          wasProtective: before.normal > 0.98 && before.covered,
          cornerJump: delta(before, after),
          beforeVelocity: before.motion.velocities[0],
          afterVelocity: after.motion.velocities[0],
          normal: after.normal,
          covered: after.covered,
        });
      }
    const interruptions = [];
    for (const frames of [2, 6, 12, 24])
      for (const operation of ['lost', 'retreat', 'invalid', 'death'] as const) {
        const f = stage.fixture('shieldbearer', 'opening'),
          a = g.combat.actor(f.id)!,
          member = a.entity.require('squadMember'),
          squad = member.group.require('koboldSquad');
        f.advance(frames);
        const before = measure(a);
        if (operation === 'death') g.combat.damage(a, 1000);
        else {
          squad.chart.send({
            type: 'TICK',
            dt: 1 / 60,
            survivors: 4,
            valid: operation !== 'lost',
            cohesive: operation !== 'invalid',
            home: false,
            losing: operation === 'retreat',
            attack: 'LONG_THRUST',
          });
          a.entity.require('defense').release();
          if (squad.active && !squad.isOpening(member)) requestDefense(a);
        }
        tick(0);
        const after = measure(a);
        interruptions.push({
          frames,
          operation,
          guarded: a.defending,
          normal: after.normal,
          covered: after.covered,
          jump: delta(before, after),
          weight: after.motion.weight,
          pending: a.entity.require('blockFeedback').pendingCount,
        });
      }
    return { releases, reversals, realRelease, interruptions, captures };
  });
  const { captures, ...measurements } = report;
  for (const capture of captures)
    await writeFile(
      `test-results/rig-shield-${capture.name}.png`,
      Buffer.from(capture.image, 'base64'),
    );
  await writeFile(
    'test-results/rig-shield-transitions-report.json',
    JSON.stringify({ ...measurements, captures: captures.map((c) => c.name), errors }, null, 2),
  );
  console.log(JSON.stringify(measurements, null, 2));
  assert.deepEqual(errors, []);
  for (const [name, amount] of Object.entries(report.realRelease))
    assert.ok(
      amount <= (name.includes('pauldron') ? 0.031 : 0.001),
      `real F release intersects ${name}: ${amount}`,
    );
  for (let i = 0; i < report.releases.length; i += 2) {
    const control = report.releases[i],
      release = report.releases[i + 1];
    assert.ok(release.maxGrip < 0.01);
    assert.ok(release.minSole >= -0.001);
    for (const [name, depth] of Object.entries(release.overlaps))
      assert.ok(
        depth <= (control.overlaps[name] ?? 0) + 0.001,
        `${release.profile}/${release.phase} newly intersects ${name}: ${depth}`,
      );
  }
  assert.ok(report.reversals.some((r) => r.wasProtective));
  for (const r of report.reversals) {
    assert.ok(r.normal > 0.98 && r.covered, `${r.profile}/${r.frames}: delayed protection`);
    if (r.wasProtective) {
      assert.ok(
        r.cornerJump < 1e-5,
        `${r.profile}/${r.frames}: unnecessary projection ${r.cornerJump}`,
      );
      assert.equal(r.afterVelocity, r.beforeVelocity, 'retain feasible placement velocity');
    }
  }
  for (const row of report.interruptions) {
    if (row.guarded)
      assert.ok(
        row.normal > 0.98 && row.covered,
        `interrupted ${row.operation} left the gate open`,
      );
    if (row.operation === 'lost' || row.operation === 'death')
      assert.ok(row.jump < 1e-5, `interrupted ${row.operation} lost the current pose`);
    if (row.operation === 'death') {
      assert.equal(row.weight, 0);
      assert.equal(row.pending, 0);
    }
  }
  console.log(
    'PASS shield transitions: moving release body clearance and constraint-aware immediate reversals',
  );
} finally {
  clearTimeout(deadline);
  await browser.close();
}
