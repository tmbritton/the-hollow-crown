import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generateDungeon, generateDungeonWithReport } from '../src/world.ts';
import { GenerationError, MAX_GENERATION_ATTEMPTS } from '../src/generation/identity.ts';
import type { World } from '../src/worldTypes.ts';

// Captured before identity presentation: only authored text/facts/portrait traits are omitted.
function geometryDigest(world: World): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        { ...world, tiles: [...world.tiles], reserved: [...world.reserved] },
        (key, value) =>
          ['keep', 'royal', 'description', 'factIds'].includes(key) ? undefined : value,
      ),
    )
    .digest('hex');
}

test('diagnostic generation preserves the existing seed interpretation and geometry', () => {
  const { world, report } = generateDungeonWithReport('MOURNING-731');
  assert.deepEqual(world, generateDungeon('MOURNING-731'));
  assert.equal(
    geometryDigest(world),
    '67e30061eca028b56754a5c31a1442655d0c280df447aaedb100f6bf41924526',
    'versioned diagnostics must not consume generation randomness',
  );
  assert.deepEqual(report.identity, {
    seed: world.seed,
    generatorVersion: 'layout-v2',
    contentVersion: 'keep-v2',
  });
  assert.equal(report.acceptedAttempt, world.attempt);
  assert.deepEqual(report.attempts, [{ attempt: 0, stage: 'accepted', reasons: [] }]);
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
});

test('retries retain reproducible rejection reasons and the accepted zero-based attempt', () => {
  const { world, report } = generateDungeonWithReport('trial-27');
  assert.equal(world.attempt, 1);
  assert.equal(report.acceptedAttempt, 1);
  assert.equal(report.attempts.length, 2);
  assert.deepEqual(report.attempts[0], {
    attempt: 0,
    stage: 'validation',
    reasons: ['Furniture front inaccessible: tack-rack-stable-30'],
  });
  assert.equal(
    geometryDigest(world),
    'fef12b885ab14b70bd64e3e0f2644ffa5f505ff66137c23ad2f1f90d38dcdb76',
    'retrying seeds retain their historical accepted geometry',
  );
  assert.deepEqual(report.attempts[1], { attempt: 1, stage: 'accepted', reasons: [] });
  assert.deepEqual(report, generateDungeonWithReport('trial-27').report);
});

test('exhausted diagnostic generation retains a bounded trace rather than a generic error', () => {
  assert.throws(
    () => generateDungeonWithReport('trial-27', { maxAttempts: 1 }),
    (error) => {
      assert.ok(error instanceof GenerationError);
      assert.match(error.message, /trial-27/);
      assert.equal(error.report.identity.seed, 'trial-27');
      assert.equal(error.report.acceptedAttempt, null);
      assert.equal(error.report.attempts.length, 1);
      assert.deepEqual(
        error.report.attempts[0],
        generateDungeonWithReport('trial-27').report.attempts[0],
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
