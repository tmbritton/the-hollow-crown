import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Navigator, pickGround } from '../src/navigation.ts';
import { clearSight } from '../src/combat.ts';
import type { NavigationWorld } from '../src/navigation.ts';
import { generateDungeon, key } from '../src/world.ts';
import type { DoorEntity, Point, Tile } from '../src/worldTypes.ts';
import { ECS } from '../src/ecs.ts';
import { createActor } from '../src/actors.ts';
import { Occupancy } from '../src/occupancy.ts';
import type { BodyInput, BodyLookup, CollisionBody } from '../src/occupancy.ts';

function grid(width = 5, depth = 5): NavigationWorld {
  const tiles = new Map<string, Tile>();
  for (let x = -width; x <= width; x++)
    for (let z = -depth; z <= depth; z++) tiles.set(key(x, z), { x, z, h: 0, surface: 'stone' });
  return { tiles, blockers: [], entities: [] };
}

function samples(from: Point, path: readonly Point[]): Point[] {
  const result: Point[] = [];
  let start = from;
  for (const end of path) {
    const count = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.z - start.z) * 20));
    for (let i = 0; i <= count; i++)
      result.push({
        x: start.x + ((end.x - start.x) * i) / count,
        z: start.z + ((end.z - start.z) * i) / count,
      });
    start = end;
  }
  return result;
}

test('exact routes detour identically in indexed, forced scan and unsupported-body fallback', () => {
  const world = grid(10, 3),
    ecs = new ECS();
  const mover = createActor(ecs, world, 'mover', 'player', { x: -6, z: 0, h: 0 });
  createActor(ecs, world, 'blocker', 'goblin', { x: 0, z: 0, h: 0 });
  const dest = { x: 6, z: 0 };
  const route = () => {
    assert.ok(mover.navigator.goTo(mover.position, dest));
    assert.ok(mover.navigator.path.length > 1);
    return [...mover.navigator.path];
  };
  const expected = route();
  ecs.living.fullScan = true;
  assert.deepEqual(route(), expected);
  ecs.living.fullScan = false;
  const far = createActor(ecs, world, 'outlier', 'goblin', { x: 50000, z: 0, h: 0 });
  far.entity.require('body').radius = 10000;
  assert.equal(ecs.living.counts.records, 2, 'outlier must not fit the buckets');
  assert.deepEqual(route(), expected);
});

const partial = { partial: true };
function route(nav: Navigator, from: Point, goal: Point, options = partial) {
  return { accepted: nav.goTo(from, goal, options), end: nav.destination, path: [...nav.path] };
}

function livingRoutes(world: NavigationWorld, from: Point, blockerX: number, distant: number) {
  const ecs = new ECS();
  const mover = createActor(ecs, world, 'mover', 'player', { ...from, h: 0 });
  mover.entity.require('body').height = 1.7;
  const blocker = createActor(ecs, world, 'blocker', 'goblin', { x: blockerX, z: 0, h: 0 });
  blocker.entity.require('body').height = 1.7;
  for (let i = 0; i < distant; i++)
    createActor(ecs, world, `distant-${i}`, 'goblin', {
      x: 100 + 4 * i,
      z: 0,
      h: 0,
    }).entity.require('body').height = 1.7;
  const nav = mover.navigator;
  const fullScan = () =>
    new Navigator(
      world,
      new Occupancy(
        () => nav.occupancy!.size,
        () => ecs.living.snapshot('mover'),
      ),
    );
  return { nav, blocker, fullScan };
}

