import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DiscoveryRecord,
  portraitDiscovery,
  landmarkDiscovery,
  inhabitantDiscovery,
} from '../src/discoveries.ts';
import { generationIdentity } from '../src/generation/identity.ts';
import { generateDungeon } from '../src/world.ts';
import { applyKeepPresentation } from '../src/generation/keepPresentation.ts';
import { seedEnemies, CombatSystem } from '../src/combat.ts';
import { ECS } from '../src/ecs.ts';
import { createActor, teleportActor } from '../src/actors.ts';

test('generated truth is not knowledge; only presented sources teach their explicit facts', () => {
  const world = generateDungeon('MOURNING-731');
  const record = new DiscoveryRecord(generationIdentity(world.seed));
  const portrait = world.entities.find((e) => e.type === 'portrait')!;
  const evidence = portraitDiscovery(portrait);
  const named = seedEnemies(new ECS(), world).find(
    (a) => a.entity.get('inhabitant')?.id === 'inhabitant:standout',
  )!;
  inhabitantDiscovery(named.entity.require('inhabitant'));
  landmarkDiscovery(world.roomById.crypt);
  assert.deepEqual(record.snapshot().discoveries, []);
  assert.deepEqual(record.snapshot().events, []);
  assert.deepEqual(record.snapshot().factIds, []);
  assert.ok(record.present(evidence, 7));
  assert.ok(record.knows('fact:founding'));
  assert.ok(!record.knows('fact:catastrophe'));
  assert.ok(!record.knows('fact:memorial'));
  assert.deepEqual(record.snapshot().factIds, evidence.factIds);
});

test('stable sources deduplicate without rewriting history or inferring related facts', () => {
  const world = generateDungeon('MOURNING-731');
  const record = new DiscoveryRecord(generationIdentity(world.seed));
  const evidence = landmarkDiscovery(world.roomById.entrance);
  assert.ok(record.present(evidence, 2));
  assert.equal(
    record.present({ ...evidence, factIds: ['unseen'], description: 'changed' }, 9),
    false,
  );
  assert.ok(!record.knows('unseen'));
  assert.equal(record.snapshot().discoveries[0].at, 2);
  assert.equal(record.snapshot().discoveries[0].description, evidence.description);
  assert.ok(record.present(landmarkDiscovery(world.roomById.altar), 10));
  assert.deepEqual(record.snapshot().factIds, ['fact:catastrophe']);
  assert.equal(record.snapshot().discoveries.length, 2);
});

test('records own detached evidence and snapshots, with stable first-observation ordering', () => {
  const identity = generationIdentity('MOURNING-731');
  const world = generateDungeon(identity.seed);
  const record = new DiscoveryRecord(identity);
  const evidence = landmarkDiscovery(world.roomById.crypt);
  const original = structuredClone(evidence);
  record.present(evidence, 3);
  evidence.factIds.push('unseen');
  evidence.description = 'mutated';
  identity.seed = 'mutated';
  const snapshot = record.snapshot();
  snapshot.discoveries[0].factIds.push('also unseen');
  snapshot.factIds.length = 0;
  snapshot.identity.seed = 'other';
  assert.deepEqual(record.snapshot().discoveries, [{ ...original, at: 3, order: 0 }]);
  assert.equal(record.snapshot().identity.seed, world.seed);
  assert.ok(!record.knows('unseen') && !record.knows('also unseen'));
});

test('same-step evidence and events retain their actual observation order and original uncertainty', () => {
  const world = generateDungeon('MOURNING-731');
  const record = new DiscoveryRecord(generationIdentity(world.seed));
  record.recordEvent(
    { kind: 'death-witnessed', subjectId: 'inhabitant:standout', label: 'a kobold' },
    1,
  );
  const named = seedEnemies(new ECS(), world).find((a) => a.entity.has('inhabitant'))!;
  record.present(inhabitantDiscovery(named.entity.require('inhabitant')), 1);
  record.present(landmarkDiscovery(world.roomById.altar), 1);
  record.recordEvent({ kind: 'altar-kindled', subjectId: 'altar', label: 'Altar' }, 1);
  const snapshot = record.snapshot();
  assert.deepEqual(
    snapshot.events.map((e) => e.order),
    [0, 3],
  );
  assert.deepEqual(
    snapshot.discoveries.map((e) => e.order),
    [1, 2],
  );
  assert.equal(
    snapshot.events[0].label,
    'a kobold',
    'later identification cannot rewrite an earlier observation',
  );
  assert.ok(!('killer' in snapshot.events[0]));
});

