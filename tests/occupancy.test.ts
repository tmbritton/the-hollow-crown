import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { ECS } from '../src/ecs.ts';
import { createActor, moveActor, teleportActor } from '../src/actors.ts';
import type { Actor } from '../src/actors.ts';
import type { ActorKind } from '../src/ecs.ts';
import { CombatSystem } from '../src/combat.ts';
import { key } from '../src/world.ts';
import type { NavigationWorld } from '../src/navigation.ts';
import type { DoorEntity, Point, Spawn, Tile } from '../src/worldTypes.ts';
import { updateDoors } from '../src/worldEntities.ts';
import { Health } from '../src/machines/actors/health.ts';

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

test('ECS owns body and transform inputs, including getter-backed geometry', () => {
  const { ecs, actor } = fixture();
  const a = actor('player', -2),
    b = actor('goblin', 0);
  const o = a.navigator.occupancy!;
  const p = { x: 0, z: 0, h: 0, heading: 0 };
  const body = { radius: 0.45, height: 1.6 };
  b.entity.add('transform', p).add('body', body);
  p.x = 6;
  body.radius = 0.01;
  const point = { x: 0.65, z: 0, h: 0 };
  assert.equal(b.position.x, 0);
  assert.equal(o.canStand(point), false);
  let x = 0;
  b.entity.add('transform', {
    get x() {
      return x;
    },
    z: 0,
    h: 0,
    heading: 0,
  });
  b.entity.add('body', {
    get radius() {
      return body.radius;
    },
    height: 1.6,
  });
  x = 6;
  body.radius = 1;
  assert.equal(b.position.x, 0);
  assert.equal(o.canStand(point), true);
  b.position.x = 0.4;
  b.entity.require('body').radius = 0.5;
  assert.equal(o.canStand(point), false);
  b.entity.setPosition({ x: 6, z: 0, h: 0 });
  assert.equal(o.canStand(point), true);
  ecs.living.fullScan = true;
  assert.equal(o.canStand(point), true);
});

test('updateDoors sees live doorway centers with or without motor geometry', () => {
  for (const fullScan of [false, true]) {
    const { ecs, actor } = fixture();
    ecs.living.fullScan = fullScan;
    const b = actor('goblin', 0);
    const door: DoorEntity = {
      id: 'gate',
      type: 'door',
      x: 0,
      z: 0,
      h: 0,
      axis: 'x',
      open: true,
      locked: false,
      requiresAltar: false,
    };
    ecs.create(door.id).add('door', door);
    updateDoors(ecs, 1);
    const shape = b.entity.require('body');
    const closes = () => {
      updateDoors(ecs, 1 / 60);
      door.open = false;
      return !door.open;
    };
    assert.equal(closes(), false);
    b.entity.remove('body');
    assert.equal(closes(), false, 'detached motor still holds the door');
    b.entity.add('body', shape);
    assert.equal(closes(), false);
    b.health.current = 0;
    assert.equal(closes(), true);
  }
});

test('every health transition publishes motor and doorway eligibility before returning', () => {
  for (const fullScan of [true, false]) {
    const { ecs, actor } = fixture();
    ecs.living.fullScan = fullScan;
    const a = actor('player', -2),
      b = actor('goblin', 0);
    const door: DoorEntity = {
      id: 'gate',
      type: 'door',
      x: 0,
      z: 0,
      h: 0,
      axis: 'x',
      open: true,
      locked: false,
      requiresAltar: false,
    };
    ecs.create(door.id).add('door', door);
    const occupancy = a.navigator.occupancy!;
    const check = (label: string, living: boolean) => {
      door.open = true;
      updateDoors(ecs, 1);
      door.open = false;
      assert.deepEqual(
        [
          b.health.current > 0,
          !occupancy.canStand(b.position),
          !occupancy.segmentClear(a.position, { x: 2, z: 0, h: 0 }),
          door.open,
        ],
        [living, living, living, living],
        `${fullScan ? 'native' : 'indexed'}: ${label} (health, stand, sweep, doorway)`,
      );
    };
    let publications = 0;
    const h = b.health;
    h.observeEligibility(() => publications++);
    check('initial', true);
    const builds = ecs.living.builds;
    h.chart.send({ type: 'PROTECT', value: 1 });
    h.chart.send({ type: 'DAMAGE', amount: 1000 });
    assert.equal(h.damage(1000), false);
    h.advance(1);
    h.max = 10;
    h.chart.send({ type: 'DAMAGE', amount: 1 });
    check('protection, expiration, max clamp and nonlethal damage', true);
    assert.equal(publications, 0);
    assert.equal(ecs.living.builds, builds);

    h.chart.send({ type: 'DAMAGE', amount: 1000 });
    check('direct lethal DAMAGE', false);
    h.chart.send({ type: 'SET_HP', value: 4 });
    check('direct SET_HP revival', true);
    assert.ok(h.damage(1000));
    check('wrapper lethal damage', false);
    h.current = 4;
    check('setter revival', true);
    h.chart.send({ type: 'SET_HP', value: 0 });
    check('direct SET_HP death', false);
    if (!fullScan)
      assert.equal(publications, 5, 'exactly one notification per eligibility transition');

    b.entity.add('health', new Health(10));
    check('live health component replaces dead component', true);
    h.current = 4;
    h.current = 0;
    check('writes to detached health do not alter the replacement', true);
    b.health.chart.send({ type: 'DAMAGE', amount: 1000 });
    check('replacement health still publishes', false);
  }
});

