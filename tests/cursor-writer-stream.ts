import { pageRecords } from './cursor-capture-stream.ts';
import { observationSize } from './cursor-attribution-writers.ts';
import { phases, writerKinds } from './cursor-writer-evidence.ts';
import type {
  Checkpoint,
  GeometryInput,
  Observation,
  Write,
  WriterFrame,
  WriterTrace,
} from './cursor-attribution-writers.ts';

export const identityLimit = 8_192;
export const observationLimit = 32_768;
export const thinFragmentScalars = 512;
export const stateScalars = 1_250_000;
export const frameScalars = 4_000_000;
export const frameEvents = 100_000;
type Header = Omit<WriterTrace, 'frames'>;
type Identity = Header['identities'][number];
const deltaKeys = [
  'min',
  'max',
  'aggregate',
  'world',
  'lineage',
  'eligible',
  'fallback',
  'authored',
  'boundsDirty',
  'thin',
] as const;
type Delta = [number, [number, unknown][]];
function equalValue(a: unknown, b: unknown): boolean {
  return (
    Object.is(a, b) ||
    (Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((n, i) => equalValue(n, b[i])))
  );
}
export function observationDelta(
  before: Observation | undefined | null,
  after: Observation,
): Delta | null {
  if (!before || before.id !== after.id || before.input.thin?.length !== after.input.thin?.length)
    return null;
  const edits: Delta[1] = [];
  for (const [i, key] of deltaKeys.entries()) {
    const a = before.input[key],
      b = after.input[key];
    if (
      !equalValue(a, b) &&
      !(
        key === 'aggregate' &&
        before.input.aggregate &&
        after.input.aggregate &&
        equalValue(before.input.aggregate.min, after.input.aggregate.min) &&
        equalValue(before.input.aggregate.max, after.input.aggregate.max)
      )
    ) {
      if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
        const changed: unknown[] = [];
        for (let j = 0; j < b.length && changed.length < b.length; j++)
          if (!Object.is(a[j], b[j])) changed.push(j, b[j]);
        if (changed.length < b.length) {
          edits.push([i + 16, changed]);
          continue;
        }
      }
      edits.push([i, b]);
    }
  }
  if (!equalValue(before.world, after.world)) edits.push([15, after.world]);
  return [after.id, edits];
}

function restoreDelta(before: Observation | undefined, [id, edits]: Delta): Observation {
  if (!before || before.id !== id || !Array.isArray(edits) || edits.length > 11)
    throw new Error('invalid observation delta');
  const input: Record<string, unknown> = { ...before.input };
  let world = before.world;
  for (const [i, v] of edits) {
    if (i === 15) world = v as Observation['world'];
    else if (deltaKeys[i]) input[deltaKeys[i]] = v;
    else {
      const key = deltaKeys[i - 16];
      const base = input[key];
      if (
        !key ||
        !Array.isArray(base) ||
        !Array.isArray(v) ||
        v.length % 2 ||
        v.length >= base.length
      )
        throw new Error('invalid observation scalar delta');
      const next = base.slice();
      for (let j = 0; j < v.length; j += 2) {
        if (
          !Number.isInteger(v[j]) ||
          v[j] < 0 ||
          v[j] >= next.length ||
          !Number.isFinite(v[j + 1])
        )
          throw new Error('invalid observation scalar delta');
        next[v[j]] = v[j + 1];
      }
      input[key] = next;
    }
  }
  return { id, input: input as GeometryInput, world };
}
export type Site = [
  id: number,
  tick: number,
  phase: number,
  kind: number,
  slot: number | null,
  refresh: boolean | null,
];
export type WriterRecord =
  | ['start', Pick<Header, 'runId' | 'kind' | 'provenance'>]
  | ['id', Identity]
  | ['seed', Observation, number?]
  | ['begin', number, number]
  | ['write', Site, Observation | null | false, number?]
  | ['write-span', Site, number]
  | ['write-delta', Site, Delta]
  | ['check', Omit<Checkpoint, 'scene'>]
  | ['mesh', number | Observation, number?]
  | ['mesh-span', number, number]
  | ['mesh-delta', Delta]
  | ['thin', number, number[]]
  | ['end-check']
  | ['end', number]
  | ['trailer', number, number, string[]];

// Coalesce only adjacent, already observed references. A span changes storage,
// never the number, ordering, or provenance of the logical records.
export function compactWriterRecords(send: (row: WriterRecord) => void) {
  let pending: ['mesh-span', number, number] | ['write-span', Site, number] | null = null;
  function flush() {
    if (pending) send(pending);
    pending = null;
  }
  return {
    flush,
    append(row: WriterRecord) {
      if (row[0] === 'mesh' && typeof row[1] === 'number') {
        if (pending?.[0] === 'mesh-span' && row[1] === pending[1] + pending[2]) pending[2]++;
        else {
          flush();
          pending = ['mesh-span', row[1], 1];
        }
      } else if (row[0] === 'write' && row[2] === false) {
        if (
          pending?.[0] === 'write-span' &&
          row[1][0] === pending[1][0] + pending[2] &&
          pending[1].every((n, i) => i === 0 || n === row[1][i])
        )
          pending[2]++;
        else {
          flush();
          pending = ['write-span', row[1], 1];
        }
      } else {
        flush();
        send(row);
      }
    },
  };
}

