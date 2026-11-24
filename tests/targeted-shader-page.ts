import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Browser, BrowserContextOptions, Page } from '@playwright/test';

export const deadline = async <T>(run: Promise<T>, ms: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('deadline')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

export interface TrialPageEvidence {
  label: string;
  errors: string[];
  journal?: unknown;
  origin?: number;
  closed?: boolean;
}

export function teardownIssue(evidence: TrialPageEvidence) {
  const { journal, origin } = evidence;
  if (!Array.isArray(journal) || !journal.length || !Number.isFinite(origin))
    return 'missing teardown journal';
  if (journal.some((row) => row?.type === 'error')) return 'unloading document error';
  const [hide, hidden] = journal;
  if (
    journal.length !== 2 ||
    !journal.every(
      (row) => row?.origin === origin && Number.isFinite(row.time) && row.trusted === true,
    ) ||
    hide.type !== 'pagehide' ||
    hide.persisted !== false ||
    hide.hidden !== false ||
    hidden.type !== 'visibilitychange' ||
    hidden.hidden !== true ||
    hidden.persisted !== null ||
    hidden.time < hide.time
  )
    return 'missing ordered trusted terminal hide and hidden event';
  if (!evidence.closed || evidence.errors.length) return 'context close or external page error';
  return null;
}

export async function withTrialPage(
  browser: Browser,
  base: string,
  options: BrowserContextOptions,
  evidence: TrialPageEvidence,
  run: (page: Page) => Promise<void>,
) {
  const app = new URL('/', base);
  const key = `shader-trial:teardown:${randomUUID()}`;
  const landing = new URL(`/${key}`, base).href;
  const context = await browser.newContext(options);
  try {
    const page = await context.newPage();
    page.on('pageerror', (e) =>
      evidence.errors.push(`${performance.now()}: ${e.stack ?? e.message}`),
    );
    await page.addInitScript(
      ({ app, key }) => {
        if (window !== window.top || `${location.origin}${location.pathname}` !== app) return;
        const journal: object[] = [];
        const record = (event: Event) => {
          journal.push({
            type: event.type,
            trusted: event.isTrusted,
            hidden: document.hidden,
            persisted: event instanceof PageTransitionEvent ? event.persisted : null,
            time: performance.now(),
            origin: performance.timeOrigin,
            message: event instanceof ErrorEvent ? event.message : undefined,
            stack: event instanceof ErrorEvent ? event.error?.stack : undefined,
          });
          localStorage.setItem(key, JSON.stringify(journal));
        };
        window.addEventListener('pagehide', record, true);
        window.addEventListener(
          'error',
          (event) => {
            if (event instanceof ErrorEvent) record(event);
          },
          true,
        );
        for (const type of ['blur', 'visibilitychange'])
          window.addEventListener(
            type,
            (event) => {
              if (document.hidden || (type === 'blur' && event.target === window))
                performance.mark('shader-trial:lost-focus');
              if (type === 'visibilitychange' && document.hidden) record(event);
            },
            true,
          );
      },
      { app: app.href, key },
    );
    try {
      await run(page);
    } finally {
      const current = new URL(page.url());
      assert.equal(`${current.origin}${current.pathname}`, app.href, 'missing teardown document');
      evidence.origin = await deadline(
        page.evaluate(() => performance.timeOrigin),
        6000,
      );
      // Install the route only after collecting all timing endpoints. Read the outgoing
      // document's synchronous journal from a fresh same-origin document, not the console.
      await page.route(landing, (route) =>
        route.fulfill({ contentType: 'text/html', body: '<title>Trial teardown</title>' }),
      );
      await page.goto(landing, { timeout: 6000 });
      const journal = await deadline(
        page.evaluate((key) => localStorage.getItem(key), key),
        6000,
      );
      evidence.journal = journal === null ? null : JSON.parse(journal);
    }
  } finally {
    await deadline(context.close(), 6000);
    evidence.closed = true;
  }
  assert.equal(teardownIssue(evidence), null, `${evidence.label}: ${teardownIssue(evidence)}`);
}
