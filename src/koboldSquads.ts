import { Actor } from './actors.ts';
import type { MoveIntent } from './actors.ts';
import type { ECS, Entity } from './ecs.ts';
import { Defense } from './machines/actors/defense.ts';
import { Statechart } from './machines/statechart.ts';
import { koboldSquadMachine, PHALANX } from './machines/monsters/koboldSquad.ts';
import type { Point } from './worldTypes.ts';
import type { NavigationWorld } from './navigation.ts';
import { tileAt } from './worldSpatial.ts';

export interface SquadMember {
  readonly entity: Entity;
  readonly group: Entity;
  readonly slot: number;
  readonly role: 'shieldbearer' | 'spearman';
}

/** Original entity references survive casualties without renumbering or replacement inheritance. */
export class KoboldSquad {
  readonly chart = new Statechart(koboldSquadMachine);
  readonly members: readonly SquadMember[];
  private readonly ecs: ECS;
  /** Continuous formation geometry, integrated by the simulation, never by poses. */
  private anchor: Point | null = null;
  private facing = 0;
  private routeClock = 0;
  private reformClock = 0;
  /** Search-input/progress cache, not a second phase: stagnant assembly retries stay asleep. */
  private reformGeometry: string | null = null;
  private reformDistance = Infinity;
  private readonly retreatOffsets = new Map<number, Point>();
  private readonly ranks = new Map<number, number>([
    [0, -1],
    [1, 0],
    [2, 1],
  ]);
  constructor(ecs: ECS, group: Entity, actors: readonly Actor[]) {
    this.ecs = ecs;
    this.members = actors.map((actor, slot) => {
      const member: SquadMember = {
        entity: actor.entity,
        group,
        slot,
        role: slot === 3 ? 'spearman' : 'shieldbearer',
      };
      actor.entity.add('squadMember', member);
      if (member.role === 'shieldbearer') actor.entity.add('defense', new Defense());
      return member;
    });
  }
  get state() {
    return this.chart.snapshot.value;
  }
  get target() {
    return this.chart.snapshot.context.target;
  }
  get living() {
    return this.members.filter(
      (m) => this.ecs.get(m.entity.id) === m.entity && new Actor(m.entity).alive,
    );
  }
  get center(): Point {
    const members = this.living;
    const positions = (members.length ? members : this.members).map((m) =>
      m.entity.require('transform'),
    );
    return {
      x: positions.reduce((n, p) => n + p.x, 0) / positions.length,
      z: positions.reduce((n, p) => n + p.z, 0) / positions.length,
    };
  }
  get heading(): number {
    return this.facing;
  }
  get active(): boolean {
    return !!this.target;
  }
  get spear(): Actor | undefined {
    const m = this.living.find((m) => m.role === 'spearman');
    return m ? new Actor(m.entity) : undefined;
  }
  get losing(): boolean {
    const living = this.living;
    return (
      !living.some((m) => m.role === 'spearman') ||
      living.length <= this.members.length / 2 ||
      living.reduce((n, m) => n + new Actor(m.entity).health.current, 0) <=
        living.reduce((n, m) => n + new Actor(m.entity).health.max, 0) * PHALANX.healthFraction
    );
  }
  get cohesive(): boolean {
    return this.living.every(
      (m) => this.distance(new Actor(m.entity).position, this.approach(m)) < 0.13,
    );
  }
  isOpening(member: SquadMember): boolean {
    return this.isGate(member) && (this.state === 'opening' || this.state === 'attacking');
  }
  isGate(member: SquadMember): boolean {
    return this.ranks.get(member.slot) === 0;
  }
  alert(target: Entity): void {
    if (target !== this.target && this.state !== 'retreating') this.anchor = null;
    this.chart.send({ type: 'ALERT', target });
    this.initialize();
  }
  private distance(a: Point, b: Point) {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }
  private offset(member: SquadMember, heading = this.heading): Point {
    const side = member.slot === 3 ? 0.175 : (this.ranks.get(member.slot) ?? 0) * PHALANX.spacing;
    const forward = member.slot === 3 ? 0.3 - PHALANX.rear : 0.3;
    return {
      x: Math.cos(heading) * side + Math.sin(heading) * forward,
      z: -Math.sin(heading) * side + Math.cos(heading) * forward,
    };
  }
  private initialize(): void {
    if (this.anchor || !this.target) return;
    const center = this.center,
      target = this.target.require('transform');
    this.facing = Math.atan2(target.x - center.x, target.z - center.z);
    // Aim the right-hand lane, rather than the middle shield's body, at the threat.
    const range = this.distance(target, center);
    if (range > PHALANX.lane) this.facing -= Math.asin(PHALANX.lane / range);
    // Choose the initial left/centre/right permutation by current lateral order, once per
    // encounter. Original role/slot identities and this permutation survive casualties.
    this.members
      .filter((m) => m.role === 'shieldbearer')
      .slice()
      .sort((a, b) => {
        const p = a.entity.require('transform'),
          q = b.entity.require('transform');
        return (
          (p.x - q.x) * Math.cos(this.facing) - (p.z - q.z) * Math.sin(this.facing) ||
          a.slot - b.slot
        );
      })
      .forEach((m, i) => this.ranks.set(m.slot, i - 1));
    const offsets = this.living.map((m) => this.offset(m));
    this.anchor = {
      x: center.x - offsets.reduce((n, p) => n + p.x, 0) / offsets.length,
      z: center.z - offsets.reduce((n, p) => n + p.z, 0) / offsets.length,
    };
    const initial = this.anchor;
    // A gathering can put the spearman on a future shield slot and vice versa. Choose
    // a nearby clear assembly footprint before routing, rather than ordering a swap
    // through occupied bodies. Seventeen deterministic candidates, no global search.
    const candidates = [
      initial,
      ...[1.25, 2.5].flatMap((radius) =>
        Array.from({ length: 8 }, (_, i) => ({
          x: initial.x + Math.sin(this.facing + (i * Math.PI) / 4) * radius,
          z: initial.z + Math.cos(this.facing + (i * Math.PI) / 4) * radius,
        })),
      ),
    ];
    const available = candidates
      .flatMap((point) => {
        let score = 0;
        for (const m of this.living) {
          const a = new Actor(m.entity),
            o = this.offset(m),
            goal = { x: point.x + o.x, z: point.z + o.z };
          if (!a.navigator.canOccupy(goal)) return [];
          score +=
            this.distance(a.position, goal) +
            (a.navigator.liveSegmentClear(a.position, goal) ? 0 : 3);
        }
        return [{ point, score }];
      })
      .sort((a, b) => a.score - b.score);
    this.anchor = available[0]?.point ?? initial;
    this.routeClock = 0;
    this.reformClock = 0;
    this.reformGeometry = null;
    this.reformDistance = Infinity;
  }
  /** Stable original role slots: three across the front, right-hand spear lane behind. */
  approach(member: SquadMember): Point {
    const center = this.anchor ?? this.center,
      offset = this.offset(member);
    return { x: center.x + offset.x, z: center.z + offset.z };
  }
  private clearTranslation(delta: Point): boolean {
    const living = this.living;
    const external = this.ecs
      .query('actor', 'body', 'transform', 'health')
      .filter((e) => !living.some((m) => m.entity === e) && new Actor(e).alive)
      .map((e) => ({ ...e.require('transform'), ...e.require('body') }));
    return living.every((m) => {
      const a = new Actor(m.entity),
        p = a.position;
      // Terrain/doors plus external bodies; fellow ranks translate together. The motor still
      // performs ordinary swept live-body collision for every individual step.
      return (
        a.navigator.segmentClear(p, { x: p.x + delta.x, z: p.z + delta.z }) &&
        a.navigator.occupancy!.segmentClear(
          p,
          { ...p, x: p.x + delta.x, z: p.z + delta.z },
          external,
        )
      );
    });
  }
  get blocked(): boolean {
    return !this.clearTranslation({
      x: Math.sin(this.heading) * 0.35,
      z: Math.cos(this.heading) * 0.35,
    });
  }
  prepareReform(world: NavigationWorld, dt: number): boolean {
    this.reformClock -= dt;
    if (this.chart.snapshot.context.elapsed < PHALANX.retry || this.reformClock > 0) return false;
    this.reformClock = 0.5;
    if (this.blocked) return false;
    if (this.cohesive) return true;
    const center = this.center;
    const coordinates = (p: Point & { h?: number }) => [p.x, p.z, p.h];
    const geometry = JSON.stringify([
      this.anchor,
      this.heading,
      this.target && coordinates(this.target.require('transform')),
      this.ecs
        .query('actor', 'body', 'transform', 'health')
        .filter(
          (e) =>
            !this.members.some((m) => m.entity === e) &&
            new Actor(e).alive &&
            this.distance(e.require('transform'), center) < 16,
        )
        .map((e) => [e.id, coordinates(e.require('transform')), e.require('body')]),
      world.blockers.map(({ x, z, w, d }) => [x, z, w, d]),
      world.entities
        .filter((e) => e.type === 'door')
        .map((e) => [e.id, e.locked, e.open, !!e.collider?.checkCollisions]),
    ]);
    const remaining = () =>
      this.living.reduce((total, m) => {
        const a = new Actor(m.entity),
          goal = this.approach(m);
        let from: Point = a.position,
          length = 0;
        for (const to of a.navigator.path) {
          length += this.distance(from, to);
          from = to;
        }
        return total + length + this.distance(from, goal);
      }, 0);
    const changed = geometry !== this.reformGeometry;
    if (!changed && remaining() > this.reformDistance - PHALANX.reformProgress) return false;
    this.reformGeometry = geometry;
    // A straight connector is not a reachability oracle. Resume a local detour after actual
    // route progress or changed external geometry, never from endless side-step oscillation.
    // The group chart decides whether these prepared routes reach the shared motor.
    let ready = false;
    for (const m of this.living) {
      const a = new Actor(m.entity),
        goal = this.approach(m);
      if (this.distance(a.position, goal) < 0.025) continue;
      if (a.navigator.liveSegmentClear(a.position, goal)) ready = true;
      else if (this.routeToSlot(a, goal)) ready = true;
    }
    this.reformDistance = changed ? remaining() : Math.min(this.reformDistance, remaining());
    return ready;
  }
  private routeToSlot(a: Actor, goal: Point): boolean {
    if (a.navigator.active) return true;
    if (a.navigator.pending) return false;
    const status = a.navigator.request(a.position, goal, { openDoors: true });
    if (status === 'pending') return false;
    if (status === 'ready') {
      if (this.routeLength(a) <= PHALANX.routeLimit) return true;
      // Assembly is local: do not send one rank on a whole-keep tour around a choke.
      a.navigator.cancel();
    }
    // Grid routing may lack a free start connector in a close social gathering. Take one
    // clear side-step, then reevaluate the slot. Never replace an in-flight yield route.
    const yields = [0.95, 1.5]
      .flatMap((radius) =>
        Array.from({ length: 8 }, (_, i) => ({
          x: a.position.x + Math.sin(this.heading + (i * Math.PI) / 4) * radius,
          z: a.position.z + Math.cos(this.heading + (i * Math.PI) / 4) * radius,
        })),
      )
      .filter((p) => a.navigator.canOccupy(p) && a.navigator.liveSegmentClear(a.position, p))
      .sort((p, q) => this.distance(p, goal) - this.distance(q, goal));
    return (
      !!yields[0] && a.navigator.request(a.position, yields[0], { openDoors: true }) === 'ready'
    );
  }
  private routeLength(a: Actor): number {
    let from: Point = a.position,
      length = 0;
    for (const to of a.navigator.path) {
      length += this.distance(from, to);
      from = to;
    }
    return length;
  }
  /** Phase-entry geometry sample; no second retreat flag or clock. */
  beginRetreat(): void {
    const center = this.center;
    this.anchor = { ...center };
    this.retreatOffsets.clear();
    for (const m of this.living) {
      const p = m.entity.require('transform');
      this.retreatOffsets.set(m.slot, { x: p.x - center.x, z: p.z - center.z });
    }
  }
  /** At most twelve route rounds per assembly; holds probe only changed search inputs. */
  movement(dt: number, world: NavigationWorld): Map<Entity, MoveIntent> {
    const intents = new Map<Entity, MoveIntent>();
    if (!this.active) {
      this.anchor = null;
      return intents;
    }
    this.initialize();
    const target = this.target!.require('transform');
    const moving = this.state === 'engaging' || this.state === 'assembling';
    if (moving && this.cohesive) {
      const lane = {
        x: this.anchor!.x + Math.cos(this.heading) * PHALANX.lane,
        z: this.anchor!.z - Math.sin(this.heading) * PHALANX.lane,
      };
      const desired = Math.atan2(target.x - lane.x, target.z - lane.z);
      const turn = Math.atan2(Math.sin(desired - this.facing), Math.cos(desired - this.facing));
      const next =
        this.facing + Math.max(-PHALANX.turnSpeed * dt, Math.min(PHALANX.turnSpeed * dt, turn));
      if (
        this.living.every((m) => {
          const a = new Actor(m.entity),
            o = this.offset(m, next);
          return a.navigator.canStand({ x: this.anchor!.x + o.x, z: this.anchor!.z + o.z });
        })
      )
        this.facing = next;
      if (this.state === 'engaging' && !this.blocked && this.distance(lane, target) > 2.45) {
        this.anchor!.x += Math.sin(this.heading) * PHALANX.speed * dt;
        this.anchor!.z += Math.cos(this.heading) * PHALANX.speed * dt;
      }
    }
    this.routeClock -= dt;
    const retry = this.routeClock <= 0;
    if (retry) this.routeClock = 0.5;
    let retreat = { x: 0, z: 0 };
    const groundFactor = (a: Actor) =>
      !a.jump.airborne && tileAt(world, a.position.x, a.position.z)?.surface === 'water' ? 0.52 : 1;
    const unitFactor = Math.min(...this.living.map((m) => groundFactor(new Actor(m.entity))));
    if (this.state === 'retreating') {
      const center = this.center;
      const desired = Math.atan2(target.x - center.x, target.z - center.z);
      const turn = Math.atan2(Math.sin(desired - this.facing), Math.cos(desired - this.facing));
      this.facing += Math.max(-PHALANX.turnSpeed * dt, Math.min(PHALANX.turnSpeed * dt, turn));
      // Prefer home if it is behind the shield line; otherwise take a bounded backward escape.
      const homes = this.living.map((m) => m.entity.require('brain').home);
      const home = {
        x: homes.reduce((n, p) => n + p.x, 0) / homes.length,
        z: homes.reduce((n, p) => n + p.z, 0) / homes.length,
      };
      const d = this.distance(home, center),
        dx = (home.x - center.x) / (d || 1),
        dz = (home.z - center.z) / (d || 1);
      retreat =
        d > 1 && dx * Math.sin(this.heading) + dz * Math.cos(this.heading) < -0.8
          ? { x: dx, z: dz }
          : { x: -Math.sin(this.heading), z: -Math.cos(this.heading) };
      if (!this.clearTranslation({ x: retreat.x * 0.25, z: retreat.z * 0.25 }))
        retreat = { x: 0, z: 0 };
      if (
        this.living.every((m) => {
          const o = this.retreatOffsets.get(m.slot)!;
          return (
            this.distance(m.entity.require('transform'), {
              x: this.anchor!.x + o.x,
              z: this.anchor!.z + o.z,
            }) < 0.13
          );
        })
      ) {
        this.anchor!.x += retreat.x * PHALANX.retreatSpeed * unitFactor * dt;
        this.anchor!.z += retreat.z * PHALANX.retreatSpeed * unitFactor * dt;
      }
    }
    for (const m of this.living) {
      const a = new Actor(m.entity),
        goal = this.approach(m),
        d = this.distance(a.position, goal);
      // Navigator may replan around a newly occupied edge during the previous motor step.
      if (a.navigator.active && this.routeLength(a) > PHALANX.routeLimit) a.navigator.cancel();
      const intent: MoveIntent = { facing: this.heading, speed: PHALANX.speed };
      if (this.state === 'retreating') {
        a.navigator.cancel();
        const o = this.retreatOffsets.get(m.slot)!;
        const direction = {
          x: this.anchor!.x + o.x - a.position.x,
          z: this.anchor!.z + o.z - a.position.z,
        };
        Object.assign(intent, {
          direction,
          speed:
            Math.min(PHALANX.retreatSpeed * unitFactor, Math.hypot(direction.x, direction.z) * 12) /
            groundFactor(a),
          locked:
            Math.hypot(retreat.x, retreat.z) === 0 || Math.hypot(direction.x, direction.z) < 0.015,
        });
      } else if (moving && d > 0.025) {
        if (a.navigator.liveSegmentClear(a.position, goal)) {
          a.navigator.cancel();
          intent.direction = { x: goal.x - a.position.x, z: goal.z - a.position.z };
          intent.speed = Math.min(PHALANX.speed, d * 12);
        } else if (this.state === 'assembling' && retry && !a.navigator.active) {
          this.routeToSlot(a, goal);
        }
      } else {
        // Freeze a pending local detour during the hold; recovery must be able to measure
        // its remaining distance and resume it instead of throwing away useful progress.
        if (this.state !== 'holding') a.navigator.cancel();
        intent.locked = true;
      }
      intents.set(m.entity, intent);
    }
    return intents;
  }
}

export function installKoboldSquads(ecs: ECS, actors: readonly Actor[]): void {
  const packs = new Map<string, Actor[]>();
  for (const actor of actors)
    if (actor.kind === 'kobold' && actor.brain?.pack) {
      const members = packs.get(actor.brain.pack) ?? [];
      members.push(actor);
      packs.set(actor.brain.pack, members);
    }
  for (const [id, members] of packs) {
    const group = ecs.create(id);
    group.add(
      'koboldSquad',
      new KoboldSquad(
        ecs,
        group,
        members.sort((a, b) => a.brain!.slot - b.brain!.slot),
      ),
    );
  }
}
