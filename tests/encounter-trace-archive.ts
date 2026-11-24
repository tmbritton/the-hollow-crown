import assert from 'node:assert/strict';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { rendererKind } from '../src/cpuMetrics.ts';
import { recipe } from '../src/encounterRecipe.ts';
import {
  encounterWitnessIssues,
  matchedDifferences,
  openBatch,
  startDifferences,
} from './encounter-report.ts';
import type { Visit } from './encounter-report.ts';
import { sha256, validateSourceArchive } from './encounter-source.ts';
import type { sourceManifest } from './encounter-source.ts';
import { analyzeApproach, parseTrace, traceIssues } from './encounter-trace.ts';
import { traceLimits } from './encounter-trace-cdp.ts';
import type { createBrowserTrace } from './encounter-trace-cdp.ts';
import { desktopLock, nextTraceAttempt, tracePlan } from './encounter-trace-visit.ts';
import type { Verdict } from './encounter-trace-visit.ts';

export const frozenPath = 'test-results/encounter/baseline-r6-480ffe1b';
export const approachProtocol = 4;
type Protocol = 2 | 3 | typeof approachProtocol;
const rejectedV2Seal = 'e90b82d18eb60ab70d69c90f574bb364bbbe0a5818ac92036ec08900392cdf1d';
const rejectedV3Seal = 'eca6e36ae045ff7d5b650e32a33d7781d08da7e8edb13db544a50ba300f8bfaf';
type Source = Awaited<ReturnType<typeof sourceManifest>>;
type SourceDifference = { path: string; frozen?: string | null; current?: string | null };

export function verifySourceDiff(saved: unknown, differences: readonly SourceDifference[]) {
  assert.deepEqual(saved, JSON.parse(JSON.stringify(differences)));
}
const runtimeOverlay = {
  'src/main.ts': 'bc68e2954f5fba44591f431fcf5c2ad510f653e7bf7e513539f782fbdd1ba3b1',
  'src/encounterCapture.ts': 'e4ca3b19359bb73713549055ff2dd66e4e732f0b6b06f126475b7171ddaaf6dc',
  'src/encounterRecipe.ts': 'e9a6b67b2ff8238f936ad8f9355660a5205dcf819eea5803374e32047f5bffc6',
};

export async function frozenReference(source: Source) {
  const batch = await openBatch(frozenPath);
  assert.ok(
    batch.frozen && batch.rows.length === 54 && batch.rows.every((r) => !r.errors.length),
    'Frozen R6 archive failed integrity or eligibility',
  );
  assert.equal(source.head, batch.manifest.source.head);
  assert.equal(source.branch, 'epic-1-encounter-hitch');
  const current = new Map(source.entries.map((row) => [row.path, row.sha256]));
  const reference = new Map(batch.manifest.source.entries.map((row) => [row.path, row.sha256]));
  const differences = [...new Set([...current.keys(), ...reference.keys()])]
    .sort()
    .flatMap((path) =>
      current.get(path) === reference.get(path)
        ? []
        : [{ path, frozen: reference.get(path), current: current.get(path) }],
    );
  const overlay = new Set([
    // Existing terminal-entry witness correction; recipe change validates recorded slots only.
    ...Object.keys(runtimeOverlay),
    'tests/encounter-recipe.test.ts',
    'tests/encounter-report.test.ts',
    'tests/encounter-browser.ts',
    'tests/encounter-report.ts',
    'tests/cpu-production.ts',
    'tests/encounter-trace.ts',
    'tests/encounter-trace.test.ts',
    'tests/encounter-trace-cdp.ts',
    'tests/encounter-trace-archive.ts',
    'tests/encounter-trace-visit.ts',
  ]);
  for (const [path, hash] of Object.entries(runtimeOverlay)) {
    assert.equal(current.get(path), hash, `Capture overlay differs: ${path}`);
  }
  assert.deepEqual(
    differences.filter((d) => !overlay.has(d.path)),
    [],
    'Unexpected source differences from frozen R6',
  );
  return { batch, differences };
}

function stableGraphics(visit: Visit) {
  const graphics = visit.graphics;
  if (!graphics) return visit;
  // SystemInfo's extra implementation details may be transient. Compare actual devices/driver.
  const gpu = graphics.gpuSystem as { devices?: unknown } | undefined;
  return { ...visit, graphics: { ...graphics, gpuSystem: gpu?.devices } };
}

