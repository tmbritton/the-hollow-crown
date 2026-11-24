import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Navigator, type NavigationWorld } from '../src/navigation.ts';
import { RouteBudget } from '../src/routeBudget.ts';
import { Occupancy } from '../src/occupancy.ts';
import { ECS } from '../src/ecs.ts';
import { createActor } from '../src/actors.ts';
import { CombatSystem } from '../src/combat.ts';

test('a burst of direct requests reserves admission work and cannot all complete in one tick', () => {
  const w = switchback(),
    b = new RouteBudget(),
    p = { x: 2, z: 0 };
  const states = Array.from({ length: 24 }, () => {
    const n = new Navigator(w);
    n.scheduleWith(b, () => p);
    return n.request(p, { x: 2.2, z: 0 });
  });
  assert.ok(states.includes('ready'));
  assert.ok(states.filter((s) => s === 'ready').length <= 6);
});
test('disconnected pursuit exhausts alternative approaches and releases its target', () => {
  const w: NavigationWorld = { tiles: new Map(), blockers: [], entities: [] };
  for (let x = 0; x < 55; x++)
    for (let z = 0; z < 27; z++)
      if (x !== 27) w.tiles.set(`${x},${z}`, { x, z, h: 0, surface: 'stone' });
  const ecs = new ECS(),
    a = createActor(ecs, w, 'p', 'player', { x: 25, z: 13, h: 0 }),
    t = createActor(ecs, w, 'g', 'goblin', { x: 31, z: 13, h: 0 }),
    c = new CombatSystem(ecs, w, [a, t]),
    b = new RouteBudget();
  a.navigator.scheduleWith(b, () => a.position);
  c.target(a, t);
  for (let i = 0; i < 600 && a.attack.target; i++) {
    b.tick();
    c.pursue(a, 1 / 60);
  }
  assert.equal(a.attack.target, null);
});
test('overhead motion does not prevent simultaneous partial routes from publishing', () => {
  const w: NavigationWorld = {
    tiles: new Map(),
    entities: [],
    blockers: [{ id: 'prop', x: 8, z: 8, w: 1.2, d: 1.2 }],
  };
  for (let x = 0; x <= 20; x++)
    for (let z = 0; z <= 20; z++) w.tiles.set(`${x},${z}`, { x, z, h: 0, surface: 'stone' });
  const p = { x: 3, z: 8 },
    g = { x: 8, z: 8 },
    body = { x: 9, z: 9, h: 4, height: 1.3, radius: 0.45 },
    o = new Occupancy({ height: 1.8, radius: 0.45 }, () => [body]),
    pool = new RouteBudget();
  const oracle = new Navigator(w, o);
  oracle.goTo(p, g, { partial: true });
  const ns = Array.from({ length: 3 }, () => {
    const n = new Navigator(w, o);
    n.scheduleWith(pool, () => p);
    n.request(p, g, { partial: true });
    return n;
  });
  while (pool.size && pool.ticks < 200) {
    body.x = 9 + 0.01 * Math.sin(pool.ticks);
    pool.tick();
  }
  for (const n of ns) assert.deepEqual(n.path, oracle.path);
});
test('queued AI routes use live door capability and negative results cannot survive a radius change', () => {
  const w: NavigationWorld = {
    tiles: new Map(),
    blockers: [],
    entities: [
      {
        id: 'd',
        type: 'door',
        axis: 'x',
        x: 8,
        z: 0,
        h: 0,
        requiresAltar: false,
        open: false,
        locked: false,
      },
    ],
  };
  for (let x = 0; x <= 120; x++) w.tiles.set(`${x},0`, { x, z: 0, h: 0, surface: 'stone' });
  const ecs = new ECS(),
    a = createActor(ecs, w, 'p', 'player', { x: 0, z: 0, h: 0 }),
    c = new CombatSystem(ecs, w, [a]),
    pool = new RouteBudget();
  a.navigator.scheduleWith(pool, () => a.position);
  c.route(a, { x: 116, z: 0 });
  assert.ok(a.navigator.pending);
  a.entity.require('actor').opensDoors = false;
  while (pool.size && pool.ticks < 500) pool.tick();
  assert.equal(a.navigator.planningResult, 'unreachable');
  const s = { radius: 0.45, height: 1.8 },
    o = new Occupancy(s, () => [{ x: 4, z: 0.75, h: 0, radius: 0.45, height: 1.3 }]),
    n = new Navigator(w, o);
  n.scheduleWith(pool, () => a.position);
  assert.equal(n.request(a.position, { x: 4, z: 0 }), 'unreachable');
  s.radius = 0.2;
  assert.notEqual(n.request(a.position, { x: 4, z: 0 }), 'unreachable');
});

function switchback(): NavigationWorld {
  const w: NavigationWorld = { tiles: new Map(), blockers: [], entities: [] };
  const add = (x: number, z: number) => w.tiles.set(`${x},${z}`, { x, z, h: 0, surface: 'stone' });
  for (let r = 0; r < 12; r++) {
    for (let x = 0; x <= 24; x++) add(x, r * 2);
    if (r < 11) add(r % 2 ? 0 : 24, r * 2 + 1);
  }
  return w;
}

