import { sampleCurve } from './animationCurves.ts';
import type { PoseCurve } from './animationCurves.ts';

export type GaitStyle = 'ordinary' | 'skeleton';
const TAU = Math.PI * 2;
const cycle = (value: number) => ((value % 1) + 1) % 1;
const COLLAPSE: PoseCurve = [
  [0, 0.1],
  [0.12, 0],
  [0.5, 1],
  [0.64, 0.95],
  [0.8, 0],
  [1, 0.1],
];
const SWAY: PoseCurve = [
  [0, -0.4],
  [0.18, 0.2],
  [0.52, 1],
  [0.64, 0.8],
  [0.8, -1],
  [1, -0.4],
];

/** Phase 0..PI is stance; PI..TAU is swing. The skeleton loads its left leg for
 * 64% of measured travel, then catches up on the right. Pose and contact must agree. */
export function gaitFootPhase(stride: number, foot: number, style: GaitStyle = 'ordinary'): number {
  if (style === 'ordinary') return (((stride + Math.PI / 2 + foot * Math.PI) % TAU) + TAU) % TAU;
  const duty = foot === 0 ? 0.64 : 0.36;
  const t = cycle(stride / TAU - (foot === 0 ? 0 : 0.64));
  return t < duty ? (t / duty) * Math.PI : Math.PI + ((t - duty) / (1 - duty)) * Math.PI;
}

/** Stateless, distance-sampled offsets: a slow collapse over the loaded leg, a short
 * recovery, and a skull that trails the ribs. No motor or action-clock ownership. */
export function skeletonLurch(stride: number) {
  const t = cycle(stride / TAU);
  const collapse = sampleCurve(t, COLLAPSE);
  const sway = sampleCurve(t, SWAY);
  const lag = Math.sin(TAU * cycle(t - 0.1));
  return {
    leftLeg: -Math.cos(gaitFootPhase(stride, 0, 'skeleton')) * 0.64,
    rightLeg: -Math.cos(gaitFootPhase(stride, 1, 'skeleton')) * 0.42,
    lean: 0.04 + collapse * 0.28,
    roll: sway * 0.14,
    twist: -sway * 0.09,
    bob: -collapse * 0.035,
    headPitch: -0.08 + lag * 0.12,
    headRoll: -sway * 0.08 + lag * 0.06,
  };
}
