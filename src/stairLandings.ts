import { key } from './worldSpatial.ts';
import type { Connection, Tile } from './worldTypes.ts';

type LandingConnection = Pick<
  Connection,
  'a' | 'b' | 'axis' | 'start' | 'end' | 'sign' | 'cross' | 'width' | 'ramp'
>;

/** A passage-width apron on each end, using only already coplanar room stone. */
export function stairLandingTops({
  connections,
  tiles,
}: {
  connections: readonly LandingConnection[];
  tiles: ReadonlyMap<string, Readonly<Tile>>;
}): Set<string> {
  const tops = new Set<string>();
  for (const { ramp, a, b, axis, start, end, sign, cross, width } of connections) {
    if (!ramp) continue;
    const half = (width - 1) / 2;
    for (const [edge, inward, room, height] of [
      [start, -sign, a, ramp.a],
      [end, sign, b, ramp.b],
    ] as const) {
      for (let depth = 0; depth < 3; depth++) {
        const along = edge + inward * depth;
        const row: string[] = [];
        for (let lane = -half; lane <= half; lane++) {
          const across = cross + lane;
          const k = axis === 'x' ? key(along, across) : key(across, along);
          const tile = tiles.get(k);
          if (tile?.room === room && tile.surface === 'stone' && tile.h === height) row.push(k);
        }
        // Don't skip over a break or paint disconnected fragments of an incomplete row.
        if (row.length !== width) break;
        for (const k of row) tops.add(k);
      }
    }
  }
  return tops;
}
