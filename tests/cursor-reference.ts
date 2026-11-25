import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Ray } from '@babylonjs/core/Culling/ray.js';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { PickingInfo } from '@babylonjs/core/Collisions/pickingInfo.js';
import type { BatchClock, Hit, HitSampler, HitSurface } from './cursor-evidence.ts';
import { scalingRecipe as recipe, scalingTiming } from './cursor-scaling-policy.ts';
import type { ScalingReport } from './cursor-scaling-policy.ts';
export { sameHit } from './cursor-scaling-policy.ts';

type Work = ReturnType<typeof emptyWork>;
const emptyWork = () => ({
  visits: 0,
  syncs: 0,
  admitted: 0,
  instanceAdmitted: 0,
  meshExact: 0,
  instanceExact: 0,
  batchBounds: 0,
  meshMiss: 0,
  instanceMiss: 0,
});

type Proxy = { id: string; alive: boolean; artwork: readonly AbstractMesh[] };
export type ReferenceScene = {
  scene: Scene;
  ownerOf: (mesh: AbstractMesh) => string | undefined;
  proxies: ReadonlyMap<AbstractMesh, Proxy>;
  shadows: readonly AbstractMesh[];
};

// Snapshot of the 3a35753 pass order and filters. No shortlist or application picker imported.
export function exhaustive(input: ReferenceScene, work?: Work) {
  const { scene, proxies, shadows, ownerOf } = input;
  const owners = new Map<AbstractMesh, string>();
  for (const mesh of scene.meshes) {
    const id = ownerOf(mesh);
    if (id) owners.set(mesh, id);
  }
  const eligible = (mesh: AbstractMesh) =>
    mesh.isEnabled() && mesh.isVisible && mesh.visibility >= 0.5;
  const surface = (hit: PickingInfo, mesh: AbstractMesh): HitSurface => ({
    mesh: mesh.name,
    instance: hit.thinInstanceIndex,
    distance: hit.distance,
  });
  return (ray: Ray): Hit => {
    const pick = (filter: (mesh: AbstractMesh) => boolean) =>
      scene.pickWithRay(ray, (mesh, index) => {
        const admitted = filter(mesh);
        if (work) {
          if (index === -1) {
            work.visits++;
            if (admitted) work.admitted++;
          } else if (admitted) work.instanceAdmitted++;
        }
        return admitted;
      });
    for (const mesh of proxies.keys()) {
      mesh.computeWorldMatrix(true);
      if (work) work.syncs++;
    }
    const enemy = pick((mesh) => mesh.isEnabled() && !!proxies.get(mesh)?.alive);
    const proxy = enemy?.pickedMesh && proxies.get(enemy.pickedMesh);
    const object = pick((mesh) => owners.has(mesh) && eligible(mesh));
    if (!proxy && !object?.hit) return { kind: 'floor' };
    const cover = pick(
      (mesh) =>
        eligible(mesh) &&
        (!mesh.hasThinInstances || (mesh instanceof Mesh && mesh.thinInstanceEnablePicking)) &&
        !shadows.includes(mesh) &&
        !proxy?.artwork.includes(mesh) &&
        (owners.has(mesh) ||
          (!mesh.material?.needAlphaBlending() &&
            !mesh.name.includes('ring') &&
            mesh.name !== 'click destination' &&
            mesh.name !== 'hostile target')),
    );
    if (proxy && enemy?.pickedMesh && (!cover?.hit || enemy.distance <= cover.distance + 0.0001)) {
      return { kind: 'enemy', id: proxy.id, ...surface(enemy, enemy.pickedMesh) };
    }
    if (cover?.hit && cover.pickedMesh) {
      const at = surface(cover, cover.pickedMesh);
      const id = owners.get(cover.pickedMesh);
      return id ? { kind: 'object', id, ...at } : { kind: 'floor', ...at };
    }
    return { kind: 'floor' };
  };
}

// Babylon InternalPick calls intersects once for a thin batch's bounds and then
// at the actual mesh/instance intersection entry, after the per-instance raw bounds gate.
function countEntries(mesh: AbstractMesh, current: () => Work) {
  const original = mesh.intersects.bind(mesh);
  mesh.intersects = (...args: Parameters<AbstractMesh['intersects']>) => {
    const hit = original(...args);
    const work = current();
    if (args[3]) work.batchBounds++;
    else if (mesh.hasThinInstances) {
      work.instanceExact++;
      if (!hit?.hit) work.instanceMiss++;
    } else {
      work.meshExact++;
      if (!hit?.hit) work.meshMiss++;
    }
    return hit;
  };
}

