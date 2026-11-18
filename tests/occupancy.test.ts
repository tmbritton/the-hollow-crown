import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECS } from '../src/ecs.ts';
import { createActor, moveActor, teleportActor } from '../src/actors.ts';
import type { Actor } from '../src/actors.ts';
import type { ActorKind } from '../src/ecs.ts';
import { CombatSystem } from '../src/combat.ts';
import { key } from '../src/world.ts';
import type { NavigationWorld } from '../src/navigation.ts';
import type { Point, Tile } from '../src/worldTypes.ts';

function fixture(depth = 5) {
  const ecs = new ECS();
  const tiles = new Map<string, Tile>();
  for (let x = -8; x <= 8; x++)
    for (let z = -depth; z <= depth; z++) tiles.set(key(x, z), { x, z, h: 0, surface: 'stone' });
  const world: NavigationWorld = { tiles, blockers: [], entities: [] };
  const actor = (kind: ActorKind, x: number, z = 0) =>
    createActor(ecs, world, `${kind}:${ecs.size}`, kind, { x, z, h: 0 });
  return { ecs, world, actor };
}

function assertSeparated(a: Actor, b: Actor) {
  const distance = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
  assert.ok(
    distance >= a.entity.require('body').radius + b.entity.require('body').radius - 1e-6,
    `${a.id} overlaps ${b.id}: ${distance}`,
  );
}

test('keyboard motors stop at hostile and allied bodies without pushing them', () => {
  for (const kind of ['player', 'goblin'] as const) {
    const f = fixture(),
      mover = f.actor(kind, -2),
      blocker = f.actor('goblin', 0);
    for (let i = 0; i < 180; i++) {
      moveActor(mover, f.world, { direction: { x: 1, z: 0 }, speed: 7.4 }, 1 / 60);
      assertSeparated(mover, blocker);
    }
    assert.ok(mover.position.x < -0.89 && mover.position.x > -0.92);
    assert.equal(blocker.position.x, 0);
    assert.equal(blocker.position.z, 0);
    assert.equal(mover.motion.actualSpeed, 0);
  }
});

test('fast displacement cannot tunnel through an actor even with a render collision adapter', () => {
  const f = fixture(),
    mover = f.actor('player', -3),
    blocker = f.actor('skeleton', 0);
  let synced: Point | null = null;
  mover.entity.add('collision', {
    move: (from, delta) => ({ x: from.x + delta.x, z: from.z + delta.z }),
    sync: (point) => {
      synced = { x: point.x, z: point.z };
    },
  });
  moveActor(mover, f.world, { direction: { x: 1, z: 0 }, speed: 30 }, 0.25);
  assertSeparated(mover, blocker);
  assert.ok(mover.position.x < 0);
  assert.deepEqual(synced, { x: mover.position.x, z: mover.position.z });
});

test('opposing allied movement never merges bodies, including reversed update order', () => {
  for (const reversed of [false, true]) {
    const f = fixture(0),
      a = f.actor('kobold', -2),
      b = f.actor('kobold', 2);
    for (let i = 0; i < 180; i++) {
      for (const actor of reversed ? [b, a] : [a, b]) {
        moveActor(actor, f.world, { direction: { x: actor === a ? 1 : -1, z: 0 } }, 1 / 60);
        assertSeparated(a, b);
      }
    }
    assert.ok(a.position.x < b.position.x);
  }
});

test('diagonal steering slides past bodies without shoving them into terrain', () => {
  const f = fixture(),
    mover = f.actor('player', -2, -0.3),
    blocker = f.actor('goblin', 0);
  f.world.blockers.push({ id: 'wall', x: 0, z: 1.3, w: 6, d: 1 });
  for (let i = 0; i < 100; i++) {
    moveActor(mover, f.world, { direction: { x: 1, z: -0.15 } }, 1 / 60);
    assertSeparated(mover, blocker);
    assert.ok(mover.navigator.canStand(mover.position));
  }
  assert.ok(mover.position.x > 1);
  assert.equal(blocker.position.x, 0);
});

test('click routes detour around living actors and reject occupied destinations', () => {
  const f = fixture(),
    mover = f.actor('player', -4),
    blocker = f.actor('goblin', 0);
  assert.equal(mover.navigator.goTo(mover.position, blocker.position), false);
  assert.ok(mover.navigator.goTo(mover.position, { x: 4, z: 0 }));
  assert.ok(mover.navigator.path.length > 1);
  for (let i = 0; i < 240; i++) {
    moveActor(mover, f.world, {}, 1 / 60);
    assertSeparated(mover, blocker);
  }
  assert.ok(Math.hypot(mover.position.x - 4, mover.position.z) < 0.04);
});

