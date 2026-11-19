import { Statechart } from './machines/statechart.ts';
import { MAX_OBJECTIVE_CAPACITY, objectiveMachine } from './machines/world/objective.ts';
import type { ObjectiveResolution, ObjectiveTerminalStatus } from './machines/world/objective.ts';

export const OBJECTIVE_LIMITS = {
  objectives: 32,
  participants: 32,
  dependencies: 32,
  capacity: MAX_OBJECTIVE_CAPACITY,
  contributionsPerStep: 256,
  contributionIds: 4096,
} as const;

export interface ObjectiveDefinition {
  id: string;
  owner: { kind: 'player' | 'actor' | 'group'; id: string };
  /** Explicit actor IDs, independent of ownership; dynamic eligibility is sampled at commit. */
  participants: string[];
  capacity: number;
  announceOnActivation: boolean;
  /** Irreplaceable dependencies only. Temporary denial belongs in conditions. */
  dependencies: string[];
  outcomes: { completed: string; thwarted: string };
}
export interface ObjectiveRace {
  id: string;
  playerObjectiveId: string;
  monsterObjectiveId: string;
  outcomes: { playerFirst: string; monsterFirst: string; contested: string };
}
export interface ObjectivePlan {
  objectives: ObjectiveDefinition[];
  /** Exclusive pairs only; an objective belongs to at most one race. */
  races: ObjectiveRace[];
}
export interface ObjectiveParticipant {
  id: string;
  eligible: boolean;
  status: 'working' | 'interrupted' | 'blocked' | 'idle';
  reason?: string;
}
export interface ObjectiveConditions {
  objectiveId: string;
  available: boolean;
  reason?: string;
  participants: ObjectiveParticipant[];
}
export interface ObjectiveContribution {
  /** Run-wide work-action identity; retries, replacement actors and respawn reuse it. */
  id: string;
  objectiveId: string;
  participantId: string;
  amount: number;
}
export interface ObjectiveDisruption {
  objectiveId: string;
  reason: string;
}
export interface ObjectiveDependencyInvalidation {
  dependencyId: string;
  reason: string;
}
export interface ObjectiveStep {
  /** One complete batch per simulation step, strictly increasing; zero is permitted. */
  step: number;
  discover?: string[];
  activate?: string[];
  /** Fresh post-world/combat facts. Omission fails closed for this step. */
  conditions?: ObjectiveConditions[];
  disruptions?: ObjectiveDisruption[];
  invalidatedDependencies?: ObjectiveDependencyInvalidation[];
  contributions?: ObjectiveContribution[];
}
export interface ObjectiveOutcome {
  id: string;
  kind: 'completed' | 'thwarted' | 'player-first' | 'monster-first' | 'contested';
  step: number;
  objectiveIds: string[];
  reason?: string;
}
export interface ObjectiveStepResult {
  contributions: {
    id: string;
    status: 'accepted' | 'duplicate' | 'conflict' | 'unavailable';
    credited: number;
  }[];
  outcomes: ObjectiveOutcome[];
}
export interface ObjectiveSnapshot {
  id: string;
  owner: ObjectiveDefinition['owner'];
  eligibleParticipants: string[];
  dependencies: string[];
  capacity: number;
  progress: number;
  discovered: boolean;
  activated: boolean;
  visible: boolean;
  available: boolean;
  participants: ObjectiveParticipant[];
  status: 'unresolved' | ObjectiveTerminalStatus;
  workStatus: ObjectiveParticipant['status'] | ObjectiveTerminalStatus | 'dormant' | 'unavailable';
  reason?: string;
  resolution: ObjectiveResolution | null;
}
export interface ObjectiveRecordSnapshot {
  step: number | null;
  objectives: ObjectiveSnapshot[];
  contributions: (ObjectiveContribution & { step: number; credited: number })[];
  outcomes: ObjectiveOutcome[];
  invalidatedDependencies: ObjectiveDependencyInvalidation[];
}
interface RuntimeObjective {
  definition: ObjectiveDefinition;
  chart: Statechart<typeof objectiveMachine>;
  discovered: boolean;
  activated: boolean;
  conditions: ObjectiveConditions;
}

