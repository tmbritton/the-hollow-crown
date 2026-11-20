export type XYZ = readonly [number, number, number];
export const jointNames = [
  'root',
  'pelvis',
  'spine',
  'chest',
  'neck',
  'head',
  'leftShoulder',
  'leftUpperArm',
  'leftForearm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightForearm',
  'rightHand',
  'leftThigh',
  'leftShin',
  'leftFoot',
  'rightThigh',
  'rightShin',
  'rightFoot',
] as const;
export type JointName = (typeof jointNames)[number];
export const tailNames = ['tailBase', 'tailMiddle', 'tailEnd', 'tailTip'] as const;
export type TailName = (typeof tailNames)[number];
export interface TailSegment {
  readonly name: TailName;
  readonly index: number;
  readonly length: number;
  readonly width: number;
  readonly height: number;
}
export type SocketName = 'leftGrip' | 'rightGrip' | 'leftSole' | 'rightSole' | 'gaze' | 'back';
export interface RigProfile {
  readonly id: 'player' | 'skeleton' | 'goblin' | 'kobold';
  readonly hipWidth: number;
  readonly shoulderWidth: number;
  readonly shoulderHeight: number;
  readonly headHeight: number;
  readonly soleForward: number;
  readonly soleHalfWidth: number;
  readonly soleHalfDepth: number;
  readonly gait: 'ordinary' | 'skeleton';
  /** Authored gait normalization, not authoritative motor speed. */
  readonly gaitSpeed: number;
}
export interface JointDefinition {
  readonly name: JointName | TailName;
  readonly parent: number;
  readonly rest: XYZ;
  /** Local primary axis / intrinsic Y-X-Z Euler limits in radians, enforced by target solving. */
  readonly axis: XYZ;
  readonly limits: readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
}
export interface LimbChain {
  readonly root: JointName;
  readonly middle: JointName;
  readonly end: JointName;
  readonly upperLength: number;
  readonly lowerLength: number;
  readonly bendHint: XYZ;
}
export interface RigDefinition {
  readonly family: 'humanoid' | 'humanoid-with-tail';
  readonly tail?: readonly TailSegment[];
  readonly profile: RigProfile;
  readonly joints: readonly JointDefinition[];
  readonly index: Readonly<Record<JointName, number>>;
  readonly chains: Readonly<Record<'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg', LimbChain>>;
  readonly sockets: Readonly<
    Record<
      SocketName,
      { readonly joint: JointName; readonly offset: XYZ; readonly forward: XYZ; readonly up: XYZ }
    >
  >;
  /** Coarse anatomical mappings, not a physics implementation or one body per voxel. */
  readonly bodies: readonly {
    readonly joint: JointName | TailName;
    readonly center: XYZ;
    readonly size: XYZ;
  }[];
}

/** Small mutable numerical views, allocated once per pose/legacy channel, never scene nodes. */
export class PoseVector {
  x = 0;
  y = 0;
  z = 0;
  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  setAll(value: number): this {
    return this.set(value, value, value);
  }
  copyFrom(value: { x: number; y: number; z: number }): this {
    return this.set(value.x, value.y, value.z);
  }
  scaleInPlace(value: number): this {
    return this.set(this.x * value, this.y * value, this.z * value);
  }
}
export interface JointPose {
  readonly position: PoseVector;
  readonly rotation: { x: number; y: number; z: number; w: number };
  readonly scale: PoseVector;
}
export interface PoseBuffer {
  readonly definition: RigDefinition;
  readonly local: readonly JointPose[];
  /** Column-major local/world matrices. World +Y up, +Z forward; gameplay vertical is h. */
  readonly matrices: Float64Array;
  readonly world: Float64Array;
  readonly previousWorld: Float64Array;
}
