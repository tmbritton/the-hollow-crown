import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECS } from '../src/ecs.ts';
import { createActor, stopActor, teleportActor } from '../src/actors.ts';
import { CombatSystem, seedEnemies } from '../src/combat.ts';
import { DiscoveryRecord, inhabitantDiscovery } from '../src/discoveries.ts';
import { generationIdentity } from '../src/generation/identity.ts';
import {
  generateDungeon,
  reachableTiles,
  reachableTileDistances,
  validateDungeon,
} from '../src/world.ts';
import { registerWorld, updateDoors } from '../src/worldEntities.ts';
import { Navigator } from '../src/navigation.ts';
import { prepareLastEmber, EMBER, emberBlueprint, emberClue } from '../src/lastEmber.ts';
import { installObjectiveWork } from '../src/objectiveWork.ts';

function fixture(seed = 'MOURNING-731', independent = false) {
  const world = generateDungeon(seed),
    ecs = new ECS();
  ecs.create('run').add('discoveries', new DiscoveryRecord(generationIdentity(seed)));
  registerWorld(ecs, world);
  const player = createActor(ecs, world, 'player', 'player', world.spawn);
  const enemies = seedEnemies(ecs, world);
  const combat = new CombatSystem(ecs, world, [player, ...enemies]);
  const fragment = prepareLastEmber(ecs, world, player);
  const ember = fragment.scenario;
  if (independent) {
    const outsider = enemies[0];
    ecs
      .create('other-site')
      .add('workSite', { approach: { ...outsider.position }, radius: 0.45, enabled: true });
    fragment.plan.objectives.push({
      id: 'other',
      owner: { kind: 'actor', id: outsider.id },
      participants: [outsider.id],
      capacity: 12,
      announceOnActivation: true,
      dependencies: [],
      outcomes: { completed: 'other:done', thwarted: 'other:stopped' },
    });
    fragment.bindings.push({ objectiveId: 'other', siteId: 'other-site', duration: 1 });
  }
  installObjectiveWork(ecs, world, fragment.plan, fragment.bindings);
  const record = ecs.get('run')!.require('objectives');
  const work = ecs.get('run')!.require('objectiveWork');
  const worker = combat.actor(EMBER.worker)!;
  let step = 0;
  const tick = (seconds = 1 / 60, between = () => {}) => {
    work.advance(++step, seconds);
    between();
    const result = work.commit(step);
    ember.consume(result.outcomes);
    return result;
  };
  const at = (id: string, actor = player) => {
    const site = Object.values(ember.sites).find((site) => site.id === id);
    const p = ecs.get(site?.sourceId ?? id)!.require('workSite').approach;
    teleportActor(actor, world, p);
  };
  const activate = () => {
    ember.activate();
    tick();
  };
  const isolate = () => {
    for (const actor of enemies) {
      stopActor(actor);
      actor.entity.remove('brain');
    }
    at(EMBER.focus, worker);
  };
  return {
    world,
    ecs,
    player,
    worker,
    enemies,
    combat,
    ember,
    record,
    work,
    tick,
    at,
    activate,
    isolate,
  };
}

test('Last Ember sites are deterministic, reserved and routable before the altar across 100 seeds', (t) => {
  let longestRoute = 0,
    largestAttempt = 0;
  for (let i = 0; i < 100; i++) {
    const f = fixture(`ember-${i}`),
      plan = emberBlueprint(f.world);
    assert.deepEqual(plan, emberBlueprint(generateDungeon(`ember-${i}`)));
    assert.deepEqual(validateDungeon(f.world), []);
    assert.equal(f.enemies.length, 21);
    assert.equal(f.enemies.filter((a) => a.kind === 'goblin').length, 4);
    assert.ok(f.worker.entity.get('inhabitant'));
    const reachable = reachableTiles(f.world);
    const navigation = new Navigator(f.world);
    for (const site of [plan.shrine, plan.focus, plan.clue]) {
      assert.ok(reachable.has(`${Math.round(site.approach.x)},${Math.round(site.approach.z)}`));
      assert.ok(
        f.world.reserved.has(`${Math.round(site.approach.x)},${Math.round(site.approach.z)}`),
      );
      assert.ok(
        navigation.goTo(f.player.position, site.approach, { openDoors: true }),
        `${i}: ${site.id}`,
      );
      navigation.cancel();
    }
    for (const site of [plan.shrine, plan.focus])
      for (const entity of f.world.entities)
        if (entity.approach)
          assert.ok(
            Math.hypot(entity.approach.x - site.approach.x, entity.approach.z - site.approach.z) >=
              1.1,
            `${i}: ${site.id} must not steal E from ${entity.id}`,
          );
    assert.ok(navigation.goTo(f.worker.position, plan.focus.approach, { openDoors: true }));
    const steps = reachableTileDistances(f.world, false, plan.shrine.approach).get(
      `${Math.round(plan.focus.approach.x)},${Math.round(plan.focus.approach.z)}`,
    )!;
    longestRoute = Math.max(longestRoute, steps);
    largestAttempt = Math.max(largestAttempt, f.world.attempt);
    assert.ok(
      steps / 4.8 + 36 < 100,
      'travel plus ordinary restoration leaves at least one rival cycle of response margin',
    );
  }
  t.diagnostic(
    `100 seeds: longest shrine/focus route ${longestRoute} tile steps; largest accepted attempt ${largestAttempt}`,
  );
});

