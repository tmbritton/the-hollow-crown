import type { ECS } from './ecs.ts';
import type { World } from './worldTypes.ts';
import type { DungeonScene } from './buildDungeon.ts';

/** Register generated data by reference, so interactions and ECS never diverge. */
export function registerWorld(ecs: ECS, world: World): void {
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
    if (interaction.type === 'door') entity.add('door', interaction);
  }
  for (const blocker of world.blockers) {
    const entity =
      ecs.get(`prop:${blocker.id}`) ?? ecs.get(blocker.id) ?? ecs.create(`obstacle:${blocker.id}`);
    entity.add('obstacle', blocker);
  }
}

export function registerDungeonRendering(ecs: ECS, dungeon: DungeonScene): void {
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
    if (door.locked) door.open = false;
    const occupied = ecs.query('actor', 'transform', 'health').some((actor) => {
      const p = actor.require('transform');
      return (
        actor.require('health').current > 0 &&
        Math.abs(p.h - door.h) < 1.2 &&
        Math.abs(p.x - door.x) < (door.axis === 'x' ? 0.55 : 1.5) &&
        Math.abs(p.z - door.z) < (door.axis === 'x' ? 1.5 : 0.55)
      );
    });
    if (!door.open && !door.locked && (door.angle ?? 0) > 0.05 && occupied) door.open = true;
    door.angle =
      (door.angle ?? 0) +
      ((door.open ? Math.PI * 0.49 : 0) - (door.angle ?? 0)) * (1 - Math.exp(-7 * dt));
    if (door.pivot) door.pivot.rotation.y = door.angle;
    if (door.collider) door.collider.checkCollisions = !door.open || door.angle <= 1.2;
  }
}
