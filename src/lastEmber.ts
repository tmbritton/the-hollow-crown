import { Actor, stopActor } from './actors.ts';
import type { ECS } from './ecs.ts';
import { EMBER, emberBlueprint } from './generation/lastEmber.ts';
import type { World } from './worldTypes.ts';
import { tileAt } from './world.ts';
import type { DiscoveryEvidence } from './discoveries.ts';
import type { ObjectiveOutcome, ObjectivePlan } from './objectives.ts';
import { Statechart } from './machines/statechart.ts';
import { focusMachine } from './machines/world/focus.ts';
import type { ObjectiveWorkBinding } from './objectiveWork.ts';
export { EMBER, emberBlueprint } from './generation/lastEmber.ts';

export function emberClue(world: World): DiscoveryEvidence {
  return {
    id: EMBER.rite,
    kind: 'landmark',
    subjectId: emberBlueprint(world).clue.id,
    title: 'The Last Ember · old rite',
    description:
      'An inscription beneath the royal portrait: “Pair the breaths; kindle two seals together.” At the entrance shrine, each six-second restoration now restores two of its six seals. The smithy anvil holds the hostile focus; disabling it stops profanation.',
    factIds: [EMBER.rite],
  };
}

export interface AgendaClock {
  id: string;
  title: string;
  owner: string;
  progress: number;
  capacity: number;
  status: string;
  detail: string;
}

/** Scenario component. Lifecycles belong to O1/O2 charts; world state is derived from them.
 * The effect ledger only prevents replaying emitted rewards, never decides a race. */
