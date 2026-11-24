import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import type { Browser, CDPSession, Page } from '@playwright/test';
import { warmupTraceGate } from '../src/encounterCapture.ts';
import { recipe } from '../src/encounterRecipe.ts';
import { sha256, sourceManifest } from './encounter-source.ts';
import type { Visit } from './encounter-report.ts';
import { callbackTickBudget, openBatch } from './encounter-report.ts';
import type { DebugWindow } from './browserTypes.ts';
import { withViteServer } from './testServer.ts';
import {
  desktopLock,
  nextTraceAttempt,
  recordApproach,
  tracePlan,
} from './encounter-trace-visit.ts';
import {
  sealTraceBatch,
  traceBatchState,
  traceReport,
  verifyTraceBatch,
  verifyAttemptTiming,
  verifySourceDiff,
  traceParity,
  replayLooseCargoOwners,
  requireReplayParity,
  shouldReplayNativeGate,
  frozenPath,
  prevalidateNative,
} from './encounter-trace-archive.ts';
import { createBrowserTrace, traceLimits } from './encounter-trace-cdp.ts';
import {
  alignMarks,
  classifyEvidence,
  decodeSamples,
  linkPresentedFrame,
  hasCrossProcessFrame,
  frameControlIssue,
  parseTrace,
  linkedFlows,
  selectWindows,
  traceIssues,
  transitionTrace,
} from './encounter-trace.ts';
import type { MotionFrame, TraceEvent } from './encounter-trace.ts';

declare const window: DebugWindow;

test('only explicit ScreenSaver false authorizes launch', () => {
  assert.equal(desktopLock('false'), 'unlocked');
  assert.equal(desktopLock('true'), 'locked');
  for (const value of ['unknown', '', '0', 'False', 'false\ntrue', undefined])
    assert.equal(desktopLock(value), 'unknown');
});

test('archived source differences omit only undefined sides, not hashes', () => {
  const differences = [
    { path: 'added', current: 'new', frozen: undefined },
    { path: 'changed', current: 'new', frozen: 'old' },
  ];
  const saved = JSON.parse(JSON.stringify(differences));
  assert.doesNotThrow(() => verifySourceDiff(saved, differences));
  assert.throws(() => verifySourceDiff([{ ...saved[0], frozen: null }, saved[1]], differences));
  assert.throws(() =>
    verifySourceDiff([saved[0], { path: 'changed', current: 'new' }], differences),
  );
});

test('v3 treats own undefined object fields like absent JSON fields, not present values', () => {
  const make = (evidence: unknown) => ({ capture: { facts: [{ evidence }] } }) as Visit;
  const a = make({});
  assert.deepEqual(traceParity(a, make({ opt: undefined }), 2), ['gameplay.0.evidence.opt']);
  assert.deepEqual(traceParity(a, make({ opt: undefined }), 3), []);
  for (const opt of [null, 0, false, '', NaN, {}, []])
    assert.deepEqual(traceParity(a, make({ opt }), 3), ['gameplay.0.evidence.opt']);
  assert.ok(traceParity(make([]), make([undefined]), 3).includes('gameplay.0.evidence.0'));
});

test('v3 rejects a change in array length even when the added slot is a hole', () => {
  const make = (tuple: unknown[]) => ({ capture: { facts: [{ evidence: tuple }] } }) as Visit;
  const original = [null];
  const extended = [...original];
  extended.length++;
  assert.deepEqual(traceParity(make(original), make(extended), 3), ['gameplay.0.evidence.length']);
  assert.deepEqual(traceParity(make(extended), make(original), 3), ['gameplay.0.evidence.length']);
});

