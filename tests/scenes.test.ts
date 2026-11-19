import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generationIdentity } from '../src/generation/identity.ts';
import { planScene, SCENE_RECIPES, MAX_SCENE_ANCHORS } from '../src/generation/scenes.ts';
import { footprint, key, localPoint } from '../src/world.ts';
import type { Room, Tile } from '../src/worldTypes.ts';

function fixture(id: 'smithy' | 'bakery', size = 17) {
  const room: Room = {
    id,
    x: 0,
    z: 0,
    h: 0,
    w: size,
    d: size,
    gx: 0,
    gz: 0,
    depth: 0,
    parent: -1,
    shape: 'rectangle',
    ports: [],
    name: id,
    kicker: '',
    description: '',
  };
  const tiles = new Map<string, Tile>();
  const reserved = new Set<string>();
  for (let x = -(size - 1) / 2; x <= (size - 1) / 2; x++) {
    for (let z = -(size - 1) / 2; z <= (size - 1) / 2; z++) {
      tiles.set(key(x, z), { x, z, h: 0, room: id, surface: 'stone' });
      if (Math.abs(x) <= 1 || Math.abs(z) <= 1) reserved.add(key(x, z));
    }
  }
  return { room, space: { tiles, reserved, blockers: [] } };
}

test('scene recipes reproduce bounded, connected workspaces without mutating inputs', () => {
  for (const id of ['smithy', 'bakery'] as const) {
    const { room, space } = fixture(id);
    const before = structuredClone({ room, space });
    const identity = generationIdentity('scene-contract');
    const result = planScene(identity, room, space);
    assert.equal(result.status, 'placed');
    if (result.status !== 'placed') continue;
    const scene = result.scene;
    assert.deepEqual(planScene(identity, room, space), result);
    assert.deepEqual({ room, space }, before);
    assert.equal(scene.props[0].type, SCENE_RECIPES[id].anchor.type);
    assert.equal(scene.props[1].type, SCENE_RECIPES[id].work.type);
    assert.ok(scene.props.length <= SCENE_RECIPES[id].maxProps);
    assert.ok(scene.anchorAttempts <= MAX_SCENE_ANCHORS);
    assert.equal(new Set(scene.props.map((p) => p.id)).size, scene.props.length);
    const lane = new Set(scene.reserved.map((p) => key(p.x, p.z)));
    assert.ok(lane.has('0,0'));
    const visited = new Set(['0,0']);
    for (const k of visited) {
      const tile = space.tiles.get(k);
      assert.ok(tile);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const next = key(tile.x + dx, tile.z + dz);
        if (lane.has(next)) visited.add(next);
      }
    }
    assert.deepEqual(visited, lane, 'all reserved work paths connect to the room center');
    for (const prop of scene.props) {
      assert.ok(prop.frontClearance);
      assert.ok(lane.has(key(prop.frontClearance.x, prop.frontClearance.z)));
      const b = footprint(prop);
      for (const p of scene.reserved) {
        assert.ok(Math.abs(p.x - b.x) >= b.w / 2 + 0.32 || Math.abs(p.z - b.z) >= b.d / 2 + 0.32);
      }
    }
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
    const reordered = { ...space, tiles: new Map([...space.tiles].reverse()) };
    assert.deepEqual(planScene(identity, room, reordered), result);
  }
});

test('both recipes fit constrained inward anchors in all four orientations', () => {
  for (const id of ['smithy', 'bakery'] as const) {
    for (const size of [13, 17]) {
      for (let quarter = 0; quarter < 4; quarter++) {
        const { room, space } = fixture(id, size);
        const rotation = (quarter * Math.PI) / 2;
        const anchor = {
          ...localPoint({ x: 0, z: 0, rotation }, 4, size === 13 ? 4 : 6),
          rotation,
        };
        const result = planScene(generationIdentity('rotated'), room, space, { anchors: [anchor] });
        assert.equal(result.status, 'placed', `${id}: orientation ${quarter}`);
        if (result.status !== 'placed') continue;
        assert.equal(result.scene.props[0].rotation, rotation);
        assert.equal(result.scene.anchorAttempts, 1);
        assert.ok(
          result.scene.sockets.some((s) => s.role === 'work' && s.reason === 'alternate-socket'),
        );
      }
    }
  }
});

