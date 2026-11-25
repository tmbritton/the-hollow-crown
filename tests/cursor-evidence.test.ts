import assert from 'node:assert/strict';
import test from 'node:test';
import { decide, ledger, transition, workKinds } from './cursor-evidence.ts';
import type { Evidence, Frame, Visit } from './cursor-evidence.ts';
import { measureScaling } from './cursor-reference.ts';
import { oversizedWriterTrace } from './cursor-attribution-fixture.ts';
import { measurePublications } from './cursor-publication-replay.ts';
import { publicationCost, writerKinds } from './cursor-writer-evidence.ts';
import type { Batch, WriterCase } from './cursor-writer-evidence.ts';

type ScalingReport = ReturnType<typeof measureScaling>;
let serializedScaling: string | undefined;

function referenceReport(): ScalingReport {
  if (serializedScaling === undefined) {
    let now = 0;
    serializedScaling = JSON.stringify(measureScaling(() => ++now));
  }
  return JSON.parse(serializedScaling);
}

const registration = { ms: 100, serializedBucketBytes: 500, runtimeMemory: 'unmeasured' } as const;
const frame = (pick: number, offRay: number): Frame => ({
  pick,
  pickScopes: [
    { start: 0, end: offRay, work: 'off-ray' },
    { start: offRay, end: pick, work: 'retained' },
  ].filter((scope) => scope.start < scope.end) as Frame['pickScopes'],
  ticks: 2,
  from: 178,
  to: 180,
  rig: 2,
  eligibilityOutline: 1,
  renderCpu: 2,
  gpu: null,
  demand: { publish: pick ? 7 : 8, query: Number(!!pick) },
});
const visit = (kind: Visit['kind'], pick = 10, local = 4): Visit => ({
  kind,
  frames: [frame(pick, pick ? 6 : 0), { ...frame(pick, pick ? 6 : 0), from: 180, to: 182 }],
  registration: { ...registration },
  replay: kind !== 'idle' ? { exhaustive: pick, local, parity: true } : null,
});
const runId = 'synthetic-run';
const writerCase = (kind: Visit['kind']): WriterCase => {
  let seq = 0;
  const frames = visit(kind, kind === 'idle' ? 0 : 10).frames.map((f, frame) => ({
    frame,
    from: f.from,
    to: f.to,
    demand: { publish: f.demand.publish!, query: f.demand.query! },
    writes: Array.from({ length: f.demand.publish! }, () => ({
      seq: seq++,
      frame,
      tick: f.to,
      phase: 'render' as const,
      id: 0,
      kind: 'check' as const,
      sweepGap: null,
    })),
    query:
      kind === 'idle'
        ? null
        : {
            ids: [0],
            entries: [0, 0],
            tiles: [],
            reads: { empty: 0, occupied: 0, entries: 2, duplicates: 1 },
          },
  }));
  const batches = [
    [0.1, 0.125, 0.1].map((rate) => {
      const arm = (units: number) => ({
        active: { units, ms: units * rate },
        control: { units, ms: 0 },
      });
      return {
        publish: arm(240 * frames[0].demand.publish),
        query: arm(240 * frames[0].demand.query),
      } satisfies Batch;
    }),
  ];
  return {
    runId,
    kind,
    gaps: [],
    writers: Object.fromEntries(
      writerKinds.map((k) => [k, k === 'check' ? frames[0].demand.publish * 2 : 0]),
    ),
    frames,
    batches,
    registration: { ...registration, ms: 1 },
    msPerFrame: publicationCost(
      frames.map((f) => f.demand),
      batches,
      240,
    ),
  };
};
const evidence = (override?: { scaling: unknown }): Evidence => ({
  hardware: 'matched',
  scaling: override ? override.scaling : referenceReport(),
  matched: true,
  completeWindows: true,
  runId,
  writerReport: {
    runId,
    provenance: 'matched',
    framesPerBatch: 240,
    consumed: 1,
    cases: [writerCase('shrine'), writerCase('floor'), writerCase('idle')],
  },
  shrine: [visit('shrine'), visit('shrine'), visit('shrine')],
  floor: visit('floor'),
  idle: visit('idle', 0),
});

