import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { Navigator } from '../src/navigation.ts';
import { generateDungeon, generateDungeonWithReport, validateDungeon } from '../src/world.ts';
import { ECS } from '../src/ecs.ts';
import { registerWorld } from '../src/worldEntities.ts';

for (const module of [
  'actorRendering',
  'actors',
  'animationReview',
  'buildDungeon',
  'cargo',
  'combat',
  'corpseRendering',
  'deathPhysics',
  'koboldSquads',
  'lastEmber',
  'navigation',
  'objectiveWork',
  'player',
  'ragdoll',
  'rigs/grounding',
  'rigs/tailClearance',
  'routeGrid',
  'social',
  'tribute',
])
  test(`native ${module} loads without the generation interpreter`, () => {
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
    import { registerHooks } from 'node:module';
    registerHooks({ resolve(specifier, context, next) {
      if (specifier === 'effect' || specifier.startsWith('effect/'))
        throw new Error('Helper must not load ' + specifier);
      // Match Vite's extension resolution for browser-only Babylon submodules.
      if ((specifier.startsWith('@babylonjs/core/') || specifier.startsWith('@babylonjs/materials/')) && !specifier.endsWith('.js'))
        return next(specifier + '.js', context);
      return next(specifier, context);
    }});
     await import('./src/${module}.ts');
  `,
      ],
      { cwd: new URL('../', import.meta.url), timeout: 10000, stdio: 'pipe' },
    );
  });

test('missing sites accumulate in order, but a same-message navigator defect escapes', () => {
  const world = generateDungeon();
  const ecs = new ECS();
  registerWorld(ecs, world);
  const door = world.entities.find((entity) => entity.type === 'door');
  const chest = world.entities.find((entity) => entity.type === 'chest');
  assert.ok(door && chest);
  assert.equal(ecs.get(door.id)?.require('door'), door);
  assert.equal(ecs.get(chest.id)?.require('interaction'), chest);
  door.open = true;
  assert.equal(ecs.get(door.id)?.require('door').open, true);
  delete world.tribute;
  world.props = world.props.filter((prop) => prop.type !== 'shrine');
  assert.deepEqual(validateDungeon(world).slice(0, 2), [
    'Missing reserved tribute sites',
    'Missing Last Ember shrine, focus or clue',
  ]);
  const sentinel = new Error('Missing reserved tribute sites');
  const original = Navigator.prototype.canStand;
  let calls = 0;
  Navigator.prototype.canStand = () => {
    calls++;
    throw sentinel;
  };
  try {
    assert.throws(
      () => generateDungeonWithReport(),
      (error) => error === sentinel,
    );
    assert.equal(calls, 1);
  } finally {
    Navigator.prototype.canStand = original;
  }
});
