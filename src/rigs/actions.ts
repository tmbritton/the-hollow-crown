import type { Actor } from '../actors.ts';
import type { ECS } from '../ecs.ts';
import type { LocomotionPose } from '../locomotion.ts';
import { attackPose, socialPose, workPose, hackySackKick, deathPose } from '../actionPoses.ts';
import { volumeScale } from '../animationCurves.ts';
import { ATTACKS } from '../attackKinds.ts';
import { spearPose } from '../phalanxPoses.ts';
import { hackySackPass, isSocializing } from '../social.ts';
import {
  compose,
  createPose,
  evaluatePose,
  inverse,
  multiplyAffine,
  resetLocal,
  setEuler,
  socketMatrix,
} from './pose.ts';
import { copyLocal, matrixRotation, orthonormalize } from './ikMath.ts';
import { PoseVector } from './types.ts';
import type { JointPose, PoseBuffer, RigDefinition, XYZ } from './types.ts';

export type ActionFrame =
  | 'weapon'
  | 'shield'
  | 'spear'
  | 'javelin'
  | 'cargo'
  | 'card'
  | 'pipe'
  | 'back';
type ActionMode =
  | 'free'
  | 'guard'
  | 'spear'
  | 'throw'
  | 'crossbow'
  | 'carry'
  | 'cards'
  | 'smoke'
  | 'work';
const frameNames: readonly ActionFrame[] = [
  'weapon',
  'shield',
  'spear',
  'javelin',
  'cargo',
  'card',
  'pipe',
  'back',
];
export const SHIELD_GRIP: XYZ = [0, -0.12, -0.28];
export const SPEAR_GRIPS: readonly XYZ[] = [
  [0, 0, -0.1],
  [0, 0, -0.4],
];

function grip() {
  return {
    space: 'world' as const,
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0, 1] as [number, number, number, number],
    required: true,
    release: true,
  };
}
function blend(pose: LocomotionPose, target: LocomotionPose | null, weight: number, moving = 0) {
  if (!target) return;
  for (const key of Object.keys(pose) as (keyof LocomotionPose)[]) {
    const lower =
      key === 'leftLeg' ||
      key === 'rightLeg' ||
      key === 'leftKnee' ||
      key === 'rightKnee' ||
      key === 'bob' ||
      key === 'lift' ||
      key === 'stretch' ||
      key === 'reach';
    pose[key] += (target[key] - pose[key]) * weight * (lower ? 1 - moving : 1);
  }
}

/** Numerical action layers and acyclic equipment frames. Gameplay is sampled, never advanced here.
 * Required hands and feet share ONE solve. A released support/throwing hand is an authored decision. */
export class ActionRig {
  mode: ActionMode = 'free';
  extension = 0;
  pitch = 0;
  opening = 0;
  gate = false;
  released = false;
  stowed = false;
  carrying = false;
  carryCombat = false;
  recoil = 0;
  attackBlend = 0;
  socialBlend = 0;
  attackPose: LocomotionPose | null = null;
  socialPose: LocomotionPose | null = null;
  readonly targets = { leftGrip: grip(), rightGrip: grip() };
  readonly frames = Object.fromEntries(
    frameNames.map((name) => [name, new Float64Array(16)]),
  ) as Record<ActionFrame, Float64Array>;
  readonly deathStart: PoseBuffer;
  private deathActive = false;
  private deathHeading = 0;
  private deathSpear = false;
  private deathGripYaw = 0;
  private deathGripPitch = 0;
  private readonly root = new Float64Array(16);
  private readonly basis = new Float64Array(16);
  private readonly rotationMatrix = new Float64Array(16);
  private readonly parentInverse = new Float64Array(16);
  private readonly local = new Float64Array(16);
  private readonly orientation = { x: 0, y: 0, z: 0, w: 1 };
  private readonly scratch: JointPose = {
    position: new PoseVector(),
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: new PoseVector().setAll(1),
  };

  constructor(definition: RigDefinition) {
    this.deathStart = createPose(definition);
  }