test('requests can gain door permission before publishing', () => {
  const w: NavigationWorld = {
    tiles: new Map(),
    blockers: [],
    entities: [
      {
        id: 'd',
        type: 'door',
        axis: 'x',
        x: 40,
        z: 0,
        h: 0,
        requiresAltar: false,
        open: false,
        locked: false,
      },
    ],
  };
  for (let x = 0; x <= 120; x++) w.tiles.set(`${x},0`, { x, z: 0, h: 0, surface: 'stone' });
  const ecs = new ECS(),
    a = createActor(ecs, w, 'p', 'player', { x: 0, z: 0, h: 0 }),
    c = new CombatSystem(ecs, w, [a]),
    pool = new RouteBudget(4);
  a.navigator.scheduleWith(pool, () => a.position);
  a.entity.require('actor').opensDoors = false;
  c.route(a, { x: 110, z: 0 });
  assert.ok(a.navigator.pending);
  a.entity.require('actor').opensDoors = true;
  while (pool.size && pool.ticks < 200) pool.tick();
  assert.equal(a.navigator.planningResult, 'ready');
});

test('pending results observe bodies entering or leaving a choke without starvation from distant motion', () => {
  for (const initiallyClosed of [false, true]) {
    const w = switchback(),
      pool = new RouteBudget(8),
      from = { x: 0, z: 0 },
      goal = { x: 0, z: 22 };
    const blocker = { x: initiallyClosed ? 24 : 80, z: 1, h: 0, radius: 0.45, height: 1.3 },
      far = { ...blocker, x: 200 };
    const occupancy = new Occupancy({ radius: 0.45, height: 1.8 }, () => [blocker, far]);
    const n = new Navigator(w, occupancy);
    n.scheduleWith(pool, () => from);
    assert.equal(n.request(from, goal, { partial: true }), 'pending');
    pool.tick();
    blocker.x = initiallyClosed ? 80 : 24;
    for (let i = 0; i < 2000 && n.pending; i++) {
      far.x += 0.1;
      pool.tick();
    }
    const ref = new Navigator(w, occupancy);
    assert.ok(ref.goTo(from, goal, { partial: true }));
    assert.equal(n.planningResult, 'ready');
    assert.deepEqual(n.path, ref.path);
  }
});

test('off-route changes in the explored component do not invalidate a clear frontier route', () => {
  const w: NavigationWorld = { tiles: new Map(), blockers: [], entities: [] };
  for (let x = 0; x <= 18; x++)
    for (let z = 0; z <= 8; z++) w.tiles.set(`${x},${z}`, { x, z, h: 0, surface: 'stone' });
  const from = { x: 0, z: 2 },
    aim = { x: 24, z: 2 },
    runners = Array.from({ length: 8 }, (_, i) => ({
      x: 2.5 + i * 2,
      z: 7,
      h: 0,
      radius: 0.25,
      height: 1,
    })),
    occupancy = new Occupancy({ radius: 0.3, height: 1.8 }, () => runners),
    pool = new RouteBudget(4),
    n = new Navigator(w, occupancy),
    reference = new Navigator(w, occupancy);
  assert.ok(reference.goTo(from, aim, { partial: true }));
  n.scheduleWith(pool, () => from);
  assert.equal(n.request(from, aim, { partial: true }), 'pending');
  for (let i = 0; n.pending && i < 300; i++) {
    for (const runner of runners) runner.z = (i % 3 ? 7 : 7.3) + i * 0.0001;
    pool.tick();
    assert.ok(pool.used <= pool.limit);
  }
  assert.equal(n.planningResult, 'ready');
  assert.deepEqual(n.path, reference.path);
  assert.ok(n.liveSegmentClear(from, n.destination!));
  const end = n.destination!;
  n.arrive();
  const sequence = n.requestSequence;
  for (let i = 0; i < 6; i++) {
    for (const runner of runners) runner.z = i % 2 ? 7 : 7.3;
    assert.ok(n.followFloor(end, aim, i * 1000));
    assert.equal(n.requestSequence, sequence);
    assert.equal(n.destination, null);
  }
});

test('nonblocking bodies drifting in route chunks cannot starve budgeted publication', () => {
  const { nav, pool, from, aim, bodies } = driftingBesideRoute(100, 40);
  assert.equal(nav.request(from, aim, { partial: true }), 'pending');
  for (let i = 0; nav.pending && i < 300; i++) {
    for (const body of bodies) body.z += 0.00001;
    assert.ok(nav.liveSegmentClear(from, { x: 100.179, z: 1 }));
    pool.tick();
    assert.ok(pool.used <= 4);
  }
  assert.equal(nav.planningResult, 'ready', `tick ${pool.ticks}`);
  assert.deepEqual(nav.destination, { x: 100.1798095703125, z: 1 });
});

