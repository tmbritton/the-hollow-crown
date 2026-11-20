import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Navigator, pickGround } from '../src/navigation.ts';
import type { NavigationWorld } from '../src/navigation.ts';
import { createActor, moveActor, stopActor, teleportActor } from '../src/actors.ts';
import type { Actor } from '../src/actors.ts';
import { ECS } from '../src/ecs.ts';
import { generateDungeon, key } from '../src/world.ts';
import type { DoorEntity, Point, Tile } from '../src/worldTypes.ts';

function grid(width = 6, depth = 4): NavigationWorld {
  const tiles = new Map<string, Tile>();
  for (let x = -width; x <= width; x++)
    for (let z = -depth; z <= depth; z++) tiles.set(key(x, z), { x, z, h: 0, surface: 'stone' });
  return { tiles, blockers: [], entities: [] };
}
const partial = { partial: true };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
function safeRoute(n: Navigator, from: Point) {
  for (const point of n.path) {
    assert.ok(n.canOccupy(point), `unsafe endpoint ${JSON.stringify(point)}`);
    assert.ok(n.segmentClear(from, point, false, n.occupancy?.bodies()), 'unsafe swept edge');
    from = point;
  }
}

function finishRoute(actor: Actor, world: NavigationWorld) {
  const end = actor.navigator.destination;
  assert.ok(end);
  let travelled = 0;
  for (let i = 0; i < 1200 && actor.navigator.active; i++) {
    const before = { ...actor.position };
    moveActor(actor, world, {}, 1 / 60);
    travelled += distance(before, actor.position);
    assert.ok(actor.navigator.canOccupy(actor.position), 'actual motor left safe floor');
  }
  assert.equal(actor.navigator.active, false);
  assert.equal(actor.motion.speed, 0);
  assert.ok(distance(actor.position, end) < 0.015, JSON.stringify(actor.position));
  return travelled;
}

function routeLength(from: Point, path: readonly Point[]) {
  let length = 0;
  for (const point of path) {
    length += distance(from, point);
    from = point;
  }
  return length;
}

test('cached floor components reroot after actual travel, without returning around the old side', (t) => {
  for (const axis of ['x', 'z'] as const) {
    const world = grid(9, 9),
      ecs = new ECS();
    const orient = (x: number, z: number) => (axis === 'x' ? { x, z } : { x: z, z: x });
    world.blockers.push(
      { id: 'large', x: 0, z: 0, w: 6, d: 6 },
      { id: 'small', ...orient(4, 0), w: axis === 'x' ? 2 : 1, d: axis === 'x' ? 1 : 2 },
    );
    const mover = createActor(ecs, world, 'hero', 'player', { ...orient(-5, 0), h: 0 });
    for (const target of [orient(0, 0), orient(4, 3)]) {
      assert.ok(mover.navigator.goTo(mover.position, target, partial));
      safeRoute(mover.navigator, mover.position);
      finishRoute(mover, world);
    }
    const target = orient(4, -3),
      from = { ...mover.position };
    const fresh = new Navigator(world);
    assert.ok(fresh.goTo(from, target, partial));
    const freshLength = routeLength(from, fresh.path);
    assert.ok(mover.navigator.goTo(from, target, partial));
    const cachedPath = mover.navigator.path;
    safeRoute(mover.navigator, from);
    const travelled = finishRoute(mover, world);
    t.diagnostic(JSON.stringify({ axis, freshLength, travelled, cachedPath }));
    assert.ok(travelled <= freshLength + 0.05, `cached ${travelled} vs fresh ${freshLength}`);
    assert.ok(
      cachedPath.every((p) => p[axis] >= 3.32),
      'route should stay on the current side',
    );
  }
});