test('activation announces an unnamed rival without teaching its identity; clue doubles actual credit', () => {
  const f = fixture();
  f.isolate();
  assert.equal(f.record.get(EMBER.profane).visible, false);
  f.activate();
  assert.equal(f.record.get(EMBER.profane).visible, true);
  assert.equal(f.ecs.get('run')!.require('discoveries').snapshot().discoveries.length, 0);
  assert.equal(f.ember.agenda().find((a) => a.id === EMBER.profane)!.owner, 'Goblin ward-breaker');
  const identity = f.worker.entity.require('inhabitant');
  f.ecs.get('run')!.require('discoveries').present(inhabitantDiscovery(identity), 0);
  assert.equal(
    f.ember.agenda().find((a) => a.id === EMBER.profane)!.owner,
    `${identity.name}, ${identity.title}`,
  );
  f.at(EMBER.shrine);
  assert.ok(f.ember.startHero());
  f.tick(6);
  assert.equal(f.record.get(EMBER.restore).progress, 1);
  f.ecs.get('run')!.require('discoveries').present(emberClue(f.world), 1);
  f.tick(6);
  assert.equal(f.record.get(EMBER.restore).progress, 3);
});

test('restoration first rewards once and thwarts the real living rival', () => {
  const f = fixture();
  f.isolate();
  f.activate();
  f.at(EMBER.shrine);
  f.player.health.current = 20;
  f.ember.startHero();
  for (let i = 0; i < 6; i++) f.tick(6);
  assert.equal(f.ember.state, 'restored');
  assert.equal(f.record.get(EMBER.profane).status, 'thwarted');
  assert.ok(f.worker.alive);
  assert.equal(f.player.health.current, 50);
  f.ember.consume(f.record.snapshot().outcomes);
  assert.equal(f.player.health.current, 50);
  assert.equal(f.ember.startHero(), false);
});

test('monster-first remains lost after death; disabled focus permits one lesser cleansing', () => {
  const f = fixture();
  f.isolate();
  f.activate();
  f.work.assign(f.worker, EMBER.profane);
  for (let i = 0; i < 6; i++) f.tick(20);
  assert.equal(f.ember.state, 'corrupted');
  f.combat.damage(f.worker, 1000);
  f.tick();
  assert.equal(f.record.get(EMBER.profane).status, 'completed');
  assert.equal(f.record.get(EMBER.restore).status, 'lost');
  f.at(EMBER.shrine);
  assert.equal(f.ember.startHero(), false);
  f.at(EMBER.focus);
  assert.ok(f.ember.disableFocus());
  f.tick();
  f.at(EMBER.shrine);
  assert.ok(f.ember.startHero());
  f.tick(6);
  assert.equal(f.ember.state, 'cleansed');
  assert.equal(f.ember.reward, 10);
  assert.equal(f.ember.startHero(), false);
  assert.match(
    f.ember.agenda().find((o) => o.id === EMBER.restore)!.detail,
    /cleansing completed/i,
  );
  assert.doesNotMatch(
    f.ember.agenda().find((o) => o.id === EMBER.profane)!.detail,
    /shrine corrupted/i,
  );
});

test('same-step completion fractures once and offers finite repair only after disabling focus', () => {
  const f = fixture();
  f.isolate();
  f.activate();
  f.at(EMBER.shrine);
  f.ember.startHero();
  f.work.assign(f.worker, EMBER.profane);
  for (let i = 0; i < 6; i++) f.tick(20);
  assert.equal(f.ember.state, 'fractured');
  assert.equal(f.ember.reward, 0);
  assert.equal(f.ember.startHero(), false);
  f.at(EMBER.focus);
  f.ember.disableFocus();
  f.tick();
  f.at(EMBER.shrine);
  assert.ok(f.ember.startHero());
  f.tick(6);
  assert.equal(f.ember.state, 'repaired');
  assert.equal(f.ember.reward, 15);
  assert.match(f.ember.agenda().find((o) => o.id === EMBER.restore)!.detail, /repair completed/i);
  assert.equal(f.record.snapshot().outcomes.filter((o) => o.kind === 'contested').length, 1);
});

test('same-step worker death cancels final credit, keeps hero progress and permits restoration', () => {
  const f = fixture();
  f.isolate();
  f.activate();
  f.at(EMBER.shrine);
  f.ember.startHero();
  f.tick(6);
  f.work.assign(f.worker, EMBER.profane);
  f.tick(20, () => f.combat.damage(f.worker, 1000));
  assert.equal(f.record.get(EMBER.profane).status, 'thwarted');
  assert.equal(f.record.get(EMBER.profane).progress, 0);
  assert.equal(f.record.get(EMBER.restore).progress, 2);
  stopActor(f.player);
  assert.equal(f.player.entity.has('work'), false);
  f.ember.startHero();
  for (let i = 0; i < 4; i++) f.tick(6);
  assert.equal(f.ember.state, 'restored');
});

