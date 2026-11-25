import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECS } from '../src/ecs.ts';
import { createActor, requestDefense, stopActor } from '../src/actors.ts';
import { CombatSystem } from '../src/combat.ts';
import { hurtWeight } from '../src/playerHurt.ts';

test('only accepted surviving hero damage publishes hurt; stop and death retire it', () => {
  const ecs = new ECS();
  const at = { x: 0, z: 0, h: 0 };
  const world = { tiles: new Map(), blockers: [], entities: [] };
  const player = createActor(ecs, world, 'player', 'player', at);
  player.position.heading = 0;
  const foe = createActor(ecs, world, 'foe', 'skeleton', at);
  const combat = new CombatSystem(ecs, world, [player, foe]);
  const feedback = player.entity.require('playerHurt');
  requestDefense(player);
  assert.equal(combat.damage(player, 4, foe, { kind: 'melee', travel: { x: 0, z: -1 } }), false);
  assert.equal(feedback.sample, null);
  assert.ok(combat.damage(foe, 4, player));
  assert.equal(foe.entity.has('playerHurt'), false);
  player.health.invulnerable = 1;
  assert.equal(combat.damage(player, 4, foe), false);
  assert.equal(feedback.sample, null);
  player.health.invulnerable = 0;
  assert.ok(combat.damage(player, 5, foe, { kind: 'melee', travel: { x: 0, z: 1 } }));
  assert.equal(player.health.current, 95);
  const first = feedback.sample!;
  assert.equal(first.sequence, 1);
  assert.ok(combat.damage(player, 5, foe));
  assert.equal(feedback.sample!.sequence, 2);
  stopActor(player);
  assert.equal(feedback.sample, null);
  assert.ok(combat.damage(player, 100, foe));
  assert.equal(feedback.sample, null);
});

test('the fixed-clock recoil has a fast onset, decays, and never restarts on read', () => {
  assert.equal(hurtWeight(-0.01), 0);
  assert.ok(hurtWeight(0.016) > 0);
  assert.equal(hurtWeight(0.035), 1);
  assert.ok(hurtWeight(0.1) < 1);
  assert.equal(hurtWeight(0.18), 0);
});
