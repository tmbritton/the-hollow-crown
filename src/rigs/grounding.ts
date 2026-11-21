import type { Actor } from '../actors.ts';
import type { LocomotionPose } from '../locomotion.ts';
import type { NavigationWorld } from '../navigation.ts';
import type { Spawn } from '../worldTypes.ts';
import type { CorpseBox } from '../corpseTerrain.ts';
import { corpseHeightAt, MAX_CORPSE_STEP } from '../corpseTerrain.ts';
import { heightAt } from '../world.ts';
import { volumeScale } from '../animationCurves.ts';
import { gaitFootPhase } from '../skeletonGait.ts';
import { createPose, evaluatePose, resetLocal, setEuler } from './pose.ts';
import { clamp, matrixRotation } from './ikMath.ts';
import { PoseVector } from './types.ts';
import type { PoseBuffer, RigDefinition } from './types.ts';
import { FullBodySolver } from './solver.ts';
import type { RigTargets } from './targets.ts';
import type { ActionRig } from './actions.ts';

type ContactMode = 'stance' | 'swing' | 'flight' | 'unsupported';
type ReleaseReason = 'reset' | 'swing' | 'flight' | 'idle' | 'turn' | 'reach' | 'unsupported';
const poseChannels: readonly (keyof LocomotionPose)[] = [
  'leftLeg',
  'rightLeg',
  'leftKnee',
  'rightKnee',
  'leftArm',
  'rightArm',
  'leftElbow',
  'rightElbow',
  'armSpread',
  'lean',
  'roll',
  'twist',
  'bob',
  'lift',
  'stretch',
  'reach',
  'cape',
];
export interface FootContact {
  readonly plant: { anchor: Spawn | null };
  mode: ContactMode;
  releaseReason: ReleaseReason;
  releases: number;
  anchorError: number;
  blocked: boolean;
  phase: number;
  step: number;
  readonly position: [number, number, number];
  readonly rotation: [number, number, number, number];
  readonly target: {
    space: 'rig';
    position: [number, number, number];
    rotation: [number, number, number, number];
    required: boolean;
    release: boolean;
  };
}

/** Ten planning samples + seven final sole/ankle samples per foot in each of four solver passes. */
export const GROUNDING_BUDGET = Object.freeze({ terrainQueries: 66, corpseQueries: 74, passes: 4 });

/** ECS rigPose-owned contact planner. All positions below are presentation targets; the actor's
 * support, collision, jump, navigation and impact clocks are read-only inputs. */
export class GroundedLocomotion {
  readonly authored: PoseBuffer;
  readonly solver: FullBodySolver;
  readonly contacts: readonly FootContact[];
  readonly targets: { -readonly [K in keyof RigTargets]: RigTargets[K] };
  readonly armYaw: [number, number] = [0, 0];
  readonly head = new PoseVector();
  active = false;
  terrainQueries = 0;
  corpseQueries = 0;
  minimumClearance = 0;
  corpseRise = 0;
  visualLift = 0;
  private world: NavigationWorld | undefined;
  private readonly corpses: CorpseBox[] = [];
  private readonly probe: Spawn = { x: 0, z: 0, h: 0 };
  private readonly matrix = new Float64Array(16);
  private readonly heights = new Float64Array(4);
  private readonly q = { x: 0, y: 0, z: 0, w: 1 };
  private support = 0;
  private sin = 0;
  private cos = 1;
  private allowCorpses = false;
  private readonly request = new Float64Array(96);
  private readonly sampledRequest = new Float64Array(96);
  private sampledActor: Actor['entity'] | undefined;
  private sampledAnimation: Actor['motion']['animation'] | undefined;
  private sampledKind: Actor['kind'] | undefined;
  private sampledTime = -Infinity;
  private sampledTiles: NavigationWorld['tiles'] | undefined;
  private readonly sampledCorpses: CorpseBox[] = [];
  private actions: ActionRig | undefined;

  constructor(definition: RigDefinition, plants: readonly { anchor: Spawn | null }[]) {
    if (plants.length !== 2) throw new Error('Humanoid contacts need two plants');
    this.authored = createPose(definition);
    this.solver = new FullBodySolver(definition, { pelvis: 0.2, pelvisUp: 0 });
    this.contacts = plants.map((plant) => {
      const position: [number, number, number] = [0, 0, 0],
        rotation: [number, number, number, number] = [0, 0, 0, 1];
      return {
        plant,
        mode: 'unsupported',
        releaseReason: 'reset',
        releases: 0,
        anchorError: 0,
        blocked: false,
        phase: 0,
        step: 0,
        position,
        rotation,
        target: { space: 'rig', position, rotation, required: true, release: true },
      };
    });
    this.targets = { leftSole: this.contacts[0].target, rightSole: this.contacts[1].target };
  }

