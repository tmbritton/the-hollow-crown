export type Bounds = readonly [minX: number, minZ: number, maxX: number, maxZ: number];
export type Occupant = { id: number; bounds: Bounds | null };
export type GroundRay = { x: number; z: number; dx: number; dz: number; length: number };

type Tile = readonly [number, number];

const size = 4;
const pad = 1e-4;
const maxCells = 64;
const key = ([x, z]: Tile) => `${x}:${z}`;

export type SweepGap =
  | 'unresolved authored sweep (cached transform)'
  | 'invalid sweep bounds'
  | 'unsafe sweep tile coordinates'
  | 'sweep exceeds 64-cell limit';
type BoundsPair = Bounds | null | undefined;
const validBounds = (bounds: Bounds) =>
  bounds.every(Number.isFinite) && bounds[0] <= bounds[2] && bounds[1] <= bounds[3];
const sameBounds = (a: BoundsPair, b: BoundsPair) =>
  a === b || (!!a && !!b && a.every((value, i) => value === b[i]));

function tileLimits(bounds: Bounds): readonly [number, number, number, number] | SweepGap {
  if (!validBounds(bounds)) return 'invalid sweep bounds';
  const loX = Math.floor((bounds[0] - pad) / size),
    loZ = Math.floor((bounds[1] - pad) / size);
  const hiX = Math.floor((bounds[2] + pad) / size),
    hiZ = Math.floor((bounds[3] + pad) / size);
  if (![loX, loZ, hiX, hiZ].every(Number.isSafeInteger)) return 'unsafe sweep tile coordinates';
  if ((hiX - loX + 1) * (hiZ - loZ + 1) > maxCells) return `sweep exceeds ${maxCells}-cell limit`;
  return [loX, loZ, hiX, hiZ];
}

function enumerateTiles([loX, loZ, hiX, hiZ]: readonly [number, number, number, number]) {
  const tiles: Tile[] = [];
  for (let x = loX; x <= hiX; x++) for (let z = loZ; z <= hiZ; z++) tiles.push([x, z]);
  return tiles;
}

export function membership(bounds: Bounds | null): Tile[] {
  const limits = bounds && tileLimits(bounds);
  return !limits || typeof limits === 'string' ? [] : enumerateTiles(limits);
}

export type SweepDiff =
  | { sweepGap: null; crossed: string[]; diff: number }
  | { sweepGap: SweepGap; crossed: null; diff: null };

function classifySweep(
  before: BoundsPair,
  after: BoundsPair,
  old: ReadonlySet<string>,
  next: ReadonlySet<string>,
): SweepDiff {
  const endpoints = old.size + next.size;
  if (!before || !after || sameBounds(before, after))
    return { sweepGap: null, crossed: [], diff: endpoints };
  const limits =
    validBounds(before) && validBounds(after)
      ? tileLimits([
          Math.min(before[0], after[0]),
          Math.min(before[1], after[1]),
          Math.max(before[2], after[2]),
          Math.max(before[3], after[3]),
        ])
      : 'invalid sweep bounds';
  if (typeof limits === 'string') return { sweepGap: limits, crossed: null, diff: null };
  const crossed = enumerateTiles(limits)
    .map(key)
    .filter((k) => !old.has(k) && !next.has(k));
  return { sweepGap: null, crossed, diff: endpoints + crossed.length };
}

function overlaps([x, z]: Tile, ray: GroundRay) {
  let from = 0,
    to = ray.length;
  for (const [origin, dir, tile] of [
    [ray.x, ray.dx, x],
    [ray.z, ray.dz, z],
  ]) {
    const a = tile * size - pad - origin,
      b = (tile + 1) * size + pad - origin;
    if (dir === 0) {
      if (a > 0 || b < 0) return false;
      continue;
    }
    from = Math.max(from, Math.min(a / dir, b / dir));
    to = Math.min(to, Math.max(a / dir, b / dir));
    if (from > to) return false;
  }
  return true;
}