test('ledger charges validated scratch costs, no-pointer work and reports separate cold and tick costs', () => {
  const data = evidence();
  const shrine = data.shrine[0];
  shrine.frames[1].ticks = 0;
  shrine.frames[1].rig = 0;
  const row = ledger(shrine, data.writerReport!.cases[0].msPerFrame);
  assert.deepEqual(row, {
    P: 10,
    R: 6,
    U: 1,
    S: 5,
    Q: 5,
    p95: 10,
    calibration: 0,
    ticksPerFrame: 1,
    rigPerTick: 1,
    rigPerFrame: 1,
    eligibilityOutline: 1,
    renderCpu: 2,
    gpu: null,
    registration,
  });
  assert.equal(ledger(data.idle, data.writerReport!.cases[2].msPerFrame).Q, 1);
});

test('decision charges the observed upper cost of each case and work group separately', () => {
  const data = evidence();
  const floor = data.writerReport!.cases[1];
  floor.batches[0][0].publish.active.ms = 480;
  floor.batches[0][2].query.active.ms = 240;
  floor.msPerFrame = 3;
  const result = decide(data);
  assert.equal(result.kind, 'positive');
  assert.equal(result.floor.U, 3);
  assert.equal(result.idle.U, 1);
  assert.ok(result.shrine.every((row) => row.U === 1));
});

test('cost covers every ordered block including a nondivisible remainder without dilution', () => {
  const demand = Array.from({ length: 8 }, (_, i) => ({ publish: i + 1, query: 0 }));
  const arm = (units: number, ms: number) => ({ active: { units, ms }, control: { units, ms: 0 } });
  const block = (units: number, active: number[]) =>
    active.map((ms) => ({ publish: arm(units, ms), query: arm(0, 1) }));
  const batches = [block(15, [5, 6, 7]), block(21, [30, 65, 50])];
  assert.equal(publicationCost(demand, batches, 5), (7 + 65) / 8);
  assert.equal(
    publicationCost([{ ...demand[0], publish: null }, ...demand.slice(1)], batches, 5),
    null,
  );
  batches[1][2].publish.active.units += 6; // A partial repeat is a different mix.
  assert.equal(publicationCost(demand, batches, 5), null);
});

test('incomplete or overlapping attribution cannot pass', () => {
  for (const invalidate of [
    (data: Evidence) =>
      data.shrine[0].frames[0].pickScopes.push({ start: 1, end: 2, work: 'off-ray' }),
    (data: Evidence) => {
      delete data.writerReport!.cases[0].writers['thin-edit'];
    },
    (data: Evidence) => {
      delete data.idle.frames[0].demand.publish;
    },
    (data: Evidence) => {
      data.writerReport!.cases[1].runId = 'stale';
    },
    (data: Evidence) => {
      data.shrine[0].replay!.exhaustive = 11.01;
    },
    (data: Evidence) => {
      data.shrine[0].replay!.parity = false;
    },
    (data: Evidence) => {
      data.shrine.pop();
    },
    (data: Evidence) => {
      data.hardware = 'software';
    },
    (data: Evidence) => {
      data.writerReport!.provenance = 'software';
    },
    (data: Evidence) => {
      data.matched = false;
    },
    (data: Evidence) => {
      data.completeWindows = false;
    },
    (data: Evidence) => {
      data.scaling = null;
    },
    (data: Evidence) => {
      const report = referenceReport();
      report.pairs[0][0].samples[0].work.visits--;
      data.scaling = report;
    },
  ]) {
    const data = evidence();
    invalidate(data);
    assert.equal(decide(data).kind, 'stopped', String(invalidate));
  }
});

