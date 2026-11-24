import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  summarizeFrames,
  repeatEffect,
  startDifferences,
  trialDecision,
  pairOrderIssue,
  attributionIssue,
  trialRegistrationIssue,
  exactPhaseMetrics,
  eligibility,
  report,
  targetedPairIssue,
  targetedDecision,
} from './encounter-report.ts';
import type { Capture, Visit } from './encounter-report.ts';
import { recipe } from '../src/encounterRecipe.ts';
import type { Frame, Fact } from '../src/encounterRecipe.ts';
import { sha256 } from './encounter-source.ts';

test('targeted admission considers close errors, native parity, endpoints and generations', () => {
  const side = {
    errors: [],
    parity: [],
    endpoints: [100, 90, 60],
    generations: [1, 1, 2, 2],
    cleanup: true,
    teardown: ['ordinary', 'R6'].map((label) => ({
      label,
      errors: [],
      closed: true,
      origin: 123,
      journal: [
        { type: 'pagehide', trusted: true, hidden: false, persisted: false, time: 50, origin: 123 },
        {
          type: 'visibilitychange',
          trusted: true,
          hidden: true,
          persisted: null,
          time: 51,
          origin: 123,
        },
      ],
    })),
  };
  assert.equal(targetedPairIssue(side, side), null);
  for (const change of [
    { errors: ['after final frame'] },
    { parity: ['start.pose'] },
    { endpoints: [100, 90] },
    { generations: [1, 1, 2, 3] },
    { cleanup: false },
    { teardown: undefined },
    { teardown: side.teardown.slice(1) },
    { teardown: [{ ...side.teardown[0], journal: [] }, side.teardown[1]] },
    {
      teardown: [
        { ...side.teardown[0], journal: [...side.teardown[0]!.journal].reverse() },
        side.teardown[1],
      ],
    },
  ])
    assert.ok(targetedPairIssue(side, { ...side, ...change }));
});

test('targeted primary enforces the inclusive startup cap, strict spread, sign and control gates', () => {
  const pair = (repeat: number, reference: 'parent' | 'frozen') => ({
    repeat,
    reference,
    issue: null,
    startup: [100, 100, 100],
    displacement: [40, 32],
    approach: [41, 33],
    ordinaryW: [20, 20],
  });
  const rows = [1, 2, 3].flatMap((i) => [pair(i, 'parent'), pair(i, 'frozen')]);
  assert.equal(targetedDecision(rows, 'pending'), 'controls');
  assert.equal(targetedDecision(rows, 'incomplete'), 'incomplete');
  assert.equal(targetedDecision(rows, 'regressed'), 'reject');
  assert.equal(targetedDecision(rows, 'pass'), 'retain');
  assert.equal(targetedDecision(rows.slice(1), 'pass'), 'incomplete');
  for (const change of [
    { startup: [0, 0, 101] },
    { displacement: [48, 40] },
    { approach: [41, 41] },
  ]) {
    assert.equal(
      targetedDecision([{ ...rows[0]!, ...change }, ...rows.slice(1)], 'pass'),
      'reject',
    );
  }
});

const frames: Frame[] = [
  { entry: 300, work: 40, from: 10, to: 10, phases: ['approach'] },
  { entry: 350, work: 7, from: 10, to: 15, phases: ['approach', 'alerted'] },
  { entry: 366, work: 1, from: 15, to: 15, phases: ['trailing'] },
];

test('outer cadence joins the preceding work and phase to the following catch-up', () => {
  const r = summarizeFrames(200, frames);
  assert.equal(r.startupMs, 100);
  assert.equal(r.fps, 2000 / 66);
  assert.deepEqual(r.ticks, [1, 0, 0, 0, 0, 1]);
  assert.deepEqual(r.worst, {
    callback: 0,
    interval: 50,
    work: 40,
    phases: ['approach'],
    from: 10,
    to: 10,
    nextTicks: 5,
  });
  assert.equal(r.phases['mixed:approach+alerted']?.interval?.p99, 16);
});

test('attribution must cover every non-trailing callback in order and no others', () => {
  const sample = (step: number) => ({
    step,
    ms: { 'main.presentation': 0, 'scene.render': 1 },
    counts: { 'calls.main.presentation': 1, 'calls.scene.render': 1 },
  });
  assert.ok(
    attributionIssue(frames, [
      { step: 10, ms: {}, counts: {} },
      { step: 10, ms: {}, counts: {} },
    ]),
  );
  assert.equal(attributionIssue(frames, [sample(10), sample(10)]), null);
  assert.ok(attributionIssue(frames, [sample(10)]));
  assert.ok(attributionIssue(frames, [sample(10), sample(15)]));
  assert.ok(attributionIssue(frames, [sample(10), sample(10), sample(15)]));
});

