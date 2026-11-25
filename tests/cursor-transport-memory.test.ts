import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openWriterArchive } from './cursor-capture-archive.ts';
import { liveProducer } from './cursor-capture-stream.ts';
import { observationDelta } from './cursor-writer-stream.ts';
import { volumeOperand } from './cursor-capture-volume.ts';
import { oversizedWriterTrace } from './cursor-attribution-fixture.ts';
import type { WriterTrace } from './cursor-attribution-writers.ts';
import {
  measurePublications,
  reconcileWriters,
  scratchPass,
  scratchSchedule,
  streamWriterReplay,
} from './cursor-publication-replay.ts';

test('compact observation changes preserve signed zero, including sparse thin edits', () => {
  const before = volumeOperand(0);
  const after = structuredClone(before);
  after.input.thin![1] = -0;
  after.input.world[1] = -0;
  const delta = observationDelta(before, after)!;
  assert.equal(delta[1].length, 2);
  for (const [, edit] of delta[1]) assert.deepEqual(edit, [1, -0]);
});

test('persisted but truncated final page is never acknowledged; bounded reader rejects a swollen index', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cursor-final-validation-'));
  try {
    for (const truncated of [true, false]) {
      const dir = join(root, String(truncated));
      const archive = await openWriterArchive(dir, 'test', [1, 1]);
      const producer = liveProducer('test', archive.receive);
      producer.begin();
      producer.append(['start', { runId: 'test', kind: 'idle', provenance: 'software' }]);
      producer.append(['begin', 0, 0]);
      producer.flush();
      await producer.settled();
      assert.equal(archive.status().committed, 1);
      assert.equal(archive.status().diskPages, 1);
      producer.append(['check', { at: 0, tick: 1, phase: 'render', ray: null }]);
      producer.append(['end-check']);
      if (!truncated) {
        producer.append(['end', 1]);
        producer.append(['trailer', 1, 0, []]);
      }
      producer.finish();
      await producer.settled();
      assert.ok((await stat(join(dir, 'page-1.gz'))).size > 0);
      assert.equal(archive.status().diskPages, 2);
      if (truncated) {
        assert.equal(producer.status().kind, 'failed');
        assert.equal(archive.status().sealed, false);
        assert.equal(archive.status().committed, 1);
        await assert.rejects(archive.frames().next(), /not sealed/);
      } else {
        assert.equal(producer.status().kind, 'sealed');
        await writeFile(join(dir, 'page-0.json'), Buffer.alloc(4097));
        await assert.rejects(archive.frames().next(), /exceeds byte budget/);
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function pickSeam(): WriterTrace {
  const box = (id: number, x: number) => {
    const base = volumeOperand(id);
    const z = 2;
    return {
      ...base,
      input: {
        ...base.input,
        eligible: true,
        fallback: false,
        thin: null,
        world: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1],
        authored: [x, 0, z, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
      },
      world: [x - 1, -1, z - 1, x + 1, 1, z + 1],
    };
  };
  const near = box(0, 2);
  const far = box(0, 18);
  const staticNear = box(1, 2);
  const ray = { x: 2, z: 2, dx: 0, dz: 0, length: 20 };
  return {
    runId: 'pick-seam',
    kind: 'shrine',
    provenance: 'software',
    gaps: [],
    identities: [
      { id: 0, mesh: 100, name: 'door' },
      { id: 1, mesh: 101, name: 'floor' },
    ],
    seed: [far, staticNear],
    frames: Array.from({ length: 7 }, (_, frame) => {
      const tick = frame + 1;
      return {
        frame,
        from: frame,
        to: tick,
        writes: [
          {
            seq: 2 * frame,
            frame,
            tick,
            id: 0,
            kind: 'door',
            phase: 'fixed',
            before: far,
            after: near,
          },
          {
            seq: 2 * frame + 1,
            frame,
            tick,
            id: 0,
            kind: 'door',
            phase: 'render',
            before: near,
            after: far,
          },
        ],
        checks: [
          { at: 2 * frame + 1, phase: 'fixed', tick, ray: null, scene: [near, staticNear] },
          { at: 2 * frame + 1, phase: 'pick', tick, ray, scene: [near, staticNear] },
          { at: 2 * frame + 2, phase: 'render', tick, ray: null, scene: [far, staticNear] },
        ],
      };
    }),
  };
}

test('incremental scratch matches eager work, query-time occupancy, schedule and rejection', async () => {
  const trace = pickSeam();
  const eager = reconcileWriters(trace);
  const incremental = streamWriterReplay(trace);
  assert.deepEqual(eager.gaps, []);
  assert.deepEqual(trace.frames.map(incremental.frame), eager.frames);
  assert.deepEqual(incremental.gaps(), eager.gaps);
  for (const row of eager.frames) {
    assert.deepEqual(
      row.writes.map((w) => [w.seq, w.phase, w.id]),
      [
        [row.frame * 2, 'fixed', 0],
        [row.frame * 2 + 1, 'render', 0],
      ],
    );
    assert.deepEqual(row.query?.ids, [0, 1], 'render removed door from pick bucket');
    assert.deepEqual(row.query?.entries, [1, 0], 'bucket insertion order differs from sorted IDs');
  }
  for (const size of [240, 5]) {
    const report = measurePublications([trace], null, size);
    const schedule = await scratchSchedule(
      trace.frames.length,
      async (arm) => {
        let units = 0;
        let consumed = 0;
        for (let repeat = 0; repeat < arm.repeats; repeat++) {
          const pass = scratchPass(trace, arm, null, repeat === arm.repeats - 1 ? arm.pad : 0);
          for (const frame of trace.frames) {
            if (pass.done()) break;
            pass.frame(frame);
          }
          const result = pass.result();
          units += result.units;
          consumed = (consumed + result.consumed) | 0;
        }
        return { units, consumed, ms: null };
      },
      size,
    );
    assert.deepEqual(schedule.batches, report.cases[0].batches);
    assert.equal(schedule.consumed, report.consumed);
  }
  const unresolved = oversizedWriterTrace('sweep-gap', 'shrine');
  let clockCalls = 0;
  const invalid = measurePublications([unresolved], () => ++clockCalls);
  // Registration is permitted for an invalid trace, but neither scratch batches nor cost are.
  assert.equal(invalid.cases[0].msPerFrame, null);
  assert.deepEqual(invalid.cases[0].batches, []);
  assert.equal(clockCalls, 2);
  const invalidStream = streamWriterReplay(unresolved);
  const invalidFrames = unresolved.frames.map(invalidStream.frame);
  assert.deepEqual(invalidFrames, reconcileWriters(unresolved).frames);
  assert.deepEqual(invalidStream.gaps(), invalid.cases[0].gaps);
  assert.equal(invalidFrames[0].demand.publish, null);
  assert.ok(invalidFrames[0].writes.some((w) => w.sweepGap));
});
