import { Matrix } from '@babylonjs/core/Maths/math.vector.js';
import type { Node } from '@babylonjs/core/node.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { ECS, Entity } from './ecs.ts';
import type { CorpseBox, CorpseContactQuery } from './corpseTerrain.ts';
import { corpseHeightAt } from './corpseTerrain.ts';
import type { NavigationWorld } from './navigation.ts';
import type { Spawn } from './worldTypes.ts';
import { heightAt } from './world.ts';
import { cpuTrace } from './cpuMetrics.ts';
import type { ActorGeometry } from './actorGeometry.ts';
import { SupportTiles } from './supportTiles.ts';
import type { RigBinding } from './rigs/bindings.ts';
import type { Ragdoll } from './ragdoll.ts';

// Weak keys release disposed scenes. Only changed part matrices require a new inverse.
const boxes = new WeakMap<AbstractMesh, { matrix: Matrix; floor: number; box: CorpseBox }>();

const empty: readonly CorpseBox[] = [];
const samePoint = (a: CorpseBox['min'], b: CorpseBox['min']) =>
  a.x === b.x && a.y === b.y && a.z === b.z;
function eligibleCorpse(entity: Entity): boolean {
  const ragdoll = entity.get('ragdoll');
  return ragdoll ? ragdoll.settled : entity.require('corpse').age >= 0.62;
}

function sampleBoxes(entity: Entity, previous: readonly CorpseBox[], world?: NavigationWorld) {
  let result: CorpseBox[] | undefined,
    index = 0;
  const synced = new Set<Node>();
  const sync = (node: Node): void => {
    if (synced.has(node)) return;
    if (node instanceof TransformNode && node.isWorldMatrixFrozen) {
      // Babylon honors its frozen affine unless the node has a dirty position.
      node.computeWorldMatrix();
      synced.add(node);
      return;
    }
    if (node.parent) sync(node.parent);
    // Fixed simulation steps can share one scene render ID. Bypass that early-return
    // only when Babylon reports changed local transforms or a changed parent matrix.
    if (!node.isSynchronized()) node.markAsDirty('corpse contact');
    node.computeWorldMatrix();
    synced.add(node);
  };
  for (const mesh of entity.require('render').meshes) {
    if (import.meta.env?.DEV) cpuTrace?.count('corpse.meshVisits');
    if (mesh.isDisposed() || !mesh.isEnabled() || !mesh.isVisible || mesh.visibility <= 0) continue;
    sync(mesh);
    const matrix = mesh.getWorldMatrix();
    if (import.meta.env?.DEV && world) cpuTrace?.count('corpse.supportLookups');
    const floor =
      (world ? heightAt(world, matrix.m[12], matrix.m[14]) : null) ?? entity.require('transform').h;
    let entry = boxes.get(mesh);
    const bounds = mesh.getBoundingInfo().boundingBox;
    if (
      !entry ||
      !entry.matrix.equals(matrix) ||
      entry.floor !== floor ||
      !samePoint(bounds.minimum, entry.box.min) ||
      !samePoint(bounds.maximum, entry.box.max)
    ) {
      if (import.meta.env?.DEV) cpuTrace?.count('alloc.corpseBoxes');
      // Geometry may have been reconstructed under an unchanged/frozen matrix.
      bounds._update(matrix);
      entry = {
        matrix: matrix.clone(),
        floor,
        box: {
          inverse: Matrix.Invert(matrix).m,
          min: bounds.minimum.clone(),
          max: bounds.maximum.clone(),
          worldMin: bounds.minimumWorld.clone(),
          worldMax: bounds.maximumWorld.clone(),
          floor,
        },
      };
      boxes.set(mesh, entry);
    }
    if (!result && previous[index] !== entry.box) result = previous.slice(0, index);
    result?.push(entry.box);
    index++;
  }
  return result ?? (index === previous.length ? previous : previous.slice(0, index));
}

interface Publication {
  readonly boxes: readonly CorpseBox[];
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

function aggregate(boxes: readonly CorpseBox[]): Publication {
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.worldMin.x);
    maxX = Math.max(maxX, box.worldMax.x);
    minZ = Math.min(minZ, box.worldMin.z);
    maxZ = Math.max(maxZ, box.worldMax.z);
  }
  if (import.meta.env?.DEV) cpuTrace?.count('alloc.corpseLists');
  return { boxes, minX, maxX, minZ, maxZ };
}

const emptyPublication = aggregate(empty);

const cell = (v: number) => Math.floor(v / 2);
const cellKey = (x: number, z: number) => `${x},${z}`;

