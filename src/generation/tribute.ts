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
export function findTributePlan(world: World): TributeBlueprint | null {
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
    return chosen.length === count ? chosen : null;
  };
  const stairs = points('stairs', 4);
  if (!stairs) return null;
  const cargo = stairs.map((p, i) => ({ id: `tribute:cargo:${i}`, ...p }));
  const stable = points('stable', 1);
  if (!stable) return null;
  const exit = { id: TRIBUTE.exit, ...stable[0] };
  return { cargo, exit, workers: [0, 1, 2, 3].map((i) => `kobold:stairs:${i}`) };
}

export interface TributeBlueprint {
  cargo: (Spawn & { id: string })[];
  exit: Spawn & { id: string };
  workers: string[];
}
export function planTribute(world: World): TributeBlueprint {
  const plan = findTributePlan(world);
  if (!plan) throw new Error('Missing reserved tribute sites');
  return plan;
}
export function findTributeSites(world: World): TributeBlueprint | null {
  return world.tribute ? structuredClone(world.tribute) : null;
}
export function tributeBlueprint(world: World): TributeBlueprint {
  const sites = findTributeSites(world);
  if (!sites) throw new Error('Missing reserved tribute sites');
  return sites;
}
