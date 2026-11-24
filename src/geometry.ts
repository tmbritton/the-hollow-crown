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

interface BatchGroup<Name extends string> {
  material: Name;
  positions: number[];
  normals: number[];
  indices: number[];
  colors: number[];
  uvs: number[];
  roomBands: number[];
}
export const roomBandAttribute = 'roomBand';
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

// CCW when viewed from outside in Babylon's left-handed scene.
const faces = [
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

export class Batcher<Name extends string> {
  private readonly groups = new Map<string, BatchGroup<Name>>();
  private readonly scene: Scene;
  private readonly materials: Record<Name, Material>;
  private readonly shadow: Pick<ShadowGenerator, 'addShadowCaster'>;
  private readonly withRoomBands: boolean;

  constructor(
    scene: Scene,
    materials: Record<Name, Material>,
    shadow: Pick<ShadowGenerator, 'addShadowCaster'>,
    withRoomBands = false,
  ) {
    this.scene = scene;
    this.materials = materials;
    this.shadow = shadow;
    this.withRoomBands = withRoomBands;
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
    faces.forEach((face, f) => {
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
