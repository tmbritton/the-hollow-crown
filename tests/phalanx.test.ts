import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECS } from '../src/ecs.ts';
import { createActor } from '../src/actors.ts';
import { CombatSystem, seedEnemies } from '../src/combat.ts';
import { installKoboldSquads } from '../src/koboldSquads.ts';
import type { NavigationWorld } from '../src/navigation.ts';
import type { Tile } from '../src/worldTypes.ts';
import { generateDungeon, heightAt } from '../src/world.ts';

function fixture(range = 7, configure: (world: NavigationWorld) => void = () => {}) {
  const ecs = new ECS(),
    tiles = new Map<string, Tile>();
  for (let x = -12; x <= 12; x++)
    for (let z = -15; z <= 18; z++) tiles.set(`${x},${z}`, { x, z, h: 0, surface: 'stone' });
  const world: NavigationWorld = { tiles, blockers: [], entities: [] };
  configure(world);
  const player = createActor(ecs, world, 'player', 'player', { x: 0.575, z: range, h: 0 });
  const pack = [
    [-1.15, 0.3],
    [0, 0.3],
    [1.15, 0.3],
    [0.175, -0.9],
  ].map(([x, z], slot) => {
    const a = createActor(ecs, world, `k:${slot}`, 'kobold', { x, z, h: 0 });
    a.enableAI('pack', slot);
    return a;
  });
  installKoboldSquads(ecs, pack);
  const squad = ecs.get('pack')!.require('koboldSquad');
  const combat = new CombatSystem(ecs, world, [player, ...pack]);
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) combat.update(1 / 60);
  };
  const until = (state: string, limit = 600) => {
    for (let i = 0; i < limit && squad.state !== state; i++) step();
    assert.equal(squad.state, state);
  };
  return { ecs, world, player, pack, squad, combat, step, until };
}

test('physical front rank advances slowly together; rear spear retains its lane and bodies never overlap', () => {
  const f = fixture(11);
  f.combat.target(f.pack[0], f.player);
  let travel = 0;
  for (let i = 0; i < 180; i++) {
    const before = f.pack.map((a) => ({ ...a.position }));
    f.step();
    for (let j = 0; j < 4; j++) {
      const a = f.pack[j];
      const moved = Math.hypot(a.position.x - before[j].x, a.position.z - before[j].z);
      assert.ok(moved <= 1.15 / 60 + 1e-6, `formation step ${moved}`);
      travel += moved;
      for (const b of f.pack)
        if (a !== b)
          assert.ok(
            Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) >= 0.9 - 1e-6,
          );
    }
  }
  assert.ok(travel > 2, 'coordinated advance makes physical progress');
  assert.ok(f.pack.slice(0, 3).every((a) => a.position.z > f.pack[3].position.z + 0.9));
  assert.ok(
    f.pack
      .slice(0, 3)
      .every((a) => a.defending || f.squad.isOpening(a.entity.require('squadMember'))),
  );
});

test('telegraphed center shield opening accepts frontal damage, then long thrust resolves once at impact', () => {
  const f = fixture(2.5);
  f.until('opening');
  const front = f.pack[1],
    hp = front.health.current;
  assert.equal(front.defending, false);
  assert.equal(f.pack[0].defending, true);
  assert.equal(
    f.combat.damage(front, 3, f.player, { kind: 'melee', travel: { x: 0, z: -1 } }),
    true,
  );
  assert.equal(front.health.current, hp - 3);
  const before = f.player.health.current;
  f.until('attacking');
  assert.equal(f.pack[3].attack.swing?.kind, 'LONG_THRUST');
  f.step(12);
  assert.equal(f.player.health.current, before);
  f.step(12);
  assert.ok(f.player.health.current < before, 'long thrust reaches beyond ordinary melee');
  const after = f.player.health.current;
  f.until('recovering');
  f.step(15);
  assert.equal(f.player.health.current, after);
  assert.ok(front.defending);
  assert.equal(
    f.combat.damage(front, 3, f.player, { kind: 'melee', travel: { x: 0, z: -1 } }),
    false,
  );
  assert.equal(
    f.combat.damage(front, 3, f.player, { kind: 'melee', travel: { x: 0, z: 1 } }),
    true,
  );
});

