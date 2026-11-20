import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Navigator } from './navigation.ts';
import type { Locomotion, LocomotionPose } from './locomotion.ts';
import type { Attack } from './machines/actors/attack.ts';
import type { Defense } from './machines/actors/defense.ts';
import type { Health } from './machines/actors/health.ts';
import type { MonsterBehavior, BrainState } from './machines/monsters/index.ts';
import type { SocialGroup } from './social.ts';
import type { BodySize } from './occupancy.ts';
import type { Jump } from './jump.ts';
import type { InhabitantIdentity } from './generation/inhabitants.ts';
import type { DiscoveryRecord } from './discoveries.ts';
import type { ObjectiveRecord } from './objectives.ts';
import type { ObjectiveWorkSystem, WorkSite } from './objectiveWork.ts';
import type { WorkAction } from './machines/actors/work.ts';
import type { LastEmber } from './lastEmber.ts';
import type { Tribute } from './tribute.ts';
import type { Cargo } from './cargo.ts';
import type { Statechart } from './machines/statechart.ts';
import type { focusMachine } from './machines/world/focus.ts';
import type { Creature, FloatingObject, LightSource, Portrait, Wall } from './renderTypes.ts';
import type {
  DoorEntity,
  Entity as Interaction,
  Footprint,
  Point,
  Prop,
  Room,
  Spawn,
  Tile,
} from './worldTypes.ts';

export type ActorKind = 'player' | 'skeleton' | 'goblin' | 'kobold';
export type EnemyKind = Exclude<ActorKind, 'player'>;
export interface Components {
  discoveries: DiscoveryRecord;
  objectives: ObjectiveRecord;
  objectiveWork: ObjectiveWorkSystem;
  work: WorkAction;
  workSite: WorkSite;
  lastEmber: LastEmber;
  tribute: Tribute;
  cargo: Cargo;
  focus: Statechart<typeof focusMachine>;
  transform: Spawn & { heading: number };
  actor: { kind: ActorKind; speed: number; opensDoors: boolean };
  inhabitant: InhabitantIdentity;
  body: BodySize;
  health: Health;
  movement: {
    speed: number;
    direction: Point;
    animation: Locomotion;
    actualSpeed: number;
    wantsMovement: boolean;
    velocity: Point;
    acceleration: Point;
  };
  jump: Jump;
  navigation: Navigator;
  attack: Attack;
  defense: Defense;
  brain: {
    readonly state: BrainState;
    behavior: MonsterBehavior;
    think: number;
    memory: number;
    home: Spawn;
    pack: string;
    slot: number;
    cover: Point | null;
    hideTime: number;
    social?: SocialGroup;
  };
  corpse: { age: number };
  collision: {
    move: (from: Spawn, displacement: Point) => Point;
    sync?: (position: Spawn) => void;
  };
  render: { root: TransformNode | null; meshes: AbstractMesh[] };
  rig: {
    root: TransformNode;
    body: TransformNode;
    head?: TransformNode;
    arms: TransformNode[];
    forearms: TransformNode[];
    legs: TransformNode[];
    knees: TransformNode[];
    feet: TransformNode[];
    footPlants: { anchor: Spawn | null }[];
    cape?: TransformNode;
    shield?: TransformNode;
    attackBlend: number;
    attackPose: LocomotionPose | null;
    socialBlend: number;
    socialPose: LocomotionPose | null;
    equipment?: AbstractMesh[];
  };
  tile: Tile;
  room: Room;
  prop: Prop;
  obstacle: Footprint;
  ambientMotion: Creature;
  floating: FloatingObject;
  lightSource: LightSource;
  cutaway: Wall;
  portrait: Portrait;
  interaction: Interaction;
  door: DoorEntity;
  projectile: { owner: string; vx: number; vy: number; vz: number; life: number; damage: number };
  particle: {
    kind: 'blood' | 'dust' | 'block';
    vx: number;
    vy: number;
    vz: number;
    life: number;
    duration: number;
    size: number;
  };
}

/** Components are authoritative data; entities have no gameplay behavior or inheritance. */
export class Entity {
  readonly id: string;
  private readonly components: Partial<Components> = {};
  private readonly changed: (name: keyof Components, attached: boolean) => void;
  constructor(id: string, changed: (name: keyof Components, attached: boolean) => void = () => {}) {
    this.id = id;
    this.changed = changed;
  }
  add<K extends keyof Components>(name: K, value: Components[K]): this {
    this.components[name] = value;
    this.changed(name, true);
    return this;
  }
  get<K extends keyof Components>(name: K): Components[K] | undefined {
    return this.components[name];
  }
  require<K extends keyof Components>(name: K): Components[K] {
    const value = this.get(name);
    if (value === undefined) throw new Error(`${this.id} needs component ${name}`);
    return value;
  }
  has(name: keyof Components): boolean {
    return this.components[name] !== undefined;
  }
  remove(name: keyof Components): void {
    delete this.components[name];
    this.changed(name, false);
  }
}

export class ECS {
  private readonly entities = new Map<string, Entity>();
  private serial = 0;
  private readonly index = new Map<keyof Components, Set<Entity>>();
  create(id = `transient:${this.serial++}`): Entity {
    if (this.entities.has(id)) throw new Error(`Duplicate entity: ${id}`);
    const entity = new Entity(id, (name, attached) => {
      let set = this.index.get(name);
      if (!set) {
        set = new Set();
        this.index.set(name, set);
      }
      if (attached && this.entities.get(id) === entity) set.add(entity);
      else set.delete(entity);
    });
    this.entities.set(id, entity);
    return entity;
  }
  get(id: string): Entity | undefined {
    return this.entities.get(id);
  }
  remove(id: string): void {
    const entity = this.entities.get(id);
    if (!entity) return;
    for (const set of this.index.values()) set.delete(entity);
    this.entities.delete(id);
  }
  query(...components: (keyof Components)[]): Entity[] {
    if (!components.length) return [...this.entities.values()];
    const sets = components.map((name) => this.index.get(name));
    if (sets.some((set) => !set)) return [];
    const smallest = sets.reduce((a, b) => (a!.size < b!.size ? a : b))!;
    return [...smallest].filter((entity) => components.every((name) => entity.has(name)));
  }
  get size(): number {
    return this.entities.size;
  }
}
