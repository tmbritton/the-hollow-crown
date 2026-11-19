import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeonWithReport, key, reachableTiles } from '../src/world.ts';
import { createGenerationReport } from '../src/generation/report.ts';
import { GENERATION_CORPUS_SEEDS, selectGallerySeeds } from '../src/generation/corpus.ts';
import { ECS } from '../src/ecs.ts';
import { createActor } from '../src/actors.ts';
import { seedEnemies } from '../src/combat.ts';
import { registerWorld } from '../src/worldEntities.ts';

test('generation analysis describes the actual graph, gate, encounters and clear floor', () => {
  const { world, report: trace } = generateDungeonWithReport('MOURNING-731');
  const original = structuredClone(world);
  const report = createGenerationReport(world, trace);
  assert.deepEqual(world, original, 'analysis must not attach runtime state to the blueprint');
  assert.deepEqual(report.trace, trace);
  assert.equal(report.rooms.length, 13);
  assert.equal(report.graph.components, 1);
  assert.equal(report.graph.loops, world.connections.length - world.rooms.length + 1);
  assert.equal(report.resources.tiles, world.tiles.size);
  assert.equal(report.resources.props, world.props.length);
  assert.equal(report.resources.enemies, 21);
  assert.equal(report.encounters.filter((e) => e.kind === 'skeleton').length, 8);
  assert.equal(report.encounters.filter((e) => e.kind === 'goblin').length, 4);
  assert.equal(report.encounters.filter((e) => e.kind === 'kobold').length, 9);
  const ecs = new ECS();
  registerWorld(ecs, world);
  createActor(ecs, world, 'player', 'player', world.spawn);
  const actualEnemies = seedEnemies(ecs, world);
  for (const encounter of report.encounters) {
    const actor = actualEnemies.find((a) => a.id === encounter.id);
    assert.ok(actor);
    assert.deepEqual(
      [encounter.x, encounter.z, encounter.h],
      [actor.position.x, actor.position.z, actor.position.h],
    );
    assert.equal(encounter.group, actor.brain?.pack || null);
    assert.equal(encounter.activity, actor.brain?.social?.activity ?? null);
  }
  assert.ok(report.encounters.some((e) => e.group && e.activity));
  for (const room of report.rooms) {
    assert.equal(
      room.degree,
      world.connections.filter((c) => c.a === room.id || c.b === room.id).length,
    );
    assert.equal(room.beforeAltar, room.id !== 'throne');
    assert.equal(room.afterAltar, true);
    assert.ok(room.openAreaTiles <= room.walkableTiles);
    assert.ok(room.openAreaTiles > 0);
    assert.equal(room.enemies, report.encounters.filter((e) => e.room === room.id).length);
  }
  assert.equal(report.progression.beforeAltarTiles, reachableTiles(world).size);
  assert.equal(report.progression.afterAltarTiles, reachableTiles(world, true).size);
  assert.ok(report.progression.spawnToAltar !== null && report.progression.spawnToAltar > 0);
  assert.ok(report.progression.altarToThrone !== null && report.progression.altarToThrone > 0);
  assert.equal(
    report.progression.requiredRoute,
    report.progression.spawnToAltar + report.progression.altarToThrone,
  );
  assert.deepEqual(report.validationErrors, []);
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
  assert.deepEqual(createGenerationReport(world, trace), report);
});

test('reported route length follows obstructed tile paths rather than straight-line distance', () => {
  const { world, report: trace } = generateDungeonWithReport('MOURNING-731');
  world.tiles = new Map();
  for (let x = 0; x <= 4; x++)
    for (let z = 0; z <= 2; z++) {
      world.tiles.set(key(x, z), { x, z, h: 0, surface: 'stone', blocked: x === 2 && z < 2 });
    }
  world.spawn = { x: 0, z: 0, h: 0 };
  const altar = world.entities.find((e) => e.type === 'altar');
  const throne = world.entities.find((e) => e.type === 'throne');
  assert.ok(altar && throne);
  altar.approach = { x: 4, z: 0 };
  throne.approach = { x: 4, z: 2 };
  const report = createGenerationReport(world, trace);
  assert.equal(report.progression.spawnToAltar, 8);
  assert.equal(report.progression.altarToThrone, 2);
  assert.equal(report.progression.requiredRoute, 10);
  world.tiles.delete('2,2');
  const blocked = createGenerationReport(world, trace);
  assert.equal(blocked.progression.spawnToAltar, null);
  assert.equal(blocked.progression.requiredRoute, null);
});

