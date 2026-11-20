import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon } from '../src/world.ts';
import { applyKeepPresentation } from '../src/generation/keepPresentation.ts';

test('presentation fact links disclose only what the caption actually communicates', () => {
  const world = generateDungeon('MOURNING-731');
  assert.deepEqual(
    world.roomById.entrance.factIds,
    ['fact:catastrophe'],
    'the entrance does not name the founder',
  );
  assert.deepEqual(
    world.roomById.throne.factIds,
    [],
    'reign dates do not disclose succession or catastrophe',
  );
  for (const portrait of world.entities.filter((e) => e.type === 'portrait')) {
    const event = world.keep.history.find((e) => e.personId === portrait.royal.personId)!;
    assert.ok(portrait.royal.description?.includes(event.text));
    assert.deepEqual(
      portrait.royal.factIds,
      [event.factId],
      'a monarch is not a grant of their entire biography',
    );
  }
});

test('[extended] portraits depict linked monarchs with consistent houses, dates and core appearance', () => {
  for (let i = 0; i < 30; i++) {
    const world = generateDungeon(`presentation-${i}`);
    const portraits = world.entities.filter((e) => e.type === 'portrait');
    const subjects = new Set<string>();
    const appearance = new Map<string, number[]>();
    for (const portrait of portraits) {
      const royal = portrait.royal;
      const person = world.keep.monarchs.find((m) => m.id === royal.personId);
      assert.ok(person);
      subjects.add(person.id);
      assert.equal(royal.title, person.title);
      assert.equal(royal.house, world.keep.house);
      assert.ok(royal.year >= person.reignStart && royal.year < person.reignEnd);
      assert.equal(royal.palette, world.keep.profile.palette);
      const traits = [royal.skin, royal.hair, royal.beard, royal.crown];
      if (appearance.has(person.id)) assert.deepEqual(traits, appearance.get(person.id));
      appearance.set(person.id, traits);
      assert.ok(royal.factIds?.length);
      for (const id of royal.factIds) assert.ok(world.keep.facts.some((fact) => fact.id === id));
      assert.ok(royal.description?.includes(world.keep.house));
    }
    assert.equal(subjects.size, 3, world.seed);
    assert.equal(portraits.find((p) => p.room === 'entrance')?.royal.personId, 'monarch:founder');
  }
});

test('separated locations tell the same catastrophe and preserve direct progression instructions', () => {
  const world = generateDungeon('MOURNING-731');
  for (const id of ['entrance', 'crypt', 'altar'] as const) {
    const room = world.roomById[id];
    assert.ok(room.factIds?.includes('fact:catastrophe'));
    assert.ok(room.description.includes(world.keep.monarchs[2].title));
    assert.ok(room.description.includes(String(world.keep.monarchs[2].reignEnd)));
  }
  assert.match(
    world.roomById.altar.description,
    /Kindle the violet altar to unseal the throne gate/,
  );
  assert.match(world.roomById.throne.description, /altar/);
});

test('binding presentation is idempotent and does not change placement or gameplay state', () => {
  const world = generateDungeon('trial-27');
  const original = structuredClone(world);
  applyKeepPresentation(world);
  assert.deepEqual(world, original);
  assert.ok(world.entities.some((e) => e.type === 'door' && e.locked && e.requiresAltar));
  const bodies = world.entities.map((e) => [e.id, e.x, e.z, e.h]);
  world.keep.house = 'Changed House';
  applyKeepPresentation(world);
  assert.deepEqual(
    world.entities.map((e) => [e.id, e.x, e.z, e.h]),
    bodies,
  );
  assert.deepEqual(world.tiles, original.tiles);
  assert.deepEqual(world.props, original.props);
});

test('painting subjects and appearance follow placement identity when entity order changes', () => {
  const world = generateDungeon('MOURNING-731');
  const before = new Map(
    world.entities
      .filter((e) => e.type === 'portrait')
      .map((e) => [e.id, structuredClone(e.royal)]),
  );
  world.entities.reverse();
  applyKeepPresentation(world);
  for (const portrait of world.entities.filter((e) => e.type === 'portrait'))
    assert.deepEqual(portrait.royal, before.get(portrait.id), portrait.id);
});