test('preregistration cannot be supplied only after capture and mixed intervals stay separate', () => {
  assert.equal(trialRegistrationIssue('contract', ['contract', 'contract']), null);
  assert.ok(trialRegistrationIssue('contract', ['contract', undefined]));
  const m = summarizeFrames(200, frames);
  assert.equal(exactPhaseMetrics(m, 'approach')[0], 50);
  assert.equal(exactPhaseMetrics(m, 'mixed:approach+alerted')[0], 16);
  assert.deepEqual(exactPhaseMetrics(m, 'alerted'), []);
});

test('empty and tied statistics do not invent samples', () => {
  assert.equal(summarizeFrames(0, []).interval, null);
  assert.equal(summarizeFrames(0, [frames[0]!]).fps, null);
  assert.equal(
    summarizeFrames(0, [frames[0]!, frames[1]!, { ...frames[2]!, entry: 400 }]).worst?.callback,
    0,
  );
});

test('canonical comparison names changed authoritative leaves', () => {
  assert.deepEqual(
    startDifferences(
      { doors: [{ collision: true }], npc: 8 },
      { npc: 9, doors: [{ collision: false }] },
    ),
    ['doors.0.collision', 'npc'],
  );
});

test('paired decision needs separation against both references and rejects displaced work', () => {
  assert.equal(repeatEffect([10, 20, 30], [9, 19, 29]), 'ambiguous');
  assert.equal(repeatEffect([100, 20, 20], [9, 20, 20]), 'ambiguous');
  assert.equal(repeatEffect([30, 31, 32], [9, 10, 11]), 'improved');
  assert.equal(trialDecision(false, 'improved', 'improved', []), 'inconclusive');
  assert.equal(trialDecision(true, 'improved', 'improved', []), 'inconclusive');
  assert.equal(trialDecision(true, 'improved', 'improved', ['regressed']), 'reject');
  assert.equal(trialDecision(true, 'improved', 'improved', ['unchanged']), 'retain');
});

test('pairs require shared ID, distinct batches and AB/BA/AB capture order', () => {
  const a = { id: 'pair-2', batch: 'a', started: 20, ended: 30 };
  const b = { id: 'pair-2', batch: 'b', started: 5, ended: 10 };
  assert.equal(pairOrderIssue(a, b, 2), null);
  assert.ok(pairOrderIssue(a, b, 1));
  assert.ok(pairOrderIssue(a, { ...b, id: 'other' }, 2));
  assert.ok(pairOrderIssue(a, { ...b, ended: 21 }, 2));
});

const identity = {
  sourceDigest: 'fixture',
  recipeHash: sha256(JSON.stringify(recipe)),
  unchanged: true,
};

