import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import type { Scene } from '@babylonjs/core/scene';
import { Actor } from './actors.ts';
import type { Components, ECS } from './ecs.ts';
import { animateLocomotion } from './locomotion.ts';
import { applyJumpPose } from './actionPoses.ts';
import { heightAt, tileAt } from './world.ts';
import type { NavigationWorld } from './navigation.ts';
import '@babylonjs/core/Collisions/collisionCoordinator.js';
import type { Spawn } from './worldTypes.ts';
import { readCorpseTerrain } from './corpseRendering.ts';
import { skeletonLurch } from './skeletonGait.ts';
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
  binding.actions.reset();
  binding.begin(0);
  if (position) rig.root.position.set(position.x, position.h, position.z);
  rig.root.rotation.x = rig.root.rotation.z = 0;
  rig.root.scaling.setAll(1);
  rig.body.rotation.setAll(0);
  rig.body.scaling.setAll(1);
  rig.body.position.setAll(0);
  rig.head?.rotation.setAll(0);
  rig.head?.scaling.setAll(1);
  rig.javelin?.setEnabled(false);
  rig.spear?.setEnabled(true);
  for (const mesh of rig.equipment ?? []) mesh.setEnabled(true);
  for (const mesh of rig.stowedEquipment ?? []) mesh.setEnabled(false);
  for (const limb of [...rig.arms, ...rig.forearms, ...rig.legs, ...rig.knees, ...rig.feet]) {
    limb.rotation.setAll(0);
    limb.scaling.setAll(1);
  }
  for (let i = 0; i < rig.legs.length; i++)
    rig.legs[i].position.set((i ? 1 : -1) * binding.pose.definition.profile.hipWidth, 0.55, 0);
  for (const plant of rig.footPlants) plant.anchor = null;
  if (rig.cape) rig.cape.rotation.x = -0.16;
  rig.attackBlend = rig.socialBlend = 0;
  rig.attackPose = rig.socialPose = null;
  binding.commit(true);
}

/** Conservative root-local envelope for the authored rigs, including weapons and all poses.
 * The animation browser suite checks rendered bounds against this broad-phase-only radius.
 */
export const ACTOR_OBSERVATION_RADIUS = 4.8;

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
    const corpse = entity.get('corpse');
    if (corpse) {
      rig.javelin?.setEnabled(false);
      rig.spear?.setEnabled(true);
      // Death leaves ordinary equipment visible even when work/social activity had stowed it.
      for (const mesh of rig.equipment ?? []) mesh.setEnabled(true);
      for (const mesh of rig.stowedEquipment ?? []) mesh.setEnabled(false);
      binding.grounding.reset();
      binding.actions.collapse(binding.pose, actor, corpse.age);
      if (rig.cape) rig.cape.rotation.x = -0.16;
      binding.apply();
    }
  }
  const corpses = readCorpseTerrain(ecs);
  for (const entity of entities) {
    if (entity.has('corpse')) continue;
    const actor = new Actor(entity),
      binding = entity.require('rigPose'),
      rig = binding.legacy;
    const actions = binding.actions;
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
    actions.layer(actor, ecs, pose, time, dt, carrying.has(entity));
    for (const mesh of rig.equipment ?? []) mesh.setEnabled(!actions.stowed);
    for (const mesh of rig.stowedEquipment ?? []) mesh.setEnabled(actions.stowed);
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
    actions.equipment(actor, pose);
    rig.spear?.setEnabled(!actions.stowed && actions.mode !== 'throw');
    rig.javelin?.setEnabled(!actions.stowed && actions.mode === 'throw' && !actions.released);
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
    // Preserve readable authored Euler branches for compatibility/debug consumers until A7.
    // These are numerical hints only; the binding accepts one only when it matches the solve.
    rig.arms[0].rotation.x = pose.leftArm;
    rig.arms[1].rotation.x = pose.rightArm;
    rig.arms[0].rotation.z = -pose.armSpread;
    rig.arms[1].rotation.z = pose.armSpread;
    rig.forearms[0].rotation.x = -pose.leftElbow;
    rig.forearms[1].rotation.x = -pose.rightElbow;
    rig.body.rotation.set(pose.lean, pose.twist, pose.roll);
    grounding.armYaw[0] = grounding.armYaw[1] = 0;
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
    const solved = grounding.sample(actor, pose, rig.root.rotation.y, world, corpses, actions);
    rig.root.scaling.copyFrom(solved.pose.local[0].scale);
    copyLocal(solved.pose.local, binding.pose.local);
    binding.apply();
  }
}
