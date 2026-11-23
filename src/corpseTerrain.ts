import type { Point, Spawn } from './worldTypes.ts';

interface XYZ {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Render-only oriented box. Inverse is a column-major world-to-local affine matrix.
 * The authored voxel parts are boxes, so slab intersection samples their drawn surface,
 * not an expanded cylindrical actor footprint or a world-axis bounding-box top. */
export interface CorpseBox {
  readonly inverse: ArrayLike<number>;
  readonly min: XYZ;
  readonly max: XYZ;
  readonly worldMin: XYZ;
  readonly worldMax: XYZ;
  readonly floor: number;
}

export const MAX_CORPSE_STEP = 0.46;

export interface CorpseContactQuery {
  readonly empty: boolean;
  heightAt(point: Spawn): number;
}

/** Height above the caller's real floor; corpses union by maximum, never by addition. */
export function corpseHeightAt(boxes: readonly CorpseBox[], point: Spawn): number {
  let height = 0;
  for (const box of boxes) {
    if (
      Math.abs(box.floor - point.h) > 0.45 ||
      point.x < box.worldMin.x ||
      point.x > box.worldMax.x ||
      point.z < box.worldMin.z ||
      point.z > box.worldMax.z
    )
      continue;
    const m = box.inverse;
    let low = -Infinity,
      high = Infinity;
    for (const [i, key] of (['x', 'y', 'z'] as const).entries()) {
      const origin = point.x * m[i] + point.z * m[8 + i] + m[12 + i];
      const direction = m[4 + i];
      if (Math.abs(direction) < 1e-8) {
        if (origin < box.min[key] - 1e-7 || origin > box.max[key] + 1e-7) {
          high = -Infinity;
          break;
        }
      } else {
        const a = (box.min[key] - origin) / direction,
          b = (box.max[key] - origin) / direction;
        low = Math.max(low, Math.min(a, b));
        high = Math.min(high, Math.max(a, b));
      }
    }
    if (low <= high && Number.isFinite(high)) height = Math.max(height, high - point.h);
  }
  return Math.min(MAX_CORPSE_STEP, height);
}

/** Contact under this foot plus short swing-only clearance along its travel direction.
 * No clocks or retained offsets: repeated samples and overlapping bodies are idempotent. */
export function corpseStep(
  boxes: readonly CorpseBox[] | CorpseContactQuery,
  point: Spawn,
  ahead: Point,
  phase: number,
): number {
  const sample = (p: Spawn) => ('heightAt' in boxes ? boxes.heightAt(p) : corpseHeightAt(boxes, p));
  const contact = sample(point);
  const cycle = ((phase % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (cycle <= Math.PI) return contact;
  let obstacle = contact;
  for (const t of [-1, -0.5, 0.5, 1])
    obstacle = Math.max(
      obstacle,
      sample({ x: point.x + ahead.x * t, z: point.z + ahead.z * t, h: point.h }),
    );
  return Math.max(contact, obstacle * Math.sin(cycle - Math.PI));
}