test('v3 only tolerates a settled target-Y binary64 residual, not other camera or gameplay drift', () => {
  const ulp = 2 ** -53;
  const make = (y: number, z = 0, evidence = 0) =>
    ({
      capture: { start: { camera: [Math.PI / 2, 0.64, 27, 0, y, z] }, facts: [{ evidence }] },
    }) as Visit;
  const a = make(0.75);
  assert.deepEqual(traceParity(a, make(0.75 - 4 * ulp), 3), []);
  assert.deepEqual(traceParity(a, make(0.75 - 5 * ulp), 3), ['start.camera.4']);
  assert.deepEqual(traceParity(a, make(0.75, ulp, ulp), 3), [
    'gameplay.0.evidence',
    'start.camera.5',
  ]);
  assert.deepEqual(traceParity(make(1), make(1 + 2 * ulp), 3), ['start.camera.4']);
});

test('historical live replay restores only cargo owner slots known to be absent', () => {
  const make = (cargo: unknown[]) =>
    ({
      capture: { start: { camera: [], state: { detail: { authority: { cargo } } } }, facts: [] },
    }) as unknown as Visit;
  const position = { x: 1, z: 2, h: 0, heading: 0 };
  const visit = make([['tribute:cargo:0', 'loose', 0, null, position]]);
  const live = replayLooseCargoOwners(visit);
  assert.deepEqual(traceParity(visit, live, 3), ['start.state.detail.authority.cargo.0.3']);
  assert.equal(traceParity(visit, JSON.parse(JSON.stringify(live)), 3).length, 0);
  assert.throws(() =>
    replayLooseCargoOwners(make([['tribute:cargo:0', 'loose', 0, 'player', position]])),
  );
  assert.throws(() =>
    replayLooseCargoOwners(make([['tribute:cargo:0', 'carried', 0, null, position]])),
  );
});

test('v4 uses the persisted witness without letting JSON hide malformed live tuples', () => {
  const position = { x: 1, z: -2, h: 0, heading: 0 };
  const row = ['tribute:cargo:0', 'loose', 0, undefined, position];
  const visit = (tuple: unknown[], evidence: unknown = {}) =>
    ({
      capture: {
        start: { camera: [], state: { detail: { authority: { cargo: [tuple] } } } },
        facts: [{ evidence }],
      },
    }) as unknown as Visit;
  const wire = JSON.parse(JSON.stringify(visit(row)));
  const path = 'start.state.detail.authority.cargo.0';
  assert.deepEqual(traceParity(wire, visit(row, { opt: undefined }), 4), []);
  assert.deepEqual(traceParity(wire, visit(row, { opt: null }), 4), ['gameplay.0.evidence.opt']);
  const change = (slot: number, value: unknown) => row.map((v, i) => (slot === i ? value : v));
  assert.deepEqual(traceParity(wire, visit(change(3, 'player')), 4), [`${path}.3`]);
  assert.deepEqual(traceParity(wire, visit(change(4, { ...position, z: 2 })), 4), [`${path}.4.z`]);
  assert.throws(
    () => traceParity(wire, visit(change(4, { ...position, z: Infinity })), 4),
    /finite/,
  );
  const hole = [...row];
  delete hole[3];
  assert.throws(() => traceParity(wire, visit(hole), 4), /hole/);
  assert.throws(() => traceParity(wire, visit([...row, null]), 4), /cargo tuple/);
  assert.throws(() => traceParity(wire, visit(row, [NaN]), 4), /finite/);
  assert.throws(
    () => traceParity(visit(row, [null]), visit(row, [undefined]), 4),
    /undefined array/,
  );
  const carried = [...row];
  carried[1] = 'carried';
  assert.throws(() => traceParity(wire, visit(carried), 4), /undefined array/);
});

test('v4 trailing frame alone can drain carry left by a terminal tick', () => {
  assert.equal(callbackTickBudget(0, false), 5);
  assert.equal(callbackTickBudget(1, false), 5); // old archive contract
  assert.equal(callbackTickBudget(1, true), 9);
  assert.equal(callbackTickBudget(4, true), 6); // fresh door reproduction
  assert.equal(callbackTickBudget(5, true), 5);
});

