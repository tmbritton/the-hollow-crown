import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { openBatch } from './encounter-report.ts';
import { sha256, sourceManifest, validateSourceArchive } from './encounter-source.ts';
import { verifyTraceBatch } from './encounter-trace-archive.ts';
import { isolatedGitEnv } from './git-env.ts';
import type { ScaleSignature } from '../src/targetedShaderRendering.ts';

type Source = Awaited<ReturnType<typeof sourceManifest>>;
export const arms = ['parent', 'frozen', 'candidate'] as const;
export const artifacts = resolve('test-results/encounter');
const previous = join(artifacts, 'shader-trial-lboASK');
export const baseline = join(artifacts, 'baseline-r6-480ffe1b');
export const trace = join(artifacts, 'trace-r6-v4-31faeede');
export const json = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8'));
export const put = (path: string, value: unknown) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
export const hash = async (path: string) => sha256(await readFile(path));
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, env: isolatedGitEnv(), encoding: 'utf8' });
const sourceDiff = (a: Source, b: Source) => {
  const left = new Map(a.entries.map((x) => [x.path, x.sha256]));
  const right = new Map(b.entries.map((x) => [x.path, x.sha256]));
  return [...new Set([...left.keys(), ...right.keys()])]
    .sort()
    .flatMap((path) =>
      left.get(path) === right.get(path)
        ? []
        : [{ path, before: left.get(path), after: right.get(path) }],
    );
};

export async function verifyHistory() {
  const seal = await hash(join(previous, 'timed-primary/CPU_TRIAL.json'));
  assert.equal(seal, 'adda38f647460e4863769684c8452e1ddf1f26117798e051af1a9771f4406dbb');
  const frozen = await openBatch(baseline);
  assert.ok(
    frozen.frozen && frozen.rows.length === 54 && frozen.rows.every((r) => !r.errors.length),
  );
  const v4 = await verifyTraceBatch(trace);
  assert.ok('admitted' in v4);
  assert.equal(v4.admitted.length, 6);
  const dirty = await json<Source>(join(previous, 'source.json'));
  assert.equal(dirty.digest, '9d3b7246a8b1c152d38b0071c6c026bba749fa0477cdfe3e9f53d31635e0137a');
  assert.ok(await validateSourceArchive(previous, dirty));
  return {
    seal,
    dirty: dirty.digest,
    frozen: frozen.manifest.source.digest,
    visits: frozen.rows.length,
    v4,
  };
}

async function signatures() {
  const red = join(previous, 'browser-red.json');
  assert.equal(await hash(red), 'd799d33afc4e5f59de2cccf11ddcc7c250d9a29cb07a85535e94d7e6e3e1da0d');
  // Babylon allocates custom shader tokens by page creation order. Stable names were matched
  // to tokens in the lifecycle-only submitted-draw audit, not used as effect cache keys.
  const names: Record<string, string> = {
    custom_19: 'stone',
    custom_20: 'trim',
    custom_21: 'dark',
    custom_23: 'wood',
    custom_24: 'iron',
    custom_25: 'gold',
    custom_26: 'bone',
    custom_27: 'cloth',
    custom_31: 'brick',
  };
  const { result } = await json<{
    result: {
      quality: 'low' | 'high';
      generations: { ready: string[] }[];
      missing: { firstMotion: string[] };
    }[];
  }>(red);
  const unique = new Map<string, ScaleSignature>();
  for (const { quality, generations, missing } of result)
    for (const row of missing.firstMotion) {
      const [name, key]: [string, string] = JSON.parse(row);
      if (!key.includes('#define NONUNIFORMSCALING\n')) continue;
      const pass =
        name === 'Camera overhead camera'
          ? 'camera'
          : name === 'graphic key light_shadowMap#0' && quality === 'high'
            ? 'shadow'
            : null;
      if (!pass) continue;
      const separator = key.indexOf('@');
      const [vertex, fragment] = key.slice(0, separator).split('+');
      assert.equal(vertex, fragment);
      assert.ok(vertex && (vertex === 'default' || vertex === 'shadowMap' || names[vertex]));
      const scaled = key.slice(separator + 1);
      const sibling = scaled.replace('#define NONUNIFORMSCALING\n', '');
      assert.ok(generations[1]!.ready.includes(key.slice(0, separator + 1) + sibling));
      const signature = {
        quality,
        pass,
        source: names[vertex] ?? vertex,
        sibling,
        scaled,
      } as const;
      unique.set(JSON.stringify(signature), signature);
    }
  assert.equal(unique.size, 21);
  return [...unique.values()];
}

async function reconstruct(src: string, root: string, expected: string) {
  const source = await json<Source>(join(src, 'source.json'));
  assert.equal(source.digest, expected);
  assert.ok(await validateSourceArchive(src, source));
  git(process.cwd(), 'clone', '--shared', '--no-checkout', '.', root);
  git(root, 'checkout', '--detach', source.head);
  git(root, 'apply', join(src, 'working-tree.patch'));
  await cp(join(src, 'untracked'), root, { recursive: true });
  assert.equal((await sourceManifest(undefined, root)).digest, source.digest);
  await symlink(await realpath('node_modules'), join(root, 'node_modules'), 'dir');
  return source;
}

