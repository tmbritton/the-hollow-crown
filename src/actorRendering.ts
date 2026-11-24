import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import type { Scene } from '@babylonjs/core/scene';
import { Actor } from './actors.ts';
import type { Components, ECS, Entity } from './ecs.ts';
import { animateLocomotion } from './locomotion.ts';
import { applyJumpPose } from './actionPoses.ts';
import { heightAt, tileAt } from './worldSpatial.ts';
import type { NavigationWorld } from './navigation.ts';
import { TERRAIN_RADIUS } from './routeGrid.ts';
import '@babylonjs/core/Collisions/collisionCoordinator.js';
import type { Spawn } from './worldTypes.ts';
import { publishCorpseContacts } from './corpseRendering.ts';
import { skeletonLurch } from './skeletonGait.ts';
import { rigBinding } from './rigs/bindings.ts';
import { profiles } from './rigs/humanoid.ts';
import { overlaps, tailNeighbor } from './rigs/tailClearance.ts';
import { advanceDeathPhysics } from './deathPhysics.ts';
import { cpuTiming, cpuTrace } from './cpuMetrics.ts';
import { collisionTerrain } from './terrainCandidates.ts';
import { updateCarriedTribute } from './tributeRendering.ts';

/** All character collision components use the same Babylon ellipsoid adapter. */
export function bindActorCollision(actor: Actor, scene: Scene, world: NavigationWorld) {
  const proxy = MeshBuilder.CreateBox(`${actor.id} collision proxy`, { size: 1 }, scene);
  proxy.isVisible = false;
  proxy.isPickable = false;
  proxy.ellipsoid.set(TERRAIN_RADIUS, 0.72, TERRAIN_RADIUS);
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
      const terrain = collisionTerrain(scene);
      if (terrain) terrain.move(proxy, delta);
      else proxy.moveWithCollisions(delta);
      proxy.position.y = (heightAt(world, proxy.position.x, proxy.position.z) ?? from.h) + 0.72;
      proxy.computeWorldMatrix(true);
      return { x: proxy.position.x, z: proxy.position.z };
    },
  });
  return proxy;
}

export function resetActorRig(
  renderRig: Components['rig'],
  position?: Spawn & { heading?: number },
): void {
  rigBinding(renderRig).reset(position, position?.heading);
}

/** Conservative root-local envelope for the authored rigs, including weapons and all poses.
 * The animation browser suite checks rendered bounds against this broad-phase-only radius.
 */
export const ACTOR_OBSERVATION_RADIUS = 4.8;

