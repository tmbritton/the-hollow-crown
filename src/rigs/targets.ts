import type { JointName, XYZ } from './types.ts';

export type QuaternionTuple = readonly [number, number, number, number];
export type Effector = 'leftSole' | 'rightSole' | 'leftGrip' | 'rightGrip';
export const effectors: readonly Effector[] = ['leftSole', 'rightSole', 'leftGrip', 'rightGrip'];

/** Joint-space frames are sampled from the authored input, never the changing solved pose.
 * Equipment can therefore supply one frame with two sockets without a solver/parent cycle. */
export type TargetSpace =
  | { readonly space: 'world' | 'rig' }
  | { readonly space: 'joint'; readonly joint: JointName };
export type RigTarget = TargetSpace & {
  readonly position: XYZ;
  /** Socket orientation (XYZW), not the bone's hidden pivot. Omitted = preserve base orientation. */
  readonly rotation?: QuaternionTuple;
  /** Required contacts share priority zero. Others use priority 1 (default) or 2. */
  readonly required?: boolean;
  readonly priority?: 1 | 2;
  /** Weight in body compensation / residual ranking, not permission to stretch a link. */
  readonly weight?: number;
  /** Release is action-owned. The solver never silently releases an unreachable hand/foot. */
  readonly release?: boolean;
  /** Rest bend pole perpendicular to the -Y links, transported with their swing. */
  readonly bendHint?: XYZ;
};
export type RigTargets = Readonly<Partial<Record<Effector, RigTarget>>>;
export interface TargetResidual {
  active: boolean;
  required: boolean;
  position: number;
  orientation: number;
  satisfied: boolean;
}
