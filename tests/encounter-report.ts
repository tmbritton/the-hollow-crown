import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { distribution, rendererKind } from '../src/cpuMetrics.ts';
import { cases, evidenceIssues, populationIssue, recipe, witness } from '../src/encounterRecipe.ts';
import type { EncounterCase, Frame } from '../src/encounterRecipe.ts';
import type { EncounterCapture } from '../src/encounterCapture.ts';
import type { CpuMode } from '../src/cpuProfile.ts';
import { sha256, validateSourceArchive } from './encounter-source.ts';
import type { sourceManifest } from './encounter-source.ts';
import { teardownIssue, type TrialPageEvidence } from './targeted-shader-page.ts';

export type Capture = Awaited<ReturnType<EncounterCapture['run']>>;
export interface Visit {
  id: string;
  name: EncounterCase;
  quality: 'low' | 'high';
  mode: CpuMode;
  repeat: number;
  pair?: PairStamp;
  sourceDigest: string;
  recipeHash: string;
  host: unknown;
  graphics?: {
    renderer: string;
    vendor: string;
    webgl: number;
    foreground: boolean;
    browserVersion: string;
    hardware: boolean;
    gpuSystem: unknown;
  };
  capture?: Capture;
  error?: string;
  diagnostic?: 'approach-trace' | 'approach-prevalidation';
}

export interface PairStamp {
  id: string;
  batch: string;
  started: number;
  ended: number;
}
export function pairOrderIssue(a: PairStamp | undefined, b: PairStamp | undefined, repeat: number) {
  if (
    !a ||
    !b ||
    !a.id ||
    a.id !== b.id ||
    !a.batch ||
    !b.batch ||
    a.batch === b.batch ||
    ![a.started, a.ended, b.started, b.ended].every(Number.isSafeInteger) ||
    a.started >= a.ended ||
    b.started >= b.ended ||
    !(repeat === 2 ? b.ended < a.started : a.ended < b.started)
  )
    return 'Missing pair identity or AB/BA/AB order';
  return null;
}

const stats = (values: number[]) =>
  values.length
    ? {
        ...distribution(values),
        p99: [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.99) - 1],
        overBudget: values.filter((n) => n > 16.7).length / values.length,
      }
    : null;

export function summarizeFrames(launch: number, frames: readonly Frame[]) {
  const intervals = frames.slice(1).map((next, callback) => {
    const f = frames[callback]!;
    return {
      callback,
      interval: next.entry - f.entry,
      work: f.work,
      phases: f.phases,
      from: f.from,
      to: f.to,
      nextTicks: next.to - next.from,
    };
  });
  const max = (rows: typeof intervals) =>
    rows.reduce<(typeof intervals)[number] | null>(
      (best, row) => (!best || row.interval > best.interval ? row : best),
      null,
    );
  const active = frames.filter((f) => !f.phases.includes('trailing'));
  const key = (f: { phases: Frame['phases'] }) =>
    f.phases.length === 1 ? f.phases[0]! : `mixed:${f.phases.join('+')}`;
  const elapsed = intervals.reduce((sum, row) => sum + row.interval, 0);
  return {
    startupMs: frames.length ? frames[0]!.entry - launch : null,
    fps: elapsed > 0 ? (1000 * intervals.length) / elapsed : null,
    interval: stats(intervals.map((r) => r.interval)),
    callback: stats(active.map((f) => f.work)),
    ticks: Array.from({ length: 6 }, (_, n) => active.filter((f) => f.to - f.from === n).length),
    worst: max(intervals),
    trailing: frames.find((f) => f.phases.includes('trailing')) ?? null,
    phases: Object.fromEntries(
      [...new Set(active.map(key))].map((phase) => {
        const rows = intervals.filter((r) => key(r) === phase);
        const callbacks = active.filter((f) => key(f) === phase);
        return [
          phase,
          {
            interval: stats(rows.map((r) => r.interval)),
            callback: stats(callbacks.map((f) => f.work)),
            durationMs: rows.reduce((sum, r) => sum + r.interval, 0),
            simulationTicks: callbacks.reduce((sum, f) => sum + f.to - f.from, 0),
            worst: max(rows),
          },
        ];
      }),
    ),
  };
}

