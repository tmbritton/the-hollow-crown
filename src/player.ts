import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { part } from './geometry.ts';
import { tileAt, heightAt } from './world.ts';
import { createActor, moveActor, stopActor, teleportActor } from './actors.ts';
import { bindActorCollision } from './actorRendering.ts';
import type { ECS } from './ecs.ts';
import { MOVEMENT_KEYS, RUN_SPEED, WALK_SPEED } from './locomotion.ts';
import type { Scene } from '@babylonjs/core/scene';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { Materials, MaterialName } from './materials.ts';
import type { Triple, World } from './worldTypes.ts';
import '@babylonjs/core/Collisions/collisionCoordinator';
import '@babylonjs/core/Rendering/edgesRenderer';

export type Player = ReturnType<typeof createPlayer>;

export function createPlayer(
  scene: Scene,
  materials: Materials,
  shadow: ShadowGenerator,
  world: World,
  ecs: ECS,
) {
  const spawn = world.spawn;
  const actor = createActor(ecs, world, 'player', 'player', spawn);
  const root = new TransformNode('the wanderer', scene);
  root.position.set(spawn.x, spawn.h, spawn.z);
  const body = new TransformNode('body', scene);
  body.parent = root;
  const p = (mat: MaterialName, name: string, size: Triple, pos: Triple, parent = body) =>
    part(scene, materials[mat], name, size, pos, parent, shadow);
  p('dark', 'robe', [0.68, 0.73, 0.43], [0, 0.93, 0]);
  p('cloth', 'surcoat', [0.58, 0.66, 0.12], [0, 0.96, 0.27]);
  p('gold', 'belt', [0.73, 0.12, 0.49], [0, 0.72, 0]);
  p('gold', 'buckle', [0.15, 0.17, 0.06], [0, 0.73, 0.28]);
  p('cloth', 'split skirt', [0.8, 0.32, 0.5], [0, 0.52, 0]);
  p('dark', 'hood', [0.61, 0.58, 0.57], [0, 1.57, 0]);
  p('bone', 'mask', [0.42, 0.38, 0.12], [0, 1.53, 0.31]);
  p('dark', 'visor', [0.43, 0.095, 0.025], [0, 1.58, 0.38]);
  for (const x of [-0.12, 0.12])
    p('eyes', 'watchful eyes', [0.075, 0.035, 0.03], [x, 1.585, 0.399]);
  p('gold', 'hood crest', [0.12, 0.19, 0.48], [0, 1.92, -0.03]);
  for (const x of [-0.43, 0.43]) {
    p('iron', 'pauldron', [0.29, 0.29, 0.49], [x, 1.28, 0]);
    p('gold', 'shoulder trim', [0.31, 0.07, 0.5], [x, 1.4, 0]);
  }
  const arms: TransformNode[] = [],
    legs: TransformNode[] = [];
  for (const sign of [-1, 1]) {
    const arm = new TransformNode('arm', scene);
    arm.parent = body;
    arm.position.set(sign * 0.48, 1.18, 0);
    p('dark', 'sleeve', [0.21, 0.4, 0.26], [0, -0.18, 0], arm);
    p('skin', 'glove', [0.23, 0.23, 0.27], [0, -0.46, 0], arm);
    arms.push(arm);
    const leg = new TransformNode('leg', scene);
    leg.parent = root;
    leg.position.set(sign * 0.2, 0.5, 0);
    p('dark', 'boot', [0.28, 0.42, 0.4], [0, -0.24, 0.06], leg);
    p('iron', 'greave', [0.29, 0.23, 0.13], [0, -0.13, 0.23], leg);
    legs.push(leg);
  }
  const shield = p('iron', 'shield', [0.14, 0.7, 0.55], [-0.17, -0.3, 0.07], arms[0]);
  p('gold', 'shield boss', [0.08, 0.17, 0.17], [-0.27, -0.3, 0.07], arms[0]);
  p('iron', 'sword blade', [0.12, 0.83, 0.055], [0, -0.78, 0.14], arms[1]);
  p('gold', 'sword guard', [0.33, 0.08, 0.12], [0, -0.39, 0.14], arms[1]);
  const cape = p('cloth', 'cape', [0.71, 0.91, 0.12], [0, 0.91, -0.31]);
  cape.rotation.x = -0.16;
  shield.enableEdgesRendering();
  const proxy = bindActorCollision(actor, scene, world);
  proxy.position.set(spawn.x, spawn.h + 0.72, spawn.z);
  const marker = MeshBuilder.CreateTorus(
    'wanderer ground ring',
    { diameter: 1.1, thickness: 0.025, tessellation: 32 },
    scene,
  );
  marker.material = materials.gold;
  marker.isPickable = false;
  const destinationMarker = MeshBuilder.CreateTorus(
    'click destination',
    { diameter: 0.7, thickness: 0.045, tessellation: 32 },
    scene,
  );
  destinationMarker.material = materials.eyes;
  destinationMarker.isPickable = false;
  destinationMarker.setEnabled(false);
  const navigator = actor.navigator;
  const motion = actor.motion;
  const shadowMeshes = root.getChildMeshes();
  for (const mesh of shadowMeshes) {
    mesh.receiveShadows = true;
    shadow.addShadowCaster(mesh);
  }
  const teleport = (x: number, z: number, world: World) => {
    teleportActor(actor, world, { x, z });
    destinationMarker.setEnabled(false);
    const h = heightAt(world, x, z) ?? 0;
    proxy.position.set(x, h + 0.72, z);
    proxy.computeWorldMatrix(true);
    root.position.set(x, h, z);
  };
  const player = {
    actor,
    root,
    body,
    proxy,
    marker,
    destinationMarker,
    navigator,
    motion,
    arms,
    legs,
    cape,
    shadowMeshes,
    teleport,
    get health() {
      return actor.health.current;
    },
    set health(value: number) {
      actor.health.current = value;
    },
    moving: false,
    get heading() {
      return actor.position.heading;
    },
    set heading(value: number) {
      actor.position.heading = value;
    },
  };
  actor.entity.add('render', { root, meshes: shadowMeshes });
  actor.entity.add('rig', { root, body, arms, legs, cape, attackBlend: 0, attackTime: 0 });
  root.rotation.y = player.heading;
  return player;
}

