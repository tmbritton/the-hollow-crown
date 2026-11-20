import type { Actor } from '../actors.ts';
import type { ECS } from '../ecs.ts';
import type { NavigationWorld } from '../navigation.ts';
import { heightAt, tileAt } from '../world.ts';
import type { DoorEntity, Footprint, Tile } from '../worldTypes.ts';
import type { ActionRig } from './actions.ts';
import type { PoseBuffer, XYZ } from './types.ts';
import type { TailBounds } from './tail.ts';

const indexes = new WeakMap<NavigationWorld, Map<string, Footprint[]>>();
function index(world: NavigationWorld): Map<string, Footprint[]> {
  const cached = indexes.get(world);
  if (cached) return cached;
  const cells = new Map<string, Footprint[]>();
  for (const box of world.blockers)
    for (let x = Math.floor(box.x - box.w / 2); x <= Math.floor(box.x + box.w / 2); x++)
      for (let z = Math.floor(box.z - box.d / 2); z <= Math.floor(box.z + box.d / 2); z++) {
        const key = `${x},${z}`,
          list = cells.get(key) ?? [];
        list.push(box);
        cells.set(key, list);
      }
  indexes.set(world, cells);
  return cells;
}
function overlaps(a: TailBounds, b: TailBounds): boolean {
  if (
    !(
      a.minX < b.maxX &&
      a.maxX > b.minX &&
      a.minY < b.maxY &&
      a.maxY > b.minY &&
      a.minZ < b.maxZ &&
      a.maxZ > b.minZ
    )
  )
    return false;
  if (!a.corners || !b.corners) return true;
  const ac = a.corners,
    bc = b.corners;
  const separated = (ux: number, uy: number, uz: number, vx: number, vy: number, vz: number) => {
    const x = uy * vz - uz * vy,
      y = uz * vx - ux * vz,
      z = ux * vy - uy * vx;
    if (x * x + y * y + z * z < 1e-18) return false;
    let minA = Infinity,
      maxA = -Infinity,
      minB = Infinity,
      maxB = -Infinity;
    for (let i = 0; i < 24; i += 3) {
      const pa = ac[i] * x + ac[i + 1] * y + ac[i + 2] * z;
      const pb = bc[i] * x + bc[i + 1] * y + bc[i + 2] * z;
      minA = Math.min(minA, pa);
      maxA = Math.max(maxA, pa);
      minB = Math.min(minB, pb);
      maxB = Math.max(maxB, pb);
    }
    return maxA <= minB || maxB <= minA;
  };
  // Parallelepiped SAT also handles nonuniform scale under a rotated hierarchy.
  for (const c of [ac, bc])
    for (const [i, j] of [
      [3, 6],
      [6, 12],
      [12, 3],
    ])
      if (
        separated(
          c[i] - c[0],
          c[i + 1] - c[1],
          c[i + 2] - c[2],
          c[j] - c[0],
          c[j + 1] - c[1],
          c[j + 2] - c[2],
        )
      )
        return false;
  for (const i of [3, 6, 12])
    for (const j of [3, 6, 12])
      if (
        separated(
          ac[i] - ac[0],
          ac[i + 1] - ac[1],
          ac[i + 2] - ac[2],
          bc[j] - bc[0],
          bc[j + 1] - bc[1],
          bc[j + 2] - bc[2],
        )
      )
        return false;
  return true;
}
const empty = (oriented = false): TailBounds => ({
  minX: 0,
  minY: 0,
  minZ: 0,
  maxX: 0,
  maxY: 0,
  maxZ: 0,
  ...(oriented ? { corners: new Float64Array(24) } : {}),
});
function box(out: TailBounds, matrix: Float64Array, offset: number, center: XYZ, size: XYZ): void {
  const c = [0, 0, 0],
    extent = [0, 0, 0];
  for (let row = 0; row < 3; row++) {
    c[row] = matrix[offset + 12 + row];
    for (let axis = 0; axis < 3; axis++) {
      c[row] += matrix[offset + axis * 4 + row] * center[axis];
      extent[row] += (Math.abs(matrix[offset + axis * 4 + row]) * size[axis]) / 2;
    }
  }
  out.minX = c[0] - extent[0];
  out.maxX = c[0] + extent[0];
  out.minY = c[1] - extent[1];
  out.maxY = c[1] + extent[1];
  out.minZ = c[2] - extent[2];
  out.maxZ = c[2] + extent[2];
  let k = 0;
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1])
        for (let row = 0; row < 3; row++)
          out.corners![k++] =
            c[row] +
            ((matrix[offset + row] * size[0]) / 2) * x +
            ((matrix[offset + 4 + row] * size[1]) / 2) * y +
            ((matrix[offset + 8 + row] * size[2]) / 2) * z;
}

/** Render-only conservative AABBs. Static obstacles are indexed once per world; doors retain
 * their live collision state. No navigation/occupancy mutation or whole-scene matrix traversal. */
