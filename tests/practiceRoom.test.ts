import assert from 'node:assert/strict';
import test from 'node:test';
import { Navigator } from '../src/navigation.ts';
import { createActor } from '../src/actors.ts';
import { CombatSystem, MELEE_RANGE } from '../src/combat.ts';
import { ECS } from '../src/ecs.ts';
import * as practice from '../src/practiceRoom.ts';
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

test('practice requests build exactly the accepted round, even with a seed in the URL', () => {
  for (const [state, command, expected] of [
    ['quiet', 'reset', 'quiet'],
    ['quiet', 'startSingleFoe', 'singleFoe'],
    ['singleFoe', 'reset', 'quiet'],
    ['singleFoe', 'startSingleFoe', 'alreadySelected'],
    ['loading', 'reset', 'unavailable'],
    ['loading', 'startSingleFoe', 'unavailable'],
    ['dungeon', 'reset', 'unavailable'],
    ['dungeon', 'startSingleFoe', 'unavailable'],
  ] as const) {
    for (const seed of [null, 'MOURNING-731']) {
      const calls: string[] = [];
      const decision = practice.decidePracticeRound(state, command);
      if (decision.kind === 'rebuild') {
        const selection = selectContent(
          'practice',
          seed,
          {
            dungeon(requestedSeed) {
              if (!requestedSeed) calls.push('freshSeed');
              calls.push('generator');
            },
            practice: (round) => (calls.push(round), round),
          },
          decision.round,
        );
        assert.deepEqual(selection, { kind: 'practice', world: expected });
        assert.deepEqual(calls, [expected]);
      } else {
        assert.equal(decision.kind, expected);
        assert.deepEqual(calls, []);
      }
    }
  }
});

test('authored floor and geometry are deterministic', () => {
  assert.deepEqual(buildPracticeRoom(), buildPracticeRoom());
});

test('corresponding doors are independent mutable objects', () => {
  const first = buildPracticeRoom(),
    second = buildPracticeRoom();
  const door = first.entities[0];
  assert.ok(door?.type === 'door' && !door.locked && !door.open);
  const other = second.entities.find((entity) => entity.id === door.id);
  assert.ok(other?.type === 'door');
  assert.notStrictEqual(door, other);
  door.open = true;
  assert.equal(other.open, false);
});

test('corresponding tiles are independent mutable objects', () => {
  const first = buildPracticeRoom(),
    second = buildPracticeRoom();
  const [id, tile] = first.tiles.entries().next().value!;
  const other = second.tiles.get(id)!;
  const originalHeight = other.h;
  assert.equal(typeof originalHeight, 'number');
  assert.notStrictEqual(tile, other);
  tile.h = originalHeight + 9;
  assert.equal(other.h, originalHeight);
});

test('only the opt-in roster registers one reachable, ordinary foe outside melee reach', () => {
  for (const round of ['quiet', 'singleFoe'] as const) {
    const world = buildPracticeRoom();
    const ecs = new ECS();
    const hero = createActor(ecs, world, 'player', 'player', world.spawn);
    const foes = practice.createPracticeFoes(ecs, world, round);
    const combat = new CombatSystem(ecs, world, [hero, ...foes]);
    assert.equal(combat.actors.length, round === 'quiet' ? 1 : 2);
    assert.equal(combat.enemies.length, round === 'quiet' ? 0 : 1);
    if (round === 'quiet') continue;
    const [foe] = combat.enemies;
    assert.ok(foe?.alive && foe.kind === 'skeleton');
    assert.strictEqual(foe.entity, ecs.get(foe.id));
    for (const component of ['body', 'attack', 'brain', 'navigation'] as const)
      assert.ok(foe.entity.has(component));
    for (const component of ['squadMember', 'objectiveWork', 'lastEmber', 'tribute'] as const)
      assert.equal(ecs.query(component).length, 0);
    const nav = new Navigator(world);
    assert.ok(nav.canStand(foe.position));
    assert.ok(nav.segmentClear(world.spawn, foe.position));
    assert.ok(
      Math.hypot(foe.position.x - world.spawn.x, foe.position.z - world.spawn.z) > MELEE_RANGE,
    );
  }
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
