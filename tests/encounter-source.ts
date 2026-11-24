import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedGitEnv } from './git-env.ts';

export const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const gitAt =
  (cwd: string, env = isolatedGitEnv()) =>
  (...args: string[]) =>
    execFileSync('git', args, { cwd, env, maxBuffer: 32 * 1024 * 1024 });
const paths = (bytes: Buffer) => bytes.toString().split('\0').filter(Boolean);
const inputs = [
  'src',
  'tests',
  'public',
  'index.html',
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'tsconfig.json',
];
const envFiles = ['.env', '.env.local', '.env.development', '.env.development.local'];

export async function bindRoot(moduleUrl: string, cwd = process.cwd()) {
  const root = await realpath(resolve(dirname(fileURLToPath(moduleUrl)), '..'));
  if (
    root !== (await realpath(cwd)) ||
    root !== (await realpath(gitAt(cwd)('rev-parse', '--show-toplevel').toString().trim()))
  )
    throw new Error('Executing module, cwd and Git root differ');
  return root;
}

export async function sourceManifest(archive?: string, root = process.cwd()) {
  const git = gitAt(root);
  const head = git('rev-parse', 'HEAD').toString().trim();
  const base = paths(git('ls-tree', '-r', '--name-only', '-z', head, '--', ...inputs));
  const tracked = new Set(
    git('ls-files', '-z', '--cached', '--', ...inputs)
      .toString()
      .split('\0')
      .filter(Boolean),
  );
  const others = git('ls-files', '-z', '--others', '--exclude-standard', '--', ...inputs)
    .toString()
    .split('\0')
    .filter(Boolean);
  const entries = [];
  for (const path of [...new Set([...base, ...tracked, ...others])].sort()) {
    const bytes = await readFile(join(root, path)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    entries.push({ path, sha256: bytes && sha256(bytes) });
    if (archive && bytes && others.includes(path) && !base.includes(path)) {
      const output = join(archive, 'untracked', path);
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, bytes);
    }
  }
  const patch = git('diff', '--binary', 'HEAD', '--', ...inputs);
  if (archive) await writeFile(join(archive, 'working-tree.patch'), patch);
  // Do not copy ignored local env files (possibly credentials); make the visit ineligible.
  const privateInputs = (
    await Promise.all(
      envFiles.map(async (p) => {
        try {
          await lstat(join(root, p));
          return p;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          return null;
        }
      }),
    )
  ).filter(Boolean);
  return {
    head,
    branch: git('branch', '--show-current').toString().trim(),
    status: git('status', '--porcelain=v1', '-uall').toString(),
    digest: sha256(JSON.stringify(entries)),
    entries,
    privateInputs,
    patch: sha256(patch),
  };
}

/** Replay the binary patch against HEAD in a disposable index/object store, never the checkout. */
export async function validateSourceArchive(
  archive: string,
  source: Awaited<ReturnType<typeof sourceManifest>>,
  root = process.cwd(),
) {
  const temp = await mkdtemp('/tmp/opencode/encounter-index-');
  try {
    const patch = resolve(archive, 'working-tree.patch');
    const bytes = await readFile(patch);
    if (
      sha256(bytes) !== source.patch ||
      source.privateInputs.length ||
      !/^[0-9a-f]{40,64}$/.test(source.head)
    )
      return false;
    const env = isolatedGitEnv();
    const objects = gitAt(root, env)('rev-parse', '--path-format=absolute', '--git-path', 'objects')
      .toString()
      .trim();
    await mkdir(join(temp, 'objects'));
    const replay = gitAt(root, {
      ...env,
      GIT_INDEX_FILE: join(temp, 'index'),
      GIT_OBJECT_DIRECTORY: join(temp, 'objects'),
      GIT_ALTERNATE_OBJECT_DIRECTORIES: objects,
    });
    // Do not let core.splitIndex spill shared index files into the source repository.
    const git = (...args: string[]) => replay('-c', 'core.splitIndex=false', ...args);
    git('read-tree', source.head);
    const base = paths(git('ls-files', '-z', '--', ...inputs));
    if (bytes.length) git('apply', '--cached', '--binary', patch);
    const reconstructed = new Map<string, string | null>(base.map((p) => [p, null]));
    for (const row of paths(git('ls-files', '--stage', '-z'))) {
      const match = /^(100644|100755) ([a-f0-9]+) 0\t([^\0]+)$/.exec(row);
      const path = row.slice(row.indexOf('\t') + 1);
      if (!inputs.some((p) => path === p || path.startsWith(`${p}/`))) continue;
      if (!match) return false;
      reconstructed.set(path, sha256(git('cat-file', 'blob', match[2]!)));
    }
    const untracked = join(archive, 'untracked');
    const walk = async (dir: string, prefix = ''): Promise<void> => {
      for (const child of await readdir(dir, { withFileTypes: true })) {
        const path = `${prefix}${child.name}`,
          absolute = join(dir, child.name);
        if (child.isDirectory()) await walk(absolute, `${path}/`);
        else {
          if (
            !child.isFile() ||
            reconstructed.has(path) ||
            !inputs.some((p) => path === p || path.startsWith(`${p}/`))
          )
            throw new Error(`Unexpected untracked input: ${path}`);
          reconstructed.set(path, sha256(await readFile(absolute)));
        }
      }
    };
    if (await lstat(untracked).catch(() => null)) await walk(untracked);
    const entries = [...reconstructed.keys()]
      .sort()
      .map((path) => ({ path, sha256: reconstructed.get(path) }));
    return (
      JSON.stringify(entries) === JSON.stringify(source.entries) &&
      sha256(JSON.stringify(entries)) === source.digest
    );
  } catch {
    return false;
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
