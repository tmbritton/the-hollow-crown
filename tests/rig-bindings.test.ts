import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Node } from '@babylonjs/core/node.js';
import type { RigSurface } from '../src/rigs/tailClearance.ts';
import { RIG_SURFACE_LIMIT } from '../src/rigs/tailClearance.ts';
import { ECS } from '../src/ecs.ts';
import type { Components } from '../src/ecs.ts';
import { bindHumanoid } from '../src/rigs/bindings.ts';
import { profiles } from '../src/rigs/humanoid.ts';
import { setEuler, worldPoint } from '../src/rigs/pose.ts';
import { Ragdoll, RAGDOLL_LIMIT } from '../src/ragdoll.ts';
import { publishCorpseContacts, readCorpseTerrain } from '../src/corpseRendering.ts';
import { corpseHeightAt, corpseStep } from '../src/corpseTerrain.ts';
import { key } from '../src/world.ts';
import type { NavigationWorld } from '../src/navigation.ts';
import { DeathPhysics } from '../src/deathPhysics.ts';
import type { DeathHandoff } from '../src/deathHandoff.ts';
import { ActorGeometry } from '../src/actorGeometry.ts';
import { SupportTiles } from '../src/supportTiles.ts';

function clearanceFixture(authoredExtras = 0) {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const node = (name: string, parent?: TransformNode) => {
    const n = new TransformNode(name, scene);
    if (parent) n.parent = parent;
    return n;
  };
  const mesh = (name: string, parent: TransformNode) => {
    const m = MeshBuilder.CreateBox(name, { width: 0.2, height: 0.3, depth: 0.4 }, scene);
    m.parent = parent;
    return m;
  };
  const root = node('root'),
    body = node('body', root),
    arms = [node('left arm', body), node('right arm', body)],
    legs = [node('left leg', root), node('right leg', root)],
    knees = legs.map((leg) => node(`${leg.name} knee`, leg)),
    tail: TransformNode[] = [];
  for (let i = 0; i < 4; i++) {
    const link = node(`link ${i}`, tail.at(-1) ?? root);
    link.position.z = -0.25;
    tail.push(link);
  }
  const keep = mesh('keep', body),
    omit = mesh('omit', body),
    mount = node('mount', root),
    tip = mesh('tip', mount),
    scales = mesh('scales', tail[0]);
  const ecs = new ECS();
  const entity = ecs
    .create('actor')
    .add('rig', {
      root,
      body,
      arms,
      forearms: arms.map((arm) => node(`${arm.name} forearm`, arm)),
      legs,
      knees,
      feet: knees.map((knee) => node(`${knee.name} foot`, knee)),
      tail,
      cape: keep,
      equipment: [tip],
      footPlants: [{ anchor: null }, { anchor: null }],
    })
    .add('render', {
      root,
      meshes: [keep, omit, tip, scales, ...extraMeshes(authoredExtras, 'authored', body, mesh)],
    });
  const binding = bindHumanoid(entity, profiles.player, [], [], [keep]);
  binding.attach(mount, 'spear');
  const geometry = new ActorGeometry(entity);
  binding.apply();
  return {
    ecs,
    engine,
    node,
    mesh,
    entity,
    geometry,
    binding,
    root,
    body,
    tail,
    keep,
    omit,
    tip,
    mount,
    scales,
  };
}

function extraMeshes(
  length: number,
  prefix: string,
  parent: TransformNode,
  mesh: (name: string, parent: TransformNode) => AbstractMesh,
) {
  return Array.from({ length }, (_, i) => mesh(`${prefix} ${i}`, parent));
}

function checkDrawn(surfaces: readonly RigSurface[], meshes: readonly AbstractMesh[]) {
  const drawn = surfaces.filter((surface) => surface.enabled);
  assert.deepEqual(drawn.map((s) => s.name).sort(), meshes.map((m) => m.name).sort());
  const sync = (node: Node) => {
    if (node.parent) sync(node.parent);
    node.computeWorldMatrix(true);
  };
  for (const mesh of meshes) {
    sync(mesh);
    const corners = drawn.find((s) => s.name === mesh.name)!.bounds.corners!;
    const { minimum, maximum } = mesh.getBoundingInfo().boundingBox;
    for (let i = 0; i < 8; i++) {
      const point = Vector3.TransformCoordinates(
        new Vector3(
          i & 4 ? maximum.x : minimum.x,
          i & 2 ? maximum.y : minimum.y,
          i & 1 ? maximum.z : minimum.z,
        ),
        mesh.getWorldMatrix(),
      );
      point
        .asArray()
        .forEach((v, axis) =>
          assert.ok(
            Math.abs(v - corners[i * 3 + axis]) < 1e-5,
            `${mesh.name}, corner ${i}, axis ${axis}`,
          ),
        );
    }
  }
}

test('unowned replacement samples exact current body and tail membership at a fixed root', (t) => {
  const { engine, entity, binding, root, body, tail, keep, omit, scales } = clearanceFixture();
  t.after(() => engine.dispose());
  binding.sampleSurfaces();
  binding.sampleSurfaces(true);
  const clone = omit.clone('drawn clone', body);
  clone.position.set(0.4, 0.3, -0.2);
  clone.rotation.set(0.1, 0.2, 0.3);
  const meshes = [keep, clone];
  entity.add('render', { root, meshes });
  const sample = (bodies: AbstractMesh[], tails: AbstractMesh[]) => {
    assert.equal(binding.sampleSurfaces(), true);
    assert.equal(binding.sampleSurfaces(true), true);
    checkDrawn(binding.bodySurfaces, bodies);
    checkDrawn(binding.tailSurfaces, tails);
  };
  assert.ok(omit.isEnabled() && scales.isEnabled());
  sample([keep, clone], []);
  assert.equal(binding.bodySurfaces.find((s) => s.name === keep.name)!.rootJoin, true);
  meshes.length = 0;
  sample([], []);
  meshes.push(clone);
  sample([clone], []);
  clone.parent = tail[1];
  clone.position.y += 0.3;
  sample([], [clone]);
  tail[0].setEnabled(false);
  sample([], []);
  tail[0].setEnabled(true);
  clone.visibility = 0;
  sample([], []);
  clone.visibility = 1;
  sample([], [clone]);
  entity.remove('render');
  sample([], []);
});