test('equally close blocked-floor endpoints prefer short travel from opposing sides in both axes', (t) => {
  const results = [];
  for (const axis of ['x', 'z'] as const)
    for (const side of [1, -1]) {
      const world = grid(9, 9),
        ecs = new ECS();
      world.blockers.push({
        id: 'long',
        x: 0,
        z: 0,
        w: axis === 'x' ? 2 : 8,
        d: axis === 'x' ? 8 : 2,
      });
      const from = { x: axis === 'x' ? side * 4 : 0, z: axis === 'z' ? side * 4 : 0 };
      const mover = createActor(ecs, world, 'hero', 'player', { ...from, h: 0 });
      assert.ok(mover.navigator.goTo(from, { x: 0, z: 0 }, partial));
      const end = mover.navigator.destination!;
      safeRoute(mover.navigator, from);
      const travelled = finishRoute(mover, world);
      results.push({ axis, side, end, travelled });
    }
  t.diagnostic(JSON.stringify(results));
  for (const result of results) {
    assert.ok(result.end[result.axis] * result.side > 1.32, JSON.stringify(result));
    assert.ok(Math.abs(Math.hypot(result.end.x, result.end.z) - 1.32) < 0.015);
    assert.ok(result.travelled < 2.7, JSON.stringify(result));
  }
});

test('distant sub-cell body motion does not restart held searches; entering the route still invalidates', (t) => {
  const world = generateDungeon('MOURNING-731'),
    ecs = new ECS();
  for (const e of world.entities) if (e.type === 'door' && !e.locked) e.open = true;
  const mover = createActor(ecs, world, 'hero', 'player', world.spawn);
  const n = mover.navigator,
    target = world.roomById.throne;
  assert.ok(n.goTo(mover.position, target, partial));
  const route = [mover.position, ...n.path, target];
  const remote = [...world.tiles.values()].find(
    (tile) =>
      n.canStand(tile) &&
      route.every((end, i) => {
        const start = route[Math.max(0, i - 1)];
        const dx = end.x - start.x,
          dz = end.z - start.z;
        const u = Math.max(
          0,
          Math.min(
            1,
            ((tile.x - start.x) * dx + (tile.z - start.z) * dz) / (dx * dx + dz * dz || 1),
          ),
        );
        return distance(tile, { x: start.x + dx * u, z: start.z + dz * u }) > 8;
      }),
  );
  assert.ok(remote);
  const body = createActor(ecs, world, 'remote', 'skeleton', remote);
  n.cancel();
  let plans = 0;
  const costs: number[] = [],
    plan = n.goTo.bind(n);
  n.goTo = (...args) => {
    plans++;
    const start = performance.now();
    const result = plan(...args);
    costs.push(performance.now() - start);
    return result;
  };
  assert.ok(n.followFloor(mover.position, target, 0));
  const holdStart = performance.now();
  for (let i = 1; i <= 16; i++) {
    body.position.x = remote.x + i * 0.001;
    n.followFloor(mover.position, target, i * 120);
  }
  t.diagnostic(JSON.stringify({ remote, plans, costs, holdMs: performance.now() - holdStart }));
  assert.equal(plans, 1, 'remote motion should not restart an unchanged held command');
  const end = n.destination!;
  Object.assign(body.position, { ...end, h: mover.position.h });
  n.followFloor(mover.position, target, 2520);
  assert.equal(plans, 2, 'newly occupied route must invalidate');
  safeRoute(n, mover.position);
  body.health.current = 0;
  n.followFloor(mover.position, target, 3120);
  assert.equal(plans, 3, 'release must invalidate');
  safeRoute(n, mover.position);
});

test('floor fallback approaches blocked furniture precisely, retaining exact-goal rejection', () => {
  const world = grid();
  world.blockers.push({ id: 'table', x: 0, z: 0, w: 2, d: 3 });
  const n = new Navigator(world),
    from = { x: -4.1, z: 0.37 },
    target = { x: -0.8, z: 0.37 };
  assert.equal(n.goTo(from, target), false);
  assert.ok(n.goTo(from, target, partial));
  const end = n.destination!;
  assert.ok(Math.abs(end.x + 1.32) < 0.015, JSON.stringify(end));
  assert.ok(Math.abs(end.z - target.z) < 0.015, JSON.stringify(end));
  safeRoute(n, from);
  const exact = { x: 4.12, z: -0.27 };
  assert.ok(n.goTo(from, exact, partial));
  assert.deepEqual(n.destination, exact);
  assert.ok(n.path.length > 1);
  safeRoute(n, from);
});

