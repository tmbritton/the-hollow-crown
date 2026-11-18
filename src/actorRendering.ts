import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Scene } from '@babylonjs/core/scene';
import { Actor } from './actors.ts';
import type { ECS } from './ecs.ts';
import { animateLocomotion } from './locomotion.ts';
import { heightAt, tileAt } from './world.ts';
import type { NavigationWorld } from './navigation.ts';
import '@babylonjs/core/Collisions/collisionCoordinator';

/** All character collision components use the same Babylon ellipsoid adapter. */
export function bindActorCollision(actor: Actor, scene: Scene, world: NavigationWorld) {
  const proxy = MeshBuilder.CreateBox(`${actor.id} collision proxy`, { size: 1 }, scene);
  proxy.isVisible = false;
  proxy.isPickable = false;
  proxy.ellipsoid.set(0.3, 0.72, 0.3);
  actor.entity.add('collision', {
    move: (from, displacement) => {
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

/** Render rigs are components too; locomotion, melee and death blending are shared. */
export function animateActors(ecs: ECS, dt: number): void {
  for (const entity of ecs.query('actor', 'rig', 'movement', 'transform')) {
    const actor = new Actor(entity),
      rig = entity.require('rig'),
      p = actor.position;
    rig.root.position.set(p.x, p.h, p.z);
    const turn = Math.atan2(
      Math.sin(p.heading - rig.root.rotation.y),
      Math.cos(p.heading - rig.root.rotation.y),
    );
    rig.root.rotation.y += turn * (1 - Math.exp(-18 * dt));
    const corpse = entity.get('corpse');
    if (corpse) {
      const collapse = Math.min(1, corpse.age / 0.45);
      rig.root.rotation.x = (collapse * Math.PI) / 2;
      rig.root.position.y += collapse * 0.24;
      rig.arms.forEach((arm, i) => {
        arm.rotation.x = -0.7;
        arm.rotation.z = i ? -0.65 : 0.65;
      });
      rig.legs.forEach((leg, i) => {
        leg.rotation.x = i ? 0.2 : -0.2;
      });
      continue;
    }
    rig.root.rotation.x = 0;
    const pose = animateLocomotion(
      actor.motion.animation,
      actor.motion.actualSpeed,
      actor.motion.wantsMovement,
      dt,
    );
    const swing = actor.attack.swing;
    rig.attackBlend += ((swing ? 1 : 0) - rig.attackBlend) * (1 - Math.exp(-25 * dt));
    if (swing) rig.attackTime = swing.elapsed / swing.duration;
    const t = rig.attackTime,
      weight = rig.attackBlend;
    // Anticipation -> fast downward cut -> recovery. Blend over the travel pose.
    const cut = t < 0.4 ? t / 0.4 : Math.max(0, 1 - (t - 0.4) / 0.6);
    const sword = t < 0.4 ? (-2.4 * t) / 0.4 : -2.4 + Math.min(1, (t - 0.4) / 0.22) * 3.3;
    const blend = (a: number, b: number) => a + (b - a) * weight;
    rig.legs[0].rotation.x = blend(pose.leftLeg, -0.2 * cut);
    rig.legs[1].rotation.x = blend(pose.rightLeg, 0.22 * cut);
    rig.arms[0].rotation.x = blend(pose.leftArm, -0.9);
    rig.arms[1].rotation.x = blend(pose.rightArm, swing?.ranged ? -1.4 : sword);
    rig.arms[1].rotation.z = weight * -0.15;
    rig.arms[0].rotation.z = 0;
    rig.body.rotation.x = blend(pose.lean, cut * 0.19);
    rig.body.rotation.y = weight * (0.4 - cut * 0.8);
    rig.body.position.y = blend(pose.bob, -cut * 0.06) - (actor.brain?.state === 'hide' ? 0.16 : 0);
    if (rig.cape) rig.cape.rotation.x = pose.cape - weight * cut * 0.15;
  }
}
