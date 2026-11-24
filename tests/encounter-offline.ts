// Bounded geometry/ordinary-input screening. This cannot produce timing evidence.
import { createActor, moveActor } from '../src/actors.ts';
import { CombatSystem, seedEnemies } from '../src/combat.ts';
import { ECS } from '../src/ecs.ts';
import { movement, recipe } from '../src/encounterRecipe.ts';
import { prepareLastEmber } from '../src/lastEmber.ts';
import { WALK_SPEED } from '../src/locomotion.ts';
import { RouteBudget } from '../src/routeBudget.ts';
import { prepareTribute } from '../src/tribute.ts';
import { generateDungeon } from '../src/world.ts';
import { registerWorld, updateDoors } from '../src/worldEntities.ts';

const dt = 1 / 60;
type Path = readonly (readonly [number, number])[];
function screen(seed: string, points: Path, reduced = false) {
  const world = generateDungeon(seed),
    ecs = new ECS(),
    budget = new RouteBudget();
  const gate = world.entities.find(
    (e) => e.type === 'door' && e.axis === 'x' && Math.abs(e.x - 14) < 3 && Math.abs(e.z) <= 2,
  );
  const door = gate?.type === 'door' ? gate : undefined;
  if (world.roomById.stairs.x !== 26 || world.roomById.stairs.z !== 0 || door?.locked)
    return 'different gates';
  const path: Path = door && door.z !== 0 ? [[0, door.z], [18, door.z], ...points] : points;
  ecs.create('run');
  registerWorld(ecs, world);
  const hero = createActor(ecs, world, 'player', 'player', world.spawn),
    p = hero.position;
  if (path.some(([x, z]) => !hero.navigator.canStand({ x, z }))) return 'blocked waypoint';
  const enemies = seedEnemies(ecs, world),
    combat = new CombatSystem(ecs, world, [hero, ...enemies], seed);
  if (enemies.length !== 24) return 'different roster';
  const ember = prepareLastEmber(ecs, world, hero).scenario;
  const tribute = prepareTribute(ecs, world, hero).scenario;
  for (const a of combat.actors)
    a.navigator.scheduleWith(budget, () => (a.alive ? a.position : null));
  const squads = ecs.query('koboldSquad').map((e) => e.require('koboldSquad'));
  const pack = ecs.get(recipe.pack)!.require('koboldSquad');
  if (reduced)
    for (const a of enemies.filter((a) => recipe.retire.some((id) => id === a.id)))
      combat.damage(a, a.health.max + 1);
  let waypoint = 0,
    pressed = false,
    last = '',
    minError = Infinity,
    alert = 0,
    rank = 0,
    open = 0;
  let rankSample: unknown;
  const edges: { tick: number; codes: string[] }[] = [];
  for (let tick = 1; tick <= recipe.warmup + recipe.maxTicks; tick++) {
    let codes: string[] = [];
    if (tick > recipe.warmup) {
      if (path[waypoint]) {
        codes = movement(p.x, p.z, path[waypoint]!);
        if (!codes.length) codes = path[++waypoint] ? movement(p.x, p.z, path[waypoint]!) : [];
      }
      const press =
        !!door && !pressed && p.x >= door.x - 1.45 && p.x < door.x && Math.abs(p.z - door.z) < 0.4;
      if (press && door) {
        pressed = true;
        door.open = true;
      }
      if (press || last !== codes.join())
        edges.push({ tick, codes: press ? [...codes, 'KeyE'] : codes });
      last = codes.join();
    }
    updateDoors(ecs, dt);
    budget.tick();
    ember.approachActivation();
    tribute.approachActivation();
    tribute.update();
    const locked = combat.pursue(hero, dt);
    const vertical = Number(codes.includes('KeyW')) - Number(codes.includes('KeyS'));
    const horizontal = Number(codes.includes('KeyD')) - Number(codes.includes('KeyA'));
    moveActor(
      hero,
      world,
      {
        direction: codes.length
          ? {
              x: -horizontal - Math.cos(recipe.cameraAlpha) * vertical,
              z: -vertical + Math.cos(recipe.cameraAlpha) * horizontal,
            }
          : undefined,
        speed: WALK_SPEED,
        locked,
      },
      dt,
    );
    combat.update(dt);
    if (
      tick <= recipe.warmup &&
      (squads.some((s) => s.active) || enemies.some((a) => a.alive && (a.brain?.memory ?? 0) > 0))
    )
      return `warm alert ${tick}`;
    if (pack.target?.id === 'player') {
      if (!alert) alert = tick;
      minError = Math.min(
        minError,
        Math.max(
          ...pack.living.map((m) => {
            const a = m.entity.require('transform'),
              b = pack.approach(m);
            return Math.hypot(a.x - b.x, a.z - b.z);
          }),
        ),
      );
      if (!rank && pack.state === 'engaging') {
        rank = tick;
        rankSample = {
          hero: { ...p },
          spear: pack.spear && { ...pack.spear.position },
          heading: pack.heading,
        };
      }
      if (!open && pack.state === 'opening') open = tick;
      if (rank && open && pack.state === 'attacking') {
        const resolved =
          ecs.query('projectile').some((e) => e.require('projectile').owner === pack.spear?.id) ||
          hero.health.current < hero.health.max;
        if (resolved)
          return {
            seed,
            points: path,
            reduced,
            alert,
            rank,
            open,
            tick,
            minError,
            edges,
            gate: door?.id,
          };
      }
    }
  }
  return {
    seed,
    points: path,
    reduced,
    alert,
    rank,
    rankSample,
    open,
    minError,
    edges,
    end: { ...p },
  };
}

const routeVariants: Path[] = [
  [
    [31, 0],
    [31, -2],
  ],
  [
    [29, 0],
    [33, 0],
  ],
  [
    [28, 0],
    [28, -3],
    [32, -3],
  ],
  [
    [28, 0],
    [28, 3],
    [32, 3],
  ],
  [
    [32, 0],
    [32, 3],
  ],
  [
    [32, 0],
    [32, -3],
  ],
  [
    [21, 0],
    [21, 3],
    [30, 3],
  ],
  [
    [21, 0],
    [21, -3],
    [30, -3],
  ],
  [[34, 0]],
];
const targeted = process.argv.includes('--targeted');
for (const n of targeted ? [795, 882, 747] : Array.from({ length: 354 }, (_, i) => 747 + i)) {
  const seed = `MOURNING-${n}`;
  for (const route of targeted
    ? [
        ...[16, 19, 22, 25, 28, 30].flatMap((x) => [0, -2, 2].map((z) => [[x, z]] as Path)),
        ...routeVariants,
      ]
    : routeVariants) {
    const result = screen(seed, route);
    console.log(JSON.stringify({ seed, route, result }));
    if (typeof result === 'string' && /^(warm alert|different)/.test(result)) break;
    if (typeof result !== 'string' && 'tick' in result) {
      const reduced = screen(seed, route, true);
      console.log(JSON.stringify({ seed, route, reduced }));
      if (
        typeof reduced !== 'string' &&
        'tick' in reduced &&
        JSON.stringify(reduced.edges) === JSON.stringify(result.edges)
      )
        process.exit(0);
    }
  }
}
