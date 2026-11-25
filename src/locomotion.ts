import { Statechart } from './machines/statechart.ts';
import { locomotionMachine } from './machines/actors/locomotion.ts';
import { sampleCurve, smoothStep, Spring } from './animationCurves.ts';
import type { PoseCurve } from './animationCurves.ts';
import { JUMP_GRAVITY } from './jump.ts';
import { skeletonLurch } from './skeletonGait.ts';
import type { GaitStyle } from './skeletonGait.ts';

export const WALK_SPEED = 4.8;
export const RUN_SPEED = 7.4;

export type LocomotionPhase = 'idle' | 'starting' | 'moving' | 'stopping';
export class Locomotion {
  readonly chart = new Statechart(locomotionMachine);
  get phase(): LocomotionPhase {
    return this.chart.snapshot.value;
  }
  get phaseTime(): number {
    return this.chart.snapshot.context.phaseTime;
  }
  time = 0;
  stride = 0;
  blend = 0;
  run = 0;
  forwardLean = new Spring();
  sideLean = new Spring();
  compression = new Spring();
  crouch = new Spring();
  cape = new Spring(-0.16);
  landings = 0;
}
export interface LocomotionPose {
  leftLeg: number;
  rightLeg: number;
  leftKnee: number;
  rightKnee: number;
  leftArm: number;
  rightArm: number;
  leftElbow: number;
  rightElbow: number;
  armSpread: number;
  lean: number;
  roll: number;
  twist: number;
  bob: number;
  lift: number;
  stretch: number;
  reach: number;
  cape: number;
}

// The first two frames load against travel, then release and briefly recoil.
const START_LOAD: PoseCurve = [
  [0, 0],
  [0.025, 1],
  [0.065, 0],
  [0.18, 0],
];
const START_PUSH: PoseCurve = [
  [0, 0],
  [0.035, 0],
  [0.085, 1],
  [0.135, -0.16],
  [0.18, 0],
];
const STOP_BRACE: PoseCurve = [
  [0, 0],
  [0.025, -0.22],
  [0.09, 1],
  [0.15, 0.6],
  [0.2, -0.18],
  [0.24, 0],
];
export function createLocomotion(): Locomotion {
  return new Locomotion();
}

/** Short, frame-rate-independent easing; steering itself stays responsive. */
export function easeSpeed(speed: number, target: number, dt: number): number {
  const duration = target > speed ? 0.075 : 0.055;
  const next = speed + (target - speed) * (1 - Math.exp(-dt / duration));
  return target === 0 && next < 0.025 ? 0 : next;
}

/** Animate from measured travel, so collision cannot produce a running-in-place loop. */
export function animateLocomotion(
  state: Locomotion,
  actualSpeed: number,
  wantsMovement: boolean,
  dt: number,
  walkSpeed = WALK_SPEED,
  airborne = false,
  style: GaitStyle = 'ordinary',
): LocomotionPose {
  const moving = actualSpeed > 0.08;
  state.chart.send({ type: 'SAMPLE', moving, wantsMovement, dt });
  const phase = state.phase;
  state.time += dt;
  const runSpeed = walkSpeed * (RUN_SPEED / WALK_SPEED);
  const targetRun = smoothStep((actualSpeed - walkSpeed) / (runSpeed - walkSpeed));
  state.run += (targetRun - state.run) * (1 - Math.exp(-14 * dt));
  // A run covers more ground per stride; phase stays continuous through gait changes.
  if (!airborne) state.stride += actualSpeed * dt * (2.7 - state.run * 0.65);
  const targetBlend = Math.min(1, actualSpeed / walkSpeed);
  state.blend += (targetBlend - state.blend) * (1 - Math.exp(-18 * dt));
  const load = phase === 'starting' ? sampleCurve(state.phaseTime, START_LOAD) : 0;
  const start = phase === 'starting' ? sampleCurve(state.phaseTime, START_PUSH) : 0;
  const stop = phase === 'stopping' ? sampleCurve(state.phaseTime, STOP_BRACE) : 0;
  const gait = state.blend * (1 - load * 0.8);
  const run = state.run;
  const cycle = Math.sin(state.stride);
  const swing = cycle * (0.58 + run * 0.42) * gait;
  const plant = (Math.sin(state.stride) >= 0 ? 1 : -1) * stop * 0.13;
  // Two loading/release beats per stride. The short airborne arc peaks at passing.
  const contact = Math.pow(Math.abs(cycle), 8);
  const flight = Math.max(0, 1 - Math.abs(cycle) / 0.7);
  const arc = flight * (2 - flight);
  // Gravity fixes the height of each airborne arc. Faster cadence produces a flatter run.
  const cadence = Math.max(walkSpeed, actualSpeed) * (2.7 - run * 0.65);
  const flightTime = (2 * Math.asin(0.7)) / cadence;
  const flightHeight = Math.min(0.1, (JUMP_GRAVITY * flightTime * flightTime) / 8);
  const stretch =
    1 +
    gait * ((1 - contact) * (0.012 + run * 0.035) - contact * (0.035 + run * 0.065)) -
    load * 0.085 +
    start * 0.055 -
    stop * 0.055;
  const pose = {
    leftLeg: swing + load * 0.12 - start * 0.13 - plant,
    rightLeg: -swing - load * 0.12 + start * 0.13 + plant,
    leftKnee: 0.12 + Math.max(0, -Math.cos(state.stride)) * run * 0.9,
    rightKnee: 0.12 + Math.max(0, Math.cos(state.stride)) * run * 0.9,
    leftArm: -swing * (0.65 + run * 0.35) - start * 0.14 - stop * 0.12,
    rightArm: swing * (0.65 + run * 0.35) + start * 0.14 - stop * 0.12,
    leftElbow: gait * (0.12 + run * (0.95 + cycle * 0.18)),
    rightElbow: gait * (0.12 + run * (0.95 - cycle * 0.18)),
    armSpread: run * gait * 0.1,
    lean: gait * (0.08 + run * 0.22) - load * 0.13 + start * 0.17 - stop * 0.2,
    roll: 0,
    twist: cycle * gait * (0.025 + run * 0.085),
    bob:
      Math.sin(state.time * 2) * 0.018 * (1 - state.blend) -
      Math.abs(cycle) * (0.07 + run * 0.06) * gait -
      load * 0.025 -
      stop * 0.015,
    lift: arc * run * gait * flightHeight,
    stretch,
    reach: 1 / Math.sqrt(stretch) + start * 0.025 + run * gait * 0.02,
    cape:
      -0.16 -
      gait * (0.15 + run * 0.18) +
      Math.sin(state.stride - 0.7) * (0.08 + run * 0.05) * gait -
      start * 0.14 +
      stop * 0.17,
  };
  if (style === 'skeleton' && !airborne) {
    const lurch = skeletonLurch(state.stride);
    pose.leftLeg += lurch.leftLeg * gait - swing;
    pose.rightLeg += lurch.rightLeg * gait + swing;
    pose.lean += lurch.lean * gait;
    pose.roll += lurch.roll * gait;
    pose.twist += lurch.twist * gait;
    pose.bob += lurch.bob * gait;
  }
  return pose;
}
