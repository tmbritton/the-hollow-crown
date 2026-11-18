import type { ECS, Entity, ActorKind, EnemyKind, Components } from './ecs.ts';
import { Navigator } from './navigation.ts';
import type { NavigationWorld } from './navigation.ts';
import { createLocomotion, easeSpeed, WALK_SPEED } from './locomotion.ts';
import { heightAt, tileAt } from './world.ts';
import type { Point, Spawn } from './worldTypes.ts';
import { Attack } from './machines/actors/attack.ts';
import { createMonsterBehavior } from './machines/monsters/index.ts';
import { Health } from './machines/actors/health.ts';
import { Occupancy } from './occupancy.ts';
import { Jump } from './jump.ts';

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
  get jump() {
    return this.entity.require('jump');
  }
  get elevation() {
    return this.position.h + this.jump.height;
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
  enableAI(pack = '', slot = 0): void {
    if (this.kind === 'player') throw new Error('The player uses input, not a monster behavior');
    this.entity.add('brain', makeBrain(this.kind, this.position, pack, slot));
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
  const body = { radius: 0.45, height: kind === 'player' || kind === 'skeleton' ? 1.8 : 1.3 };
  const occupancy = new Occupancy(
    body,
    () =>
      ecs
        .query('actor', 'body', 'transform', 'health')
        .filter(
          (entity) =>
            entity.id !== id && entity.require('health').current > 0 && !entity.has('corpse'),
        )
        .map((entity) => ({ ...entity.require('transform'), ...entity.require('body') })),
    () =>
      ecs.query('actor', 'body', 'transform', 'corpse').flatMap((entity) => {
        const p = entity.require('transform'),
          size = entity.require('body');
        // Two overlapping footprints follow the fallen rig, from its feet toward its head.
        return [0.25, 0.75].map((offset) => ({
          x: p.x + Math.sin(p.heading) * size.height * offset,
          z: p.z + Math.cos(p.heading) * size.height * offset,
          h: p.h,
          radius: size.radius,
          height: 0.4,
        }));
      }),
  );
  return new Actor(
    ecs
      .create(id)
      .add('actor', {
        kind,
        speed: { player: WALK_SPEED, skeleton: 1.65, goblin: 3.7, kobold: 2.9 }[kind],
        opensDoors: kind !== 'skeleton',
      })
      .add('transform', { ...spawn, heading: Math.PI / 2 })
      .add('body', body)
      .add('health', new Health(max))
      .add('movement', {
        speed: 0,
        direction: { x: 0, z: 0 },
        animation: createLocomotion(),
        actualSpeed: 0,
        wantsMovement: false,
        velocity: { x: 0, z: 0 },
        acceleration: { x: 0, z: 0 },
      })
      .add('jump', new Jump())
      .add('navigation', new Navigator(world, occupancy))
      .add('attack', new Attack()),
  );
}

export function cancelAttack(actor: Actor): void {
  actor.attack.cancel();
}

export function requestJump(actor: Actor): boolean {
  if (!actor.alive || !actor.jump.request()) return false;
  // Preserve pursuit and floor commands, but do not resolve an interrupted sword strike.
  actor.attack.interrupt();
  return true;
}

export function stopActor(actor: Actor, cancelCombat = true): void {
  actor.navigator.cancel();
  actor.motion.speed = 0;
  actor.motion.actualSpeed = 0;
  actor.motion.wantsMovement = false;
  actor.motion.direction = { x: 0, z: 0 };
  actor.motion.velocity = { x: 0, z: 0 };
  actor.motion.acceleration = { x: 0, z: 0 };
  actor.motion.animation = createLocomotion();
  actor.entity.add('jump', new Jump());
  actor.entity.get('collision')?.sync?.(actor.position);
  if (cancelCombat) cancelAttack(actor);
  actor.attack.releaseInteraction();
}

export function teleportActor(actor: Actor, world: NavigationWorld, point: Point): void {
  stopActor(actor);
  const destination = actor.navigator.nearestOpenPoint(point);
  if (!destination) return;
  Object.assign(actor.position, {
    x: destination.x,
    z: destination.z,
    h: heightAt(world, destination.x, destination.z) ?? 0,
  });
  actor.entity.get('collision')?.sync?.(actor.position);
}

export interface MoveIntent {
  direction?: Point;
  speed?: number;
  locked?: boolean;
}

/** The same motor handles keyboard steering, AI, pursuit, difficult ground, doors and arrival. */
export function moveActor(
  actor: Actor,
  world: NavigationWorld,
  intent: MoveIntent,
  dt: number,
): void {
  const p = actor.position,
    motion = actor.motion;
  const sampleVelocity = (x: number, z: number) => {
    motion.acceleration = { x: (x - motion.velocity.x) / dt, z: (z - motion.velocity.z) / dt };
    motion.velocity = { x, z };
    motion.actualSpeed = Math.hypot(x, z);
    if (motion.actualSpeed > 0.08) p.heading = Math.atan2(x, z);
  };
  if (!actor.alive || intent.locked) {
    motion.speed = motion.actualSpeed = 0;
    motion.wantsMovement = false;
    sampleVelocity(0, 0);
    if (actor.alive) actor.jump.advance(dt);
    actor.entity.get('collision')?.sync?.(p);
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
  }
  if (navigating && !steering) motion.speed = 0;
  const slowed =
    !actor.jump.airborne &&
    (tileAt(world, p.x, p.z)?.surface === 'water' || actor.navigator.occupancy?.slowedAt(p));
  const speed = (intent.speed ?? actor.entity.require('actor').speed) * (slowed ? 0.52 : 1);
  const desired = length > 1e-5 ? Math.min(speed, steering ? steering.remaining * 9 : Infinity) : 0;
  motion.speed = easeSpeed(motion.speed, desired, dt);
  let travel = motion.speed * dt;
  if (steering)
    travel = steering.distance < 0.025 ? steering.distance : Math.min(travel, steering.distance);
  const displacement = { x: motion.direction.x * travel, z: motion.direction.z * travel };
  const collision = actor.entity.get('collision');
  const terrainMove = (from: Spawn, delta: Point): Spawn => {
    let next: Point;
    if (collision) next = collision.move(from, delta);
    else {
      next = { x: from.x + delta.x, z: from.z + delta.z };
      if (!actor.navigator.segmentClear(from, next)) next = from;
    }
    return { ...next, h: heightAt(world, next.x, next.z) ?? from.h };
  };
  const next = actor.navigator.occupancy
    ? actor.navigator.occupancy.move(p, displacement, terrainMove)
    : terrainMove(p, displacement);
  const moved = Math.hypot(next.x - p.x, next.z - p.z);
  sampleVelocity((next.x - p.x) / dt, (next.z - p.z) / dt);
  const ground = heightAt(world, next.x, next.z) ?? p.h;
  actor.jump.advance(dt, ground - p.h);
  Object.assign(p, { x: next.x, z: next.z, h: heightAt(world, next.x, next.z) ?? p.h });
  collision?.sync?.(p);
  if (travel > 0.001 && moved < travel * 0.05) motion.speed = 0;
  if (!actor.navigator.waitingForDoor) actor.navigator.recordProgress(moved, dt);
  if (steering?.final && Math.hypot(p.x - steering.point.x, p.z - steering.point.z) < 0.015) {
    actor.navigator.cancel();
    motion.speed = 0;
  }
}

export function makeBrain(kind: EnemyKind, home: Spawn, pack = '', slot = 0): Components['brain'] {
  const behavior = createMonsterBehavior(kind);
  return {
    behavior,
    get state() {
      return behavior.snapshot.value;
    },
    think: slot * 0.07,
    memory: 0,
    home: { ...home },
    pack,
    slot,
    cover: null,
    hideTime: 0,
  };
}