function checkPartitions(
  binding: ReturnType<typeof bindHumanoid>,
  bodies: readonly AbstractMesh[],
  tails: readonly AbstractMesh[],
) {
  for (const [tailOnly, expected] of [
    [false, bodies],
    [true, tails],
  ] as const) {
    const live = binding.clearanceSurfaces(tailOnly);
    assert.deepEqual(
      live.map((s) => s.name),
      expected.map((m) => m.name),
    );
    checkDrawn(live, expected);
  }
}

function retainPublication(binding: ReturnType<typeof bindHumanoid>) {
  const live = [binding.clearanceSurfaces(), binding.clearanceSurfaces(true)];
  const values = structuredClone(live);
  const inspection = [binding.bodySurfaces, binding.tailSurfaces, binding.surfaces];
  const inspectionValues = structuredClone(inspection);
  return () => {
    assert.equal(binding.clearanceSurfaces(), live[0]);
    assert.equal(binding.clearanceSurfaces(true), live[1]);
    assert.deepEqual(live, values);
    assert.equal(binding.bodySurfaces, inspection[0]);
    assert.equal(binding.tailSurfaces, inspection[1]);
    assert.equal(binding.surfaces, inspection[2]);
    assert.deepEqual(inspection, inspectionValues);
  };
}

for (const withCargo of [false, true]) {
  test(`inclusive split budget with${withCargo ? '' : 'out'} cargo`, (t) => {
    const { engine, entity, binding, root, body, mesh, scales } = clearanceFixture();
    t.after(() => engine.dispose());
    const cargo = withCargo ? [mesh('cargo', root)] : [];
    const bodies = extraMeshes(RIG_SURFACE_LIMIT - 1 - cargo.length, 'body', body, mesh);
    entity.add('render', { root, meshes: [scales, ...bodies] });
    binding.sampleSurfaces();
    assert.equal(binding.sampleSurfaces(false, cargo), true);
    assert.equal(binding.sampleSurfaces(true), true);
    checkPartitions(binding, [...bodies, ...cargo], [scales]);
  });
}

for (const owned of [false, true]) {
  for (const tailFirst of [false, true]) {
    test(`split overflow: ${owned ? 'owned' : 'unowned'}, ${tailFirst ? 'tail' : 'body'} first`, (t) => {
      const { engine, entity, binding, geometry, root, body, mesh, scales, keep } =
        clearanceFixture();
      t.after(() => engine.dispose());
      binding.sampleSurfaces();
      binding.sampleSurfaces(true);
      const unchanged = retainPublication(binding);
      const bodies = [keep, ...extraMeshes(RIG_SURFACE_LIMIT - 1, 'body', body, mesh)];
      const members = [...bodies, scales];
      const replace = () => {
        if (owned) geometry.replace(members);
        else entity.add('render', { root, meshes: members });
      };
      keep.position.x += 1;
      replace();
      const reads = t.mock.method(keep, 'getBoundingInfo');
      for (let retry = 0; retry < 2; retry++) {
        assert.throws(() => binding.sampleSurfaces(tailFirst), /Rig surface budget exceeded/);
        unchanged();
        assert.equal(reads.mock.callCount(), 0, 'do not build early boxes before rejection');
      }
      members.splice(bodies.length - 1, 1);
      if (owned) replace();
      assert.equal(binding.sampleSurfaces(tailFirst), true);
      assert.equal(binding.sampleSurfaces(!tailFirst), true);
      checkPartitions(binding, bodies.slice(0, -1), [scales]);
    });
  }
}

test('body-only overflow does not truncate the last clearance publication', (t) => {
  const { engine, entity, binding, root, body, mesh, keep } = clearanceFixture();
  t.after(() => engine.dispose());
  const members = [keep, ...extraMeshes(RIG_SURFACE_LIMIT - 1, 'body', body, mesh)];
  entity.add('render', { root, meshes: members });
  binding.sampleSurfaces();
  binding.sampleSurfaces(true);
  const unchanged = retainPublication(binding);
  keep.position.y += 1;
  members.push(mesh('excess body', body));
  assert.throws(() => binding.sampleSurfaces(), /Rig surface budget exceeded/);
  unchanged();
  members.pop();
  assert.equal(binding.sampleSurfaces(), true);
  checkPartitions(binding, members, []);
});

test('cargo overflow: live body request rejects before publishing', (t) => {
  const { engine, entity, binding, root, body, mesh, scales } = clearanceFixture();
  t.after(() => engine.dispose());
  const bodies = extraMeshes(RIG_SURFACE_LIMIT - 1, 'body', body, mesh);
  entity.add('render', { root, meshes: [...bodies, scales] });
  binding.sampleSurfaces();
  binding.sampleSurfaces(true);
  const unchanged = retainPublication(binding);
  const crate = mesh('excess cargo', root);
  const cargo = [crate];
  for (let retry = 0; retry < 2; retry++) {
    assert.throws(() => binding.sampleSurfaces(false, cargo), /Rig surface budget exceeded/);
    unchanged();
  }
  crate.visibility = 0;
  assert.equal(binding.sampleSurfaces(false, cargo), true);
  checkPartitions(binding, bodies, [scales]);
});

