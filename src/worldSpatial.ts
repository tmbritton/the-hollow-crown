import { required } from './assert.ts';
import type { Pair, Point, Tile, World } from './worldTypes.ts';

export const key = (x: number, z: number): string => `${x},${z}`;
export const directions: readonly Pair[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function tileAt(world: Pick<World, 'tiles'>, x: number, z: number): Tile | undefined {
  return world.tiles.get(key(Math.round(x), Math.round(z)));
}
export function heightAt(world: Pick<World, 'tiles'>, x: number, z: number): number | null {
  const tile = tileAt(world, x, z);
  if (!tile) return null;
  if (tile.ramp) {
    const r = tile.ramp;
    const t = Math.max(
      0,
      Math.min(1, (((r.axis === 'x' ? x : z) - r.start) * r.sign) / r.distance),
    );
    return r.a + (r.b - r.a) * t;
  }
  return tile.h;
}

export function reachableTiles(world: World, unlocked = false): Set<string> {
  return new Set(reachableTileDistances(world, unlocked).keys());
}

/** Four-neighbor tile steps, with ordinary doors operable and the altar gate explicit. */
export function reachableTileDistances(
  world: World,
  unlocked = false,
  origin: Point = world.spawn,
): Map<string, number> {
  const gate = world.entities.find((e) => e.type === 'door' && e.requiresAltar);
  const start = key(Math.round(origin.x), Math.round(origin.z)),
    first = world.tiles.get(start);
  if (!first || first.blocked || first.surface === 'lava') return new Map();
  const seen = new Map([[start, 0]]),
    queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const tile = required(world.tiles.get(queue[i]), 'Navigation tile missing');
    for (const [dx, dz] of directions) {
      const k = key(tile.x + dx, tile.z + dz),
        next = world.tiles.get(k);
      if (
        !next ||
        next.blocked ||
        next.surface === 'lava' ||
        seen.has(k) ||
        Math.abs(next.h - tile.h) > 0.65
      )
        continue;
      if (
        !unlocked &&
        gate?.type === 'door' &&
        (gate.axis === 'x'
          ? next.x === gate.x && Math.abs(next.z - gate.z) <= 1
          : next.z === gate.z && Math.abs(next.x - gate.x) <= 1)
      )
        continue;
      seen.set(k, required(seen.get(queue[i]), 'Missing route distance') + 1);
      queue.push(k);
    }
  }
  return seen;
}
