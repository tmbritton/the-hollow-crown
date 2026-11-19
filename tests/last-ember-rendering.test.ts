import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { CustomMaterial } from '@babylonjs/materials/custom/customMaterial.js';
import { ECS } from '../src/ecs.ts';
import { createActor } from '../src/actors.ts';
import { seedEnemies } from '../src/combat.ts';
import { generateDungeon } from '../src/world.ts';
import { registerWorld } from '../src/worldEntities.ts';
import { EMBER, prepareLastEmber } from '../src/lastEmber.ts';
import { ObjectiveRecord } from '../src/objectives.ts';
import { createLastEmberRendering } from '../src/lastEmberRendering.ts';
import { WorkAction } from '../src/machines/actors/work.ts';

function fixture() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const materials = {
    gold: new CustomMaterial('gold', scene),
    iron: new CustomMaterial('iron', scene),
    cloth: new CustomMaterial('cloth', scene),
    rune: new StandardMaterial('rune', scene),
  };
  const world = generateDungeon('MOURNING-731');
  const ecs = new ECS();
  const run = ecs.create('run');
  registerWorld(ecs, world);
  const player = createActor(ecs, world, 'player', 'player', world.spawn);
  seedEnemies(ecs, world);
  const { scenario: ember, plan } = prepareLastEmber(ecs, world, player);
  const record = new ObjectiveRecord(plan);
  run.add('objectives', record);
  const renderer = createLastEmberRendering(scene, ecs, materials);
  let step = 0;
  const commit = (restore = 0, profane = 0, recovery?: 'cleanse' | 'repair') => {
    const amounts = new Map<string, number>([
      [EMBER.restore, restore],
      [EMBER.profane, profane],
      ...(recovery ? [[EMBER[recovery], 1] as const] : []),
    ]);
    record.resolveStep({
      step: ++step,
      activate: [...amounts.keys()],
      conditions: plan.objectives.map((o) => ({
        objectiveId: o.id,
        available: true,
        participants: o.participants.map((id) => ({ id, eligible: true, status: 'working' })),
      })),
      contributions: plan.objectives.flatMap((o) => {
        const amount = amounts.get(o.id) ?? 0;
        return amount
          ? [{ id: `${step}:${o.id}`, objectiveId: o.id, participantId: o.participants[0], amount }]
          : [];
      }),
    });
  };
  const seals = (kind: string) =>
    scene.meshes.filter((m) => m.name.startsWith(`Last Ember ${kind}`));
  return { engine, scene, ecs, run, player, ember, record, renderer, materials, seals, commit };
}

test('seal rendering bounds detached objective reads per update, including idle frames', (t) => {
  const f = fixture();
  t.after(() => f.engine.dispose());
  let reads = 0;
  const get = f.record.get;
  f.record.get = function (id) {
    reads++;
    return get.call(this, id);
  };
  t.after(() => {
    f.record.get = get;
  });
  for (let i = 0; i < 20; i++) f.renderer.update();
  reads = 0;
  const cpu = process.cpuUsage(),
    start = performance.now();
  for (let i = 0; i < 240; i++) f.renderer.update();
  const elapsed = performance.now() - start,
    used = process.cpuUsage(cpu);
  t.diagnostic(
    JSON.stringify({
      updates: 240,
      reads,
      readsPerUpdate: reads / 240,
      elapsedMs: elapsed,
      cpuMs: (used.user + used.system) / 1000,
    }),
  );
  assert.ok(reads <= 5 * 240, `Expected at most 5 reads/update; observed ${reads / 240}`);
});

test('seals reflect fresh progress, work pulse, terminal restoration and scenario removal', (t) => {
  const f = fixture();
  t.after(() => f.engine.dispose());
  f.renderer.update();
  assert.equal(f.scene.meshes.length, 12);
  for (const mesh of f.scene.meshes) {
    assert.equal(mesh.material, f.materials.gold);
    assert.equal(mesh.scaling.x, 0.8);
    assert.equal(mesh.rotation.z, Math.PI / 4);
  }
  f.commit(2);
  const work = new WorkAction(f.player.entity, EMBER.restore);
  f.player.entity.add('work', work);
  work.chart.send({ type: 'START', id: 'pulse', duration: 6 });
  work.chart.send({ type: 'TICK', dt: 0.25 });
  f.renderer.update();
  f.seals('shrine').forEach((mesh, i) => {
    assert.equal(mesh.material, i < 2 ? f.materials.rune : f.materials.gold);
    assert.equal(mesh.scaling.x, (i < 2 ? 1.2 : 0.8) * 1.12);
  });
  f.player.entity.remove('work');
  f.commit(4);
  f.renderer.update();
  for (const mesh of f.seals('shrine')) {
    assert.equal(mesh.material, f.materials.rune);
    assert.equal(mesh.scaling.x, 1.2);
  }
  f.run.remove('lastEmber');
  f.renderer.update();
  assert.ok(f.scene.meshes.every((m) => !m.isEnabled()));
});

for (const [result, recovery] of [
  ['corrupted', 'cleanse'],
  ['fractured', 'repair'],
] as const) {
  test(`${result} seals update immediately through disabled focus and ${recovery}`, (t) => {
    const f = fixture();
    t.after(() => f.engine.dispose());
    f.renderer.update();
    f.commit(result === 'fractured' ? 6 : 0, 6);
    assert.equal(f.ember.state, result);
    f.renderer.update();
    f.scene.meshes.forEach((mesh, i) => {
      assert.equal(mesh.material, f.materials.cloth);
      assert.equal(mesh.rotation.z, result === 'fractured' ? (i % 2 ? -0.7 : 0.7) : Math.PI / 4);
    });
    f.ecs.get(f.ember.sites.focus.sourceId)!.require('focus').send({ type: 'DISABLE' });
    f.renderer.update();
    assert.ok(f.seals('focus').every((m) => m.material === f.materials.iron));
    f.commit(0, 0, recovery);
    f.renderer.update();
    assert.ok(f.seals('shrine').every((m) => m.material === f.materials.rune));
    assert.ok(f.seals('focus').every((m) => m.material === f.materials.iron));
    assert.ok(f.scene.meshes.every((m) => m.rotation.z === Math.PI / 4));
  });
}
