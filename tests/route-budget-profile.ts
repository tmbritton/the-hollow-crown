import { build } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import type * as Fixture from './route-budget-fixture.ts';
declare const fixture: typeof Fixture;
const output = await build({
  configFile: false,
  logLevel: 'error',
  build: {
    write: false,
    lib: { entry: 'tests/route-budget-fixture.ts', name: 'fixture', formats: ['iife'] },
  },
});
const files = Array.isArray(output) ? output : [output];
const bundle = files
  .flatMap((o) => ('output' in o ? o.output : []))
  .find((x) => x.type === 'chunk');
if (!bundle || bundle.type !== 'chunk') throw Error('missing production fixture');
const b = await chromium.launch({ args: ['--no-sandbox'] });
try {
  const p = await b.newPage();
  await p.addScriptTag({ content: bundle.code });
  const rows = [];
  for (const seed of ['MOURNING-731', 'CINDER-42', 'VIOLET-7']) {
    const batch = await p.evaluate((s) => fixture.burst(s), seed);
    rows.push({ seed, batch });
    const ms = batch.flatMap((r) => r.chunks).sort((a, b) => a - b);
    console.log(seed, {
      sync: batch.map((r) => r.sync),
      p95: ms[Math.ceil(0.95 * ms.length) - 1],
      max: ms.at(-1),
      latency: batch[0].latency,
      shortBurstMax: Math.max(...batch.flatMap((r) => r.small.chunks)),
      shortImmediate: batch[0].small.immediate,
    });
  }
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/route-budget-burst.json', JSON.stringify(rows));
} finally {
  await b.close();
}
