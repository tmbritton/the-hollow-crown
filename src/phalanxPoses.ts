import { sampleCurve } from './animationCurves.ts';
import type { Swing } from './machines/actors/attack.ts';

/** Pure presentation samples. No pose decides reach, release, defense or damage. */
export function spearPose(swing: Swing | null) {
  if (!swing || (swing.kind !== 'LONG_THRUST' && swing.kind !== 'THROW_JAVELIN'))
    return {
      pitch: -Math.PI / 2,
      extension: 0,
      arm: -0.5,
      elbow: 0.8,
      throwing: false,
      released: false,
    };
  const t =
    swing.elapsed <= swing.impact
      ? swing.elapsed / swing.impact
      : 1 + (swing.elapsed - swing.impact) / (swing.duration - swing.impact);
  const throwing = swing.kind === 'THROW_JAVELIN';
  return {
    pitch: throwing
      ? sampleCurve(t, [
          [0, -0.5],
          [0.65, -0.3],
          [1, 0],
          [2, 0],
        ])
      : sampleCurve(t, [
          [0, -Math.PI / 2],
          [0.65, 0],
          [1, 0],
          [1.35, 0],
          [2, -Math.PI / 2],
        ]),
    extension: sampleCurve(t, [
      [0, 0],
      [0.65, -0.2],
      [1, 1],
      [1.15, 1],
      [1.65, 0],
      [2, 0],
    ]),
    arm: throwing
      ? sampleCurve(t, [
          [0, -0.5],
          [0.65, -2.7],
          [1, -1.4],
          [1.4, -0.7],
          [2, -0.5],
        ])
      : sampleCurve(t, [
          [0, -0.5],
          [0.65, -0.8],
          [1, -1.5],
          [1.35, -1.5],
          [2, -0.5],
        ]),
    elbow: throwing
      ? 0.5
      : sampleCurve(t, [
          [0, 0.8],
          [0.65, 1],
          [1, 0.05],
          [1.35, 0.05],
          [2, 0.8],
        ]),
    throwing,
    released: swing.resolved,
  };
}
