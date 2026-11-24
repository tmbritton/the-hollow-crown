import assert from 'node:assert/strict';
import test from 'node:test';
import { Navigator } from '../src/navigation.ts';
import { buildPracticeRoom, selectContent, practiceDestinations } from '../src/practiceRoom.ts';
import { heightAt } from '../src/worldSpatial.ts';

test('practice takes precedence over a seed; missing and unknown rooms use the dungeon provider', () => {
  for (const room of [null, 'unknown', 'practice']) {
    for (const seed of [null, 'MOURNING-731']) {
      const calls: (string | null)[] = [];
      const selection = selectContent(room, seed, {
        dungeon: (seed) => (calls.push('dungeon', seed), seed),
        practice: () => (calls.push('practice'), 'authored'),
      });
      assert.equal(selection.kind, room === 'practice' ? 'practice' : 'dungeon');
      assert.deepEqual(calls, room === 'practice' ? ['practice'] : ['dungeon', seed]);
    }
  }
});

test('authored floor and geometry are deterministic with independent mutable doors and tiles', () => {
  const first = buildPracticeRoom(),
    second = buildPracticeRoom();
  assert.deepEqual(first, second);
  const door = first.entities[0];
  assert.ok(door?.type === 'door' && !door.locked && !door.open);
  door.open = true;
  first.tiles.values().next().value!.h = 9;
  assert.deepEqual(second, buildPracticeRoom());
  assert.notDeepEqual(first, second);
});

test('navigation clears the pillar by detour and only crosses the partition through an open door', () => {
  const world = buildPracticeRoom();
  const { beyondPillar, approach, landing } = practiceDestinations;
  const navigator = new Navigator(world);
  for (const point of [world.spawn, beyondPillar, approach, landing]) {
    assert.equal(heightAt(world, point.x, point.z), 0);
    assert.ok(navigator.canStand(point));
  }
  assert.equal(navigator.segmentClear(world.spawn, beyondPillar), false);
  assert.equal(navigator.goTo(world.spawn, beyondPillar), true);
  assert.ok(navigator.path.length > 1);
  assert.equal(navigator.segmentClear(approach, landing), false);
  assert.equal(navigator.goTo(approach, landing), false);
  const door = world.entities[0];
  assert.ok(door?.type === 'door');
  door.open = true;
  assert.equal(navigator.segmentClear(approach, landing), true);
  assert.equal(navigator.segmentClear({ ...approach, x: 4 }, { ...landing, x: 4 }), false);
});
