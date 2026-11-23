import type { ECS, Entity } from './ecs.ts';
import type { NavigationWorld } from './navigation.ts';
import { heightAt } from './world.ts';
import { Ragdoll, RAGDOLL_LIMIT } from './ragdoll.ts';
import type { RagdollTerrain } from './ragdoll.ts';
import type { DeathHandoff } from './deathHandoff.ts';

/** Run-owned presentation lifecycle. Authoritative death and cargo/knowledge commits precede this.
 * Heroes respawn before presentation; no duplicate hero or delayed health transition is introduced. */
export class DeathPhysics {
  private readonly ecs: ECS;
  private readonly terrain: RagdollTerrain;
  private readonly records = new Map<Entity, Ragdoll>();
  private readonly consumed = new WeakSet<DeathHandoff>();
  private sequence = 0;
  private retired = false;
  constructor(ecs: ECS, terrain: NavigationWorld) {
    this.ecs = ecs;
    this.terrain = { ...terrain, physicalObstacles: ecs.get('run')?.get('physicalObstacles') };
  }
  advance(dt: number): void {
    if (this.retired) return;
    const entered = new Set<Entity>();
    for (const [entity, ragdoll] of this.records) {
      if (
        this.ecs.get(entity.id) !== entity ||
        entity.get('ragdoll') !== ragdoll ||
        !entity.has('corpse')
      ) {
        if (!entity.has('ragdoll') || (!entity.has('corpse') && entity.get('ragdoll') === ragdoll))
          entity.get('rigPose')?.reset(entity.require('transform'));
        ragdoll.dispose();
        entity.remove('ragdoll');
        this.records.delete(entity);
      }
    }
    for (const entity of this.ecs.query('corpse', 'deathHandoff', 'rigPose')) {
      if (this.records.has(entity)) continue;
      const handoff = entity.require('deathHandoff');
      if (
        !handoff.pose ||
        handoff.target !== entity ||
        handoff.run !== this.ecs ||
        this.consumed.has(handoff)
      )
        continue;
      this.consumed.add(handoff);
      const active = [...this.records.values()].filter((r) => !r.settled);
      if (active.length >= RAGDOLL_LIMIT) active[0].freeze();
      const seed = 'seed' in this.terrain ? String(this.terrain.seed) : 'fixture';
      const ragdoll = new Ragdoll(
        this.terrain,
        handoff.pose,
        handoff.travel,
        handoff.magnitude,
        `${seed}:${entity.id}:${handoff.source?.id ?? 'hazard'}:${handoff.time}:${this.sequence++}`,
        entity.require('rigPose').physicsShapes(),
      );
      this.records.set(entity, ragdoll);
      entity.add('ragdoll', ragdoll);
      entity.require('rigPose').applyPhysics(ragdoll);
      entered.add(entity);
      // The entry publication is exactly the captured pose; simulation starts next fixed tick.
    }
    for (const [entity, ragdoll] of this.records) {
      const binding = entity.require('rigPose');
      binding.begin(dt);
      if (!entered.has(entity)) ragdoll.advance(dt);
      binding.applyPhysics(ragdoll);
      const p = entity.require('transform');
      p.x = ragdoll.world[12];
      p.z = ragdoll.world[14];
      p.h = heightAt(this.terrain, p.x, p.z) ?? p.h;
    }
  }
  dispose(): void {
    if (this.retired) return;
    this.retired = true;
    for (const [entity, ragdoll] of this.records) {
      entity.get('rigPose')?.reset(entity.require('transform'));
      entity.remove('deathHandoff');
      ragdoll.dispose();
      entity.remove('ragdoll');
    }
    this.records.clear();
  }
}

export function advanceDeathPhysics(ecs: ECS, world: NavigationWorld, dt: number): void {
  let run = ecs.get('run');
  if (!run) run = ecs.create('run');
  let physics = run.get('deathPhysics');
  if (!physics) {
    physics = new DeathPhysics(ecs, world);
    run.add('deathPhysics', physics);
    const owned = physics;
    ecs
      .query('rig')[0]
      ?.require('rig')
      .root.getScene()
      .onDisposeObservable.addOnce(() => owned.dispose());
  }
  physics.advance(dt);
}