/** Structural callers may attach adapter state or callbacks. Copy only domain fields,
 * including nested contracts, before validation/commit; never clone caller metadata. */
function projectPlan(authored: ObjectivePlan): ObjectivePlan {
  return {
    objectives: authored.objectives.map((definition) => ({
      id: definition.id,
      owner: { kind: definition.owner.kind, id: definition.owner.id },
      participants: [...definition.participants],
      capacity: definition.capacity,
      announceOnActivation: definition.announceOnActivation,
      dependencies: [...definition.dependencies],
      outcomes: {
        completed: definition.outcomes.completed,
        thwarted: definition.outcomes.thwarted,
      },
    })),
    races: authored.races.map((race) => ({
      id: race.id,
      playerObjectiveId: race.playerObjectiveId,
      monsterObjectiveId: race.monsterObjectiveId,
      outcomes: {
        playerFirst: race.outcomes.playerFirst,
        monsterFirst: race.outcomes.monsterFirst,
        contested: race.outcomes.contested,
      },
    })),
  };
}
function projectStep(input: ObjectiveStep): ObjectiveStep {
  return {
    step: input.step,
    discover: [...(input.discover ?? [])],
    activate: [...(input.activate ?? [])],
    conditions: (input.conditions ?? []).map((facts) => ({
      objectiveId: facts.objectiveId,
      available: facts.available,
      ...(facts.reason === undefined ? {} : { reason: facts.reason }),
      participants: facts.participants.map((participant) => ({
        id: participant.id,
        eligible: participant.eligible,
        status: participant.status,
        ...(participant.reason === undefined ? {} : { reason: participant.reason }),
      })),
    })),
    disruptions: (input.disruptions ?? []).map((disruption) => ({
      objectiveId: disruption.objectiveId,
      reason: disruption.reason,
    })),
    invalidatedDependencies: (input.invalidatedDependencies ?? []).map((invalidation) => ({
      dependencyId: invalidation.dependencyId,
      reason: invalidation.reason,
    })),
    contributions: (input.contributions ?? []).map((candidate) => ({
      id: candidate.id,
      objectiveId: candidate.objectiveId,
      participantId: candidate.participantId,
      amount: candidate.amount,
    })),
  };
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const byId = <T extends { id: string }>(a: T, b: T): number => compare(a.id, b.id);
function id(value: string): void {
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value || value.length > 128)
    throw new Error('Invalid objective identifier');
}
function bounded(value: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > max)
    throw new Error(`Expected integer in 1..${max}`);
}
function unique(values: string[], max: number): void {
  if (values.length > max || new Set(values).size !== values.length)
    throw new Error('Duplicate identifiers or objective limit exceeded');
  values.forEach(id);
}
function reason(value: string): void {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Expected nonempty objective reason');
}
const unresolved = (entry: RuntimeObjective): boolean => entry.chart.snapshot.matches('unresolved');

/** Pure run component. No actor lookup, timers, presentation, rewards or world mutations.
 * The caller gathers ONE authoritative batch after combat and consumes newly emitted outcomes. */
export class ObjectiveRecord {
  private readonly objectives = new Map<string, RuntimeObjective>();
  private readonly races: ObjectiveRace[];
  private readonly seen = new Set<string>();
  private readonly invalidated = new Map<string, string>();
  private readonly contributions: ObjectiveRecordSnapshot['contributions'] = [];
  private readonly outcomes: ObjectiveOutcome[] = [];
  private step: number | null = null;

