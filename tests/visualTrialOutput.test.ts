import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { publishVisualTrial } from './visual-trial-output.ts';
import type { TrialRun } from './visual-trial-output.ts';

for (const [mode, file, message] of [
  ['--measure', 'timing-practice.json', 'timing report'],
  ['--measure', 'timing-dungeon.json', 'timing report'],
  ['--measure', 'timing-run/evidence/timing-practice.json', 'timing run'],
  ['--baseline', 'before-dungeon.json', 'baseline'],
]) {
  test(`${mode} refuses ${file} before browser launch`, async () => {
    await mkdir('test-results', { recursive: true });
    const output = await mkdtemp('test-results/visual-trial-preflight-');
    try {
      const marker = 'preserved evidence';
      await mkdir(join(output, file, '..'), { recursive: true });
      await writeFile(join(output, file), marker);
      // Make browser launch impossible even when the guard is broken; no benchmark can run.
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL('./visual-trial-browser.ts', import.meta.url)), mode],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            VISUAL_TRIAL_OUTPUT: output,
            PLAYWRIGHT_BROWSERS_PATH: join(output, 'no-browsers'),
          },
          timeout: 10_000,
        },
      );
      assert.ifError(result.error);
      assert.equal(result.status, 1);
      assert.match(result.stderr, new RegExp(`Refusing to overwrite ${message}:`));
      assert.deepEqual(await readdir(output), [file.split('/')[0]]);
      assert.equal(await readFile(join(output, file), 'utf8'), marker);
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });
}

