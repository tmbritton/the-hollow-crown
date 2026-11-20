import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import type { Scene } from '@babylonjs/core/scene';
import { Actor } from './actors.ts';
import type { Components, ECS } from './ecs.ts';
import { animateLocomotion } from './locomotion.ts';
import type { LocomotionPose } from './locomotion.ts';
import {
  applyJumpPose,
  attackPose,
  deathPose,
  hackySackKick,
  socialPose,
  workPose,
} from './actionPoses.ts';
import { volumeScale } from './animationCurves.ts';
import { heightAt, tileAt } from './world.ts';
import type { NavigationWorld } from './navigation.ts';
import { hackySackPass, isSocializing } from './social.ts';
import '@babylonjs/core/Collisions/collisionCoordinator.js';
import type { Spawn } from './worldTypes.ts';
import { readCorpseTerrain } from './corpseRendering.ts';
import { skeletonLurch } from './skeletonGait.ts';
import { ATTACKS } from './attackKinds.ts';
import { spearPose } from './phalanxPoses.ts';
import { rigBinding } from './rigs/bindings.ts';
import { profiles } from './rigs/humanoid.ts';
import { copyLocal } from './rigs/ikMath.ts';

/** All character collision components use the same Babylon ellipsoid adapter. */
export function bindActorCollision(actor: Actor, scene: Scene, world: NavigationWorld) {
  const proxy = MeshBuilder.CreateBox(`${actor.id} collision proxy`, { size: 1 }, scene);
  proxy.isVisible = false;
  proxy.isPickable = false;
  proxy.ellipsoid.set(0.3, 0.72, 0.3);
  const sync = (position: Spawn) => {
    proxy.position.set(position.x, position.h + actor.jump.height + 0.72, position.z);
    proxy.computeWorldMatrix(true);
  };
  actor.entity.add('collision', {
    sync,
    move: (from, displacement) => {
      // The ground-navigation footprint stays conservative during flight: a jump
      // cannot enter furniture, void or a sealed gate and land inside its collider.
      proxy.position.set(from.x, from.h + 0.72, from.z);
      const delta = new Vector3(displacement.x, 0, displacement.z);
      const supported = (x: number, z: number) =>
        [-0.27, 0.27].every((dx) => [-0.27, 0.27].every((dz) => tileAt(world, x + dx, z + dz)));
      if (!supported(from.x + delta.x, from.z)) delta.x = 0;
      if (!supported(from.x, from.z + delta.z)) delta.z = 0;
      if (!supported(from.x + delta.x, from.z + delta.z)) delta.setAll(0);
      proxy.computeWorldMatrix(true);
      proxy.moveWithCollisions(delta);
      proxy.position.y = (heightAt(world, proxy.position.x, proxy.position.z) ?? from.h) + 0.72;
      proxy.computeWorldMatrix(true);
      return { x: proxy.position.x, z: proxy.position.z };
    },
  });
  return proxy;
}

export function resetActorRig(renderRig: Components['rig'], position?: Spawn): void {
  const binding = rigBinding(renderRig),
    rig = binding.legacy;
  binding.grounding.reset();
  binding.begin(0);
  if (position) rig.root.position.set(position.x, position.h, position.z);
  rig.root.rotation.x = rig.root.rotation.z = 0;
  rig.root.scaling.setAll(1);
  rig.body.rotation.setAll(0);
  rig.body.position.setAll(0);
  rig.head?.rotation.setAll(0);
  rig.shield?.position.setAll(0);
  if (rig.spear) {
    rig.spear.position.set(0.4, 0.85, 0.1);
    rig.spear.rotation.set(-Math.PI / 2, 0, 0);
  }
  rig.javelin?.setEnabled(false);
  for (const limb of [...rig.arms, ...rig.forearms, ...rig.legs, ...rig.knees, ...rig.feet])
    limb.rotation.setAll(0);
  for (let i = 0; i < rig.legs.length; i++)
    rig.legs[i].position.set((i ? 1 : -1) * binding.pose.definition.profile.hipWidth, 0.55, 0);
  for (const plant of rig.footPlants) plant.anchor = null;
  if (rig.cape) rig.cape.rotation.x = -0.16;
  rig.attackBlend = rig.socialBlend = 0;
  rig.attackPose = rig.socialPose = null;
  binding.commit(true);
}

function blendPose(
  pose: LocomotionPose,
  target: LocomotionPose | null,
  weight: number,
  moving = 0,
): void {
  if (!target) return;
  for (const key of Object.keys(pose) as (keyof LocomotionPose)[]) {
    const lowerBody =
      key === 'leftLeg' ||
      key === 'rightLeg' ||
      key === 'leftKnee' ||
      key === 'rightKnee' ||
      key === 'bob' ||
      key === 'lift' ||
      key === 'stretch' ||
      key === 'reach';
    pose[key] += (target[key] - pose[key]) * weight * (lowerBody ? 1 - moving : 1);
  }
}

