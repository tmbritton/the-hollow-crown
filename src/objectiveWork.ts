import { Actor, cancelWork } from './actors.ts';
import type { ECS, Entity } from './ecs.ts';
import type { NavigationWorld } from './navigation.ts';
import { heightAt } from './world.ts';
import { clearSight } from './combat.ts';
import { ObjectiveRecord } from './objectives.ts';
import type {
  ObjectiveConditions,
  ObjectiveParticipant,
  ObjectivePlan,
  ObjectiveStepResult,
} from './objectives.ts';
import { WorkAction, WORK_UNITS_PER_SECOND } from './machines/actors/work.ts';
import type { Spawn } from './worldTypes.ts';

export interface WorkSite {
  /** Reachable floor in front of the real prop/interaction, never its solid center. */
  approach: Spawn;
  radius: number;
  enabled: boolean;
}
export interface WorkAvailability {
  available: boolean;
  reason?: string;
  /** Authoritative resource/method identity. A change cancels the current cycle. */
  revision?: string | number;
}
export interface ObjectiveWorkBinding {
  objectiveId: string;
  siteId: string;
  duration: number;
  amount?: number;
  /** Read current ECS/world/knowledge facts; must be side-effect free. */
  availability?: () => WorkAvailability;
}
interface Sample {
  participant: ObjectiveParticipant;
  position: Spawn;
  site: Entity | undefined;
  approach: Spawn | undefined;
  dependencies: (Entity | undefined)[];
  revision: WorkAvailability['revision'];
}
interface Pending {
  actor: Entity;
  work: WorkAction;
  cycleId: string;
  sample: Sample;
}
const samePoint = (a: Spawn, b: Spawn) => a.x === b.x && a.z === b.z && a.h === b.h;
const actorComponents = [
  'actor',
  'transform',
  'health',
  'movement',
  'navigation',
  'attack',
  'jump',
] as const;

/** Run-owned physical adapter. Only this system submits physical contributions; no completion
 * callbacks/timers are exposed. The caller brackets movement/combat/hazards with advance/commit. */
export class ObjectiveWorkSystem {
  private readonly ecs: ECS;
  private readonly world: NavigationWorld;
  private readonly run: Entity;
  private readonly record: ObjectiveRecord;
  private readonly bindings: Map<string, ObjectiveWorkBinding>;
  private readonly anchors = new WeakMap<WorkAction, Sample>();
  private readonly activations = new Set<string>();
  private readonly discoveries = new Set<string>();
  private serial = 0;
  private lastStep = -1;
  private pending: { step: number; cycles: Pending[] } | null = null;