// Only normalize object properties the archive format cannot represent. Do not coerce
// array elements, null, nonfinite numbers, or other present values.
function omitUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitUndefined);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([key, v]) => [key, omitUndefined(v)]),
    );
  return value;
}

export function traceParity(reference: Visit, visit: Visit, protocol: Protocol) {
  if (protocol === 4) {
    reference = JSON.parse(encodeTraceVisit(reference));
    visit = JSON.parse(encodeTraceVisit(visit));
  }
  const a = stableGraphics(reference);
  const b = stableGraphics(visit);
  if (protocol === 2) return matchedDifferences(a, b);
  const differences =
    protocol === 4
      ? matchedDifferences(a, b)
      : matchedDifferences(a, b, (left, right) =>
          startDifferences(omitUndefined(left), omitUndefined(right)),
        );
  const y = a.capture?.start?.camera[4];
  const otherY = b.capture?.start?.camera[4];
  // Near the stationary 0.75 target, renderUpdate's RAF-dependent lerp stalls within
  // a few binary64 steps. Cap both residuals and their difference at four such steps.
  const bound = 4 * 2 ** -53;
  if (
    typeof y === 'number' &&
    typeof otherY === 'number' &&
    Math.abs(y - 0.75) <= bound &&
    Math.abs(otherY - 0.75) <= bound &&
    Math.abs(y - otherY) <= bound &&
    Math.fround(y) === Math.fround(otherY)
  )
    return differences.filter((path) => path !== 'start.camera.4');
  return differences;
}

// Validate before JSON can turn holes and nonfinite values into plausible nulls. This
// is only a wire-shape check; signed gameplay values are still compared to frozen R6.
export function encodeTraceVisit(visit: Visit) {
  const ancestors = new Set<object>();
  function check(value: unknown, path: string) {
    if (typeof value === 'number') assert.ok(Number.isFinite(value), `${path}: nonfinite number`);
    if (value == null || ['string', 'boolean', 'number'].includes(typeof value)) return;
    assert.equal(typeof value, 'object', `${path}: unsupported JSON value`);
    assert.ok(typeof value === 'object' && !ancestors.has(value), `${path}: cyclic value`);
    ancestors.add(value);
    if (Array.isArray(value)) {
      const cargo = /^capture\.(start|end)\.state\.detail\.authority\.cargo\.\d+$/.test(path);
      for (let i = 0; i < value.length; i++) {
        assert.ok(Object.hasOwn(value, i), `${path}.${i}: array hole`);
        assert.ok(
          value[i] !== undefined || (cargo && i === 3 && value[1] === 'loose'),
          `${path}.${i}: unexpected undefined array element`,
        );
      }
      assert.equal(Reflect.ownKeys(value).length, value.length + 1, `${path}: extra array keys`);
      if (cargo) {
        const [id, state, revision, owner, transform] = value;
        assert.ok(
          value.length === 5 &&
            typeof id === 'string' &&
            typeof state === 'string' &&
            Number.isInteger(revision) &&
            (owner == null || typeof owner === 'string') &&
            ['x', 'z', 'h', 'heading'].every((key) => typeof transform?.[key] === 'number'),
          `${path}: invalid cargo tuple`,
        );
      }
    } else {
      assert.ok(
        Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null,
        `${path}: not a plain JSON record`,
      );
    }
    for (const key of Reflect.ownKeys(value)) {
      if (Array.isArray(value) && key === 'length') continue;
      const field = Object.getOwnPropertyDescriptor(value, key);
      assert.ok(
        typeof key === 'string' && field?.enumerable && 'value' in field,
        `${path}: invalid JSON field`,
      );
      check(field.value, path ? `${path}.${key}` : key);
    }
    ancestors.delete(value);
  }
  check(visit, '');
  return `${JSON.stringify(visit, null, 2)}\n`;
}