test('reports detach nested data and reject mismatched generation provenance', () => {
  const { world, report: trace } = generateDungeonWithReport('trial-27');
  const report = createGenerationReport(world, trace);
  const expected = structuredClone(report);
  assert.deepEqual(report.keep, world.keep);
  world.keep.profile.epithets = ['changed', 'changed', 'changed'];
  world.keep.monarchs[0].title = 'changed';
  world.keep.facts[0].personId = 'changed';
  world.keep.history[0].text = 'changed';
  trace.attempts[0].reasons.push('later mutation');
  world.rooms[0].name = 'later mutation';
  world.connections[0].points[0].x += 100;
  assert.deepEqual(report, expected);
  const changedWorld = structuredClone(world.keep);
  report.keep.monarchs[1].title = 'changed report';
  report.keep.history[1].text = 'changed report';
  assert.deepEqual(world.keep, changedWorld);
  assert.throws(
    () => createGenerationReport(world, { ...trace, acceptedAttempt: null }),
    /attempt/i,
  );
  assert.throws(
    () =>
      createGenerationReport(world, { ...trace, identity: { ...trace.identity, seed: 'wrong' } }),
    /seed/i,
  );
});

test('fixed 100-seed corpus stays valid and selects twelve stable, explained gallery fixtures', () => {
  assert.equal(GENERATION_CORPUS_SEEDS.length, 100);
  assert.equal(new Set(GENERATION_CORPUS_SEEDS).size, 100);
  const reports = GENERATION_CORPUS_SEEDS.map((seed) => {
    const { world, report } = generateDungeonWithReport(seed);
    return createGenerationReport(world, report);
  });
  for (const report of reports) {
    assert.deepEqual(report.validationErrors, [], report.trace.identity.seed);
    assert.equal(report.resources.enemies, 21, report.trace.identity.seed);
    assert.ok(report.progression.requiredRoute !== null);
    assert.equal(report.rooms.find((r) => r.id === 'throne')?.beforeAltar, false);
  }
  const selected = selectGallerySeeds(reports);
  assert.equal(selected.length, 12);
  assert.equal(new Set(selected.map((entry) => entry.seed)).size, 12);
  assert.ok(selected.every((entry) => entry.reasons.length > 0));
  assert.ok(selected.some((entry) => entry.reasons.includes('compact')));
  assert.ok(selected.some((entry) => entry.reasons.includes('sprawling')));
  assert.ok(selected.some((entry) => entry.seed === 'trial-27'));
  assert.deepEqual(selectGallerySeeds([...reports].reverse()), selected);
  assert.equal(selectGallerySeeds(reports.slice(0, 3)).length, 3);
  assert.deepEqual(selectGallerySeeds([]), []);
});

test('gallery fills remaining slots across the distribution after selecting outliers', () => {
  const { world, report: trace } = generateDungeonWithReport('MOURNING-731');
  const baseline = createGenerationReport(world, trace);
  const reports = Array.from({ length: 30 }, (_, index) => {
    const report = structuredClone(baseline);
    report.trace.identity.seed =
      ['MOURNING-731', 'CINDER-42', 'VIOLET-7', 'trial-27'][index] ?? `sample-${index}`;
    report.bounds = { minX: 0, minZ: 0, maxX: index + 1, maxZ: 1 };
    report.progression.requiredRoute = index === 4 ? 999 : 100;
    report.trace.attempts =
      index === 5 ? [trace.attempts[0], trace.attempts[0]] : [trace.attempts[0]];
    report.graph.loops = index === 6 ? 5 : 1;
    for (const room of report.rooms) room.openAreaTiles = index === 7 ? 1 : 100;
    report.resources.doors = index === 8 ? 20 : 10;
    return report;
  });
  const selected = selectGallerySeeds(reports);
  const samples = selected.filter((entry) => entry.reasons[0] === 'area distribution');
  assert.equal(samples.length, 2);
  const ranks = samples.map((entry) =>
    reports.findIndex((r) => r.trace.identity.seed === entry.seed),
  );
  assert.ok(Math.min(...ranks) >= 10);
  assert.ok(Math.max(...ranks) >= 22, 'upper-area quantiles must not be starved by early samples');
  assert.throws(() => selectGallerySeeds([reports[0], reports[0]]), /unique seeds/);
});
