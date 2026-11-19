import { seedEnemies } from '../combat.ts';
import { ECS } from '../ecs.ts';
import { key, reachableTileDistances, tileAt, validateDungeon } from '../world.ts';
import type { World } from '../worldTypes.ts';
import type { GenerationTrace } from './identity.ts';

/** Analyze an initial blueprint in an isolated registry; never sample mutable run state. */
export function createGenerationReport(world: World, trace: GenerationTrace) {
  if (trace.identity.seed !== world.seed) throw new Error('Generation report seed mismatch');
  if (trace.acceptedAttempt !== world.attempt)
    throw new Error('Generation report attempt mismatch');
  const before = reachableTileDistances(world);
  const after = reachableTileDistances(world, true);
  const altar = world.entities.find((entity) => entity.type === 'altar');
  const throne = world.entities.find((entity) => entity.type === 'throne');
  const fromAltar = altar
    ? reachableTileDistances(world, true, altar.approach)
    : new Map<string, number>();
  const spawnToAltar = altar ? (before.get(key(altar.approach.x, altar.approach.z)) ?? null) : null;
  const altarToThrone = throne
    ? (fromAltar.get(key(throne.approach.x, throne.approach.z)) ?? null)
    : null;
  const enemies = seedEnemies(new ECS(), world);
  const encounters = enemies
    .map((actor) => ({
      id: actor.id,
      kind: actor.kind,
      room: tileAt(world, actor.position.x, actor.position.z)?.room ?? null,
      x: actor.position.x,
      z: actor.position.z,
      h: actor.position.h,
      group: actor.brain?.pack || null,
      activity: actor.brain?.social?.activity ?? null,
      inhabitant: structuredClone(actor.entity.get('inhabitant') ?? null),
    }))
    .sort((a, b) => compareIds(a.id, b.id));
  const rooms = world.rooms
    .map((room) => {
      const walkable = [...world.tiles.values()].filter(
        (tile) => tile.room === room.id && !tile.blocked && tile.surface !== 'lava',
      );
      // A conservative geometric proxy: a full 3x3 supported neighborhood, not actor clearance.
      const openAreaTiles = walkable.filter((tile) =>
        [-1, 0, 1].every((dx) =>
          [-1, 0, 1].every((dz) => {
            const neighbor = tileAt(world, tile.x + dx, tile.z + dz);
            return (
              neighbor &&
              neighbor.room === room.id &&
              !neighbor.blocked &&
              neighbor.surface !== 'lava' &&
              Math.abs(neighbor.h - tile.h) <= 0.65
            );
          }),
        ),
      ).length;
      return {
        id: room.id,
        name: room.name,
        shape: room.shape,
        x: room.x,
        z: room.z,
        h: room.h,
        w: room.w,
        d: room.d,
        degree: world.connections.filter((c) => c.a === room.id || c.b === room.id).length,
        beforeAltar: before.has(key(room.x, room.z)),
        afterAltar: after.has(key(room.x, room.z)),
        walkableTiles: walkable.length,
        openAreaTiles,
        enemies: encounters.filter((e) => e.room === room.id).length,
      };
    })
    .sort((a, b) => compareIds(a.id, b.id));
  const connections = world.connections
    .map((c) => ({
      id: c.id,
      a: c.a,
      b: c.b,
      door: c.door ?? null,
      axis: c.axis,
      x: c.x,
      z: c.z,
      distance: c.distance,
      points: c.points.map((p) => ({ x: p.x, z: p.z })),
    }))
    .sort((a, b) => compareIds(a.id, b.id));
  const unseen = new Set(rooms.map((room) => room.id));
  let components = 0;
  for (const room of rooms) {
    if (!unseen.delete(room.id)) continue;
    components++;
    const queue = [room.id];
    for (let i = 0; i < queue.length; i++)
      for (const c of connections) {
        const next = c.a === queue[i] ? c.b : c.b === queue[i] ? c.a : null;
        if (next && unseen.delete(next)) queue.push(next);
      }
  }
  return {
    schemaVersion: 1 as const,
    trace: structuredClone(trace),
    keep: structuredClone(world.keep),
    scenes: structuredClone(world.scenes),
    bounds: { ...world.bounds },
    graph: {
      components,
      loops: connections.length - rooms.length + components,
      branches: rooms.filter((r) => r.degree >= 3).length,
      deadEnds: rooms.filter((r) => r.degree === 1).length,
    },
    rooms,
    connections,
    encounters,
    progression: {
      distanceUnit: 'four-neighbor tile steps; ordinary doors operable' as const,
      beforeAltarTiles: before.size,
      afterAltarTiles: after.size,
      spawnToAltar,
      altarToThrone,
      requiredRoute:
        spawnToAltar !== null && altarToThrone !== null ? spawnToAltar + altarToThrone : null,
    },
    resources: {
      tiles: world.tiles.size,
      props: world.props.length,
      blockers: world.blockers.length,
      interactions: world.entities.length,
      doors: world.entities.filter((e) => e.type === 'door').length,
      portraits: world.entities.filter((e) => e.type === 'portrait').length,
      enemies: encounters.length,
      socialGroups: new Set(enemies.flatMap((e) => (e.brain?.social ? [e.brain.social.id] : [])))
        .size,
    },
    validationErrors: validateDungeon(world),
  };
}

export type GenerationReport = ReturnType<typeof createGenerationReport>;

/** Code-point order keeps exported reports independent of the host locale. */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
