import { Spring } from '../animationCurves.ts';
import { validateRig } from './humanoid.ts';
import { compose, multiplyAffine, setEuler } from './pose.ts';
import { tailNames } from './types.ts';
import type { JointDefinition, PoseBuffer, RigDefinition, TailSegment, XYZ } from './types.ts';

const extensions = new WeakMap<RigDefinition, RigDefinition>();
/** Anatomical extension: no copied arms/legs, role dependency or rendering imports. */
export function withTail(core: RigDefinition): RigDefinition {
  if (core.tail) return core;
  const cached = extensions.get(core);
  if (cached) return cached;
  const tail: readonly TailSegment[] = Object.freeze(
    tailNames.map((name, i) =>
      Object.freeze({
        name,
        index: core.joints.length + i,
        length: [0.22, 0.2, 0.18, 0.15][i],
        width: [0.15, 0.12, 0.09, 0.055][i],
        height: [0.12, 0.08, 0.06, 0.045][i],
      }),
    ),
  );
  const joints: JointDefinition[] = tail.map((s, i) =>
    Object.freeze({
      name: s.name,
      parent: i ? tail[i - 1].index : core.index.pelvis,
      rest: Object.freeze(i ? [0, 0, -tail[i - 1].length] : [0, -0.12, -0.22]) as XYZ,
      axis: Object.freeze([1, 0, 0]) as XYZ,
      limits: Object.freeze([
        Object.freeze(i ? [-0.8, 1.1] : [-2, 1.55]),
        Object.freeze(i ? [-0.65, 0.65] : [-1.2, 1.2]),
        Object.freeze([0, 0]),
      ]) as JointDefinition['limits'],
    }),
  );
  const definition: RigDefinition = Object.freeze({
    ...core,
    family: 'humanoid-with-tail',
    tail,
    joints: Object.freeze([...core.joints, ...joints]),
    bodies: Object.freeze([
      ...core.bodies,
      ...tail.map((s) =>
        Object.freeze({
          joint: s.name,
          center: Object.freeze([0, 0, -s.length / 2]) as XYZ,
          size: Object.freeze([s.width, s.height, s.length]) as XYZ,
        }),
      ),
    ]),
  });
  validateRig(definition);
  extensions.set(core, definition);
  return definition;
}

export interface TailBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  corners?: Float64Array;
}
export interface TailInput {
  dt: number;
  speed: number;
  stride: number;
  forward: number;
  airborne: boolean;
  attack: number;
  recoil?: number;
  recoilSide?: number;
  /** Temporary collapse is age-sampled, never a live spring after death. */
  age?: number;
}
export const TAIL_BUDGET = Object.freeze({ candidates: 25, evaluations: 104, queries: 100 });
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const pitch = [-0.12, 0.12, 0.28, 0.36];
const yaw = [0.22, 0.06, -0.13, -0.17];
// Fixed candidate order. Closest-to-authored first, then a compact upward curl, then side tucks.
const tucks: readonly (readonly [number, number, boolean?])[] = [
  [0, 0],
  [0.25, 0],
  [0.2, 0.7],
  [0.2, -0.7],
  [0.75, 0.6],
  [0.75, -0.6],
  [0.55, 0],
  [0.85, 0],
  [1.2, 0],
  [1.55, 0],
  [-0.3, 0],
  [-0.9, 0],
  [-0.25, -1],
  [-0.25, 1],
  [1.2, -1],
  [1.2, 1],
  [1.4, -1.2],
  [1.4, 1.2],
  // A straight upright chain fits the physical gap between the vest and wall trim.
  [1.55, 0, true],
] as const;

/** Four-link angular follow-through, then a bounded whole-chain clearance projection.
 * Only tail joints are written; the solved pelvis and every required contact remain untouched. */
