import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

test('diagnostic build emits CSS without loading an external PostCSS config', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cursor-build-'));
  const repo = import.meta.dirname + '/..';
  try {
    await mkdir(join(root, 'tests'));
    await Promise.all([
      cp(join(repo, 'src'), join(root, 'src'), { recursive: true }),
      cp(join(repo, 'index.html'), join(root, 'index.html')),
      cp(join(repo, 'package.json'), join(root, 'package.json')),
      symlink(join(repo, 'node_modules'), join(root, 'node_modules'), 'junction'),
      writeFile(
        join(root, 'postcss.config.cjs'),
        'throw new Error("external PostCSS sentinel was loaded");\n',
      ),
    ]);
    for (const file of await readdir(join(repo, 'tests'))) {
      if (file.startsWith('cursor-') && file.endsWith('.ts') && !file.endsWith('.test.ts'))
        await cp(join(repo, 'tests', file), join(root, 'tests', file));
    }
    await promisify(execFile)(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import assert from 'node:assert/strict';
         import { buildDiagnostic } from './tests/cursor-attribution-build.ts';
         import { sourceWriterControls } from './tests/cursor-source-writer-controls.ts';
         const sources = await buildDiagnostic('bundle');
         assert.ok(sources['interactions.ts']?.includes("epWrite('door'"));
         assert.ok(sources['main.ts'].includes('ep.fixed('));
         assert.ok(sources['observation.ts']?.includes('epThin(mesh, active,'));
         assert.ok(sources['bindings.ts']?.includes("epPose('pose'"));
         sourceWriterControls(sources);`,
      ],
      { cwd: root, env: { ...process.env, NODE_ENV: 'production' }, timeout: 60_000 },
    );
    assert.ok(
      (await readdir(join(root, 'bundle', 'assets'))).some((file) => file.endsWith('.css')),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
