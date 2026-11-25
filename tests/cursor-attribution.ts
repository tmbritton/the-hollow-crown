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
import { offRayCredit, publishDemand, validateWindow } from './cursor-attribution-model.ts';
import { transition, workKinds } from './cursor-evidence.ts';
import type { RunState, Visit, WorkRates } from './cursor-evidence.ts';
import type { CaptureConfig, NativeRow, cursorDiagnostic } from './cursor-attribution-probe.ts';
import type { ScratchFrame } from './cursor-attribution-replay.ts';
import { scratchCoverage } from './cursor-attribution-replay.ts';
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
console.log(out);
const save = (name: string, data: unknown) =>
  writeFile(`${out}/${name}.json`, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
const archive = (name: string, data: unknown) =>
  writeFile(`${out}/${name}.json.gz`, gzipSync(JSON.stringify(data)), { flag: 'wx' });
let run: RunState = { kind: 'planned' };
let stage = 'host';
let nativeVisits = 0;
let countVisits = 0;
const windowTicks: [number, number] = smoke ? [5, 10] : [180, 480];
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
function handshake(meta: Ready, reference: Ready | null) {
  assert.equal(meta.seed, 'MOURNING-731');
  assert.equal(meta.navigation, 'navigate');
  assert.equal(meta.steps, 0);
  assert.equal(meta.quality, 'high');
  assert.equal(meta.webgl, 2);
  assert.equal(meta.visible, true);
  assert.equal(meta.focused, true);
  assert.ok(meta.renderer);
  if (!smoke) assert.match(meta.renderer, /GeForce RTX 2070(?:\/|,|\))/);
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
  work: (page: Page) => Promise<T>,
) {
  stage = label;
  if (!smoke) {
    const gpu = smi();
    await save(`${label}-gpu-before`, gpu);
    if (!gpu.ok) throw new Error('matched GPU unavailable before visit');
  }
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
    await page.goto(url, { timeout: 45000 });
    await page.waitForFunction(
      (key) => {
        const b = (window as unknown as Record<string, Bridge>)[key];
        return b?.status().done || b?.status().fail || !!document.querySelector('#loading.failed');
      },
      getBridge,
      { timeout: smoke ? 60000 : 90000, polling: 250 },
    );
    assert.deepEqual(errors, []);
    const result = await work(page);
    assert.deepEqual(errors, []);
    if (!smoke) {
      const gpu = smi();
      await save(`${label}-gpu-after`, gpu);
      if (!gpu.ok) throw new Error('matched device lost after visit');
    }
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
const occupants = (poses: NativeRow['sample']['poses']) =>
  poses.map((p, id) => ({ id, bounds: p.bounds }));
function scratchFrames(
  rows: NativeRow[],
  replay: ReturnType<Bridge['replay']>,
  previous?: NativeRow['sample']['poses'],
): ScratchFrame[] {
  return rows.map((row, i) => {
    const list = replay.lists.find((v) => v.i === i);
    const rates: Record<string, number> = {
      traverse: list?.traversal ?? 0,
      assemble: list?.entries.length ?? 0,
      order: list?.entries.length ?? 0,
    };
    for (const phase of row.writerPhases) {
      const a = previous ?? phase;
      const { rates: d } = publishDemand(occupants(a), occupants(phase));
      for (const [key, n] of Object.entries(d)) rates[key] = (rates[key] ?? 0) + n;
      for (const [id, p] of phase.entries()) {
        const old = a[id];
        const n = Math.max(p.thinCount, old.thinCount);
        rates.bounds += n;
        rates.diff += p.thinCount + old.thinCount;
        if (
          p.parent !== old.parent ||
          p.enabled !== old.enabled ||
          p.visible !== old.visible ||
          p.visibility !== old.visibility ||
          p.alpha !== old.alpha ||
          p.thinPick !== old.thinPick ||
          p.world.some((x, j) => x !== old.world[j]) ||
          p.thin?.some((x, j) => x !== old.thin?.[j])
        )
          rates.invalidate += 1 + n;
        rates.remove += Math.max(0, old.thinCount - p.thinCount);
        rates.insert += Math.max(0, p.thinCount - old.thinCount);
      }
      previous = phase;
    }
    if (row.writerPhases.length < row.ticks + 2)
      throw new Error('missing fixed tick or presentation writer phase');
    return { rates, entries: list?.entries ?? [], bounds: row.sample.poses.map((p) => p.bounds) };
  });
}

function visitFrom(
  kind: Visit['kind'],
  rows: NativeRow[],
  replay: ReturnType<Bridge['replay']>,
  charges: ScratchFrame[],
  countRows: NativeRow[],
): Visit {
  if (!countRows.length || !charges.length || !replay.parity)
    throw new Error('missing count or replay evidence');
  if (
    kind !== 'idle' &&
    !countRows.every(
      (row) =>
        row.passes.length > 0 && row.passes.every((pass) => pass.work && pass.work.visits > 0),
    )
  ) {
    throw new Error('missing native count-mode pass boundaries');
  }
  const localCharges = scratchFrames(rows, replay);
  const demand: WorkRates = {};
  for (const op of workKinds)
    demand[op] = Math.max(...charges.map((r) => finite(r.rates[op] ?? null)));
  // Bound timed writer demand using the more expensive count visit, scaled conservatively
  // by actual tick density. Query demand also includes the actual timed frame list.
  const normalized = Math.max(1, ...countRows.map((r) => r.ticks + 2));
  const frameDemand = (row: NativeRow, i: number) => {
    const adjusted = { ...demand };
    const list = replay.lists.find((v) => v.i === i);
    adjusted.traverse = Math.max(adjusted.traverse!, list?.traversal ?? 0);
    adjusted.assemble = Math.max(adjusted.assemble!, list?.entries.length ?? 0);
    adjusted.order = Math.max(adjusted.order!, list?.entries.length ?? 0);
    for (const op of ['bounds', 'diff', 'remove', 'insert', 'invalidate'] as const)
      adjusted[op] = Math.max(
        finite(localCharges[i].rates[op]),
        Math.ceil(adjusted[op]! * Math.max(1, (row.ticks + 2) / normalized)),
      );
    return adjusted;
  };
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
    registration: { ms: finite(replay.registration.ms), bytes: replay.registration.bytes },
    replay:
      kind === 'idle'
        ? null
        : {
            exhaustive: finite(replay.exhaustive),
            local: finite(replay.local),
            parity: replay.parity,
          },
    frames: rows.map((r, i) => ({
      pick: finite(r.pick),
      pickScopes: [],
      ticks: r.ticks,
      rig: finite(r.rig),
      eligibilityOutline: finite(r.cue),
      renderCpu: finite(r.renderCpu),
      gpu: r.gpu,
      demand: frameDemand(r, i),
    })),
  };
}

