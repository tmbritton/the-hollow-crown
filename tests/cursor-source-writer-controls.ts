import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { compileFunction } from 'node:vm';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import '@babylonjs/core/Collisions/collisionCoordinator.js';
import { sampleCurve, volumeScale } from '../src/animationCurves.ts';
import { captureWriters, writerDiagnostic } from './cursor-attribution-writers.ts';
import { reconcileWriters } from './cursor-publication-replay.ts';

// Execute the transformed production loops from the actual Vite plugin output.
// Substitutions are only for scene setup and upstream simulation inputs. The
// omission replaces one recording call, not the authored operation it wraps.
function body(source: string, start: string, end: string) {
  assert.equal(source.split(start).length, 2, start);
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(to > from, end);
  return source.slice(from, to);
}

export function sourceWriterControls(sources: Record<string, string>) {
  collisionControls(sources['actorRendering.ts']);
  const health = compileFunction(
    body(sources['enemyRendering.ts'], '      for (const bar of bars)', '      for (const pool'),
    ['bars', 'target', 'TransformNode', 'epWrite'],
  );
  const sack = compileFunction(
    stripTypeScriptTypes(
      body(
        sources['socialRendering.ts'],
        '      for (const { mesh, group } of balls)',
        '    },\n  };',
      ),
    ),
    ['balls', 'combat', 'hackySackPass', 'worldPoint', 'sampleCurve', 'volumeScale', 'epWrite'],
  );
  const presentation = compileFunction(
    body(
      sources['main.ts'],
      "  for (const entity of game.ecs.query('floating'))",
      "  for (const entity of game.ecs.query('portrait'))",
    ),
    ['game', 'camera', 'dt', 'epWrite'],
  );
  const cases = [
    'health root',
    'health fill',
    'sack rest',
    'sack flight',
    'steed root',
    'steed head',
    'steed tail',
    'float',
    'cutaway',
  ] as const;
  for (const omission of [null, ...cases]) {
    const engine = new NullEngine();
    try {
      const scene = new Scene(engine);
      const healthRoot = new TransformNode('health root', scene);
      const healthBack = CreateBox('health back', {}, scene);
      const healthFill = CreateBox('health fill', {}, scene);
      healthBack.parent = healthFill.parent = healthRoot;
      healthRoot.setEnabled(false);
      const ball = CreateBox('interrupted game sack', {}, scene);
      const flight = CreateBox('in flight sack', {}, scene);
      const root = new TransformNode('steed root', scene);
      const head = new TransformNode('steed head', scene);
      const tail = new TransformNode('steed tail', scene);
      head.parent = tail.parent = root;
      const steedBody = CreateBox('steed body', {}, scene);
      const steedFace = CreateBox('steed face', {}, scene);
      const steedTail = CreateBox('steed plume', {}, scene);
      steedBody.parent = root;
      steedFace.parent = head;
      steedTail.parent = tail;
      const float = CreateBox('votive', {}, scene);
      // Same allocation pattern as buildDungeon: render batch has a pivot, but
      // its separate static collision allocation is not part of the cutaway.
      const wall = CreateBox('upper cutaway batch', { width: 70, depth: 50 }, scene);
      wall.setPivotPoint(new Vector3(0, 3, 0));
      const collider = CreateBox('wall collider', {}, scene);
      collider.freezeWorldMatrix();
      for (const mesh of scene.meshes) {
        mesh.computeWorldMatrix(true);
        mesh.getBoundingInfo();
      }
      const actor = { alive: true, position: { x: 3, h: 1, z: 2 }, health: { current: 2, max: 5 } };
      const bars = [{ root: healthRoot, fill: healthFill, actor }];
      const combat = {
        time: 1,
        actor: (id: string) => ({
          entity: {
            require: () => ({ pose: { id, definition: { profile: { soleForward: 0 } } } }),
          },
        }),
      };
      const fixed = new Map<TransformNode, (typeof cases)[number]>([
        [healthRoot, 'health root'],
        [healthFill, 'health fill'],
        [ball, 'sack rest'],
        [flight, 'sack flight'],
        [root, 'steed root'],
        [head, 'steed head'],
        [tail, 'steed tail'],
        [float, 'float'],
        [wall, 'cutaway'],
      ]);
      const epWrite: typeof writerDiagnostic = (kind, owner, run) =>
        omission && fixed.get(owner) === omission ? run() : writerDiagnostic(kind, owner, run);
      const capture = captureWriters(scene, {
        runId: 'source-controls',
        kind: 'idle',
        provenance: 'software',
      });
      capture.begin(0, 0);
      capture.phase('fixed', 1);
      health(bars, undefined, TransformNode, epWrite);
      sack(
        [
          { mesh: ball, group: { center: { h: 2 } } },
          { mesh: flight, group: { flight: true } },
        ],
        combat,
        (group: { flight?: boolean }) =>
          group.flight ? { from: 'a', to: 'b', progress: 0.08 } : null,
        (p: { id: string }) => (p.id === 'a' ? [0, 1, 0] : [8, 2, 3]),
        sampleCurve,
        volumeScale,
        epWrite,
      );
      capture.checkpoint();
      capture.phase('presentation', 1);
      const components = {
        floating: [{ mesh: float, y: 2, phase: 0.5, spin: 1 }],
        ambientMotion: [{ root, head, tail, phase: 0.3 }],
        cutaway: [{ meshes: [wall], dx: 1, dz: 0, scale: 1 }],
      };
      presentation(
        {
          time: 2,
          ecs: {
            query: (key: keyof typeof components) =>
              components[key].map((value) => ({ require: () => value })),
          },
        },
        { alpha: 0 },
        1 / 60,
        epWrite,
      );
      capture.checkpoint();
      capture.phase('render', 1);
      for (const mesh of scene.meshes) {
        mesh.computeWorldMatrix(true);
        mesh.getBoundingInfo();
      }
      capture.checkpoint();
      capture.end(1);
      capture.close();

      assert.equal(healthRoot.billboardMode, TransformNode.BILLBOARDMODE_ALL);
      assert.equal(healthFill.scaling.x, 0.4);
      assert.equal(ball.position.y, 2.1);
      assert.notEqual(flight.scaling.y, 1);
      assert.notEqual(wall.scaling.y, 1);
      assert.equal(collider.scaling.y, 1);
      const names = scene.meshes.map((mesh) => mesh.name);
      const result = reconcileWriters(capture.trace);
      const [frame] = result.frames;
      if (!omission) {
        assert.deepEqual(result.gaps, []);
        assert.deepEqual(
          frame.writes.filter((w) => w.kind === 'pose').map((w) => [w.phase, names[w.id]]),
          [
            ['fixed', 'health back'],
            ['fixed', 'health fill'],
            ['fixed', 'health fill'],
            ['fixed', 'interrupted game sack'],
            ['fixed', 'in flight sack'],
            ['presentation', 'votive'],
            ['presentation', 'steed body'],
            ['presentation', 'steed face'],
            ['presentation', 'steed plume'],
            ['presentation', 'steed face'],
            ['presentation', 'steed plume'],
            ['presentation', 'upper cutaway batch'],
          ],
        );
        const cutaway = frame.writes.find((w) => w.kind === 'pose' && names[w.id] === wall.name)!;
        assert.deepEqual(
          [cutaway.bounds, cutaway.crossed, cutaway.boundsRefreshes],
          [[-35, -25, 35, 25], [], 1],
        );
      } else {
        const witness = {
          'health root': healthBack,
          'health fill': healthFill,
          'sack rest': ball,
          'sack flight': flight,
          'steed root': steedBody,
          'steed head': steedFace,
          'steed tail': steedTail,
          float,
          cutaway: wall,
        }[omission];
        const seam =
          omission.startsWith('health') || omission.startsWith('sack') ? 'fixed' : 'presentation';
        const difference = frame.checkpointDifferences
          .find((c) => c.phase === seam && c.tick === 1)
          ?.meshes.find((m) => m.name === witness.name);
        assert.equal(difference?.id, names.indexOf(witness.name), omission);
        assert.ok(difference?.fields.includes('missing source: authored'), omission);
      }
    } finally {
      engine.dispose();
    }
  }
}

