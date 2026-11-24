import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { revisions } from './cpu7-study.ts';
import { isolatedGitEnv } from './git-env.ts';

/** Never probe/reuse a listener or fall back to the study cwd in CPU7 mode. */
export async function withCpu7InteractionServer(
  base: string | undefined,
  run: (base: string) => Promise<void>,
) {
  const { CPU7_CHECKOUT: checkout, CPU7_SIDE: side } = process.env;
  assert.ok(checkout && isAbsolute(checkout), 'Supply CPU7_CHECKOUT as an absolute worktree path');
  assert.ok(side === 'a' || side === 'b', 'Supply CPU7_SIDE=a or CPU7_SIDE=b');
  assert.ok(base, 'Supply DEMO_URL with an unused local port');
  const url = new URL(base);
  assert.equal(base.replace(/\/$/, ''), url.origin, 'DEMO_URL must be a bare origin');
  assert.ok(
    url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port,
    'DEMO_URL must be http://127.0.0.1 with an explicit unused port',
  );

  const revision = revisions[side === 'a' ? 0 : 1][0];
  let root: string;
  try {
    root = await realpath(checkout);
    const env = isolatedGitEnv();
    const git = (...args: string[]) =>
      execFileSync('git', args, {
        cwd: root,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    assert.equal(
      await realpath(git('rev-parse', '--show-toplevel')),
      root,
      'not the worktree root',
    );
    assert.equal(git('rev-parse', 'HEAD'), revision, `wrong revision for side ${side}`);
    assert.equal(
      git('status', '--porcelain', '--untracked-files=all'),
      '',
      'worktree is not clean',
    );
  } catch (cause) {
    throw new Error(`CPU7 checkout verification failed: ${checkout} (expected clean ${revision})`, {
      cause,
    });
  }

  const { createServer } = await import('vite');
  const server = await createServer({
    root,
    server: { host: url.hostname, port: Number(url.port), strictPort: true, hmr: false },
  });
  try {
    assert.equal(await realpath(server.config.root), root, 'CPU7 Vite root mismatch');
    await server.listen();
    await run(url.origin);
  } finally {
    await server.close();
  }
}