async function collect() {
  const gpu = smoke ? null : smi();
  stage = 'production input pin';
  const production = await pinProductionInputs();
  await save('provenance', {
    production,
    toolHead: git('rev-parse', 'HEAD'),
    toolBranch: git('branch', '--show-current'),
    time: new Date().toISOString(),
    smoke,
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
  await save('writer-coverage', scratchCoverage);
  stage = 'host';
  if (!smoke && !gpu?.ok) {
    run = transition(run, {
      type: 'unavailable',
      reason: 'No working matched RTX 2070 before browser launch',
    }).state;
    return;
  }
  if (!smoke) {
    assert.match(cpus()[0]?.model ?? '', /Ryzen 5 2600X/);
  }
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
      headless: smoke,
      timeout: 15000,
      args: smoke
        ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
        : ['--ignore-gpu-blocklist', '--window-position=32,32', '--window-size=1980,1210'],
    });
    await save('browser', { version: browser.version(), url });
    const preflight = await withVisit(
      browser,
      url,
      'preflight',
      { kind: 'preflight', mode: 'time', smoke, window: windowTicks },
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
        const refreshHz = smoke
          ? null
          : await page.evaluate(async () => {
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
        if (!smoke)
          assert.ok(
            refreshHz !== null && Math.abs(refreshHz - 59.95) <= 1,
            'unmatched foreground RAF refresh',
          );
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
    const read = async (page: Page, kind: Kind, reverse: boolean) => {
      const meta = await page.evaluate(
        (key) => (window as unknown as Record<string, Bridge>)[key].take(0, 0),
        getBridge,
      );
      assert.ok(meta.ready);
      handshake(meta.ready, preflight.meta);
      await save(`${stage}-header`, meta);
      const rows: NativeRow[] = [];
      for (let i = 0; i < meta.length; i += 4) {
        const chunk = await page.evaluate(
          ([key, start]) =>
            (window as unknown as Record<string, Bridge>)[key].take(start, start + 4).rows,
          [getBridge, i] as const,
        );
        await archive(`${stage}-frames-${i}`, chunk);
        rows.push(...chunk);
      }
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
    const counts = new Map<Kind, { rows: NativeRow[]; scratch: ScratchFrame[] }>();
    const visits: Visit[] = [];
    let unitBatches: WorkRates[] = [];
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
          smoke,
          window: windowTicks,
          expectedReady: JSON.stringify(preflight.meta),
        },
        async (page) => {
          const { rows, replay } = await read(page, kind, false);
          counts.set(kind, { rows, scratch: scratchFrames(rows, replay) });
          countVisits++;
          if (kind === 'idle') {
            const inputs = [...counts.values()].flatMap((c) => c.scratch);
            const scratch = await page.evaluate(
              ([key, frames]) => (window as unknown as Record<string, Bridge>)[key].scratch(frames),
              [getBridge, inputs] as const,
            );
            await save('scratch', scratch);
            assert.deepEqual(scratch.coverage, scratchCoverage);
            if (smoke) assert.equal(scratch.coverage.kind, 'unmeasured');
            unitBatches = scratch.batches.map((batch) =>
              Object.fromEntries(
                workKinds.flatMap((key) => {
                  const record = batch[key];
                  return record?.rate != null ? [[key, record.rate]] : [];
                }),
              ),
            );
          }
        },
      );
    }
    for (const kind of kinds)
      for (let i = 0; i < (kind === 'shrine' && !smoke ? 3 : 1); i++) {
        const point = kind === 'idle' ? undefined : preflight[kind];
        await withVisit(
          browser,
          url,
          `${kind}-time-${i + 1}`,
          {
            kind,
            point,
            mode: 'time',
            smoke,
            window: windowTicks,
            expectedReady: JSON.stringify(preflight.meta),
          },
          async (page) => {
            const { rows, replay } = await read(page, kind, i % 2 === 1);
            nativeVisits++;
            const counted = counts.get(kind)!;
            if (smoke) {
              assert.ok(rows.every((r) => r.pick === null && r.renderCpu === null));
              assert.equal(replay.exhaustive, null);
              assert.throws(
                () => visitFrom(kind, rows, replay, counted.scratch, counted.rows),
                /missing/,
              );
            } else visits.push(visitFrom(kind, rows, replay, counted.scratch, counted.rows));
          },
        );
      }
    if (smoke) {
      stage = 'smoke complete';
      assert.equal(nativeVisits, 3);
      assert.equal(countVisits, 3);
      run = transition(run, {
        type: 'invalid',
        reason:
          'Correctness-only smoke passed; software and absent timing inputs cannot authorize feasibility',
      }).state;
    } else {
      stage = 'decision';
      const gpu = smi();
      await save('gpu-after', gpu);
      if (!gpu.ok) throw new Error('matched device lost');
      await save('ledger-input', { visits, unitBatches, writerCoverage: scratchCoverage });
      run = transition(run, {
        type: 'complete',
        evidence: {
          hardware: 'matched',
          scaling,
          matched: true,
          completeWindows: true,
          writerCoverage: scratchCoverage,
          shrine: visits.filter((v) => v.kind === 'shrine'),
          floor: visits.find((v) => v.kind === 'floor')!,
          idle: visits.find((v) => v.kind === 'idle')!,
          unitBatches,
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

if (arg === '--scaling') await captureScaling();
else {
  try {
    await collect();
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
