import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECS } from '../src/ecs.ts';
import type { ActorKind } from '../src/ecs.ts';
import { createActor, makeBrain, moveActor, stopActor } from '../src/actors.ts';
import { CombatSystem, clearSight, seedEnemies } from '../src/combat.ts';
import { generateDungeon, key } from '../src/world.ts';
import { registerWorld, updateDoors } from '../src/worldEntities.ts';
import type { NavigationWorld } from '../src/navigation.ts';
import type { DoorEntity, Tile } from '../src/worldTypes.ts';
import { Health } from '../src/machines/actors/health.ts';
import { RUN_SPEED, WALK_SPEED } from '../src/locomotion.ts';

function fixture() {
  const ecs = new ECS(),
    tiles = new Map<string, Tile>();
  for (let x = -12; x <= 12; x++)
    for (let z = -8; z <= 8; z++) tiles.set(key(x, z), { x, z, h: 0, surface: 'stone' });
  const world: NavigationWorld = { tiles, blockers: [], entities: [] };
  const player = createActor(ecs, world, 'player', 'player', { x: -8, z: 0, h: 0 });
  const combat = new CombatSystem(ecs, world, [player]);
  const enemy = (kind: ActorKind, x: number, z = 0, ai = true, slot = 0) => {
    const actor = createActor(ecs, world, `${kind}:${ecs.size}`, kind, { x, z, h: 0 });
    if (ai && kind !== 'player')
      actor.entity.add(
        'brain',
        makeBrain(kind, actor.position, kind === 'kobold' ? 'pack' : '', slot),
      );
    return actor;
  };
  const step = (frames: number, pursue = false) => {
    for (let i = 0; i < frames; i++) {
      updateDoors(ecs, 1 / 60);
      if (pursue) moveActor(player, world, { locked: combat.pursue(player, 1 / 60) }, 1 / 60);
      combat.update(1 / 60);
    }
  };
  return { ecs, world, player, combat, enemy, step };
}

test('death notification comes only from an accepted lethal impact, with the actual source', () => {
  const { ecs, world, player, enemy } = fixture();
  const target = enemy('goblin', -7, 0, false);
  const ally = enemy('goblin', -6, 0, false);
  const events: { victim: string; source?: string }[] = [];
  const combat = new CombatSystem(ecs, world, [player, target, ally], 'events', {
    onDeath: (victim, source) => {
      assert.ok(victim.entity.has('corpse'));
      events.push({ victim: victim.id, source: source?.id });
    },
  });
  assert.equal(combat.damage(target, 1000, ally), false);
  target.health.invulnerable = 1;
  assert.equal(combat.damage(target, 1000, player), false);
  target.health.invulnerable = 0;
  combat.damage(target, 1, player);
  assert.deepEqual(events, []);
  combat.damage(target, 1000, player);
  combat.damage(target, 1000, player);
  combat.update(1 / 60);
  assert.deepEqual(events, [{ victim: target.id, source: player.id }]);
  combat.damage(ally, 1000);
  assert.deepEqual(events[1], { victim: ally.id, source: undefined });
});

test('ECS attachment, replacement, removal and destruction update indexed multi-component queries', () => {
  const ecs = new ECS();
  const tile = ecs.create('floor').add('tile', { x: 0, z: 0, h: 0, surface: 'stone' });
  assert.deepEqual(ecs.query('tile', 'health'), []);
  tile.add('health', new Health(10));
  assert.deepEqual(ecs.query('tile', 'health'), [tile]);
  const replacementHealth = new Health(10);
  replacementHealth.current = 5;
  tile.add('health', replacementHealth);
  assert.equal(ecs.query('health').length, 1);
  assert.equal(tile.require('health').current, 5);
  tile.remove('health');
  assert.equal(ecs.query('health').length, 0);
  ecs.remove('floor');
  tile.add('health', new Health(1));
  assert.equal(ecs.size, 0);
  assert.equal(ecs.query('health').length, 0);
  const replacement = ecs.create('floor').add('tile', { x: 1, z: 0, h: 0, surface: 'stone' });
  tile.add('health', new Health(1));
  assert.equal(ecs.query('health').length, 0, 'retired handles cannot rejoin a reused entity ID');
  assert.deepEqual(ecs.query('tile'), [replacement]);
  assert.throws(() => ecs.create('one') && ecs.create('one'), /Duplicate entity/);
});

