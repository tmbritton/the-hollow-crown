import { Ray } from '@babylonjs/core/Culling/ray.js';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import type { Camera } from '@babylonjs/core/Cameras/camera.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Components } from './ecs.ts';

const axes = ['x', 'y', 'z'] as const;
function intersectsSegment(ray: Ray, minimum: Vector3, maximum: Vector3): boolean {
  let enter = 0,
    exit = ray.length;
  for (const axis of axes) {
    const origin = ray.origin[axis],
      direction = ray.direction[axis];
    if (Math.abs(direction) < 1e-12) {
      if (origin < minimum[axis] || origin > maximum[axis]) return false;
    } else {
      const a = (minimum[axis] - origin) / direction,
        b = (maximum[axis] - origin) / direction;
      enter = Math.max(enter, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
      if (enter > exit) return false;
    }
  }
  return true;
}

function intersectsSphere(
  ray: Ray,
  x: number,
  y: number,
  z: number,
  radiusSquared: number,
): boolean {
  x -= ray.origin.x;
  y -= ray.origin.y;
  z -= ray.origin.z;
  const along = Math.max(
    0,
    Math.min(ray.length, x * ray.direction.x + y * ray.direction.y + z * ray.direction.z),
  );
  x -= along * ray.direction.x;
  y -= along * ray.direction.y;
  z -= along * ray.direction.z;
  return x * x + y * y + z * z <= radiusSquared;
}

const instanceData = new WeakMap<Mesh, Float32Array>();
/** The matrix writer owns instance bounds, just as ordinary transforms own mesh bounds. */
export function updateInstanceMatrices(mesh: Mesh, matrices?: Float32Array, active = true): void {
  if (matrices) instanceData.set(mesh, matrices);
  else instanceData.delete(mesh);
  mesh.thinInstanceBufferUpdated('matrix');
  // Empty pools contain only zero-scale instances; their previous bound remains conservative.
  if (active) mesh.thinInstanceRefreshBoundingInfo();
}

interface ObservationGroup {
  root: TransformNode;
  radius: number;
  worldRadius?: () => number | undefined;
  meshes: AbstractMesh[];
  ray: Ray | null;
  intersects: boolean;
}

/** Render-side evidence only: generated blockers and invisible picking proxies are not artwork. */
export class CameraObservation {
  private readonly camera: Camera;
  private pass = 0;
  private readonly values = new Float64Array(20);
  private readonly instanceMatrix = Matrix.Identity();
  private readonly instanceWorld = Matrix.Identity();
  private readonly instanceCenter = Vector3.Zero();
  private readonly instanceMinimum = Vector3.Zero();
  private readonly instanceMaximum = Vector3.Zero();
  private readonly groups: ObservationGroup[];
  private indexDirty = true;
  private indexedMeshes: readonly AbstractMesh[] = [];
  private readonly buckets = new Map<string, AbstractMesh[]>();
  private dynamicMeshes: AbstractMesh[] = [];
  private fixedMeshes: { mesh: AbstractMesh; version: number }[] = [];
  private parents: { node: TransformNode; parent: TransformNode['parent'] }[] = [];
  private readonly transforms = new WeakMap<
    TransformNode,
    {
      pass: number;
      parent: TransformNode['parent'];
      values: Float64Array;
    }
  >();
  private readonly rigs = new WeakMap<
    Components['render'],
    {
      samples: AbstractMesh[];
      owned: Set<AbstractMesh>;
    }
  >();

  constructor(
    camera: Camera,
    groups: readonly {
      root: TransformNode;
      radius: number;
      worldRadius?: () => number | undefined;
    }[] = [],
  ) {
    this.camera = camera;
    this.groups = groups.map((group) => ({ ...group, meshes: [], ray: null, intersects: false }));
    camera.getScene().onNewMeshAddedObservable.add(() => {
      this.indexDirty = true;
    });
    camera.getScene().onMeshRemovedObservable.add(() => {
      this.indexDirty = true;
    });
  }

  private ensureIndex(): void {
    const meshes = this.camera.getScene().meshes;
    if (
      !this.indexDirty &&
      meshes.length === this.indexedMeshes.length &&
      !meshes.some((mesh, i) => mesh !== this.indexedMeshes[i]) &&
      !this.parents.some(({ node, parent }) => node.parent !== parent) &&
      !this.fixedMeshes.some(
        ({ mesh, version }) =>
          !mesh.isWorldMatrixFrozen || mesh.worldMatrixFromCache.updateFlag !== version,
      )
    )
      return;
    this.indexDirty = false;
    this.indexedMeshes = [...meshes];
    this.buckets.clear();
    this.parents = [];
    this.fixedMeshes = [];
    this.dynamicMeshes = [];
    const grouped = new Set<AbstractMesh>();
    for (const group of this.groups) {
      group.meshes = group.root.getChildMeshes();
      group.ray = null;
      for (const mesh of group.meshes) grouped.add(mesh);
      for (const node of [group.root, ...group.root.getDescendants()])
        if (node instanceof TransformNode) this.parents.push({ node, parent: node.parent });
    }
    for (const mesh of this.camera.getScene().meshes) {
      if (grouped.has(mesh)) continue;
      if (!mesh.isWorldMatrixFrozen || (mesh instanceof Mesh && mesh.hasThinInstances)) {
        this.dynamicMeshes.push(mesh);
        continue;
      }
      this.fixedMeshes.push({ mesh, version: mesh.worldMatrixFromCache.updateFlag });
      const box = mesh.getBoundingInfo().boundingBox;
      for (
        let x = Math.floor(box.minimumWorld.x / 16);
        x <= Math.floor(box.maximumWorld.x / 16);
        x++
      )
        for (
          let z = Math.floor(box.minimumWorld.z / 16);
          z <= Math.floor(box.maximumWorld.z / 16);
          z++
        ) {
          const key = `${x},${z}`;
          const bucket = this.buckets.get(key) ?? [];
          bucket.push(mesh);
          this.buckets.set(key, bucket);
        }
    }
  }

  private candidates(ray: Ray, owned: Set<AbstractMesh>): Set<AbstractMesh> {
    const candidates = new Set<AbstractMesh>();
    const consider = (mesh: AbstractMesh) => {
      if (owned.has(mesh) || !this.rendered(mesh)) return;
      // A centered unparented shape has a rotation-invariant envelope at its live position.
      if (
        !mesh.parent &&
        !mesh.isWorldMatrixFrozen &&
        !mesh.infiniteDistance &&
        mesh.getPivotMatrix().isIdentity()
      ) {
        const sphere = mesh.getBoundingInfo().boundingSphere;
        if (sphere.center.equalsToFloats(0, 0, 0)) {
          const scale =
            Math.max(Math.abs(mesh.scaling.x), Math.abs(mesh.scaling.y), Math.abs(mesh.scaling.z)) *
            Math.abs(mesh.scalingDeterminant);
          const p = mesh.position;
          if (!intersectsSphere(ray, p.x, p.y, p.z, sphere.radius * sphere.radius * scale * scale))
            return;
        }
      }
      this.synchronize(mesh);
      const box = mesh.getBoundingInfo().boundingBox;
      if (!intersectsSegment(ray, box.minimumWorld, box.maximumWorld)) return;
      if (mesh instanceof Mesh && mesh.hasThinInstances) mesh.thinInstanceEnablePicking = true;
      candidates.add(mesh);
    };
    const endX = ray.origin.x + ray.direction.x * ray.length;
    const endZ = ray.origin.z + ray.direction.z * ray.length;
    for (
      let x = Math.floor(Math.min(ray.origin.x, endX) / 16);
      x <= Math.floor(Math.max(ray.origin.x, endX) / 16);
      x++
    )
      for (
        let z = Math.floor(Math.min(ray.origin.z, endZ) / 16);
        z <= Math.floor(Math.max(ray.origin.z, endZ) / 16);
        z++
      )
        for (const mesh of this.buckets.get(`${x},${z}`) ?? []) {
          const box = mesh.getBoundingInfo().boundingBox;
          if (
            !owned.has(mesh) &&
            intersectsSegment(ray, box.minimumWorld, box.maximumWorld) &&
            this.rendered(mesh)
          )
            candidates.add(mesh);
        }
    for (const mesh of this.dynamicMeshes) consider(mesh);
    for (const group of this.groups)
      if (group.root.isEnabled() && this.groupIntersects(group, ray))
        for (const mesh of group.meshes) consider(mesh);
    return candidates;
  }

  private instanceIntersects(mesh: AbstractMesh, index: number, ray: Ray): boolean {
    if (!(mesh instanceof Mesh)) return true;
    const data = instanceData.get(mesh),
      box = mesh.rawBoundingInfo?.boundingBox;
    if (!data || !box) return true;
    Matrix.FromArrayToRef(data, index * 16, this.instanceMatrix);
    this.instanceMatrix.multiplyToRef(mesh.worldMatrixFromCache, this.instanceWorld);
    const m = this.instanceWorld.m,
      e = box.extendSize;
    const x = Math.abs(m[0]) * e.x + Math.abs(m[4]) * e.y + Math.abs(m[8]) * e.z;
    const y = Math.abs(m[1]) * e.x + Math.abs(m[5]) * e.y + Math.abs(m[9]) * e.z;
    const z = Math.abs(m[2]) * e.x + Math.abs(m[6]) * e.y + Math.abs(m[10]) * e.z;
    if (x + y + z === 0) return false;
    Vector3.TransformCoordinatesToRef(box.center, this.instanceWorld, this.instanceCenter);
    const center = this.instanceCenter;
    this.instanceMinimum.set(center.x - x, center.y - y, center.z - z);
    this.instanceMaximum.set(center.x + x, center.y + y, center.z + z);
    return intersectsSegment(ray, this.instanceMinimum, this.instanceMaximum);
  }

  /** Authored pose envelopes reject off-ray rigs before touching their articulated children.
   * They can only reject candidates, never establish visibility: survivors still use triangles.
   */
  private groupIntersects(group: ObservationGroup, ray: Ray): boolean {
    if (group.ray !== ray) {
      this.synchronize(group.root);
      const m = group.root.worldMatrixFromCache.m;
      // sqrt(||M||1 * ||M||infinity) conservatively includes nonuniform ancestor scaling/shear.
      const scaleSquared =
        Math.max(
          Math.abs(m[0]) + Math.abs(m[1]) + Math.abs(m[2]),
          Math.abs(m[4]) + Math.abs(m[5]) + Math.abs(m[6]),
          Math.abs(m[8]) + Math.abs(m[9]) + Math.abs(m[10]),
        ) *
        Math.max(
          Math.abs(m[0]) + Math.abs(m[4]) + Math.abs(m[8]),
          Math.abs(m[1]) + Math.abs(m[5]) + Math.abs(m[9]),
          Math.abs(m[2]) + Math.abs(m[6]) + Math.abs(m[10]),
        );
      const worldRadius = group.worldRadius?.();
      group.intersects = intersectsSphere(
        ray,
        m[12],
        m[13],
        m[14],
        worldRadius === undefined ? group.radius * group.radius * scaleSquared : worldRadius ** 2,
      );
      group.ray = ray;
    }
    return group.intersects;
  }

  /** Babylon's normal cache can retain a matrix within one render ID across fixed steps.
   * Compare public transform values, sync parents once, then dirty only genuinely changed nodes.
   * Marking dirty + a non-forced compute avoids recursively forcing every ancestor per mesh.
   */
  private synchronize(node: TransformNode): void {
    if (node.isWorldMatrixFrozen) return;
    let state = this.transforms.get(node);
    if (state?.pass === this.pass) return;
    if (node.parent instanceof TransformNode) this.synchronize(node.parent);
    const p = node.position,
      r = node.rotation,
      s = node.scaling,
      q = node.rotationQuaternion;
    const values = this.values;
    values[0] = p.x;
    values[1] = p.y;
    values[2] = p.z;
    values[3] = r.x;
    values[4] = r.y;
    values[5] = r.z;
    values[6] = s.x;
    values[7] = s.y;
    values[8] = s.z;
    values[9] = q?.x ?? 0;
    values[10] = q?.y ?? 0;
    values[11] = q?.z ?? 0;
    values[12] = q?.w ?? 1;
    values[13] = q ? 1 : 0;
    values[14] = node.getPivotMatrix().updateFlag;
    values[15] = node.scalingDeterminant;
    values[16] = node.billboardMode;
    values[17] = node.infiniteDistance ? 1 : 0;
    values[18] = node.parent?.worldMatrixFromCache.updateFlag ?? -1;
    values[19] = node.isWorldMatrixCameraDependent() ? this.camera.getViewMatrix().updateFlag : -1;
    let changed = !state || state.parent !== node.parent;
    if (state)
      for (let i = 0; i < values.length && !changed; i++) changed = values[i] !== state.values[i];
    if (changed) {
      node.markAsDirty('observation');
      node.computeWorldMatrix();
      if (!state) {
        state = { pass: this.pass, parent: node.parent, values: new Float64Array(values) };
        this.transforms.set(node, state);
      } else {
        state.parent = node.parent;
        state.values.set(values);
      }
    }
    if (state) state.pass = this.pass;
  }

  private rendered(mesh: AbstractMesh): boolean {
    return (
      mesh.isVisible &&
      mesh.visibility > 0 &&
      mesh.isEnabled() &&
      mesh.material?.alpha !== 0 &&
      (mesh.layerMask & this.camera.layerMask) !== 0
    );
  }

  /** Three default rays towards actual surfaces (not empty bounds); separated remains supply one
   * representative per anatomical chunk and require player eligibility on that same surface.
   * Cache geometry candidates and transform inputs, never visibility outcomes.
   * Current finite-segment bounds reject candidates before Babylon's triangle/instance picking.
   */
  visible(
    render: Components['render'],
    samples?: readonly AbstractMesh[],
    eligible?: (point: Vector3) => boolean,
  ): boolean {
    if (!render.root?.isEnabled()) return false;
    this.pass++;
    this.ensureIndex();
    let rig = this.rigs.get(render);
    if (!rig) {
      const volume = (mesh: AbstractMesh) => {
        const size = mesh.getBoundingInfo().boundingBox.extendSize;
        return size.x * size.y * size.z;
      };
      rig = {
        samples: [...render.meshes].sort((a, b) => volume(b) - volume(a)).slice(0, 3),
        owned: new Set(render.meshes),
      };
      this.rigs.set(render, rig);
    }
    const camera = this.camera;
    camera.getViewMatrix();
    camera.getProjectionMatrix();
    const transform = camera.getTransformationMatrix();
    const viewport = camera.viewport.toGlobal(1, 1);
    for (const sample of samples ?? rig.samples) {
      if (!this.rendered(sample)) continue;
      this.synchronize(sample);
      const center = sample.getBoundingInfo().boundingBox.centerWorld;
      if (eligible && !eligible(center)) continue;
      const screen = Vector3.Project(center, Matrix.Identity(), transform, viewport);
      if (
        !(
          screen.z > 0 &&
          screen.z < 1 &&
          screen.x > 0 &&
          screen.x < 1 &&
          screen.y > 0 &&
          screen.y < 1
        )
      )
        continue;
      const direction = center.subtract(camera.globalPosition);
      const ray = new Ray(camera.globalPosition, direction.normalizeToNew(), direction.length());
      const surface = ray.intersectsMesh(sample);
      if (!surface.hit) continue;
      // Stop just before the actual actor surface; a same-ray hit behind it cannot occlude it.
      ray.length = Math.max(0, surface.distance - 0.001);
      const candidates = this.candidates(ray, rig.owned);
      const occluder = camera.getScene().pickWithRay(
        ray,
        (mesh, instanceIndex) => {
          if (instanceIndex >= 0) return this.instanceIntersects(mesh, instanceIndex, ray);
          return candidates.has(mesh);
        },
        true,
      );
      if (!occluder?.hit) return true;
    }
    return false;
  }
}
