export const cases = ['full', 'door', 'reduced'] as const;
export type EncounterCase = (typeof cases)[number];
export const recipe = {
  version: 'encounter-v1',
  revision: 6,
  seed: 'MOURNING-795',
  pack: 'pack:stairs',
  members: ['kobold:stairs:0', 'kobold:stairs:1', 'kobold:stairs:2', 'kobold:stairs:3'],
  retire: [
    'skeleton:crypt:0',
    'skeleton:crypt:1',
    'skeleton:armory:0',
    'skeleton:armory:1',
    'skeleton:throne:0',
    'skeleton:throne:1',
    'skeleton:water:0',
    'skeleton:lava:0',
  ],
  door: { id: 'door-1', x: -1, z: -13, axis: 'z', direction: -1 },
  encounterDoor: { id: 'door-0', x: 14, z: -2, axis: 'x' },
  approach: [
    [0, -2],
    [18, -2],
    [16, -2],
  ],
  doorway: [
    [-1, 0],
    [-1, -15],
  ],
  encounterEdges: [
    { tick: 490, codes: ['KeyW'] },
    { tick: 517, codes: ['KeyA'] },
    { tick: 674, codes: ['KeyA', 'KeyE'] },
    { tick: 740, codes: ['KeyD'] },
    { tick: 761, codes: [] },
  ],
  doorEdges: [
    { tick: 490, codes: ['KeyD'] },
    { tick: 504, codes: ['KeyW'] },
    { tick: 649, codes: ['KeyW', 'KeyE'] },
  ],
  cameraAlpha: Math.PI / 2,
  warmup: 489,
  maxTicks: 960,
  maxCallbacks: 1800,
  deadlineMs: 60_000,
} as const;

const paths = {
  encounter: ['setup', 'approach', 'alerted', 'travelling', 'ranked', 'open', 'resolved'],
  door: ['setup', 'approach', 'opening', 'crossed'],
} as const;
export type Phase = (typeof paths)[keyof typeof paths][number] | 'invalid' | 'trailing';
export interface Fact {
  phase: Phase;
  tick: number;
  callback: number;
  reason?: string;
  evidence?: unknown;
}
export type Witness = { phase: 'setup' } | Fact;
export const terminal = (phase: Phase) => ['invalid', 'resolved', 'crossed'].includes(phase);

export function transition(name: EncounterCase, state: Witness, fact: Fact): Fact {
  const invalid = (reason: string): Fact => ({ ...fact, phase: 'invalid', reason });
  if (terminal(state.phase)) return invalid(`Evidence after ${state.phase}`);
  if (fact.phase === 'invalid') return invalid(fact.reason ?? 'Invalid visit');
  if ('tick' in state && (fact.tick < state.tick || fact.callback < state.callback))
    return invalid('Out-of-order evidence');
  const path: readonly Phase[] = name === 'door' ? paths.door : paths.encounter;
  if (path[path.indexOf(state.phase) + 1] !== fact.phase)
    return invalid(`Unexpected ${fact.phase} after ${state.phase}`);
  return fact;
}

export function witness(name: EncounterCase, facts: readonly Fact[]): Witness {
  return facts.reduce<Witness>((state, fact) => transition(name, state, fact), { phase: 'setup' });
}

export interface Frame {
  entry: number;
  work: number;
  from: number;
  to: number;
  phases: Phase[];
}

export function populationIssue(
  name: EncounterCase,
  alive: readonly string[],
  settled: readonly string[],
  members: readonly string[],
) {
  const retired: readonly string[] = name === 'reduced' ? recipe.retire : [];
  if (members.join() !== recipe.members.join() || !members.every((id) => alive.includes(id)))
    return 'Unexpected target pack';
  if (alive.length !== 24 - retired.length || retired.some((id) => alive.includes(id)))
    return 'Unexpected living population';
  if (settled.length !== retired.length || retired.some((id) => !settled.includes(id)))
    return 'Unsettled or unexpected remains';
  return null;
}

/** Cardinal keys in the pinned +Z camera orientation. Ordinary momentum and collision apply. */
export function movement(x: number, z: number, goal: readonly [number, number]) {
  const dx = goal[0] - x,
    dz = goal[1] - z;
  if (Math.abs(dx) < 0.21 && Math.abs(dz) < 0.21) return [];
  return [
    ...(Math.abs(dx) > 0.21 && Math.abs(dx) >= Math.abs(dz) * 0.38
      ? [dx > 0 ? 'KeyA' : 'KeyD']
      : []),
    ...(Math.abs(dz) > 0.21 && Math.abs(dz) >= Math.abs(dx) * 0.38
      ? [dz > 0 ? 'KeyS' : 'KeyW']
      : []),
  ];
}

export interface AttackWitness {
  actor: string;
  target: string;
  kind: string;
  outcome: 'contact' | 'miss' | 'release' | 'no-release';
  projectile?: string;
}