for (const mode of ['void', 'exact', 'partial-exact'] as const)
  test(`nonblocking bodies drifting alongside a diagonal do not starve ${mode} publication`, () => {
    const w: NavigationWorld = { tiles: new Map(), blockers: [], entities: [] };
    for (let x = 0; x <= 48; x++)
      for (let z = 0; z <= 48; z++) w.tiles.set(`${x},${z}`, { x, z, h: 0, surface: 'stone' });
    const from = { x: 0, z: 0 },
      aim = mode === 'void' ? { x: 54, z: 54 } : { x: 48, z: 48 },
      options = { partial: mode !== 'exact' },
      offset = 0.65 / Math.sqrt(2),
      bodies = Array.from({ length: 42 }, (_, i) => ({
        x: 3 + i + offset,
        z: 3 + i - offset,
        h: 0,
        radius: 0.25,
        height: 1,
      })),
      occupancy = new Occupancy({ radius: 0.3, height: 1.8 }, () => bodies),
      pool = new RouteBudget(4),
      nav = new Navigator(w, occupancy),
      reference = new Navigator(w, occupancy);
    assert.ok(reference.goTo(from, aim, options));
    assert.equal(reference.path.length, 1);
    nav.scheduleWith(pool, () => from);
    assert.equal(nav.request(from, aim, options), 'pending');
    for (let i = 0; nav.pending && i < 500; i++) {
      for (const body of bodies) {
        body.x += 0.000001;
        body.z += 0.000001;
      }
      assert.ok(nav.liveSegmentClear(from, reference.destination!));
      pool.tick();
      assert.ok(pool.used <= 4);
    }
    assert.equal(nav.planningResult, 'ready', `tick ${pool.ticks}`);
    assert.deepEqual(nav.path, reference.path);
  });

test('after arrival a body entering a traveled segment does not restart the held void aim', () => {
  const { nav, pool, from, aim, bodies, moveOwner } = driftingBesideRoute(18, 1);
  nav.request(from, aim, { partial: true });
  for (let i = 0; nav.pending && i < 300; i++) pool.tick();
  assert.equal(nav.planningResult, 'ready');
  const end = nav.destination!;
  moveOwner(end);
  nav.arrive();
  const sequence = nav.requestSequence;
  bodies[0].z = 1; // Really blocks the old segment; it does not affect the settled endpoint.
  assert.equal(nav.liveSegmentClear(from, end), false);
  assert.ok(nav.followFloor(end, aim, 1000));
  assert.equal(nav.requestSequence, sequence);
  assert.equal(nav.destination, null);
});

function driftingBesideRoute(length: number, count: number) {
  const w: NavigationWorld = { tiles: new Map(), blockers: [], entities: [] };
  for (let x = 0; x <= length; x++)
    for (let z = 0; z <= 3; z++) w.tiles.set(`${x},${z}`, { x, z, h: 0, surface: 'stone' });
  const from = { x: 0, z: 1 },
    aim = { x: length + 6, z: 1 },
    bodies = Array.from({ length: count }, (_, i) => ({
      x: 3 + 2 * i,
      z: 1.85,
      h: 0,
      radius: 0.25,
      height: 1,
    })),
    occupancy = new Occupancy({ radius: 0.3, height: 1.8 }, () => bodies),
    pool = new RouteBudget(4),
    nav = new Navigator(w, occupancy);
  let owner = from;
  nav.scheduleWith(pool, () => owner);
  return { nav, pool, from, aim, bodies, moveOwner: (point: typeof from) => (owner = point) };
}

test('three concurrent long commands share one tick allowance and publish complete oracle paths', () => {
  const w = switchback(),
    pool = new RouteBudget(16);
  const jobs = [
    [0, 0, 0, 22],
    [0, 22, 0, 0],
    [10, 0, 12, 20],
  ].map(([x, z, gx, gz]) => {
    const from = { x, z },
      goal = { x: gx, z: gz },
      oracle = new Navigator(w),
      nav = new Navigator(w);
    assert.ok(oracle.goTo(from, goal));
    nav.scheduleWith(pool, () => from);
    assert.equal(nav.request(from, goal), 'pending');
    assert.equal(nav.destination, null);
    return { nav, path: oracle.path };
  });
  let ticks = 0;
  while (pool.size && ticks++ < 2000) {
    pool.tick();
    assert.ok(pool.used <= 16);
  }
  assert.equal(pool.size, 0);
  assert.ok(ticks > 1);
  for (const { nav, path } of jobs) assert.deepEqual(nav.path, path);
});

test('a pending route cannot publish after cancellation, replacement or run disposal', () => {
  const w = switchback(),
    pool = new RouteBudget(1),
    nav = new Navigator(w),
    from = { x: 0, z: 0 };
  nav.scheduleWith(pool, () => from);
  assert.equal(nav.request(from, { x: 0, z: 22 }), 'pending');
  nav.cancel();
  assert.equal(pool.size, 0);
  nav.request(from, { x: 0, z: 22 });
  nav.request(from, { x: 1, z: 0 });
  for (let i = 0; i < 100 && pool.size; i++) pool.tick();
  assert.deepEqual(nav.destination, { x: 1, z: 0 });
  nav.request(from, { x: 0, z: 22 });
  pool.dispose();
  assert.equal(nav.pending, false);
  assert.equal(nav.destination, null);
});