  constructor(authored: ObjectivePlan) {
    const plan = projectPlan(authored);
    unique(
      plan.objectives.map((entry) => entry.id),
      OBJECTIVE_LIMITS.objectives,
    );
    unique(
      plan.races.map((race) => race.id),
      Math.floor(OBJECTIVE_LIMITS.objectives / 2),
    );
    unique(
      [
        ...plan.objectives.flatMap((entry) => Object.values(entry.outcomes)),
        ...plan.races.flatMap((race) => Object.values(race.outcomes)),
      ],
      OBJECTIVE_LIMITS.objectives * 4,
    );
    for (const definition of plan.objectives.sort(byId)) {
      id(definition.owner.id);
      if (!['player', 'actor', 'group'].includes(definition.owner.kind))
        throw new Error('Invalid objective owner');
      if (typeof definition.announceOnActivation !== 'boolean')
        throw new Error('Invalid objective announcement policy');
      bounded(definition.capacity, OBJECTIVE_LIMITS.capacity);
      bounded(definition.participants.length, OBJECTIVE_LIMITS.participants);
      unique(definition.participants, OBJECTIVE_LIMITS.participants);
      unique(definition.dependencies, OBJECTIVE_LIMITS.dependencies);
      definition.participants.sort(compare);
      definition.dependencies.sort(compare);
      this.objectives.set(definition.id, {
        definition,
        chart: new Statechart(objectiveMachine, { capacity: definition.capacity }),
        discovered: false,
        activated: false,
        conditions: this.unsampled(definition.id),
      });
    }
    const paired = new Set<string>();
    this.races = plan.races.sort(byId);
    for (const race of this.races) {
      for (const objectiveId of [race.playerObjectiveId, race.monsterObjectiveId]) {
        this.require(objectiveId);
        if (paired.has(objectiveId))
          throw new Error('An objective can belong to only one exclusive race');
        paired.add(objectiveId);
      }
      if (!this.require(race.monsterObjectiveId).definition.announceOnActivation)
        throw new Error('A competing monster clock must be announced on activation');
    }
  }

  private require(objectiveId: string): RuntimeObjective {
    const entry = this.objectives.get(objectiveId);
    if (!entry) throw new Error(`Unknown objective: ${objectiveId}`);
    return entry;
  }
  private unsampled(objectiveId: string): ObjectiveConditions {
    return {
      objectiveId,
      available: false,
      reason: 'Work conditions not evaluated',
      participants: [],
    };
  }
  /** All validation precedes all mutation, including discovery and deduplication. */
  private validate(batch: ObjectiveStep): void {
    if (
      !Number.isSafeInteger(batch.step) ||
      batch.step < 0 ||
      (this.step !== null && batch.step <= this.step)
    )
      throw new Error('Objective batches require strictly increasing simulation steps');
    for (const objectiveId of [...(batch.discover ?? []), ...(batch.activate ?? [])])
      this.require(objectiveId);
    unique(
      (batch.conditions ?? []).map((item) => item.objectiveId),
      OBJECTIVE_LIMITS.objectives,
    );
    for (const facts of batch.conditions ?? []) {
      const entry = this.require(facts.objectiveId);
      unique(
        facts.participants.map((participant) => participant.id),
        OBJECTIVE_LIMITS.participants,
      );
      if (typeof facts.available !== 'boolean') throw new Error('Invalid availability');
      if (facts.reason !== undefined) reason(facts.reason);
      for (const participant of facts.participants) {
        if (!entry.definition.participants.includes(participant.id))
          throw new Error('Unknown objective participant');
        if (
          typeof participant.eligible !== 'boolean' ||
          !['working', 'blocked', 'interrupted', 'idle'].includes(participant.status)
        )
          throw new Error('Invalid participant work facts');
        if (participant.reason !== undefined) reason(participant.reason);
      }
    }
    for (const disruption of batch.disruptions ?? []) {
      this.require(disruption.objectiveId);
      reason(disruption.reason);
    }
    const dependencies = new Set(
      [...this.objectives.values()].flatMap((entry) => entry.definition.dependencies),
    );
    for (const invalidation of batch.invalidatedDependencies ?? []) {
      if (!dependencies.has(invalidation.dependencyId))
        throw new Error('Unknown objective dependency');
      reason(invalidation.reason);
    }
    const candidates = batch.contributions ?? [];
    if (candidates.length > OBJECTIVE_LIMITS.contributionsPerStep)
      throw new Error('Objective batch limit exceeded');
    for (const candidate of candidates) {
      id(candidate.id);
      id(candidate.participantId);
      this.require(candidate.objectiveId);
      bounded(candidate.amount, OBJECTIVE_LIMITS.capacity);
    }
    const added = new Set(
      candidates
        .filter((candidate) => !this.seen.has(candidate.id))
        .map((candidate) => candidate.id),
    );
    if (this.seen.size + added.size > OBJECTIVE_LIMITS.contributionIds)
      throw new Error('Objective contribution history limit exceeded');
  }

