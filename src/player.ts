import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { part } from './geometry.ts';
import { tileAt, heightAt } from './world.ts';
import { createActor, moveActor, stopActor, teleportActor } from './actors.ts';
import { bindActorCollision, resetActorRig } from './actorRendering.ts';
import { bindHumanoid } from './rigs/bindings.ts';
import { SHIELD_GEOMETRY } from './rigs/shield.ts';
import { profiles } from './rigs/humanoid.ts';
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
  body.setPivotPoint(new Vector3(0, 0.55, 0));
  const p = (mat: MaterialName, name: string, size: Triple, pos: Triple, parent = body) =>
    part(scene, materials[mat], name, size, pos, parent, shadow);
  const headMeshes: TransformNode[] = [];
  const hp = (mat: MaterialName, name: string, size: Triple, pos: Triple) => {
    const mesh = p(mat, name, size, pos);
    headMeshes.push(mesh);
    return mesh;
  };
  p('dark', 'robe', [0.68, 0.73, 0.43], [0, 0.93, 0]);
  p('cloth', 'surcoat', [0.58, 0.66, 0.12], [0, 0.96, 0.27]);
  p('gold', 'belt', [0.73, 0.12, 0.49], [0, 0.72, 0]);
  p('gold', 'buckle', [0.15, 0.17, 0.06], [0, 0.73, 0.28]);
  p('cloth', 'split skirt', [0.8, 0.32, 0.5], [0, 0.52, 0]);
  hp('dark', 'hood', [0.61, 0.58, 0.57], [0, 1.57, 0]);
  hp('bone', 'mask', [0.42, 0.38, 0.12], [0, 1.53, 0.31]);
  hp('dark', 'visor', [0.43, 0.095, 0.025], [0, 1.58, 0.38]);
  for (const x of [-0.12, 0.12])
    hp('eyes', 'watchful eyes', [0.075, 0.035, 0.03], [x, 1.585, 0.399]);
  hp('gold', 'hood crest', [0.12, 0.19, 0.48], [0, 1.92, -0.03]);
  for (const x of [-0.43, 0.43]) {
    p('iron', 'pauldron', [0.29, 0.29, 0.49], [x, 1.28, 0]);
    p('gold', 'shoulder trim', [0.31, 0.07, 0.5], [x, 1.4, 0]);
  }
  const arms: TransformNode[] = [],
    forearms: TransformNode[] = [],
    legs: TransformNode[] = [],
    knees: TransformNode[] = [],
    feet: TransformNode[] = [];
  for (const sign of [-1, 1]) {
    const arm = new TransformNode('arm', scene);
    arm.parent = body;
    arm.position.set(sign * 0.48, 1.18, 0);
    p('dark', 'sleeve', [0.21, 0.3, 0.26], [0, -0.14, 0], arm);
    const forearm = new TransformNode('forearm', scene);
    forearm.parent = arm;
    forearm.position.y = -0.28;
    p('skin', 'glove', [0.23, 0.29, 0.27], [0, -0.15, 0], forearm);
    arms.push(arm);
    forearms.push(forearm);
    const leg = new TransformNode('leg', scene);
    leg.parent = root;
    leg.position.set(sign * 0.2, 0.55, 0);
    p('dark', 'thigh', [0.24, 0.25, 0.26], [0, -0.125, 0], leg);
    const knee = new TransformNode('knee', scene);
    knee.parent = leg;
    knee.position.y = -0.25;
    p('dark', 'shin', [0.23, 0.25, 0.24], [0, -0.125, 0], knee);
    p('iron', 'greave', [0.25, 0.23, 0.1], [0, -0.125, 0.15], knee);
    const foot = new TransformNode('foot', scene);
    foot.parent = knee;
    foot.position.y = -0.25;
    p('dark', 'boot', [0.28, 0.14, 0.4], [0, 0.02, 0.06], foot);
    legs.push(leg);
    knees.push(knee);
    feet.push(foot);
  }
  const shieldMount = new TransformNode('shield mount', scene);
  shieldMount.parent = root;
  const shield = p(
    'iron',
    'shield',
    [...SHIELD_GEOMETRY.player.size],
    [...SHIELD_GEOMETRY.player.center],
    shieldMount,
  );
  p('gold', 'shield boss', [0.08, 0.17, 0.17], [-0.27, -0.02, 0.07], shieldMount);
  p('dark', 'shield hand strap', [0.18, 0.09, 0.16], [-0.08, -0.12, -0.28], shieldMount);
  const weapon = new TransformNode('sword grip', scene);
  weapon.parent = root;
  p('iron', 'sword blade', [0.12, 0.83, 0.055], [0, -0.48, 0], weapon);
  p('gold', 'sword guard', [0.33, 0.08, 0.12], [0, -0.07, 0], weapon);
  p('dark', 'sword handle', [0.09, 0.18, 0.09], [0, 0.04, 0], weapon);
  const stowed = new TransformNode('wanderer back equipment', scene);
  stowed.parent = root;
  const stowedEquipment = [
    p('iron', 'stowed wanderer shield', [0.55, 0.7, 0.14], [-0.2, 0, -0.08], stowed),
    p('gold', 'stowed wanderer shield boss', [0.17, 0.17, 0.08], [-0.2, 0, -0.18], stowed),
    p('iron', 'stowed wanderer sword', [0.12, 0.83, 0.055], [0.25, -0.12, -0.06], stowed),
  ];
  const cape = p('cloth', 'cape', [0.71, 0.91, 0.12], [0, 0.91, -0.31]);
  cape.setPivotPoint(new Vector3(0, 0.455, 0));
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
    resetActorRig(actor.entity.require('rig'), actor.position);
    destinationMarker.setEnabled(false);
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
    forearms,
    legs,
    knees,
    feet,
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
  actor.entity.add('rig', {
    root,
    body,
    arms,
    forearms,
    legs,
    knees,
    feet,
    footPlants: [{ anchor: null }, { anchor: null }],
    cape,
    shield: shieldMount,
    weapon,
    stowed,
    equipment: [...weapon.getChildMeshes(), ...shieldMount.getChildMeshes()],
    stowedEquipment,
  });
  root.rotation.y = player.heading;
  bindHumanoid(actor.entity, profiles.player, headMeshes);
  return player;
}

/** Modal/focus changes and teleports stop immediately rather than resuming stale intent. */
export function stopPlayer(player: Player): void {
  stopActor(player.actor);
  player.destinationMarker.setEnabled(false);
  player.moving = false;
  resetActorRig(player.actor.entity.require('rig'), player.actor.position);
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
  player.marker.position.set(p.x, p.h + 0.035, p.z);
  return tileAt(world, p.x, p.z);
}
