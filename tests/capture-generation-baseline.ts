import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  captureEnvironment,
  coreDigests,
  corpusDigest,
  ef0Lock,
  ef0Revision,
  fixtureInputs,
  kits,
  scenarioFixtureInputs,
  serializerVersion,
  sha,
  type KitName,
} from './ef0-contract.ts';
import {
  digest,
  materialize,
  newOutput,
  openEvidence,
  verifyArchive,
  verifyCaptureEnvironment,
  verifyKit,
  verifyToolRoot,
  type ArchiveIdentity,
} from './ef0-replay.ts';

const tools = [
  'capture-generation-baseline.ts',
  'ef0-contract.ts',
  'ef0-replay.ts',
  'generation-fixtures.ts',
];
const mainRoot = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const original = 'test-results/ef-checkpoint/original/tests/fixtures';
const names = Object.keys(kits) as KitName[];
const inputs = (name: KitName) =>
  name === 'generation-ef0' ? fixtureInputs() : scenarioFixtureInputs();
type Entry = { input: ReturnType<typeof fixtureInputs>[number]; file: string; sha256: string };

function readVerifiedKit(path: string, name: KitName) {
  verifyKit(path, kits[name]);
  const manifest: { entries: Entry[] } = JSON.parse(
    readFileSync(join(path, 'manifest.json'), 'utf8'),
  );
  assert.deepEqual(
    manifest.entries.map(({ input }) => input),
    inputs(name),
  );
  assert.equal(manifest.entries.length, kits[name].count);
  const leaves = manifest.entries.map((entry) => {
    const bytes = gunzipSync(readFileSync(join(path, entry.file)));
    assert.equal(sha(bytes), entry.sha256);
    return entry;
  });
  assert.equal(corpusDigest(leaves), kits[name].corpus);
  if (name === 'generation-ef0')
    assert.deepEqual(
      leaves.filter(({ input }) => input.core).map(({ sha256 }) => sha256),
      coreDigests,
    );
  return leaves;
}

async function capture(identityFile: string) {
  assert.equal(realpathSync(process.cwd()), mainRoot, 'Wrong archive cwd');
  const identity: ArchiveIdentity = JSON.parse(readFileSync(identityFile, 'utf8'));
  verifyArchive(mainRoot, identity, ef0Revision, ef0Lock);
  const { CONTENT_VERSION, GENERATOR_VERSION, MAX_GENERATION_ATTEMPTS, SCENARIO_VERSION } =
    await import('../src/generation/identity.ts');
  const { canonical, observe } = await import('./generation-fixtures.ts');
  for (const name of names) {
    openEvidence(name);
    const entries = inputs(name).map((input, i) => {
      const output = observe(input);
      const bytes = canonical(output);
      const file = `${i}.json.gz`;
      writeFileSync(join(name, file), gzipSync(bytes, { level: captureEnvironment.level }), {
        flag: 'wx',
      });
      return { input, file, sha256: sha(bytes), outcome: output.error?.report ?? output.trace };
    });
    writeFileSync(
      join(name, 'manifest.json'),
      JSON.stringify(
        {
          sourceRevision: identity.revision,
          sourceHashes: identity.hashes,
          generatorVersion: GENERATOR_VERSION,
          contentVersion: CONTENT_VERSION,
          scenarioVersion: SCENARIO_VERSION,
          defaultMaxAttempts: MAX_GENERATION_ATTEMPTS,
          node: process.version,
          serializerVersion,
          entries,
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx' },
    );
  }
}

async function diagnose(base: string) {
  const { canonical, observe, firstDifference } = await import('./generation-fixtures.ts');
  for (const name of names) {
    const path = join(base, name);
    for (const { input, file } of readVerifiedKit(path, name)) {
      const expected = gunzipSync(readFileSync(join(path, file))).toString('utf8');
      const actual = canonical(observe(input));
      assert.ok(
        actual === expected,
        `${input.seed} ${JSON.stringify(input.options)}: first canonical difference at ${actual === expected ? '' : firstDifference(JSON.parse(expected), JSON.parse(actual))}`,
      );
    }
  }
  console.log('Candidate matches both historical kits byte for byte');
}

function replay(name: string) {
  assert.equal(
    execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
    captureEnvironment.npm,
    'Use pinned npm',
  );
  const target = newOutput(name);
  const identity = materialize(target, 'base', ef0Revision, ef0Lock);
  const identityFile = join(target, 'archive.json');
  writeFileSync(identityFile, JSON.stringify(identity, null, 2) + '\n', { flag: 'wx' });
  for (const file of tools) {
    const source = join('tests', file);
    const dest = join(identity.root, source);
    writeFileSync(dest, readFileSync(source), { flag: 'wx' });
    assert.equal(digest(dest), digest(source));
  }
  execFileSync(
    process.execPath,
    ['tests/capture-generation-baseline.ts', '--archive', identityFile],
    { cwd: identity.root, stdio: 'inherit' },
  );
  for (const kit of names) {
    const path = join(identity.root, kit);
    readVerifiedKit(path, kit);
    if (existsSync(original))
      execFileSync('diff', ['-qr', join(original, kit), path], { stdio: 'inherit' });
    console.log(`Verified ${kit}: ${path}`);
  }
}

if (import.meta.main) {
  const [arg, path, ...extra] = process.argv.slice(2);
  assert.ok(
    arg && !extra.length,
    'Usage: node tests/capture-generation-baseline.ts NEW_NAME | --diagnose REPLAY_BASE',
  );
  if (arg === '--archive' && path) {
    verifyCaptureEnvironment();
    // Only the private child of replay writes in an ignored, git-free archive.
    assert.equal(basename(mainRoot), 'base');
    assert.equal(basename(dirname(dirname(mainRoot))), 'test-results');
    assert.match(basename(dirname(mainRoot)), /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
    assert.equal(path, join(mainRoot, '..', 'archive.json'));
    await capture(path);
  } else {
    verifyToolRoot(mainRoot);
    verifyCaptureEnvironment();
    if (arg === '--diagnose' && path) await diagnose(path);
    else if (!path) replay(arg);
    else throw Error('Supply one new capture basename');
  }
}
