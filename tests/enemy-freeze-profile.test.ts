import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  launchProfile,
  ProfileWork,
  transitionProfile,
  type ProfileState,
  type FrameWork,
} from '../src/enemyFreezeProfile.ts';

function launch(query: string, reloading: boolean) {
  const params = new URLSearchParams(query);
  return launchProfile({
    variants: params.getAll('enemyProfile'),
    practice: params.get('room') === 'practice',
    seed: params.get('seed'),
    reloading,
  });
}

test('only an exact, single dungeon variant pins launch and reload', () => {
  for (const mode of ['control', 'decisions', 'poses']) {
    for (const reload of [false, true])
      assert.deepEqual(launch(`?enemyProfile=${mode}&seed=OTHER`, reload), {
        mode,
        seed: 'MOURNING-731',
      });
  }
  for (const query of [
    '',
    '?enemyProfile=Control',
    '?enemyProfile=',
    '?enemyProfile=no',
    '?enemyProfile=poses&enemyProfile=poses',
    '?room=practice&enemyProfile=poses',
  ]) {
    const input = `${query || '?'}&seed=OTHER`;
    assert.deepEqual(launch(input, false), { seed: 'OTHER' });
    assert.deepEqual(launch(input, true), { seed: null });
  }
});

const zero: FrameWork = { ticks: 0, squad: 0, individual: 0, poses: 0, decisionsMs: 0, rigMs: 0 };
const waiting: ProfileState = { phase: 'waiting' };
const frame = (state: ProfileState, now: number, work = zero) =>
  transitionProfile(state, { type: 'frame', now, work, fps: 42 });
const sample = () => frame(frame(waiting, 100), 3100);

test('warmup anchors and whole raw intervals include zero-tick frames and closing boundary', () => {
  const warm = frame(waiting, 100);
  assert.equal(frame(warm, 3099).phase, 'warmup');
  let state = frame(warm, 3100);
  assert.equal(state.phase, 'sampling');
  state = frame(state, 3240);
  state = frame(state, 3248, {
    ...zero,
    ticks: 1,
    squad: 1,
    individual: 4,
    poses: 4,
    decisionsMs: 2,
    rigMs: 3,
  });
  state = frame(state, 3258, {
    ...zero,
    ticks: 3,
    squad: 3,
    individual: 12,
    poses: 12,
    decisionsMs: 6,
    rigMs: 9,
  });
  assert.equal(state.phase, 'sampling');
  state = frame(state, 13101);
  assert.deepEqual(state, {
    phase: 'complete',
    result: {
      duration: 10001,
      frames: 4,
      fps: 42,
      median: 75,
      p95: 9843,
      mean: { ticks: 1, squad: 1, individual: 4, poses: 4, decisionsMs: 2, rigMs: 3 },
    },
  });
  assert.equal(frame(state, 99999), state);
  assert.equal(transitionProfile(state, { type: 'pause' }), state);
});

test('pause, disposal, invalid clocks and overflow explicitly reset or ignore events', () => {
  const complete = frame(sample(), 13100);
  const disposed = { phase: 'disposed' };
  for (const state of [waiting, frame(waiting, 1), sample(), complete]) {
    assert.deepEqual(
      transitionProfile(state, { type: 'pause' }),
      state === complete ? complete : waiting,
    );
    assert.deepEqual(transitionProfile(state, { type: 'dispose' }), disposed);
    assert.deepEqual(
      frame(state, NaN),
      state === complete ? complete : { ...waiting, reason: 'Invalid frame clock; retrying.' },
    );
  }
  const warm = frame(waiting, 100);
  assert.equal(frame(warm, 99).phase, 'waiting');
  assert.equal(frame(sample(), 3100).phase, 'waiting');
  assert.equal(frame(transitionProfile(sample(), { type: 'pause' }), 9000).phase, 'warmup');
  const retired = transitionProfile(sample(), { type: 'dispose' });
  assert.equal(frame(retired, 999), retired);
  assert.equal(transitionProfile(retired, { type: 'pause' }), retired);
  assert.equal(transitionProfile(retired, { type: 'dispose' }), retired);
  let state = sample();
  for (let i = 1; i <= 16384; i++) state = frame(state, 3100 + i / 4);
  assert.equal(state.phase, 'sampling');
  assert.deepEqual(frame(state, 7300), { ...waiting, reason: 'Too many frames; retrying.' });
});

test('clock slices count actual invocations, additional rig passes, and zero ticks', () => {
  let now = 0;
  const work = new ProfileWork(() => now);
  work.begin();
  work.finish('squad', undefined);
  assert.deepEqual(work.begin(), zero);
  work.tick();
  const squad = work.clock()!;
  now += 3;
  work.finish('squad', squad, 2);
  const individual = work.clock()!;
  now += 2;
  work.finish('individual', individual);
  const pose = work.clock()!;
  now += 5;
  work.finish('poses', pose);
  const tails = work.clock()!;
  now += 7;
  work.finish('poses', tails, 0);
  assert.deepEqual(work.begin(), {
    ticks: 1,
    squad: 2,
    individual: 1,
    poses: 1,
    decisionsMs: 5,
    rigMs: 12,
  });
  work.stop();
  assert.equal(work.clock(), undefined);
});
