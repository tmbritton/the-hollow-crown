import { Spring } from '../animationCurves.ts';
import type { BlockFeedback } from '../blockFeedback.ts';

const center = Object.freeze([-0.17, -0.02, 0.07] as const);
/** One authored board contract for mesh construction and protective-frame constraints. */
export const SHIELD_GEOMETRY = Object.freeze({
  player: Object.freeze({ center, size: Object.freeze([0.14, 0.7, 0.55] as const) }),
  kobold: Object.freeze({ center, size: Object.freeze([0.14, 0.72, 0.62] as const) }),
});
export const SHIELD_PROJECTION_STEPS = 12;

export interface ShieldInput {
  guarded: boolean;
  opening: number;
  openingActive?: boolean;
  gate: boolean;
  preparation: number;
  forceReset: boolean;
  heading: number;
  dt: number;
  time: number;
}
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const bounded = (spring: Spring, target: number, dt: number, frequency: number, limit: number) => {
  if (spring.value === target && spring.velocity === 0) return;
  spring.advance(target, dt, frequency, 0.76);
  if (Math.abs(spring.value) > limit) {
    spring.value = clamp(spring.value, -limit, limit);
    spring.velocity = 0;
  }
  if (target === 0 && Math.abs(spring.value) < 1e-8 && Math.abs(spring.velocity) < 1e-7)
    spring.value = spring.velocity = 0;
};

/** Continuous presentation state beneath authoritative Defense/squad inputs. A raised shield's
 * target is protective immediately; supporting-body anticipation/recoil and lowering have inertia.
 * No chart here can enable blocking, delay vulnerability, or advance attack/work clocks. */
export class ShieldMotion {
  private readonly placement = new Spring();
  private readonly load = new Spring();
  private readonly impact = new Spring();
  private readonly lateral = new Spring();
  private readonly turn = new Spring();
  private readonly aperture = new Spring();
  private releaseOpening = 0;
  private previousHold = false;
  private previousOpening = 0;
  initialized = false;
  guarded = false;
  gate = false;
  get weight(): number {
    return clamp(this.placement.value, 0, 1);
  }
  get opening(): number {
    return clamp(this.aperture.value, 0, 1);
  }
  get brace(): number {
    return this.load.value;
  }
  get recoil(): number {
    return this.impact.value;
  }
  get side(): number {
    return this.lateral.value;
  }
  get counter(): number {
    return this.turn.value;
  }
  reset(): void {
    for (const s of [
      this.placement,
      this.load,
      this.impact,
      this.lateral,
      this.turn,
      this.aperture,
    ])
      s.value = s.velocity = 0;
    this.previousHold = this.gate = this.initialized = this.guarded = false;
    this.previousOpening = this.releaseOpening = 0;
  }
  snapshot() {
    return {
      weight: this.weight,
      opening: this.opening,
      gate: this.gate,
      brace: this.brace,
      recoil: this.recoil,
      side: this.side,
      counter: this.counter,
      velocities: [
        this.placement.velocity,
        this.load.velocity,
        this.impact.velocity,
        this.lateral.velocity,
        this.turn.velocity,
        this.aperture.velocity,
      ],
    };
  }
  sample(input: ShieldInput, feedback?: BlockFeedback): void {
    if (input.forceReset) {
      this.reset();
      feedback?.reset();
      return;
    }
    this.initialized = true;
    this.guarded = input.guarded;
    const opening = !!input.openingActive || input.opening > 0;
    const hold = input.guarded || opening;
    if (hold) {
      this.gate = input.gate;
    }
    if (opening) {
      if (input.dt > 0)
        this.aperture.velocity = clamp((input.opening - this.aperture.value) / input.dt, -6, 6);
      this.aperture.value = input.opening;
    }
    if (input.dt > 0) {
      if (!hold && this.previousHold) this.releaseOpening = this.aperture.value;
      if (hold && !this.previousHold) this.load.velocity = clamp(this.load.velocity + 1.8, -3, 3);
      if (input.guarded && this.previousOpening > 0 && input.opening === 0)
        this.load.velocity = clamp(this.load.velocity + 0.9, -3, 3);
      this.previousHold = hold;
      this.previousOpening = input.opening;
      const batch = feedback?.consume(input.time);
      if (batch) {
        const side =
          batch.travel.x * Math.cos(input.heading) - batch.travel.z * Math.sin(input.heading);
        const front =
          -batch.travel.x * Math.sin(input.heading) - batch.travel.z * Math.cos(input.heading);
        this.impact.velocity = clamp(this.impact.velocity + batch.power * front * 1.8, -3, 3);
        this.lateral.velocity = clamp(this.lateral.velocity + batch.power * side * 0.9, -1.8, 1.8);
        this.load.velocity = clamp(this.load.velocity + batch.power * 0.5, -3, 3);
      }
      const target = hold ? 1 : 0;
      if (this.placement.value !== target || this.placement.velocity !== 0) {
        this.placement.advance(target, input.dt, 18, 0.82);
        if (
          Math.abs(this.placement.value - target) < 0.0001 &&
          Math.abs(this.placement.velocity) < 0.002
        ) {
          this.placement.value = target;
          this.placement.velocity = 0;
        }
      }
      if (
        !opening &&
        (this.aperture.value !== (hold ? 0 : this.releaseOpening) || this.aperture.velocity !== 0)
      )
        this.aperture.advance(hold ? 0 : this.releaseOpening, input.dt, 18, 0.82);
      for (const spring of [this.placement, this.aperture]) {
        if (spring.value < 0) {
          spring.value = 0;
          spring.velocity = Math.max(0, spring.velocity);
        }
        if (spring.value > 1) {
          spring.value = 1;
          spring.velocity = Math.min(0, spring.velocity);
        }
      }
      bounded(this.load, clamp(input.preparation, 0, 1) * 0.045, input.dt, 18, 0.08);
      bounded(this.impact, 0, input.dt, 22, 0.075);
      bounded(this.lateral, 0, input.dt, 20, 0.04);
      bounded(this.turn, hold ? input.opening * 0.06 : 0, input.dt, 16, 0.08);
    }
  }
  /** The planner projects only an actually unprotected frame. Inward velocity and all supporting
   * channels survive; velocity into the newly active boundary is the only discarded component. */
  project(weight: number, opening: number): void {
    if (weight > this.weight + 1e-12) {
      this.placement.value = weight;
      this.placement.velocity = Math.max(0, this.placement.velocity);
    }
    if (opening < this.opening - 1e-12) {
      this.aperture.value = opening;
      this.aperture.velocity = Math.min(0, this.aperture.velocity);
    }
  }
}
