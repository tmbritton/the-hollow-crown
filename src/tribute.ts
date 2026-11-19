import { Actor, cancelWork } from './actors.ts';
import type { ECS, Entity } from './ecs.ts';
import type { World } from './worldTypes.ts';
import { tileAt } from './world.ts';
import { Cargo } from './cargo.ts';
import { TRIBUTE, tributeBlueprint } from './generation/tribute.ts';
import type { ObjectivePlan } from './objectives.ts';
import type { ObjectiveWorkBinding } from './objectiveWork.ts';
import type { AgendaClock } from './lastEmber.ts';
export { TRIBUTE, tributeBlueprint } from './generation/tribute.ts';

export class Tribute {
  readonly sites: ReturnType<typeof tributeBlueprint>;
  readonly cargo: Entity[];
  private readonly ecs: ECS;
  private readonly world: World;
  private readonly player: Actor;
  private readonly roster: Entity[];
  constructor(ecs: ECS, world: World, player: Actor) {
    this.ecs = ecs;
    this.world = world;
    this.player = player;
    this.sites = tributeBlueprint(world);
    this.roster = this.sites.workers.map((id) => {
      const entity = ecs.get(id);
      if (!entity) throw new Error('Tribute needs the existing stairs kobold pack');
      return entity;
    });
    this.cargo = this.sites.cargo.map((p) =>
      ecs
        .create(p.id)
        .add('cargo', new Cargo())
        .add('transform', { ...p, heading: 0 })
        .add('workSite', { approach: { x: p.x, z: p.z, h: p.h }, radius: 0.45, enabled: true }),
    );
    ecs
      .create(TRIBUTE.exit)
      .add('workSite', { approach: { ...this.sites.exit }, radius: 0.45, enabled: true });
  }
  private get run() {
    return this.ecs.get('run')!;
  }
  private get work() {
    return this.run.require('objectiveWork');
  }
  get clock() {
    return this.run.require('objectives').get(TRIBUTE.objective);
  }
  get recovered() {
    return this.cargo.filter((e) => e.require('cargo').state === 'recovered').length;
  }
  get hasWorkers() {
    return this.roster.some((e) => this.ecs.get(e.id) === e && new Actor(e).alive);
  }
  activate(): boolean {
    if (this.run.get('tribute') !== this || !this.run.has('objectiveWork')) return false;
    if (this.clock.activated) return false;
    this.work.activate(TRIBUTE.objective);
    return true;
  }
  approachActivation(): boolean {
    const ember = this.run.require('lastEmber'),
      p = this.player.position,
      s = ember.sites.shrine.approach;
    return (
      (Math.hypot(p.x - s.x, p.z - s.z) < 4 ||
        ['smithy', 'stairs', 'stable'].includes(tileAt(this.world, p.x, p.z)?.room ?? '')) &&
      this.activate()
    );
  }
  /** One porter at a time. Surviving declared pack members take over loose cargo by
   * travelling to it; no replacement spawn or instantaneous transfer on worker death. */
  update(): void {
    if (
      this.run.get('tribute') !== this ||
      !this.run.has('objectiveWork') ||
      !this.clock.activated ||
      this.clock.status !== 'unresolved'
    )
      return;
    for (const entity of this.roster)
      if (
        entity.get('work')?.objectiveId === TRIBUTE.objective &&
        !this.cargo.some((e) => e.require('cargo').owner === entity)
      )
        cancelWork(new Actor(entity));
    const owned = this.cargo.find((e) => e.require('cargo').owner);
    if (owned) {
      const owner = owned.require('cargo').owner!;
      if (this.ecs.get(owner.id) === owner) this.work.assign(new Actor(owner), TRIBUTE.objective);
      return;
    }
    const item = this.cargo.find((e) => e.require('cargo').state === 'loose');
    if (!item) return;
    const actor = this.roster.find(
      (e) => this.ecs.get(e.id) === e && new Actor(e).alive && !e.has('work'),
    );
    if (actor && item.require('cargo').claim(actor))
      this.work.assign(new Actor(actor), TRIBUTE.objective);
  }
  nearby(): Entity | undefined {
    if (
      !this.player.alive ||
      this.player.jump.active ||
      this.run.get('tribute') !== this ||
      !this.run.has('objectiveWork')
    )
      return;
    const p = this.player.position;
    return this.cargo.find((e) => {
      const c = e.require('cargo'),
        at = e.require('workSite').approach;
      return (
        (c.state === 'loose' || c.state === 'claimed') &&
        Math.hypot(p.x - at.x, p.z - at.z) < 1.1 &&
        Math.abs(p.h - at.h) < 0.3 &&
        this.player.navigator.segmentClear(p, at, false)
      );
    });
  }
  recover(): boolean {
    const item = this.nearby();
    if (!item?.require('cargo').recover()) return false;
    this.player.health.current = Math.min(100, this.player.health.current + 10);
    return true;
  }
  agenda(): AgendaClock[] {
    const o = this.clock;
    if (!o.visible) return [];
    return [
      {
        id: o.id,
        title: 'Carry away the royal tribute',
        owner: 'Kobold porters',
        progress: o.progress,
        capacity: o.capacity,
        status:
          o.status === 'unresolved'
            ? o.workStatus === 'blocked' || o.workStatus === 'unavailable'
              ? 'blocked'
              : o.workStatus === 'working'
                ? 'working'
                : 'interrupted'
            : o.status,
        detail:
          o.status === 'completed'
            ? 'All four crates escaped through the stable hatch. Delivered tribute is lost.'
            : o.status === 'thwarted'
              ? `${o.progress} delivered; ${this.recovered} recovered. Further deliveries are thwarted.`
              : `Stairs cache → stable hatch · four crates. Intercept porters; E recovers loose cargo (+10 health). ${this.recovered} recovered.`,
      },
    ];
  }
}

export function prepareTribute(ecs: ECS, world: World, player: Actor) {
  const scenario = new Tribute(ecs, world, player);
  ecs.get('run')!.add('tribute', scenario);
  const plan: ObjectivePlan = {
    objectives: [
      {
        id: TRIBUTE.objective,
        owner: { kind: 'group', id: 'pack:stairs' },
        participants: scenario.sites.workers,
        capacity: 4,
        announceOnActivation: true,
        dependencies: [],
        outcomes: { completed: 'tribute:escaped', thwarted: 'tribute:thwarted' },
      },
    ],
    races: [],
  };
  const bindings: ObjectiveWorkBinding[] = [
    {
      objectiveId: TRIBUTE.objective,
      siteId: TRIBUTE.exit,
      duration: TRIBUTE.deliverySeconds,
      availability: () => ({
        available: true,
        thwarted: !scenario.hasWorkers
          ? 'No surviving executor'
          : scenario.cargo.every((e) =>
                ['delivered', 'recovered'].includes(String(e.require('cargo').state)),
              ) && scenario.recovered > 0
            ? 'All remaining cargo denied'
            : undefined,
      }),
      task: (actor) => {
        const item = scenario.cargo.find((e) => e.require('cargo').owner === actor);
        if (!item) return null;
        const pickup = item.require('cargo').state === 'claimed';
        return {
          siteId: pickup ? item.id : TRIBUTE.exit,
          duration: pickup ? TRIBUTE.pickupSeconds : TRIBUTE.deliverySeconds,
          cargo: { id: item.id, operation: pickup ? 'pickup' : 'deliver' },
        };
      },
    },
  ];
  return { scenario, plan, bindings };
}