test('v4 replay requires the live and standalone gate evidence', () => {
  assert.throws(() => requireReplayParity(4, ['start.state.detail.authority.cargo.0.3']));
  assert.doesNotThrow(() => requireReplayParity(3, ['start.state.detail.authority.cargo.0.3']));
  assert.equal(shouldReplayNativeGate(4, 0, true), true);
  assert.equal(shouldReplayNativeGate(4, 0, undefined, 'desktop locked'), false);
  assert.throws(() => shouldReplayNativeGate(4, 0, undefined));
  assert.throws(() => shouldReplayNativeGate(4, 1, undefined, 'desktop locked'));
});

test('frame control distinguishes an undelivered join from a linked frame', () => {
  assert.equal(
    frameControlIssue(undefined, () => true),
    'No unique renderer main frame',
  );
});

test(
  'Playwright native reduced and door preserve the wire witness',
  {
    skip: process.env.ENCOUNTER_LIVE_WIRE !== '1',
    timeout: 110000,
  },
  async () => {
    const frozen = await openBatch(frozenPath);
    assert.ok(frozen.frozen);
    const base = 'http://127.0.0.1:5472';
    await withViteServer(
      base,
      'dev',
      async () => {
        const browser = await chromium.launch({
          args: [
            '--ozone-platform=headless',
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          ],
        });
        try {
          for (const name of ['reduced', 'door'] as const) {
            const reference = frozen.rows.find((r) => r.visit.id === `${name}-low-off-1`)!.visit;
            const context = await browser.newContext({
              viewport: { width: 800, height: 450 },
              deviceScaleFactor: 1,
            });
            try {
              const page = await context.newPage();
              await page.goto(`${base}/?debug&seed=${recipe.seed}`);
              await page.waitForFunction(() => window.__dungeon?.ready, null, {
                timeout: 45000,
                polling: 200,
              });
              const gl = await page.evaluate(() => ({
                ...window.__dungeon.engine.getGlInfo(),
                webgl: window.__dungeon.engine.webGLVersion,
                foreground: document.hasFocus() && !document.hidden,
              }));
              const capture = await page.evaluate((n) => {
                const select = document.querySelector<HTMLSelectElement>('#quality')!;
                select.value = 'low';
                select.dispatchEvent(new Event('change'));
                return window.__dungeon.encounter.run(n, 'off');
              }, name);
              const checks = prevalidateNative(reference, {
                ...reference,
                diagnostic: 'approach-prevalidation',
                graphics: {
                  ...gl,
                  browserVersion: browser.version(),
                  hardware: false,
                  gpuSystem: undefined,
                },
                capture,
              });
              assert.deepEqual(checks.absentOwners, [0, 1, 2, 3]);
              assert.deepEqual(checks.witness, ['Not foreground hardware WebGL2']);
              assert.deepEqual(
                checks.parity.filter((path) => !path.startsWith('graphics.')),
                ['start.display.2'],
              );
              console.log(
                `${name}: ticks ${capture.facts.map((fact) => fact.tick).join('/')}, live/wire agree; software is not hardware preflight`,
              );
            } finally {
              await context.close();
            }
          }
        } finally {
          await browser.close();
        }
      },
      true,
    );
  },
);

test('warmup pauses at the trace gate until ack and resets cadence exactly once', async () => {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });
  let starts = 0;
  let resets = 0;
  const gate = warmupTraceGate(() => {
    starts++;
    return promise;
  }, assert.fail);
  const reset = () => {
    resets++;
  };
  gate.request();
  gate.request();
  assert.equal(gate.resume(reset), false);
  assert.equal(resets, 0);
  resolve();
  await promise;
  assert.equal(gate.resume(reset), true);
  assert.equal(gate.resume(reset), true);
  assert.deepEqual([starts, resets], [1, 1]);
});