test('sub-cell frontier movement and swept-edge changes still invalidate dynamic reuse', () => {
  const corridor = grid(6, 0),
    ecs = new ECS();
  const mover = createActor(ecs, corridor, 'hero', 'player', { x: -4, z: 0, h: 0 });
  const body = createActor(ecs, corridor, 'body', 'skeleton', { x: 0, z: 0, h: 0 });
  const n = mover.navigator,
    target = { x: 3, z: 0 };
  assert.ok(n.followFloor(mover.position, target, 0));
  finishRoute(mover, corridor);
  const before = { ...mover.position };
  body.position.x = 0.06;
  assert.ok(n.followFloor(mover.position, target, 1000));
  finishRoute(mover, corridor);
  assert.ok(
    mover.position.x - before.x > 0.045,
    'same-cell movement of the frontier remains relevant',
  );
  assert.ok(distance(mover.position, body.position) >= 0.9);

  const world = grid(5, 2),
    otherEcs = new ECS();
  world.blockers.push({ id: 'prop', x: 0, z: -2, w: 1, d: 1 });
  const walker = createActor(otherEcs, world, 'hero', 'player', { x: -4, z: 0, h: 0 });
  const small = createActor(otherEcs, world, 'small', 'kobold', { x: 0.5, z: 1.6, h: 0 });
  small.entity.require('body').radius = 0.05;
  const nav = walker.navigator;
  const cells = [...world.tiles.values()].map((tile) => nav.canOccupy(tile));
  assert.ok(nav.goTo(walker.position, { x: 0, z: -2 }, partial));
  // Both edge endpoints remain free; only the swept occupancy of the edge changes.
  small.position.z = 0.3;
  assert.deepEqual(
    [...world.tiles.values()].map((tile) => nav.canOccupy(tile)),
    cells,
  );
  assert.equal(
    nav.segmentClear({ x: 0, z: 0 }, { x: 1, z: 0 }, true, nav.occupancy!.bodies()),
    false,
  );
  assert.ok(nav.goTo(walker.position, { x: 4, z: 0 }, partial));
  safeRoute(nav, walker.position);
  finishRoute(walker, world);
  assert.ok(distance(walker.position, { x: 4, z: 0 }) < 0.015);
});

test('reachable frontier takes a detour to a closer blocked target, deterministically', () => {
  const world = grid();
  // The direct approach stops at the long wall; the closest face is beyond its top end.
  world.blockers.push(
    { id: 'wall', x: 0, z: 0, w: 0.1, d: 5 },
    { id: 'prop', x: 2, z: 0, w: 1, d: 1 },
  );
  const from = { x: -3, z: 0 },
    target = { x: 2, z: 0.12 };
  const a = new Navigator(world),
    b = new Navigator({ ...world, tiles: new Map([...world.tiles].reverse()) });
  assert.ok(a.goTo(from, target, partial));
  assert.ok(b.goTo(from, target, partial));
  assert.deepEqual(a.path, b.path);
  assert.ok(distance(a.destination!, target) < 0.85, JSON.stringify(a.path));
  assert.ok(a.path.some((p) => Math.abs(p.z) > 2.8));
  safeRoute(a, from);
});

