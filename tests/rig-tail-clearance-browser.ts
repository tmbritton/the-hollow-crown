import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { DebugWindow } from './browserTypes.ts';
import type { ReviewClip } from './animation-review-fixture.ts';

declare const window: DebugWindow;
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const deadline = setTimeout(() => void browser.close().catch(() => {}), 240000);
try {
  await mkdir('test-results', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const errors: string[] = [];
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
  const report = await page.evaluate(async () => {
    const fixturePath = '/tests/animation-review-fixture.ts',
      rendererPath = '/src/actorRendering.ts';
    const { createReviewStage } = (await import(
      fixturePath
    )) as typeof import('./animation-review-fixture.ts');
    const { animateActors, resetActorRig } = (await import(
      rendererPath
    )) as typeof import('../src/actorRendering.ts');
    const g = window.__dungeon.game,
      stage = createReviewStage(g);
    type Point = [number, number, number];
    // Independent oracle from ACTUAL mesh matrices and local geometry, not clearance proxies.
    const shape = (mesh: AbstractMesh): Point[] => {
      mesh.computeWorldMatrix(true);
      const b = mesh.getBoundingInfo().boundingBox,
        m = mesh.getWorldMatrix().m,
        points: Point[] = [];
      for (let i = 0; i < 8; i++) {
        const x = i & 4 ? b.maximum.x : b.minimum.x;
        const y = i & 2 ? b.maximum.y : b.minimum.y;
        const z = i & 1 ? b.maximum.z : b.minimum.z;
        points.push([
          m[12] + m[0] * x + m[4] * y + m[8] * z,
          m[13] + m[1] * x + m[5] * y + m[9] * z,
          m[14] + m[2] * x + m[6] * y + m[10] * z,
        ]);
      }
      return points;
    };
    const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const cross = (a: Point, b: Point): Point => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const overlap = (a: Point[], b: Point[]) => {
      for (let i = 0; i < 3; i++)
        if (
          Math.max(...a.map((p) => p[i])) <= Math.min(...b.map((p) => p[i])) ||
          Math.max(...b.map((p) => p[i])) <= Math.min(...a.map((p) => p[i]))
        )
          return 0;
      const aa = [4, 2, 1].map((i) => sub(a[i], a[0])),
        bb = [4, 2, 1].map((i) => sub(b[i], b[0]));
      const axes = [
        ...[aa, bb].flatMap((e) => [cross(e[0], e[1]), cross(e[1], e[2]), cross(e[2], e[0])]),
        ...aa.flatMap((x) => bb.map((y) => cross(x, y))),
      ];
      let depth = Infinity;
      for (const axis of axes) {
        const length = Math.hypot(...axis);
        if (length < 1e-10) continue;
        const ap = a.map((p) => dot(p, axis) / length),
          bp = b.map((p) => dot(p, axis) / length);
        const amount =
          Math.min(Math.max(...ap), Math.max(...bp)) - Math.max(Math.min(...ap), Math.min(...bp));
        if (amount <= 1e-5) return 0;
        depth = Math.min(depth, amount);
      }
      return depth;
    };
    const sync = (actor: typeof g.player.actor) => {
      const root = actor.entity.require('rig').root;
      root.computeWorldMatrix(true);
      for (const node of root.getDescendants()) node.computeWorldMatrix(true);
    };
    const points = (actor: typeof g.player.actor) => {
      sync(actor);
      return actor.entity.require('rig').tail!.flatMap((n) => shape(n.getChildMeshes()[0]).flat());
    };
    const corpseFixture = stage.fixture('shieldbearer', 'death');
    corpseFixture.advance(100);
    const dead = g.combat.actor(corpseFixture.id)!,
      deadRig = dead.entity.require('rig');
    const before = points(dead),
      center = deadRig.tail![2].getChildMeshes()[0].getBoundingInfo().boundingBox.centerWorld;
    const neighbor = g.player.actor;
    Object.assign(neighbor.position, { x: center.x, z: center.z, h: 0, heading: 0 });
    neighbor.health.current = neighbor.health.max;
    neighbor.entity.require('rig').root.setEnabled(true);
    animateActors(g.ecs, 1 / 60, g.time + 1 / 60, g.world);
    const entered = points(dead);
    neighbor.position.x = 1000;
    animateActors(g.ecs, 1 / 60, g.time + 2 / 60, g.world);
    const left = points(dead);
    const corpse = {
      entryChange: Math.max(...entered.map((v, i) => Math.abs(v - before[i]))),
      leaveChange: Math.max(...left.map((v, i) => Math.abs(v - before[i]))),
    };
    const groups = [];
    for (const clip of [
      'formation',
      'opening',
      'cards',
      'hackysack',
      'smoke',
      'retreat',
      'stairs-down',
    ] satisfies ReviewClip[]) {
      const f = stage.fixture('shieldbearer', clip);
      let actorFrames = 0,
        blocked = 0,
        ownHits = 0,
        neighborHits = 0,
        maximumOverlap = 0;
      let visibilityMismatches = 0;
      const examples = [];
      for (let frame = 1; frame <= 120; frame++) {
        f.advance(1);
        const live = g.combat.actors.filter(
          (a) => a.alive && a.entity.require('rig').root.isEnabled(),
        );
        live.forEach(sync);
        const geometry = live.map((a) => ({
          a,
          meshes: a.entity
            .require('render')
            .meshes.filter((m) => m.isEnabled() && m.isVisible)
            .map((m) => ({ m, points: shape(m) })),
        }));
        for (const subject of geometry) {
          for (const { m } of subject.meshes)
            if (
              !subject.a.entity
                .require('rigPose')
                .surfaces.some((s) => s.name === m.name && s.enabled)
            )
              visibilityMismatches++;
          const tail = subject.a.entity.require('rigPose').tail;
          if (!tail) continue;
          actorFrames++;
          if (tail.blocked) blocked++;
          for (const tm of subject.meshes.filter(({ m }) =>
            /:tail(Base|Middle|End|Tip) scales$/.test(m.name),
          ))
            for (const other of geometry)
              for (const om of other.meshes) {
                if (
                  other === subject &&
                  (/:tail/.test(om.m.name) ||
                    (tm.m.name.includes(':tailBase') &&
                      (om.m.name.endsWith(':haunches') ||
                        om.m.name.endsWith(':leather vest') ||
                        om.m.name.endsWith(':pack sash'))))
                )
                  continue;
                const depth = overlap(tm.points, om.points);
                if (!depth) continue;
                if (other === subject) ownHits++;
                else neighborHits++;
                maximumOverlap = Math.max(maximumOverlap, depth);
                if (examples.length < 6)
                  examples.push({
                    frame,
                    actor: subject.a.id,
                    tail: tm.m.name,
                    part: om.m.name,
                    depth,
                  });
              }
        }
        if (frame % 12 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      groups.push({
        clip,
        actorFrames,
        blocked,
        ownHits,
        neighborHits,
        maximumOverlap,
        examples,
        visibilityMismatches,
      });
    }
    const snapshot = () =>
      Object.fromEntries(
        g.combat.actors
          .filter((a) => a.alive && a.entity.require('rigPose').tail)
          .map((a) => [a.id, [...a.entity.require('rigPose').pose.world]]),
      );
    stage.fixture('shieldbearer', 'formation').advance(60);
    const ordered = snapshot();
    const replay = stage.fixture('shieldbearer', 'formation');
    const query = g.ecs.query.bind(g.ecs);
    try {
      g.ecs.query = (...components) => query(...components).reverse();
      replay.advance(60);
    } finally {
      g.ecs.query = query;
    }
    const reversed = snapshot();
    let orderError = 0;
    for (const [id, before] of Object.entries(ordered))
      for (let i = 0; i < before.length; i++)
        orderError = Math.max(orderError, Math.abs(before[i] - reversed[id][i]));
    const f = stage.fixture('shieldbearer', 'guard');
    f.advance(6);
    const a = g.combat.actor(f.id)!,
      rig = a.entity.require('rig'),
      binding = a.entity.require('rigPose');
    const other = g.combat.enemies.find((x) => x.kind === 'kobold' && x.id !== a.id)!,
      otherRig = other.entity.require('rig');
    other.entity.remove('brain');
    other.health.current = other.health.max;
    otherRig.root.setEnabled(true);
    let cases = 0,
      blockedCases = 0,
      blockedEither = 0,
      clearHits = 0;
    const neighborExamples: {
      tail: string;
      target: string;
      distance: number;
      angle: number;
      heading: number;
    }[] = [];
    for (const distance of [0.65, 0.8, 1, 1.2])
      for (let i = 0; i < 16; i++)
        for (const heading of [0, Math.PI / 2]) {
          const angle = (i * Math.PI) / 8;
          Object.assign(a.position, { x: 0, z: 0, h: 0, heading: 0 });
          resetActorRig(rig, a.position);
          rig.root.rotation.y = 0;
          Object.assign(other.position, {
            x: distance * Math.sin(angle),
            z: distance * Math.cos(angle),
            h: 0,
            heading,
          });
          resetActorRig(otherRig, other.position);
          otherRig.root.rotation.y = heading;
          for (let frame = 0; frame < 12; frame++)
            animateActors(g.ecs, 1 / 60, frame / 60, g.world);
          cases++;
          if (binding.tail!.blocked) blockedCases++;
          if (binding.tail!.blocked || other.entity.require('rigPose').tail!.blocked)
            blockedEither++;
          sync(a);
          sync(other);
          for (const [subject, neighbor] of [
            [a, other],
            [other, a],
          ])
            if (!subject.entity.require('rigPose').tail!.blocked)
              for (const node of subject.entity.require('rig').tail!)
                for (const mesh of node.getChildMeshes())
                  for (const target of neighbor.entity.require('render').meshes) {
                    if (
                      target.isEnabled() &&
                      target.isVisible &&
                      overlap(shape(mesh), shape(target))
                    ) {
                      clearHits++;
                      if (neighborExamples.length < 20)
                        neighborExamples.push({
                          tail: mesh.name,
                          target: target.name,
                          distance,
                          angle,
                          heading,
                        });
                    }
                  }
          if (cases % 16 === 0) await new Promise((r) => setTimeout(r, 0));
        }
    // A short sweep can classify an overlap correctly while missing perpetual fallback snaps.
    const settling = [];
    for (const [distance, angle, heading] of [
      [0.65, Math.PI / 2, Math.PI / 2],
      [0.8, (Math.PI * 3) / 4, 0],
      [0.8, Math.PI, Math.PI / 2],
      [0.8, (Math.PI * 9) / 8, Math.PI / 2],
    ]) {
      stage.fixture('shieldbearer', 'guard').advance(6);
      other.entity.remove('brain');
      other.health.current = other.health.max;
      otherRig.root.setEnabled(true);
      Object.assign(a.position, { x: 0, z: 0, h: 0, heading: 0 });
      resetActorRig(rig, a.position);
      rig.root.rotation.y = 0;
      Object.assign(other.position, {
        x: distance * Math.sin(angle),
        z: distance * Math.cos(angle),
        h: 0,
        heading,
      });
      resetActorRig(otherRig, other.position);
      otherRig.root.rotation.y = heading;
      const subjects = [a, other],
        bindings = subjects.map((s) => s.entity.require('rigPose'));
      let lateAngleStep = 0,
        frozenLateAngleStep = 0,
        releaseAngleStep = 0,
        // Keep the historical failing subject when every measured late step is now zero.
        worst = distance === 0.65 ? 1 : 0;
      let previous = bindings.map((b) => [...b.tail!.angles]);
      for (let frame = 0; frame < 600; frame++) {
        animateActors(g.ecs, 1 / 60, frame / 60, g.world);
        if (frame >= 300)
          for (let k = 0; k < 2; k++) {
            const step = Math.max(
              ...bindings[k].tail!.angles.map((v, i) => Math.abs(v - previous[k][i])),
            );
            if (step > lateAngleStep) {
              lateAngleStep = step;
              worst = k;
            }
          }
        previous = bindings.map((b) => [...b.tail!.angles]);
        if (frame % 60 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      const b = bindings[worst];
      let last = [...b.tail!.angles];
      for (let frame = 0; frame < 600; frame++) {
        b.tail!.sample(
          b.pose,
          { dt: 1 / 60, speed: 0, stride: 0, forward: 0, airborne: false, attack: 0 },
          b.tailClearance!.clear,
        );
        if (frame >= 300)
          frozenLateAngleStep = Math.max(
            frozenLateAngleStep,
            ...b.tail!.angles.map((v, i) => Math.abs(v - last[i])),
          );
        last = [...b.tail!.angles];
      }
      subjects[1 - worst].position.x = 1000;
      for (let frame = 0; frame < 180; frame++) {
        animateActors(g.ecs, 1 / 60, frame / 60, g.world);
        releaseAngleStep = Math.max(
          releaseAngleStep,
          ...b.tail!.angles.map((v, i) => Math.abs(v - last[i])),
        );
        last = [...b.tail!.angles];
      }
      settling.push({
        distance,
        angle,
        heading,
        lateAngleStep,
        frozenLateAngleStep,
        releaseAngleStep,
        released: !b.tail!.blocked,
      });
    }
    const walls = [];
    stage.fixture('shieldbearer', 'guard').advance(6);
    for (const t of g.world.tiles.values()) {
      if (
        t.room !== 'entrance' ||
        t.blocked ||
        g.world.tiles.has(`${t.x},${t.z - 1}`) ||
        g.world.blockers.some((o) => Math.hypot(t.x - o.x, t.z - o.z) < 2)
      )
        continue;
      for (const distance of [0.31, 0.4, 0.5, 0.6, 0.75]) {
        Object.assign(a.position, { x: t.x, z: t.z - 0.5 + distance, h: t.h, heading: 0 });
        resetActorRig(rig, a.position);
        rig.root.rotation.y = 0;
        for (let frame = 0; frame < 30; frame++) animateActors(g.ecs, 1 / 60, frame / 60, g.world);
        sync(a);
        const corners = rig.tail!.flatMap((n) => shape(n.getChildMeshes()[0]));
        walls.push({
          distance,
          blocked: binding.tail!.blocked,
          plinth: corners.filter((p) => p[2] < t.z - 0.44 && p[1] < t.h + 0.24).length,
          trim: corners.filter(
            (p) => p[2] < t.z - 0.475 && p[1] > t.h + 0.615 && p[1] < t.h + 0.705,
          ).length,
        });
      }
      break;
    }
    return {
      corpse,
      groups,
      orderError,
      neighbors: { cases, blockedCases, blockedEither, clearHits, examples: neighborExamples },
      walls,
      settling,
    };
  });
  await writeFile(
    'test-results/rig-tail-clearance-report.json',
    JSON.stringify({ ...report, errors }, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  assert.deepEqual(errors, []);
  assert.equal(report.corpse.entryChange, 0, 'settled corpse must not dodge a living body');
  assert.equal(report.corpse.leaveChange, 0, 'settled corpse must not change after a body leaves');
  assert.ok(
    report.orderError < 1e-10,
    `ECS ordering changed the published pose: ${report.orderError}`,
  );
  for (const g of report.groups) {
    assert.equal(g.ownHits, 0, `${g.clip}: own anatomical intersections`);
    assert.equal(g.neighborHits, 0, `${g.clip}: neighboring geometry intersections`);
    assert.equal(g.blocked, 0, `${g.clip}: ordinary fixture has no feasible pose`);
    assert.equal(
      g.visibilityMismatches,
      0,
      `${g.clip}: first-frame visible props missing from clearance`,
    );
  }
  assert.equal(
    report.neighbors.clearHits,
    0,
    'a successful solve must clear posed neighbors/equipment',
  );
  for (const s of report.settling) {
    assert.ok(s.lateAngleStep <= 0.12, 'stationary partial contacts must not snap');
    assert.ok(s.frozenLateAngleStep < 0.002, 'fixed infeasible contacts must settle');
    assert.ok(s.releaseAngleStep <= 0.12, 'fallback release must be continuous');
    assert.equal(s.released, true);
  }
  assert.equal(report.walls.length, 5);
  for (const w of report.walls) {
    assert.equal(w.plinth + w.trim, 0, `drawn perimeter masonry: ${w.distance}`);
    assert.equal(w.blocked, false);
  }
  console.log(
    'PASS tail clearance: stable corpses, all-member anatomy/equipment, neighbor sweep and generated masonry',
  );
} finally {
  clearTimeout(deadline);
  await browser.close();
}
