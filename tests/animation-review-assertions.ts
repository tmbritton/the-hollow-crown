import assert from 'node:assert/strict';
import type { AnimationReview } from '../src/animationReview.ts';
import type { ReviewClip } from './animation-review-fixture.ts';

/** A catalog entry must actually reach its named motion, not just export finite idle poses. */
export function assertReviewSequence(
  clip: ReviewClip,
  poses: ReturnType<AnimationReview['sample']>[],
) {
  assert.ok(poses.length >= 14);
  if (
    [
      'travel',
      'stairs',
      'stairs-down',
      'corpse',
      'moving-melee',
      'retreat',
      'carry',
      'formation',
    ].includes(clip)
  )
    assert.ok(
      poses.some((p) => p.speed > 0.5),
      `${clip} must move through the real motor`,
    );
  if (clip === 'travel') assert.ok(poses.at(-1)!.speed < 0.1, 'travel ends with a stop');
  if (clip === 'stairs') assert.ok(poses.at(-1)!.position.h - poses[0].position.h > 0.5);
  if (clip === 'stairs-down') assert.ok(poses.at(-1)!.position.h - poses[0].position.h < -0.5);
  if (clip === 'corpse')
    assert.ok(poses.some((p) => p.feet.some((f) => (f.drawnSurface ?? 0) > p.position.h + 0.1)));
  if (clip === 'jump') {
    assert.ok(poses.some((p) => p.jump > 0.9));
    assert.equal(poses.at(-1)!.jump, 0);
  }
  const kind = {
    melee: 'MELEE',
    'moving-melee': 'MELEE',
    crossbow: 'CROSSBOW',
    thrust: 'LONG_THRUST',
    throw: 'THROW_JAVELIN',
    interrupt: 'MELEE',
  };
  if (clip in kind) {
    assert.ok(poses.some((p) => p.attack?.kind === kind[clip as keyof typeof kind]));
    assert.equal(poses.at(-1)!.attack, null);
  }
  if (clip === 'guard') {
    assert.ok(poses.some((p) => p.defending));
    assert.equal(poses.at(-1)!.defending, false);
  }
  if (clip === 'interrupt') assert.ok(poses.some((p) => p.step === 24 && p.defending && !p.attack));
  if (clip === 'hide-peek')
    assert.deepEqual([...new Set(poses.map((p) => p.behavior))], ['hide', 'peek']);
  if (['cards', 'smoke', 'hackysack'].includes(clip))
    assert.ok(poses.every((p) => p.behavior === clip));
  if (['shrine', 'focus', 'packing', 'unloading'].includes(clip))
    assert.ok(poses.every((p) => p.work?.status === 'working' && p.work.elapsed > 0));
  if (clip === 'death') assert.ok(poses.some((p) => !p.alive && (p.corpseAge ?? 0) >= 0.62));
  if (clip === 'formation') {
    assert.deepEqual(
      [...new Set(poses.map((p) => p.squad))],
      ['assembling', 'engaging', 'holding'],
    );
    assert.ok(poses.every((p) => p.defending));
  }
  if (clip === 'opening') {
    assert.deepEqual(
      [...new Set(poses.map((p) => p.squad))],
      ['opening', 'attacking', 'recovering'],
    );
    assert.ok(poses.filter((p) => p.step <= 84).every((p) => !p.defending));
    assert.ok(poses.filter((p) => p.squad === 'recovering').every((p) => p.defending));
  }
}
