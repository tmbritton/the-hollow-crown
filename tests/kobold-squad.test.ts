import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECS } from '../src/ecs.ts';
import { createActor } from '../src/actors.ts';
import { CombatSystem } from '../src/combat.ts';
import { installKoboldSquads } from '../src/koboldSquads.ts';
import type { NavigationWorld } from '../src/navigation.ts';
import type { Tile } from '../src/worldTypes.ts';
import { generateDungeon } from '../src/world.ts';
import { seedEnemies } from '../src/combat.ts';

function fixture() {
  const ecs = new ECS(),
    tiles = new Map<string, Tile>();
  for (let x = -30; x <= 30; x++)
    for (let z = -8; z <= 8; z++) tiles.set(`${x},${z}`, { x, z, h: 0, surface: 'stone' });
  const world: NavigationWorld = { tiles, blockers: [], entities: [] };
  const player = createActor(ecs, world, 'player', 'player', { x: -25, z: 0, h: 0 });
  const pack = [0, 1, 2, 3].map((slot) => {
    const actor = createActor(ecs, world, `kobold:${slot}`, 'kobold', {
      x: 0,
      z: slot * 1.4 - 2.1,
      h: 0,
    });
    actor.enableAI('pack', slot);
    return actor;
  });
  installKoboldSquads(ecs, pack);
  const squad = ecs.get('pack')!.require('koboldSquad');
  const combat = new CombatSystem(ecs, world, [player, ...pack]);
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) combat.update(1 / 60);
  };
  return { ecs, world, player, pack, squad, combat, step };
}

test('squad owns stable original member references, roles and shared defense capability', () => {
  const f = fixture();
  assert.equal(f.squad.state, 'idle');
  assert.equal(f.squad.target, null);
  assert.deepEqual(
    f.squad.members.map((m) => m.role),
    ['shieldbearer', 'shieldbearer', 'shieldbearer', 'spearman'],
  );
  f.pack.forEach((a, i) => {
    assert.equal(f.squad.members[i].entity, a.entity);
    assert.equal(a.entity.require('squadMember'), f.squad.members[i]);
    assert.equal(a.entity.has('defense'), i < 3);
  });
});

test('shared perception drives physical ranks, four distinct approaches and return without overlap', () => {
  const f = fixture();
  f.step();
  f.player.position.x = 6;
  f.player.health.invulnerable = 100;
  f.step(10);
  assert.equal(f.squad.state, 'assembling');
  assert.equal(f.squad.target, f.player.entity);
  assert.ok(f.pack.every((a) => a.attack.target === f.player.id));
  assert.equal(new Set(f.squad.members.map((m) => JSON.stringify(f.squad.approach(m)))).size, 4);
  let nearest = Infinity;
  for (let i = 0; i < 360; i++) {
    f.step();
    for (const a of f.pack)
      for (const b of [f.player, ...f.pack])
        if (a !== b)
          nearest = Math.min(
            nearest,
            Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z),
          );
  }
  assert.ok(
    ['engaging', 'opening', 'attacking', 'recovering'].includes(f.squad.state),
    JSON.stringify({
      state: f.squad.state,
      p: f.pack.map((a) => a.position),
      goals: f.squad.members.map((m) => f.squad.approach(m)),
    }),
  );
  assert.ok(nearest >= 0.9 - 1e-6, String(nearest));
  assert.ok(f.squad.cohesive, 'physical ranks assemble before coordinated attacks');
  f.player.position.x = -25;
  f.step(10);
  assert.equal(f.squad.state, 'returning');
  assert.ok(f.pack.every((a) => a.attack.target === null));
  f.step(600);
  assert.equal(f.squad.state, 'idle');
  assert.ok(
    f.pack.every(
      (a) => Math.hypot(a.position.x - a.brain!.home.x, a.position.z - a.brain!.home.z) < 0.2,
    ),
  );
});

test('damage alerts the entire group immediately; casualties retain slots, final death latches, regeneration is fresh', () => {
  const f = fixture();
  f.combat.damage(f.pack[3], 1, f.player);
  assert.equal(f.squad.target, f.player.entity);
  assert.ok(f.pack.every((a) => a.attack.target === f.player.id));
  f.player.position.x = 6;
  f.player.health.invulnerable = 100;
  f.step(90);
  f.combat.damage(f.pack[0], 1000);
  assert.equal(f.squad.state, 'assembling');
  assert.deepEqual(
    f.squad.living.map((m) => m.slot),
    [1, 2, 3],
  );
  for (const a of f.pack.slice(1)) f.combat.damage(a, 1000);
  assert.equal(f.squad.state, 'defeated');
  assert.equal(f.squad.target, null);
  f.ecs.remove(f.pack[0].id);
  createActor(f.ecs, f.world, f.pack[0].id, 'kobold', { x: 0, z: 0, h: 0 });
  f.step();
  assert.equal(f.squad.living.length, 0, 'same-ID replacement cannot inherit original membership');
  const fresh = fixture();
  assert.equal(fresh.squad.state, 'idle');
  assert.notEqual(fresh.squad.chart, f.squad.chart);
});

