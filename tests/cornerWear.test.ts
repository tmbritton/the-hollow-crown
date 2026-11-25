import assert from 'node:assert/strict';
import test from 'node:test';
import {
  profileFaces,
  wallWear,
  pillarWear,
  chipWear,
  partitionJunctionPins,
} from '../src/cornerWear.ts';
import { buildPracticeRoom } from '../src/practiceRoom.ts';
import { WALL_CAP, WALL_LENGTH, WALL_OFFSET, WALL_THICKNESS } from '../src/wallGeometry.ts';
import type { Triple } from '../src/worldTypes.ts';

const box: Triple = [1, 0.75, 1];
const points = (faces: ReturnType<typeof profileFaces>) =>
  faces.flatMap((f) => f.vertices.map((v) => v.position));

test('zero uses the source box; a seeded chip clips its edge without raising the tread', () => {
  const center: Triple = [0, -0.375, 0];
  const shape = chipWear('seed:step', 2, -1, 1, 0.18, 0.16);
  const source = profileFaces(center, box, 63);
  assert.deepEqual(profileFaces(center, box, 63, shape, 0), source);
  const full = profileFaces(center, box, 63, shape, 1);
  const mid = profileFaces(center, box, 63, shape, 0.5);
  assert.equal(full.length, 7);
  assert.notDeepEqual(points(full), points(mid));
  const fullEdge = Math.min(...full[0].vertices.map(({ position }) => position[2]));
  const midEdge = Math.min(...mid[0].vertices.map(({ position }) => position[2]));
  assert.equal(midEdge, (-0.5 + fullEdge) / 2);
  assert.equal(new Set(full[6].vertices.map(({ uv }) => uv.join(','))).size, 4);
  assert.equal(Math.max(...points(full).map((p) => p[1])), 0);
  assert.ok(full[0].vertices.every((v) => v.position[1] === 0 && v.position[2] > -0.5));
  assert.notDeepEqual(
    full,
    profileFaces(center, box, 63, chipWear('second:step', 2, -1, 1, 0.18, 0.16), 1),
  );
});

test('masonry endpoint samples match across emission, material and negative chunk seams', () => {
  const shape = wallWear('seed', 2, 0.7, 0, false, false);
  const left: Triple = [-10, 1.2, 0.7];
  const right: Triple = [-9, 1.2, 0.7];
  const size: Triple = [1, 0.4, 0.4];
  const seam = (center: Triple) =>
    [
      ...new Set(
        points(profileFaces(center, size, 63, shape, 1))
          .filter((p) => p[0] === -9.5)
          .map((p) => p.join(',')),
      ),
    ].sort();
  const r = seam(right);
  assert.equal(r.length, 4);
  assert.deepEqual(seam(left), r);
  assert.notDeepEqual(
    profileFaces(left, size, 63, shape, 1),
    profileFaces(left, size, 63, shape, 0),
  );
  const pinned: Triple = [-10, 0.52, 0.7];
  assert.deepEqual(
    points(profileFaces(pinned, size, 1, shape, 1)),
    points(profileFaces(pinned, size, 1)),
  );
});

test('perpendicular Dojo ends anchor the swept footprint but leave neighboring masonry free', () => {
  const { seed, bounds, partition } = buildPracticeRoom();
  for (const side of [-1, 1] as const) {
    const wall = partition.find(({ x }) => side * x > 0)!;
    const inner = side === 1 ? bounds.maxX : bounds.minX;
    const line = inner + side * (WALL_OFFSET - 0.5);
    assert.equal(wall.x + (side * wall.w) / 2, inner);
    assert.equal(wall.d, 0.55);
    assert.equal(wall.height, 3.3);
    for (const axis of [0, 2] as const) {
      const parts =
        axis === 0
          ? partition
          : partition.map(({ x, z, w, d, ...rest }) => ({
              ...rest,
              x: z,
              z: x,
              w: d,
              d: w,
            }));
      for (const offset of [-1, 0, 1, 2, 3]) {
        const along = wall.z + offset;
        const { low, high } = partitionJunctionPins(axis, side, line, along, parts);
        assert.deepEqual([low, high], [offset <= 2, offset <= 1]);
        const shape = wallWear(seed, axis, line, wall.h, low, high);
        const center: Triple = axis === 0 ? [line, 3.04, along] : [along, 3.04, line];
        const width = WALL_THICKNESS + WALL_CAP.overhang;
        const length = WALL_LENGTH + WALL_CAP.overhang;
        const size: Triple =
          axis === 0 ? [width, WALL_CAP.height, length] : [length, WALL_CAP.height, width];
        const source = profileFaces(center, size, 63);
        for (const wear of [0.5, 1]) {
          const worn = profileFaces(center, size, 63, shape, wear);
          if (offset <= 1) assert.deepEqual(points(worn), points(source));
          else assert.notDeepEqual(points(worn), points(source));
        }
      }
    }
  }
});

test('pillar courses taper on the same full-height axis; thin rotated chips have outward triangles', () => {
  const shape = pillarWear('seed:pillar', 0, 0, 0, 4);
  const width = (y: number) => {
    const xs = points(profileFaces([0, y, 0], [1, 0.2, 1], 1, shape, 1)).map((p) => p[0]);
    return Math.max(...xs) - Math.min(...xs);
  };
  assert.ok(width(0.5) > width(2) && width(2) > width(3.5));
  for (const axis of [0, 2] as const) {
    const size: Triple = axis === 0 ? [0.47, 2.8, 0.025] : [0.025, 2.8, 0.47];
    for (const { normal, vertices } of profileFaces(
      [0, 0, 0],
      size,
      63,
      chipWear('frame', axis, 1, -1, 0.24, 0.24),
      1,
    )) {
      for (let i = 1; i < vertices.length - 1; i++) {
        const a = vertices[0].position;
        const b = vertices[i].position.map((p, j) => p - a[j]);
        const c = vertices[i + 1].position.map((p, j) => p - a[j]);
        const inward = [
          b[1] * c[2] - b[2] * c[1],
          b[2] * c[0] - b[0] * c[2],
          b[0] * c[1] - b[1] * c[0],
        ];
        assert.ok(
          normal.every(Number.isFinite) && inward.reduce((dot, n, j) => dot + n * normal[j], 0) < 0,
        );
      }
    }
  }
});