test('cargo overflow: authored registration counts disabled placeholders and preserves cached cargo', (t) => {
  const { engine, entity, binding, root, mesh, omit, scales, tip } = clearanceFixture(2);
  t.after(() => engine.dispose());
  omit.setEnabled(false);
  const cargo = extraMeshes(RIG_SURFACE_LIMIT - 6, 'cargo', root, mesh);
  binding.sampleSurfaces(false, cargo, 0);
  binding.sampleSurfaces(true);
  const unchanged = retainPublication(binding);
  cargo[0].position.x += 1;
  const excess = mesh('excess cargo', root);
  cargo.push(excess);
  for (let retry = 0; retry < 2; retry++) {
    assert.throws(() => binding.sampleSurfaces(false, cargo, 1), /Rig surface budget exceeded/);
    unchanged();
  }
  excess.dispose();
  assert.equal(binding.sampleSurfaces(false, cargo, 2), true);
  const authored = entity.require('render').meshes;
  const expected = [
    ...authored.filter((m) => m !== scales && m !== tip),
    tip,
    ...cargo.slice(0, -1),
  ];
  assert.deepEqual(
    binding.bodySurfaces.map((s) => s.name),
    expected.map((m) => m.name),
  );
  assert.equal(binding.bodySurfaces.find((s) => s.name === omit.name)?.enabled, false);
  checkDrawn(
    binding.bodySurfaces,
    expected.filter((m) => m !== omit),
  );
  checkDrawn(binding.tailSurfaces, [scales]);
});

for (const tailFirst of [false, true]) {
  test(`repartition at capacity refreshes retained ${tailFirst ? 'body' : 'tail'} when needed`, (t) => {
    const { engine, entity, binding, root, body, tail, mesh, scales } = clearanceFixture();
    t.after(() => engine.dispose());
    const bodies = extraMeshes(RIG_SURFACE_LIMIT - 3, 'body', body, mesh);
    const moved = mesh('reparented link', tailFirst ? body : tail[0]);
    const cargo = [mesh('retained cargo', root)];
    entity.add('render', { root, meshes: [...bodies, scales, moved] });
    // Body demand supplies cargo; the first sampled tail cannot assume it was dropped.
    binding.sampleSurfaces(false, cargo);
    binding.sampleSurfaces(true);
    moved.parent = tailFirst ? tail[0] : body;
    assert.equal(binding.sampleSurfaces(tailFirst, tailFirst ? undefined : cargo), true);
    checkPartitions(
      binding,
      [...bodies, ...(tailFirst ? [] : [moved]), ...cargo],
      tailFirst ? [scales, moved] : [scales],
    );
  });
}

test('tail demand validates retained cargo; only body demand can withdraw it', (t) => {
  const { engine, entity, binding, root, body, mesh, scales } = clearanceFixture();
  t.after(() => engine.dispose());
  const bodies = extraMeshes(RIG_SURFACE_LIMIT - 2, 'body', body, mesh);
  const members = [...bodies, scales];
  const cargo = [mesh('retained cargo', root)];
  entity.add('render', { root, meshes: members });
  binding.sampleSurfaces(false, cargo);
  binding.sampleSurfaces(true);
  const unchanged = retainPublication(binding);
  const extra = mesh('extra body', body);
  members.push(extra);
  cargo[0].visibility = 0;
  assert.throws(() => binding.sampleSurfaces(true), /Rig surface budget exceeded/);
  unchanged();
  assert.equal(binding.sampleSurfaces(), true);
  assert.equal(binding.sampleSurfaces(true), true);
  checkPartitions(binding, [...bodies, extra], [scales]);
});

test('certified split layout hits without visiting members or versioned cargo', (t) => {
  const { engine, binding, geometry, root, body, mesh, scales } = clearanceFixture();
  t.after(() => engine.dispose());
  const bodies = extraMeshes(RIG_SURFACE_LIMIT - 2, 'body', body, mesh);
  geometry.replace([...bodies, scales]);
  const crate = mesh('versioned cargo', root);
  let cargoReads = 0;
  const cargo = new Proxy([crate], {
    get(target, key, receiver) {
      cargoReads++;
      return Reflect.get(target, key, receiver);
    },
  });
  binding.sampleSurfaces(false, cargo, 1);
  const before = binding.bodySurfaces;
  const reads = [...bodies, scales, crate].flatMap((m) => [
    t.mock.method(m, 'isDisposed'),
    t.mock.method(m, 'isEnabled'),
    t.mock.method(m, 'getBoundingInfo'),
  ]);
  cargoReads = 0;
  assert.equal(binding.sampleSurfaces(false, cargo, 1), false);
  assert.equal(binding.bodySurfaces, before);
  assert.ok(reads.every((read) => read.mock.callCount() === 0));
  assert.equal(cargoReads, 0);
  assert.equal(binding.sampleSurfaces(true), true);
  checkPartitions(binding, [...bodies, ...cargo], [scales]);
});

test('owned edits and replacement publish once and keep detached corners across misses', (t) => {
  const { engine, geometry, binding, mesh, mount, keep, omit, tip, scales } = clearanceFixture();
  t.after(() => engine.dispose());
  binding.sampleSurfaces();
  const before = binding.bodySurfaces;
  const values = structuredClone(before);
  geometry.edit(() => (tip.position.x += 0.37));
  binding.apply();
  assert.equal(binding.bodySurfaces, before, 'no demand, no publication');
  assert.equal(binding.sampleSurfaces(), true);
  const edited = binding.bodySurfaces;
  checkDrawn(edited, [keep, omit, tip]);
  const reads = t.mock.method(tip, 'getBoundingInfo');
  const checks = t.mock.method(tip, 'isEnabled');
  binding.apply();
  binding.sampleSurfaces(true);
  const oldTail = binding.tailSurfaces;
  setEuler(binding.pose.local[binding.pose.definition.tail![0].index], 0.1, 0.2, 0);
  binding.apply(true);
  binding.applyTail();
  binding.sampleSurfaces(true);
  checkDrawn(binding.tailSurfaces, [scales]);
  assert.notDeepEqual(binding.tailSurfaces[0].bounds.corners, oldTail[0].bounds.corners);
  reads.mock.resetCalls();
  checks.mock.resetCalls();
  assert.equal(binding.sampleSurfaces(), false, 'unchanged edited layout is reusable');
  assert.equal(binding.bodySurfaces, edited);
  assert.equal(reads.mock.callCount() + checks.mock.callCount(), 0);
  const editedValues = structuredClone(edited);
  const extra = mesh('new attachment', mount);
  extra.position.set(0.1, 0.2, 0.3);
  geometry.replace([keep, extra]);
  assert.ok(tip.isEnabled());
  assert.equal(binding.sampleSurfaces(), true);
  checkDrawn(binding.bodySurfaces, [keep, extra]);
  const replaced = binding.bodySurfaces;
  binding.apply();
  assert.equal(binding.sampleSurfaces(), false);
  assert.equal(binding.bodySurfaces, replaced);
  assert.deepEqual(before, values);
  assert.deepEqual(edited, editedValues);
});

