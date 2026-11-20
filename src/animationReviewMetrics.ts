import type { CorpseBox } from './corpseTerrain.ts';
import type { Spawn } from './worldTypes.ts';

/** Diagnostic vertical ray/OBB intersection: intentionally uncapped. Keep separate from the
 * motor's bounded visual-contact policy so tall drawn geometry cannot silently pass review.
 * As in the contact policy, only settled remains on the same support layer are considered. */
export function drawnCorpseHeightAt(boxes: readonly CorpseBox[], point: Spawn): number {
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
    let enter = -Infinity,
      exit = Infinity;
    for (const [axis, key] of (['x', 'y', 'z'] as const).entries()) {
      const m = box.inverse;
      const origin = point.x * m[axis] + point.z * m[axis + 8] + m[axis + 12];
      const direction = m[axis + 4];
      if (Math.abs(direction) < 1e-8) {
        if (origin < box.min[key] - 1e-7 || origin > box.max[key] + 1e-7) {
          exit = -Infinity;
          break;
        }
      } else {
        const a = (box.min[key] - origin) / direction,
          b = (box.max[key] - origin) / direction;
        enter = Math.max(enter, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
      }
    }
    if (enter <= exit && Number.isFinite(exit)) height = Math.max(height, exit - point.h);
  }
  return height;
}
