import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  analyze,
  bounds,
  collect,
  decideCandidate,
  margin,
  parseArm,
  seeds,
  transition,
  analyzeCandidate,
  buildSchedule,
  validateHostInterval,
  validateArmTelemetry,
  validateBlockStart,
} from './generation-pair-analysis.ts';
import type { Arm, CollectionPort, Schedule } from './generation-pair-analysis.ts';
import { isMainThread } from 'node:worker_threads';
import './measure-generation-paired.ts';

test('live collection and archive replay share the same exclusive missed-start bound', () => {
  const [slot] = buildSchedule(10_000);
  validateBlockStart(slot, slot.start);
  validateBlockStart(slot, slot.start + 7999);
  for (const start of [slot.start - 1, slot.start + 8000, slot.start + 30_000])
    assert.throws(() => validateBlockStart(slot, start), /Missed block start/);
});

test('archived telemetry must contain an actual during-arm sample', () => {
  const host = (at: number) => ({
    at,
    cpu: [at, 0, 0, at * 9, 0, 0, 0, 0],
    load: [1, 1, 1],
    runnable: 2,
    temperature: 40_000,
    competitors: [],
  });
  const before = [host(1000), host(6000)];
  validateArmTelemetry([...before, host(11_000), host(16_000)], 1000, 6001, 15_999);
  assert.throws(
    () => validateArmTelemetry([...before, host(15_999), host(16_000)], 1000, 6001, 15_999),
    /during/,
  );
});

test('final candidate uses frozen additions on whole paired blocks, with inclusive bounds', () => {
  const pins = seeds.map((seed, i) => ({
    seed,
    median: [57.5 + 100 * i, 3] as const,
    p95: [102.5 + 100 * i, 3] as const,
  }));
  const check = (delta: (i: number) => number) =>
    analyzeCandidate(schedule, hashes, pins, pairs(delta)).decision;
  assert.equal(
    check(() => 3),
    'pass',
  );
  assert.equal(
    check(() => 4),
    'regression',
  );
  assert.equal(
    check((i) => (i <= 10 ? 3 : 4)),
    'inconclusive',
  );
  assert.equal(
    check(() => -1),
    'pass',
  );
  assert.throws(() => analyzeCandidate(schedule, hashes, pins, pairs().slice(1)), /incomplete/);
});

test('automatic schedule is reproducible and spaced; host telemetry fails closed', () => {
  const start = 10_000;
  const slots = buildSchedule(start);
  assert.deepEqual(slots, buildSchedule(start));
  assert.equal(slots.filter((slot) => slot.order === 'AB').length, 8);
  assert.equal(slots[1].start - slots[0].start, 30 * 60_000);
  const a = {
    at: start,
    cpu: [0, 0, 0, 0, 0, 0, 0, 0],
    load: [1, 1, 1],
    runnable: 2,
    temperature: 40_000,
    competitors: [],
  };
  const b = { ...a, at: start + 5000, cpu: [10, 0, 0, 90, 0, 0, 0, 0] };
  validateHostInterval(a, b);
  for (const corrupt of [
    { ...b, at: start },
    { ...b, cpu: [] },
    { ...b, cpu: [80, 0, 0, 20, 0, 0, 0, 0] },
    { ...b, competitors: ['browser'] },
    { ...b, temperature: NaN },
  ])
    assert.throws(() => validateHostInterval(a, corrupt));
});

const schedule: Schedule = Array.from({ length: 16 }, (_, i) => ({
  id: i + 1,
  order: i % 2 ? 'BA' : 'AB',
  start: 400_000 * i,
  end: 400_000 * i + 380_000,
}));
const hashes = { A: 'a'.repeat(64), B: 'b'.repeat(64) };
const original = seeds.map(() => ({ median: 90, p95: 90 }));
const arm = (id: number, label: 'A' | 'B', shift = 0): Arm => ({
  id,
  label,
  hash: hashes[label],
  seeds: [...seeds],
  samples: Array.from({ length: 100 }, (_, i) => seeds.map((_, j) => i + j * 100 + shift)),
});
const pairs = (shift: (i: number) => number = () => 0) =>
  schedule.map(({ id, order }) =>
    [...order].map((label) => (label === 'A' ? arm(id, 'A', id) : arm(id, 'B', id + shift(id)))),
  );
const report = (raw = pairs()) => analyze(schedule, hashes, original, raw);

test('fixed ranks, seed isolation, reversed execution, common delay and endpoint bounds', () => {
  const result = report(pairs(() => 1));
  assert.equal(result.resolved, true);
  assert.deepEqual(
    result.endpoints.map(({ B }) => B),
    [57.5, 102.5, 157.5, 202.5, 257.5, 302.5, 357.5, 402.5, 457.5, 502.5],
  );
  assert.ok(
    result.endpoints.every(
      ({ differences, lower, upper }) =>
        differences.every((delta) => delta === 1) && lower === 1 && upper === 1,
    ),
  );
  assert.deepEqual(bounds([8, 16, 3, 15, 5, 12, 4, 13, 2, 6, 11, 1, 9, 14, 7, 10]), {
    lower: 5,
    upper: 12,
  });
});

