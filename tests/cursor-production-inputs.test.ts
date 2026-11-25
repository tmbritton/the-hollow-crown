import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyProductionInputs } from './cursor-production-inputs.ts';

test('production input pin uses baseline blobs, not tool HEAD, and rejects drift', async () => {
  const tree = await mkdtemp(join(tmpdir(), 'cursor-inputs-'));
  try {
    await mkdir(join(tree, 'src'));
    const baseline = {
      'index.html': '<html>',
      'package-lock.json': '{}',
      'src/main.ts': '// baseline',
    };
    const blobs = new Map(
      Object.entries(baseline).map(([path, text]) => [
        path,
        createHash('sha1')
          .update(`blob ${Buffer.byteLength(text)}\0${text}`)
          .digest('hex'),
      ]),
    );
    for (const [path, text] of Object.entries(baseline)) await writeFile(join(tree, path), text);
    // The working input directory need not even have a Git HEAD.
    await writeFile(join(tree, 'tool.ts'), '// unrelated tool changes');
    const verify = () => verifyProductionInputs(tree, blobs);
    const inputs = await verify();
    assert.match(inputs['package-lock.json'].sha256, /^[a-f0-9]{64}$/);
    assert.ok(!('tool.ts' in inputs));
    const extra = join(tree, 'src', 'extra.ignored');
    await writeFile(extra, 'extra');
    await assert.rejects(verify(), /unexpected.*src\/extra\.ignored/);
    await rm(extra);
    await writeFile(join(tree, 'index.html'), 'changed');
    await assert.rejects(verify(), /changed.*index\.html/);
    await rm(join(tree, 'index.html'));
    await assert.rejects(verify(), /missing.*index\.html/);
    await symlink(join(tree, 'tool.ts'), join(tree, 'index.html'));
    await assert.rejects(verify(), /not a regular production input: index\.html/);
  } finally {
    await rm(tree, { recursive: true, force: true });
  }
});
