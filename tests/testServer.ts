import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

interface ServerOptions {
  url: string;
  command: string;
  args: string[];
  startupTimeoutMs?: number;
  requireOwned?: boolean;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

async function reachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(300) });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}

/** Own only a newly spawned server/session. Startup AND the browser callback share cleanup. */
export async function withTestServer<T>(
  options: ServerOptions,
  run: (child?: ChildProcess) => Promise<T>,
): Promise<T> {
  if (await reachable(options.url)) {
    if (options.requireOwned) throw new Error(`Refusing to reuse server at ${options.url}`);
    return run();
  }
  const grouped = process.platform !== 'win32';
  const child = spawn(options.command, options.args, {
    stdio: 'ignore',
    detached: grouped,
    cwd: options.cwd,
    env: options.env,
  });
  let spawnError: Error | undefined;
  child.once('error', (error) => {
    spawnError = error;
  });
  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
  const signal = (name: NodeJS.Signals) => {
    if (!child.pid) return;
    try {
      if (grouped) process.kill(-child.pid, name);
      else child.kill(name);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error;
    }
  };
  try {
    const deadline = Date.now() + (options.startupTimeoutMs ?? 20000);
    for (;;) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error(`Test server exited before ready (${child.exitCode ?? child.signalCode})`);
      if (await reachable(options.url)) break;
      if (Date.now() >= deadline) throw new Error(`Test server not ready: ${options.url}`);
      await Promise.race([closed, delay(50)]);
    }
    return await run(child);
  } finally {
    signal('SIGTERM');
    await Promise.race([closed, delay(1500, undefined, { ref: false })]);
    // The leader can exit before its descendants. Address only our owned process group.
    signal('SIGKILL');
    await closed;
  }
}

export function withViteServer<T>(
  base: string,
  mode: 'dev' | 'preview',
  run: () => Promise<T>,
  requireOwned = false,
  binding?: { root: string; nonce: string },
) {
  const url = new URL(base);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    if (requireOwned) throw new Error('Owned Vite server requires localhost');
    // Custom remote URLs must already be running; never start or stop a local process for them.
    return run();
  }
  return withTestServer(
    {
      url: base,
      requireOwned,
      cwd: binding?.root,
      env: binding ? { ...process.env, ENCOUNTER_VITE_NONCE: binding.nonce } : undefined,
      command: process.execPath,
      args: [
        fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
        ...(mode === 'preview' ? ['preview'] : []),
        ...(binding ? [binding.root] : []),
        '--host',
        url.hostname,
        '--port',
        url.port || (mode === 'dev' ? '5173' : '4173'),
        '--strictPort',
        ...(mode === 'preview' ? ['--base', url.pathname] : []),
      ],
    },
    run,
  );
}
