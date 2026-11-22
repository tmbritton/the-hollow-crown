import type { Footprint, Point } from './worldTypes.ts';

/** Inclusive broad phase only. Consumers retain their own strict slab/point boundary rules. */
export function segmentBounds(from: Point, to: Point) {
  return {
    minX: Math.min(from.x, to.x),
    maxX: Math.max(from.x, to.x),
    minZ: Math.min(from.z, to.z),
    maxZ: Math.max(from.z, to.z),
  };
}

export function nearSegment(bounds: ReturnType<typeof segmentBounds>, box: Footprint, padding = 0) {
  const rx = box.w / 2 + padding,
    rz = box.d / 2 + padding;
  return (
    bounds.minX <= box.x + rx &&
    bounds.maxX >= box.x - rx &&
    bounds.minZ <= box.z + rz &&
    bounds.maxZ >= box.z - rz
  );
}