test('ranged javelin is released into actual flight and can be intercepted by a living ally', () => {
  const f = fixture(7);
  f.until('attacking');
  assert.equal(f.pack[3].attack.swing?.kind, 'THROW_JAVELIN');
  f.step(25);
  assert.equal(f.player.health.current, 100);
  assert.equal(f.ecs.query('projectile').length, 1);
  const shot = f.ecs.query('projectile')[0];
  const before = { ...shot.require('transform') };
  f.step();
  assert.ok(shot.require('transform').z > before.z);
  createActor(f.ecs, f.world, 'interceptor', 'kobold', { x: 0.575, z: 4, h: 0 });
  f.step(40);
  assert.equal(f.ecs.query('projectile').length, 0);
  assert.equal(f.player.health.current, 100);
});

test('half casualties and low surviving health trigger shielded backward unit retreat without healing', () => {
  for (const casualty of [true, false]) {
    const f = fixture(7);
    f.step(30);
    if (casualty) {
      f.combat.damage(f.pack[0], 1000);
      f.combat.damage(f.pack[2], 1000);
    } else for (const a of f.pack) f.combat.damage(a, 31);
    f.step();
    assert.equal(f.squad.state, 'retreating');
    const survivors = f.pack.filter((a) => a.alive),
      before = survivors.map((a) => ({ ...a.position, hp: a.health.current }));
    f.step(120);
    survivors.forEach((a, i) => {
      assert.ok(a.position.z < before[i].z - 0.3, 'retreat makes backward progress');
      assert.ok(Math.cos(a.position.heading) > 0.8, 'faces threat rather than travel');
      assert.equal(a.health.current, before[i].hp);
      if (a.entity.has('defense')) assert.ok(a.defending);
    });
  }
});

test('narrow choke holds safely with bounded route retries and reforms when released', () => {
  const f = fixture(9);
  f.world.blockers.push(
    { id: 'left', x: -3, z: 2.5, w: 4.8, d: 1 },
    { id: 'right', x: 3, z: 2.5, w: 4.8, d: 1 },
  );
  let plans = 0;
  for (const a of f.pack) {
    const go = a.navigator.goTo.bind(a.navigator);
    a.navigator.goTo = (...args) => {
      plans++;
      return go(...args);
    };
  }
  f.step(600);
  assert.ok(f.pack.every((a) => a.position.z < 1.8));
  assert.ok(plans <= 24, `bounded hold routes: ${plans}`);
  f.world.blockers.length = 0;
  f.step(240);
  assert.ok(
    f.pack[1].position.z > 2,
    JSON.stringify({
      state: f.squad.state,
      p: f.pack.map((a) => a.position),
      hp: f.player.health.current,
    }),
  );
});

test('locked altar gate cannot be crossed by formation, retreat, or javelin; unlocking preserves physical clearance', () => {
  const f = fixture(7, (world) =>
    world.entities.push({
      id: 'gate',
      type: 'door',
      x: 0,
      z: 2.5,
      h: 0,
      axis: 'z',
      locked: true,
      requiresAltar: true,
      open: false,
      angle: 0,
    }),
  );
  const gate = f.world.entities[0];
  assert.equal(gate.type, 'door');
  f.combat.target(f.pack[0], f.player);
  f.step(240);
  assert.ok(f.pack.every((a) => a.position.z < 2));
  assert.equal(f.player.health.current, 100);
  assert.equal(f.ecs.query('projectile').length, 0);
  assert.equal(gate.locked, true);
  if (gate.type === 'door') {
    gate.locked = false;
    gate.open = true;
  }
  f.step(360);
  assert.ok(f.pack[1].position.z > 2.5);
});

test('impact rechecks long reach, terrain cover, elevation, airborne target and closed allied shield lane', () => {
  for (const obstruction of ['range', 'wall', 'height', 'jump', 'ally', 'closed-shield'] as const) {
    const f = fixture(2.5);
    f.until('attacking');
    const hp = f.player.health.current;
    if (obstruction === 'range') f.player.position.z += 5;
    if (obstruction === 'wall')
      f.world.blockers.push({ id: 'cover', x: 0.575, z: 1.5, w: 0.2, d: 0.2 });
    if (obstruction === 'height') f.player.position.h = 1;
    if (obstruction === 'jump') {
      f.player.jump.request();
      f.player.jump.advance(0.25);
    }
    if (obstruction === 'ally')
      createActor(f.ecs, f.world, 'ally', 'kobold', { x: 0.575, z: 1.3, h: 0 });
    if (obstruction === 'closed-shield') {
      f.squad.chart.send({
        type: 'ALERT',
        target: createActor(f.ecs, f.world, 'other', 'goblin', { x: 8, z: 8, h: 0 }).entity,
      });
    }
    f.step(25);
    assert.equal(f.player.health.current, hp, obstruction);
  }
});