test('failed slot gets one immediate replacement and a second failure stops the batch', () => {
  const first = tracePlan[0]!;
  const failed = { id: first.id, issues: ['trace loss'] };
  const retry = nextTraceAttempt([failed]);
  assert.equal(retry?.replacementFor, first.id);
  assert.equal(retry?.id, `${first.id}-replacement`);
  assert.equal(nextTraceAttempt([failed, { id: retry.id, issues: ['trace loss'] }]), undefined);
  const recovered = [failed, { id: retry.id, issues: [] }];
  assert.equal(nextTraceAttempt(recovered)?.id, tracePlan[1]!.id);
  assert.equal(
    nextTraceAttempt([...recovered, { id: tracePlan[1]!.id, issues: ['focus'] }]),
    undefined,
  );
  assert.throws(() => nextTraceAttempt([{ id: tracePlan[1]!.id, issues: [] }]), /order/);
});

test('batch completeness depends on canonical order and independent stability', () => {
  const good = tracePlan.map(({ id }) => ({ id, issues: [] }));
  assert.equal(traceBatchState(good, true).complete, true);
  assert.equal(traceBatchState(good, false).complete, false);
  assert.equal(traceBatchState(good.slice(0, -1), true).complete, false);
  assert.throws(() => traceBatchState([...good].reverse(), true), /order/);
  assert.throws(() => traceBatchState([...good, good[0]!], true), /order/);
});

test('canonical slot names do not excuse overlapping or out-of-order execution', () => {
  assert.equal(verifyAttemptTiming({ started: 4, ended: 7 }, 3), 7);
  for (const timing of [
    { started: 2, ended: 7 },
    { started: 4, ended: 3 },
    { started: 4, ended: Infinity },
  ])
    assert.throws(() => verifyAttemptTiming(timing, 3), /chronology/);
});

test('CDP detach failure is retained separately from the primary visit error', async () => {
  const browser = {
    newBrowserCDPSession: async () => ({
      send: async () => {
        throw new Error('fixture categories failed');
      },
      detach: async () => {
        throw new Error('fixture detach failed');
      },
    }),
  } as unknown as Browser;
  const attempt = await recordApproach(browser, {} as Page, tracePlan[0]!, 'unused');
  assert.match(attempt.error ?? '', /categories failed/);
  assert.match(attempt.cleanupError ?? '', /detach failed/);
});

test('a timed-out CDP session acquisition stops the batch and detaches a late session', async () => {
  let attach!: (session: CDPSession) => void;
  const pending = new Promise<CDPSession>((resolve) => {
    attach = resolve;
  });
  const browser = { newBrowserCDPSession: () => pending } as unknown as Browser;
  const attempt = await recordApproach(browser, {} as Page, tracePlan[0]!, 'unused', 5);
  assert.match(attempt.cleanupError ?? '', /session acquisition timed out/i);
  let detached = false;
  attach({
    detach: async () => {
      detached = true;
    },
  } as CDPSession);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(detached, true);
});