function measureRoute(nav: Navigator) {
  const occupancy = nav.occupancy!;
  const reads = () => ({ near: 0, distant: 0 });
  const counters = () => ({ stand: reads(), segment: reads(), lookups: 0, edges: 0 });
  let work = counters();
  let fingerprint = false;
  const environment = nav['environment'].bind(nav);
  nav['environment'] = (...args) => {
    fingerprint = true;
    try {
      return environment(...args);
    } finally {
      fingerprint = false;
    }
  };

  const input = (bodies: BodyInput, kind: 'stand' | 'segment'): BodyInput => {
    const wrap = (list: readonly CollisionBody[]) =>
      new Proxy(list, {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver);
          if (typeof property === 'string' && /^(0|[1-9]\d*)$/.test(property))
            work[kind][target[Number(property)].x >= 100 ? 'distant' : 'near']++;
          return value;
        },
      });
    return typeof bodies === 'function'
      ? (bounds) => {
          work.lookups++;
          return wrap(bodies(bounds));
        }
      : wrap(bodies);
  };
  const stand = occupancy.canStand.bind(occupancy);
  occupancy.canStand = (point, bodies) =>
    stand(point, bodies && !fingerprint ? input(bodies, 'stand') : bodies);
  const segment = occupancy.segmentClear.bind(occupancy);
  occupancy.segmentClear = (a, b, bodies) =>
    segment(a, b, bodies && !fingerprint ? input(bodies, 'segment') : bodies);

  // The expansion loop calls sweepBody directly on cardinal grid edges. Connectors,
  // frontier sweeps and smoothing enter through sweep, which subdivides into short strides.
  const sweep = nav['sweepBody'].bind(nav);
  nav['sweepBody'] = (a, b, bodies) => {
    if (
      [a.x, a.z, b.x, b.z].every(Number.isInteger) &&
      Math.abs(a.x - b.x) + Math.abs(a.z - b.z) === 1
    )
      work.edges++;
    return sweep(a, b, bodies);
  };
  return (from: Point, goal: Point) => {
    work = counters();
    return { result: route(nav, from, goal), work };
  };
}

function assertLocalReads(
  sparse: ReturnType<ReturnType<typeof measureRoute>>['work'],
  crowded: ReturnType<ReturnType<typeof measureRoute>>['work'],
) {
  const info = JSON.stringify({ sparse, crowded });
  for (const kind of ['stand', 'segment'] as const) {
    assert.deepEqual(crowded[kind], sparse[kind], info);
    assert.equal(crowded[kind].distant, 0, info);
  }
  assert.ok(sparse.lookups > 0 && crowded.lookups > 0, info);
}

test('indexed partial detour reads only local candidates and agrees with the crowded scan', (t) => {
  const world = grid(10, 4),
    from = { x: -4, z: 0 },
    goal = { x: 4, z: 0 };
  assert.deepEqual(route(new Navigator(world), from, goal), {
    accepted: true,
    end: goal,
    path: [goal],
  });
  const sparse = measureRoute(livingRoutes(world, from, 0, 0).nav)(from, goal);
  const fixture = livingRoutes(world, from, 0, 128);
  const crowded = measureRoute(fixture.nav)(from, goal);
  const scan = measureRoute(fixture.fullScan())(from, goal);
  assert.equal(sparse.result.accepted, true);
  assert.deepEqual(sparse.result.end, goal);
  assert.ok(sparse.result.path.some((p) => p.z !== 0));
  assert.deepEqual(crowded.result, sparse.result);
  assert.deepEqual(scan.result, sparse.result);
  t.diagnostic(JSON.stringify({ sparse: sparse.work, crowded: crowded.work, scan: scan.work }));
  for (const kind of ['stand', 'segment'] as const) {
    assert.ok(sparse.work[kind].near > 0);
    assert.ok(scan.work[kind].distant > 0);
  }
  assertLocalReads(sparse.work, crowded.work);
});

test('partial routing captures one complete fingerprint inside one view; exact needs no fingerprint', (t) => {
  const world = grid(10, 4),
    from = { x: -4, z: 0 },
    goal = { x: 4, z: 0 };
  const fixture = livingRoutes(world, from, 0, 128);
  const expected = route(fixture.fullScan(), from, goal);
  assert.ok(expected.path.some((p) => p.z !== 0));
  for (const mode of ['scan adapter', 'indexed'] as const) {
    const nav = mode === 'indexed' ? fixture.nav : fixture.fullScan();
    const occ = nav.occupancy!;
    const withView = occ.withView,
      snapshot = occ.bodies;
    const events: string[] = [];
    let probes = 0;
    const stand = occ.canStand.bind(occ);
    occ.canStand = (p, bodies) => {
      probes++;
      return stand(p, bodies);
    };
    t.mock.method(occ, 'withView', <T>(read: (lookup: BodyLookup) => T) => {
      events.push('enter');
      let active = true;
      try {
        return withView((lookup) =>
          read((bounds) => {
            assert.ok(active, 'lookup used after the view returned');
            return lookup(bounds);
          }),
        );
      } finally {
        active = false;
        events.push('exit');
      }
    });
    // The two-argument adapter closes over its original source. Instrumenting the
    // public method counts only explicit fingerprint captures, not its own pinning scan.
    t.mock.method(occ, 'bodies', () => {
      events.push('capture');
      assert.equal(probes, 0, 'capture must precede clearance');
      const bodies = snapshot();
      assert.equal(bodies.length, 129, 'fingerprint must include distant bodies but not self');
      return bodies;
    });
    assert.deepEqual(route(nav, from, goal, { partial: false }), expected);
    assert.deepEqual(events, ['enter', 'exit'], `${mode} exact`);
    events.length = probes = 0;
    assert.deepEqual(route(nav, from, goal), expected);
    assert.deepEqual(events, ['enter', 'capture', 'exit'], `${mode} partial`);
  }
});

