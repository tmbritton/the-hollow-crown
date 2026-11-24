import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShieldMotion } from '../src/rigs/shield.ts';
import { ECS } from '../src/ecs.ts';
import { createActor, requestDefense } from '../src/actors.ts';
import { CombatSystem } from '../src/combat.ts';
import type { NavigationWorld } from '../src/navigation.ts';
import { ActionRig, SHIELD_GRIP } from '../src/rigs/actions.ts';
import { GroundedLocomotion } from '../src/rigs/grounding.ts';
import { humanoid, profiles } from '../src/rigs/humanoid.ts';
import { socketPoint, transformPoint } from '../src/rigs/pose.ts';
import { animateLocomotion } from '../src/locomotion.ts';
import { Defense } from '../src/machines/actors/defense.ts';
import { KoboldSquad } from '../src/koboldSquads.ts';
import { Spring } from '../src/animationCurves.ts';

const input = (guarded: boolean, dt = 1 / 60, time = 0) => ({
  guarded,
  opening: 0,
  gate: false,
  preparation: 0,
  forceReset: false,
  heading: 0,
  dt,
  time,
});

test('quiet shield channels perform no spring work, but an active raise still advances', () => {
  const advance = Spring.prototype.advance;
  let calls = 0;
  Spring.prototype.advance = function (...args: Parameters<Spring['advance']>) {
    calls++;
    return advance.apply(this, args);
  };
  try {
    const motion = new ShieldMotion();
    for (let i = 0; i < 120; i++) motion.sample(input(false, 1 / 60, i / 60));
    assert.equal(calls, 0, 'the 25-actor baseline should not integrate dormant shield channels');
    motion.sample(input(true));
    assert.ok(calls > 0 && motion.brace > 0);
  } finally {
    Spring.prototype.advance = advance;
  }
});

test('guard placement is immediate while supporting anticipation settles without repeat restarts', () => {
  const motion = new ShieldMotion();
  motion.sample(input(true));
  assert.equal(motion.guarded, true);
  assert.ok(motion.weight > 0);
  assert.ok(motion.brace > 0);
  const first = motion.brace;
  for (let i = 1; i < 90; i++) motion.sample(input(true, 1 / 60, i / 60));
  assert.ok(Math.abs(motion.brace) < first * 0.01);
  assert.equal(motion.weight, 1);
  const snapshot = motion.snapshot();
  for (let i = 0; i < 20; i++) motion.sample(input(true, 0, 1.5));
  assert.deepEqual(motion.snapshot(), snapshot);
});

test('a second guard tap between pose samples restarts both lowering and sword recovery', () => {
  const ecs = new ECS(),
    world: NavigationWorld = { tiles: new Map(), blockers: [], entities: [] },
    actor = createActor(ecs, world, 'player', 'player', { x: 0, z: 0, h: 0 }),
    defense = actor.entity.require('defense'),
    motion = new ShieldMotion();
  const tick = () => {
    actor.attack.cool(1 / 60);
    motion.sample({ ...input(actor.defending), playerLowerSequence: defense.lowerSequence });
  };
  requestDefense(actor);
  for (let i = 0; i < 60; i++) tick();
  defense.release();
  for (let i = 0; i < 10; i++) tick();
  requestDefense(actor);
  defense.release();
  for (let i = 0; i < 30; i++) {
    tick();
    assert.equal(motion.weight > 0, actor.attack.cooldown > 0);
  }
});

test('lowering and rapid reversals preserve body spring state; resets clear all presentation channels', () => {
  const motion = new ShieldMotion();
  for (let i = 0; i < 60; i++) motion.sample(input(true, 1 / 60, i / 60));
  const before = motion.snapshot();
  motion.sample(input(false, 0, 8 / 60));
  assert.equal(motion.weight, 1);
  assert.equal(motion.brace, before.brace);
  motion.sample(input(false, 1 / 60, 9 / 60));
  assert.ok(motion.weight > 0 && motion.weight < 1);
  const lowering = motion.snapshot();
  motion.sample(input(true, 0, 9 / 60));
  assert.equal(motion.weight, lowering.weight, 're-press retains the current placement proposal');
  assert.equal(motion.snapshot().velocities[0], lowering.velocities[0]);
  motion.project(lowering.weight, 0);
  assert.equal(
    motion.snapshot().velocities[0],
    lowering.velocities[0],
    'a feasible placement needs no velocity projection',
  );
  assert.equal(motion.brace, lowering.brace);
  for (let i = 0; i < 100; i++) motion.sample(input(false, 1 / 60, 1 + i / 60));
  assert.equal(motion.weight, 0);
  motion.reset();
  assert.deepEqual(motion.snapshot(), new ShieldMotion().snapshot());
});

