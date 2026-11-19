import { Actor, cancelAttack, createActor, makeBrain, moveActor, stopActor } from './actors.ts';
import { ECS } from './ecs.ts';
import type { EnemyKind } from './ecs.ts';
import type { NavigationWorld } from './navigation.ts';
import { segmentIntersectsBox } from './navigation.ts';
import { heightAt, randomFrom, tileAt } from './world.ts';
import type { Point, Random, Spawn, World } from './worldTypes.ts';
import { seedSocialGroups } from './social.ts';
import { seedInhabitant, seedEmberWorker } from './generation/inhabitants.ts';

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
export const MELEE_RANGE = 1.5;
export const ATTACK_DURATION = 0.62;
export const ATTACK_IMPACT = 0.25;
export const GOBLIN_FLEE_SPEED = 5.2;

/** Conservative cover/weapon visibility: void, cliffs, furniture and solid doors occlude. */
export function clearSight(world: NavigationWorld, from: Spawn, to: Spawn): boolean {
  if (Math.abs(from.h - to.h) > 1.2) return false;
  if (world.blockers.some((box) => segmentIntersectsBox(from, to, box))) return false;
  if (
    world.entities.some(
      (e) =>
        e.type === 'door' &&
        (e.locked || !e.open || e.collider?.checkCollisions) &&
        segmentIntersectsBox(from, to, {
          ...e,
          w: e.axis === 'x' ? 0.4 : 2.96,
          d: e.axis === 'x' ? 2.96 : 0.4,
        }),
    )
  )
    return false;
  const count = Math.max(1, Math.ceil(distance(from, to) / 0.16));
  for (let i = 1; i <= count; i++) {
    const x = from.x + ((to.x - from.x) * i) / count;
    const z = from.z + ((to.z - from.z) * i) / count;
    const tile = tileAt(world, x, z);
    if (!tile || tile.h > from.h + 1.2 || tile.blocked) return false;
    if (world.blockers.some((b) => Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2))
      return false;
    if (
      world.entities.some(
        (e) =>
          e.type === 'door' &&
          (e.locked || !e.open || e.collider?.checkCollisions) &&
          Math.abs(x - e.x) < (e.axis === 'x' ? 0.2 : 1.48) &&
          Math.abs(z - e.z) < (e.axis === 'x' ? 1.48 : 0.2),
      )
    )
      return false;
  }
  return true;
}

export function hostile(a: Actor, b: Actor): boolean {
  return (
    a.id !== b.id &&
    a.kind !== b.kind &&
    b.alive &&
    (a.kind !== 'skeleton' || b.kind !== 'skeleton')
  );
}

export function seedEnemies(ecs: ECS, world: World): Actor[] {
  const random = randomFrom(`${world.seed}:enemies`),
    enemies: Actor[] = [];
  const groups: [World['rooms'][number]['id'], EnemyKind, number][] = [
    ['crypt', 'skeleton', 2],
    ['armory', 'skeleton', 2],
    ['water', 'skeleton', 1],
    ['lava', 'skeleton', 1],
    ['throne', 'skeleton', 2],
    ['bakery', 'goblin', 1],
    ['butchery', 'goblin', 1],
    ['smithy', 'goblin', 1],
    ['treasury', 'goblin', 1],
    ['stable', 'kobold', 3],
    ['stairs', 'kobold', 3],
    ['treasury', 'kobold', 3],
  ];
  for (const [room, kind, count] of groups) {
    const candidates = [...world.tiles.values()]
      .filter((t) => t.room === room && t.surface !== 'water' && !t.ramp)
      .map((tile) => ({ tile, order: random() }))
      .sort((a, b) => a.order - b.order);
    for (let slot = 0; slot < count; slot++) {
      const actor = createActor(ecs, world, `${kind}:${room}:${slot}`, kind, world.roomById[room]);
      const packAnchor =
        kind === 'kobold' ? enemies.find((e) => e.brain?.pack === `pack:${room}`) : undefined;
      const available = candidates.filter(
        ({ tile }) =>
          actor.navigator.canStand(tile) &&
          enemies.every((e) => distance(e.position, tile) > 1.25) &&
          world.entities.every((e) => !e.approach || distance(e.approach, tile) > 1.2),
      );
      const spawn =
        available.find(({ tile }) => !packAnchor || distance(packAnchor.position, tile) < 4.5) ??
        available[0];
      if (!spawn) {
        ecs.remove(actor.id);
        continue;
      }
      Object.assign(actor.position, spawn.tile);
      actor.entity.add(
        'brain',
        makeBrain(kind, spawn.tile, kind === 'kobold' ? `pack:${room}` : '', slot),
      );
      enemies.push(actor);
    }
  }
  seedSocialGroups(enemies, world);
  seedInhabitant(world, enemies);
  seedEmberWorker(world, enemies);
  return enemies;
}

