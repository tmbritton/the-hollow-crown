import { generateDungeon } from '../src/world.ts';
import { createActor } from '../src/actors.ts';
import { seedEnemies } from '../src/combat.ts';
import { ECS } from '../src/ecs.ts';
import { RouteBudget } from '../src/routeBudget.ts';
import { Navigator } from '../src/navigation.ts';

/** Measure planning only, with the same frozen roster for both scheduling policies. */
export function burst(seed: string) {
  const w = generateDungeon(seed),
    ecs = new ECS(),
    player = createActor(ecs, w, 'player', 'player', w.spawn),
    enemies = seedEnemies(ecs, w);
  for (const d of w.entities) if (d.type === 'door' && !d.locked) d.open = true;
  const far = w.rooms
    .filter((r) => r.id !== 'throne')
    .sort(
      (a, b) =>
        Math.hypot(b.x - w.spawn.x, b.z - w.spawn.z) - Math.hypot(a.x - w.spawn.x, a.z - w.spawn.z),
    )[0];
  const actors = [
    enemies.find((a) => a.id === 'kobold:treasury:0')!,
    enemies.find((a) => a.id === 'goblin:smithy:0')!,
    player,
  ];
  const goals = [far, w.roomById.throne, w.roomById.throne];
  function measure(scheduled: boolean) {
    const pool = new RouteBudget(),
      nav = actors.map((a) => new Navigator(w, a.navigator.occupancy));
    if (scheduled) nav.forEach((n, i) => n.scheduleWith(pool, () => actors[i].position));
    const ms: number[] = [],
      latency = [0, 0, 0];
    let t = performance.now();
    nav.forEach((n, i) =>
      n.request(actors[i].position, goals[i], { openDoors: i !== 2, partial: i === 2 }),
    );
    ms.push(performance.now() - t);
    while (pool.size && pool.ticks < 1000) {
      nav.forEach((n, i) => {
        if (n.pending) latency[i]++;
      });
      t = performance.now();
      pool.tick();
      ms.push(performance.now() - t);
    }
    if (pool.size) throw Error('unbounded completion');
    return { ms, latency, paths: nav.map((n) => n.path) };
  }
  function small() {
    const pool = new RouteBudget(),
      from = w.spawn,
      to = { x: from.x + 0.2, z: from.z };
    const ns = Array.from({ length: 24 }, () => new Navigator(w, player.navigator.occupancy));
    for (const n of ns) n.scheduleWith(pool, () => from);
    let t = performance.now();
    const results = ns.map((n) => n.request(from, to));
    const chunks = [performance.now() - t];
    while (pool.size && pool.ticks < 20) {
      t = performance.now();
      pool.tick();
      chunks.push(performance.now() - t);
    }
    if (ns.some((n) => !n.destination)) throw Error('short result missing');
    return { chunks, immediate: results.filter((r) => r === 'ready').length };
  }
  return Array.from({ length: 5 }, () => {
    const sync = measure(false),
      shared = measure(true);
    if (JSON.stringify(sync.paths) !== JSON.stringify(shared.paths)) throw Error('path parity');
    return { sync: sync.ms[0], chunks: shared.ms, latency: shared.latency, small: small() };
  });
}