test('confirmed blocks react directionally once, conserve gameplay and bound rapid burst energy', () => {
  const ecs = new ECS(),
    world: NavigationWorld = { tiles: new Map(), blockers: [], entities: [] };
  const a = createActor(ecs, world, 'hero', 'player', { x: 0, z: 0, h: 0 }),
    enemy = createActor(ecs, world, 'enemy', 'skeleton', { x: 1, z: 1, h: 0 });
  a.position.heading = 0;
  requestDefense(a);
  const combat = new CombatSystem(ecs, world, [a, enemy]),
    feedback = a.entity.require('blockFeedback');
  const motion = new ShieldMotion();
  for (let i = 0; i < 90; i++) motion.sample(input(true, 1 / 60, 0));
  const before = JSON.stringify({
    position: a.position,
    health: a.health.current,
    defense: a.defending,
  });
  combat.damage(a, 24, enemy, { kind: 'melee', travel: { x: -0.7, z: -1 } });
  motion.sample(input(true, 0, combat.time), feedback);
  assert.equal(feedback.pendingCount, 1, 'zero-time inspection cannot drain simulation events');
  motion.sample(input(true, 1 / 60, combat.time), feedback);
  assert.ok(motion.recoil > 0 && motion.side < 0);
  const once = motion.snapshot();
  for (let i = 0; i < 30; i++) motion.sample(input(true, 0, combat.time), feedback);
  assert.deepEqual(motion.snapshot(), once);
  for (let i = 0; i < 120; i++) {
    for (let j = 0; j < 10; j++)
      combat.damage(a, 1000, enemy, { kind: 'projectile', travel: { x: -0.7, z: -1 } });
    motion.sample(input(true, 1 / 60, combat.time), feedback);
    assert.ok(
      Math.abs(motion.recoil) <= 0.075 &&
        Math.abs(motion.side) <= 0.04 &&
        Math.abs(motion.brace) <= 0.08,
    );
  }
  assert.equal(
    JSON.stringify({ position: a.position, health: a.health.current, defense: a.defending }),
    before,
  );
  for (let i = 0; i < 120; i++) motion.sample(input(true, 1 / 60, combat.time), feedback);
  assert.ok(Math.abs(motion.recoil) < 1e-5 && Math.abs(motion.side) < 1e-5);
});

test('opening targets follow current authority, keep lowering origin, and cancel stale reaction on forced reset', () => {
  const motion = new ShieldMotion();
  for (let i = 0; i < 30; i++) motion.sample({ ...input(true), gate: true, preparation: i / 30 });
  motion.sample({ ...input(false), gate: true, opening: 1 });
  assert.equal(motion.weight, 1);
  assert.equal(motion.opening, 1);
  for (let i = 0; i < 20; i++) motion.sample({ ...input(false), gate: true, opening: 1 });
  assert.ok(motion.counter > 0.04, 'opening carries a readable torso counter-turn');
  const counter = motion.counter;
  motion.sample({ ...input(false, 0), gate: true, opening: 0 });
  assert.equal(motion.counter, counter, 'interruption retains the current counter-turn');
  motion.sample({ ...input(false), gate: true, opening: 0 });
  assert.equal(motion.opening, 1, 'interrupted opening lowers from its last visual target');
  motion.sample({ ...input(true), gate: true, opening: 0 });
  assert.equal(motion.guarded, true);
  assert.ok(motion.opening > 0, 'the planner constrains only the necessary part of closing');
  motion.project(1, 0.05);
  assert.equal(motion.opening, 0.05);
  motion.sample({ ...input(false), forceReset: true });
  assert.deepEqual(motion.snapshot(), new ShieldMotion().snapshot());
});