export function offlineList(occupants: readonly Occupant[], ray: GroundRay) {
  if (![ray.x, ray.z, ray.dx, ray.dz, ray.length].every(Number.isFinite) || ray.length < 0)
    throw new Error('invalid replay ray');
  const cells = new Map<string, { at: Tile; ids: number[] }>();
  const fallback: number[] = [];
  for (const { id, bounds } of occupants) {
    const tiles = membership(bounds);
    if (!tiles.length) fallback.push(id);
    for (const at of tiles) {
      const k = key(at);
      const cell = cells.get(k) ?? { at, ids: [] };
      cell.ids.push(id);
      cells.set(k, cell);
    }
  }
  const tiles = [...cells.values()].filter(({ at }) => overlaps(at, ray));
  const entries = [...fallback, ...tiles.flatMap((c) => c.ids)];
  return {
    ids: [...new Set(entries)].sort((a, b) => a - b),
    tiles: tiles.map((c) => c.at),
    entries,
    // Charge empty traversal too: supercover upper bound over the entire occupied envelope.
    traversal: traversalBound(occupants),
  };
}

function traversalBound(occupants: readonly Occupant[]) {
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const { bounds } of occupants)
    for (const [x, z] of membership(bounds)) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  return Number.isFinite(minX) ? 3 * (maxX - minX + maxZ - minZ + 2) : 0;
}

const memberKeys = (bounds: Bounds | null) => {
  const tiles = membership(bounds);
  return tiles.length ? tiles.map(key) : ['fallback'];
};

// The envelope only grows during a visit. Avoids a scene scan on removal; vacated cells
// remain chargeable empty probes. Slab walking includes both sides of padded boundaries.
export function createOccupancy(seed: readonly Occupant[]) {
  return occupancyIndex(seed);
}

function occupancyIndex(
  seed: readonly Occupant[],
  {
    occupants = new Map<number, Bounds | null>(),
    memberships = new Map<number, string[]>(),
    cells = new Map<string, Set<number>>(),
    fallback = new Set<number>(),
    envelope = [Infinity, Infinity, -Infinity, -Infinity],
  } = {},
) {
  let [minX, minZ, maxX, maxZ] = envelope;
  function insert(id: number, k: string) {
    if (k === 'fallback') fallback.add(id);
    else {
      let bucket = cells.get(k);
      if (!bucket) cells.set(k, (bucket = new Set()));
      bucket.add(id);
      const [x, z] = k.split(':').map(Number);
      minX = Math.min(x, minX);
      minZ = Math.min(z, minZ);
      maxX = Math.max(x, maxX);
      maxZ = Math.max(z, maxZ);
    }
  }
  for (const { id, bounds } of seed) {
    occupants.set(id, bounds);
    const keys = memberKeys(bounds);
    memberships.set(id, keys);
    for (const k of keys) insert(id, k);
  }
  return {
    occupants,
    members: (id: number) => memberships.get(id) ?? [],
    // Reinsertion can change bucket and fallback order without changing occupant order.
    copy: () =>
      occupancyIndex([], {
        occupants: new Map(occupants),
        memberships: new Map([...memberships].map(([id, keys]) => [id, [...keys]])),
        cells: new Map([...cells].map(([k, ids]) => [k, new Set(ids)])),
        fallback: new Set(fallback),
        envelope: [minX, minZ, maxX, maxZ],
      }),
    representation: () =>
      [...cells, ['fallback', fallback] as const].map(([k, ids]) => [k, [...ids]]),
    publish(id: number, bounds: Bounds | null | undefined) {
      const before = occupants.get(id);
      const old = memberships.get(id) ?? [];
      const next = bounds === undefined ? [] : memberKeys(bounds);
      const a = new Set(old),
        b = new Set(next);
      const sweep = classifySweep(before, bounds, a, b);
      let remove = 0,
        add = 0,
        allocated = 0,
        cleaned = 0;
      for (const k of a)
        if (!b.has(k)) {
          remove++;
          if (k === 'fallback') fallback.delete(id);
          else {
            const bucket = cells.get(k)!;
            bucket.delete(id);
            if (!bucket.size) {
              cells.delete(k);
              cleaned++;
            }
          }
        }
      for (const k of b)
        if (!a.has(k)) {
          add++;
          if (k !== 'fallback' && !cells.has(k)) allocated++;
          insert(id, k);
        }
      if (bounds === undefined) {
        occupants.delete(id);
        memberships.delete(id);
      } else {
        occupants.set(id, bounds);
        memberships.set(id, next);
      }
      return {
        old,
        next,
        ...sweep,
        remove,
        insert: add,
        allocated,
        cleaned,
      };
    },
    walk(ray: GroundRay) {
      if (![ray.x, ray.z, ray.dx, ray.dz, ray.length].every(Number.isFinite) || ray.length < 0)
        throw new Error('invalid replay ray');
      const tiles: Tile[] = [];
      const entries = [...fallback];
      let empty = 0;
      let occupied = 0;
      const range = (a: number, b: number) => [
        Math.floor((Math.min(a, b) - pad) / size),
        Math.floor((Math.max(a, b) + pad) / size),
      ];
      const [start, end] = range(ray.x, ray.x + ray.dx * ray.length);
      const loCell = Math.max(minX, start),
        hiCell = Math.min(maxX, end);
      if (hiCell - loCell > 100_000) throw new Error('occupied ray envelope exceeds scratch limit');
      for (let x = loCell; x <= hiCell; x++) {
        const lo = x * size - pad - ray.x;
        const hi = (x + 1) * size + pad - ray.x;
        if (!ray.dx && (lo > 0 || hi < 0)) continue;
        const t0 = ray.dx ? Math.max(0, Math.min(lo / ray.dx, hi / ray.dx)) : 0;
        const t1 = ray.dx ? Math.min(ray.length, Math.max(lo / ray.dx, hi / ray.dx)) : ray.length;
        if (t0 > t1) continue;
        const [first, last] = range(ray.z + ray.dz * t0, ray.z + ray.dz * t1);
        if (Math.min(maxZ, last) - Math.max(minZ, first) + occupied + empty > 100_000)
          throw new Error('occupied ray envelope exceeds scratch limit');
        for (let z = Math.max(minZ, first); z <= Math.min(maxZ, last); z++) {
          const at: Tile = [x, z];
          // Confirm corner and endpoint inclusion with the padded slab predicate.
          if (!overlaps(at, ray)) continue;
          const bucket = cells.get(key(at));
          if (bucket) {
            occupied++;
            tiles.push(at);
            for (const id of bucket) entries.push(id);
          } else empty++;
        }
      }
      const ids = [...new Set(entries)].sort((a, b) => a - b);
      return {
        ids,
        entries,
        tiles,
        reads: {
          empty,
          occupied,
          entries: entries.length,
          duplicates: entries.length - ids.length,
        },
      };
    },
  };
}

