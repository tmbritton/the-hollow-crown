import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { withTestServer } from './testServer.ts';

async function address() {
  const server = createServer((_, res) => res.end('external'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const at = server.address();
  assert.ok(at && typeof at !== 'string');
  return { server, url: `http://127.0.0.1:${at.port}`, port: at.port };
}
async function fixture() {
  const { server, url, port } = await address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return {
    url,
    command: process.execPath,
    args: [
      '-e',
      `require('node:http').createServer((_,r)=>r.end('owned')).listen(${port},'127.0.0.1')`,
    ],
    startupTimeoutMs: 3000,
  };
}
async function closed(url: string) {
  await assert.rejects(fetch(url, { signal: AbortSignal.timeout(500) }));
}

test(
  'test server owns cleanup around browser launch rejection and normal return',
  { timeout: 10000 },
  async () => {
    const options = await fixture();
    let pid: number | undefined;
    await assert.rejects(
      withTestServer(options, async (child) => {
        pid = child?.pid;
        assert.ok(pid);
        throw new Error('browser launch rejected');
      }),
      /browser launch rejected/,
    );
    await closed(options.url);
    assert.throws(() => process.kill(pid!, 0), { code: 'ESRCH' });
    assert.equal(await withTestServer(options, async () => 'finished'), 'finished');
    await closed(options.url);
  },
);

test('test server preserves a reused external server even when the browser fails', async (t) => {
  const { server, url } = await address();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await assert.rejects(
    withTestServer({ url, command: '/missing-command', args: [] }, async (child) => {
      assert.equal(child, undefined);
      throw new Error('page failure');
    }),
    /page failure/,
  );
  assert.equal(await (await fetch(url)).text(), 'external');
});

test(
  'test server cleans readiness timeout, early exit and spawn failure',
  { timeout: 10000 },
  async () => {
    const options = await fixture();
    let ran = false;
    const body = async () => {
      ran = true;
    };
    await assert.rejects(
      withTestServer(
        { ...options, startupTimeoutMs: 150, args: ['-e', 'setInterval(()=>{},1000)'] },
        body,
      ),
      /ready/i,
    );
    await assert.rejects(
      withTestServer({ ...options, args: ['-e', 'process.exit(7)'] }, body),
      /exit/i,
    );
    await assert.rejects(
      withTestServer({ ...options, command: '/missing-command' }, body),
      /ENOENT/,
    );
    assert.equal(ran, false);
    await closed(options.url);
  },
);

test(
  'test server closes its descendant listener after its parent exits',
  {
    timeout: 10000,
    skip: process.platform === 'win32',
  },
  async () => {
    const options = await fixture();
    const listener = options.args[1];
    options.args = [
      '-e',
      `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(listener)}],{stdio:'ignore'});setInterval(()=>{},1000)`,
    ];
    await withTestServer(options, async (child) => {
      assert.ok(child);
      const exit = once(child, 'exit');
      child.kill('SIGKILL');
      await exit;
      assert.equal(await (await fetch(options.url)).text(), 'owned', 'descendant outlives parent');
    });
    await closed(options.url);
  },
);
