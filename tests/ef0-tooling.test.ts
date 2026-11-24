import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { openEvidence, verifyArchive, verifyKit } from './ef0-replay.ts';
import { claimAttempt, validatePower } from './measure-generation-paired.ts';
import { ef0Revision, sha } from './ef0-contract.ts';

test('archive verifies root, revision, exact paths and source bytes without Git', (t) => {
  const root = scratch(t);
  mkdirSync(join(root, 'src'));
  for (const file of ['package.json', 'package-lock.json', 'src/a.ts'])
    writeFileSync(join(root, file), file);
  const hashes = Object.fromEntries(
    ['package.json', 'package-lock.json', 'src/a.ts'].map((file) => [file, sha(file)]),
  );
  const identity = { root, revision: ef0Revision, hashes };
  verifyArchive(root, identity, ef0Revision, hashes['package-lock.json']);
  assert.throws(
    () =>
      verifyArchive(
        root,
        { ...identity, revision: 'wrong' },
        ef0Revision,
        hashes['package-lock.json'],
      ),
    /revision/,
  );
  assert.throws(
    () =>
      verifyArchive(
        root,
        { ...identity, root: join(root, 'foreign') },
        ef0Revision,
        hashes['package-lock.json'],
      ),
    /root/,
  );
  writeFileSync(join(root, 'src/b.ts'), 'extra');
  assert.throws(
    () => verifyArchive(root, identity, ef0Revision, hashes['package-lock.json']),
    /paths/,
  );
});

test('kit verification pins manifest bytes and compressed tree and never overwrites', (t) => {
  const root = scratch(t);
  const dir = join(root, 'kit');
  openEvidence(dir);
  writeFileSync(join(dir, 'manifest.json'), '{}\n');
  writeFileSync(join(dir, 'x.gz'), 'gzip');
  const pin = {
    manifest: sha('{}\n'),
    tree: 'ba55a3ae501ca6d8c764c3c612ab38fa1a5b582a899523f2bcb960ccc42758f7',
  };
  verifyKit(dir, pin);
  assert.throws(() => openEvidence(dir), /EEXIST/);
  writeFileSync(join(dir, 'manifest.json'), '{}');
  assert.throws(() => verifyKit(dir, pin), /manifest/);
  writeFileSync(join(dir, 'manifest.json'), '{}\n');
  writeFileSync(join(dir, 'x.gz'), 'Gzip');
  assert.throws(() => verifyKit(dir, pin), /tree/);
  writeFileSync(join(dir, 'x.gz'), 'gzip');
  writeFileSync(join(dir, 'extra'), '');
  assert.throws(() => verifyKit(dir, pin), /tree/);
});

test('an exclusive attempt marker cannot be replaced even after a failed collection', (t) => {
  const dir = scratch(t);
  const first = { manifest: 'first', start: 100, binary: 'node hash', nodePath: '/node' };
  claimAttempt(dir, first);
  assert.throws(() => claimAttempt(dir, { ...first, start: 101 }), /EEXIST/);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'attempt.json'), 'utf8')), first);
});

test('archived CPU power metadata cannot be absent or empty', () => {
  assert.throws(() => validatePower(undefined), /power telemetry/);
  const value = {
    boot: 'aaaa0000-aaaa-0000-aaaa-aaaaaaaaaaaa',
    boost: '1',
    policies: [] as string[][],
  };
  assert.throws(() => validatePower(value), /power telemetry/);
  validatePower({ ...value, policies: [['policy0', 'acpi-cpufreq', 'schedutil', '1000', '2000']] });
});

const pathFromTest = (path: string) => fileURLToPath(new URL(path, import.meta.url));