test('live indexed cylinders match fresh scans after each sequential publication', () => {
  const { ecs, world, actor } = fixture();
  let a = actor('player', -2);
  const b = actor('goblin', 0);
  const compare = () => {
    const results = (fullScan: boolean) => {
      ecs.living.fullScan = fullScan;
      return [a, b].map((m) => {
        const o = m.navigator.occupancy!;
        const from = m.position,
          to = { x: -1 - from.x, z: 0.25, h: from.h };
        return [
          o.canStand(to),
          o.segmentClear(from, to),
          o.move(from, { x: to.x - from.x, z: to.z }, (p, d) => ({
            x: p.x + d.x,
            z: p.z + d.z,
            h: p.h,
          })),
        ];
      });
    };
    const indexed = results(false);
    assert.deepEqual(results(true), indexed);
    ecs.living.fullScan = false;
  };
  compare();
  const builds = ecs.living.builds;
  compare();
  assert.equal(ecs.living.builds, builds);
  moveActor(a, world, { direction: { x: 1, z: 0.35 }, speed: 8 }, 0.25);
  compare();
  teleportActor(a, world, { x: -1, z: 0 });
  compare();
  a.position.h = 3;
  a.entity.require('body').radius = 1;
  compare();
  a.entity.add('body', { height: 0.2, radius: 0.1 });
  a.position.h = 0;
  compare();
  a.health.current = 0;
  assert.equal(ecs.living.counts.records, 1);
  compare();
  ecs.remove(a.id);
  a = createActor(ecs, world, a.id, 'player', { x: 0.6, z: 0, h: 0 });
  assert.equal(ecs.living.counts.records, 2);
  assert.equal(b.navigator.occupancy!.canStand(a.position), false);
  assert.equal(a.navigator.occupancy!.canStand(b.position), false);
  compare();
  ecs.living.dispose();
  assert.deepEqual(ecs.living.counts, { records: 0, buckets: 0, memberships: 0 });
});

test('initial overlap blocks inward motion, allows escape, and redirected slides recheck terrain', () => {
  const { ecs, actor } = fixture();
  const a = actor('player', -0.6),
    b = actor('goblin', 0);
  const o = a.navigator.occupancy!;
  const traces = [false, true].map((scan) => {
    ecs.living.fullScan = scan;
    const free = (p: Spawn, d: Point) => ({ x: p.x + d.x, z: p.z + d.z, h: p.h });
    const inward = o.move(a.position, { x: 0.4, z: 0 }, free);
    const escape = o.move(a.position, { x: -0.5, z: 0 }, free);
    assert.equal(inward.x, -0.6);
    assert.ok(escape.x < -1.09);
    const start = { x: -1, z: -0.35, h: 0, heading: 0 };
    let redirected = 0,
      clipped = 0;
    const slide = o.move(start, { x: 1.1, z: 0 }, (p, d) => {
      if (d.z < -1e-6) redirected++;
      const next = free(p, d);
      if (next.z < -0.43) clipped++;
      return { ...next, z: Math.max(-0.43, next.z) };
    });
    assert.ok(redirected && clipped, 'living contact must redirect a sweep into terrain');
    assert.ok(Math.hypot(slide.x - b.position.x, slide.z - b.position.z) >= 0.9 - 1e-6);
    assert.ok(slide.z >= -0.43 && slide.z < start.z, 'slide remains on the safe side of terrain');
    return { inward, escape, slide, redirected, clipped };
  });
  assert.deepEqual(traces[0], traces[1]);
});

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

