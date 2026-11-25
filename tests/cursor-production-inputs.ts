import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const productionBaseline = '3a357535b5e350c8a5ce37483b84d39d22dd9512';
export const productionPaths = [
  'index.html',
  'package.json',
  'package-lock.json',
  'src',
  'tsconfig.json',
  'vite.config.ts',
];
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' });

// Git supplies the reference manifest only. Enumerate and hash the actual build roots,
// even ignored files, without consulting HEAD, the index, or Git's clean/smudge filters.
export async function pinProductionInputs(root = '.') {
  const tree = git('rev-parse', `${productionBaseline}^{tree}`).trim();
  const roots = [...productionPaths, 'public'];
  const expected = new Map<string, string>();
  for (const entry of git('ls-tree', '-rz', tree, '--', ...roots)
    .split('\0')
    .filter(Boolean)) {
    const match = /^100(?:644|755) blob ([a-f0-9]{40})\t(.+)$/s.exec(entry);
    if (!match) throw new Error(`unsupported baseline production input: ${entry}`);
    expected.set(match[2], match[1]);
  }
  return { commit: productionBaseline, tree, inputs: await verifyProductionInputs(root, expected) };
}

export async function verifyProductionInputs(root: string, expected: ReadonlyMap<string, string>) {
  const actual = new Map<string, { blob: string; sha256: string }>();
  async function visit(path: string) {
    const full = join(root, path);
    const stat = await lstat(full).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (!stat) return;
    if (stat.isDirectory()) {
      if (![...expected.keys()].some((name) => name.startsWith(`${path}/`)))
        throw new Error(`unexpected production directory: ${path}`);
      for (const name of await readdir(full)) await visit(`${path}/${name}`);
      return;
    }
    const blob = expected.get(path);
    if (!blob) throw new Error(`unexpected production input: ${path}`);
    if (!stat.isFile()) throw new Error(`not a regular production input: ${path}`);
    const bytes = await readFile(full);
    if (createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== blob)
      throw new Error(`changed production input: ${path}`);
    actual.set(path, { blob, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  for (const path of [...productionPaths, 'public']) await visit(path);
  for (const path of expected.keys())
    if (!actual.has(path)) throw new Error(`missing production input: ${path}`);
  return Object.fromEntries([...actual].sort(([a], [b]) => a.localeCompare(b)));
}