export function publishDemand(before: readonly Occupant[], after: readonly Occupant[]) {
  const old = new Map(before.map((m) => [m.id, m.bounds]));
  const next = new Map(after.map((m) => [m.id, m.bounds]));
  const ids = [...new Set([...old.keys(), ...next.keys()])];
  const rates = {
    bounds: ids.length,
    diff: 0 as number | null,
    remove: 0,
    insert: 0,
    invalidate: 0,
  };
  const gaps: { id: number; reason: SweepGap }[] = [];
  for (const id of ids) {
    const a = old.get(id),
      b = next.get(id);
    const A = new Set(a === undefined ? [] : memberKeys(a));
    const B = new Set(b === undefined ? [] : memberKeys(b));
    const sweep = classifySweep(a, b, A, B);
    for (const tile of A) if (!B.has(tile)) rates.remove++;
    for (const tile of B) if (!A.has(tile)) rates.insert++;
    if (sweep.sweepGap !== null) {
      gaps.push({ id, reason: sweep.sweepGap });
      rates.diff = null;
    } else if (rates.diff !== null) rates.diff += sweep.diff;
    if (!sameBounds(a, b)) rates.invalidate++;
  }
  return { rates, gaps };
}

export function validateWindow(
  rows: readonly { from: number; to: number; ticks: number; valid: boolean }[],
  [start, end]: readonly [number, number],
) {
  if (!rows.length || rows[0].from >= start || rows[0].to < start || rows.at(-1)!.to < end)
    return 'incomplete native window';
  for (const [i, row] of rows.entries()) {
    if (!row.valid) return 'target, cue, or foreground mismatch';
    if (row.ticks !== row.to - row.from || row.ticks < 0 || (i && row.from !== rows[i - 1].to))
      return 'native tick gap';
  }
  return null;
}

export function offRayCredit({
  native,
  exhaustive,
  local,
  offRay,
  empty,
}: {
  native: number;
  exhaustive: number;
  local: number;
  offRay: number;
  empty: number;
}) {
  if (![native, exhaustive, local, offRay, empty].every((n) => Number.isFinite(n) && n >= 0))
    throw new Error('missing exclusive pass measurements');
  if (Math.abs(native - exhaustive) > native * 0.1)
    throw new Error('exclusive pass calibration exceeded 10%');
  return Math.max(
    0,
    Math.min(exhaustive - local, offRay - empty, native) - Math.abs(native - exhaustive),
  );
}