export class TailRig {
  readonly angles = new Float64Array(8);
  readonly velocities = new Float64Array(8);
  readonly bounds: TailBounds = {
    minX: 0,
    minY: 0,
    minZ: 0,
    maxX: 0,
    maxY: 0,
    maxZ: 0,
    corners: new Float64Array(24),
  };
  queries = 0;
  evaluations = 0;
  tucked = false;
  blocked = false;
  private readonly springs = Array.from({ length: 8 }, () => new Spring());
  private readonly deathStart = new Float64Array(8);
  private readonly candidate = new Float64Array(8);
  private readonly best = new Float64Array(8);
  private readonly contact = new Float64Array(8);
  private readonly segments: readonly TailSegment[];
  private ready = false;
  private dying = false;
  private settled = false;
  private x = 0;
  private z = 0;
  private vx = 0;
  private vz = 0;
  private heading = 0;

  constructor(privateDefinition: RigDefinition) {
    if (!privateDefinition.tail) throw new Error('Tail capability required');
    this.segments = privateDefinition.tail;
    this.reset();
  }
  reset(): void {
    this.ready = this.dying = this.settled = this.tucked = this.blocked = false;
    this.queries = this.evaluations = this.vx = this.vz = 0;
    for (let i = 0; i < 8; i++) {
      this.angles[i] = i % 2 ? yaw[i >> 1] : pitch[i >> 1];
      this.springs[i].value = this.angles[i];
      this.springs[i].velocity = this.velocities[i] = 0;
    }
  }
  captureDeath(pose: PoseBuffer): void {
    if (this.dying) return;
    for (const [i, s] of this.segments.entries()) {
      const q = pose.local[s.index].rotation;
      this.deathStart[i * 2] = Math.asin(clamp(2 * (q.w * q.x - q.y * q.z), -1, 1));
      this.deathStart[i * 2 + 1] = Math.atan2(
        2 * (q.w * q.y + q.x * q.z),
        1 - 2 * (q.x * q.x + q.y * q.y),
      );
    }
    this.dying = true;
    this.velocities.fill(0);
    for (const spring of this.springs) spring.velocity = 0;
  }
  /** Reset paths can publish the rest curl without advancing dynamics or doing world queries. */
  apply(pose: PoseBuffer): void {
    for (const [i, s] of this.segments.entries()) {
      setEuler(pose.local[s.index], this.angles[i * 2], this.angles[i * 2 + 1], 0);
      this.fk(pose, s.index);
    }
  }
  /** Consumes the already evaluated final body pose. FK here touches only the four tail joints. */
  reuses(dt: number, age?: number): boolean {
    return age === undefined ? dt === 0 && this.ready : age >= 0.62 && this.settled;
  }
  sample(
    pose: PoseBuffer,
    input: TailInput,
    clear?: (bounds: TailBounds, segment: number) => boolean,
  ): void {
    this.queries = this.evaluations = 0;
    if (this.reuses(input.dt, input.age)) {
      this.apply(pose);
      return;
    }
    const hadPose = this.ready,
      wasBlocked = this.blocked;
    const o = pose.definition.index.pelvis * 16,
      m = pose.world;
    const heading = Math.atan2(m[o + 8], m[o + 10]);
    const dt = Math.max(0, input.dt);
    const vx = dt && this.ready ? (m[o + 12] - this.x) / dt : 0;
    const vz = dt && this.ready ? (m[o + 14] - this.z) / dt : 0;
    const acceleration =
      dt && this.ready
        ? clamp(
            ((vx - this.vx) * Math.sin(heading) + (vz - this.vz) * Math.cos(heading)) / dt,
            -18,
            18,
          )
        : 0;
    const turn =
      dt && this.ready
        ? clamp(
            Math.atan2(Math.sin(heading - this.heading), Math.cos(heading - this.heading)) / dt,
            -5,
            5,
          )
        : 0;
    if (dt && this.ready && input.age === undefined) {
      const delta = Math.atan2(Math.sin(heading - this.heading), Math.cos(heading - this.heading));
      this.springs[1].value = clamp(this.springs[1].value - delta, -1.2, 1.2);
    }
    const weight = input.age === undefined ? 0 : Math.min(1, input.age / 0.45);
    const blend = weight * weight * (3 - 2 * weight);
    const root = pose.local[0].rotation;
    const fall = Math.asin(clamp(2 * (root.w * root.x - root.y * root.z), -1, 1));
    for (let i = 0; i < 4; i++) {
      const a = i * 2;
      const sway = Math.sin(input.stride - i * 0.55) * Math.min(1, input.speed / 2.1);
      const p =
        pitch[i] +
        (i === 0
          ? acceleration * 0.008 +
            (input.airborne ? 0.4 : 0) +
            (input.forward < -0.05 ? 0.25 : 0) -
            input.attack * 0.18 +
            (input.recoil ?? 0) * 0.8
          : 0);
      const y =
        yaw[i] +
        sway * 0.07 -
        turn * (0.04 + i * 0.008) +
        ((input.recoilSide ?? 0) * 0.9) / (i + 1);
      for (let axis = 0; axis < 2; axis++) {
        const n = a + axis,
          spring = this.springs[n];
        if (input.age !== undefined) {
          const target = axis ? yaw[i] : i ? pitch[i] * 0.3 : -fall - 0.15;
          this.candidate[n] = this.deathStart[n] * (1 - blend) + target * blend;
        } else {
          this.candidate[n] = spring.advance(axis ? y : p, dt, 14 - i * 1.5, 0.78);
        }
      }
    }
    this.x = m[o + 12];
    this.z = m[o + 14];
    this.vx = vx;
    this.vz = vz;
    this.heading = heading;
    this.ready = true;
    let bestFailures = Infinity;
    for (let attempt = 0; attempt < tucks.length; attempt++) {
      let failures = 0;
      for (const [i, s] of this.segments.entries()) {
        const joint = pose.local[s.index],
          limits = pose.definition.joints[s.index].limits;
        const p = clamp(
          i === 0 && attempt
            ? tucks[attempt][0]
            : i > 0 && tucks[attempt][2]
              ? 0
              : this.candidate[i * 2],
          ...limits[0],
        );
        const y = clamp(
          i === 0 && attempt
            ? tucks[attempt][1]
            : i > 0 && tucks[attempt][2]
              ? 0
              : this.candidate[i * 2 + 1],
          ...limits[1],
        );
        setEuler(joint, p, y, 0);
        this.fk(pose, s.index);
        this.segmentBounds(pose, i);
        this.queries++;
        if (clear && !clear(this.bounds, i)) failures++;
      }
      if (
        failures < bestFailures &&
        (!wasBlocked || input.age !== undefined || attempt === 0 || failures === 0)
      ) {
        bestFailures = failures;
        for (const [i, s] of this.segments.entries()) {
          const limits = pose.definition.joints[s.index].limits;
          this.best[i * 2] = clamp(
            i === 0 && attempt
              ? tucks[attempt][0]
              : i > 0 && tucks[attempt][2]
                ? 0
                : this.candidate[i * 2],
            ...limits[0],
          );
          this.best[i * 2 + 1] = clamp(
            i === 0 && attempt
              ? tucks[attempt][1]
              : i > 0 && tucks[attempt][2]
                ? 0
                : this.candidate[i * 2 + 1],
            ...limits[1],
          );
        }
        this.tucked = attempt > 0;
      }
      if (!failures) break;
      if (attempt === 0 && hadPose && input.age === undefined) {
        // Prefer the published contact pose over a different partially blocked preset. A count
        // of failing links is not an energy function: chasing its ties caused perpetual flips.
        let heldFailures = 0;
        for (const [i, s] of this.segments.entries()) {
          setEuler(pose.local[s.index], this.angles[i * 2], this.angles[i * 2 + 1], 0);
          this.fk(pose, s.index);
          this.queries++;
          if (clear && !clear(this.segmentBounds(pose, i), i)) heldFailures++;
        }
        if (wasBlocked || heldFailures <= bestFailures) {
          bestFailures = heldFailures;
          this.best.set(this.angles);
          this.tucked = true;
        }
        if (!heldFailures) break;
      }
    }
    this.blocked = bestFailures > 0;
    // Retain a known-clear endpoint while finding the nearest safe curl on the selected ray.
    // Fixed bisection budget avoids the visible quarter-radian jumps of a discrete candidate set.
    if (this.tucked && !this.blocked) {
      this.contact.set(this.best);
      let low = 0,
        high = 1;
      for (let pass = 0; pass < 4; pass++) {
        const t = (low + high) / 2;
        let valid = true;
        for (const [i, s] of this.segments.entries()) {
          const limits = pose.definition.joints[s.index].limits;
          setEuler(
            pose.local[s.index],
            clamp(this.candidate[i * 2] * (1 - t) + this.contact[i * 2] * t, ...limits[0]),
            clamp(this.candidate[i * 2 + 1] * (1 - t) + this.contact[i * 2 + 1] * t, ...limits[1]),
            0,
          );
          this.fk(pose, s.index);
          this.queries++;
          if (clear && !clear(this.segmentBounds(pose, i), i)) valid = false;
        }
        if (valid) {
          high = t;
          for (let i = 0; i < 8; i++)
            this.best[i] = clamp(
              this.candidate[i] * (1 - t) + this.contact[i] * t,
              ...pose.definition.joints[this.segments[i >> 1].index].limits[i % 2],
            );
        } else low = t;
      }
    }
    if (input.age === undefined && hadPose && dt > 0 && (wasBlocked || this.blocked)) {
      // Enter/release an infeasible fallback continuously. The sum of joint-angle changes is
      // capped, bounding tip travel as well as each individual angle. Recheck the actual limited
      // pose: an intermediate point on the path to a clear endpoint can still be infeasible.
      let change = 0;
      for (let i = 0; i < 8; i++) change += Math.abs(this.best[i] - this.angles[i]);
      const amount = Math.min(1, (6 * dt) / Math.max(1e-12, change));
      if (amount < 1) {
        for (let i = 0; i < 8; i++)
          this.best[i] = this.angles[i] + (this.best[i] - this.angles[i]) * amount;
        let failures = 0;
        for (const [i, s] of this.segments.entries()) {
          setEuler(pose.local[s.index], this.best[i * 2], this.best[i * 2 + 1], 0);
          this.fk(pose, s.index);
          this.queries++;
          if (clear && !clear(this.segmentBounds(pose, i), i)) failures++;
        }
        this.blocked = failures > 0;
      }
    }
    this.angles.set(this.best);
    for (let i = 0; i < 8; i++) {
      // Contact projection cannot accumulate spring energy against an immovable surface.
      if (this.blocked || Math.abs(this.angles[i] - this.candidate[i]) > 1e-9)
        this.springs[i].velocity = 0;
      this.springs[i].value = this.angles[i];
      this.velocities[i] = input.age === undefined ? this.springs[i].velocity : 0;
    }
    this.apply(pose);
    this.settled = input.age !== undefined && input.age >= 0.62;
  }
  private fk(pose: PoseBuffer, index: number): void {
    this.evaluations++;
    const o = index * 16;
    compose(pose.local[index], pose.matrices, o);
    multiplyAffine(
      pose.world,
      pose.definition.joints[index].parent * 16,
      pose.matrices,
      o,
      pose.world,
      o,
    );
  }
  segmentBounds(pose: PoseBuffer, index: number): TailBounds {
    const s = this.segments[index],
      m = pose.world,
      o = s.index * 16,
      b = this.bounds;
    b.minX = b.minY = b.minZ = Infinity;
    b.maxX = b.maxY = b.maxZ = -Infinity;
    let corner = 0;
    for (let i = 0; i < 8; i++) {
      const x = ((i & 4 ? 1 : -1) * s.width) / 2;
      const y = ((i & 2 ? 1 : -1) * s.height) / 2;
      const z = i & 1 ? 0 : -s.length;
      const wx = m[o + 12] + m[o] * x + m[o + 4] * y + m[o + 8] * z;
      const wy = m[o + 13] + m[o + 1] * x + m[o + 5] * y + m[o + 9] * z;
      const wz = m[o + 14] + m[o + 2] * x + m[o + 6] * y + m[o + 10] * z;
      b.corners![corner++] = wx;
      b.corners![corner++] = wy;
      b.corners![corner++] = wz;
      b.minX = Math.min(b.minX, wx);
      b.maxX = Math.max(b.maxX, wx);
      b.minY = Math.min(b.minY, wy);
      b.maxY = Math.max(b.maxY, wy);
      b.minZ = Math.min(b.minZ, wz);
      b.maxZ = Math.max(b.maxZ, wz);
    }
    return b;
  }
}