test('impact magnitude changes reaction strength and opposite incoming sides mirror recoil', () => {
  const measure = (damage: number, side: number) => {
    const ecs = new ECS(),
      world: NavigationWorld = { tiles: new Map(), blockers: [], entities: [] };
    const a = createActor(ecs, world, 'player', 'player', { x: 0, z: 0, h: 0 }),
      source = createActor(ecs, world, 'source', 'skeleton', { x: 0, z: 1, h: 0 });
    a.position.heading = 0;
    requestDefense(a);
    const combat = new CombatSystem(ecs, world, [a, source]),
      motion = new ShieldMotion();
    for (let i = 0; i < 90; i++) motion.sample(input(true));
    combat.damage(a, damage, source, { kind: 'melee', travel: { x: side, z: -1 } });
    let peak = 0,
      lateral = 0;
    for (let i = 0; i < 30; i++) {
      motion.sample(input(true), a.entity.require('blockFeedback'));
      peak = Math.max(peak, motion.recoil);
      if (Math.abs(motion.side) > Math.abs(lateral)) lateral = motion.side;
    }
    return { peak, lateral };
  };
  const weak = measure(6, 0.7),
    strong = measure(24, 0.7),
    mirrored = measure(24, -0.7);
  assert.ok(strong.peak > weak.peak * 2);
  assert.ok(strong.lateral > 0 && mirrored.lateral < 0);
  assert.ok(Math.abs(strong.lateral + mirrored.lateral) < 1e-12);
  assert.equal(strong.peak, mirrored.peak);
});

test('a queued confirmed impulse keeps its world direction when facing changes before presentation', () => {
  const ecs = new ECS(),
    world: NavigationWorld = { tiles: new Map(), blockers: [], entities: [] };
  const a = createActor(ecs, world, 'player', 'player', { x: 0, z: 0, h: 0 }),
    source = createActor(ecs, world, 'source', 'skeleton', { x: 0, z: 1, h: 0 });
  a.position.heading = 0;
  requestDefense(a);
  const combat = new CombatSystem(ecs, world, [a, source]);
  combat.damage(a, 24, source, { kind: 'melee', travel: { x: 0, z: -1 } });
  const motion = new ShieldMotion();
  motion.sample({ ...input(true), heading: Math.PI }, a.entity.require('blockFeedback'));
  assert.ok(motion.recoil < 0, 'the old world impulse now points toward the newly facing shield');
  assert.ok(Math.abs(motion.side) < 1e-12);
});

test('released feedback is resolved in the actual eased rig basis rather than a newer motor heading', () => {
  const ecs = new ECS(),
    world: NavigationWorld = { tiles: new Map(), blockers: [], entities: [] };
  const actor = createActor(ecs, world, 'player', 'player', { x: 0, z: 0, h: 0 }),
    source = createActor(ecs, world, 'source', 'skeleton', { x: 0, z: 1, h: 0 });
  actor.position.heading = 0;
  requestDefense(actor);
  const actions = new ActionRig(humanoid(profiles.player));
  const combat = new CombatSystem(ecs, world, [actor, source]);
  combat.damage(actor, 24, source, { kind: 'melee', travel: { x: 0, z: -1 } });
  actor.entity.require('defense').release();
  actor.position.heading = Math.PI / 2;
  const motion = animateLocomotion(actor.motion.animation, 0, false, 1 / 60);
  actions.layer(actor, ecs, motion, 0, 1 / 60, false);
  actions.equipment(actor, motion, 1 / 60, 0, 0);
  assert.ok(actions.shield.recoil > 0.001);
  assert.ok(Math.abs(actions.shield.side) < 1e-12);
});

test('live action planning anticipates and recoils through coordinated grips and planted soles', () => {
  for (const kind of ['player', 'kobold'] as const) {
    const ecs = new ECS(),
      world: NavigationWorld = { tiles: new Map(), blockers: [], entities: [] };
    const actor = createActor(ecs, world, 'hero', kind, { x: 0, z: 0, h: 0 });
    actor.position.heading = 0;
    if (!actor.entity.has('defense')) actor.entity.add('defense', new Defense());
    const source = createActor(ecs, world, 'source', kind === 'player' ? 'skeleton' : 'player', {
      x: 0,
      z: 1.2,
      h: 0,
    });
    const combat = new CombatSystem(ecs, world, [actor, source]);
    const actions = new ActionRig(humanoid(profiles[kind]));
    const grounding = new GroundedLocomotion(humanoid(profiles[kind]), [
      { anchor: null },
      { anchor: null },
    ]);
    const sample = (dt = 1 / 60) => {
      const motion = animateLocomotion(actor.motion.animation, 0, false, dt);
      actions.layer(actor, ecs, motion, combat.time, dt, false);
      actions.equipment(actor, motion, dt, combat.time);
      const result = grounding.sample(actor, motion, 0, undefined, [], actions);
      actions.finish(result.pose);
      assert.ok(grounding.minimumClearance >= -0.001);
      if (!actions.targets.leftGrip.release) {
        const hand = socketPoint(result.pose, 'leftGrip'),
          grip = transformPoint(actions.frames.shield, 0, SHIELD_GRIP);
        assert.ok(Math.hypot(...hand.map((v, i) => v - grip[i])) < 0.01);
      }
      return { motion, result };
    };
    sample(0);
    requestDefense(actor);
    const raised = sample();
    assert.ok(Math.abs(raised.motion.lean) > 0.0001, 'guard has a supporting-body preparation');
    assert.equal(actions.targets.leftGrip.release, false);
    for (let i = 0; i < 60; i++) sample();
    const ready = [...actions.frames.shield];
    combat.damage(actor, 24, source, { kind: 'melee', travel: { x: 0.6, z: -1 } });
    sample();
    assert.ok(
      actions.frames.shield.some((v, i) => Math.abs(v - ready[i]) > 0.0001),
      'confirmed hit deforms the actual shield target',
    );
    const held = [...actions.frames.shield];
    actor.entity.require('defense').release();
    sample(0);
    assert.ok(
      actions.frames.shield.every((v, i) => Math.abs(v - held[i]) < 1e-7),
      'lowering starts at the published guard frame',
    );
    for (let i = 0; i < 100; i++) sample();
    assert.equal(actions.targets.leftGrip.release, true);
    assert.deepEqual(actor.position, { x: 0, z: 0, h: 0, heading: 0 });
  }
});

