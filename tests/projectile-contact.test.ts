import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createActor } from '../src/actors.ts';
import { CombatSystem } from '../src/combat.ts';
import { ECS } from '../src/ecs.ts';
import type { NavigationWorld } from '../src/navigation.ts';
import type { Tile } from '../src/worldTypes.ts';

const orders = [
  ['player', 'ally', 'owner'],
  ['player', 'owner', 'ally'],
  ['ally', 'player', 'owner'],
  ['ally', 'owner', 'player'],
  ['owner', 'player', 'ally'],
  ['owner', 'ally', 'player'],
];
function fixture(order: string[], kind: 'THROW_JAVELIN' | 'CROSSBOW' = 'THROW_JAVELIN') {
  const ecs = new ECS(),
    tiles = new Map<string, Tile>();
  for (let x = -3; x <= 3; x++)
    for (let z = -3; z <= 3; z++) tiles.set(`${x},${z}`, { x, z, h: 0, surface: 'stone' });
  const world: NavigationWorld = { tiles, blockers: [], entities: [] };
  const actors = order.map((id) =>
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
    ally = combat.actor('ally')!;
  const shot = ecs
    .create('shot')
    .add('transform', { x: 0, z: 0.8, h: 0.85, heading: 0 })
    .add('projectile', { owner: 'owner', kind, vx: 0, vy: 0, vz: 10, life: 1, damage: 10 });
  return {
    ecs,
    world,
    combat,
    player,
    ally,
    actors,
    shot,
    p: shot.require('transform'),
    flight: shot.require('projectile'),
  };
}

test('swept javelin edge contact is insertion-order independent across forward, rotated and reverse travel', (t) => {
  let cases = 0;
  const entry = 1 - Math.sqrt(0.48 ** 2 - 0.455 ** 2);
  for (const order of orders)
    for (const angle of [0, Math.PI / 2, Math.PI, -0.7]) {
      const f = fixture(order),
        hp = f.ally.health.current;
      for (const p of [...f.actors.map((a) => a.position), f.p]) {
        const { x, z } = p;
        p.x = x * Math.cos(angle) + z * Math.sin(angle);
        p.z = -x * Math.sin(angle) + z * Math.cos(angle);
      }
      Object.assign(f.flight, { vx: 10 * Math.sin(angle), vz: 10 * Math.cos(angle) });
      f.combat.update(1 / 60);
      assert.equal(f.player.health.current, 100, `${order}/${angle}`);
      assert.equal(f.ally.health.current, hp);
      assert.equal(f.ecs.get('shot'), undefined);
      assert.ok(
        Math.hypot(f.p.x - Math.sin(angle) * entry, f.p.z - Math.cos(angle) * entry) < 1e-10,
      );
      cases++;
    }
  t.diagnostic(`${cases} swept edge/order cases; first contact z=${entry}`);
});

test('javelin sweep catches a grazing hostile between samples and chooses a closer hostile before an ally', () => {
  for (const order of orders)
    for (const graze of [false, true]) {
      const f = fixture(order);
      f.player.position.z = graze ? 0.92 : 0.98;
      if (graze) f.player.position.x = 0.4799;
      f.ally.position.z = 2;
      f.combat.update(1 / 60);
      assert.equal(f.player.health.current, 90);
      assert.equal(f.ally.health.current, f.ally.health.max);
      assert.equal(f.ecs.get('shot'), undefined);
      const entry = f.player.position.z - Math.sqrt(0.48 ** 2 - f.player.position.x ** 2);
      assert.ok(Math.abs(f.p.z - entry) < 1e-10);
      f.combat.update(1 / 60);
      assert.equal(f.player.health.current, 90, 'exactly one impact');
    }
});

test('javelins handle stationary, moving-away and vertical travel without false horizontal hits', () => {
  for (const order of orders)
    for (const travel of ['stationary', 'inside', 'away', 'vertical'] as const) {
      const f = fixture(order);
      f.flight.vz = travel === 'away' ? -10 : 0;
      if (travel === 'inside') Object.assign(f.p, { x: -0.455, z: 1 });
      if (travel === 'vertical') {
        Object.assign(f.p, { z: 1, h: 0 });
        f.flight.vy = 10;
        f.player.position.h = 0.02;
      }
      f.combat.update(1 / 60);
      assert.equal(f.player.health.current, 100, `${order}/${travel}`);
      assert.equal(f.ally.health.current, f.ally.health.max);
      assert.equal(!!f.ecs.get('shot'), travel === 'stationary' || travel === 'away');
      if (travel === 'vertical') assert.ok(Math.abs(f.p.h - 0.1) < 1e-10);
    }
});

test('swept javelins intersect the current airborne elevation slab, including sloped flight', () => {
  for (const order of orders)
    for (const mode of ['high-ally', 'low-ally', 'high-player', 'sloped'] as const) {
      const f = fixture(order);
      if (mode === 'high-ally' || mode === 'low-ally') {
        f.ally.jump.request();
        f.ally.jump.advance(mode === 'high-ally' ? 0.3 : 0.1);
      } else if (mode === 'high-player') {
        f.ally.position.x = -2;
        f.player.jump.request();
        f.player.jump.advance(0.3);
      } else {
        f.p.h = 1.7;
        f.flight.vy = 10;
        f.player.position.h = 1;
      }
      f.combat.update(1 / 60);
      assert.equal(
        f.player.health.current,
        mode === 'high-ally' || mode === 'sloped' ? 90 : 100,
        `${order}/${mode}`,
      );
      assert.equal(f.ally.health.current, f.ally.health.max);
      assert.equal(!!f.ecs.get('shot'), mode === 'high-player');
    }
});

test('world cover before swept body contact wins; cover later in the same substep does not erase a hit', () => {
  for (const order of orders)
    for (const cover of ['before', 'after', 'closed-door'] as const) {
      const f = fixture(order);
      f.ally.position.x = -2;
      f.player.position.z = 1;
      if (cover === 'closed-door')
        f.world.entities.push({
          id: 'gate',
          type: 'door',
          x: 0,
          z: 1.04,
          h: 0,
          axis: 'z',
          locked: true,
          requiresAltar: true,
          open: false,
          angle: 0,
        });
      else
        f.world.blockers.push({
          id: 'cover',
          x: 0,
          z: cover === 'before' ? 0.84 : 0.86,
          w: 0.004,
          d: 0.004,
        });
      f.combat.update(1 / 60);
      assert.equal(f.player.health.current, cover === 'after' ? 90 : 100, `${order}/${cover}`);
      assert.equal(f.ecs.get('shot'), undefined);
    }
});

test('crossbow allegiance still skips the friendly edge interceptor in every insertion order', () => {
  for (const order of orders) {
    const f = fixture(order, 'CROSSBOW');
    f.combat.update(1 / 60);
    assert.equal(f.player.health.current, 90);
    assert.equal(f.ally.health.current, f.ally.health.max);
    assert.equal(f.ecs.get('shot'), undefined);
  }
});