/** Modal/focus changes and teleports stop immediately rather than resuming stale intent. */
export function stopPlayer(player: Player): void {
  stopActor(player.actor);
  player.destinationMarker.setEnabled(false);
  player.moving = false;
  player.body.rotation.x = 0;
  player.body.rotation.y = 0;
  player.body.position.y = 0;
  for (const limb of [...player.arms, ...player.legs]) limb.rotation.x = 0;
  player.cape.rotation.x = -0.16;
  player.actor.entity.require('rig').attackBlend = 0;
}

export function movePlayer(
  player: Player,
  world: World,
  input: ReadonlySet<string>,
  camera: ArcRotateCamera,
  dt: number,
  locked = false,
) {
  const horizontal =
    (input.has('KeyD') || input.has('ArrowRight') ? 1 : 0) -
    (input.has('KeyA') || input.has('ArrowLeft') ? 1 : 0);
  const vertical =
    (input.has('KeyW') || input.has('ArrowUp') ? 1 : 0) -
    (input.has('KeyS') || input.has('ArrowDown') ? 1 : 0);
  const forward = new Vector3(-Math.cos(camera.alpha), 0, -Math.sin(camera.alpha));
  const right = new Vector3(forward.z, 0, -forward.x);
  const direction = forward.scale(vertical).add(right.scale(horizontal));
  const keyboard = [...MOVEMENT_KEYS].some((code) => input.has(code));
  if (keyboard) player.navigator.cancel();
  moveActor(
    player.actor,
    world,
    {
      direction: keyboard ? { x: direction.x, z: direction.z } : undefined,
      speed: input.has('ShiftLeft') || input.has('ShiftRight') ? RUN_SPEED : WALK_SPEED,
      locked,
    },
    dt,
  );
  const p = player.actor.position;
  player.root.position.set(p.x, p.h, p.z);
  player.moving = player.motion.actualSpeed > 0.08;
  const destination = player.navigator.destination;
  player.destinationMarker.setEnabled(destination !== null);
  if (destination) {
    player.destinationMarker.position.set(
      destination.x,
      (heightAt(world, destination.x, destination.z) ?? 0) + 0.13,
      destination.z,
    );
    player.destinationMarker.scaling.setAll(1 + Math.sin(player.motion.animation.time * 7) * 0.1);
  }
  player.marker.position.set(
    player.root.position.x,
    player.root.position.y + 0.035,
    player.root.position.z,
  );
  return tileAt(world, player.root.position.x, player.root.position.z);
}
