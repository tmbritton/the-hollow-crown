import { Actor } from './actors.ts';
import type { ECS, Entity } from './ecs.ts';
import { Defense } from './machines/actors/defense.ts';
import { Statechart } from './machines/statechart.ts';
import { koboldSquadMachine } from './machines/monsters/koboldSquad.ts';
import type { Point } from './worldTypes.ts';

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
    const center = this.center,
      target = this.target?.get('transform');
    return target ? Math.atan2(target.x - center.x, target.z - center.z) : 0;
  }
  /** P6a uses ordinary radial melee approaches. P6b can replace these with front/rear rank slots. */
  approach(member: SquadMember): Point {
    const center = this.target?.get('transform') ?? this.center;
    const angle = this.heading + Math.PI + (member.slot * Math.PI * 2) / this.members.length;
    return { x: center.x + Math.sin(angle) * 1.12, z: center.z + Math.cos(angle) * 1.12 };
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
