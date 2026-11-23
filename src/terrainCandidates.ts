import { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js';
import { DefaultCollisionCoordinator } from '@babylonjs/core/Collisions/collisionCoordinator.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { BoundsGrid, indexable } from './collisionCandidates.ts';
import type { Bounds, LookupWork } from './collisionCandidates.ts';

type Fallback = 'unknown collider' | 'unsupported sweep' | 'unsupported bounds';
const owners = new WeakMap<Scene, TerrainCandidates>();
export const collisionTerrain = (scene: Scene) => owners.get(scene);

export class TerrainCandidates {
  fullScan = false;
  diagnostics?: LookupWork & {
    candidates: number[];
    fallbacks: Fallback[];
    lookupMs: number;
    maintenanceMs: number;
    sceneVisits: number;
    foreignVisits: number;
    builds: number;
    sweepMs: number;
    contacts: number;
    last?: { bounds: Bounds; ordered: number[] };
  };
  private readonly scene: Scene;
  private readonly grid = new BoundsGrid<AbstractMesh>();
  private readonly colliders = new Map<
    AbstractMesh,
    { order: number; detach(): void; bounds?: Bounds }
  >();
  private readonly decoration = new Set<AbstractMesh>();
  private readonly foreign = new Set<AbstractMesh>();
  private readonly unsupported = new Set<AbstractMesh>();
  private nextOrder = 0;

  constructor(
    scene: Scene,
    colliders: readonly AbstractMesh[],
    decoration: readonly AbstractMesh[] = [],
  ) {
    this.scene = scene;
    owners.set(scene, this);
    const order = new Map(scene.meshes.map((mesh, i) => [mesh, i]));
    for (const mesh of colliders) {
      const index = order.get(mesh);
      if (index !== undefined) this.attach(mesh, index);
    }
    this.nextOrder = scene.meshes.length;
    for (const mesh of decoration)
      if (order.has(mesh) && !mesh.checkCollisions && !this.colliders.has(mesh))
        this.decoration.add(mesh);
    const removal = scene.onMeshRemovedObservable.add((mesh) => {
      this.colliders.get(mesh)?.detach();
      this.colliders.delete(mesh);
      this.grid.delete(mesh);
      this.foreign.delete(mesh);
      this.decoration.delete(mesh);
      this.unsupported.delete(mesh);
    });
    scene.onDisposeObservable.addOnce(() => {
      scene.onMeshRemovedObservable.remove(removal);
      for (const entry of this.colliders.values()) entry.detach();
      this.colliders.clear();
      this.grid.clear();
      this.decoration.clear();
      this.foreign.clear();
      this.unsupported.clear();
      this.diagnostics = undefined;
      owners.delete(scene);
    });
  }

  /** Build/runtime render producers can promise the mesh never enables motor collision. */
  declareDecorative(mesh: AbstractMesh): void {
    if (mesh.checkCollisions || this.colliders.has(mesh) || this.decoration.has(mesh)) return;
    if (!this.foreign.has(mesh) && this.scene.meshes.at(-1) !== mesh) {
      const stats = import.meta.env?.DEV ? this.diagnostics : undefined;
      if (
        !this.scene.meshes.some((member) => {
          if (stats) stats.sceneVisits++;
          return member === mesh;
        })
      )
        return;
    }
    this.decoration.add(mesh);
    this.foreign.delete(mesh);
  }

  /** Publish a supported collider at its scene lifecycle boundary. Do not register render cutaways. */
  register(mesh: AbstractMesh): void {
    if (this.colliders.has(mesh)) return;
    const roster = this.scene.meshes;
    if (roster.at(-1) === mesh) {
      this.attach(mesh, this.nextOrder++);
      return;
    }
    // Promotion of an older mesh: republish order once at registration, never per sweep.
    for (const [i, member] of roster.entries()) {
      if (import.meta.env?.DEV && this.diagnostics) this.diagnostics.sceneVisits++;
      if (member === mesh) this.attach(mesh, i);
      else {
        const entry = this.colliders.get(member);
        if (!entry) continue;
        entry.order = i;
        if (entry.bounds && !this.unsupported.has(member)) this.grid.set(member, entry.bounds, i);
      }
    }
    this.nextOrder = roster.length;
  }

  private attach(mesh: AbstractMesh, order: number): void {
    this.decoration.delete(mesh);
    this.foreign.delete(mesh);
    const observer = mesh.onAfterWorldMatrixUpdateObservable.add(() => this.refresh(mesh));
    this.colliders.set(mesh, {
      order,
      detach: () => mesh.onAfterWorldMatrixUpdateObservable.remove(observer),
    });
    this.refresh(mesh);
  }

  /** Bound changes are published with Babylon's matrix publication, or explicitly for new geometry. */
  refresh(mesh: AbstractMesh): void {
    const entry = this.colliders.get(mesh);
    if (!entry) return;
    const { minimumWorld: lo, maximumWorld: hi } = mesh.getBoundingInfo().boundingBox;
    const old = entry.bounds;
    if (
      old &&
      old.minX === lo.x &&
      old.maxX === hi.x &&
      old.minY === lo.y &&
      old.maxY === hi.y &&
      old.minZ === lo.z &&
      old.maxZ === hi.z
    )
      return;
    const stats = import.meta.env?.DEV ? this.diagnostics : undefined;
    const start = stats ? performance.now() : 0;
    const bounds = { minX: lo.x, maxX: hi.x, minY: lo.y, maxY: hi.y, minZ: lo.z, maxZ: hi.z };
    entry.bounds = bounds;
    if (indexable(bounds)) {
      this.unsupported.delete(mesh);
      this.grid.set(mesh, bounds, entry.order);
    } else {
      this.grid.delete(mesh);
      this.unsupported.add(mesh);
    }
    if (stats) {
      stats.builds++;
      stats.maintenanceMs += performance.now() - start;
    }
  }

  private reconcile(stats: TerrainCandidates['diagnostics']): void {
    // Babylon's add observer is deferred; a newly constructed collider can be used now.
    // Known adds/removes balance the census synchronously. Only unannounced adds need a scan.
    if (this.scene.meshes.length === this.colliders.size + this.decoration.size + this.foreign.size)
      return;
    for (const mesh of this.scene.meshes) {
      if (stats) stats.sceneVisits++;
      if (!this.colliders.has(mesh) && !this.decoration.has(mesh)) this.foreign.add(mesh);
    }
  }

  move(proxy: AbstractMesh, delta: Vector3): void {
    const previous = proxy.surroundingMeshes;
    try {
      proxy.surroundingMeshes = this.fullScan ? null : this.candidates(proxy, delta);
      if (import.meta.env?.DEV && this.fullScan)
        this.diagnostics?.candidates.push(this.scene.meshes.length);
      const stats = import.meta.env?.DEV ? this.diagnostics : undefined;
      if (!stats) proxy.moveWithCollisions(delta);
      else {
        const { x, y, z } = proxy.position;
        const start = performance.now();
        proxy.moveWithCollisions(delta);
        stats.sweepMs += performance.now() - start;
        if (
          Math.hypot(
            proxy.position.x - x - delta.x,
            proxy.position.y - y - delta.y,
            proxy.position.z - z - delta.z,
          ) > 1e-6
        )
          stats.contacts++;
      }
    } finally {
      proxy.surroundingMeshes = previous;
    }
  }

  private candidates(proxy: AbstractMesh, delta: Vector3): AbstractMesh[] | null {
    const stats = import.meta.env?.DEV ? this.diagnostics : undefined;
    const start = stats ? performance.now() : 0;
    const fallback = (reason: Fallback) => {
      if (stats) {
        stats.fallbacks.push(reason);
        stats.candidates.push(this.scene.meshes.length);
        stats.lookupMs += performance.now() - start;
      }
      return null;
    };
    if (this.scene.collisionCoordinator.constructor !== DefaultCollisionCoordinator)
      return fallback('unsupported sweep');
    this.reconcile(stats);
    for (const mesh of this.foreign) {
      if (stats) stats.foreignVisits++;
      if (mesh.checkCollisions) return fallback('unknown collider');
    }
    for (const mesh of this.unsupported)
      if (mesh.checkCollisions) return fallback('unsupported bounds');
    const { x: rx, y: ry, z: rz } = proxy.ellipsoid;
    if (rx <= 0 || ry <= 0 || rz <= 0 || !Number.isFinite(proxy.collisionRetryCount))
      return fallback('unsupported sweep');
    const length = Math.hypot(delta.x / rx, delta.y / ry, delta.z / rz);
    const retries = Math.max(0, Math.ceil(proxy.collisionRetryCount));
    const skin = AbstractEngine.CollisionsEpsilon * 10;
    // In 9.37 each contact advances by at most the current scaled velocity length plus skin.
    // The next velocity projects the unspent segment onto the contact plane (at most another
    // skin of error). Sum an upper bound over *all* retries, then add the unit sphere radius.
    const reach = 1 + (retries + 1) * (length + (retries + 1) * skin);
    const p = proxy.getAbsolutePosition(),
      offset = proxy.ellipsoidOffset;
    const x = p.x + offset.x,
      y = p.y + offset.y,
      z = p.z + offset.z;
    const bounds = {
      minX: x - reach * rx,
      maxX: x + reach * rx,
      minY: y - reach * ry,
      maxY: y + reach * ry,
      minZ: z - reach * rz,
      maxZ: z + reach * rz,
    };
    if (!indexable(bounds)) return fallback('unsupported sweep');
    const nearby = this.grid.query(bounds, stats).filter((mesh) => mesh.checkCollisions);
    if (stats) {
      stats.candidates.push(nearby.length);
      stats.last = { bounds, ordered: nearby.map((m) => this.colliders.get(m)!.order) };
      stats.lookupMs += performance.now() - start;
    }
    return nearby;
  }

  get counts() {
    return {
      ...this.grid.counts,
      colliders: this.colliders.size,
      foreign: this.foreign.size,
      decoration: this.decoration.size,
    };
  }
}
