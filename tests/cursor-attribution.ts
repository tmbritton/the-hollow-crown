import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { cpus, loadavg, release } from 'node:os';
import { extname, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { buildDiagnostic } from './cursor-attribution-build.ts';
import {
  archiveNativeRows,
  captureBoundary,
  describeNativePasses,
} from './cursor-capture-archive.ts';
import { offRayCredit, validateWindow } from './cursor-attribution-model.ts';
import { transition } from './cursor-evidence.ts';
import type { RunState, Visit } from './cursor-evidence.ts';
import type { CaptureConfig, NativeRow, cursorDiagnostic } from './cursor-attribution-probe.ts';
import {
  measurePublications,
  reconcileWriters,
  windowGap,
  writerFrameEvidence,
} from './cursor-publication-replay.ts';
import { writerFixture } from './cursor-attribution-fixture.ts';
import type { WriterTrace } from './cursor-attribution-writers.ts';
import type { WriterCase, WriterReport } from './cursor-writer-evidence.ts';
import { validateWriterReport } from './cursor-writer-evidence.ts';
import { pinProductionInputs } from './cursor-production-inputs.ts';
import { measureScaling } from './cursor-reference.ts';
import { validateScaling } from './cursor-scaling-policy.ts';

type Bridge = NonNullable<Window & { __cursorCapture: BridgeAPI }>['__cursorCapture'];
// The callback contract is exported by the page adapter; Playwright values are plain records.
type BridgeAPI = ReturnType<typeof cursorDiagnostic>['bridge'];
const getBridge = '__cursorCapture';
const arg = process.argv[2];
if (process.argv.length > 3 || (arg && arg !== '--smoke' && arg !== '--scaling'))
  throw new Error('usage: node tests/cursor-attribution.ts [--smoke|--scaling]');
const smoke = arg === '--smoke';
const root = 'test-results/epic16';
await mkdir(root, { recursive: true });
const out = await mkdtemp(`${root}/${arg?.slice(2) ?? 'hardware'}-`);
const runId = out;
console.log(out);
const save = (name: string, data: unknown) =>
  writeFile(`${out}/${name}.json`, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
const archive = (name: string, data: unknown) =>
  writeFile(`${out}/${name}.json.gz`, gzipSync(JSON.stringify(data)), { flag: 'wx' });
let run: RunState = { kind: 'planned' };
let stage = 'host';
let nativeVisits = 0;
let countVisits = 0;
const windowTicks: [number, number] = [180, 480];
function admitHardwareCollector() {
  throw new Error(captureBoundary);
}
const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const smi = () => {
  const args = ['--query-gpu=name,pci.bus_id,driver_version,pstate,display_active', '--format=csv'];
  const result = spawnSync('nvidia-smi', args, { encoding: 'utf8', timeout: 5000 });
  return {
    args,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error?.message,
    ok: result.status === 0 && /NVIDIA GeForce RTX 2070,/.test(result.stdout ?? ''),
  };
};

async function files(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) => (e.isDirectory() ? files(`${path}/${e.name}`) : [`${path}/${e.name}`])),
    )
  )
    .flat()
    .sort();
}

async function manifest(paths: string[]) {
  return Object.fromEntries(
    await Promise.all(paths.map(async (path) => [path, hash(await readFile(path))])),
  );
}

