import assert from 'node:assert/strict';

export const visualTolerance = {
  original: { maxMean: 0.5, strongStep: 8, maxStrongFraction: 0.005 },
  tuned: { minMean: 2, strongStep: 12, minStrongFraction: 0.02, minFrameFraction: 0.9 },
};

function difference(a: Uint8Array, b: Uint8Array, strongStep: number) {
  assert.ok(a.length > 0 && a.length === b.length && a.length % 3 === 0, 'RGB frame size');
  let sum = 0;
  let strong = 0;
  for (let i = 0; i < a.length; i += 3) {
    const delta = Math.max(
      Math.abs(a[i] - b[i]),
      Math.abs(a[i + 1] - b[i + 1]),
      Math.abs(a[i + 2] - b[i + 2]),
    );
    sum += delta;
    if (delta >= strongStep) strong++;
  }
  const pixels = a.length / 3;
  return { mean: sum / pixels, strongFraction: strong / pixels };
}

type Track = AsyncGenerator<Uint8Array, void, void>;

export async function compareVisualFrames(tracks: [Track, Track, Track], frameCount: number) {
  const { original, tuned } = visualTolerance;
  let worstOriginalMean = 0;
  let worstOriginalStrongFraction = 0;
  let treatedFrames = 0;
  for (let i = 0; i < frameCount; i++) {
    const [before, a, b] = await Promise.all(tracks.map((track) => track.next()));
    assert.ok(!before.done && !a.done && !b.done, `decoded frame count: missing frame ${i}`);
    const control = difference(before.value, a.value, original.strongStep);
    assert.ok(
      control.mean <= original.maxMean && control.strongFraction <= original.maxStrongFraction,
      `Original differs from untouched control at frame ${i}: ${JSON.stringify(control)}`,
    );
    worstOriginalMean = Math.max(worstOriginalMean, control.mean);
    worstOriginalStrongFraction = Math.max(worstOriginalStrongFraction, control.strongFraction);
    const effect = difference(a.value, b.value, tuned.strongStep);
    if (effect.mean >= tuned.minMean && effect.strongFraction >= tuned.minStrongFraction)
      treatedFrames++;
  }
  const end = await Promise.all(tracks.map((track) => track.next()));
  assert.ok(
    end.every((frame) => frame.done),
    `decoded frame count: more than ${frameCount}`,
  );
  assert.ok(
    treatedFrames >= Math.ceil(frameCount * tuned.minFrameFraction),
    `Tuned lacks substantive difference from Original: ${treatedFrames}/${frameCount} frames`,
  );
  return { frameCount, worstOriginalMean, worstOriginalStrongFraction, treatedFrames };
}
