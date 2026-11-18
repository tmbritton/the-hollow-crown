import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDungeon,
  validateDungeon,
  heightAt,
  tileAt,
  key,
  footprint,
  reachableTiles,
  localPoint,
  INWARD_FACING_TYPES,
  ROOM_DEFINITIONS,
} from '../src/world.ts';
import { hasApproach } from '../src/worldTypes.ts';

const samples = Array.from({ length: 100 }, (_, i) => generateDungeon(`trial-${i}`));

test('100 seeds remain completable with generated prop colliders and locked gates', () => {
  for (const world of samples) {
    assert.deepEqual(validateDungeon(world), [], world.seed);
    assert.equal(world.rooms.length, ROOM_DEFINITIONS.length);
    assert.equal(world.entities.filter((e) => e.type === 'chest').length, 3);
    assert.equal(world.connections.filter((c) => c.a === 'throne' || c.b === 'throne').length, 1);
    for (const tile of world.tiles.values())
      if (world.reserved.has(key(tile.x, tile.z)))
        assert.ok(!tile.blocked, `${world.seed}: blocked route`);
    for (const object of [
      ...world.props,
      ...world.entities.filter(
        (e) => e.type === 'altar' || e.type === 'throne' || e.type === 'chest',
      ),
    ]) {
      const b = footprint(object);
      assert.ok(
        tileAt(world, b.x, b.z)?.blocked,
        `${world.seed}: collider missing from navigation`,
      );
    }
  }
});
test('directional furnishings face the room center with reachable space in front', () => {
  const rotations = new Set();
  for (const world of samples) {
    const reachable = reachableTiles(world, true);
    for (const object of [...world.props, ...world.entities].filter((o) =>
      INWARD_FACING_TYPES.has(o.type),
    )) {
      assert.ok(object.type !== 'door' && object.type !== 'portrait');
      const room = world.roomById[object.room],
        front = localPoint(object, 0, -1);
      const dx = room.x - object.x,
        dz = room.z - object.z;
      const alignment = (front.x - object.x) * dx + (front.z - object.z) * dz;
      // A cardinal facing must be within 45 degrees of the center, not merely
      // pointing into the same half of the room or matching the camera.
      assert.ok(
        alignment >= Math.hypot(dx, dz) * Math.SQRT1_2 - 1e-9,
        `${world.seed}: ${object.type} faces a wall`,
      );
      const approach = object.approach || object.frontClearance;
      assert.ok(
        approach && reachable.has(key(approach.x, approach.z)),
        `${world.seed}: ${object.type} front blocked`,
      );
      assert.ok(approach);
      assert.ok(Math.hypot(approach.x - room.x, approach.z - room.z) < Math.hypot(dx, dz));
      rotations.add(object.rotation);
    }
  }
  assert.equal(rotations.size, 4);
});
test('validation rejects outward-facing thrones and ovens', () => {
  for (const type of ['throne', 'bread-oven', 'furnace']) {
    const world = generateDungeon(`outward-${type}`);
    const object = [...world.entities, ...world.props].find((o) => o.type === type);
    assert.ok(object && object.rotation !== undefined);
    object.rotation = (object.rotation + Math.PI) % (Math.PI * 2);
    assert.ok(
      validateDungeon(world).some(
        (error) => error === `Furniture faces away from room center: ${object.id}`,
      ),
    );
  }
});
test('seeds materially change placement, topology, shapes, and reliquaries', () => {
  const positions = new Set(),
    connections = new Set(),
    chests = new Set(),
    chestRooms = new Set(),
    shapes = new Set();
  for (const world of samples) {
    positions.add(JSON.stringify(world.rooms.map((r) => [r.id, r.x, r.z]).sort()));
    connections.add(
      JSON.stringify(world.connections.map((c) => [c.a, c.b].sort().join(':')).sort()),
    );
    const items = world.entities.filter((e) => e.type === 'chest');
    chests.add(
      JSON.stringify(
        items.map((e) => [
          e.room,
          e.x - world.roomById[e.room].x,
          e.z - world.roomById[e.room].z,
          e.rotation,
        ]),
      ),
    );
    chestRooms.add(
      items
        .map((e) => e.room)
        .sort()
        .join(','),
    );
    for (const r of world.rooms) shapes.add(r.shape);
  }
  assert.ok(positions.size > 90);
  assert.ok(connections.size > 90);
  assert.ok(chests.size > 90);
  assert.ok(chestRooms.size >= 20);
  assert.deepEqual([...shapes].sort(), ['cross', 'octagon', 'rectangle']);
});
test('same seed reproduces architecture, routes, props, and interactions exactly', () => {
  const a = generateDungeon('test'),
    b = generateDungeon('test');
  for (const property of [
    'rooms',
    'connections',
    'props',
    'entities',
    'blockers',
    'bounds',
  ] as const)
    assert.deepEqual(a[property], b[property]);
  assert.deepEqual([...a.tiles], [...b.tiles]);
});
test('every generated stair connector has continuous support heights in both directions', () => {
  for (const world of samples.slice(0, 20))
    for (const c of world.connections.filter((c) => c.ramp)) {
      assert.ok(c.ramp);
      const point = (s: number) =>
        c.axis === 'x'
          ? { x: c.start + c.sign * s, z: c.cross }
          : { x: c.cross, z: c.start + c.sign * s };
      const start = point(0);
      let previous = heightAt(world, start.x, start.z);
      assert.ok(previous !== null);
      for (let s = 0.02; s < c.distance; s += 0.02) {
        const p = point(s),
          h = heightAt(world, p.x, p.z);
        assert.ok(h !== null);
        assert.ok(Math.abs(h - previous) < 0.2, `${world.seed}: stair at ${s}`);
        previous = h;
      }
      const end = point(c.distance),
        height = heightAt(world, end.x, end.z);
      assert.ok(height !== null);
      assert.ok(Math.abs(height - c.ramp.b) < 0.001);
    }
});
test('all landmarks and chest approaches are reachable before the throne gate opens', () => {
  for (const world of samples) {
    const reachable = reachableTiles(world, false);
    for (const id of world.rooms.map((r) => r.id).filter((id) => id !== 'throne')) {
      const r = world.roomById[id];
      assert.ok(reachable.has(key(r.x, r.z)), `${world.seed}: ${id}`);
    }
    for (const entity of world.entities.filter(hasApproach).filter((e) => e.room !== 'throne'))
      assert.ok(reachable.has(key(entity.approach.x, entity.approach.z)));
  }
});
test('every seed contains furnished butchery, smithy, bakery, and two lizard stalls', () => {
  for (const world of samples) {
    for (const [id, type] of [
      ['butchery', 'meat-rack'],
      ['smithy', 'furnace'],
      ['bakery', 'bread-oven'],
      ['stable', 'lizard-stall'],
    ]) {
      assert.ok(world.props.some((p) => p.room === id && p.type === type));
    }
    assert.equal(world.props.filter((p) => p.type === 'lizard-stall').length, 2);
  }
});
test('royal portraits have varied seeded traits and accessible wall-mounted approaches', () => {
  for (const world of samples) {
    const portraits = world.entities.filter((e) => e.type === 'portrait');
    assert.ok(portraits.length >= 4);
    assert.ok(new Set(portraits.map((e) => e.royal.artSeed)).size >= 4);
    const reachable = reachableTiles(world, true);
    for (const p of portraits) {
      assert.ok(reachable.has(key(p.approach.x, p.approach.z)));
      assert.ok(p.royal.title && p.royal.house);
      const [dx, dz] = p.wallDirection;
      assert.equal(tileAt(world, Math.round(p.x) + dx, Math.round(p.z) + dz), undefined);
      for (const other of world.entities.filter(hasApproach).filter((e) => e.id !== p.id)) {
        assert.ok(
          Math.hypot(p.x - other.approach.x, p.z - other.approach.z) >= 2.6,
          `${world.seed}: portrait steals a landmark interaction`,
        );
        assert.ok(
          Math.hypot(other.x - p.approach.x, other.z - p.approach.z) >=
            (['altar', 'throne'].includes(other.type) ? 3.1 : 2.6),
          `${world.seed}: portrait approach is ambiguous`,
        );
      }
    }
  }
});