/** Render-only deformation: the motor, collision ellipsoid and attack clock stay authoritative. */
export function animateActors(ecs: ECS, dt: number, time = 0, world?: NavigationWorld): void {
  const cpu = import.meta.env?.DEV ? cpuTiming : null;
  const started = cpu?.clock() ?? 0;
  if (world) advanceDeathPhysics(ecs, world, dt);
  cpu?.finish('death.owner', started);
  const carrying = new Set(
    ecs.query('cargo').flatMap((e) => {
      const c = e.require('cargo');
      return c.state === 'carried' && c.owner ? [c.owner] : [];
    }),
  );
  const entities = ecs.query('actor', 'rig', 'movement', 'transform');
  // Finish every fallen pose before sampling contacts; ECS insertion order cannot affect feet.
  for (const entity of entities) {
    if (entity.has('ragdoll')) continue;
    const actor = new Actor(entity),
      binding = entity.require('rigPose'),
      p = actor.position;
    binding.begin(dt);
    const turn = Math.atan2(
      Math.sin(p.heading - binding.heading),
      Math.cos(p.heading - binding.heading),
    );
    // A raised shield must face the authoritative guard now, even during a sharp turn.
    if (actor.defending || entity.get('squadMember')?.group.get('koboldSquad')?.active)
      binding.heading = p.heading;
    else binding.heading += turn * (1 - Math.exp(-18 * dt));
    const corpse = entity.get('corpse');
    if (corpse) {
      binding.grounding.reset();
      binding.tail?.captureDeath(binding.pose);
      binding.actions.collapse(binding.pose, actor, corpse.age);
      binding.cape = -0.16;
      binding.apply(!!binding.tail);
      if (binding.tail && binding.tailClearance) {
        if (!binding.tail.reuses(dt, corpse.age)) {
          binding.sampleSurfaces();
          binding.tailClearance.prepare(actor, ecs, binding.actions, world);
        }
        binding.tail.sample(
          binding.pose,
          { dt, speed: 0, stride: 0, forward: 0, airborne: false, attack: 0, age: corpse.age },
          binding.tailClearance.clear,
        );
        binding.applyTail();
      }
    }
  }
  const contactStart = cpu?.clock() ?? 0;
  const corpses = publishCorpseContacts(ecs, world);
  cpu?.finish('corpse.surfaces', contactStart);
  for (const entity of entities) {
    if (entity.has('corpse')) continue;
    const actor = new Actor(entity),
      binding = entity.require('rigPose');
    const actions = binding.actions;
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
    applyJumpPose(pose, actor.jump);
    const dynamics = actor.motion.animation;
    const sin = Math.sin(binding.heading),
      cos = Math.cos(binding.heading);
    const acceleration = actor.motion.acceleration;
    const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
    const free =
      (1 - actions.attackBlend) * (1 - actions.socialBlend) * (actor.jump.airborne ? 0.35 : 1);
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
    actions.equipment(actor, pose, dt, time, binding.heading);
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
    grounding.armYaw[0] = grounding.armYaw[1] = 0;
    grounding.head.setAll(0);
    if (binding.pose.definition.profile.gait === 'skeleton') {
      const lurch = skeletonLurch(dynamics.stride);
      const weight =
        actor.kind !== 'skeleton' || actor.jump.active
          ? 0
          : dynamics.blend * (1 - actions.attackBlend) * (1 - actions.socialBlend);
      grounding.head.set(lurch.headPitch * weight, 0, lurch.headRoll * weight);
    }
    binding.cape = pose.cape;
    binding.applyGrounded(actor, pose, world, corpses);
  }
  const cargo = updateCarriedTribute(ecs);
  const neighborCandidates: Entity[] = [],
    tailed: Entity[] = [];
  for (const e of entities) {
    if (e.has('corpse') || (e.get('health')?.current ?? 0) <= 0) continue;
    const rig = e.require('rig');
    const active = rig.root.isEnabled();
    if (active && rig.tail?.some((node) => node.isEnabled())) tailed.push(e);
    // A closed layout cannot draw under a disabled root. An open/replaced layout can
    // still draw scene-root equipment, so let nearby demand sample its live membership.
    if (active || cargo?.has(e) || (e.has('render') && !e.require('rigPose').certifiedGeometry()))
      neighborCandidates.push(e);
  }
  tailed.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const demand = new Map<Entity, Entity[]>(),
    bodies = new Set<Entity>();
  const requesters = tailed.filter((e) => !e.require('rigPose').tail!.reuses(dt));
  for (const entity of requesters) {
    const neighbors: Entity[] = [];
    for (const other of neighborCandidates)
      if (tailNeighbor(entity, other)) {
        neighbors.push(other);
        bodies.add(other);
      }
    demand.set(entity, neighbors);
    bodies.add(entity);
  }
  // Every demanded final body/equipment pose is available before any living tail solves.
  for (const entity of bodies) {
    const carried = cargo?.get(entity);
    entity.require('rigPose').sampleSurfaces(false, carried?.meshes, carried?.revision);
  }
  // An eligible body/scene-root crate can outlive its drawn tail. Withdraw the old links
  // before any later-ID requester can consume that body's clearance surfaces.
  for (const entity of entities) {
    const binding = entity.require('rigPose');
    if (entity.has('corpse') || !binding.tail || tailed.includes(entity)) continue;
    binding.applyTail();
    if (bodies.has(entity)) binding.sampleSurfaces(true);
  }
  for (const entity of tailed) {
    const actor = new Actor(entity),
      binding = entity.require('rigPose');
    if (binding.tail && binding.tailClearance) {
      const heading = binding.heading;
      const neighbors = demand.get(entity);
      if (neighbors) binding.tailClearance.prepare(actor, ecs, binding.actions, world, neighbors);
      binding.tail.sample(
        binding.pose,
        {
          dt,
          speed: actor.motion.actualSpeed,
          stride: actor.motion.animation.stride,
          forward:
            actor.motion.velocity.x * Math.sin(heading) +
            actor.motion.velocity.z * Math.cos(heading),
          airborne: actor.jump.airborne,
          attack: binding.actions.attackBlend,
          recoil: binding.actions.shield.recoil,
          recoilSide: binding.actions.shield.side + binding.actions.shield.counter * 0.3,
        },
        binding.tailClearance.clear,
      );
      binding.applyTail();
      binding.sampleSurfaces(true);
    }
  }
  // An infeasible late-priority tail can still touch an earlier one. Flag BOTH participants;
  // never report a successful clearance while the final published chains intersect.
  for (let i = 0; i < tailed.length; i++)
    for (let j = i + 1; j < tailed.length; j++) {
      if (import.meta.env?.DEV) cpuTrace?.count('tail.finalPairs');
      const a = tailed[i].require('rigPose'),
        b = tailed[j].require('rigPose');
      if (
        a
          .clearanceSurfaces(true)
          .some(
            (x) =>
              x.enabled &&
              b.clearanceSurfaces(true).some((y) => y.enabled && overlaps(x.bounds, y.bounds)),
          )
      )
        a.tail!.blocked = b.tail!.blocked = true;
    }
  cpu?.finish('animation', started);
}