/** Systems consume component data. The player and AI use identical attacks and damage rules. */
export class CombatSystem {
  readonly ecs: ECS;
  readonly world: NavigationWorld;
  readonly player: Actor;
  private readonly random: Random;
  private readonly onDeath: (victim: Actor, source?: Actor) => void;
  time = 0;

  constructor(
    ecs: ECS,
    world: NavigationWorld,
    actors: Actor[],
    seed = 'combat',
    { onDeath = () => {} }: { onDeath?: (victim: Actor, source?: Actor) => void } = {},
  ) {
    this.ecs = ecs;
    this.world = world;
    const player = actors.find((a) => a.kind === 'player');
    if (!player) throw new Error('Combat needs a player entity');
    this.player = player;
    this.random = randomFrom(seed);
    this.onDeath = onDeath;
  }
  get actors(): Actor[] {
    return this.ecs
      .query('actor', 'transform', 'health', 'movement', 'navigation', 'attack')
      .map((entity) => new Actor(entity));
  }
  get enemies(): Actor[] {
    return this.actors.filter((a) => a.kind !== 'player');
  }
  actor(id: string | null): Actor | undefined {
    return this.actors.find((a) => a.id === id);
  }

  target(actor: Actor, target: Actor): boolean {
    if (!actor.alive || !hostile(actor, target)) return false;
    cancelAttack(actor);
    actor.navigator.cancel();
    actor.attack.target = target.id;
    return true;
  }

  route(actor: Actor, goal: Point): boolean {
    return actor.navigator.goTo(actor.position, goal, {
      openDoors: actor.entity.require('actor').opensDoors,
    });
  }

  requestDoor(actor: Actor, id: string): boolean {
    const door = this.ecs.get(id)?.get('door');
    if (!door || door.locked || !actor.entity.require('actor').opensDoors) return false;
    stopActor(actor);
    actor.attack.interact(id);
    return true;
  }

  updateInteraction(actor: Actor): void {
    const intent = actor.attack.interaction;
    if (!intent) return;
    const door = this.ecs.get(intent)?.get('door');
    if (!door || door.locked) {
      actor.attack.releaseInteraction();
      actor.navigator.cancel();
      return;
    }
    if (distance(actor.position, door) < 2.1) {
      door.open = true;
      actor.attack.releaseInteraction();
      actor.navigator.cancel();
      return;
    }
    if (!actor.navigator.active && !this.route(actor, door)) actor.attack.releaseInteraction();
  }

  inMelee(actor: Actor, target: Actor): boolean {
    return (
      distance(actor.position, target.position) <= MELEE_RANGE &&
      Math.abs(actor.elevation - target.elevation) < 0.9 &&
      clearSight(this.world, actor.position, target.position)
    );
  }

  startAttack(actor: Actor, target: Actor, ranged = false): boolean {
    if (
      !actor.alive ||
      !target.alive ||
      actor.jump.active ||
      actor.attack.swing ||
      actor.attack.cooldown > 0
    )
      return false;
    if (
      ranged
        ? !clearSight(this.world, actor.position, target.position)
        : !this.inMelee(actor, target)
    )
      return false;
    if (ranged || actor.kind !== 'player') actor.navigator.cancel();
    const started = actor.attack.start(
      {
        target: target.id,
        elapsed: 0,
        duration: ranged ? 0.85 : ATTACK_DURATION,
        impact: ranged ? 0.45 : ATTACK_IMPACT,
        resolved: false,
        ranged,
      },
      actor.kind === 'player'
        ? 0.64
        : actor.kind === 'goblin'
          ? 1.75
          : 1.15 + (actor.brain?.slot ?? 0) * 0.18,
    );
    if (started) actor.entity.get('work')?.interrupt('Attack started');
    actor.position.heading = Math.atan2(
      target.position.x - actor.position.x,
      target.position.z - actor.position.z,
    );
    return started;
  }