  get result() {
    return this.solver.result;
  }

  reset(): void {
    for (const c of this.contacts) {
      c.plant.anchor = null;
      c.mode = 'unsupported';
      c.releaseReason = 'reset';
      c.releases = 0;
      c.anchorError = 0;
      c.blocked = false;
      c.step = 0;
      c.target.release = true;
    }
    this.active = false;
    this.corpseRise = this.visualLift = this.terrainQueries = this.corpseQueries = 0;
    this.world = undefined;
    this.corpses.length = 0;
    this.minimumClearance = 0;
    this.head.setAll(0);
    this.armYaw[0] = this.armYaw[1] = 0;
    this.sampledActor = undefined;
    this.sampledAnimation = undefined;
    this.sampledTiles = undefined;
    this.sampledCorpses.length = 0;
  }

  sample(
    actor: Actor,
    motion: LocomotionPose,
    heading: number,
    world?: NavigationWorld,
    corpses: readonly CorpseBox[] = [],
    actions?: ActionRig,
  ) {
    // A presentation sample consumes contact decisions once. Rendering/inspection of the same
    // authoritative clock + pose inputs reads that solved snapshot rather than planning again
    // from the release decisions it just produced. New geometry/inputs or reset invalidate it.
    let repeated =
      this.active &&
      this.sampledTime === actor.motion.animation.time &&
      this.sampledActor === actor.entity &&
      this.sampledAnimation === actor.motion.animation &&
      this.sampledKind === actor.kind &&
      this.actions === actions &&
      this.world === world &&
      this.sampledTiles === world?.tiles &&
      this.sampledCorpses.length === corpses.length;
    if (repeated) {
      this.writeRequest(actor, motion, heading);
      for (let i = 0; i < this.request.length; i++)
        if (this.request[i] !== this.sampledRequest[i]) {
          repeated = false;
          break;
        }
    }
    if (repeated)
      for (let i = 0; i < corpses.length; i++)
        if (corpses[i] !== this.sampledCorpses[i]) {
          repeated = false;
          break;
        }
    if (repeated) return this.result;
    this.actions = actions;
    const pose = this.authored,
      d = pose.definition,
      j = d.index;
    resetLocal(pose);
    const root = pose.local[j.root],
      scale = volumeScale(motion.stretch, motion.reach);
    root.position.set(actor.position.x, actor.elevation, actor.position.z);
    root.scale.set(scale.x, scale.y, scale.z);
    setEuler(root, 0, heading, 0);
    pose.local[j.pelvis].position.y += motion.bob + motion.lift / scale.y;
    setEuler(pose.local[j.spine], motion.lean, motion.twist, motion.roll);
    setEuler(pose.local[j.head], this.head.x, this.head.y, this.head.z);
    setEuler(pose.local[j.leftUpperArm], motion.leftArm, this.armYaw[0], -motion.armSpread);
    setEuler(pose.local[j.rightUpperArm], motion.rightArm, this.armYaw[1], motion.armSpread);
    setEuler(pose.local[j.leftForearm], -motion.leftElbow, 0, 0);
    setEuler(pose.local[j.rightForearm], -motion.rightElbow, 0, 0);
    setEuler(pose.local[j.leftThigh], motion.leftLeg, 0, 0);
    setEuler(pose.local[j.rightThigh], motion.rightLeg, 0, 0);
    setEuler(pose.local[j.leftShin], motion.leftKnee, 0, 0);
    setEuler(pose.local[j.rightShin], motion.rightKnee, 0, 0);
    setEuler(pose.local[j.leftFoot], -motion.leftLeg - motion.leftKnee, 0, 0);
    setEuler(pose.local[j.rightFoot], -motion.rightLeg - motion.rightKnee, 0, 0);
    this.world = world;
    this.support = actor.position.h;
    this.sin = Math.sin(heading);
    this.cos = Math.cos(heading);
    this.allowCorpses = !actor.jump.active;
    // The maximum foot/stride/plant envelope is bounded by anatomy and authored scale. Cull
    // distant boxes once, rather than walking every corpse for every corner and swing probe.
    let nearbyCount = 0;
    if (this.allowCorpses) {
      const profile = d.profile;
      const radius =
        (profile.hipWidth +
          Math.max(
            d.chains.leftLeg.upperLength + d.chains.leftLeg.lowerLength,
            d.chains.rightLeg.upperLength + d.chains.rightLeg.lowerLength,
          ) +
          0.2 +
          profile.soleForward +
          profile.soleHalfDepth) *
          Math.max(scale.x, scale.z) +
        0.35;
      for (const box of corpses)
        if (
          box.worldMin.x <= actor.position.x + radius &&
          box.worldMax.x >= actor.position.x - radius &&
          box.worldMin.z <= actor.position.z + radius &&
          box.worldMax.z >= actor.position.z - radius
        )
          this.corpses[nearbyCount++] = box;
    }
    this.corpses.length = nearbyCount;
    this.terrainQueries = this.corpseQueries = 0;
    this.minimumClearance = 0;
    this.corpseRise = 0;
    // Grounded targets come from the contact plan; only a running flight pose needs authored FK.
    if (motion.lift > 0.005 && !actor.jump.airborne) evaluatePose(pose);
    for (let i = 0; i < 2; i++) this.plan(actor, motion, i);
    this.corpseRise = Math.min(0.14, Math.max(this.contacts[0].step, this.contacts[1].step) * 0.3);
    pose.local[j.pelvis].position.y += this.corpseRise / scale.y;
    this.visualLift = motion.lift + this.corpseRise;
    actions?.plan(pose);
    this.targets.leftGrip = actions?.targets.leftGrip;
    this.targets.rightGrip = actions?.targets.rightGrip;
    this.active = true;
    const result = this.solver.solve(pose, this.targets, this.refine);
    this.writeRequest(actor, motion, heading);
    this.sampledRequest.set(this.request);
    this.sampledActor = actor.entity;
    this.sampledAnimation = actor.motion.animation;
    this.sampledKind = actor.kind;
    this.sampledTime = actor.motion.animation.time;
    this.sampledTiles = world?.tiles;
    for (let i = 0; i < corpses.length; i++) this.sampledCorpses[i] = corpses[i];
    this.sampledCorpses.length = corpses.length;
    return result;
  }