export function prevalidateNative(reference: Visit, visit: Visit) {
  const bytes = encodeTraceVisit(visit);
  const wire: Visit = JSON.parse(bytes);
  const identity = {
    sourceDigest: visit.sourceDigest,
    recipeHash: visit.recipeHash,
    unchanged: true,
  };
  const witness = encounterWitnessIssues(wire, identity, true);
  assert.deepEqual(encounterWitnessIssues(visit, identity, true), witness);
  const parity = traceParity(reference, wire, approachProtocol);
  assert.deepEqual(traceParity(reference, visit, approachProtocol), parity);
  const cargo = visit.capture?.start?.state.detail?.authority.cargo;
  assert.ok(cargo?.length);
  const absentOwners = cargo.flatMap((row, i) => {
    if (row[1] !== 'loose' || row[3] !== undefined) return [];
    assert.ok(Object.hasOwn(row, 3), 'Expected explicit Playwright undefined tuple element');
    assert.equal(wire.capture?.start?.state.detail?.authority.cargo[i]?.[3], null);
    return [i];
  });
  assert.equal(absentOwners.length, 4, 'Did not reproduce live loose cargo tuple');
  for (const change of ['owner', 'transform', 'hole', 'nonfinite'] as const) {
    const mutant = structuredClone(visit);
    const row = mutant.capture!.start!.state.detail!.authority.cargo[absentOwners[0]!]!;
    const transform = row[4];
    assert.ok(transform && typeof transform === 'object');
    const path = `start.state.detail.authority.cargo.${absentOwners[0]}`;
    if (change === 'owner') {
      row[3] = 'player';
      assert.ok(traceParity(wire, mutant, 4).includes(`${path}.3`));
    } else if (change === 'transform') {
      row[4] = { ...transform, z: -transform.z };
      assert.ok(traceParity(wire, mutant, 4).includes(`${path}.4.z`));
    } else if (change === 'hole') {
      Reflect.deleteProperty(row, '3');
      assert.throws(() => encodeTraceVisit(mutant), /array hole/);
    } else {
      row[4] = { ...transform, z: Infinity };
      assert.throws(() => encodeTraceVisit(mutant), /nonfinite/);
    }
  }
  return { bytes, witness, parity, absentOwners };
}

// Historical replay only. cpuProfile snapshots the cargo tuple's optional owner?.id;
// for loose cargo this was undefined until JSON wrote it as null.
export function replayLooseCargoOwners(visit: Visit) {
  const live = structuredClone(visit);
  const cargo = live.capture?.start?.state.detail?.authority?.cargo;
  assert.ok(cargo?.length);
  for (const [i, row] of cargo.entries()) {
    assert.equal(row.length, 5);
    assert.equal(row[0], `tribute:cargo:${i}`);
    assert.equal(row[1], 'loose');
    assert.equal(row[3], null);
    row[3] = undefined;
  }
  return live;
}

type RootIdentity = { nonce: string; cwd: string; root: string };
function sameInputs(before: Source, after: Source) {
  // Git status also includes docs and staging state; compare the actual capture inputs.
  const { status: _before, ...a } = before;
  const { status: _after, ...b } = after;
  return !startDifferences(a, b).length;
}
export function traceSourceStable(
  before: Source,
  after: Source,
  served: RootIdentity | undefined,
  root: string,
  nonce: string,
) {
  return (
    !!nonce &&
    !!served &&
    !startDifferences(served, { nonce, cwd: root, root }).length &&
    sameInputs(before, after)
  );
}