for (const writer of ['attachment', 'joint', 'cape'] as const) {
  test(`identical ${writer} write invalidates a sampled edit it restores, then hits`, (t) => {
    const { engine, geometry, binding, body, keep, omit, mount, tip } = clearanceFixture();
    t.after(() => engine.dispose());
    binding.sampleSurfaces();
    const initial = binding.bodySurfaces;
    geometry.edit(() => {
      if (writer === 'attachment') mount.position.x += 0.8;
      else if (writer === 'joint') body.scaling.y *= 1.25;
      else keep.rotation.x += 0.5;
    });
    assert.equal(binding.sampleSurfaces(), true);
    const edited = binding.bodySurfaces;
    checkDrawn(edited, [keep, omit, tip]);
    assert.notDeepEqual(edited, initial);
    const values = structuredClone(edited);

    binding.apply();
    checkDrawn(initial, [keep, omit, tip]);
    assert.equal(binding.sampleSurfaces(), true, `${writer} restored a sampled transform`);
    const restored = binding.bodySurfaces;
    checkDrawn(restored, [keep, omit, tip]);
    binding.apply();
    assert.equal(binding.sampleSurfaces(), false);
    assert.equal(binding.bodySurfaces, restored);
    assert.deepEqual(edited, values);
  });
}

test('body certificate invalidates independently for each covered input and never covers external writers', (t) => {
  const { engine, entity, geometry, binding, node, mesh, root, body, keep, tip, mount } =
    clearanceFixture();
  t.after(() => engine.dispose());
  geometry.replace([keep, tip]);
  const demand = (members: AbstractMesh[], cargo?: AbstractMesh[], revision?: number) => {
    assert.equal(binding.sampleSurfaces(false, cargo, revision), true);
    const snapshot = binding.bodySurfaces;
    checkDrawn(snapshot, [...members, ...(cargo ?? [])]);
    assert.equal(binding.sampleSurfaces(false, cargo, revision), false);
    assert.equal(binding.bodySurfaces, snapshot);
  };
  demand([keep, tip]);
  setEuler(binding.pose.local[binding.pose.definition.index.spine], 0.1, 0.2, 0);
  binding.apply();
  demand([keep, tip]);
  binding.actions.stowed = true;
  binding.apply();
  demand([keep]);
  binding.actions.stowed = false;
  binding.apply();
  demand([keep, tip]);
  root.setEnabled(false);
  demand([]);
  root.setEnabled(true);
  demand([keep, tip]);
  geometry.edit(() => (mount.position.x += 0.4));
  demand([keep, tip]);
  geometry.edit(() => (mount.scaling.y *= 1.25));
  demand([keep, tip]);
  geometry.edit(() =>
    tip.getBoundingInfo().reConstruct(new Vector3(-0.2, -0.3, -0.4), new Vector3(0.4, 0.5, 0.6)),
  );
  demand([keep, tip]);
  geometry.edit(() => (tip.isVisible = false));
  demand([keep]);
  geometry.edit(() => (tip.isVisible = true));
  demand([keep, tip]);
  tip.dispose();
  demand([keep]);
  const crate = mesh('cargo', root);
  const cargo = [crate];
  demand([keep], cargo, 0);
  crate.position.y += 1;
  demand([keep], cargo, 1);
  demand([keep], [...cargo], 1);
  assert.equal(binding.sampleSurfaces(false, cargo), true);
  assert.equal(binding.sampleSurfaces(false, cargo), true);
  demand([keep]);
  const owned = entity.require('render');
  entity.add('render', { ...owned });
  keep.position.y += 0.4;
  assert.equal(binding.sampleSurfaces(), true);
  checkDrawn(binding.bodySurfaces, [keep]);
  keep.position.x += 0.2;
  assert.equal(binding.sampleSurfaces(), true);
  checkDrawn(binding.bodySurfaces, [keep]);
  new ActorGeometry(entity); // Registering a different layout does not adopt this binding's offsets.
  keep.position.x += 0.2;
  assert.equal(binding.sampleSurfaces(), true);
  checkDrawn(binding.bodySurfaces, [keep]);
  assert.equal(binding.sampleSurfaces(), true);
  entity.add('render', owned);
  demand([keep]); // A live publication must not retain its predecessor's certificate.

  const external = node('external');
  geometry.edit(() => (keep.parent = external));
  assert.equal(binding.sampleSurfaces(), true);
  external.position.y += 1;
  assert.equal(binding.sampleSurfaces(), true);
  checkDrawn(binding.bodySurfaces, [keep]);
  external.setEnabled(false);
  assert.equal(binding.sampleSurfaces(), true);
  checkDrawn(binding.bodySurfaces, []);
  const unmanaged = node('unmanaged mount', body);
  geometry.edit(() => (keep.parent = unmanaged));
  assert.equal(binding.sampleSurfaces(), true);
  unmanaged.position.x += 1;
  assert.equal(binding.sampleSurfaces(), true);
  checkDrawn(binding.bodySurfaces, [keep]);
});