  private writeRequest(actor: Actor, pose: LocomotionPose, heading: number): void {
    const a = this.request,
      m = actor.motion;
    let n = 0;
    a[n++] = actor.position.x;
    a[n++] = actor.position.z;
    a[n++] = actor.position.h;
    a[n++] = actor.elevation;
    a[n++] = heading;
    a[n++] = m.animation.time;
    a[n++] = m.animation.stride;
    a[n++] = m.animation.run;
    a[n++] = m.actualSpeed;
    a[n++] = m.velocity.x;
    a[n++] = m.velocity.z;
    a[n++] = Number(actor.jump.active);
    a[n++] = Number(actor.jump.airborne);
    a[n++] = this.armYaw[0];
    a[n++] = this.armYaw[1];
    a[n++] = this.head.x;
    a[n++] = this.head.y;
    a[n++] = this.head.z;
    a[n++] = actor.entity.get('rig')?.socialBlend ?? 0;
    a[n++] = Number(actor.brain?.state === 'hackysack');
    for (const key of poseChannels) a[n++] = pose[key];
    for (const c of this.contacts) {
      a[n++] = c.plant.anchor?.x ?? Infinity;
      a[n++] = c.plant.anchor?.z ?? Infinity;
      a[n++] = c.plant.anchor?.h ?? Infinity;
      a[n++] = Number(c.blocked);
      a[n++] = c.mode === 'stance' ? 1 : c.mode === 'swing' ? 2 : c.mode === 'flight' ? 3 : 0;
    }
    this.actions?.writeRequest(a, n);
  }

  private release(contact: FootContact, reason: ReleaseReason): void {
    if (contact.plant.anchor) {
      contact.releases++;
      contact.releaseReason = reason;
    }
    contact.plant.anchor = null;
  }

  private floor(x: number, z: number): number | null {
    if (!this.world) return this.support;
    this.terrainQueries++;
    return heightAt(this.world, x, z);
  }

  private corpse(x: number, z: number, h: number): number {
    if (!this.allowCorpses || !this.corpses.length) return 0;
    this.corpseQueries++;
    this.probe.x = x;
    this.probe.z = z;
    this.probe.h = h;
    return corpseHeightAt(this.corpses, this.probe);
  }

