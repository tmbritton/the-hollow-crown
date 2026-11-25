import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { Scene } from '@babylonjs/core/scene';
import type { Material } from '@babylonjs/core/Materials/material';
import type { Node } from '@babylonjs/core/node';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { Triple } from './worldTypes.ts';
import { required } from './assert.ts';
import { boxFaces, profileFaces } from './cornerWear.ts';
import type { WearProfile } from './cornerWear.ts';
import { roomBandAttribute } from './cornerWearRendering.ts';
import type { CornerWearRenderer, WearPatch } from './cornerWearRendering.ts';

interface BatchGroup<Name extends string> {
  material: Name;
  positions: number[];
  normals: number[];
  indices: number[];
  colors: number[];
  uvs: number[];
  roomBands: number[];
  wear?: WearPatch[];
}
export { roomBandAttribute } from './cornerWearRendering.ts';
export type RoomBand = readonly [role: number, lightBias: number, overlay: number, landing: number];
const neutralRoomBand: RoomBand = [0, 0, 0, 0];

export function tagRoomBand(mesh: Mesh, band: RoomBand): Mesh {
  const values = new Float32Array(mesh.getTotalVertices() * 4);
  for (let i = 0; i < values.length; i += 4) values.set(band, i);
  mesh.setVerticesData(roomBandAttribute, values, false, 4);
  return mesh;
}
export interface BoxInstance {
  size: Triple;
  position: Triple;
  rotation?: number;
  tint?: number;
}

export class Batcher<Name extends string> {
  private readonly groups = new Map<string, BatchGroup<Name>>();
  private readonly scene: Scene;
  private readonly materials: Record<Name, Material>;
  private readonly shadow: Pick<ShadowGenerator, 'addShadowCaster'>;
  private readonly withRoomBands: boolean;
  private readonly wear?: CornerWearRenderer;

  constructor(
    scene: Scene,
    materials: Record<Name, Material>,
    shadow: Pick<ShadowGenerator, 'addShadowCaster'>,
    withRoomBands = false,
    wear?: CornerWearRenderer,
  ) {
    this.scene = scene;
    this.materials = materials;
    this.shadow = shadow;
    this.withRoomBands = withRoomBands;
    this.wear = wear;
  }
  box(
    material: Name,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    tint = 1,
    mask = 63,
    group = '',
    band: RoomBand = neutralRoomBand,
    topBand: RoomBand = band,
    profile?: WearProfile,
  ): void {
    const id = `${material}:${group || `${Math.floor(x / 10)},${Math.floor(z / 10)}`}`;
    if (!this.groups.has(id))
      this.groups.set(id, {
        material,
        positions: [],
        normals: [],
        indices: [],
        colors: [],
        uvs: [],
        roomBands: [],
      });
    const b = required(this.groups.get(id), 'Missing batch group');
    if (profile && this.wear) {
      const emitted = boxFaces.flatMap((_, f) => (mask & (1 << f) ? [f] : []));
      (b.wear ??= []).push({
        vertex: b.positions.length / 3,
        index: b.indices.length,
        faceCount: emitted.length,
        faces: () => profileFaces([x, y, z], [w, h, d], mask, profile, 1),
        sourceFace: (f) => emitted.indexOf(f),
      });
    }
    boxFaces.forEach((face, f) => {
      if (!(mask & (1 << f))) return;
      const start = b.positions.length / 3;
      face.v.forEach((v, i) => {
        b.positions.push(x + (v[0] * w) / 2, y + (v[1] * h) / 2, z + (v[2] * d) / 2);
        b.normals.push(...face.n);
        b.colors.push(tint, tint, tint, 1);
        b.uvs.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0);
        if (this.withRoomBands) b.roomBands.push(...(face.n[1] === 1 ? topBand : band));
      });
      b.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    });
  }
  finish(): Mesh[] {
    const meshes: Mesh[] = [];
    for (const [id, b] of this.groups) {
      const mesh = new Mesh(id, this.scene),
        data = new VertexData();
      Object.assign(data, {
        positions: b.positions,
        normals: b.normals,
        indices: b.indices,
        colors: b.colors,
        uvs: b.uvs,
      });
      data.applyToMesh(mesh);
      if (this.withRoomBands) mesh.setVerticesData(roomBandAttribute, b.roomBands, false, 4);
      if (b.wear) this.wear?.register(mesh, b.wear);
      mesh.material = this.materials[b.material];
      mesh.receiveShadows = true;
      mesh.isPickable = false;
      mesh.freezeWorldMatrix();
      if (b.material !== 'floor') this.shadow.addShadowCaster(mesh);
      meshes.push(mesh);
    }
    this.groups.clear();
    return meshes;
  }
}