test('disconnected floor, lava, void and cliffs stop on the reachable supported side', () => {
  for (const barrier of ['lava', 'void', 'cliff', 'thin furniture'] as const) {
    const world = grid(6, 1);
    for (const [id, tile] of world.tiles) {
      if (barrier === 'cliff' && tile.x >= 0) tile.h = 2;
      if (tile.x !== 0) continue;
      if (barrier === 'lava') tile.surface = 'lava';
      if (barrier === 'void') world.tiles.delete(id);
    }
    if (barrier === 'thin furniture')
      world.blockers.push({ id: 'sliver', x: 0.5, z: 0, w: 0.01, d: 4 });
    const n = new Navigator(world),
      from = { x: -4, z: 0.13 },
      target = { x: 4, z: 0.13 };
    assert.ok(n.goTo(from, target, partial), barrier);
    assert.ok(
      n.destination!.x > -1.1 && n.destination!.x < 0.19,
      `${barrier}: ${JSON.stringify(n.path)}`,
    );
    assert.ok(distance(n.destination!, target) < distance(from, target));
    safeRoute(n, from);
  }
});

test('floor commands respect closed, locked and physically opening doors without operating them', () => {
  const world = grid(5, 1);
  const door: DoorEntity = {
    id: 'gate',
    type: 'door',
    x: 0,
    z: 0,
    h: 0,
    axis: 'x',
    open: false,
    locked: true,
    requiresAltar: true,
  };
  world.entities.push(door);
  const n = new Navigator(world),
    from = { x: -4, z: 0.21 },
    target = { x: 4, z: 0.21 };
  for (const locked of [true, false]) {
    door.locked = locked;
    assert.ok(n.goTo(from, target, partial));
    assert.ok(Math.abs(n.destination!.x + 0.495) < 0.015, JSON.stringify(n.destination));
    assert.equal(door.open, false);
    safeRoute(n, from);
  }
  assert.ok(n.goTo(from, target, { openDoors: true }));
  assert.deepEqual(n.destination, target, 'explicit door-capable callers retain their contract');
  door.open = true;
  assert.ok(n.goTo(from, target, partial));
  assert.deepEqual(n.destination, target);
});

test('only requested floor is accepted, including floor under props and lava', () => {
  const world = grid();
  world.tiles.get('0,0')!.surface = 'lava';
  const ray = { origin: { x: 0, y: 10, z: 0 }, direction: { x: 0, y: -1, z: 0 } };
  assert.deepEqual(pickGround(world, ray), { x: 0, z: 0 });
  const n = new Navigator(world);
  assert.ok(n.goTo({ x: -3, z: 0 }, pickGround(world, ray)!, partial));
  safeRoute(n, { x: -3, z: 0 });
  assert.equal(n.goTo({ x: -3, z: 0 }, { x: 100, z: 0 }, partial), false);
  assert.equal(pickGround(world, { ...ray, origin: { x: 100, y: 10, z: 0 } }), null);
});

test('living obstruction replans floor travel to a partial endpoint and held input resumes after release', () => {
  const world = grid(6, 0),
    ecs = new ECS();
  const mover = createActor(ecs, world, 'hero', 'player', { x: -4, z: 0, h: 0 });
  const blocker = createActor(ecs, world, 'body', 'skeleton', { x: 5, z: 0, h: 0 });
  const target = { x: 3.17, z: 0.07 };
  assert.ok(mover.navigator.goTo(mover.position, target, partial));
  blocker.position.x = 0;
  for (let i = 0; i < 240; i++) {
    moveActor(mover, world, {}, 1 / 60);
    assert.ok(distance(mover.position, blocker.position) >= 0.9 - 1e-6);
  }
  assert.ok(mover.position.x > -0.93 && mover.position.x < -0.89, JSON.stringify(mover.position));
  assert.equal(mover.navigator.active, false);
  blocker.health.current = 0;
  assert.ok(mover.navigator.followFloor(mover.position, target, 1000));
  for (let i = 0; i < 240; i++) moveActor(mover, world, {}, 1 / 60);
  assert.ok(distance(mover.position, target) < 0.015);
});

