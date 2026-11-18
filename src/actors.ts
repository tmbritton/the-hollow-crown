import type { ECS, Entity, ActorKind, Components } from './ecs.ts';
import { Navigator } from './navigation.ts';
import type { NavigationWorld } from './navigation.ts';
import { createLocomotion, easeSpeed, WALK_SPEED } from './locomotion.ts';
import { heightAt, tileAt } from './world.ts';
import type { Point, Spawn } from './worldTypes.ts';

/** A checked view over components, not a second copy of actor state. */
export class Actor {
  readonly entity: Entity;
  constructor(entity: Entity) {
    this.entity = entity;
  }
  get id() {
    return this.entity.id;
  }
  get kind() {
    return this.entity.require('actor').kind;
  }
  get position() {
    return this.entity.require('transform');
  }
  get health() {
    return this.entity.require('health');
  }
  get motion() {
    return this.entity.require('movement');
  }
  get navigator() {
    return this.entity.require('navigation');
  }
  get attack() {
    return this.entity.require('attack');
  }
  get brain() {
    return this.entity.get('brain');
  }
  get alive() {
    return this.health.current > 0 && !this.entity.has('corpse');
  }
}

export function createActor(
  ecs: ECS,
  world: NavigationWorld,
  id: string,
  kind: ActorKind,
  spawn: Spawn,
): Actor {
  const max = { player: 100, skeleton: 48, goblin: 36, kobold: 44 }[kind];
  return new Actor(
    ecs
      .create(id)
      .add('actor', {
        kind,
        speed: { player: WALK_SPEED, skeleton: 1.65, goblin: 3.7, kobold: 2.9 }[kind],
        opensDoors: kind !== 'skeleton',
      })
      .add('transform', { ...spawn, heading: Math.PI / 2 })
      .add('health', { current: max, max, invulnerable: 0 })
      .add('movement', {
        speed: 0,
        direction: { x: 0, z: 0 },
        animation: createLocomotion(),
        actualSpeed: 0,
        wantsMovement: false,
      })
      .add('navigation', new Navigator(world))
      .add('attack', { target: null, swing: null, cooldown: 0, repath: 0, blocked: 0 }),
  );
}

export function cancelAttack(actor: Actor): void {
  Object.assign(actor.attack, { target: null, swing: null, repath: 0, blocked: 0 });
}

export function stopActor(actor: Actor, cancelCombat = true): void {
  actor.navigator.cancel();
  actor.motion.speed = 0;
  actor.motion.actualSpeed = 0;
  actor.motion.wantsMovement = false;
  actor.motion.direction = { x: 0, z: 0 };
  actor.motion.animation = createLocomotion();
  if (cancelCombat) cancelAttack(actor);
  actor.entity.remove('interactionIntent');
}

export function teleportActor(actor: Actor, world: NavigationWorld, point: Point): void {
  stopActor(actor);
  Object.assign(actor.position, {
    x: point.x,
    z: point.z,
    h: heightAt(world, point.x, point.z) ?? 0,
  });
}

export interface MoveIntent {
  direction?: Point;
  speed?: number;
  locked?: boolean;
}

/** The same motor handles keyboard steering, AI, pursuit, water, doors and arrival. */
export function moveActor(
  actor: Actor,
  world: NavigationWorld,
  intent: MoveIntent,
  dt: number,
): void {
  const p = actor.position,
    motion = actor.motion;
  if (!actor.alive || intent.locked) {
    motion.speed = motion.actualSpeed = 0;
    motion.wantsMovement = false;
    return;
  }
  const navigating = actor.navigator.active;
  const steering = actor.navigator.steer(p);
  const direction =
    intent.direction ??
    (steering ? { x: steering.point.x - p.x, z: steering.point.z - p.z } : { x: 0, z: 0 });
  const length = Math.hypot(direction.x, direction.z);
  motion.wantsMovement = length > 1e-5;
  if (length > 1e-5) {
    motion.direction = { x: direction.x / length, z: direction.z / length };
    p.heading = Math.atan2(direction.x, direction.z);
  }
  if (navigating && !steering) motion.speed = 0;
  const speed =
    (intent.speed ?? actor.entity.require('actor').speed) *
    (tileAt(world, p.x, p.z)?.surface === 'water' ? 0.52 : 1);
  const desired = length > 1e-5 ? Math.min(speed, steering ? steering.remaining * 9 : Infinity) : 0;
  motion.speed = easeSpeed(motion.speed, desired, dt);
  let travel = motion.speed * dt;
  if (steering)
    travel = steering.distance < 0.025 ? steering.distance : Math.min(travel, steering.distance);
  const displacement = { x: motion.direction.x * travel, z: motion.direction.z * travel };
  const collision = actor.entity.get('collision');
  let next: Point;
  if (collision) next = collision.move(p, displacement);
  else {
    next = { x: p.x + displacement.x, z: p.z + displacement.z };
    if (!actor.navigator.segmentClear(p, next)) next = p;
  }
  const moved = Math.hypot(next.x - p.x, next.z - p.z);
  Object.assign(p, { x: next.x, z: next.z, h: heightAt(world, next.x, next.z) ?? p.h });
  motion.actualSpeed = moved / dt;
  if (travel > 0.001 && moved < travel * 0.05) motion.speed = 0;
  if (!actor.navigator.waitingForDoor) actor.navigator.recordProgress(moved, dt);
  if (steering?.final && Math.hypot(p.x - steering.point.x, p.z - steering.point.z) < 0.015) {
    actor.navigator.cancel();
    motion.speed = 0;
  }
}

export function makeBrain(home: Spawn, pack = '', slot = 0): Components['brain'] {
  return {
    state: 'wander',
    think: slot * 0.07,
    memory: 0,
    home: { ...home },
    pack,
    slot,
    cover: null,
    hideTime: 0,
  };
}
