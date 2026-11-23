/** Read the six frozen reports in A1 B1 B2 A2 A3 B3 order; no timing or browser I/O. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { distribution, rendererKind } from '../src/cpuMetrics.ts';
import type { CpuRoute, CpuSample } from '../src/cpuMetrics.ts';
import type { CpuProfile } from '../src/cpuProfile.ts';
import {
  comparePair,
  repeatVerdict,
  summarizeRun,
  sumScopes,
  uniqueVisits,
} from './cpu7-report.ts';
import type { Observation } from './cpu7-report.ts';
import { revisions } from './cpu7-study.ts';

type State = ReturnType<CpuProfile['state']>;
interface Run {
  name: string;
  mode: string;
  quality: string;
  live: boolean;
  rendering: boolean;
  frames: number;
  warmup: number;
  initial: State;
  final: State;
  checkpoints: { frame: number; population: State['population']; resources: State['resources'] }[];
  digest: string;
  evidence: unknown;
  heap: unknown;
  samples: CpuSample[];
  routes: CpuRoute[];
}
interface Report {
  identity: {
    recipe: number;
    seed: string;
    revision: string;
    status: string;
    date: string;
    sourceHash: string;
    viewport: { width: number; height: number };
    node: string;
    cpu: string;
    platform: string;
  };
  renderer: { renderer: string; vendor: string };
  browser: string;
  errors: string[];
  results: Run[];
}
const paths = process.argv.slice(2);
assert.equal(
  paths.length,
  6,
  'Supply reports in order A1 B1 B2 A2 A3 B3; use - for missing visits',
);
const side = [0, 1, 1, 0, 0, 1] as const;
const reports = await Promise.all(
  paths.map(async (path, i) => {
    if (path === '-') return null;
    const report = JSON.parse(await readFile(path, 'utf8')) as Report;
    const [revision, hash] = revisions[side[i]!];
    assert.equal(report.identity.revision, revision, path);
    assert.equal(report.identity.sourceHash, hash, path);
    assert.equal(report.identity.status, '', path);
    assert.ok(Number.isFinite(Date.parse(report.identity.date)), `Missing visit date: ${path}`);
    assert.deepEqual(report.errors, [], path);
    return report;
  }),
);
assert.ok(
  uniqueVisits(reports.map((p) => (p ? `${p.identity.revision}/${p.identity.date}` : null))),
  'Duplicate visits',
);

// CPU0 attaches room metadata to positions; CPU7 positions carry only the coordinates.
// Ignore that metadata and revision-specific route charts, not physical differences.
function semanticActors(state: State) {
  return state.actors.map(({ route: _route, p: { x, z, h, heading }, ...actor }) => ({
    ...actor,
    p: { x, z, h, heading },
  }));
}

function semantic(state: State) {
  return JSON.stringify({ population: state.population, actors: semanticActors(state) });
}

function actorChanges(a: State, b: State) {
  const right = new Map(semanticActors(b).map((actor) => [actor.id, actor]));
  return semanticActors(a).flatMap((actor) => {
    const other = right.get(actor.id);
    if (!other) return [{ id: actor.id, fields: ['missing'] }];
    const fields = Object.keys(actor).filter((field) => {
      const key = field as keyof typeof actor;
      return JSON.stringify(actor[key]) !== JSON.stringify(other[key]);
    });
    return fields.length ? [{ id: actor.id, fields }] : [];
  });
}

function observe(p: Report, r: Run): Observation {
  const { recipe, seed, viewport, node, cpu, platform } = p.identity;
  assert.equal(r.samples.length, r.frames);
  if (r.live) assert.equal(r.frames, 72);
  return {
    recipe,
    host: JSON.stringify([platform, cpu, node, p.browser, p.renderer]),
    viewport: `${viewport.width}x${viewport.height}`, // DPR/render dimensions from the untimed browser probe
    quality: r.quality,
    workload: r.name,
    script: JSON.stringify([seed, r.name, r.warmup, r.rendering]),
    mode: r.mode,
    lane: r.live ? 'native' : 'controlled',
    hardware: rendererKind(p.renderer.renderer, p.renderer.vendor) === 'hardware',
    start: { actors: semantic(r.initial), step: r.samples[0]!.step },
    samples: r.samples,
  };
}

function metrics(r: Run, o: Observation) {
  const summarize = (samples: CpuSample[], key: string) => {
    const values = samples.map((s) => s.ms[key]);
    return values.length && values.every((ms) => ms !== undefined && Number.isFinite(ms) && ms >= 0)
      ? distribution(values)
      : null;
  };
  const tick = r.live ? 'main.tick' : 'tick';
  const presentation = r.live ? 'main.presentation' : 'presentation';
  const frame = summarize(r.samples, 'frame');
  const active = r.samples.filter(
    (s) => (s.counts['population.articulated'] ?? 0) + (s.counts['population.separated'] ?? 0) > 0,
  );
  const frozen = r.samples.filter(
    (s) => !active.includes(s) && (s.counts['population.frozen'] ?? 0) > 0,
  );
  const admission = r.samples.filter((s) => (s.counts['alloc.dynamicBodies'] ?? 0) > 0);
  return {
    ...summarizeRun(o),
    steadyCadence: r.live
      ? distribution(r.samples.slice(1).map((s) => s.ms['frame.interval']!))
      : null,
    frame,
    ...(frame === null ? { frameStatus: 'unavailable' } : {}),
    combined: r.mode === 'coarse' ? sumScopes(r.samples, tick, presentation) : null,
    render: summarize(r.samples, 'scene.render'),
    updateSubmission:
      r.mode === 'coarse' && r.rendering
        ? sumScopes(r.samples, tick, presentation, 'scene.render')
        : null,
    active: summarize(active, 'frame'),
    frozen: summarize(frozen, 'frame'),
    admission: summarize(admission, 'frame'), // detailed overhead; compare the coarse frame at the same step
    admissionSteps: admission.map((s) => s.step),
    worst: frame ? [...r.samples].sort((a, b) => b.ms.frame! - a.ms.frame!)[0] : null,
    worstInterval: r.live
      ? [...r.samples].sort((a, b) => b.ms['frame.interval']! - a.ms['frame.interval']!)[0]
      : null,
    worstRoute: r.routes[0] ?? null,
    evidence: r.evidence,
    heap: r.heap,
    resources: [r.initial.resources, r.final.resources],
    population: [r.initial.population, r.final.population],
    checkpoints: r.checkpoints.map(({ frame, population, resources }) => ({
      frame,
      population,
      resources,
    })),
  };
}

const key = (r: Run) => `${r.name}/${r.mode}`;
const catalog = new Map(reports.flatMap((p) => p?.results.map((r) => [key(r), r] as const) ?? []));
assert.ok(catalog.size, 'No observed workloads');
const groups = [...catalog.values()].map((first) => {
  const runs = reports.map((p) => p?.results.find((r) => key(r) === key(first)) ?? null);
  const observations = runs.map((r, i) => (r ? observe(reports[i]!, r) : null));
  const pairs = [
    [0, 1],
    [3, 2],
    [4, 5],
  ] as const;
  const results = observations.map((o, i) => (o ? metrics(runs[i]!, o) : null));
  const eligibility = pairs.map(([a, b]) => {
    const left = observations[a],
      right = observations[b];
    return left && right
      ? comparePair(left, right)
      : { status: 'pending', reason: 'missing visit' };
  });
  const fingerprints = [0, 1].map((s) =>
    runs.flatMap((r, i) => (r && side[i] === s ? [r.digest] : [])),
  );
  const stableFingerprints =
    first.live || fingerprints.some((f) => f.length < 2)
      ? null
      : fingerprints.every((f) => new Set(f).size === 1);
  const matchedEnd = first.live
    ? null
    : pairs.map(([a, b]) =>
        runs[a] && runs[b] ? semantic(runs[a]!.final) === semantic(runs[b]!.final) : null,
      );
  const valid = eligibility.map((p, i) => p.status === 'eligible' && matchedEnd?.[i] !== false);
  const metric = (m: (typeof results)[number]) =>
    first.live ? m?.cadence?.mean : m?.combined?.p50;
  const deltas = pairs.map(([a, b], i) => {
    const left = metric(results[a]!),
      right = metric(results[b]!);
    return valid[i] && left !== undefined && right !== undefined ? right - left : null;
  });
  const invalid =
    eligibility.some((p) => p.status === 'invalid') ||
    stableFingerprints === false ||
    matchedEnd?.includes(false);
  return {
    key: key(first),
    eligibility,
    startActorChanges: pairs.map(([a, b]) =>
      runs[a] && runs[b] ? actorChanges(runs[a]!.initial, runs[b]!.initial) : null,
    ),
    stableFingerprints,
    matchedEnd,
    endpointMatches: valid.filter(Boolean).length,
    // The raw profiler format cannot prove camera, equipment, event or visual parity.
    // This is a timing diagnostic conditional on endpoints, not acceptance.
    exploratoryTiming: invalid
      ? 'invalid'
      : valid.every(Boolean) && first.mode !== 'detailed'
        ? repeatVerdict(
            pairs.map(([a]) => metric(results[a]!) ?? NaN),
            pairs.map(([, b]) => metric(results[b]!) ?? NaN),
          )
        : 'pending',
    delta: first.mode === 'detailed' ? null : deltas,
    results,
  };
});
console.log(
  JSON.stringify({ paths, identities: reports.map((p) => p?.identity ?? null), groups }, null, 2),
);