  resolveStep(input: ObjectiveStep): ObjectiveStepResult {
    const batch = projectStep(input);
    this.validate(batch);
    const result: ObjectiveStepResult = { contributions: [], outcomes: [] };
    const outcomeStart = this.outcomes.length;
    this.step = batch.step;
    for (const objectiveId of batch.discover ?? []) this.require(objectiveId).discovered = true;
    for (const objectiveId of batch.activate ?? []) {
      const entry = this.require(objectiveId);
      if (unresolved(entry)) entry.activated = true;
    }
    const facts = new Map((batch.conditions ?? []).map((item) => [item.objectiveId, item]));
    for (const entry of this.objectives.values()) {
      if (unresolved(entry)) {
        entry.conditions = facts.get(entry.definition.id) ?? this.unsampled(entry.definition.id);
        entry.conditions.participants.sort(byId);
      }
    }

    // Irreversible world changes win over this step's unfinished work. Canonical
    // reasons make multiple simultaneous invalidations independent of input order.
    for (const item of [...(batch.invalidatedDependencies ?? [])].sort(
      (a, b) => compare(a.dependencyId, b.dependencyId) || compare(a.reason, b.reason),
    )) {
      if (!this.invalidated.has(item.dependencyId))
        this.invalidated.set(item.dependencyId, item.reason);
    }
    for (const entry of this.objectives.values()) {
      if (!unresolved(entry)) continue;
      const reasons = [
        ...(batch.disruptions ?? [])
          .filter((item) => item.objectiveId === entry.definition.id)
          .map((item) => item.reason),
        ...entry.definition.dependencies.flatMap((dependency) =>
          this.invalidated.has(dependency) ? [this.invalidated.get(dependency)!] : [],
        ),
      ].sort(compare);
      if (reasons.length) {
        this.finish(entry, 'thwarted', entry.definition.outcomes.thwarted, reasons[0]);
        this.emit(
          entry.definition.outcomes.thwarted,
          'thwarted',
          [entry.definition.id],
          reasons[0],
        );
      }
    }

    const groups = new Map<string, ObjectiveContribution[]>();
    for (const candidate of batch.contributions ?? []) {
      const group = groups.get(candidate.id) ?? [];
      group.push(candidate);
      groups.set(candidate.id, group);
    }
    for (const [actionId, group] of [...groups].sort(([a], [b]) => compare(a, b))) {
      const candidate = group[0];
      if (this.seen.has(actionId)) {
        result.contributions.push({ id: actionId, status: 'duplicate', credited: 0 });
        continue;
      }
      // Even rejected/interrupted cycles are retired: a later callback cannot
      // resurrect unfinished work when conditions improve.
      this.seen.add(actionId);
      if (
        group.some(
          (other) =>
            other.objectiveId !== candidate.objectiveId ||
            other.participantId !== candidate.participantId ||
            other.amount !== candidate.amount,
        )
      ) {
        result.contributions.push({ id: actionId, status: 'conflict', credited: 0 });
        continue;
      }
      const entry = this.require(candidate.objectiveId);
      const participant = entry.conditions.participants.find(
        (item) => item.id === candidate.participantId,
      );
      const before = entry.chart.snapshot.context.progress;
      if (
        unresolved(entry) &&
        entry.activated &&
        entry.conditions.available &&
        participant?.eligible &&
        participant.status === 'working'
      )
        entry.chart.send({ type: 'CREDIT', amount: candidate.amount });
      const credited = entry.chart.snapshot.context.progress - before;
      if (credited)
        this.contributions.push({
          id: candidate.id,
          objectiveId: candidate.objectiveId,
          participantId: candidate.participantId,
          amount: candidate.amount,
          step: batch.step,
          credited,
        });
      result.contributions.push({
        id: actionId,
        status: credited ? 'accepted' : 'unavailable',
        credited,
      });
    }

    // No per-contribution completion side effects: all surviving clocks are now full/partial.
    for (const race of this.races) {
      const player = this.require(race.playerObjectiveId);
      const monster = this.require(race.monsterObjectiveId);
      const playerFull =
        unresolved(player) && player.chart.snapshot.context.progress === player.definition.capacity;
      const monsterFull =
        unresolved(monster) &&
        monster.chart.snapshot.context.progress === monster.definition.capacity;
      if (!playerFull && !monsterFull) continue;
      const kind =
        playerFull && monsterFull ? 'contested' : playerFull ? 'player-first' : 'monster-first';
      const outcomeId =
        race.outcomes[
          kind === 'contested' ? 'contested' : playerFull ? 'playerFirst' : 'monsterFirst'
        ];
      this.finish(
        player,
        kind === 'contested' ? 'contested' : playerFull ? 'completed' : 'lost',
        outcomeId,
      );
      this.finish(
        monster,
        kind === 'contested' ? 'contested' : monsterFull ? 'completed' : 'thwarted',
        outcomeId,
      );
      this.emit(outcomeId, kind, [player.definition.id, monster.definition.id]);
    }
    for (const entry of this.objectives.values()) {
      if (
        unresolved(entry) &&
        entry.chart.snapshot.context.progress === entry.definition.capacity
      ) {
        this.finish(entry, 'completed', entry.definition.outcomes.completed);
        this.emit(entry.definition.outcomes.completed, 'completed', [entry.definition.id]);
      }
    }
    result.outcomes = this.outcomes.slice(outcomeStart);
    return structuredClone(result);
  }