export function createReferenceFixture(rooms: 0 | 10) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const origin = new Vector3(...recipe.origin);
  const direction = new Vector3(...recipe.direction);
  const camera = new FreeCamera('reference', origin, scene);
  camera.setTarget(origin.add(direction));
  const ray = new Ray(origin, direction);
  const opaque = new StandardMaterial('opaque', scene);
  const owners = new Map<AbstractMesh, string>();
  const proxies = new Map<AbstractMesh, Proxy>();
  const box = (name: string, x: number, z: number, id?: string) => {
    const mesh = CreateBox(name, { size: 1 }, scene);
    mesh.position.set(x, 1, z);
    mesh.material = opaque;
    if (id) owners.set(mesh, id);
    return mesh;
  };
  const guard = (name: string, x: number, z: number, id: string) => {
    const mesh = box(name, x, z);
    mesh.isVisible = false;
    proxies.set(mesh, { id, alive: true, artwork: [] });
    return mesh;
  };
  const batchAt = (name: string, x: number, z: number, offsets: readonly number[], id?: string) => {
    const batch = box(name, x, z, id);
    batch.thinInstanceEnablePicking = true;
    batch.computeWorldMatrix(true);
    batch.thinInstanceSetBuffer(
      'matrix',
      new Float32Array(
        offsets.flatMap((offset) => Array.from(Matrix.Translation(1, 0, offset).asArray())),
      ),
      16,
      true,
    );
    return batch;
  };

  // A single aperture mesh whose bounding box contains the ray but whose triangles do not.
  const frame = new Mesh('shrine-aperture', scene);
  const data = new VertexData();
  data.positions = [-2, -2, 2, -2, 2, 2, -2, 2, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5].flatMap(
    (value, index, all) => (index % 2 ? [] : [5, 1 + value, all[index + 1]]),
  );
  data.indices = [0, 1, 4, 1, 5, 4, 1, 2, 5, 2, 6, 5, 2, 3, 6, 3, 7, 6, 3, 0, 7, 0, 4, 7];
  data.applyToMesh(frame);
  frame.material = opaque;
  owners.set(frame, 'shrine');
  box('shrine-back', 8, 0, 'shrine');
  const batch = batchAt('shrine-batch', 5, 0, [-2, 0, 2], 'shrine');
  const door = box('door', 3, recipe.door.exposed);
  const proxy = guard('proxy', 10, 0, 'guard');
  const equalOwner = box('equal-owner', 8, 0, 'other');
  equalOwner.setEnabled(false);
  for (let i = 1; i <= rooms; i++) {
    const z = recipe.roomStepZ * i;
    box(`room-${i}-west`, 2, z);
    box(`room-${i}-east`, 12, z);
    box(`room-${i}-north`, 7, z - 5);
    box(`room-${i}-south`, 7, z + 5);
    box(`room-${i}-prop`, 8, z, `prop-${i}`);
    guard(`room-${i}-proxy`, 10, z, `guard-${i}`);
    // Dormant to the owned-surface pass but evaluated for cover.
    batchAt(`room-${i}-batch`, 6, z, [-3, -2, -1, 0, 1, 2, 3, 4]);
  }
  const work = emptyWork();
  for (const mesh of scene.meshes) {
    mesh.computeWorldMatrix(true);
    countEntries(mesh, () => work);
  }
  let pick: ReturnType<typeof exhaustive> | undefined;
  const buildCounted = () => {
    pick = exhaustive({ scene, ownerOf: (m) => owners.get(m), proxies, shadows: [] }, work);
  };
  const sample = (): ReturnType<HitSampler> & { work: Work } => {
    if (!pick) buildCounted();
    Object.assign(work, emptyWork());
    const hit = pick!(ray);
    return { hit, work: { ...work } };
  };
  return {
    batch,
    proxy,
    equalOwner,
    sample,
    build: buildCounted,
    writeDoor(blocked: boolean) {
      const z = blocked ? recipe.door.blocked : recipe.door.exposed;
      door.position.z = z;
      scene.incrementRenderId();
      return z;
    },
    dispose: () => engine.dispose(),
  };
}

export function measureScaling(clock: BatchClock): ScalingReport {
  const pairs = recipe.order.map((pair) =>
    pair.map((rooms) => {
      const fixture = createReferenceFixture(rooms);
      try {
        const buildStart = clock();
        fixture.build();
        const ownerBuildMs = clock() - buildStart;
        for (let i = 0; i < recipe.warmup; i++) {
          fixture.writeDoor(i % 2 !== 0);
          fixture.sample();
        }
        const samples = Array.from({ length: recipe.queries }, (_, i) => {
          const write = fixture.writeDoor(i % 2 !== 0);
          const start = clock();
          const row = fixture.sample();
          return { write, ...row, ms: clock() - start };
        });
        return {
          rooms,
          ownerBuildMs,
          samples,
          ...scalingTiming(samples.map((row) => row.ms)),
        };
      } finally {
        fixture.dispose();
      }
    }),
  );
  return { recipe: structuredClone(recipe), pairs };
}
