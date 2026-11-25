export type Bounds = readonly [minX: number, minZ: number, maxX: number, maxZ: number];
export type Occupant = { id: number; bounds: Bounds | null };
export type GroundRay = { x: number; z: number; dx: number; dz: number; length: number };

type Tile = readonly [number, number];

const size = 4;
const pad = 1e-4;
const maxCells = 64;
const key = ([x, z]: Tile) => `${x}:${z}`;

export function membership(bounds: Bounds | null): Tile[] {
  if (!bounds || !bounds.every(Number.isFinite) || bounds[0] > bounds[2] || bounds[1] > bounds[3])
    return [];
  const loX = Math.floor((bounds[0] - pad) / size),
    loZ = Math.floor((bounds[1] - pad) / size);
  const hiX = Math.floor((bounds[2] + pad) / size),
    hiZ = Math.floor((bounds[3] + pad) / size);
  if ((hiX - loX + 1) * (hiZ - loZ + 1) > maxCells) return [];
  const tiles: Tile[] = [];
  for (let x = loX; x <= hiX; x++) for (let z = loZ; z <= hiZ; z++) tiles.push([x, z]);
  return tiles;
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

export function publishDemand(before: readonly Occupant[], after: readonly Occupant[]) {
  const old = new Map(before.map((m) => [m.id, m.bounds]));
  const next = new Map(after.map((m) => [m.id, m.bounds]));
  const ids = [...new Set([...old.keys(), ...next.keys()])];
  const rates = { bounds: ids.length, diff: 0, remove: 0, insert: 0, invalidate: 0 };
  for (const id of ids) {
    const a = old.get(id),
      b = next.get(id);
    const A = new Set(a === undefined ? [] : memberKeys(a));
    const B = new Set(b === undefined ? [] : memberKeys(b));
    const moved = JSON.stringify(a) !== JSON.stringify(b);
    const swept =
      moved && a && b
        ? new Set(
            memberKeys([
              Math.min(a[0], b[0]),
              Math.min(a[1], b[1]),
              Math.max(a[2], b[2]),
              Math.max(a[3], b[3]),
            ]),
          )
        : new Set<string>();
    for (const tile of A) if (!B.has(tile)) rates.remove++;
    for (const tile of B) if (!A.has(tile)) rates.insert++;
    rates.diff +=
      A.size + B.size + [...swept].filter((tile) => !A.has(tile) && !B.has(tile)).length;
    if (moved) rates.invalidate++;
  }
  return { rates };
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
