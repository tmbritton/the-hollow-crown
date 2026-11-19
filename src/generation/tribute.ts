import type { World, Spawn } from '../worldTypes.ts';
import { Navigator } from '../navigation.ts';
import { randomFrom } from './random.ts';

export const TRIBUTE = {
  objective: 'tribute:carry-away',
  exit: 'tribute:exit',
  pickupSeconds: 20,
  deliverySeconds: 8,
} as const;

/** Small passable cargo and a floor hatch reuse the broad reserved room-center network.
 * No late solid decoration: the network was protected before furnishings and populations.
 * At most 81 candidates per room, no RNG shared with keep/layout/art. */
export function planTribute(world: World) {
  const random = randomFrom(`${world.seed}:tribute-v1`);
  const nav = new Navigator(world);
  const points = (room: 'stairs' | 'stable', count: number) => {
    const r = world.roomById[room];
    const candidates = [...world.tiles.values()]
      .filter(
        (t) =>
          t.room === room &&
          Math.abs(t.x - r.x) <= 4 &&
          Math.abs(t.z - r.z) <= 4 &&
          t.surface === 'stone' &&
          !t.ramp &&
          !t.blocked &&
          world.reserved.has(`${t.x},${t.z}`),
      )
      .sort((a, b) => a.x - b.x || a.z - b.z)
      .map((p) => ({ p, order: random() }))
      .sort((a, b) => a.order - b.order);
    const chosen: Spawn[] = [];
    for (const { p } of candidates) {
      if (chosen.length === count) break;
      if (
        chosen.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 2.4) ||
        world.entities.some(
          (e) => e.approach && Math.hypot(e.approach.x - p.x, e.approach.z - p.z) < 1.3,
        ) ||
        !nav.canStand(p)
      )
        continue;
      chosen.push({ x: p.x, z: p.z, h: p.h });
    }
    if (chosen.length !== count) throw new Error('Missing reserved tribute sites');
    return chosen;
  };
  const cargo = points('stairs', 4).map((p, i) => ({ id: `tribute:cargo:${i}`, ...p }));
  const exit = { id: TRIBUTE.exit, ...points('stable', 1)[0] };
  return { cargo, exit, workers: [0, 1, 2].map((i) => `kobold:stairs:${i}`) };
}

export type TributeBlueprint = ReturnType<typeof planTribute>;
export function tributeBlueprint(world: World): TributeBlueprint {
  if (!world.tribute) throw new Error('Missing reserved tribute sites');
  return structuredClone(world.tribute);
}