test('one sticky target wins competing sightings; occluded memory expires instead of circulating alerts', () => {
  const f = fixture();
  f.player.position.x = 7;
  f.player.health.invulnerable = 100;
  f.step(90);
  const rival = createActor(f.ecs, f.world, 'rival', 'goblin', { x: -2, z: 0, h: 0 });
  f.step();
  assert.equal(f.squad.target, f.player.entity);
  assert.ok(f.pack.every((a) => a.attack.target === f.player.id));
  f.combat.damage(f.player, 1000); // protection deliberately prevents this attempt
  f.player.health.invulnerable = 0;
  f.combat.damage(f.player, 1000);
  assert.notEqual(f.squad.target, f.player.entity);
  f.combat.damage(rival, 1000);
  f.step();
  assert.equal(f.squad.target, null);
  const g = fixture();
  g.player.position.x = 7;
  g.step();
  g.world.blockers.push({ id: 'wall', x: 3, z: 0, w: 1, d: 18 });
  g.step(330);
  assert.equal(g.squad.target, null);
  assert.ok(g.pack.every((a) => a.attack.target === null));
});

test('assembly times out across an obstructed approach without moving bodies through it', () => {
  const f = fixture();
  for (const a of f.pack.slice(0, 2)) a.position.x = -10;
  f.world.blockers.push({ id: 'solid-divider', x: -5, z: 0, w: 1, d: 18 });
  f.player.position.x = 7;
  f.player.health.invulnerable = 100;
  f.step(10);
  assert.equal(f.squad.state, 'assembling');
  assert.ok(
    f.pack.slice(0, 3).some((a) => a.defending),
    'assembly opts into the shared guard',
  );
  f.step(400);
  assert.equal(f.squad.state, 'holding', 'an isolated rank enters bounded defensive hold');
  assert.ok(f.pack.slice(0, 2).every((a) => a.position.x < -5.9));
  assert.ok(f.pack.slice(2).every((a) => a.position.x > -4.1));
});

test('same-ID target replacement is newly acquired, never mistaken for the dead original reference', () => {
  const f = fixture();
  f.player.position.x = 7;
  f.step();
  f.ecs.remove(f.player.id);
  const replacement = createActor(f.ecs, f.world, f.player.id, 'player', { x: -25, z: 0, h: 0 });
  f.step(10);
  assert.equal(f.squad.target, null);
  replacement.position.x = 7;
  f.step(10);
  assert.equal(f.squad.target, replacement.entity);
  assert.notEqual(f.squad.target, f.player.entity);
});

test('returning squad replans a long detour after temporary allied occupancy clears', () => {
  const world = generateDungeon('MOURNING-731'),
    ecs = new ECS();
  const player = createActor(ecs, world, 'player', 'player', world.spawn);
  const enemies = seedEnemies(ecs, world),
    combat = new CombatSystem(ecs, world, [player, ...enemies]);
  const pack = enemies.filter((a) => a.brain?.pack === 'pack:stairs');
  for (const a of enemies) if (!pack.includes(a)) a.health.current = 0;
  const group = pack[0].brain!.social!;
  const approach = [...world.tiles.values()].find((t) => {
    const distance = Math.hypot(t.x - group.center.x, t.z - group.center.z);
    return (
      distance > 3 &&
      distance < 5 &&
      player.navigator.canStand(t) &&
      pack[0].navigator.segmentClear(t, pack[0].position)
    );
  })!;
  Object.assign(player.position, approach);
  player.health.invulnerable = 100;
  for (let i = 0; i < 190; i++) combat.update(1 / 60);
  Object.assign(player.position, { x: 1000, z: 1000 });
  for (let i = 0; i < 1200; i++) combat.update(1 / 60);
  assert.ok(
    pack.every(
      (a) => Math.hypot(a.position.x - a.brain!.home.x, a.position.z - a.brain!.home.z) < 0.2,
    ),
    JSON.stringify(pack.map((a) => ({ id: a.id, p: a.position, path: a.navigator.path }))),
  );
});

