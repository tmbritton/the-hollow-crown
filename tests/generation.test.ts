import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generateDungeon, generateDungeonWithReport } from '../src/world.ts';
import { GenerationError, MAX_GENERATION_ATTEMPTS } from '../src/generation/identity.ts';
import type { World } from '../src/worldTypes.ts';

// layout-v3 / keep-v4 / last-ember-v1 fixtures, including reserved-site validation.
// Older layout-v2 fixtures were intentionally superseded when scene recipes shipped.
function geometryDigest(world: World): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        { ...world, tiles: [...world.tiles], reserved: [...world.reserved] },
        (key, value) =>
          ['keep', 'royal', 'description', 'factIds', 'tribute'].includes(key) ? undefined : value,
      ),
    )
    .digest('hex');
}

test('diagnostic generation preserves the versioned scene geometry fixture', () => {
  const { world, report } = generateDungeonWithReport('MOURNING-731');
  assert.deepEqual(world, generateDungeon('MOURNING-731'));
  assert.equal(
    geometryDigest(world),
    '6917c654ceadf6cefc292a09e3cb5106b4a25726f4fea8259168dcd5efe2ae10',
    'versioned diagnostics must not consume generation randomness',
  );
  assert.deepEqual(report.identity, {
    seed: world.seed,
    generatorVersion: 'layout-v3',
    contentVersion: 'keep-v4',
    scenarioVersion: 'last-ember-v1+tribute-v2+kobold-squads-v1',
  });
  assert.equal(report.acceptedAttempt, world.attempt);
  assert.deepEqual(report.attempts, [{ attempt: 0, stage: 'accepted', reasons: [] }]);
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
});

test('retries retain reproducible rejection reasons and the accepted zero-based attempt', () => {
  const { world, report } = generateDungeonWithReport('trial-23');
  assert.equal(world.attempt, 2);
  assert.equal(report.acceptedAttempt, 2);
  assert.equal(report.attempts.length, 3);
  assert.deepEqual(report.attempts[0], {
    attempt: 0,
    stage: 'validation',
    reasons: ['Furniture front inaccessible: meat-rack-butchery-44'],
  });
  assert.equal(
    geometryDigest(world),
    'c2d9fb0b4ebafb621e956a8c824cd041e89ec21f1f595de197c83e6514b62c58',
    'retrying seeds retain their versioned accepted geometry',
  );
  assert.deepEqual(report.attempts[1], {
    attempt: 1,
    stage: 'validation',
    reasons: ['Missing Last Ember shrine, focus or clue'],
  });
  assert.deepEqual(report.attempts[2], { attempt: 2, stage: 'accepted', reasons: [] });
  assert.deepEqual(report, generateDungeonWithReport('trial-23').report);
});

test('exhausted diagnostic generation retains a bounded trace rather than a generic error', () => {
  assert.throws(
    () => generateDungeonWithReport('trial-23', { maxAttempts: 1 }),
    (error) => {
      assert.ok(error instanceof GenerationError);
      assert.match(error.message, /trial-23/);
      assert.equal(error.report.identity.seed, 'trial-23');
      assert.equal(error.report.acceptedAttempt, null);
      assert.equal(error.report.attempts.length, 1);
      assert.deepEqual(
        error.report.attempts[0],
        generateDungeonWithReport('trial-23').report.attempts[0],
      );
      return true;
    },
  );
  for (const maxAttempts of [0, -1, 1.5, NaN, Infinity, MAX_GENERATION_ATTEMPTS + 1]) {
    assert.throws(() => generateDungeonWithReport('test', { maxAttempts }), RangeError);
  }
});

test('generation reports are independent between calls', () => {
  const first = generateDungeonWithReport('trial-27').report;
  const expected = structuredClone(first);
  first.attempts[0].reasons.push('caller mutation');
  first.identity.seed = 'caller mutation';
  assert.deepEqual(generateDungeonWithReport('trial-27').report, expected);
});
