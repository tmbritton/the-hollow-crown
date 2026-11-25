import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Scene } from '@babylonjs/core/scene';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { Materials } from './materials.ts';
import type { ECS, Entity } from './ecs.ts';
import { FrameAttachment } from './rigs/attachments.ts';

interface CarriedGeometry {
  readonly meshes: readonly AbstractMesh[];
  revision: number;
}
const cargoWriters = new WeakMap<ECS, () => ReadonlyMap<Entity, CarriedGeometry>>();

/** Publish scene-root crate ownership and the same frame the renderer draws, after body poses. */
export function updateCarriedTribute(ecs: ECS) {
  return cargoWriters.get(ecs)?.();
}

/** Four crates, their floor sockets and one hatch. Existing materials only; scene-owned. */
export function createTributeRendering(
  scene: Scene,
  ecs: ECS,
  materials: Materials,
  shadow: ShadowGenerator,
) {
  const tribute = ecs.get('run')!.require('tribute');
  const box = (
    name: string,
    parent: TransformNode,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: keyof Materials,
  ) => {
    const mesh = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    mesh.material = materials[material];
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    shadow.addShadowCaster(mesh);
    return mesh;
  };
  const crates = tribute.cargo.map((entity, i) => {
    const root = new TransformNode(`Royal tribute crate ${i}`, scene);
    box('tribute coffer', root, 0, 0.25, 0, 0.65, 0.5, 0.48, 'wood');
    for (const x of [-0.23, 0.23])
      box('tribute gold strap', root, x, 0.26, 0, 0.065, 0.53, 0.51, 'gold');
    for (const x of [-0.12, 0, 0.12])
      box('tribute crown seal', root, x, 0.3, -0.25, 0.065, x === 0 ? 0.2 : 0.13, 0.025, 'gold');
    const socket = new TransformNode(`Tribute cache socket ${i}`, scene),
      p = tribute.sites.cargo[i];
    socket.position.set(p.x, p.h + 0.025, p.z);
    for (const x of [-0.48, 0.48]) box('cache marking', socket, x, 0, 0, 0.08, 0.025, 0.9, 'gold');
    const meshes = root.getChildMeshes();
    return {
      entity,
      root,
      socket,
      attachment: new FrameAttachment(root),
      geometry: { meshes, revision: 0 },
      drawn: meshes.map(() => false),
    };
  });
  const hatch = new TransformNode('Royal tribute escape hatch', scene),
    at = tribute.sites.exit;
  hatch.position.set(at.x, at.h + 0.025, at.z);
  box('stable escape hatch', hatch, 0, 0, 0, 1.5, 0.035, 1.5, 'iron');
  for (const x of [-0.5, 0, 0.5]) box('hatch bars', hatch, x, 0.025, 0, 0.08, 0.03, 1.4, 'gold');
  for (const x of [-0.85, 0.85]) {
    box('hatch beacon', hatch, x, 0.3, 0, 0.12, 0.6, 0.12, 'iron');
    box('hatch lamp', hatch, x, 0.65, 0, 0.22, 0.16, 0.22, 'rune');
  }
  const carriedMeshes = new Map<Entity, CarriedGeometry>();
  function updateCrates() {
    carriedMeshes.clear();
    const current = ecs.get('run')?.get('tribute') === tribute;
    for (const { entity, root, attachment, geometry, drawn } of crates) {
      const cargo = entity.require('cargo'),
        p = entity.require('transform');
      const owner = cargo.owner;
      const binding = owner && ecs.get(owner.id) === owner ? owner.get('rigPose') : undefined;
      root.setEnabled(
        current && !root.isDisposed() && cargo.state !== 'delivered' && cargo.state !== 'recovered',
      );
      if (cargo.state === 'carried' && binding?.actions.carrying && owner && root.isEnabled()) {
        let changed = attachment.apply(binding.actions.frames.cargo);
        for (const [i, mesh] of geometry.meshes.entries()) {
          const visible =
            !mesh.isDisposed() && mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0;
          changed ||= drawn[i] !== visible;
          drawn[i] = visible;
        }
        if (changed) geometry.revision++;
        carriedMeshes.set(owner, geometry);
      } else {
        root.position.set(p.x, p.h + 0.05, p.z);
        root.rotation.setAll(0);
        root.scaling.setAll(1);
      }
    }
    return carriedMeshes;
  }
  cargoWriters.set(ecs, updateCrates);
  return {
    pickOwners: new Map(
      crates.flatMap(({ entity, geometry }) =>
        geometry.meshes.map((mesh) => [mesh, entity.id] as const),
      ),
    ),
    update() {
      const current = ecs.get('run')?.get('tribute') === tribute;
      hatch.setEnabled(current);
      for (const { socket } of crates) socket.setEnabled(current);
      updateCrates();
    },
  };
}