test('serialized sweep gaps stop either verdict in every case, even if the summary gap is lost', () => {
  const replay = measurePublications([oversizedWriterTrace(runId)], null);
  const {
    cases: [idle],
  } = JSON.parse(JSON.stringify(replay)) as typeof replay;
  for (const expected of ['positive', 'negative']) {
    for (const kind of ['shrine', 'floor', 'idle']) {
      const data = evidence();
      if (expected === 'negative') for (const v of data.shrine) v.replay!.local = 9;
      assert.equal(decide(data).kind, expected);
      const c = data.writerReport!.cases.find((row) => row.kind === kind)!;
      c.gaps.push(...idle.gaps);
      const stopped = decide(data);
      assert.equal(stopped.kind, 'stopped');
      assert.match(stopped.reason, /door writer 0 at frame 7.*64-cell/);

      // Even plausible numeric batches and a missing summary cannot price the marked write.
      c.gaps = [];
      const w = c.frames[0].writes[0];
      w.sweepGap = idle.frames[0].writes[0].sweepGap;
      const missingSummary = decide(data);
      assert.equal(missingSummary.kind, 'stopped');
      assert.match(missingSummary.reason, /64-cell/);
    }
  }
});

const finalVisit = (r: ScalingReport) => r.pairs[2][1];
const finalSample = (r: ScalingReport) => finalVisit(r).samples[239];
const exposedSample = (r: ScalingReport) => finalVisit(r).samples[238];

function assertScalingStops(input: unknown) {
  const result = transition(
    { kind: 'collecting' },
    { type: 'complete', evidence: evidence({ scaling: input }) },
  );
  assert.equal(result.state.kind, 'stopped');
  assert.match(result.state.reason, /scaling/);
  assert.deepEqual(result.effects, ['report', 'stop']);
}

function replaceField(record: object, key: string | number, value: unknown) {
  if (value === undefined) Reflect.deleteProperty(record, key);
  else Object.assign(record, { [key]: value });
}

const brokenRecords = [
  ['missing', undefined],
  ['null', null],
  ['scalar', 1],
  ['array', []],
] as const;

for (const [label, value] of brokenRecords) {
  test(`scaling completion rejects ${label} report`, () => assertScalingStops(value));
  for (const [field, parent, key] of [
    ['recipe', (r) => r, 'recipe'],
    ['door recipe', (r) => r.recipe, 'door'],
    ['final visit', (r) => r.pairs[2], 1],
    ['final sample', (r) => finalVisit(r).samples, 239],
    ['final work', finalSample, 'work'],
    ['final hit', finalSample, 'hit'],
  ] satisfies [string, (r: ScalingReport) => object, string | number][]) {
    test(`scaling completion rejects ${label} ${field}`, () => {
      const report = referenceReport();
      replaceField(parent(report), key, value);
      assertScalingStops(report);
    });
  }
}

for (const [field, parent, key] of [
  ['origin', (r) => r.recipe, 'origin'],
  ['direction', (r) => r.recipe, 'direction'],
  ['order', (r) => r.recipe, 'order'],
  ['last order pair', (r) => r.recipe.order, 2],
  ['pairs', (r) => r, 'pairs'],
  ['last pair', (r) => r.pairs, 2],
  ['final visit samples', finalVisit, 'samples'],
] satisfies [string, (r: ScalingReport) => object, string | number][]) {
  for (const [label, corrupt] of [
    ['missing', () => undefined],
    ['null', () => null],
    ['array-like', (rows) => ({ length: rows.length })],
    ['short', (rows) => rows.slice(0, -1)],
    ['overlong', (rows) => [...rows, rows[0]]],
  ] satisfies [string, (rows: readonly unknown[]) => unknown][]) {
    test(`scaling completion rejects ${label} ${field}`, () => {
      const report = referenceReport();
      const record = parent(report);
      const rows: unknown = Reflect.get(record, key);
      assert.ok(Array.isArray(rows));
      replaceField(record, key, corrupt(rows));
      assertScalingStops(report);
    });
  }
}

