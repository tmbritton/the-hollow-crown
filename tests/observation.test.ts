import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { CameraObservation, updateInstanceMatrices } from '../src/observation.ts';

function box(name: string, options: Parameters<typeof MeshBuilder.CreateBox>[1], scene: Scene) {
  const mesh = MeshBuilder.CreateBox(name, options, scene);
  mesh.material = scene.getMaterialByName('opaque surfaces');
  assert.ok(mesh.material, 'CPU picking fixture needs a material to exercise triangle tests');
  return mesh;
}

function fixture() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new StandardMaterial('opaque surfaces', scene);
  // A missing material makes Babylon's CPU picker fall back to bounding boxes, not triangles.
  const camera = new FreeCamera('camera', new Vector3(0, 1, -10), scene);
  camera.setTarget(new Vector3(0, 1, 0));
  const body = box('body', { size: 1 }, scene);
  body.position.y = 1;
  const render = { root: body, meshes: [body] };
  const observation = new CameraObservation(camera);
  return { engine, scene, camera, body, render, observation };
}

test('camera observation tests rendered surfaces, ignoring invisible collision and selection proxies', (t) => {
  const { engine, scene, render, observation } = fixture();
  t.after(() => engine.dispose());
  const wall = box('rendered pillar', { width: 4, height: 4, depth: 1 }, scene);
  wall.position.set(0, 1, -4);
  wall.isPickable = false;
  assert.equal(observation.visible(render), false, 'non-pickable artwork still occludes');
  wall.isVisible = false;
  wall.checkCollisions = true;
  assert.equal(
    observation.visible(render),
    true,
    'invisible collision geometry is not an occluder',
  );
  wall.isVisible = true;
  wall.visibility = 0;
  assert.equal(observation.visible(render), true);
  wall.visibility = 1;
  wall.setEnabled(false);
  assert.equal(observation.visible(render), true);
  wall.setEnabled(true);
  assert.equal(
    observation.visible(render),
    false,
    'visibility changes cannot reuse a stale result',
  );
});

test('material-backed picking sees through an actual triangle gap inside an occluder bounding box', (t) => {
  const { engine, scene, render, observation } = fixture();
  t.after(() => engine.dispose());
  const left = box('left', { size: 1 }, scene);
  const right = box('right', { size: 1 }, scene);
  left.position.set(-2, 1, -4);
  right.position.set(2, 1, -4);
  const arch = Mesh.MergeMeshes([left, right], true)!;
  assert.ok(arch.material);
  assert.equal(
    observation.visible(render),
    true,
    'empty space inside merged bounds is not masonry',
  );
  arch.position.x = 2;
  assert.equal(
    observation.visible(render),
    false,
    'moving an actual surface onto the ray occludes',
  );
});

test('warm observations do no matrix or instance-bound preparation for unchanged off-ray scenery', (t) => {
  const { engine, scene, render, observation } = fixture();
  t.after(() => engine.dispose());
  const scenery: Mesh[] = [];
  for (let i = 0; i < 1000; i++) {
    const mesh = box(`off-ray-${i}`, { size: 1 }, scene);
    mesh.position.set(20 + (i % 50), 1, Math.floor(i / 50));
    if (i < 100)
      mesh.thinInstanceSetBuffer('matrix', new Float32Array(Matrix.Identity().asArray()), 16, true);
    if (i % 2 === 0) mesh.freezeWorldMatrix();
    scenery.push(mesh);
  }
  assert.equal(observation.visible(render), true);
  let matrices = 0,
    bounds = 0,
    staticVisibilityChecks = 0;
  for (const mesh of scenery) {
    const compute = mesh.computeWorldMatrix.bind(mesh);
    mesh.computeWorldMatrix = (...args) => {
      matrices++;
      return compute(...args);
    };
    const refresh = mesh.thinInstanceRefreshBoundingInfo.bind(mesh);
    mesh.thinInstanceRefreshBoundingInfo = (...args) => {
      bounds++;
      return refresh(...args);
    };
    if (mesh.isWorldMatrixFrozen && !mesh.hasThinInstances) {
      const enabled = mesh.isEnabled.bind(mesh);
      mesh.isEnabled = (...args) => {
        staticVisibilityChecks++;
        return enabled(...args);
      };
    }
  }
  for (let i = 0; i < 4; i++) assert.equal(observation.visible(render), true);
  assert.deepEqual(
    { matrices, bounds },
    { matrices: 0, bounds: 0 },
    'off-ray cached scenery must be rejected before expensive preparation',
  );
  assert.equal(
    staticVisibilityChecks,
    0,
    'the static spatial index must exclude distant scenery before visibility predicates',
  );
});

test('geometry beyond the observed surface is rejected before triangle picking', (t) => {
  const { engine, scene, render, observation } = fixture();
  t.after(() => engine.dispose());
  const behind = box('behind the actor', { size: 4 }, scene);
  behind.position.set(0, 1, 8);
  behind.freezeWorldMatrix();
  let intersections = 0;
  const intersects = behind.intersects.bind(behind);
  behind.intersects = (...args) => {
    intersections++;
    return intersects(...args);
  };
  assert.equal(observation.visible(render), true);
  assert.equal(
    intersections,
    0,
    'infinite-ray bounding tests must not admit geometry past the sample',
  );
});

