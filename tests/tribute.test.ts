import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECS } from '../src/ecs.ts';
import { createActor, stopActor, teleportActor } from '../src/actors.ts';
import { CombatSystem, seedEnemies } from '../src/combat.ts';
import { DiscoveryRecord } from '../src/discoveries.ts';
import { generationIdentity } from '../src/generation/identity.ts';
import { generateDungeon, validateDungeon, reachableTileDistances } from '../src/world.ts';
import { registerWorld, updateDoors } from '../src/worldEntities.ts';
import { Navigator } from '../src/navigation.ts';
import { prepareLastEmber, EMBER } from '../src/lastEmber.ts';
import { prepareTribute, TRIBUTE, tributeBlueprint } from '../src/tribute.ts';
import { installObjectiveWork } from '../src/objectiveWork.ts';

test('tribute return route cannot smooth across a thin unsupported room corner', () => {
  const world = generateDungeon(),
    nav = new Navigator(world);
  const p = { x: -0.7473238310828476, z: -48.136018410603306 };
  assert.ok(nav.goTo(p, { x: -4, z: -31 }, { openDoors: true }));
  assert.ok(nav.steer(p), 'a newly planned clear route must be immediately steerable');
});

function fixture(seed = 'MOURNING-731') {
  const world = generateDungeon(seed),
    ecs = new ECS();
  ecs.create('run').add('discoveries', new DiscoveryRecord(generationIdentity(seed)));
  registerWorld(ecs, world);
  const player = createActor(ecs, world, 'player', 'player', world.spawn);
  const enemies = seedEnemies(ecs, world);
  const combat = new CombatSystem(ecs, world, [player, ...enemies]);
  const ember = prepareLastEmber(ecs, world, player),
    tribute = prepareTribute(ecs, world, player);
  const work = installObjectiveWork(
    ecs,
    world,
    {
      objectives: [...ember.plan.objectives, ...tribute.plan.objectives],
      races: [...ember.plan.races, ...tribute.plan.races],
    },
    [...ember.bindings, ...tribute.bindings],
  );
  const scenario = tribute.scenario,
    record = ecs.get('run')!.require('objectives');
  let step = 0;
  const tick = (dt = 1 / 60, between = () => {}) => {
    scenario.update();
    work.advance(++step, dt);
    between();
    const result = work.commit(step);
    ember.scenario.consume(result.outcomes);
    return result;
  };
  const activate = () => {
    ember.scenario.activate();
    scenario.activate();
    tick();
    tick();
  };
  const isolate = () => {
    for (const a of enemies) {
      stopActor(a);
      a.entity.remove('brain');
    }
  };
  const carrier = () =>
    enemies.find((a) => scenario.cargo.some((e) => e.require('cargo').owner === a.entity))!;
  const pickup = () => {
    tick();
    const a = carrier(),
      e = scenario.cargo.find((e) => e.require('cargo').owner === a.entity)!;
    teleportActor(a, world, e.require('workSite').approach);
    work.assign(a, TRIBUTE.objective);
    tick(TRIBUTE.pickupSeconds);
    assert.equal(e.require('cargo').state, 'carried');
    assert.equal(
      record.get(TRIBUTE.objective).progress,
      scenario.cargo.filter((e) => e.require('cargo').state === 'delivered').length,
    );
    return { a, e };
  };
  const deliver = () => {
    const { a, e } = pickup();
    teleportActor(a, world, scenario.sites.exit);
    work.assign(a, TRIBUTE.objective);
    tick(TRIBUTE.deliverySeconds);
    assert.equal(e.require('cargo').state, 'delivered');
    return { a, e };
  };
  return {
    world,
    ecs,
    player,
    enemies,
    combat,
    ember: ember.scenario,
    scenario,
    work,
    record,
    tick,
    activate,
    isolate,
    carrier,
    pickup,
    deliver,
  };
}

