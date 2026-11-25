import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Ray } from '@babylonjs/core/Culling/ray.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { captureWriters, writerDiagnostic } from './cursor-attribution-writers.ts';
import type { WriterTrace } from './cursor-attribution-writers.ts';
import { reconcileWriters } from './cursor-publication-replay.ts';

// Model a native publication at the authored site in fixtures that need fresh bounds.
function publish(mesh: ReturnType<typeof CreateBox>) {
  mesh.computeWorldMatrix(true);
  mesh.getBoundingInfo();
}

export function oversizedWriterTrace(
  runId = 'oversized-writer',
  kind: WriterTrace['kind'] = 'idle',
  destination = 262,
) {
  const engine = new NullEngine();
  try {
    const scene = new Scene(engine);
    const mesh = CreateBox('long move', { size: 2 }, scene);
    mesh.position.set(2, 0, 2);
    publish(mesh);
    const capture = captureWriters(scene, { runId, provenance: 'software', kind });
    capture.begin(7, 0);
    capture.phase('fixed', 1);
    writerDiagnostic('door', mesh, () => {
      mesh.position.x = destination;
      publish(mesh);
    });
    capture.checkpoint();
    if (kind !== 'idle') {
      capture.phase('pick', 1);
      capture.checkpoint({ x: 2, z: 2, dx: 1, dz: 0, length: destination - 2 });
    } else {
      capture.phase('presentation', 1);
      capture.checkpoint();
    }
    capture.phase('render', 1);
    mesh.computeWorldMatrix();
    capture.checkpoint();
    capture.end(1);
    capture.close();
    return capture.trace;
  } finally {
    engine.dispose();
  }
}

export function writerFixture(runId = 'writer-fixture') {
  const traces: WriterTrace[] = [];
  const hits: (string | null)[] = [];
  const ids = { door: 0, child: 1 };
  for (const kind of ['shrine', 'floor', 'idle'] as const) {
    const engine = new NullEngine();
    try {
      const scene = new Scene(engine);
      const parent = new TransformNode('hinge', scene);
      const door = CreateBox('door', { size: 2 }, scene);
      door.parent = parent;
      parent.position.set(2, 0, 2);
      const child = CreateBox('posed-child', { size: 2 }, scene);
      child.parent = parent;
      child.position.set(5, 0, 0);
      const batch = CreateBox('batch', { size: 2 }, scene);
      batch.thinInstanceSetBuffer(
        'matrix',
        new Float32Array([
          ...Matrix.Translation(3, 1, 8).asArray(),
          ...Matrix.Translation(6, 1, 8).asArray(),
        ]),
        16,
        false,
      );
      batch.thinInstanceEnablePicking = true;
      const fixtureFloor = CreateBox('floor', { width: 3, height: 1, depth: 3 }, scene);
      fixtureFloor.position.set(6, -3, 6);
      [door, child, batch, fixtureFloor].forEach(publish);
      const capture = captureWriters(scene, { runId, provenance: 'software', kind });
      capture.begin(0, 0);
      capture.phase('fixed', 1);
      writerDiagnostic('door', parent, () => {
        parent.position.x += 8;
        [door, child].forEach(publish);
      });
      capture.checkpoint();
      capture.phase('fixed', 2);
      writerDiagnostic('door', parent, () => {
        parent.position.x -= 8;
        [door, child].forEach(publish);
      });
      child.parent = null;
      publish(child);
      writerDiagnostic('pose', child, () => {
        child.position.set(7, 0, 2);
        child.rotation.y = Math.PI / 4;
        publish(child);
      });
      door.computeWorldMatrix();
      batch.thinInstanceSetMatrixAt(1, Matrix.Translation(9, 1, 8));
      batch.thinInstanceSetBuffer(
        'matrix',
        new Float32Array(Matrix.Translation(10, 1, 8).asArray()),
        16,
        false,
      );
      fixtureFloor.setEnabled(false);
      fixtureFloor.setEnabled(true);
      const spawn = CreateBox('spawn', { size: 2 }, scene);
      spawn.computeWorldMatrix(true);
      spawn.dispose();
      capture.checkpoint();
      capture.phase('pick', 2);
      if (kind !== 'idle') {
        const [x, z] = kind === 'shrine' ? [2, 2] : [6, 6];
        capture.checkpoint({ x, z, dx: 0, dz: 0, length: 20 });
        const ray = new Ray(new Vector3(x, 10, z), new Vector3(0, -1, 0), 20);
        const exhaustive = scene.pickWithRay(ray);
        const meshList = [...scene.meshes];
        // Finish the trace before replaying the candidate list through the real kernel.
        capture.phase('render', 2);
        capture.checkpoint();
        capture.end(2);
        const replay = reconcileWriters(capture.trace);
        assert.deepEqual(replay.gaps, []);
        const query = replay.frames[0].query!;
        const candidates = new Set(query.ids.map((id) => capture.trace.identities[id].mesh));
        scene.meshes = meshList.filter((mesh) => candidates.has(mesh.uniqueId));
        try {
          const local = capture.quiet(() => scene.pickWithRay(ray));
          assert.equal(local?.pickedMesh, exhaustive?.pickedMesh);
          assert.equal(local?.distance, exhaustive?.distance);
          assert.equal(local?.pickedMesh?.name, kind === 'shrine' ? 'door' : 'floor');
          hits.push(local?.pickedMesh?.name ?? null);
        } finally {
          scene.meshes = meshList;
        }
      } else {
        capture.phase('presentation', 2);
        capture.checkpoint();
        capture.phase('render', 2);
        capture.checkpoint();
        capture.end(2);
        hits.push(null);
      }
      capture.close();
      traces.push(capture.trace);
    } finally {
      engine.dispose();
    }
  }
  return { traces, ids, hits };
}
