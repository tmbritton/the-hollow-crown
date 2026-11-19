import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generateKeepIdentity, KEEP_PROFILES } from '../src/generation/keep.ts';
import { generationIdentity } from '../src/generation/identity.ts';
import { randomStream } from '../src/generation/random.ts';
import { generateDungeonWithReport, ROOM_DEFINITIONS } from '../src/world.ts';

test('layout-v2 / keep-v1 identities retain their versioned profile and semantic ID fixtures', () => {
  for (const [seed, profile, digest] of [
    [
      'identity-0',
      'ashen-foundry',
      'd468bb1e6318c13fb04bafa8b818aabb979c459e31ab372b9b35316f53064f6d',
    ],
    [
      'identity-1',
      'pilgrim-redoubt',
      'e316a6dd6cfd21f136ae7e95ca44c3d33aad35fe75901b3e644a597ad11a37c0',
    ],
    [
      'identity-2',
      'drowned-court',
      'ef44c00a72288307c9a647afd059227e4b88ded81c283e2aec91488b5607c9e9',
    ],
  ]) {
    const keep = generateKeepIdentity({
      seed,
      generatorVersion: 'layout-v2',
      contentVersion: 'keep-v1',
    });
    assert.equal(keep.profile.id, profile);
    assert.equal(createHash('sha256').update(JSON.stringify(keep)).digest('hex'), digest);
    assert.deepEqual(
      keep.monarchs.map((m) => m.id),
      ['monarch:founder', 'monarch:heir', 'monarch:last'],
    );
    assert.deepEqual(
      keep.facts.map((f) => f.id),
      [
        'fact:founding',
        'fact:succession:heir',
        'fact:succession:last',
        'fact:catastrophe',
        'fact:memorial',
      ],
    );
    assert.deepEqual(
      keep.history.map((e) => e.id),
      ['event:founding', 'event:succession:heir', 'event:succession:last', 'event:catastrophe'],
    );
  }
});

test('shared keep history is reproducible, plain data and independent of layout retries', () => {
  for (const seed of ['MOURNING-731', 'trial-27']) {
    const identity = generationIdentity(seed);
    const keep = generateKeepIdentity(identity);
    assert.deepEqual(keep, generateKeepIdentity(identity));
    assert.deepEqual(JSON.parse(JSON.stringify(keep)), keep);
    assert.deepEqual(generateDungeonWithReport(seed).world.keep, keep);
  }
});

test('three authored profiles produce coherent succession, chronology and referenced facts', () => {
  const profiles = new Set<string>();
  const roomIds = new Set(ROOM_DEFINITIONS.map(([id]) => id));
  for (let index = 0; index < 200; index++) {
    const keep = generateKeepIdentity(generationIdentity(`identity-${index}`));
    profiles.add(keep.profile.id);
    assert.equal(keep.monarchs.length, 3);
    assert.equal(new Set(keep.monarchs.map((m) => m.id)).size, 3);
    assert.equal(new Set(keep.monarchs.map((m) => m.title)).size, 3);
    const people = new Map(keep.monarchs.map((m) => [m.id, m]));
    const facts = new Map(keep.facts.map((f) => [f.id, f]));
    assert.equal(facts.size, keep.facts.length);
    for (const [index, monarch] of keep.monarchs.entries()) {
      assert.equal(monarch.house, keep.house);
      assert.ok(monarch.reignStart < monarch.reignEnd);
      assert.equal(monarch.predecessorId, index ? keep.monarchs[index - 1].id : null);
      if (index) assert.equal(monarch.reignStart, keep.monarchs[index - 1].reignEnd);
    }
    for (const fact of keep.facts) {
      assert.ok(people.has(fact.personId));
      if (fact.kind === 'successorOf') assert.ok(people.has(fact.predecessorId));
      else assert.ok(roomIds.has(fact.room));
    }
    assert.equal(keep.history.length, 4);
    for (const [index, event] of keep.history.entries()) {
      assert.ok(people.has(event.personId));
      assert.ok(facts.has(event.factId));
      assert.equal(facts.get(event.factId)?.personId, event.personId);
      assert.ok(event.text.includes(keep.house));
      if (index) assert.ok(event.year > keep.history[index - 1].year);
    }
    assert.equal(keep.history.at(-1)?.year, keep.monarchs[2].reignEnd);
    assert.equal(keep.facts.find((f) => f.kind === 'catastrophe')?.personId, keep.monarchs[2].id);
  }
  assert.deepEqual([...profiles].sort(), ['ashen-foundry', 'drowned-court', 'pilgrim-redoubt']);
});

test('semantic random streams isolate cosmetic consumption and encode boundaries unambiguously', () => {
  const identity = generationIdentity('stream-test');
  const before = generateKeepIdentity(identity);
  const cosmetics = randomStream(identity, 'decoration', 'bakery');
  for (let i = 0; i < 1000; i++) cosmetics();
  assert.deepEqual(generateKeepIdentity(identity), before);
  const sample = (domain: string, id: string) => {
    const random = randomStream(identity, domain, id);
    return Array.from({ length: 8 }, () => random());
  };
  assert.deepEqual(sample('portrait', 'founder'), sample('portrait', 'founder'));
  assert.notDeepEqual(sample('portrait', 'founder'), sample('portrait', 'last'));
  assert.notDeepEqual(sample('a:b', 'c'), sample('a', 'b:c'));
  assert.notDeepEqual(
    randomStream(identity, 'history', 'dates')(),
    randomStream({ ...identity, contentVersion: 'future' }, 'history', 'dates')(),
  );
});

test('generated identities do not share mutable catalogs or records between runs', () => {
  const identity = generationIdentity('isolation');
  const keep = generateKeepIdentity(identity);
  const original = structuredClone(keep);
  keep.profile.name = 'caller mutation';
  keep.monarchs[0].title = 'caller mutation';
  keep.facts[0].personId = 'caller mutation';
  assert.deepEqual(generateKeepIdentity(identity), original);
  assert.ok(KEEP_PROFILES.every((profile) => profile.name !== 'caller mutation'));
});