test('an external tail ancestor can move an excluded member into the body partition', (t) => {
  const { engine, geometry, binding, node, body, tail, scales, keep } = clearanceFixture();
  t.after(() => engine.dispose());
  assert.equal(binding.sampleSurfaces(), true);
  assert.equal(binding.sampleSurfaces(), false, 'closed layout reuses its body publication');

  const external = node('external tail mount', tail[0]);
  geometry.replace([keep, scales]);
  geometry.edit(() => (scales.parent = external));
  binding.sampleSurfaces();
  binding.sampleSurfaces(true);
  checkDrawn(binding.bodySurfaces, [keep]);
  checkDrawn(binding.tailSurfaces, [scales]);

  external.parent = body;
  binding.sampleSurfaces();
  binding.sampleSurfaces(true);
  checkDrawn(binding.bodySurfaces, [keep, scales]);
  checkDrawn(binding.tailSurfaces, []);
  external.position.x += 0.5;
  binding.sampleSurfaces();
  checkDrawn(binding.bodySurfaces, [keep, scales]);
  external.setEnabled(false);
  binding.sampleSurfaces();
  checkDrawn(binding.bodySurfaces, [keep]);

  geometry.edit(() => (scales.parent = tail[0]));
  assert.equal(binding.sampleSurfaces(), true);
  assert.equal(binding.sampleSurfaces(), false, 'closing the path restores reuse');
});

test('settled contacts follow external ancestor motion and visibility without owned writes', (t) => {
  const { ecs, engine, entity, binding, geometry, root, node, mesh } = clearanceFixture();
  t.after(() => engine.dispose());
  const world = { tiles: new SupportTiles(new Map()), blockers: [], entities: [] };
  const ragdoll = new Ragdoll(world, binding.history.snapshot(), [1, 0, 0], 20);
  ragdoll.freeze();
  entity
    .add('ragdoll', ragdoll)
    .add('corpse', { age: 1 })
    .add('transform', { x: 0, h: 0, z: 0, heading: 0 });
  binding.applyPhysics(ragdoll);

  const mount = node('external mount', root);
  mount.position.x = 3;
  const piece = mesh('settled piece', mount);
  piece.position.y = 0.05;
  geometry.replace([piece]);
  const height = (x: number) => publishCorpseContacts(ecs, world).heightAt({ x, z: 0, h: 0 });
  const expectHeight = (x: number) => assert.ok(Math.abs(height(x) - 0.2) < 1e-6);
  expectHeight(3);
  mount.setEnabled(false);
  assert.equal(height(3), 0, 'external mount can withdraw the contact');
  mount.position.x = 5;
  mount.setEnabled(true);
  expectHeight(5);
  mount.position.x = 7;
  expectHeight(7);
  assert.equal(height(5), 0, 'external motion withdraws the old contact');

  geometry.edit(() => {
    piece.parent = root;
    piece.position.x = 7;
  });
  expectHeight(7);
  const reads = t.mock.method(piece, 'isEnabled');
  expectHeight(7);
  assert.equal(reads.mock.callCount(), 0, 'closed edited paths reuse contacts');

  const above = node('external ancestor above actor');
  root.parent = above;
  reads.mock.resetCalls();
  expectHeight(7);
  assert.equal(reads.mock.callCount(), 1, 'a parent above the root prevents certification');
  above.setEnabled(false);
  assert.equal(height(7), 0);
  above.setEnabled(true);
  expectHeight(7);
});

