import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import type { BrowserContext, Page } from 'playwright';
import { createServer } from 'vite';
import type { CaptureConfig } from './cursor-attribution-probe.ts';
import { openWriterArchive, runVisitBoundary } from './cursor-capture-archive.ts';
import { encodePageBase64, pageBytes, pageRecords, recordBytes } from './cursor-capture-stream.ts';
import { floatDictionaryEntries } from './cursor-capture-codec.ts';
import type { Packet } from './cursor-capture-stream.ts';
import { reconcileWriters, scratchPass, streamWriterReplay } from './cursor-publication-replay.ts';
import { retainedQualification } from './cursor-retained-qualification.ts';
import type * as Fixture from './cursor-transport-qualification-page.ts';
import { frameEvents, frameScalars, stateScalars } from './cursor-writer-stream.ts';
import {
  disableVisitFocusEmulation,
  launchHeadedCursorBrowser,
  newCursorVisitContext,
  prepareVisitPage,
} from './cursor-visit-page.ts';

type PageFixture = typeof Fixture;
type BrowserBridge = {
  fixture: PageFixture;
  tiny: ReturnType<PageFixture['tinyCount']>;
  scratch: ReturnType<PageFixture['startScratch']>;
  events: { type: string; trusted: boolean; hidden: boolean; focused: boolean }[];
  finalAck: boolean;
};
declare global {
  var host: BrowserBridge;
}
const pageModule = '/tests/cursor-transport-qualification-page.ts';
const headedForeground = process.argv.includes('--headed-foreground');
const defer = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