test('observed events are once-only and never imply biography, prior meetings or unseen killers', () => {
  const record = new DiscoveryRecord(generationIdentity('MOURNING-731'));
  record.recordEvent(
    { kind: 'remains-found', subjectId: 'inhabitant:standout', label: 'a kobold' },
    1,
  );
  record.recordEvent(
    { kind: 'remains-found', subjectId: 'inhabitant:standout', label: 'a kobold' },
    2,
  );
  assert.equal(record.snapshot().events.length, 1);
  assert.deepEqual(record.snapshot().discoveries, []);
  assert.deepEqual(record.snapshot().factIds, []);
  assert.ok(!('killer' in record.snapshot().events[0]));
  record.recordEvent({ kind: 'death-witnessed', subjectId: 'other', label: 'a goblin' }, 3);
  const killer = { id: 'player', label: 'you' };
  record.recordEvent(
    { kind: 'death-witnessed', subjectId: 'third', label: 'a skeleton', killer },
    4,
  );
  killer.id = 'mutated';
  assert.equal(
    record.recordEvent({ kind: 'remains-found', subjectId: 'third', label: 'a skeleton' }, 5),
    false,
  );
  const events = record.snapshot().events;
  assert.ok(!('killer' in events[1]));
  assert.equal(events[2].kind, 'death-witnessed');
  assert.deepEqual(events[2].kind === 'death-witnessed' && events[2].killer, {
    id: 'player',
    label: 'you',
  });
  for (const kind of ['altar-kindled', 'reliquary-claimed', 'crown-claimed'] as const) {
    assert.ok(record.recordEvent({ kind, subjectId: kind, label: kind }, 6));
    assert.equal(record.recordEvent({ kind, subjectId: kind, label: kind }, 8), false);
  }
});

test('run-owned knowledge survives actor death and teleport but a same-seed run starts empty', () => {
  const world = generateDungeon('MOURNING-731');
  const ecs = new ECS();
  const record = new DiscoveryRecord(generationIdentity(world.seed));
  ecs.create('run').add('discoveries', record);
  const player = createActor(ecs, world, 'player', 'player', world.spawn);
  const combat = new CombatSystem(ecs, world, [player]);
  record.present(landmarkDiscovery(world.roomById.crypt), 5);
  const before = record.snapshot();
  combat.damage(player, 1000);
  player.entity.remove('corpse');
  player.attack.reset();
  teleportActor(player, world, world.spawn);
  player.health.current = 100;
  assert.equal(ecs.query('discoveries')[0].require('discoveries'), record);
  assert.deepEqual(record.snapshot(), before);
  const next = new ECS()
    .create('run')
    .add('discoveries', new DiscoveryRecord(generationIdentity(world.seed)));
  assert.deepEqual(next.require('discoveries').snapshot().discoveries, []);
  assert.deepEqual(next.require('discoveries').snapshot().identity, before.identity);
});

test('discovery identity follows seeded placement and semantic roles, not mutable entity ordering', () => {
  const world = generateDungeon('MOURNING-731');
  const before = world.entities.filter((e) => e.type === 'portrait').map(portraitDiscovery);
  world.entities.reverse();
  for (const e of world.entities) e.id = `unrelated:${e.id}`;
  applyKeepPresentation(world);
  const after = world.entities.filter((e) => e.type === 'portrait').map(portraitDiscovery);
  assert.deepEqual(after.reverse(), before);
  assert.equal(new Set(before.map((e) => e.id)).size, before.length);
  const fresh = generateDungeon(world.seed);
  assert.deepEqual(
    fresh.entities.filter((e) => e.type === 'portrait').map(portraitDiscovery),
    before,
  );
  assert.equal(landmarkDiscovery(world.roomById.altar).id, 'landmark:altar');
  const named = seedEnemies(new ECS(), world).find(
    (a) => a.entity.get('inhabitant')?.id === 'inhabitant:standout',
  )!;
  assert.equal(inhabitantDiscovery(named.entity.require('inhabitant')).id, 'inhabitant:standout');
});
