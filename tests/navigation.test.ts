import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Navigator, pickGround } from '../src/navigation.ts';
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