export async function inspectTrace(input: {
  visit: Visit;
  reference: Visit;
  file: string;
  health: { eof: boolean; loss: boolean };
  identity: { sourceDigest: string; recipeHash: string; unchanged: boolean };
  protocol: Protocol;
}) {
  const { visit, reference, health, file, identity } = input;
  const witness = encounterWitnessIssues(visit, identity, input.protocol === 4);
  const parity = traceParity(reference, visit, input.protocol);
  const trace = visit.capture?.trace;
  let analysis: ReturnType<typeof analyzeApproach> | undefined;
  let analysisError: string | undefined;
  try {
    assert.ok(
      trace?.id === visit.id && trace.outcome === false && visit.diagnostic === 'approach-trace',
      'Missing trace-only identity',
    );
    assert.equal(trace.motion.length, 16, 'Incomplete motion prefix');
    for (const motion of trace.motion) {
      const frame = visit.capture?.frames[motion.callback];
      assert.ok(
        frame &&
          motion.from === frame.from &&
          motion.to === frame.to &&
          motion.phases.join() === frame.phases.join(),
        'Motion/visit witness differs',
      );
    }
    analysis = analyzeApproach(
      parseTrace(await readFile(file, 'utf8')),
      trace.id,
      trace.motion,
      visit.capture?.input.map((e) => e.tick) ?? [],
      input.protocol === 4,
    );
  } catch (error) {
    analysisError = String(error);
  }
  const issues = [
    ...witness,
    ...traceIssues({
      ...health,
      source: identity.unchanged,
      parity: parity.length === 0,
      hardware: !!visit.graphics?.hardware && !!visit.graphics.renderer.includes('RTX 2070'),
      samples: !!analysis?.samplesPresent,
      // A missing frame join disqualifies the GPU control, not independently
      // aligned CPU stacks. Do not retry v4 merely to get a frame delivered.
      tracks: input.protocol === 4 || !!analysis?.tracksPresent,
      outcome: trace?.outcome !== false,
    }),
    ...(analysisError ? [analysisError] : []),
  ];
  return { id: visit.id, name: visit.name, reference: reference.id, parity, issues, analysis };
}

type AttemptEvidence = {
  check: Source;
  status?: Awaited<ReturnType<typeof createBrowserTrace>>['status'];
  cleanupError?: string;
  timing: { started: number; ended: number };
};

export function verifyAttemptTiming(timing: AttemptEvidence['timing'], previousEnd: number) {
  assert.ok(
    Number.isFinite(timing?.started) &&
      Number.isFinite(timing.ended) &&
      timing.started >= previousEnd &&
      timing.ended > timing.started,
    'Invalid trace attempt chronology',
  );
  return timing.ended;
}

export async function inspectAttempt(
  root: string,
  visit: Visit,
  frozen: Awaited<ReturnType<typeof frozenReference>>,
  source: Source,
  recipeHash: string,
  evidence: AttemptEvidence,
  protocol: Protocol,
) {
  const slot = tracePlan.find(({ id }) => visit.id === id || visit.id === `${id}-replacement`);
  assert.ok(slot);
  const replacementFor = slot.id === visit.id ? undefined : slot.id;
  const reference = frozen.batch.rows.find(({ visit: v }) => v.id === slot.id)?.visit;
  assert.ok(reference);
  assert.deepEqual(
    [visit.name, visit.quality, visit.mode, visit.repeat],
    [slot.name, slot.quality, slot.mode, slot.repeat],
  );
  assert.equal((visit as Visit & { replacementFor?: string }).replacementFor, replacementFor);
  const { status, cleanupError } = evidence;
  const file = join(root, `${visit.id}.trace.json`);
  const rawBytes = await stat(file).then(
    (s) => s.size,
    (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') return 0;
      throw err;
    },
  );
  const health = {
    eof: status?.eof === true,
    loss:
      status?.dataLossOccurred !== false ||
      !Number.isFinite(status?.peakBufferUsage) ||
      status!.peakBufferUsage >= 0.95 ||
      status!.usage.some((x) => (x.percentFull ?? x.value ?? 0) >= 0.95),
  };
  const unchanged = sameInputs(source, evidence.check);
  const row = await inspectTrace({
    visit,
    reference,
    file,
    health,
    identity: { sourceDigest: source.digest, recipeHash, unchanged },
    protocol,
  });
  if (
    rawBytes !== (status?.bytes ?? 0) ||
    rawBytes > traceLimits.bytes ||
    (health.eof && !rawBytes)
  )
    row.issues.push('Trace stream byte count mismatch');
  if (cleanupError) row.issues.push(cleanupError);
  if (status?.recordingPossiblyActive) row.issues.push('Browser trace shutdown unconfirmed');
  return {
    ...row,
    replacementFor,
    stop: !unchanged || !!cleanupError || status?.recordingPossiblyActive === true,
    health,
  };
}

export async function hashArtifacts(root: string, relative = ''): Promise<string[]> {
  const files = await readdir(join(root, relative), { withFileTypes: true });
  return (
    await Promise.all(
      files
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(async (file) => {
          const path = join(relative, file.name);
          if (file.isDirectory()) return hashArtifacts(root, path);
          assert.ok(file.isFile(), `Non-file artifact ${path}`);
          return path === 'SHA256SUMS'
            ? []
            : [`${sha256(await readFile(join(root, path)))}  ${path}\n`];
        }),
    )
  ).flat();
}