test('generated scenery and interactables are entities, with deterministic safe enemy populations', () => {
  for (const seed of ['MOURNING-731', 'CINDER-42', 'VIOLET-7', 'COMBAT-4', 'COMBAT-5']) {
    const world = generateDungeon(seed),
      ecs = new ECS();
    registerWorld(ecs, world);
    assert.equal(ecs.query('tile').length, world.tiles.size);
    assert.equal(ecs.query('prop').length, world.props.length);
    assert.equal(ecs.query('interaction').length, world.entities.length);
    const enemies = seedEnemies(ecs, world);
    assert.equal(enemies.length, 21);
    for (const actor of enemies) {
      assert.ok(actor.navigator.canStand(actor.position));
      assert.notEqual(world.tiles.get(key(actor.position.x, actor.position.z))?.room, 'entrance');
      assert.notEqual(world.tiles.get(key(actor.position.x, actor.position.z))?.room, 'altar');
    }
    const other = seedEnemies(new ECS(), world);
    assert.deepEqual(
      enemies.map((a) => [a.id, a.position]),
      other.map((a) => [a.id, a.position]),
    );
  }
});

test('player and enemies share movement components, water slowdown and cancellation', () => {
  const { player, enemy, world } = fixture();
  const skeleton = enemy('skeleton', -8, 2, false);
  player.navigator.goTo(player.position, { x: -2, z: 0 });
  skeleton.navigator.goTo(skeleton.position, { x: -2, z: 2 });
  for (let i = 0; i < 60; i++) {
    moveActor(player, world, { speed: 3 }, 1 / 60);
    moveActor(skeleton, world, { speed: 3 }, 1 / 60);
  }
  assert.ok(Math.abs(player.position.x - skeleton.position.x) < 1e-8);
  stopActor(skeleton);
  assert.equal(skeleton.navigator.active, false);
  assert.equal(skeleton.motion.speed, 0);
  for (const tile of world.tiles.values()) tile.surface = 'water';
  moveActor(player, world, { speed: 3 }, 1 / 60);
  assert.ok(player.motion.speed < 3);
});

test('skeletons wander, ignore undead peers, and attack nearby living enemies instead of a distant player', () => {
  const f = fixture();
  const skeleton = f.enemy('skeleton', 0),
    peer = f.enemy('skeleton', 1, 1, false);
  f.step(40);
  assert.ok(Math.hypot(skeleton.position.x, skeleton.position.z) > 0.1);
  assert.equal(skeleton.attack.target, null);
  assert.equal(peer.health.current, peer.health.max);
  stopActor(skeleton);
  Object.assign(skeleton.position, { x: 0, z: 0 });
  skeleton.brain!.think = 0;
  const goblin = f.enemy('goblin', 1, 0, false);
  f.step(1);
  assert.equal(skeleton.attack.target, goblin.id);
  assert.equal(goblin.health.current, goblin.health.max, 'wind-up must precede damage');
  f.step(20);
  assert.ok(goblin.health.current < goblin.health.max);
  assert.equal(f.player.health.current, 100);
});

test('goblins flee both the player and other species at close range', () => {
  for (const threat of ['player', 'skeleton'] as const) {
    const f = fixture(),
      goblin = f.enemy('goblin', 0);
    if (threat === 'player') f.player.position.x = 2;
    else f.enemy('skeleton', 2, 0, false);
    f.step(1);
    assert.equal(goblin.brain?.state, 'flee');
    assert.ok(goblin.navigator.destination && goblin.navigator.destination.x < 0);
    f.step(40);
    assert.ok(goblin.position.x < -0.5);
  }
});

test('fleeing goblins outpace walking but a running player can close the gap', () => {
  const f = fixture();
  f.player.position.x = -2;
  const goblin = f.enemy('goblin', 0);
  f.step(24);
  assert.equal(goblin.brain?.state, 'flee');
  assert.ok(goblin.motion.actualSpeed > WALK_SPEED);
  assert.ok(goblin.motion.actualSpeed < WALK_SPEED * 1.15);
  assert.ok(goblin.motion.actualSpeed < RUN_SPEED);
});

test('goblins hide behind cover, peek out and launch ranged attacks', () => {
  const f = fixture();
  f.player.position.x = 0;
  f.world.blockers.push({ id: 'cover', x: 2, z: 0, w: 1, d: 2 });
  const goblin = f.enemy('goblin', 5);
  goblin.attack.target = f.player.id;
  goblin.brain!.memory = 5;
  const states = new Set<string>();
  let shots = 0;
  for (let i = 0; i < 600; i++) {
    f.step(1);
    states.add(goblin.brain!.state);
    shots += f.ecs.query('projectile').length;
  }
  assert.ok(
    states.has('hide') && states.has('peek') && states.has('attack'),
    [...states].join(','),
  );
  assert.ok(shots > 0);
});

