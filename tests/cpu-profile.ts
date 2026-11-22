import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, loadavg, platform, totalmem, freemem } from 'node:os';
import { withViteServer } from './testServer.ts';
import { distribution, fingerprint, rendererKind } from '../src/cpuMetrics.ts';
import type { CpuSample, CpuMetrics } from '../src/cpuMetrics.ts';
import type { CpuMode, CpuProfile } from '../src/cpuProfile.ts';
import type { DebugWindow } from './browserTypes.ts';
import { cpuCases, CPU_RECIPE_VERSION } from './cpu-cases.ts';
declare const window: DebugWindow;

// A standalone harness: CPU1+ can compare reports without mixing different source/workload identities.
const readPin = async () => {
  if (!process.env.CPU_REPLAY) return null;
  const value: unknown = JSON.parse(await readFile(process.env.CPU_REPLAY, 'utf8'));
  assert.ok(
    value && typeof value === 'object' && 'name' in value && typeof value.name === 'string',
  );
  assert.ok('identity' in value && value.identity && typeof value.identity === 'object');
  const identity = value.identity;
  assert.ok('sourceHash' in identity && typeof identity.sourceHash === 'string');
  assert.ok(
    'recipe' in identity &&
      identity.recipe === CPU_RECIPE_VERSION &&
      'seed' in identity &&
      identity.seed === 'MOURNING-731',
  );
  assert.ok('request' in value && value.request && typeof value.request === 'object');
  const request = value.request;
  assert.ok(
    'input' in request &&
      request.input &&
      typeof request.input === 'object' &&
      'id' in request.input,
  );
  assert.ok(typeof request.input.id === 'number' && Number.isInteger(request.input.id));
  assert.ok('output' in request && request.output && typeof request.output === 'object');
  return {
    name: value.name,
    id: request.input.id,
    input: request.input,
    output: request.output,
    sourceHash: identity.sourceHash,
  };
};
const replay = await readPin();
const cases = replay
  ? [replay.name]
  : process.env.CPU_CASES === 'all'
    ? [...cpuCases]
    : (process.env.CPU_CASES ?? 'entrance,stable,hitch').split(',');
const repeats = Number(process.env.CPU_REPEATS ?? (replay ? 1 : 3));
const hardware = process.env.CPU_GPU === 'hardware';
assert.ok(Number.isInteger(repeats) && repeats >= 1 && repeats <= 5);
assert.ok(
  cases.length > 0 && cases.length <= cpuCases.length && new Set(cases).size === cases.length,
);
assert.ok(
  cases.every((name) => cpuCases.some((candidate) => candidate === name)),
  'Unknown CPU case',
);
const label = process.env.CPU_LABEL ?? 'current';
assert.match(label, /^[a-zA-Z0-9_-]{1,60}$/);
const base = process.env.DEMO_URL ?? 'http://127.0.0.1:5173';
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const sourcePaths = git(
  'ls-files',
  '--cached',
  '--others',
  '--exclude-standard',
  'src',
  'tests',
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'tsconfig.json',
)
  .split('\n')
  .sort();
const source = createHash('sha256');
for (const path of sourcePaths)
  source
    .update(path)
    .update('\0')
    .update(await readFile(path))
    .update('\0');
const sourceHash = source.digest('hex');
if (replay && process.env.CPU_ALLOW_CHANGED_SOURCE !== '1')
  assert.equal(
    sourceHash,
    replay.sourceHash,
    'Replay source differs; explicitly set CPU_ALLOW_CHANGED_SOURCE=1 for candidate comparisons',
  );