export async function sealTraceBatch(root: string) {
  await writeFile(join(root, 'SHA256SUMS'), (await hashArtifacts(root)).join(''), { flag: 'wx' });
}

export function spreads(rows: readonly Awaited<ReturnType<typeof inspectTrace>>[]) {
  return Object.fromEntries(
    ['reduced', 'door'].map((name) => {
      const deltas = rows
        .filter((row) => row.name === name && !row.issues.length)
        .flatMap((row) => (row.analysis ? [row.analysis.delta] : []));
      return [
        name,
        {
          repeats: deltas.length,
          complete: deltas.length === 3,
          metrics: deltas.length
            ? Object.fromEntries(
                Object.entries(deltas[0]!).map(([key]) => {
                  const values = deltas.map((d) => d[key as keyof typeof d]);
                  return [key, { values, min: Math.min(...values), max: Math.max(...values) }];
                }),
              )
            : {},
        },
      ];
    }),
  );
}

export function traceBatchState(rows: readonly Verdict[], stable: boolean, setupError?: string) {
  nextTraceAttempt(rows); // Validate every transition, including stopping on a second failure.
  const admitted = rows.filter((row) => !row.issues.length && !row.stop).map(({ id }) => id);
  const unchanged = stable && !rows.some((row) => row.issues.includes('Source drift'));
  return {
    unchanged,
    complete: unchanged && !setupError && admitted.length === tracePlan.length,
    admitted,
  };
}

export function traceReport(
  rows: readonly Awaited<ReturnType<typeof inspectAttempt>>[],
  state: ReturnType<typeof traceBatchState>,
  setupError?: string,
  protocol?: Protocol,
) {
  return {
    diagnostic: true,
    outcomeEligible: false,
    setupError,
    ...state,
    visits: rows.map(({ analysis, ...row }) => ({
      ...row,
      selected: analysis?.selected,
      delta: analysis?.delta,
      ...(protocol === 4 && {
        frameControl: analysis?.tracksPresent === true,
        frameControlIssues: analysis?.frameControlIssues ?? { analysis: 'No aligned windows' },
      }),
    })),
    spreads: spreads(state.unchanged ? rows : []),
    ...(protocol === 4 && {
      frameControlComplete:
        state.complete &&
        rows.filter((r) => !r.issues.length).every((r) => r.analysis?.tracksPresent),
    }),
  };
}

export function requireReplayParity(prevalidate: 3 | 4, liveCargoParity: string[]) {
  if (prevalidate === 4)
    assert.deepEqual(liveCargoParity, [], 'Historical live-wire parity differs');
}

export function shouldReplayNativeGate(
  protocol: Protocol,
  entries: number,
  gatePassed: boolean | undefined,
  setupError?: string,
) {
  if (protocol !== 4) return false;
  if (entries || !setupError) assert.equal(gatePassed, true, 'Missing native gate');
  return gatePassed === true;
}

