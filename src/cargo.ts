import type { ECS, Entity } from './ecs.ts';
import type { NavigationWorld } from './navigation.ts';
import { heightAt } from './worldSpatial.ts';
import { Statechart } from './machines/statechart.ts';
import { cargoMachine } from './machines/world/cargo.ts';

/** The cargo entity owns both lifecycle and the exact executor instance. IDs alone cannot
 * transfer a claim to a replacement actor. Terminal cargo never re-enters circulation. */
export class Cargo {
  private readonly chart = new Statechart(cargoMachine);
  private executor: Entity | null = null;
  get state() {
    return this.chart.snapshot.value;
  }
  get revision() {
    return this.chart.snapshot.context.revision;
  }
  get owner() {
    return this.chart.snapshot.context.owner ? this.executor : null;
  }
  claim(actor: Entity): boolean {
    if (this.state !== 'loose' || !actor.get('health')?.current || actor.has('corpse'))
      return false;
    this.chart.send({ type: 'CLAIM', actor: actor.id });
    this.executor = actor;
    return true;
  }
  accepts(actor: Entity, operation: 'pickup' | 'deliver'): boolean {
    return this.owner === actor && this.state === (operation === 'pickup' ? 'claimed' : 'carried');
  }
  commit(actor: Entity, operation: 'pickup' | 'deliver'): void {
    if (this.accepts(actor, operation))
      this.chart.send({ type: operation === 'pickup' ? 'PICKUP' : 'DELIVER', actor: actor.id });
  }
  drop(): void {
    this.chart.send({ type: 'DROP' });
  }
  recover(): boolean {
    if (this.state !== 'loose' && this.state !== 'claimed') return false;
    this.chart.send({ type: 'RECOVER' });
    return true;
  }
}

/** O2 calls this at both authoritative boundaries, including AFTER lethal impacts. */
export function synchronizeCargo(ecs: ECS, world: NavigationWorld): void {
  for (const entity of ecs.query('cargo', 'workSite', 'transform')) {
    const cargo = entity.require('cargo'),
      owner = cargo.owner;
    if (!owner) continue;
    const p = owner.get('transform');
    if (cargo.state === 'carried' && p) {
      const h = heightAt(world, p.x, p.z);
      if (h !== null && Math.abs(h - p.h) < 0.3) {
        Object.assign(entity.require('transform'), { x: p.x, z: p.z, h });
        entity.require('workSite').approach = { x: p.x, z: p.z, h };
      }
    }
    if (ecs.get(owner.id) !== owner || !owner.get('health')?.current || owner.has('corpse'))
      cargo.drop();
  }
}