  constructor(
    ecs: ECS,
    world: NavigationWorld,
    run: Entity,
    record: ObjectiveRecord,
    bindings: ObjectiveWorkBinding[],
  ) {
    this.ecs = ecs;
    this.world = world;
    this.run = run;
    this.record = record;
    this.bindings = new Map();
    for (const binding of bindings) {
      record.get(binding.objectiveId);
      if (
        this.bindings.has(binding.objectiveId) ||
        !binding.siteId.trim() ||
        !Number.isFinite(binding.duration * WORK_UNITS_PER_SECOND) ||
        binding.duration <= 0 ||
        !Number.isSafeInteger(binding.amount ?? 1) ||
        (binding.amount ?? 1) < 1 ||
        (binding.amount ?? 1) > 64
      )
        throw new Error('Invalid objective work binding');
      this.bindings.set(binding.objectiveId, {
        objectiveId: binding.objectiveId,
        siteId: binding.siteId,
        duration: binding.duration,
        amount: binding.amount ?? 1,
        availability: binding.availability,
      });
    }
    if (this.bindings.size !== record.snapshot().objectives.length)
      throw new Error('Every physical objective needs one work binding');
  }
  private current(): void {
    if (
      this.ecs.get('run') !== this.run ||
      this.run.get('objectiveWork') !== this ||
      this.run.get('objectives') !== this.record
    )
      throw new Error('Retired objective work run');
  }
  activate(...ids: string[]): void {
    this.current();
    ids.forEach((id) => this.record.get(id));
    ids.forEach((id) => this.activations.add(id));
  }
  discover(...ids: string[]): void {
    this.current();
    ids.forEach((id) => this.record.get(id));
    ids.forEach((id) => this.discoveries.add(id));
  }
  /** Retire before discarding an ECS/scene so retained callbacks cannot advance the old run. */
  retire(): void {
    if (this.run.get('objectiveWork') !== this) return;
    for (const entity of this.ecs.query('work')) cancelWork(new Actor(entity));
    this.run.remove('objectiveWork');
    this.pending = null;
    this.activations.clear();
    this.discoveries.clear();
  }
  assign(actor: Actor, objectiveId: string): boolean {
    this.current();
    const objective = this.record.get(objectiveId);
    if (
      this.ecs.get(actor.id) !== actor.entity ||
      !actor.alive ||
      actor.entity.has('work') ||
      objective.status !== 'unresolved' ||
      !objective.eligibleParticipants.includes(actor.id)
    )
      return false;
    actor.entity.add('work', new WorkAction(actor.entity, objectiveId));
    return true;
  }
  private actor(id: string): Actor | undefined {
    const entity = this.ecs.get(id);
    return entity && actorComponents.every((name) => entity.has(name))
      ? new Actor(entity)
      : undefined;
  }
  private availability(binding: ObjectiveWorkBinding): WorkAvailability {
    const value = binding.availability?.() ?? { available: true };
    if (
      typeof value.available !== 'boolean' ||
      (value.reason !== undefined && !value.reason.trim()) ||
      (value.revision !== undefined &&
        typeof value.revision !== 'string' &&
        (typeof value.revision !== 'number' || !Number.isFinite(value.revision)))
    )
      throw new Error('Invalid work availability');
    return { available: value.available, reason: value.reason, revision: value.revision };
  }
  private sample(
    actor: Actor,
    binding: ObjectiveWorkBinding,
    availability: WorkAvailability,
  ): Sample {
    const objective = this.record.get(binding.objectiveId);
    const site = this.ecs.get(binding.siteId),
      location = site?.get('workSite');
    const sample: Sample = {
      participant: { id: actor.id, eligible: actor.alive, status: 'working' },
      position: { x: actor.position.x, z: actor.position.z, h: actor.position.h },
      site,
      approach: location ? { ...location.approach } : undefined,
      dependencies: objective.dependencies.map((id) => this.ecs.get(id)),
      revision: availability.revision,
    };
    const deny = (status: 'blocked' | 'interrupted', reason: string) => {
      sample.participant.status = status;
      sample.participant.reason = reason;
      return sample;
    };
    if (!actor.alive) return deny('interrupted', 'Executor is dead');
    if (actor.attack.target || actor.attack.swing || actor.attack.interaction)
      return deny('interrupted', 'Executor is engaged');
    if (
      actor.jump.active ||
      actor.motion.wantsMovement ||
      actor.navigator.active ||
      actor.motion.speed > 1e-5 ||
      actor.motion.actualSpeed > 1e-5 ||
      Math.hypot(actor.motion.velocity.x, actor.motion.velocity.z) > 1e-5
    )
      return deny('interrupted', 'Executor is moving or airborne');
    if (!availability.available)
      return deny('blocked', availability.reason ?? 'Prerequisites unavailable');
    if (sample.dependencies.some((entity) => this.dependencyLost(entity)))
      return deny('blocked', 'Essential dependency lost');
    if (
      !location?.enabled ||
      !Number.isFinite(location.radius) ||
      location.radius <= 0 ||
      location.radius > 2
    )
      return deny('blocked', 'Work site unavailable');
    const p = actor.position,
      at = location.approach;
    const support = heightAt(this.world, p.x, p.z),
      siteSupport = heightAt(this.world, at.x, at.z);
    if (
      support === null ||
      siteSupport === null ||
      Math.abs(support - p.h) > 0.05 ||
      Math.abs(siteSupport - at.h) > 0.05 ||
      Math.abs(p.h - at.h) > 0.3 ||
      Math.hypot(p.x - at.x, p.z - at.z) > location.radius ||
      !actor.navigator.canOccupy(p) ||
      !actor.navigator.canOccupy(at) ||
      !actor.navigator.segmentClear(p, at, false, actor.navigator.occupancy?.bodies()) ||
      !clearSight(this.world, p, at)
    )
      return deny('blocked', 'Work site out of reach or obstructed');
    return sample;
  }
  private dependencyLost(entity: Entity | undefined): boolean {
    return (
      !entity ||
      entity.has('corpse') ||
      entity.get('health')?.current === 0 ||
      entity.get('workSite')?.enabled === false
    );
  }
  private continuous(before: Sample, after: Sample): boolean {
    return (
      after.participant.status === 'working' &&
      samePoint(before.position, after.position) &&
      before.site === after.site &&
      !!before.approach &&
      !!after.approach &&
      samePoint(before.approach, after.approach) &&
      before.revision === after.revision &&
      before.dependencies.every((entity, i) => entity === after.dependencies[i])
    );
  }
  private stall(work: WorkAction, sample: Sample): void {
    work.chart.send({
      type: sample.participant.status === 'blocked' ? 'BLOCK' : 'INTERRUPT',
      reason: sample.participant.reason ?? 'Work interrupted',
    });
  }

