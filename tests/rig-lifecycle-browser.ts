import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { withViteServer } from './testServer.ts';
import './browserTypes.ts';

const base = `http://127.0.0.1:${process.env.RIG_PORT ?? '5482'}`;
const output = process.env.RIG_OUTPUT ?? 'test-results/rig-lifecycle.json';
const rows: object[] = [];
const navigationErrors: object[] = [];
const errors: { id: string; received: number; stack: string }[] = [];
const prefix = 'rig-lifecycle:';
const modes =
  process.env.RIG_RESUME_ONLY === '1'
    ? (['resume'] as const)
    : (['navigate', 'close', 'replay', 'resume'] as const);
try {
  await withViteServer(
    base,
    'dev',
    async () => {
      const browser = await chromium.launch();
      try {
        for (const mode of modes) {
          for (const kind of ['ordinary', 'r6'] as const) {
            if (mode === 'resume' && kind === 'ordinary') continue;
            const id = `${kind}-${mode}`;
            const context = await browser.newContext({ viewport: { width: 800, height: 450 } });
            const page = await context.newPage();
            page.on('pageerror', (error) => {
              errors.push({ id, received: performance.now(), stack: error.stack ?? String(error) });
            });
            page.on('console', (message) => {
              if (message.text().startsWith(prefix))
                rows.push(JSON.parse(message.text().slice(prefix.length)));
            });
            // Passive source probe, identical for red and green. Install before either page loads.
            await page.route('**/src/main.ts', async (route) => {
              const response = await route.fetch();
              const body = (await response.text()).replace(
                'engine?.dispose();',
                'window.dispatchEvent(new Event("engine-dispose-entry")); engine?.dispose(); window.dispatchEvent(new Event("engine-dispose-return"));',
              );
              await route.fulfill({ response, body });
            });
            await page.addInitScript(
              ({ id, prefix }) => {
                if (location.pathname !== '/') return;
                let generation = 1;
                const timeline: object[] = [];
                const emit = (event: Event) => {
                  const row = {
                    id,
                    generation,
                    time: performance.now(),
                    origin: performance.timeOrigin,
                    event: event.type,
                    hidden: document.hidden,
                    trusted: event.isTrusted,
                    persisted: event instanceof PageTransitionEvent ? event.persisted : null,
                    stack: event instanceof ErrorEvent ? event.error?.stack : undefined,
                  };
                  timeline.push(row);
                  localStorage.setItem(`rig-timeline:${id}`, JSON.stringify(timeline));
                  console.info(prefix + JSON.stringify(row));
                };
                for (const event of [
                  'blur',
                  'pagehide',
                  'pageshow',
                  'visibilitychange',
                  'error',
                  'engine-dispose-entry',
                  'engine-dispose-return',
                ])
                  window.addEventListener(event, emit, true);
                window.addEventListener('rig-generation', (event) => {
                  generation++;
                  emit(event);
                });
              },
              { id, prefix },
            );
            try {
              await page.goto(
                `${base}/?seed=${kind === 'ordinary' ? 'MOURNING-731' : '795&debug'}`,
              );
              await page.waitForSelector('#loading.done', { state: 'attached', timeout: 45000 });
              if (mode === 'resume') {
                await page.waitForFunction(() => window.__dungeon?.ready);
                const position = () => page.evaluate(() => window.__dungeon!.snapshot().position);
                const move = async () => {
                  const before = await position();
                  await page.keyboard.down('KeyW');
                  await page.waitForFunction((previous) => {
                    const now = window.__dungeon!.snapshot().position;
                    return now[0] !== previous[0] || now[2] !== previous[2];
                  }, before);
                };
                await move();
                await page.keyboard.press('Space');
                const stopped = await page.evaluate(() => {
                  const dungeon = window.__dungeon!;
                  const player = dungeon.game.player;
                  player.destinationMarker.setEnabled(true);
                  window.dispatchEvent(new Event('blur'));
                  const clean =
                    !player.moving &&
                    !player.destinationMarker.isEnabled() &&
                    !player.actor.attack.target;
                  window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
                  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
                  document.dispatchEvent(new Event('visibilitychange'));
                  return {
                    clean,
                    steps: dungeon.game.steps,
                    position: dungeon.snapshot().position,
                  };
                });
                assert.ok(stopped.clean);
                const hiddenSteps = await page.evaluate(async () => {
                  for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
                  return window.__dungeon!.game.steps;
                });
                assert.equal(hiddenSteps, stopped.steps);
                const first = await page.evaluate(async () => {
                  const { game } = window.__dungeon!;
                  const steps = game.steps;
                  Reflect.deleteProperty(document, 'hidden');
                  document.dispatchEvent(new Event('visibilitychange'));
                  // Seed half a tick, then freeze page time across a simulated cache gap.
                  // No visibilitychange after pageshow may mask a missing reset.
                  const now = performance.now.bind(performance);
                  let frameTime = now() + 8;
                  performance.now = () => frameTime;
                  const rendered = () =>
                    new Promise<void>((resolve) =>
                      game.scene.onAfterRenderObservable.addOnce(() => resolve()),
                    );
                  await rendered();
                  const primed = game.steps;
                  frameTime += 5000;
                  window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
                  frameTime += 10;
                  try {
                    await rendered();
                    return { steps, primed, resumed: game.steps };
                  } finally {
                    const offset = frameTime - now();
                    performance.now = () => now() + offset;
                  }
                });
                rows.push({ id, first });
                assert.equal(first.primed, first.steps, 'priming frame must not tick');
                assert.equal(first.resumed, first.steps, 'first resumed frame must not catch up');
                await page.keyboard.up('KeyW');
                await page.waitForFunction(
                  (steps) => window.__dungeon!.game.steps > steps + 2,
                  stopped.steps,
                );
                assert.deepEqual(
                  (await position()).filter((_, i) => i !== 1),
                  stopped.position.filter((_, i) => i !== 1),
                );
                await move();
                await page.keyboard.up('KeyW');
                rows.push({ id, persistedResume: true, ...stopped });
                continue;
              }
              if (kind === 'r6') {
                await page.evaluate(() => {
                  const select = document.querySelector<HTMLSelectElement>('#quality')!;
                  select.value = 'low';
                  select.dispatchEvent(new Event('change'));
                  window.dispatchEvent(new Event('rig-generation'));
                });
                const witness = await page.evaluate(async () => {
                  const { witness, reason } = await window.__dungeon!.encounter.run('door', 'off');
                  return { witness, reason };
                });
                assert.equal(witness.witness?.phase, 'crossed');
                assert.equal(witness.reason, undefined);
                rows.push({ id, witness });
              } else {
                await page.keyboard.down('KeyW');
                await page.evaluate(
                  () =>
                    new Promise<void>((resolve) =>
                      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
                    ),
                );
                await page.keyboard.up('KeyW');
              }
              if (mode === 'navigate') {
                await page.route(`${base}/rig-landing`, (route) =>
                  route.fulfill({ contentType: 'text/html', body: '<title>Landing</title>' }),
                );
                await page.goto(`${base}/rig-landing`);
                const timeline = await page.evaluate(
                  (id) => JSON.parse(localStorage.getItem(`rig-timeline:${id}`) ?? '[]'),
                  id,
                );
                rows.push({ id, persistedNavigationTimeline: timeline });
                navigationErrors.push(
                  ...timeline.filter((row: { event: string }) => row.event === 'error'),
                );
                const terminal = timeline.filter((row: { event: string }) =>
                  [
                    'pagehide',
                    'engine-dispose-entry',
                    'engine-dispose-return',
                    'visibilitychange',
                  ].includes(row.event),
                );
                const hide = terminal.findIndex(
                  (row: { event: string }) => row.event === 'pagehide',
                );
                assert.ok(hide >= 0, `${id}: missing terminal hide`);
                assert.deepEqual(
                  terminal
                    .slice(hide)
                    .map(
                      (row: {
                        event: string;
                        trusted: boolean;
                        persisted: boolean | null;
                        hidden: boolean;
                      }) => [row.event, row.trusted, row.persisted, row.hidden],
                    ),
                  [
                    ['pagehide', true, false, false],
                    ['engine-dispose-entry', false, null, false],
                    ['engine-dispose-return', false, null, false],
                    ['visibilitychange', true, null, true],
                  ],
                  `${id}: expected a trusted terminal hide, disposal and trusted hidden event`,
                );
                assert.equal(
                  terminal.filter((row: { event: string }) => row.event === 'engine-dispose-return')
                    .length,
                  1,
                );
                assert.ok(
                  terminal
                    .slice(hide)
                    .every(
                      (
                        row: { id: string; generation: number; origin: number; time: number },
                        index: number,
                        all: { origin: number; time: number }[],
                      ) =>
                        row.id === id &&
                        row.generation === (kind === 'ordinary' ? 1 : 2) &&
                        row.origin === all[0]!.origin &&
                        Number.isFinite(row.time) &&
                        (index === 0 || row.time >= all[index - 1]!.time),
                    ),
                );
              }
              if (mode === 'replay') {
                await page.evaluate(() => {
                  window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
                  document.dispatchEvent(new Event('visibilitychange'));
                  window.dispatchEvent(new Event('blur'));
                  window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
                });
              }
            } finally {
              await context.close();
            }
          }
        }
      } finally {
        await browser.close();
      }
    },
    true,
  );
} finally {
  await writeFile(output, JSON.stringify({ browser: 'headless Chromium', rows, errors }, null, 2), {
    flag: 'wx',
  });
}
assert.deepEqual(errors, [], 'external page errors through context close');
assert.deepEqual(navigationErrors, [], 'same-origin navigation error journal');