function scratch(t: TestContext) {
  const parent = pathFromTest('../test-results');
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, 'ef0-tooling-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('EF0 capture rejects a foreign Git cwd before creating its destination', (t) => {
  const cwd = scratch(t);
  const target = join(cwd, 'test-results', 'capture');
  const result = spawnSync(
    process.execPath,
    [pathFromTest('./capture-generation-baseline.ts'), 'capture'],
    { cwd, encoding: 'utf8', timeout: 30_000 },
  );
  assert.ifError(result.error);
  assert.equal(existsSync(target), false, 'foreign invocation created a destination');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Run from the repository root containing this script/);
});

const shim = `#!/bin/bash
case \${0##*/} in
  timeout) shift; exec "$@" ;;
  npm)
    case "$*" in
      "--prefix $BASE run build") label=base-build ;;
      "--prefix $PROBE run build") label=effect-root-build ;;
      "--prefix $PROBE run build:pages") label=effect-pages-build ;;
      "--prefix $BASE run report:generation") label=corpus ;;
      *) label=other-npm ;;
    esac ;;
  python) label=vite-$3 ;; # owned-vite.py, mode, port
  node)
    case "$*" in
      'tests/measure-generation.ts assets') label=assets ;;
      *) label=other-node ;;
    esac ;;
esac
printf '%s\\n' "$label" >> "$CALLS"
if [[ $label == "$FAIL_CHECK" ]]; then exit 42; fi
`;

const buildChecks = [
  { build: 'base-build', dependent: 'production', call: 'vite-5497' },
  { build: 'effect-root-build', dependent: 'effect-root', call: 'vite-5498' },
  { build: 'effect-pages-build', dependent: 'effect-pages', call: 'vite-5499' },
];

for (const failure of ['', 'vite-5491', ...buildChecks.map(({ build }) => build)]) {
  test(`EF0 reference runner with ${failure || 'no'} simulated failure`, (t) => {
    const cwd = scratch(t);
    const base = join(cwd, 'base');
    const probe = join(cwd, 'probe');
    const bin = join(cwd, 'bin');
    const output = join(cwd, 'output');
    const callsPath = join(cwd, 'calls');
    for (const root of [base, probe]) {
      mkdirSync(join(root, 'dist'), { recursive: true });
      writeFileSync(join(root, 'dist', 'index.html'), 'pre-existing build');
    }
    mkdirSync(bin);
    for (const name of ['node', 'npm', 'python', 'timeout']) {
      writeFileSync(join(bin, name), shim, { mode: 0o755 });
    }

    const result = spawnSync(
      'bash',
      [pathFromTest('../docs/ef0-evidence/run-reference-checks.sh')],
      {
        cwd,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          SOURCE: pathFromTest('..'),
          BASE: base,
          PROBE: probe,
          OUTPUT: output,
          CALLS: callsPath,
          FAIL_CHECK: failure,
        },
        encoding: 'utf8',
        timeout: 10_000,
      },
    );

    assert.ifError(result.error);
    const statuses = readFileSync(join(output, 'check-status.txt'), 'utf8').trim().split('\n');
    const calls = readFileSync(callsPath, 'utf8').trim().split('\n');
    for (const { build, dependent, call } of buildChecks) {
      const failed = failure === build;
      assert.ok(statuses.includes(`${build} ${failed ? 42 : 0}`));
      assert.equal(calls.includes(call), !failed, `${dependent} dispatch after ${build}`);
      assert.ok(statuses.includes(`${dependent} ${failed ? `SKIP (${build} failed)` : '0'}`));
    }
    assert.equal(calls.includes('assets'), failure !== 'base-build');
    assert.ok(
      statuses.includes(`assets ${failure === 'base-build' ? 'SKIP (base-build failed)' : '0'}`),
    );
    assert.ok(statuses.includes(`generation ${failure === 'vite-5491' ? 42 : 0}`));
    assert.equal(calls.at(-1), 'corpus', 'independent checks did not run to completion');
    assert.equal(statuses.at(-1), 'corpus 0');
    assert.equal(result.status, failure ? 1 : 0, result.stderr);
  });
}
