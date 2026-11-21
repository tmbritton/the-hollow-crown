import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { DebugWindow } from './browserTypes.ts';
import type { ReviewClip } from './animation-review-fixture.ts';

declare const window: DebugWindow & {
  tailStage?: ReturnType<typeof import('./animation-review-fixture.ts').createReviewStage>;
};
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const deadline = setTimeout(() => void browser.close().catch(() => {}), 240000);
try {
  await mkdir('test-results', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
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
  const population = await page.evaluate(() => {
    const g = window.__dungeon.game;
    return g.combat.enemies
      .filter((a) => a.kind === 'kobold')
      .map((a) => {
        const b = a.entity.require('rigPose'),
          nodes = a.entity.require('rig').tail!;
        return {
          family: b.pose.definition.family,
          segments: nodes.length,
          registered: nodes.every((n) =>
            n
              .getChildMeshes()
              .every(
                (m) =>
                  a.entity.require('render').meshes.includes(m) &&
                  g.shadowMap.renderList?.includes(m) &&
                  !m.isPickable,
              ),
          ),
          oldStub: !!g.scene.getMeshByName(`${a.id}:tail`),
        };
      });
  });
  assert.equal(population.length, 12);
  for (const p of population)
    assert.deepEqual(p, {
      family: 'humanoid-with-tail',
      segments: 4,
      registered: true,
      oldStub: false,
    });
  const sequences = [];
  const clips: ReviewClip[] = [
    'travel',
    'stairs',
    'stairs-down',
    'jump',
    'guard',
    'thrust',
    'throw',
    'formation',
    'opening',
    'retreat',
    'cards',
    'smoke',
    'hackysack',
    'packing',
    'unloading',
    'carry',
    'death',
  ];
  for (const profile of ['shieldbearer', 'spearman'] as const)
    for (const clip of clips.filter(
      (c) => !process.env.TAIL_CLIPS || process.env.TAIL_CLIPS.split(',').includes(c),
    )) {
      const result = await page.evaluate(
        async ({ profile, clip }) => {
          const fixturePath = '/tests/animation-review-fixture.ts',
            renderPath = '/src/actorRendering.ts',
            worldPath = '/src/world.ts';
          const { createReviewStage } = (await import(
            fixturePath
          )) as typeof import('./animation-review-fixture.ts');
          const { animateActors, ACTOR_OBSERVATION_RADIUS } = (await import(
            renderPath
          )) as typeof import('../src/actorRendering.ts');
          const { heightAt, tileAt } = (await import(
            worldPath
          )) as typeof import('../src/world.ts');
          const d = window.__dungeon,
            g = d.game;
          window.tailStage ??= createReviewStage(g);
          const fixture = window.tailStage.fixture(profile, clip),
            a = g.combat.actor(fixture.id)!;
          const binding = a.entity.require('rigPose'),
            rig = a.entity.require('rig'),
            tail = binding.tail!;
          const equipment = [...(rig.equipment ?? []), ...(rig.stowedEquipment ?? [])];
          let maxError = 0,
            minFloor = Infinity,
            maxRadius = 0,
            maxQueries = 0,
            maxEvaluations = 0,
            maxStep = 0;
          let maxStepFrame = 0;
          const blocked: number[] = [],
            tucked: number[] = [];
          const reasons: Record<string, number> = {};
          let equipmentIntersections = 0;
          let previous: number[] | undefined;
          for (let frame = 1; frame <= 132; frame++) {
            fixture.advance(1);
            const p = binding.pose,
              points: number[] = [];
            for (const [i, node] of rig.tail!.entries()) {
              node.computeWorldMatrix(true);
              const segment = p.definition.tail![i],
                o = segment.index * 16;
              const actual = node.getWorldMatrix().m;
              for (let k = 0; k < 16; k++)
                maxError = Math.max(maxError, Math.abs(actual[k] - p.world[o + k]));
              for (const mesh of node.getChildMeshes()) {
                mesh.computeWorldMatrix(true);
                if (!a.entity.has('corpse'))
                  for (const item of equipment) {
                    if (!item.isEnabled()) continue;
                    item.computeWorldMatrix(true);
                    if (mesh.intersectsMesh(item, true)) equipmentIntersections++;
                  }
                for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
                  const tile = tileAt(g.world, corner.x, corner.z);
                  const floor = Math.max(
                    heightAt(g.world, corner.x, corner.z) ?? a.position.h,
                    tile?.surface === 'stair' ? tile.h + 0.03 : (tile?.h ?? a.position.h),
                  );
                  minFloor = Math.min(minFloor, corner.y - floor);
                  maxRadius = Math.max(
                    maxRadius,
                    corner.subtract(rig.root.position).length() /
                      Math.max(rig.root.scaling.x, rig.root.scaling.y, rig.root.scaling.z),
                  );
                }
              }
              points.push(actual[12], actual[13], actual[14]);
            }
            if (maxRadius > ACTOR_OBSERVATION_RADIUS)
              throw new Error('Tail leaves observation sphere');
            if (tail.blocked) {
              blocked.push(frame);
              for (let i = 0; i < 4; i++)
                if (!binding.tailClearance!.clear(tail.segmentBounds(p, i), i)) {
                  const reason = `${i}:${binding.tailClearance!.reason}`;
                  reasons[reason] = (reasons[reason] ?? 0) + 1;
                }
            }
            if (tail.tucked) tucked.push(frame);
            if (previous)
              for (let i = 0; i < points.length; i += 3) {
                const step = Math.hypot(
                  points[i] - previous[i],
                  points[i + 1] - previous[i + 1],
                  points[i + 2] - previous[i + 2],
                );
                if (step > maxStep) {
                  maxStep = step;
                  maxStepFrame = frame;
                }
              }
            previous = points;
            maxQueries = Math.max(maxQueries, tail.queries);
            maxEvaluations = Math.max(maxEvaluations, tail.evaluations);
            const before = [...p.world],
              velocity = [...tail.velocities];
            animateActors(g.ecs, 0, g.time, g.world);
            for (let i = 0; i < p.world.length; i++)
              if (Math.abs(p.world[i] - before[i]) > 1e-5)
                throw new Error(`Zero-time drift ${profile}/${clip}/${frame}/${i}`);
            if (tail.velocities.some((v, i) => v !== velocity[i]))
              throw new Error('Zero-time velocity changed');
          }
          d.animation.camera('side', a.id);
          d.animation.render();
          return {
            id: a.id,
            position: { ...a.position },
            social: a.brain?.social,
            profile,
            clip,
            frames: 132,
            maxError,
            minFloor,
            maxRadius,
            maxQueries,
            maxEvaluations,
            maxStep,
            maxStepFrame,
            blocked,
            tucked,
            reasons,
            equipmentIntersections,
          };
        },
        { profile, clip },
      );
      sequences.push(result);
      console.log(
        `${profile}/${clip}: blocked ${result.blocked.length}, floor ${result.minFloor}, step ${result.maxStep}@${result.maxStepFrame}, reasons ${JSON.stringify(result.reasons)}`,
      );
      if (result.blocked.length) console.log({ position: result.position, social: result.social });
      if (
        profile === 'shieldbearer' &&
        ['travel', 'cards', 'formation', 'carry', 'death'].includes(clip)
      ) {
        await page.screenshot({ path: `test-results/tail-${clip}-side.png` });
        await page.evaluate((id) => {
          window.__dungeon.animation.camera('gameplay', id);
          window.__dungeon.animation.render();
        }, result.id);
        await page.screenshot({ path: `test-results/tail-${clip}-gameplay.png` });
      }
    }
  const edges = await page.evaluate(async () => {
    const renderPath = '/src/actorRendering.ts',
      actorPath = '/src/actors.ts';
    const { animateActors, resetActorRig } = (await import(
      renderPath
    )) as typeof import('../src/actorRendering.ts');
    const { teleportActor, requestDefense } = (await import(
      actorPath
    )) as typeof import('../src/actors.ts');
    const d = window.__dungeon,
      g = d.game,
      stage = window.tailStage!;
    const wall = [];
    for (const kind of ['wall', 'door'] as const) {
      const f = stage.fixture('shieldbearer', 'guard');
      f.advance(6);
      const a = g.combat.actor(f.id)!,
        b = a.entity.require('rigPose');
      const door = {
        id: 'tail-test-door',
        type: 'door' as const,
        axis: 'x' as const,
        x: a.position.x - 0.65,
        z: a.position.z,
        h: a.position.h,
        open: false,
        locked: false,
        requiresAltar: false,
      };
      const obstacle = {
        id: 'tail-test-wall',
        x: a.position.x - 0.5,
        z: a.position.z,
        w: 0.05,
        d: 2,
      };
      const world = {
        ...g.world,
        blockers: kind === 'wall' ? [...g.world.blockers, obstacle] : g.world.blockers,
        entities: kind === 'door' ? [...g.world.entities, door] : g.world.entities,
      };
      const limit = kind === 'wall' ? obstacle.x + obstacle.w / 2 : door.x + 0.175;
      let minimum = Infinity;
      for (let frame = 0; frame < 60; frame++) {
        animateActors(g.ecs, 1 / 60, frame / 60, world);
        if (b.tail!.blocked) throw new Error(`${kind}: no clear tail fallback`);
        for (const node of a.entity.require('rig').tail!)
          for (const mesh of node.getChildMeshes()) {
            node.computeWorldMatrix(true);
            mesh.computeWorldMatrix(true);
            minimum = Math.min(minimum, mesh.getBoundingInfo().boundingBox.minimumWorld.x - limit);
          }
      }
      if (minimum < -1e-5) throw new Error(`${kind}: drawn penetration ${minimum}`);
      const wasTucked = b.tail!.tucked;
      if (kind === 'door') {
        door.open = true;
        for (let frame = 0; frame < 180; frame++) animateActors(g.ecs, 1 / 60, frame / 60, world);
        if (b.tail!.blocked || b.tail!.tucked)
          throw new Error('Tail did not release after door opened');
      }
      teleportActor(a, g.world, { x: 0, z: 0 });
      resetActorRig(a.entity.require('rig'), a.position);
      if (b.tail!.velocities.some((v) => v !== 0)) throw new Error('Teleport retained inertia');
      if (!b.pose.world.every((v, i) => v === b.pose.previousWorld[i]))
        throw new Error('Reset retained tail history');
      wall.push({ kind, minimum, wasTucked });
    }
    const handoffs = [];
    for (const profile of ['shieldbearer', 'spearman'] as const) {
      const f = stage.fixture(profile, 'carry');
      f.advance(18);
      const a = g.combat.actor(f.id)!,
        b = a.entity.require('rigPose');
      a.attack.target = 'tail-test-threat';
      if (profile === 'shieldbearer') requestDefense(a);
      let blocked = 0;
      for (let frame = 0; frame < 90; frame++) {
        if (frame === 45) {
          a.attack.target = null;
          a.entity.get('defense')?.release();
        }
        f.advance(1);
        if (b.tail!.blocked) blocked++;
      }
      handoffs.push({ profile, blocked });
    }
    return { wall, handoffs };
  });
  await writeFile(
    'test-results/rig-tail-report.json',
    JSON.stringify({ population, sequences, edges, errors }, null, 2),
  );
  assert.deepEqual(errors, []);
  for (const s of sequences) {
    assert.ok(s.maxError < 1e-5, `${s.profile}/${s.clip}: FK ${s.maxError}`);
    assert.ok(s.minFloor >= -0.001, `${s.profile}/${s.clip}: floor ${s.minFloor}`);
    assert.equal(s.blocked.length, 0, `${s.profile}/${s.clip}: blocked ${s.blocked}`);
    assert.equal(s.equipmentIntersections, 0, `${s.profile}/${s.clip}: equipment intersections`);
    assert.ok(s.maxQueries <= 100 && s.maxEvaluations <= 104);
  }
  for (const h of edges.handoffs) assert.equal(h.blocked, 0, `${h.profile}: slung cargo conflict`);
  console.log(
    `PASS tails: ${sequences.length} sequences / ${sequences.length * 132} frames; all twelve rigs registered`,
  );
} finally {
  clearTimeout(deadline);
  await browser.close();
}