test('offline verification rejects re-sealed false completeness, stability, and orphan visits', async (t) => {
  const dir = await mkdtemp('/tmp/opencode/trace-verify-');
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = process.cwd();
  const source = await sourceManifest(dir, root);
  const put = (name: string, value: unknown) => writeFile(join(dir, name), JSON.stringify(value));
  const seal = async () => {
    await rm(join(dir, 'SHA256SUMS'), { force: true });
    await sealTraceBatch(dir);
  };
  const nonce = 'fixture';
  const error = 'locked';
  await put('manifest.json', {
    source,
    recipe,
    recipeHash: sha256(JSON.stringify(recipe)),
    traceProtocol: 2,
    diagnostic: 'approach-trace',
    limits: traceLimits,
    gpu: 'hardware',
    plan: tracePlan,
    nonce,
    root,
    cwd: root,
  });
  await put('root-identity.json', { nonce, cwd: root, root });
  await put('setup-error.json', { error });
  const index = {
    entries: [],
    after: source,
    viteRoot: root,
    unchanged: true,
    complete: false,
    setupError: error,
  };
  await put('index.json', index);
  await put('trace-report.json', traceReport([], traceBatchState([], true, error), error));
  await seal();
  assert.equal((await verifyTraceBatch(dir)).complete, false);
  await put('index.json', { ...index, complete: true });
  await seal();
  await assert.rejects(verifyTraceBatch(dir), /Completeness summary/);
  await put('index.json', { ...index, after: { ...source, digest: 'different' } });
  await seal();
  await assert.rejects(verifyTraceBatch(dir), /Source stability summary/);
  await put('index.json', index);
  await put('reduced-low-off-1.trace.json', { partial: true });
  await seal();
  await assert.rejects(verifyTraceBatch(dir), /Unindexed trace attempt/);
  await put('desktop.json', { locked: 'false', rootIdentity: { nonce, cwd: root, root } });
  await put('index.json', {
    ...index,
    entries: [{ file: 'reduced-low-off-1.json', sha256: 'fixture' }],
  });
  await seal();
  await assert.rejects(verifyTraceBatch(dir), /foreground hardware WebGL2 preflight/);
});

test('CDP drain retains the raw prefix and does not claim EOF when a read fails', async (t) => {
  const dir = await mkdtemp('/tmp/opencode/trace-partial-');
  t.after(() => rm(dir, { recursive: true, force: true }));
  const raw = join(dir, 'raw.json');
  class Session extends EventEmitter {
    reads = 0;
    async send(command: string) {
      if (command === 'Tracing.getCategories') return { categories: [] };
      if (command === 'Tracing.end')
        this.emit('Tracing.tracingComplete', { stream: 'one', dataLossOccurred: false });
      if (command === 'IO.read') {
        if (this.reads++) throw new Error('fixture read failure');
        return { data: '{"traceEvents":[', eof: false };
      }
    }
  }
  const trace = await createBrowserTrace(new Session() as unknown as CDPSession, raw);
  await trace.start();
  await assert.rejects(trace.drain(), /fixture read failure/);
  assert.equal(await readFile(raw, 'utf8'), '{"traceEvents":[');
  assert.equal(trace.status.eof, false);
  assert.equal(trace.status.recordingPossiblyActive, false);
});

const frame = (
  callback: number,
  from: number,
  to: number,
  dx: number,
  phases = ['approach'],
): MotionFrame => ({
  callback,
  from,
  to,
  dx,
  dz: 0,
  phases,
});

test('rebuilds renderer stacks from a cumulative clock and rejects broken profiles', () => {
  const e = { ph: 'P', ts: 500, id: '1', pid: 1, tid: 2 };
  const start = { ...e, name: 'Profile', args: { data: { startTime: 100 } } };
  const chunk = {
    ...e,
    name: 'ProfileChunk',
    args: {
      data: {
        timeDeltas: [5, 10],
        cpuProfile: {
          nodes: [
            { id: 1, callFrame: { functionName: 'raf' } },
            {
              id: 2,
              parent: 1,
              callFrame: { functionName: 'render', url: '/src/main.ts', lineNumber: 9 },
            },
          ],
          samples: [1, 2],
        },
      },
    },
  };
  assert.deepEqual(
    decodeSamples([start, chunk], 1, 2).map((s) => [s.ts, s.stack.map((f) => f.functionName)]),
    [
      [105, ['raf']],
      [115, ['render', 'raf']],
    ],
  );
  assert.deepEqual(decodeSamples([start, chunk], 1, 3), []);
  assert.throws(() => decodeSamples([chunk], 1, 2), /clock/);
  const signed = { ...chunk, args: { data: { ...chunk.args.data, timeDeltas: [15, -5] } } };
  assert.deepEqual(
    decodeSamples([start, signed], 1, 2).map((s) => s.ts),
    [110, 115],
  );
});

