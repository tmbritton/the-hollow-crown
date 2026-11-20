import type { JointPose, PoseBuffer, RigDefinition, LimbChain } from './types.ts';
import { PoseVector } from './types.ts';
import {
  compose,
  createPose,
  evaluatePose,
  inverse,
  multiplyAffine as multiply,
  setEuler,
  socketMatrix,
} from './pose.ts';
import { clamp, copyLocal, limitJoint, matrixRotation, orthonormalize } from './ikMath.ts';
import { effectors } from './targets.ts';
import type { Effector, RigTarget, RigTargets, TargetResidual } from './targets.ts';
import { validateRig } from './humanoid.ts';

export interface SolverBounds {
  /** Maximum correction from the authored pelvis, in its parent's coordinates. */
  readonly pelvis: number;
  /** Optional tighter upward limit; grounding reserves its own bounded corpse assistance. */
  readonly pelvisUp: number;
  readonly spine: number;
  readonly chest: number;
  readonly shoulder: number;
}
export interface SolveResult {
  readonly pose: PoseBuffer;
  status: 'solved' | 'relaxed' | 'infeasible';
  passes: number;
  limbSolves: number;
  jointEvaluations: number;
  /** A2 accepts sampled contacts. Terrain sampling belongs to A3's target planner. */
  terrainQueries: number;
  readonly residuals: Readonly<Record<Effector, TargetResidual>>;
}
interface Slot {
  name: Effector;
  chain: LimbChain;
  root: number;
  middle: number;
  end: number;
  parent: number;
  frame: Float64Array;
  basis: Float64Array;
  authoredFrame: Float64Array;
  orientation: JointPose['rotation'];
  target: RigTarget | undefined;
  weight: number;
  priority: number;
  residual: TargetResidual;
}
const defaultBounds: SolverBounds = {
  pelvis: 0.14,
  pelvisUp: 0.14,
  spine: 0.28,
  chest: 0.2,
  shoulder: 0.18,
};
export const SOLVER_BUDGET = Object.freeze({
  passes: 4,
  limbSolves: 16,
  jointEvaluations: 249,
  terrainQueries: 0,
});
const identity = (): Float64Array => {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
};

/** Four bounded whole-body passes. Each pass adjusts the body, solves every active limb once,
 * then measures ALL end effectors in the final FK. Pose/target/scratch storage is preallocated;
 * solving advances no temporal state.
 * The caller retains the authored input; feeding the solved output back as input is prohibited. */
export class FullBodySolver {
  readonly result: SolveResult;
  readonly bounds: SolverBounds;
  private readonly best: PoseBuffer;
  private readonly slots: readonly Slot[];
  private readonly inv = identity();
  private readonly frame = identity();
  private readonly desired = identity();
  private readonly rotation = identity();
  private readonly temp = identity();
  private readonly rootInverse = identity();
  private readonly scratch: JointPose = {
    position: new PoseVector(),
    scale: new PoseVector().setAll(1),
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  };
  private readonly score = new Float64Array(3);
  private readonly bestScore = new Float64Array(3);
  private readonly error = new PoseVector();
  private highest = 2;

