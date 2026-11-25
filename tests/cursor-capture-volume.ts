import { liveProducer } from './cursor-capture-stream.ts';
import type { Packet } from './cursor-capture-stream.ts';
import type { Observation } from './cursor-attribution-writers.ts';
import type { WriterRecord } from './cursor-writer-stream.ts';
import { compactWriterRecords, observationDelta } from './cursor-writer-stream.ts';
import { writerKinds } from './cursor-writer-evidence.ts';

export const volumeMeshes = 2_395;
export const volumeWrites = 12_982;
export const volumeChanging = 96;

export function volumeOperand(id: number, frame = -1): Observation {
  const changing = id < volumeChanging;
  const batched = changing && id % 4 === 0;
  const shift = changing ? ((frame + 1) % 3) * 4 : 0;
  const x = id * 4 + id * Number.EPSILON + (batched ? 0 : shift);
  const z = (id % 31) * 4;
  const world = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1];
  const thin = batched ? [...world, ...world] : null;
  if (thin) thin[28] += shift;
  return {
    id,
    input: {
      min: [-1, -1, -1],
      max: [1, 1, 1],
      aggregate: null,
      world,
      thin,
      lineage: [],
      authored: [x, 0, z, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
      eligible: !changing || (frame + id) % 2 === 0,
      boundsDirty: false,
      fallback: !!thin,
    },
    world: [x - 1, -1, z - 1, x + 1, 1, z + 1],
  };
}

export const volumeKind = (id: number) => ['thin-edit', 'door', 'physics', 'pose'][id % 4];

// Transport-only workload. Every check and write is recovered in order, with
// independently encoded writer and checkpoint deltas plus retained references.
export async function browserVolume(
  runId: string,
  visit: string,
  frames: number,
  send: (packet: Packet) => Promise<Pick<Packet, 'visit' | 'seq' | 'digest'>>,
) {
  if (frames !== 60 && frames !== 120) throw new Error('unsupported synthetic window');
  const capture = liveProducer(visit, send);
  const compact = compactWriterRecords(capture.append);
  const emit = (record: WriterRecord) => compact.append(record);
  let seq = 0,
    beforeEnd = 0;
  for (let frame = 0; frame < frames; frame++) {
    // This is a transport-only animation workload, not a game visit. It never
    // waits for credits or disk inside its frame loop.
    await new Promise<void>((done) => requestAnimationFrame(() => done()));
    if (capture.status().kind === 'failed') break;
    if (!frame) {
      capture.begin();
      emit(['start', { runId, kind: 'idle', provenance: 'software' }]);
      for (let id = 0; id < volumeMeshes; id++) {
        emit(['id', { id, mesh: id + 1000, name: `fixture-${id}` }]);
        emit(['seed', volumeOperand(id)]);
      }
    }
    beforeEnd = capture.status().committed;
    const from = 179 + frame * 5;
    emit(['begin', frame, from]);
    const edits = Array.from({ length: volumeChanging }, (_, id) =>
      observationDelta(volumeOperand(id, frame - 1), volumeOperand(id, frame))!,
    );
    for (let i = 0; i < volumeWrites; i++) {
      const id = i % volumeMeshes;
      if (i < volumeChanging) {
        const thin = i % 4 === 0;
        emit([
          'write-delta',
          [
            id,
            from + 1,
            0,
            writerKinds.findIndex((k) => k === volumeKind(i)),
            thin ? 0 : null,
            thin ? true : null,
          ],
          edits[i],
        ]);
      } else emit(['write', [id, from + 1, 0, writerKinds.indexOf('check'), null, null], false]);
      seq++;
    }
    for (let i = 0; i < 7; i++) {
      const phase = i < 5 ? 'fixed' : i === 5 ? 'presentation' : 'render';
      emit(['check', { at: seq, phase, tick: Math.min(from + i + 1, from + 5), ray: null }]);
      for (let id = 0; id < volumeMeshes; id++) {
        if (i === 0 && id < volumeChanging) emit(['mesh-delta', edits[id]]);
        else emit(['mesh', id]);
      }
      emit(['end-check']);
    }
    emit(['end', from + 5]);
    if (frame % 8 === 0) capture.handoff();
  }
  if (capture.status().kind !== 'failed') {
    emit(['trailer', frames, seq, []]);
    capture.finish();
  }
  await capture.settled();
  return {
    ...capture.status(),
    beforeEnd,
    frames,
    writes: seq,
    logicalScalars: frames * (2 * volumeWrites + 7 * volumeMeshes) * 62,
  };
}