  /** Called before the movement system, including for player pursuit. */
  pursue(actor: Actor, dt: number): boolean {
    this.updateInteraction(actor);
    const target = this.actor(actor.attack.target);
    if (!target?.alive) {
      if (actor.attack.target) {
        actor.attack.target = null;
        actor.navigator.cancel();
      }
      return !!actor.attack.swing && (actor.kind !== 'player' || actor.attack.swing.ranged);
    }
    if (actor.jump.active) return false;
    if (actor.attack.swing && (actor.kind !== 'player' || actor.attack.swing.ranged)) return true;
    if (this.inMelee(actor, target)) {
      this.startAttack(actor, target);
      // Only proximity to a stationary target stops the player's chase, never the swing clock.
      if (
        actor.kind !== 'player' ||
        (distance(actor.position, target.position) <= 1.05 && target.motion.actualSpeed < 0.08)
      ) {
        actor.navigator.cancel();
        return true;
      }
    }
    // Refresh the short, clear approach every step. A fleeing target must not leave us
    // braking at a stale waypoint during windup or recovery. Longer/obstructed routes
    // still use the bounded replanning cadence below and normal door/occupancy rules.
    const separation = distance(actor.position, target.position);
    if (actor.kind === 'player' && separation > 0.95 && separation < 3) {
      const goal = {
        x: target.position.x + ((actor.position.x - target.position.x) / separation) * 0.95,
        z: target.position.z + ((actor.position.z - target.position.z) / separation) * 0.95,
      };
      if (
        actor.navigator.canOccupy(goal) &&
        actor.navigator.segmentClear(
          actor.position,
          goal,
          true,
          actor.navigator.occupancy?.bodies(),
        ) &&
        this.route(actor, goal)
      ) {
        actor.attack.repath = 0.15;
        actor.attack.blocked = 0;
        return false;
      }
    }
    actor.attack.repath -= dt;
    if (actor.attack.repath <= 0) {
      actor.attack.repath = 0.3;
      if (
        actor.navigator.destination &&
        distance(actor.navigator.destination, target.position) < 1.3 &&
        target.motion.actualSpeed < 0.08
      )
        return false;
      const angle = Math.atan2(
        actor.position.z - target.position.z,
        actor.position.x - target.position.x,
      );
      const goals = Array.from({ length: 8 }, (_, i) => {
        const a = angle + (i * Math.PI) / 4;
        return {
          x: target.position.x + Math.cos(a) * 1.05,
          z: target.position.z + Math.sin(a) * 1.05,
        };
      });
      const routed = goals.some(
        (goal) => actor.navigator.canOccupy(goal) && this.route(actor, goal),
      );
      actor.attack.blocked = routed ? 0 : actor.attack.blocked + 0.3;
      if (actor.attack.blocked > 1.5) cancelAttack(actor);
    }
    return false;
  }

  private chooseTarget(actor: Actor): Actor | undefined {
    const brain = actor.brain;
    if (!brain) return undefined;
    const radius = actor.kind === 'skeleton' ? 6 : 10;
    const visible = this.actors
      .filter(
        (other) =>
          hostile(actor, other) &&
          distance(actor.position, other.position) < radius &&
          clearSight(this.world, actor.position, other.position),
      )
      .sort((a, b) => distance(actor.position, a.position) - distance(actor.position, b.position));
    const target = visible[0];
    if (target) {
      brain.memory = 5;
      return target;
    }
    const previous = this.actor(actor.attack.target);
    if (previous?.alive && brain.memory > 0 && distance(actor.position, previous.position) < 16)
      return previous;
    if (actor.kind === 'kobold') {
      for (const ally of this.actors) {
        if (
          ally.id === actor.id ||
          !ally.alive ||
          ally.brain?.pack !== brain.pack ||
          distance(actor.position, ally.position) > 12
        )
          continue;
        const shared = this.actor(ally.attack.target);
        if (
          shared?.alive &&
          ally.brain.memory > 0 &&
          distance(actor.position, shared.position) < 16
        ) {
          // Relaying an alert must not refresh its lifetime forever around the pack.
          brain.memory = Math.min(3, ally.brain.memory);
          return shared;
        }
      }
    }
    return undefined;
  }