  constructor(definition: RigDefinition, bounds: Partial<SolverBounds> = {}) {
    validateRig(definition);
    this.bounds = Object.freeze({
      ...defaultBounds,
      ...bounds,
      pelvisUp: bounds.pelvisUp ?? bounds.pelvis ?? defaultBounds.pelvisUp,
    });
    for (const value of Object.values(this.bounds))
      if (!Number.isFinite(value) || value < 0 || value > 0.5)
        throw new RangeError('Invalid solver bound');
    this.best = createPose(definition);
    const chains = [
      definition.chains.leftLeg,
      definition.chains.rightLeg,
      definition.chains.leftArm,
      definition.chains.rightArm,
    ];
    this.slots = effectors.map((name, i) => {
      const chain = chains[i];
      if (
        chain.upperLength < 0.001 ||
        chain.lowerLength < 0.001 ||
        chain.upperLength > 10 ||
        chain.lowerLength > 10 ||
        Math.abs(chain.bendHint[1]) > 1e-8
      )
        throw new RangeError('Unsupported link dimensions or rest bend pole');
      // Analytic chains use the declared -Y links and X hinge; reject different anatomy explicitly.
      for (const joint of [chain.middle, chain.end]) {
        const rest = definition.joints[definition.index[joint]].rest;
        if (rest[0] !== 0 || rest[2] !== 0 || rest[1] >= 0)
          throw new Error('Unsupported limb basis');
      }
      const hinge = definition.joints[definition.index[chain.middle]];
      if (
        hinge.axis[0] !== 1 ||
        hinge.axis[1] !== 0 ||
        hinge.axis[2] !== 0 ||
        hinge.limits[1][0] !== 0 ||
        hinge.limits[1][1] !== 0 ||
        hinge.limits[2][0] !== 0 ||
        hinge.limits[2][1] !== 0
      )
        throw new Error('Unsupported hinge basis');
      const root = definition.index[chain.root];
      return {
        name,
        chain,
        root,
        middle: definition.index[chain.middle],
        end: definition.index[chain.end],
        parent: definition.joints[root].parent,
        frame: identity(),
        basis: identity(),
        authoredFrame: identity(),
        orientation: { x: 0, y: 0, z: 0, w: 1 },
        target: undefined,
        weight: 0,
        priority: 2,
        residual: { active: false, required: false, position: 0, orientation: 0, satisfied: true },
      };
    });
    const residuals = Object.fromEntries(this.slots.map((s) => [s.name, s.residual])) as Record<
      Effector,
      TargetResidual
    >;
    this.result = {
      pose: createPose(definition),
      status: 'solved',
      passes: 0,
      limbSolves: 0,
      jointEvaluations: 0,
      terrainQueries: 0,
      residuals,
    };
  }

  /** refine may update existing target positions/orientations after final FK. It is called at
   * most once per whole-body pass, including the last pass; true requests another bounded pass.
   * Live contacts retain the last checked candidate, never an older pose with stale clearance. */
  solve(
    base: PoseBuffer,
    targets: RigTargets,
    refine?: (pose: PoseBuffer) => boolean,
  ): SolveResult {
    this.validate(base, targets);
    const r = this.result,
      pose = r.pose;
    r.passes = r.limbSolves = r.jointEvaluations = r.terrainQueries = 0;
    copyLocal(base.local, pose.local);
    this.fk();
    inverse(pose.world, 0, this.rootInverse);
    this.highest = 2;
    for (const slot of this.slots) {
      slot.target = targets[slot.name];
      slot.weight = slot.target?.release ? 0 : (slot.target?.weight ?? (slot.target ? 1 : 0));
      slot.priority = slot.target?.required ? 0 : (slot.target?.priority ?? 1);
      slot.residual.active = slot.weight > 0;
      slot.residual.required = !!slot.target?.required && slot.weight > 0;
      if (slot.weight > 0) {
        this.highest = Math.min(this.highest, slot.priority);
        this.resolveFrame(slot, true);
      }
    }
    for (let i = 1; i < pose.local.length; i++)
      limitJoint(pose.local[i], pose.definition.joints[i]);
    this.bodyFK();
    this.bestScore.fill(Infinity);
    for (let pass = 0; pass < SOLVER_BUDGET.passes; pass++) {
      r.passes++;
      this.correctBody(base);
      for (const slot of this.slots) if (slot.weight > 0) this.solveLimb(slot);
      this.fk();
      const changed = refine?.(pose) ?? false;
      if (changed)
        for (const slot of this.slots) if (slot.weight > 0) this.resolveFrame(slot, false);
      this.measure();
      let better = false;
      for (let i = 0; i < 3; i++) {
        if (this.score[i] < this.bestScore[i] - 1e-12) {
          better = true;
          break;
        }
        if (this.score[i] > this.bestScore[i] + 1e-12) break;
      }
      if (better && !refine) {
        this.bestScore.set(this.score);
        copyLocal(pose.local, this.best.local);
      }
      if (r.status === 'solved' && !changed) break;
    }
    if (!refine) {
      copyLocal(this.best.local, pose.local);
      this.fk();
      this.measure();
    }
    return r;
  }

