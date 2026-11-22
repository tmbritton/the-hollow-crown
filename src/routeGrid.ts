import { heightAt, key } from './world.ts';
import type { DoorEntity, Footprint, Point, Spawn, Tile } from './worldTypes.ts';
import type { NavigationWorld } from './navigation.ts';
import { segmentIntersectsBox } from './generation/placement.ts';

export const CARDINALS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
export const CLEARANCE = 0.32;
export interface RouteCell extends Spawn {
  index: number;
  key: string;
  tile: Tile;
  edges: { next: RouteCell; doors: DoorEntity[] }[];
}

// The graph describes only integer-center cardinal steps. Arbitrary connectors,
// smoothed segments and final approach always use the continuous clearance test.
export class RouteGrid {
  readonly cells = new Map<string, RouteCell>();
  readonly byIndex: RouteCell[] = [];
  private readonly shapes: number[][];
  private readonly floor: { tile: Tile; h: number; solid: boolean; ramp: string }[] = [];
  private readonly doors: { door: DoorEntity; x: number; z: number; axis: string }[];
  constructor(world: NavigationWorld, doors: DoorEntity[]) {
    this.shapes = world.blockers.map((b) => [b.x, b.z, b.w, b.d]);
    this.doors = doors.map((door) => ({ door, x: door.x, z: door.z, axis: door.axis }));
    for (const [id, tile] of world.tiles) {
      const solid = !!tile.blocked || tile.surface === 'lava';
      this.floor.push({ tile, h: tile.h, solid, ramp: tile.ramp ? JSON.stringify(tile.ramp) : '' });
      if (
        !solid &&
        !world.blockers.some(
          (b) =>
            Math.abs(tile.x - b.x) < b.w / 2 + CLEARANCE &&
            Math.abs(tile.z - b.z) < b.d / 2 + CLEARANCE,
        )
      )
        this.cells.set(id, {
          index: this.cells.size,
          x: tile.x,
          z: tile.z,
          h: heightAt(world, tile.x, tile.z)!,
          key: id,
          tile,
          edges: [],
        });
    }
    const doorBoxes = doors.map((door) => ({
      x: door.x,
      z: door.z,
      w: door.axis === 'x' ? 0.35 : 2.95,
      d: door.axis === 'x' ? 2.95 : 0.35,
      door,
    }));
    for (const cell of this.cells.values()) {
      this.byIndex.push(cell);
      const near = (b: Footprint) =>
        Math.abs(cell.x - b.x) <= b.w / 2 + CLEARANCE + 1 &&
        Math.abs(cell.z - b.z) <= b.d / 2 + CLEARANCE + 1;
      const blockers = world.blockers.filter(near),
        gates = doorBoxes.filter(near);
      for (const [dx, dz] of CARDINALS) {
        const next = this.cells.get(key(cell.x + dx, cell.z + dz));
        if (
          !next ||
          Math.abs(cell.tile.h - next.tile.h) > 0.65 ||
          Math.abs(cell.h - next.h) > 0.65 ||
          blockers.some((b) => segmentIntersectsBox(cell, next, b, CLEARANCE))
        )
          continue;
        if (cell.tile.ramp || next.tile.ramp) {
          let previous = cell.h,
            clear = true;
          for (let i = 1; i <= 6; i++) {
            const h = heightAt(world, cell.x + (dx * i) / 6, cell.z + (dz * i) / 6)!;
            if (Math.abs(h - previous) > 0.65) {
              clear = false;
              break;
            }
            previous = h;
          }
          if (!clear) continue;
        }
        cell.edges.push({
          next,
          doors: gates
            .filter((b) => segmentIntersectsBox(cell, next, b, CLEARANCE))
            .map((b) => b.door),
        });
      }
    }
  }
  matches(world: NavigationWorld, doors: DoorEntity[]) {
    if (
      world.tiles.size !== this.floor.length ||
      this.shapes.length !== world.blockers.length ||
      this.doors.length !== doors.length
    )
      return false;
    for (let i = 0; i < doors.length; i++) {
      const p = this.doors[i],
        d = doors[i];
      if (p.door !== d || p.x !== d.x || p.z !== d.z || p.axis !== d.axis) return false;
    }
    for (let i = 0; i < this.shapes.length; i++) {
      const a = this.shapes[i],
        b = world.blockers[i];
      if (a[0] !== b.x || a[1] !== b.z || a[2] !== b.w || a[3] !== b.d) return false;
    }
    let i = 0;
    for (const t of world.tiles.values()) {
      const f = this.floor[i++];
      if (
        f.tile !== t ||
        f.h !== t.h ||
        f.solid !== (!!t.blocked || t.surface === 'lava') ||
        f.ramp !== (t.ramp ? JSON.stringify(t.ramp) : '')
      )
        return false;
    }
    return true;
  }
  get(p: Point) {
    return this.cells.get(key(p.x, p.z));
  }
}

const grids = new WeakMap<NavigationWorld, RouteGrid>();
export function routeGrid(world: NavigationWorld, doors: DoorEntity[]) {
  const existing = grids.get(world);
  if (existing?.matches(world, doors)) return existing;
  const grid = new RouteGrid(world, doors);
  grids.set(world, grid);
  return grid;
}
