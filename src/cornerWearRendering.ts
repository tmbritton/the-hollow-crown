import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { profilePolygon } from './cornerWear.ts';
import type { ProfileFace } from './cornerWear.ts';
import { required } from './assert.ts';

export const roomBandAttribute = 'roomBand';
const attributes = [
  [VertexBuffer.PositionKind, 3],
  [VertexBuffer.NormalKind, 3],
  [VertexBuffer.UVKind, 2],
  [VertexBuffer.ColorKind, 4],
  [roomBandAttribute, 4],
] as const;

export interface WearPatch {
  vertex: number;
  index: number;
  faceCount: number;
  faces(): ProfileFace[];
  // Batch quads are in mask order. Babylon door parts use their own face/UV order.
  sourceFace?(face: number): number;
  uv?(face: ProfileFace, u: number, v: number): [number, number];
}

function prepare(mesh: Mesh, patches: WearPatch[]) {
  const buffers = attributes.flatMap(([kind, stride]) => {
    const data = mesh.getVerticesData(kind);
    return data ? [{ kind, stride, original: data.slice(), worn: [] as number[] }] : [];
  });
  const originalIndices = required(mesh.getIndices()?.slice(), 'Wear mesh has no indices');
  const positions = required(buffers[0], 'Wear mesh has no positions').worn;
  const normals = required(buffers[1], 'Wear mesh has no normals').worn;
  const indices: number[] = [];
  const polygons: { start: number; face: ProfileFace }[] = [];
  let vertex = 0;
  let index = 0;
  function unchanged(endVertex: number, endIndex: number) {
    const shift = positions.length / 3 - vertex;
    for (const buffer of buffers)
      for (let i = vertex * buffer.stride; i < endVertex * buffer.stride; i++)
        buffer.worn.push(buffer.original[i]);
    for (let i = index; i < endIndex; i++) indices.push(originalIndices[i] + shift);
  }
  for (const patch of patches) {
    unchanged(patch.vertex, patch.index);
    for (const face of patch.faces()) {
      const start = positions.length / 3;
      const source = patch.vertex + 4 * (patch.sourceFace?.(face.face) ?? face.face);
      polygons.push({ start, face });
      for (const { position, uv } of face.vertices) {
        for (const { kind, stride, original, worn } of buffers) {
          if (kind === VertexBuffer.PositionKind) worn.push(...position);
          else if (kind === VertexBuffer.NormalKind) worn.push(...face.normal);
          else if (kind === VertexBuffer.UVKind) worn.push(...(patch.uv?.(face, ...uv) ?? uv));
          else for (let k = 0; k < stride; k++) worn.push(original[source * stride + k]);
        }
      }
      for (let i = 1; i + 1 < face.vertices.length; i++)
        indices.push(start, start + i, start + i + 1);
    }
    vertex = patch.vertex + 4 * patch.faceCount;
    index = patch.index + 6 * patch.faceCount;
  }
  unchanged(mesh.getTotalVertices(), originalIndices.length);
  let active = false;
  return (wear: number) => {
    if (wear)
      for (const { start, face } of polygons) {
        const polygon = profilePolygon(face, wear);
        polygon.positions.forEach((p, i) => {
          for (let axis = 0; axis < 3; axis++) {
            positions[(start + i) * 3 + axis] = Math.fround(p[axis]);
            normals[(start + i) * 3 + axis] = Math.fround(polygon.normal[axis]);
          }
        });
      }
    if (active !== Boolean(wear)) {
      active = Boolean(wear);
      for (const { kind, stride, original, worn } of buffers)
        mesh.setVerticesData(kind, active ? worn : original, active, stride);
      mesh.setIndices(active ? indices : originalIndices, mesh.getTotalVertices());
    } else {
      mesh.updateVerticesData(VertexBuffer.PositionKind, positions, true);
      mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
    }
    // Includes submesh and world bounds, including frozen architecture and moving leaves.
    mesh.refreshBoundingInfo();
  };
}

export function createCornerWearRenderer(scene: Scene) {
  const handles = new Map<Mesh, (wear: number) => void>();
  let previous = 0;
  scene.onDisposeObservable.addOnce(() => handles.clear());
  return {
    register(mesh: Mesh, patches: WearPatch[]) {
      let update: ReturnType<typeof prepare> | undefined;
      handles.set(mesh, (wear) => {
        update ??= prepare(mesh, patches);
        update(wear);
      });
      mesh.onDisposeObservable.addOnce(() => handles.delete(mesh));
    },
    apply(percent: number) {
      if (percent === previous) return;
      for (const update of handles.values()) update(percent / 100);
      previous = percent;
    },
  };
}

export type CornerWearRenderer = ReturnType<typeof createCornerWearRenderer>;
