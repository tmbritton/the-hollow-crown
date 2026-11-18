import { Statechart } from './machines/statechart.ts';
import { locomotionMachine } from './machines/actors/locomotion.ts';

export const WALK_SPEED = 4.8;
export const RUN_SPEED = 7.4;
export const MOVEMENT_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

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
}
export interface LocomotionPose {
  leftLeg: number;
  rightLeg: number;
  leftArm: number;
  rightArm: number;
  lean: number;
  bob: number;
  cape: number;
}
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
): LocomotionPose {
  const moving = actualSpeed > 0.08;
  state.chart.send({ type: 'SAMPLE', moving, wantsMovement, dt });
  const phase = state.phase;
  state.time += dt;
  state.stride += actualSpeed * dt * 2.7;
  const targetBlend = Math.min(1, actualSpeed / WALK_SPEED);
  state.blend += (targetBlend - state.blend) * (1 - Math.exp(-18 * dt));
  const start = phase === 'starting' ? Math.sin(Math.PI * Math.min(1, state.phaseTime / 0.18)) : 0;
  const stop = phase === 'stopping' ? Math.sin(Math.PI * Math.min(1, state.phaseTime / 0.24)) : 0;
  const swing = Math.sin(state.stride) * 0.58 * state.blend;
  const plant = (Math.sin(state.stride) >= 0 ? 1 : -1) * stop * 0.13;
  return {
    leftLeg: swing - start * 0.13 - plant,
    rightLeg: -swing + start * 0.13 + plant,
    leftArm: -swing * 0.65 - start * 0.1 - stop * 0.12,
    rightArm: swing * 0.65 + start * 0.1 - stop * 0.12,
    lean: state.blend * 0.08 + start * 0.12 - stop * 0.14,
    bob:
      Math.sin(state.time * 2) * 0.018 * (1 - state.blend) +
      Math.abs(Math.sin(state.stride)) * 0.055 * state.blend -
      start * 0.045 -
      stop * 0.025,
    cape:
      -0.16 -
      state.blend * 0.15 +
      Math.sin(state.stride - 0.4) * 0.08 * state.blend -
      start * 0.12 +
      stop * 0.1,
  };
}
