import { lstat, mkdir, mkdtemp, rename, rm, rmdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type TrialRun = 'baseline' | 'timing' | 'paired' | 'panel';

function isCode(error: unknown, code: string) {
  return error instanceof Error && 'code' in error && error.code === code;
}

async function reserve(path: string, kind: string) {
  await mkdir(path).catch((error: unknown) => {
    if (isCode(error, 'EEXIST')) throw Error(`Refusing to overwrite ${kind}: ${path}`);
    throw error;
  });
  return path;
}

async function requireAbsent(path: string) {
  const entry = await lstat(path).catch((error: unknown) => {
    if (!isCode(error, 'ENOENT')) throw error;
  });
  if (entry) throw Error(`Refusing to overwrite timing report: ${path}`);
}

async function reserveRun(root: string, mode: TrialRun) {
  if (mode === 'baseline') {
    await mkdir(dirname(root), { recursive: true });
    return reserve(root, 'baseline');
  }
  await mkdir(root, { recursive: true });
  if (mode === 'timing') {
    for (const name of ['practice', 'dungeon'])
      await requireAbsent(join(root, `timing-${name}.json`));
    return reserve(join(root, 'timing-run'), 'timing run');
  }
  return mkdtemp(join(root, `${mode}-run-`));
}

async function releaseEmptyRun(run: string, failure: unknown): Promise<never> {
  try {
    // The baseline reservation can also be the shared parent of other writers.
    await rmdir(run);
  } catch (error) {
    if (!isCode(error, 'ENOENT') && !isCode(error, 'ENOTEMPTY') && !isCode(error, 'EEXIST')) {
      throw new AggregateError([failure, error], `Could not release visual trial run: ${run}`);
    }
  }
  throw failure;
}

export async function publishVisualTrial(
  root: string,
  mode: TrialRun,
  validateAndCapture: (stage: string) => Promise<void>,
) {
  const run = await reserveRun(root, mode);
  const stage = join(run, '.pending');
  const published = join(run, 'evidence');
  try {
    await mkdir(stage);
  } catch (error) {
    return releaseEmptyRun(run, error);
  }
  try {
    await validateAndCapture(stage);
    await rename(stage, published);
  } catch (error) {
    try {
      await rm(stage, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `Could not discard visual trial stage: ${stage}`,
      );
    }
    return releaseEmptyRun(run, error);
  }
  return published;
}