function collisionControls(source: string) {
  const bindCollision = compileFunction(
    stripTypeScriptTypes(
      `function fixture() {${body(source, '  const proxy = MeshBuilder.CreateBox', '\n}\n\nexport function resetActorRig')}\n}`,
    ) + '\nreturn fixture();',
    [
      'actor',
      'scene',
      'world',
      'MeshBuilder',
      'TERRAIN_RADIUS',
      'Vector3',
      'tileAt',
      'heightAt',
      'collisionTerrain',
      'epWrite',
    ],
  );
  for (const omission of [0, 1, 2, 3]) {
    const engine = new NullEngine();
    try {
      const scene = new Scene(engine);
      type Collision = {
        sync(position: { x: number; h: number; z: number }): void;
        move(
          from: { x: number; h: number; z: number },
          displacement: { x: number; z: number },
        ): { x: number; z: number };
      };
      let collision: Collision | undefined;
      let sourceIndex = 0;
      const writer: typeof writerDiagnostic = (kind, owner, run) =>
        ++sourceIndex === omission ? run() : writerDiagnostic(kind, owner, run);
      const actor = {
        id: 'test actor',
        jump: { height: 0.1 },
        entity: {
          add: (_kind: string, value: Collision) => {
            collision = value;
          },
        },
        navigator: { retreatingDoors: () => [] },
      };
      const proxy: ReturnType<typeof CreateBox> = bindCollision(
        actor,
        scene,
        {},
        { CreateBox },
        0.3,
        Vector3,
        () => true,
        () => 1.5,
        () => null,
        writer,
      );
      proxy.position.x = 9;
      proxy.computeWorldMatrix(true);
      const capture = captureWriters(scene, {
        runId: 'collision-controls',
        kind: 'idle',
        provenance: 'software',
      });
      capture.begin(0, 4);
      capture.phase('fixed', 5);
      assert.ok(collision);
      const moved = collision.move({ x: 8, h: 1, z: 1 }, { x: 0.2, z: 0 });
      assert.ok(Math.abs(moved.x - 8.2) < 1e-9 && moved.z === 1);
      collision.sync({ x: 8.2, h: 1.5, z: 1 });
      capture.checkpoint();
      capture.phase('presentation', 5);
      capture.checkpoint();
      capture.phase('render', 5);
      capture.checkpoint();
      capture.end(5);
      capture.close();
      const result = reconcileWriters(capture.trace);
      if (!omission) {
        assert.deepEqual(result.gaps, []);
        const physics = capture.trace.frames[0].writes.filter((w) => w.kind === 'physics');
        // Ground reset, Babylon's actual collision position write, ground-height
        // adjustment, and airborne sync are distinct ordered publications.
        assert.deepEqual(
          physics.map((w) => w.after!.input.authored!.slice(0, 3).map((v) => +v.toFixed(4))),
          [
            [8, 1.72, 1],
            [8.2, 1.72, 1],
            [8.2, 2.22, 1],
            [8.2, 2.32, 1],
          ],
        );
      } else
        assert.match(
          result.gaps.join(),
          /missing source for mesh 0 test actor collision proxy: authored \(fixed, tick 5\)/,
        );
    } finally {
      engine.dispose();
    }
  }
}