// Playwright's normal context forces a page to remain visible. Use a disposable
// default context with no overrides so activating another tab genuinely hides it.
async function foregroundBrowser() {
  const profile = await mkdtemp(join(tmpdir(), 'cursor-contamination-'));
  const child = spawn(
    chromium.executablePath(),
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-webgl',
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const stopped = once(child, 'close');
  async function close() {
    child.kill();
    await stopped.catch(() => undefined);
    await rm(profile, { recursive: true, force: true });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const endpoint = await Promise.race([
      new Promise<string>((resolve) => {
        child.stderr.on('data', (data: Buffer) => {
          const match = data
            .toString()
            .match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/\S+)/);
          if (match) resolve(match[1]);
        });
      }),
      stopped.then(() => {
        throw new Error('qualification Chromium exited before CDP startup');
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('qualification Chromium CDP startup timed out')),
          10_000,
        );
      }),
    ]);
    const browser = await chromium.connectOverCDP(endpoint, { noDefaults: true });
    return { context: browser.contexts()[0], close };
  } catch (error) {
    await close();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function ownedCompetitor(page: Page, newWindow: boolean) {
  const context = page.context();
  const cdp = await context.newCDPSession(page);
  const { targetInfo } = await cdp.send('Target.getTargetInfo');
  const { targetId, browserContextId } = targetInfo;
  assert.ok(browserContextId, 'expected a disposable browser context');
  const { windowId } = await cdp.send('Browser.getWindowForTarget', { targetId });
  const [other] = await Promise.all([
    context.waitForEvent('page', { timeout: 5000 }),
    newWindow
      ? page.evaluate(() => {
          if (!window.open('about:blank', '_blank', 'popup,width=320,height=240'))
            throw new Error('owned popup blocked');
        })
      : cdp.send('Target.createTarget', { url: 'about:blank', browserContextId }),
  ]);
  const otherCDP = await context.newCDPSession(other);
  const info = (await otherCDP.send('Target.getTargetInfo')).targetInfo;
  if (newWindow) assert.equal(info.openerId, targetId);
  assert.equal(info.browserContextId, browserContextId);
  const otherWindow = await cdp.send('Browser.getWindowForTarget', { targetId: info.targetId });
  assert.equal(otherWindow.windowId !== windowId, newWindow, 'wrong window topology');
  await disableVisitFocusEmulation(other);
  await otherCDP.detach();
  await cdp.detach();
  return { other, windowId, otherWindowId: otherWindow.windowId };
}

const name = headedForeground
  ? 'headed foreground-loss qualification'
  : 'software browser recorder qualification';
test(name, { timeout: headedForeground ? 60_000 : 240_000 }, async (t) => {
  await mkdir('test-results/epic16', { recursive: true });
  const out = await mkdtemp('test-results/epic16/transport-qualification-');
  const server = await createServer({
    configFile: false,
    server: { host: '127.0.0.1', port: 0, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  await server.listen();
  t.after(() => server.close());
  const url = server.resolvedUrls!.local[0];
  const browser = headedForeground
    ? await launchHeadedCursorBrowser()
    : await chromium.launch({
        channel: 'chromium',
        headless: process.env.CURSOR_HEADED !== '1',
        ignoreDefaultArgs: ['--disable-backgrounding-occluded-windows'],
        args: ['--disable-gpu', '--disable-webgl'],
      });
  t.after(() => browser.close());
  const context = headedForeground
    ? await newCursorVisitContext(browser)
    : await browser.newContext();
  const makePage = async (target: BrowserContext, config?: CaptureConfig) => {
    const page = await target.newPage();
    if (config) await prepareVisitPage(page, config, headedForeground);
    await page.route('**/qualification', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><canvas width="320" height="240" tabindex="0"></canvas>',
      }),
    );
    await page.goto(`${url}qualification`);
    await page.evaluate(async (path) => {
      globalThis.host = { fixture: await import(path) } as BrowserBridge;
    }, pageModule);
    return page;
  };

  if (!headedForeground)
    await t.test(
      'retained changing operands round-trip at 60 and 120 frames; bounded browser scratch',
      async (vt) => {
        let data;
        try {
          data = await retainedQualification();
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            return vt.skip('local historical archive absent');
          throw error;
        }
        const body = JSON.stringify({
          start: data.start,
          dictionary: data.dictionary,
          gaps: data.gaps,
        });
        assert.ok(Buffer.byteLength(body) < 16 * 1024 * 1024, 'fixed fixture dictionary bound');
        const eager = reconcileWriters({ ...data.header, frames: data.native });
        assert.ok(eager.gaps.includes('writer trace operand/checkpoint overflow'));
        assert.ok(eager.gaps.includes('incomplete checkpoints at frame 68'));
        const peaks = [];
        for (const length of [60, 120]) {
          const visit = `retained-${length}`;
          const archive = await openWriterArchive(join(out, visit), visit, [
            180,
            178 + (length / 3) * 14,
          ]);
          const page = await makePage(context);
          try {
            await page.route('**/retained-fixture', (r) =>
              r.fulfill({ contentType: 'application/json', body }),
            );
            let firstPersisted = false;
            await page.exposeBinding('capturePage', async ({ frame }, packet: Packet) => {
              assert.equal(frame, page.mainFrame());
              const ack = await archive.receive(packet);
              if (!packet.seq) {
                assert.equal(
                  archive.status().frames,
                  0,
                  'first retained frame must straddle pages',
                );
                firstPersisted = true;
              }
              return ack;
            });
            const producer = await page.evaluate(
              ([visit, length]) => host.fixture.retainedVolume(visit, length),
              [visit, length] as const,
            );
            await writeFile(
              join(out, `${visit}-producer.json`),
              JSON.stringify({ producer, sink: archive.status() }, null, 2),
            );
            assert.equal(
              producer.kind,
              'sealed',
              'reason' in producer ? producer.reason : undefined,
            );
            assert.ok(firstPersisted && producer.beforeEnd > 0);
            assert.ok(producer.peakPending <= 2 && producer.peakPageBytes <= 3 * pageBytes);
            assert.equal(producer.workspaceBytes, recordBytes);
            assert.ok(producer.peakDictionaryEntries <= floatDictionaryEntries);
            const reader = streamWriterReplay(archive.header());
            assert.deepEqual(archive.header(), data.header);
            const expected = data.frames(length);
            const arm = {
              group: 'publish',
              active: true,
              start: 0,
              length,
              repeats: 1,
              pad: 0,
            } as const;
            const scratch = scratchPass(data.header, arm, null);
            let i = 0;
            for await (const { frame } of archive.frames()) {
              const next = expected.next();
              assert.equal(next.done, false);
              const raw = next.value;
              assert.deepEqual(frame, {
                ...raw,
                writes: raw.writes.map((w) => ({ ...w, slot: w.slot, refreshThin: w.refreshThin })),
              });
              if (i < 3)
                assert.deepEqual(reader.frame(frame), {
                  ...eager.frames[i],
                  writes: eager.frames[i].writes.map((w) => ({
                    ...w,
                    slot: w.slot,
                    refreshThin: w.refreshThin,
                  })),
                });
              scratch.frame(raw);
              i++;
            }
            assert.equal(i, length);
            assert.equal(expected.next().done, true);
            assert.ok(reader.gaps().includes('unreconciled fixed checkpoint at tick 179'));
            assert.equal(
              producer.events,
              (length / 3) * (12982 + 13006 + 11641) + (length / 3 - 1) * data.resetWrites,
            );
            await page.evaluate((arm) => {
              host.scratch = host.fixture.startScratch(arm);
            }, arm);
            let result = null;
            for await (const { data, row } of archive.pages()) {
              assert.equal(result, null);
              if (row.seq === 0) {
                let began = false;
                for (const record of pageRecords(data)) {
                  assert.ok(Array.isArray(record));
                  if (record[0] === 'begin') began = true;
                  assert.notEqual(record[0], 'end', 'first disk page straddles frame 65');
                }
                assert.ok(began);
              }
              result = await page.evaluate(
                (encoded) => host.scratch(encoded),
                encodePageBase64(data),
              );
            }
            const { units, consumed, ms, ...decode } = result!;
            assert.deepEqual({ units, consumed, ms }, scratch.result());
            const sink = archive.status();
            assert.equal(sink.seq, producer.events);
            assert.equal(sink.diskPages, sink.committed);
            assert.equal(producer.peakPayloadChars, sink.peakPayloadChars);
            assert.ok(sink.peakPayloadChars <= Math.ceil(pageBytes / 3) * 4);
            assert.ok(sink.peakCompressedBytes <= pageBytes + 64 * 1024);
            assert.ok(sink.peakBytes <= pageBytes && sink.peakFrameEvents <= frameEvents);
            assert.ok(
              sink.peakFrameScalars <= frameScalars && sink.peakStateScalars <= 3 * stateScalars,
            );
            assert.equal(decode.peakFrameScalars, sink.peakFrameScalars);
            assert.equal(decode.peakFrameEvents, sink.peakFrameEvents);
            assert.equal(decode.peakStateScalars, sink.peakStateScalars);
            peaks.push(sink);
            await writeFile(
              join(out, `${visit}.json`),
              JSON.stringify(
                {
                  producer,
                  sink,
                  scratch: result,
                  fixtureBytes: Buffer.byteLength(body),
                  resetWrites: data.resetWrites,
                  gaps: reader.gaps(),
                },
                null,
                2,
              ),
            );
          } finally {
            await page.close();
          }
        }
        const [short, long] = peaks;
        assert.ok(
          long.logicalScalars > 2 * short.logicalScalars && long.committed > short.committed,
        );
        for (const key of ['peakFrameEvents', 'peakFrameScalars', 'peakStateScalars'] as const)
          assert.equal(long[key], short[key]);
        console.log(out, peaks);
      },
    );

  if (!headedForeground) await browser.close();
  const foreground = headedForeground
    ? { context, close: () => context.close() }
    : await foregroundBrowser();
  t.after(foreground.close);
  if (headedForeground) {
    // Keep the main window alive between fixtures so closing a measured tab
    // does not hand desktop focus back to an unrelated application.
    await context.newPage();
    console.log(out, { chromium: browser.version(), headless: false });
  }
  for (const phase of ['drain', 'scratch'])
    for (const stimulus of headedForeground
      ? ['watchdog', 'visibilitychange', 'in-focus']
      : ['blur', 'visibilitychange', 'keydown', 'pointermove']) {
      const control = stimulus === 'in-focus';
      const watchdog = stimulus === 'watchdog';
      await t.test(
        `real browser ${stimulus} ${phase}: ${control ? 'admitted' : 'rejected'}`,
        async () => {
          const visit = `${phase}-${stimulus}`;
          const input = stimulus === 'keydown' || stimulus === 'pointermove';
          const reason = input ? 'input contamination' : 'foreground lost';
          const archive = await openWriterArchive(join(out, visit), visit, [1, 2]);
          const page = await makePage(foreground.context, {
            kind: 'idle',
            mode: 'count',
            smoke: true,
            window: [1, 2],
            runId: visit,
            writerVisit: visit,
            // Exercise the planned event in the guard fixture, independently of picking.
            point: stimulus === 'pointermove' ? [30, 30] : undefined,
          });
          const final = defer();
          const release = defer();
          const progress: string[] = [];
          const dwellMs = 350;
          let witnessed: string | undefined;
          let windows: number[] | undefined;
          const focused = () => document.hasFocus() && !document.hidden;
          const focusOptions = { polling: 100, timeout: 3000 };
          try {
            await page.exposeBinding('capturePage', async (_source, packet: Packet) => {
              const ack = await archive.receive(packet);
              if (packet.final) {
                final.resolve();
                if (phase === 'drain') await release.promise;
              }
              return ack;
            });
            if (headedForeground) {
              await page.bringToFront();
              await page.waitForFunction(focused, undefined, focusOptions);
            }
            await page.evaluate(
              ({ stimulus, headedForeground }) => {
                host.events = [];
                const observe = (event: Event) => {
                  host.events.push({
                    type: event.type,
                    trusted: event.isTrusted,
                    hidden: document.hidden,
                    focused: document.hasFocus(),
                  });
                  // Isolate the two genuine foreground signals. Do not let the
                  // other listener (or a status poll while hidden) mask a defect.
                  if (
                    (stimulus === 'watchdog' &&
                      ['blur', 'visibilitychange'].includes(event.type)) ||
                    (event.type === 'blur' && stimulus === 'visibilitychange') ||
                    (event.type === 'visibilitychange' && stimulus === 'blur') ||
                    (headedForeground && ['pointermove', 'pointerleave'].includes(event.type))
                  )
                    event.stopImmediatePropagation();
                };
                window.addEventListener('blur', observe, true);
                document.addEventListener('visibilitychange', observe, true);
                window.addEventListener('keydown', observe, true);
                window.addEventListener('pointermove', observe, true);
                if (headedForeground) window.addEventListener('pointerleave', observe, true);
                host.finalAck = false;
                host.tiny = host.fixture.tinyCount(() => (host.finalAck = true));
                host.tiny.frame();
                host.tiny.frame();
              },
              { stimulus, headedForeground },
            );
            const deadline = new AbortController();
            try {
              await Promise.race([
                final.promise,
                delay(5000, undefined, { signal: deadline.signal }).then(() => {
                  throw new Error('final packet did not persist');
                }),
              ]);
            } finally {
              deadline.abort();
            }
            assert.equal(archive.status().sealed, true, 'disk final page persisted');
            assert.equal(
              await page.evaluate(() => host.tiny.probe.take(0, 0).input),
              stimulus === 'pointermove' ? 1 : 0,
            );
            if (stimulus === 'pointermove')
              assert.deepEqual(await page.evaluate(() => host.events), [
                { type: 'pointermove', trusted: false, hidden: false, focused: true },
              ]);
            async function exerciseGap() {
              assert.equal(await page.evaluate(focused), true);
              if (control) {
                await delay(dwellMs);
                assert.equal(await page.evaluate(focused), true);
                witnessed = 'visible and focused';
                return;
              }
              if (!input) {
                const competitor = headedForeground ? await ownedCompetitor(page, watchdog) : null;
                const other = competitor?.other ?? (await foreground.context.newPage());
                try {
                  await other.bringToFront();
                  if (competitor) {
                    windows = [competitor.windowId, competitor.otherWindowId];
                    await other.waitForFunction(focused, undefined, focusOptions);
                  }
                  if (watchdog) {
                    // Independent witness: read only browser focus/visibility, never the
                    // probe or its latch. Keep the popup active across the whole dwell.
                    const visibleUnfocused = () => !document.hasFocus() && !document.hidden;
                    await page.waitForFunction(visibleUnfocused, undefined, focusOptions);
                    await delay(dwellMs);
                    assert.equal(await other.evaluate(focused), true);
                    assert.equal(await page.evaluate(visibleUnfocused), true);
                    witnessed = 'visible and unfocused';
                  } else
                    await page.waitForFunction(
                      () =>
                        !document.hasFocus() &&
                        document.hidden &&
                        host.events.some(
                          (event) =>
                            event.trusted &&
                            !event.focused &&
                            event.type === 'visibilitychange' &&
                            event.hidden,
                        ),
                      undefined,
                      focusOptions,
                    );
                } catch (error) {
                  if (headedForeground) {
                    const state = () => ({ hidden: document.hidden, focused: document.hasFocus() });
                    throw new Error(`could not confirm headed ${stimulus}`, {
                      cause: {
                        error,
                        windows,
                        monitored: await page.evaluate(state),
                        other: await other.evaluate(state),
                        events: await page.evaluate(() => host.events),
                      },
                    });
                  }
                  throw error;
                } finally {
                  await other.close();
                  await page.bringToFront();
                }
              } else if (stimulus === 'keydown') await page.keyboard.press('KeyQ');
              else await page.mouse.move(30, 30);
              await page.waitForFunction(focused, undefined, focusOptions);
              if (!watchdog)
                assert.ok(
                  (await page.evaluate(() => host.events)).some(
                    (event) => event.type === stimulus && event.trusted,
                  ),
                  `missing trusted ${stimulus}`,
                );
            }
            const healthy = async () => {
              const { fail } = await page.evaluate(() => host.tiny.probe.status());
              if (fail) throw new Error(fail);
            };
            const boundary = runVisitBoundary({
              wait: async () => {
                if (phase === 'drain') {
                  assert.equal(
                    await page.evaluate(() => host.tiny.probe.status().writer?.kind),
                    'draining',
                  );
                  assert.equal(await page.evaluate(() => host.tiny.probe.status().done), false);
                  assert.equal(await page.evaluate(() => host.finalAck), false);
                  await exerciseGap();
                  release.resolve();
                  await page.waitForFunction(() => host.finalAck, undefined, { timeout: 3000 });
                } else await page.waitForFunction(() => host.tiny.probe.status().done);
                await healthy();
              },
              archive: async () => {
                const native = await page.evaluate(() => host.tiny.probe.take());
                assert.equal(native.rows.length, 2);
                await writeFile(join(out, `${visit}-native.json`), JSON.stringify(native));
                return native;
              },
              healthy,
              validate: async () => {
                assert.ok(control || phase === 'scratch');
                await page.evaluate(() =>
                  host.tiny.probe.scratchBegin({
                    group: 'publish',
                    active: true,
                    start: 0,
                    length: 2,
                    repeats: 1,
                    pad: 0,
                  }),
                );
                let pages = 0;
                for await (const { data } of archive.pages()) {
                  const encoded = encodePageBase64(data);
                  if (++pages === 1)
                    assert.equal(
                      await page.evaluate((p) => host.tiny.probe.scratchPage(p), encoded),
                      null,
                    );
                  else {
                    if (phase === 'scratch') await exerciseGap();
                    if (control) {
                      assert.ok(
                        (await page.evaluate((p) => host.tiny.probe.scratchPage(p), encoded))
                          ?.result,
                      );
                      return;
                    }
                    await assert.rejects(
                      page.evaluate((p) => host.tiny.probe.scratchPage(p), encoded),
                      /scratch unavailable/,
                    );
                    return;
                  }
                }
                assert.fail('scratch fixture did not span two pages');
              },
              after: async () => {
                assert.ok(control, 'contaminated visit reached post-validation');
              },
              progress: (stage) => progress.push(stage),
            });
            if (control) await boundary;
            else
              await assert.rejects(boundary, (error: unknown) => {
                if (error instanceof Error && error.message === reason) return true;
                throw error;
              });
            const status = await page.evaluate(() => host.tiny.probe.status());
            assert.equal(status.done, control);
            assert.equal(status.fail, control ? null : reason);
            assert.equal(status.writer?.kind, !control && phase === 'drain' ? 'failed' : 'sealed');
            if (!control && phase === 'drain') {
              assert.equal(status.writer?.kind, 'failed');
              assert.ok(status.writer.committed < archive.status().committed);
            }
            assert.ok(progress.includes('native archived'));
            assert.equal(progress.includes('admitted'), control);
            await writeFile(
              join(out, `${visit}.json`),
              JSON.stringify(
                {
                  status,
                  progress,
                  sink: archive.status(),
                  windows,
                  witness: witnessed && { observed: witnessed, dwellMs },
                  finalAck: await page.evaluate(() => host.finalAck),
                  events: await page.evaluate(() => host.events),
                },
                null,
                2,
              ),
            );
          } finally {
            release.resolve();
            await page.close();
          }
        },
      );
    }
});