test('indexed exhausted partial search reuses expansion and invalidates on occupancy, geometry or footprint changes', (t) => {
  const world = grid(10, 3);
  for (let z = -3; z <= 3; z++) world.tiles.delete(key(0, z));
  const from = { x: -8, z: 0 },
    goal = { x: 8, z: 0 };
  const samples = [0, 128].map((distant) => {
    const { nav, blocker, fullScan } = livingRoutes(world, from, -3, distant);
    const measure = measureRoute(nav);
    const fresh = () => route(fullScan(), from, goal);
    const cold = measure(from, goal);
    assert.ok(cold.work.edges > 0);
    assert.ok(cold.work.stand.near > 0 && cold.work.segment.near > 0);
    assert.ok(cold.result.accepted && cold.result.end);
    assert.ok(from.x < cold.result.end.x && cold.result.end.x < 0);
    assert.deepEqual(cold.result, fresh());
    const warm = measure(from, goal);
    assert.equal(warm.work.edges, 0);
    assert.deepEqual(warm.result, cold.result);

    const fingerprint = () => nav['environment'](nav.occupancy!.bodies());
    const unchanged = fingerprint();
    blocker.position.x -= 0.06;
    assert.equal(fingerprint(), unchanged, 'geometry change preserves the discrete signature');
    const geometry = measure(from, goal);
    assert.ok(geometry.work.edges > 0, 'exact body geometry must invalidate the exhausted tree');
    assert.deepEqual(geometry.result, fresh());

    blocker.position.x = -1;
    assert.notEqual(fingerprint(), unchanged);
    const moved = measure(from, goal);
    assert.notDeepEqual(moved.result, geometry.result);
    assert.ok(moved.work.edges > 0, 'occupied approach must invalidate the exhausted tree');
    assert.deepEqual(moved.result, fresh());

    const footprint = [];
    for (const [dimension, value] of [
      ['radius', 0.5],
      ['height', 1.8],
    ] as const) {
      const before = fingerprint();
      nav.occupancy!.size[dimension] = value;
      assert.equal(fingerprint(), before, `${dimension} must not change discrete occupancy`);
      const changed = measure(from, goal);
      assert.ok(changed.work.edges > 0, `stale exhausted tree after ${dimension} change`);
      assert.deepEqual(changed.result, fresh());
      footprint.push(changed.work.edges);
    }
    t.diagnostic(
      JSON.stringify({
        distant,
        cold,
        warm,
        geometryEdges: geometry.work.edges,
        movedEdges: moved.work.edges,
        footprint,
      }),
    );
    return { cold, warm };
  });
  const [sparse, crowded] = samples;
  assert.deepEqual(crowded.cold.result, sparse.cold.result);
  assertLocalReads(sparse.cold.work, crowded.cold.work);
  assertLocalReads(sparse.warm.work, crowded.warm.work);
});

