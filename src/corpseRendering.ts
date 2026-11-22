import { Matrix } from '@babylonjs/core/Maths/math.vector.js';
import type { Node } from '@babylonjs/core/node.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { ECS } from './ecs.ts';
import type { CorpseBox } from './corpseTerrain.ts';
import type { NavigationWorld } from './navigation.ts';
import { heightAt } from './world.ts';
import { cpuTrace } from './cpuMetrics.ts';

// Weak keys release disposed scenes. Only changed part matrices require a new inverse.
const boxes = new WeakMap<AbstractMesh, { matrix: Matrix; floor: number; box: CorpseBox }>();

/** Read after death poses, once per render update, shared by every actor's feet.
 * No live actors, selection proxies, standing death anticipation or hidden equipment. */
export function readCorpseTerrain(ecs: ECS, world?: NavigationWorld): readonly CorpseBox[] {
  if (import.meta.env?.DEV) cpuTrace?.count('alloc.corpseLists');
  const result: CorpseBox[] = [],
    synced = new Set<Node>();
  const sync = (node: Node): void => {
    if (synced.has(node)) return;
    if (node instanceof TransformNode && node.isWorldMatrixFrozen) {
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
  for (const entity of ecs.query('corpse', 'transform', 'render')) {
    const ragdoll = entity.get('ragdoll');
    if (ragdoll ? !ragdoll.settled : entity.require('corpse').age < 0.62) continue;
    for (const mesh of entity.require('render').meshes) {
      if (import.meta.env?.DEV) cpuTrace?.count('corpse.meshVisits');
      if (mesh.isDisposed() || !mesh.isEnabled() || !mesh.isVisible || mesh.visibility <= 0)
        continue;
      sync(mesh);
      const matrix = mesh.getWorldMatrix();
      const floor =
        (world ? heightAt(world, matrix.m[12], matrix.m[14]) : null) ??
        entity.require('transform').h;
      let entry = boxes.get(mesh);
      if (!entry || !entry.matrix.equals(matrix) || entry.floor !== floor) {
        if (import.meta.env?.DEV) cpuTrace?.count('alloc.corpseBoxes');
        const bounds = mesh.getBoundingInfo().boundingBox;
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
      result.push(entry.box);
    }
  }
  return result;
}