/** Keep MeshBuilder's Original buffer layout, UVs and bounds for a moving part. */
export function wearPart(mesh: Mesh, size: Triple, profile: WearProfile, wear: CornerWearRenderer) {
  const original = VertexData.ExtractFromMesh(mesh);
  const faceIndex = (face: number) => {
    const { n } = boxFaces[face];
    for (let i = 0; i < 6; i++)
      if (n.every((value, axis) => value === original.normals![i * 12 + axis])) return i;
    throw new Error('Missing door face');
  };
  const cornerUV = (face: number, corner: Triple) => {
    const start = faceIndex(face) * 4;
    for (let i = start; i < start + 4; i++)
      if (corner.every((sign, axis) => sign === Math.sign(original.positions![i * 3 + axis])))
        return [original.uvs![i * 2], original.uvs![i * 2 + 1]];
    throw new Error('Missing door UV');
  };
  wear.register(mesh, [
    {
      vertex: 0,
      index: 0,
      faceCount: 6,
      faces: () => profileFaces([0, 0, 0], size, 63, profile, 1),
      sourceFace: faceIndex,
      uv: ({ face }, u, v) => {
        const [a, b, , d] = boxFaces[face].v.map((corner) => cornerUV(face, corner));
        return [
          a[0] + (b[0] - a[0]) * u + (d[0] - a[0]) * v,
          a[1] + (b[1] - a[1]) * u + (d[1] - a[1]) * v,
        ];
      },
    },
  ]);
}

export function part(
  scene: Scene,
  mat: Material,
  name: string,
  dimensions: Triple,
  position: Triple,
  parent: Node | null = null,
  shadow: ShadowGenerator | null = null,
  outline = false,
): Mesh {
  const mesh = MeshBuilder.CreateBox(
    name,
    { width: dimensions[0], height: dimensions[1], depth: dimensions[2] },
    scene,
  );
  mesh.position.set(...position);
  mesh.material = mat;
  mesh.parent = parent;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  if (shadow) shadow.addShadowCaster(mesh);
  if (outline) {
    mesh.enableEdgesRendering(0.96);
    mesh.edgesWidth = 1.2;
    mesh.edgesColor = new Color4(0.025, 0.035, 0.04, 1);
  }
  return mesh;
}

export function thinBoxes(
  scene: Scene,
  material: Material,
  entries: BoxInstance[],
  name = 'rubble',
): Mesh | null {
  if (!entries.length) return null;
  const mesh = MeshBuilder.CreateBox(name, { size: 1 }, scene);
  mesh.material = material;
  mesh.isPickable = false;
  // Gameplay's custom visibility ray must intersect individual drawn boxes,
  // not the template at the origin or the batch's combined bounds.
  mesh.thinInstanceEnablePicking = true;
  mesh.receiveShadows = true;
  const matrices = new Float32Array(entries.length * 16),
    colors = new Float32Array(entries.length * 4);
  entries.forEach((e, i) => {
    Matrix.Compose(
      new Vector3(...e.size),
      Quaternion.RotationYawPitchRoll(e.rotation || 0, 0, 0),
      new Vector3(...e.position),
    ).copyToArray(matrices, i * 16);
    const c = e.tint ?? 1;
    colors.set([c, c, c, 1], i * 4);
  });
  mesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
  mesh.thinInstanceSetBuffer('color', colors, 4, true);
  mesh.thinInstanceRefreshBoundingInfo();
  return mesh;
}