  private localGoals(actor: Actor, radius = 6): Spawn[] {
    const p = actor.position,
      goals: Spawn[] = [];
    for (let x = Math.round(p.x - radius); x <= p.x + radius; x++)
      for (let z = Math.round(p.z - radius); z <= p.z + radius; z++) {
        const tile = tileAt(this.world, x, z);
        if (tile && distance(tile, p) <= radius && actor.navigator.canOccupy(tile))
          goals.push(tile);
      }
    return goals;
  }

  private flee(actor: Actor, target: Actor): void {
    const brain = actor.brain!;
    const threats = this.actors.filter(
      (a) => hostile(actor, a) && distance(actor.position, a.position) < 10,
    );
    // Break an unlaunched shot rather than stand still with a sword in its face.
    actor.attack.interrupt();
    const goals = this.localGoals(actor)
      .map((point) => ({
        point,
        score:
          Math.min(...threats.map((a) => distance(point, a.position))) * 2 -
          distance(point, actor.position) * 0.25 +
          (!clearSight(this.world, point, target.position) ? 4 : 0),
      }))
      .sort((a, b) => b.score - a.score);
    for (const { point } of goals.slice(0, 20))
      if (this.route(actor, point)) {
        brain.cover = point;
        break;
      }
    brain.hideTime = 0;
  }

  private seekFiringPosition(actor: Actor, target: Actor, seekingCover: boolean): void {
    const brain = actor.brain!;
    const hidden = !clearSight(this.world, actor.position, target.position);
    const goals = this.localGoals(actor, 5)
      .filter((p) => {
        const d = distance(p, target.position);
        return d > 4 && d < 9 && clearSight(this.world, p, target.position) !== seekingCover;
      })
      .sort((a, b) => distance(a, actor.position) - distance(b, actor.position));
    for (const goal of goals.slice(0, 20))
      if (this.route(actor, goal)) {
        brain.cover = seekingCover ? goal : brain.cover;
        return;
      }
    if (!hidden && actor.attack.cooldown <= 0) this.startAttack(actor, target, true);
  }

  private flank(actor: Actor, target: Actor): void {
    const brain = actor.brain!;
    const pack = this.actors.filter((a) => a.alive && a.brain?.pack === brain.pack);
    const leader = pack[0];
    // Stable, distinct slots around the shared target: a front pressure fighter and side/rear flankers.
    const anchor = leader?.brain?.home ?? brain.home;
    const bearing = Math.atan2(anchor.z - target.position.z, anchor.x - target.position.x);
    const angle = bearing + (brain.slot * Math.PI * 2) / 3;
    const radius = 1.12;
    const goal = {
      x: target.position.x + Math.cos(angle) * radius,
      z: target.position.z + Math.sin(angle) * radius,
    };
    if (!actor.navigator.canOccupy(goal) || !this.route(actor, goal)) this.pursue(actor, 0.4);
  }

  private think(actor: Actor): void {
    const brain = actor.brain!;
    const target = this.chooseTarget(actor);
    actor.attack.target = target?.id ?? null;
    if (actor.kind === 'player') return;
    const leader = this.actors.find((a) => a.alive && a.brain?.pack === brain.pack);
    const hidden = !!target && !clearSight(this.world, actor.position, target.position);
    const effects = brain.behavior.send({
      type: 'THINK',
      hasTarget: !!target,
      navigating: actor.navigator.active,
      threatened: this.actors.some(
        (a) => hostile(actor, a) && distance(actor.position, a.position) < 3.8,
      ),
      swinging: !!actor.attack.swing,
      hidden,
      rested: brain.hideTime >= 1,
      readyToShoot:
        !!target &&
        !hidden &&
        distance(actor.position, target.position) >= 4 &&
        actor.attack.cooldown <= 0,
      coolingDown: actor.attack.cooldown > 0,
      regroup:
        !!leader &&
        !!target &&
        distance(actor.position, leader.position) > 7 &&
        distance(actor.position, target.position) > 4,
      melee: !!target && this.inMelee(actor, target),
      atHome: distance(actor.position, brain.home) < 0.2,
      activity:
        brain.social && brain.social.members.filter((id) => this.actor(id)?.alive).length > 1
          ? brain.social.activity
          : 'smoke',
    });
    const job =
      !target && !actor.attack.swing ? this.ecs.get('run')?.get('objectiveWork')?.job(actor) : null;
    if (job) {
      if (distance(actor.position, job) > 0.1) {
        if (
          !actor.navigator.active ||
          !actor.navigator.destination ||
          distance(actor.navigator.destination, job) > 0.1
        )
          this.route(actor, job);
      } else {
        actor.navigator.cancel();
        if (job.facing !== undefined) actor.position.heading = job.facing;
      }
    } else this.applyBehaviorEffects(actor, target, effects);
  }

