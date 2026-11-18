import { sampleCurve, sampleMotionCurve } from './animationCurves.ts';
import type { PoseCurve } from './animationCurves.ts';
import type { LocomotionPose } from './locomotion.ts';
import type { SocialActivity } from './social.ts';
import { JUMP_PRELOAD, JUMP_SPEED } from './jump.ts';
import type { Jump } from './jump.ts';

const WINDUP: PoseCurve = [
  [0, 0],
  [0.12, 0.25],
  [0.36, 1],
  [0.5, 0],
  [1, 0],
];
const STRIKE: PoseCurve = [
  [0, 0],
  [0.36, 0],
  [0.5, 1],
  [0.58, 1.12],
  [0.78, -0.12],
  [1, 0],
];
const RECOIL: PoseCurve = [
  [0, 0],
  [0.5, 0],
  [0.57, 1],
  [0.7, -0.25],
  [0.86, 0.1],
  [1, 0],
];
const AIM: PoseCurve = [
  [0, 0],
  [0.12, -0.14],
  [0.38, 1],
  [0.65, 1],
  [1, 0],
];
const SWORD: PoseCurve = [
  [0, 0],
  [0.12, 0.18],
  [0.36, -2.35],
  [0.5, -1.4],
  [0.58, 0.8],
  [0.8, -0.15],
  [1, 0],
];

/** Both melee contact and crossbow release coincide exactly with the combat clock. */
export function attackPose(
  elapsed: number,
  duration: number,
  impact: number,
  ranged: boolean,
): LocomotionPose {
  const time =
    elapsed <= impact
      ? (elapsed / impact) * 0.5
      : 0.5 + ((elapsed - impact) / (duration - impact)) * 0.5;
  const wind = sampleCurve(time, WINDUP);
  const strike = sampleCurve(time, STRIKE);
  const recoil = sampleCurve(time, RECOIL);
  const aim = sampleCurve(time, AIM);
  const stretch = 1 - wind * 0.075 + strike * 0.045 - recoil * 0.045;
  return {
    leftLeg: -wind * 0.14 - strike * 0.24,
    rightLeg: wind * 0.18 + strike * 0.26,
    leftKnee: wind * 0.2 + strike * 0.3,
    rightKnee: wind * 0.15,
    leftArm: ranged ? -aim * 1.1 + recoil * 0.16 : -wind * 0.65 - strike * 0.4,
    rightArm: ranged ? -aim * 1.45 + recoil * 0.24 : sampleMotionCurve(time, SWORD),
    leftElbow: ranged ? aim * 0.25 : wind * 0.3,
    rightElbow: ranged ? aim * 0.15 + recoil * 0.2 : wind * 0.4,
    armSpread: wind * 0.08 + strike * 0.12,
    lean: ranged ? aim * 0.08 - recoil * 0.14 : -wind * 0.14 + strike * 0.24 - recoil * 0.05,
    roll: 0,
    twist: ranged ? aim * -0.12 : wind * -0.32 + strike * 0.38,
    bob: -wind * 0.035 - recoil * 0.02,
    lift: 0,
    stretch,
    reach: 1 / Math.sqrt(stretch) + (ranged ? -recoil * 0.075 : strike * 0.09),
    cape: -0.16 + wind * 0.1 - strike * 0.18 + recoil * 0.14,
  };
}

const FALL: PoseCurve = [
  [0, 0],
  [0.055, -0.1],
  [0.14, 0.12],
  [0.4, Math.PI / 2],
  [0.47, 1.46],
  [0.62, Math.PI / 2],
];
const FALL_LOAD: PoseCurve = [
  [0, 0],
  [0.055, 1],
  [0.16, -0.5],
  [0.32, 0],
  [0.62, 0],
];
const FALL_IMPACT: PoseCurve = [
  [0, 0],
  [0.34, 0],
  [0.4, 1],
  [0.47, -0.3],
  [0.62, 0],
];

export function deathPose(age: number) {
  const load = sampleCurve(age, FALL_LOAD);
  const impact = sampleCurve(age, FALL_IMPACT);
  return {
    rotation: sampleCurve(age, FALL),
    height: sampleCurve(age, [
      [0, 0],
      [0.14, 0],
      [0.4, 0.24],
      [0.47, 0.29],
      [0.62, 0.24],
    ]),
    stretch: 1 - load * 0.09 + impact * 0.035,
    reach: 1 - impact * 0.18,
    arm: -0.7 - load * 0.35 + impact * 0.18,
  };
}