  private plan(actor: Actor, motion: LocomotionPose, i: number): void {
    const c = this.contacts[i],
      p = this.authored,
      profile = p.definition.profile,
      scale = p.local[0].scale;
    const moving = actor.motion.actualSpeed > 0.08,
      phase = gaitFootPhase(
        actor.motion.animation.stride,
        i,
        actor.kind === 'skeleton' ? 'skeleton' : 'ordinary',
      );
    c.phase = phase;
    c.step = 0;
    c.anchorError = 0;
    const kicking =
      (actor.entity.get('rig')?.socialBlend ?? 0) > 0.4 &&
      actor.brain?.state === 'hackysack' &&
      i === 1;
    if (actor.jump.airborne || kicking) {
      this.release(c, 'flight');
      c.mode = 'flight';
      c.target.release = true;
      c.blocked = false;
      return;
    }
    const stance = !moving || phase < Math.PI;
    const flight = motion.lift > 0.005;
    const mode = flight ? 'flight' : stance ? 'stance' : 'swing';
    if (c.mode !== mode) c.blocked = false;
    c.mode = mode;
    c.target.release = false;
    c.target.required = mode === 'stance';
    const angle = i ? motion.rightLeg : motion.leftLeg;
    const side = (i ? 1 : -1) * profile.hipWidth * scale.x;
    const forward =
      (-Math.sin(angle) * (0.3 + actor.motion.animation.run * 0.07) + profile.soleForward) *
      scale.z;
    const x = actor.position.x + this.cos * side + this.sin * forward,
      z = actor.position.z - this.sin * side + this.cos * forward;
    let floor = this.floor(x, z);
    if (floor === null || Math.abs(floor - actor.position.h) > 0.45) {
      this.release(c, 'unsupported');
      c.mode = 'unsupported';
      c.target.release = true;
      return;
    }
    if (!stance || !moving || actor.jump.active || flight)
      this.release(c, !moving ? 'idle' : flight || actor.jump.active ? 'flight' : 'swing');
    else if (!c.plant.anchor && !c.blocked) c.plant.anchor = { x, z, h: floor };
    if (c.plant.anchor) {
      const dx = c.plant.anchor.x - actor.position.x,
        dz = c.plant.anchor.z - actor.position.z;
      if (Math.hypot(dx, dz) > 0.43 || Math.abs(dx * this.cos - dz * this.sin - side) > 0.16) {
        this.release(c, Math.abs(dx * this.cos - dz * this.sin - side) > 0.16 ? 'turn' : 'reach');
        c.blocked = true;
      }
    }
    const gx = c.plant.anchor?.x ?? x,
      gz = c.plant.anchor?.z ?? z;
    floor = c.plant.anchor?.h ?? floor;
    const hw = profile.soleHalfWidth * scale.x,
      hd = profile.soleHalfDepth * scale.z;
    let highest = this.corpse(gx, gz, floor);
    // Four flat-yaw footprint samples establish the terrain plane and anticipate drawn edges.
    for (let n = 0; n < 4; n++) {
      const sx = n < 2 ? -hw : hw,
        sz = n % 2 ? -hd : hd;
      const px = gx + this.cos * sx + this.sin * sz,
        pz = gz - this.sin * sx + this.cos * sz;
      const h = this.floor(px, pz) ?? floor;
      this.heights[n] = h;
      highest = Math.max(highest, this.corpse(px, pz, h));
    }
    if (moving && phase > Math.PI && this.allowCorpses && this.corpses.length) {
      let ahead = highest;
      for (let n = 0; n < 4; n++) {
        const t = n < 2 ? -1 + n * 0.5 : 0.5 + (n - 2) * 0.5;
        ahead = Math.max(
          ahead,
          this.corpse(
            gx + (actor.motion.velocity.x / actor.motion.actualSpeed) * 0.35 * t,
            gz + (actor.motion.velocity.z / actor.motion.actualSpeed) * 0.35 * t,
            floor,
          ),
        );
      }
      highest = Math.max(highest, ahead * Math.sin(phase - Math.PI));
    }
    c.step = Math.min(MAX_CORPSE_STEP, highest);
    const gxSlope =
      (this.heights[2] + this.heights[3] - this.heights[0] - this.heights[1]) / (4 * hw);
    const gzSlope =
      (this.heights[0] + this.heights[2] - this.heights[1] - this.heights[3]) / (4 * hd);
    const nx = -clamp(gxSlope, -0.65, 0.65) * scale.x,
      ny = scale.y,
      nz = -clamp(gzSlope, -0.65, 0.65) * scale.z;
    const normal = Math.hypot(nx, ny, nz),
      fy = -nz / ny,
      forwardLength = Math.hypot(fy, 1);
    const m = this.matrix;
    m[4] = nx / normal;
    m[5] = ny / normal;
    m[6] = nz / normal;
    m[8] = 0;
    m[9] = fy / forwardLength;
    m[10] = 1 / forwardLength;
    m[0] = m[5] * m[10] - m[6] * m[9];
    m[1] = -m[4] * m[10];
    m[2] = m[4] * m[9];
    matrixRotation(m, this.q);
    c.rotation[0] = this.q.x;
    c.rotation[1] = this.q.y;
    c.rotation[2] = this.q.z;
    c.rotation[3] = this.q.w;
    const swingLift = stance
      ? 0
      : Math.sin(phase - Math.PI) * (0.1 + actor.motion.animation.run * 0.06);
    const dx = gx - actor.position.x,
      dz = gz - actor.position.z;
    c.position[0] = (dx * this.cos - dz * this.sin) / scale.x;
    c.position[2] = (dx * this.sin + dz * this.cos) / scale.z;
    // A short leg's swing arc clears the obstacle; it does not stack a second full lift on it.
    c.position[1] = (floor + Math.max(c.step, swingLift) - actor.elevation) / scale.y;
    if (flight && c.step === 0) {
      // Preserve the authored running flight arc while still checking its final soles for contact.
      const o = p.definition.index[i ? 'rightFoot' : 'leftFoot'] * 16,
        w = p.world;
      c.position[0] =
        ((w[o + 12] - actor.position.x) * this.cos) / scale.x -
        ((w[o + 14] - actor.position.z) * this.sin) / scale.x;
      c.position[2] =
        ((w[o + 12] - actor.position.x) * this.sin + (w[o + 14] - actor.position.z) * this.cos) /
          scale.z +
        profile.soleForward;
      c.position[1] = (w[o + 13] - actor.elevation) / scale.y - 0.05;
    }
  }

