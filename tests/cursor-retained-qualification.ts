import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import type { Observation, WriterFrame, WriterTrace } from './cursor-attribution-writers.ts';
import {
  compactWriterRecords,
  observationDelta,
  thinFragmentScalars,
} from './cursor-writer-stream.ts';
import type { Site, WriterRecord } from './cursor-writer-stream.ts';
import { phases, writerKinds } from './cursor-writer-evidence.ts';

export async function retainedQualification() {
  const fixture = new URL('../test-results/epic16/hardware-40phAH/', import.meta.url);
  async function load<T>(name: string): Promise<T> {
    return JSON.parse(
      gunzipSync(await readFile(new URL(`shrine-count-${name}.json.gz`, fixture))).toString(),
    );
  }
  const header = await load<Omit<WriterTrace, 'frames'>>('writer-header');
  header.provenance = 'software';
  const native = [
    ...(await load<WriterFrame[]>('writers-0')),
    ...(await load<WriterFrame[]>('writers-2')),
  ];
  const complete = native.slice(0, 3);
  assert.deepEqual(
    complete.map((frame) => frame.frame),
    [65, 66, 67],
  );
  assert.notEqual(native[3].checks.at(-1)?.phase, 'render');
  const last = new Map(header.seed.map((o) => [o.id, o]));
  for (const f of complete)
    for (const w of f.writes) {
      if (w.after) last.set(w.id, w.after);
      else last.delete(w.id);
    }
  assert.equal(last.size, header.seed.length);
  const reset = header.seed.flatMap((after) => {
    const before = last.get(after.id)!;
    return isDeepStrictEqual(before, after) ? [] : [{ before, after }];
  });
  // Tile only the three complete retained frames. At each seam explicitly restore
  // writer state; don't fill the stopped frame or turn its missing check into a pass.
  function* frames(length: number): Generator<WriterFrame> {
    let seq = 0;
    let from = complete[0].from;
    for (let i = 0; i < length; i++) {
      const base = complete[i % complete.length];
      const tickOffset = from - base.from;
      const frame = complete[0].frame + i;
      const writes: WriterFrame['writes'] = [];
      if (i > 0 && base === complete[0])
        for (const { before, after } of reset)
          writes.push({
            before,
            after,
            seq: seq++,
            frame,
            tick: from + 1,
            phase: 'fixed',
            id: after.id,
            kind: 'pose',
          });
      const offset = seq - base.writes[0].seq;
      for (const write of base.writes)
        writes.push({ ...write, seq: seq++, frame, tick: write.tick + tickOffset });
      const to = base.to + tickOffset;
      yield {
        frame,
        from,
        to,
        writes,
        checks: base.checks.map((c) => ({ ...c, at: c.at + offset, tick: c.tick + tickOffset })),
      };
      from = to;
    }
  }
  const start: WriterRecord[] = [];
  const add = (append: (r: WriterRecord) => void, row: WriterRecord, observation: Observation) => {
    const thin = observation.input.thin;
    if (!thin || thin.length <= thinFragmentScalars) return append(row);
    const value = { ...observation, input: { ...observation.input, thin: null } };
    if (row[0] === 'seed') append(['seed', value, thin.length]);
    else if (row[0] === 'mesh') append(['mesh', value, thin.length]);
    else if (row[0] === 'write') append(['write', row[1], value, thin.length]);
    else throw new Error('unexpected fragmented record');
    for (let i = 0; i < thin.length; i += thinFragmentScalars)
      append(['thin', i, thin.slice(i, i + thinFragmentScalars)]);
  };
  start.push(['start', { runId: header.runId, kind: header.kind, provenance: header.provenance }]);
  for (const id of header.identities) start.push(['id', id]);
  for (const o of header.seed) add((r) => start.push(r), ['seed', o], o);
  const checkpoint = new Map(header.seed.map((o) => [o.id, o]));
  function encode(frame: WriterFrame) {
    const rows: WriterRecord[] = [];
    const { append } = compactWriterRecords((row) => rows.push(row));
    append(['begin', frame.frame, frame.from]);
    let i = 0;
    for (const { scene, ...c } of frame.checks) {
      while (i < frame.writes.length && frame.writes[i].seq < c.at) {
        const w = frame.writes[i++];
        const site: Site = [
          w.id,
          w.tick,
          phases.indexOf(w.phase),
          writerKinds.indexOf(w.kind),
          w.slot ?? null,
          w.refreshThin ?? null,
        ];
        if (!w.after) append(['write', site, null]);
        else {
          const delta = observationDelta(w.before, w.after);
          if (delta)
            append(delta[1].length ? ['write-delta', site, delta] : ['write', site, false]);
          else add(append, ['write', site, w.after], w.after);
        }
      }
      append(['check', c]);
      for (const o of scene) {
        const delta = observationDelta(checkpoint.get(o.id), o);
        if (delta) append(delta[1].length ? ['mesh-delta', delta] : ['mesh', o.id]);
        else add(append, ['mesh', o], o);
        checkpoint.set(o.id, o);
      }
      assert.equal(scene.length, checkpoint.size);
      append(['end-check']);
    }
    assert.equal(i, frame.writes.length);
    append(['end', frame.to]);
    return rows;
  }
  const dictionary = [...frames(6)].map(encode);
  return {
    start,
    dictionary,
    gaps: header.gaps,
    frames,
    header,
    native,
    resetWrites: reset.length,
  };
}