test('repeated held partial/immobile commands settle without searches or jitter; resets permit fresh input', () => {
  const world = grid(6, 1),
    ecs = new ECS();
  world.blockers.push({ id: 'wall', x: 0, z: 0, w: 0.1, d: 4 });
  const mover = createActor(ecs, world, 'hero', 'player', { x: -4.12, z: 0.31, h: 0 });
  const n = mover.navigator,
    target = { x: 4.23, z: 0.31 };
  let probes = 0;
  const segment = n.segmentClear.bind(n);
  n.segmentClear = (...args) => {
    probes++;
    return segment(...args);
  };
  assert.ok(n.goTo(mover.position, target, partial));
  const endpoint = { ...n.destination! };
  for (let i = 0; i < 300; i++) {
    n.followFloor(mover.position, target, (i * 1000) / 60);
    moveActor(mover, world, {}, 1 / 60);
  }
  assert.ok(distance(mover.position, endpoint) < 0.015);
  const settled = { ...mover.position };
  for (let i = 0; i < 600; i++) {
    const before = probes;
    n.followFloor(mover.position, target, 5000 + (i * 1000) / 60);
    assert.equal(probes, before, 'settled hold must not rerun clearance/search');
    moveActor(mover, world, {}, 1 / 60);
  }
  assert.deepEqual(mover.position, settled);
  assert.equal(n.active, false);
  assert.equal(n.destination, null);
  stopActor(mover);
  teleportActor(mover, world, { x: -3, z: -0.23 });
  assert.ok(n.followFloor(mover.position, target, 20000));
  assert.ok(n.active);
});

test('an isolated actor already closest to the requested floor stays still without a command loop', () => {
  const world = grid(0, 0);
  world.tiles.set('3,0', { x: 3, z: 0, h: 0, surface: 'stone' });
  const n = new Navigator(world),
    from = { x: 0.179, z: 0 },
    target = { x: 3, z: 0 };
  assert.equal(n.goTo(from, target, partial), false);
  for (let i = 0; i < 100; i++) assert.equal(n.followFloor(from, target, i * 120), false);
  assert.equal(n.active, false);
  assert.equal(n.destination, null);
});

test('held cursor drift reuses the reached component and bounds expensive replanning', (t) => {
  const world = generateDungeon('MOURNING-731');
  // Measure the large pre-altar component rather than an isolated entrance room.
  for (const e of world.entities) if (e.type === 'door' && !e.locked) e.open = true;
  const n = new Navigator(world),
    from = world.spawn,
    target = world.roomById.throne;
  let probes = 0,
    plans = 0;
  const segment = n.segmentClear.bind(n),
    plan = n.goTo.bind(n);
  n.segmentClear = (...args) => {
    probes++;
    return segment(...args);
  };
  n.goTo = (...args) => {
    plans++;
    return plan(...args);
  };
  const start = performance.now();
  assert.ok(n.followFloor(from, target, 0));
  const first = probes,
    elapsed = performance.now() - start;
  assert.ok(first < world.tiles.size * 5 + 1500, `${first} probes for ${world.tiles.size} tiles`);
  safeRoute(n, from);
  probes = 0;
  for (let i = 1; i <= 120; i++)
    n.followFloor(from, { x: target.x + i / 1000, z: target.z }, (i * 1000) / 60);
  assert.ok(plans <= 5, `${plans} searches in two seconds`);
  assert.ok(probes < first / 2, `cached drift ${probes} vs cold ${first}`);
  t.diagnostic(
    JSON.stringify({
      tiles: world.tiles.size,
      coldProbes: first,
      coldMs: elapsed,
      heldPlans: plans,
      heldProbes: probes,
    }),
  );
});

test('held input invalidates cached gate reachability when the gate opens', () => {
  const world = grid(5, 1);
  const door: DoorEntity = {
    id: 'gate',
    type: 'door',
    x: 0,
    z: 0,
    h: 0,
    axis: 'x',
    locked: true,
    open: false,
    requiresAltar: true,
  };
  world.entities.push(door);
  const ecs = new ECS(),
    mover = createActor(ecs, world, 'hero', 'player', { x: -3, z: 0, h: 0 });
  const n = mover.navigator,
    target = { x: 4.1, z: 0.1 };
  n.followFloor(mover.position, target, 0);
  for (let i = 0; i < 180; i++) moveActor(mover, world, {}, 1 / 60);
  door.locked = false;
  door.open = true;
  assert.ok(n.followFloor(mover.position, target, 3000));
  assert.deepEqual(n.destination, target);
  for (let i = 0; i < 180; i++) moveActor(mover, world, {}, 1 / 60);
  assert.ok(distance(mover.position, target) < 0.015);
});

