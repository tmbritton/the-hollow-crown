import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  readlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { captureEnvironment, framedDigest, sha } from './ef0-contract.ts';

export const byteOrder = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
export const digest = (path: string) => sha(readFileSync(path));
const sourcePaths = ['src', 'package.json', 'package-lock.json'];
export const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function inventory(root: string, path = '', links = false): [string, string][] {
  const absolute = join(root, path);
  const stat = lstatSync(absolute);
  if (stat.isDirectory()) {
    const children = readdirSync(absolute);
    assert.ok(links || !path || children.length, `Unexpected empty directory ${path}`);
    return children.flatMap((name) => inventory(root, join(path, name), links));
  }
  if (links && stat.isSymbolicLink()) {
    const target = relative(root, realpathSync(absolute));
    assert.ok(target && target !== '..' && !target.startsWith('../'), `External link ${path}`);
    return [[path, sha('link:' + readlinkSync(absolute))]];
  }
  assert.ok(stat.isFile(), `Not a regular file: ${path}`);
  return [[path, digest(absolute)]];
}
const ordered = (files: [string, string][]) => files.sort(([a], [b]) => byteOrder(a, b));
export const dependencyHash = (root: string) =>
  framedDigest(ordered(inventory(root, 'node_modules', true)));
export const openEvidence = (path: string) => mkdirSync(path);
export const writeOnce = (path: string, data: string) => writeFileSync(path, data, { flag: 'wx' });

export function newOutput(name: string) {
  assert.match(name, /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, 'Supply a new basename under test-results');
  const base = resolve('test-results');
  if (!existsSync(base)) mkdirSync(base);
  assert.equal(realpathSync(base), base, 'test-results must not be a symlink');
  const out = join(base, name);
  openEvidence(out);
  return out;
}

export function verifyKit(root: string, pin: { manifest: string; tree: string }) {
  const file = join(root, 'manifest.json');
  assert.ok(lstatSync(file).isFile(), 'Not a regular manifest');
  assert.equal(digest(file), pin.manifest, `Wrong manifest bytes: ${root}`);
  assert.equal(framedDigest(ordered(inventory(root))), pin.tree, `Wrong compressed tree: ${root}`);
}

export type ArchiveIdentity = { root: string; revision: string; hashes: Record<string, string> };
export function verifyArchive(
  root: string,
  identity: ArchiveIdentity,
  revision: string,
  lock: string,
) {
  assert.equal(realpathSync(root), identity.root, 'Wrong archive root');
  assert.ok(!existsSync(join(root, '.git')), 'Expected a .git-free archive');
  assert.equal(identity.revision, revision, 'Wrong archive revision');
  assert.equal(identity.hashes['package-lock.json'], lock, 'Wrong archive lock pin');
  const actual = Object.fromEntries(sourcePaths.flatMap((path) => inventory(root, path)));
  assert.deepEqual(
    Object.keys(actual).sort(byteOrder),
    Object.keys(identity.hashes).sort(byteOrder),
    'Wrong archive paths',
  );
  assert.deepEqual(actual, identity.hashes, 'Wrong archive source bytes');
}

export function identifyArchive(root: string, revision: string, lock: string): ArchiveIdentity {
  const rows = git('ls-tree', '-rz', revision, '--', ...sourcePaths)
    .split('\0')
    .filter(Boolean);
  assert.ok(rows.length, `Missing source tree for ${revision}`);
  const hashes = Object.fromEntries(
    rows.map((row) => {
      const match = /^(?:100644|100755) blob ([0-9a-f]{40})\t(.+)$/.exec(row);
      assert.ok(match, `Unexpected Git tree entry: ${row}`);
      const [, oid, path] = match;
      const bytes = readFileSync(join(root, path));
      const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      assert.equal(blob, oid, `Archive did not extract pinned Git blob: ${path}`);
      return [path, sha(bytes)];
    }),
  );
  const identity = { root: realpathSync(root), revision, hashes };
  verifyArchive(root, identity, revision, lock);
  return identity;
}

export function materialize(parent: string, name: string, revision: string, lock: string) {
  assert.match(revision, /^[0-9a-f]{40}$/);
  try {
    git('cat-file', '-e', `${revision}^{commit}`);
  } catch {
    throw Error(`Missing local commit ${revision}; fetch the pinned revision before replay`);
  }
  const root = join(parent, name);
  openEvidence(root);
  execFileSync(
    'bash',
    ['-o', 'pipefail', '-c', 'git archive "$1" | tar -x -C "$2"', 'archive', revision, root],
    { stdio: 'inherit' },
  );
  const identity = identifyArchive(root, revision, lock);
  const install = spawnSync('npm', ['ci', '--ignore-scripts', '--offline'], {
    cwd: root,
    stdio: 'inherit',
  });
  assert.ok(
    !install.error && install.status === 0,
    `Offline npm ci failed for ${revision}; prime the cache for lock ${lock}`,
  );
  return identity;
}

export function verifyToolRoot(root: string) {
  assert.equal(
    realpathSync(process.cwd()),
    root,
    'Run from the repository root containing this script',
  );
  assert.equal(realpathSync(git('rev-parse', '--show-toplevel')), root, 'Wrong Git root');
  assert.equal(
    dirname(git('rev-parse', '--path-format=absolute', '--git-common-dir')),
    root,
    'Use the main checkout',
  );
  assert.equal(git('branch', '--show-current'), 'main', 'Use branch main');
}

export function verifyCaptureEnvironment() {
  assert.equal(process.version, captureEnvironment.node, 'Use the pinned Node build');
  assert.equal(process.versions.zlib, captureEnvironment.zlib, 'Use the pinned compression build');
  assert.ok(
    !process.env.NODE_OPTIONS && !process.env.NODE_COMPILE_CACHE && !process.execArgv.length,
    'Use plain Node without flags or compile cache',
  );
}