  reset(): void {
    this.mode = 'free';
    this.extension =
      this.pitch =
      this.opening =
      this.attackBlend =
      this.socialBlend =
      this.recoil =
        0;
    this.gate =
      this.released =
      this.stowed =
      this.carrying =
      this.carryCombat =
      this.deathActive =
        false;
    this.attackPose = this.socialPose = null;
    this.deathHeading = 0;
    this.deathSpear = false;
    this.deathGripYaw = this.deathGripPitch = 0;
    this.targets.leftGrip.release = this.targets.rightGrip.release = true;
  }

  layer(
    actor: Actor,
    ecs: ECS,
    pose: LocomotionPose,
    time: number,
    dt: number,
    carrying: boolean,
  ): void {
    const swing = actor.attack.swing;
    const relaxing = isSocializing(actor);
    const work = actor.entity.get('work')?.snapshot();
    const working = work?.status === 'working' || work?.status === 'ready';
    this.carrying = carrying;
    this.carryCombat = !!actor.attack.target || !!swing || actor.defending;
    this.stowed = relaxing || working || (carrying && !this.carryCombat);
    this.mode =
      carrying && !this.carryCombat
        ? 'carry'
        : working
          ? 'work'
          : relaxing && actor.brain?.state === 'cards'
            ? 'cards'
            : relaxing && actor.brain?.state === 'smoke'
              ? 'smoke'
              : actor.kind === 'goblin'
                ? 'crossbow'
                : 'free';
    if (actor.defending) {
      this.attackBlend = this.socialBlend = 0;
      this.attackPose = this.socialPose = null;
    }
    this.attackBlend += ((swing ? 1 : 0) - this.attackBlend) * (1 - Math.exp(-25 * dt));
    if (swing && (swing.kind === 'MELEE' || swing.kind === 'CROSSBOW'))
      this.attackPose = attackPose(
        swing.elapsed,
        swing.duration,
        swing.impact,
        ATTACKS[swing.kind].projectile,
      );
    else if (swing) this.attackPose = null;
    this.recoil = Math.max(0, -(this.attackPose?.lean ?? 0)) * this.attackBlend;
    this.socialBlend +=
      ((relaxing || working ? 1 : 0) - this.socialBlend) * (1 - Math.exp(-18 * dt));
    if (working) this.socialPose = workPose(work.elapsed);
    else if (relaxing) {
      const phase = time + (actor.brain?.social?.phase ?? 0) + (actor.brain?.slot ?? 0) * 1.7;
      const activity = actor.brain?.state;
      if (activity === 'cards' || activity === 'smoke')
        this.socialPose = socialPose(activity, phase);
      else if (actor.brain?.social) {
        const pass = hackySackPass(actor.brain.social, ecs, time);
        const kick =
          pass && (pass.from === actor.id || pass.to === actor.id)
            ? hackySackKick(pass.progress, pass.to === actor.id)
            : 0;
        this.socialPose = socialPose('hackysack', phase, kick);
      }
    }
    blend(pose, this.socialPose, this.socialBlend);
    if (this.mode === 'carry') {
      pose.leftArm = pose.rightArm = -0.65;
      pose.leftElbow = pose.rightElbow = 1.05;
      pose.lean += 0.1;
    }
    blend(pose, this.attackPose, this.attackBlend, Math.min(1, actor.motion.actualSpeed / 0.8));
  }

  equipment(actor: Actor, pose: LocomotionPose): void {
    const member = actor.entity.get('squadMember'),
      squad = member?.group.get('koboldSquad');
    const opening = !!member && !!squad?.isOpening(member);
    this.opening = opening
      ? squad!.state === 'attacking'
        ? 1
        : Math.min(1, squad!.chart.snapshot.context.elapsed / 0.25)
      : 0;
    this.gate = !!member && !!squad?.isGate(member);
    if (actor.defending || opening) {
      this.mode = 'guard';
      pose.leftArm = -0.65;
      pose.leftElbow = 1;
      pose.rightArm = pose.rightElbow = 0.1;
      pose.armSpread = pose.twist = pose.roll = pose.lean = 0;
    } else if (member?.role === 'spearman' && !this.stowed) {
      const weapon = spearPose(actor.attack.swing);
      this.mode = weapon.throwing ? 'throw' : 'spear';
      this.extension = weapon.extension;
      this.pitch = weapon.pitch;
      this.released = weapon.released;
      pose.rightArm = weapon.arm;
      pose.rightElbow = weapon.elbow;
      pose.leftArm = -0.8;
      pose.leftElbow = 0.9;
      pose.twist = pose.roll = 0;
      pose.lean = weapon.throwing ? 0.1 * weapon.extension : 0;
    }
  }

