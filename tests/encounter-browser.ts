import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, loadavg, release, totalmem } from 'node:os';
import { join } from 'node:path';
import { cases, recipe } from '../src/encounterRecipe.ts';
import { rendererKind } from '../src/cpuMetrics.ts';
import type { DebugWindow } from './browserTypes.ts';
import type { Capture, Visit } from './encounter-report.ts';
import { startDifferences } from './encounter-report.ts';
import { bindRoot, sha256, sourceManifest, validateSourceArchive } from './encounter-source.ts';
import {
  approachProtocol,
  encodeTraceVisit,
  frozenReference,
  inspectAttempt,
  prevalidateNative,
  sealTraceBatch,
  traceBatchState,
  traceReport,
  traceSourceStable,
} from './encounter-trace-archive.ts';
import { bounded, traceLimits } from './encounter-trace-cdp.ts';
import {
  desktopLock,
  nextTraceAttempt,
  recordApproach,
  tracePlan,
} from './encounter-trace-visit.ts';
import { withViteServer } from './testServer.ts';

declare const window: DebugWindow;
const modes = ['off', 'coarse', 'detailed'] as const;
const qualities = ['low', 'high'] as const;
function select<T extends string>(key: string, allowed: readonly T[]): T[] {
  const list = (process.env[key] ?? allowed.join()).split(',');
  assert.equal(list.length, new Set(list).size);
  return list.map((value) => {
    const selected = allowed.find((candidate) => candidate === value);
    assert.ok(selected, `Invalid ${key}: ${value}`);
    return selected;
  });
}
const repeats = Number(process.env.CPU_REPEATS ?? 3);
assert.ok(Number.isInteger(repeats) && repeats >= 1 && repeats <= 3);
const pair = process.env.CPU_PAIR;
const repeatNumber = Number(process.env.CPU_REPEAT_NUMBER ?? 1);
assert.ok(
  [1, 2, 3].includes(repeatNumber) &&
    (pair ? repeats === 1 && /^[\w-]+$/.test(pair) : repeatNumber === 1),
);
const selectedCases = select('CPU_CASES', cases);
const selectedModes = select('CPU_MODES', modes);
const selectedQualities = select('CPU_QUALITIES', qualities);
const label = process.env.CPU_LABEL ?? 'baseline';
assert.match(label, /^[\w-]{1,60}$/);
const gpu = process.env.CPU_GPU ?? 'hardware';
assert.ok(gpu === 'hardware' || gpu === 'software');
const hardware = gpu === 'hardware';
const base = process.env.DEMO_URL ?? 'http://127.0.0.1:5471';
const display = process.env.CPU_DISPLAY ?? 'default';
assert.ok(['default', 'wayland', 'x11'].includes(display));
assert.ok([undefined, 'approach-v4', 'prevalidate-v4'].includes(process.env.CPU_TRACE));
const tracing = !!process.env.CPU_TRACE;
const preflightOnly = process.env.CPU_TRACE === 'prevalidate-v4';
if (tracing) {
  assert.ok(
    hardware &&
      display === 'wayland' &&
      !process.env.CPU_TRIAL &&
      !pair &&
      repeats === 3 &&
      selectedQualities.join() === 'low' &&
      selectedModes.join() === 'off' &&
      label === (preflightOnly ? 'native-r6-v4' : 'trace-r6-v4'),
    'Trace requires matched headed Wayland Low/off settings and three repeats',
  );
}
const root = await bindRoot(import.meta.url);
const batchId = randomUUID();
const nonce = randomUUID();
const output = join('test-results', 'encounter', `${label}-${batchId.slice(0, 8)}`);
await mkdir(output, { recursive: true });
console.log(output);
const writeBytes = async (file: string, bytes: string) => {
  await writeFile(join(output, file), bytes, { flag: 'wx' });
  return sha256(bytes);
};
const write = (file: string, value: unknown) =>
  writeBytes(file, `${JSON.stringify(value, null, 2)}\n`);