test('off-ray billboards are rejected without rebuilding their camera-dependent matrices', (t) => {
  const { engine, scene, camera, render, observation } = fixture();
  t.after(() => engine.dispose());
  const flame = box('off-ray billboard', { size: 1 }, scene);
  flame.position.set(10, 1, -4);
  flame.billboardMode = Mesh.BILLBOARDMODE_ALL;
  assert.equal(observation.visible(render), true);
  let matrices = 0;
  const compute = flame.computeWorldMatrix.bind(flame);
  flame.computeWorldMatrix = (...args) => {
    matrices++;
    return compute(...args);
  };
  camera.position.x = 0.1;
  camera.setTarget(new Vector3(0, 1, 0));
  assert.equal(observation.visible(render), true);
  assert.equal(matrices, 0, 'camera rotation must not prepare off-ray flames');
  flame.position.x = 0;
  assert.equal(observation.visible(render), false, 'a moved billboard must still occlude');
});

test('moving a parent into the ray and reparenting a rig refresh only the changed hierarchy', (t) => {
  const { engine, scene, body, render, observation } = fixture();
  t.after(() => engine.dispose());
  const doorRoot = new TransformNode('door pivot', scene);
  doorRoot.position.x = 8;
  const door = box('door panel', { width: 3, height: 3, depth: 0.3 }, scene);
  door.parent = doorRoot;
  door.position.set(0, 1, -4);
  const rigRoot = new TransformNode('rig root', scene);
  body.parent = rigRoot;
  assert.equal(observation.visible(render), true);
  doorRoot.position.x = 0;
  assert.equal(
    observation.visible(render),
    false,
    'parent movement cannot retain an off-ray bound',
  );
  doorRoot.position.x = 8;
  assert.equal(observation.visible(render), true);
  const newParent = new TransformNode('new rig parent', scene);
  newParent.position.x = 100;
  body.parent = newParent;
  assert.equal(observation.visible(render), false);
  body.parent = rigRoot;
  assert.equal(observation.visible(render), true);
});

test('an off-ray articulated rig is rejected before preparing its moving descendants', (t) => {
  const { engine, scene, camera, render } = fixture();
  t.after(() => engine.dispose());
  const root = new TransformNode('distant rig', scene);
  root.position.x = 30;
  const joint = new TransformNode('moving joint', scene);
  joint.parent = root;
  const parts = Array.from({ length: 20 }, (_, i) => {
    const part = box(`rig part ${i}`, { size: 0.5 }, scene);
    part.parent = joint;
    part.position.set(0, 1, -2);
    return part;
  });
  const observation = new CameraObservation(camera, [{ root, radius: 4 }]);
  assert.equal(observation.visible(render), true);
  let childMatrices = 0;
  for (const node of [joint, ...parts]) {
    const compute = node.computeWorldMatrix.bind(node);
    node.computeWorldMatrix = (...args) => {
      childMatrices++;
      return compute(...args);
    };
  }
  joint.rotation.y = 0.2;
  joint.position.y = 0.02;
  assert.equal(observation.visible(render), true);
  assert.equal(childMatrices, 0, 'off-ray idle animation must not force all rig parts');
  root.position.x = 0;
  joint.rotation.y = 0;
  assert.equal(
    observation.visible(render),
    false,
    'moving the rig into the ray prepares its current pose',
  );
});

test('current cutaway and actor transforms are sampled without depending on a scene render', (t) => {
  const { engine, scene, camera, body, render, observation } = fixture();
  t.after(() => engine.dispose());
  const wall = box('cutaway', { width: 4, height: 3, depth: 0.5 }, scene);
  wall.position.set(0, 1.5, -3);
  wall.setPivotPoint(new Vector3(0, -1.5, 0));
  assert.equal(observation.visible(render), false);
  wall.scaling.y = 0.05;
  assert.equal(
    observation.visible(render),
    true,
    'lowered visible masonry no longer hides the actor',
  );
  wall.scaling.y = 1;
  assert.equal(observation.visible(render), false);
  wall.setEnabled(false);
  body.position.x = 100;
  assert.equal(observation.visible(render), false, 'offscreen actor geometry is not visible');
  body.position.x = 0;
  camera.setTarget(new Vector3(100, 1, -10));
  assert.equal(observation.visible(render), false, 'camera rotation invalidates visibility');
  camera.setTarget(new Vector3(0, 1, 0));
  body.isVisible = false;
  assert.equal(observation.visible(render), false, 'an invisible actor cannot be observed');
});