export function startDifferences(reference: unknown, candidate: unknown, path = ''): string[] {
  if (reference === candidate) return [];
  if (
    !reference ||
    !candidate ||
    typeof reference !== 'object' ||
    typeof candidate !== 'object' ||
    Array.isArray(reference) !== Array.isArray(candidate)
  )
    return [path || '(root)'];
  const a: Record<string, unknown> = Object.fromEntries(Object.entries(reference));
  const b: Record<string, unknown> = Object.fromEntries(Object.entries(candidate));
  if (Array.isArray(reference) && Array.isArray(candidate)) {
    a.length = reference.length;
    b.length = candidate.length;
  }
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .sort()
    .flatMap((key) =>
      Object.hasOwn(a, key) && Object.hasOwn(b, key)
        ? startDifferences(a[key], b[key], path ? `${path}.${key}` : key)
        : [path ? `${path}.${key}` : key],
    );
}

type Effect = 'improved' | 'regressed' | 'ambiguous' | 'unchanged';
const spread = (a: number[]) => Math.max(...a) - Math.min(...a);
export function repeatEffect(reference: number[], candidate: number[]): Effect {
  if (
    reference.length !== 3 ||
    candidate.length !== 3 ||
    [...reference, ...candidate].some((n) => !Number.isFinite(n) || n < 0)
  )
    return 'ambiguous';
  const deltas = reference.map((value, i) => candidate[i]! - value);
  if (deltas.every((d) => d === 0)) return 'unchanged';
  const margin = Math.max(spread(reference), spread(candidate));
  const median = [...deltas].sort((a, b) => a - b)[1]!;
  if (deltas.every((d) => d < 0) && median < -margin) return 'improved';
  if (deltas.every((d) => d > 0) && median > margin) return 'regressed';
  return 'ambiguous';
}

export function trialDecision(
  matched: boolean,
  parent: Effect,
  frozen: Effect,
  safeguards: Effect[],
) {
  if (!matched) return 'inconclusive';
  if (parent !== 'improved' || frozen !== 'improved' || safeguards.includes('regressed'))
    return 'reject';
  // Unclear increases are a hold, not a declaration that no work was displaced.
  if (!safeguards.length || safeguards.includes('ambiguous')) return 'inconclusive';
  return 'retain';
}

type Source = Awaited<ReturnType<typeof sourceManifest>>;
type BatchIdentity = {
  source: Source;
  recipeHash: string;
  host: unknown;
  args: string[];
  gpu: string;
  root: string;
  batchId: string;
  trialHash?: string;
};
type ArtifactIndex = {
  entries: { file: string; sha256: string }[];
  after: Source;
  unchanged: boolean;
  viteRoot: string;
};

// Only these exact manifest/index bytes authorize the legacy trailing snapshot. The index pins
// every visit; the source archive must reconstruct as usual. Directory names confer no trust.
const frozenR6 = {
  manifest: '563ac6b995e576fde2cae37b6857492ad72a3c58d175320f3f1dfac19630cb3a',
  index: 'a12424b1d3b5ea3ffd46a7f9689cefa7e8cdf03ff1a64beb8a211de17984d4e9',
};
const endTickMismatch = 'End snapshot tick mismatch';