async function serve(dir: string) {
  const root = resolve(dir);
  const server = createServer((request, response) => {
    void (async () => {
      const path = resolve(root, `.${new URL(request.url ?? '/', 'http://localhost').pathname}`);
      if (path !== root && !path.startsWith(root + sep)) {
        response.writeHead(404).end();
        return;
      }
      const file = path === root ? `${root}/index.html` : path;
      const media: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
      };
      try {
        const data = await readFile(file);
        response
          .writeHead(200, {
            'Content-Type': media[extname(file)] ?? 'application/octet-stream',
            'Cache-Control': 'no-store',
          })
          .end(data);
      } catch {
        response.writeHead(404).end();
      }
    })();
  });
  await new Promise<void>((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const addr = server.address();
  if (typeof addr !== 'object' || !addr) throw new Error('no diagnostics listener');
  return { server, url: `http://127.0.0.1:${addr.port}/?seed=MOURNING-731` };
}

type Ready = NonNullable<ReturnType<Bridge['take']>['ready']>;
async function saveNative(page: Page, label: string) {
  const captured = await archiveNativeRows({
    take: (start, end) =>
      page.evaluate(
        ([key, a, b]) =>
          (window as unknown as Record<string, Bridge | undefined>)[key]?.take(a, b) ?? null,
        [getBridge, start, end] as const,
      ),
    header: (value) => save(`${label}-header`, value),
    chunk: (start, rows) => archive(`${label}-frames-${start}`, rows),
  });
  if (captured) await save(`${label}-native-breakdown`, describeNativePasses(captured.rows));
  return captured;
}
function handshake(meta: Ready, reference: Ready | null) {
  assert.equal(meta.seed, 'MOURNING-731');
  assert.equal(meta.navigation, 'navigate');
  assert.equal(meta.steps, 0);
  assert.equal(meta.quality, 'high');
  assert.equal(meta.webgl, 2);
  assert.equal(meta.visible, true);
  assert.equal(meta.focused, true);
  assert.ok(meta.renderer);
  assert.match(meta.renderer, /GeForce RTX 2070(?:\/|,|\))/);
  assert.deepEqual(meta.css, [0, 0, 1920, 1080]);
  assert.ok(meta.backing.every((n, i) => Math.abs(n - meta.css[i + 2] * meta.dpr) <= 1));
  const { lensDegrees, fisheyePercent, paletteEnabled, inkWidth, cornerWear } = meta.settings;
  assert.deepEqual(
    [lensDegrees, fisheyePercent, paletteEnabled, inkWidth, cornerWear],
    [60, 35, false, 4, 40],
  );
  assert.equal(meta.actors.length, 24);
  assert.ok(meta.actors.every((a) => a.alive));
  assert.deepEqual(meta.hero, [0, 0, 0]);
  assert.ok(
    Math.abs(meta.camera[0] + Math.PI / 4) < 1e-7 && Math.abs(meta.camera[1] - 0.64) < 1e-7,
  );
  if (reference) assert.deepEqual(meta, reference, 'fresh ready metadata mismatch');
}

async function withVisit<T>(
  browser: Browser,
  url: string,
  label: string,
  config: CaptureConfig,
  work: (page: Page, captured: Awaited<ReturnType<typeof saveNative>>) => Promise<T>,
) {
  stage = label;
  const before = smi();
  await save(`${label}-gpu-before`, before);
  if (!before.ok) throw new Error('matched GPU unavailable before visit');
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('requestfailed', (e) => errors.push(`asset request failed: ${e.url()}`));
    await page.addInitScript((c) => Object.assign(window, { __cursorCaptureConfig: c }), config);
    const client = await context.newCDPSession(page);
    await client.send('Input.setIgnoreInputEvents', { ignore: true });
    await page.bringToFront();
    let waitFailure: unknown;
    try {
      await page.goto(url, { timeout: 45000 });
      await page.waitForFunction(
        (key) => {
          const b = (window as unknown as Record<string, Bridge>)[key];
          return (
            b?.status().done || b?.status().fail || !!document.querySelector('#loading.failed')
          );
        },
        getBridge,
        { timeout: 90000, polling: 250 },
      );
    } catch (error) {
      waitFailure = error;
    }
    // Persist what the page can still return before any admission check or replay.
    let captured: Awaited<ReturnType<typeof saveNative>> = null;
    try {
      if (config.kind !== 'preflight') captured = await saveNative(page, label);
    } catch (archiveFailure) {
      await save(`${label}-native-export-error`, {
        waitFailure: String(waitFailure),
        archiveFailure: String(archiveFailure),
      });
      throw waitFailure ?? archiveFailure;
    }
    if (waitFailure) throw waitFailure;
    assert.deepEqual(errors, []);
    const result = await work(page, captured);
    assert.deepEqual(errors, []);
    const after = smi();
    await save(`${label}-gpu-after`, after);
    if (!after.ok) throw new Error('matched device lost after visit');
    return result;
  } finally {
    await context.close();
  }
}