/** Conservative root-local envelope for the authored rigs, including weapons and all poses.
 * The animation browser suite checks rendered bounds against this broad-phase-only radius.
 */
export const ACTOR_OBSERVATION_RADIUS = 4;

/** Render-only deformation: the motor, collision ellipsoid and attack clock stay authoritative. */
export function animateActors(ecs: ECS, dt: number, time = 0, world?: NavigationWorld): void {
  const carrying = new Set(
    ecs.query('cargo').flatMap((e) => {
      const c = e.require('cargo');
      return c.state === 'carried' && c.owner ? [c.owner] : [];
    }),
  );
  const entities = ecs.query('actor', 'rig', 'movement', 'transform');
  // Finish every fallen pose before sampling contacts; ECS insertion order cannot affect feet.
  for (const entity of entities) {
    const actor = new Actor(entity),
      binding = entity.require('rigPose'),
      rig = binding.legacy,
      p = actor.position;
    if (entity.has('corpse') && binding.grounding.active) {
      binding.captureLegacy();
      binding.grounding.reset();
    }
    binding.begin(dt);
    rig.root.position.set(p.x, actor.elevation, p.z);
    const turn = Math.atan2(
      Math.sin(p.heading - rig.root.rotation.y),
      Math.cos(p.heading - rig.root.rotation.y),
    );
    // A raised shield must face the authoritative guard now, even during a sharp turn.
    if (actor.defending || entity.get('squadMember')?.group.get('koboldSquad')?.active)
      rig.root.rotation.y = p.heading;
    else rig.root.rotation.y += turn * (1 - Math.exp(-18 * dt));
    rig.shield?.position.setAll(0);
    if (rig.shield?.parent === rig.root) {
      rig.shield.position.set(-0.4, 0.85, 0.1);
      rig.shield.rotation.setAll(0);
    }
    for (const arm of [...rig.arms, ...rig.forearms]) arm.rotation.y = 0;
    const corpse = entity.get('corpse');
    if (corpse) {
      rig.javelin?.setEnabled(false);
      if (rig.spear) {
        rig.spear.setEnabled(true);
        rig.spear.position.set(0.4, 0.85, 0.1);
        rig.spear.rotation.set(-Math.PI / 2, 0, 0);
      }
      // Death leaves ordinary equipment visible even when work/social activity had stowed it.
      for (const mesh of rig.equipment ?? []) mesh.setEnabled(true);
      for (const mesh of rig.stowedEquipment ?? []) mesh.setEnabled(false);
      const fall = deathPose(corpse.age);
      const scale = volumeScale(fall.stretch, fall.reach);
      rig.root.rotation.x = fall.rotation;
      rig.root.scaling.set(scale.x, scale.y, scale.z);
      rig.root.position.y += fall.height;
      const settle = corpse.age >= 0.62 ? 1 : 1 - Math.exp(-25 * dt);
      rig.body.rotation.scaleInPlace(1 - settle);
      rig.body.position.scaleInPlace(1 - settle);
      rig.head?.rotation.scaleInPlace(1 - settle);
      rig.arms.forEach((arm, i) => {
        arm.rotation.x += (fall.arm - arm.rotation.x) * settle;
        arm.rotation.z += ((i ? -0.65 : 0.65) - arm.rotation.z) * settle;
      });
      for (const arm of rig.forearms) arm.rotation.x *= 1 - settle;
      rig.legs.forEach((leg, i) => {
        leg.rotation.x += ((i ? 0.2 : -0.2) - leg.rotation.x) * settle;
        leg.rotation.y *= 1 - settle;
        leg.rotation.z *= 1 - settle;
        const hip = (i ? 1 : -1) * binding.pose.definition.profile.hipWidth;
        if (settle === 1) leg.position.set(hip, 0.55, 0);
        else {
          leg.position.x += (hip - leg.position.x) * settle;
          leg.position.y += (0.55 - leg.position.y) * settle;
          leg.position.z *= 1 - settle;
        }
        rig.knees[i].rotation.x *= 1 - settle;
        rig.feet[i].rotation.scaleInPlace(1 - settle);
        rig.footPlants[i].anchor = null;
      });
      if (rig.cape) rig.cape.rotation.x += (-0.16 - rig.cape.rotation.x) * settle;
      rig.attackBlend = rig.socialBlend = 0;
      rig.attackPose = rig.socialPose = null;
      binding.commit();
    }
  }
  const corpses = readCorpseTerrain(ecs);
  for (const entity of entities) {
    if (entity.has('corpse')) continue;
    const actor = new Actor(entity),
      binding = entity.require('rigPose'),
      rig = binding.legacy;
    const defending = actor.defending;
    const relaxing = isSocializing(actor);
    const work = entity.get('work')?.snapshot();
    const working = work?.status === 'working' || work?.status === 'ready';
    for (const mesh of rig.equipment ?? []) mesh.setEnabled(!relaxing && !working);
    for (const mesh of rig.stowedEquipment ?? []) mesh.setEnabled(relaxing || working);
    rig.root.rotation.x = 0;
    const pose = animateLocomotion(
      actor.motion.animation,
      actor.motion.actualSpeed,
      actor.motion.wantsMovement,
      dt,
      profiles[actor.kind].gaitSpeed,
      actor.jump.airborne,
      profiles[actor.kind].gait,
    );
    const swing = actor.attack.swing;
    const member = entity.get('squadMember'),
      squad = member?.group.get('koboldSquad');
    const opening = !!member && !!squad?.isOpening(member);
    if (defending) {
      rig.attackBlend = rig.socialBlend = 0;
      rig.attackPose = rig.socialPose = null;
    }
    rig.attackBlend += ((swing ? 1 : 0) - rig.attackBlend) * (1 - Math.exp(-25 * dt));
    if (swing && (swing.kind === 'MELEE' || swing.kind === 'CROSSBOW'))
      rig.attackPose = attackPose(
        swing.elapsed,
        swing.duration,
        swing.impact,
        ATTACKS[swing.kind].projectile,
      );
    else if (swing) rig.attackPose = null;
    // Retain the sampled pose on interruption, including the ranged recoil, while it fades.
    rig.socialBlend += ((relaxing || working ? 1 : 0) - rig.socialBlend) * (1 - Math.exp(-18 * dt));
    if (working) rig.socialPose = workPose(work.elapsed);
    else if (relaxing) {
      const phase = time + (actor.brain?.social?.phase ?? 0) + (actor.brain?.slot ?? 0) * 1.7;
      const activity = actor.brain?.state;
      if (activity === 'cards' || activity === 'smoke') {
        rig.socialPose = socialPose(activity, phase);
      } else if (actor.brain?.social) {
        const pass = hackySackPass(actor.brain.social, ecs, time);
        const kick =
          pass && (pass.from === actor.id || pass.to === actor.id)
            ? hackySackKick(pass.progress, pass.to === actor.id)
            : 0;
        rig.socialPose = socialPose('hackysack', phase, kick);
      }
    }
    blendPose(pose, rig.socialPose, rig.socialBlend);
    if (carrying.has(entity) && !actor.attack.target && !actor.attack.swing && !working) {
      pose.leftArm = pose.rightArm = -0.65;
      pose.leftElbow = pose.rightElbow = 1.05;
      pose.lean += 0.1;
    }
    // Keep the measured gait and ground contact under the upper-body weapon action.
    blendPose(pose, rig.attackPose, rig.attackBlend, Math.min(1, actor.motion.actualSpeed / 0.8));
    applyJumpPose(pose, actor.jump);
    const dynamics = actor.motion.animation;
    const sin = Math.sin(rig.root.rotation.y),
      cos = Math.cos(rig.root.rotation.y);
    const acceleration = actor.motion.acceleration;
    const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
    const free = (1 - rig.attackBlend) * (1 - rig.socialBlend) * (actor.jump.airborne ? 0.35 : 1);
    pose.lean +=
      dynamics.forwardLean.advance(
        clamp((acceleration.x * sin + acceleration.z * cos) * 0.008, 0.18),
        dt,
      ) * free;
    pose.roll -=
      dynamics.sideLean.advance(
        clamp((acceleration.x * cos - acceleration.z * sin) * 0.008, 0.18),
        dt,
      ) * free;
    if (actor.jump.landings !== dynamics.landings) {
      dynamics.landings = actor.jump.landings;
      dynamics.compression.velocity -= Math.min(10, actor.jump.landingSpeed) * 0.65;
      dynamics.cape.velocity += actor.jump.landingSpeed * 0.45;
    }
    const compression = clamp(dynamics.compression.advance(0, dt, 20, 0.6), 0.16);
    const crouch = dynamics.crouch.advance(actor.brain?.state === 'hide' ? 0.16 : 0, dt);
    pose.bob += compression * 0.6 - crouch;
    pose.stretch *= 1 + compression * 0.75 - crouch * 0.3;
    pose.reach /= Math.sqrt(1 + compression * 0.75 - crouch * 0.3);
    pose.cape = dynamics.cape.advance(
      pose.cape - clamp((acceleration.x * sin + acceleration.z * cos) * 0.002, 0.12),
      dt,
      16,
      0.62,
    );
    if (defending || opening) {
      // Turn the left arm inward: the shield's outward -X face becomes forward +Z.
      // Preserve gait, plants and head; the right hand keeps its weapon lowered.
      pose.leftArm = -0.65;
      pose.leftElbow = 1;
      pose.rightArm = 0.1;
      pose.rightElbow = 0.1;
      pose.armSpread = pose.twist = pose.roll = 0;
      pose.lean = 0;
      rig.arms[0].rotation.y = Math.PI / 2;
      if (rig.shield) rig.shield.position.x = -0.18;
      if (opening) {
        const amount =
          squad!.state === 'attacking'
            ? 1
            : Math.min(1, squad!.chart.snapshot.context.elapsed / 0.25);
        rig.arms[0].rotation.y = (Math.PI / 2) * (1 - amount);
        pose.armSpread = 0.35 * amount;
        if (rig.shield) rig.shield.position.x = -0.18 - 0.25 * amount;
      }
      if (rig.shield?.parent === rig.root) {
        const amount = opening
          ? squad!.state === 'attacking'
            ? 1
            : Math.min(1, squad!.chart.snapshot.context.elapsed / 0.25)
          : 0;
        // The centre guard carries the broad face across the actual right-hand lane.
        // Opening sweeps it left, away from both the shaft and the exposed chest.
        const across = member && squad?.isGate(member) ? 0.29 : -0.22;
        rig.shield.position.set(across + (-0.58 - across) * amount, 0.97, 0.25);
        rig.shield.rotation.y = (Math.PI / 2) * (1 - amount);
      }
    }
    if (rig.spear && rig.javelin) {
      const weapon = spearPose(swing);
      rig.spear.setEnabled(!relaxing && !working && !weapon.throwing);
      rig.javelin.setEnabled(!relaxing && !working && weapon.throwing && !weapon.released);
      rig.spear.position.set(0.4, 0.85, 0.1 + weapon.extension);
      rig.spear.rotation.set(weapon.pitch, 0, 0);
      rig.javelin.position.set(
        0.4,
        0.85 + (1 - weapon.extension) * 0.5,
        0.1 - (1 - weapon.extension) * 0.65,
      );
      rig.javelin.rotation.set(weapon.pitch, 0, 0);
      if (!relaxing && !working) {
        pose.rightArm = weapon.arm;
        pose.rightElbow = weapon.elbow;
        pose.leftArm = -0.8;
        pose.leftElbow = 0.9;
        pose.twist = pose.roll = 0;
        pose.lean = weapon.throwing ? 0.1 * weapon.extension : 0;
      }
    }
    // Backsteps keep a short, travel-driven gait facing the threat; no reversed root or
    // free-running leg clock when a retreat is blocked.
    if (
      actor.motion.velocity.x * Math.sin(actor.position.heading) +
        actor.motion.velocity.z * Math.cos(actor.position.heading) <
      -0.05
    ) {
      pose.leftLeg *= -0.65;
      pose.rightLeg *= -0.65;
      pose.leftKnee *= 0.65;
      pose.rightKnee *= 0.65;
      pose.lean *= -0.5;
    }
    const grounding = binding.grounding;
    // Preserve the authored Euler branch as a binding hint while A4 action adapters still read
    // these channels. The binding uses it only when it matches the final solved matrix.
    rig.arms[0].rotation.x = pose.leftArm;
    rig.arms[1].rotation.x = pose.rightArm;
    rig.arms[0].rotation.z = -pose.armSpread;
    rig.arms[1].rotation.z = pose.armSpread;
    rig.forearms[0].rotation.x = -pose.leftElbow;
    rig.forearms[1].rotation.x = -pose.rightElbow;
    rig.body.rotation.set(pose.lean, pose.twist, pose.roll);
    grounding.armYaw[0] = rig.arms[0].rotation.y;
    grounding.armYaw[1] = rig.arms[1].rotation.y;
    grounding.head.setAll(0);
    if (rig.head) {
      const lurch = skeletonLurch(dynamics.stride);
      const weight =
        actor.kind !== 'skeleton' || actor.jump.active
          ? 0
          : dynamics.blend * (1 - rig.attackBlend) * (1 - rig.socialBlend);
      grounding.head.set(lurch.headPitch * weight, 0, lurch.headRoll * weight);
    }
    if (rig.cape) rig.cape.rotation.x = pose.cape;
    const solved = grounding.sample(actor, pose, rig.root.rotation.y, world, corpses);
    rig.root.scaling.copyFrom(solved.pose.local[0].scale);
    // A4 retains the current equipment frame until its grips migrate; lift is now beneath the
    // gameplay anchor, so root-mounted presentation receives the equivalent local offset.
    for (const item of [rig.shield, rig.spear, rig.javelin])
      if (item?.parent === rig.root)
        item.position.y += grounding.visualLift / solved.pose.local[0].scale.y;
    copyLocal(solved.pose.local, binding.pose.local);
    binding.apply();
  }
}
