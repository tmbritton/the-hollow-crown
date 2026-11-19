import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Scene } from '@babylonjs/core/scene';
import type { Materials } from './materials.ts';
import type { ECS } from './ecs.ts';
import { EMBER } from './lastEmber.ts';

/** Twelve bounded procedural seals, on existing solid furniture. Scene owns disposal. */
export function createLastEmberRendering(scene: Scene, ecs: ECS, materials: Materials) {
  const ember = ecs.get('run')!.require('lastEmber');
  const groups = (['shrine', 'focus'] as const).map((kind) => {
    const site = ember.sites[kind];
    const dx = site.approach.x - site.x,
      dz = site.approach.z - site.z;
    const length = Math.hypot(dx, dz);
    const meshes = Array.from({ length: 6 }, (_, i) => {
      const mesh = MeshBuilder.CreateBox(`Last Ember ${kind} seal ${i}`, { size: 0.28 }, scene);
      const across = (i - 2.5) * (kind === 'shrine' ? 0.5 : 0.24);
      mesh.position.set(
        site.x + (dz / length) * across + (dx / length) * 0.55,
        site.h + (kind === 'shrine' ? 2.9 : 1.6),
        site.z - (dx / length) * across + (dz / length) * 0.55,
      );
      mesh.rotation.z = Math.PI / 4;
      mesh.isPickable = false;
      mesh.material = materials.gold;
      return mesh;
    });
    return { kind, meshes };
  });
  return {
    update() {
      // Development fixtures may deliberately replace the scenario's whole plan.
      if (ecs.get('run')?.get('lastEmber') !== ember) {
        for (const { meshes } of groups) for (const mesh of meshes) mesh.setEnabled(false);
        return;
      }
      const record = ecs.get('run')!.require('objectives');
      for (const { kind, meshes } of groups) {
        const clock = record.get(kind === 'shrine' ? EMBER.restore : EMBER.profane);
        const actor = kind === 'shrine' ? ecs.get('player') : ecs.get(EMBER.worker);
        const work = actor?.get('work')?.snapshot();
        const pulse =
          work?.status === 'working' ? 1 + Math.sin(work.elapsed * Math.PI * 2) * 0.12 : 1;
        meshes.forEach((mesh, i) => {
          const fractured = ember.state === 'fractured';
          const corrupted = ember.state === 'corrupted';
          mesh.material =
            kind === 'focus' && !ember.focusEnabled
              ? materials.iron
              : fractured || corrupted
                ? materials.cloth
                : i < clock.progress || ['cleansed', 'repaired'].includes(ember.state)
                  ? materials.rune
                  : materials.gold;
          mesh.scaling.setAll((i < clock.progress ? 1.2 : 0.8) * pulse);
          mesh.rotation.z = fractured ? (i % 2 ? -0.7 : 0.7) : Math.PI / 4;
        });
      }
    },
  };
}