test('phalanx preparation leaves the gate covered, and current phase owns opening and restoration', () => {
  const ecs = new ECS(),
    world: NavigationWorld = { tiles: new Map(), blockers: [], entities: [] };
  const player = createActor(ecs, world, 'player', 'player', { x: 0, z: 7, h: 0 });
  const members = Array.from({ length: 4 }, (_, i) =>
    createActor(ecs, world, `kobold:${i}`, 'kobold', {
      x: (i - 1) * 1.15,
      z: i === 3 ? -1.2 : 0,
      h: 0,
    }),
  );
  const group = ecs.create('squad'),
    squad = new KoboldSquad(ecs, group, members);
  group.add('koboldSquad', squad);
  squad.chart.send({ type: 'ALERT', target: player.entity });
  const tick = {
    type: 'TICK' as const,
    dt: 1 / 60,
    survivors: 4,
    valid: true,
    cohesive: true,
    home: false,
    attack: 'LONG_THRUST' as const,
  };
  squad.chart.send(tick);
  const actor = members[1];
  actor.position.heading = 0;
  requestDefense(actor);
  const actions = new ActionRig(humanoid(profiles.kobold));
  const ground = new GroundedLocomotion(humanoid(profiles.kobold), [
    { anchor: null },
    { anchor: null },
  ]);
  const sample = () => {
    const pose = animateLocomotion(actor.motion.animation, 0, false, 1 / 60);
    actions.layer(actor, ecs, pose, 0, 1 / 60, false);
    actions.equipment(actor, pose, 1 / 60, 0);
    const result = ground.sample(actor, pose, 0, undefined, [], actions);
    actions.finish(result.pose);
    return pose;
  };
  for (let i = 0; i < 60; i++) sample();
  squad.chart.send({ ...tick, dt: 1.2 });
  const before = { ...squad.chart.snapshot.context };
  for (let i = 0; i < 8; i++) sample();
  assert.ok(actions.shield.brace > 0.001);
  assert.equal(actions.opening, 0);
  assert.equal(actor.defending, true);
  assert.deepEqual(squad.chart.snapshot.context, before);
  squad.chart.send({ ...tick, dt: 0.06 });
  actor.entity.require('defense').release();
  sample();
  assert.equal(squad.state, 'opening');
  assert.equal(actions.shield.weight, 1);
  squad.chart.send({ ...tick, dt: 0.3 });
  sample();
  assert.equal(actions.opening, 1);
  assert.ok(actions.frames.shield[12] < -0.5);
  squad.chart.send({ ...tick, dt: 0.3 });
  sample();
  assert.equal(squad.state, 'attacking');
  assert.equal(actions.opening, 1);
  squad.chart.send({ ...tick, attackDone: true });
  requestDefense(actor);
  sample();
  assert.equal(squad.state, 'recovering');
  assert.equal(actor.defending, true);
  assert.equal(actions.opening, 0);
  const corners = [
    [-0.24, -0.38, -0.24],
    [-0.1, 0.34, 0.38],
    [-0.24, 0.34, 0.38],
    [-0.1, -0.38, -0.24],
  ] as const;
  const xs = corners.map((p) => transformPoint(actions.frames.shield, 0, p)[0]);
  assert.ok(Math.min(...xs) < 0.575 && Math.max(...xs) > 0.575, 'restored gate covers its lane');
});
