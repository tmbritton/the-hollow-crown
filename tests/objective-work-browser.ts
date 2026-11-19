import { chromium, firefox } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { DebugWindow } from './browserTypes.ts';

declare const window: DebugWindow & {
  retiredWork: import('../src/objectiveWork.ts').ObjectiveWorkSystem;
};
const name = process.env.BROWSER || 'chromium';
const browser = await (name === 'firefox' ? firefox : chromium).launch({
  headless: true,
  ...(name === 'chromium'
    ? { args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
const checks: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
const pass = (check: string) => {
  checks.push(check);
  console.log(`PASS ${check}`);
};
const step = (frames = 1, codes: string[] = []) =>
  page.evaluate(({ frames, codes }) => window.__dungeon.step(codes, frames), { frames, codes });
const snapshot = () =>
  page.evaluate(() => {
    const g = window.__dungeon.game;
    return {
      objectives: g.ecs.get('run')!.require('objectives').snapshot(),
      hero: g.player.actor.entity.get('work')?.snapshot(),
      worker: g.combat.enemies[0].entity.get('work')?.snapshot(),
      steps: g.steps,
    };
  });
async function fixture(
  duration = 0.1,
  race = false,
  { capacity = race ? 1 : 64, heroDuration = duration, heroAmount = 1 } = {},
) {
  return page.evaluate(
    async ({ duration, race, capacity, heroDuration, heroAmount }) => {
      const path = '/src/objectiveWork.ts';
      const { installObjectiveWork }: typeof import('../src/objectiveWork.ts') = await import(path);
      const actorPath = '/src/actors.ts';
      const { stopActor }: typeof import('../src/actors.ts') = await import(actorPath);
      const d = window.__dungeon,
        g = d.game;
      g.ecs.get('run')!.remove('lastEmber');
      for (const actor of g.combat.enemies) {
        actor.entity.remove('brain');
        stopActor(actor);
        actor.attack.reset();
        Object.assign(actor.position, { x: 1000, z: 1000, h: 0 });
      }
      d.teleport(0, 0);
      const worker = g.combat.enemies[0];
      Object.assign(worker.position, { x: 3, z: 0, h: 0 });
      worker.health.current = worker.health.max;
      worker.entity.remove('corpse');
      g.ecs
        .get('room:entrance')!
        .add('workSite', { approach: { x: 0, z: 0, h: 0 }, radius: 0.2, enabled: true });
      g.ecs
        .get('room:crypt')!
        .add('workSite', { approach: { x: 3, z: 0, h: 0 }, radius: 0.2, enabled: true });
      const work = installObjectiveWork(
        g.ecs,
        g.world,
        {
          objectives: [
            {
              id: 'hero',
              owner: { kind: 'player', id: 'player' },
              participants: [g.player.actor.id],
              capacity,
              announceOnActivation: false,
              dependencies: [],
              outcomes: { completed: 'hero-done', thwarted: 'hero-stopped' },
            },
            {
              id: 'enemy',
              owner: { kind: 'actor', id: worker.id },
              participants: [worker.id],
              capacity,
              announceOnActivation: true,
              dependencies: [],
              outcomes: { completed: 'enemy-done', thwarted: 'enemy-stopped' },
            },
          ],
          races: race
            ? [
                {
                  id: 'race',
                  playerObjectiveId: 'hero',
                  monsterObjectiveId: 'enemy',
                  outcomes: {
                    playerFirst: 'restored',
                    monsterFirst: 'corrupted',
                    contested: 'fractured',
                  },
                },
              ]
            : [],
        },
        [
          {
            objectiveId: 'hero',
            siteId: 'room:entrance',
            duration: heroDuration,
            amount: heroAmount,
          },
          { objectiveId: 'enemy', siteId: 'room:crypt', duration },
        ],
      );
      work.activate('hero', 'enemy');
      d.step([], 1);
      work.assign(g.player.actor, 'hero');
      work.assign(worker, 'enemy');
      return worker.id;
    },
    { duration, race, capacity, heroDuration, heroAmount },
  );
}

try {
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  await page.evaluate(() => window.__dungeon.engine.stopRenderLoop());
  await fixture(2.3, true, { capacity: 3, heroDuration: 6.9, heroAmount: 3 });
  const decimalActivationStep = (await snapshot()).steps;
  await step(413);
  const beforeDecimalBoundary = await snapshot();
  assert.deepEqual(
    beforeDecimalBoundary.objectives.objectives.map((o) => o.progress),
    [2, 0],
  );
  assert.deepEqual(beforeDecimalBoundary.objectives.outcomes, []);
  assert.equal(beforeDecimalBoundary.hero!.status, 'working');
  await step();
  const decimalBoundary = await snapshot();
  assert.deepEqual(
    decimalBoundary.objectives.outcomes.map((o) => o.id),
    ['fractured'],
    JSON.stringify(decimalBoundary),
  );
  assert.ok(
    decimalBoundary.objectives.objectives.every(
      (o) => o.progress === 3 && o.status === 'contested',
    ),
  );
  assert.equal(decimalBoundary.steps, decimalActivationStep + 414);
  assert.equal(
    decimalBoundary.objectives.contributions.filter((c) => c.step === decimalBoundary.steps).length,
    2,
  );
  await step(60);
  assert.deepEqual((await snapshot()).objectives.outcomes, decimalBoundary.objectives.outcomes);
  pass('6.9-second action and three 2.3-second actions tie exactly on work step 414');
  await fixture(1, true, { capacity: 3, heroDuration: 3, heroAmount: 3 });
  const activationStep = (await snapshot()).steps;
  await step(179);
  const beforeTimingBoundary = await snapshot();
  assert.equal(
    beforeTimingBoundary.objectives.objectives.find((o) => o.id === 'hero')!.progress,
    0,
  );
  assert.equal(
    beforeTimingBoundary.objectives.objectives.find((o) => o.id === 'enemy')!.progress,
    2,
  );
  assert.deepEqual(beforeTimingBoundary.objectives.outcomes, []);
  assert.equal(beforeTimingBoundary.hero!.status, 'working');
  await step();
  const timingBoundary = await snapshot();
  assert.deepEqual(
    timingBoundary.objectives.outcomes.map((o) => o.id),
    ['fractured'],
    JSON.stringify(timingBoundary),
  );
  assert.ok(
    timingBoundary.objectives.objectives.every((o) => o.progress === 3 && o.status === 'contested'),
  );
  assert.equal(timingBoundary.steps, activationStep + 180);
  assert.equal(
    timingBoundary.objectives.contributions.filter((c) => c.step === timingBoundary.steps).length,
    2,
  );
  await step(60);
  assert.deepEqual((await snapshot()).objectives.outcomes, timingBoundary.objectives.outcomes);
  pass(
    'Three-second action and three one-second actions tie exactly on step 180 through the runtime commit boundary',
  );
  await fixture();
  await step(6);
  assert.deepEqual(
    (await snapshot()).objectives.objectives.map((o) => o.progress),
    [1, 1],
    JSON.stringify(await snapshot()),
  );
  pass('Runtime prework/commit phases advance real ECS assignments');

  await step(5);
  await page.keyboard.down('w');
  await step(1, ['KeyW']);
  await page.keyboard.up('w');
  assert.equal((await snapshot()).objectives.objectives.find((o) => o.id === 'hero')!.progress, 1);
  assert.equal((await snapshot()).hero, undefined);
  pass('Real keyboard movement cancels an almost-complete hero cycle');

  await fixture(0.5);
  await step(10);
  const beforeMenu = await snapshot();
  await page.keyboard.press('Escape');
  await step(120);
  const paused = await snapshot();
  assert.equal(paused.steps, beforeMenu.steps);
  assert.equal(paused.hero, undefined);
  assert.deepEqual(paused.worker, beforeMenu.worker);
  await page.keyboard.press('Escape');
  await step(20);
  assert.equal((await snapshot()).objectives.objectives.find((o) => o.id === 'enemy')!.progress, 1);
  pass('Menu cancels hero work and freezes enemy simulation without catching up');

  await fixture(0.5);
  await step(10);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal((await snapshot()).hero, undefined);
  await step(20);
  assert.equal((await snapshot()).objectives.objectives.find((o) => o.id === 'enemy')!.progress, 1);
  pass('Focus loss cancels hero work; visible unfocused simulation follows existing policy');

  await fixture(0.5);
  await step(10);
  const beforeHide = await snapshot();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await step(120);
  assert.equal((await snapshot()).steps, beforeHide.steps);
  assert.equal((await snapshot()).hero, undefined);
  assert.deepEqual((await snapshot()).worker, beforeHide.worker);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await step(20);
  assert.equal((await snapshot()).objectives.objectives.find((o) => o.id === 'enemy')!.progress, 1);
  pass('Hidden-tab listener freezes the whole simulation and resumes without wall-clock credit');

  await fixture(0.5);
  await page.evaluate(() => {
    const d = window.__dungeon,
      g = d.game;
    const e = g.world.entities.find((e) => e.type === 'portrait')!;
    if (e.type !== 'portrait') throw new Error('Missing portrait');
    d.teleport(e.x - e.wallDirection[0] * 1.5, e.z - e.wallDirection[1] * 1.5);
    g.ecs.get('room:entrance')!.require('workSite').approach = { ...g.player.actor.position };
    g.ecs.get('run')!.require('objectiveWork').assign(g.player.actor, 'hero');
  });
  await step(10);
  const beforeInspect = await snapshot();
  assert.ok(beforeInspect.hero?.cycleId);
  await page.keyboard.press('e');
  assert.equal(await page.evaluate(() => window.__dungeon.game.inspection.active), true);
  await step(120);
  assert.equal((await snapshot()).steps, beforeInspect.steps);
  assert.equal((await snapshot()).hero, undefined);
  assert.deepEqual((await snapshot()).worker, beforeInspect.worker);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__dungeon.game.inspection.update(1));
  await step(20);
  assert.equal((await snapshot()).objectives.objectives.find((o) => o.id === 'enemy')!.progress, 1);
  pass('Real portrait E inspection cancels hero work and suspends enemy cycles');

  await fixture(0.5);
  await page.evaluate(() => {
    const d = window.__dungeon,
      g = d.game;
    d.teleport(2, 0);
    g.ecs.get('room:entrance')!.require('workSite').approach = { ...g.player.actor.position };
    g.ecs.get('run')!.require('objectiveWork').assign(g.player.actor, 'hero');
  });
  await step(20);
  const attackPoint = await page.evaluate(() => {
    const d = window.__dungeon,
      g = d.game,
      worker = g.combat.enemies[0];
    const V = g.camera.target.constructor as typeof Vector3;
    const M = g.camera.getWorldMatrix().constructor as typeof Matrix;
    g.scene.render();
    const p = V.Project(
      new V(worker.position.x, worker.position.h + 1, worker.position.z),
      M.Identity(),
      g.scene.getTransformMatrix(),
      g.camera.viewport.toGlobal(d.engine.getRenderWidth(), d.engine.getRenderHeight()),
    );
    return { x: p.x, y: p.y };
  });
  await page.mouse.click(attackPoint.x, attackPoint.y);
  assert.equal((await snapshot()).hero, undefined);
  await step(18);
  assert.equal(
    await page.evaluate(() => window.__dungeon.game.combat.enemies[0].health.current),
    24,
  );
  assert.equal((await snapshot()).objectives.objectives.find((o) => o.id === 'enemy')!.progress, 1);
  assert.equal((await snapshot()).objectives.objectives.find((o) => o.id === 'hero')!.progress, 0);
  await page.keyboard.press('x');
  const resumed = (await snapshot()).worker!.cycleId;
  await step(30);
  const resumedRecord = (await snapshot()).objectives;
  assert.equal(resumedRecord.objectives.find((o) => o.id === 'enemy')!.progress, 2);
  assert.notEqual(resumedRecord.contributions[0].id, resumed);
  assert.equal(resumedRecord.contributions[1].id, resumed);
  pass(
    'Real click attack cancels hero work; nonlethal impact interrupts worker, retaining earlier credit and resuming fresh',
  );

  await fixture(0.5);
  await step(29);
  const moved = await page.evaluate(() => {
    const d = window.__dungeon,
      g = d.game,
      actor = g.combat.enemies[0];
    // An assigned idle worker now services its job; a nearby threat must still win priority.
    d.teleport(0, 0);
    const before = { ...actor.position };
    actor.enableAI();
    actor.brain!.think = 0;
    d.step([], 1);
    return Math.hypot(actor.position.x - before.x, actor.position.z - before.z);
  });
  assert.ok(moved > 0);
  assert.equal((await snapshot()).objectives.objectives.find((o) => o.id === 'enemy')!.progress, 0);
  assert.equal((await snapshot()).worker!.elapsed, 0);
  pass('Real species AI/motor movement on the last work step prevents credit');

  await fixture();
  const doorId = await page.evaluate(() => {
    const d = window.__dungeon,
      g = d.game;
    const door = g.world.entities.find((e) => e.type === 'door' && !e.locked)!;
    if (door.type !== 'door') throw new Error('Missing ordinary door');
    door.open = false;
    if (door.collider) door.collider.checkCollisions = true;
    const side = {
      x: door.x - (door.axis === 'x' ? 0.7 : 0),
      z: door.z - (door.axis === 'z' ? 0.7 : 0),
    };
    const across = {
      x: door.x + (door.axis === 'x' ? 0.7 : 0),
      z: door.z + (door.axis === 'z' ? 0.7 : 0),
      h: door.h,
    };
    d.teleport(side.x, side.z);
    Object.assign(g.ecs.get('room:entrance')!.require('workSite'), {
      approach: across,
      radius: 1.5,
    });
    g.ecs.get('run')!.require('objectiveWork').assign(g.player.actor, 'hero');
    return door.id;
  });
  await step(60);
  assert.equal((await snapshot()).objectives.objectives.find((o) => o.id === 'hero')!.progress, 0);
  assert.match((await snapshot()).hero!.reason!, /obstructed/);
  await page.keyboard.press('e');
  assert.equal(
    await page.evaluate((id) => window.__dungeon.game.ecs.get(id)!.require('door').open, doorId),
    true,
  );
  await step(60);
  assert.ok((await snapshot()).objectives.objectives.find((o) => o.id === 'hero')!.progress > 0);
  pass(
    'Generated closed door blocks nearby work until real E opening releases its physical collider',
  );

  await fixture();
  await page.evaluate(() => {
    const d = window.__dungeon,
      g = d.game;
    const blocker = g.world.blockers.find((b) => Math.hypot(b.x, b.z) < 7)!;
    g.ecs.get('room:entrance')!.require('workSite').approach = { x: blocker.x, z: blocker.z, h: 0 };
    d.teleport(blocker.x + blocker.w / 2 + 0.5, blocker.z);
    g.ecs.get('room:entrance')!.require('workSite').radius = 2;
    g.ecs.get('run')!.require('objectiveWork').assign(g.player.actor, 'hero');
  });
  await step(6);
  assert.equal((await snapshot()).objectives.objectives.find((o) => o.id === 'hero')!.progress, 0);
  assert.match((await snapshot()).hero!.reason!, /obstructed/);
  pass('An actual generated solid furnishing cannot serve as a reachable work face');
  await page.evaluate(() => {
    const d = window.__dungeon,
      g = d.game;
    d.teleport(g.world.roomById.altar.x, g.world.roomById.altar.z);
    g.camera.target.copyFrom(g.player.root.position);
    g.scene.render();
  });
  await step(6);
  assert.equal((await snapshot()).objectives.objectives.find((o) => o.id === 'enemy')!.progress, 2);
  assert.equal(
    (await snapshot()).objectives.objectives.find((o) => o.id === 'enemy')!.visible,
    true,
  );
  assert.equal((await snapshot()).objectives.objectives.find((o) => o.id === 'hero')!.progress, 0);
  pass('Off-screen enemy work uses physical eligibility and keeps its activation announcement');

  await fixture(0.1);
  await step(6);
  await step(5);
  await page.evaluate(() => window.__dungeon.teleport(0, 0));
  assert.equal((await snapshot()).hero, undefined);
  await step(1);
  assert.equal((await snapshot()).objectives.objectives.find((o) => o.id === 'hero')!.progress, 1);
  await page.evaluate(() => {
    const g = window.__dungeon.game;
    g.ecs.get('run')!.require('objectiveWork').assign(g.player.actor, 'hero');
  });
  await step(5);
  await page.evaluate(() =>
    window.__dungeon.game.combat.damage(window.__dungeon.game.player.actor, 1000),
  );
  await step();
  assert.equal((await snapshot()).hero, undefined);
  assert.equal(await page.evaluate(() => window.__dungeon.game.player.health), 100);
  assert.equal((await snapshot()).objectives.objectives.find((o) => o.id === 'hero')!.progress, 1);
  pass(
    'Teleport and checkpoint respawn discard unfinished hero work and preserve committed progress',
  );

  await fixture(1 / 60);
  await page.evaluate(() => {
    const d = window.__dungeon,
      g = d.game,
      worker = g.combat.enemies[0];
    d.teleport(2, 0);
    worker.health.current = 9;
    assertBrowser(g.combat.startAttack(g.player.actor, worker));
    g.player.actor.attack.advance(0.24);
    function assertBrowser(value: boolean) {
      if (!value) throw new Error('Expected ordinary attack');
    }
  });
  await step();
  const killed = await snapshot();
  assert.equal(await page.evaluate(() => window.__dungeon.game.combat.enemies[0].alive), false);
  assert.equal(killed.objectives.objectives.find((o) => o.id === 'enemy')!.progress, 0);
  assert.equal(killed.objectives.objectives.find((o) => o.id === 'enemy')!.status, 'thwarted');
  pass('Real melee impact kills the worker on its completion boundary before credit');

  await fixture(1 / 60, true);
  await page.evaluate(() => {
    const g = window.__dungeon.game,
      worker = g.combat.enemies[0];
    const killer = g.combat.enemies.find((a) => a.kind === 'goblin')!;
    Object.assign(killer.position, { x: 3, z: -1, h: 0 });
    worker.health.current = 6;
    if (!g.combat.startAttack(killer, worker)) throw new Error('Third-party attack must start');
    killer.attack.advance(0.24);
  });
  await step();
  const race = (await snapshot()).objectives;
  assert.equal(race.objectives.find((o) => o.id === 'enemy')!.progress, 0);
  assert.equal(race.objectives.find((o) => o.id === 'hero')!.status, 'completed');
  assert.deepEqual(
    race.contributions.map((c) => c.objectiveId),
    ['hero'],
  );
  assert.ok(race.outcomes.some((o) => o.id === 'restored'));
  assert.ok(race.outcomes.every((o) => o.id !== 'fractured'));
  pass(
    'Two ready race cycles plus a real third-party lethal impact resolve player-first, never a false tie',
  );

  await page.evaluate(() => {
    window.retiredWork = window.__dungeon.game.ecs.get('run')!.require('objectiveWork');
    window.__dungeon.regenerate('MOURNING-731');
  });
  await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
  assert.ok(
    await page.evaluate(() => {
      const record = window.__dungeon.game.ecs.get('run')!.require('objectives').snapshot();
      return (
        record.objectives.length === 4 &&
        record.objectives.every((o) => o.id.startsWith('ember:') && o.progress === 0)
      );
    }),
  );
  assert.equal(await page.evaluate(() => window.__dungeon.game.ecs.query('work').length), 0);
  assert.equal(
    await page.evaluate(() => {
      try {
        window.retiredWork.advance(100000, 1 / 60);
        return false;
      } catch {
        return true;
      }
    }),
    true,
    'A retained system must reject stale simulation callbacks after regeneration',
  );
  pass(
    'Regeneration retires the fixture and assignments, replacing them with fresh Last Ember clocks',
  );
  assert.deepEqual(errors, []);
  await mkdir('test-results', { recursive: true });
  await writeFile(
    `test-results/${name}-objective-work.json`,
    JSON.stringify(
      {
        checks,
        errors,
        timingRace: { before: beforeTimingBoundary, boundary: timingBoundary },
        decimalRace: { before: beforeDecimalBoundary, boundary: decimalBoundary },
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