test('scene fallbacks omit optional sockets without moving the focal pair or consuming routes', () => {
  const { room, space } = fixture('bakery');
  const identity = generationIdentity('socket-fallback');
  const full = planScene(identity, room, space);
  const simple = planScene(identity, room, space, { includeOptional: false });
  assert.equal(full.status, 'placed');
  assert.equal(simple.status, 'placed');
  if (full.status !== 'placed' || simple.status !== 'placed') return;
  assert.deepEqual(full.scene.props.slice(0, 2), simple.scene.props);
  assert.ok(
    simple.scene.sockets.filter((s) => s.role !== 'work').every((s) => s.reason === 'disabled'),
  );
  assert.ok(full.scene.sockets.every((s) => s.attempts <= 12));
  const forced = planScene(identity, room, space, {
    anchors: [{ x: 4, z: 6, rotation: 0 }],
  });
  assert.equal(forced.status, 'placed');
  if (forced.status === 'placed') {
    assert.ok(forced.scene.sockets.some((s) => s.reason === 'omitted'));
  }
});

test('work paths cannot cross thin barriers between clear tile centers in either axis', () => {
  for (const rotation of [0, Math.PI / 2]) {
    const { room, space } = fixture('bakery');
    const frame = { x: 0, z: 0, rotation };
    const anchor = { ...localPoint(frame, 4, 6), rotation };
    const barrier = { ...localPoint(frame, 0, 0.5), rotation, w: 17, d: 0.2 };
    const result = planScene(
      generationIdentity('thin-barrier'),
      room,
      {
        ...space,
        blockers: [barrier],
      },
      { anchors: [anchor], includeOptional: false },
    );
    assert.equal(result.status, 'rejected');
  }
});

test('anchor retries stop at the exact budget and leave no failed reservations behind', () => {
  const { room, space } = fixture('bakery');
  const identity = generationIdentity('anchor-budget');
  const valid = { x: 4, z: 6, rotation: 0 };
  const invalid = { ...valid, rotation: Math.PI };
  const single = planScene(identity, room, space, { anchors: [valid] });
  const last = planScene(identity, room, space, {
    anchors: [...Array.from({ length: MAX_SCENE_ANCHORS - 1 }, () => invalid), valid],
  });
  assert.equal(single.status, 'placed');
  assert.equal(last.status, 'placed');
  if (single.status === 'placed' && last.status === 'placed') {
    assert.deepEqual(last.scene, { ...single.scene, anchorAttempts: MAX_SCENE_ANCHORS });
  }
  const beyond = planScene(identity, room, space, {
    anchors: [...Array.from({ length: MAX_SCENE_ANCHORS }, () => invalid), valid],
  });
  assert.equal(beyond.status, 'rejected');
  assert.equal(beyond.anchorAttempts, MAX_SCENE_ANCHORS);
  // This anchor fits and reserves a route, but cannot place its required bread table.
  const retryIdentity = generationIdentity('retry-review');
  const failedAnchor = { x: 6, z: 6, rotation: 0 };
  const failed = planScene(retryIdentity, room, space, { anchors: [failedAnchor] });
  const direct = planScene(retryIdentity, room, space, { anchors: [valid] });
  const retried = planScene(retryIdentity, room, space, { anchors: [failedAnchor, valid] });
  assert.equal(failed.status, 'rejected');
  assert.ok(direct.status === 'placed' && retried.status === 'placed');
  assert.deepEqual(retried.scene, { ...direct.scene, anchorAttempts: 2 });
});

test('narrow, blocked and stair-supported scenes reject deterministically with bounded diagnostics', () => {
  for (const id of ['smithy', 'bakery'] as const) {
    const { room, space } = fixture(id, 7);
    const identity = generationIdentity('too-narrow');
    const result = planScene(identity, room, space);
    assert.equal(result.status, 'rejected');
    assert.ok(result.anchorAttempts <= MAX_SCENE_ANCHORS);
    assert.deepEqual(planScene(identity, room, space), result);
    const wide = fixture(id);
    const anchor = { x: 4, z: 6, rotation: 0 };
    assert.equal(
      planScene(
        identity,
        wide.room,
        {
          ...wide.space,
          blockers: [{ ...anchor, w: 1, d: 1 }],
        },
        { anchors: [anchor] },
      ).status,
      'rejected',
      'colliders are authoritative even without blocked tiles',
    );
    wide.space.tiles.get('4,6')!.ramp = { axis: 'x', start: 3, distance: 3, sign: 1, a: 0, b: 1 };
    assert.equal(
      planScene(identity, wide.room, wide.space, { anchors: [anchor] }).status,
      'rejected',
    );
    wide.space.tiles.get('4,6')!.ramp = null;
    wide.space.tiles.get('4,4')!.blocked = true;
    assert.equal(
      planScene(identity, wide.room, wide.space, { anchors: [anchor] }).status,
      'rejected',
    );
    assert.equal(
      planScene(identity, wide.room, wide.space, {
        anchors: [{ ...anchor, rotation: Math.PI }],
      }).status,
      'rejected',
      'outward-facing anchors must not be accepted',
    );
  }
});
