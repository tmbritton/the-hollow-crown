import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoundsGrid } from '../src/collisionCandidates.ts';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { TerrainCandidates } from '../src/terrainCandidates.ts';

test('closed swept bounds preserve order, deduplicate and ignore far entries', () => {
  const grid = new BoundsGrid<string>();
  const box = (x: number, y: number, z: number, w = 0) => ({
    minX: x - w,
    maxX: x + w,
    minY: y,
    maxY: y + 1,
    minZ: z - w,
    maxZ: z + w,
  });
  grid.set('large', box(0, 0, 0, 8), 1);
  grid.set('face', box(-4, 1, -4), 0);
  grid.set('above', box(-4, 5, -4), 2);
  const query = box(-3, 0, -3, 1);
  assert.deepEqual(grid.query(query), ['face', 'large']);
  for (let i = 0; i < 500; i++) grid.set(`far${i}`, box(100 + i, 0, 100), 3 + i);
  assert.deepEqual(grid.query(query), ['face', 'large']);
  grid.delete('large');
  assert.deepEqual(grid.query(query), ['face']);
  grid.clear();
  assert.deepEqual(grid.counts, { records: 0, buckets: 0, memberships: 0 });
});

test('unknown walls fall back on immediate creation and on activation after owner setup', () => {
  for (const mode of ['late activation', 'same-turn creation', 'detached declaration']) {
    const engine = new NullEngine();
    try {
      const scene = new Scene(engine);
      const proxy = MeshBuilder.CreateBox('motor', {}, scene);
      proxy.ellipsoid.set(0.5, 0.5, 0.5);
      const createWall = () => {
        const wall = MeshBuilder.CreateBox('unknown', { width: 0.1, depth: 4, height: 3 }, scene);
        wall.position.x = 1;
        wall.computeWorldMatrix(true);
        return wall;
      };
      let wall = mode === 'late activation' ? createWall() : undefined;
      const owner = new TerrainCandidates(scene, []);
      owner.declareDecorative(proxy);
      const sweep = (scan: boolean) => {
        owner.fullScan = scan;
        proxy.position.setAll(0);
        proxy.computeWorldMatrix(true);
        owner.move(proxy, new Vector3(2, 0, 0));
        return proxy.position.x;
      };
      assert.equal(sweep(false), 2);
      let detached;
      if (mode === 'detached declaration') {
        detached = createWall();
        scene.removeMesh(detached);
        // A stale decoration declaration must not make the census hide an unknown mesh.
        owner.declareDecorative(detached);
      }
      wall ??= createWall();
      wall.checkCollisions = true;
      const native = sweep(true);
      assert.ok(Math.abs(native - 0.445) < 0.001, `native contact: ${native}`);
      assert.equal(sweep(false), native, mode);
      wall.checkCollisions = false;
      assert.equal(sweep(false), 2);
      detached?.dispose();
    } finally {
      engine.dispose();
    }
  }
});