test('javelin flight damages once, blocks on player F, walls and closed doors, and respects pool capacity', () => {
  for (const obstruction of ['none', 'shield', 'wall', 'door', 'full'] as const) {
    const f = fixture(7, (world) => {
      if (obstruction === 'door')
        world.entities.push({
          id: 'gate',
          type: 'door',
          x: 0.575,
          z: 4,
          h: 0,
          axis: 'z',
          locked: false,
          requiresAltar: false,
          open: true,
          angle: 1.57,
        });
    });
    f.until('attacking');
    if (obstruction === 'full')
      for (let i = 0; i < 32; i++)
        f.ecs.create().add('transform', { x: 10, z: 10, h: 4, heading: 0 }).add('projectile', {
          kind: 'THROW_JAVELIN',
          owner: f.pack[3].id,
          vx: 0,
          vy: 0,
          vz: 0,
          life: 10,
          damage: 10,
        });
    f.step(25);
    if (obstruction === 'shield') {
      f.player.position.heading = Math.PI;
      f.player.entity.require('defense').press(true);
    }
    if (obstruction === 'wall')
      f.world.blockers.push({ id: 'cover', x: 0.575, z: 4, w: 2, d: 0.05 });
    if (obstruction === 'door' && f.world.entities[0].type === 'door')
      f.world.entities[0].open = false;
    f.step(55);
    assert.equal(f.player.health.current, obstruction === 'none' ? 90 : 100, obstruction);
    assert.ok(f.ecs.query('projectile').length <= 32);
  }
});

test('blocked retreat holds every survivor with raised shields; corpses remain ordinary passable floor', () => {
  const f = fixture(7);
  f.step(20);
  f.world.blockers.push({ id: 'rear wall', x: 0, z: -1.75, w: 8, d: 0.5 });
  f.combat.damage(f.pack[0], 1000);
  f.combat.damage(f.pack[2], 1000);
  const before = f.pack.filter((a) => a.alive).map((a) => ({ ...a.position }));
  f.step(120);
  const held = f.pack.filter((a) => a.alive).map((a) => ({ ...a.position }));
  f.step(120);
  f.pack
    .filter((a) => a.alive)
    .forEach((a, i) => {
      assert.ok(Math.hypot(a.position.x - held[i].x, a.position.z - held[i].z) < 0.01);
      assert.ok(Math.hypot(a.position.x - before[i].x, a.position.z - before[i].z) < 0.7);
    });
  assert.ok(f.pack[1].defending);
  f.world.blockers.length = 0;
  f.step(120);
  assert.ok(f.pack[3].position.z < before[1].z - 0.5);
});

test('live collision and an immobile adapter cannot create an overlapping or indefinitely replanning formation', () => {
  const f = fixture(12);
  f.combat.target(f.pack[0], f.player);
  let plans = 0;
  for (const a of f.pack) {
    const go = a.navigator.goTo.bind(a.navigator);
    a.navigator.goTo = (...args) => {
      plans++;
      return go(...args);
    };
  }
  f.pack[1].entity.add('collision', { move: (from) => from });
  f.player.health.invulnerable = 100;
  f.step(900);
  assert.ok(plans <= 24, String(plans));
  assert.ok(f.pack[1].position.z < 0.4);
  assert.ok(f.pack.every((a) => a.motion.actualSpeed === 0));
  const settledPlans = plans;
  f.step(900);
  assert.equal(
    plans,
    settledPlans,
    'unchanged physically stalled assembly does not keep searching',
  );
  for (const a of f.pack)
    for (const b of f.pack)
      if (a !== b)
        assert.ok(
          Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) >= 0.9 - 1e-6,
        );
});

test('spear loss cancels pending coordinated attack; target loss returns survivors and fresh groups reset', () => {
  const f = fixture(2.5);
  f.until('opening');
  f.combat.damage(f.pack[3], 1000);
  assert.equal(
    f.squad.state,
    'retreating',
    'loss of the offensive role withdraws shield-only survivors',
  );
  const hp = f.player.health.current;
  f.step(45);
  assert.equal(f.player.health.current, hp);
  assert.equal(f.ecs.query('projectile').length, 0);
  Object.assign(f.player.position, { x: 100, z: 100 });
  f.step(1200);
  assert.equal(f.squad.state, 'idle');
  assert.deepEqual(
    f.squad.living.map((m) => m.slot),
    [0, 1, 2],
  );
  assert.ok(f.squad.living.every((m) => !m.entity.require('defense').raised));
  assert.equal(fixture().squad.state, 'idle');
});

