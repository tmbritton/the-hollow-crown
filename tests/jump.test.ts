import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Jump, JUMP_GRAVITY, JUMP_PRELOAD, JUMP_SPEED } from '../src/jump.ts';
import { Spring, sampleMotionCurve } from '../src/animationCurves.ts';
import { createActor, moveActor, requestJump, stopActor, teleportActor } from '../src/actors.ts';
import { ECS } from '../src/ecs.ts';
import { CombatSystem } from '../src/combat.ts';
import type { NavigationWorld } from '../src/navigation.ts';
import type { Tile } from '../src/worldTypes.ts';
import { solveLeg } from './historical-foot-placement.ts';

function fixture() {
  const ecs = new ECS(),
    tiles = new Map<string, Tile>();
  for (let x = -6; x <= 6; x++)
    for (let z = -3; z <= 3; z++) tiles.set(`${x},${z}`, { x, z, h: 0, surface: 'stone' });
  const world: NavigationWorld = { tiles, blockers: [], entities: [] };
  const player = createActor(ecs, world, 'player', 'player', { x: -4, z: 0, h: 0 });
  return { ecs, world, player };
}

test('jump loads for two frames, follows gravity and lands consistently at different tick rates', () => {
  const apexTime = JUMP_PRELOAD + JUMP_SPEED / JUMP_GRAVITY;
  for (const rate of [30, 60, 120, 144]) {
    const jump = new Jump();
    assert.ok(jump.request());
    jump.advance(JUMP_PRELOAD / 2);
    assert.equal(jump.height, 0);
    assert.equal(jump.phase, 'anticipation');
    let elapsed = JUMP_PRELOAD / 2;
    while (elapsed < apexTime - 1e-10) {
      const dt = Math.min(1 / rate, apexTime - elapsed);
      jump.advance(dt);
      elapsed += dt;
    }
    assert.ok(Math.abs(jump.height - JUMP_SPEED ** 2 / (2 * JUMP_GRAVITY)) < 1e-9);
    assert.ok(Math.abs(jump.velocity) < 1e-9);
    assert.equal(jump.request(), false, 'no midair double jump');
    while (jump.airborne) jump.advance(1 / rate);
    assert.equal(jump.height, 0);
    assert.equal(jump.landings, 1);
    assert.ok(Math.abs(jump.landingSpeed - JUMP_SPEED) < 1e-9);
    jump.advance(1);
    assert.equal(jump.phase, 'grounded');
    assert.equal(jump.landings, 1);
  }
});

test('stairs change landing height without changing the world-space flight arc', () => {
  const flat = new Jump(),
    stairs = new Jump();
  flat.request();
  stairs.request();
  flat.advance(0.2);
  stairs.advance(0.2);
  flat.advance(0.1);
  stairs.advance(0.1, 0.15);
  assert.ok(Math.abs(flat.height - (stairs.height + 0.15)) < 1e-10);
  stairs.advance(0.05, -0.45);
  while (stairs.airborne) stairs.advance(1 / 60);
  assert.ok(stairs.landingSpeed > flat.velocity);
  assert.ok(
    Math.abs(stairs.landingSpeed - Math.sqrt(JUMP_SPEED ** 2 + 2 * JUMP_GRAVITY * 0.3)) < 1e-9,
  );
});

test('a running route keeps its intent and forward travel throughout a jump', () => {
  const { player, world } = fixture();
  assert.ok(player.navigator.goTo(player.position, { x: 5, z: 0 }));
  for (let i = 0; i < 12; i++) moveActor(player, world, { speed: 7.4 }, 1 / 60);
  const before = player.position.x;
  assert.ok(requestJump(player));
  assert.deepEqual(player.navigator.destination, { x: 5, z: 0 });
  let peak = 0;
  for (let i = 0; i < 42; i++) {
    moveActor(player, world, { speed: 7.4 }, 1 / 60);
    peak = Math.max(peak, player.elevation);
  }
  assert.ok(peak > 1 && player.position.x > before + 4);
  assert.equal(player.jump.height, 0);
  assert.equal(player.jump.landings, 1);
});

test('jumping preserves floor clearance and living-body separation', () => {
  const { ecs, player, world } = fixture();
  world.blockers.push({ id: 'barrier', x: 0, z: 0, w: 0.2, d: 6 });
  player.position.x = -1;
  requestJump(player);
  for (let i = 0; i < 90; i++) moveActor(player, world, { direction: { x: 1, z: 0 } }, 1 / 60);
  assert.ok(player.position.x < -0.4);
  world.blockers.length = 0;
  const blocker = createActor(ecs, world, 'goblin', 'goblin', { x: 0.5, z: 0, h: 0 });
  requestJump(player);
  for (let i = 0; i < 90; i++) moveActor(player, world, { direction: { x: 1, z: 0 } }, 1 / 60);
  assert.ok(blocker.position.x - player.position.x >= 0.9 - 1e-6);
});