  private applyBehaviorEffects(
    actor: Actor,
    target: Actor | undefined,
    effects: readonly { type: string }[],
  ): void {
    const brain = actor.brain!;
    for (const effect of effects) {
      switch (effect.type) {
        case 'returnHome':
          if (
            !actor.navigator.active ||
            !actor.navigator.destination ||
            distance(actor.navigator.destination, brain.home) > 0.25
          )
            this.route(actor, brain.home);
          break;
        case 'socialize': {
          actor.navigator.cancel();
          const center = brain.social?.center;
          if (center && distance(actor.position, center) > 0.1)
            actor.position.heading = Math.atan2(
              center.x - actor.position.x,
              center.z - actor.position.z,
            );
          break;
        }
        case 'wander': {
          const goals = this.localGoals(actor, 5).filter((p) => distance(p, brain.home) < 10);
          if (goals.length) this.route(actor, goals[Math.floor(this.random() * goals.length)]);
          break;
        }
        case 'flee':
          if (target) this.flee(actor, target);
          break;
        case 'rest':
          brain.hideTime += 0.45;
          actor.navigator.cancel();
          break;
        case 'shoot':
          if (target) this.startAttack(actor, target, true);
          brain.hideTime = 0;
          break;
        case 'seekCover':
          if (target) this.seekFiringPosition(actor, target, true);
          break;
        case 'peek':
          if (target) this.seekFiringPosition(actor, target, false);
          break;
        case 'regroup': {
          const leader = this.actors.find((a) => a.alive && a.brain?.pack === brain.pack);
          if (leader) {
            const goals = this.localGoals(leader, 2).sort(
              (a, b) => distance(a, actor.position) - distance(b, actor.position),
            );
            goals.some((goal) => this.route(actor, goal));
          }
          break;
        }
        case 'melee':
          if (target) this.startAttack(actor, target);
          break;
        case 'flank':
          if (target) this.flank(actor, target);
          break;
        case 'chase':
          this.pursue(actor, 0.6);
          break;
        default:
          throw new Error(`Unhandled monster effect: ${effect.type}`);
      }
    }
  }

  damage(target: Actor, amount: number, source?: Actor): boolean {
    if (!target.alive || (source && !hostile(source, target)) || !target.health.damage(amount))
      return false;
    target.entity.get('work')?.interrupt('Executor hurt');
    this.hitParticles(target, source);
    if (target.health.current === 0) {
      stopActor(target);
      target.attack.die();
      target.brain?.behavior.send({ type: 'DIE' });
      target.entity.add('corpse', { age: 0 });
      this.onDeath(target, source);
      for (const other of this.actors)
        if (other.attack.target === target.id) {
          other.attack.target = null;
          other.navigator.cancel();
        }
    } else if (target.brain && source) {
      target.attack.target = source.id;
      target.brain.memory = 5;
      target.brain.think = 0;
    }
    return true;
  }

  private hitParticles(target: Actor, source?: Actor): void {
    const kind = target.kind === 'skeleton' ? 'dust' : 'blood';
    const dx = target.position.x - (source?.position.x ?? target.position.x),
      dz = target.position.z - (source?.position.z ?? target.position.z);
    const length = Math.max(0.1, Math.hypot(dx, dz));
    const count = Math.min(14, 192 - this.ecs.query('particle').length);
    for (let i = 0; i < count; i++) {
      const duration = kind === 'dust' ? 0.65 + this.random() * 0.4 : 0.4 + this.random() * 0.3;
      this.ecs
        .create()
        .add('transform', { ...target.position, h: target.elevation + 1 })
        .add('particle', {
          kind,
          vx: (dx / length) * 2 + (this.random() - 0.5) * 3.5,
          vz: (dz / length) * 2 + (this.random() - 0.5) * 3.5,
          vy: 1.6 + this.random() * 3,
          life: duration,
          duration,
          size: kind === 'dust' ? 0.1 : 0.09,
        });
    }
  }