// Decoder owns only two independent last-value tables and a single partial frame.
// Checkpoint deltas never reference events. Writer deltas never reference checkpoints.
export function writerDecoder() {
  let header: Header | null = null;
  let frame: WriterFrame | null = null;
  let check: Checkpoint | null = null;
  let frames = 0,
    seq = 0,
    scalars = 0,
    events = 0;
  let peakFrameScalars = 0,
    peakFrameEvents = 0,
    peakStateScalars = 0,
    logicalScalars = 0;
  let retained = new Set<Observation>();
  let lastFrame: Pick<WriterFrame, 'frame' | 'to'> | null = null;
  let ended = false;
  let operand: { row: WriterRecord; values: number[]; size: number } | null = null;
  const counts = [0, 0, 0];
  const writers = new Map<number, Observation>();
  const checks = new Map<number, Observation>();
  const meshIds = new Set<number>();
  let checkIds = new Set<number>();
  const bad = (): never => {
    throw new Error('invalid or over-budget writer record sequence');
  };
  const integer = (n: number) => Number.isSafeInteger(n) && n >= 0;
  function charge(...operands: (Observation | null)[]) {
    for (const o of operands)
      if (o) {
        const n = observationSize(o);
        logicalScalars += n;
        if (!retained.has(o)) {
          scalars += n;
          retained.add(o);
        }
      }
    if (++events > frameEvents || scalars > frameScalars)
      throw new Error(
        `writer frame budget at ${frame?.frame}: ${events} events, ${scalars} resident scalars`,
      );
    peakFrameScalars = Math.max(peakFrameScalars, scalars);
    peakFrameEvents = Math.max(peakFrameEvents, events);
  }
  function register(
    map: Map<number, Observation>,
    id: number,
    next: Observation | null,
    index: number,
  ) {
    const size = observationSize(next);
    if (!header?.identities[id] || (next && next.id !== id) || size > observationLimit) bad();
    counts[index] += size - observationSize(map.get(id) ?? null);
    if (counts[index] > stateScalars)
      throw new Error(`writer active state budget: ${counts[index]} scalars`);
    peakStateScalars = Math.max(peakStateScalars, counts[0] + counts[1] + counts[2]);
    if (next) map.set(id, next);
    else map.delete(id);
  }
  return {
    header: () => header,
    status: () => ({
      frames,
      seq,
      ended,
      peakFrameScalars,
      peakFrameEvents,
      peakStateScalars,
      logicalScalars,
    }),
    consume(bytes: Uint8Array) {
      return acceptPage(bytes);
    },
  };
  function* acceptPage(bytes: Uint8Array) {
    for (const data of expand(pageRecords(bytes))) {
      if (ended || !Array.isArray(data)) bad();
      let row = data as WriterRecord;
      if (operand) {
        if (
          row[0] !== 'thin' ||
          row[1] !== operand.values.length ||
          !Array.isArray(row[2]) ||
          row[2].length !== Math.min(thinFragmentScalars, operand.size - operand.values.length) ||
          !row[2].every(Number.isFinite)
        )
          bad();
        operand.values.push(...(row[2] as number[]));
        if (operand.values.length < operand.size) continue;
        row = operand.row;
        operand = null;
      } else if (row[0] === 'seed' || row[0] === 'mesh' || row[0] === 'write') {
        const o = row[0] === 'write' ? row[2] : row[1];
        const size = row[0] === 'write' ? row[3] : row[2];
        if (size !== undefined) {
          if (
            !integer(size) ||
            size <= thinFragmentScalars ||
            size > observationLimit ||
            size % 16 ||
            !o ||
            typeof o !== 'object' ||
            o.input.thin !== null
          )
            bad();
          const values: number[] = [];
          (o as Observation).input.thin = values;
          operand = { row, values, size };
          continue;
        }
      }
      if (row[0] === 'start') {
        if (
          header ||
          !row[1]?.runId ||
          !['shrine', 'floor', 'idle'].includes(row[1].kind) ||
          !['software', 'matched'].includes(row[1].provenance)
        )
          bad();
        header = { ...row[1], identities: [], seed: [], gaps: [] };
        continue;
      }
      if (!header) throw new Error('missing writer stream header');
      if (check && row[0] !== 'mesh' && row[0] !== 'mesh-delta' && row[0] !== 'end-check') bad();
      switch (row[0]) {
        case 'id': {
          const id = row[1];
          if (
            id.id !== header.identities.length ||
            id.id >= identityLimit ||
            !integer(id.mesh) ||
            meshIds.has(id.mesh) ||
            typeof id.name !== 'string' ||
            id.name.length > 256
          )
            bad();
          meshIds.add(id.mesh);
          header.identities.push(id);
          break;
        }
        case 'seed': {
          const o = row[1];
          if (frame || frames || writers.has(o.id)) bad();
          register(writers, o.id, o, 0);
          register(checks, o.id, o, 1);
          header.seed.push(o);
          counts[2] += observationSize(o);
          peakStateScalars = Math.max(peakStateScalars, counts[0] + counts[1] + counts[2]);
          break;
        }
        case 'begin':
          if (
            frame ||
            !integer(row[1]) ||
            !integer(row[2]) ||
            (lastFrame && (row[1] !== lastFrame.frame + 1 || row[2] !== lastFrame.to))
          )
            bad();
          frame = { frame: row[1], from: row[2], to: row[2], writes: [], checks: [] };
          scalars = events = 0;
          retained = new Set();
          break;
        case 'write-delta':
        case 'write': {
          const [, fields, operand] = row;
          const [id, tick, phaseId, kindId, slot, refreshThin] = fields;
          const phase = phases[phaseId],
            kind = writerKinds[kindId];
          if (
            !frame ||
            !integer(id) ||
            !integer(tick) ||
            !phase ||
            !kind ||
            (slot !== null && !integer(slot)) ||
            (refreshThin !== null && typeof refreshThin !== 'boolean')
          )
            bad();
          const site: Omit<Write, 'before' | 'after'> = {
            seq: seq++,
            frame: frame!.frame,
            tick,
            phase,
            id,
            kind,
            slot: slot ?? undefined,
            refreshThin: refreshThin ?? undefined,
          };
          const before = writers.get(id) ?? null;
          if (operand === false && !before) bad();
          const after =
            row[0] === 'write-delta'
              ? restoreDelta(before ?? undefined, row[2])
              : row[2] === false
                ? before
                : row[2];
          charge(before, after);
          register(writers, site.id, after, 0);
          frame!.writes.push({ ...site, before, after });
          break;
        }
        case 'check':
          if (!frame || row[1].at !== seq) bad();
          charge();
          checkIds = new Set();
          check = { ...row[1], scene: [] };
          break;
        case 'mesh-delta':
        case 'mesh': {
          const id =
            row[0] === 'mesh-delta' ? row[1][0] : typeof row[1] === 'number' ? row[1] : row[1].id;
          const o =
            row[0] === 'mesh-delta'
              ? restoreDelta(checks.get(id), row[1])
              : typeof row[1] === 'number'
                ? checks.get(id)
                : row[1];
          if (!check || !o || checkIds.has(id))
            throw new Error('invalid independent checkpoint mesh');
          charge(o);
          register(checks, id, o, 1);
          checkIds.add(id);
          check.scene.push(o);
          break;
        }
        case 'end-check':
          if (!frame || !check) bad();
          for (const id of checks.keys()) if (!checkIds.has(id)) register(checks, id, null, 1);
          frame!.checks.push(check!);
          check = null;
          break;
        case 'end': {
          if (
            !frame ||
            !integer(row[1]) ||
            row[1] < frame.from ||
            frame.checks.at(-1)?.phase !== 'render'
          )
            bad();
          const complete = frame!;
          complete.to = row[1];
          lastFrame = { frame: complete.frame, to: complete.to };
          frame = null;
          retained.clear();
          frames++;
          yield complete;
          break;
        }
        case 'trailer':
          if (
            frame ||
            !frames ||
            row[1] !== frames ||
            row[2] !== seq ||
            !Array.isArray(row[3]) ||
            row[3].length > 16 ||
            !row[3].every((g) => typeof g === 'string' && g.length <= 512)
          )
            bad();
          header.gaps.push(...row[3]);
          ended = true;
          writers.clear();
          checks.clear();
          checkIds.clear();
          meshIds.clear();
          break;
        default:
          bad();
      }
    }
  }
  function* expand(records: Iterable<unknown>): Generator<unknown> {
    for (const data of records) {
      if (Array.isArray(data) && (data[0] === 'write-span' || data[0] === 'mesh-span')) {
        const span = data as Extract<WriterRecord, ['write-span' | 'mesh-span', ...unknown[]]>;
        const start = span[0] === 'mesh-span' ? span[1] : span[1][0];
        if (!integer(start) || !integer(span[2]) || !span[2] || start + span[2] > identityLimit)
          bad();
        for (let i = 0; i < span[2]; i++) {
          if (span[0] === 'mesh-span') yield ['mesh', start + i];
          else
            yield [
              'write',
              [start + i, span[1][1], span[1][2], span[1][3], span[1][4], span[1][5]],
              false,
            ];
        }
      } else yield data;
    }
  }
}
