import { BoundsGrid, indexable } from './collisionCandidates.ts';
import type { Bounds } from './collisionCandidates.ts';
import type { ECS, Entity } from './ecs.ts';
import type { BodyLookup, CollisionBody } from './occupancy.ts';
import type { Spawn } from './worldTypes.ts';

export const bodyComponents = ['actor', 'body', 'transform', 'health'] as const;
export type BodyComponent = (typeof bodyComponents)[number];
type Prepared = Readonly<CollisionBody> & {
  readonly id: string;
  readonly order: readonly number[];
};

/** One ECS publication for all motors. Entity identity distinguishes replacement incarnations. */
export class LivingCandidates {
  fullScan = false;
  diagnostics?: {
    candidates: number[];
    cells: number;
    entries: number;
    lookupMs: number;
    maintenanceMs: number;
    fallbacks: number;
  };
  builds = 0;
  private grid = new BoundsGrid<Entity, Prepared>();
  private readonly records = new Map<Entity, Prepared>();
  private readonly unsupported = new Set<Entity>();
  private readonly doorCenters = new BoundsGrid<Entity, Spawn>();
  private readonly doorPositions = new Map<Entity, Spawn>();
  private readonly unsupportedCenters = new Set<Entity>();
  private readonly readers = new Map<BoundsGrid<Entity, Prepared>, number>();
  private retired = false;
  private readonly ecs: ECS;

  constructor(ecs: ECS) {
    this.ecs = ecs;
  }

  private writable() {
    if (this.readers.has(this.grid)) this.grid = this.grid.fork();
    return this.grid;
  }

  publish(entity: Entity): void {
    if (this.retired) return;
    const stats = import.meta.env?.DEV ? this.diagnostics : undefined;
    const start = stats ? performance.now() : 0;
    this.publishGeometry(entity);
    if (stats) stats.maintenanceMs += performance.now() - start;
  }

  private publishGeometry(entity: Entity): void {
    const p = entity.get('transform'),
      shape = entity.get('body');
    const living = entity.has('actor') && (entity.get('health')?.current ?? 0) > 0;
    this.publishDoorCenter(entity, living ? p : undefined);
    if (!p || !shape || !living || entity.has('corpse')) {
      this.removeBody(entity);
      return;
    }
    const old = this.records.get(entity);
    const order = bodyComponents.map((c) => entity.componentOrder(c));
    if (
      old &&
      old.x === p.x &&
      old.z === p.z &&
      old.h === p.h &&
      old.radius === shape.radius &&
      old.height === shape.height &&
      order.every((o, i) => o === old.order[i])
    )
      return;
    const body = Object.freeze({
      id: entity.id,
      order,
      x: p.x,
      z: p.z,
      h: p.h,
      radius: shape.radius,
      height: shape.height,
    });
    const { x, z, h, radius, height } = body;
    const bounds = {
      minX: x - radius,
      maxX: x + radius,
      minZ: z - radius,
      maxZ: z + radius,
      minY: h,
      maxY: h + height,
    };
    this.records.set(entity, body);
    if (indexable(bounds)) {
      this.unsupported.delete(entity);
      this.writable().set(entity, bounds, 0, body);
    } else {
      this.unsupported.add(entity);
      this.writable().delete(entity);
    }
    if (import.meta.env?.DEV || import.meta.env === undefined) this.builds++;
  }

  remove(entity: Entity): void {
    this.publishDoorCenter(entity, undefined);
    this.removeBody(entity);
  }

  private removeBody(entity: Entity): void {
    if (!this.records.delete(entity)) return;
    this.unsupported.delete(entity);
    this.writable().delete(entity);
  }

  private publishDoorCenter(entity: Entity, p?: Spawn): void {
    const old = this.doorPositions.get(entity);
    if (!p) {
      if (this.doorPositions.delete(entity)) this.doorCenters.delete(entity);
      this.unsupportedCenters.delete(entity);
      return;
    }
    if (old && old.x === p.x && old.z === p.z && old.h === p.h) return;
    const { x, z, h } = p;
    const center = { x, z, h };
    const bounds = { minX: x, maxX: x, minZ: z, maxZ: z, minY: h, maxY: h };
    this.doorPositions.set(entity, center);
    if (indexable(bounds)) {
      this.unsupportedCenters.delete(entity);
      this.doorCenters.set(entity, bounds, 0, center);
    } else {
      this.unsupportedCenters.add(entity);
      this.doorCenters.delete(entity);
    }
  }

  doorwayOccupied(bounds: Bounds, inside: (center: Spawn) => boolean): boolean {
    if (this.retired) return false;
    if (this.fullScan || this.unsupportedCenters.size || !indexable(bounds))
      return this.ecs
        .query('actor', 'transform', 'health')
        .some((e) => e.require('health').current > 0 && inside(e.require('transform')));
    return this.doorCenters.query(bounds).some(inside);
  }

  get doorwayCounts() {
    return this.doorCenters.counts;
  }

  has(entity: Entity): boolean {
    return this.records.has(entity);
  }

  private scan(exclude?: string): readonly CollisionBody[] {
    if (this.retired) return [];
    return this.ecs
      .query(...bodyComponents)
      .filter((e) => e.id !== exclude && e.require('health').current > 0 && !e.has('corpse'))
      .map((e) => ({ ...e.require('transform'), ...e.require('body') }));
  }

  private comparator() {
    const index = this.ecs.querySource(bodyComponents);
    return (a: Prepared, b: Prepared) => a.order[index] - b.order[index];
  }

  snapshot(exclude?: string): readonly CollisionBody[] {
    if (this.fullScan) return this.scan(exclude);
    return [...this.records.values()].filter((r) => r.id !== exclude).sort(this.comparator());
  }

  withView<T>(exclude: string | undefined, read: (lookup: BodyLookup) => T): T {
    const stats = import.meta.env?.DEV ? this.diagnostics : undefined;
    if (this.fullScan || this.unsupported.size) {
      const start = stats ? performance.now() : 0;
      const bodies = this.scan(exclude);
      if (stats) {
        stats.lookupMs += performance.now() - start;
        if (!this.fullScan) stats.fallbacks++;
      }
      return read(() => {
        stats?.candidates.push(bodies.length);
        return bodies;
      });
    }
    const grid = this.grid,
      compare = this.comparator();
    this.readers.set(grid, (this.readers.get(grid) ?? 0) + 1);
    try {
      return read((bounds: Bounds) => {
        // Outlier queries still use this publication, not a fresh read of ECS.
        const start = stats ? performance.now() : 0;
        const local = indexable(bounds);
        const candidates = (local ? grid.query(bounds, stats, compare) : grid.all(compare)).filter(
          (r) => r.id !== exclude,
        );
        if (stats) {
          if (!local) stats.fallbacks++;
          stats.candidates.push(candidates.length);
          stats.lookupMs += performance.now() - start;
        }
        return candidates;
      });
    } finally {
      const remaining = this.readers.get(grid)! - 1;
      if (remaining) this.readers.set(grid, remaining);
      else this.readers.delete(grid);
    }
  }

  get counts() {
    return this.grid.counts;
  }

  dispose(): void {
    this.retired = true;
    this.writable().clear();
    this.records.clear();
    this.unsupported.clear();
    this.doorCenters.clear();
    this.doorPositions.clear();
    this.unsupportedCenters.clear();
    this.diagnostics = undefined;
  }
}