  private finish(
    entry: RuntimeObjective,
    status: ObjectiveTerminalStatus,
    outcomeId: string,
    reason?: string,
  ): void {
    entry.chart.send({
      type: 'RESOLVE',
      status,
      outcomeId,
      step: this.step!,
      ...(reason ? { reason } : {}),
    });
  }
  private emit(
    id: string,
    kind: ObjectiveOutcome['kind'],
    objectiveIds: string[],
    reason?: string,
  ): void {
    this.outcomes.push({
      id,
      kind,
      step: this.step!,
      objectiveIds: objectiveIds.sort(compare),
      ...(reason ? { reason } : {}),
    });
  }
  get(objectiveId: string): ObjectiveSnapshot {
    const entry = this.require(objectiveId);
    const { definition, conditions, chart } = entry;
    const status = chart.snapshot.value;
    const participants = conditions.participants.filter((participant) => participant.eligible);
    let workStatus: ObjectiveSnapshot['workStatus'];
    if (status !== 'unresolved') workStatus = status;
    else if (!entry.activated) workStatus = 'dormant';
    else if (!conditions.available) workStatus = 'unavailable';
    else
      workStatus =
        (['working', 'interrupted', 'blocked', 'idle'] as const).find((candidate) =>
          participants.some((participant) => participant.status === candidate),
        ) ?? 'blocked';
    return structuredClone({
      id: definition.id,
      owner: definition.owner,
      eligibleParticipants: definition.participants,
      dependencies: definition.dependencies,
      capacity: definition.capacity,
      progress: chart.snapshot.context.progress,
      discovered: entry.discovered,
      activated: entry.activated,
      visible: entry.discovered || (entry.activated && definition.announceOnActivation),
      available: conditions.available,
      participants: conditions.participants,
      status,
      workStatus,
      reason:
        chart.snapshot.context.resolution?.reason ??
        conditions.reason ??
        participants.find((participant) => participant.status === workStatus && participant.reason)
          ?.reason,
      resolution: chart.snapshot.context.resolution,
    });
  }
  snapshot(): ObjectiveRecordSnapshot {
    return structuredClone({
      step: this.step,
      objectives: [...this.objectives.keys()].map((objectiveId) => this.get(objectiveId)),
      contributions: this.contributions,
      outcomes: this.outcomes,
      invalidatedDependencies: [...this.invalidated]
        .sort(([a], [b]) => compare(a, b))
        .map(([dependencyId, reason]) => ({ dependencyId, reason })),
    });
  }
}
