import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { cpus, loadavg, release } from 'node:os';
import { extname, resolve, sep } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { buildDiagnostic } from './cursor-attribution-build.ts';
import {
  archiveNativeRows,
  assertReplayWork,
  describeNativePasses,
  openWriterArchive,
  runVisitBoundary,
} from './cursor-capture-archive.ts';
import type { ReplayWork } from './cursor-attribution-replay.ts';
import { offRayCredit, validateWindow } from './cursor-attribution-model.ts';
import { transition } from './cursor-evidence.ts';
import type { RunState, Visit } from './cursor-evidence.ts';
import type { CaptureConfig, NativeRow, cursorDiagnostic } from './cursor-attribution-probe.ts';
import {
  measurePublications,
  reconcileWriters,
  scratchSchedule,
  streamWriterReplay,
} from './cursor-publication-replay.ts';
import type { ScratchArm } from './cursor-publication-replay.ts';
import { writerFixture } from './cursor-attribution-fixture.ts';
import type { WriterCase, WriterDemand, WriterReport } from './cursor-writer-evidence.ts';
import { validateWriterReport, writerCaseValidator } from './cursor-writer-evidence.ts';
import { pinProductionInputs } from './cursor-production-inputs.ts';
import { measureScaling } from './cursor-reference.ts';
import { validateScaling } from './cursor-scaling-policy.ts';
import {
  volumeChanging,
  volumeKind,
  volumeMeshes,
  volumeOperand,
  volumeWrites,
} from './cursor-capture-volume.ts';
import { encodePageBase64, pageBytes } from './cursor-capture-stream.ts';
import {
  launchHeadedCursorBrowser,
  newCursorVisitContext,
  prepareVisitPage,
} from './cursor-visit-page.ts';

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
  work: (
    page: Page,
    captured: Awaited<ReturnType<typeof saveNative>>,
    writers: Awaited<ReturnType<typeof openWriterArchive>> | null,
  ) => Promise<T>,
) {
  stage = label;
  if (!config.smoke) {
    const before = smi();
    await save(`${label}-gpu-before`, before);
    if (!before.ok) throw new Error('matched GPU unavailable before visit');
  }
  const context = await newCursorVisitContext(browser);
  let writers: Awaited<ReturnType<typeof openWriterArchive>> | null = null;
  const errors: string[] = [];
  let progress = 'attempted';
  try {
    const page = await context.newPage();
    let failVisit: (message: string) => void = () => {};
    const crashed = new Promise<string>((resolve) => {
      failVisit = resolve;
    });
    const error = (message: string) => {
      if (errors.length < 16) errors.push(message.slice(0, 512));
    };
    page.on('pageerror', (e) => {
      error(e.message);
      failVisit(e.message);
    });
    page.on('crash', () => failVisit('page crashed'));
    page.on('requestfailed', (e) => error(`asset request failed: ${e.url()}`));
    if (config.mode === 'count' && config.writerVisit) {
      writers = await openWriterArchive(
        `${out}/${label}-writer-pages`,
        config.writerVisit,
        config.window,
      );
      const sink = writers;
      await page.exposeBinding('__cursorWriterPage', ({ frame }, packet) => {
        if (frame !== page.mainFrame()) throw new Error('unexpected writer source frame');
        return sink.receive(packet);
      });
      page.on('close', () => sink.fail('writer page closed'));
      page.on('crash', () => sink.fail('writer page crashed'));
    }
    await prepareVisitPage(page, config);
    return await runVisitBoundary({
      wait: async () => {
        await page.goto(url, { timeout: 45000 });
        const wait = page.waitForFunction(
          (key) => {
            const b = (window as unknown as Record<string, Bridge>)[key];
            return (
              b?.status().done || b?.status().fail || !!document.querySelector('#loading.failed')
            );
          },
          getBridge,
          { timeout: 90000, polling: 250 },
        );
        await Promise.race([
          wait,
          crashed.then((message) => {
            throw new Error(`page error: ${message}`);
          }),
        ]);
      },
      archive: async () => (config.kind === 'preflight' ? null : await saveNative(page, label)),
      archiveFailed: async (waitFailure, archiveFailure) =>
        save(`${label}-native-export-error`, {
          waitFailure: String(waitFailure),
          archiveFailure: String(archiveFailure),
          errors,
        }),
      healthy: async () => {
        assert.deepEqual(errors, []);
        const status = await page.evaluate(
          (key) => (globalThis as unknown as Record<string, Bridge | undefined>)[key]?.status(),
          getBridge,
        );
        if (!status) throw new Error('capture bridge missing');
        if (status.fail) throw new Error(status.fail);
        assert.ok(status.done, 'capture not sealed');
      },
      validate: (captured) => work(page, captured, writers),
      after: async () => {
        if (config.smoke) return;
        const after = smi();
        await save(`${label}-gpu-after`, after);
        if (!after.ok) throw new Error('matched device lost after visit');
      },
      progress: (next) => {
        progress = next;
      },
    });
  } finally {
    await context.close();
    if (writers) await save(`${label}-writer-receipt`, writers.status());
    await save(`${label}-stage`, { progress, errors });
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
  witness: WriterCase<WriterDemand>,
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

type WriterArchive = Awaited<ReturnType<typeof openWriterArchive>>;
async function scratchFrom(page: Page, archive: WriterArchive, arm: ScratchArm | null, pad = 0) {
  await page.evaluate(
    ([key, arm, pad]) => (window as unknown as Record<string, Bridge>)[key].scratchBegin(arm, pad),
    [getBridge, arm, pad] as const,
  );
  for await (const { data } of archive.pages()) {
    const reply = await page.evaluate(
      ([key, encoded]) => (window as unknown as Record<string, Bridge>)[key].scratchPage(encoded),
      [getBridge, encodePageBase64(data)] as const,
    );
    if (reply) return reply;
  }
  throw new Error('scratch did not acknowledge a complete block');
}

async function collect() {
  // Run the unflagged collector only after independent clearance of this tooling.
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
    browser = await launchHeadedCursorBrowser();
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
    const visits: Visit[] = [];
    const writerReport: WriterReport<WriterDemand> = {
      runId,
      provenance: 'matched',
      framesPerBatch: 240,
      cases: [],
      consumed: 0,
    };
    for (const kind of kinds) {
      const point = kind === 'idle' ? undefined : preflight[kind];
      const result = await withVisit(
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
          writerVisit: `${runId}:${kind}-count`,
        },
        async (page, captured, writers) => {
          const { rows, replay } = await read(page, captured, kind, false);
          assert.ok(writers?.status().sealed, 'writer transport did not seal');
          const header = writers.header();
          assert.deepEqual(
            [header.runId, header.kind, header.provenance],
            [runId, kind, 'matched'],
          );
          await archive(`${kind}-count-writer-header`, header);
          stage = `${kind}-count: validate archive`;
          const witness = streamWriterReplay(header);
          const validator = writerCaseValidator(runId, kind);
          let i = 0;
          for await (const { frame } of writers.frames()) {
            const row: NativeRow = rows[i];
            const evidence = witness.frame(frame);
            await archive(`${kind}-count-writer-replay-${i}`, evidence);
            assert.ok(row, 'unexpected extra writer frame');
            assert.deepEqual([row.from, row.to], [frame.from, frame.to]);
            const ray = row.sample.ray;
            assert.deepEqual(
              frame.checks.find((c) => c.phase === 'pick')?.ray ?? null,
              ray && {
                x: ray.origin[0],
                z: ray.origin[2],
                dx: ray.direction[0],
                dz: ray.direction[2],
                length: ray.length,
              },
              'native and writer rays disagree',
            );
            if (kind !== 'idle') {
              const list = replay.lists[i];
              assert.equal(list?.i, i);
              assert.deepEqual(evidence.query?.ids, list.ids);
              assert.ok(row.passes.length && row.passes.every((p) => p.work && p.work.visits > 0));
              await archive(`${kind}-count-list-${i}`, list.ids);
              const work = replay.counts[i];
              assertReplayWork(i, row.passes.length, work, work);
              await archive(`${kind}-count-work-${i}`, work);
            }
            validator.frame(evidence);
            i++;
          }
          const gaps = witness.gaps();
          await save(`${kind}-count-writer-gaps`, gaps);
          assert.ok(!gaps.length, gaps[0]);
          assert.equal(i, rows.length);
          stage = `${kind}-count: scratch`;
          const { registration } = await scratchFrom(page, writers, null);
          assert.ok(registration);
          const measured = await scratchSchedule(i, async (arm) => {
            let units = 0,
              ms = 0,
              consumed = 0;
            for (let j = 0; j < arm.repeats; j++) {
              const { result } = await scratchFrom(
                page,
                writers,
                arm,
                j === arm.repeats - 1 ? arm.pad : 0,
              );
              assert.ok(result?.ms !== null && result);
              units += result.units;
              ms += result.ms;
              consumed = (consumed + result.consumed) | 0;
            }
            return { units, ms, consumed };
          });
          await save(`${kind}-count-scratch`, { registration, ...measured });
          const writerCase = validator.finish(measured.batches, registration, 240);
          assert.ok(writerCase.msPerFrame !== null, 'scratch timing did not resolve demanded work');
          return { writerCase, consumed: measured.consumed };
        },
      );
      countVisits++;
      writerReport.cases.push(result.writerCase);
      writerReport.consumed = (writerReport.consumed + result.consumed) | 0;
    }
    await save('writer-ledger', writerReport);
    const writerError = validateWriterReport(runId, writerReport);
    if (writerError) throw new Error(writerError);
    for (const kind of kinds)
      for (let i = 0; i < (kind === 'shrine' ? 3 : 1); i++) {
        const point = kind === 'idle' ? undefined : preflight[kind];
        const visit = await withVisit(
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
            const witness = writerReport.cases.find((c) => c.kind === kind)!;
            assert.equal(rows.length, witness.frames.length);
            for (let start = 0; start < rows.length; start += 4) {
              const counted = JSON.parse(
                gunzipSync(
                  await readFile(`${out}/${kind}-count-frames-${start}.json.gz`),
                ).toString(),
              ) as NativeRow[];
              assert.equal(counted.length, Math.min(4, rows.length - start));
              for (const [offset, expected] of counted.entries()) {
                const index = start + offset;
                const row = rows[index];
                assert.deepEqual(
                  [
                    row.from,
                    row.to,
                    row.ticks,
                    row.sample,
                    row.hit,
                    row.outlined,
                    row.passes.length,
                  ],
                  [
                    expected.from,
                    expected.to,
                    expected.ticks,
                    expected.sample,
                    expected.hit,
                    expected.outlined,
                    expected.passes.length,
                  ],
                  `count/time geometry, ray, cue or pass mismatch for ${kind} row ${index}`,
                );
                if (kind !== 'idle') {
                  const list = JSON.parse(
                    gunzipSync(
                      await readFile(`${out}/${kind}-count-list-${index}.json.gz`),
                    ).toString(),
                  );
                  assert.deepEqual(replay.lists[index]?.ids, list);
                  const work = JSON.parse(
                    gunzipSync(
                      await readFile(`${out}/${kind}-count-work-${index}.json.gz`),
                    ).toString(),
                  ) as ReplayWork;
                  assertReplayWork(index, row.passes.length, work, replay.counts[index]);
                }
              }
            }
            return visitFrom(kind, rows, replay, witness);
          },
        );
        visits.push(visit);
        nativeVisits++;
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
  stage = 'software live capture';
  await buildDiagnostic(resolve(out, 'bundle'));
  const { server, url } = await serve(`${out}/bundle`);
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({
      channel: 'chromium',
      headless: true,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const window: [number, number] = [8, 23];
    const targets = await withVisit(
      browser,
      url,
      'software-preflight',
      {
        kind: 'preflight',
        mode: 'time',
        smoke: true,
        window,
        runId,
      },
      async (page) => {
        const targets = await page.evaluate(
          (key) => (globalThis as unknown as Record<string, Bridge>)[key].resolve(),
          getBridge,
        );
        await softwareVolume(page);
        return targets;
      },
    );
    assert.ok(targets.shrine && targets.floor?.kind === 'floor');
    for (const kind of ['idle', 'shrine', 'floor'] as const) {
      const label = `software-${kind}-count`;
      await withVisit(
        browser,
        url,
        label,
        {
          kind,
          point: kind === 'idle' ? undefined : targets[kind]!.point,
          mode: 'count',
          smoke: true,
          window,
          runId,
          writerVisit: `${runId}:${label}`,
        },
        async (page, captured, writers) => {
          const status = await page.evaluate(
            (key) => (globalThis as unknown as Record<string, Bridge>)[key].status(),
            getBridge,
          );
          await save(`${label}-producer`, status);
          assert.ifError(status.fail ? new Error(status.fail) : null);
          assert.ok(writers?.status().sealed && captured);
          assert.match(captured.header.ready?.renderer ?? '', /SwiftShader/i);
          assert.equal(captured.header.input, kind === 'idle' ? 0 : 1);
          assert.equal(validateWindow(captured.rows, window), null);
          const writer = streamWriterReplay(writers.header());
          const replay = await page.evaluate(
            (key) => (globalThis as unknown as Record<string, Bridge>)[key].replay(false),
            getBridge,
          );
          await archive(`${label}-native-replay`, replay);
          assert.ok(replay.parity);
          let frames = 0;
          for await (const { frame } of writers.frames()) {
            const native: NativeRow = captured.rows[frames];
            assert.deepEqual([frame.from, frame.to], [native.from, native.to]);
            const evidence = writer.frame(frame);
            await archive(`${label}-writer-${frames}`, evidence);
            if (kind !== 'idle') assert.deepEqual(evidence.query?.ids, replay.lists[frames]?.ids);
            frames++;
          }
          assert.equal(frames, captured.rows.length);
          const gaps = writer.gaps();
          await save(`${label}-gaps`, gaps);
          assert.ok(!gaps.length, gaps[0]);
          const scratch = await scratchFrom(page, writers, {
            start: 0,
            length: frames,
            group: 'publish',
            active: true,
            repeats: 1,
            pad: 0,
          });
          assert.deepEqual(
            [scratch.result?.units, scratch.result?.ms],
            [writers.status().seq, null],
          );
          await save(`${label}-scratch`, scratch);
        },
      );
    }
  } finally {
    await browser?.close();
    server.close();
  }
  stage = 'smoke complete';
  run = transition(run, {
    type: 'invalid',
    reason:
      'NullEngine and live SwiftShader transport passed; software cannot authorize feasibility',
  }).state;
}

async function softwareVolume(page: Page) {
  stage = 'software transport volume';
  let sink: WriterArchive | undefined;
  await page.exposeBinding('__cursorVolumePage', ({ frame }, packet) => {
    if (frame !== page.mainFrame() || !sink) throw new Error('unexpected synthetic writer source');
    return sink.receive(packet);
  });
  for (const frames of [60, 120]) {
    const visit = `${runId}:volume-${frames}`;
    sink = await openWriterArchive(`${out}/volume-${frames}`, visit, [180, 179 + 5 * frames]);
    try {
      const producer = await page.evaluate(
        ([key, visit, frames]) =>
          (window as unknown as Record<string, Bridge>)[key].volume(visit, frames),
        [getBridge, visit, frames] as const,
      );
      await save(`volume-${frames}-producer`, producer);
      assert.equal(
        producer.kind,
        'sealed',
        producer.kind === 'failed' ? producer.reason : undefined,
      );
      assert.ok(producer.beforeEnd > 0, 'no persisted ACK before producer ended');
      assert.ok(producer.peakPageBytes <= 3 * pageBytes && producer.peakPending <= 2);
      assert.equal(producer.writes, frames * volumeWrites);
      assert.ok(producer.logicalScalars > 130_000_000);
      let i = 0;
      for await (const { frame, header } of sink.frames()) {
        assert.equal(header.seed.length, volumeMeshes);
        assert.equal(frame.writes.length, volumeWrites);
        assert.equal(frame.checks.length, 7);
        assert.deepEqual([frame.frame, frame.from, frame.to], [i, 179 + 5 * i, 184 + 5 * i]);
        assert.ok(
          frame.writes.some((w) => w.before !== w.after),
          'volume frame contains only unchanged references',
        );
        const expected = Array.from({ length: volumeChanging }, (_, id) => volumeOperand(id, i));
        for (const check of frame.checks) {
          assert.equal(check.scene.length, volumeMeshes);
          assert.deepEqual(check.scene.slice(0, volumeChanging), expected);
          assert.ok(
            check.scene
              .slice(volumeChanging)
              .every((o, j) => o === header.seed[j + volumeChanging]),
          );
        }
        for (const [j, w] of frame.writes.entries()) {
          assert.equal(w.seq, i * volumeWrites + j);
          assert.equal(w.id, j % volumeMeshes);
          if (j < volumeChanging) {
            assert.equal(w.kind, volumeKind(j));
            assert.deepEqual(w.before, volumeOperand(j, i - 1));
            assert.deepEqual(w.after, expected[j]);
          } else {
            assert.equal(w.kind, 'check');
            assert.equal(w.before, w.after);
            if (w.id >= volumeChanging) assert.equal(w.after, header.seed[w.id]);
          }
        }
        i++;
      }
      assert.equal(i, frames);
    } finally {
      await save(`volume-${frames}-sink`, sink.status());
    }
  }
}

if (arg === '--scaling') await captureScaling();
else {
  try {
    if (smoke) await softwareSmoke();
    else await collect();
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
