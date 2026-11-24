import type { Actor } from '../actors.ts';
import type { ECS } from '../ecs.ts';
import type { LocomotionPose } from '../locomotion.ts';
import { attackPose, socialPose, workPose, hackySackKick, deathPose } from '../actionPoses.ts';
import { volumeScale, smoothStep } from '../animationCurves.ts';
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
import { ShieldMotion, SHIELD_GEOMETRY, SHIELD_PROJECTION_STEPS } from './shield.ts';
import { PHALANX } from '../machines/monsters/koboldSquad.ts';

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
  readonly shield = new ShieldMotion();
  private ownsShield = false;
  private readonly freeShield = new Float64Array(16);
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
    this.shield.reset();
    this.ownsShield = false;
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
    const defending = actor.defending;
    const relaxing = isSocializing(actor);
    const work = actor.entity.get('work')?.snapshot();
    const working = work?.status === 'working' || work?.status === 'ready';
    this.carrying = carrying;
    this.carryCombat = !!actor.attack.target || !!swing || defending;
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
    if (defending) {
      // A mid-lower re-press keeps the current authored recovery/volume rather than resetting
      // the free endpoint under an already protective shield. Damage was cancelled by input.
      if (this.shield.weight === 0) {
        this.attackBlend = 0;
        this.attackPose = null;
      }
      this.socialBlend = 0;
      this.socialPose = null;
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

  equipment(
    actor: Actor,
    pose: LocomotionPose,
    dt = 0,
    time = 0,
    heading = actor.position.heading,
  ): void {
    const defending = actor.defending;
    const member = actor.entity.get('squadMember'),
      squad = member?.group.get('koboldSquad');
    const opening = !!member && !!squad?.isOpening(member);
    this.opening = opening
      ? squad!.state === 'attacking'
        ? 1
        : smoothStep(squad!.chart.snapshot.context.elapsed / 0.25)
      : 0;
    this.gate = !!member && !!squad?.isGate(member);
    const elapsed = squad?.chart.snapshot.context.elapsed ?? 0;
    const preparation =
      this.gate && squad?.state === 'engaging' && elapsed <= PHALANX.advance
        ? smoothStep((elapsed - (PHALANX.advance - 0.18)) / 0.18)
        : opening && squad?.state === 'opening'
          ? 1 - smoothStep(elapsed / 0.18)
          : 0;
    this.shield.sample(
      {
        guarded: defending,
        playerLowerSequence:
          actor.kind === 'player' ? actor.entity.get('defense')?.lowerSequence : undefined,
        opening: this.opening,
        openingActive: opening,
        gate: this.gate,
        preparation,
        forceReset: !actor.entity.has('defense') || !actor.alive || actor.jump.active,
        dt,
        time,
        // Released rigs ease toward motor heading; resolve world impulses in the drawn basis.
        heading,
      },
      actor.entity.get('blockFeedback'),
    );
    if (defending || opening) {
      this.mode = 'guard';
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
    // Anticipation lives in the supporting body while the hand target already protects. Recoil
    // remains small enough to retain the gate's lane; the full-body solve revalidates feet/grips.
    pose.lean -= this.shield.brace * 1.1 + this.shield.recoil * 0.65;
    // Ground bracing fades out during procedural running flight; a mid-air pelvis compression
    // must not push the authored short-leg flight pose into the next stair tread.
    const groundedBrace = 1 - smoothStep(pose.lift / 0.02);
    pose.bob -=
      (Math.max(0, this.shield.brace) * 0.45 + Math.abs(this.shield.recoil) * 0.25) * groundedBrace;
    pose.roll += this.shield.side * 0.5;
    pose.twist += this.shield.side * 0.6 + this.shield.counter;
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
      this.attackBlend,
      this.shield.weight,
      this.shield.opening,
      Number(this.shield.gate),
      this.shield.brace,
      this.shield.recoil,
      this.shield.side,
      this.shield.counter,
      Number(this.shield.guarded),
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
    if (this.shield.counter !== 0) setEuler(pose.local[j.head], 0, -this.shield.counter, 0);
    const root = pose.local[j.root];
    this.scratch.position.copyFrom(root.position);
    Object.assign(this.scratch.rotation, root.rotation);
    this.scratch.scale.setAll(1);
    compose(this.scratch, this.root);
    this.scratch.scale.copyFrom(root.scale);
    compose(this.scratch, this.basis);
    this.targets.leftGrip.release = this.targets.rightGrip.release = true;
    this.ownsShield = this.mode === 'guard' || (this.mode === 'free' && this.shield.weight > 0);
    const lift = (pose.local[j.pelvis].position.y - 0.55) * root.scale.y;
    if (this.mode === 'carry') {
      const frame = this.frame('cargo', 0, 0.55 + lift, 0.42);
      this.target('left', frame, [-0.325, 0.25, 0]);
      this.target('right', frame, [0.325, 0.25, 0]);
    } else if (this.ownsShield) {
      let weight = this.shield.initialized ? this.shield.weight : 1;
      let opening = this.shield.initialized ? this.shield.opening : this.opening;
      const gate = this.shield.initialized ? this.shield.gate : this.gate;
      if (weight < 1) {
        // Read the unconstrained authored endpoint before guard posture is composed. Both
        // raising and lowering use the same curve, so a reversal can retain its current frame.
        evaluatePose(pose);
        socketMatrix(pose, 'leftGrip', this.freeShield);
      }
      this.shieldFrame(weight, opening, gate, lift);
      const protective = this.shield.initialized ? this.shield.guarded : this.opening === 0;
      if (protective && !this.protectiveShield(pose, gate)) {
        // Find the first protective frame on the current-to-guard path. Already safe frames
        // and their velocity are untouched; only a necessary boundary projection is applied.
        const fromWeight = weight,
          fromOpening = opening;
        let low = 0,
          high = 1;
        for (let pass = 0; pass < SHIELD_PROJECTION_STEPS; pass++) {
          const amount = (low + high) / 2;
          this.shieldFrame(
            fromWeight + (1 - fromWeight) * amount,
            fromOpening * (1 - amount),
            gate,
            lift,
          );
          if (this.protectiveShield(pose, gate)) high = amount;
          else low = amount;
        }
        weight = fromWeight + (1 - fromWeight) * high;
        opening = fromOpening * (1 - high);
        this.shield.project(weight, opening);
        this.shieldFrame(weight, opening, gate, lift);
      }
      // Keep the body upright until the shield has cleared the centreline, then restore the
      // current gait smoothly. Releasing guard cannot tip a running head into the held board.
      this.guardBody(pose, smoothStep(weight / 0.25));
      this.target('left', this.frames.shield, SHIELD_GRIP);
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

  private shieldFrame(weight: number, opening: number, gate: boolean, lift: number): void {
    const across = gate ? 0.29 : -0.22;
    this.frame(
      'shield',
      across + (-0.58 - across) * opening + this.shield.side * 0.35,
      0.97 * Math.hypot(this.basis[4], this.basis[5], this.basis[6]) + lift,
      0.25 - this.shield.recoil,
      -this.shield.recoil * 0.6,
      (Math.PI / 2) * (1 - opening) + this.shield.side * 0.6,
    );
    if (weight < 1) this.lowerShield(weight);
  }

  private guardBody(pose: PoseBuffer, weight: number): void {
    const j = pose.definition.index;
    const blend = (index: number, x: number, y: number, z: number, amount = weight) => {
      setEuler(this.scratch, x, y, z);
      const a = pose.local[index].rotation,
        b = this.scratch.rotation;
      const sign = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0 ? -1 : 1;
      for (const key of ['x', 'y', 'z', 'w'] as const)
        a[key] = a[key] * (1 - amount) + b[key] * sign * amount;
      const length = Math.hypot(a.x, a.y, a.z, a.w);
      for (const key of ['x', 'y', 'z', 'w'] as const) a[key] /= length;
    };
    blend(
      j.spine,
      -this.shield.brace * 1.1 - this.shield.recoil * 0.65,
      this.shield.side * 0.6 + this.shield.counter,
      this.shield.side * 0.5,
    );
    blend(j.leftUpperArm, -0.65, 0, 0);
    blend(j.leftForearm, -1, 0, 0);
    blend(j.rightUpperArm, 0.1, 0, 0, weight * (1 - this.attackBlend));
    blend(j.rightForearm, -0.1, 0, 0, weight * (1 - this.attackBlend));
  }

  private protectiveShield(pose: PoseBuffer, gate: boolean): boolean {
    const m = this.frames.shield,
      r = this.root;
    const geometry = SHIELD_GEOMETRY[pose.definition.profile.id === 'player' ? 'player' : 'kobold'];
    const nx = -(m[5] * m[10] - m[6] * m[9]),
      ny = -(m[6] * m[8] - m[4] * m[10]),
      nz = -(m[4] * m[9] - m[5] * m[8]);
    if ((nx * r[8] + ny * r[9] + nz * r[10]) / Math.hypot(nx, ny, nz) < 0.9802) return false;
    const cx =
      m[12] + m[0] * geometry.center[0] + m[4] * geometry.center[1] + m[8] * geometry.center[2];
    const cy =
      m[13] + m[1] * geometry.center[0] + m[5] * geometry.center[1] + m[9] * geometry.center[2];
    const cz =
      m[14] + m[2] * geometry.center[0] + m[6] * geometry.center[1] + m[10] * geometry.center[2];
    if ((cx - r[12]) * r[8] + (cy - r[13]) * r[9] + (cz - r[14]) * r[10] < 0.301) return false;
    inverse(m, 0, this.parentInverse);
    const inv = this.parentInverse,
      lane = gate ? PHALANX.lane : 0;
    let enter = 0,
      exit = 1;
    for (let axis = 0; axis < 3; axis++) {
      let from = inv[12 + axis],
        to = from;
      for (let row = 0; row < 3; row++) {
        from +=
          inv[row * 4 + axis] * (r[12 + row] + r[row] * lane + r[4 + row] * 0.85 - r[8 + row] * 3);
        to +=
          inv[row * 4 + axis] * (r[12 + row] + r[row] * lane + r[4 + row] * 0.85 + r[8 + row] * 4);
      }
      const center = geometry.center[axis];
      const half = geometry.size[axis] / 2 - 0.005;
      const delta = to - from;
      if (Math.abs(delta) < 1e-9) {
        if (from < center - half || from > center + half) return false;
      } else {
        const a = (center - half - from) / delta,
          b = (center + half - from) / delta;
        enter = Math.max(enter, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
      }
    }
    return enter <= exit;
  }

  private lowerShield(weight: number): void {
    // The authored hand is sampled before the solve, not from its own constrained result. This
    // makes lowering acyclic and lets moving attacks continue beneath the released shield.
    const free = this.freeShield,
      frame = this.frames.shield;
    const fx =
      free[12] - free[0] * SHIELD_GRIP[0] - free[4] * SHIELD_GRIP[1] - free[8] * SHIELD_GRIP[2];
    const fy =
      free[13] - free[1] * SHIELD_GRIP[0] - free[5] * SHIELD_GRIP[1] - free[9] * SHIELD_GRIP[2];
    const fz =
      free[14] - free[2] * SHIELD_GRIP[0] - free[6] * SHIELD_GRIP[1] - free[10] * SHIELD_GRIP[2];
    const gx = frame[12],
      gy = frame[13],
      gz = frame[14];
    inverse(this.basis, 0, this.parentInverse);
    multiplyAffine(this.parentInverse, 0, free, 0, this.local, 0);
    orthonormalize(this.local);
    matrixRotation(this.local, this.orientation);
    const from = this.orientation,
      to = this.scratch.rotation;
    let dot = from.x * to.x + from.y * to.y + from.z * to.z + from.w * to.w;
    const sign = dot < 0 ? -1 : 1;
    dot = Math.min(1, Math.abs(dot));
    const angle = Math.acos(dot),
      sine = Math.sin(angle);
    const a = sine > 1e-6 ? Math.sin((1 - weight) * angle) / sine : 1 - weight;
    const b = (sine > 1e-6 ? Math.sin(weight * angle) / sine : weight) * sign;
    for (const key of ['x', 'y', 'z', 'w'] as const) to[key] = from[key] * a + to[key] * b;
    this.scratch.position.setAll(0);
    this.scratch.scale.setAll(1);
    compose(this.scratch, this.local);
    multiplyAffine(this.basis, 0, this.local, 0, frame, 0);
    const arc = Math.sin(Math.PI * weight) * 0.26;
    const sideArc = Math.sin(Math.PI * weight) * 0.18;
    frame[12] = fx * (1 - weight) + gx * weight + this.root[8] * arc - this.root[0] * sideArc;
    frame[13] = fy * (1 - weight) + gy * weight;
    frame[14] = fz * (1 - weight) + gz * weight + this.root[10] * arc - this.root[2] * sideArc;
  }

  /** Hand-owned props follow FINAL sockets; action-owned two-grip frames remain fixed. */
  finish(pose: PoseBuffer): void {
    socketMatrix(pose, 'rightGrip', this.frames.card);
    this.frames.pipe.set(this.frames.card);
    if (this.mode !== 'crossbow') this.frames.weapon.set(this.frames.card);
    if (!this.ownsShield) {
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
    this.shield.reset();
    this.ownsShield = false;
    actor.entity.get('blockFeedback')?.reset();
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