test('held input invalidates an active partial route after a gate opens or a body leaves', () => {
  for (const obstacle of ['gate', 'body'] as const) {
    const world = grid(6, 0),
      ecs = new ECS();
    const gate: DoorEntity = {
      id: 'gate',
      type: 'door',
      x: 0,
      z: 0,
      h: 0,
      axis: 'x',
      locked: true,
      open: false,
      requiresAltar: true,
    };
    if (obstacle === 'gate') world.entities.push(gate);
    const mover = createActor(ecs, world, 'hero', 'player', { x: -4, z: 0, h: 0 });
    const body = createActor(ecs, world, 'body', 'skeleton', {
      x: obstacle === 'body' ? 0 : 6,
      z: 0,
      h: 0,
    });
    const n = mover.navigator,
      target = { x: 3.1, z: 0.07 };
    assert.ok(n.followFloor(mover.position, target, 0));
    moveActor(mover, world, {}, 1 / 60);
    assert.ok(n.active && n.destination!.x < 0);
    gate.locked = false;
    gate.open = true;
    body.health.current = 0;
    assert.ok(n.followFloor(mover.position, target, 600));
    assert.deepEqual(n.destination, target, obstacle);
    safeRoute(n, mover.position);
  }
});

test('a gate closing during floor travel replans to its safe frontier rather than abandoning progress', () => {
  const world = grid(5, 1),
    ecs = new ECS();
  const gate: DoorEntity = {
    id: 'gate',
    type: 'door',
    x: 0,
    z: 0,
    h: 0,
    axis: 'x',
    locked: false,
    open: true,
    requiresAltar: false,
  };
  world.entities.push(gate);
  const mover = createActor(ecs, world, 'hero', 'player', { x: -3, z: 0.13, h: 0 });
  assert.ok(mover.navigator.goTo(mover.position, { x: 4, z: 0.13 }, partial));
  gate.open = false;
  for (let i = 0; i < 240; i++) {
    moveActor(mover, world, {}, 1 / 60);
    assert.ok(mover.position.x <= -0.495);
  }
  assert.ok(Math.abs(mover.position.x + 0.495) < 0.015, JSON.stringify(mover.position));
  assert.equal(mover.navigator.active, false);
  assert.equal(mover.motion.speed, 0);
});

test('physical immobility settles a held command until new input or cancellation', () => {
  const world = grid(),
    ecs = new ECS();
  const mover = createActor(ecs, world, 'hero', 'player', { x: -3, z: 0, h: 0 });
  // Exercise the real stuck timeout when the physical adapter cannot follow a planned route.
  mover.entity.add('collision', { move: (from) => from });
  const n = mover.navigator,
    target = { x: 3, z: 0 };
  let plans = 0;
  const plan = n.goTo.bind(n);
  n.goTo = (...args) => {
    plans++;
    return plan(...args);
  };
  assert.ok(n.followFloor(mover.position, target, 0));
  for (let i = 1; i <= 300; i++) {
    n.followFloor(mover.position, target, (i * 1000) / 60);
    moveActor(mover, world, {}, 1 / 60);
  }
  assert.equal(plans, 1, 'holding must not restart a physically stuck route');
  assert.equal(n.active, false);
  assert.equal(mover.motion.speed, 0);
  mover.entity.remove('collision');
  stopActor(mover);
  assert.ok(n.followFloor(mover.position, target, 6000));
  for (let i = 0; i < 180; i++) moveActor(mover, world, {}, 1 / 60);
  assert.ok(distance(mover.position, target) < 0.015);
});