function fullVisit(mode: Visit['mode'], repeat = 1) {
  const t = recipe.warmup;
  const population = {
    alive: [...recipe.members, ...Array.from({ length: 20 }, (_, i) => `other:${i}`)],
    settled: [],
    active: [],
    visible: [],
  };
  const snapshot = (steps: number): NonNullable<Capture['start']> => ({
    population,
    members: [...recipe.members],
    camera: [],
    display: [],
    quality: { shadows: false, glow: false, samples: 1, scaling: 1 },
    objectives: [],
    state: {
      authority: 'fixture',
      presentation: 'fixture',
      actors: [],
      population: {
        living: 24,
        inactive: 0,
        synthetic: 0,
        articulated: 0,
        separated: 0,
        frozen: 0,
        bodies: 0,
        constraints: 0,
        statics: 0,
      },
      resources: { actors: 25, entities: 25, meshes: 0, nodes: 0, materials: 0, textures: 0 },
      detail: {
        authority: {
          steps,
          seed: recipe.seed,
          time: steps / 60,
          actors: [],
          doors: [],
          projectiles: [],
          particles: [],
          cargo: [],
          squads: [],
          objectives: undefined,
          discoveries: undefined,
        },
        poses: [],
      },
    },
  });
  const positions = recipe.members.map((id, z) => ({
    id,
    position: { x: 0, z },
    slot: { x: 1, z },
  }));
  const slots = positions.map((p) => ({ ...p, position: { ...p.slot } }));
  const kind = 'THROW_JAVELIN';
  const spear = recipe.members[3];
  const facts = [
    { phase: 'approach', tick: t, callback: 0 },
    {
      phase: 'alerted',
      tick: t + 1,
      callback: 0,
      evidence: { pack: recipe.pack, target: 'player', members: recipe.members, positions },
    },
    {
      phase: 'travelling',
      tick: t + 2,
      callback: 0,
      evidence: {
        id: recipe.members[0],
        from: positions[0]!.position,
        to: { x: 0.1, z: 0 },
        slot: positions[0]!.slot,
      },
    },
    { phase: 'ranked', tick: t + 3, callback: 0, evidence: { pack: recipe.pack, slots } },
    {
      phase: 'open',
      tick: t + 4,
      callback: 0,
      evidence: { pack: recipe.pack, gate: recipe.members[0], spear, target: 'player', kind },
    },
    {
      phase: 'resolved',
      tick: t + 5,
      callback: 0,
      evidence: {
        actor: spear,
        target: 'player',
        kind,
        outcome: 'release',
        projectile: `projectile:${mode}`,
      },
    },
  ] as const satisfies readonly Fact[];
  // Different native callback grouping, same gameplay. The trailing callback can advance.
  const idle: Frame[] =
    mode === 'off' ? [] : [{ entry: 1, work: 0, from: t, to: t, phases: ['approach'] }];
  const frames: Frame[] = [
    ...idle,
    { entry: 2, work: 1, from: t, to: t + 5, phases: facts.map((f) => f.phase) },
    { entry: 3, work: 0, from: t + 5, to: t + 6, phases: ['trailing'] },
  ];
  const capture: Capture = {
    name: 'full',
    mode,
    launch: 0,
    warmCallbacks: 1,
    start: snapshot(t),
    end: snapshot(t + 5),
    frames,
    facts: facts.map((f) => ({ ...f, callback: f.phase === 'approach' ? 0 : idle.length })),
    input: [{ tick: t + 1, codes: ['KeyW'] }],
    attacks: [],
    witness: { ...facts[5], callback: idle.length },
    reason: undefined,
    attribution:
      mode === 'off'
        ? undefined
        : {
            samples: frames.slice(0, -1).map((f) => ({
              step: f.from,
              ms: { 'main.presentation': 0, 'scene.render': 1 },
              counts: {
                'calls.main.presentation': 1,
                'calls.scene.render': 1,
                ...(mode === 'detailed' ? { 'matrices.compute': 10, 'doors.open': 5 } : {}),
              },
            })),
            routes: [],
            replay: null,
          },
  };
  const visit = {
    ...identity,
    id: `full-low-${mode}-${repeat}`,
    name: 'full',
    quality: 'low',
    mode,
    repeat,
    host: null,
    capture,
    graphics: {
      vendor: 'NVIDIA',
      renderer: 'GeForce RTX',
      foreground: true,
      hardware: true,
      webgl: 2,
      browserVersion: 'fixture',
      gpuSystem: null,
    },
  } satisfies Visit;
  return { visit, slots };
}

test('mode parity ignores callback and projectile IDs but detects a still-valid rank position', () => {
  const visits = [1, 2, 3].flatMap((repeat) =>
    (['off', 'coarse', 'detailed'] as const).map((mode) => fullVisit(mode, repeat)),
  );
  const cells = () =>
    report({
      rows: visits.map(({ visit }) => ({
        file: visit.id,
        visit,
        sha256: '',
        errors: eligibility(visit, identity),
        metrics: null,
        legacyEnd: false,
      })),
    }).filter((c) => c.cell.startsWith('full/low/'));
  assert.equal(cells().filter((c) => c.complete).length, 3);
  const changed = visits[2]!;
  changed.slots[0]!.position.x += 0.01; // Still well within physical rank readiness tolerance.
  assert.deepEqual(eligibility(changed.visit, identity), []);
  const detailed = cells().find((c) => c.cell === 'full/low/detailed')!;
  assert.equal(detailed.complete, false);
  assert.match(detailed.mismatches.join(), /gameplay\.3\.evidence\.slots\.0\.position\.x/);
});

test('mode labels cannot make aligned coarse instrumentation detailed', () => {
  const { visit } = fullVisit('coarse');
  assert.deepEqual(eligibility(visit, identity), []);
  assert.deepEqual(eligibility(fullVisit('detailed').visit, identity), []);
  visit.mode = visit.capture.mode = 'detailed';
  assert.deepEqual(eligibility(visit, identity), ['Missing detailed instrumentation']);
});

test('each new capture needs a snapshot at the terminal tick, not after trailing work', () => {
  for (const mode of ['off', 'coarse', 'detailed'] as const) {
    const { visit } = fullVisit(mode);
    assert.deepEqual(eligibility(visit, identity), []);
    const end = visit.capture.end!;
    end.state.detail!.authority.steps = visit.capture.frames.at(-1)!.to;
    assert.deepEqual(eligibility(visit, identity), ['End snapshot tick mismatch']);
  }
});
