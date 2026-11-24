// Run once from a disposable copy of the reviewed root-import candidate (not the worktree).
// Retain public subpaths iff both rank-10 medians of 20 meet the original lane ceilings.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, release } from 'node:os';

assert.equal(process.cwd().split('/').at(-1), 'ef4-startup-scratch');
for (const flag of ['NODE_OPTIONS', 'NODE_COMPILE_CACHE']) assert.ok(!process.env[flag], flag);
const names = ['diagnostics', 'pipeline', 'run'];
const paths = names.map((name) => `src/generation/${name}.ts`);
const root = paths.map((path) => readFileSync(path, 'utf8'));
const subpaths = root.map((source) =>
  source.replace(/import \{ (\w+(?:, \w+)*) \} from 'effect';/, (_, names) =>
    names.split(', ').map((name) => `import * as ${name} from 'effect/${name}';`).join('\n'),
  ),
);
assert.ok(root.every((source, i) => source !== subpaths[i]));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const arms = { root, subpaths };
const lanes = {
  cold: {
    ceiling: 224.919097,
    args: ['--input-type=module', '-e', 'const start = performance.now(); await import("./src/world.ts"); console.log(performance.now() - start)'],
  },
  native: { ceiling: 469.3455785, args: ['--test', 'tests/fixtures/ef0-import.test.ts'] },
};
const start = new Date().toISOString();
const startLoad = loadavg();
const runs = [];
try {
  for (const [lane, { args }] of Object.entries(lanes)) {
    for (let i = 0; i < 20; i++) {
      for (const arm of i % 2 ? ['subpaths', 'root'] : ['root', 'subpaths']) {
        paths.forEach((path, j) => writeFileSync(path, arms[arm][j]));
        const begin = performance.now();
        const child = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 120_000 });
        const elapsed = performance.now() - begin;
        assert.equal(child.status, 0, child.stderr || String(child.error));
        const ms = lane === 'cold' ? Number(child.stdout.trim()) : elapsed;
        assert.ok(Number.isFinite(ms) && ms > 0);
        runs.push({ lane, arm, pair: i + 1, ms, load: loadavg() });
      }
    }
  }
} finally {
  paths.forEach((path, j) => writeFileSync(path, root[j]));
  const summary = Object.fromEntries(Object.entries(lanes).map(([lane, { ceiling }]) => [lane,
    Object.fromEntries(Object.keys(arms).map((arm) => {
      const samples = runs.filter((r) => r.lane === lane && r.arm === arm).map((r) => r.ms).sort((a, b) => a - b);
      const median = samples[9];
      return [arm, { count: samples.length, min: samples[0], median, max: samples.at(-1), ceiling, within: median <= ceiling && samples.length === 20 }];
    })),
  ]));
  console.log(JSON.stringify({ start, end: new Date().toISOString(), startLoad, endLoad: loadavg(),
    cwd: process.cwd(), node: process.version, cpu: cpus()[0].model, kernel: release(), lanes,
    fixture: hash(readFileSync('tests/fixtures/ef0-import.test.ts')),
    lock: hash(readFileSync('package-lock.json')),
    imports: Object.fromEntries(Object.entries(arms).map(([arm, sources]) => [arm,
      Object.fromEntries(paths.map((path, i) => [path, hash(sources[i])])),
    ])), summary, runs,
  }, null, 2));
}
