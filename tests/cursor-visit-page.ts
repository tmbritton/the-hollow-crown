import { chromium } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import type { CaptureConfig } from './cursor-attribution-probe.ts';

export function launchHeadedCursorBrowser() {
  return chromium.launch({
    channel: 'chromium',
    headless: false,
    timeout: 15000,
    args: ['--ignore-gpu-blocklist', '--window-position=32,32', '--window-size=1980,1210'],
  });
}

export function newCursorVisitContext(browser: Browser) {
  return browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
}

type FocusSession = {
  send(method: 'Emulation.setFocusEmulationEnabled', params: { enabled: false }): Promise<unknown>;
};

export async function disableVisitFocusEmulation(page: Page) {
  // Playwright 1.65.1 sets this on its own main-frame session. A newCDPSession
  // on the same target cannot undo another session's emulation. Use the pinned
  // in-process adapter only; never run the headed visit if it is unavailable.
  const owned = page as Page & {
    _connection?: {
      toImpl?(page: Page): { delegate?: { _mainFrameSession?: { _client?: FocusSession } } };
    };
  };
  const cdp = owned._connection?.toImpl?.(page)?.delegate?._mainFrameSession?._client;
  if (!cdp) throw new Error('cannot disable Playwright focus emulation on visit page');
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
}

export async function prepareVisitPage(
  page: Page,
  config: CaptureConfig,
  realFocus = !config.smoke,
) {
  if (realFocus) await disableVisitFocusEmulation(page);
  await page.addInitScript((c) => Object.assign(window, { __cursorCaptureConfig: c }), config);
  // Leave browser input enabled. The probe accepts only its own setup event
  // and needs to see all other input to invalidate the visit.
  await page.bringToFront();
}
