import type { ECS, Entity, ActorKind, EnemyKind, Components } from './ecs.ts';
import { Navigator } from './navigation.ts';
import type { NavigationWorld } from './navigation.ts';
import { createLocomotion, easeSpeed, WALK_SPEED } from './locomotion.ts';
import { heightAt, tileAt } from './world.ts';
import type { Point, Spawn } from './worldTypes.ts';
import { Attack } from './machines/actors/attack.ts';
import { Defense } from './machines/actors/defense.ts';
import { createMonsterBehavior } from './machines/monsters/index.ts';
import { Health } from './machines/actors/health.ts';
import { Occupancy } from './occupancy.ts';
import { Jump } from './jump.ts';
import { BlockFeedback } from './blockFeedback.ts';

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
  get defending(): boolean {
    return (
      this.alive &&
      !this.jump.active &&
      !this.attack.swing &&
      this.entity.get('defense')?.raised === true
    );
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
  const occupancy = new Occupancy(body, () =>
    ecs
      .query('actor', 'body', 'transform', 'health')
      .filter(
        (entity) =>
          entity.id !== id && entity.require('health').current > 0 && !entity.has('corpse'),
      )
      .map((entity) => ({ ...entity.require('transform'), ...entity.require('body') })),
  );
  const actor = new Actor(
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
        supportVelocity: 0,
        acceleration: { x: 0, z: 0 },
      })
      .add('jump', new Jump())
      .add('navigation', new Navigator(world, occupancy))
      .add('attack', new Attack()),
  );
  if (kind === 'player') actor.entity.add('defense', new Defense());
  actor.entity.add('blockFeedback', new BlockFeedback(ecs, actor.entity));
  return actor;
}

/** Shared input/AI boundary: defense interrupts actions, but keeps floor travel and selection. */
export function requestDefense(actor: Actor, repeat = false, allowed = true): boolean {
  if (!actor.entity.get('defense')?.press(allowed && actor.alive && !actor.jump.active, repeat))
    return false;
  cancelWork(actor);
  actor.attack.interrupt();
  if (actor.attack.target) {
    actor.navigator.cancel();
    actor.attack.repath = 0;
  }
  return true;
}

export function cancelAttack(actor: Actor): void {
  actor.attack.cancel();
}

/** Retire the unfinished cycle as well as detaching the assignment. */
export function cancelWork(actor: Actor): void {
  actor.entity.get('work')?.chart.send({ type: 'CANCEL' });
  actor.entity.remove('work');
}

export function requestJump(actor: Actor): boolean {
  if (!actor.alive || !actor.jump.request()) return false;
  actor.entity.get('blockFeedback')?.reset();
  actor.entity.get('defense')?.cancel();
  actor.entity.get('work')?.interrupt('Jump started');
  // Preserve pursuit and floor commands, but do not resolve an interrupted sword strike.
  actor.attack.interrupt();
  return true;
}

export function stopActor(actor: Actor, cancelCombat = true): void {
  if (!actor.entity.has('corpse')) actor.entity.remove('deathHandoff');
  actor.entity.get('blockFeedback')?.reset();
  actor.entity.get('rigPose')?.invalidateHistory();
  actor.entity.get('defense')?.cancel();
  cancelWork(actor);
  actor.navigator.cancel();
  actor.motion.speed = 0;
  actor.motion.actualSpeed = 0;
  actor.motion.wantsMovement = false;
  actor.motion.direction = { x: 0, z: 0 };
  actor.motion.velocity = { x: 0, z: 0 };
  actor.motion.supportVelocity = 0;
  actor.motion.acceleration = { x: 0, z: 0 };
  actor.motion.animation = createLocomotion();
  for (const plant of actor.entity.get('rig')?.footPlants ?? []) plant.anchor = null;
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
  /** Explicit combat facing is independent of travel (e.g. a shielded backstep). */
  facing?: number;
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
  motion.supportVelocity = 0;
  const sampleVelocity = (x: number, z: number) => {
    motion.acceleration = { x: (x - motion.velocity.x) / dt, z: (z - motion.velocity.z) / dt };
    motion.velocity = { x, z };
    motion.actualSpeed = Math.hypot(x, z);
    if (intent.facing !== undefined) p.heading = intent.facing;
    else if (motion.actualSpeed > 0.08) p.heading = Math.atan2(x, z);
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
  const slowed = !actor.jump.airborne && tileAt(world, p.x, p.z)?.surface === 'water';
  const speed = (intent.speed ?? actor.entity.require('actor').speed) * (slowed ? 0.52 : 1);
  // Pursuit needs a tighter arrival brake to stay within weapon reach of a moving target.
  const arrivalRate = actor.attack.target ? 16 : 9;
  const desired =
    length > 1e-5 ? Math.min(speed, steering ? steering.remaining * arrivalRate : Infinity) : 0;
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
  motion.supportVelocity = (ground - p.h) / dt;
  actor.jump.advance(dt, ground - p.h);
  Object.assign(p, { x: next.x, z: next.z, h: heightAt(world, next.x, next.z) ?? p.h });
  collision?.sync?.(p);
  if (travel > 0.001 && moved < travel * 0.05) motion.speed = 0;
  if (!actor.navigator.waitingForDoor) actor.navigator.recordProgress(moved, dt, p);
  if (steering?.final && Math.hypot(p.x - steering.point.x, p.z - steering.point.z) < 0.015) {
    actor.navigator.arrive();
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