for (const [field, parent, key] of [
  ['origin coordinate', (r) => r.recipe.origin, 1],
  ['direction coordinate', (r) => r.recipe.direction, 0],
  ['exposed door position', (r) => r.recipe.door, 'exposed'],
  ['blocked door position', (r) => r.recipe.door, 'blocked'],
  ['room step', (r) => r.recipe, 'roomStepZ'],
  ['warmup', (r) => r.recipe, 'warmup'],
  ['queries', (r) => r.recipe, 'queries'],
  ['order population', (r) => r.recipe.order[2], 1],
  ['visit population', finalVisit, 'rooms'],
  ['final write', finalSample, 'write'],
  ...(
    [
      'visits',
      'syncs',
      'admitted',
      'instanceAdmitted',
      'meshExact',
      'instanceExact',
      'batchBounds',
      'meshMiss',
      'instanceMiss',
    ] satisfies (keyof ReturnType<typeof finalSample>['work'])[]
  ).map((key) => [key, (r: ScalingReport) => finalSample(r).work, key] as const),
  ['exposed instance', (r) => exposedSample(r).hit, 'instance'],
  ['exposed distance', (r) => exposedSample(r).hit, 'distance'],
  ['blocked distance', (r) => finalSample(r).hit, 'distance'],
  ['final sample timing', finalSample, 'ms'],
  ['build timing', finalVisit, 'ownerBuildMs'],
  ['mean timing', finalVisit, 'meanMs'],
  ['p95 timing', finalVisit, 'p95Ms'],
] satisfies (readonly [string, (r: ScalingReport) => object, string | number])[]) {
  for (const [label, corrupt] of [
    ['missing', () => undefined],
    ['numeric string', String],
    ['boolean', Boolean],
    ['singleton array', (value) => [value]],
  ] satisfies [string, (value: number) => unknown][]) {
    test(`scaling completion rejects ${label} ${field}`, () => {
      const report = referenceReport();
      const record = parent(report);
      const value: unknown = Reflect.get(record, key);
      assert.equal(typeof value, 'number');
      replaceField(record, key, corrupt(value));
      assertScalingStops(report);
    });
  }
}

for (const [key, valid] of [
  ['kind', 'object'],
  ['id', 'shrine'],
  ['mesh', 'shrine-batch'],
]) {
  for (const [label, value] of [
    ['missing', undefined],
    ['wrong string', 'floor'],
    ['boolean', true],
    ['singleton array', [valid]],
  ] as const) {
    test(`scaling completion rejects ${label} exposed hit ${key}`, () => {
      const report = referenceReport();
      replaceField(exposedSample(report).hit, key, value);
      assertScalingStops(report);
    });
  }
}

test('gate includes equality at half, but not equality with the noise bound', () => {
  const data = evidence();
  assert.equal(decide(data).kind, 'positive');
  data.shrine[2] = visit('shrine', 15, 9);
  assert.equal(decide(data).kind, 'negative');
  data.shrine = [visit('shrine', 10, 4.01), visit('shrine', 10, 4.01), visit('shrine', 10, 4.01)];
  assert.equal(decide(data).kind, 'negative');
  data.shrine[0] = visit('shrine', 10, 9.5);
  assert.equal(decide(data).kind, 'negative');
});

test('pure policy requires positive rates in every batch for each demanded group', () => {
  for (const kind of workKinds) {
    const data = evidence();
    data.writerReport!.cases[0].batches[0][0][kind].active.ms = 0;
    const result = decide(data);
    assert.equal(result.kind, 'stopped');
    assert.match(result.reason, new RegExp(kind));
  }
});

test('floor replay must be present, calibrated and hit-identical', () => {
  for (const replay of [
    null,
    { exhaustive: 8.99, local: 4, parity: true },
    { exhaustive: 10, local: 4, parity: false },
  ]) {
    const data = evidence();
    data.floor = visit('floor');
    data.floor.replay = replay;
    assert.equal(decide(data).kind, 'stopped');
  }
  const data = evidence();
  data.floor.replay!.exhaustive = 9;
  assert.equal(decide(data).kind, 'positive'); // The 10% calibration boundary is inclusive.
});

test('diagnostic-only writer coverage cannot authorize a decision even with favorable rates', () => {
  const data = evidence();
  data.writerReport!.cases[0].gaps.push('bounds refresh', 'populated traversal');
  const result = decide(data);
  assert.equal(result.kind, 'stopped');
  if (result.kind === 'stopped') assert.match(result.reason, /bounds refresh.*populated traversal/);
});