  /** Included in grounding's retained-input key, including same-clock release/role changes. */
  writeRequest(out: Float64Array, n: number): void {
    out[n++] = [
      'free',
      'guard',
      'spear',
      'throw',
      'crossbow',
      'carry',
      'cards',
      'smoke',
      'work',
    ].indexOf(this.mode);
    for (const value of [
      this.extension,
      this.pitch,
      this.opening,
      Number(this.gate),
      Number(this.released),
      Number(this.carryCombat),
      this.recoil,
    ])
      out[n++] = value;
  }

  private frame(
    name: ActionFrame,
    x: number,
    y: number,
    z: number,
    pitch = 0,
    yaw = 0,
  ): Float64Array {
    this.scratch.position.set(x, y, z);
    this.scratch.scale.setAll(1);
    setEuler(this.scratch, pitch, yaw, 0);
    compose(this.scratch, this.local);
    multiplyAffine(this.basis, 0, this.local, 0, this.frames[name], 0);
    // Inherit authored scale BEFORE attachment rotation, exactly as the render hierarchy does.
    // A uniform world frame under a nonuniform root would require an unrepresentable TRS shear.
    // The action origin itself remains in unscaled gameplay units (in particular the spear lane).
    for (let row = 0; row < 3; row++)
      this.frames[name][12 + row] =
        this.root[row] * x + this.root[4 + row] * y + this.root[8 + row] * z + this.root[12 + row];
    return this.frames[name];
  }

  private target(side: 'left' | 'right', frame: Float64Array, offset: XYZ): void {
    const target = this.targets[`${side}Grip`];
    target.release = false;
    for (let row = 0; row < 3; row++)
      target.position[row] =
        frame[row] * offset[0] +
        frame[4 + row] * offset[1] +
        frame[8 + row] * offset[2] +
        frame[12 + row];
    this.rotationMatrix.set(frame);
    orthonormalize(this.rotationMatrix);
    matrixRotation(this.rotationMatrix, this.orientation);
    target.rotation[0] = this.orientation.x;
    target.rotation[1] = this.orientation.y;
    target.rotation[2] = this.orientation.z;
    target.rotation[3] = this.orientation.w;
  }

