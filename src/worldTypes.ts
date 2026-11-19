import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { InspectionTarget } from './inspection.ts';
import type { RoyalPortrait } from './royalty.ts';
import type { KeepIdentity } from './generation/keep.ts';

export type Random = () => number;
export type Axis = 'x' | 'z';
export type Pair = [number, number];
export type Triple = [number, number, number];
export interface Point {
  x: number;
  z: number;
}
export interface Spawn extends Point {
  h: number;
}
export interface Frame extends Point {
  rotation?: number;
}
export interface Footprint extends Frame {
  w: number;
  d: number;
}
export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type RoomId =
  | 'entrance'
  | 'water'
  | 'stairs'
  | 'lava'
  | 'altar'
  | 'throne'
  | 'crypt'
  | 'armory'
  | 'treasury'
  | 'butchery'
  | 'smithy'
  | 'bakery'
  | 'stable';
export type RoomShape = 'rectangle' | 'octagon' | 'cross';
export interface LayoutNode {
  gx: number;
  gz: number;
  parent: number;
  depth: number;
}
export interface Pool extends Point {
  hw: number;
  hd: number;
  bridgeAxis: Axis;
  cutCorners: boolean;
}
export interface Room extends LayoutNode, Spawn {
  id: RoomId;
  name: string;
  kicker: string;
  description: string;
  factIds?: string[];
  w: number;
  d: number;
  shape: RoomShape;
  ports: { axis: Axis; cross: number; direction: number }[];
  pool?: Pool;
}
export interface Ramp {
  axis: Axis;
  start: number;
  distance: number;
  sign: number;
  a: number;
  b: number;
}
export type Surface = 'stone' | 'stair' | 'bridge' | 'dais' | 'water' | 'lava';
export interface Tile extends Spawn {
  surface: Surface;
  room?: RoomId;
  ramp?: Ramp | null;
  blocked?: boolean;
}
export interface Connection extends Point {
  id: string;
  a: RoomId;
  b: RoomId;
  axis: Axis;
  cross: number;
  start: number;
  end: number;
  sign: number;
  distance: number;
  ramp: Ramp | null;
  width: number;
  points: Point[];
  door?: string;
}

export type PropType =
  | 'pillar'
  | 'shrine'
  | 'sarcophagus'
  | 'anvil'
  | 'rack'
  | 'crates'
  | 'barrel'
  | 'butcher-block'
  | 'meat-rack'
  | 'furnace'
  | 'tool-bench'
  | 'quench'
  | 'bread-oven'
  | 'bread-table'
  | 'bread-rack'
  | 'flour-sacks'
  | 'lizard-stall'
  | 'feed-trough'
  | 'tack-rack'
  | 'hay-bales';
export type PlacedType = PropType | 'altar' | 'throne' | 'chest';
export interface Placement<T extends PlacedType = PlacedType> extends Footprint, Spawn {
  id: string;
  type: T;
  room: RoomId;
  rotation: number;
  variant: number;
  approach?: Point;
  frontClearance?: Point;
}
export interface Prop extends Placement<PropType> {
  height?: number;
  torch?: boolean;
}
interface EntityBase extends Spawn, Frame {
  id: string;
  room?: RoomId;
  approach?: Point;
  collider?: Mesh;
  inspection?: InspectionTarget;
}
export interface DoorEntity extends EntityBase {
  type: 'door';
  axis: Axis;
  locked: boolean;
  requiresAltar: boolean;
  open: boolean;
  pivot?: TransformNode;
  angle?: number;
  seal?: Mesh;
}
export interface AltarEntity extends Omit<EntityBase, 'room' | 'rotation'>, Placement<'altar'> {
  approach: Point;
  active: boolean;
  crystal?: Mesh;
  rune?: Mesh;
}
export interface ThroneEntity extends Omit<EntityBase, 'room' | 'rotation'>, Placement<'throne'> {
  approach: Point;
}
export interface ChestEntity extends Omit<EntityBase, 'room' | 'rotation'>, Placement<'chest'> {
  approach: Point;
  open: boolean;
  lid?: TransformNode;
  angle?: number;
}
export interface PortraitEntity extends EntityBase {
  type: 'portrait';
  room: RoomId;
  rotation: number;
  approach: Point;
  wallDirection: Pair;
  royal: RoyalPortrait;
  panel?: Mesh;
}
export type Entity = DoorEntity | AltarEntity | ThroneEntity | ChestEntity | PortraitEntity;
export type EntityType = Entity['type'];
export type ApproachableEntity = Entity & { approach: Point };
export function hasApproach(entity: Entity): entity is ApproachableEntity {
  return entity.approach !== undefined;
}

export interface World {
  seed: string;
  keep: KeepIdentity;
  attempt: number;
  rooms: Room[];
  roomById: Record<RoomId, Room>;
  tiles: Map<string, Tile>;
  entities: Entity[];
  connections: Connection[];
  props: Prop[];
  blockers: (Footprint & { id: string })[];
  reserved: Set<string>;
  spawn: Spawn;
  bounds: Bounds;
}