for (const dimension of ['radius', 'height'] as const) {
  test(`held floor replans when mover ${dimension} changes`, () => {
    const world = grid(),
      ecs = new ECS();
    const radiusCase = dimension === 'radius';
    const from = { x: -2, z: radiusCase ? 1.41 : 0.5, h: 0 },
      goal = { x: 2, z: from.z };
    const mover = createActor(ecs, world, 'mover', 'player', from);
    mover.entity.add('body', { radius: 0.45, height: 1.7 });
    const blocker = createActor(ecs, world, 'blocker', 'goblin', {
      x: 0,
      z: 0.5,
      h: radiusCase ? 0 : 1.71,
    });
    blocker.entity.require('body').radius = radiusCase ? 0.45 : 0.02;
    const nav = mover.navigator;
    assert.ok(nav.followFloor(from, goal, 0));
    assert.deepEqual(nav.path, [goal]);
    const snapshot = nav.chart.snapshot;
    assert.ok(nav.followFloor(from, goal, 50));
    assert.equal(nav.chart.snapshot, snapshot, 'unchanged hold does not replan');

    mover.entity.require('body')[dimension] = radiusCase ? 0.5 : 1.75;
    assert.equal(nav.liveSegmentClear(from, goal), false);
    const fresh = new Navigator(world, nav.occupancy);
    assert.ok(fresh.goTo(from, goal, { partial: true }));
    assert.ok(fresh.path.length > 1);
    assert.ok(nav.followFloor(from, goal, radiusCase ? 1000 : 100));
    assert.deepEqual(nav.path, fresh.path);
  });
}

test('local point, sweep and sight queries read only intersecting doors and see same-tick changes', () => {
  const world = grid();
  const near: DoorEntity = {
    type: 'door',
    id: 'local',
    x: 0,
    z: 0,
    h: 0,
    axis: 'z',
    open: true,
    locked: false,
    requiresAltar: false,
  };
  let reads = 0;
  const far: DoorEntity = {
    ...near,
    id: 'remote',
    x: -4,
    z: 4,
    get locked() {
      reads++;
      return false;
    },
    get open() {
      reads++;
      return true;
    },
  };
  world.entities.push(far, near);
  const nav = new Navigator(world);
  const a = { x: 0, z: -3, h: 0 },
    b = { x: 0, z: 3, h: 0 };
  for (const open of [true, false, true]) {
    near.open = open;
    assert.equal(nav.canStand(near), open);
    for (const [start, end] of [
      [a, b],
      [b, a],
    ]) {
      assert.equal(nav.segmentClear(start, end), open);
      assert.equal(clearSight(world, start, end), open);
    }
  }
  assert.equal(reads, 0);
});

test('open-floor clicks produce a direct route to the precise destination', () => {
  const navigator = new Navigator(grid());
  const target = { x: 3.2, z: 2.6 };
  assert.equal(navigator.goTo({ x: 0, z: 0 }, target), true);
  assert.deepEqual(navigator.path, [target]);
  assert.deepEqual(navigator.destination, target);
  navigator.cancel();
  assert.equal(navigator.active, false);
  assert.equal(navigator.destination, null);
});

test('an exact goal in a small sealed pocket does not search the entire origin component', () => {
  const world = grid(30, 12);
  for (let z = -12; z <= 12; z++) if (z !== 0) world.tiles.delete(key(29, z));
  for (let z = -12; z <= 12; z++) if (Math.abs(z) > 1) world.tiles.delete(key(30, z));
  const door: DoorEntity = {
    id: 'pocket',
    type: 'door',
    x: 29,
    z: 0,
    h: 0,
    axis: 'x',
    locked: true,
    open: false,
    requiresAltar: true,
  };
  world.entities.push(door);
  const nav = new Navigator(world);
  const from = { x: 27, z: 0 },
    goal = { x: 30, z: 0 };
  let probes = 0;
  const segment = nav.segmentClear.bind(nav);
  nav.segmentClear = (...args) => {
    probes++;
    return segment(...args);
  };
  assert.equal(nav.goTo(from, goal), false);
  assert.ok(probes < 160, `sealed pocket used ${probes} segment probes`);
  door.locked = false;
  door.open = true;
  assert.ok(nav.goTo(from, goal));
  assert.deepEqual(nav.path, [goal]);
});