test('preserves 64-bit IDs when joining main frame, presentation and Viz swap', () => {
  const events = parseTrace(`{"traceEvents":[
    {"name":"ProxyMain::BeginMainFrame","ph":"X","ts":1,"dur":10,"pid":1,"tid":1,"args":{"main_frame_pipeline":{"main_frame_id":9007199254740992}}},
    {"name":"MainFrame.Draw","ph":"X","ts":12,"dur":4,"pid":1,"tid":2,"args":{"main_frame_pipeline":{"main_frame_id":9007199254740992,"last_begin_frame_id_during_first_draw":{"sequence_number":4,"source_id":5}}}},
    {"name":"Graphics.Pipeline","ph":"X","ts":13,"pid":1,"tid":2,"args":{"chrome_graphics_pipeline":{"step":"STEP_GENERATE_COMPOSITOR_FRAME","surface_frame_trace_id":9007199254740993}}},
    {"name":"Graphics.Pipeline","ph":"X","ts":17,"pid":3,"tid":3,"args":{"chrome_graphics_pipeline":{"step":"STEP_SURFACE_AGGREGATION","aggregated_surface_frame_trace_ids":[9007199254740993],"display_trace_id":6}}},
    {"name":"Graphics.Pipeline","ph":"X","ts":18,"pid":3,"tid":4,"args":{"chrome_graphics_pipeline":{"step":"STEP_FINISH_BUFFER_SWAP","display_trace_id":6}}},
    {"name":"AnimationFrame::Presentation","ph":"n","ts":18,"pid":1,"tid":1,"args":{"begin_frame_id":{"sequence_number":4,"source_id":5}}}
  ]}`);
  const frame = linkPresentedFrame(events, { pid: 1, tid: 1, entry: 2, exit: 10 });
  assert.equal(frame?.surfaceId, '9007199254740993');
  assert.equal(frame?.presentation?.ts, 18);
  assert.equal(
    hasCrossProcessFrame(frame, (e) => e.pid === 3),
    true,
  );
  assert.equal(
    hasCrossProcessFrame(frame, (e) => e.pid === 4),
    false,
  );
  const noSwap = events.filter((e) => e.tid !== 4);
  noSwap.push({ name: 'Unrelated GPU event', pid: 3, tid: 4, ph: 'X', ts: 18 });
  assert.equal(
    hasCrossProcessFrame(
      linkPresentedFrame(noSwap, { pid: 1, tid: 1, entry: 2, exit: 10 }),
      (e) => e.pid === 3,
    ),
    false,
  );
  assert.deepEqual(
    frame?.display.map((e) => e.tid),
    [3, 4],
  );
  assert.equal(
    linkPresentedFrame(events.slice(0, 2), { pid: 1, tid: 1, entry: 2, exit: 10 })?.presentation,
    undefined,
  );
});

test('requires an explicit global flow from a renderer callback and does not join equal local IDs across processes', () => {
  const e = { name: 'Graphics.Pipeline', cat: 'cc', ts: 10, pid: 1, tid: 2 };
  const edges: TraceEvent[] = [
    { ...e, ph: 's', id2: { global: '5' } },
    { ...e, ph: 'f', id2: { global: '5' }, ts: 22, pid: 3 },
    { ...e, ph: 's', id2: { local: '8' } },
    { ...e, ph: 'f', id2: { local: '8' }, ts: 23, pid: 3 },
  ];
  assert.deepEqual(linkedFlows(edges, { pid: 1, tid: 2, entry: 8, exit: 12 }), [
    [edges[0], edges[1]],
  ]);
});

