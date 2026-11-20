import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon, generateDungeonWithReport, tileAt } from '../src/world.ts';
import { seedEnemies, CombatSystem, hostile } from '../src/combat.ts';
import { createActor } from '../src/actors.ts';
import { ECS } from '../src/ecs.ts';
import { createGenerationReport } from '../src/generation/report.ts';
import { seedInhabitant, seedEmberWorker } from '../src/generation/inhabitants.ts';

test('every profile names one existing inhabitant with a truthful home, group and keep fact', () => {
  const profiles = new Set<string>();
  for (let i = 0; i < 60; i++) {
    const world = generateDungeon(`inhabitant-${i}`);
    const enemies = seedEnemies(new ECS(), world);
    assert.equal(enemies.length, 24);
    const named = enemies.filter((a) => a.entity.get('inhabitant')?.id === 'inhabitant:standout');
    assert.equal(named.length, 1, 'one existing enemy must have a stable identity');
    const actor = named[0];
    const identity = actor.entity.require('inhabitant');
    assert.equal(identity.actorId, actor.id);
    assert.equal(identity.kind, actor.kind);
    assert.deepEqual(identity.home, {
      x: actor.brain!.home.x,
      z: actor.brain!.home.z,
      h: actor.brain!.home.h,
    });
    const homeAnchor = actor.brain!.social?.center ?? identity.home;
    assert.equal(identity.homeRoom, tileAt(world, homeAnchor.x, homeAnchor.z)?.room);
    assert.equal(identity.groupId, actor.brain!.social?.id ?? null);
    assert.equal(identity.house, world.keep.house);
    assert.ok(identity.description.includes(world.keep.house));
    assert.ok(identity.description.includes(world.roomById[identity.homeRoom].name));
    assert.ok(identity.factIds.every((id) => world.keep.facts.some((fact) => fact.id === id)));
    assert.ok(identity.factIds.length > 0);
    assert.equal(actor.health.max, { skeleton: 48, goblin: 36, kobold: 44 }[identity.kind]);
    assert.equal(
      actor.kind,
      {
        'ashen-foundry': 'skeleton',
        'drowned-court': 'goblin',
        'pilgrim-redoubt': 'kobold',
      }[world.keep.profile.id],
    );
    if (identity.role === 'dealer') {
      assert.equal(actor.brain!.social?.activity, 'cards');
      assert.equal(actor.brain!.social!.members.length, 4);
      assert.ok(actor.brain!.social!.members.includes(actor.id));
    }
    if (
      world.keep.profile.id === 'pilgrim-redoubt' &&
      enemies.some((a) => a.brain?.social?.activity === 'cards')
    )
      assert.equal(identity.role, 'dealer');
    profiles.add(world.keep.profile.id);
    const repeated = seedEnemies(new ECS(), generateDungeon(world.seed));
    assert.deepEqual(
      repeated
        .find((a) => a.entity.get('inhabitant')?.id === 'inhabitant:standout')!
        .entity.require('inhabitant'),
      identity,
    );
    seedInhabitant(world, [...repeated].reverse());
    seedEmberWorker(world, repeated);
    assert.deepEqual(
      repeated
        .filter((a) => a.entity.get('inhabitant')?.id === 'inhabitant:standout')
        .map((a) => a.entity.require('inhabitant')),
      [identity],
    );
  }
  assert.equal(profiles.size, 3);
});

test('a card player on a doorway tile retains the gathering room as its home', () => {
  const world = generateDungeon('trial-24');
  const actor = seedEnemies(new ECS(), world).find(
    (a) => a.entity.get('inhabitant')?.id === 'inhabitant:standout',
  )!;
  const identity = actor.entity.require('inhabitant');
  assert.equal(tileAt(world, identity.home.x, identity.home.z)?.room, undefined);
  const center = actor.brain!.social!.center;
  assert.equal(identity.homeRoom, tileAt(world, center.x, center.z)?.room);
});

test('a simplified kobold gathering produces a keeper rather than inventing a card game', () => {
  const world = generateDungeon('MOURNING-731');
  assert.equal(world.keep.profile.id, 'pilgrim-redoubt');
  const enemies = seedEnemies(new ECS(), world);
  for (const actor of enemies) {
    actor.entity.remove('inhabitant');
    if (actor.brain?.social) actor.brain.social.activity = 'smoke';
  }
  seedInhabitant(world, enemies);
  const named = enemies.filter((a) => a.entity.has('inhabitant'));
  assert.equal(named.length, 1);
  const identity = named[0].entity.require('inhabitant');
  assert.equal(identity.role, 'keeper');
  assert.ok(!identity.description.includes('cards'));
  assert.equal(identity.groupId, named[0].brain!.social!.id);
});

test('inhabitant identity survives movement, combat and corpse creation and resets independently', () => {
  const world = generateDungeon('inhabitant-lifecycle');
  const ecs = new ECS();
  const player = createActor(ecs, world, 'player', 'player', world.spawn);
  const enemies = seedEnemies(ecs, world);
  const actor = enemies.find((a) => a.entity.has('inhabitant'));
  assert.ok(actor, 'named identity must exist before lifecycle events');
  const identity = actor.entity.require('inhabitant');
  const original = structuredClone(identity);
  const combat = new CombatSystem(ecs, world, [player, ...enemies]);
  assert.ok(hostile(player, actor));
  assert.ok(
    !hostile(
      actor,
      enemies.find((a) => a.kind === actor.kind && a.id !== actor.id)!,
    ),
  );
  actor.position.x += 1;
  actor.brain!.home.x += 2;
  combat.target(player, actor);
  combat.damage(actor, 1000);
  assert.ok(actor.entity.has('corpse'));
  assert.equal(actor.entity.require('inhabitant'), identity);
  assert.deepEqual(identity, original);
  identity.factIds.push('caller mutation');
  const fresh = seedEnemies(new ECS(), generateDungeon(world.seed));
  assert.deepEqual(
    fresh.find((a) => a.entity.has('inhabitant'))!.entity.require('inhabitant'),
    original,
  );
});

test('initial encounter reports expose a detached named inhabitant', () => {
  const { world, report: trace } = generateDungeonWithReport('MOURNING-731');
  const report = createGenerationReport(world, trace);
  const named = report.encounters.filter((e) => e.inhabitant?.id === 'inhabitant:standout');
  assert.equal(named.length, 1);
  assert.equal(named[0].inhabitant!.actorId, named[0].id);
  const expected = structuredClone(report);
  named[0].inhabitant!.home.x += 100;
  named[0].inhabitant!.factIds.push('caller mutation');
  assert.deepEqual(createGenerationReport(world, trace), expected);
});
