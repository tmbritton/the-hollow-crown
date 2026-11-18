import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { Ray } from '@babylonjs/core/Culling/ray';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { part } from './geometry.ts';
import { bindActorCollision } from './actorRendering.ts';
import type { CombatSystem } from './combat.ts';
import type { Actor } from './actors.ts';
import type { Materials, MaterialName } from './materials.ts';
import type { Triple } from './worldTypes.ts';
import '@babylonjs/core/Meshes/thinInstanceMesh';

export function createEnemyRendering(
  scene: Scene,
  combat: CombatSystem,
  materials: Materials,
  shadow: ShadowGenerator,
) {
  const pickActors = new Map<AbstractMesh, Actor>();
  const bars: { actor: Actor; root: TransformNode; fill: AbstractMesh }[] = [];
  for (const actor of combat.enemies) {
    const root = new TransformNode(actor.id, scene),
      body = new TransformNode(`${actor.id}:body`, scene);
    body.parent = root;
    root.position.set(actor.position.x, actor.position.h, actor.position.z);
    const skeleton = actor.kind === 'skeleton',
      goblin = actor.kind === 'goblin';
    const skin: MaterialName = skeleton ? 'bone' : goblin ? 'scales' : 'brick';
    const p = (mat: MaterialName, name: string, size: Triple, pos: Triple, parent = body) =>
      part(scene, materials[mat], `${actor.id}:${name}`, size, pos, parent, shadow);
    if (skeleton) {
      p('bone', 'spine', [0.13, 0.7, 0.15], [0, 1, 0]);
      for (const y of [0.83, 1.02, 1.21]) p('bone', 'ribs', [0.56, 0.095, 0.3], [0, y, 0]);
      p('bone', 'pelvis', [0.4, 0.2, 0.28], [0, 0.63, 0]);
      p('bone', 'skull', [0.48, 0.44, 0.4], [0, 1.64, 0]);
      p('bone', 'jaw', [0.32, 0.12, 0.31], [0, 1.36, 0.07]);
      for (const x of [-0.13, 0.13]) p('dark', 'eye socket', [0.13, 0.13, 0.03], [x, 1.65, 0.215]);
    } else {
      p(goblin ? 'moss' : 'dark', 'leather vest', [0.58, 0.55, 0.36], [0, 0.82, 0]);
      p(skin, 'head', [0.5, 0.4, 0.4], [0, 1.32, 0.06]);
      p(skin, goblin ? 'long nose' : 'snout', [goblin ? 0.17 : 0.34, 0.16, 0.28], [0, 1.26, 0.34]);
      for (const sign of [-1, 1]) {
        const ear = p(skin, 'pointed ear', [0.3, 0.14, 0.18], [sign * 0.32, 1.37, 0]);
        ear.rotation.z = sign * 0.4;
        p('eyes', 'eyes', [0.08, 0.055, 0.03], [sign * 0.14, 1.36, 0.28]);
        if (!goblin) p('bone', 'horn', [0.09, 0.24, 0.09], [sign * 0.2, 1.61, 0]);
      }
      if (goblin) p('dark', 'hood', [0.54, 0.16, 0.47], [0, 1.57, -0.02]);
      else {
        const tail = p('brick', 'tail', [0.13, 0.13, 0.7], [0, 0.48, -0.5]);
        tail.rotation.x = -0.25;
        p('cloth', 'pack sash', [0.13, 0.55, 0.39], [0.1, 0.84, 0]);
      }
    }
    const arms: TransformNode[] = [],
      legs: TransformNode[] = [];
    for (const sign of [-1, 1]) {
      const arm = new TransformNode(`${actor.id}:arm`, scene);
      arm.parent = body;
      arm.position.set(sign * (skeleton ? 0.35 : 0.37), skeleton ? 1.22 : 1.02, 0);
      p(skin, 'arm', [skeleton ? 0.12 : 0.18, 0.55, 0.18], [0, -0.25, 0], arm);
      arms.push(arm);
      const leg = new TransformNode(`${actor.id}:leg`, scene);
      leg.parent = root;
      leg.position.set(sign * 0.18, 0.55, 0);
      p(skin, 'shin', [skeleton ? 0.12 : 0.19, 0.45, 0.19], [0, -0.22, 0], leg);
      p(skeleton ? 'bone' : 'wood', 'foot', [0.22, 0.13, 0.34], [0, -0.48, 0.08], leg);
      legs.push(leg);
    }
    if (goblin) {
      p('wood', 'crossbow', [0.66, 0.11, 0.15], [0, -0.39, 0.24], arms[1]);
      p('iron', 'crossbow stock', [0.1, 0.13, 0.5], [0, -0.4, 0.23], arms[1]);
    } else {
      p('wood', 'weapon haft', [0.09, 0.7, 0.09], [0, -0.58, 0.12], arms[1]);
      p(
        'iron',
        skeleton ? 'rusted blade' : 'spear tip',
        [0.14, skeleton ? 0.55 : 0.32, 0.07],
        [0, -1.03, 0.12],
        arms[1],
      );
    }
    const meshes = root.getChildMeshes();
    actor.entity
      .add('render', { root, meshes })
      .add('rig', { root, body, arms, legs, attackBlend: 0, attackTime: 0 });
    bindActorCollision(actor, scene, combat.world);
    const pick = MeshBuilder.CreateBox(
      `${actor.id}:selection`,
      { width: 0.95, height: skeleton ? 1.95 : 1.65, depth: 0.85 },
      scene,
    );
    pick.parent = root;
    pick.position.y = skeleton ? 0.95 : 0.8;
    pick.isVisible = false;
    pick.isPickable = false;
    pickActors.set(pick, actor);
    const bar = new TransformNode(`${actor.id}:health`, scene);
    part(scene, materials.dark, 'health backing', [0.85, 0.065, 0.04], [0, 0, 0], bar);
    const fill = part(scene, materials.cloth, 'health fill', [0.8, 0.045, 0.045], [0, 0, 0], bar);
    bars.push({ actor, root: bar, fill });
  }
  const ring = MeshBuilder.CreateTorus(
    'hostile target',
    { diameter: 1.3, thickness: 0.055, tessellation: 32 },
    scene,
  );
  ring.material = materials.cloth;
  ring.isPickable = false;
  ring.setEnabled(false);
  const blood = new StandardMaterial('blood particles', scene);
  blood.diffuseColor = Color3.FromHexString('#ad1832');
  blood.emissiveColor = Color3.FromHexString('#39040a');
  blood.specularColor = Color3.Black();
  const makePool = (name: string, capacity: number, material: typeof blood | Materials['bone']) => {
    const mesh = MeshBuilder.CreateBox(name, { size: 1 }, scene);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    const matrices = new Float32Array(capacity * 16);
    for (let i = 0; i < capacity; i++) matrices[i * 16 + 15] = 1;
    mesh.thinInstanceSetBuffer('matrix', matrices, 16, false);
    return { mesh, matrices, capacity };
  };
  const pools = {
    blood: makePool('blood hit fragments', 192, blood),
    dust: makePool('bone dust', 192, materials.bone),
    projectile: makePool('crossbow bolts', 32, materials.bone),
  };
  return {
    pick(ray: Ray): { actor: Actor; distance: number } | null {
      for (const [mesh] of pickActors) mesh.computeWorldMatrix(true);
      const hit = scene.pickWithRay(
        ray,
        (mesh) => mesh.isEnabled() && !!pickActors.get(mesh)?.alive,
      );
      const actor = hit?.pickedMesh ? pickActors.get(hit.pickedMesh) : null;
      return actor && hit ? { actor, distance: hit.distance } : null;
    },
    update(): void {
      const target = combat.actor(combat.player.attack.target);
      ring.setEnabled(!!target?.alive);
      if (target) ring.position.set(target.position.x, target.position.h + 0.08, target.position.z);
      for (const bar of bars) {
        bar.root.setEnabled(
          bar.actor.alive &&
            (bar.actor.health.current < bar.actor.health.max || target?.id === bar.actor.id),
        );
        const p = bar.actor.position;
        bar.root.position.set(p.x, p.h + 2.2, p.z);
        bar.root.billboardMode = TransformNode.BILLBOARDMODE_ALL;
        bar.fill.scaling.x = Math.max(0.001, bar.actor.health.current / bar.actor.health.max);
      }
      for (const pool of Object.values(pools)) {
        pool.matrices.fill(0);
        for (let i = 0; i < pool.capacity; i++) pool.matrices[i * 16 + 15] = 1;
      }
      const counts = { blood: 0, dust: 0, projectile: 0 };
      for (const entity of [
        ...combat.ecs.query('particle', 'transform'),
        ...combat.ecs.query('projectile', 'transform'),
      ]) {
        const particle = entity.get('particle'),
          p = entity.require('transform');
        const kind = particle?.kind ?? 'projectile',
          pool = pools[kind],
          index = counts[kind]++;
        if (index >= pool.capacity) continue;
        const o = index * 16,
          size = particle
            ? particle.size * Math.min(1, (particle.life / particle.duration) * 2)
            : 0.1;
        pool.matrices[o] = size;
        pool.matrices[o + 5] = size;
        pool.matrices[o + 10] = particle ? size : 0.3;
        pool.matrices[o + 12] = p.x;
        pool.matrices[o + 13] = p.h;
        pool.matrices[o + 14] = p.z;
      }
      for (const pool of Object.values(pools)) pool.mesh.thinInstanceBufferUpdated('matrix');
    },
  };
}

export type EnemyRendering = ReturnType<typeof createEnemyRendering>;
