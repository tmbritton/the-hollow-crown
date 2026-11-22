import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Navigator, pickGround } from '../src/navigation.ts';
import { clearSight } from '../src/combat.ts';
import type { NavigationWorld } from '../src/navigation.ts';
import { generateDungeon, key } from '../src/world.ts';
import type { DoorEntity, Point, Tile } from '../src/worldTypes.ts';

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
