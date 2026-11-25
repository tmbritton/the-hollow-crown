import { TERRAIN_RADIUS } from './routeGrid.ts';
import type { Point } from './worldTypes.ts';

type Threshold = Point & { axis: 'x' | 'z' };
export function doorRetreat(door: Threshold, from: Point, to: Point, lastSide = 1): boolean {
  const axis = door.axis;
  const across = axis === 'x' ? 'z' : 'x';
  const offset = from[axis] - door[axis];
  return (
    Math.abs(offset) < 0.175 + TERRAIN_RADIUS + 0.05 &&
    Math.abs(from[across] - door[across]) < 1.475 + TERRAIN_RADIUS + 0.05 &&
    (Math.sign(offset) || lastSide) * (to[axis] - from[axis]) > 1e-9
  );
}
