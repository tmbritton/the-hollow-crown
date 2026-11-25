import type { Hit } from './cursor-evidence.ts';

export const scalingRecipe = {
  origin: [0, 1, 0],
  direction: [1, 0, 0],
  door: { exposed: 4, blocked: 0 },
  roomStepZ: 64,
  warmup: 60,
  queries: 240,
  order: [
    [0, 10],
    [10, 0],
    [0, 10],
  ],
} as const;

const hitDistanceTolerance = 1e-5;

export function sameHit(a: Hit, b: Hit) {
  return (
    a.kind === b.kind &&
    (a.kind === 'floor' ? b.kind === 'floor' : 'id' in b && a.id === b.id) &&
    a.mesh === b.mesh &&
    a.instance === b.instance &&
    (a.distance === undefined
      ? b.distance === undefined
      : b.distance !== undefined && Math.abs(a.distance - b.distance) <= hitDistanceTolerance)
  );
}

function expectedWork(rooms: 0 | 10, blocked: boolean) {
  return {
    visits: 18 + 21 * rooms,
    syncs: 1 + rooms,
    admitted: 8 + 8 * rooms,
    instanceAdmitted: 6,
    meshExact: 6 + 7 * rooms,
    instanceExact: 2,
    batchBounds: 2 + rooms,
    meshMiss: (blocked ? 2 : 3) + 7 * rooms,
    instanceMiss: 0,
  };
}

type ScalingVisit = {
  rooms: 0 | 10;
  ownerBuildMs: number;
  samples: { write: number; hit: Hit; work: ReturnType<typeof expectedWork>; ms: number }[];
  meanMs: number;
  p95Ms: number;
};
export type ScalingReport = { recipe: typeof scalingRecipe; pairs: ScalingVisit[][] };

export function scalingTiming(times: number[]) {
  const ordered = [...times].sort((a, b) => a - b);
  return {
    meanMs: ordered.reduce((sum, ms) => sum + ms, 0) / ordered.length,
    p95Ms: ordered[Math.ceil(ordered.length * 0.95) - 1],
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const hasLength = (value: unknown, length: number): value is unknown[] =>
  Array.isArray(value) && value.length === length;
const finiteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const positiveTime = (value: unknown): value is number => finiteNumber(value) && value > 0;

function matchesVector(input: unknown, expected: readonly number[]) {
  return hasLength(input, expected.length) && expected.every((value, i) => input[i] === value);
}

function validateRecipe(input: unknown): string | null {
  const recipe = scalingRecipe;
  if (!isRecord(input)) return 'missing or malformed scaling recipe';
  for (const key of ['origin', 'direction'] as const) {
    if (!matchesVector(input[key], recipe[key])) return `mismatched scaling recipe ${key}`;
  }
  if (!isRecord(input.door)) return 'missing or malformed scaling recipe door';
  for (const key of ['exposed', 'blocked'] as const) {
    if (input.door[key] !== recipe.door[key]) return `mismatched scaling recipe door.${key}`;
  }
  for (const key of ['roomStepZ', 'warmup', 'queries'] as const) {
    if (input[key] !== recipe[key]) return `mismatched scaling recipe ${key}`;
  }
  const { order } = input;
  if (!hasLength(order, recipe.order.length)) return 'missing or malformed scaling recipe order';
  for (const [p, pair] of recipe.order.entries()) {
    if (!matchesVector(order[p], pair)) return `mismatched scaling recipe order in pair ${p}`;
  }
  return null;
}

function matchesScalingHit(hit: unknown, blocked: boolean) {
  if (!isRecord(hit)) return false;
  const { kind, id, mesh, instance, distance } = hit;
  // Exact literal comparisons also enforce the string and integer field types.
  const expectedSurface = blocked
    ? kind === 'floor' && mesh === 'door' && instance === -1
    : kind === 'object' && id === 'shrine' && mesh === 'shrine-batch' && instance === 1;
  return (
    expectedSurface &&
    finiteNumber(distance) &&
    Math.abs(distance - (blocked ? 2.5 : 5.5)) <= hitDistanceTolerance
  );
}

// Read only required fields, and use the trusted recipe to bound all iteration.
export function validateScaling(report: unknown): string | null {
  if (!isRecord(report)) return 'missing or malformed scaling report';
  const recipeError = validateRecipe(report.recipe);
  if (recipeError) return recipeError;
  const recipe = scalingRecipe;
  const { pairs } = report;
  if (!hasLength(pairs, recipe.order.length)) return 'missing or malformed scaling pairs';
  for (let p = 0; p < recipe.order.length; p++) {
    const pair = pairs[p];
    if (!hasLength(pair, recipe.order[p].length)) return `missing or malformed scaling pair ${p}`;
    for (let v = 0; v < recipe.order[p].length; v++) {
      const visit = pair[v];
      const rooms = recipe.order[p][v];
      if (!isRecord(visit)) return `missing or malformed scaling visit in ${p}/${v}`;
      if (visit.rooms !== rooms) return `mismatched scaling rooms in ${p}/${v}`;
      for (const key of ['ownerBuildMs', 'meanMs', 'p95Ms'] as const) {
        if (!positiveTime(visit[key])) return `invalid scaling ${key} in ${p}/${v}`;
      }
      const { samples } = visit;
      if (!hasLength(samples, recipe.queries))
        return `missing or malformed scaling samples in ${p}/${v}`;
      const times: number[] = [];
      for (let i = 0; i < recipe.queries; i++) {
        const row = samples[i];
        if (!isRecord(row)) return `missing or malformed scaling sample in ${p}/${v}/${i}`;
        const blocked = i % 2 !== 0;
        if (row.write !== (blocked ? recipe.door.blocked : recipe.door.exposed))
          return `mismatched scaling write in ${p}/${v}/${i}`;
        if (!matchesScalingHit(row.hit, blocked)) return `mismatched scaling hit in ${p}/${v}/${i}`;
        if (!isRecord(row.work)) return `missing or malformed scaling work in ${p}/${v}/${i}`;
        for (const [key, expected] of Object.entries(expectedWork(rooms, blocked))) {
          if (row.work[key] !== expected) return `mismatched scaling work.${key} in ${p}/${v}/${i}`;
        }
        if (!finiteNumber(row.ms) || row.ms < 0)
          return `invalid scaling query timing in ${p}/${v}/${i}`;
        times.push(row.ms);
      }
      const { meanMs, p95Ms } = scalingTiming(times);
      if (meanMs !== visit.meanMs || p95Ms !== visit.p95Ms)
        return `inconsistent scaling timings in ${p}/${v}`;
    }
  }
  return null;
}
