import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { captureWriters, writerDiagnostic } from './cursor-attribution-writers.ts';
import type { WriterTrace, WriterFrame } from './cursor-attribution-writers.ts';
import { reconcileWriters, streamWriterReplay } from './cursor-publication-replay.ts';
import * as runner from './cursor-capture-archive.ts';
import { emptyCounts } from './cursor-attribution-probe.ts';

test('descriptive pass breakdown distinguishes unmeasured work from conditional absence', () => {
  const count = { ...emptyCounts(), visits: 2395, instance: 3 };
  const summary = runner.describeNativePasses([
    {
      sync: null,
      syncs: 24,
      passes: [
        { ms: null, work: count },
        { ms: null, work: count },
        { ms: null, work: count },
      ],
    },
    {
      sync: null,
      syncs: 24,
      passes: [
        { ms: null, work: count },
        { ms: null, work: count },
      ],
    },
  ]);
  assert.deepEqual(
    summary.passes.map((p) => [
      p.name,
      p.frames,
      p.msPerCall,
      p.workPerCall?.visits,
      p.workPerCall?.instance,
    ]),
    [
      ['enemy', 2, null, 2395, 3],
      ['object', 2, null, 2395, 3],
      ['cover', 1, null, 2395, 3],
    ],
  );
  assert.deepEqual(summary.proxySync, { msPerFrame: null, callsPerFrame: 24 });
});

const retained = new URL('../test-results/epic16/hardware-40phAH/', import.meta.url);
const fixturePresent = await stat(retained).then(
  () => true,
  () => false,
);
async function artifact<T>(name: string): Promise<T> {
  return JSON.parse(
    gunzipSync(await readFile(new URL(`shrine-count-${name}.json.gz`, retained))).toString(),
  );
}

test('native rows are persisted even when the count validator rejects the visit', async () => {
  const artifacts = new Map<string, unknown>();
  const rows = Array.from({ length: 5 }, (_, i) => ({ from: 178 + i * 5, valid: i !== 4 }));
  await assert.rejects(async () => {
    await runner.archiveNativeRows({
      take: async (start, end) => ({
        length: rows.length,
        fail: 'writer overflow',
        rows: rows.slice(start, end),
      }),
      header: async (value) => {
        artifacts.set('header', value);
      },
      chunk: async (i, value) => {
        artifacts.set(`frames-${i}`, value);
      },
    });
    throw new Error('writer overflow');
  }, /writer overflow/);
  assert.deepEqual(artifacts.get('frames-0'), rows.slice(0, 4));
  assert.deepEqual(artifacts.get('frames-4'), rows.slice(4));
});

test(
  'retained archive distinguishes real checkpoint mismatches from incomplete storage',
  { skip: !fixturePresent },
  async () => {
    const header = await artifact<Omit<WriterTrace, 'frames'>>('writer-header');
    const frames = [
      ...(await artifact<WriterFrame[]>('writers-0')),
      ...(await artifact<WriterFrame[]>('writers-2')),
    ];
    assert.deepEqual(
      frames.map((f) => f.writes.length),
      [12982, 13006, 11641, 10157],
    );
    const replay = reconcileWriters({ ...header, frames });
    const incremental = streamWriterReplay(header);
    assert.deepEqual(frames.map(incremental.frame), replay.frames);
    assert.deepEqual(incremental.gaps(), replay.gaps);
    const first = replay.frames[0].checkpointDifferences[0];
    assert.deepEqual([first.tick, first.phase, first.meshes.length], [179, 'fixed', 15]);
    assert.equal(first.meshes.filter((m) => m.name.startsWith('health ')).length, 14);
    assert.ok(
      first.meshes.some((m) => m.name.endsWith(':hacky sack') && m.fields.includes('world')),
    );
    const pick = replay.frames[0].checkpointDifferences.find((c) => c.phase === 'pick');
    assert.equal(pick?.meshes.filter((m) => m.name.endsWith(':steed')).length, 26);
    assert.ok(pick?.meshes.some((m) => m.name === 'floating votive'));
    assert.ok(replay.gaps.includes('writer trace operand/checkpoint overflow'));
    assert.ok(replay.gaps.some((g) => g.includes('incomplete checkpoints at frame 68')));
  },
);