test('kobolds use distinct flank slots, share pack alerts, and converge on a target', () => {
  const f = fixture();
  f.player.position.x = 0;
  const pack = [
    f.enemy('kobold', 5, 0, true, 0),
    f.enemy('kobold', 5, 2, true, 1),
    f.enemy('kobold', 5, -2, true, 2),
  ];
  f.step(15);
  assert.ok(pack.every((a) => a.attack.target === f.player.id));
  const destinations = pack.map((a) => a.navigator.destination);
  assert.equal(new Set(destinations.map((p) => JSON.stringify(p))).size, 3);
  f.step(240);
  assert.ok(f.player.health.current < 100);
  assert.ok(pack.every((a) => Math.hypot(a.position.x, a.position.z) < 2));
});

test('pursuit routes around obstacles, repeatedly attacks, stops on death, and retains a corpse', () => {
  const f = fixture();
  f.player.position.x = -4;
  f.world.blockers.push({ id: 'table', x: 0, z: 0, w: 2, d: 2 });
  const target = f.enemy('skeleton', 4, 0, false);
  assert.ok(f.combat.target(f.player, target));
  f.step(1, true);
  assert.ok(f.player.navigator.path.length > 1);
  f.step(300, true);
  assert.equal(target.health.current, 0);
  assert.ok(target.entity.has('corpse'));
  assert.equal(f.player.attack.target, null);
  assert.equal(f.player.navigator.active, false);
  const p = { ...f.player.position };
  f.step(180, true);
  assert.deepEqual(f.player.position, p);
  assert.ok(f.ecs.get(target.id));
  assert.equal(f.ecs.query('particle').length, 0);
});

test('melee resolves at impact and cannot hit through furniture, shut doors or after cancellation', () => {
  const f = fixture();
  f.player.position.x = 0;
  const target = f.enemy('skeleton', 1, 0, false);
  assert.ok(f.combat.startAttack(f.player, target));
  f.step(10);
  assert.equal(target.health.current, 48);
  f.world.blockers.push({ id: 'wall', x: 0.5, z: 0, w: 0.1, d: 3 });
  f.step(15);
  assert.equal(target.health.current, 48);
  f.world.blockers.length = 0;
  f.step(60);
  assert.ok(f.combat.startAttack(f.player, target));
  stopActor(f.player);
  f.step(60);
  assert.equal(target.health.current, 48);
  const door: DoorEntity = {
    id: 'door',
    type: 'door',
    x: 0.5,
    z: 0,
    h: 0,
    axis: 'x',
    open: false,
    locked: false,
    requiresAltar: false,
  };
  f.world.entities.push(door);
  assert.equal(clearSight(f.world, f.player.position, target.position), false);
  assert.equal(f.combat.startAttack(f.player, target), false);
});

test('locked pursuit keeps moving through windup, impact and recovery against a fleeing target', () => {
  const f = fixture();
  f.player.position.x = -4;
  const target = f.enemy('goblin', -2.6, 0, false);
  target.motion.speed = 5.2;
  const phases = new Set<string>();
  assert.ok(f.combat.target(f.player, target));
  let strikes = 0;
  for (let i = 0; i < 120 && target.alive; i++) {
    const locked = f.combat.pursue(f.player, 1 / 60);
    const swing = f.player.attack.swing;
    moveActor(f.player, f.world, { locked, speed: RUN_SPEED }, 1 / 60);
    if (swing) {
      assert.ok(f.player.motion.actualSpeed > 0.1, 'a melee swing must not lock the motor');
      phases.add(swing.resolved ? 'recovery' : 'windup');
    }
    const health = target.health.current;
    f.combat.update(1 / 60);
    if (target.health.current < health) {
      assert.equal(health - target.health.current, strikes ? 12 : 24);
      strikes++;
      phases.add('impact');
    }
    if (target.alive) moveActor(target, f.world, { direction: { x: 1, z: 0 }, speed: 5.2 }, 1 / 60);
    assert.ok(Math.hypot(f.player.position.x - target.position.x, f.player.position.z) >= 0.9);
  }
  assert.deepEqual([...phases].sort(), ['impact', 'recovery', 'windup']);
  assert.equal(strikes, 2, 'moving pursuit must land both ordinary timed strikes');
  assert.equal(f.player.attack.target, null);
  assert.equal(f.player.navigator.active, false);
});

test('moving swings still miss targets that escape reach or move behind cover before impact', () => {
  for (const obstruction of ['range', 'cover', 'door'] as const) {
    const f = fixture();
    f.player.position.x = 0;
    const target = f.enemy('goblin', 1.4, 0, false);
    f.combat.target(f.player, target);
    f.step(5, true);
    assert.ok(f.player.attack.swing);
    assert.ok(f.player.position.x > 0, 'windup advances the chase');
    if (obstruction === 'range') target.position.x = 10;
    else if (obstruction === 'cover')
      f.world.blockers.push({ id: 'wall', x: 0.9, z: 0, w: 0.1, d: 16 });
    else
      f.world.entities.push({
        id: 'gate',
        type: 'door',
        x: 0.9,
        z: 0,
        h: 0,
        axis: 'x',
        open: false,
        locked: true,
        requiresAltar: true,
      });
    f.step(12, true);
    assert.equal(target.health.current, target.health.max, obstruction);
  }
});

