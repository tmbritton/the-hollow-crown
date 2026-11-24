import assert from 'node:assert/strict';
import test from 'node:test';
import { stairLandingTops } from '../src/stairLandings.ts';
import type { Connection, Tile } from '../src/worldTypes.ts';

function passage(axis: Connection['axis'], sign: number, ramp = true) {
  const start = 10;
  const end = start + sign * 5;
  const connection = {
    axis,
    sign,
    start,
    end,
    cross: -4,
    width: 3,
    a: 'entrance',
    b: 'bakery',
    ramp: ramp ? { axis, sign, start, distance: 5, a: 0, b: -2.4 } : null,
  } satisfies Partial<Connection>;
  const tiles = new Map<string, Tile>();
  const at = (along: number, across: number) =>
    axis === 'x' ? `${along},${across}` : `${across},${along}`;
  for (let row = -4; row <= 9; row++) {
    for (let lane = -3; lane <= 3; lane++) {
      const k = at(start + sign * row, connection.cross + lane);
      const [x, z] = k.split(',').map(Number);
      const room = row <= 0 ? connection.a : row >= 5 ? connection.b : undefined;
      tiles.set(k, {
        x,
        z,
        h: room === connection.a ? 0 : room === connection.b ? -2.4 : (-2.4 * row) / 5,
        surface: room ? 'stone' : 'stair',
        room,
      });
    }
  }
  const world = { connections: [connection], tiles };
  const keys = (rows: number[]) =>
    new Set(rows.flatMap((row) => [-1, 0, 1].map((lane) => at(start + sign * row, -4 + lane))));
  return { world, keys };
}

test('a stair landing is a bounded full-width apron at both ends, for either axis and sign', () => {
  for (const axis of ['x', 'z'] as const) {
    for (const sign of [-1, 1]) {
      const { world, keys } = passage(axis, sign);
      const before = structuredClone(world);
      assert.deepEqual(stairLandingTops(world), keys([-2, -1, 0, 5, 6, 7]));
      assert.deepEqual(world, before, 'the render mask does not modify terrain or ramps');
    }
  }
});

test('level passages have no stair apron; interrupted aprons stop before unsafe or foreign floor', () => {
  assert.deepEqual(stairLandingTops(passage('x', 1, false).world), new Set());
  for (const change of [{ surface: 'lava' }, { h: -3 }, { room: 'crypt' }, null] as const) {
    const { world, keys } = passage('z', -1);
    const key = [...keys([6])][0];
    if (change) Object.assign(world.tiles.get(key)!, change);
    else world.tiles.delete(key);
    assert.deepEqual(stairLandingTops(world), keys([-2, -1, 0, 5]));
  }
});