test('jump interrupts a strike without cancelling pursuit, and reset/teleport clears flight', () => {
  const { ecs, player, world } = fixture();
  const enemy = createActor(ecs, world, 'target', 'skeleton', { x: -3, z: 0, h: 0 });
  const combat = new CombatSystem(ecs, world, [player, enemy]);
  player.attack.target = enemy.id;
  assert.ok(combat.startAttack(player, enemy));
  assert.ok(requestJump(player));
  assert.equal(player.attack.swing, null);
  assert.equal(player.attack.target, enemy.id);
  assert.equal(combat.pursue(player, 1 / 60), false);
  player.jump.advance(0.3);
  assert.equal(combat.startAttack(player, enemy), false);
  assert.equal(combat.inMelee(enemy, player), false);
  combat.update(0.5);
  assert.equal(enemy.health.current, enemy.health.max);
  stopActor(player);
  assert.equal(player.jump.height, 0);
  assert.equal(player.jump.held, false);
  requestJump(player);
  player.jump.advance(0.2);
  teleportActor(player, world, { x: 2, z: 0 });
  assert.equal(player.elevation, 0);
  assert.equal(player.jump.active, false);
});

test('actual displacement determines facing and acceleration, including a sliding collision', () => {
  const { player, world } = fixture();
  player.entity.add('collision', { move: (from, delta) => ({ x: from.x, z: from.z + delta.z }) });
  moveActor(player, world, { direction: { x: 1, z: 1 } }, 1 / 60);
  assert.equal(player.position.heading, 0);
  assert.equal(player.motion.velocity.x, 0);
  assert.ok(player.motion.velocity.z > 0 && player.motion.acceleration.z > 0);
  moveActor(player, world, { direction: { x: 0, z: 0 } }, 1 / 60);
  assert.ok(player.motion.acceleration.z < 0);
});

test('projectile hit tests use the airborne body rather than the grounded navigation proxy', () => {
  for (const airborne of [false, true]) {
    const { ecs, player, world } = fixture();
    const enemy = createActor(ecs, world, 'archer', 'goblin', { x: -2, z: 0, h: 0 });
    const combat = new CombatSystem(ecs, world, [player, enemy]);
    if (airborne) {
      requestJump(player);
      player.jump.advance(JUMP_PRELOAD + JUMP_SPEED / JUMP_GRAVITY);
    }
    ecs
      .create('bolt')
      .add('transform', { x: -3, z: 0, h: 0.85, heading: 0 })
      .add('projectile', { owner: enemy.id, vx: -10, vy: 0, vz: 0, life: 1, damage: 7 });
    combat.update(0.2);
    assert.equal(player.health.current, airborne ? 100 : 93);
  }
});

test('landing springs preserve momentum through interruption and agree across frame rates', () => {
  const values = [30, 60, 120].map((rate) => {
    const spring = new Spring();
    spring.velocity = -4;
    for (let i = 0; i < rate / 2; i++) spring.advance(0, 1 / rate, 20, 0.6);
    return spring.value;
  });
  assert.ok(Math.max(...values) - Math.min(...values) < 1e-10);
  const spring = new Spring();
  spring.velocity = -4;
  assert.ok(spring.advance(0, 1 / 60) < 0);
  const velocity = spring.velocity;
  spring.advance(0.16, 1 / 60000);
  assert.ok(
    Math.abs(spring.velocity - velocity) < 0.01,
    'new target does not discard existing momentum',
  );
  spring.advance(0, 10);
  assert.ok(Math.abs(spring.value) < 1e-10);
});

test('two-bone leg solves reach supported targets with a flat ankle, and clamp unreachable ones', () => {
  for (const [forward, down] of [
    [0.1, 0.42],
    [-0.2, 0.35],
    [0, 0.3],
  ]) {
    const pose = solveLeg(forward, down);
    const z = -0.25 * Math.sin(pose.hip) - 0.25 * Math.sin(pose.hip + pose.knee);
    const y = 0.25 * Math.cos(pose.hip) + 0.25 * Math.cos(pose.hip + pose.knee);
    assert.ok(Math.abs(z - forward) < 1e-10 && Math.abs(y - down) < 1e-10);
  }
  assert.ok(Object.values(solveLeg(5, 5)).every(Number.isFinite));
});

test('action curves carry continuous nonzero velocity through a contact pose', () => {
  const keys = [
    [0, 0],
    [0.3, -2.3],
    [0.5, -1.4],
    [0.65, 0.8],
    [1, 0],
  ] as const;
  const dt = 1e-5;
  const before = (sampleMotionCurve(0.5, keys) - sampleMotionCurve(0.5 - dt, keys)) / dt;
  const after = (sampleMotionCurve(0.5 + dt, keys) - sampleMotionCurve(0.5, keys)) / dt;
  assert.ok(before > 1 && Math.abs(before - after) < 0.01);
});