  advance(step: number, dt: number): void {
    this.current();
    if (
      this.pending ||
      !Number.isSafeInteger(step) ||
      step < 0 ||
      step <= this.lastStep ||
      !Number.isFinite(dt) ||
      dt <= 0
    )
      throw new Error('Invalid work step or duration');
    const availability = new Map(
      [...this.bindings].map(([id, binding]) => [id, this.availability(binding)]),
    );
    const cycles: Pending[] = [];
    for (const entity of this.ecs.query('work', ...actorComponents)) {
      const work = entity.require('work'),
        binding = this.bindings.get(work.objectiveId);
      if (!binding || !work.belongsTo(entity)) {
        cancelWork(new Actor(entity));
        continue;
      }
      const objective = this.record.get(work.objectiveId);
      if (objective.status !== 'unresolved') {
        cancelWork(new Actor(entity));
        continue;
      }
      const actor = new Actor(entity),
        sample = this.sample(actor, binding, availability.get(work.objectiveId)!);
      if (!objective.activated || sample.participant.status !== 'working') {
        this.stall(work, sample);
        continue;
      }
      const anchor = this.anchors.get(work);
      if (work.snapshot().cycleId && anchor && !this.continuous(anchor, sample)) {
        work.interrupt('Work conditions changed');
      }
      if (!work.snapshot().cycleId) {
        work.chart.send({ type: 'START', id: `work:${++this.serial}`, duration: binding.duration });
        this.anchors.set(work, sample);
      }
      work.chart.send({ type: 'TICK', dt });
      cycles.push({ actor: entity, work, cycleId: work.snapshot().cycleId!, sample });
    }
    this.pending = { step, cycles };
  }

  /** COMMIT BOUNDARY: call after all movement, combat/projectiles and terrain damage,
   * before respawn or presentation. Even partial cycles are revalidated here. */
  commit(step: number): ObjectiveStepResult {
    this.current();
    if (!this.pending || this.pending.step !== step)
      throw new Error('Mismatched work commit boundary step');
    const availability = new Map(
      [...this.bindings].map(([id, binding]) => [id, this.availability(binding)]),
    );
    const contributions = [];
    for (const pending of this.pending.cycles) {
      const { actor: entity, work, cycleId } = pending;
      const actor = this.actor(entity.id);
      if (!actor || actor.entity !== entity || entity.get('work') !== work) {
        work.chart.send({ type: 'CANCEL' });
        continue;
      }
      if (work.snapshot().cycleId !== cycleId) continue;
      const binding = this.bindings.get(work.objectiveId)!;
      const sample = this.sample(actor, binding, availability.get(work.objectiveId)!);
      if (!this.continuous(pending.sample, sample)) {
        this.stall(work, sample);
        continue;
      }
      if (work.snapshot().status === 'ready')
        contributions.push({
          id: cycleId,
          objectiveId: work.objectiveId,
          participantId: entity.id,
          amount: binding.amount!,
        });
    }
    const conditions: ObjectiveConditions[] = [];
    const disruptions = [];
    const invalidatedDependencies = new Map<string, string>();
    for (const [id, binding] of this.bindings) {
      const objective = this.record.get(id),
        gate = availability.get(id)!;
      const participants = objective.eligibleParticipants.map((id): ObjectiveParticipant => {
        const actor = this.actor(id);
        if (!actor) return { id, eligible: false, status: 'blocked', reason: 'Executor missing' };
        const sample = this.sample(actor, binding, gate),
          work = actor.entity.get('work');
        if (sample.participant.status !== 'working') return sample.participant;
        if (!work || work.objectiveId !== binding.objectiveId || !work.belongsTo(actor.entity))
          return { id, eligible: true, status: 'idle' };
        const state = work.snapshot();
        return {
          id,
          eligible: true,
          status: state.status === 'ready' ? 'working' : state.status,
          ...(state.reason ? { reason: state.reason } : {}),
        };
      });
      conditions.push({
        objectiveId: id,
        available: gate.available,
        reason: gate.reason,
        participants,
      });
      if (
        objective.owner.kind !== 'player' &&
        objective.eligibleParticipants.every((id) => !this.actor(id)?.alive)
      )
        disruptions.push({ objectiveId: id, reason: 'No surviving executor' });
      for (const dependency of objective.dependencies)
        if (this.dependencyLost(this.ecs.get(dependency)))
          invalidatedDependencies.set(dependency, 'Essential dependency lost');
    }
    const result = this.record.resolveStep({
      step,
      activate: [...this.activations],
      discover: [...this.discoveries],
      conditions,
      contributions,
      disruptions,
      invalidatedDependencies: [...invalidatedDependencies].map(([dependencyId, reason]) => ({
        dependencyId,
        reason,
      })),
    });
    for (const { work } of this.pending.cycles) work.chart.send({ type: 'SETTLE' });
    for (const entity of this.ecs.query('work'))
      if (this.record.get(entity.require('work').objectiveId).status !== 'unresolved')
        cancelWork(new Actor(entity));
    this.activations.clear();
    this.discoveries.clear();
    this.lastStep = step;
    this.pending = null;
    return result;
  }
}

/** Scenario installation replaces the run record atomically; ordinary O2 worlds install no
 * artificial clock. O3 authors bindings on real reserved work faces and assigns its executors. */
export function installObjectiveWork(
  ecs: ECS,
  world: NavigationWorld,
  plan: ObjectivePlan,
  bindings: ObjectiveWorkBinding[],
): ObjectiveWorkSystem {
  const run = ecs.get('run');
  if (!run) throw new Error('Objective work needs a run entity');
  const record = new ObjectiveRecord(plan);
  const system = new ObjectiveWorkSystem(ecs, world, run, record, bindings);
  run.get('objectiveWork')?.retire();
  for (const entity of ecs.query('work')) cancelWork(new Actor(entity));
  run.add('objectives', record).add('objectiveWork', system);
  return system;
}
