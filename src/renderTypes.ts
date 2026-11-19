import type { Scene } from '@babylonjs/core/scene';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import type { Materials, MaterialName } from './materials.ts';
import type { Footprint, PortraitEntity } from './worldTypes.ts';

export interface LightSource {
  position: Vector3;
  color: Color3;
  phase: number;
}
export interface Creature {
  root: TransformNode;
  /** Root-local envelope covering the authored ambient motion; broad-phase rejection only. */
  observationRadius: number;
  head: TransformNode;
  tail: TransformNode;
  phase: number;
}
export interface FloatingObject {
  mesh: Mesh;
  y: number;
  phase: number;
  spin: number;
}
export interface Wall {
  meshes: Mesh[];
  dx: number;
  dz: number;
  x: number;
  z: number;
  scale: number;
}
export interface Obstacle extends Footprint {
  mesh: Mesh;
}
export interface Portrait {
  root: TransformNode;
  panel: Mesh;
  entity: PortraitEntity;
  dx: number;
  dz: number;
  inspected: boolean;
  detailScale: number;
}
export type BoxBuilder = (
  material: MaterialName,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  tint?: number,
) => void;
export interface PropBuildContext {
  scene: Scene;
  materials: Materials;
  shadow: ShadowGenerator;
  glow: GlowLayer;
  box: BoxBuilder;
  transform: (x: number, z: number, w?: number, d?: number) => Footprint;
  lights: LightSource[];
  flames: Mesh[];
  creatures: Creature[];
}