export async function verifyTraceBatch(root: string, prevalidate?: 3 | 4) {
  const sums = await readFile(join(root, 'SHA256SUMS'), 'utf8');
  assert.equal((await hashArtifacts(root)).join(''), sums);
  const pinnedV2 = sha256(sums) === rejectedV2Seal;
  const pinnedV3 = sha256(sums) === rejectedV3Seal;
  assert.ok(
    !prevalidate || pinnedV2 || (prevalidate === 4 && pinnedV3),
    'Not a pinned predecessor',
  );
  const json = async <T>(file: string) => JSON.parse(await readFile(join(root, file), 'utf8')) as T;
  const optional = <T>(file: string) =>
    json<T>(file).catch((err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') return undefined;
      throw err;
    });
  const manifest = await json<{
    source: Source;
    recipeHash: string;
    recipe: unknown;
    plan: unknown;
    root: string;
    cwd: string;
    traceProtocol?: number;
    nonce?: string;
    host: unknown;
    args: string[];
    diagnostic: string;
    limits: unknown;
    gpu: string;
  }>('manifest.json');
  const { source, recipeHash } = manifest;
  assert.ok(await validateSourceArchive(root, source));
  const index = await json<{
    entries: { file: string; sha256: string }[];
    after: Source;
    viteRoot?: string;
    unchanged: boolean;
    complete: boolean;
    setupError?: string;
    nativeGatePassed?: boolean;
  }>('index.json');
  if (manifest.traceProtocol === undefined) {
    // Only the pinned, pre-repair, zero-visit setup archive is grandfathered in.
    assert.equal(sha256(sums), '64b162d72918f5e00b385828584613a07e4f899ea60486f454fa6d3e6de3bba7');
    assert.equal(index.entries.length, 0);
    return { verified: root, historical: true, complete: false, setupError: index.setupError };
  }
  const protocol = manifest.traceProtocol;
  assert.ok(protocol === 2 || protocol === 3 || protocol === approachProtocol);
  assert.equal(manifest.diagnostic, 'approach-trace');
  assert.equal(manifest.gpu, 'hardware');
  assert.deepEqual(manifest.limits, traceLimits);
  assert.deepEqual(manifest.plan, tracePlan);
  assert.deepEqual(manifest.recipe, recipe);
  assert.equal(recipeHash, sha256(JSON.stringify(recipe)));
  assert.equal(manifest.cwd, manifest.root);
  const setupError = (await optional<{ error: string }>('setup-error.json'))?.error;
  assert.equal(index.setupError, setupError);
  const binding = await optional<RootIdentity>('root-identity.json');
  assert.equal(index.viteRoot, binding?.root);
  if (binding)
    assert.deepEqual(binding, { nonce: manifest.nonce, cwd: manifest.root, root: manifest.root });
  const rows: Awaited<ReturnType<typeof inspectAttempt>>[] = [];
  const replay: {
    id: string;
    archiveParity: string[];
    archiveIssues: string[];
    liveCargoParity: string[];
  }[] = [];
  const files = (await readdir(root)).filter((file) => /^(door|reduced)-low-off-/.test(file));
  const accounted = new Set<string>();
  const replayNative = shouldReplayNativeGate(
    protocol,
    index.entries.length,
    index.nativeGatePassed,
    setupError,
  );
  if (index.entries.length || replayNative) {
    const desktop = await json<{ locked: unknown; rootIdentity: RootIdentity }>('desktop.json');
    assert.ok(binding && manifest.nonce && desktopLock(desktop.locked) === 'unlocked');
    assert.deepEqual(desktop.rootIdentity, binding);
    const preflight = await optional<{
      foreground: boolean;
      webgl: number;
      renderer: string;
      vendor: string;
    }>('preflight.json');
    assert.ok(
      preflight?.foreground === true &&
        preflight.webgl === 2 &&
        typeof preflight.renderer === 'string' &&
        typeof preflight.vendor === 'string' &&
        preflight.renderer.includes('RTX 2070') &&
        rendererKind(preflight.renderer, preflight.vendor) === 'hardware',
      'Missing or invalid foreground hardware WebGL2 preflight',
    );
    const frozen = await frozenReference(source);
    assert.deepEqual(manifest.host, frozen.batch.manifest.host);
    assert.deepEqual(manifest.args, frozen.batch.manifest.args);
    verifySourceDiff(await json('r6-source-diff.json'), frozen.differences);
    if (replayNative) {
      for (const { id, name } of tracePlan.slice(0, 2)) {
        const bytes = await readFile(join(root, `native-${name}.json`), 'utf8');
        const visit: Visit = JSON.parse(bytes);
        assert.equal(encodeTraceVisit(visit), bytes);
        const reference = frozen.batch.rows.find((r) => r.visit.id === id)!.visit;
        assert.equal(visit.id, id);
        assert.equal(visit.repeat, 1);
        assert.equal(visit.diagnostic, 'approach-prevalidation');
        assert.equal(visit.capture?.trace, undefined);
        const identity = { sourceDigest: source.digest, recipeHash, unchanged: true };
        assert.deepEqual(encounterWitnessIssues(visit, identity, true), []);
        assert.deepEqual(traceParity(reference, visit, protocol), []);
        assert.deepEqual(await json(`native-${name}.checks.json`), {
          witness: [],
          parity: [],
          absentOwners: [0, 1, 2, 3],
        });
      }
    }
    let previousEnd = 0;
    for (const entry of index.entries) {
      const expected = nextTraceAttempt(rows);
      assert.ok(
        expected && entry.file === `${expected.id}.json`,
        `Invalid trace attempt order: ${entry.file}`,
      );
      const { id } = expected;
      const bytes = await readFile(join(root, entry.file));
      assert.equal(sha256(bytes), entry.sha256);
      const visit = JSON.parse(bytes.toString()) as Visit;
      if (protocol === 4) assert.equal(encodeTraceVisit(visit), bytes.toString());
      assert.equal(visit.id, id);
      assert.deepEqual(visit.host, manifest.host);
      const evidence = await json<AttemptEvidence>(`${id}.evidence.json`);
      previousEnd = verifyAttemptTiming(evidence.timing, previousEnd);
      const { lifecycle, ...alignment } = await json<Record<string, unknown>>(
        `${id}.alignment.json`,
      );
      const result = await inspectAttempt(
        root,
        pinnedV3 ? replayLooseCargoOwners(visit) : visit,
        frozen,
        source,
        recipeHash,
        evidence,
        protocol,
      );
      if (pinnedV2) {
        // V2 ran admission on the live object. Its 181 explicit undefined properties are
        // unrecoverable from visit JSON. Preserve those archived paths only for this sealed
        // batch; rederive the exact numeric camera mismatch and all other evidence/verdicts.
        assert.equal(protocol, 2);
        assert.deepEqual(result.parity, ['start.camera.4']);
        assert.deepEqual(result.issues, ['R6 parity failed']);
        assert.equal(result.stop, false);
        assert.ok(Array.isArray(alignment.parity) && alignment.parity.includes('start.camera.4'));
        result.parity = alignment.parity;
      }
      if (lifecycle !== undefined) {
        assert.ok(Array.isArray(lifecycle));
        assert.equal(lifecycle.at(-1)?.state, result.issues.length ? 'failed' : 'archived');
      } else assert.ok(result.issues.length);
      assert.deepEqual(JSON.parse(JSON.stringify(result)), alignment);
      rows.push(result);
      if (prevalidate) {
        const candidate = await inspectAttempt(
          root,
          visit,
          frozen,
          source,
          recipeHash,
          evidence,
          prevalidate,
        );
        assert.deepEqual(candidate.parity, []);
        assert.deepEqual(candidate.issues, []);
        assert.equal(candidate.stop, false);
        const reference = frozen.batch.rows.find((r) => r.visit.id === candidate.reference)!.visit;
        const liveCargoParity = traceParity(reference, replayLooseCargoOwners(visit), prevalidate);
        requireReplayParity(prevalidate, liveCargoParity);
        replay.push({
          id,
          archiveParity: candidate.parity,
          archiveIssues: candidate.issues,
          liveCargoParity,
        });
      }
      for (const suffix of ['json', 'alignment.json', 'evidence.json', 'trace.json'])
        accounted.add(`${id}.${suffix}`);
    }
  }
  assert.ok(
    files.every((file) => accounted.has(file)),
    'Unindexed trace attempt artifact',
  );
  const state = traceBatchState(
    rows,
    traceSourceStable(source, index.after, binding, manifest.root, manifest.nonce ?? ''),
    setupError,
  );
  assert.equal(index.unchanged, state.unchanged, 'Source stability summary differs');
  assert.equal(index.complete, state.complete, 'Completeness summary differs');
  const report = traceReport(rows, state, setupError, protocol);
  assert.deepEqual(await json('trace-report.json'), JSON.parse(JSON.stringify(report)));
  if (prevalidate) assert.equal(replay.length, 2);
  return {
    verified: root,
    ...report,
    ...(prevalidate && { [`v${prevalidate}Prevalidation`]: replay }),
  };
}

if (import.meta.main) {
  const [, , root, flag] = process.argv;
  assert.ok(root, 'Pass a trace batch directory');
  assert.ok(flag === undefined || flag === '--prevalidate-v3' || flag === '--prevalidate-v4');
  console.log(
    JSON.stringify(await verifyTraceBatch(root, flag && (flag.endsWith('4') ? 4 : 3)), null, 2),
  );
}