test('a coverage tag without raw run-local writer evidence cannot authorize either verdict', () => {
  const data = evidence();
  Reflect.deleteProperty(data, 'writerReport');
  assert.equal(decide(data).kind, 'stopped');
});

test('partial writer artifacts stop rather than throwing in the decision machine', () => {
  for (const drop of [
    (data: Evidence) => Reflect.deleteProperty(data.writerReport!.cases[0], 'batches'),
    (data: Evidence) => Reflect.deleteProperty(data.writerReport!.cases[0], 'frames'),
    (data: Evidence) => Reflect.deleteProperty(data.writerReport!.cases[0].frames[0], 'demand'),
    (data: Evidence) => replaceField(data.writerReport!.cases[0].frames, 0, null),
    (data: Evidence) => replaceField(data.writerReport!.cases[0].frames[0], 'query', null),
    (data: Evidence) => replaceField(data.writerReport!.cases[0].frames[0], 'writes', []),
    (data: Evidence) => data.writerReport!.cases[0].frames[0].writes.reverse(),
    (data: Evidence) =>
      replaceField(data.writerReport!.cases[0].frames[0].query!.reads, 'entries', '2'),
    (data: Evidence) => replaceField(data.writerReport!.cases[0].frames[0].query!.ids, 0, [0]),
    (data: Evidence) => {
      const counts = data.writerReport!.cases[0].writers;
      counts.check!--;
      counts.world!++;
    },
    (data: Evidence) =>
      replaceField(data.writerReport!.cases[0].batches[0][0].publish, 'active', null),
    (data: Evidence) => replaceField(data.shrine[0].replay!, 'parity', 'true'),
    (data: Evidence) => replaceField(data.writerReport!.cases[0].writers, 'unknown', '0'),
    (data: Evidence) => replaceField(data.shrine[0].frames[0], 'demand', null),
  ]) {
    const data = evidence();
    drop(data);
    assert.equal(decide(data).kind, 'stopped');
  }
});

test('all unsupported lifecycle events reject; terminal runs never accept further evidence', () => {
  const planned = { kind: 'planned' } as const;
  const events = [
    { type: 'unavailable', reason: 'device absent' },
    { type: 'preflightOK' },
    { type: 'invalid', reason: 'renderer mismatch' },
    { type: 'fault', reason: 'device lost' },
    { type: 'complete', evidence: evidence() },
  ] as const;
  const [unavailable, preflightOK, invalid, fault, complete] = events;
  const pending = transition(planned, unavailable);
  const collecting = transition(planned, preflightOK);
  assert.deepEqual(pending, {
    state: { kind: 'pending', reason: 'device absent' },
    effects: ['report', 'stop'],
  });
  assert.deepEqual(collecting, { state: { kind: 'collecting' }, effects: [] });
  assert.equal(transition(planned, invalid).state.kind, 'stopped');
  assert.equal(transition(planned, fault).state.kind, 'stopped');
  assert.throws(() => transition(planned, complete));
  assert.throws(() => transition(collecting.state, unavailable));
  assert.throws(() => transition(collecting.state, preflightOK));
  assert.equal(transition(collecting.state, invalid).state.kind, 'stopped');
  const stopped = transition(collecting.state, fault);
  const positive = transition(collecting.state, complete);
  const noisy = evidence();
  noisy.shrine[2] = visit('shrine', 16, 10);
  const negative = transition(collecting.state, { type: 'complete', evidence: noisy });
  noisy.matched = false;
  assert.equal(
    transition(collecting.state, { type: 'complete', evidence: noisy }).state.kind,
    'stopped',
  );
  assert.equal(positive.state.kind, 'positive');
  assert.equal(negative.state.kind, 'negative');
  for (const { state, effects } of [pending, stopped, positive, negative]) {
    assert.deepEqual(effects, ['report', 'stop']);
    for (const event of events) assert.throws(() => transition(state, event));
  }
});
