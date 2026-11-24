import type { ECS } from './ecs.ts';
import type { PlayableLayout } from './worldTypes.ts';
import type { DungeonScene } from './buildDungeon.ts';
import { animateDoor, bindDoor, bindChest } from './machines/world/interactions.ts';

/** Register layout data by reference, so interactions and ECS never diverge. */
export function registerWorld(ecs: ECS, world: PlayableLayout): void {
  for (const tile of world.tiles.values()) ecs.create(`tile:${tile.x},${tile.z}`).add('tile', tile);
  for (const room of world.rooms) ecs.create(`room:${room.id}`).add('room', room);
  for (const prop of world.props)
    ecs
      .create(`prop:${prop.id}`)
      .add('prop', prop)
      .add('transform', { x: prop.x, z: prop.z, h: prop.h, heading: prop.rotation });
  for (const interaction of world.entities) {
    const entity = ecs
      .create(interaction.id)
      .add('interaction', interaction)
      .add('transform', {
        x: interaction.x,
        z: interaction.z,
        h: interaction.h,
        heading: interaction.rotation ?? 0,
      });
    if (interaction.type === 'door') {
      bindDoor(interaction);
      entity.add('door', interaction);
    }
    if (interaction.type === 'chest') bindChest(interaction);
  }
  for (const blocker of world.blockers) {
    const entity =
      ecs.get(`prop:${blocker.id}`) ?? ecs.get(blocker.id) ?? ecs.create(`obstacle:${blocker.id}`);
    entity.add('obstacle', blocker);
  }
}

export function registerDungeonRendering(ecs: ECS, dungeon: DungeonScene): void {
  // Share authored obstacle heights with death physics, including low tables/chests. Door state
  // remains live and is sampled separately. No meshes enter the pure physics backend.
  ecs.get('run')?.add(
    'physicalObstacles',
    dungeon.obstacles
      .filter((o) => o.mesh.name !== 'door collider')
      .map((o, i) => {
        const b = o.mesh.getBoundingInfo().boundingBox;
        return {
          name: `prop:${i}`,
          position: [o.x, b.centerWorld.y, o.z],
          size: [o.w, b.maximumWorld.y - b.minimumWorld.y, o.d],
          yaw: 0,
          top: b.maximumWorld.y,
        };
      }),
  );
  dungeon.creatures.forEach((creature, i) =>
    ecs
      .create(`ambient-creature:${i}`)
      .add('ambientMotion', creature)
      .add('render', { root: creature.root, meshes: creature.root.getChildMeshes() }),
  );
  dungeon.animated.forEach((object, i) =>
    ecs
      .create(`floating:${i}`)
      .add('floating', object)
      .add('render', { root: null, meshes: [object.mesh] }),
  );
  dungeon.lights.forEach((light, i) => ecs.create(`light-source:${i}`).add('lightSource', light));
  dungeon.walls.forEach((wall, i) =>
    ecs
      .create(`cutaway:${i}`)
      .add('cutaway', wall)
      .add('render', { root: null, meshes: wall.meshes }),
  );
  for (const portrait of dungeon.portraits)
    ecs
      .get(portrait.entity.id)
      ?.add('portrait', portrait)
      .add('render', { root: portrait.root, meshes: portrait.root.getChildMeshes() });
}

/** Door animation/collision is shared by keyboard, clicked doors and AI requests. */
export function updateDoors(ecs: ECS, dt: number): void {
  for (const entity of ecs.query('door')) {
    const door = entity.require('door');
    const dx = door.axis === 'x' ? 0.55 : 1.5,
      dz = door.axis === 'x' ? 1.5 : 0.55;
    const occupied = ecs.living.doorwayOccupied(
      {
        minX: door.x - dx,
        maxX: door.x + dx,
        minZ: door.z - dz,
        maxZ: door.z + dz,
        minY: door.h - 1.2,
        maxY: door.h + 1.2,
      },
      (p) =>
        Math.abs(p.h - door.h) < 1.2 && Math.abs(p.x - door.x) < dx && Math.abs(p.z - door.z) < dz,
    );
    animateDoor(door, occupied, dt);
  }
}