const finite = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v))
    throw new Error('missing native, replay or writer rate measurement');
  return v;
};
const mean = (n: number[]) => {
  if (!n.length) throw new Error('empty measurement');
  return n.reduce((a, b) => a + b, 0) / n.length;
};
function visitFrom(
  kind: Visit['kind'],
  rows: NativeRow[],
  replay: ReturnType<Bridge['replay']>,
  witness: WriterCase,
): Visit {
  if (!witness.frames.length || !replay.parity) throw new Error('missing count or replay evidence');
  let isolated = 0;
  if (kind !== 'idle') {
    if (replay.timed.length !== rows.length) throw new Error('missing timed replay frames');
    for (let j = 0; j < Math.max(...rows.map((r) => r.passes.length)); j++) {
      if (!rows.every((r) => r.passes[j]))
        throw new Error('conditional native pass changed during the visit');
      isolated += offRayCredit({
        native: mean(rows.map((r) => finite(r.passes[j].ms))),
        exhaustive: mean(replay.timed.map((r) => finite(r.stages[0][j]))),
        local: mean(replay.timed.map((r) => finite(r.stages[1][j]))),
        offRay: mean(replay.timed.map((r) => finite(r.isolated[j]?.off))),
        empty: mean(replay.timed.map((r) => finite(r.isolated[j]?.empty))),
      });
    }
  }
  return {
    kind,
    exclusiveReplayMean: isolated,
    registration: { ...replay.registration, ms: finite(replay.registration.ms) },
    replay:
      kind === 'idle'
        ? null
        : {
            exhaustive: finite(replay.exhaustive),
            local: finite(replay.local),
            parity: replay.parity,
          },
    frames: rows.map((r, i) => {
      const demand = witness.frames[i]?.demand;
      if (!demand || demand.publish === null) throw new Error('unresolved publication demand');
      return {
        pick: finite(r.pick),
        pickScopes: [],
        ticks: r.ticks,
        from: r.from,
        to: r.to,
        rig: finite(r.rig),
        eligibilityOutline: finite(r.cue),
        renderCpu: finite(r.renderCpu),
        gpu: r.gpu,
        demand: { publish: demand.publish, query: demand.query },
      };
    }),
  };
}

