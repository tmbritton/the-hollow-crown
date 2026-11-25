import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createActor, makeBrain, moveActor } from '../src/actors.ts';
import { CombatSystem } from '../src/combat.ts';
import { ECS } from '../src/ecs.ts';
import { installKoboldSquads } from '../src/koboldSquads.ts';
import type { EnemyProfileMode } from '../src/enemyFreezeProfile.ts';
import type { NavigationWorld } from '../src/navigation.ts';
import { key } from '../src/worldSpatial.ts';

function fixture(mode?: EnemyProfileMode) {
  const ecs = new ECS();
  const world: NavigationWorld = { tiles: new Map(), blockers: [], entities: [] };
  for (let x = -12; x <= 12; x++)
    for (let z = -12; z <= 12; z++) world.tiles.set(key(x, z), { x, z, h: 0, surface: 'stone' });
  const player = createActor(ecs, world, 'hero', 'player', { x: -7, z: 0, h: 0 });
  const solo = createActor(ecs, world, 'solo', 'skeleton', { x: -3, z: 0, h: 0 });
  solo.entity.add('brain', makeBrain('skeleton', solo.position));
  const pack = [0, 1, 2].map((i) => {
    const actor = createActor(ecs, world, `pack${i}`, 'kobold', { x: 2, z: i, h: 0 });
    actor.entity.add('brain', makeBrain('kobold', actor.position, 'pack', i));
    return actor;
  });
  installKoboldSquads(ecs, pack);
  const deaths: string[] = [];
  const combat = new CombatSystem(ecs, world, [player, solo, ...pack], 'profile-test', {
    mode,
    onDeath: (actor) => deaths.push(actor.id),
  });
  const step = () => {
    const dt = 1 / 60;
    moveActor(player, world, { locked: combat.pursue(player, dt) }, dt);
    combat.update(dt);
  };
  return { combat, player, solo, pack, step, deaths, ecs, world };
}

test('control and poses preserve the ordinary combat tick snapshots', () => {
  const fixtures = [fixture(), fixture('control'), fixture('poses')];
  for (const f of fixtures) f.combat.target(f.player, f.solo);
  for (let i = 0; i < 180; i++) {
    const snapshots = fixtures.map((f) => {
      f.step();
      return f.combat.actors.map((a) => ({
        p: { ...a.position },
        hp: a.health.current,
        target: a.attack.target,
        swing: a.attack.swing,
        state: a.brain?.state,
      }));
    });
    assert.deepEqual(snapshots[1], snapshots[0]);
    assert.deepEqual(snapshots[2], snapshots[0]);
  }
});

test('decisions off suppresses new solo, squad and reactive intents but not shared resolution', () => {
  const { player, solo, pack, combat, step, deaths, ecs } = fixture('decisions');
  let proxySyncs = 0;
  solo.entity.add('collision', {
    move: (from) => from,
    sync: () => {
      proxySyncs++;
    },
  });
  const original = combat.enemies.map((a) => ({ ...a.position }));
  const squad = ecs.query('koboldSquad')[0].require('koboldSquad');
  assert.equal(combat.target(pack[0], player), false);
  assert.equal(combat.route(solo, player.position), false);
  assert.ok(combat.damage(pack[0], 1, player));
  assert.ok(combat.damage(solo, 1, player));
  ecs
    .create()
    .add('transform', { ...player.position, x: player.position.x - 0.5, h: 0.85 })
    .add('projectile', {
      owner: pack[0].id,
      kind: 'CROSSBOW',
      vx: 10,
      vy: 0,
      vz: 0,
      life: 1,
      damage: 5,
    });
  for (let i = 0; i < 20; i++) step();
  assert.equal(proxySyncs, 20, 'stationary enemies still publish the motor collision proxy');
  assert.ok(player.health.current < 100);
  assert.equal(ecs.query('projectile').length, 0);
  assert.deepEqual(
    combat.enemies.map((a) => a.position),
    original,
  );
  assert.ok(
    combat.enemies.every((a) => !a.attack.target && !a.attack.swing && !a.navigator.pending),
  );
  assert.equal(squad.target, null);
  assert.ok(combat.target(player, solo));
  for (let i = 0; i < 95; i++) step();
  assert.ok(player.position.x > -7);
  assert.ok(solo.health.current < solo.health.max - 1);
  combat.damage(pack[1], 1000, player);
  step();
  assert.equal(squad.target, null);
  assert.ok(deaths.includes(pack[1].id));
  assert.ok(pack[1].entity.require('corpse').age > 0);
});

test('decisions off keeps idle support, momentum, and accepted routes on the normal motor', () => {
  const { solo, world, step } = fixture('decisions');
  const tile = world.tiles.get(key(-3, 0))!;
  tile.h = 0.25;
  let proxyHeight = 0;
  solo.entity.add('collision', {
    move: (from, delta) => ({ x: from.x + delta.x, z: from.z + delta.z }),
    sync: (p) => {
      proxyHeight = p.h;
    },
  });
  step();
  assert.equal(solo.position.h, 0.25);
  assert.equal(proxyHeight, 0.25);
  assert.equal(solo.motion.supportVelocity, 15);

  solo.motion.direction = { x: 1, z: 0 };
  solo.motion.speed = 1;
  step();
  assert.ok(solo.position.x > -3 && solo.motion.speed > 0 && solo.motion.speed < 1);
  assert.equal(solo.motion.wantsMovement, false);

  assert.ok(solo.navigator.intent(solo.position, { x: -1, z: 0 }));
  for (let i = 0; i < 100; i++) step();
  assert.ok(Math.abs(solo.position.x + 1) < 0.02);
  assert.equal(solo.navigator.active, false);
  assert.equal(solo.attack.target, null);
});

test('decisions off finishes an accepted swing without choosing a follow-up', () => {
  const { combat, solo, player, step } = fixture('decisions');
  Object.assign(player.position, { x: -4, z: 0 });
  assert.equal(combat.startAttack(solo, player), false);
  assert.ok(
    solo.attack.start(
      { kind: 'MELEE', target: player.id, elapsed: 0, impact: 0.2, duration: 0.5, resolved: false },
      0.6,
    ),
  );
  for (let i = 0; i < 90; i++) step();
  assert.equal(player.health.current, player.health.max - 9);
  assert.equal(solo.attack.swing, null);
  assert.equal(solo.attack.cooldown, 0);
});