  private launch(actor: Actor, target: Actor): void {
    if (this.ecs.query('projectile').length >= 32) return;
    const dx = target.position.x - actor.position.x,
      dz = target.position.z - actor.position.z;
    const dy = target.elevation - actor.elevation,
      length = Math.max(0.1, Math.hypot(dx, dy, dz));
    this.ecs
      .create()
      .add('transform', { ...actor.position, h: actor.elevation + 0.85 })
      .add('projectile', {
        owner: actor.id,
        vx: (dx / length) * 10,
        vy: (dy / length) * 10,
        vz: (dz / length) * 10,
        life: 1.6,
        damage: 7,
      });
  }

  update(dt: number): void {
    this.time += dt;
    for (const actor of this.actors) {
      actor.health.advance(dt);
      actor.attack.cool(dt);
      const corpse = actor.entity.get('corpse');
      if (corpse) {
        corpse.age += dt;
        continue;
      }
      if (!actor.alive) {
        actor.attack.die();
        actor.brain?.behavior.send({ type: 'DIE' });
        continue;
      }
      const brain = actor.brain;
      if (brain) {
        brain.think -= dt;
        brain.memory -= dt;
        if (brain.think <= 0) {
          this.think(actor);
          brain.think = actor.kind === 'skeleton' ? 0.6 : 0.45;
        }
        const target = this.actor(actor.attack.target);
        this.applyBehaviorEffects(
          actor,
          target,
          brain.behavior.send({
            type: 'ENGAGE',
            melee: !!target?.alive && this.inMelee(actor, target),
            swinging: !!actor.attack.swing,
          }),
        );
        moveActor(
          actor,
          this.world,
          {
            locked: !!actor.attack.swing,
            speed:
              actor.kind === 'goblin' && brain.state === 'flee' ? GOBLIN_FLEE_SPEED : undefined,
          },
          dt,
        );
      }
      const swing = actor.attack.advance(dt);
      if (!swing) continue;
      const target = this.actor(swing.target);
      if (target?.alive) {
        if (swing.ranged) {
          if (clearSight(this.world, actor.position, target.position)) this.launch(actor, target);
        } else if (this.inMelee(actor, target))
          this.damage(
            target,
            actor.kind === 'player' ? 24 : actor.kind === 'skeleton' ? 9 : 6,
            actor,
          );
      }
    }
    this.updateProjectiles(dt);
    for (const entity of this.ecs.query('particle', 'transform')) {
      const p = entity.require('transform'),
        particle = entity.require('particle');
      particle.life -= dt;
      if (particle.life <= 0) {
        this.ecs.remove(entity.id);
        continue;
      }
      p.x += particle.vx * dt;
      p.z += particle.vz * dt;
      p.h += particle.vy * dt;
      particle.vy -= (particle.kind === 'blood' ? 9 : 2.5) * dt;
      const floor = heightAt(this.world, p.x, p.z);
      if (floor !== null && p.h < floor + 0.03) {
        p.h = floor + 0.03;
        particle.vx *= 0.7;
        particle.vz *= 0.7;
        particle.vy = 0;
      }
    }
  }

  private updateProjectiles(dt: number): void {
    for (const entity of this.ecs.query('projectile', 'transform')) {
      const shot = entity.require('projectile'),
        p = entity.require('transform');
      const owner = this.actor(shot.owner);
      shot.life -= dt;
      if (!owner || shot.life <= 0) {
        this.ecs.remove(entity.id);
        continue;
      }
      const steps = Math.max(1, Math.ceil((Math.hypot(shot.vx, shot.vz) * dt) / 0.12));
      for (let i = 0; i < steps; i++) {
        const next = {
          x: p.x + (shot.vx * dt) / steps,
          z: p.z + (shot.vz * dt) / steps,
          h: p.h + (shot.vy * dt) / steps,
        };
        if (
          !clearSight(this.world, { ...p, h: p.h - 0.85 }, { ...next, h: next.h - 0.85 }) ||
          !tileAt(this.world, next.x, next.z) ||
          this.world.blockers.some(
            (b) => Math.abs(next.x - b.x) < b.w / 2 && Math.abs(next.z - b.z) < b.d / 2,
          )
        ) {
          this.ecs.remove(entity.id);
          break;
        }
        Object.assign(p, next);
        const target = this.actors.find(
          (a) =>
            hostile(owner, a) &&
            distance(a.position, p) < 0.48 &&
            Math.abs(a.elevation + 0.85 - p.h) < 0.75,
        );
        if (target) {
          this.damage(target, shot.damage, owner);
          this.ecs.remove(entity.id);
          break;
        }
      }
    }
  }
}