export interface PointEvidence {
  x: number;
  z: number;
}
export interface SlotEvidence {
  id: string;
  position: PointEvidence;
  slot: PointEvidence;
}
export interface PhysicalEvidence {
  alerted: { pack: string; members: string[]; target: string; positions: SlotEvidence[] };
  travelling: { id: string; from: PointEvidence; to: PointEvidence; slot: PointEvidence };
  ranked: { pack: string; slots: SlotEvidence[] };
  open: { pack: string; gate: string; spear: string; kind: string; target: string };
  resolved: AttackWitness;
  opening: { id: string; angle: number; open: boolean };
  crossed: {
    id: string;
    open: boolean;
    collision: boolean;
    from: PointEvidence;
    to: PointEvidence;
    unawareTicks: number;
  };
}
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value)) : {};
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
function point(value: unknown): PointEvidence | undefined {
  const { x, z } = record(value);
  if (finite(x) && finite(z)) return { x, z };
}
const distance = (a: PointEvidence, b: PointEvidence) => Math.hypot(a.x - b.x, a.z - b.z);
const member = (id: unknown) => recipe.members.some((m) => m === id);
const slotSet = (rows: unknown, ranked: boolean) =>
  Array.isArray(rows) &&
  rows.length === recipe.members.length &&
  rows.every((raw, i) => {
    const row = record(raw),
      p = point(row.position),
      s = point(row.slot);
    return row.id === recipe.members[i] && !!p && !!s && (!ranked || distance(p, s) < 0.13);
  }) &&
  new Set(rows.map((raw) => JSON.stringify(point(record(raw).slot)))).size === rows.length;

/** Parse untrusted archived evidence separately from the live phase reducer. */
export function evidenceIssues(
  name: EncounterCase,
  facts: readonly Fact[],
  frames: readonly Frame[],
) {
  const issues: string[] = [];
  let alert: Record<string, unknown> = {},
    opening: Record<string, unknown> = {};
  for (const f of facts) {
    const e = record(f.evidence),
      frame = frames[f.callback];
    if (
      !Number.isInteger(f.tick) ||
      !frame ||
      !frame.phases.includes(f.phase) ||
      f.tick > frame.to ||
      (f.phase === 'approach'
        ? f.callback !== 0 || f.tick !== recipe.warmup || f.tick !== frame.from
        : f.tick <= frame.from)
    )
      issues.push(`${f.phase}: not in executed tick or start boundary`);
    let valid = false;
    switch (f.phase) {
      case 'approach':
        valid = f.evidence === undefined;
        break;
      case 'alerted':
        alert = e;
        valid =
          e.pack === recipe.pack &&
          e.target === 'player' &&
          Array.isArray(e.members) &&
          e.members.join() === recipe.members.join() &&
          slotSet(e.positions, false);
        break;
      case 'travelling': {
        const a = point(e.from),
          b = point(e.to),
          s = point(e.slot);
        const initial =
          Array.isArray(alert.positions) && alert.positions.find((row) => record(row).id === e.id);
        const p = point(record(initial).position);
        const assigned = point(record(initial).slot);
        valid =
          member(e.id) &&
          !!a &&
          !!b &&
          !!s &&
          !!p &&
          !!assigned &&
          distance(s, assigned) === 0 &&
          distance(a, p) === 0 &&
          distance(a, b) > 0.03 &&
          distance(b, s) < distance(a, s);
        break;
      }
      case 'ranked':
        valid = e.pack === recipe.pack && slotSet(e.slots, true);
        break;
      case 'open':
        opening = e;
        valid =
          e.pack === recipe.pack &&
          member(e.gate) &&
          e.gate !== e.spear &&
          e.spear === recipe.members[3] &&
          e.target === 'player' &&
          (e.kind === 'LONG_THRUST' || e.kind === 'THROW_JAVELIN');
        break;
      case 'resolved':
        valid =
          e.actor === opening.spear &&
          e.target === 'player' &&
          e.kind === opening.kind &&
          (e.kind === 'LONG_THRUST'
            ? (e.outcome === 'contact' || e.outcome === 'miss') && e.projectile === undefined
            : e.kind === 'THROW_JAVELIN' &&
              e.outcome === 'release' &&
              typeof e.projectile === 'string' &&
              e.projectile.length > 0);
        break;
      case 'opening':
        valid =
          e.id === recipe.door.id && finite(e.angle) && Math.abs(e.angle) > 0 && e.open === true;
        break;
      case 'crossed': {
        const from = point(e.from),
          to = point(e.to),
          door = recipe.door;
        valid =
          e.id === door.id &&
          e.open === true &&
          e.collision === false &&
          e.unawareTicks === f.tick &&
          !!from &&
          !!to &&
          (from.z - door.z) * door.direction <= 0 &&
          (to.z - door.z) * door.direction > 0 &&
          distance(from, to) <= 0.2 &&
          Math.abs(from.x + ((to.x - from.x) * (door.z - from.z)) / (to.z - from.z) - door.x) < 0.7;
        break;
      }
    }
    if (!valid) issues.push(`${name}/${f.phase}: missing or invalid physical evidence`);
  }
  return issues;
}