test('semantic binding preserves neutral geometry and writes independent head/limb poses without new nodes', () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const root = new TransformNode('root', scene),
      body = new TransformNode('body', scene);
    body.parent = root;
    body.setPivotPoint(new Vector3(0, 0.55, 0));
    const head = MeshBuilder.CreateBox('head', { size: 0.4 }, scene);
    head.parent = body;
    head.position.set(0, 1.57, 0);
    const arms = [],
      forearms = [],
      legs = [],
      knees = [],
      feet = [];
    for (const sign of [-1, 1]) {
      const arm = new TransformNode('arm', scene);
      arm.parent = body;
      arm.position.set(sign * 0.48, 1.18, 0);
      arms.push(arm);
      const forearm = new TransformNode('forearm', scene);
      forearm.parent = arm;
      forearm.position.y = -0.28;
      forearms.push(forearm);
      const leg = new TransformNode('leg', scene);
      leg.parent = root;
      leg.position.set(sign * 0.2, 0.55, 0);
      legs.push(leg);
      const knee = new TransformNode('knee', scene);
      knee.parent = leg;
      knee.position.y = -0.25;
      knees.push(knee);
      const foot = new TransformNode('foot', scene);
      foot.parent = knee;
      foot.position.y = -0.25;
      feet.push(foot);
    }
    const rig: Components['rig'] = {
      root,
      body,
      arms,
      forearms,
      legs,
      knees,
      feet,
      footPlants: [{ anchor: null }, { anchor: null }],
    };
    const ecs = new ECS();
    const entity = ecs
      .create('actor')
      .add('rig', rig)
      .add('render', { root, meshes: [head] });
    const nodes = scene.transformNodes.length,
      meshes = scene.meshes.length;
    head.computeWorldMatrix(true);
    const before = [...head.getWorldMatrix().m];
    const binding = bindHumanoid(entity, profiles.player, [head]);
    const geometry = new ActorGeometry(entity);
    assert.equal(entity.require('rigPose'), binding);
    head.computeWorldMatrix(true);
    assert.ok(
      before.every((v, i) => Math.abs(v - head.getWorldMatrix().m[i]) < 1e-6),
      JSON.stringify({
        before,
        after: [...head.getWorldMatrix().m],
        root: root.position,
        body: body.position,
        head: head.position,
      }),
    );
    setEuler(binding.pose.local[binding.pose.definition.index.head], 0.4, 0.2, 0);
    binding.apply();
    head.computeWorldMatrix(true);
    binding.sampleSurfaces();
    assert.equal(binding.surfaces.length, 1);
    const snapshot = binding.surfaces;
    const retained = [...snapshot[0].bounds.corners!];
    binding.sampleSurfaces();
    binding.applyTail();
    binding.apply();
    binding.sampleSurfaces();
    assert.equal(binding.surfaces, snapshot, 'unchanged final body writes reuse publication');
    const corners = binding.surfaces[0].bounds.corners!;
    const bounds = head.getBoundingInfo().boundingBox;
    for (let i = 0; i < 8; i++) {
      const point = Vector3.TransformCoordinates(
        new Vector3(
          i & 4 ? bounds.maximum.x : bounds.minimum.x,
          i & 2 ? bounds.maximum.y : bounds.minimum.y,
          i & 1 ? bounds.maximum.z : bounds.minimum.z,
        ),
        head.getWorldMatrix(),
      );
      assert.ok(point.asArray().every((v, axis) => Math.abs(v - corners[i * 3 + axis]) < 1e-6));
    }
    setEuler(binding.pose.local[binding.pose.definition.index.head], -0.2, 0.6, 0);
    binding.begin(0);
    binding.apply();
    binding.sampleSurfaces();
    assert.notEqual(binding.surfaces, snapshot, 'an articulation change republishes at fixed root');
    assert.deepEqual([...snapshot[0].bounds.corners!], retained, 'old corners retain their values');
    assert.notDeepEqual(
      [...head.getWorldMatrix().m],
      before,
      'logical head joint really drives existing head geometry',
    );
    const hand = binding.pose.local[binding.pose.definition.index.leftForearm];
    setEuler(hand, -0.8, 0, 0);
    binding.apply();
    forearms[0].computeWorldMatrix(true);
    const actual = Vector3.TransformCoordinates(
      new Vector3(0, -0.27, 0),
      forearms[0].getWorldMatrix(),
    );
    const expected = worldPoint(binding.pose, 'leftHand');
    assert.ok(actual.asArray().every((v, i) => Math.abs(v - expected[i]) < 1e-6));
    assert.equal(scene.transformNodes.length, nodes);
    assert.equal(scene.meshes.length, meshes);
    assert.equal(head.parent, body);
    assert.equal(rig.footPlants[0], binding.grounding.contacts[0].plant);
    assert.ok(!('legacy' in binding) && !('attackBlend' in rig));
    const mount = new TransformNode('equipment mount', scene);
    mount.parent = root;
    const tip = MeshBuilder.CreateBox('equipment tip', { size: 0.18 }, scene);
    tip.parent = mount;
    binding.attach(mount, 'spear');
    geometry.replace([head, tip]);
    binding.apply();
    binding.sampleSurfaces();
    const beforeEdit = binding.bodySurfaces;
    geometry.edit(() => (tip.position.x += 0.37));
    binding.apply(); // No demand at the edited pose yet.
    assert.equal(binding.bodySurfaces, beforeEdit);
    binding.sampleSurfaces();
    const edited = binding.bodySurfaces.find((s) => s.name === tip.name)!.bounds.corners!;
    tip.computeWorldMatrix(true);
    const { minimum, maximum } = tip.getBoundingInfo().boundingBox;
    for (let i = 0; i < 8; i++) {
      const point = Vector3.TransformCoordinates(
        new Vector3(
          i & 4 ? maximum.x : minimum.x,
          i & 2 ? maximum.y : minimum.y,
          i & 1 ? maximum.z : minimum.z,
        ),
        tip.getWorldMatrix(),
      );
      assert.ok(
        point.asArray().every((v, axis) => Math.abs(v - edited[i * 3 + axis]) < 1e-5),
        'edited equipment corners must match draw on reentry',
      );
    }
    const extra = MeshBuilder.CreateBox('new equipment piece', { size: 0.15 }, scene);
    extra.parent = mount;
    geometry.replace([head, tip, extra]);
    binding.sampleSurfaces();
    assert.ok(binding.bodySurfaces.some((s) => s.name === extra.name && s.enabled));
    const current = [...binding.pose.world];
    binding.apply();
    assert.deepEqual([...binding.pose.world], current);
    binding.begin(1 / 60);
    binding.pose.local[0].position.x = 10;
    binding.apply();
    assert.deepEqual([...binding.pose.previousWorld], current);
    binding.begin(0);
    binding.apply();
    assert.deepEqual(
      [...binding.pose.previousWorld],
      current,
      'zero-time application keeps previous-step history',
    );
    binding.invalidateHistory();
    binding.pose.local[0].position.x = 1000;
    binding.apply();
    assert.deepEqual(
      [...binding.pose.previousWorld],
      [...binding.pose.world],
      'teleport/reset cannot become velocity',
    );
    binding.reset({ x: 0, h: 3, z: 0 }, 0);
    binding.pose.local[0].scale.set(0.8, 1.3, 0.9);
    setEuler(binding.pose.local[binding.pose.definition.index.leftUpperArm], -0.6, 0.3, 0.4);
    binding.apply();
    const physics = new Ragdoll(
      { tiles: new Map(), blockers: [], entities: [] },
      binding.history.snapshot(),
      [1, 0, 0],
      20,
    );
    entity.add('ragdoll', physics);
    for (let frame = 0; frame < 30; frame++) {
      physics.advance(1 / 60);
      binding.applyPhysics(physics);
      forearms[0].computeWorldMatrix(true);
      const actual = Vector3.TransformCoordinates(
        new Vector3(0, -0.27, 0),
        forearms[0].getWorldMatrix(),
      );
      const expected = worldPoint(binding.pose, 'leftHand');
      assert.ok(
        actual.asArray().every((v, i) => Math.abs(v - expected[i]) < 1e-5),
        'rigid physics must not introduce parent-scale shear',
      );
    }
    physics.freeze();
    entity.add('corpse', { age: 1 }).add('transform', { x: 0, h: 0, z: 0, heading: 0 });
    head.computeWorldMatrix(true);
    const physicalHead = [...head.getWorldMatrix().m];
    readCorpseTerrain(ecs);
    assert.deepEqual(
      [...head.getWorldMatrix().m],
      physicalHead,
      'settled surface reads cannot rewrite frozen physics matrices',
    );
    binding.reset();
    assert.equal(root.isWorldMatrixFrozen, false);
    assert.equal(entity.has('ragdoll'), false);
    assert.equal(physics.bodyCount, 0);
    const handoff: DeathHandoff = {
      run: ecs,
      target: entity,
      source: null,
      time: 0,
      kind: 'melee',
      magnitude: 20,
      travel: [1, 0, 0],
      position: [0, 0, 0],
      heading: 0,
      velocity: [0, 0, 0],
      pose: binding.history.snapshot(),
    };
    entity.add('deathHandoff', handoff);
    const owner = new DeathPhysics(ecs, { tiles: new Map(), blockers: [], entities: [] });
    owner.advance(0);
    assert.equal(entity.require('ragdoll').bodyCount, 11);
    const firstIsland = entity.require('ragdoll');
    entity.remove('ragdoll');
    owner.advance(0);
    assert.equal(
      entity.has('ragdoll'),
      false,
      'removing physical ownership cannot replay its lethal handoff',
    );
    assert.equal(firstIsland.bodyCount, 0);
    entity.add('deathHandoff', handoff);
    owner.advance(0);
    assert.equal(entity.has('ragdoll'), false, 'consumed handoff identity cannot be resubmitted');
    entity.add('deathHandoff', { ...handoff, time: 1 });
    owner.advance(0);
    assert.equal(entity.require('ragdoll').bodyCount, 11);
    owner.dispose();
    owner.advance(1 / 60);
    assert.equal(entity.has('ragdoll'), false, 'disposed run cannot readmit deaths');
    assert.equal(root.isWorldMatrixFrozen, false, 'disposing physics restores binding ownership');
    scene.dispose();
    assert.throws(() => binding.apply(), /retired/);
    assert.throws(() => binding.history.snapshot(), /retired/);
    assert.equal(entity.has('rigPose'), false);
  } finally {
    engine.dispose();
  }
});

