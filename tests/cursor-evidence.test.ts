import assert from 'node:assert/strict';
import test from 'node:test';
import { decide, ledger, transition, workKinds } from './cursor-evidence.ts';
import type { Evidence, Frame, Visit, WorkKind, WorkRates } from './cursor-evidence.ts';
import { measureScaling } from './cursor-reference.ts';

type ScalingReport = ReturnType<typeof measureScaling>;
let serializedScaling: string | undefined;

function referenceReport(): ScalingReport {
  if (serializedScaling === undefined) {
    let now = 0;
    serializedScaling = JSON.stringify(measureScaling(() => ++now));
  }
  return JSON.parse(serializedScaling);
}

const rates = (value: number): WorkRates =>
  Object.fromEntries(workKinds.map((kind) => [kind, value])) as Record<WorkKind, number>;
const frame = (pick: number, offRay: number): Frame => ({
  pick,
  pickScopes: [
    { start: 0, end: offRay, work: 'off-ray' },
    { start: offRay, end: pick, work: 'retained' },
  ].filter((scope) => scope.start < scope.end) as Frame['pickScopes'],
  ticks: 2,
  rig: 2,
  eligibilityOutline: 1,
  renderCpu: 2,
  gpu: null,
  demand: rates(1),
});
const visit = (kind: Visit['kind'], pick = 10, local = 4): Visit => ({
  kind,
  frames: [frame(pick, pick ? 6 : 0), frame(pick, pick ? 6 : 0)],
  registration: { ms: 100, bytes: 500 },
  replay: kind !== 'idle' ? { exhaustive: pick, local, parity: true } : null,
});
const evidence = (override?: { scaling: unknown }): Evidence => ({
  hardware: 'matched',
  scaling: override ? override.scaling : referenceReport(),
  matched: true,
  completeWindows: true,
  writerCoverage: { kind: 'upper-bounded' },
  shrine: [visit('shrine'), visit('shrine'), visit('shrine')],
  floor: visit('floor'),
  idle: visit('idle', 0),
  unitBatches: [rates(0.1), rates(0.125), rates(0.1)],
});

test('ledger charges max unit costs, no-pointer work and reports separate cold and tick costs', () => {
  const data = evidence();
  const shrine = data.shrine[0];
  shrine.frames[1].ticks = 0;
  shrine.frames[1].rig = 0;
  const row = ledger(shrine, data.unitBatches);
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
    registration: { ms: 100, bytes: 500 },
  });
  assert.equal(ledger(data.idle, data.unitBatches).Q, 1);
});

test('incomplete or overlapping attribution cannot pass', () => {
  for (const invalidate of [
    (data: Evidence) =>
      data.shrine[0].frames[0].pickScopes.push({ start: 1, end: 2, work: 'off-ray' }),
    (data: Evidence) => {
      delete data.unitBatches[0].bounds;
    },
    (data: Evidence) => {
      delete data.idle.frames[0].demand.bounds;
    },
    (data: Evidence) => {
      data.writerCoverage = { kind: 'unmeasured', gaps: [] };
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

test('pure policy requires positive rates in every batch for demand in any visit', () => {
  for (const visitKind of ['shrine', 'floor', 'idle'] as const) {
    const data = evidence();
    for (const v of [...data.shrine, data.floor, data.idle])
      for (const f of v.frames) f.demand.insert = Number(v.kind === visitKind);
    data.unitBatches[0].insert = 0;
    const result = decide(data);
    assert.equal(result.kind, 'stopped');
    assert.match(result.reason, /insert/);
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
  data.writerCoverage = { kind: 'unmeasured', gaps: ['bounds refresh', 'populated traversal'] };
  const result = decide(data);
  assert.equal(result.kind, 'stopped');
  if (result.kind === 'stopped') assert.match(result.reason, /bounds refresh.*populated traversal/);
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