export class TailClearance {
  private world?: NavigationWorld;
  private cells?: Map<string, Footprint[]>;
  private doors: DoorEntity[] = [];
  private readonly body = empty(true);
  private readonly equipment = empty(true);
  private readonly cargo = empty(true);
  private hasEquipment = false;
  private hasCargo = false;
  private readonly neighbors = Array.from({ length: 25 }, () => empty());
  private neighborCount = 0;
  private support = 0;
  private tileX = NaN;
  private tileZ = NaN;
  private tile?: Tile;
  floorQueries = 0;
  reason = '';
  prepare(
    pose: PoseBuffer,
    actor: Actor,
    ecs: ECS,
    actions: ActionRig,
    world?: NavigationWorld,
  ): void {
    this.floorQueries = 0;
    this.tileX = this.tileZ = NaN;
    if (this.world !== world) {
      this.world = world;
      this.cells = world ? index(world) : undefined;
      this.doors = world?.entities.filter((e) => e.type === 'door') ?? [];
    }
    this.support = actor.position.h;
    box(this.body, pose.world, pose.definition.index.spine * 16, [0, 0.27, 0], [0.58, 0.55, 0.36]);
    this.hasEquipment = actions.stowed && actor.entity.get('squadMember')?.role === 'shieldbearer';
    if (this.hasEquipment)
      box(this.equipment, actions.frames.back, 0, [-0.24, -0.02, -0.04], [0.62, 0.72, 0.14]);
    this.hasCargo = actions.carrying;
    if (this.hasCargo) box(this.cargo, actions.frames.cargo, 0, [0, 0.26, 0], [0.66, 0.53, 0.53]);
    this.neighborCount = 0;
    for (const e of ecs.query('actor', 'transform', 'health')) {
      if (e === actor.entity || e.require('health').current <= 0 || e.has('corpse')) continue;
      const p = e.require('transform');
      if (Math.hypot(p.x - actor.position.x, p.z - actor.position.z) > 2) continue;
      if (this.neighborCount === this.neighbors.length) break;
      const b = this.neighbors[this.neighborCount++];
      b.minX = p.x - 0.3;
      b.maxX = p.x + 0.3;
      b.minZ = p.z - 0.3;
      b.maxZ = p.z + 0.3;
      b.minY = p.h;
      b.maxY = p.h + 1.55;
    }
  }
  readonly clear = (b: TailBounds, segment = 0): boolean => {
    this.reason = '';
    // The proximal link emerges through the pelvis/vest seam. Distal links may never re-enter it.
    if (segment > 0 && overlaps(b, this.body)) {
      this.reason = 'body';
      return false;
    }
    if (this.hasEquipment && overlaps(b, this.equipment)) {
      this.reason = 'equipment';
      return false;
    }
    if (this.hasCargo && overlaps(b, this.cargo)) {
      this.reason = 'cargo';
      return false;
    }
    for (let i = 0; i < this.neighborCount; i++)
      if (overlaps(b, this.neighbors[i])) {
        this.reason = 'neighbor';
        return false;
      }
    const world = this.world;
    if (!world) return b.minY >= this.support + 0.002;
    // The conservative box covers the entire link, including thin barriers between its corners.
    for (let x = Math.floor(b.minX); x <= Math.floor(b.maxX); x++)
      for (let z = Math.floor(b.minZ); z <= Math.floor(b.maxZ); z++)
        for (const obstacle of this.cells?.get(`${x},${z}`) ?? [])
          if (
            b.minX < obstacle.x + obstacle.w / 2 &&
            b.maxX > obstacle.x - obstacle.w / 2 &&
            b.minZ < obstacle.z + obstacle.d / 2 &&
            b.maxZ > obstacle.z - obstacle.d / 2
          ) {
            this.reason = 'obstacle';
            return false;
          }
    for (const door of this.doors) {
      const w = door.axis === 'x' ? 0.35 : 2.95,
        d = door.axis === 'x' ? 2.95 : 0.35;
      if (
        b.minX < door.x + w / 2 &&
        b.maxX > door.x - w / 2 &&
        b.minZ < door.z + d / 2 &&
        b.maxZ > door.z - d / 2
      ) {
        // Door flags are chart-backed getters. Read them only for a nearby overlapping link,
        // never for every door on every candidate/corner of every tail.
        if (!door.locked && door.open && !door.collider?.checkCollisions) continue;
        this.reason = 'door';
        return false;
      }
    }
    const corners = b.corners!;
    for (let i = 0; i < 24; i += 3) {
      const x = corners[i],
        y = corners[i + 1],
        z = corners[i + 2];
      this.floorQueries++;
      const tx = Math.round(x),
        tz = Math.round(z);
      if (tx !== this.tileX || tz !== this.tileZ) {
        this.tile = tileAt(world, x, z);
        this.tileX = tx;
        this.tileZ = tz;
      }
      const tile = this.tile;
      // blocked marks a clearance-inflated navigation cell, not a drawn wall. Props were
      // checked against their actual footprints above; only missing floor is a wall/void here.
      if (!tile) {
        this.reason = 'wall';
        return false;
      }
      const floor = Math.max(
        tile.ramp ? (heightAt(world, x, z) ?? this.support) : tile.h,
        tile.surface === 'stair' ? tile.h + 0.03 : tile.h,
      );
      if (y < floor + 0.002) {
        this.reason = 'floor';
        return false;
      }
    }
    return true;
  };
}