test('returning squad physically yields when two original members occupy each other’s social approaches', () => {
  const world = generateDungeon('MOURNING-731'),
    ecs = new ECS();
  const player = createActor(ecs, world, 'player', 'player', { x: 1000, z: 1000, h: 0 });
  const enemies = seedEnemies(ecs, world),
    combat = new CombatSystem(ecs, world, [player, ...enemies]);
  const pack = enemies.filter((a) => a.brain?.pack === 'pack:treasury');
  for (const a of enemies) if (!pack.includes(a)) a.health.current = 0;
  Object.assign(pack[0].position, { x: -22.228682004475118, z: -2.0129501213613237 });
  Object.assign(pack[2].position, { x: -22.063712528209834, z: 0 });
  assert.ok(!pack[0].navigator.canOccupy(pack[0].brain!.home));
  assert.ok(!pack[2].navigator.canOccupy(pack[2].brain!.home));
  const squad = ecs.get('pack:treasury')!.require('koboldSquad');
  squad.chart.send({ type: 'ALERT', target: player.entity });
  squad.chart.send({
    type: 'TICK',
    dt: 0,
    valid: false,
    survivors: 4,
    cohesive: true,
    home: false,
  });
  let minimum = Infinity;
  for (let i = 0; i < 1200; i++) {
    combat.update(1 / 60);
    for (const a of pack)
      for (const b of pack)
        if (a !== b)
          minimum = Math.min(
            minimum,
            Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z),
          );
  }
  assert.ok(minimum >= 0.9 - 1e-6, String(minimum));
  assert.equal(squad.state, 'idle');
  assert.ok(
    pack.every(
      (a) => Math.hypot(a.position.x - a.brain!.home.x, a.position.z - a.brain!.home.z) < 0.2,
    ),
  );
});

test('seeded roomy gatherings attack from original social positions; the cramped stairs approach holds safely', () => {
  for (const id of ['pack:stable', 'pack:stairs', 'pack:treasury']) {
    const world = generateDungeon('MOURNING-731'),
      ecs = new ECS();
    const player = createActor(ecs, world, 'player', 'player', { x: 1000, z: 1000, h: 0 });
    const enemies = seedEnemies(ecs, world),
      combat = new CombatSystem(ecs, world, [player, ...enemies]);
    const squad = ecs.get(id)!.require('koboldSquad'),
      pack = enemies.filter((a) => a.brain?.pack === id);
    for (const a of enemies) if (!pack.includes(a)) a.health.current = 0;
    const approach = [...world.tiles.values()]
      .filter((t) => {
        const d = Math.hypot(t.x - squad.center.x, t.z - squad.center.z);
        return (
          d > 3 &&
          d < 6 &&
          player.navigator.canOccupy(t) &&
          pack.some((a) => a.navigator.segmentClear(a.position, t))
        );
      })
      .sort(
        (a, b) =>
          Math.hypot(a.x - squad.center.x, a.z - squad.center.z) -
          Math.hypot(b.x - squad.center.x, b.z - squad.center.z),
      )[0]!;
    Object.assign(player.position, approach);
    player.health.invulnerable = 100;
    let plans = 0;
    for (const a of pack) {
      const go = a.navigator.goTo.bind(a.navigator);
      a.navigator.goTo = (...args) => {
        plans++;
        return go(...args);
      };
    }
    let attacked = false;
    for (let i = 0; i < 900; i++) {
      combat.update(1 / 60);
      if (squad.spear?.attack.swing) attacked = true;
    }
    if (id === 'pack:stairs') {
      assert.equal(squad.state, 'holding');
      const held = pack.map((a) => ({ ...a.position })),
        heldPlans = plans;
      for (let i = 0; i < 900; i++) combat.update(1 / 60);
      assert.equal(squad.state, 'holding');
      assert.equal(plans, heldPlans, 'cramped hold cannot keep submitting recovery routes');
      pack.forEach((a, i) => assert.deepEqual(a.position, held[i]));
      assert.ok(pack.slice(0, 3).every((a) => a.defending));
      for (const a of pack)
        for (const b of pack)
          if (a !== b)
            assert.ok(
              Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) >= 0.9 - 1e-6,
            );
    } else
      assert.ok(
        attacked,
        JSON.stringify({
          id,
          state: squad.state,
          positions: pack.map((a) => a.position),
          goals: squad.members.map((m) => squad.approach(m)),
        }),
      );
  }
});