test('margin floors, percentage branches and original addition cap', () => {
  assert.equal(margin('median', 1, 100), 2);
  assert.equal(margin('p95', 1, 100), 5);
  assert.equal(margin('median', 70, 80), 7);
  assert.equal(margin('p95', 200, 100), 15);
});

test('exact boundaries, isolated inconclusive endpoint, regression, permissible slowdown and control mismatch', () => {
  const control = report();
  const endpoints = control.endpoints.map((ep) => ({ ...ep, lower: -ep.M, upper: ep.M }));
  assert.equal(decideCandidate(control.endpoints, endpoints), 'pass');
  const last = endpoints[9];
  assert.equal(
    decideCandidate(control.endpoints, [...endpoints.slice(0, 9), { ...last, upper: last.M + 1 }]),
    'inconclusive',
  );
  assert.equal(
    decideCandidate(control.endpoints, [
      ...endpoints.slice(0, 9),
      { ...last, lower: last.M + 1, upper: last.M + 2 },
    ]),
    'regression',
  );
  assert.equal(
    decideCandidate(control.endpoints, [
      ...endpoints.slice(0, 9),
      { ...last, B: last.B + last.M + 1 },
    ]),
    'unmatched',
  );
  const early = pairs();
  for (const pair of early) {
    const reference = pair.find(({ label }) => label === 'A');
    assert.ok(reference);
    reference.samples = reference.samples.map((row) => row.map((ms) => ms + 50));
  }
  assert.equal(report(early).resolved, false);
  assert.equal(report(pairs(() => 50)).resolved, false);
});

test('reject incomplete or corrupt arms, swapped order, repeated IDs and truncated JSON', () => {
  for (const corrupt of [
    (p: Arm[][]) => p.pop(),
    (p: Arm[][]) => p[0].pop(),
    (p: Arm[][]) => p[0].reverse(),
    (p: Arm[][]) => (p[1] = p[0]),
    (p: Arm[][]) => (p[0][0].hash = hashes.B),
    (p: Arm[][]) => p[0][0].samples.pop(),
    (p: Arm[][]) => (p[0][0].samples[0][0] = NaN),
    (p: Arm[][]) => (p[0][0].seeds[0] = 'wrong'),
  ]) {
    const raw = pairs();
    corrupt(raw);
    assert.throws(() => report(raw));
  }
  assert.throws(() => parseArm('{"samples":'));
});

test('collection gives one terminal stop, with no launch or old evidence write on failed preflight', async () => {
  for (const failure of [
    'wrong cwd',
    'existing destination',
    'competing build',
    'timeout',
    'missed slot',
    'ok',
  ]) {
    let now = 0;
    const calls: string[] = [];
    let launches = 0;
    const port: CollectionPort = {
      now: () => now,
      waitUntil: async (at) => {
        now = failure === 'missed slot' ? at + 380_000 : at;
      },
      prepare: () => {
        calls.push('prepare');
        if (failure === 'wrong cwd' || failure === 'existing destination') throw Error(failure);
      },
      observe: () => {
        if (failure === 'competing build') throw Error(failure);
      },
      launch: (id, label, timeout) => {
        launches++;
        assert.equal(timeout, 180_000);
        if (failure === 'timeout') throw Error(failure);
        return arm(id, label);
      },
      stop: (reason) => calls.push(reason),
    };
    const result = await collect(schedule, hashes, port);
    if (failure === 'ok') {
      assert.equal(result.state, 'complete');
      assert.equal(launches, 32);
    } else {
      assert.deepEqual(result, { state: 'stopped', reason: failure });
      assert.equal(launches, failure === 'timeout' ? 1 : 0);
      assert.deepEqual(calls, [
        'prepare',
        ...(['wrong cwd', 'existing destination'].includes(failure) ? [] : [failure]),
      ]);
    }
  }
});

test('transition table rejects invalid events, including any event after a terminal state', () => {
  const states = ['scheduled', 'collecting', 'complete', 'analyzed', 'stopped'] as const;
  const events = ['begin', 'finish', 'analyze', 'fail'] as const;
  const expected = [
    ['collecting', null, null, 'stopped'],
    [null, 'complete', null, 'stopped'],
    [null, null, 'analyzed', 'stopped'],
    [],
    [],
  ];
  for (const [i, state] of states.entries())
    for (const [j, event] of events.entries()) {
      const next = expected[i][j];
      if (next) assert.equal(transition(state, event), next);
      else assert.throws(() => transition(state, event));
    }
});

test('importing the adapter from test discovery does not dispatch a benchmark', () => {
  assert.equal(isMainThread, true);
});