function assertTributeSeeds(seeds: readonly string[]) {
  let longest = 0;
  for (const seed of seeds) {
    const f = fixture(seed),
      sites = f.scenario.sites;
    assert.deepEqual(sites, tributeBlueprint(generateDungeon(seed)));
    assert.deepEqual(validateDungeon(f.world), []);
    assert.equal(f.enemies.length, 24);
    assert.equal(f.enemies.filter((a) => a.kind === 'skeleton').length, 8);
    assert.equal(f.enemies.filter((a) => a.kind === 'goblin').length, 4);
    for (const room of ['stable', 'stairs', 'treasury']) {
      const pack = f.enemies.filter((a) => a.brain?.pack === `pack:${room}`);
      assert.equal(pack.length, 4);
      assert.deepEqual(
        pack.map((a) => a.entity.require('squadMember').role),
        ['shieldbearer', 'shieldbearer', 'shieldbearer', 'spearman'],
      );
      for (const a of pack) {
        assert.equal(a.brain!.social!.members.length, 4);
        assert.ok(a.navigator.canOccupy(a.position));
        assert.ok(a.navigator.canStand(a.brain!.home));
      }
    }
    assert.equal(f.world.entities.filter((e) => e.type === 'chest').length, 3);
    assert.equal(sites.cargo.length, 4);
    assert.equal(new Set(sites.cargo.map((c) => c.id)).size, 4);
    assert.equal(sites.workers.length, 4);
    const nav = new Navigator(f.world);
    for (const p of [...sites.cargo, sites.exit]) {
      assert.ok(f.world.reserved.has(`${p.x},${p.z}`));
      assert.ok(
        f.enemies.every((a) => Math.hypot(a.position.x - p.x, a.position.z - p.z) > 1.2),
        'initial population keeps intervention faces clear',
      );
      assert.ok(nav.goTo(f.world.spawn, p, { openDoors: true }));
      for (const e of f.world.entities)
        if (e.approach) assert.ok(Math.hypot(e.approach.x - p.x, e.approach.z - p.z) >= 1.2);
    }
    // Each crate-to-exit route is independent of the intervention face above. Checking all
    // four routes inside that five-face loop used to repeat the same twenty searches per seed.
    for (const c of sites.cargo) assert.ok(nav.goTo(c, sites.exit, { openDoors: true }));
    for (const id of sites.workers) {
      const actor = f.combat.actor(id)!;
      assert.equal(actor.kind, 'kobold');
      assert.ok(nav.goTo(actor.position, sites.cargo[0], { openDoors: true }));
    }
    const distance = reachableTileDistances(f.world, false, f.ember.sites.shrine.approach).get(
      `${sites.cargo[0].x},${sites.cargo[0].z}`,
    )!;
    longest = Math.max(longest, distance);
    assert.ok(distance / 4.8 + 36 < 4 * (TRIBUTE.pickupSeconds + TRIBUTE.deliverySeconds));
  }
  return longest;
}

test('tribute: representative keeps preserve four-role packs and all reserved cargo routes', () => {
  assertTributeSeeds(['MOURNING-731', 'tribute-12']);
});

test('[extended] tribute: 100 deterministic reserved pre-altar cargo/exit routes preserve population and response budget', (t) => {
  const longest = assertTributeSeeds(Array.from({ length: 100 }, (_, i) => `tribute-${i}`));
  t.diagnostic(`100 tribute seeds; longest shrine/cache route ${longest} tiles`);
});

test('tribute: pickup is real O2 work, single ownership, no elapsed-time or remote credit', () => {
  const f = fixture();
  f.isolate();
  f.activate();
  assert.equal(f.record.get(TRIBUTE.objective).visible, true);
  assert.equal(f.scenario.cargo.filter((e) => e.require('cargo').owner).length, 1);
  f.tick(1000);
  assert.equal(f.record.get(TRIBUTE.objective).progress, 0);
  const { a, e } = f.pickup();
  assert.equal(e.require('cargo').claim(f.player.entity), false);
  f.tick(1000);
  assert.equal(f.record.get(TRIBUTE.objective).progress, 0);
  teleportActor(a, f.world, f.scenario.sites.exit);
  f.work.assign(a, TRIBUTE.objective);
  f.tick(TRIBUTE.deliverySeconds);
  assert.equal(f.record.get(TRIBUTE.objective).progress, 1);
  assert.equal(e.require('cargo').state, 'delivered');
  f.tick(1000);
  assert.equal(f.record.get(TRIBUTE.objective).progress, 1);
});

