import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeonWithReport, key, reachableTiles, validateDungeon } from '../src/world.ts';
import { createGenerationReport } from '../src/generation/report.ts';
import { SCENE_RECIPES } from '../src/generation/scenes.ts';
import { Navigator } from '../src/navigation.ts';

test('final worlds preserve recipe identity, reserved work paths and real navigation across 100 seeds', () => {
  const orientations = new Set<number>();
  let omissions = 0;
  for (let i = 0; i < 100; i++) {
    const { world } = generateDungeonWithReport(`scene-world-${i}`);
    assert.ok(world.scenes, 'world must retain accepted scene provenance');
    assert.deepEqual(world.scenes.map((s) => s.room).sort(), ['bakery', 'smithy']);
    const reachable = reachableTiles(world);
    for (const scene of world.scenes) {
      const room = world.roomById[scene.room];
      const navigator = new Navigator(world);
      assert.equal(scene.recipeId, SCENE_RECIPES[scene.room].id);
      assert.ok(scene.props.length >= 2 && scene.props.length <= 4);
      orientations.add(scene.props[0].rotation);
      omissions += scene.sockets.filter((s) => s.reason === 'omitted').length;
      for (const p of scene.reserved) {
        assert.ok(world.reserved.has(key(p.x, p.z)));
        assert.ok(reachable.has(key(p.x, p.z)), `${world.seed}: reserved work path inaccessible`);
      }
      for (const prop of scene.props) {
        assert.equal(
          world.props.find((p) => p.id === prop.id),
          prop,
        );
        assert.ok(world.blockers.some((b) => b.id === prop.id));
        assert.ok(prop.frontClearance);
        assert.ok(
          navigator.goTo(room, prop.frontClearance),
          `${world.seed}: ${prop.id} unreachable`,
        );
      }
    }
    assert.deepEqual(validateDungeon(world), []);
  }
  assert.equal(orientations.size, 4);
  assert.ok(omissions > 0, 'corpus must exercise optional simplification');
});

test('scene reports detach nested placement diagnostics and final validation detects damaged work paths', () => {
  const { world, report: trace } = generateDungeonWithReport('MOURNING-731');
  const report = createGenerationReport(world, trace);
  assert.ok(world.scenes && report.scenes, 'report must expose accepted recipes');
  assert.deepEqual(report.scenes, world.scenes);
  const initial = structuredClone(report.scenes);
  const scene = world.scenes[0];
  const approach = scene.props[0].frontClearance!;
  world.tiles.get(key(approach.x, approach.z))!.blocked = true;
  assert.ok(
    validateDungeon(world).some((reason) => reason.includes('Scene work path inaccessible')),
  );
  scene.sockets[0].reason = 'omitted';
  scene.reserved[0].x += 100;
  assert.deepEqual(report.scenes, initial);
  report.scenes[0].props[0].x += 100;
  assert.notEqual(report.scenes[0].props[0].x, scene.props[0].x);
});