test('mixed water retreat stays together at the slowest grounded pace', () => {
  const f = fixture(7);
  f.step(20);
  for (const tile of f.world.tiles.values()) if (tile.x === -1) tile.surface = 'water';
  for (const a of f.pack) f.combat.damage(a, 31);
  const before = f.pack.map((a) => ({ ...a.position }));
  f.step(120);
  const travel = f.pack.map((a, i) =>
    Math.hypot(a.position.x - before[i].x, a.position.z - before[i].z),
  );
  assert.ok(Math.max(...travel) - Math.min(...travel) < 0.15, JSON.stringify(travel));
  assert.ok(Math.max(...travel) < 0.95, 'water retains the 52% pace with ordinary motor easing');
});

test('a physically stalled retreat member holds the unit within bounded rank error', () => {
  const f = fixture(7);
  f.step(20);
  f.pack[1].entity.add('collision', { move: (from) => from });
  for (const a of f.pack) f.combat.damage(a, 31);
  const before = f.pack.map((a) => ({ ...a.position }));
  f.step(240);
  f.pack.forEach((a, i) =>
    assert.ok(Math.hypot(a.position.x - before[i].x, a.position.z - before[i].z) < 0.2),
  );
  assert.ok(f.pack.slice(0, 3).every((a) => a.defending));
});

test('review: a reachable circular gathering recovers its detour and actually hits the threat', (t) => {
  const f = fixture();
  const positions = [
    [1.5, 0],
    [0, -1.5],
    [-1.5, 0],
    [0, 1.5],
  ];
  f.pack.forEach((a, i) => {
    Object.assign(a.position, { x: positions[i][0], z: positions[i][1] });
    Object.assign(a.brain!.home, a.position);
  });
  let frame = 0,
    minimum = Infinity,
    maximumStep = 0;
  for (; frame < 3600 && f.player.health.current === 100; frame++) {
    const before = f.pack.map((a) => ({ ...a.position }));
    f.step();
    f.pack.forEach((a, i) => {
      maximumStep = Math.max(
        maximumStep,
        Math.hypot(a.position.x - before[i].x, a.position.z - before[i].z),
      );
      for (const b of f.pack)
        if (a !== b)
          minimum = Math.min(
            minimum,
            Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z),
          );
    });
  }
  const result = {
    seconds: frame / 60,
    health: f.player.health.current,
    impacts: f.pack[3].attack.chart.snapshot.context.impacts,
    state: f.squad.state,
    blocked: f.squad.blocked,
    minimum,
    maximumStep,
  };
  t.diagnostic(JSON.stringify(result));
  assert.ok(result.health < 100, JSON.stringify(result));
  // The shared motor may finish the last sub-0.025 route connector in one step.
  assert.ok(minimum >= 0.9 - 1e-6 && maximumStep < 0.025);
  assert.ok(frame <= 1200, 'ordinary reachable assembly must attack within twenty seconds');
});

test('review: original MOURNING-731 stable gathering attacks the adverse reachable approach', (t) => {
  const world = generateDungeon('MOURNING-731'),
    ecs = new ECS();
  const player = createActor(ecs, world, 'player', 'player', {
    x: -2,
    z: -61,
    h: heightAt(world, -2, -61)!,
  });
  const enemies = seedEnemies(ecs, world),
    combat = new CombatSystem(ecs, world, [player, ...enemies]);
  const squad = ecs.get('pack:stable')!.require('koboldSquad');
  for (const a of enemies) if (a.brain?.pack !== 'pack:stable') a.health.current = 0;
  let frames = 0;
  for (; frames < 1200 && player.health.current === 100; frames++) combat.update(1 / 60);
  const result = {
    seconds: frames / 60,
    health: player.health.current,
    impacts: squad.spear!.attack.chart.snapshot.context.impacts,
    state: squad.state,
  };
  t.diagnostic(JSON.stringify(result));
  assert.ok(player.health.current < 100, JSON.stringify(result));
});

