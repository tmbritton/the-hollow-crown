import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import type { WriterFrame } from './cursor-attribution-writers.ts';
import type { NativeRow, Pass } from './cursor-attribution-probe.ts';

const framePath = (dir: string, frame: number) => {
  if (!Number.isSafeInteger(frame) || frame < 0) throw new Error('invalid writer frame number');
  return join(dir, `writer-frame-${frame}.json.gz`);
};

// Offline transport only: await one completed write before producing the next frame.
export async function archiveWriterFrame(dir: string, frame: WriterFrame) {
  const bytes = gzipSync(JSON.stringify(frame));
  await writeFile(framePath(dir, frame.frame), bytes, { flag: 'wx' });
  return bytes.length;
}

export async function readWriterFrame(dir: string, frame: number): Promise<WriterFrame> {
  const row = JSON.parse(
    gunzipSync(await readFile(framePath(dir, frame))).toString(),
  ) as WriterFrame;
  if (row.frame !== frame) throw new Error(`unexpected archived writer frame at ${frame}`);
  return row;
}

const meanMeasured = (values: (number | null)[]) =>
  values.length && values.every((v): v is number => v !== null && Number.isFinite(v))
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;

function meanWork(calls: Pass[]) {
  const work = calls.map((call) => call.work);
  if (!work.length || !work.every((w): w is NonNullable<Pass['work']> => w !== null)) return null;
  const keys = Object.keys(work[0]) as (keyof NonNullable<Pass['work']>)[];
  return Object.fromEntries(keys.map((key) => [key, meanMeasured(work.map((w) => w[key]))]));
}

// Descriptive only. These timers are nested inside the inclusive pick budget and not additive.
export function describeNativePasses(rows: Pick<NativeRow, 'sync' | 'syncs' | 'passes'>[]) {
  return {
    frames: rows.length,
    proxySync: {
      msPerFrame: meanMeasured(rows.map((r) => r.sync)),
      callsPerFrame: meanMeasured(rows.map((r) => r.syncs)),
    },
    passes: ['enemy', 'object', 'cover'].map((name, i) => {
      const calls = rows.flatMap((r) => (r.passes[i] ? [r.passes[i]] : []));
      return {
        name,
        frames: calls.length,
        msPerCall: meanMeasured(calls.map((p) => p.ms)),
        workPerCall: meanWork(calls),
      };
    }),
  };
}

export async function archiveNativeRows<Header extends { length: number; rows: unknown[] }>(ports: {
  take(start: number, end: number): Promise<Header | null>;
  header(value: Header): Promise<void>;
  chunk(start: number, rows: Header['rows']): Promise<void>;
}) {
  const header = await ports.take(0, 0);
  if (!header) return null;
  await ports.header(header);
  const chunks: Header['rows'][] = [];
  for (let i = 0; i < header.length; i += 4) {
    const row = await ports.take(i, Math.min(i + 4, header.length));
    if (!row) throw new Error(`native bridge unavailable at frame chunk ${i}`);
    // The index preserves the concrete row type of the adapter.
    const chunk: Header['rows'] = row.rows;
    await ports.chunk(i, chunk);
    if (chunk.length !== Math.min(4, header.length - i))
      throw new Error(`incomplete native frame chunk at ${i}`);
    chunks.push(chunk);
  }
  return { header, rows: chunks.flat() as Header['rows'] };
}

// The hardware runner must not start a replacement using the demonstrated-invalid adapter.
export const captureBoundary =
  'Offline hold: live writer readback changes same-tick Babylon state, and retained visit-wide writer/scratch arrays exceed the observed-volume storage boundary';
