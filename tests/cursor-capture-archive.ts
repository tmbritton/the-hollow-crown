import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { gzip, gzipSync, gunzip, gunzipSync } from 'node:zlib';
import { liveReceiver, pageBytes } from './cursor-capture-stream.ts';
import { writerDecoder } from './cursor-writer-stream.ts';
import type { WriterFrame } from './cursor-attribution-writers.ts';
import type { NativeRow, Pass } from './cursor-attribution-probe.ts';
import type { ReplayWork } from './cursor-attribution-replay.ts';

const compress = promisify(gzip);
const decompress = promisify(gunzip);
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
// Gzip framing/deflate block overhead even for an incompressible page.
const compressedPageLimit = pageBytes + 64 * 1024;

async function readBounded(path: string, limit: number) {
  const file = await open(path, 'r');
  try {
    const size = (await file.stat()).size;
    if (size > limit) throw new Error('writer archive file exceeds byte budget');
    const data = Buffer.allocUnsafe(size + 1);
    let at = 0;
    while (at <= size) {
      const { bytesRead } = await file.read(data, at, data.length - at, at);
      if (!bytesRead) break;
      at += bytesRead;
    }
    if (at !== size) throw new Error('writer archive file changed while reading');
    return data.subarray(0, size);
  } finally {
    await file.close();
  }
}

export async function openWriterArchive(
  dir: string,
  visit: string,
  window: readonly [number, number],
) {
  await mkdir(dir);
  let first = true,
    end = 0,
    compressedBytes = 0,
    peakCompressedBytes = 0,
    diskPages = 0;
  const decoder = writerDecoder();
  const path = (seq: number) => join(dir, `page-${seq}.gz`);
  const index = (seq: number) => join(dir, `page-${seq}.json`);
  const receipt = (seq: number) =>
    readBounded(index(seq), 4096).then(
      (value) =>
        JSON.parse(value.toString('utf8')) as {
          visit: string;
          seq: number;
          bytes: number;
          digest: string;
          final: boolean;
        },
    );
  const receiver = liveReceiver(visit, async ({ seq, bytes, final }, data) => {
    // Publish each page (and its own index entry) before returning credit. Even a
    // parser failure must preserve the offending page, without certifying it.
    await persistPage(seq, bytes, final, data);
    // Non-final credit certifies the persisted bytes, not semantic validity.
    // Scan the archive once, one page/frame at a time, before the final ACK.
    // Do not make live frame production compete with logical record expansion.
    if (final) {
      for (let i = 0; i <= seq; i++) {
        const { data } = await storedPage(i, seq);
        for (const frame of decoder.consume(data)) {
          if (end >= window[1] || (first && !(frame.from < window[0] && frame.to >= window[0])))
            throw new Error('invalid writer boundary span');
          first = false;
          end = frame.to;
        }
        if (decoder.status().ended !== (i === seq)) throw new Error('invalid writer trailer');
      }
      if (end < window[1]) throw new Error('incomplete writer window');
    }
  });
  async function persistPage(seq: number, bytes: number, final: boolean, data: Uint8Array) {
    const zipped = await compress(data, { level: 1 });
    if (zipped.length > compressedPageLimit)
      throw new Error('compressed writer page exceeds bound');
    peakCompressedBytes = Math.max(peakCompressedBytes, zipped.length);
    await writeFile(`${path(seq)}.tmp`, zipped, { flag: 'wx' });
    await rename(`${path(seq)}.tmp`, path(seq));
    await writeFile(
      `${index(seq)}.tmp`,
      JSON.stringify({ visit, seq, bytes, digest: sha(data), final }),
      {
        flag: 'wx',
      },
    );
    await rename(`${index(seq)}.tmp`, index(seq));
    compressedBytes += zipped.length;
    diskPages++;
  }
  async function storedPage(i: number, last: number) {
    const row = await receipt(i);
    if (
      row.visit !== visit ||
      row.seq !== i ||
      !Number.isSafeInteger(row.bytes) ||
      row.bytes < 0 ||
      row.bytes > pageBytes ||
      row.final !== (i === last)
    )
      throw new Error('writer archive index mismatch');
    const zipped = await readBounded(path(i), compressedPageLimit);
    peakCompressedBytes = Math.max(peakCompressedBytes, zipped.length);
    const data = await decompress(zipped, { maxOutputLength: pageBytes });
    if (data.length !== row.bytes || sha(data) !== row.digest)
      throw new Error('writer archive page integrity mismatch');
    return { data, row };
  }
  async function* pages() {
    const { committed, sealed } = receiver.status();
    if (!sealed) throw new Error('writer archive not sealed');
    for (let i = 0; i < committed; i++) yield await storedPage(i, committed - 1);
  }
  return {
    ...receiver,
    status: () => ({
      ...receiver.status(),
      ...decoder.status(),
      compressedBytes,
      peakCompressedBytes,
      diskPages,
    }),
    pages,
    async *frames() {
      const reader = writerDecoder();
      for await (const { data } of pages())
        for (const frame of reader.consume(data)) yield { frame, header: reader.header()! };
      if (!reader.status().ended || reader.status().frames !== decoder.status().frames)
        throw new Error('writer archive trailer mismatch');
    },
    header() {
      if (!receiver.status().sealed) throw new Error('writer archive not sealed');
      return decoder.header()!;
    },
  };
}

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
export async function runVisitBoundary<C, T>(ports: {
  wait(): Promise<void>;
  archive(): Promise<C>;
  healthy(): Promise<void>;
  validate(captured: C): Promise<T>;
  after(): Promise<void>;
  progress(stage: 'capture ended' | 'native archived' | 'visit validated' | 'admitted'): void;
  archiveFailed?(waitFailure: unknown, archiveFailure: unknown): Promise<void>;
}) {
  let waitFailure: unknown;
  let waitFailed = false;
  try {
    await ports.wait();
    ports.progress('capture ended');
  } catch (error) {
    waitFailed = true;
    waitFailure = error;
  }
  let captured: C;
  try {
    captured = await ports.archive();
    if (captured) ports.progress('native archived');
  } catch (error) {
    await ports.archiveFailed?.(waitFailure, error);
    throw waitFailed ? waitFailure : error;
  }
  if (waitFailed) throw waitFailure;
  await ports.healthy();
  const validated = await ports.validate(captured);
  await ports.healthy();
  ports.progress('visit validated');
  await ports.after();
  await ports.healthy();
  ports.progress('admitted');
  return validated;
}

export function assertReplayWork(
  i: number,
  passes: number,
  count: ReplayWork | undefined,
  time: ReplayWork | undefined,
) {
  function work(row: ReplayWork | undefined) {
    if (
      !row ||
      row.i !== i ||
      row.forcedProxy.length !== 2 ||
      row.forcedProxy.some((n) => n === null || !Number.isSafeInteger(n) || n < 0)
    )
      throw new Error(`missing replay work at frame ${i}`);
    return [
      row.forcedProxy,
      ...[row.exhaustive, row.local].map((arm) => {
        if (arm.length !== passes || arm.some(({ work, ms }) => ms !== null || work === null))
          throw new Error(`missing replay work at frame ${i}`);
        return arm.map((pass) => pass.work);
      }),
    ];
  }
  assert.deepEqual(work(time), work(count), `count/time replay work mismatch at frame ${i}`);
}
import assert from 'node:assert/strict';
