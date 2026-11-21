import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECS } from '../src/ecs.ts';
import {
  createActor,
  requestDefense,
  requestJump,
  stopActor,
  teleportActor,
} from '../src/actors.ts';
import { CombatSystem } from '../src/combat.ts';
import type { NavigationWorld } from '../src/navigation.ts';

function fixture() {
  const ecs = new ECS();
  const world: NavigationWorld = { tiles: new Map(), blockers: [], entities: [] };
  for (let x = -5; x <= 5; x++)
    for (let z = -5; z <= 5; z++) world.tiles.set(`${x},${z}`, { x, z, h: 0, surface: 'stone' });
  const player = createActor(ecs, world, 'player', 'player', { x: 0, z: 0, h: 0 });
  const enemy = createActor(ecs, world, 'enemy', 'skeleton', { x: 0, z: 1.2, h: 0 });
  player.position.heading = 0;
  const combat = new CombatSystem(ecs, world, [player, enemy]);
  requestDefense(player);
  return { ecs, world, player, enemy, combat };
}

test('only accepted guard impacts publish owned, detached, once-consumed block feedback', () => {
  const { ecs, player, enemy, combat } = fixture();
  const feedback = player.entity.require('blockFeedback');
  const travel = { x: 0, z: -4 },
    contact = { x: 0.1, z: 0.4, h: 0.92 };
  assert.equal(combat.damage(player, 9, enemy, { kind: 'melee', travel, contact }), false);
  assert.equal(player.health.current, 100);
  assert.equal(feedback.pendingCount, 1);
  const event = feedback.last!;
  assert.equal(event.type, 'BLOCK_ACCEPTED');
  assert.equal(event.run, ecs);
  assert.equal(event.target, player.entity);
  assert.equal(event.source, enemy.entity);
  assert.equal(event.kind, 'melee');
  assert.equal(event.magnitude, 9);
  travel.z = 50;
  contact.h = 9;
  assert.deepEqual(event.travel, { x: 0, z: -1 });
  assert.deepEqual(event.contact, { x: 0.1, z: 0.4, h: 0.92 });
  assert.ok(Object.isFrozen(event) && Object.isFrozen(event.contact));
  const batch = feedback.consume(combat.time)!;
  assert.equal(batch.count, 1);
  assert.ok(batch.power > 0);
  assert.equal(feedback.consume(combat.time), null);
  assert.equal(feedback.pendingCount, 0);
});

test('unusable optional contact metadata falls back to an estimate for an otherwise accepted block', () => {
  const { player, enemy, combat } = fixture();
  assert.equal(
    combat.damage(player, 9, enemy, {
      kind: 'projectile',
      travel: { x: 0, z: -1 },
      contact: { x: NaN, z: 0, h: 0 },
    }),
    false,
  );
  const feedback = player.entity.require('blockFeedback');
  assert.equal(feedback.pendingCount, 1);
  assert.equal(feedback.last!.estimatedContact, true);
  assert.deepEqual(feedback.last!.contact, { x: 0, z: 0.42, h: 0.9 });
});

test('misses, protection, friendly/invalid damage and cancelled attacks produce no block feedback', () => {
  for (const invalid of [
    'side',
    'rear',
    'friendly',
    'zero',
    'nan',
    'hazard',
    'protection',
    'released',
    'jump',
    'cancelled',
    'cover',
  ] as const) {
    const { ecs, world, player, enemy, combat } = fixture();
    const feedback = player.entity.require('blockFeedback');
    if (invalid === 'protection') player.health.invulnerable = 1;
    if (invalid === 'released') player.entity.require('defense').release();
    if (invalid === 'jump') requestJump(player);
    if (invalid === 'cancelled' || invalid === 'cover') {
      assert.ok(combat.startAttack(enemy, player));
      if (invalid === 'cancelled') enemy.attack.interrupt();
      else world.blockers.push({ id: 'screen', x: 0, z: 0.6, w: 2, d: 0.1 });
      for (let i = 0; i < 20; i++) combat.update(1 / 60);
    } else {
      combat.damage(
        player,
        invalid === 'zero' ? 0 : invalid === 'nan' ? NaN : 9,
        invalid === 'friendly' ? player : enemy,
        invalid === 'hazard'
          ? undefined
          : {
              kind: 'melee',
              travel:
                invalid === 'side' ? { x: 1, z: 0 } : { x: 0, z: invalid === 'rear' ? 1 : -1 },
            },
      );
    }
    assert.equal(feedback.pendingCount, 0, invalid);
    assert.equal(feedback.last, null, invalid);
    assert.equal(feedback.consume(combat.time), null, invalid);
    assert.equal(
      ecs.query('particle').some((e) => e.require('particle').kind === 'block'),
      false,
      invalid,
    );
  }
});