test('tribute: ready pickup/delivery interrupted at combat boundary cannot transfer or credit; death drops undelivered cargo', () => {
  for (const lethal of [false, true]) {
    const f = fixture();
    f.isolate();
    f.activate();
    const { a, e } = f.pickup();
    teleportActor(a, f.world, f.scenario.sites.exit);
    f.work.assign(a, TRIBUTE.objective);
    f.tick(TRIBUTE.deliverySeconds, () => f.combat.damage(a, lethal ? 1000 : 1));
    assert.equal(f.record.get(TRIBUTE.objective).progress, 0);
    assert.equal(e.require('cargo').state, lethal ? 'loose' : 'carried');
    if (lethal) {
      assert.equal(e.require('cargo').owner, null);
      assert.deepEqual(e.require('workSite').approach, {
        x: a.position.x,
        z: a.position.z,
        h: a.position.h,
      });
      f.tick();
      assert.notEqual(f.carrier().id, a.id);
      f.tick(1000);
      assert.equal(
        e.require('cargo').state,
        'claimed',
        'survivor must travel, not inherit carried ownership',
      );
    }
  }
  const f = fixture();
  f.isolate();
  f.activate();
  const a = f.carrier(),
    e = f.scenario.cargo.find((e) => e.require('cargo').owner === a.entity)!;
  teleportActor(a, f.world, e.require('workSite').approach);
  f.work.assign(a, TRIBUTE.objective);
  f.tick(TRIBUTE.pickupSeconds, () => f.combat.damage(a, 1000));
  assert.equal(e.require('cargo').state, 'loose');
});

test('tribute: E recovery denies unique cargo once, partial deliveries persist through terminal worker death and respawn', () => {
  const f = fixture();
  f.isolate();
  f.activate();
  const { a, e } = f.deliver();
  f.combat.damage(a, 1000);
  f.tick();
  assert.equal(e.require('cargo').state, 'delivered');
  assert.equal(f.record.get(TRIBUTE.objective).progress, 1);
  for (const item of f.scenario.cargo.filter((c) => c !== e)) {
    teleportActor(f.player, f.world, item.require('workSite').approach);
    assert.ok(f.scenario.recover());
    assert.equal(item.require('cargo').state, 'recovered');
    assert.equal(f.scenario.recover(), false);
  }
  f.tick();
  assert.equal(f.record.get(TRIBUTE.objective).status, 'thwarted');
  assert.equal(f.record.get(TRIBUTE.objective).progress, 1);
  f.player.health.current = 0;
  stopActor(f.player);
  f.player.health.current = 100;
  f.tick();
  assert.equal(f.scenario.cargo.filter((e) => e.require('cargo').state === 'recovered').length, 3);
  assert.equal(f.scenario.recovered, 3);
});

test('tribute and Last Ember resolve independently, including same-boundary completion', () => {
  const f = fixture();
  f.isolate();
  f.activate();
  for (let i = 0; i < 3; i++) f.deliver();
  teleportActor(f.player, f.world, f.ember.sites.shrine.approach);
  f.ember.startHero();
  for (let i = 0; i < 5; i++) f.tick(6);
  stopActor(f.player);
  const { a } = f.pickup();
  teleportActor(a, f.world, f.scenario.sites.exit);
  f.work.assign(a, TRIBUTE.objective);
  f.ember.startHero();
  const result = f.tick(TRIBUTE.deliverySeconds);
  assert.equal(f.ember.state, 'restored');
  assert.equal(f.record.get(TRIBUTE.objective).status, 'completed');
  assert.ok(result.outcomes.some((o) => o.id === 'tribute:escaped'));
  assert.ok(result.outcomes.some((o) => o.id === 'ember:restored'));
  for (const id of f.scenario.sites.workers) f.combat.damage(f.combat.actor(id)!, 1000);
  f.tick();
  assert.equal(f.record.get(TRIBUTE.objective).progress, 4);
  assert.ok(f.scenario.cargo.every((e) => e.require('cargo').state === 'delivered'));
  assert.equal(f.scenario.recover(), false);
});

test('[extended] tribute: actual offscreen AI navigates with ordinary doors/corpses and delivers all four unique crates', () => {
  const f = fixture();
  for (const a of f.enemies) if (!f.scenario.sites.workers.includes(a.id)) f.combat.damage(a, 1000);
  f.activate();
  for (let i = 0; i < 36000 && f.record.get(TRIBUTE.objective).status === 'unresolved'; i++) {
    updateDoors(f.ecs, 1 / 60);
    f.tick(1 / 60, () => f.combat.update(1 / 60));
  }
  assert.equal(
    f.record.get(TRIBUTE.objective).status,
    'completed',
    JSON.stringify({
      clock: f.record.get(TRIBUTE.objective),
      cargo: f.scenario.cargo.map((e) => ({
        state: e.require('cargo').state,
        at: e.require('workSite').approach,
      })),
      actors: f.scenario.sites.workers.map((id) => ({
        id,
        p: f.combat.actor(id)!.position,
        work: f.ecs.get(id)!.get('work')?.snapshot(),
        target: f.combat.actor(id)!.attack.target,
      })),
    }),
  );
  assert.equal(f.record.get(EMBER.restore).status, 'unresolved');
  assert.ok(f.scenario.cargo.every((e) => e.require('cargo').state === 'delivered'));
});

