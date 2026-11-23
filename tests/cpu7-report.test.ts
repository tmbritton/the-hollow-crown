import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  comparePair,
  repeatVerdict,
  summarizeRun,
  sumScopes,
  uniqueVisits,
} from './cpu7-report.ts';
import type { Observation } from './cpu7-report.ts';

const base: Observation = {
  recipe: 2,
  host: 'desktop/browser/driver',
  viewport: '800x450@1',
  quality: 'low',
  workload: 'entrance',
  script: 'entry script',
  mode: 'coarse',
  lane: 'controlled',
  hardware: false,
  start: { actors: 'players at spawn', step: 12 },
  samples: [{ step: 12, ms: { frame: 3 }, counts: { ticks: 1, requestedTicks: 1 } }],
};

for (const [field, value] of Object.entries({
  recipe: 3,
  host: 'different desktop',
  viewport: '1024x768@1',
  quality: 'high',
  script: 'different input',
  start: { actors: 'changed health', step: 12 },
  samples: [{ step: 12, ms: { frame: 3 }, counts: { ticks: 2, requestedTicks: 2 } }],
})) {
  test(`rejects a changed ${field}`, () => {
    assert.equal(comparePair(base, { ...base, [field]: value }).status, 'invalid');
  });
}

const native: Observation = {
  ...base,
  lane: 'native',
  hardware: true,
  samples: [
    { step: 12, ms: { frame: 3, 'frame.interval': 10 }, counts: { ticks: 0 } },
    { step: 12, ms: { frame: 4, 'frame.interval': 30 }, counts: { ticks: 2 } },
  ],
};

test('native timing matches starts, not terminal simulation steps', () => {
  const candidate = {
    ...native,
    samples: [native.samples[0]!, { ...native.samples[1]!, counts: { ticks: 4 } }],
  };
  assert.equal(comparePair(native, candidate).status, 'eligible');
  assert.equal(comparePair(native, { ...candidate, hardware: false }).status, 'pending');
});

test('native cadence uses reciprocal mean interval and retains zero-tick frames', () => {
  const summary = summarizeRun(native);
  assert.equal(summary.fps, 50);
  assert.deepEqual(summary.tickHistogram, [1, 0, 1, 0, 0, 0]);
  assert.equal(summary.ticks, 2);
  assert.equal(summary.overBudget, 0.5);
  assert.equal(summarizeRun({ ...native, hardware: false }).fps, null);
  assert.equal(summarizeRun(base).counters['alloc.poseSnapshots'], undefined);
  const incomplete = { ...native, samples: [native.samples[0]!, base.samples[0]!] };
  assert.equal(summarizeRun(incomplete).fps, null);
  assert.equal(comparePair(native, incomplete).status, 'pending');
});

test('native accumulator carry can produce five ticks despite the 80 ms delta clamp', () => {
  const carried = {
    ...native,
    samples: [native.samples[0]!, { ...native.samples[1]!, counts: { ticks: 5 } }],
  };
  assert.equal(comparePair(native, carried).status, 'eligible');
  assert.deepEqual(summarizeRun(carried).tickHistogram, [1, 0, 0, 0, 0, 1]);
});

test('repeat spread is not a win; regression and pending stay distinct', () => {
  assert.equal(repeatVerdict([4, 5, 6], [3, 4, 5]), 'inconclusive');
  assert.equal(repeatVerdict([5, 6, 7], [2, 3, 4]), 'improved');
  assert.equal(repeatVerdict([2, 3, 4], [5, 6, 7]), 'regressed');
  assert.equal(repeatVerdict([2, 3], [1, 1]), 'pending');
});

test('identically truncated controlled visits are invalid', () => {
  const truncated = {
    ...base,
    samples: [{ ...base.samples[0]!, counts: { ticks: 1, requestedTicks: 2 } }],
  };
  assert.equal(comparePair(truncated, truncated).status, 'invalid');
});

test('a zero-tick frame may lack tick timing but cannot lack a required render scope', () => {
  const sample = { step: 0, ms: { presentation: 3 }, counts: { ticks: 0 } };
  assert.equal(sumScopes([sample], 'tick', 'presentation')?.p50, 3);
  assert.equal(sumScopes([sample], 'tick', 'presentation', 'scene.render'), null);
  assert.equal(sumScopes([{ ...sample, counts: { ticks: 1 } }], 'tick', 'presentation'), null);
});

test('distinct run identities are required even when the same report is copied', () => {
  assert.equal(uniqueVisits(['a1', 'b1', null, 'a1']), false);
  assert.equal(uniqueVisits(['a1', 'b1', null, 'a2', null]), true);
});
