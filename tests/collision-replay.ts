import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Batcher } from '../src/geometry.ts';
import { WALL_LENGTH, WALL_OFFSET, WALL_THICKNESS } from '../src/wallGeometry.ts';
import { key } from '../src/world.ts';
import { createActor, moveActor, requestJump, stopActor } from '../src/actors.ts';
import { animateDoor } from '../src/machines/world/interactions.ts';
import type { DungeonDebug } from '../src/gameTypes.ts';
import type { Tile } from '../src/worldTypes.ts';
import { collisionTerrain, type TerrainCandidates } from '../src/terrainCandidates.ts';

const counters = () => ({
  candidates: [] as number[],
  cells: 0,
  entries: 0,
  lookupMs: 0,
  maintenanceMs: 0,
});
const terrainCounters = (): NonNullable<TerrainCandidates['diagnostics']> => ({
  ...counters(),
  fallbacks: [],
  sceneVisits: 0,
  foreignVisits: 0,
  builds: 0,
  contacts: 0,
  sweepMs: 0,
});

export function wallSeamOracle(debug: DungeonDebug) {
  const { scene, world, materials, dungeon, shadow } = debug.game;
  const owner = collisionTerrain(scene)!;
  const batch = new Batcher(scene, { collider: materials.dark }, { addShadowCaster: () => shadow });
  const seams: { t: Tile; dx: number; dz: number }[] = [];
  for (const t of world.tiles.values()) {
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      if (world.tiles.has(key(t.x + dx, t.z + dz))) continue;
      const x = t.x + dx * WALL_OFFSET,
        z = t.z + dz * WALL_OFFSET;
      batch.box(
        'collider',
        x,
        t.h + 1.7,
        z,
        dx ? WALL_THICKNESS : WALL_LENGTH,
        3.4,
        dz ? WALL_THICKNESS : WALL_LENGTH,
      );
      const next = world.tiles.get(key(t.x + dz, t.z + dx));
      if (
        next?.h === t.h &&
        (dx ? next.z % 10 === 0 : next.x % 10 === 0) &&
        !world.tiles.has(key(next.x + dx, next.z + dz))
      ) {
        seams.push({ t, dx, dz });
      }
    }
  }
  const original = batch.finish();
  const walls = dungeon.colliders.filter((mesh) => mesh.name.startsWith('collider:'));
  const triangles = (meshes: typeof original) =>
    meshes.flatMap((mesh) => {
      const positions = mesh.getVerticesData('position')!;
      return Array.from(mesh.getIndices()!).flatMap((i) =>
        Array.from(positions.slice(i * 3, i * 3 + 3)),
      );
    });
  const expected = triangles(original),
    actual = triangles(walls);
  const mismatch = expected.findIndex((v, i) => v !== actual[i]);
  if (mismatch !== -1 || expected.length !== actual.length)
    throw new Error(`Wall batches changed the legacy triangle stream at ${mismatch}`);
  if (!seams.length) throw new Error('No authored wall seams in the oracle seed');
  const proxy = MeshBuilder.CreateBox('wall seam motor', {}, scene);
  proxy.ellipsoid.set(0.3, 0.72, 0.3);
  owner.declareDecorative(proxy);
  const prior = dungeon.colliders.map((mesh) => mesh.checkCollisions);
  const moves = (legacy: boolean) => {
    dungeon.colliders.forEach((mesh) => {
      mesh.checkCollisions = false;
    });
    for (const mesh of walls) mesh.checkCollisions = !legacy;
    for (const mesh of original) mesh.checkCollisions = legacy;
    return seams.flatMap(({ t, dx, dz }) =>
      [-0.32, 0, 0.32].map((along) => {
        proxy.position.set(t.x + dz * (0.5 - along), t.h + 0.72, t.z + dx * (0.5 - along));
        proxy.computeWorldMatrix(true);
        const start = proxy.position.clone();
        const delta = new Vector3(dx * 0.9 + dz * along, 0, dz * 0.9 + dx * along);
        if (legacy) proxy.moveWithCollisions(delta);
        else owner.move(proxy, delta);
        const moved = proxy.position.subtract(start);
        const normal = moved.x * dx + moved.z * dz;
        if (normal < 0.17 || normal > 0.23)
          throw new Error(`Seam did not clip at interior wall face: ${normal}`);
        return moved;
      }),
    );
  };
  try {
    const legacy = moves(true),
      indexed = moves(false);
    indexed.forEach((p, i) => {
      if (!p.equalsWithEpsilon(legacy[i], 1e-6))
        throw new Error(`Wall seam ${i} differs: ${p} vs ${legacy[i]}`);
    });
    const maxExtent = Math.max(
      ...walls.map((mesh) => {
        const { minimumWorld, maximumWorld } = mesh.getBoundingInfo().boundingBox;
        return Math.max(maximumWorld.x - minimumWorld.x, maximumWorld.z - minimumWorld.z);
      }),
    );
    if (maxExtent > 11.05) throw new Error(`Legacy wall batch spans ${maxExtent} units`);
    return {
      seams: seams.length,
      sweeps: indexed.length,
      legacyBatches: original.length,
      indexedBatches: walls.length,
      maxExtent,
    };
  } finally {
    proxy.dispose();
    for (const mesh of original) mesh.dispose();
    dungeon.colliders.forEach((mesh, i) => {
      mesh.checkCollisions = prior[i];
    });
  }
}