test('crossbow bolts are dodgable and stop at cover or closed doors', () => {
  for (const obstruction of ['dodge', 'cover', 'door'] as const) {
    const f = fixture();
    f.player.position.x = 0;
    const goblin = f.enemy('goblin', 6, 0, false);
    assert.ok(f.combat.startAttack(goblin, f.player, true));
    f.step(28);
    assert.equal(f.ecs.query('projectile').length, 1);
    if (obstruction === 'dodge') f.player.position.z = 2;
    if (obstruction === 'cover') f.world.blockers.push({ id: 'cover', x: 3, z: 0, w: 1, d: 3 });
    if (obstruction === 'door')
      f.world.entities.push({
        id: 'door',
        type: 'door',
        x: 3,
        z: 0,
        h: 0,
        axis: 'x',
        open: false,
        locked: false,
        requiresAltar: false,
      });
    f.step(120);
    assert.equal(f.player.health.current, 100, obstruction);
    assert.equal(f.ecs.query('projectile').length, 0);
  }
});

test('blood and bone dust are distinct bounded ECS particles; dead entities cannot take damage', () => {
  const f = fixture(),
    skeleton = f.enemy('skeleton', 0, 0, false),
    goblin = f.enemy('goblin', 2, 0, false);
  f.combat.damage(skeleton, 24, f.player);
  assert.ok(f.ecs.query('particle').every((e) => e.require('particle').kind === 'dust'));
  f.combat.damage(goblin, 100, f.player);
  assert.ok(f.ecs.query('particle').some((e) => e.require('particle').kind === 'blood'));
  assert.equal(f.combat.damage(goblin, 100, f.player), false);
  for (let i = 0; i < 100; i++) f.combat.damage(skeleton, 0, f.player);
  assert.ok(f.ecs.query('particle').length <= 192);
  f.step(100);
  assert.equal(f.ecs.query('particle').length, 0);
});

test('door interaction and navigation capabilities are shared, while locked gates remain sealed', () => {
  for (const kind of ['player', 'goblin', 'kobold', 'skeleton'] as const) {
    const f = fixture();
    const door: DoorEntity = {
      id: 'door',
      type: 'door',
      x: 0,
      z: 0,
      h: 0,
      axis: 'x',
      open: false,
      locked: false,
      requiresAltar: false,
    };
    f.world.entities.push(door);
    f.ecs.create(door.id).add('door', door);
    const actor = kind === 'player' ? f.player : f.enemy(kind, -4, 0, false);
    assert.equal(f.combat.requestDoor(actor, door.id), kind !== 'skeleton');
    if (kind === 'skeleton') continue;
    for (let i = 0; i < 240; i++) {
      f.combat.updateInteraction(actor);
      moveActor(actor, f.world, {}, 1 / 60);
      updateDoors(f.ecs, 1 / 60);
    }
    assert.ok(door.open, kind);
    assert.equal(actor.attack.interaction, null);
    door.locked = true;
    door.open = false;
    assert.equal(f.combat.requestDoor(actor, door.id), false);
    assert.equal(door.open, false);
  }
});

test('shared route planning opens intervening doors for capable actors and never bypasses a lock', () => {
  for (const kind of ['player', 'goblin', 'kobold', 'skeleton'] as const) {
    const f = fixture();
    for (const [id, tile] of f.world.tiles) if (Math.abs(tile.z) > 1) f.world.tiles.delete(id);
    const door: DoorEntity = {
      id: 'gate',
      type: 'door',
      x: 0,
      z: 0,
      h: 0,
      axis: 'x',
      open: false,
      locked: false,
      requiresAltar: true,
    };
    f.world.entities.push(door);
    f.ecs.create(door.id).add('door', door);
    const actor = f.enemy(kind, -4, 0, false);
    assert.equal(f.combat.route(actor, { x: 4, z: 0 }), kind !== 'skeleton');
    if (kind === 'skeleton') continue;
    for (let i = 0; i < 400; i++) {
      moveActor(actor, f.world, {}, 1 / 60);
      updateDoors(f.ecs, 1 / 60);
    }
    assert.ok(door.open && actor.position.x > 3.9, kind);
    door.open = false;
    door.locked = true;
    assert.equal(f.combat.route(actor, { x: -4, z: 0 }), false, kind);
  }
});
