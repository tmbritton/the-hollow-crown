import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Scene } from '@babylonjs/core/scene';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { CombatSystem } from './combat.ts';
import type { Materials } from './materials.ts';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { SocialGroup } from './social.ts';
import { part } from './geometry.ts';
import { hackySackPass, isSocializing } from './social.ts';
import { sampleCurve, volumeScale } from './animationCurves.ts';
import { updateInstanceMatrices } from './observation.ts';
import '@babylonjs/core/Meshes/thinInstanceMesh';

/** Shared props remain after an interrupted game; hand props and smoke follow activity. */
export function createSocialRendering(
  scene: Scene,
  combat: CombatSystem,
  materials: Materials,
  shadow: ShadowGenerator,
) {
  const participants = combat.enemies.filter((actor) => actor.brain?.social);
  const groups = new Map(
    participants.map((actor) => [actor.brain!.social!.id, actor.brain!.social!]),
  );
  const held = participants.map((actor) => {
    const hand = actor.entity.require('rig').forearms[1];
    const card = part(
      scene,
      materials.bone,
      `${actor.id}:held card`,
      [0.17, 0.025, 0.24],
      [0, -0.17, 0.1],
      hand,
      shadow,
    );
    const pipe = part(
      scene,
      materials.wood,
      `${actor.id}:pipe`,
      [0.22, 0.045, 0.045],
      [-0.08, -0.17, 0.16],
      hand,
      shadow,
    );
    const ember = part(
      scene,
      materials.eyes,
      `${actor.id}:pipe ember`,
      [0.055, 0.05, 0.055],
      [-0.18, -0.15, 0.16],
      hand,
    );
    return { actor, card, pipe, ember };
  });
  const balls: { mesh: Mesh; group: SocialGroup }[] = [];
  for (const group of groups.values()) {
    const { x, z, h } = group.center;
    if (group.activity === 'cards') {
      part(scene, materials.cloth, `${group.id}:card mat`, [1.25, 0.035, 1.25], [x, h + 0.04, z]);
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3 + group.phase;
        const card = part(
          scene,
          materials.bone,
          `${group.id}:dealt card:${i}`,
          [0.17, 0.015, 0.24],
          [x + Math.sin(angle) * 0.4, h + 0.07, z + Math.cos(angle) * 0.4],
        );
        card.rotation.y = angle;
        part(
          scene,
          i % 2 ? materials.cloth : materials.dark,
          `${group.id}:card pip:${i}`,
          [0.045, 0.02, 0.045],
          [card.position.x, h + 0.082, card.position.z],
        );
      }
      for (let i = 0; i < 4; i++)
        part(
          scene,
          materials.gold,
          `${group.id}:stake:${i}`,
          [0.08, 0.025, 0.08],
          [x + (i % 2) * 0.1, h + 0.07, z + Math.floor(i / 2) * 0.1],
        );
    }
    if (group.activity === 'hackysack') {
      const mesh = MeshBuilder.CreateSphere(
        `${group.id}:hacky sack`,
        { diameter: 0.18, segments: 3 },
        scene,
      );
      mesh.material = materials.gold;
      mesh.isPickable = false;
      mesh.position.set(x, h + 0.1, z);
      shadow.addShadowCaster(mesh);
      balls.push({ mesh, group });
    }
  }
  const smoke = MeshBuilder.CreateBox('social smoke puffs', { size: 1 }, scene);
  smoke.material = materials.stone;
  smoke.isPickable = false;
  smoke.alwaysSelectAsActiveMesh = true;
  const matrices = new Float32Array(Math.max(1, participants.length * 3) * 16);
  smoke.thinInstanceSetBuffer('matrix', matrices, 16, false);
  return {
    update(): void {
      let activeSmoke = false;
      matrices.fill(0);
      for (let i = 0; i < matrices.length / 16; i++) matrices[i * 16 + 15] = 1;
      held.forEach(({ actor, card, pipe, ember }, index) => {
        const active = isSocializing(actor);
        card.setEnabled(active && actor.brain?.state === 'cards');
        const smoking = active && actor.brain?.state === 'smoke';
        pipe.setEnabled(smoking);
        ember.setEnabled(smoking);
        if (!smoking) return;
        activeSmoke = true;
        for (let i = 0; i < 3; i++) {
          const life = ((combat.time + actor.brain!.social!.phase) * 0.5 + i / 3) % 1;
          const size = Math.sin(life * Math.PI) * 0.11;
          const offset = (index * 3 + i) * 16;
          const p = actor.position;
          matrices[offset] = matrices[offset + 5] = matrices[offset + 10] = size;
          matrices[offset + 12] =
            p.x +
            Math.sin(p.heading) * 0.35 +
            Math.cos(p.heading) * 0.25 +
            Math.sin(life * 8) * 0.05;
          matrices[offset + 13] = p.h + 1.4 + life * 0.65;
          matrices[offset + 14] = p.z + Math.cos(p.heading) * 0.35 - Math.sin(p.heading) * 0.25;
        }
      });
      updateInstanceMatrices(smoke, matrices, activeSmoke);
      for (const { mesh, group } of balls) {
        const pass = hackySackPass(group, combat.ecs, combat.time);
        if (!pass) {
          mesh.position.y = group.center.h + 0.1;
          mesh.scaling.setAll(1);
          continue;
        }
        const from = combat.actor(pass.from)!.position;
        const to = combat.actor(pass.to)!.position;
        const u = pass.progress;
        mesh.position.set(
          from.x * (1 - u) + to.x * u + (group.center.x - (from.x * (1 - u) + to.x * u)) * 0.2,
          group.center.h + 0.15 + 4 * u * (1 - u) * 0.85,
          from.z * (1 - u) + to.z * u + (group.center.z - (from.z * (1 - u) + to.z * u)) * 0.2,
        );
        // Stretch along the parabolic flight tangent, rather than a spinning local axis.
        const dx = (to.x - from.x) * 0.8,
          dz = (to.z - from.z) * 0.8;
        mesh.rotation.y = Math.atan2(dx, dz);
        mesh.rotation.x = Math.atan2(Math.hypot(dx, dz), 3.4 * (1 - 2 * u));
        const stretch = sampleCurve(u, [
          [0, 0.78],
          [0.08, 1.18],
          [0.3, 1],
          [0.75, 1],
          [0.93, 1.12],
          [1, 0.78],
        ]);
        const scale = volumeScale(stretch, 1 / Math.sqrt(stretch));
        mesh.scaling.set(scale.x, scale.y, scale.z);
      }
    },
  };
}