export function collisionReplay(debug: DungeonDebug) {
  const seed = 'MOURNING-731';
  const run = (fullScan: boolean) => {
    debug.regenerate(seed);
    const game = debug.game;
    const terrain = collisionTerrain(game.scene)!;
    terrain.fullScan = game.ecs.living.fullScan = fullScan;
    terrain.diagnostics = terrainCounters();
    const player = game.player.actor;
    const actors = game.combat.actors;
    const path: {
      label: string;
      mover: string;
      dx: number;
      dz: number;
      h: number;
      moving: boolean;
      arrived: boolean;
      query?: NonNullable<TerrainCandidates['diagnostics']>['last'];
    }[] = [];
    const record = (label: string, mover: typeof player, dt: number, x?: number, z = 0) => {
      const before = { ...mover.position };
      if (terrain.diagnostics) terrain.diagnostics.last = undefined;
      moveActor(mover, game.world, x === undefined ? {} : { direction: { x, z }, speed: 11 }, dt);
      path.push({
        label,
        mover: mover.id,
        dx: mover.position.x - before.x,
        dz: mover.position.z - before.z,
        h: mover.position.h,
        moving: mover.motion.actualSpeed !== 0,
        arrived: !mover.navigator.active,
        query: terrain.diagnostics?.last,
      });
    };
    const door = game.world.entities.find((e) => e.type === 'door' && !e.locked);
    if (!door || door.type !== 'door') throw new Error('Missing replay gate');
    const stair = [...game.world.tiles.values()].find((t) => t.surface === 'stair');
    if (!stair) throw new Error('Missing replay stair');
    const place = (x: number, z: number, h: number) => {
      stopActor(player);
      player.entity.setPosition({ x, z, h });
    };
    const spawn = { ...player.position };
    if (!player.navigator.goTo(spawn, { x: spawn.x + 1.2, z: spawn.z + 0.2 }))
      throw new Error('Missing replay arrival path');
    for (let i = 0; i < 50; i++) record(`arrival:${i}`, player, 1 / 60);
    if (player.navigator.active) throw new Error('Replay did not exercise route arrival');
    place(spawn.x, spawn.z, spawn.h);
    requestJump(player);
    for (let i = 0; i < 48; i++) {
      record(`crowd:${i}`, player, i % 8 === 0 ? 0.18 : 1 / 60, i < 24 ? 1 : -1, 0.73);
      const other = actors[1 + (i % (actors.length - 1))];
      record(`crowd:${i}`, other, 1 / 30, -0.84, 0.47);
    }
    place(stair.x, stair.z, stair.h);
    requestJump(player);
    for (let i = 0; i < 32; i++) record(`stair:${i}`, player, 1 / 60, 0.24, 1);
    const cornerWall = (dx: number, dz: number, width: number, depth: number) => {
      const mesh = MeshBuilder.CreateBox(
        'CPU4 retry wall',
        { width, depth, height: 3 },
        game.scene,
      );
      mesh.position.set(spawn.x + dx, spawn.h + 1.5, spawn.z + dz);
      mesh.checkCollisions = true;
      mesh.computeWorldMatrix(true);
      terrain.register(mesh);
      return mesh;
    };
    const wallX = cornerWall(0.8, 0, 0.1, 4),
      wallZ = cornerWall(0, 1.4, 4, 0.1);
    place(spawn.x, spawn.z, spawn.h);
    const corner = player.entity.require('collision').move(spawn, { x: 1.7, z: 2 });
    const dx = corner.x - spawn.x,
      dz = corner.z - spawn.z;
    if (Math.abs(dx - 0.45) > 0.02 || Math.abs(dz - 1.05) > 0.02)
      throw new Error(`Single-sweep retry did not reach both walls: ${dx}, ${dz}`);
    path.push({
      label: 'corner retries',
      mover: player.id,
      dx,
      dz,
      h: spawn.h,
      moving: true,
      arrived: false,
      query: terrain.diagnostics.last,
    });
    wallX.dispose();
    wallZ.dispose();
    for (const open of [true, false]) {
      door.open = open;
      for (let i = 0; i < 18; i++) {
        animateDoor(door, false, 1 / 60);
        const x = door.axis === 'x' ? 1 : 0,
          z = 1 - x;
        place(door.x - x * 0.65, door.z - z * 0.65, door.h);
        record(`gate:${open}:${i}:${door.collider?.checkCollisions}`, player, 0.12, x, z);
      }
    }
    if (
      !path.some((p) => p.label.startsWith('gate:true:') && p.label.endsWith(':false')) ||
      !path.some((p) => p.label.startsWith('gate:false:') && p.label.endsWith(':true'))
    )
      throw new Error('Replay did not observe both gate eligibility states');
    let fallbackWork;
    if (!fullScan) {
      const stats = terrain.diagnostics!;
      if (
        !stats.candidates.length ||
        stats.fallbacks.length ||
        stats.sceneVisits ||
        stats.foreignVisits
      )
        throw new Error('Seeded sweeps did not use the index');
      const foreign = MeshBuilder.CreateBox('unregistered collider', {}, game.scene);
      foreign.checkCollisions = true;
      record('unsupported', player, 0.08, 1, 0);
      path.pop();
      fallbackWork = {
        sceneVisits: stats.sceneVisits,
        foreignVisits: stats.foreignVisits,
        fallbacks: stats.fallbacks.length,
      };
      if (
        stats.sceneVisits !== game.scene.meshes.length ||
        stats.foreignVisits !== stats.fallbacks.length
      )
        throw new Error(`Unexpected reconciliation work: ${JSON.stringify(fallbackWork)}`);
      foreign.dispose();
      if (!stats.fallbacks.includes('unknown collider'))
        throw new Error('Missing unsupported fallback');
    }
    return { path, fallbackWork };
  };
  const full = run(true),
    indexed = run(false);
  if (indexed.path.length !== full.path.length) throw new Error('Motor replay length mismatch');
  indexed.path.forEach((actual, i) => {
    const expected = full.path[i];
    if (
      actual.label !== expected.label ||
      actual.mover !== expected.mover ||
      actual.moving !== expected.moving ||
      actual.arrived !== expected.arrived ||
      (['dx', 'dz', 'h'] as const).some((p) => Math.abs(actual[p] - expected[p]) > 1e-6)
    )
      throw new Error(`${seed} #${i}: ${JSON.stringify({ actual, expected })}`);
  });
  debug.regenerate(seed);
  return {
    seed,
    samples: indexed.path.length,
    fallbackWork: indexed.fallbackWork,
    wallSeams: wallSeamOracle(debug),
  };
}