  private readonly refine = (pose: PoseBuffer): boolean => {
    let changed = false;
    this.minimumClearance = Infinity;
    const p = pose.definition.profile,
      root = this.authored.local[0],
      scale = root.scale;
    for (let i = 0; i < 2; i++) {
      const c = this.contacts[i];
      if (c.target.release) continue;
      const o = pose.definition.index[i ? 'rightFoot' : 'leftFoot'] * 16,
        m = pose.world;
      let penetration = 0;
      for (let n = 0; n < 7; n++) {
        const x = n < 4 ? (n < 2 ? -p.soleHalfWidth : p.soleHalfWidth) : 0;
        const z =
          n < 4
            ? p.soleForward + (n % 2 ? -p.soleHalfDepth : p.soleHalfDepth)
            : n === 4
              ? p.soleForward
              : 0;
        const wx = n === 6 ? m[o + 12] : m[o] * x - m[o + 4] * 0.05 + m[o + 8] * z + m[o + 12];
        const wy =
          n === 6
            ? m[o + 13] - 0.05 * scale.y
            : m[o + 1] * x - m[o + 5] * 0.05 + m[o + 9] * z + m[o + 13];
        const wz = n === 6 ? m[o + 14] : m[o + 2] * x - m[o + 6] * 0.05 + m[o + 10] * z + m[o + 14];
        const floor = this.floor(wx, wz);
        if (floor === null || Math.abs(floor - this.support) > 0.65) continue;
        const clearance = wy - floor - this.corpse(wx, wz, floor);
        this.minimumClearance = Math.min(this.minimumClearance, clearance);
        penetration = Math.max(penetration, -clearance);
        if (n === 4 && c.plant.anchor) {
          c.anchorError = Math.hypot(wx - c.plant.anchor.x, wz - c.plant.anchor.z);
          if (c.anchorError > 0.02) {
            this.release(c, 'reach');
            c.blocked = true;
            const dx = wx - root.position.x,
              dz = wz - root.position.z;
            c.position[0] = (dx * this.cos - dz * this.sin) / scale.x;
            c.position[2] = (dx * this.sin + dz * this.cos) / scale.z;
            changed = true;
          }
        }
      }
      if (penetration > 0.0001) {
        c.position[1] += (penetration + 0.0005) / scale.y;
        changed = true;
      }
    }
    if (!Number.isFinite(this.minimumClearance)) this.minimumClearance = 0;
    if (
      this.terrainQueries > GROUNDING_BUDGET.terrainQueries ||
      this.corpseQueries > GROUNDING_BUDGET.corpseQueries
    )
      throw new Error('Grounding query budget exceeded');
    return changed;
  };
}