  private validate(base: PoseBuffer, targets: RigTargets): void {
    if (base === this.result.pose || base.definition !== this.result.pose.definition)
      throw new Error('Solver needs a separate authored pose of the same definition');
    const d = base.definition;
    for (let i = 0; i < base.local.length; i++) {
      const j = base.local[i],
        q = j.rotation,
        p = j.position,
        s = j.scale;
      if (
        !Number.isFinite(p.x + p.y + p.z) ||
        Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)) > 1e6 ||
        !Number.isFinite(q.x + q.y + q.z + q.w) ||
        Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) > 1e-6 ||
        !Number.isFinite(s.x + s.y + s.z) ||
        Math.min(s.x, s.y, s.z) < 0.1 ||
        Math.max(s.x, s.y, s.z) > 10
      )
        throw new RangeError('Invalid authored transform');
      // These are the actual scale-bearing nodes in the existing mesh hierarchy. Scaling an
      // intervening logical joint produces shear that its TRS binding cannot represent.
      if (i !== d.index.root && i !== d.index.spine && (s.x !== 1 || s.y !== 1 || s.z !== 1))
        throw new RangeError(
          'Scale is supported only on root/spine, not individual IK links or logical ancestors',
        );
      if (
        i > 1 &&
        (p.x !== d.joints[i].rest[0] || p.y !== d.joints[i].rest[1] || p.z !== d.joints[i].rest[2])
      )
        throw new RangeError('Bone translations must retain authored anatomy');
    }
    for (const slot of this.slots) {
      const target = targets[slot.name];
      if (!target) continue;
      if (target.required && !target.release && target.weight === 0)
        throw new RangeError('A required target needs positive weight or explicit release');
      if (
        (target.space !== 'rig' && target.space !== 'world' && target.space !== 'joint') ||
        (target.space === 'joint' && !(target.joint in d.index)) ||
        target.position.length !== 3 ||
        !Number.isFinite(target.position[0] + target.position[1] + target.position[2]) ||
        Math.max(
          Math.abs(target.position[0]),
          Math.abs(target.position[1]),
          Math.abs(target.position[2]),
        ) > 1e6 ||
        (target.rotation &&
          (target.rotation.length !== 4 ||
            !target.rotation.every(Number.isFinite) ||
            Math.abs(Math.hypot(...target.rotation) - 1) > 1e-6)) ||
        (target.bendHint &&
          (target.bendHint.length !== 3 ||
            Math.abs(target.bendHint[1]) > 1e-8 ||
            !target.bendHint.every(Number.isFinite) ||
            Math.abs(Math.hypot(...target.bendHint) - 1) > 1e-6)) ||
        !Number.isFinite(target.weight ?? 1) ||
        (target.weight ?? 1) < 0 ||
        (target.weight ?? 1) > 1 ||
        (target.priority !== undefined && target.priority !== 1 && target.priority !== 2)
      )
        throw new RangeError('Invalid rig target');
    }
  }

  private fk(): void {
    evaluatePose(this.result.pose);
    this.result.jointEvaluations += this.result.pose.local.length;
  }
  /** Only these ancestors can change limb reach; limbs/head are revisited before final validation. */
  private bodyFK(): void {
    const i = this.result.pose.definition.index;
    this.joint(i.pelvis);
    this.joint(i.spine);
    this.joint(i.chest);
    this.joint(i.leftShoulder);
    this.joint(i.rightShoulder);
  }
  private joint(i: number): void {
    const p = this.result.pose,
      parent = p.definition.joints[i].parent;
    compose(p.local[i], p.matrices, i * 16);
    multiply(p.world, parent * 16, p.matrices, i * 16, p.world, i * 16);
    this.result.jointEvaluations++;
  }

  private resolveFrame(slot: Slot, initial: boolean): void {
    const target = slot.target!,
      p = this.result.pose,
      t = this.scratch;
    if (initial) {
      if (target.space !== 'world') {
        const offset = (target.space === 'joint' ? p.definition.index[target.joint] : 0) * 16;
        for (let n = 0; n < 16; n++) slot.basis[n] = p.world[offset + n];
      }
      socketMatrix(p, slot.name, slot.authoredFrame);
    }
    t.position.set(target.position[0], target.position[1], target.position[2]);
    if (target.rotation) {
      const q = target.rotation;
      t.rotation.x = q[0];
      t.rotation.y = q[1];
      t.rotation.z = q[2];
      t.rotation.w = q[3];
    } else {
      t.rotation.x = t.rotation.y = t.rotation.z = 0;
      t.rotation.w = 1;
    }
    compose(t, this.frame);
    if (target.space === 'world') slot.frame.set(this.frame);
    else multiply(slot.basis, 0, this.frame, 0, slot.frame, 0);
    if (!target.rotation) {
      for (let col = 0; col < 3; col++)
        for (let row = 0; row < 3; row++)
          slot.frame[col * 4 + row] = slot.authoredFrame[col * 4 + row];
    }
    this.frame.set(slot.frame);
    orthonormalize(this.frame);
    matrixRotation(this.frame, slot.orientation);
  }

  /** Desired end-joint frame in its chain parent's affine basis. Socket offsets/bases included. */
  private localGoal(slot: Slot): void {
    const p = this.result.pose;
    inverse(p.world, slot.parent * 16, this.inv);
    multiply(this.inv, 0, slot.frame, 0, this.desired, 0);
    orthonormalize(this.desired);
    const socket = p.definition.sockets[slot.name],
      u = socket.up,
      f = socket.forward;
    // inverse of the orthonormal socket basis
    this.rotation[0] = u[1] * f[2] - u[2] * f[1];
    this.rotation[4] = u[2] * f[0] - u[0] * f[2];
    this.rotation[8] = u[0] * f[1] - u[1] * f[0];
    this.rotation[1] = u[0];
    this.rotation[5] = u[1];
    this.rotation[9] = u[2];
    this.rotation[2] = f[0];
    this.rotation[6] = f[1];
    this.rotation[10] = f[2];
    this.rotation[12] = this.rotation[13] = this.rotation[14] = 0;
    multiply(this.desired, 0, this.rotation, 0, this.temp, 0);
    this.desired.set(this.temp);
    for (let row = 0; row < 3; row++)
      this.desired[12 + row] -=
        this.desired[row] * socket.offset[0] +
        this.desired[4 + row] * socket.offset[1] +
        this.desired[8 + row] * socket.offset[2];
  }

  private reachError(slot: Slot): void {
    this.localGoal(slot);
    const p = this.result.pose,
      root = p.local[slot.root].position,
      m = p.world,
      o = slot.parent * 16;
    let x = this.desired[12] - root.x,
      y = this.desired[13] - root.y,
      z = this.desired[14] - root.z;
    const length = Math.hypot(x, y, z),
      max = (slot.chain.upperLength + slot.chain.lowerLength) * (1 - 2e-6);
    const k = length > max ? 1 - max / length : 0;
    x *= k;
    y *= k;
    z *= k;
    // parent vector -> world -> root local (never moves the gameplay root)
    const wx = m[o] * x + m[o + 4] * y + m[o + 8] * z,
      wy = m[o + 1] * x + m[o + 5] * y + m[o + 9] * z,
      wz = m[o + 2] * x + m[o + 6] * y + m[o + 10] * z;
    const r = this.rootInverse;
    this.error.set(
      r[0] * wx + r[4] * wy + r[8] * wz,
      r[1] * wx + r[5] * wy + r[9] * wz,
      r[2] * wx + r[6] * wy + r[10] * wz,
    );
  }

  private correctBody(base: PoseBuffer): void {
    const p = this.result.pose,
      d = p.definition,
      b = this.bounds;
    let x = 0,
      z = 0,
      twist = 0,
      weight = 0;
    for (let i = 2; i < 4; i++) {
      const s = this.slots[i];
      if (s.weight === 0 || s.priority !== this.highest) continue;
      this.reachError(s);
      x += this.error.x * s.weight;
      z += this.error.z * s.weight;
      twist += (i === 2 ? 1 : -1) * this.error.z * s.weight;
      weight += s.weight;
    }
    if (weight > 0) {
      // Bounded local Y-X-Z corrections layered on the authored orientation.
      this.addCorrection(base, d.index.spine, (z / weight) * 1.8, 0, (-x / weight) * 1.8, b.spine);
      this.addCorrection(base, d.index.chest, 0, (twist / weight) * 1.5, 0, b.chest);
    }
    this.bodyFK();
    let y = 0;
    x = z = weight = 0;
    for (const s of this.slots) {
      if (s.weight === 0 || s.priority !== this.highest) continue;
      this.reachError(s);
      if (Math.hypot(this.error.x, this.error.y, this.error.z) < 1e-9) continue;
      x += this.error.x * s.weight;
      y += this.error.y * s.weight;
      z += this.error.z * s.weight;
      weight += s.weight;
    }
    const pelvis = p.local[d.index.pelvis].position,
      origin = base.local[d.index.pelvis].position;
    if (weight > 0) pelvis.set(pelvis.x + x / weight, pelvis.y + y / weight, pelvis.z + z / weight);
    pelvis.x = clamp(pelvis.x, origin.x - b.pelvis, origin.x + b.pelvis);
    pelvis.y = clamp(pelvis.y, origin.y - b.pelvis, origin.y + Math.min(b.pelvis, b.pelvisUp));
    pelvis.z = clamp(pelvis.z, origin.z - b.pelvis, origin.z + b.pelvis);
    this.bodyFK();
    // Reconcile full-extension support after torso/pelvis motion. This is part of the same pass.
    for (let i = 0; i < 2; i++) {
      const s = this.slots[i];
      if (s.weight === 0 || s.priority !== this.highest) continue;
      this.reachError(s);
      pelvis.x = clamp(pelvis.x + this.error.x, origin.x - b.pelvis, origin.x + b.pelvis);
      pelvis.y = clamp(
        pelvis.y + this.error.y,
        origin.y - b.pelvis,
        origin.y + Math.min(b.pelvis, b.pelvisUp),
      );
      pelvis.z = clamp(pelvis.z + this.error.z, origin.z - b.pelvis, origin.z + b.pelvis);
      this.joint(d.index.pelvis);
    }
    this.bodyFK();
    for (let i = 2; i < 4; i++) {
      const s = this.slots[i];
      if (s.weight === 0) continue;
      this.localGoal(s);
      const v = p.local[s.root].position;
      const pitch = Math.atan2(-(this.desired[14] - v.z), -(this.desired[13] - v.y)) * 0.12;
      // Shoulders distribute rotation, not translate the authored shoulder or lengthen an arm.
      this.setCorrection(base, s.parent, clamp(pitch, -b.shoulder, b.shoulder), 0, 0);
      this.joint(s.parent);
    }
  }

  private setCorrection(base: PoseBuffer, i: number, x: number, y: number, z: number): void {
    setEuler(this.scratch, x, y, z);
    this.scratch.position.setAll(0);
    compose(this.scratch, this.frame);
    compose(base.local[i], this.rotation);
    orthonormalize(this.rotation);
    multiply(this.rotation, 0, this.frame, 0, this.temp, 0);
    matrixRotation(this.temp, this.result.pose.local[i].rotation);
    limitJoint(this.result.pose.local[i], this.result.pose.definition.joints[i]);
  }

  private addCorrection(
    base: PoseBuffer,
    i: number,
    x: number,
    y: number,
    z: number,
    bound: number,
  ): void {
    // Read the current correction relative to the authored orientation, so bounds never accumulate.
    compose(base.local[i], this.rotation);
    inverse(this.rotation, 0, this.inv);
    compose(this.result.pose.local[i], this.frame);
    multiply(this.inv, 0, this.frame, 0, this.temp, 0);
    orthonormalize(this.temp);
    const pitch = Math.asin(clamp(-this.temp[9], -1, 1));
    const yaw = Math.atan2(this.temp[8], this.temp[10]);
    const roll = Math.atan2(this.temp[1], this.temp[5]);
    this.setCorrection(
      base,
      i,
      clamp(pitch + x, -bound, bound),
      clamp(yaw + y, -bound, bound),
      clamp(roll + z, -bound, bound),
    );
  }

  private solveLimb(slot: Slot): void {
    this.result.limbSolves++;
    this.localGoal(slot);
    const p = this.result.pose,
      d = p.definition,
      root = p.local[slot.root],
      chain = slot.chain;
    let dx = this.desired[12] - root.position.x,
      dy = this.desired[13] - root.position.y,
      dz = this.desired[14] - root.position.z;
    let distance = Math.hypot(dx, dy, dz);
    if (distance === 0) {
      dx = 0;
      dy = -1;
      dz = 0;
    } else {
      dx /= distance;
      dy /= distance;
      dz /= distance;
    }
    const a = chain.upperLength,
      b = chain.lowerLength;
    // Regularize the direction itself, not the solved quaternion's hemisphere. Both the fold
    // ball and antipodal cone continuously return toward -Y, with residuals against the original
    // request. This avoids a pole flip and a hard near-zero direction switch.
    const cone = clamp((dy - 0.95) / 0.04, 0, 1),
      near = clamp(distance / ((a + b) * 1e-4), 0, 1);
    const horizontal = Math.hypot(dx, dz);
    const theta =
      Math.atan2(horizontal, -dy) *
      (1 - cone * cone * (3 - 2 * cone)) *
      near *
      near *
      (3 - 2 * near);
    const ratio = horizontal > 0 ? Math.sin(theta) / horizontal : 0;
    dx *= ratio;
    dz *= ratio;
    dy = -Math.cos(theta);
    const epsilon = Math.min(a, b) * 1e-6;
    distance = clamp(distance, Math.abs(a - b) + epsilon, a + b - epsilon);
    // Transport the rest bend pole with the shortest swing from -Y, rather than projecting it
    // onto a target plane (which flips at a target parallel to the pole).
    const hint = slot.target?.bendHint ?? chain.bendHint;
    const hintLength = Math.hypot(hint[0], hint[2]);
    const rx = hintLength > 1e-8 ? hint[0] / hintLength : 1,
      rz = hintLength > 1e-8 ? hint[2] / hintLength : 0;
    const k = 1 / Math.sqrt(2 * (1 - dy)),
      qx = -dz * k,
      qz = dx * k,
      qw = (1 - dy) * k;
    const cross = 2 * (qz * rx - qx * rz);
    const hx = rx - qz * cross,
      hy = qw * cross,
      hz = rz + qx * cross;
    const along = (a * a - b * b + distance * distance) / (2 * distance),
      bend = Math.sqrt(Math.max(0, a * a - along * along));
    const ux = (dx * along + hx * bend) / a,
      uy = (dy * along + hy * bend) / a,
      uz = (dz * along + hz * bend) / a;
    const lx = (dx * distance - ux * a) / b,
      ly = (dy * distance - uy * a) / b,
      lz = (dz * distance - uz * a) / b;
    const sign = slot.name.endsWith('Sole') ? 1 : -1;
    const angle =
      Math.acos(clamp((distance * distance - a * a - b * b) / (2 * a * b), -1, 1)) * sign;
    const sine = Math.sin(angle),
      cosine = Math.cos(angle);
    const zx = (cosine * ux - lx) / sine,
      zy = (cosine * uy - ly) / sine,
      zz = (cosine * uz - lz) / sine;
    const m = this.rotation;
    m[4] = -ux;
    m[5] = -uy;
    m[6] = -uz;
    m[8] = zx;
    m[9] = zy;
    m[10] = zz;
    orthonormalize(m);
    matrixRotation(m, root.rotation);
    limitJoint(root, d.joints[slot.root]);
    this.joint(slot.root);
    setEuler(p.local[slot.middle], angle, 0, 0);
    limitJoint(p.local[slot.middle], d.joints[slot.middle]);
    this.joint(slot.middle);
    // End orientation in the actual post-limit lower-link frame; never the pre-clamp solution.
    inverse(p.world, slot.middle * 16, this.inv);
    multiply(p.world, slot.parent * 16, this.desired, 0, this.temp, 0);
    multiply(this.inv, 0, this.temp, 0, this.frame, 0);
    orthonormalize(this.frame);
    matrixRotation(this.frame, p.local[slot.end].rotation);
    limitJoint(p.local[slot.end], d.joints[slot.end]);
    this.joint(slot.end);
  }

  private measure(): void {
    const r = this.result;
    r.status = 'solved';
    this.score.fill(0);
    for (const s of this.slots) {
      const residual = s.residual;
      residual.position = residual.orientation = 0;
      residual.satisfied = true;
      if (s.weight === 0) continue;
      socketMatrix(r.pose, s.name, this.frame);
      residual.position = Math.hypot(
        this.frame[12] - s.frame[12],
        this.frame[13] - s.frame[13],
        this.frame[14] - s.frame[14],
      );
      {
        orthonormalize(this.frame);
        matrixRotation(this.frame, this.scratch.rotation);
        const a = this.scratch.rotation,
          b = s.orientation;
        residual.orientation =
          2 * Math.acos(clamp(Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w), 0, 1));
      }
      const tolerance = s.name.endsWith('Sole') ? 0.001 : 0.01;
      residual.satisfied = residual.position <= tolerance && residual.orientation <= Math.PI / 180;
      this.score[s.priority] +=
        s.weight *
        ((residual.position / tolerance) ** 2 + (residual.orientation / (Math.PI / 180)) ** 2);
      if (!residual.satisfied) {
        if (residual.required) r.status = 'infeasible';
        else if (r.status === 'solved') r.status = 'relaxed';
      }
    }
  }
}