function replaceOnce(source: string, from: string, to: string) {
  assert.equal(source.split(from).length, 2, `Missing or ambiguous overlay anchor: ${from}`);
  return source.replace(from, () => to);
}

export async function buildArms(output: string) {
  const history = await verifyHistory();
  await mkdir(output);
  const prior = await json<Record<'parent' | 'frozen', string>>(
    join(previous, 'timed-primary/CPU_TRIAL.json'),
  );
  const raw = join(output, 'original-parent');
  await reconstruct(previous, raw, history.dirty);
  const original = await readFile(join(raw, 'src/main.ts'), 'utf8');
  const fixed = await readFile('src/main.ts', 'utf8');
  const family = await signatures();
  await put(join(output, 'signatures.json'), family);
  const records = [];
  const measured = [];
  for (const arm of arms) {
    const root = join(output, arm);
    const ref = arm === 'frozen' ? 'frozen' : 'parent';
    const input = await reconstruct(
      join(previous, `timed-primary/source-${ref}`),
      root,
      prior[ref],
    );
    const path = join(root, 'src/main.ts');
    const armed = await readFile(path, 'utf8');
    // Three-way merge the *same* production lifecycle delta over existing passive timing marks.
    // start() entry is the only shared insertion point; move the mark onto a distinct line first.
    const mark = '  measureLoad.begin();\n';
    const start = '  if (import.meta.env.DEV) animationReview?.reset();\n';
    const mergeInput = replaceOnce(armed, mark + start, start + mark);
    await writeFile(path, mergeInput);
    const merged = git(
      process.cwd(),
      'merge-file',
      '-p',
      path,
      join(raw, 'src/main.ts'),
      resolve('src/main.ts'),
    );
    assert.notEqual(fixed, original);
    let runtime = replaceOnce(merged, start + mark, mark + start);
    await cp('src/rigLifecycle.ts', join(root, 'src/rigLifecycle.ts'));
    if (arm === 'candidate') {
      for (const file of ['targetedShader.ts', 'targetedShaderRendering.ts'])
        await cp(`src/${file}`, join(root, 'src', file));
      await writeFile(
        join(root, 'src/targetedShaderSignatures.ts'),
        `import type { ScaleSignature } from './targetedShaderRendering.ts';\nexport const signatures: readonly ScaleSignature[] = ${JSON.stringify(family)};\n`,
      );
      runtime = replaceOnce(
        runtime,
        'import { observeLoad }',
        "import { prepareScalePrograms } from './targetedShaderRendering.ts';\nimport { signatures } from './targetedShaderSignatures.ts';\nimport { observeLoad }",
      );
      runtime = replaceOnce(
        runtime,
        'let sceneGeneration = 0;',
        'let sceneGeneration = 0;\nlet replacePreparation: (() => void) | undefined;',
      );
      runtime = replaceOnce(
        runtime,
        '  scene.executeWhenReady(() => {',
        '  replacePreparation = prepareScalePrograms(scene, signatures, () => quality, () => {',
      );
      runtime = replaceOnce(
        runtime,
        "    ui.transition({ type: 'READY' });",
        "    measureLoad.prepared();\n    ui.transition({ type: 'READY' });",
      );
      runtime = replaceOnce(
        runtime,
        '      6500,\n    );\n  });',
        "      6500,\n    );\n  }, (reason) => {\n    if (rigLifetime.generation !== generation) return;\n    ui.transition({ type: 'FAIL' });\n    loading.classList.remove('done');\n    required(loading.querySelector('p'), 'Loading caption missing').textContent = reason;\n  }, () => performance.now());",
      );
      runtime = replaceOnce(
        runtime,
        '    applyQuality();\n  }\n};',
        '    applyQuality();\n    replacePreparation?.();\n  }\n};',
      );
    }
    await writeFile(path, runtime);
    const archive = join(output, `source-${arm}`);
    await mkdir(archive);
    const source = await sourceManifest(archive, root);
    assert.ok(await validateSourceArchive(archive, source, root));
    await put(join(archive, 'source.json'), source);
    measured.push(source);
    records.push({ arm, source: source.digest, diff: sourceDiff(input, source) });
  }
  const candidateMinusParent = sourceDiff(measured[0]!, measured[2]!);
  assert.deepEqual(
    candidateMinusParent.map((x) => x.path),
    [
      'src/main.ts',
      'src/targetedShader.ts',
      'src/targetedShaderRendering.ts',
      'src/targetedShaderSignatures.ts',
    ],
  );
  for (const path of [
    'src/encounterCapture.ts',
    'src/shaderTrialObservation.ts',
    'src/rigLifecycle.ts',
  ])
    assert.equal(
      new Set(measured.map((m) => m.entries.find((x) => x.path === path)?.sha256)).size,
      1,
    );
  await put(join(output, 'overlay.json'), { history, records, candidateMinusParent });
  return Object.fromEntries(records.map(({ arm, source }) => [arm, source]));
}
