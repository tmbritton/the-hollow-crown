import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceManifest, validateSourceArchive, bindRoot } from './encounter-source.ts';
import { isolatedGitEnv } from './git-env.ts';

const reconstruction = 'source reconstruction checks deleted, binary and untracked inputs';

test(reconstruction, async () => {
  const root = await mkdtemp('/tmp/opencode/encounter-fixture-');
  try {
    const env = isolatedGitEnv();
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, env });
    git('clone', '-q', '--shared', fileURLToPath(new URL('..', import.meta.url)), '.');
    await mkdir(join(root, 'archive'));
    await rm(join(root, 'src/gameTypes.ts'));
    await writeFile(join(root, 'src/attackKinds.ts'), Buffer.from([0, 3, 4]));
    await writeFile(join(root, 'src/new'), 'untracked');
    const archive = join(root, 'archive');
    const source = await sourceManifest(archive, root);
    assert.equal(source.entries.find((e) => e.path === 'src/gameTypes.ts')?.sha256, null);
    assert.equal(await validateSourceArchive(archive, source, root), true);
    await writeFile(join(archive, 'untracked/src/new'), 'tampered');
    assert.equal(await validateSourceArchive(archive, source, root), false);
    await assert.rejects(bindRoot(import.meta.url, root), /root/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('source fixture preserves a staged tree inherited from a pre-commit hook', async (t) => {
  const root = await mkdtemp('/tmp/opencode/encounter-hook-');
  t.after(() => rm(root, { recursive: true, force: true }));
  const index = join(root, 'hook-index');
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_') && k !== 'NODE_TEST_CONTEXT'),
  );
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, env: { ...env, GIT_INDEX_FILE: index } });
  git('init', '-q');
  await writeFile(join(root, 'sentinel'), 'staged by the caller, not by its fixture clone\n');
  const blob = git('hash-object', '-w', 'sentinel').toString().trim();
  git('update-index', '--add', '--cacheinfo', `100644,${blob},sentinel`);
  const tree = git('write-tree').toString().trim();
  const bytes = await readFile(index);
  const child = spawnSync(
    process.execPath,
    [
      '--test',
      '--test-reporter=tap',
      `--test-name-pattern=^${reconstruction}$`,
      fileURLToPath(import.meta.url),
    ],
    { env: { ...env, GIT_INDEX_FILE: index }, encoding: 'utf8', timeout: 30_000 },
  );
  assert.ifError(child.error);
  assert.ok(
    (await readFile(index)).equals(bytes),
    `hook index was rewritten (exit ${child.status})`,
  );
  assert.equal(git('write-tree').toString().trim(), tree, 'staged tree changed');
  assert.equal(child.status, 0, child.stdout + child.stderr);
  assert.match(child.stdout, /^# pass 1$/m, 'the reconstruction test must actually run');
});