test('tribute: recovering a claimed crate at the ready pickup boundary denies ownership and starts a new unique job', () => {
  const f = fixture();
  f.isolate();
  f.activate();
  const a = f.carrier(),
    item = f.scenario.cargo.find((e) => e.require('cargo').owner === a.entity)!;
  teleportActor(a, f.world, item.require('workSite').approach);
  f.work.assign(a, TRIBUTE.objective);
  f.tick(TRIBUTE.pickupSeconds, () => assert.ok(item.require('cargo').recover()));
  assert.equal(item.require('cargo').state, 'recovered');
  f.tick();
  assert.equal(f.scenario.cargo.filter((e) => e.require('cargo').owner).length, 1);
  assert.equal(f.record.get(TRIBUTE.objective).progress, 0);
  assert.equal(f.ecs.get(a.id)!.get('work')?.objectiveId, TRIBUTE.objective);
});

test('tribute: blocked pickup/delivery and nonlethal boundary damage cancel partial work without losing the cargo', () => {
  const f = fixture();
  f.isolate();
  f.activate();
  const a = f.carrier(),
    item = f.scenario.cargo.find((e) => e.require('cargo').owner === a.entity)!;
  teleportActor(a, f.world, item.require('workSite').approach);
  f.work.assign(a, TRIBUTE.objective);
  f.tick(TRIBUTE.pickupSeconds, () => f.combat.damage(a, 1));
  assert.equal(item.require('cargo').state, 'claimed');
  f.tick(TRIBUTE.pickupSeconds);
  assert.equal(item.require('cargo').state, 'carried');
  teleportActor(a, f.world, f.scenario.sites.exit);
  f.work.assign(a, TRIBUTE.objective);
  f.tick(4);
  f.tick(4, () =>
    f.world.blockers.push({ ...f.scenario.sites.exit, id: 'denied-exit', w: 1, d: 1 }),
  );
  assert.equal(f.record.get(TRIBUTE.objective).progress, 0);
  assert.equal(item.require('cargo').state, 'carried');
  assert.equal(f.scenario.agenda()[0].status, 'blocked');
  assert.doesNotMatch(f.scenario.agenda()[0].detail, /denied-exit|obstructed|killed/i);
  f.world.blockers.pop();
  f.tick(4);
  assert.equal(f.record.get(TRIBUTE.objective).progress, 0);
  f.tick(4);
  assert.equal(f.record.get(TRIBUTE.objective).progress, 1);
});

test('tribute: all original workers dead thwarts once; same-ID replacement cannot inherit a ready delivery', () => {
  const f = fixture();
  f.isolate();
  f.activate();
  const { a, e } = f.pickup();
  teleportActor(a, f.world, f.scenario.sites.exit);
  f.work.assign(a, TRIBUTE.objective);
  f.tick(TRIBUTE.deliverySeconds, () => {
    for (const id of f.scenario.sites.workers) f.combat.damage(f.combat.actor(id)!, 1000);
    f.ecs.remove(a.id);
    createActor(f.ecs, f.world, a.id, 'kobold', f.scenario.sites.exit);
  });
  assert.equal(e.require('cargo').state, 'loose');
  assert.equal(f.record.get(TRIBUTE.objective).status, 'thwarted');
  assert.equal(f.record.get(TRIBUTE.objective).progress, 0);
  const result = f.tick(1000);
  assert.equal(result.outcomes.length, 0);
});

test('tribute: retained retired scenario cannot recover or assign old cargo; fresh same-seed run owns fresh resources', () => {
  const f = fixture();
  f.isolate();
  f.activate();
  teleportActor(f.player, f.world, f.scenario.sites.cargo[0]);
  f.work.retire();
  assert.equal(f.scenario.recover(), false);
  assert.doesNotThrow(() => f.scenario.update());
  assert.throws(() => f.work.advance(1000, 1), /Retired/);
  const fresh = fixture();
  fresh.activate();
  assert.equal(fresh.scenario.recovered, 0);
  assert.equal(fresh.record.get(TRIBUTE.objective).progress, 0);
  assert.notEqual(fresh.scenario.cargo[0].require('cargo'), f.scenario.cargo[0].require('cargo'));
});