test('same-step directional bursts combine deterministically and storage/energy stay bounded', () => {
  const hits = [
    { magnitude: 6, travel: { x: 0.7, z: -0.8 } },
    { magnitude: 24, travel: { x: -0.6, z: -0.9 } },
    { magnitude: 10, travel: { x: 0, z: -1 } },
  ];
  const consume = (order: number[], repetitions: number) => {
    const { player, enemy, combat } = fixture(),
      feedback = player.entity.require('blockFeedback');
    for (let i = 0; i < repetitions; i++)
      for (const n of order) {
        const hit = hits[n];
        combat.damage(player, hit.magnitude, enemy, { kind: 'projectile', travel: hit.travel });
      }
    const b = feedback.consume(combat.time)!;
    assert.ok(b.power <= 2 && Math.hypot(b.travel.x, b.travel.z) <= 1.000001);
    assert.equal(feedback.pendingCount, 0);
    return { power: b.power, travel: b.travel, count: b.count };
  };
  assert.deepEqual(consume([0, 1, 2], 1), consume([2, 1, 0], 1));
  assert.deepEqual(consume([0, 1, 2], 100), consume([2, 0, 1], 100));
});

test('block batches expire and cancellation, teleport, jump and entity replacement retire pending hits', () => {
  for (const operation of ['stop', 'teleport', 'jump', 'expired', 'replacement'] as const) {
    const f = fixture(),
      feedback = f.player.entity.require('blockFeedback');
    f.combat.damage(f.player, 9, f.enemy, { kind: 'melee', travel: { x: 0, z: -1 } });
    if (operation === 'stop') stopActor(f.player);
    if (operation === 'teleport') teleportActor(f.player, f.world, { x: 1, z: 0 });
    if (operation === 'jump') requestJump(f.player);
    if (operation === 'replacement') {
      f.ecs.remove(f.player.id);
      const fresh = createActor(f.ecs, f.world, 'player', 'player', { x: 0, z: 0, h: 0 });
      assert.equal(fresh.entity.require('blockFeedback').pendingCount, 0);
    }
    assert.equal(feedback.consume(operation === 'expired' ? 1 : f.combat.time), null, operation);
  }
});

test('real projectile flight publishes its actual contact and travel after its shooter moves', () => {
  const { player, enemy, combat } = fixture();
  enemy.position.z = 4.8;
  assert.ok(combat.startAttack(enemy, player, true));
  for (let i = 0; i < 28; i++) combat.update(1 / 60);
  enemy.position.z = -4;
  for (let i = 0; i < 32; i++) combat.update(1 / 60);
  const event = player.entity.require('blockFeedback').last!;
  assert.ok(event);
  assert.equal(event.kind, 'projectile');
  assert.equal(event.source, enemy.entity);
  assert.ok(event.travel.z < -0.99);
  assert.ok(Math.hypot(event.contact.x, event.contact.z) < 0.5);
  assert.ok(event.contact.h > player.elevation && event.contact.h < player.elevation + 1.6);
  assert.equal(player.health.current, 100);
});

test('presentation mailbox rejects another run and stays bounded even without a renderer', () => {
  const { ecs, player, enemy } = fixture(),
    feedback = player.entity.require('blockFeedback');
  const hit = {
    source: enemy.entity,
    time: 0,
    kind: 'melee' as const,
    magnitude: 12,
    travel: { x: 0, z: -1 },
    contact: { x: 0, z: 0.4, h: 0.9 },
    estimatedContact: true,
  };
  assert.equal(feedback.publish(new ECS(), hit), false);
  assert.equal(feedback.pendingCount, 0);
  for (let i = 0; i < 70000; i++) feedback.publish(ecs, hit);
  assert.equal(feedback.pendingCount, 65535);
  const batch = feedback.consume(0)!;
  assert.equal(batch.power, 2);
  assert.equal(batch.count, 65535);
  assert.equal(feedback.pendingCount, 0);
  feedback.publish(ecs, { ...hit, time: 2, magnitude: 6 });
  assert.equal(feedback.pendingCount, 1);
  assert.ok(feedback.consume(2)!.power < 1);
});
