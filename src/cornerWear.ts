import { WALL_CAP, WALL_LENGTH, WALL_THICKNESS } from './wallGeometry.ts';
import type { InteriorWall, Triple } from './worldTypes.ts';

type Axis = 0 | 2;
type Sign = -1 | 1;
type Warp = (point: Triple, corner: Triple) => Triple;
type Chip = { axis: Axis; side: Sign; end: Sign; across: number; rise: number };
export type WearProfile = { warp: Warp } | { chip: Chip };

export const PARTITION_TRIM_OVERHANG = 0.08;
const partitionLean = 0.24;
const partitionLeanVariation = 0.12;

// Babylon left-handed outward winding, in Batcher mask order.
export const boxFaces: readonly { n: Triple; v: readonly Triple[] }[] = [
  {
    n: [0, 1, 0],
    v: [
      [-1, 1, -1],
      [1, 1, -1],
      [1, 1, 1],
      [-1, 1, 1],
    ],
  },
  {
    n: [0, -1, 0],
    v: [
      [-1, -1, 1],
      [1, -1, 1],
      [1, -1, -1],
      [-1, -1, -1],
    ],
  },
  {
    n: [1, 0, 0],
    v: [
      [1, -1, -1],
      [1, -1, 1],
      [1, 1, 1],
      [1, 1, -1],
    ],
  },
  {
    n: [-1, 0, 0],
    v: [
      [-1, -1, 1],
      [-1, -1, -1],
      [-1, 1, -1],
      [-1, 1, 1],
    ],
  },
  {
    n: [0, 0, 1],
    v: [
      [1, -1, 1],
      [-1, -1, 1],
      [-1, 1, 1],
      [1, 1, 1],
    ],
  },
  {
    n: [0, 0, -1],
    v: [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
    ],
  },
];

function sample(key: string) {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  return ((hash ^ (hash >>> 15)) >>> 0) / 4294967296;
}

/** Keep each tangent endpoint on its original plane. Neighbors on a wall run
 * sample the same lattice endpoint, even when cap/base widths overhang it. */
export function wallWear(
  seed: string,
  axis: Axis,
  line: number,
  floor: number,
  pinLow: boolean,
  pinHigh: boolean,
): WearProfile {
  const tangent = axis === 0 ? 2 : 0;
  return {
    warp(point, corner) {
      if (corner[tangent] < 0 ? pinLow : pinHigh) return point;
      const end = Math.round(point[tangent] - 0.5) + 0.5;
      const lean = (sample(`${seed}:wall:${axis}:${line}:${floor}:${end}`) - 0.5) * 2;
      const y = point[1] - floor;
      // Separate envelopes meet at zero at the cutaway pivot. Do not shift the floor contact.
      const height =
        y <= 0.72
          ? Math.max(0, Math.min(y / 0.43, (0.72 - y) / 0.29)) * 0.11
          : Math.min(1, (y - 0.72) / 2.15) * 0.31;
      const result: Triple = [...point];
      result[axis] += height * lean;
      return result;
    },
  };
}

/** Anchor the perimeter where a perpendicular partition ends. Both ends of
 * each segment under the swept partition footprint stay square, and adjacent
 * segments share those same pinned lattice endpoints. This also mates when
 * the upper perimeter is scaled independently by the cutaway. */
export function partitionJunctionPins(
  axis: Axis,
  side: number,
  line: number,
  along: number,
  partitions: readonly InteriorWall[],
) {
  const inner = line - (side * WALL_THICKNESS) / 2;
  const touches = (center: number) =>
    partitions.some(({ x, z, w, d }) => {
      const [run, cross, length, width] = axis === 0 ? [x, z, w, d] : [z, x, d, w];
      const reach =
        (width + PARTITION_TRIM_OVERHANG + WALL_LENGTH + WALL_CAP.overhang) / 2 +
        partitionLean +
        partitionLeanVariation;
      return (
        length > width &&
        side * (inner - run) > 0 &&
        Math.abs(run + (side * length) / 2 - inner) < 1e-6 &&
        Math.abs(center - cross) <= reach
      );
    });
  const anchored = touches(along);
  return { low: anchored || touches(along - 1), high: anchored || touches(along + 1) };
}

export function partitionWear(key: string, axis: Axis, floor: number, height: number): WearProfile {
  const amplitude = partitionLean + sample(key) * partitionLeanVariation;
  return {
    warp(point, corner) {
      const result: Triple = [...point];
      // Both ends stay in their original tangent planes, including the doorway joint.
      result[axis] += corner[axis === 0 ? 2 : 0] * amplitude * ((point[1] - floor) / height);
      return result;
    },
  };
}

export function pillarWear(
  key: string,
  x: number,
  z: number,
  floor: number,
  height: number,
): WearProfile {
  const taper = 0.23 + sample(key) * 0.14;
  return {
    warp: ([px, py, pz]) => {
      const scale = 1 - taper * Math.max(0, Math.min(1, (py - floor) / height));
      return [x + (px - x) * scale, py, z + (pz - z) * scale];
    },
  };
}

/** Clip an exposed horizontal edge. Across and rise are maximum setbacks in
 * the profile plane, independent of the extrusion thickness. */
