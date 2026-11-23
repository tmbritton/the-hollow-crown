export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface LookupWork {
  cells: number;
  entries: number;
}

const CELL = 4;

function* cells(b: Bounds): Generator<string> {
  for (let x = Math.floor(b.minX / CELL); x <= Math.floor(b.maxX / CELL); x++)
    for (let z = Math.floor(b.minZ / CELL); z <= Math.floor(b.maxZ / CELL); z++) yield `${x},${z}`;
}

export function indexable(b: Bounds): boolean {
  // Bound work for invalid or exceptional external geometry; callers retain the oracle.
  return (
    [b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ].every(Number.isFinite) &&
    Math.max(Math.abs(b.minX), Math.abs(b.maxX), Math.abs(b.minZ), Math.abs(b.maxZ)) < 1e9 &&
    b.maxX >= b.minX &&
    b.maxZ >= b.minZ &&
    b.maxY >= b.minY &&
    ((b.maxX - b.minX) / CELL + 2) * ((b.maxZ - b.minZ) / CELL + 2) <= 4096
  );
}

export function intersects(a: Bounds, b: Bounds): boolean {
  return (
    a.minX <= b.maxX &&
    a.maxX >= b.minX &&
    a.minZ <= b.maxZ &&
    a.maxZ >= b.minZ &&
    a.minY <= b.maxY &&
    a.maxY >= b.minY
  );
}

/** Closed x/z cells with exact world AABB filtering and deterministic contact order. */
export class BoundsGrid<K, V = K> {
  private readonly records = new Map<
    K,
    { bounds: Bounds; order: number; value: V; cells: string[] }
  >();
  private readonly buckets = new Map<string, Set<K>>();
  private memberships = 0;

  set(key: K, bounds: Bounds, order: number, value: V = key as unknown as V): void {
    const previous = this.records.get(key);
    const occupied = [...cells(bounds)];
    if (
      !previous ||
      occupied.length !== previous.cells.length ||
      occupied.some((cell, i) => cell !== previous.cells[i])
    ) {
      this.delete(key);
      for (const cell of occupied) {
        let bucket = this.buckets.get(cell);
        if (!bucket) this.buckets.set(cell, (bucket = new Set()));
        bucket.add(key);
      }
      this.memberships += occupied.length;
    }
    this.records.set(key, { bounds, order, value, cells: occupied });
  }

  delete(key: K): void {
    const old = this.records.get(key);
    if (!old) return;
    for (const cell of old.cells) {
      const bucket = this.buckets.get(cell)!;
      bucket.delete(key);
      if (!bucket.size) this.buckets.delete(cell);
    }
    this.memberships -= old.cells.length;
    this.records.delete(key);
  }

  query(bounds: Bounds, work?: LookupWork, compare?: (a: V, b: V) => number): V[] {
    const seen = new Set<K>();
    const matches = [];
    for (const cell of cells(bounds)) {
      if (work) work.cells++;
      for (const key of this.buckets.get(cell) ?? []) {
        if (work) work.entries++;
        if (seen.has(key)) continue;
        seen.add(key);
        const entry = this.records.get(key)!;
        if (intersects(bounds, entry.bounds)) matches.push(entry);
      }
    }
    return matches
      .sort((a, b) => (compare ? compare(a.value, b.value) : a.order - b.order))
      .map((e) => e.value);
  }

  fork(): BoundsGrid<K, V> {
    const copy = new BoundsGrid<K, V>();
    for (const [key, entry] of this.records) copy.records.set(key, entry);
    for (const [cell, bucket] of this.buckets) copy.buckets.set(cell, new Set(bucket));
    copy.memberships = this.memberships;
    return copy;
  }

  all(compare: (a: V, b: V) => number): V[] {
    return [...this.records.values()].map((entry) => entry.value).sort(compare);
  }

  get counts() {
    return {
      records: this.records.size,
      buckets: this.buckets.size,
      memberships: this.memberships,
    };
  }

  clear(): void {
    this.records.clear();
    this.buckets.clear();
    this.memberships = 0;
  }
}