export function attributionIssue(frames: readonly Frame[], samples: unknown) {
  if (
    !Array.isArray(samples) ||
    samples.length !== frames.length - 1 ||
    samples.some(
      (s, i) =>
        s?.step !== frames[i]?.from ||
        !s.ms ||
        !s.counts ||
        typeof s.ms['main.presentation'] !== 'number' ||
        typeof s.ms['scene.render'] !== 'number' ||
        s.counts['calls.main.presentation'] !== 1 ||
        s.counts['calls.scene.render'] !== 1 ||
        [...Object.values(s.ms), ...Object.values(s.counts)].some(
          (n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0,
        ),
    )
  )
    return 'Incomplete or misaligned attribution samples';
  return null;
}

function instrumentationIssue(
  mode: Exclude<CpuMode, 'off'>,
  attribution: NonNullable<Capture['attribution']>,
) {
  // These counters come from the detailed scene-node and door getter hooks, not the
  // shared native callback scopes. Route records, when present, must also agree.
  const observed = (key: string) =>
    attribution.samples.some(({ counts }) => (counts[key] ?? 0) > 0);
  const matrices = observed('matrices.compute');
  const doors = observed('doors.open');
  if (mode === 'detailed' && !(matrices && doors)) return 'Missing detailed instrumentation';
  if (mode === 'coarse' && (matrices || doors)) return 'Unexpected detailed instrumentation';
  if (
    !Array.isArray(attribution.routes) ||
    attribution.routes.some((r) =>
      mode === 'coarse'
        ? r?.input?.reason !== 'coarse-unpartitioned'
        : r?.input?.reason !== 'steer-replan' &&
          r?.input?.reason !== 'floor-input' &&
          r?.input?.reason !== 'direct',
    )
  )
    return 'Route instrumentation differs from mode';
  return null;
}

export function trialRegistrationIssue(hash: string, captures: (string | undefined)[]) {
  return hash && captures.length && captures.every((h) => h === hash)
    ? null
    : 'Trial contract was not frozen for each capture';
}

export function callbackTickBudget(previousTicks: number, trailingWithCarry: boolean) {
  // The terminal tick interrupts the accumulator drain. At most two 80 ms
  // updates plus <1 fixed tick of carry fit in the terminal/trailing pair.
  return trailingWithCarry && previousTicks >= 1 && previousTicks <= 5 ? 10 - previousTicks : 5;
}

export function encounterWitnessIssues(
  v: Visit,
  identity: { sourceDigest: string; recipeHash: string; unchanged: boolean },
  terminalCarry = false,
): string[] {
  const capture = v.capture;
  const errors = v.error ? [v.error] : [];
  if (!identity.unchanged || v.sourceDigest !== identity.sourceDigest)
    errors.push('Source identity incomplete or changed');
  if (v.recipeHash !== identity.recipeHash || v.recipeHash !== sha256(JSON.stringify(recipe)))
    errors.push('Recipe differs');
  const gl = v.graphics;
  if (
    !gl?.hardware ||
    gl.webgl !== 2 ||
    !gl.foreground ||
    rendererKind(gl.renderer, gl.vendor) !== 'hardware'
  )
    errors.push('Not foreground hardware WebGL2');
  if (!capture?.start || !capture.end) return [...errors, capture?.reason ?? 'Missing boundaries'];
  if (capture.name !== v.name || capture.mode !== v.mode) errors.push('Cell identity differs');
  if ((v.mode === 'off') === !!capture.attribution) errors.push('Wrong attribution lane');
  if (capture.reason) errors.push(capture.reason);
  if (!Number.isInteger(v.repeat) || v.repeat < 1 || v.repeat > 3) errors.push('Invalid repeat');
  if (capture.start.state.detail?.authority.steps !== recipe.warmup)
    errors.push('Warmup tick mismatch');
  if (
    capture.start.quality.shadows !== (v.quality === 'high') ||
    capture.start.quality.glow !== (v.quality === 'high')
  )
    errors.push('Quality settings mismatch');
  const { alive, settled } = capture.start.population;
  const issue = populationIssue(v.name, alive, settled, capture.start.members);
  if (issue) errors.push(issue);
  const end = witness(v.name, capture.facts);
  if (
    end.phase !== (v.name === 'door' ? 'crossed' : 'resolved') ||
    end.phase !== capture.witness.phase
  )
    errors.push(`Invalid witness: ${end.phase}`);
  const frames = capture.frames;
  if (v.mode !== 'off') {
    const issue =
      attributionIssue(frames, capture.attribution?.samples) ??
      (capture.attribution && instrumentationIssue(v.mode, capture.attribution));
    if (issue) errors.push(issue);
  }
  errors.push(...evidenceIssues(v.name, capture.facts, frames));
  const edges = v.name === 'door' ? recipe.doorEdges : recipe.encounterEdges;
  if (
    startDifferences(
      capture.input,
      edges.filter((e) => 'tick' in end && e.tick <= end.tick),
    ).length
  )
    errors.push('Fixed input edge sequence differs');
  if (
    frames.length < 2 ||
    !Number.isFinite(capture.launch) ||
    frames[0]?.from !== recipe.warmup ||
    frames.at(-1)?.phases.join() !== 'trailing' ||
    frames.some(
      (f, i) =>
        !Number.isFinite(f.entry) ||
        !Number.isFinite(f.work) ||
        f.work < 0 ||
        !Number.isInteger(f.from) ||
        !Number.isInteger(f.to) ||
        f.to - f.from < 0 ||
        f.to - f.from >
          callbackTickBudget(
            i ? frames[i - 1]!.to - frames[i - 1]!.from : 0,
            terminalCarry && i === frames.length - 1 && 'tick' in end && f.from === end.tick,
          ) ||
        !f.phases.length ||
        (i
          ? f.entry <= frames[i - 1]!.entry || f.from !== frames[i - 1]!.to
          : f.entry < capture.launch),
    )
  )
    errors.push('Invalid or truncated callback sequence');
  let phase = 'approach';
  for (const [i, frame] of frames.entries()) {
    if (i === frames.length - 1) break;
    const tags = new Set([phase]);
    for (const fact of capture.facts.filter((f) => f.callback === i)) {
      tags.add(fact.phase);
      phase = fact.phase;
    }
    if ([...tags].join() !== frame.phases.join()) errors.push(`Callback ${i} phase tags differ`);
  }
  if ('tick' in end && (frames.at(-2)?.to !== end.tick || frames.at(-2) !== frames[end.callback]))
    errors.push('Terminal evidence does not end active window');
  if (!('tick' in end) || capture.end.state.detail?.authority?.steps !== end.tick)
    errors.push(endTickMismatch);
  return errors;
}

export function eligibility(v: Visit, identity: Parameters<typeof encounterWitnessIssues>[1]) {
  const issues = encounterWitnessIssues(v, identity);
  if (v.diagnostic || v.capture?.trace) issues.push('Tracing-only visit is ineligible as outcome');
  return issues;
}

const gameplay = (v: Visit) =>
  v.capture?.facts.map((f) => {
    // Keep exact ticks and physical evidence (including member positions/slots). RAF grouping
    // and a newly allocated projectile's transient ID are not gameplay differences.
    const { callback: _callback, evidence, ...rest } = f;
    if (f.phase === 'resolved' && evidence && typeof evidence === 'object') {
      const { projectile: _projectile, ...physical } = Object.fromEntries(Object.entries(evidence));
      return { ...rest, evidence: physical };
    }
    return { ...rest, evidence };
  });

export function matchedDifferences(a: Visit, b: Visit, compare = startDifferences) {
  return compare(
    {
      name: a.name,
      quality: a.quality,
      mode: a.mode,
      recipe: a.recipeHash,
      host: a.host,
      graphics: a.graphics,
      start: a.capture?.start,
      input: a.capture?.input,
      gameplay: gameplay(a),
    },
    {
      name: b.name,
      quality: b.quality,
      mode: b.mode,
      recipe: b.recipeHash,
      host: b.host,
      graphics: b.graphics,
      start: b.capture?.start,
      input: b.capture?.input,
      gameplay: gameplay(b),
    },
  );
}

export function commonStartDifferences(a: Visit, b: Visit) {
  const reduced = a.name !== b.name;
  function common(v: Visit) {
    const s = v.capture?.start,
      authority = s?.state.detail?.authority;
    if (!s || !authority) return null;
    const retire: readonly string[] = reduced ? recipe.retire : [];
    return {
      ...authority,
      actors: authority.actors.filter((actor) => !retire.includes(actor.id)),
      population: s.population.alive.filter((id) => !retire.includes(id)),
      active: s.population.active.filter((id) => !retire.includes(id)),
      members: s.members,
      camera: s.camera.map((value) => Math.round(value * 1e9) / 1e9),
      visible: s.population.visible.filter((id) => !retire.includes(id)),
      display: s.display,
      quality: s.quality,
      objectives: s.objectives,
      input: v.capture?.input,
    };
  }
  return startDifferences(common(a), common(b));
}

const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8'));
export async function openBatch(path: string) {
  const [manifestBytes, indexBytes] = await Promise.all([
    readFile(join(path, 'manifest.json')),
    readFile(join(path, 'index.json')),
  ]);
  const manifest: BatchIdentity = JSON.parse(manifestBytes.toString());
  const index: ArtifactIndex = JSON.parse(indexBytes.toString());
  const sourceDigest = manifest.source.digest;
  const unchanged =
    index.unchanged &&
    !!manifest.root &&
    index.viteRoot === manifest.root &&
    !startDifferences(manifest.source, index.after).length &&
    (await validateSourceArchive(path, manifest.source));
  const frozen =
    unchanged &&
    sha256(manifestBytes) === frozenR6.manifest &&
    sha256(indexBytes) === frozenR6.index;
  const rows = await Promise.all(
    index.entries.map(async ({ file, sha256: expected }) => {
      if (!/^[\w-]+\.json$/.test(file)) throw new Error(`Invalid artifact name: ${file}`);
      const bytes = await readFile(join(path, file));
      if (sha256(bytes) !== expected) throw new Error(`Artifact hash differs: ${file}`);
      const visit: Visit = JSON.parse(bytes.toString());
      const errors = eligibility(visit, {
        sourceDigest,
        recipeHash: manifest.recipeHash,
        unchanged,
      });
      const legacyEnd = frozen && errors.includes(endTickMismatch);
      if (legacyEnd) errors.splice(errors.indexOf(endTickMismatch), 1);
      if (
        file !== `${visit.id}.json` ||
        visit.id !== `${visit.name}-${visit.quality}-${visit.mode}-${visit.repeat}` ||
        (visit.pair && visit.pair.batch !== manifest.batchId) ||
        startDifferences(visit.host, manifest.host).length
      )
        errors.push('Visit identity differs from batch');
      return {
        file: join(path, file),
        sha256: expected,
        visit,
        errors,
        legacyEnd,
        metrics:
          !errors.length && visit.mode === 'off' && visit.capture
            ? summarizeFrames(visit.capture.launch, visit.capture.frames)
            : null,
      };
    }),
  );
  const trialHash =
    manifest.trialHash &&
    sha256(await readFile(join(path, 'trial-registration.json'))) === manifest.trialHash
      ? manifest.trialHash
      : undefined;
  return { path, manifest, rows, frozen, trials: [trialHash] };
}

type Batch = Awaited<ReturnType<typeof openBatch>>;
async function aggregate(spec: string): Promise<Batch> {
  const batches = await Promise.all(spec.split(',').map(openBatch));
  const first = batches[0]!;
  if (
    new Set(batches.map((b) => b.manifest.batchId)).size !== batches.length ||
    batches.some(
      (b) =>
        b.manifest.recipeHash !== first.manifest.recipeHash ||
        b.manifest.source.head !== first.manifest.source.head ||
        b.manifest.source.digest !== first.manifest.source.digest ||
        b.manifest.gpu !== first.manifest.gpu ||
        startDifferences(b.manifest.host, first.manifest.host).length ||
        startDifferences(b.manifest.args, first.manifest.args).length,
    )
  )
    throw new Error('Batches must be unique, same revision, recipe and host');
  return {
    ...first,
    path: spec,
    rows: batches.flatMap((b) => b.rows),
    trials: batches.flatMap((b) => b.trials),
  };
}

const key = (v: Visit) => `${v.name}/${v.quality}/${v.mode}`;
const matrix = cases.flatMap((name) =>
  ['low', 'high'].flatMap((quality) =>
    ['off', 'coarse', 'detailed'].map((mode) => `${name}/${quality}/${mode}`),
  ),
);
const repetitions = (values: number[]) =>
  values.length ? { values, min: Math.min(...values), max: Math.max(...values) } : null;
type ReportRows = Batch['rows'];
function crossModeMatches(rows: ReportRows) {
  return matrix
    .filter((cell) => !cell.endsWith('/off'))
    .flatMap((cell) =>
      [1, 2, 3].map((repeat) => {
        const offCell = cell.replace(/\/[^/]+$/, '/off');
        const eligible = (keyName: string) =>
          rows.filter(
            ({ visit, errors }) =>
              key(visit) === keyName && visit.repeat === repeat && !errors.length,
          );
        const off = eligible(offCell),
          attributed = eligible(cell);
        return {
          cell,
          offCell,
          repeat,
          differences:
            off.length === 1 && attributed.length === 1
              ? startDifferences(
                  gameplay(off[0]!.visit),
                  gameplay(attributed[0]!.visit),
                  'gameplay',
                )
              : ['Missing, duplicate or ineligible cross-mode visit'],
        };
      }),
    );
}
export function report(batch: { rows: ReportRows }, modeMatches = crossModeMatches(batch.rows)) {
  return matrix.map((cell) => {
    const rows = batch.rows.filter((r) => key(r.visit) === cell);
    const good = rows.filter((r) => !r.errors.length);
    const mismatches = good.flatMap(({ visit: a }) =>
      batch.rows.flatMap(({ visit: b, errors }) => {
        if (
          a === b ||
          errors.length ||
          a.quality !== b.quality ||
          (a.name !== b.name && (a.name === 'door' || b.name === 'door'))
        )
          return [];
        return commonStartDifferences(a, b).map((path) => `${a.id} vs ${b.id}: ${path}`);
      }),
    );
    mismatches.push(
      ...modeMatches
        .filter((m) => cell === m.cell || cell === m.offCell)
        .flatMap((m) =>
          m.differences.map((path) => `${m.offCell} vs ${m.cell} repeat ${m.repeat}: ${path}`),
        ),
    );
    const ms = good.flatMap((r) => (r.metrics ? [r.metrics] : []));
    const timingSpread = (pick: (m: (typeof ms)[number]) => number | undefined | null) =>
      repetitions(ms.flatMap((m) => pick(m) ?? []));
    return {
      cell,
      complete:
        good.length === 3 &&
        new Set(good.map((r) => r.visit.repeat)).size === 3 &&
        !mismatches.length,
      mismatches: [...new Set(mismatches)],
      repeats: rows.map(({ file, sha256, errors, metrics, visit, legacyEnd }) => ({
        file,
        sha256,
        errors,
        metrics,
        endSnapshot: legacyEnd
          ? 'Frozen R6 legacy: after trailing callback; not terminal state'
          : undefined,
        attribution:
          !errors.length && visit.capture?.attribution
            ? 'See raw inclusive scopes and counters; not GPU time'
            : undefined,
      })),
      spread: {
        fps: timingSpread((m) => m.fps),
        callbackP95: timingSpread((m) => m.callback?.p95),
        callbackP99: timingSpread((m) => m.callback?.p99),
        intervalP95: timingSpread((m) => m.interval?.p95),
        intervalP99: timingSpread((m) => m.interval?.p99),
        callbackShare: timingSpread((m) => m.callback?.overBudget),
        intervalShare: timingSpread((m) => m.interval?.overBudget),
        callbackMax: timingSpread((m) => m.callback?.max),
        intervalMax: timingSpread((m) => m.interval?.max),
        phases: Object.fromEntries(
          [...new Set(ms.flatMap((m) => Object.keys(m.phases)))].map((phase) => [
            phase,
            {
              durationMs: timingSpread((m) => m.phases[phase]?.durationMs),
              intervalMax: timingSpread((m) => m.phases[phase]?.interval?.max),
              callbackMax: timingSpread((m) => m.phases[phase]?.callback?.max),
            },
          ]),
        ),
      },
    };
  });
}

function comparison(candidate: Batch, reference: Batch) {
  const rows = candidate.rows.filter((r) => r.visit.mode === 'off');
  const pairs = rows.map((after) => {
    const matches = reference.rows.filter(
      (r) => key(r.visit) === key(after.visit) && r.visit.repeat === after.visit.repeat,
    );
    const before = matches[0];
    return {
      before,
      after,
      differences:
        matches.length !== 1 || !before || before.errors.length || after.errors.length
          ? ['Missing or ineligible pair']
          : [
              pairOrderIssue(before.visit.pair, after.visit.pair, after.visit.repeat),
              ...matchedDifferences(before.visit, after.visit),
            ].filter(Boolean),
    };
  });
  const stamps = pairs.map((p) => p.after.visit.pair?.id);
  const matched =
    [candidate, reference].every((b) => report(b).every((c) => c.complete)) &&
    pairs.length === 18 &&
    new Set(stamps).size === 18 &&
    pairs.every((p) => !p.differences.length) &&
    cases.every((name) =>
      ['low', 'high'].every((quality) => {
        const cell = pairs
          .filter((p) => p.after.visit.name === name && p.after.visit.quality === quality)
          .sort((a, b) => a.after.visit.repeat - b.after.visit.repeat);
        return cell.every(
          (p, i) =>
            !i ||
            Math.max(cell[i - 1]!.before!.visit.pair!.ended, cell[i - 1]!.after.visit.pair!.ended) <
              Math.min(p.before!.visit.pair!.started, p.after.visit.pair!.started),
        );
      }),
    );
  return { reference: reference.path, matched, pairs };
}

type Trial = {
  name: EncounterCase;
  quality: Visit['quality'];
  phase: string;
  parent: string;
  frozen: string;
  candidate: string;
  hypothesis: string;
  boundary: string;
  invariant: string;
  stopRule: string;
};
export function exactPhaseMetrics(m: ReturnType<typeof summarizeFrames>, phase: string) {
  const p = phase === 'all' ? m : m.phases[phase];
  if (!p) return [];
  return [
    p.interval?.max,
    p.interval?.p95,
    p.interval?.p99,
    p.interval?.overBudget,
    p.callback?.max,
    p.callback?.p95,
    p.callback?.p99,
    p.callback?.overBudget,
    ...('durationMs' in p ? [p.durationMs, p.simulationTicks] : []),
  ];
}
function evaluateTrial(trial: Trial, cmp: ReturnType<typeof comparison>) {
  if (!cmp.matched) return { primary: 'ambiguous' as const, safeguards: [] };
  const checks: {
    cell: string;
    phase: string;
    metric: string;
    before: number[];
    after: number[];
    effect: Effect;
  }[] = [];
  const phases = {
    full: ['approach', 'alerted', 'travelling', 'ranked', 'open'],
    reduced: ['approach', 'alerted', 'travelling', 'ranked', 'open'],
    door: ['approach', 'opening'],
  };
  let primary: Effect = 'ambiguous';
  for (const name of cases)
    for (const quality of ['low', 'high'] as const) {
      const pairs = cmp.pairs
        .filter((p) => p.after.visit.name === name && p.after.visit.quality === quality)
        .sort((a, b) => a.after.visit.repeat - b.after.visit.repeat);
      const observed = new Set(
        pairs.flatMap((p) => [
          ...Object.keys(p.before!.metrics!.phases),
          ...Object.keys(p.after.metrics!.phases),
        ]),
      );
      for (const phase of new Set(['all', ...phases[name], ...observed])) {
        const labels = [
          'interval max',
          'interval p95',
          'interval p99',
          'interval share',
          'callback max',
          'callback p95',
          'callback p99',
          'callback share',
          ...(phase === 'all' ? [] : ['duration', 'ticks']),
        ];
        for (const [i, metric] of labels.entries()) {
          const before = pairs.map((p) => exactPhaseMetrics(p.before!.metrics!, phase)[i] ?? NaN);
          const after = pairs.map((p) => exactPhaseMetrics(p.after.metrics!, phase)[i] ?? NaN);
          const effect = repeatEffect(before, after);
          if (name === trial.name && quality === trial.quality && phase === trial.phase && i === 0)
            primary = effect;
          else
            checks.push({
              cell: `${name}/${quality}`,
              phase,
              metric,
              before,
              after,
              effect:
                before.every(Number.isFinite) &&
                after.every((v, i) => v <= before[i]!) &&
                effect === 'ambiguous'
                  ? 'unchanged'
                  : effect,
            });
        }
      }
    }
  return { primary, safeguards: checks };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [path, parentPath, frozenPath, trialPath] = process.argv.slice(2);
  if (!path || !!parentPath !== !!frozenPath)
    throw new Error(
      'Usage: encounter-report.ts <candidate-dirs[::candidate-frozen-dirs]> [parent-dirs frozen-dirs [trial.json]] (comma-separated directory lists)',
    );
  const [parentCandidate, frozenCandidate] = path.split('::');
  const batch = await aggregate(parentCandidate!);
  const modeMatches = crossModeMatches(batch.rows);
  const cells = report(batch, modeMatches);
  const complete = cells.every((c) => c.complete);
  const second = frozenCandidate ? await aggregate(frozenCandidate) : batch;
  const refs =
    parentPath && frozenPath
      ? await Promise.all([aggregate(parentPath), aggregate(frozenPath)])
      : undefined;
  const comparisons = refs
    ? [comparison(batch, refs[0]!), comparison(second, refs[1]!)]
    : undefined;
  const trial = trialPath ? await readJson<Trial>(trialPath) : undefined;
  const checks = trial && comparisons ? comparisons.map((c) => evaluateTrial(trial, c)) : undefined;
  const preregistered =
    !!trial &&
    !!refs &&
    [trial.hypothesis, trial.boundary, trial.invariant, trial.stopRule].every(
      (x) => typeof x === 'string' && x.trim().length,
    ) &&
    !trialRegistrationIssue(sha256(await readFile(trialPath!)), [
      ...batch.trials,
      ...second.trials,
      ...refs.flatMap((b) => b.trials),
    ]) &&
    trial.candidate === batch.manifest.source.digest &&
    trial.candidate === second.manifest.source.digest &&
    trial.parent === refs[0]!.manifest.source.digest &&
    trial.frozen === refs[1]!.manifest.source.digest;
  const decision = checks
    ? trialDecision(
        preregistered && comparisons!.every((c) => c.matched),
        checks[0]!.primary,
        checks[1]!.primary,
        checks.flatMap((c) => c.safeguards.map((s) => s.effect)),
      )
    : 'not run';
  console.log(
    JSON.stringify(
      {
        path,
        complete,
        cells,
        modeMatches,
        comparisons: comparisons?.map((c) => ({
          ...c,
          pairs: c.pairs.map((p) => ({
            before: p.before?.file,
            after: p.after.file,
            pair: p.after.visit.pair?.id,
            differences: p.differences,
          })),
        })),
        trial: trial && { registration: trial, decision, checks },
        claim: complete
          ? 'Complete baseline matrix; no speedup inferred'
          : 'Incomplete; no performance comparison',
      },
      null,
      2,
    ),
  );
}
interface TargetedSideAdmission {
  errors: readonly string[];
  parity: readonly string[];
  endpoints: readonly number[];
  generations: readonly number[];
  cleanup: boolean;
  teardown?: readonly TrialPageEvidence[];
}

export function targetedPairIssue(a: TargetedSideAdmission, b: TargetedSideAdmission) {
  for (const [i, side] of [a, b].entries()) {
    if (!side.cleanup || side.errors.length) return `side ${i}: cleanup or page errors`;
    const [ordinary, r6] = side.teardown ?? [];
    if (side.teardown?.length !== 2 || ordinary?.label !== 'ordinary' || r6?.label !== 'R6')
      return `side ${i}: missing teardown for ordinary or R6`;
    for (const page of [ordinary, r6]) {
      const issue = teardownIssue(page);
      if (issue) return `side ${i}: ${page.label}: ${issue}`;
    }
    if (side.parity.length) return `side ${i}: ${side.parity.join(', ')}`;
    if (side.endpoints.length !== 3 || side.endpoints.some((v) => !Number.isFinite(v) || v <= 0))
      return `side ${i}: missing or invalid startup endpoint`;
    if (JSON.stringify(side.generations) !== '[1,1,2,2]') return `side ${i}: mixed generation`;
  }
  return null;
}

type TargetedPair = {
  repeat: number;
  reference: 'parent' | 'frozen';
  issue: string | null;
  startup: readonly number[];
  displacement: readonly number[];
  approach: readonly number[];
  ordinaryW: readonly number[];
};

export function targetedSeparation(values: readonly (readonly number[])[], floor: number) {
  if (
    values.length !== 3 ||
    values.some((r) => r.length !== 2 || r.some((v) => !Number.isFinite(v)))
  )
    return false;
  const range = (i: number) =>
    Math.max(...values.map((v) => v[i]!)) - Math.min(...values.map((v) => v[i]!));
  const deltas = values.map(([a, b]) => a! - b!).sort((a, b) => a - b);
  return deltas[0]! > 0 && deltas[1]! >= floor && deltas[1]! > Math.max(range(0), range(1));
}

export function targetedDecision(
  rows: readonly TargetedPair[],
  controls: 'pending' | 'incomplete' | 'regressed' | 'pass',
) {
  if (rows.some((p) => !p.issue && p.startup.some((delta) => delta > 100))) return 'reject';
  if (
    rows.length !== 6 ||
    rows.some(
      (p) => p.issue || p.startup.length !== 3 || p.startup.some((v) => !Number.isFinite(v)),
    )
  )
    return 'incomplete';
  for (const reference of ['parent', 'frozen']) {
    const group = rows.filter((p) => p.reference === reference);
    if (
      group
        .map((p) => p.repeat)
        .sort()
        .join() !== '1,2,3'
    )
      return 'incomplete';
    for (const metric of ['displacement', 'approach'] as const)
      if (
        !targetedSeparation(
          group.map((p) => p[metric]),
          8,
        )
      )
        return 'reject';
    if (
      targetedSeparation(
        group.map((p) => [...p.ordinaryW].reverse()),
        0,
      )
    )
      return 'reject';
  }
  return { pending: 'controls', incomplete: 'incomplete', regressed: 'reject', pass: 'retain' }[
    controls
  ];
}