async function collect() {
  const gpu = smi();
  stage = 'production input pin';
  const production = await pinProductionInputs();
  await save('provenance', {
    production,
    toolHead: git('rev-parse', 'HEAD'),
    toolBranch: git('branch', '--show-current'),
    time: new Date().toISOString(),
    runId,
    smoke: false,
    command: process.argv,
    kernel: release(),
    cpu: cpus()[0]?.model,
    load: loadavg(),
    powerProfile:
      spawnSync('powerprofilesctl', ['get'], { encoding: 'utf8', timeout: 1000 }).stdout || null,
    node: process.version,
    gpu,
    flags:
      'Vite production/Oxc minified, config/env files and public copying disabled, no sourcemaps or debug query',
    windowTicks,
    toolHashes: await manifest((await files('tests')).filter((p) => p.startsWith('tests/cursor-'))),
  });
  stage = 'host';
  if (!gpu.ok) {
    run = transition(run, {
      type: 'unavailable',
      reason: 'No working matched RTX 2070 before browser launch',
    }).state;
    return;
  }
  assert.match(cpus()[0]?.model ?? '', /Ryzen 5 2600X/);
  stage = 'scaling';
  const scaling = await captureScaling();
  stage = 'build';
  const probes = await buildDiagnostic(resolve(out, 'bundle'));
  assert.deepEqual(
    await pinProductionInputs(),
    production,
    'production inputs changed during build',
  );
  await save('transformed-sources', probes);
  await save('bundle-hashes', await manifest(await files(`${out}/bundle`)));
  const { server, url } = await serve(`${out}/bundle`);
  let browser: Browser | undefined;
  try {
    stage = 'launch';
    browser = await chromium.launch({
      channel: 'chromium',
      headless: false,
      timeout: 15000,
      args: ['--ignore-gpu-blocklist', '--window-position=32,32', '--window-size=1980,1210'],
    });
    await save('browser', { version: browser.version(), url });
    const preflight = await withVisit(
      browser,
      url,
      'preflight',
      { kind: 'preflight', mode: 'time', smoke: false, window: windowTicks },
      async (page) => {
        const meta = await page.evaluate(
          (key) => (window as unknown as Record<string, Bridge>)[key].take().ready,
          getBridge,
        );
        assert.ok(meta, 'actual game was not ready');
        handshake(meta, null);
        await page.locator('#game').waitFor({ state: 'visible' });
        const target = await page.evaluate(
          (key) => (window as unknown as Record<string, Bridge>)[key].resolve(),
          getBridge,
        );
        const refreshHz = await page.evaluate(async () => {
          const times: number[] = [];
          for (let i = 0; i < 20; i++)
            times.push(await new Promise<number>((done) => requestAnimationFrame(done)));
          const gaps = times
            .slice(1)
            .map((t, i) => t - times[i])
            .sort((a, b) => a - b);
          return 1000 / gaps[9];
        });
        await save('handshake', { meta, target, refreshHz });
        assert.ok(Math.abs(refreshHz - 59.95) <= 1, 'unmatched foreground RAF refresh');
        assert.ok(
          target.shrine && target.floor?.kind === 'floor',
          'failed to resolve shrine and clear floor',
        );
        await page.screenshot({ path: `${out}/preflight.png` });
        return { meta, shrine: target.shrine.point, floor: target.floor.point };
      },
    );
    run = transition(run, { type: 'preflightOK' }).state;
    const kinds = ['shrine', 'floor', 'idle'] as const;
    type Kind = (typeof kinds)[number];
    const read = async (
      page: Page,
      captured: Awaited<ReturnType<typeof saveNative>>,
      kind: Kind,
      reverse: boolean,
    ) => {
      assert.ok(captured, 'native capture bridge missing');
      const { header: meta, rows } = captured;
      assert.ok(meta.ready);
      handshake(meta.ready, preflight.meta);
      assert.ifError(meta.fail ? new Error(meta.fail) : null);
      assert.equal(meta.input, kind === 'idle' ? 0 : 1);
      assert.equal(validateWindow(rows, windowTicks), null);
      const replay = await page.evaluate(
        ([key, reverse]) => (window as unknown as Record<string, Bridge>)[key].replay(reverse),
        [getBridge, reverse] as const,
      );
      await archive(`${stage}-replay`, replay);
      assert.ok(replay.parity);
      if (kind !== 'idle')
        assert.ok(replay.lists.some((r) => r.ids.length < meta.ready!.meshNames.length));
      return { rows, replay };
    };
    const traces: WriterTrace[] = [];
    const countEvidence = new Map<Visit['kind'], string>();
    const countRows = new Map<Kind, NativeRow[]>();
    const visits: Visit[] = [];
    let writerReport: WriterReport | undefined;
    for (const kind of kinds) {
      const point = kind === 'idle' ? undefined : preflight[kind];
      await withVisit(
        browser,
        url,
        `${kind}-count`,
        {
          kind,
          point,
          mode: 'count',
          smoke: false,
          window: windowTicks,
          expectedReady: JSON.stringify(preflight.meta),
          runId,
        },
        async (page, captured) => {
          const meta = await page.evaluate(
            (key) => (window as unknown as Record<string, Bridge>)[key].writerTrace(),
            getBridge,
          );
          assert.ok(meta.header);
          await archive(`${stage}-writer-header`, meta.header);
          const trace = { ...meta.header, frames: [] } satisfies WriterTrace;
          const frames: WriterTrace['frames'] = trace.frames;
          for (let i = 0; i < meta.length; i += 2) {
            const chunk = await page.evaluate(
              ([key, start]) =>
                (window as unknown as Record<string, Bridge>)[key].writerTrace(start, start + 2)
                  .frames,
              [getBridge, i] as const,
            );
            await archive(`${stage}-writers-${i}`, chunk);
            frames.push(...chunk);
          }
          const gap = windowGap(trace, windowTicks);
          if (gap) trace.gaps.push(gap);
          const { frames: reconciled, gaps } = reconcileWriters(trace);
          trace.gaps.push(...gaps.filter((reason) => !trace.gaps.includes(reason)));
          if (trace.gaps.length) {
            await archive(`${stage}-writer-replay`, { frames: reconciled, gaps: trace.gaps });
            throw new Error(trace.gaps.join('; '));
          }
          const { rows, replay } = await read(page, captured, kind, false);
          if (
            rows.length !== reconciled.length ||
            rows.some((row, i) => row.from !== reconciled[i].from || row.to !== reconciled[i].to)
          )
            trace.gaps.push('native/count writer frames disagree');
          if (
            kind !== 'idle' &&
            (replay.lists.length !== reconciled.length ||
              !rows.every(
                (r) => r.passes.length && r.passes.every((p) => p.work && p.work.visits > 0),
              ) ||
              replay.lists.some(
                ({ i, ids }, frame) =>
                  i !== frame ||
                  JSON.stringify(ids) !== JSON.stringify(reconciled[frame]?.query?.ids),
              ))
          )
            trace.gaps.push(
              'native passes or offline candidates disagree with synchronized traversal',
            );
          await archive(`${stage}-writer-replay`, { frames: reconciled, gaps: trace.gaps });
          if (trace.gaps.length) throw new Error(trace.gaps.join('; '));
          countEvidence.set(kind, JSON.stringify(writerFrameEvidence(reconciled)));
          traces.push(trace);
          countRows.set(kind, rows);
          countVisits++;
          if (kind === 'idle') {
            writerReport = await page.evaluate(
              ([key, traces]) => (window as unknown as Record<string, Bridge>)[key].scratch(traces),
              [getBridge, traces] as const,
            );
            await save('writer-ledger', writerReport);
          }
        },
      );
    }
    const writerError = validateWriterReport(runId, writerReport);
    if (writerError) throw new Error(writerError);
    for (const witness of writerReport!.cases)
      if (JSON.stringify(witness.frames) !== countEvidence.get(witness.kind))
        throw new Error(`${witness.kind} scratch records disagree with ordered count replay`);
    for (const kind of kinds)
      for (let i = 0; i < (kind === 'shrine' ? 3 : 1); i++) {
        const point = kind === 'idle' ? undefined : preflight[kind];
        await withVisit(
          browser,
          url,
          `${kind}-time-${i + 1}`,
          {
            kind,
            point,
            mode: 'time',
            smoke: false,
            window: windowTicks,
            expectedReady: JSON.stringify(preflight.meta),
          },
          async (page, captured) => {
            const { rows, replay } = await read(page, captured, kind, i % 2 === 1);
            nativeVisits++;
            const counted = countRows.get(kind)!;
            const witness = writerReport!.cases.find((c) => c.kind === kind)!;
            if (
              rows.length !== counted.length ||
              rows.some(
                (row, i) =>
                  row.from !== counted[i].from ||
                  row.to !== counted[i].to ||
                  JSON.stringify(row.sample) !== JSON.stringify(counted[i].sample),
              )
            ) {
              const gap = `count/time frame geometry or ray mismatch for ${kind}`;
              await save(`${stage}-writer-gap`, { runId, gap });
              throw new Error(gap);
            }
            visits.push(visitFrom(kind, rows, replay, witness));
          },
        );
      }
    {
      stage = 'decision';
      const gpu = smi();
      await save('gpu-after', gpu);
      if (!gpu.ok) throw new Error('matched device lost');
      await save('ledger-input', { runId, visits, writerReport });
      run = transition(run, {
        type: 'complete',
        evidence: {
          hardware: 'matched',
          scaling,
          matched: true,
          completeWindows: true,
          runId,
          writerReport,
          shrine: visits.filter((v) => v.kind === 'shrine'),
          floor: visits.find((v) => v.kind === 'floor')!,
          idle: visits.find((v) => v.kind === 'idle')!,
        },
      }).state;
    }
  } finally {
    await browser?.close();
    server.close();
  }
}