/** Receiver winds up before the pass boundary; sender follows through after contact. */
export function hackySackKick(progress: number, receiving: boolean): number {
  return receiving
    ? sampleCurve(progress, [
        [0, 0],
        [0.8, 0],
        [0.9, 0.32],
        [1, -0.9],
      ])
    : sampleCurve(progress, [
        [0, -0.9],
        [0.07, -1.12],
        [0.2, 0.14],
        [0.34, 0],
        [1, 0],
      ]);
}

export function socialPose(activity: SocialActivity, time: number, kick = 0): LocomotionPose {
  const pose = attackPose(0, 1, 0.5, false);
  if (activity === 'cards') {
    const deal = sampleCurve((time / 2.8) % 1, [
      [0, 0],
      [0.16, -0.22],
      [0.3, 1],
      [0.38, 1.12],
      [0.55, -0.1],
      [0.7, 0],
      [1, 0],
    ]);
    pose.bob = -0.3 - deal * 0.015;
    pose.lean = 0.16 + deal * 0.08;
    pose.leftLeg = pose.rightLeg = -0.75;
    pose.leftKnee = pose.rightKnee = 1.2;
    pose.leftArm = -0.85;
    pose.rightArm = -0.9 - deal * 0.35;
    pose.stretch = 1 - Math.max(0, -deal) * 0.06;
    pose.reach = 1 + deal * 0.035;
  } else if (activity === 'smoke') {
    const puff = sampleCurve((time / 4) % 1, [
      [0, 0],
      [0.12, -0.12],
      [0.34, 1],
      [0.5, 1],
      [0.65, -0.2],
      [0.82, 0],
      [1, 0],
    ]);
    pose.rightArm = -1.8 - puff * 0.25;
    pose.lean = -puff * 0.035;
    pose.twist = Math.sin(time * 0.5) * 0.06;
    pose.stretch = 1 + puff * 0.025;
    pose.reach = 1 / Math.sqrt(pose.stretch);
  } else {
    pose.rightLeg = kick;
    pose.armSpread = 0.15 + Math.abs(kick) * 0.15;
    pose.lean = kick * 0.09;
    pose.stretch = 1 - Math.max(0, kick) * 0.15 + Math.max(0, -kick) * 0.025;
    pose.reach = 1 / Math.sqrt(pose.stretch);
  }
  return pose;
}

/** Takeoff, tuck and landing preparation follow the actual ballistic velocity. */
export function applyJumpPose(pose: LocomotionPose, jump: Jump): void {
  if (jump.preload > 0) {
    const load = 1 - jump.preload / JUMP_PRELOAD;
    pose.stretch *= 1 - load * 0.14;
    pose.bob -= load * 0.07;
    pose.lean -= load * 0.12;
    pose.leftArm += load * 0.35;
    pose.rightArm += load * 0.35;
    pose.lift = 0;
  } else if (jump.airborne) {
    const velocity = Math.max(-1, Math.min(1, jump.velocity / JUMP_SPEED));
    const tuck = 1 - Math.abs(velocity);
    pose.leftLeg = -0.15 - tuck * 0.65;
    pose.rightLeg = 0.12 - tuck * 0.45;
    pose.leftKnee = 0.2 + tuck * 1.1;
    pose.rightKnee = 0.35 + tuck * 1.25;
    pose.leftArm = -0.75 - Math.max(0, velocity) * 0.4;
    pose.rightArm = -0.55 - Math.max(0, velocity) * 0.35;
    pose.leftElbow = pose.rightElbow = 0.55;
    pose.armSpread = 0.12 + Math.max(0, -velocity) * 0.16;
    pose.lean *= 0.4;
    pose.bob = -tuck * 0.025;
    pose.lift = 0;
    pose.stretch = 1 + Math.abs(velocity) * 0.09 - tuck * 0.035;
    pose.reach = 1 / Math.sqrt(pose.stretch);
    pose.cape = -0.25 - velocity * 0.2;
  }
}
