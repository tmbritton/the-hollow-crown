import type { GenerationIdentity } from './generation/identity.ts';
import type { InhabitantIdentity } from './generation/inhabitants.ts';
import type { PortraitEntity, Room } from './worldTypes.ts';

/** A source's explicit disclosure, not a query into the generated world's related facts. */
export interface DiscoveryEvidence {
  id: string;
  kind: 'portrait' | 'inhabitant' | 'landmark';
  subjectId: string;
  title: string;
  description: string;
  factIds: string[];
}
export type DiscoveryEntry = DiscoveryEvidence & { at: number; order: number };

/** Callers supply only observed participants; absence of a killer means unknown, not absent. */
export type ObservedEvent = { subjectId: string; label: string } & (
  | { kind: 'death-witnessed'; killer?: { id: string; label: string } }
  | { kind: 'remains-found' | 'altar-kindled' | 'reliquary-claimed' | 'crown-claimed' }
);
export type RunEvent = ObservedEvent & {
  id: string;
  at: number;
  order: number;
  description: string;
};
export interface DiscoverySnapshot {
  identity: GenerationIdentity;
  discoveries: DiscoveryEntry[];
  events: RunEvent[];
  factIds: string[];
}

/** Run-owned, monotonic knowledge. No world/health lookup, clock, storage, or reset on respawn. */
export class DiscoveryRecord {
  private readonly identity: GenerationIdentity;
  private readonly discoveries = new Map<string, DiscoveryEntry>();
  private readonly events = new Map<string, RunEvent>();
  private readonly facts = new Set<string>();

  constructor(identity: GenerationIdentity) {
    this.identity = { ...identity };
  }
  knows(factId: string): boolean {
    return this.facts.has(factId);
  }
  hasDiscovery(id: string): boolean {
    return this.discoveries.has(id);
  }
  hasEvent(kind: ObservedEvent['kind'], subjectId: string): boolean {
    return this.events.has(`event:${kind}:${subjectId}`);
  }
  private get nextOrder(): number {
    return this.discoveries.size + this.events.size;
  }
  /** Commit after presentation. Re-reading a source cannot rewrite its first disclosure. */
  present(evidence: DiscoveryEvidence, at: number): boolean {
    if (this.hasDiscovery(evidence.id)) return false;
    this.discoveries.set(evidence.id, structuredClone({ ...evidence, at, order: this.nextOrder }));
    for (const fact of evidence.factIds) this.facts.add(fact);
    return true;
  }
  /** Commit at the actual event/observation, never reconstruct from current world state. */
  recordEvent(event: ObservedEvent, at: number): boolean {
    if (this.hasEvent(event.kind, event.subjectId)) return false;
    if (event.kind === 'remains-found' && this.hasEvent('death-witnessed', event.subjectId))
      return false;
    const description =
      event.kind === 'death-witnessed'
        ? `Witnessed the death of ${event.label}.${event.killer ? ` Killed by ${event.killer.label}.` : ' Killer unknown.'}`
        : event.kind === 'remains-found'
          ? `Found the remains of ${event.label}. Their death was not witnessed; killer unknown.`
          : event.kind === 'altar-kindled'
            ? 'You kindled the violet altar and unsealed the throne gate.'
            : event.kind === 'reliquary-claimed'
              ? 'You recovered a relic from this reliquary.'
              : 'You claimed the Hollow Crown.';
    const id = `event:${event.kind}:${event.subjectId}`;
    this.events.set(id, structuredClone({ ...event, id, at, order: this.nextOrder, description }));
    return true;
  }
  /** Detached read model; neither the UI nor future objective consumers can mutate history. */
  snapshot(): DiscoverySnapshot {
    return structuredClone({
      identity: this.identity,
      discoveries: [...this.discoveries.values()],
      events: [...this.events.values()],
      factIds: [...this.facts],
    });
  }
}

/** Placement identity is stable even when generated array/counter IDs are reordered. */
export function portraitDiscovery(portrait: PortraitEntity): DiscoveryEvidence {
  const royal = portrait.royal;
  return {
    id: `portrait:${JSON.stringify([portrait.room, portrait.x, portrait.z, portrait.rotation])}`,
    kind: 'portrait',
    subjectId: royal.personId ?? portrait.id,
    title: royal.title,
    description: `House ${royal.house} · Year ${royal.year}. ${royal.description ?? ''}`,
    factIds: [...(royal.factIds ?? [])],
  };
}

export function landmarkDiscovery(room: Room): DiscoveryEvidence {
  return {
    id: `landmark:${room.id}`,
    kind: 'landmark',
    subjectId: room.id,
    title: room.name,
    description: room.description,
    factIds: [...(room.factIds ?? [])],
  };
}

export function inhabitantDiscovery(identity: InhabitantIdentity): DiscoveryEvidence {
  return {
    id: identity.id,
    kind: 'inhabitant',
    subjectId: identity.id,
    title: `${identity.name}, ${identity.title}`,
    description: identity.description,
    factIds: [...identity.factIds],
  };
}
