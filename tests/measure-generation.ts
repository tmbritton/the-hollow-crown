import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { Session } from 'node:inspector/promises';
import type { HeapProfiler } from 'node:inspector';
import { loadavg } from 'node:os';
import { gzipSync } from 'node:zlib';

const seeds = ['MOURNING-731', 'trial-23', 'trial-27', 'ember-70', 'tribute-12'];
// Node 22's declarations omit these CDP fields, present in the protocol at runtime.
interface SampleNode extends HeapProfiler.SamplingHeapProfileNode {
  id: number;
  children: SampleNode[];
}
interface SampleProfile extends HeapProfiler.SamplingHeapProfile {
  head: SampleNode;
  samples: { nodeId: number; size: number }[];
}
const quantile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const time = (run: () => void) => {
  const start = performance.now();
  run();
  return performance.now() - start;
};
function child(args: string[]) {
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 120_000 });
  if (result.status !== 0) throw new Error(result.stderr, { cause: result.error });
  return result.stdout;
}

async function batch() {
  const { generateDungeon } = await import('../src/world.ts');
  for (let cycle = 0; cycle < 2; cycle++) for (const seed of seeds) generateDungeon(seed);
  const samples = seeds.map((): number[] => []);
  for (let cycle = 0; cycle < 10; cycle++)
    seeds.forEach((seed, i) =>
      samples[i].push(
        time(() => {
          generateDungeon(seed);
        }),
      ),
    );
  const session = new Session();
  session.connect();
  const allocations = [];
  try {
    for (const seed of seeds) {
      await session.post('HeapProfiler.startSampling', {
        samplingInterval: 32768,
        includeObjectsCollectedByMajorGC: true,
        includeObjectsCollectedByMinorGC: true,
      });
      for (let i = 0; i < 10; i++) generateDungeon(seed);
      const { profile } = await session.post('HeapProfiler.stopSampling');
      const sampled = profile as SampleProfile;
      const ids = new Set<number>();
      function visit(node: SampleNode, generating: boolean) {
        generating ||= node.callFrame.functionName === 'generateDungeon';
        if (generating) ids.add(node.id);
        for (const child of node.children) visit(child, generating);
      }
      visit(sampled.head, false);
      const alloc = sampled.samples.filter((sample) => ids.has(sample.nodeId));
      if (!alloc.length) throw new Error(`No attributed allocation samples for ${seed}`);
      allocations.push({
        bytes: alloc.reduce((sum, sample) => sum + sample.size, 0),
        count: alloc.length,
        worlds: 10,
      });
    }
  } finally {
    session.disconnect();
  }
  return { samples, allocations, load: loadavg() };
}

if (process.argv[2] === 'batch') {
  console.log(JSON.stringify(await batch()));
} else if (process.argv[2] === 'assets') {
  const files = readdirSync('dist', { recursive: true, encoding: 'utf8', withFileTypes: true })
    .filter((file) => file.isFile())
    .map((file) => {
      const path = `${file.parentPath}/${file.name}`;
      const bytes = readFileSync(path);
      return { path, raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  const sum = (rows: typeof files) => ({
    raw: rows.reduce((n, row) => n + row.raw, 0),
    gzip: rows.reduce((n, row) => n + row.gzip, 0),
  });
  const html = readFileSync('dist/index.html', 'utf8');
  const js = files.filter(({ path }) => path.endsWith('.js'));
  console.log(
    JSON.stringify(
      {
        js: sum(js),
        initial: sum(js.filter(({ path }) => html.includes(path.slice(4)))),
        total: sum(files),
        files,
      },
      null,
      2,
    ),
  );
} else {
  const startLoad = loadavg();
  const repeats: Awaited<ReturnType<typeof batch>>[] = Array.from({ length: 5 }, () =>
    JSON.parse(child([import.meta.filename, 'batch'])),
  );
  const cold = Array.from({ length: 20 }, () =>
    Number(
      child([
        '--input-type=module',
        '-e',
        'const start = performance.now(); await import("./src/world.ts"); console.log(performance.now() - start)',
      ]),
    ),
  );
  const native = Array.from({ length: 20 }, () =>
    time(() => {
      child(['--test', 'tests/fixtures/ef0-import.test.ts']);
    }),
  );
  console.log(
    JSON.stringify(
      {
        node: process.version,
        startLoad,
        load: loadavg(),
        seeds,
        repeats,
        cold,
        native,
        summary: {
          cold: quantile(cold, 0.5),
          native: quantile(native, 0.5),
          generation: seeds.map((seed, i) => ({
            seed,
            median: quantile(
              repeats.map((r) => quantile(r.samples[i], 0.5)),
              0.5,
            ),
            p95: quantile(
              repeats.map((r) => quantile(r.samples[i], 0.95)),
              0.5,
            ),
            bytes:
              repeats.reduce((n, r) => n + r.allocations[i].bytes, 0) /
              repeats.reduce((n, r) => n + r.allocations[i].worlds, 0),
          })),
        },
      },
      null,
      2,
    ),
  );
}
