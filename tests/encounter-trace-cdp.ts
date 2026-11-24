import type { CDPSession } from '@playwright/test';
import { open } from 'node:fs/promises';

const categories = [
  'blink.user_timing',
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'v8',
  'disabled-by-default-v8.cpu_profiler',
  'cc',
  'viz',
  'gpu',
  'disabled-by-default-gpu.service',
  'disabled-by-default-gpu.device',
  'disabled-by-default-gpu.debug',
  'disabled-by-default-cc.debug',
  'disabled-by-default-viz.debug',
  'benchmark',
  'toplevel',
];
export const traceLimits = {
  recordingMs: 3500,
  commandMs: 7000,
  drainMs: 15000,
  bytes: 64 * 1024 * 1024,
};

export async function bounded<T>(label: string, ms: number, run: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms} ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function createBrowserTrace(session: CDPSession, file: string) {
  const { categories: supported } = await bounded('Trace categories', traceLimits.commandMs, () =>
    session.send('Tracing.getCategories'),
  );
  // getCategories can omit dynamically registered Blink/renderer categories; request the base set
  // regardless and report actual lane/category contents independently of this advertisement.
  const requested = [
    ...new Set([
      ...categories,
      ...supported.filter((c) =>
        /^disabled-by-default-(gpu|viz|cc)\..*(device|timing|timer|vulkan)/.test(c),
      ),
    ]),
  ];
  const usage: { percentFull?: number; eventCount?: number; value?: number }[] = [];
  session.on('Tracing.bufferUsage', (event) => {
    if (usage.length < 64) usage.push(event);
  });
  const complete = new Promise<{ stream?: string; dataLossOccurred: boolean }>((resolve) => {
    session.once('Tracing.tracingComplete', resolve);
  });
  const status = {
    supported,
    requested,
    usage,
    eof: false,
    dataLossOccurred: undefined as boolean | undefined,
    peakBufferUsage: 0,
    bytes: 0,
    recordingPossiblyActive: false,
  };
  session.on('Tracing.bufferUsage', (event) => {
    status.peakBufferUsage = Math.max(
      status.peakBufferUsage,
      event.percentFull ?? event.value ?? 0,
    );
  });
  return {
    status,
    async start() {
      status.recordingPossiblyActive = true;
      await bounded('Tracing.start', traceLimits.commandMs, () =>
        session.send('Tracing.start', {
          traceConfig: {
            includedCategories: requested,
            recordMode: 'recordUntilFull',
            traceBufferSizeInKb: 32768,
          },
          bufferUsageReportingInterval: 250,
          transferMode: 'ReturnAsStream',
          streamFormat: 'json',
        }),
      );
    },
    async drain() {
      await bounded('Tracing.end', traceLimits.commandMs, () => session.send('Tracing.end'));
      const end = await bounded('Tracing.tracingComplete', traceLimits.commandMs, () => complete);
      status.recordingPossiblyActive = false;
      status.dataLossOccurred = end.dataLossOccurred;
      if (!end.stream) throw new Error('Missing CDP trace stream');
      const handle = end.stream;
      const raw = await open(file, 'wx');
      const deadline = Date.now() + traceLimits.drainMs;
      try {
        while (!status.eof) {
          const remaining = deadline - Date.now();
          if (remaining <= 0) throw new Error('Trace drain deadline exceeded');
          const chunk = await bounded('IO.read', remaining, () =>
            session.send('IO.read', { handle, size: 256 * 1024 }),
          );
          const bytes = Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8');
          const available = traceLimits.bytes - status.bytes;
          const retained = bytes.subarray(0, available);
          await raw.writeFile(retained);
          status.bytes += retained.length;
          if (bytes.length > available) throw new Error('Trace stream exceeds byte cap');
          status.eof = chunk.eof;
        }
      } finally {
        await raw.close();
        await bounded('IO.close', traceLimits.commandMs, () =>
          session.send('IO.close', { handle }),
        );
      }
    },
  };
}
