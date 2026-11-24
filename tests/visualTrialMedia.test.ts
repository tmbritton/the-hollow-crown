import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { compareVisualFrames } from './visual-trial-comparison.ts';
import { compareVisualMedia } from './visual-trial-media.ts';

const original = new Uint8Array(100 * 100 * 3).fill(80);
const noise = original.slice();
for (let i = 0; i < 11; i++) noise[3 * i + 1]++;
const changed = original.slice();
for (let i = 0; i < 1000; i++) changed[3 * i + 2] += 40;
const shifted = original.map((channel) => channel + 1);

async function* frames(...sequence: Uint8Array[]) {
  yield* sequence;
}

for (const count of [1, 75]) {
  const track = (frame: Uint8Array) => frames(...Array<Uint8Array>(count).fill(frame));
  test(`${count === 1 ? 'still' : 'clip'} separates Original noise from actual treatment`, async () => {
    const compare = (before: Uint8Array, current: Uint8Array, tuned: Uint8Array) =>
      compareVisualFrames([track(before), track(current), track(tuned)], count);
    await compare(original, noise, changed);
    await assert.rejects(compare(original, changed, changed), /Original differs/);
    await assert.rejects(compare(original, original, original), /Tuned lacks/);
    await assert.rejects(compare(original, original, noise), /Tuned lacks/);
    await assert.rejects(compare(original, original, shifted), /Tuned lacks/);
  });
}

test('clips check every Original frame and reject a one-frame treatment or truncated stream', async () => {
  const clip = Array<Uint8Array>(75).fill(original);
  const spike = [...clip.slice(0, -1), changed];
  const treated = clip.map(() => changed);
  await assert.rejects(
    compareVisualFrames([frames(...clip), frames(...spike), frames(...treated)], 75),
    /Original differs.*74/,
  );
  await assert.rejects(
    compareVisualFrames([frames(...clip), frames(...clip), frames(...spike)], 75),
    /Tuned lacks/,
  );
  await assert.rejects(
    compareVisualFrames([frames(...clip), frames(...clip.slice(0, -1)), frames(...treated)], 75),
    /frame count/,
  );
});

const hasMediaTools = ['ffmpeg', 'ffprobe'].every(
  (name) => spawnSync(name, ['-version']).status === 0,
);
for (const motion of [false, true]) {
  test(
    `decoded ${motion ? 'MP4' : 'PNG'} rejects a re-encoded no-op and accepts noisy Original`,
    { skip: !hasMediaTools && 'requires ffmpeg and ffprobe' },
    async () => {
      await mkdir('test-results', { recursive: true });
      const dir = await mkdtemp('test-results/visual-trial-media-');
      try {
        const count = motion ? 75 : 1;
        const encode = (name: string, pixels: Uint8Array, alternate = false, fps = 15) => {
          const file = join(dir, `${name}.${motion ? 'mp4' : 'png'}`);
          execFileSync(
            'ffmpeg',
            [
              '-v',
              'error',
              '-f',
              'rawvideo',
              '-pixel_format',
              'rgb24',
              '-video_size',
              '100x100',
              '-framerate',
              String(fps),
              '-i',
              'pipe:0',
              '-threads',
              '1',
              ...(motion
                ? [
                    '-c:v',
                    'libx264rgb',
                    '-qp',
                    '0',
                    '-preset',
                    alternate ? 'slow' : 'ultrafast',
                    '-metadata',
                    `comment=${name}`,
                  ]
                : ['-compression_level', alternate ? '0' : '9']),
              file,
            ],
            { input: Buffer.concat(Array<Uint8Array>(count).fill(pixels)) },
          );
          return file;
        };
        const before = encode('before', original);
        const current = encode('current', noise);
        const tuned = encode('treated', changed);
        const noop = encode('no-op', original, true);
        assert.notDeepEqual(await readFile(before), await readFile(noop));
        const compare = (a: string, b: string) =>
          compareVisualMedia([before, a, b], [100, 100], motion);
        const stats = await compare(current, tuned);
        assert.ok(stats.worstOriginalMean > 0 && stats.worstOriginalMean < 0.002);
        await assert.rejects(compare(noop, noop), /Tuned lacks/);
        await assert.rejects(compare(tuned, before), /Original differs/);
        if (motion)
          await assert.rejects(
            compare(before, encode('wrong-rate', changed, false, 25)),
            /timestamp/,
          );
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
}
