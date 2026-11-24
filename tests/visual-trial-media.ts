import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { compareVisualFrames } from './visual-trial-comparison.ts';

export const clip = { frames: 75, fps: 15 };

export function checkMediaShape(file: string, size: readonly number[], motion: boolean) {
  const metadata: {
    streams: { width: number; height: number; duration?: string }[];
    frames: { width: number; height: number; best_effort_timestamp_time?: string }[];
  } = JSON.parse(
    execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-threads',
        '1',
        '-select_streams',
        'v',
        '-show_frames',
        '-show_streams',
        '-show_entries',
        'stream=width,height,duration:frame=width,height,best_effort_timestamp_time',
        '-of',
        'json',
        file,
      ],
      { encoding: 'utf8' },
    ),
  );
  assert.equal(metadata.streams.length, 1, `${file}: expected one video stream`);
  const stream = metadata.streams[0];
  assert.deepEqual([stream.width, stream.height], size, `${file}: media dimensions`);
  assert.equal(metadata.frames.length, motion ? clip.frames : 1, `${file}: frame count`);
  for (const [i, frame] of metadata.frames.entries()) {
    assert.deepEqual([frame.width, frame.height], size, `${file}: frame ${i} dimensions`);
    if (motion)
      assert.ok(
        Math.abs(Number(frame.best_effort_timestamp_time) - i / clip.fps) <= 1e-6,
        `${file}: unexpected timestamp at frame ${i}`,
      );
  }
  if (motion) assert.equal(Number(stream.duration), clip.frames / clip.fps, `${file}: duration`);
}

async function* decode(file: string, bytes: number): AsyncGenerator<Uint8Array, void, void> {
  const child = spawn(
    'ffmpeg',
    [
      '-v',
      'error',
      '-xerror',
      '-nostdin',
      '-filter_threads',
      '1',
      '-threads',
      '1',
      '-noautorotate',
      '-i',
      file,
      '-map',
      '0:v:0',
      '-fps_mode',
      'passthrough',
      '-pix_fmt',
      'rgb24',
      '-threads',
      '1',
      '-f',
      'rawvideo',
      'pipe:1',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let diagnostic = '';
  child.stderr.setEncoding('utf8').on('data', (text: string) => {
    diagnostic = (diagnostic + text).slice(-2000);
  });
  // Resolve errors here, then check the result after draining stdout (no unhandled rejection).
  const exit = new Promise<number | Error | null>((resolve) => {
    child.once('error', resolve);
    child.once('close', resolve);
  });
  try {
    let frame = Buffer.allocUnsafe(bytes);
    let used = 0;
    for await (const chunk of child.stdout) {
      for (let start = 0; start < chunk.length;) {
        const count = Math.min(bytes - used, chunk.length - start);
        chunk.copy(frame, used, start, start + count);
        start += count;
        used += count;
        if (used === bytes) {
          yield frame;
          frame = Buffer.allocUnsafe(bytes);
          used = 0;
        }
      }
    }
    assert.equal(await exit, 0, `${file}: RGB decode failed: ${diagnostic.trim()}`);
    assert.equal(used, 0, `${file}: incomplete RGB frame`);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exit;
  }
}

export async function compareVisualMedia(
  files: [string, string, string],
  size: readonly number[],
  motion: boolean,
) {
  for (const file of files) checkMediaShape(file, size, motion);
  const [before, current, tuned] = files;
  const bytes = size[0] * size[1] * 3;
  const tracks = [decode(before, bytes), decode(current, bytes), decode(tuned, bytes)] as const;
  try {
    return await compareVisualFrames([...tracks], motion ? clip.frames : 1);
  } catch (error) {
    throw Error(`${current}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  } finally {
    await Promise.all(tracks.map((track) => track.return()));
  }
}