async function captureScaling() {
  const report = measureScaling(() => performance.now());
  await save('scaling', report);
  const error = validateScaling(report);
  if (error) throw new Error(error);
  return report;
}

async function softwareSmoke() {
  stage = 'software fixture';
  run = transition(run, { type: 'preflightOK' }).state;
  const { traces, hits } = writerFixture(runId);
  await save('provenance', {
    runId,
    hardware: 'software',
    engine: 'Babylon NullEngine',
    timings: 'none',
    toolHead: git('rev-parse', 'HEAD'),
    toolHashes: await manifest((await files('tests')).filter((p) => p.startsWith('tests/cursor-'))),
  });
  for (const trace of traces) {
    await archive(`${trace.kind}-writers`, trace);
    const { gaps, frames } = reconcileWriters(trace);
    await archive(`${trace.kind}-writer-replay`, { gaps, frames });
    assert.deepEqual(gaps, []);
    if (trace.kind === 'idle')
      assert.ok(
        frames.every(
          (f) => f.demand.publish !== null && f.demand.publish > 0 && f.demand.query === 0,
        ),
      );
    else assert.ok(frames.every((f) => f.query && f.query.reads.occupied > 0));
  }
  const writerReport = measurePublications(traces, null);
  await save('writer-ledger', writerReport);
  await save('fixture-hits', hits);
  assert.ok(writerReport.cases.every((c) => c.msPerFrame === null));
  stage = 'smoke complete';
  run = transition(run, {
    type: 'invalid',
    reason:
      'NullEngine fixture passed; software and absent timing inputs cannot authorize feasibility',
  }).state;
}

if (arg === '--scaling') await captureScaling();
else {
  try {
    if (smoke) await softwareSmoke();
    else {
      stage = 'offline collector hold';
      admitHardwareCollector();
      await collect();
    }
  } catch (error) {
    run = transition(run, {
      type: /context lost|device lost/i.test(String(error)) ? 'fault' : 'invalid',
      reason: String(error),
    }).state;
    console.error(error);
  }
  const smokePassed = smoke && stage === 'smoke complete' && run.kind === 'stopped';
  await save('readout', { stage, smokePassed, nativeVisits, countVisits, decision: run });
  console.log({ stage, smokePassed, nativeVisits, countVisits, decision: run });
  if (!smokePassed && (run.kind === 'pending' || run.kind === 'stopped')) process.exitCode = 2;
}