function indexPublications(entries: Iterable<PublishedCorpse>): CorpseContactQuery {
  const cells = new Map<string, Publication[]>();
  for (const { publication: p } of entries)
    for (let x = cell(p.minX); x <= cell(p.maxX); x++)
      for (let z = cell(p.minZ); z <= cell(p.maxZ); z++) {
        const key = cellKey(x, z);
        const list = cells.get(key);
        if (list) list.push(p);
        else cells.set(key, [p]);
      }
  return {
    empty: cells.size === 0,
    heightAt(point: Spawn) {
      let height = 0;
      for (const p of cells.get(cellKey(cell(point.x), cell(point.z))) ?? []) {
        if (import.meta.env?.DEV) cpuTrace?.count('corpse.aggregateVisits');
        if (point.x < p.minX || point.x > p.maxX || point.z < p.minZ || point.z > p.maxZ) continue;
        if (import.meta.env?.DEV) cpuTrace?.count('corpse.probeBoxVisits', p.boxes.length);
        height = Math.max(height, corpseHeightAt(p.boxes, point));
      }
      return height;
    },
  };
}

interface PublishedCorpse {
  stamp: number;
  publication: Publication;
  certified?: {
    geometry: ActorGeometry;
    geometryRevision: number;
    rootEnabled: boolean;
    binding: RigBinding;
    ragdoll: Ragdoll;
    poseRevision: number;
    support: SupportTiles;
    supportRevision: number;
    floor: number;
  };
}

class CorpsePublications {
  private readonly entries = new Map<Entity, PublishedCorpse>();
  private step = 0;
  private changed = true;
  private query?: CorpseContactQuery;
  private exhaustive?: readonly CorpseBox[];

  update(ecs: ECS, world?: NavigationWorld, production = false) {
    this.step++;
    const support = production && world?.tiles instanceof SupportTiles ? world.tiles : undefined;
    for (const entity of ecs.query('corpse', 'transform', 'render')) {
      if (!eligibleCorpse(entity)) continue;
      const render = entity.require('render');
      if (render.root?.isDisposed()) continue;
      let entry = this.entries.get(entity);
      if (!entry) {
        entry = { stamp: 0, publication: emptyPublication };
        this.entries.set(entity, entry);
      }
      entry.stamp = this.step;
      const binding = support && entity.get('rigPose');
      const ragdoll = binding && entity.get('ragdoll');
      const poseRevision = ragdoll && binding?.settledPoseRevision(ragdoll);
      const geometry = poseRevision !== undefined && binding?.certifiedGeometry();
      if (geometry && support && binding && ragdoll && poseRevision !== undefined && render.root) {
        const floor = entity.require('transform').h;
        const rootEnabled = render.root.isEnabled();
        const previous = entry.certified;
        if (
          previous?.geometry === geometry &&
          previous.geometryRevision === geometry.revision &&
          previous.binding === binding &&
          previous.ragdoll === ragdoll &&
          previous.poseRevision === poseRevision &&
          previous.rootEnabled === rootEnabled &&
          previous.support === support &&
          previous.supportRevision === support.revision &&
          previous.floor === floor
        )
          continue;
        entry.certified = {
          geometry,
          geometryRevision: geometry.revision,
          rootEnabled,
          binding,
          ragdoll,
          poseRevision,
          support,
          supportRevision: support.revision,
          floor,
        };
      } else entry.certified = undefined;
      // Open ancestor paths, unowned components, mutable worlds and nonphysical collapse scan live.
      const result = sampleBoxes(entity, entry.publication.boxes, world);
      if (result !== entry.publication.boxes) {
        entry.publication = aggregate(result);
        this.changed = true;
      }
    }
    for (const [entity, entry] of this.entries)
      if (entry.stamp !== this.step) {
        this.entries.delete(entity);
        this.changed = true;
      }
    if (this.changed) {
      this.query = this.exhaustive = undefined;
      this.changed = false;
    }
  }

  contacts() {
    return (this.query ??= indexPublications(this.entries.values()));
  }

  all() {
    return (this.exhaustive ??= [...this.entries.values()].flatMap(
      (entry) => entry.publication.boxes,
    ));
  }
}

const contacts = new WeakMap<ECS, CorpsePublications>();
const audits = new WeakMap<ECS, { world?: NavigationWorld; owner: CorpsePublications }>();

/** After death writes, before living feet. */
export function publishCorpseContacts(ecs: ECS, world?: NavigationWorld): CorpseContactQuery {
  let owner = contacts.get(ecs);
  if (!owner) contacts.set(ecs, (owner = new CorpsePublications()));
  owner.update(ecs, world, true);
  return owner.contacts();
}

/** Exhaustive read for inspection and independent comparison with the point index. */
export function readCorpseTerrain(ecs: ECS, world?: NavigationWorld): readonly CorpseBox[] {
  let audit = audits.get(ecs);
  if (!audit || audit.world !== world)
    audits.set(ecs, (audit = { world, owner: new CorpsePublications() }));
  audit.owner.update(ecs, world);
  return audit.owner.all();
}