  plan(pose: PoseBuffer): void {
    const j = pose.definition.index;
    const root = pose.local[j.root];
    this.scratch.position.copyFrom(root.position);
    Object.assign(this.scratch.rotation, root.rotation);
    this.scratch.scale.setAll(1);
    compose(this.scratch, this.root);
    this.scratch.scale.copyFrom(root.scale);
    compose(this.scratch, this.basis);
    this.targets.leftGrip.release = this.targets.rightGrip.release = true;
    const lift = (pose.local[j.pelvis].position.y - 0.55) * root.scale.y;
    if (this.mode === 'carry') {
      const frame = this.frame('cargo', 0, 0.55 + lift, 0.42);
      this.target('left', frame, [-0.325, 0.25, 0]);
      this.target('right', frame, [0.325, 0.25, 0]);
    } else if (this.mode === 'guard') {
      const across = this.gate ? 0.29 : -0.22;
      const frame = this.frame(
        'shield',
        across + (-0.58 - across) * this.opening,
        0.97 + lift,
        0.25,
        0,
        (Math.PI / 2) * (1 - this.opening),
      );
      this.target('left', frame, SHIELD_GRIP);
    } else if (this.mode === 'spear') {
      // Turn the narrow torso edge toward the shaft; translating the whole chest across the
      // lane satisfied hand reach but drove the haft through the vest. A bounded fore/aft
      // lunge centres the shoulders between the two grips, with the head still facing the foe.
      const pitch = this.pitch * 0.5;
      const ready = Math.min(1, Math.abs(pitch) / (Math.PI / 4));
      const z = (0.1 + this.extension * 0.5) * (1 - ready) + Math.cos(pitch) * 0.25 * ready;
      pose.local[j.pelvis].position.x += 0.04;
      pose.local[j.pelvis].position.z += z - Math.cos(pitch) * 0.25;
      setEuler(pose.local[j.spine], 0, Math.PI / 2, 0);
      setEuler(pose.local[j.head], 0, -Math.PI / 2, 0);
      const frame = this.frame(
        'spear',
        0.4,
        0.85 + Math.abs(Math.sin(pitch)) * 0.42 + lift * ready,
        z,
        pitch,
      );
      this.target('left', frame, SPEAR_GRIPS[0]);
      this.target('right', frame, SPEAR_GRIPS[1]);
    } else if (this.mode === 'throw') {
      const reach = Math.max(0, Math.min(1, this.extension));
      const frame = this.frame(
        'javelin',
        0.4,
        0.85 + (1 - reach) * 0.5,
        0.1 - (1 - reach) * 0.3,
        this.pitch,
      );
      if (!this.released) this.target('right', frame, [0, 0, 0]);
    } else if (this.mode === 'crossbow') {
      const frame = this.frame('weapon', 0, 0.85 + lift, 0.27 - this.recoil * 0.6, -this.recoil);
      this.target('right', frame, [0.18, 0, -0.12]);
      this.target('left', frame, [-0.18, 0, 0.08]);
    } else if (this.mode === 'smoke') {
      const frame = this.frame('pipe', 0.2, pose.definition.profile.headHeight + 0.14 + lift, 0.42);
      this.target('right', frame, [0, 0, 0]);
    }
  }

  /** Hand-owned props follow FINAL sockets; action-owned two-grip frames remain fixed. */
  finish(pose: PoseBuffer): void {
    socketMatrix(pose, 'rightGrip', this.frames.card);
    this.frames.pipe.set(this.frames.card);
    if (this.mode !== 'crossbow') this.frames.weapon.set(this.frames.card);
    if (this.mode !== 'guard') {
      socketMatrix(pose, 'leftGrip', this.frames.shield);
      const m = this.frames.shield;
      for (let row = 0; row < 3; row++)
        m[12 + row] -=
          m[row] * SHIELD_GRIP[0] + m[4 + row] * SHIELD_GRIP[1] + m[8 + row] * SHIELD_GRIP[2];
    }
    socketMatrix(pose, 'back', this.frames.back);
    // A threatened porter slings its still-owned cargo to free both combat hands. This is an
    // explicit grip release, not a gameplay drop/delivery; ordinary carrying/unloading uses both hands.
    if (this.carrying && this.mode !== 'carry') {
      const m = this.frames.cargo;
      m.set(this.frames.back);
      for (let row = 0; row < 3; row++) m[12 + row] -= m[4 + row] * 0.4 + m[8 + row] * 0.35;
      // This crate is a scene-root TRS, not a child beneath the actor's scale-bearing root.
      // Follow the solved socket position/orientation with rigid unit dimensions; do not pass
      // inherited shear to a renderer that can only decompose it approximately.
      orthonormalize(m);
    }
    if (this.mode !== 'spear') {
      this.frames.spear.set(this.frames.weapon);
      for (let row = 0; row < 3; row++)
        this.frames.spear[12 + row] -= this.frames.spear[8 + row] * SPEAR_GRIPS[1][2];
    }
    if (this.mode !== 'throw') this.frames.javelin.set(this.frames.weapon);
  }

