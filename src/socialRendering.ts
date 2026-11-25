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
    const hand = actor.entity.require('rig').root;
    const binding = actor.entity.require('rigPose');
    const card = part(
      scene,
      materials.bone,
      `${actor.id}:held card`,
      [0.17, 0.025, 0.24],
      [0, 0, 0],
      hand,
      shadow,
    );
    const pipe = part(
      scene,
      materials.wood,
      `${actor.id}:pipe`,
      [0.22, 0.045, 0.045],
      [0, 0, 0],
      hand,
      shadow,
    );
    const ember = part(
      scene,
      materials.eyes,
      `${actor.id}:pipe ember`,
      [0.055, 0.05, 0.055],
      [0, 0, 0],
      hand,
    );
    const smoking = () => isSocializing(actor) && actor.brain?.state === 'smoke';
    binding.attach(
      card,
      'card',
      [0, 0, 0.1],
      () => isSocializing(actor) && actor.brain?.state === 'cards',
    );
    binding.attach(pipe, 'pipe', [-0.08, 0, 0], smoking);
    binding.attach(ember, 'pipe', [-0.18, 0.02, 0], smoking);
    actor.entity.require('render').meshes.push(card, pipe, ember);
    return { actor, ember };
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
      held.forEach(({ actor, ember }, index) => {
        const active = isSocializing(actor);
        const smoking = active && actor.brain?.state === 'smoke';
        if (!smoking) return;
        ember.computeWorldMatrix(true);
        const origin = ember.getAbsolutePosition();
        activeSmoke = true;
        for (let i = 0; i < 3; i++) {
          const life = ((combat.time + actor.brain!.social!.phase) * 0.5 + i / 3) % 1;
          const size = Math.sin(life * Math.PI) * 0.11;
          const offset = (index * 3 + i) * 16;
          matrices[offset] = matrices[offset + 5] = matrices[offset + 10] = size;
          matrices[offset + 12] = origin.x + Math.sin(life * 8) * 0.05;
          matrices[offset + 13] = origin.y + life * 0.65;
          matrices[offset + 14] = origin.z;
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
        const foot = (id: string) => {
          const binding = combat.actor(id)!.entity.require('rigPose');
          const p = binding.jointPoint('rightFoot', [
            0,
            0.07,
            binding.pose.definition.profile.soleForward,
          ]);
          return { x: p[0], h: p[1], z: p[2] };
        };
        const from = foot(pass.from);
        const to = foot(pass.to);
        const u = pass.progress;
        mesh.position.set(
          from.x * (1 - u) + to.x * u,
          from.h * (1 - u) + to.h * u + 0.09 + 4 * u * (1 - u) * 0.85,
          from.z * (1 - u) + to.z * u,
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