test('death physics publishes a cap eviction once and rejects a stale handoff at a reused ID', (t) => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const ecs = new ECS();
  const world: NavigationWorld = { tiles: new Map(), blockers: [], entities: [] };
  const physics = new DeathPhysics(ecs, world);
  const dt = 1 / 60;
  const create = (id: string, x: number) => {
    const node = (name: string, parent?: TransformNode) => {
      const result = new TransformNode(`${id}:${name}`, scene);
      if (parent) result.parent = parent;
      return result;
    };
    const root = node('root');
    root.position.set(x, 3, 0);
    const body = node('body', root);
    const chunk = MeshBuilder.CreateBox(`${id}:off-root chunk`, { size: 0.4 }, scene);
    chunk.parent = root;
    chunk.position.set(1.5, 0.15, 0);
    chunk.rotation.z = 0.2;
    const arms = [-1, 1].map((side) => node(`arm:${side}`, body));
    const legs = [-1, 1].map((side) => node(`leg:${side}`, root));
    const knees = legs.map((leg) => node('knee', leg));
    const entity = ecs
      .create(id)
      .add('transform', { x, h: 3, z: 0, heading: 0 })
      .add('render', { root, meshes: [chunk] })
      .add('rig', {
        root,
        body,
        arms,
        forearms: arms.map((arm) => node('forearm', arm)),
        legs,
        knees,
        feet: knees.map((knee) => node('foot', knee)),
        footPlants: [{ anchor: null }, { anchor: null }],
      });
    const binding = bindHumanoid(entity, profiles.player);
    const handoff: DeathHandoff = {
      run: ecs,
      target: entity,
      source: null,
      time: 0,
      kind: 'melee',
      magnitude: 20,
      travel: [1, 0, 0],
      position: [x, 3, 0],
      heading: 0,
      velocity: [0, 0, 0],
      pose: binding.history.snapshot(),
    };
    return { entity, binding, root, handoff, chunk };
  };
  try {
    const corpses = Array.from({ length: RAGDOLL_LIMIT }, (_, i) => create(`actor:${i}`, i * 4));
    for (const { entity, handoff } of corpses)
      entity.add('corpse', { age: 0 }).add('deathHandoff', handoff);
    physics.advance(dt);
    physics.advance(dt);
    const islands = () => ecs.query('ragdoll').map((entity) => entity.require('ragdoll'));
    const active = islands();
    assert.equal(active.length, RAGDOLL_LIMIT);
    assert.ok(active.every((island) => !island.settled && island.bodyCount > 0));
    assert.ok(publishCorpseContacts(ecs, world).empty);
    const [oldest] = corpses;
    const evicted = oldest.entity.require('ragdoll');
    assert.notDeepEqual(oldest.binding.history.snapshot().world, oldest.handoff.pose?.world);
    const finalMatrix = Array.from(oldest.root.getWorldMatrix().m);
    const publications = t.mock.method(oldest.root, 'freezeWorldMatrix');

    // Admission, not a direct freeze() call, must evict the oldest active island.
    const overflow = create('overflow', RAGDOLL_LIMIT * 4);
    overflow.entity.add('corpse', { age: 0 }).add('deathHandoff', overflow.handoff);
    physics.advance(dt);
    assert.equal(evicted.settled, true, 'the oldest active island is evicted');
    assert.equal(islands().filter((island) => !island.settled).length, RAGDOLL_LIMIT);
    assert.equal(overflow.entity.require('ragdoll').settled, false);
    assert.equal(evicted.bodyCount + evicted.constraintCount + evicted.staticCount, 0);
    assert.equal(publications.mock.callCount(), 1, 'publish the cap-frozen pose on this tick');
    const rest = oldest.binding.history.snapshot();
    assert.deepEqual(oldest.binding.pose.world, evicted.world);
    assert.ok(rest.world.every((v, i) => Math.abs(v - evicted.world[i]) < 1e-9));
    assert.ok([...rest.linear, ...rest.angular].every((v) => Math.abs(v) < 1e-9));
    assert.deepEqual(Array.from(oldest.root.getWorldMatrix().m), finalMatrix);
    const unowned = oldest.entity.require('render');
    const geometry = new ActorGeometry(oldest.entity);
    const ownedWorld = { ...world, tiles: new SupportTiles(world.tiles) };
    const meshVisits = t.mock.method(oldest.chunk, 'isEnabled');
    const supportLookups = t.mock.method(ownedWorld.tiles, 'get');
    const certified = publishCorpseContacts(ecs, ownedWorld);
    assert.ok(!certified.empty);
    meshVisits.mock.resetCalls();
    supportLookups.mock.resetCalls();
    for (let i = 0; i < 180; i++) assert.equal(publishCorpseContacts(ecs, ownedWorld), certified);
    assert.equal(meshVisits.mock.callCount(), 0);
    assert.equal(supportLookups.mock.callCount(), 0);
    geometry.edit(() => {
      oldest.chunk.isVisible = false;
    });
    assert.ok(publishCorpseContacts(ecs, ownedWorld).empty);
    geometry.edit(() => {
      oldest.chunk.isVisible = true;
    });
    const chunkPosition = oldest.chunk.getAbsolutePosition();
    const pointOnChunk = { x: chunkPosition.x, z: chunkPosition.z, h: 3 };
    const tileKey = key(Math.round(chunkPosition.x), Math.round(chunkPosition.z));
    ownedWorld.tiles.set(tileKey, {
      x: Math.round(chunkPosition.x),
      z: Math.round(chunkPosition.z),
      h: 6,
      surface: 'stone',
    });
    assert.equal(publishCorpseContacts(ecs, ownedWorld).heightAt(pointOnChunk), 0);
    ownedWorld.tiles.delete(tileKey);
    assert.ok(publishCorpseContacts(ecs, ownedWorld).heightAt(pointOnChunk) > 0);
    geometry.replace([]);
    assert.ok(publishCorpseContacts(ecs, ownedWorld).empty);
    geometry.replace([oldest.chunk]);
    evicted.settled = false;
    assert.ok(publishCorpseContacts(ecs, ownedWorld).empty);
    physics.advance(0);
    evicted.freeze();
    physics.advance(dt);
    assert.ok(!publishCorpseContacts(ecs, ownedWorld).empty);
    const finalWrites = publications.mock.callCount();
    oldest.entity.add('render', unowned);
    const firstContacts = publishCorpseContacts(ecs, world);
    const exhaustive = readCorpseTerrain(ecs, world);
    assert.equal(exhaustive.length, 1);
    const { worldMin, worldMax } = exhaustive[0];
    const center = { x: (worldMin.x + worldMax.x) / 2, z: (worldMin.z + worldMax.z) / 2, h: 3 };
    assert.ok(firstContacts.heightAt(center) > 0);
    for (const x of [worldMin.x, center.x, worldMax.x, 2]) {
      const point = { ...center, x };
      assert.equal(firstContacts.heightAt(point), corpseHeightAt(exhaustive, point));
      assert.equal(
        corpseStep(firstContacts, point, { x: 0.4, z: 0 }, 4),
        corpseStep(exhaustive, point, { x: 0.4, z: 0 }, 4),
      );
    }
    for (let i = 0; i < 180; i++) assert.equal(publishCorpseContacts(ecs, world), firstContacts);
    oldest.chunk.setEnabled(false);
    assert.ok(publishCorpseContacts(ecs, world).empty);
    assert.ok(firstContacts.heightAt(center) > 0, 'a retained query is a numeric snapshot');
    oldest.chunk.setEnabled(true);
    assert.ok(!publishCorpseContacts(ecs, world).empty);
    oldest.chunk.isVisible = false;
    assert.ok(publishCorpseContacts(ecs, world).empty);
    oldest.chunk.isVisible = true;
    assert.ok(!publishCorpseContacts(ecs, world).empty);
    oldest.chunk.visibility = 0;
    assert.equal(publishCorpseContacts(ecs, world).heightAt(center), 0);
    oldest.chunk.visibility = 1;
    const replacementMesh = MeshBuilder.CreateBox('replacement piece', { size: 0.4 }, scene);
    replacementMesh.position.set(4, 3.2, 0);
    const meshes = oldest.entity.require('render').meshes;
    meshes[0] = replacementMesh;
    const point = { x: 4, z: 0, h: 3 };
    const check = (expected: number) => {
      const contacts = publishCorpseContacts(ecs, world);
      assert.ok(Math.abs(contacts.heightAt(point) - expected) < 1e-6);
      assert.equal(contacts.heightAt(center), 0);
      assert.equal(contacts.heightAt(point), corpseHeightAt(readCorpseTerrain(ecs, world), point));
    };
    check(0.4);
    replacementMesh.setEnabled(false);
    check(0);
    replacementMesh.setEnabled(true);
    replacementMesh.position.y = 3.1;
    check(0.3);
    replacementMesh
      .getBoundingInfo()
      .reConstruct(new Vector3(-0.2, -0.2, -0.2), new Vector3(0.2, 0.15, 0.2));
    check(0.25);
    world.tiles.set(key(4, 0), { x: 4, z: 0, h: 6, surface: 'stone' });
    check(0);
    world.tiles.get(key(4, 0))!.h = 3;
    check(0.25);
    replacementMesh.dispose();
    check(0);
    physics.advance(dt);
    assert.equal(
      publications.mock.callCount(),
      finalWrites,
      'do not republish the unchanged final pose',
    );

    ecs.remove(oldest.entity.id);
    const replacement = create(oldest.entity.id, -4);
    assert.notEqual(replacement.entity, oldest.entity);
    // Use a distinct handoff object so the consumed-object check cannot mask a stale target.
    replacement.entity.add('corpse', { age: 0 }).add('deathHandoff', { ...oldest.handoff });
    physics.advance(dt);
    assert.equal(oldest.entity.has('ragdoll'), false);
    assert.equal(replacement.entity.has('ragdoll'), false);
    assert.equal(replacement.root.isWorldMatrixFrozen, false);
    assert.ok(publishCorpseContacts(ecs, world).empty);
    replacement.entity.add('deathHandoff', replacement.handoff);
    physics.advance(dt);
    const fresh = replacement.entity.require('ragdoll');
    assert.notEqual(fresh, evicted);
    assert.equal(fresh.settled, false);
    assert.equal(replacement.root.isWorldMatrixFrozen, true);
    assert.equal(replacement.root.getWorldMatrix().m[12], -4);
    assert.deepEqual(replacement.binding.pose.world, fresh.world);
    assert.equal(
      publications.mock.callCount(),
      finalWrites,
      'the removed binding receives no further writes',
    );
  } finally {
    physics.dispose();
    engine.dispose();
  }
});