const optionalCommand = (bin: string, args: string[]) => {
  try {
    return (
      execFileSync(bin, args, {
        encoding: 'utf8',
        timeout: 2000,
        killSignal: 'SIGKILL',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || 'unknown'
    );
  } catch {
    return 'unknown';
  }
};
const screenLock = () =>
  optionalCommand('qdbus', [
    'org.freedesktop.ScreenSaver',
    '/ScreenSaver',
    'org.freedesktop.ScreenSaver.GetActive',
  ]);
const host = {
  cpu: cpus()[0]?.model,
  logicalCpus: cpus().length,
  os: `${process.platform} ${release()}`,
  node: process.version,
  ram: totalmem(),
  display,
  session: process.env.XDG_SESSION_TYPE ?? 'unknown',
  refreshHz: Number(process.env.CPU_REFRESH_HZ) || 'unknown',
  power: optionalCommand('powerprofilesctl', ['get']),
};
const args = hardware
  ? [
      '--no-sandbox',
      '--ignore-gpu-blocklist',
      ...(display === 'default' ? [] : [`--ozone-platform=${display}`]),
    ]
  : [
      '--no-sandbox',
      '--ozone-platform=headless',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ];
const source = await sourceManifest(output, root);
const trialPath = process.env.CPU_TRIAL;
const trialBytes = trialPath ? await readFile(trialPath) : undefined;
if (trialBytes) {
  assert.ok(pair, 'Preregistered trial requires a paired visit batch');
  await writeFile(join(output, 'trial-registration.json'), trialBytes, { flag: 'wx' });
}
const recipeHash = sha256(JSON.stringify(recipe));
const plan = selectedCases.flatMap((name) =>
  selectedQualities.flatMap((quality) =>
    selectedModes.flatMap((mode) =>
      Array.from({ length: repeats }, (_, i) => ({
        name,
        quality,
        mode,
        repeat: i + repeatNumber,
        id: `${name}-${quality}-${mode}-${i + repeatNumber}`,
      })),
    ),
  ),
);
if (tracing) {
  plan.splice(0, plan.length, ...tracePlan);
}
await write('manifest.json', {
  source,
  recipe,
  recipeHash,
  plan,
  host,
  args,
  base,
  gpu,
  cwd: process.cwd(),
  root,
  batchId,
  traceProtocol: tracing ? approachProtocol : undefined,
  nonce: tracing ? nonce : undefined,
  trialHash: trialBytes && sha256(trialBytes),
  diagnostic: tracing ? 'approach-trace' : undefined,
  limits: tracing ? traceLimits : undefined,
  command: `${tracing ? `CPU_TRACE=${process.env.CPU_TRACE} ` : ''}CPU_CASES=${selectedCases} CPU_QUALITIES=${selectedQualities} CPU_MODES=${selectedModes} CPU_REPEATS=${repeats} ${pair ? `CPU_PAIR=${pair} CPU_REPEAT_NUMBER=${repeatNumber} ` : ''}CPU_LABEL=${label} CPU_GPU=${gpu} CPU_DISPLAY=${display} DEMO_URL=${base} node tests/encounter-browser.ts`,
});
const entries: { file: string; sha256: string }[] = [];
const traceRows: Awaited<ReturnType<typeof inspectAttempt>>[] = [];
const makeVisit = (cell: (typeof plan)[number], extra: Partial<Visit>) =>
  ({
    ...cell,
    sourceDigest: source.digest,
    recipeHash,
    host,
    load: loadavg(),
    ...extra,
  }) satisfies Visit & { load: number[] };
const save = async (cell: (typeof plan)[number], extra: Partial<Visit>) => {
  const file = `${cell.id}.json`;
  let visit = makeVisit(cell, extra);
  let bytes: string;
  if (tracing) {
    try {
      bytes = encodeTraceVisit(visit);
    } catch (err) {
      visit = makeVisit(cell, {
        error: `Invalid live visit shape: ${String(err)}`,
        diagnostic: extra.diagnostic,
      });
      bytes = encodeTraceVisit(visit);
    }
    // Use the exact same bytes as offline replay, not the Playwright object.
    visit = JSON.parse(bytes);
  } else bytes = `${JSON.stringify(visit, null, 2)}\n`;
  entries.push({ file, sha256: await writeBytes(file, bytes) });
  console.log(
    `${cell.id}: ${extra.error ?? extra.capture?.reason ?? extra.capture?.witness.phase ?? 'missing capture'}`,
  );
  return visit;
};
let viteRoot: string | undefined;
let rootIdentity: { nonce: string; cwd: string; root: string } | undefined;
let setupError: string | undefined;
let nativeGatePassed: true | undefined;
let reference: Awaited<ReturnType<typeof frozenReference>> | undefined;
try {
  if (source.privateInputs.length || source.entries.some((entry) => entry.path.startsWith('.env')))
    throw new Error('Local environment inputs must be removed or isolated before capture');
  if (!(await validateSourceArchive(output, source, root)))
    throw new Error('Source reconstruction failed');
  if (tracing) {
    reference = await frozenReference(source);
    await write('r6-source-diff.json', reference.differences);
    assert.deepEqual(host, reference.batch.manifest.host, 'Frozen R6 host differs');
    assert.deepEqual(args, reference.batch.manifest.args, 'Frozen R6 launch arguments differ');
  }
  await withViteServer(
    base,
    'dev',
    async () => {
      const identity = await (
        await fetch(`${base}/__encounter-root`, { signal: AbortSignal.timeout(2000) })
      ).json();
      assert.deepEqual(identity, { nonce, cwd: root, root });
      viteRoot = identity.root;
      rootIdentity = identity;
      if (tracing) await write('root-identity.json', identity);
      if (tracing) {
        const locked = screenLock();
        await write('desktop.json', {
          locked,
          display,
          waylandDisplay: process.env.WAYLAND_DISPLAY,
          nvidia: optionalCommand('nvidia-smi', [
            '--query-gpu=name,driver_version',
            '--format=csv,noheader',
          ]),
          rootIdentity: identity,
        });
        // A locked compositor cannot provide the foreground presentation control.
        assert.equal(
          desktopLock(locked),
          'unlocked',
          `Wayland session lock status: ${desktopLock(locked)}; explicit unlock required`,
        );
      }
      const server = await chromium.launchServer({ headless: !hardware, timeout: 12000, args });
      try {
        const browser = await chromium.connect(server.wsEndpoint(), { timeout: 5000 });
        const browserVersion = browser.version();
        if (hardware) {
          const blank = await bounded('Blank headed page', 6000, () => browser.newPage());
          try {
            await bounded('Blank WebGL2 foreground preflight', 6000, async () => {
              await blank.bringToFront();
              const gl = await blank.evaluate(() => {
                const context = document.createElement('canvas').getContext('webgl2');
                const debug = context?.getExtension('WEBGL_debug_renderer_info');
                return (
                  context &&
                  debug && {
                    renderer: context.getParameter(debug.UNMASKED_RENDERER_WEBGL),
                    vendor: context.getParameter(debug.UNMASKED_VENDOR_WEBGL),
                    webgl: 2,
                    foreground: document.hasFocus() && !document.hidden,
                  }
                );
              });
              assert.ok(
                gl?.foreground && rendererKind(gl.renderer, gl.vendor) === 'hardware',
                'Blank preflight failed',
              );
              await write('preflight.json', gl);
              if (tracing) assert.match(gl.renderer, /RTX 2070/);
            });
          } finally {
            await bounded('Blank page shutdown', 5000, () => blank.close());
          }
        }
        let gpuSystem: unknown;
        if (hardware) {
          const session = await browser.newBrowserCDPSession();
          gpuSystem = (
            await bounded('GPU identity', 5000, () => session.send('SystemInfo.getInfo'))
          ).gpu;
          await session.detach();
        }
        const runVisit = async (cell: (typeof plan)[number], nativeGate = false) => {
          const started = Date.now();
          const attemptStart = performance.now();
          let context: Awaited<ReturnType<typeof browser.newContext>> | undefined;
          const errors: string[] = [];
          let capture: Capture | undefined;
          let graphics: Visit['graphics'];
          let error: string | undefined;
          const cleanupErrors: string[] = [];
          let trace: Awaited<ReturnType<typeof recordApproach>> | undefined;
          const raw = join(output, `${cell.id}.trace.json`);
          try {
            const active = await bounded('Browser context', 10000, () =>
              browser.newContext({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 1 }),
            ).catch((err: unknown) => {
              if (String(err).includes('Browser context exceeded'))
                cleanupErrors.push('Browser context creation timed out; cleanup unconfirmed');
              throw err;
            });
            context = active;
            const page = await bounded('Browser page', 10000, () => active.newPage());
            page.on('pageerror', (e) => errors.push(e.message));
            await page.goto(`${base}/?debug&seed=${recipe.seed}`, {
              waitUntil: 'commit',
              timeout: 30000,
            });
            await page.waitForFunction(() => window.__dungeon?.ready, null, {
              timeout: 45000,
              polling: 200,
            });
            if (hardware) await bounded('Bring foreground', 5000, () => page.bringToFront());
            const gl = await bounded('Visit graphics preflight', 5000, () =>
              page.evaluate(() => ({
                ...window.__dungeon.engine.getGlInfo(),
                webgl: window.__dungeon.engine.webGLVersion,
                foreground: document.hasFocus() && !document.hidden,
              })),
            );
            graphics = {
              ...gl,
              browserVersion,
              hardware: rendererKind(gl.renderer, gl.vendor) === 'hardware',
              gpuSystem,
            };
            if (hardware && (!graphics.hardware || gl.webgl !== 2 || !gl.foreground))
              throw new Error('Hardware WebGL2 foreground verification failed');
            if (tracing && !nativeGate) {
              trace = await recordApproach(browser, page, cell, raw);
              capture = trace.capture;
              error = trace.error;
              if (trace.cleanupError) cleanupErrors.push(trace.cleanupError);
            } else
              capture = await bounded('Native encounter', recipe.deadlineMs + 10000, () =>
                page.evaluate(({ name, mode, quality }) => {
                  const select = document.querySelector<HTMLSelectElement>('#quality');
                  if (!select) throw new Error('Quality UI missing');
                  select.value = quality;
                  select.dispatchEvent(new Event('change'));
                  return window.__dungeon.encounter.run(name, mode);
                }, cell),
              );
            try {
              const clean = await bounded('Encounter cleanup check', 5000, () =>
                page.evaluate(
                  () =>
                    !window.__dungeon.cpu.active &&
                    !window.__dungeon.game.combat.encounterAttack &&
                    !window.__dungeon.game.combat.encounterSquad,
                ),
              );
              if (!clean) throw new Error('Encounter hooks leaked');
            } catch (err) {
              cleanupErrors.push(String(err));
            }
          } catch (err) {
            error ??= String(err);
          }
          const extra: Partial<Visit> = {
            graphics,
            capture,
            error:
              [error, ...errors, ...(!tracing ? cleanupErrors : [])].filter(Boolean).join('\n') ||
              undefined,
            diagnostic: nativeGate
              ? 'approach-prevalidation'
              : tracing
                ? 'approach-trace'
                : undefined,
            pair: pair
              ? { id: `${pair}-${cell.id}`, batch: batchId, started, ended: Date.now() }
              : undefined,
          };
          if (context) {
            const active = context;
            await bounded('Context shutdown', 5000, () => active.close()).catch((err: unknown) => {
              if (!tracing) throw err;
              cleanupErrors.push(String(err));
            });
          }
          if (nativeGate) {
            assert.deepEqual(cleanupErrors, [], `${cell.name} native cleanup failed`);
            const frozen = reference!.batch.rows.find((r) => r.visit.id === cell.id)!.visit;
            const live = makeVisit(cell, extra);
            await writeBytes(`native-${cell.name}.json`, encodeTraceVisit(live));
            const { bytes, ...checks } = prevalidateNative(frozen, live);
            assert.equal(bytes, await readFile(join(output, `native-${cell.name}.json`), 'utf8'));
            await write(`native-${cell.name}.checks.json`, checks);
            console.log(`${cell.name} native live/wire: ${JSON.stringify(checks)}`);
            assert.deepEqual(
              [...checks.witness, ...checks.parity],
              [],
              `${cell.name} native prevalidation failed`,
            );
            return;
          }
          const visit = await save(cell, extra);
          if (!tracing) return;
          const timing = { started: attemptStart, ended: performance.now() };
          const check = await sourceManifest(undefined, root);
          const evidence = {
            check,
            status: trace?.status,
            cleanupError: cleanupErrors.join('\n') || undefined,
            timing,
          };
          await write(`${cell.id}.evidence.json`, evidence);
          const row = await inspectAttempt(
            output,
            visit,
            reference!,
            source,
            recipeHash,
            evidence,
            approachProtocol,
          );
          trace?.finish(!row.issues.length);
          await write(`${cell.id}.alignment.json`, { ...row, lifecycle: trace?.lifecycle });
          traceRows.push(row);
          if (row.issues.length) console.error(`${cell.id}: ${row.issues.join('; ')}`);
        };
        if (tracing) {
          const gateErrors: string[] = [];
          for (const cell of tracePlan.slice(0, 2)) {
            try {
              await runVisit(cell, true);
            } catch (err) {
              gateErrors.push(`${cell.name}: ${String(err)}`);
              if (String(err).includes('cleanup failed')) break;
            }
          }
          assert.deepEqual(gateErrors, [], 'Native prevalidation failed; no timed collection');
          assert.ok(
            traceSourceStable(
              source,
              await sourceManifest(undefined, root),
              rootIdentity,
              root,
              nonce,
            ),
            'Source changed during native prevalidation',
          );
          nativeGatePassed = true;
          for (
            let cell = preflightOnly ? undefined : nextTraceAttempt(traceRows);
            cell;
            cell = nextTraceAttempt(traceRows)
          ) {
            assert.equal(desktopLock(screenLock()), 'unlocked', 'Desktop locked before trace slot');
            if (cell.replacementFor)
              console.log(`${cell.id}: replacing failed ${cell.replacementFor}`);
            await runVisit(cell);
          }
        } else {
          for (const cell of plan) await runVisit(cell);
        }
      } finally {
        await server.kill();
      }
    },
    true,
    { root, nonce },
  );
} catch (err) {
  const error = String(err);
  if (tracing) setupError = error;
  else
    for (const cell of plan.filter(({ id }) => !entries.some(({ file }) => file === `${id}.json`)))
      await save(cell, { error });
}
const after = await sourceManifest(undefined, root);
const unchanged = tracing
  ? traceSourceStable(source, after, rootIdentity, root, nonce)
  : !!viteRoot && !startDifferences(source, after).length;
const batchState = tracing ? traceBatchState(traceRows, unchanged, setupError) : undefined;
if (tracing) {
  if (setupError) await write('setup-error.json', { error: setupError });
  await write(
    'trace-report.json',
    traceReport(traceRows, batchState!, setupError, approachProtocol),
  );
}
await write('index.json', {
  entries,
  after,
  viteRoot,
  unchanged: batchState?.unchanged ?? unchanged,
  setupError,
  nativeGatePassed,
  complete: batchState?.complete,
});
if (tracing) {
  await sealTraceBatch(output);
  if (setupError || (!preflightOnly && !batchState?.complete)) {
    console.error(setupError ?? 'Incomplete approach trace batch; review trace-report.json');
    process.exitCode = 1;
  }
}