test('reverse goal bounds include a connector at floating-point distance exactly 1.5', () => {
  const w = grid(0, 0);
  const add = (x: number, z: number) => w.tiles.set(key(x, z), { x, z, h: 0, surface: 'stone' });
  for (let x = -1; x <= 12; x++) add(x, 0);
  for (let x = 9; x <= 12; x++) for (let z = 1; z <= 8; z++) add(x, z);
  w.blockers.push({ id: 'trim', x: 0, z: -0.82 + 2e-10, w: 0.1, d: 1 });
  const nav = new Navigator(w),
    goal = { x: -0.5000000000000001, z: 1e-8 };
  assert.ok(nav.segmentClear({ x: 1, z: 0 }, goal, true));
  assert.ok(nav.goTo({ x: 10, z: 7 }, goal));
  assert.deepEqual(nav.destination, goal);
});

test('smoothing a long switchback avoids thousands of known-void swept segments', () => {
  const w: NavigationWorld = { tiles: new Map(), blockers: [], entities: [] };
  const add = (x: number, z: number) => w.tiles.set(key(x, z), { x, z, h: 0, surface: 'stone' });
  for (let r = 0; r < 12; r++) {
    for (let x = 0; x <= 24; x++) add(x, r * 2);
    if (r < 11) add(r % 2 ? 0 : 24, r * 2 + 1);
  }
  const nav = new Navigator(w),
    start = { x: 0, z: 0 },
    goal = { x: 0, z: 22 };
  let longProbes = 0;
  const probe = nav.segmentClear.bind(nav);
  nav.segmentClear = (a, b, ...rest) => {
    if (Math.hypot(a.x - b.x, a.z - b.z) > 2) longProbes++;
    return probe(a, b, ...rest);
  };
  assert.ok(nav.goTo(start, goal));
  assert.equal(nav.path.length, 23);
  assert.ok(longProbes < 200, `${longProbes} long swept queries`);
});

test('independent route requests share static cardinal connectivity but see live gates', () => {
  const world = grid(18, 18),
    from = { x: -15, z: 0 },
    goal = { x: 15, z: 0 };
  for (let z = -18; z < 17; z++) world.tiles.delete(key(0, z));
  const gate: DoorEntity = {
    id: 'crossing',
    type: 'door',
    x: 0,
    z: 17.5,
    h: 0,
    axis: 'x',
    locked: false,
    open: true,
    requiresAltar: false,
  };
  world.entities.push(gate);
  let sweptTerrainEdges = 0;
  for (const open of [true, false, true]) {
    gate.open = open;
    const nav = new Navigator(world),
      orig = nav.segmentClear.bind(nav);
    nav.segmentClear = (...args) => {
      if (args[4]) sweptTerrainEdges++;
      return orig(...args);
    };
    assert.equal(nav.goTo(from, goal), open);
  }
  assert.ok(sweptTerrainEdges < 100, `repeated ${sweptTerrainEdges} static edge sweeps`);
});

test('smoothed routes go around furniture with character-sized corner clearance', () => {
  const world = grid();
  world.blockers.push({ id: 'large-table', x: 0, z: 0, w: 2.5, d: 2.5 });
  for (const tile of world.tiles.values())
    if (Math.abs(tile.x) <= 1 && Math.abs(tile.z) <= 1) tile.blocked = true;
  const navigator = new Navigator(world),
    from = { x: -4, z: 0 };
  assert.ok(navigator.goTo(from, { x: 4, z: 0 }));
  assert.ok(navigator.path.length > 1);
  for (const point of samples(from, navigator.path))
    assert.ok(
      Math.abs(point.x) >= 1.57 || Math.abs(point.z) >= 1.57,
      `Corner cut at ${JSON.stringify(point)}`,
    );
  assert.equal(navigator.goTo(from, { x: 0, z: 0 }), false);
});

test('navigation avoids lava but permits water and supported continuous stairs', () => {
  const world = grid();
  for (const tile of world.tiles.values())
    if (tile.x === 0 && Math.abs(tile.z) <= 2) tile.surface = 'lava';
  const navigator = new Navigator(world),
    from = { x: -4, z: 0 };
  assert.ok(navigator.goTo(from, { x: 4, z: 0 }));
  for (const point of samples(from, navigator.path))
    assert.ok(Math.abs(point.x) >= 0.5 || Math.abs(point.z) > 2.5);
  assert.equal(navigator.goTo(from, { x: 0, z: 0 }), false);
  const stairs = grid(4, 1);
  for (const tile of stairs.tiles.values()) {
    tile.h = (tile.x + 4) * 0.3;
    tile.surface = tile.x === -4 ? 'water' : 'stair';
  }
  assert.ok(new Navigator(stairs).goTo(from, { x: 4, z: 0 }));
});