test('render-vector route endpoints preserve coordinates with live occupancy', () => {
  const f = fixture(),
    mover = f.actor('player', -4, -1),
    blocker = f.actor('goblin', 0, 3);
  const from = new Vector3(mover.position.x, mover.position.h, mover.position.z);
  const target = { x: 4, z: -1 };
  assert.equal(mover.navigator.occupancy!.bodies().length, 1, 'exclude the moving actor itself');
  assert.ok(mover.navigator.goTo(from, target), 'a distant actor must not block a clear route');
  assert.deepEqual(mover.navigator.path, [target]);
  assert.ok(mover.navigator.canOccupy(from));

  const goal = new Vector3(target.x, 0, target.z);
  assert.ok(mover.navigator.goTo(from, goal));
  goal.x = 6;
  assert.deepEqual(mover.navigator.destination, target, 'snapshot the requested coordinates');

  blocker.position.z = -1;
  assert.equal(mover.navigator.goTo(from, new Vector3(0, 0, -1)), false);
  assert.ok(mover.navigator.goTo(from, new Vector3(target.x, 0, target.z)));
  assert.ok(mover.navigator.path.length > 1, 'still detour around a body on the route');
  for (let i = 0; i < 240; i++) {
    moveActor(mover, f.world, {}, 1 / 60);
    assertSeparated(mover, blocker);
  }
  assert.ok(Math.hypot(mover.position.x - target.x, mover.position.z - target.z) < 0.04);
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

test('corpses leave every actor at full speed; water alone slows to 52% without stacking', () => {
  for (const kind of ['player', 'goblin', 'kobold', 'skeleton'] as const) {
    const samples: number[] = [];
    for (const terrain of ['stone', 'corpse', 'pile', 'water', 'pile-in-water'] as const) {
      const f = fixture(),
        mover = f.actor(kind, 0);
      const water = terrain.includes('water');
      if (water) for (const tile of f.world.tiles.values()) tile.surface = 'water';
      if (terrain !== 'water' && terrain !== 'stone') {
        for (let i = 0; i < (terrain === 'corpse' ? 1 : 3); i++) {
          const dead = f.actor('skeleton', 0);
          dead.health.current = 0;
          dead.entity.add('corpse', { age: 1 });
        }
      }
      assert.ok(mover.navigator.goTo(mover.position, { x: 3, z: 0 }));
      for (let i = 0; i < 60; i++) moveActor(mover, f.world, { speed: 1 }, 1 / 60);
      samples.push(mover.position.x);
      assert.ok(Math.abs(mover.motion.speed - (water ? 0.52 : 1)) < 0.001, `${kind}: ${terrain}`);
      assert.equal(mover.position.h, 0);
      assert.equal(mover.elevation, 0);
      assert.equal(mover.jump.landings, 0);
    }
    assert.ok(samples[0] > 0.9);
    assert.ok(
      samples.slice(0, 3).every((x) => Math.abs(x - samples[0]) < 1e-8),
      `${kind}: ${samples}`,
    );
    assert.ok(Math.abs(samples[3] - samples[0] * 0.52) < 1e-8);
    assert.ok(Math.abs(samples[4] - samples[3]) < 1e-8);
  }
});

test('walking and running across fallen heads and overlapping bodies match unobstructed travel', () => {
  for (const kind of ['player', 'goblin', 'kobold', 'skeleton'] as const) {
    for (const speed of [4.8, 7.4]) {
      const traces = [0, 3].map((count) => {
        const f = fixture(),
          mover = f.actor(kind, -3);
        for (let i = 0; i < count; i++) {
          const dead = f.actor('skeleton', i * 0.4);
          dead.health.current = 0;
          dead.entity.add('corpse', { age: 1 });
        }
        assert.ok(mover.navigator.goTo(mover.position, { x: 5, z: 0 }));
        assert.equal(mover.navigator.path.length, 1);
        return Array.from({ length: 150 }, () => {
          moveActor(mover, f.world, { speed }, 1 / 60);
          return { ...mover.position, speed: mover.motion.actualSpeed, elevation: mover.elevation };
        });
      });
      assert.deepEqual(traces[1], traces[0], `${kind} at ${speed}`);
      assert.ok(traces[1].at(-1)!.x > 4.9);
    }
  }
});
