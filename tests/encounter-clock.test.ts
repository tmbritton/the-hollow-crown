import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFixedClock } from '../src/fixedClock.ts';

test('a catch-up warmup boundary discards leftover ticks and setup elapsed time together', () => {
  const clock = createFixedClock(0);
  let steps = 298;
  clock.advance(80);
  while (steps < 300 && clock.take()) steps++;
  assert.equal(steps, 300);
  // Snapshot and profiler setup finish at 130, not at callback entry (80).
  clock.reset(130);
  clock.advance(138);
  assert.equal(clock.take(), false);
  clock.advance(148);
  assert.equal(clock.take(), true);
  assert.equal(clock.take(), false);
});