test('closed and locked gates block routes; changing door collision invalidates a route', () => {
  const world = grid(4, 1);
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
  world.entities.push(door);
  const navigator = new Navigator(world),
    from = { x: -4, z: 0 },
    to = { x: 4, z: 0 };
  assert.equal(navigator.goTo(from, to), false);
  door.open = true;
  assert.ok(navigator.goTo(from, to));
  door.open = false;
  assert.equal(navigator.steer({ x: -0.7, z: 0 }), null);
  assert.equal(navigator.active, false);
  door.open = true;
  door.locked = true;
  assert.equal(navigator.goTo(from, to), false);
});

test('void, diagonal gaps, and excessive elevation jumps cannot be crossed', () => {
  const world = grid(0, 0);
  world.tiles.set('1,1', { x: 1, z: 1, h: 0, surface: 'stone' });
  const navigator = new Navigator(world);
  assert.equal(navigator.goTo({ x: 0, z: 0 }, { x: 1, z: 1 }), false);
  assert.equal(navigator.goTo({ x: 0, z: 0 }, { x: 10, z: 10 }), false);
  const cliff = grid(3, 1);
  for (const tile of cliff.tiles.values()) if (tile.x > 0) tile.h = 2;
  assert.equal(new Navigator(cliff).goTo({ x: -2, z: 0 }, { x: 2, z: 0 }), false);
});

test('ground picking respects lowered floors, raised steps, and empty space', () => {
  const world = grid(2, 2);
  for (const tile of world.tiles.values()) tile.h = -2.4;
  const ray = { origin: { x: 0, y: 10, z: 0 }, direction: { x: 0.1, y: -1, z: 0.05 } };
  const hit = pickGround(world, ray);
  assert.ok(hit && Math.abs(hit.x - 1.24) < 1e-9 && Math.abs(hit.z - 0.62) < 1e-9);
  assert.equal(
    pickGround(world, { origin: { x: 10, y: 10, z: 10 }, direction: { x: 0, y: -1, z: 0 } }),
    null,
  );
  assert.equal(pickGround(world, { ...ray, direction: { x: 0, y: 1, z: 0 } }), null);
  const raised = world.tiles.get('0,0');
  assert.ok(raised);
  raised.h = 0.45;
  assert.deepEqual(
    pickGround(world, { origin: { x: 0, y: 10, z: 0 }, direction: { x: 0, y: -1, z: 0 } }),
    { x: 0, z: 0 },
  );
});

test('real dungeon rooms and landmark approaches are routable without bypassing the throne gate', () => {
  for (const seed of ['MOURNING-731', 'CINDER-42', 'VIOLET-7']) {
    const world = generateDungeon(seed);
    for (const entity of world.entities)
      if (entity.type === 'door' && !entity.locked) entity.open = true;
    const navigator = new Navigator(world);
    for (const room of world.rooms) {
      assert.equal(navigator.goTo(world.spawn, room), room.id !== 'throne', `${seed}: ${room.id}`);
    }
    for (const entity of world.entities)
      if (entity.type === 'door') {
        entity.locked = false;
        entity.open = true;
      }
    for (const entity of world.entities)
      if (entity.approach)
        assert.ok(navigator.goTo(world.spawn, entity.approach), `${seed}: ${entity.id}`);
  }
});
test('a held occupancy view sees one publication while a subsequent view sees writes', async () => {
  const { ECS } = await import('../src/ecs.ts');
  const { createActor } = await import('../src/actors.ts');
  const ecs = new ECS();
  const world = { tiles: new Map(), blockers: [], entities: [] };
  const a = createActor(ecs, world, 'a', 'player', { x: -2, z: 0, h: 0 });
  const b = createActor(ecs, world, 'b', 'goblin', { x: 0, z: 0, h: 0 });
  const o = a.navigator.occupancy!;
  const point = { x: 0, z: 0, h: 0 };
  o.withView((lookup) => {
    assert.equal(o.canStand(point, lookup), false);
    b.position.x = 20;
    assert.equal(o.canStand(point, lookup), false);
  });
  assert.equal(o.canStand(point), true);
});