test('tribute: completing four deliveries alone leaves both Last Ember race clocks unresolved', () => {
  const f = fixture();
  f.isolate();
  f.activate();
  for (let i = 0; i < 4; i++) f.deliver();
  assert.equal(f.record.get(TRIBUTE.objective).status, 'completed');
  assert.equal(f.record.get(EMBER.restore).status, 'unresolved');
  assert.equal(f.record.get(EMBER.profane).status, 'unresolved');
});

test('[extended] tribute: survivor takes over by navigating to the drop across three seeded keeps', () => {
  for (const seed of ['CINDER-42', 'VIOLET-7', 'tribute-12']) {
    const f = fixture(seed);
    for (const a of f.enemies)
      if (!f.scenario.sites.workers.includes(a.id)) f.combat.damage(a, 1000);
    // Remove hero perception from the traversal fixture, keeping all four pack bodies.
    Object.assign(f.player.position, { x: 1000, z: 1000, h: 0 });
    f.activate();
    const simulate = () => {
      updateDoors(f.ecs, 1 / 60);
      f.tick(1 / 60, () => f.combat.update(1 / 60));
    };
    for (
      let i = 0;
      i < 12000 && !f.scenario.cargo.some((e) => e.require('cargo').state === 'carried');
      i++
    )
      simulate();
    const carried = f.scenario.cargo.find((e) => e.require('cargo').state === 'carried');
    assert.ok(carried, seed);
    const victim = carried.require('cargo').owner!;
    f.combat.damage(f.combat.actor(victim.id)!, 1000);
    // The newly added fourth member must independently recover the original carrier's drop.
    for (const id of f.scenario.sites.workers.slice(0, 3)) {
      const actor = f.combat.actor(id)!;
      if (actor.alive) f.combat.damage(actor, 1000);
    }
    simulate();
    assert.equal(carried.require('cargo').state, 'loose');
    for (let i = 0; i < 18000 && carried.require('cargo').state !== 'delivered'; i++) simulate();
    assert.equal(carried.require('cargo').state, 'delivered', seed);
    assert.equal(f.record.get(TRIBUTE.objective).progress, 1);
    assert.equal(f.ecs.get(f.scenario.sites.workers[3])!.require('squadMember').role, 'spearman');
  }
});

test('tribute: a remote shared combat alert interrupts ready porter work; threat loss resumes the same cargo', () => {
  const f = fixture();
  f.activate();
  const worker = f.carrier();
  const item = f.scenario.cargo.find((e) => e.require('cargo').owner === worker.entity)!;
  teleportActor(worker, f.world, item.require('workSite').approach);
  f.work.assign(worker, TRIBUTE.objective);
  const ally = f.combat.actor(f.scenario.sites.workers[3])!;
  f.tick(TRIBUTE.pickupSeconds, () => f.combat.damage(ally, 1, f.player));
  assert.equal(item.require('cargo').state, 'claimed');
  assert.equal(item.require('cargo').owner, worker.entity);
  assert.equal(worker.attack.target, f.player.id);
  assert.equal(worker.entity.get('work')?.snapshot().elapsed ?? 0, 0);
  f.player.position.x = 1000;
  f.player.position.z = 1000;
  // Perception and work run without a render/camera gate; preserve real actor/health identity.
  for (const actor of f.enemies)
    if (!f.scenario.sites.workers.includes(actor.id)) {
      if (actor.id === EMBER.worker) {
        stopActor(actor);
        actor.entity.remove('brain');
        Object.assign(actor.position, { x: -1000, z: -1000 });
      } else f.combat.damage(actor, 1000);
    }
  for (let i = 0; i < 18000 && item.require('cargo').state !== 'delivered'; i++) {
    updateDoors(f.ecs, 1 / 60);
    f.tick(1 / 60, () => f.combat.update(1 / 60));
  }
  assert.equal(item.require('cargo').state, 'delivered');
  assert.equal(f.record.get(EMBER.restore).status, 'unresolved');
  assert.equal(f.record.get(EMBER.profane).status, 'unresolved');
});
