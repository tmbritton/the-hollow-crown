import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECS, Entity } from '../src/ecs.ts';
import { createActor, moveActor, requestJump, stopActor, teleportActor } from '../src/actors.ts';
import { CombatSystem } from '../src/combat.ts';
import { Health } from '../src/machines/actors/health.ts';
import { Statechart } from '../src/machines/statechart.ts';
import { WorkAction, workMachine } from '../src/machines/actors/work.ts';
import { installObjectiveWork } from '../src/objectiveWork.ts';
import type { ObjectivePlan } from '../src/objectives.ts';
import type { NavigationWorld } from '../src/navigation.ts';
import type { DoorEntity, Tile } from '../src/worldTypes.ts';

const DT = 1 / 60;
function workClock(duration: number) {
  const work = new WorkAction(new Entity('clock-worker'), 'clock-objective');
  work.chart.send({ type: 'START', id: 'clock-cycle', duration });
  return work;
}
function fixture(
  duration = 3 * DT,
  race = false,
  { capacity = race ? 1 : 4, heroDuration = duration, heroAmount = 1 } = {},
) {
  const ecs = new ECS();
  ecs.create('run');
  const tiles = new Map<string, Tile>();
  for (let x = -5; x <= 5; x++)
    for (let z = -5; z <= 5; z++) tiles.set(`${x},${z}`, { x, z, h: 0, surface: 'stone' });
  const door: DoorEntity = {
    id: 'door',
    type: 'door',
    x: 0.6,
    z: 0,
    h: 0,
    axis: 'x',
    open: true,
    locked: false,
    requiresAltar: false,
    room: 'entrance',
  };
  const world: NavigationWorld = { tiles, blockers: [], entities: [door] };
  const player = createActor(ecs, world, 'player', 'player', { x: -3, z: 0, h: 0 });
  const worker = createActor(ecs, world, 'worker', 'goblin', { x: 0, z: 0, h: 0 });
  const survivor = createActor(ecs, world, 'survivor', 'goblin', { x: 3, z: 3, h: 0 });
  const site = ecs
    .create('site')
    .add('transform', { x: 1, z: 0, h: 0, heading: 0 })
    .add('workSite', { approach: { x: 1, z: 0, h: 0 }, radius: 1.1, enabled: true });
  ecs.create('hero-site').add('workSite', {
    approach: { x: -3, z: 0, h: 0 },
    radius: 0.2,
    enabled: true,
  });
  const resource = ecs.create('focus').add('health', new Health(10));
  let available = true;
  const plan: ObjectivePlan = {
    objectives: [
      {
        id: 'enemy',
        owner: { kind: 'group', id: 'pack' },
        participants: ['worker', 'survivor'],
        capacity,
        announceOnActivation: true,
        dependencies: ['focus'],
        outcomes: { completed: 'enemy-done', thwarted: 'enemy-stopped' },
      },
      {
        id: 'hero',
        owner: { kind: 'player', id: 'player' },
        participants: ['player'],
        capacity,
        announceOnActivation: false,
        dependencies: [],
        outcomes: { completed: 'hero-done', thwarted: 'hero-stopped' },
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
  };
  const work = installObjectiveWork(ecs, world, plan, [
    {
      objectiveId: 'enemy',
      siteId: 'site',
      duration,
      availability: () => ({ available, revision: resource.require('health').current }),
    },
    { objectiveId: 'hero', siteId: 'hero-site', duration: heroDuration, amount: heroAmount },
  ]);
  const record = ecs.get('run')!.require('objectives');
  const combat = new CombatSystem(ecs, world, [player, worker, survivor]);
  let step = 0;
  const tick = (between: () => void = () => {}) => {
    work.advance(++step, DT);
    between();
    return work.commit(step);
  };
  work.activate('enemy', 'hero');
  tick(); // Activation commits before work can begin.
  assert.equal(work.assign(worker, 'enemy'), true);
  return {
    ecs,
    world,
    player,
    worker,
    survivor,
    site,
    resource,
    door,
    work,
    record,
    combat,
    tick,
    changeResource: () => resource.require('health').damage(1),
    setAvailable: (value: boolean) => {
      available = value;
    },
  };
}

test('physical cycles take simulation duration, commit once, and expose detached ECS snapshots', () => {
  const f = fixture();
  f.tick();
  const snapshot = f.worker.entity.require('work').snapshot();
  assert.equal(snapshot.elapsed, DT);
  assert.ok(snapshot.cycleId);
  snapshot.elapsed = 99;
  assert.equal(f.worker.entity.require('work').snapshot().elapsed, DT);
  f.tick();
  assert.equal(f.record.get('enemy').progress, 0);
  f.tick();
  assert.equal(f.record.get('enemy').progress, 1);
  assert.throws(() => f.work.commit(4), /step|boundary/i);
  f.tick();
  f.tick();
  f.tick();
  const history = f.record.snapshot().contributions;
  assert.equal(history.length, 2);
  assert.notEqual(history[0].id, history[1].id);
  assert.equal(f.record.get('enemy').visible, true);
  assert.equal(f.record.get('hero').visible, false);
});

test('three-second work completes on tick 180, never 179 or 181', () => {
  const chart = new Statechart(workMachine);
  chart.send({ type: 'START', id: 'three-seconds', duration: 3 });
  for (let tick = 1; tick < 180; tick++) {
    chart.send({ type: 'TICK', dt: DT });
    assert.equal(chart.snapshot.value, 'working', `early completion on tick ${tick}`);
  }
  chart.send({ type: 'TICK', dt: DT });
  assert.equal(chart.snapshot.value, 'ready', JSON.stringify(chart.snapshot.context));
  assert.equal(chart.snapshot.context.units / 60, 3);
});

test('longer work durations complete at their exact 60 Hz boundary', () => {
  const late: { duration: number; elapsed: number }[] = [];
  // Keep the two previously failing decimal boundaries in the everyday suite even when
  // the 1,200-duration sweep and every-tick model replay are selected separately.
  for (const duration of [3.7, 6.9, 4, 5, 6, 8, 25, 30, 60, 120]) {
    const chart = new Statechart(workMachine);
    chart.send({ type: 'START', id: 'long-work', duration });
    const ticks = Math.round(duration * 60);
    for (let tick = 1; tick <= ticks; tick++) {
      chart.send({ type: 'TICK', dt: DT });
      if (tick < ticks) assert.equal(chart.snapshot.value, 'working');
    }
    if (!chart.snapshot.matches('ready'))
      late.push({ duration, elapsed: chart.snapshot.context.units / 60 });
  }
  assert.deepEqual(late, []);
});

test('unfinished work is not rounded up, even immediately below its duration', () => {
  for (const duration of [3, 120]) {
    const chart = new Statechart(workMachine);
    chart.send({ type: 'START', id: 'incomplete', duration });
    // The previous representable double is genuinely less work, not accumulated tick drift.
    const gap = duration === 3 ? 2 * Number.EPSILON : 64 * Number.EPSILON;
    chart.send({ type: 'TICK', dt: duration - gap });
    assert.equal(chart.snapshot.value, 'working', `rounded up ${duration - gap} to ${duration}`);
    chart.send({ type: 'TICK', dt: gap });
    assert.equal(chart.snapshot.value, 'ready');
  }
  const chart = new Statechart(workMachine);
  chart.send({ type: 'START', id: 'partial-final-step', duration: 3 });
  for (let tick = 0; tick < 179; tick++) chart.send({ type: 'TICK', dt: DT });
  chart.send({ type: 'TICK', dt: DT / 2 });
  assert.equal(chart.snapshot.value, 'working', 'half the last frame is still unfinished work');
  chart.send({ type: 'TICK', dt: DT / 2 });
  assert.equal(chart.snapshot.value, 'ready');
});

test('equal total work time ties a three-second/three-credit action with three one-second actions', () => {
  const f = fixture(1, true, { capacity: 3, heroDuration: 3, heroAmount: 3 });
  assert.equal(f.work.assign(f.player, 'hero'), true);
  for (let tick = 0; tick < 179; tick++) f.tick();
  assert.equal(f.record.get('hero').progress, 0);
  assert.equal(f.record.get('enemy').progress, 2);
  assert.deepEqual(f.record.snapshot().outcomes, []);
  const result = f.tick();
  assert.deepEqual(
    result.outcomes.map((o) => o.id),
    ['fractured'],
  );
  assert.deepEqual(
    f.record.snapshot().objectives.map((o) => [o.progress, o.status]),
    [
      [3, 'contested'],
      [3, 'contested'],
    ],
  );
  assert.deepEqual(
    f.record
      .snapshot()
      .contributions.map((c) => [c.step, c.credited])
      .sort(),
    [
      [61, 1],
      [121, 1],
      [181, 1],
      [181, 3],
    ].sort(),
  );
});

test('decimal equal-time race ties 6.9 seconds at three credits with three 2.3-second cycles', () => {
  const f = fixture(2.3, true, { capacity: 3, heroDuration: 6.9, heroAmount: 3 });
  assert.equal(f.work.assign(f.player, 'hero'), true);
  for (let tick = 0; tick < 413; tick++) f.tick();
  assert.equal(f.record.get('hero').progress, 0);
  assert.equal(f.record.get('enemy').progress, 2);
  assert.deepEqual(f.record.snapshot().outcomes, []);
  const result = f.tick();
  assert.deepEqual(
    result.outcomes.map((o) => o.id),
    ['fractured'],
  );
  assert.ok(
    f.record.snapshot().objectives.every((o) => o.progress === 3 && o.status === 'contested'),
  );
  assert.equal(f.record.snapshot().contributions.filter((c) => c.step === 415).length, 2);
});

test('[extended] 1,200 authored decimal durations finish at the exact 60 Hz boundary, including 3.7 and 6.9', () => {
  const failures: { duration: number; status: string; elapsed: number }[] = [];
  for (let tenths = 1; tenths <= 1200; tenths++) {
    const duration = tenths / 10,
      ticks = tenths * 6;
    const work = workClock(duration);
    for (let tick = 1; tick < ticks; tick++) work.chart.send({ type: 'TICK', dt: DT });
    assert.equal(work.snapshot().status, 'working', `${duration} completed before tick ${ticks}`);
    work.chart.send({ type: 'TICK', dt: DT });
    const { status, elapsed } = work.snapshot();
    if (status !== 'ready' || elapsed !== duration) failures.push({ duration, status, elapsed });
  }
  assert.deepEqual(failures, []);
});

test('step conversion preserves genuinely partial time around rounded multiplication boundaries', () => {
  // Raw multiplication by 60 collapses these distinct inputs to the same unit value.
  const duration = 23 / 60,
    gap = Number.EPSILON / 4;
  assert.equal((duration - gap) * 60, duration * 60);
  const partial = workClock(duration);
  partial.chart.send({ type: 'TICK', dt: duration - gap });
  assert.equal(partial.snapshot().status, 'working');
  partial.chart.send({ type: 'TICK', dt: gap });
  assert.equal(partial.snapshot().status, 'ready');

  const boundary = 11 / 60,
    extra = Number.EPSILON / 8;
  assert.equal((boundary + extra) * 60, 11);
  const longer = workClock(boundary + extra);
  for (let tick = 0; tick < 11; tick++) longer.chart.send({ type: 'TICK', dt: DT });
  assert.equal(
    longer.snapshot().status,
    'working',
    'authored time above the boundary is not rounded down',
  );
  longer.chart.send({ type: 'TICK', dt: extra });
  assert.equal(longer.snapshot().status, 'ready');

  const decimal = workClock(6.9);
  for (let tick = 0; tick < 413; tick++) decimal.chart.send({ type: 'TICK', dt: DT });
  decimal.chart.send({ type: 'TICK', dt: DT / 2 });
  assert.equal(decimal.snapshot().status, 'working');
  decimal.chart.send({ type: 'TICK', dt: DT / 2 });
  assert.equal(decimal.snapshot().status, 'ready');
});

test('fractional carry resets across interrupted, blocked, cancelled and settled work cycles', () => {
  for (const type of ['INTERRUPT', 'BLOCK', 'CANCEL', 'SETTLE'] as const) {
    const work = workClock(2.3);
    for (let tick = 0; tick < 3; tick++) work.chart.send({ type: 'TICK', dt: 1 / 7 });
    if (type === 'SETTLE') work.chart.send({ type: 'TICK', dt: 2.3 });
    work.chart.send({ type, reason: 'Restart' });
    assert.equal(work.chart.snapshot.context.compensation, 0);
    work.chart.send({ type: 'START', id: 'new-cycle', duration: 6.9 });
    for (let tick = 0; tick < 413; tick++) work.chart.send({ type: 'TICK', dt: DT });
    assert.equal(work.snapshot().status, 'working');
    work.chart.send({ type: 'TICK', dt: DT });
    assert.equal(work.snapshot().status, 'ready', type);
    assert.equal(work.snapshot().elapsed, 6.9);
  }
});

test('one assignment and declared roster only; a survivor must physically reach the site', () => {
  const f = fixture(DT);
  assert.equal(f.work.assign(f.worker, 'enemy'), false);
  assert.equal(f.work.assign(f.worker, 'hero'), false);
  assert.equal(f.work.assign(f.player, 'enemy'), false);
  assert.equal(f.work.assign(f.survivor, 'enemy'), true);
  f.combat.damage(f.worker, 100);
  f.tick();
  assert.equal(f.record.get('enemy').progress, 0);
  assert.equal(f.record.get('enemy').status, 'unresolved');
  teleportActor(f.survivor, f.world, { x: 1, z: 0 });
  assert.equal(f.work.assign(f.survivor, 'enemy'), true);
  f.tick();
  assert.equal(f.record.get('enemy').progress, 1);
  f.combat.damage(f.survivor, 100);
  f.tick();
  assert.equal(f.record.get('enemy').status, 'thwarted');
  assert.equal(f.record.get('enemy').progress, 1);
});

test('real movement interrupts at the commit boundary; returning starts a fresh full cycle', () => {
  const f = fixture();
  f.tick();
  f.tick();
  const old = f.worker.entity.require('work').snapshot().cycleId;
  f.tick(() => moveActor(f.worker, f.world, { direction: { x: 0, z: 1 } }, DT));
  assert.ok(f.worker.position.z > 0);
  assert.equal(f.record.get('enemy').progress, 0);
  assert.equal(f.worker.entity.require('work').snapshot().elapsed, 0);
  teleportActor(f.worker, f.world, { x: 0, z: 0 });
  f.work.assign(f.worker, 'enemy');
  f.tick();
  assert.notEqual(f.worker.entity.require('work').snapshot().cycleId, old);
  f.tick();
  assert.equal(f.record.get('enemy').progress, 0);
  f.tick();
  assert.equal(f.record.get('enemy').progress, 1);
});

test('attacks, nonlethal damage and jumps interrupt even when they finish before the boundary', () => {
  for (const interrupt of ['attack', 'hit', 'jump'] as const) {
    const f = fixture(DT);
    f.player.position.x = -1;
    f.tick(() => {
      if (interrupt === 'attack') {
        assert.equal(f.combat.startAttack(f.worker, f.player), true);
        f.worker.attack.advance(1);
        f.worker.attack.cancel();
      } else if (interrupt === 'hit') f.combat.damage(f.worker, 1, f.player);
      else {
        requestJump(f.worker);
        f.worker.jump.advance(2);
      }
    });
    assert.equal(f.record.get('enemy').progress, 0, interrupt);
  }
});

test('ordinary impact kills on a completion step: no dead-worker credit and no false tie', () => {
  const f = fixture(DT, true);
  f.player.position.x = -1;
  f.worker.health.current = 9;
  assert.equal(f.combat.startAttack(f.player, f.worker), true);
  f.player.attack.advance(0.24);
  f.tick(() => f.combat.update(DT));
  assert.equal(f.worker.alive, false);
  assert.equal(f.record.get('enemy').progress, 0);
  assert.equal(f.record.snapshot().outcomes.length, 0);
  teleportActor(f.player, f.world, { x: -3, z: 0 });
  f.work.assign(f.player, 'hero');
  f.tick();
  assert.equal(f.record.get('hero').status, 'completed');
});

test('simultaneous physical completions batch to the authored contested outcome', () => {
  const f = fixture(DT, true);
  f.work.assign(f.player, 'hero');
  const result = f.tick();
  assert.deepEqual(
    result.outcomes.map((o) => o.id),
    ['fractured'],
  );
  assert.equal(f.record.get('enemy').status, 'contested');
  assert.equal(f.record.get('hero').status, 'contested');
});

test('a third-party same-step kill rejects only the dead rival in a real simultaneous race', () => {
  const f = fixture(DT, true);
  f.work.assign(f.player, 'hero');
  const killer = createActor(f.ecs, f.world, 'killer', 'skeleton', { x: 0, z: -1, h: 0 });
  f.worker.health.current = 9;
  assert.equal(f.combat.startAttack(killer, f.worker), true);
  killer.attack.advance(0.24);
  const result = f.tick(() => f.combat.update(DT));
  assert.equal(f.worker.alive, false);
  assert.equal(f.record.get('enemy').progress, 0);
  assert.equal(f.record.get('hero').progress, 1);
  assert.deepEqual(
    result.outcomes.map((o) => o.id),
    ['restored'],
  );
});

test('ordinary navigation reaches a work site, but travel never counts as working time', () => {
  const f = fixture(DT);
  f.worker.position.z = -3;
  assert.ok(f.worker.navigator.goTo(f.worker.position, { x: 1, z: 0 }));
  for (let i = 0; i < 300 && f.worker.navigator.active; i++) {
    f.tick(() => moveActor(f.worker, f.world, {}, DT));
    assert.equal(f.record.get('enemy').progress, 0);
  }
  assert.equal(f.worker.navigator.active, false);
  for (let i = 0; i < 10 && !f.record.get('enemy').progress; i++)
    f.tick(() => moveActor(f.worker, f.world, {}, DT));
  assert.equal(f.record.get('enemy').progress, 1);
});

test('closing access at the boundary cancels partial and completed cycles; pause retains elapsed', () => {
  for (const duration of [DT, 3 * DT]) {
    const f = fixture(duration);
    f.tick(() => {
      f.door.open = false;
    });
    assert.equal(f.record.get('enemy').progress, 0);
    assert.equal(f.worker.entity.require('work').snapshot().elapsed, 0);
    f.door.open = true;
    f.tick();
    const paused = f.worker.entity.require('work').snapshot();
    // No simulation calls while paused: snapshots do not advance a clock.
    for (let i = 0; i < 120; i++)
      assert.deepEqual(f.worker.entity.require('work').snapshot(), paused);
    if (duration > DT) {
      f.tick();
      assert.equal(f.record.get('enemy').progress, 0);
      f.tick();
      assert.equal(f.record.get('enemy').progress, 1);
    }
  }
});

test('resource revision, prerequisites and permanent dependency loss revalidate unfinished work', () => {
  const f = fixture(DT);
  f.tick();
  f.tick(f.changeResource);
  assert.equal(f.record.get('enemy').progress, 1);
  f.tick(() => f.setAvailable(false));
  assert.equal(f.record.get('enemy').progress, 1);
  f.setAvailable(true);
  f.tick();
  assert.equal(f.record.get('enemy').progress, 2);
  f.tick(() => f.resource.require('health').damage(10));
  assert.equal(f.record.get('enemy').status, 'thwarted');
  assert.equal(f.record.get('enemy').progress, 2);
});

test('closed doors, solid approaches, living occupancy, unsupported height and flight block work', () => {
  for (const obstruction of ['door', 'prop', 'body', 'height', 'jump', 'disabled'] as const) {
    const f = fixture(DT);
    if (obstruction === 'door') f.door.open = false;
    if (obstruction === 'prop') f.world.blockers.push({ id: 'box', x: 0.6, z: 0, w: 0.1, d: 2 });
    if (obstruction === 'body') Object.assign(f.survivor.position, { x: 1, z: 0 });
    if (obstruction === 'height') f.worker.position.h = 2;
    if (obstruction === 'jump') requestJump(f.worker);
    if (obstruction === 'disabled') f.site.require('workSite').enabled = false;
    f.tick();
    assert.equal(f.record.get('enemy').progress, 0, obstruction);
  }
});

test('same-ID actor/site replacement cannot inherit a pending cycle or replay an old handle', () => {
  for (const replace of ['actor', 'site'] as const) {
    const f = fixture(DT);
    f.tick(() => {
      if (replace === 'actor') {
        f.ecs.remove(f.worker.id);
        const replacement = createActor(f.ecs, f.world, f.worker.id, 'goblin', {
          x: 0,
          z: 0,
          h: 0,
        });
        assert.equal(f.work.assign(f.worker, 'enemy'), false);
        assert.equal(f.work.assign(replacement, 'enemy'), true);
      } else {
        f.ecs.remove('site');
        f.ecs
          .create('site')
          .add('workSite', { approach: { x: 1, z: 0, h: 0 }, radius: 1.1, enabled: true });
      }
    });
    assert.equal(f.record.get('enemy').progress, 0, replace);
    f.tick();
    assert.equal(f.record.get('enemy').progress, 1, replace);
  }
});

test('stop/teleport cancel assignments and run replacement retires old systems', () => {
  const f = fixture(DT);
  f.tick();
  f.tick(() => stopActor(f.worker));
  assert.equal(f.worker.entity.has('work'), false);
  assert.equal(f.record.get('enemy').progress, 1);
  f.work.assign(f.worker, 'enemy');
  f.tick(() => teleportActor(f.worker, f.world, { x: 0, z: 0 }));
  assert.equal(f.record.get('enemy').progress, 1);
  f.ecs.remove('run');
  f.ecs.create('run');
  assert.throws(() => f.work.advance(100, DT), /run|retired/i);
});

test('a retained component handle cannot resurrect cancelled partial work on re-entry', () => {
  const f = fixture(4 * DT);
  f.tick();
  f.tick();
  const retained = f.worker.entity.require('work');
  const id = retained.snapshot().cycleId;
  f.tick(() => stopActor(f.worker));
  f.worker.entity.add('work', retained);
  f.tick();
  assert.equal(f.record.get('enemy').progress, 0);
  assert.equal(retained.snapshot().elapsed, DT);
  assert.notEqual(retained.snapshot().cycleId, id);
});

test('step protocol rejects duplicate advance and invalid durations without advancing history', () => {
  const f = fixture();
  const before = f.record.snapshot();
  for (const dt of [0, -1, NaN, Infinity]) assert.throws(() => f.work.advance(2, dt));
  assert.deepEqual(f.record.snapshot(), before);
  f.work.advance(2, DT);
  assert.throws(() => f.work.advance(2, DT));
  assert.throws(() => f.work.commit(3));
  f.work.commit(2);
  assert.throws(() => f.work.advance(2, DT));
});
