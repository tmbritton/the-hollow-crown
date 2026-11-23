import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const script = (name: string) => fileURLToPath(new URL(name, import.meta.url));

test('the reader marks the whole frame distribution unavailable for one bad timer', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'cpu7-reader-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'a1.json');
  const state = { actors: [], population: {}, resources: {} };
  for (const timer of [0, undefined, null, -1, '1']) {
    await writeFile(
      path,
      JSON.stringify({
        identity: {
          revision: 'abf8586ee8fd372e22decbe57a548ce5c019cc5f',
          sourceHash: 'e8b4bc7a5adc9fcb2e00444fec19a0b527caa59a370f7da348b1edf5076d1307',
          status: '',
          date: '2026-11-23T12:00:00Z',
          viewport: { width: 800, height: 450 },
        },
        renderer: { renderer: 'NVIDIA', vendor: 'NVIDIA' },
        errors: [],
        results: [
          {
            name: 'stable',
            mode: 'coarse',
            frames: 2,
            initial: state,
            final: state,
            checkpoints: [],
            samples: [3, timer].map((frame, step) => ({
              step,
              ms: { frame, tick: 1, presentation: 1 },
              counts: { ticks: 1, requestedTicks: 1, 'population.articulated': 1 },
            })),
            routes: [],
          },
        ],
      }),
    );
    const { stdout } = await run(process.execPath, [
      script('./cpu7-read.ts'),
      path,
      ...Array(5).fill('-'),
    ]);
    const result = JSON.parse(stdout).groups[0].results[0];
    assert.equal(result.combined.count, 2);
    if (timer === 0) {
      assert.equal(result.frame.count, 2);
      assert.equal(result.worst.step, 0);
    } else {
      assert.equal(result.frame, null, `timer: ${String(timer)}`);
      assert.equal(result.frameStatus, 'unavailable');
      assert.equal(result.active, null);
      assert.equal(result.worst, null);
    }
  }
});

test('CPU7 interaction CLI refuses an unverified checkout before probing or starting Vite', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'cpu7-checkout-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let requests = 0;
  const server = createServer((_request, response) => {
    requests++;
    response.writeHead(503).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const invoke = (root: string) =>
    run(process.execPath, [script('./cpu5-interactions-browser.ts')], {
      cwd: dir,
      timeout: 5000,
      env: {
        ...process.env,
        DEMO_URL: `http://127.0.0.1:${address.port}`,
        CPU7_INTERACTION_LABEL: 'regression',
        CPU7_SIDE: 'a',
        CPU7_CHECKOUT: root,
      },
    });
  await assert.rejects(invoke(''), /Supply CPU7_CHECKOUT/);
  await assert.rejects(invoke(dir), /CPU7 checkout verification failed/);
  assert.equal(requests, 0);
});
