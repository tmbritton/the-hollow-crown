import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Scene } from '@babylonjs/core/scene';
import { Actor } from './actors.ts';
import type { Components, ECS } from './ecs.ts';
import { animateLocomotion, WALK_SPEED } from './locomotion.ts';
import type { LocomotionPose } from './locomotion.ts';
import { applyJumpPose, attackPose, deathPose, hackySackKick, socialPose } from './actionPoses.ts';
import { volumeScale } from './animationCurves.ts';
import { heightAt, tileAt } from './world.ts';
import type { NavigationWorld } from './navigation.ts';
import { hackySackPass, isSocializing } from './social.ts';
import '@babylonjs/core/Collisions/collisionCoordinator';
import type { Spawn } from './worldTypes.ts';
import { placeFeet } from './footPlacement.ts';

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

export function resetActorRig(rig: Components['rig']): void {
  rig.root.rotation.x = rig.root.rotation.z = 0;
  rig.root.scaling.setAll(1);
  rig.body.rotation.setAll(0);
  rig.body.position.setAll(0);
  for (const limb of [...rig.arms, ...rig.forearms, ...rig.legs, ...rig.knees, ...rig.feet])
    limb.rotation.setAll(0);
  for (const leg of rig.legs) leg.position.y = 0.55;
  for (const plant of rig.footPlants) plant.anchor = null;
  if (rig.cape) rig.cape.rotation.x = -0.16;
  rig.attackBlend = rig.socialBlend = 0;
  rig.attackPose = rig.socialPose = null;
}

function blendPose(pose: LocomotionPose, target: LocomotionPose | null, weight: number): void {
  if (!target) return;
  for (const key of Object.keys(pose) as (keyof LocomotionPose)[])
    pose[key] += (target[key] - pose[key]) * weight;
}

/** Render-only deformation: the motor, collision ellipsoid and attack clock stay authoritative. */
export function animateActors(ecs: ECS, dt: number, time = 0, world?: NavigationWorld): void {
  for (const entity of ecs.query('actor', 'rig', 'movement', 'transform')) {
    const actor = new Actor(entity),
      rig = entity.require('rig'),
      p = actor.position;
    rig.root.position.set(p.x, actor.elevation, p.z);
    const turn = Math.atan2(
      Math.sin(p.heading - rig.root.rotation.y),
      Math.cos(p.heading - rig.root.rotation.y),
    );
    rig.root.rotation.y += turn * (1 - Math.exp(-18 * dt));
    const corpse = entity.get('corpse');
    const relaxing = isSocializing(actor);
    for (const mesh of rig.equipment ?? []) mesh.setEnabled(!relaxing);
    if (corpse) {
      const fall = deathPose(corpse.age);
      const scale = volumeScale(fall.stretch, fall.reach);
      rig.root.rotation.x = fall.rotation;
      rig.root.scaling.set(scale.x, scale.y, scale.z);
      rig.root.position.y += fall.height;
      const settle = corpse.age >= 0.62 ? 1 : 1 - Math.exp(-25 * dt);
      rig.body.rotation.scaleInPlace(1 - settle);
      rig.body.position.scaleInPlace(1 - settle);
      rig.arms.forEach((arm, i) => {
        arm.rotation.x += (fall.arm - arm.rotation.x) * settle;
        arm.rotation.z += ((i ? -0.65 : 0.65) - arm.rotation.z) * settle;
      });
      for (const arm of rig.forearms) arm.rotation.x *= 1 - settle;
      rig.legs.forEach((leg, i) => {
        leg.rotation.x += ((i ? 0.2 : -0.2) - leg.rotation.x) * settle;
        leg.rotation.z *= 1 - settle;
        leg.position.y += (0.55 - leg.position.y) * settle;
        rig.knees[i].rotation.x *= 1 - settle;
        rig.feet[i].rotation.scaleInPlace(1 - settle);
        rig.footPlants[i].anchor = null;
      });
      if (rig.cape) rig.cape.rotation.x += (-0.16 - rig.cape.rotation.x) * settle;
      rig.attackBlend = rig.socialBlend = 0;
      rig.attackPose = rig.socialPose = null;
      continue;
    }
    rig.root.rotation.x = 0;
    const pose = animateLocomotion(
      actor.motion.animation,
      actor.motion.actualSpeed,
      actor.motion.wantsMovement,
      dt,
      { player: WALK_SPEED, skeleton: 1.65, goblin: 2.5, kobold: 2.1 }[actor.kind],
      actor.jump.airborne,
    );
    const swing = actor.attack.swing;
    rig.attackBlend += ((swing ? 1 : 0) - rig.attackBlend) * (1 - Math.exp(-25 * dt));
    if (swing)
      rig.attackPose = attackPose(swing.elapsed, swing.duration, swing.impact, swing.ranged);
    // Retain the sampled pose on interruption, including the ranged recoil, while it fades.
    rig.socialBlend += ((relaxing ? 1 : 0) - rig.socialBlend) * (1 - Math.exp(-18 * dt));
    if (relaxing) {
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
    blendPose(pose, rig.attackPose, rig.attackBlend);
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
    const scale = volumeScale(pose.stretch, pose.reach);
    rig.root.scaling.set(scale.x, scale.y, scale.z);
    rig.root.position.y += pose.lift;
    placeFeet(actor, rig, pose, world);
    rig.arms[0].rotation.x = pose.leftArm;
    rig.arms[1].rotation.x = pose.rightArm;
    rig.forearms[0].rotation.x = -pose.leftElbow;
    rig.forearms[1].rotation.x = -pose.rightElbow;
    rig.arms[0].rotation.z = -pose.armSpread;
    rig.arms[1].rotation.z = pose.armSpread;
    rig.body.rotation.x = pose.lean;
    rig.body.rotation.y = pose.twist;
    rig.body.rotation.z = pose.roll;
    rig.body.position.y = pose.bob;
    if (rig.cape) rig.cape.rotation.x = pose.cape;
  }
}