test('review: in-flight javelin hits the first swept body independently of entity insertion order', (t) => {
  const results = [];
  for (const first of ['player', 'ally'] as const) {
    const ecs = new ECS(),
      tiles = new Map<string, Tile>();
    for (let x = -3; x <= 3; x++)
      for (let z = -3; z <= 3; z++) tiles.set(`${x},${z}`, { x, z, h: 0, surface: 'stone' });
    const world: NavigationWorld = { tiles, blockers: [], entities: [] };
    const actors = [first, first === 'player' ? 'ally' : 'player', 'owner'].map((id) =>
      createActor(
        ecs,
        world,
        id,
        id === 'player' ? 'player' : 'kobold',
        id === 'player'
          ? { x: 0.455, z: 1.02, h: 0 }
          : id === 'ally'
            ? { x: -0.455, z: 1, h: 0 }
            : { x: 0, z: -2, h: 0 },
      ),
    );
    const combat = new CombatSystem(ecs, world, actors),
      player = combat.player,
      ally = combat.actor('ally')!,
      hp = ally.health.current;
    ecs.create('shot').add('transform', { x: 0, z: 0.8, h: 0.85, heading: 0 }).add('projectile', {
      owner: 'owner',
      kind: 'THROW_JAVELIN',
      vx: 0,
      vy: 0,
      vz: 10,
      life: 1,
      damage: 10,
    });
    combat.update(1 / 60);
    assert.equal(ecs.query('projectile').length, 0);
    assert.equal(ally.health.current, hp, 'friendly interception never damages the ally');
    results.push({ first, health: player.health.current });
  }
  t.diagnostic(JSON.stringify(results));
  assert.ok(
    results.every((r) => r.health === 100),
    JSON.stringify(results),
  );
});

test('all 24 circular role placements reach an actual impact, including a repositioned threat', (t) => {
  function permutations(values: number[]): number[][] {
    return values.length
      ? values.flatMap((n) => permutations(values.filter((v) => v !== n)).map((p) => [n, ...p]))
      : [[]];
  }
  const positions = [
    [1.5, 0],
    [0, -1.5],
    [-1.5, 0],
    [0, 1.5],
  ];
  const results = [];
  let minimum = Infinity,
    maximumStep = 0,
    maximumPlans = 0;
  for (const order of permutations([0, 1, 2, 3])) {
    const f = fixture();
    let plans = 0;
    f.pack.forEach((a, i) => {
      Object.assign(a.position, { x: positions[order[i]][0], z: positions[order[i]][1] });
      Object.assign(a.brain!.home, a.position);
      const go = a.navigator.goTo.bind(a.navigator);
      a.navigator.goTo = (...args) => {
        plans++;
        return go(...args);
      };
    });
    let frames = 0;
    for (; frames < 1200 && f.player.health.current === 100; frames++) {
      const before = f.pack.map((a) => ({ ...a.position }));
      f.step();
      f.pack.forEach((a, i) => {
        maximumStep = Math.max(
          maximumStep,
          Math.hypot(a.position.x - before[i].x, a.position.z - before[i].z),
        );
        for (const b of f.pack)
          if (a !== b)
            minimum = Math.min(
              minimum,
              Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z),
            );
      });
    }
    results.push({
      order,
      seconds: frames / 60,
      impacts: f.pack[3].attack.chart.snapshot.context.impacts,
      health: f.player.health.current,
      state: f.squad.state,
    });
    maximumPlans = Math.max(maximumPlans, plans);
  }
  const f = fixture();
  f.pack.forEach((a, i) => Object.assign(a.position, { x: positions[i][0], z: positions[i][1] }));
  f.step(600);
  Object.assign(f.player.position, { x: 2, z: 3 });
  f.step(600);
  const failed = results.filter((r) => r.health === 100 || r.impacts === 0);
  t.diagnostic(
    JSON.stringify({
      cases: results.length,
      failed,
      maximumSeconds: Math.max(...results.map((r) => r.seconds)),
      minimum,
      maximumStep,
      maximumPlans,
      repositionedHealth: f.player.health.current,
    }),
  );
  assert.deepEqual(failed, []);
  assert.ok(f.player.health.current < 100, 'repositioning the same threat remains actionable');
  assert.ok(minimum >= 0.9 - 1e-6 && maximumStep < 0.025);
  assert.ok(maximumPlans <= 48, 'bounded route rounds rather than per-step planning');
});
