import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Browser, Page } from '@playwright/test';
import { recipe } from '../src/encounterRecipe.ts';
import type { DebugWindow } from './browserTypes.ts';
import type { Visit } from './encounter-report.ts';
import { bounded, createBrowserTrace, traceLimits } from './encounter-trace-cdp.ts';
import { transitionTrace } from './encounter-trace.ts';
import type { TraceState } from './encounter-trace.ts';

export function desktopLock(reply: unknown) {
  return reply === 'false' ? 'unlocked' : reply === 'true' ? 'locked' : 'unknown';
}

export const tracePlan = [1, 2, 3].flatMap((repeat) =>
  (['reduced', 'door'] as const).map((name) => ({
    name,
    repeat,
    quality: 'low' as const,
    mode: 'off' as const,
    id: `${name}-low-off-${repeat}`,
  })),
);
type Attempt = (typeof tracePlan)[number] & { replacementFor?: string };
export type Verdict = { id: string; issues: readonly string[]; stop?: boolean };

// Retry the same slot once, immediately, using a new context and distinct artifact name.
// A second failure (even in a later slot) or a non-recoverable failure stops the run.
export function nextTraceAttempt(rows: readonly Verdict[]): Attempt | undefined {
  let slot = 0;
  let replacementUsed = false;
  let next: Attempt | undefined = tracePlan[slot];
  for (const row of rows) {
    assert.ok(next && row.id === next.id, `Invalid trace attempt order: ${row.id}`);
    if (row.stop) next = undefined;
    else if (!row.issues.length) next = tracePlan[++slot];
    else if (replacementUsed) next = undefined;
    else {
      replacementUsed = true;
      next = { ...next, id: `${next.id}-replacement`, replacementFor: next.id };
    }
  }
  return next;
}

declare const window: DebugWindow & {
  signalEncounterTrace(edge: 'warm' | 'tail'): Promise<void>;
};

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

export async function recordApproach(
  browser: Browser,
  page: Page,
  visit: Pick<Visit, 'id' | 'name' | 'quality' | 'mode'>,
  rawFile: string,
  sessionTimeoutMs = 5000,
) {
  let state: TraceState = 'ready';
  const lifecycle: { state: TraceState; effect?: string }[] = [{ state }];
  const step = (event: Parameters<typeof transitionTrace>[1]) => {
    const decision = transitionTrace(state, event);
    state = decision.state;
    lifecycle.push(decision);
    return decision.effect;
  };
  const expected = (event: Parameters<typeof step>[0], effect: ReturnType<typeof step>) =>
    assert.equal(step(event), effect);
  let capture: Visit['capture'];
  let error: string | undefined;
  let cleanupError: string | undefined;
  let status: Awaited<ReturnType<typeof createBrowserTrace>>['status'] | undefined;
  let session: Awaited<ReturnType<typeof browser.newBrowserCDPSession>> | undefined;
  try {
    let settled = false;
    const pending = browser.newBrowserCDPSession().finally(() => {
      settled = true;
    });
    const active = await bounded('Browser CDP session', sessionTimeoutMs, () => pending).catch(
      (err: unknown) => {
        if (!settled) {
          cleanupError = 'Browser CDP session acquisition timed out; cleanup unconfirmed';
          void pending
            .then((late) => bounded('Late CDP detach', 5000, () => late.detach()))
            .catch(() => undefined);
        }
        throw err;
      },
    );
    session = active;
    const trace = await createBrowserTrace(active, rawFile);
    status = trace.status;
    const warm = signal();
    const tail = signal();
    await bounded('Trace signal binding', 5000, () =>
      page.exposeBinding('signalEncounterTrace', async (_source, edge: unknown) => {
        if (edge === 'warm') {
          expected('preflight', 'record');
          try {
            await trace.start();
            warm.resolve();
          } catch (err) {
            error = String(err);
            // Even a timed-out command may have started Chrome's global recorder. Try to
            // salvage its stream; the batch stops if termination cannot be confirmed.
            await trace.drain().catch(() => undefined);
            throw err;
          }
        } else if (edge === 'tail') tail.resolve();
        else throw new Error('Invalid trace signal');
      }),
    );
    const replay = page
      .evaluate(({ name, mode, quality, id }) => {
        const select = document.querySelector<HTMLSelectElement>('#quality');
        if (!select) throw new Error('Quality UI missing');
        select.value = quality;
        select.dispatchEvent(new Event('change'));
        return window.__dungeon.encounter.run(name, mode, {
          id,
          signal(edge) {
            return window.signalEncounterTrace(edge);
          },
        });
      }, visit)
      .then(
        (value) => {
          capture = value;
        },
        (err: unknown) => {
          error ??= String(err);
        },
      );
    const expectSignal = (signal: Promise<void>) =>
      Promise.race([
        signal,
        replay.then(() => {
          throw new Error(error ?? capture?.reason ?? 'Visit ended before trace signal');
        }),
      ]);
    try {
      await bounded('Trace warmup and CDP start', 40000, () => expectSignal(warm.promise));
      try {
        await bounded('Trace recording window', traceLimits.recordingMs, async () => {
          await expectSignal(tail.promise);
          await sleep(200); // Keep a bounded presentation tail; not evidence of presentation itself.
        });
      } finally {
        expected('stop', 'drain');
        await trace.drain();
        expected('eof', 'validate');
      }
    } catch (err) {
      error = String(err);
    }
    await bounded('Native visit terminal', recipe.deadlineMs + 2000, () => replay);
  } catch (err) {
    error ??= String(err);
  } finally {
    if (session) {
      const active = session;
      await bounded('Trace CDP detach', 5000, () => active.detach()).catch((err: unknown) => {
        cleanupError = String(err);
      });
    }
  }
  return {
    capture,
    error,
    cleanupError,
    status,
    lifecycle,
    finish(accepted: boolean) {
      expected(
        accepted ? 'checks' : /exceeded|deadline/i.test(error ?? '') ? 'timeout' : 'failure',
        accepted ? 'archive' : 'retain',
      );
    },
  };
}