export function chipWear(
  key: string,
  axis: Axis,
  side: Sign,
  end: Sign,
  across: number,
  rise: number,
): WearProfile {
  const amount = 0.66 + 0.34 * sample(key);
  return { chip: { axis, side, end, across: across * amount, rise: rise * amount } };
}

/** Keep thin tread trim fully supported by its shortened stone top. */
export function treadWear(profile: WearProfile | undefined): WearProfile | undefined {
  if (!profile || !('chip' in profile)) return;
  const { axis, side, across } = profile.chip;
  return {
    warp(point, corner) {
      const result: Triple = [...point];
      if (corner[axis] === side) result[axis] -= side * across;
      return result;
    },
  };
}

export interface ProfileVertex {
  source: Triple;
  position: Triple;
  uv: [number, number];
}
export interface ProfileFace {
  face: number;
  normal: Triple;
  vertices: ProfileVertex[];
}

const mix = (a: Triple, b: Triple, t: number): Triple => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Interpolate from the original box (clipped vertices start at the same
 * source corner), then calculate a flat outward normal from the polygon. */
export function profilePolygon(face: ProfileFace, wear: number) {
  const positions = face.vertices.map((v) => mix(v.source, v.position, wear));
  const normal: Triple = [0, 0, 0];
  const a = positions[0];
  for (let i = 1; i + 1 < positions.length; i++) {
    const [bx, by, bz] = positions[i].map((p, j) => p - a[j]);
    const [cx, cy, cz] = positions[i + 1].map((p, j) => p - a[j]);
    normal[0] += bz * cy - by * cz;
    normal[1] += bx * cz - bz * cx;
    normal[2] += by * cx - bx * cy;
  }
  const length = Math.hypot(...normal);
  return { positions, normal: length ? normal.map((v) => v / length) : face.normal };
}

export function profileFaces(
  center: Triple,
  size: Triple,
  mask: number,
  profile?: WearProfile,
  wear = 0,
): ProfileFace[] {
  const chip = wear && profile && 'chip' in profile ? profile.chip : undefined;
  const warp = wear && profile && 'warp' in profile ? profile.warp : undefined;
  const make = (corner: Triple, uv: [number, number]): ProfileVertex => {
    const source: Triple = [
      center[0] + (corner[0] * size[0]) / 2,
      center[1] + (corner[1] * size[1]) / 2,
      center[2] + (corner[2] * size[2]) / 2,
    ];
    return { source, position: warp ? warp(source, corner) : source, uv };
  };
  const faces: ProfileFace[] = [];
  const cross = chip?.axis === 0 ? 2 : 0;
  const bevel: ProfileVertex[] = [];
  for (const [face, { n, v }] of boxFaces.entries()) {
    if (!(mask & (1 << face))) continue;
    const uv = (i: number): [number, number] => [Number(i === 1 || i === 2), Number(i >= 2)];
    const vertices = v.flatMap((corner, i) => {
      if (!chip || corner[chip.axis] !== chip.side || corner[1] !== chip.end)
        return [make(corner, uv(i))];
      return [v[(i + 3) % 4], v[(i + 1) % 4]].flatMap((other, direction) => {
        if (other[cross] !== corner[cross]) return []; // Along the removed edge.
        const vertex = make(corner, uv(i));
        const axis = other[1] !== corner[1] ? 1 : chip.axis;
        const distance = Math.min(size[axis] * 0.46, axis === 1 ? chip.rise : chip.across);
        const nextUV = uv((i + (direction ? 1 : 3)) % 4);
        vertex.uv = vertex.uv.map(
          (value, k) => value + ((nextUV[k] - value) * distance) / size[axis],
        ) as [number, number];
        vertex.position = [...vertex.source];
        vertex.position[axis] -= corner[axis] * distance;
        return [vertex];
      });
    });
    // End cap of the bevel can be recovered from the shortened horizontal face,
    // even if the two sides of the extrusion are masked (e.g. a stair row).
    if (chip && n[1] === chip.end) {
      const edge = vertices.filter((v) => v.source[chip.axis] !== v.position[chip.axis]);
      if (edge[0] === vertices[0] && edge[1] === vertices.at(-1)) edge.reverse();
      const lower = edge.map((v): ProfileVertex => {
        const position: Triple = [...v.source];
        position[1] -= chip.end * Math.min(size[1] * 0.46, chip.rise);
        return { source: v.source, position, uv: v.uv };
      });
      bevel.push(
        ...[edge[1], edge[0], lower[0], lower[1]].map((vertex, i): ProfileVertex => ({
          ...vertex,
          uv: uv(i),
        })),
      );
    }
    faces.push({ face, normal: n, vertices });
  }
  if (chip && bevel.length)
    faces.push({ face: chip.end === 1 ? 0 : 1, normal: [0, chip.end, 0], vertices: bevel });
  if (wear)
    for (const face of faces) {
      const { positions, normal } = profilePolygon(face, wear);
      face.normal = [normal[0], normal[1], normal[2]];
      face.vertices.forEach((vertex, i) => {
        vertex.position = positions[i];
      });
    }
  return faces;
}