test('a rejected paired rerun never publishes or touches historical artifacts', async () => {
  await mkdir('test-results', { recursive: true });
  const output = await mkdtemp('test-results/visual-trial-preflight-');
  const files = [
    'before-practice.json',
    'before-practice-original/motion.mp4',
    'paired-practice.json',
    'paired-practice-original/frame-000.png',
    'paired-practice-original/motion.mp4',
    'timing-dungeon.json',
    'practice-panel.png',
    'limits.json',
  ];
  async function writeArtifacts(directory: string, marker: string) {
    for (const file of files) {
      await mkdir(join(directory, file, '..'), { recursive: true });
      await writeFile(join(directory, file), marker);
    }
  }
  try {
    await writeArtifacts(output, 'historical');
    const entries = (await readdir(output)).sort();
    const accepted = await publishVisualTrial(output, 'paired', (stage) =>
      writeArtifacts(stage, 'accepted'),
    );
    const after = (await readdir(output)).sort();
    assert.equal(after.length, entries.length + 1);
    await assert.rejects(
      publishVisualTrial(output, 'paired', async (stage) => {
        await writeArtifacts(stage, 'invalid');
        assert.ok(!(await readdir(join(stage, '..'))).includes('evidence'));
        throw Error('dungeon media validation failed');
      }),
      /dungeon media validation failed/,
    );
    assert.deepEqual((await readdir(output)).sort(), after);
    for (const file of files) {
      assert.equal(await readFile(join(output, file), 'utf8'), 'historical');
      assert.equal(await readFile(join(accepted, file), 'utf8'), 'accepted');
    }
    await assert.rejects(publishVisualTrial(output, 'baseline', assert.fail), /overwrite baseline/);
    const panels = await Promise.all(
      Array.from({ length: 2 }, () =>
        publishVisualTrial(output, 'panel', async (stage) => {
          await writeFile(join(stage, 'practice-panel.png'), 'new panel');
        }),
      ),
    );
    assert.notEqual(panels[0], panels[1]);
    assert.equal(await readFile(join(output, 'practice-panel.png'), 'utf8'), 'historical');
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

const modes = ['baseline', 'timing', 'paired', 'panel'] satisfies TrialRun[];
const marker = 'captures/marker.txt';

async function withFreshRoot(run: (root: string) => Promise<void>) {
  const parent = await mkdtemp(join(tmpdir(), 'visual-trial-rollback-'));
  try {
    await run(join(parent, 'output'));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

async function writeMarker(directory: string, contents: string) {
  const path = join(directory, marker);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

function readMarker(directory: string) {
  return readFile(join(directory, marker), 'utf8');
}

function assertAbsent(path: string) {
  return assert.rejects(lstat(path), { code: 'ENOENT' });
}

for (const outer of modes) {
  for (const inner of modes) {
    const refusal =
      inner === 'baseline'
        ? /Refusing to overwrite baseline:/
        : inner === 'timing' && outer === 'timing'
          ? /Refusing to overwrite timing run:/
          : undefined;

    test(`${outer} then ${inner}: ${refusal ? 'refusal preserves the first run' : 'publication survives rollback'}`, () =>
      withFreshRoot(async (root) => {
        const failure = Error(`${outer} validation failed`);
        let outerStage = '';
        let innerEvidence = '';
        const publication = publishVisualTrial(root, outer, async (stage) => {
          outerStage = stage;
          await writeMarker(stage, `outer ${outer}`);
          if (refusal) {
            const entries = (await readdir(root)).sort();
            await assert.rejects(publishVisualTrial(root, inner, assert.fail), refusal);
            assert.deepEqual((await readdir(root)).sort(), entries);
            assert.equal(await readMarker(stage), `outer ${outer}`);
            return;
          }

          innerEvidence = await publishVisualTrial(root, inner, (peerStage) =>
            writeMarker(peerStage, `inner ${inner}`),
          );
          assert.equal(await readMarker(innerEvidence), `inner ${inner}`);
          throw failure;
        });

        if (refusal) {
          assert.equal(await readMarker(await publication), `outer ${outer}`);
        } else {
          await assert.rejects(publication, (error) => error === failure);
          assert.equal(await readMarker(innerEvidence), `inner ${inner}`);
          await assertAbsent(join(dirname(outerStage), 'evidence'));
        }
        await assertAbsent(outerStage);
      }));
  }
}

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

test('baseline rollback preserves a panel still staging', () =>
  withFreshRoot(async (root) => {
    const ready = gate();
    const release = gate();
    const failure = Error('baseline validation failed');
    let panel: Promise<string> | undefined;
    const baseline = publishVisualTrial(root, 'baseline', async (stage) => {
      await writeMarker(stage, 'partial baseline');
      panel = publishVisualTrial(root, 'panel', async (panelStage) => {
        await writeMarker(panelStage, 'active panel');
        ready.open();
        await release.promise;
      });
      await Promise.race([ready.promise, panel.then(() => assert.fail('panel published early'))]);
      throw failure;
    });

    try {
      await assert.rejects(baseline, (error) => error === failure);
      assert.ok(panel);
      release.open();
      assert.equal(await readMarker(await panel), 'active panel');
      await assertAbsent(join(root, '.pending'));
      await assertAbsent(join(root, 'evidence'));
    } finally {
      release.open();
      await Promise.allSettled([baseline, panel]);
    }
  }));

for (const mode of modes) {
  test(`${mode} can retry after isolated capture failure`, () =>
    withFreshRoot(async (root) => {
      const failure = Error('capture failed after writing');
      let failedRun = '';
      await assert.rejects(
        publishVisualTrial(root, mode, async (stage) => {
          failedRun = dirname(stage);
          await writeMarker(stage, 'partial capture');
          throw failure;
        }),
        (error) => error === failure,
      );
      await assertAbsent(failedRun);
      if (mode !== 'baseline') assert.deepEqual(await readdir(root), []);

      const evidence = await publishVisualTrial(root, mode, (stage) => writeMarker(stage, 'retry'));
      assert.equal(await readMarker(evidence), 'retry');
    }));
}

test('failed rename removes the owned stage and leaves the conflicting entry intact', () =>
  withFreshRoot(async (root) => {
    const evidence = join(root, 'evidence');
    await assert.rejects(
      publishVisualTrial(root, 'baseline', async (stage) => {
        await writeMarker(stage, 'unpublished capture');
        // Model an independent entry appearing before the final rename.
        await writeFile(evidence, 'conflicting entry');
      }),
      { syscall: 'rename' },
    );
    assert.equal(await readFile(evidence, 'utf8'), 'conflicting entry');
    assert.deepEqual(await readdir(root), ['evidence']);
  }));