export class LastEmber {
  readonly sites: ReturnType<typeof emberBlueprint>;
  private readonly ecs: ECS;
  private readonly world: World;
  private readonly player: Actor;
  private readonly consumed = new Set<string>();
  private rewardTotal = 0;
  constructor(ecs: ECS, world: World, player: Actor) {
    this.ecs = ecs;
    this.world = world;
    this.player = player;
    this.sites = emberBlueprint(world);
  }
  private get run() {
    return this.ecs.get('run')!;
  }
  private get record() {
    return this.run.require('objectives');
  }
  private get work() {
    return this.run.require('objectiveWork');
  }
  get reward() {
    return this.rewardTotal;
  }
  get focusEnabled() {
    return this.ecs.get(this.sites.focus.sourceId)?.get('workSite')?.enabled ?? false;
  }
  get state():
    | 'dormant'
    | 'active'
    | 'restored'
    | 'corrupted'
    | 'fractured'
    | 'cleansed'
    | 'repaired' {
    if (this.record.get(EMBER.cleanse).status === 'completed') return 'cleansed';
    if (this.record.get(EMBER.repair).status === 'completed') return 'repaired';
    const restoration = this.record.get(EMBER.restore);
    if (restoration.status === 'completed') return 'restored';
    if (restoration.status === 'lost') return 'corrupted';
    if (restoration.status === 'contested') return 'fractured';
    return restoration.activated ? 'active' : 'dormant';
  }
  /** Player sees the regional warning on approaching the shrine or entering the smithy. */
  activate(): boolean {
    if (this.record.get(EMBER.restore).activated) return false;
    this.work.activate(EMBER.restore, EMBER.profane);
    this.work.discover(EMBER.restore);
    const entity = this.ecs.get(EMBER.worker);
    if (entity) this.work.assign(new Actor(entity), EMBER.profane);
    return true;
  }
  approachActivation(): boolean {
    const p = this.player.position,
      s = this.sites.shrine.approach;
    return (
      (Math.hypot(p.x - s.x, p.z - s.z) < 4 || tileAt(this.world, p.x, p.z)?.room === 'smithy') &&
      this.activate()
    );
  }
  nearby(): 'shrine' | 'focus' | null {
    for (const kind of ['shrine', 'focus'] as const) {
      const site = this.sites[kind].approach,
        p = this.player.position;
      if (
        Math.hypot(p.x - site.x, p.z - site.z) < 1.1 &&
        Math.abs(p.h - site.h) < 0.3 &&
        this.player.navigator.segmentClear(p, site, false)
      )
        return kind;
    }
    return null;
  }
  startHero(): boolean {
    if (this.nearby() !== 'shrine' || !this.player.alive) return false;
    const state = this.state;
    const id =
      state === 'dormant' || state === 'active'
        ? EMBER.restore
        : !this.focusEnabled && state === 'corrupted'
          ? EMBER.cleanse
          : !this.focusEnabled && state === 'fractured'
            ? EMBER.repair
            : null;
    if (!id) return false;
    stopActor(this.player);
    this.activate();
    this.work.activate(id);
    this.work.discover(id);
    const p = this.player.position,
      at = this.sites.shrine.approach;
    if (Math.hypot(p.x - at.x, p.z - at.z) > 0.4) this.player.navigator.goTo(p, at);
    this.player.position.heading = Math.atan2(this.sites.shrine.x - p.x, this.sites.shrine.z - p.z);
    return this.work.assign(this.player, id);
  }
  disableFocus(): boolean {
    if (this.nearby() !== 'focus' || !this.focusEnabled || !this.player.alive) return false;
    this.ecs.get(this.sites.focus.sourceId)!.require('focus').send({ type: 'DISABLE' });
    return true;
  }
  prompt(kind: 'shrine' | 'focus'): string {
    if (kind === 'focus')
      return this.focusEnabled ? 'Disable the profaning focus' : 'Focus disabled';
    if (this.state === 'restored' || this.state === 'cleansed' || this.state === 'repaired')
      return `Last Ember · ${this.state}`;
    if (this.state === 'corrupted' || this.state === 'fractured')
      return this.focusEnabled
        ? 'Disable the smithy focus before recovery'
        : this.state === 'corrupted'
          ? 'Cleanse the spent ember (6 seconds)'
          : 'Repair the fractured ward (6 seconds)';
    return 'Restore the Last Ember · E to work, X to stop';
  }
  shrineEvidence(): DiscoveryEvidence {
    const text = {
      dormant:
        'Six seals surround the Last Ember. Restoring them prevents profanation. The entrance portrait preserves its old rite.',
      active:
        'The Last Ember waits for six restored seals. The hostile focus is on the smithy anvil; disabling it prevents profanation.',
      restored:
        'You restored the Last Ember and received its blessing (+30 health once). Profanation can no longer finish.',
      corrupted:
        'The Last Ember is corrupted. Its original restoration is lost. Disabling the smithy focus permits one lesser cleansing.',
      fractured:
        'The ward is fractured, neither restored nor corrupted. Disabling the smithy focus permits one repair.',
      cleansed:
        'You cleansed the spent ember (+10 health once). The original restoration remains lost.',
      repaired:
        'You repaired the fractured ward (+15 health once). Neither side won the original contest.',
    };
    return {
      id: `ember:seen:${this.state}`,
      kind: 'landmark',
      subjectId: EMBER.shrine,
      title: `Last Ember · ${this.state}`,
      description: text[this.state],
      factIds: [],
    };
  }
  consume(outcomes: readonly ObjectiveOutcome[]): void {
    for (const outcome of outcomes) {
      if (!outcome.id.startsWith('ember:') || this.consumed.has(outcome.id)) continue;
      this.consumed.add(outcome.id);
      const reward =
        outcome.id === 'ember:restored' || outcome.id === 'ember:restore-completed'
          ? 30
          : outcome.id === 'ember:cleansed'
            ? 10
            : outcome.id === 'ember:repaired'
              ? 15
              : 0;
      this.rewardTotal += reward;
      if (reward && this.player.alive)
        this.player.health.current = Math.min(100, this.player.health.current + reward);
      if (outcome.id === 'ember:corrupted' || outcome.id === 'ember:fractured') {
        const followup = outcome.id === 'ember:corrupted' ? EMBER.cleanse : EMBER.repair;
        this.work.activate(followup);
        this.work.discover(followup);
      }
    }
  }
  agenda(workerObserved = false): AgendaClock[] {
    const knowledge = this.run.require('discoveries');
    const identity = this.ecs.get(EMBER.worker)?.get('inhabitant');
    const owner =
      identity && knowledge.hasDiscovery(identity.id)
        ? `${identity.name}, ${identity.title}`
        : 'Goblin ward-breaker';
    const labels = {
      [EMBER.profane]: [
        'Profane the Last Ember',
        'Smithy focus · 20s per seal. Completion loses restoration.',
      ],
      [EMBER.restore]: [
        'Restore the Last Ember',
        'Entrance shrine · 6s per seal; portrait teaches paired seals.',
      ],
      [EMBER.cleanse]: [
        'Cleanse the spent ember',
        'Entrance shrine · one 6s rite; lesser recovery (+10 health).',
      ],
      [EMBER.repair]: [
        'Repair the fractured ward',
        'Entrance shrine · one 6s rite; lesser recovery (+15 health).',
      ],
    };
    return Object.entries(labels).flatMap(([id, [title, detail]]) => {
      const o = this.record.get(id);
      if (!o.visible) return [];
      const hero = o.owner.kind === 'player';
      let status = o.status === 'unresolved' ? o.workStatus : o.status;
      if (status === 'idle' || status === 'dormant') status = 'interrupted';
      if (status === 'unavailable') status = 'blocked';
      // Rival clock status is the deliberate strategic grant. Its unseen cause is not.
      if (hero && o.status === 'unresolved') detail = o.reason ?? detail;
      if (
        id === EMBER.restore &&
        o.status === 'unresolved' &&
        o.workStatus === 'working' &&
        knowledge.knows(EMBER.rite)
      )
        detail = 'Entrance shrine · old rite restores two seals per 6s cycle.';
      if (!hero && o.status === 'unresolved' && status !== 'working')
        detail =
          workerObserved && o.reason
            ? o.reason.replace('Executor', 'Worker')
            : 'Work has stopped. Lure or defeat the worker, or disable the smithy focus.';
      if (o.status === 'thwarted')
        detail = hero ? 'Opportunity thwarted.' : 'Profanation can no longer finish.';
      if (!hero && o.status === 'thwarted') {
        if (o.resolution?.outcomeId === 'ember:restored')
          detail = 'Restoration prevents further profanation.';
        else if (
          o.resolution?.reason === 'Essential dependency lost' &&
          knowledge.hasDiscovery('ember:focus-disabled')
        )
          detail = 'You disabled the essential focus; profanation is thwarted.';
        else if (
          o.resolution?.reason === 'No surviving executor' &&
          identity &&
          (knowledge.hasEvent('death-witnessed', identity.id) ||
            knowledge.hasEvent('remains-found', identity.id))
        )
          detail = 'The unique worker is dead; profanation is thwarted.';
      }
      if (o.status === 'lost')
        detail =
          this.state === 'cleansed'
            ? 'Original restoration lost. Lesser cleansing completed.'
            : this.focusEnabled
              ? 'Original restoration lost. Disable the focus for lesser cleansing.'
              : 'Original restoration lost. Lesser cleansing is available at the shrine.';
      if (o.status === 'contested')
        detail =
          this.state === 'repaired'
            ? 'Contest ended in fracture. Repair completed.'
            : this.focusEnabled
              ? 'Ward fractured. Disable the focus for a finite repair.'
              : 'Ward fractured. A finite repair is available at the shrine.';
      if (o.status === 'completed')
        detail =
          id === EMBER.profane
            ? 'Profanation completed; original restoration was lost.'
            : `Resolved · ${id === EMBER.restore ? '+30' : id === EMBER.repair ? '+15' : '+10'} health once.`;
      return [
        {
          id,
          title,
          owner: hero ? 'You' : owner,
          progress: o.progress,
          capacity: o.capacity,
          status,
          detail,
        },
      ];
    });
  }
}

