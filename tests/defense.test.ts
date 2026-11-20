import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECS } from '../src/ecs.ts';
import {
  createActor,
  requestDefense,
  requestJump,
  stopActor,
  teleportActor,
  moveActor,
} from '../src/actors.ts';
import { Defense } from '../src/machines/actors/defense.ts';
import { WorkAction } from '../src/machines/actors/work.ts';
import { CombatSystem } from '../src/combat.ts';
import { key } from '../src/world.ts';
import type { NavigationWorld } from '../src/navigation.ts';
import type { Tile } from '../src/worldTypes.ts';

function fixture(angle = 0, heading = 0) {
  const ecs = new ECS(),
    tiles = new Map<string, Tile>();
  for (let x = -9; x <= 9; x++)
    for (let z = -9; z <= 9; z++) tiles.set(key(x, z), { x, z, h: 0, surface: 'stone' });
  const world: NavigationWorld = { tiles, blockers: [], entities: [] };
  const player = createActor(ecs, world, 'player', 'player', { x: 0, z: 0, h: 0 });
  player.position.heading = heading;
  const enemy = createActor(ecs, world, 'enemy', 'goblin', {
    x: Math.sin(angle + heading) * 1.2,
    z: Math.cos(angle + heading) * 1.2,
    h: 0,
  });
  const combat = new CombatSystem(ecs, world, [player, enemy]);
  requestDefense(player);
  const step = (n: number) => {
    for (let i = 0; i < n; i++) combat.update(1 / 60);
  };
  return { ecs, world, player, enemy, combat, step };
}

for (const ranged of [false, true]) {
  test(`${ranged ? 'projectile' : 'melee'}: inclusive 120-degree guard blocks front/boundaries, not sides/rear`, () => {
    for (const heading of [0, 0.7, -2.4]) {
      for (const degrees of [0, -60, 60, -60.001, 60.001, -90, 90, 180]) {
        const f = fixture((degrees * Math.PI) / 180, heading);
        if (ranged) {
          f.enemy.position.x *= 4;
          f.enemy.position.z *= 4;
        }
        assert.ok(f.combat.startAttack(f.enemy, f.player, ranged));
        f.step(ranged ? 60 : 16);
        const blocked = Math.abs(degrees) <= 60;
        assert.equal(
          f.player.health.current,
          blocked ? 100 : ranged ? 93 : 94,
          `${heading}/${degrees}`,
        );
        assert.equal(f.player.health.invulnerable, 0, 'blocking grants no protection window');
        assert.equal(
          f.ecs.query('particle').some((e) => e.require('particle').kind === 'blood'),
          !blocked,
        );
        assert.equal(f.ecs.query('projectile').length, 0);
      }
    }
  });
}

test('bolt direction comes from travel, even after the shooter moves across or dies', () => {
  for (const front of [true, false])
    for (const dead of [true, false]) {
      const f = fixture(front ? 0 : Math.PI);
      f.enemy.position.z *= 4;
      assert.ok(f.combat.startAttack(f.enemy, f.player, true));
      f.step(28);
      assert.equal(f.ecs.query('projectile').length, 1);
      f.enemy.position.z *= -1;
      if (dead) f.combat.damage(f.enemy, 1000);
      f.step(32);
      assert.equal(f.player.health.current, front ? 100 : 93);
    }
});

test('shield resolution follows impact-time range, cover, door and elevation validation', () => {
  for (const invalid of ['range', 'cover', 'door', 'elevation'] as const) {
    const f = fixture();
    assert.ok(f.combat.startAttack(f.enemy, f.player));
    f.step(14);
    if (invalid === 'range') f.enemy.position.z = 4;
    if (invalid === 'elevation') f.enemy.position.h = 1;
    if (invalid === 'cover') f.world.blockers.push({ id: 'wall', x: 0, z: 0.6, w: 3, d: 0.1 });
    if (invalid === 'door')
      f.world.entities.push({
        id: 'door',
        type: 'door',
        x: 0,
        z: 0.6,
        h: 0,
        axis: 'z',
        open: false,
        locked: false,
        requiresAltar: false,
      });
    f.step(3);
    assert.equal(f.player.health.current, 100);
    assert.equal(f.ecs.query('particle').length, 0, 'a miss is not a block');
  }
});

test('a frontal block cannot suppress an immediate rear hit or a non-directional hazard', () => {
  const f = fixture();
  assert.ok(f.combat.startAttack(f.enemy, f.player));
  f.step(16);
  assert.equal(f.player.health.current, 100);
  f.enemy.attack.reset();
  f.enemy.position.z = -1.2;
  assert.ok(f.combat.startAttack(f.enemy, f.player));
  f.step(16);
  assert.equal(f.player.health.current, 94);
  assert.equal(f.combat.damage(f.player, 18), true);
  assert.equal(f.player.health.current, 76);
});

