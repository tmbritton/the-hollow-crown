import type { Components } from './ecs.ts';
import type { LocomotionPose } from './locomotion.ts';
import type { Actor } from './actors.ts';
import type { NavigationWorld } from './navigation.ts';
import { heightAt } from './world.ts';

const UPPER = 0.25,
  LOWER = 0.25;

/** Two-bone solve in the leg's sagittal plane, with lateral lean for turning plants. */
export function solveLeg(forward: number, down: number, side = 0) {
  const distance = Math.max(0.04, Math.min(UPPER + LOWER - 0.001, Math.hypot(forward, down, side)));
  const bend = Math.acos(
    (distance * distance - UPPER * UPPER - LOWER * LOWER) / (2 * UPPER * LOWER),
  );
  return {
    hip: -Math.atan2(forward, Math.hypot(down, side)) - bend / 2,
    knee: bend,
    roll: Math.atan2(side, down),
  };
}

/** Keep stance feet on sampled support. Anchors release at reach limits, on turns,
 * takeoff and interrupted actions; short voxel legs never stretch to chase a stale plant. */
export function placeFeet(
  actor: Actor,
  rig: Components['rig'],
  pose: LocomotionPose,
  world?: NavigationWorld,
): void {
  const motion = actor.motion,
    state = motion.animation;
  const sin = Math.sin(rig.root.rotation.y),
    cos = Math.cos(rig.root.rotation.y);
  const scale = rig.root.scaling;
  for (let i = 0; i < 2; i++) {
    const hip = rig.legs[i],
      knee = rig.knees[i],
      foot = rig.feet[i],
      plant = rig.footPlants[i];
    hip.position.y = 0.55 + pose.bob;
    hip.rotation.z = 0;
    const angle = i ? pose.rightLeg : pose.leftLeg;
    hip.rotation.x = angle;
    knee.rotation.x = i ? pose.rightKnee : pose.leftKnee;
    foot.rotation.x = -angle - knee.rotation.x;
    foot.rotation.z = 0;
    const kicking = rig.socialBlend > 0.4 && actor.brain?.state === 'hackysack' && i === 1;
    if (actor.jump.airborne || pose.lift > 0.005 || kicking) {
      plant.anchor = null;
      continue;
    }
    const moving = motion.actualSpeed > 0.08 && rig.attackBlend < 0.15;
    const phase =
      (((state.stride + Math.PI / 2 + i * Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const stance = !moving || phase < Math.PI;
    const z = -Math.sin(angle) * (0.3 + state.run * 0.07);
    const x = hip.position.x;
    const target = {
      x: actor.position.x + cos * x * scale.x + sin * z * scale.z,
      z: actor.position.z - sin * x * scale.x + cos * z * scale.z,
    };
    const support = world ? heightAt(world, target.x, target.z) : actor.position.h;
    if (support === null || Math.abs(support - actor.position.h) > 0.45) {
      plant.anchor = null;
      continue;
    }
    if (!stance || !moving || actor.jump.active || rig.attackBlend > 0.15) plant.anchor = null;
    else if (!plant.anchor) plant.anchor = { ...target, h: support };
    if (plant.anchor) {
      const dx = plant.anchor.x - actor.position.x,
        dz = plant.anchor.z - actor.position.z;
      if (Math.hypot(dx, dz) > 0.43 || Math.abs(dx * cos - dz * sin - x * scale.x) > 0.16)
        plant.anchor = null;
    }
    const goal = plant.anchor ?? { ...target, h: support };
    const dx = goal.x - rig.root.position.x,
      dz = goal.z - rig.root.position.z;
    const swingLift = stance ? 0 : Math.sin(phase - Math.PI) * (0.1 + state.run * 0.06);
    const down =
      hip.position.y - (goal.h + 0.05 * scale.y + swingLift - rig.root.position.y) / scale.y;
    const result = solveLeg(
      (dx * sin + dz * cos) / scale.z,
      down,
      (dx * cos - dz * sin) / scale.x - x,
    );
    hip.rotation.x = result.hip;
    hip.rotation.z = result.roll;
    knee.rotation.x = result.knee;
    foot.rotation.x = -result.hip - result.knee;
    foot.rotation.z = -result.roll;
  }
}