function summary(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: sorted.length,
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted.at(-1),
  };
}

export function collisionCosts(debug: DungeonDebug) {
  // The browser can redirect the starting seed while boots complete. Pin the actual workload.
  debug.regenerate('MOURNING-731');
  const game = debug.game,
    owner = collisionTerrain(game.scene)!,
    living = game.ecs.living;
  const player = game.player.actor,
    position = { ...player.position };
  const occupancy = player.navigator.occupancy!;
  const move = (contact: boolean, trace?: number[][]) => {
    stopActor(player);
    player.entity.setPosition(position);
    for (let i = 0; i < 16; i++) {
      moveActor(
        player,
        game.world,
        {
          direction: contact ? { x: 1, z: 0 } : { x: i < 8 ? 1 : -1, z: 0.42 },
          speed: 8,
        },
        1 / 30,
      );
      if (trace)
        trace.push([
          player.position.x,
          player.position.z,
          player.position.h,
          player.motion.actualSpeed,
        ]);
    }
  };
  const measure = (scan: boolean, contact = false) => {
    owner.fullScan = living.fullScan = scan;
    for (let i = 0; i < 12; i++) move(contact);
    const totals = [];
    for (let i = 0; i < 12; i++) {
      const start = performance.now();
      for (let j = 0; j < 16; j++) move(contact);
      totals.push(performance.now() - start);
    }
    const terrain = terrainCounters(),
      bodies = { ...counters(), fallbacks: 0 };
    owner.diagnostics = terrain;
    living.diagnostics = bodies;
    const builds = living.builds;
    const trace: number[][] = [],
      seen = new Set<string>();
    let queries = 0,
      hits = 0,
      repeats = 0,
      repeatedHits = 0,
      solveMs = 0,
      keyMs = 0;
    occupancy.contactProbe = ({ from, to, size, bodies, hit, solveMs: elapsed }) => {
      queries++;
      if (hit) hits++;
      solveMs += elapsed;
      const start = performance.now();
      // One mover/incarnation, one policy, one 16-step pass. Key exact directional inputs
      // and ordered cylinder geometry, not just the pair, spatial cell or tick.
      const geom = ({ x, z, h }: typeof from) => [x, z, h];
      const signature = JSON.stringify([
        geom(from),
        geom(to),
        size.radius,
        size.height,
        bodies.map((b) => [...geom(b), b.radius, b.height]),
      ]);
      if (seen.has(signature)) {
        repeats++;
        if (hit) repeatedHits++;
      } else seen.add(signature);
      keyMs += performance.now() - start;
    };
    move(contact, trace);
    occupancy.contactProbe = undefined;
    owner.diagnostics = living.diagnostics = undefined;
    const { candidates: t, ...terrainWork } = terrain;
    const { candidates: b, ...livingWork } = bodies;
    return {
      builds: living.builds - builds,
      terrain: summary(t),
      bodies: summary(b),
      terrainWork,
      livingWork,
      contact: { queries, hits, repeats, repeatedHits, solveMs, probeKeyMs: keyMs },
      totalMsPer256MotorSteps: summary(totals),
      t,
      b,
      trace,
    };
  };
  const size = game.scene.meshes.length;
  const indexed = measure(false),
    full = measure(true);
  const wall = MeshBuilder.CreateBox(
    'CPU4 contact workload wall',
    { width: 8, depth: 0.1, height: 3 },
    game.scene,
  );
  wall.position.set(position.x + 2, position.h + 1.5, position.z - 0.7);
  wall.checkCollisions = true;
  wall.computeWorldMatrix(true);
  owner.register(wall);
  const crowd = [
    [1.2, 0.15],
    [2.2, 0.55],
    [3.2, 0.3],
    [4.2, 0.8],
  ].map(([x, z], i) =>
    createActor(game.ecs, game.world, `cpu4 local ${i}`, 'goblin', {
      x: position.x + x,
      z: position.z + z,
      h: position.h,
    }),
  );
  const contactIndexed = measure(false, true),
    contactFull = measure(true, true);
  if (
    contactIndexed.contact.hits < 8 ||
    !contactIndexed.terrainWork.contacts ||
    contactIndexed.terrainWork.fallbacks.length ||
    contactIndexed.livingWork.fallbacks ||
    contactIndexed.contact.hits !== contactFull.contact.hits ||
    contactIndexed.trace.some((row, i) =>
      row.some((n, j) => Math.abs(n - contactFull.trace[i][j]) > 1e-6),
    )
  )
    throw new Error(
      `Contact workload missed parity or did not hit both layers: ${JSON.stringify({ contactIndexed, contactFull })}`,
    );
  wall.dispose();
  for (const actor of crowd) game.ecs.remove(actor.id);
  const meshes = [],
    far = [];
  for (let i = 0; i < 128; i++) {
    const x = 1000 + i * 5;
    const collider = MeshBuilder.CreateBox(`cpu4 collider ${i}`, {}, game.scene);
    collider.position.set(x, 1, 1000);
    collider.checkCollisions = true;
    collider.computeWorldMatrix(true);
    owner.register(collider);
    const decoration = MeshBuilder.CreateBox(`cpu4 decoration ${i}`, {}, game.scene);
    owner.declareDecorative(decoration);
    meshes.push(collider, decoration);
    far.push(createActor(game.ecs, game.world, `cpu4 far ${i}`, 'goblin', { x, z: 1000, h: 0 }));
  }
  const extended = measure(false);
  if (
    JSON.stringify(indexed.t) !== JSON.stringify(extended.t) ||
    JSON.stringify(indexed.b) !== JSON.stringify(extended.b) ||
    indexed.terrainWork.entries !== extended.terrainWork.entries ||
    indexed.livingWork.entries !== extended.livingWork.entries ||
    indexed.terrainWork.fallbacks.length ||
    extended.terrainWork.fallbacks.length ||
    indexed.terrainWork.sceneVisits ||
    extended.terrainWork.sceneVisits ||
    indexed.terrainWork.foreignVisits ||
    extended.terrainWork.foreignVisits
  )
    throw new Error(
      `Distant population changed local work: ${JSON.stringify({ indexed, extended })}`,
    );
  const peak = { meshes: game.scene.meshes.length, terrain: owner.counts, bodies: living.counts };
  for (const mesh of meshes) mesh.dispose();
  for (const actor of far) game.ecs.remove(actor.id);
  stopActor(player);
  player.entity.setPosition(position);
  const report = ({ t: _t, b: _b, trace: _trace, ...rest }: typeof indexed) => rest;
  return {
    seed: game.world.seed,
    size,
    peak,
    indexed: report(indexed),
    full: report(full),
    extended: report(extended),
    contactIndexed: report(contactIndexed),
    contactFull: report(contactFull),
  };
}

export function collisionRetirement(debug: DungeonDebug) {
  const seed = 'MOURNING-731';
  const capture = () => ({
    terrain: collisionTerrain(debug.game.scene)!,
    bodies: debug.game.ecs.living,
  });
  const counts = (owners: ReturnType<typeof capture>) => ({
    terrain: owners.terrain.counts,
    bodies: owners.bodies.counts,
    doorway: owners.bodies.doorwayCounts,
  });
  const original = counts(capture());
  const retired = [];
  for (let i = 0; i < 3; i++) {
    const old = capture();
    debug.regenerate(seed);
    const post = counts(old);
    retired.push(post);
    if (
      [
        ...Object.values(post.terrain),
        ...Object.values(post.bodies),
        ...Object.values(post.doorway),
      ].some(Boolean)
    )
      throw new Error(`Collision owners survived reset: ${JSON.stringify(post)}`);
    if (JSON.stringify(counts(capture())) !== JSON.stringify(original))
      throw new Error('Replacement run has different collision resources');
  }
  return { seed, original, retired };
}