test('disabling the focus before completion thwarts permanently without killing its worker', () => {
  const f = fixture();
  f.isolate();
  f.activate();
  f.work.assign(f.worker, EMBER.profane);
  f.tick(20);
  f.at(EMBER.focus);
  assert.ok(f.ember.disableFocus());
  f.tick();
  assert.ok(f.worker.alive);
  assert.equal(f.record.get(EMBER.profane).progress, 1);
  assert.equal(f.record.get(EMBER.profane).status, 'thwarted');
  assert.equal(f.ember.disableFocus(), false);
  assert.equal(
    f.ecs.get(f.ember.sites.focus.sourceId)!.require('focus').snapshot.value,
    'disabled',
  );
  f.at(EMBER.shrine);
  assert.ok(f.ember.startHero());
  for (let i = 0; i < 6; i++) f.tick(6);
  assert.equal(f.ember.state, 'restored');
  assert.equal(f.ember.reward, 30);
});

test('learning the method at commit cancels old unfinished work rather than upgrading it retroactively', () => {
  const f = fixture();
  f.isolate();
  f.activate();
  f.at(EMBER.shrine);
  f.ember.startHero();
  f.tick(5);
  f.tick(1, () => f.ecs.get('run')!.require('discoveries').present(emberClue(f.world), 1));
  assert.equal(f.record.get(EMBER.restore).progress, 0);
  f.tick(6);
  assert.equal(f.record.get(EMBER.restore).progress, 2);
});

test('blocked focus cannot produce offscreen credit or disclose its unseen cause; clearing it resumes', () => {
  const f = fixture();
  f.isolate();
  f.activate();
  f.work.assign(f.worker, EMBER.profane);
  f.tick(20);
  const at = f.ember.sites.focus.approach;
  f.world.blockers.push({ id: 'temporary-obstruction', ...at, w: 1, d: 1 });
  f.tick(20);
  assert.equal(f.record.get(EMBER.profane).progress, 1);
  const clock = f.ember.agenda().find((o) => o.id === EMBER.profane)!;
  assert.equal(clock.status, 'blocked');
  assert.ok(!clock.detail.includes('obstructed'));
  assert.ok(
    validateDungeon(f.world).some((error) => error.includes('Last Ember approach inaccessible')),
  );
  f.world.blockers.pop();
  f.tick(20);
  assert.equal(f.record.get(EMBER.profane).progress, 2);
});

test('composed independent work survives the Last Ember outcome without reinstalling the run plan', () => {
  const f = fixture('MOURNING-731', true);
  f.isolate();
  f.activate();
  f.work.activate('other');
  f.tick();
  f.work.assign(f.enemies[0], 'other');
  f.at(EMBER.shrine);
  f.ember.startHero();
  for (let i = 0; i < 6; i++) f.tick(6);
  assert.equal(f.ember.state, 'restored');
  assert.equal(f.record.get('other').progress, 6);
  assert.equal(f.record.get('other').status, 'unresolved');
  assert.equal(f.ecs.get('run')!.require('objectiveWork'), f.work);
  for (let i = 0; i < 6; i++) f.tick(1);
  assert.equal(f.record.get('other').status, 'completed');
  assert.equal(f.ember.reward, 30);
});

test('the goblin actually navigates to work offscreen, defends itself and returns after losing a threat', () => {
  const f = fixture();
  for (const actor of f.enemies) if (actor.id !== f.worker.id) f.combat.damage(actor, 1000);
  f.activate();
  for (let i = 0; i < 2400 && f.record.get(EMBER.profane).progress === 0; i++) {
    updateDoors(f.ecs, 1 / 60);
    f.tick(1 / 60, () => f.combat.update(1 / 60));
  }
  assert.equal(f.record.get(EMBER.profane).progress, 1);
  const progress = f.record.get(EMBER.profane).progress;
  const p = f.worker.position;
  teleportActor(f.player, f.world, { x: p.x, z: p.z + 2 });
  f.player.health.invulnerable = 100;
  for (let i = 0; i < 120; i++) f.tick(1 / 60, () => f.combat.update(1 / 60));
  assert.equal(f.record.get(EMBER.profane).progress, progress);
  assert.notEqual(f.worker.entity.get('work')?.snapshot().status, 'working');
  teleportActor(f.player, f.world, f.world.spawn);
  for (let i = 0; i < 3600 && f.record.get(EMBER.profane).progress === progress; i++) {
    updateDoors(f.ecs, 1 / 60);
    f.tick(1 / 60, () => f.combat.update(1 / 60));
  }
  assert.ok(f.record.get(EMBER.profane).progress > progress);
});
