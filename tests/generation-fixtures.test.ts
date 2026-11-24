import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  coreDigests,
  coreInputs,
  corpusDigest,
  fixtureInputs,
  inputIdentity,
  kits,
  scenarioFixtureInputs,
  sha,
} from './ef0-contract.ts';
import { canonical, observe, observeDigest } from './generation-fixtures.ts';

// Only cache small immutable digests within this test file, never generated worlds.
const checkedCore = new Map<string, string>();

test('ordered oracle rejects a changed byte, a missing leaf, a duplicate and reordering', () => {
  const leaves = fixtureInputs()
    .slice(0, 3)
    .map((input) => ({ input, sha256: sha(input.seed) }));
  const expected = corpusDigest(leaves);
  for (const changed of [
    [{ ...leaves[0], sha256: sha(leaves[0].input.seed + '!') }, ...leaves.slice(1)],
    leaves.slice(1),
    [leaves[0], leaves[0], leaves[2]],
    [...leaves].reverse(),
  ])
    assert.notEqual(corpusDigest(changed), expected);
});

test('canonical generation encoding preserves ordered collections, properties, numbers and aliases', () => {
  const tile = { h: -0 };
  const graph = {
    tile,
    lookup: new Map([['tile', tile]]),
    sockets: new Set(['a', 'b']),
    reasons: ['first', 'second'],
  };
  const bytes = canonical(graph);
  assert.equal(canonical(structuredClone(graph)), bytes);
  for (const changed of [
    { ...graph, tile: { h: 0 } },
    { ...graph, lookup: new Map([['tile', { h: -0 }]]) },
    { ...graph, sockets: new Set(['b', 'a']) },
    { ...graph, socket: undefined },
    { ...graph, reasons: ['second', 'first'] },
  ])
    assert.notEqual(canonical(changed), bytes);
  assert.notEqual(canonical([NaN, Infinity, -Infinity]), canonical([null, null, null]));
  assert.throws(() => canonical(new Date()), /Unsupported/);
});

test('EF0 named oracle including exhausted trial-23', () => {
  for (const [i, input] of coreInputs().entries()) {
    const output = observe(input);
    const digest = sha(canonical(output));
    assert.equal(digest, coreDigests[i], input.seed);
    checkedCore.set(inputIdentity(input), digest);
    if (input.defaultSeed) {
      assert.ok(output.world);
      output.world.spawn.x += 1;
      assert.notEqual(sha(canonical(output)), coreDigests[i]);
    }
  }
});

test('[extended] EF0 oracle covers every frozen generation input', () => {
  const pin = kits['generation-ef0'];
  const inputs = fixtureInputs();
  assert.equal(inputs.length, pin.count);
  assert.equal(
    corpusDigest(
      inputs.map((input) => {
        const sha256 = input.core ? checkedCore.get(inputIdentity(input)) : undefined;
        return sha256 ? { input, sha256 } : observeDigest(input);
      }),
    ),
    pin.corpus,
    'Run EF0 archive replay and --diagnose for first difference',
  );
});

test('[extended] EF0 scenario extremes reproduce the supplemental oracle', () => {
  const pin = kits['generation-ef0-scenarios'];
  const inputs = scenarioFixtureInputs();
  assert.equal(inputs.length, pin.count);
  assert.equal(
    corpusDigest(inputs.map(observeDigest)),
    pin.corpus,
    'Run EF0 archive replay and --diagnose for first difference',
  );
});