test('defense interrupts the final unresolved attack boundary, retains target and resumes only on release', () => {
  for (const elapsed of [0, 14 / 60, 0.25]) {
    const f = fixture();
    f.player.entity.require('defense').release();
    f.combat.target(f.player, f.enemy);
    assert.ok(f.combat.startAttack(f.player, f.enemy));
    f.combat.update(elapsed);
    const hp = f.enemy.health.current;
    assert.ok(requestDefense(f.player));
    assert.equal(f.player.attack.swing, null);
    assert.equal(f.player.attack.target, f.enemy.id);
    for (let i = 0; i < 90; i++) {
      f.combat.pursue(f.player, 1 / 60);
      f.step(1);
    }
    assert.equal(f.enemy.health.current, hp, 'no delayed impact or autoswing');
    assert.equal(f.combat.startAttack(f.player, f.enemy), false);
    f.player.entity.require('defense').release();
    f.combat.pursue(f.player, 1 / 60);
    f.step(16);
    assert.ok(f.enemy.health.current < hp, 'ordinary pursuit restarts');
  }
});

test('held input latches cancellation/jump/invalid press, ignores repeat and duplicate downs', () => {
  const f = fixture(),
    d = f.player.entity.require('defense');
  assert.equal(requestDefense(f.player), false);
  assert.equal(requestDefense(f.player, true), false);
  assert.ok(f.player.defending);
  for (const reset of [
    () => stopActor(f.player),
    () => teleportActor(f.player, f.world, { x: 0, z: 0 }),
    () => requestJump(f.player),
  ]) {
    reset();
    assert.equal(f.player.defending, false);
    assert.equal(d.raised, false);
    assert.equal(requestDefense(f.player), false, 'duplicate down cannot bypass release latch');
    for (let i = 0; i < 90; i++) moveActor(f.player, f.world, {}, 1 / 60);
    assert.equal(f.player.defending, false, 'landing cannot raise a cancelled guard');
    d.release();
    assert.equal(requestDefense(f.player, true), false, 'repeat after lost focus cannot raise');
    assert.ok(requestDefense(f.player));
  }
  d.release();
  requestJump(f.player);
  assert.equal(requestDefense(f.player), false);
  for (let i = 0; i < 90; i++) moveActor(f.player, f.world, {}, 1 / 60);
  assert.equal(requestDefense(f.player), false, 'airborne down must also await release');
  d.release();
  assert.ok(requestDefense(f.player));
});

test('defense cancels work and is opt-in reusable on a kobold, with dead/corpse and stale guard rejection', () => {
  const f = fixture();
  assert.equal(f.enemy.entity.has('defense'), false);
  f.player.entity.require('defense').release();
  const work = new WorkAction(f.player.entity, 'objective');
  f.player.entity.add('work', work);
  work.chart.send({ type: 'START', id: 'cycle', duration: 6 });
  work.chart.send({ type: 'TICK', dt: 6 });
  assert.equal(work.snapshot().status, 'ready');
  assert.ok(requestDefense(f.player));
  assert.equal(f.player.entity.has('work'), false);
  assert.equal(work.snapshot().cycleId, null, 'even a completed-but-uncommitted cycle is retired');
  const kobold = createActor(f.ecs, f.world, 'shieldbearer', 'kobold', { x: 3, z: 0, h: 0 });
  assert.equal(requestDefense(kobold), false);
  kobold.entity.add('defense', new Defense());
  assert.ok(requestDefense(kobold));
  for (const invalid of ['dead', 'corpse', 'jump', 'attack'] as const) {
    const g = fixture();
    if (invalid === 'dead') g.player.health.current = 0;
    if (invalid === 'corpse') g.player.entity.add('corpse', { age: 1 });
    if (invalid === 'jump') g.player.jump.request();
    if (invalid === 'attack')
      g.player.attack.start(
        {
          target: g.enemy.id,
          elapsed: 0,
          duration: 1,
          impact: 0.5,
          kind: 'MELEE',
          resolved: false,
        },
        1,
      );
    assert.equal(g.player.defending, false);
    g.step(1);
    assert.equal(g.player.entity.require('defense').raised, false);
  }
});

