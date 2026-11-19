import type { Footprint, Frame, Point } from '../worldTypes.ts';

/** Exact slab intersection against an axis-aligned box, shared with runtime navigation. */
export function segmentIntersectsBox(from: Point, to: Point, box: Footprint, padding = 0): boolean {
  let enter = 0,
    exit = 1;
  for (const axis of ['x', 'z'] as const) {
    const half = (axis === 'x' ? box.w : box.d) / 2 + padding;
    const delta = to[axis] - from[axis],
      low = box[axis] - half,
      high = box[axis] + half;
    if (Math.abs(delta) < 1e-10) {
      if (from[axis] <= low || from[axis] >= high) return false;
    } else {
      const a = (low - from[axis]) / delta,
        b = (high - from[axis]) / delta;
      enter = Math.max(enter, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
      if (enter >= exit) return false;
    }
  }
  return enter < exit;
}

export function localPoint(frame: Frame, x: number, z: number): Point {
  const c = Math.round(Math.cos(frame.rotation || 0)),
    s = Math.round(Math.sin(frame.rotation || 0));
  return { x: frame.x + x * c + z * s, z: frame.z - x * s + z * c };
}

export function footprint(object: Footprint): Footprint {
  const swap = Math.abs(Math.round(Math.sin(object.rotation || 0))) === 1;
  return { x: object.x, z: object.z, w: swap ? object.d : object.w, d: swap ? object.w : object.d };
}

export function inwardRotations(room: Point, position: Point): number[] {
  const dx = room.x - position.x,
    dz = room.z - position.z;
  const scores = [-dz, -dx, dz, dx];
  const best = Math.max(...scores);
  return [0, 1, 2, 3].filter((quarter) => scores[quarter] >= best - 1e-9);
}