/** Compose this fragment with O4 BEFORE the single installObjectiveWork call. */
export function lastEmberPlan(
  ecs: ECS,
  player: Actor,
): { plan: ObjectivePlan; bindings: ObjectiveWorkBinding[] } {
  const playerClock = (id: string, capacity: number, completed: string) => ({
    id,
    owner: { kind: 'player' as const, id: player.id },
    participants: [player.id],
    capacity,
    announceOnActivation: false,
    dependencies: [],
    outcomes: { completed, thwarted: `${id}:thwarted` },
  });
  const state = () => ecs.get('run')!.require('lastEmber');
  const rite = () => ecs.get('run')!.require('discoveries').knows(EMBER.rite);
  return {
    plan: {
      objectives: [
        playerClock(EMBER.restore, 6, 'ember:restore-completed'),
        {
          id: EMBER.profane,
          owner: { kind: 'actor', id: EMBER.worker },
          participants: [EMBER.worker],
          capacity: 6,
          announceOnActivation: true,
          dependencies: [state().sites.focus.sourceId],
          outcomes: { completed: 'ember:profane-completed', thwarted: 'ember:thwarted' },
        },
        playerClock(EMBER.cleanse, 1, 'ember:cleansed'),
        playerClock(EMBER.repair, 1, 'ember:repaired'),
      ],
      races: [
        {
          id: 'ember:race',
          playerObjectiveId: EMBER.restore,
          monsterObjectiveId: EMBER.profane,
          outcomes: {
            playerFirst: 'ember:restored',
            monsterFirst: 'ember:corrupted',
            contested: 'ember:fractured',
          },
        },
      ],
    },
    bindings: [
      {
        objectiveId: EMBER.restore,
        siteId: state().sites.shrine.sourceId,
        duration: 6,
        availability: () => ({
          available: true,
          revision: rite() ? 'paired' : 'ordinary',
          amount: rite() ? 2 : 1,
        }),
      },
      { objectiveId: EMBER.profane, siteId: state().sites.focus.sourceId, duration: 20 },
      ...(
        [
          ['corrupted', EMBER.cleanse],
          ['fractured', EMBER.repair],
        ] as const
      ).map(([expected, objectiveId]) => ({
        objectiveId,
        siteId: state().sites.shrine.sourceId,
        duration: 6,
        availability: () => ({
          available: state().state === expected && !state().focusEnabled,
          reason: state().focusEnabled
            ? 'Disable the smithy focus first.'
            : state().state !== expected
              ? 'Recovery requires the original race outcome.'
              : undefined,
        }),
      })),
    ],
  };
}

export function prepareLastEmber(ecs: ECS, world: World, player: Actor) {
  const ember = new LastEmber(ecs, world, player);
  for (const site of [ember.sites.shrine, ember.sites.focus])
    ecs.get(site.sourceId)!.add('workSite', {
      approach: { ...site.approach },
      radius: 0.45,
      enabled: true,
      facing: Math.atan2(site.x - site.approach.x, site.z - site.approach.z),
    });
  const focus = new Statechart(focusMachine);
  ecs.get(ember.sites.focus.sourceId)!.add('focus', focus);
  Object.defineProperty(ecs.get(ember.sites.focus.sourceId)!.require('workSite'), 'enabled', {
    enumerable: true,
    get: () => focus.snapshot.matches('enabled'),
  });
  const worker = ecs.get(EMBER.worker);
  if (!worker) throw new Error('Last Ember needs the existing smithy goblin');
  ecs.get('run')!.add('lastEmber', ember);
  return { scenario: ember, ...lastEmberPlan(ecs, player) };
}
