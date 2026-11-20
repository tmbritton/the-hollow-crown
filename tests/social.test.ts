import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECS } from '../src/ecs.ts';
import { createActor } from '../src/actors.ts';
import { CombatSystem, seedEnemies } from '../src/combat.ts';
import { generateDungeon, key } from '../src/world.ts';
import type { NavigationWorld } from '../src/navigation.ts';
import type { Tile } from '../src/worldTypes.ts';
import type { SocialGroup } from '../src/social.ts';

test('[extended] seeded social groups preserve safe spawns and give packs stable gathering activities', () => {
  const observed = new Set<string>();
  for (let i = 0; i < 30; i++) {
    const world = generateDungeon(`SOCIAL-${i}`);
    const enemies = seedEnemies(new ECS(), world);
    assert.equal(enemies.length, 24);
    for (const actor of enemies) {
      assert.ok(actor.navigator.canStand(actor.position));
      if (actor.kind === 'skeleton') {
        assert.equal(actor.brain?.social, undefined);
        continue;
      }
      const group = actor.brain!.social!;
      assert.ok(group.members.includes(actor.id));
      assert.ok(actor.navigator.canStand(actor.brain!.home));
      if (actor.kind === 'goblin') assert.equal(group.activity, 'smoke');
      if (group.activity !== 'smoke')
        assert.ok(actor.navigator.segmentClear(group.center, actor.brain!.home));
      observed.add(group.activity);
    }
    const summarize = (actors: ReturnType<typeof seedEnemies>) =>
      actors.map((actor) => ({
        id: actor.id,
        position: actor.position,
        social: actor.brain?.social,
      }));
    assert.deepEqual(summarize(enemies), summarize(seedEnemies(new ECS(), world)));
  }
  assert.deepEqual([...observed].sort(), ['cards', 'hackysack', 'smoke']);
});

test('a social pack stays at its gathering, reacts to a threat, and returns after losing it', () => {
  const tiles = new Map<string, Tile>();
  for (let x = -30; x <= 30; x++)
    for (let z = -6; z <= 6; z++) tiles.set(key(x, z), { x, z, h: 0, surface: 'stone' });
  const world: NavigationWorld = { tiles, blockers: [], entities: [] };
  const ecs = new ECS();
  const player = createActor(ecs, world, 'player', 'player', { x: -25, z: 0, h: 0 });
  const pack = [0, 1, 2].map((slot) => {
    const actor = createActor(ecs, world, `kobold:${slot}`, 'kobold', {
      x: 0,
      z: slot * 2 - 2,
      h: 0,
    });
    actor.enableAI('pack', slot);
    return actor;
  });
  const group: SocialGroup = {
    id: 'pack',
    activity: 'cards',
    center: { x: 1, z: 0, h: 0 },
    members: pack.map((a) => a.id),
    phase: 0,
  };
  for (const actor of pack) actor.brain!.social = group;
  const combat = new CombatSystem(ecs, world, [player, ...pack]);
  const step = (frames: number) => {
    for (let i = 0; i < frames; i++) combat.update(1 / 60);
  };
  step(600);
  for (const actor of pack) {
    assert.equal(actor.brain!.state, 'cards');
    assert.equal(actor.navigator.active, false);
    assert.equal(actor.position.x, actor.brain!.home.x);
    assert.equal(actor.position.z, actor.brain!.home.z);
  }
  player.position.x = 5;
  player.health.invulnerable = 100;
  step(90);
  assert.ok(pack.every((actor) => actor.attack.target === player.id));
  assert.ok(pack.every((actor) => !['cards', 'smoke', 'hackysack'].includes(actor.brain!.state)));
  player.position.x = -25;
  step(600);
  assert.ok(pack.every((actor) => actor.brain!.state === 'cards'));
  assert.ok(
    pack.every(
      (actor) =>
        Math.hypot(actor.position.x - actor.brain!.home.x, actor.position.z - actor.brain!.home.z) <
        0.2,
    ),
  );
  combat.damage(pack[0], 100);
  combat.damage(pack[1], 100);
  step(40);
  assert.equal(pack[2].brain!.state, 'smoke', 'a lone survivor does not play a group game alone');
});