const identity = {
  revision: git('rev-parse', 'HEAD'),
  status: git('status', '--porcelain'),
  sourceHash,
  recipe: CPU_RECIPE_VERSION,
  seed: 'MOURNING-731',
  viewport: { width: 800, height: 450 },
  node: process.version,
  platform: platform(),
  cpu: cpus()[0]?.model,
  logicalCpus: cpus().length,
  totalMemory: totalmem(),
  freeMemory: freemem(),
  load: loadavg(),
  date: new Date().toISOString(),
  rendererRequested: hardware ? 'hardware' : 'software',
  timerScope: 'inclusive children; hashes/setup/yields excluded; actual draws when render=true',
  allocationScope:
    'explicit pose/corpse/body allocations plus heap snapshots; not a complete JS allocation census',
  warmupPolicy:
    'selected hooks installed before warmup; no samples collected until the measured window',
};
const modes: CpuMode[] = replay
  ? ['detailed']
  : process.env.CPU_MODES
    ? process.env.CPU_MODES.split(',').map((mode) => {
        assert.ok(mode === 'off' || mode === 'coarse' || mode === 'detailed');
        return mode;
      })
    : ['off', 'coarse', 'detailed'];
assert.ok(modes.length > 0 && modes.length <= 3 && new Set(modes).size === modes.length);
const summarize = (samples: CpuSample[]) => {
  const names = new Set(samples.flatMap((s) => Object.keys(s.ms)));
  const counters: Record<string, number> = {};
  for (const s of samples)
    for (const [key, value] of Object.entries(s.counts))
      counters[key] = (counters[key] ?? 0) + value;
  return {
    samples: samples.length,
    timings: Object.fromEntries(
      [...names].map((name) => [name, distribution(samples.map((s) => s.ms[name] ?? 0))]),
    ),
    counters,
  };
};
type CpuState = ReturnType<CpuProfile['state']>;
type CpuRun = ReturnType<CpuMetrics['snapshot']> & {
  recipe: number;
  workloadKind: string;
  name: string;
  mode: CpuMode;
  warmup: number;
  frames: number;
  rendering: boolean;
  live: boolean;
  quality: string;
  initial: CpuState;
  final: CpuState;
  evidence: unknown;
  checkpoints: {
    frame: number;
    authority: string;
    presentation: string;
    population: CpuState['population'];
    resources: CpuState['resources'];
  }[];
  repeat: number;
  host: { load: number[]; freeMemory: number };
  heap: { usedSize: number; totalSize: number };
  digest: string;
  parity: string;
  summary: ReturnType<typeof summarize>;
  activeOnly: ReturnType<typeof summarize>;
};
await mkdir('test-results', { recursive: true });
await withViteServer(base, 'dev', async () => {
  const browser = await chromium.launch({
    headless: !hardware,
    timeout: 15000,
    args: hardware
      ? ['--no-sandbox', '--ignore-gpu-blocklist', '--enable-precise-memory-info']
      : [
          '--no-sandbox',
          '--use-angle=swiftshader',
          '--enable-unsafe-swiftshader',
          '--enable-precise-memory-info',
        ],
  });
  const deadline = setTimeout(() => void browser.close(), 1800000);
  const errors: string[] = [];
  const results: CpuRun[] = [];
  try {
    const page = await browser.newPage({ viewport: identity.viewport });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/?debug&seed=${identity.seed}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
    await page.evaluate(() => {
      window.__dungeon.engine.stopRenderLoop();
      window.__dungeon.animation.pause();
    });
    const renderer = await page.evaluate(() => window.__dungeon.engine.getGlInfo());
    if (hardware)
      assert.equal(
        rendererKind(renderer.renderer, renderer.vendor),
        'hardware',
        'Hardware run requires identifiable hardware; software/generic renderer evidence is insufficient',
      );
    const cdp = await page.context().newCDPSession(page);
    const controls = new Map<string, string>();
    const detailedCounts = new Map<string, string>();
    let pinned: Record<string, unknown> | null = null,
      pinnedMs = 0;
    for (const name of cases)
      for (let repeat = 0; repeat < repeats; repeat++) {
        // Alternate order to expose warmup/order bias. Every cell starts from fresh seeded state.
        const order = repeat % 2 ? [...modes].reverse() : modes;
        for (const mode of order) {
          const host = { load: loadavg(), freeMemory: freemem() };
          await page.evaluate(
            ({ seed, quality }) => {
              const d = window.__dungeon;
              d.cpu.stop();
              d.animation.pause();
              d.engine.stopRenderLoop();
              const select = document.querySelector<HTMLSelectElement>('#quality')!;
              select.value = quality;
              select.dispatchEvent(new Event('change'));
              d.regenerate(seed);
            },
            { seed: identity.seed, quality: name.endsWith('-high') ? 'high' : 'low' },
          );
          await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
          const result = await page.evaluate(
            async ({ name, mode, captureRequest }) => {
              const path = '/tests/cpu-workloads.ts';
              const { cpuCases, cpuWorkload, CPU_RECIPE_VERSION } = (await import(
                path
              )) as typeof import('./cpu-workloads.ts');
              const selected = cpuCases.find((candidate) => candidate === name);
              if (!selected) throw new Error(`Unknown CPU case ${name}`);
              const d = window.__dungeon,
                g = d.game;
              d.animation.pause();
              d.engine.stopRenderLoop();
              const workload = cpuWorkload(d, selected);
              const yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
              const checkpoints = [];
              d.cpu.start(mode, captureRequest);
              try {
                for (let i = 0; i < workload.warmup; i++) {
                  d.step([], 1);
                  if (i % 12 === 11) await yieldTask();
                }
                // Warm shader/active-mesh setup separately; simulation clocks do not advance here.
                g.scene.render();
                g.scene.render();
                const initial = d.cpu.state();
                if (workload.live) {
                  d.animation.play();
                  await d.cpu.live(workload.frames);
                  d.animation.pause();
                }
                for (let frame = 0; !workload.live && frame < workload.frames; frame++) {
                  d.cpu.frame(workload.keys(frame), workload.ticks(frame), workload.rendering, () =>
                    workload.event(frame),
                  );
                  if (frame % 12 === 11 || frame === workload.frames - 1) {
                    const state = d.cpu.state();
                    checkpoints.push({
                      frame,
                      authority: state.authority,
                      presentation: state.presentation,
                      population: state.population,
                      resources: state.resources,
                    });
                    await yieldTask();
                  }
                }
                workload.validate();
                const report = d.cpu.report(),
                  final = d.cpu.state();
                return {
                  recipe: CPU_RECIPE_VERSION,
                  workloadKind: workload.kind,
                  name,
                  mode,
                  warmup: workload.warmup,
                  frames: workload.frames,
                  rendering: workload.rendering,
                  live: workload.live,
                  quality: selected.endsWith('-high') ? 'high' : 'low',
                  initial,
                  checkpoints,
                  final,
                  evidence: workload.evidence(),
                  ...report,
                };
              } finally {
                d.cpu.stop();
              }
            },
            { name, mode, captureRequest: replay?.id },
          );
          const heap = await cdp.send('Runtime.getHeapUsage');
          const digest = fingerprint({
            initial: result.initial,
            checkpoints: result.checkpoints,
            final: result.final,
          });
          if (!result.live && controls.has(name) && digest !== controls.get(name))
            await writeFile(
              `test-results/cpu0-${label}-failure.json`,
              JSON.stringify(
                { identity, result, baseline: results.find((r) => r.name === name), errors },
                null,
                2,
              ),
            );
          if (!result.live && controls.has(name))
            assert.equal(
              digest,
              controls.get(name),
              `${name}/${mode}/${repeat}: instrumentation changed state`,
            );
          else controls.set(name, digest);
          if (name === 'frames-high' && controls.has('frames-low'))
            assert.equal(digest, controls.get('frames-low'), 'Quality changed controlled state');
          const summary = summarize(result.samples);
          if (replay) {
            assert.ok(result.replay, 'Pinned request was not reached');
            assert.equal(
              fingerprint(result.replay.input),
              fingerprint(replay.input),
              'Pinned request inputs differ',
            );
            assert.equal(
              fingerprint(result.replay.output),
              fingerprint(replay.output),
              'Pinned route result differs',
            );
          }
          if (mode === 'detailed' && !result.live) {
            const counts = fingerprint(summary.counters);
            if (detailedCounts.has(name))
              assert.equal(counts, detailedCounts.get(name), `${name}: work counts changed`);
            else detailedCounts.set(name, counts);
            for (const route of result.routes)
              if (route.ms > pinnedMs) {
                pinnedMs = route.ms;
                pinned = {
                  identity,
                  name,
                  mode,
                  repeat,
                  warmup: result.warmup,
                  frames: result.frames,
                  request: route,
                  replay: `CPU_CASES=${name} CPU_MODES=detailed CPU_REPEATS=1 npm run profile:cpu`,
                  note: 'Replay the entire seeded recipe through request.step/id to reconstruct navigator caches and dynamic inputs; compare input/output, not wall time.',
                };
              }
          }
          const active = result.samples.filter(
            (s) =>
              (s.counts['population.articulated'] ?? 0) + (s.counts['population.separated'] ?? 0) >
              0,
          );
          results.push({
            ...result,
            repeat,
            host,
            heap,
            digest,
            summary,
            parity: result.live
              ? 'clock-driven; compare controlled recipes for state equivalence'
              : 'exact workload fingerprints',
            activeOnly: summarize(active),
          });
          if (
            repeat === 0 &&
            mode === 'coarse' &&
            ['entrance', 'stable', 'bones', 'burst', 'frames-low', 'frames-high'].includes(name)
          ) {
            await page.evaluate(() => window.__dungeon.game.scene.render());
            await page.screenshot({ path: `test-results/cpu0-${label}-${name}.png` });
          }
          console.log(
            `PASS ${name}/${mode}/${repeat}: ${summary.timings.frame.mean.toFixed(2)}ms mean, ${summary.timings.frame.p95.toFixed(2)}ms p95; ${digest}`,
          );
          assert.deepEqual(errors, []);
        }
      }
    await writeFile(
      `test-results/cpu0-${label}.json`,
      JSON.stringify(
        {
          identity,
          renderer,
          browser: browser.version(),
          results,
          errors,
          hardwareFrameGate: hardware
            ? 'measured controlled frames; see rendering cases'
            : 'pending: software diagnostic only',
        },
        null,
        2,
      ),
    );
    const groups = [...new Set(results.map((r) => `${r.name}/${r.mode}`))].map((key) => {
      const runs = results.filter((r) => `${r.name}/${r.mode}` === key);
      return {
        key,
        runs: runs.length,
        means: distribution(runs.map((r) => r.summary.timings.frame.mean)),
        pooled: summarize(runs.flatMap((r) => r.samples)),
      };
    });
    await writeFile(
      `test-results/cpu0-${label}-summary.json`,
      JSON.stringify(
        {
          identity,
          renderer,
          groups,
          runs: results.map((r) => ({
            name: r.name,
            mode: r.mode,
            repeat: r.repeat,
            digest: r.digest,
            evidence: r.evidence,
            population: r.final.population,
            resources: r.final.resources,
            timings: r.summary.timings,
            counters: r.summary.counters,
            activeOnly: r.activeOnly,
            slowest: r.routes[0] ?? null,
          })),
        },
        null,
        2,
      ),
    );
    if (pinned)
      await writeFile(`test-results/cpu0-${label}-hitch.json`, JSON.stringify(pinned, null, 2));
    const endHash = createHash('sha256');
    for (const path of sourcePaths)
      endHash
        .update(path)
        .update('\0')
        .update(await readFile(path))
        .update('\0');
    assert.equal(endHash.digest('hex'), sourceHash, 'Source changed during measurement');
    assert.equal(
      git('rev-parse', 'HEAD'),
      identity.revision,
      'Revision changed during measurement',
    );
  } finally {
    clearTimeout(deadline);
    await browser.close();
    if (errors.length)
      await writeFile(`test-results/cpu0-${label}-errors.json`, JSON.stringify(errors));
  }
});
