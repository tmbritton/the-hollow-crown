import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { put } from './targeted-shader-arms.ts';
import { withTrialPage, type TrialPageEvidence } from './targeted-shader-page.ts';
import { withViteServer } from './testServer.ts';
import './browserTypes.ts';

const [, , output, root, nonce] = process.argv;
assert.ok(
  output && !!root === !!nonce,
  'usage: targeted-shader-teardown-browser.ts NEW_JSON [ARM_ROOT NONCE]',
);
const base = 'http://127.0.0.1:5485';
const marker = 'injected unloading rigBinding error';
const rows: TrialPageEvidence[] = [];
try {
  await withViteServer(
    base,
    'dev',
    async () => {
      if (root)
        assert.deepEqual(await (await fetch(`${base}/__encounter-root`)).json(), {
          root,
          cwd: root,
          nonce,
        });
      const browser = await chromium.launch();
      try {
        for (const mode of ['clean', 'injected', 'missing'] as const) {
          for (const label of ['ordinary', 'R6']) {
            const evidence: TrialPageEvidence = { label: `${label}-${mode}`, errors: [] };
            rows.push(evidence);
            const run = withTrialPage(
              browser,
              base,
              { viewport: { width: 800, height: 450 } },
              evidence,
              async (page) => {
                await page.goto(`${base}/?shader-trial&seed=795${label === 'R6' ? '&debug' : ''}`);
                await page.waitForSelector('#loading.done', { state: 'attached', timeout: 45000 });
                if (label === 'R6') {
                  await page.waitForFunction(() => window.__dungeon?.ready);
                  const { witness, reason } = await page.evaluate(async () => {
                    const select = document.querySelector<HTMLSelectElement>('#quality')!;
                    select.value = 'low';
                    select.dispatchEvent(new Event('change'));
                    const { witness, reason } = await window.__dungeon!.encounter.run(
                      'door',
                      'off',
                    );
                    return { witness, reason };
                  });
                  assert.equal(reason, undefined);
                  assert.equal(witness?.phase, 'crossed');
                } else {
                  await page.keyboard.down('KeyW');
                  if (root)
                    await page.waitForFunction(
                      () => performance.getEntriesByName('shader-trial:motion').length === 1,
                    );
                  await page.keyboard.up('KeyW');
                }
                if (mode === 'injected')
                  await page.evaluate((marker) => {
                    document.addEventListener('visibilitychange', (event) => {
                      if (event.isTrusted && document.hidden) {
                        function rigBinding() {
                          throw new Error(marker);
                        }
                        rigBinding();
                      }
                    });
                  }, marker);
                if (mode === 'missing')
                  await page.evaluate(() => {
                    document.addEventListener('visibilitychange', (event) => {
                      if (event.isTrusted && document.hidden) localStorage.clear();
                    });
                  });
              },
            );
            if (mode === 'injected') {
              await assert.rejects(run, /unloading document error/);
              assert.match(JSON.stringify(evidence.journal), /injected unloading rigBinding error/);
            } else if (mode === 'missing') {
              await assert.rejects(run, /missing teardown journal/);
              assert.equal(evidence.journal, null);
            } else {
              await run;
              assert.ok(evidence.journal, 'missing teardown journal');
            }
            assert.equal(evidence.closed, true);
          }
        }
      } finally {
        await browser.close();
      }
    },
    true,
    root && nonce ? { root, nonce } : undefined,
  );
} finally {
  await put(output, rows);
}