  /** Temporary collapse is sampled from the captured solved pose, not repeatedly blended mesh
   * Euler channels. Its clock is corpse.age; repeated inspection is exactly idempotent. */
  collapse(pose: PoseBuffer, actor: Actor, age: number): void {
    if (!this.deathActive) {
      copyLocal(pose.local, this.deathStart.local);
      const q = pose.local[0].rotation;
      this.deathHeading =
        age >= 0.62
          ? actor.position.heading
          : Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
      this.deathSpear = actor.entity.get('squadMember')?.role === 'spearman';
      if (this.deathSpear) {
        evaluatePose(this.deathStart);
        socketMatrix(this.deathStart, 'rightGrip', this.rotationMatrix);
        const m = this.rotationMatrix;
        this.deathGripYaw = Math.atan2(m[8], m[10]);
        this.deathGripPitch = Math.atan2(-m[9], Math.hypot(m[8], m[10]));
      }
      this.deathActive = true;
    }
    resetLocal(pose);
    const j = pose.definition.index,
      fall = deathPose(age),
      scale = volumeScale(fall.stretch, fall.reach);
    const weight = age >= 0.62 ? 0 : Math.exp(-25 * Math.max(0, age));
    const root = pose.local[j.root];
    root.position.set(actor.position.x, actor.elevation + fall.height, actor.position.z);
    const captured = this.deathStart.local[j.root];
    for (const key of ['x', 'y', 'z'] as const)
      root.scale[key] = scale[key] ** (1 - weight) * captured.scale[key] ** weight;
    setEuler(root, fall.rotation, this.deathHeading, 0);
    setEuler(pose.local[j.leftUpperArm], fall.arm, 0, 0.65);
    setEuler(
      pose.local[j.rightUpperArm],
      this.deathSpear ? -0.28 + (fall.arm + 0.7) * 0.2 : fall.arm,
      0,
      -0.65,
    );
    setEuler(pose.local[j.leftThigh], -0.2, 0, 0);
    setEuler(pose.local[j.rightThigh], 0.2, 0, 0);
    for (let i = 1; i < pose.local.length; i++) {
      const to = pose.local[i],
        from = this.deathStart.local[i];
      for (const key of ['x', 'y', 'z'] as const)
        to.position[key] += (from.position[key] - to.position[key]) * weight;
      const a = to.rotation,
        b = from.rotation,
        sign = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0 ? -1 : 1;
      for (const key of ['x', 'y', 'z', 'w'] as const)
        a[key] = a[key] * (1 - weight) + b[key] * sign * weight;
      const length = Math.hypot(a.x, a.y, a.z, a.w);
      for (const key of ['x', 'y', 'z', 'w'] as const) a[key] /= length;
    }
    this.mode = 'free';
    this.stowed = false;
    this.carrying = false;
    this.attackBlend = this.socialBlend = 0;
    this.attackPose = this.socialPose = null;
    this.targets.leftGrip.release = this.targets.rightGrip.release = true;
    evaluatePose(pose);
    if (this.deathSpear && age > 0) {
      // Keep the long weapon in the primary hand, turning it outward and then back along the
      // floor while the body falls. Letting it inherit the falling forearm's +Z drove its tip
      // metres underground. This wrist layer is sampled from the captured world direction.
      const u = Math.min(1, age / 0.3),
        amount = u * u * (3 - 2 * u);
      const delta = Math.atan2(
        Math.sin(this.deathGripYaw - this.deathHeading),
        Math.cos(this.deathGripYaw - this.deathHeading),
      );
      this.scratch.position.setAll(0);
      this.scratch.scale.setAll(1);
      setEuler(
        this.scratch,
        this.deathGripPitch * (1 - amount),
        this.deathHeading + delta * (1 - amount) + Math.PI * amount,
        0,
      );
      compose(this.scratch, this.rotationMatrix);
      inverse(pose.world, j.rightForearm * 16, this.parentInverse);
      multiplyAffine(this.parentInverse, 0, this.rotationMatrix, 0, this.local, 0);
      orthonormalize(this.local);
      matrixRotation(this.local, pose.local[j.rightHand].rotation);
      // The wrist has no descendants. Re-evaluate only this joint before publishing the pose.
      compose(pose.local[j.rightHand], pose.matrices, j.rightHand * 16);
      multiplyAffine(
        pose.world,
        j.rightForearm * 16,
        pose.matrices,
        j.rightHand * 16,
        pose.world,
        j.rightHand * 16,
      );
    }
    this.finish(pose);
  }
}