test(
  '[extended] disk and incremental replay cover the frozen window at retained event volume',
  { skip: !fixturePresent },
  async () => {
    const retainedHeader = await artifact<Omit<WriterTrace, 'frames'>>('writer-header');
    const retainedFrames = await artifact<WriterFrame[]>('writers-0');
    const template = retainedFrames[0];
    const header: Omit<WriterTrace, 'frames'> = {
      ...retainedHeader,
      provenance: 'software',
      kind: 'idle',
      gaps: [],
    };
    const replay = streamWriterReplay(header);
    const dir = await mkdtemp(join(tmpdir(), 'cursor-window-'));
    try {
      let seq = 0;
      let bytes = 0;
      const scalarCount = (o: WriterTrace['seed'][number]) =>
        42 + o.input.lineage.length + (o.input.thin?.length ?? 0);
      let scalars = 0;
      let to = 180;
      for (let frame = 0; to < 480; frame++) {
        const from = to;
        to += 5;
        // Constant operands isolate transport and order from the retained scene's known writer gaps.
        const writes = template.writes.map(({ id }, i) => {
          const o = header.seed[id];
          return {
            id,
            before: o,
            after: o,
            kind: 'check',
            seq: seq + i,
            frame,
            tick: from + 1,
            phase: 'fixed',
          } as const;
        });
        seq += writes.length;
        const checks = Array.from({ length: 7 }, (_, i) => ({
          at: seq,
          tick: Math.min(from + 1 + i, to),
          scene: header.seed,
          ray: null,
          phase:
            i < 5 ? ('fixed' as const) : i === 5 ? ('presentation' as const) : ('render' as const),
        }));
        scalars +=
          writes.reduce((n, w) => n + 2 * scalarCount(w.before), 0) +
          checks.length * header.seed.reduce((n, o) => n + scalarCount(o), 0);
        const raw = { frame, from, to, writes, checks };
        bytes += await runner.archiveWriterFrame(dir, raw);
        const restored = await runner.readWriterFrame(dir, frame);
        assert.equal(JSON.stringify(restored), JSON.stringify(raw));
        const result = replay.frame(restored);
        assert.deepEqual(result.demand, { publish: 12982, query: 0 });
        assert.equal(result.writes.at(-1)?.seq, seq - 1);
      }
      assert.deepEqual(replay.gaps(), []);
      assert.equal(to, 480);
      assert.equal(seq, 778920);
      assert.ok(scalars > 100_000_000);
      console.log({ softwareWindow: [180, to], events: seq, scalars, compressedBytes: bytes });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test('stop control: writer readback demonstrably changes a same-render-ID native result', () => {
  const engine = new NullEngine();
  try {
    const scene = new Scene(engine);
    function setup() {
      const root = new TransformNode('steed', scene);
      const mesh = CreateBox('steed child', {}, scene);
      mesh.parent = root;
      mesh.computeWorldMatrix(true);
      return { root, mesh };
    }
    const control = setup();
    const hooked = setup();
    const renderId = scene.getRenderId();
    const capture = captureWriters(scene, {
      runId: 'same-tick',
      kind: 'idle',
      provenance: 'software',
    });
    capture.begin(0, 0);
    // Do not increment the render ID. A read by production here takes the old cached matrix.
    control.root.position.x = 9;
    writerDiagnostic('pose', hooked.root, () => {
      hooked.root.position.x = 9;
    });
    assert.equal(scene.getRenderId(), renderId);
    assert.equal(control.mesh.computeWorldMatrix().m[12], 0);
    assert.equal(hooked.mesh.computeWorldMatrix().m[12], 9);
    assert.match(runner.captureBoundary, /same-tick Babylon state/);
    capture.close();
  } finally {
    engine.dispose();
  }
});