test('thin-instance artwork occludes at its actual instance transforms, never at the source mesh', (t) => {
  const { engine, scene, render, observation } = fixture();
  t.after(() => engine.dispose());
  const instances = box('instanced scenery', { size: 3 }, scene);
  instances.position.set(0, 1, -4);
  instances.isPickable = false;
  instances.thinInstanceSetBuffer(
    'matrix',
    new Float32Array(Matrix.Translation(10, 0, 0).asArray()),
    16,
    false,
  );
  assert.equal(
    observation.visible(render),
    true,
    'the unrendered source mesh must not hide the actor',
  );
  instances.thinInstanceSetMatrixAt(0, Matrix.Identity(), true);
  assert.equal(observation.visible(render), false, 'a real foreground instance hides the actor');
  instances.thinInstanceSetMatrixAt(0, Matrix.Translation(10, 0, 0), true);
  assert.equal(observation.visible(render), true, 'moving instances refresh their picking bounds');
});

test('dynamic instance uploads refresh render bounds once; observation only reads them', (t) => {
  const { engine, scene, render, observation } = fixture();
  t.after(() => engine.dispose());
  const instances = box('moving instances', { size: 3 }, scene);
  instances.position.set(0, 1, -4);
  const matrices = new Float32Array(Matrix.Translation(10, 0, 0).asArray());
  instances.thinInstanceSetBuffer('matrix', matrices, 16, false);
  assert.equal(observation.visible(render), true);
  Matrix.Identity().copyToArray(matrices, 0);
  updateInstanceMatrices(instances, matrices);
  let refreshes = 0;
  const refresh = instances.thinInstanceRefreshBoundingInfo.bind(instances);
  instances.thinInstanceRefreshBoundingInfo = (...args) => {
    refreshes++;
    return refresh(...args);
  };
  assert.equal(observation.visible(render), false);
  assert.equal(observation.visible(render), false);
  assert.equal(refreshes, 0, 'queries must reuse the uploaded bounds');
  matrices.fill(0);
  matrices[15] = 1;
  updateInstanceMatrices(instances, matrices, false);
  assert.equal(refreshes, 0, 'empty effect pools need no bounds rebuild');
  assert.equal(observation.visible(render), true);
  instances.thinInstanceSetBuffer(
    'matrix',
    new Float32Array(Matrix.Identity().asArray()),
    16,
    false,
  );
  updateInstanceMatrices(instances);
  assert.equal(
    observation.visible(render),
    false,
    'replacing an upload without CPU data must discard the old instance cache',
  );
});

test('off-ray particles inside a wide pooled bound are rejected before per-instance matrix inversion', (t) => {
  const { engine, scene, render, observation } = fixture();
  t.after(() => engine.dispose());
  const pool = box('wide pooled particles', { size: 0.1 }, scene);
  const matrices = new Float32Array(200 * 16);
  for (let i = 0; i < 200; i++)
    Matrix.Translation(i % 2 ? -8 : 8, 1, -4).copyToArray(matrices, i * 16);
  pool.thinInstanceSetBuffer('matrix', matrices, 16, false);
  updateInstanceMatrices(pool, matrices);
  let inversions = 0;
  const invert = Matrix.prototype.invertToRef;
  Matrix.prototype.invertToRef = function <T extends Matrix>(other: T): T {
    inversions++;
    invert.call(this, other);
    return other;
  };
  try {
    assert.equal(observation.visible(render), true);
    assert.ok(inversions <= 6, `${inversions} inversions for particles outside the camera segment`);
  } finally {
    Matrix.prototype.invertToRef = invert;
  }
});

test('scene index follows added/removed meshes, unfreezing and grouped hierarchy reparenting', (t) => {
  const { engine, scene, camera, render } = fixture();
  t.after(() => engine.dispose());
  const root = new TransformNode('indexed rig', scene);
  root.position.x = 20;
  const part = box('indexed part', { size: 2 }, scene);
  part.position.set(0, 1, -2);
  part.parent = root;
  const observation = new CameraObservation(camera, [{ root, radius: 4 }]);
  assert.equal(observation.visible(render), true);
  const wall = box('late wall', { size: 2 }, scene);
  wall.position.set(0, 1, -4);
  wall.freezeWorldMatrix();
  assert.equal(observation.visible(render), false);
  wall.unfreezeWorldMatrix();
  wall.position.x = 15;
  assert.equal(observation.visible(render), true);
  wall.dispose();
  part.parent = null;
  assert.equal(
    observation.visible(render),
    false,
    'reparented geometry must leave its old off-ray group',
  );
  part.dispose();
  assert.equal(observation.visible(render), true);
});

test('observation limits camera rays to three body samples regardless of rig mesh count', (t) => {
  const { engine, scene, body, observation } = fixture();
  t.after(() => engine.dispose());
  const meshes = [body];
  for (let i = 0; i < 30; i++) {
    const part = box(`part-${i}`, { size: 0.5 }, scene);
    part.position.y = 1;
    meshes.push(part);
  }
  const wall = box('wall', { size: 4 }, scene);
  wall.position.set(0, 1, -4);
  let picks = 0;
  const pick = scene.pickWithRay.bind(scene);
  scene.pickWithRay = (...args) => {
    picks++;
    return pick(...args);
  };
  assert.equal(observation.visible({ root: body, meshes }), false);
  assert.ok(picks > 0 && picks <= 3, `${picks} camera rays for one observation`);
});