test('selects first displacement and next moving pure approach under unchanged input', () => {
  const frames = [
    frame(0, 489, 489, 0),
    frame(1, 489, 490, 0),
    frame(2, 490, 491, 0.1),
    frame(3, 491, 491, 0),
    frame(4, 491, 493, 0.2),
    frame(5, 493, 494, 0.1, ['approach', 'opening']),
  ];
  assert.deepEqual(selectWindows(frames, [490, 500]), { first: 2, steady: 4, historical: 2 });
  assert.throws(() => selectWindows(frames, [490, 492]), /steady/);
  assert.throws(() => selectWindows(frames.slice(0, 4), [490]), /steady/);
  assert.throws(
    () => selectWindows([frame(0, 489, 490, 0.1, ['approach', 'opening'])], [490]),
    /first/,
  );
});

test('aligns on one renderer thread and requires unique ordered render and next-entry marks', () => {
  const marks: TraceEvent[] = ['entry', 'submit', 'submitted', 'exit', 'entry'].map((tag, i) => ({
    cat: 'blink.user_timing',
    name: `encounter-trace:v:${i === 4 ? 1 : 0}:${tag}`,
    ph: 'I',
    ts: i + 1,
    pid: 2,
    tid: 3,
  }));
  assert.deepEqual(alignMarks(marks, 'v', 0), {
    pid: 2,
    tid: 3,
    entry: 1,
    submit: 2,
    submitted: 3,
    exit: 4,
    next: 5,
  });
  assert.throws(() => alignMarks([...marks, marks[0]!], 'v', 0), /ambiguous/);
  assert.throws(() => alignMarks(marks.slice(0, -1), 'v', 0), /missing/);
  assert.throws(
    () => alignMarks([...marks.slice(0, -1), { ...marks[4]!, tid: 4 }], 'v', 0),
    /clock/,
  );
});

test('keeps JS, driver CPU, and linked device evidence separate', () => {
  assert.equal(classifyEvidence({ kind: 'sample', hasStack: true }), 'js');
  assert.equal(classifyEvidence({ kind: 'sample', hasStack: false }), 'unknown');
  assert.equal(classifyEvidence({ kind: 'gpu-lane' }), 'gpu-process-cpu');
  assert.equal(classifyEvidence({ kind: 'driver-wait' }), 'driver-wait-cpu');
  assert.equal(classifyEvidence({ kind: 'device', linked: true, deviceClock: false }), 'unknown');
  assert.equal(classifyEvidence({ kind: 'device', linked: false, deviceClock: true }), 'unknown');
  assert.equal(classifyEvidence({ kind: 'device', linked: true, deviceClock: true }), 'device');
});

test('rejects loss, unfinished streams, absent samples, drift, software, parity failures and outcomes', () => {
  const good = {
    eof: true,
    loss: false,
    samples: true,
    tracks: true,
    source: true,
    parity: true,
    hardware: true,
    outcome: false,
  };
  assert.deepEqual(traceIssues(good), []);
  for (const key of Object.keys(good) as (keyof typeof good)[]) {
    assert.equal(traceIssues({ ...good, [key]: !good[key] }).length, 1, key);
  }
});

test('lifecycle accepts only declared pairs, with terminal states absorbing no events', () => {
  const normal = {
    ready: 'preflight',
    recording: 'stop',
    draining: 'eof',
    validating: 'checks',
  } as const;
  const states = ['ready', 'recording', 'draining', 'validating', 'archived', 'failed'] as const;
  const events = ['preflight', 'stop', 'eof', 'checks', 'failure', 'timeout'] as const;
  for (const [i, state] of states.entries())
    for (const event of events) {
      if (i < 4 && event === normal[state as keyof typeof normal]) {
        assert.deepEqual(transitionTrace(state, event), {
          state: states[i + 1],
          effect: ['record', 'drain', 'validate', 'archive'][i],
        });
      } else if (i < 4 && (event === 'timeout' || event === 'failure')) {
        assert.deepEqual(transitionTrace(state, event), { state: 'failed', effect: 'retain' });
      } else assert.throws(() => transitionTrace(state, event), /Invalid trace transition/);
    }
});