test('directional damage rejects friendly/self/invalid hits before block feedback; caps and expires sparks', () => {
  const f = fixture();
  const impact = { kind: 'projectile' as const, travel: { x: 0, z: -10 } };
  const ally = createActor(f.ecs, f.world, 'ally', 'player', { x: 3, z: 0, h: 0 });
  for (const source of [ally, f.player])
    assert.equal(f.combat.damage(f.player, 7, source, impact), false);
  for (const amount of [0, -1, NaN, Infinity])
    assert.equal(f.combat.damage(f.player, amount, f.enemy, impact), false);
  f.player.health.invulnerable = 1;
  assert.equal(f.combat.damage(f.player, 7, f.enemy, impact), false);
  assert.equal(f.ecs.query('particle').length, 0);
  f.player.health.invulnerable = 0;
  const healthSnapshot = f.player.health.chart.snapshot;
  for (let i = 0; i < 100; i++) assert.equal(f.combat.damage(f.player, 7, f.enemy, impact), false);
  assert.equal(
    f.player.health.chart.snapshot,
    healthSnapshot,
    'blocks never send DAMAGE or PROTECT',
  );
  assert.equal(f.player.health.current, 100);
  assert.ok(f.ecs.query('particle').length > 0 && f.ecs.query('particle').length <= 192);
  assert.ok(f.ecs.query('particle').every((e) => e.require('particle').kind === 'block'));
  f.step(60);
  assert.equal(f.ecs.query('particle').length, 0);
  for (const travel of [
    { x: 0, z: 0 },
    { x: NaN, z: 1 },
    { x: 0, z: Infinity },
  ]) {
    assert.equal(
      f.combat.damage(f.player, 7, f.enemy, { kind: 'melee', travel }),
      true,
      'invalid direction cannot grant immunity',
    );
  }
});

test('projectile collision still skips friendly shields, rejects missing sources and respects cover/elevation', () => {
  for (const obstacle of ['friendly', 'missing-source', 'cover', 'elevation'] as const) {
    const f = fixture();
    f.enemy.position.z = 4.8;
    const friend = createActor(f.ecs, f.world, 'friend', 'goblin', { x: 0, z: 2, h: 0 });
    friend.entity.add('defense', new Defense());
    friend.position.heading = 0;
    requestDefense(friend);
    assert.ok(f.combat.startAttack(f.enemy, f.player, true));
    f.step(28);
    if (obstacle === 'missing-source') f.ecs.remove(f.enemy.id);
    if (obstacle === 'cover') f.world.blockers.push({ id: 'wall', x: 0, z: 1, w: 3, d: 0.1 });
    if (obstacle === 'elevation') f.player.position.h = 2;
    f.step(26);
    assert.equal(friend.health.current, friend.health.max);
    assert.equal(f.player.health.current, 100);
    const sparks = f.ecs.query('particle');
    assert.equal(
      sparks.length > 0,
      obstacle === 'friendly',
      'only the hostile geometric contact blocks',
    );
    if (obstacle === 'friendly') assert.ok(sparks.every((e) => e.require('transform').z < 1));
    f.step(120);
    assert.equal(f.ecs.query('projectile').length, 0);
  }
});

test('raised state is insufficient on a corpse, mid-jump or concurrent raw attack; release permits normal hits', () => {
  for (const invalid of ['corpse', 'jump', 'attack', 'released'] as const) {
    const f = fixture();
    if (invalid === 'corpse') f.player.entity.add('corpse', { age: 1 });
    if (invalid === 'jump') f.player.jump.request();
    if (invalid === 'attack')
      f.player.attack.start(
        {
          target: f.enemy.id,
          elapsed: 0,
          duration: 1,
          impact: 0.5,
          kind: 'MELEE',
          resolved: false,
        },
        1,
      );
    if (invalid === 'released') f.player.entity.require('defense').release();
    assert.equal(
      f.combat.damage(f.player, 7, f.enemy, { kind: 'melee', travel: { x: 0, z: -1 } }),
      invalid !== 'corpse',
    );
    assert.ok(!f.ecs.query('particle').some((e) => e.require('particle').kind === 'block'));
  }
});

test('guard uses measured movement heading and keeps full walk/run speed over corpses and water rules', () => {
  for (const speed of [4.8, 7.4])
    for (const water of [false, true]) {
      const f = fixture();
      f.enemy.health.current = 0;
      f.enemy.entity.add('corpse', { age: 1 });
      const g = fixture();
      g.player.entity.require('defense').release();
      g.enemy.health.current = 0;
      g.enemy.entity.add('corpse', { age: 1 });
      if (water)
        for (const world of [f.world, g.world])
          for (const tile of world.tiles.values()) tile.surface = 'water';
      for (let i = 0; i < 60; i++) {
        const intent = { direction: { x: 1, z: 0 }, speed };
        moveActor(f.player, f.world, intent, 1 / 60);
        moveActor(g.player, g.world, intent, 1 / 60);
        assert.deepEqual(f.player.position, g.player.position);
        assert.equal(f.player.motion.actualSpeed, g.player.motion.actualSpeed);
        assert.ok(f.player.defending);
      }
      assert.equal(f.player.position.heading, Math.PI / 2);
    }
});