test('moving blockers invalidate routes and leaving/dying releases occupancy immediately', () => {
  const f = fixture(),
    mover = f.actor('player', -4),
    blocker = f.actor('goblin', 0, 3);
  assert.ok(mover.navigator.goTo(mover.position, { x: 4, z: 0 }));
  blocker.position.z = 0;
  for (let i = 0; i < 240; i++) {
    moveActor(mover, f.world, {}, 1 / 60);
    assertSeparated(mover, blocker);
  }
  assert.ok(mover.position.x > 3.9);
  blocker.health.current = 0;
  blocker.entity.add('corpse', { age: 0 });
  assert.ok(mover.navigator.goTo(mover.position, { x: -4, z: 0 }));
  assert.equal(mover.navigator.path.length, 1);
});

test('a goblin trapped at a corridor end cannot flee through the hero', () => {
  const f = fixture(0),
    player = f.actor('player', 6),
    goblin = f.actor('goblin', 7.5);
  goblin.enableAI();
  const combat = new CombatSystem(f.ecs, f.world, [player, goblin]);
  for (let i = 0; i < 180; i++) {
    combat.update(1 / 60);
    assertSeparated(player, goblin);
    assert.ok(goblin.position.x > player.position.x);
  }
  combat.target(player, goblin);
  for (let i = 0; i < 240 && goblin.alive; i++) {
    moveActor(player, f.world, { locked: combat.pursue(player, 1 / 60) }, 1 / 60);
    combat.update(1 / 60);
  }
  assert.equal(goblin.alive, false, 'the cornered goblin must remain catchable');
});

test('occupancy respects height, blocks neighbors on stairs, and avoids occupied respawns', () => {
  const f = fixture(),
    player = f.actor('player', -2),
    blocker = f.actor('goblin', 0);
  blocker.position.h = 3;
  assert.ok(player.navigator.goTo(player.position, { x: 2, z: 0 }));
  assert.equal(player.navigator.path.length, 1);
  blocker.position.h = 0.3;
  assert.ok(player.navigator.goTo(player.position, { x: 2, z: 0 }));
  assert.ok(player.navigator.path.length > 1);
  teleportActor(player, f.world, { x: 0, z: 0 });
  assertSeparated(player, blocker);
  assert.ok(player.navigator.canStand(player.position));
});

test('corpses slow players and enemies exactly like water without stacking', () => {
  for (const kind of ['player', 'goblin', 'kobold', 'skeleton'] as const) {
    const samples: number[] = [];
    for (const terrain of ['water', 'corpse', 'pile-in-water'] as const) {
      const f = fixture(),
        mover = f.actor(kind, 0);
      if (terrain !== 'corpse') for (const tile of f.world.tiles.values()) tile.surface = 'water';
      if (terrain !== 'water') {
        for (let i = 0; i < (terrain === 'corpse' ? 1 : 3); i++) {
          const dead = f.actor('skeleton', 0);
          dead.health.current = 0;
          dead.entity.add('corpse', { age: 1 });
        }
      }
      assert.ok(mover.navigator.goTo(mover.position, { x: 3, z: 0 }));
      for (let i = 0; i < 60; i++) moveActor(mover, f.world, { speed: 1 }, 1 / 60);
      samples.push(mover.position.x);
      assert.ok(Math.abs(mover.motion.speed - 0.52) < 0.001);
    }
    assert.ok(samples[0] > 0.4);
    assert.ok(
      samples.every((x) => Math.abs(x - samples[0]) < 1e-8),
      `${kind}: ${samples}`,
    );
  }
});

test('corpse slowdown follows the fallen body and ends on leaving or removing it', () => {
  const f = fixture(),
    player = f.actor('player', 0),
    dead = f.actor('skeleton', 0);
  dead.health.current = 0;
  dead.entity.add('corpse', { age: 1 });
  const occupancy = player.navigator.occupancy!;
  assert.ok(occupancy.slowedAt({ x: 1.7, z: 0, h: 0 }), 'the fallen head is difficult ground too');
  assert.equal(occupancy.slowedAt({ x: 0, z: 0, h: 2 }), false);
  assert.ok(player.navigator.goTo(player.position, { x: 4, z: 0 }));
  let slow = false,
    recovered = false;
  for (let i = 0; i < 240; i++) {
    moveActor(player, f.world, {}, 1 / 60);
    slow ||= player.position.x < 1 && player.motion.speed > 2 && player.motion.speed < 2.6;
    recovered ||= player.position.x > 2.4 && player.motion.speed > 4;
  }
  assert.ok(slow && recovered);
  assert.ok(player.position.x > 3.9, 'corpses stay traversable');
  f.ecs.remove(dead.id);
  assert.equal(occupancy.slowedAt({ x: 0, z: 0, h: 0 }), false);
});
