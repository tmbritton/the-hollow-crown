import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { Materials } from './materials.ts';
import type { ECS } from './ecs.ts';

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
    return { entity, root, socket };
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
  return {
    update() {
      const current = ecs.get('run')?.get('tribute') === tribute;
      hatch.setEnabled(current);
      for (const { entity, root, socket } of crates) {
        const cargo = entity.require('cargo'),
          p = entity.require('transform');
        const carried = cargo.state === 'carried',
          owner = cargo.owner?.get('transform');
        root.setEnabled(current && cargo.state !== 'delivered' && cargo.state !== 'recovered');
        socket.setEnabled(current);
        const heading = carried && owner ? owner.heading : 0;
        root.position.set(
          p.x - Math.sin(heading) * (carried ? 0.42 : 0),
          p.h + (carried ? 0.85 : 0.05),
          p.z - Math.cos(heading) * (carried ? 0.42 : 0),
        );
        root.rotation.y = heading;
      }
    },
  };
}
