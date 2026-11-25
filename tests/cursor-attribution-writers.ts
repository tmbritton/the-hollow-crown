import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { BoundingBox } from '@babylonjs/core/Culling/boundingBox.js';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { Bounds, GroundRay } from './cursor-attribution-model.ts';
import type { Visit } from './cursor-evidence.ts';
import type { WriterKind } from './cursor-writer-evidence.ts';
type WorldBox = number[];
export type GeometryInput = {
  min: number[];
  max: number[];
  aggregate: { min: number[]; max: number[] } | null;
  world: number[];
  lineage: number[];
  eligible: boolean;
  fallback: boolean;
  thin: number[] | null;
};
const equalArray = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((n, i) => n === b[i]);
export function sameGeometry(a: GeometryInput, b: GeometryInput) {
  return (
    a === b ||
    (a.eligible === b.eligible &&
      a.fallback === b.fallback &&
      equalArray(a.world, b.world) &&
      equalArray(a.lineage, b.lineage) &&
      equalArray(a.min, b.min) &&
      equalArray(a.max, b.max) &&
      (a.aggregate === b.aggregate ||
        (!!a.aggregate &&
          !!b.aggregate &&
          equalArray(a.aggregate.min, b.aggregate.min) &&
          equalArray(a.aggregate.max, b.aggregate.max))) &&
      (a.thin === b.thin || (!!a.thin && !!b.thin && equalArray(a.thin, b.thin))))
  );
}
export const xz = (b: WorldBox): Bounds => [b[0], b[2], b[3], b[5]];
const boxValues = (b: BoundingBox) => [...b.minimumWorld.asArray(), ...b.maximumWorld.asArray()];
export function refreshWorld(input: GeometryInput, refreshThin: boolean) {
  const local = !refreshThin && input.aggregate ? input.aggregate : input;
  const min = Vector3.FromArray(local.min),
    max = Vector3.FromArray(local.max);
  const world = Matrix.FromArray(input.world);
  const box = new BoundingBox(min, max, world);
  const instances: WorldBox[] = [];
  if (refreshThin && input.thin?.length) {
    const low = new Vector3(Infinity, Infinity, Infinity);
    const high = new Vector3(-Infinity, -Infinity, -Infinity);
    const matrix = Matrix.Identity();
    for (let i = 0; i < input.thin.length; i += 16) {
      Matrix.FromArrayToRef(input.thin, i, matrix);
      box.reConstruct(min, max, matrix);
      low.minimizeInPlace(box.minimumWorld);
      high.maximizeInPlace(box.maximumWorld);
      box._update(matrix.multiply(world));
      instances.push(boxValues(box));
    }
    box.reConstruct(low, high, world);
  }
  return { world: boxValues(box), instances };
}

export type Observation = { id: number; input: GeometryInput; world: WorldBox | null };
export type Write = {
  seq: number;
  frame: number;
  tick: number;
  phase: Phase;
  id: number;
  kind: WriterKind;
  before: Observation | null;
  after: Observation | null;
  slot?: number;
  refreshThin?: boolean;
};
type Phase = 'fixed' | 'presentation' | 'pick' | 'render';
export type Checkpoint = {
  at: number;
  phase: Phase;
  tick: number;
  scene: Observation[];
  ray: GroundRay | null;
};
export type WriterFrame = {
  frame: number;
  from: number;
  to: number;
  writes: Write[];
  checks: Checkpoint[];
};
export type WriterTrace = {
  runId: string;
  provenance: 'matched' | 'software';
  kind: Visit['kind'];
  identities: { id: number; mesh: number; name: string }[];
  seed: Observation[];
  frames: WriterFrame[];
  gaps: string[];
};

// Diagnostic-only scene adapter. Explicit application writers publish at their call site;
// mesh wrappers observe engine publication calls and do not observe diagnostic readbacks.
const captures = new WeakMap<Scene, ReturnType<typeof captureWriters>>();
export function writerDiagnostic(
  kind: 'door' | 'chest' | 'pose' | 'physics',
  node: TransformNode,
  run: () => void,
) {
  const capture = captures.get(node.getScene());
  if (capture?.recording())
    capture.write(kind, [...(node instanceof Mesh ? [node] : []), ...node.getChildMeshes()], run);
  else run();
}

export function thinDiagnostic(mesh: Mesh, active: boolean, run: () => void) {
  const capture = captures.get(mesh.getScene());
  if (capture?.recording()) capture.write('thin-edit', [mesh], run, undefined, active);
  else run();
}

export function captureWriters(
  scene: Scene,
  metadata: Pick<WriterTrace, 'runId' | 'provenance' | 'kind'>,
  limit = 60_000,
) {
  const trace: WriterTrace = { ...metadata, seed: [], frames: [], identities: [], gaps: [] };
  const ids = new Map<AbstractMesh, number>();
  const last = new Map<number, Observation>();
  const restore = new Map<AbstractMesh, () => void>();
  const gap = (reason: string) => {
    if (!trace.gaps.includes(reason)) trace.gaps.push(reason);
  };
  let frame: WriterFrame | null = null,
    seq = 0,
    scalars = 0,
    muted = false,
    phase: Phase = 'fixed',
    tick = 0;
  // Bound retained input and checkpoint payloads as well as event count. The scalar
  // budget is a storage guard, not a heap-size estimate or a performance threshold.
  const scalarLimit = 8_000_000;
  const sizeOf = (o: Observation | null) =>
    o ? 42 + o.input.lineage.length + (o.input.thin?.length ?? 0) : 0;
  function reserve(n: number) {
    scalars += n;
    if (scalars <= scalarLimit) return true;
    gap('writer trace operand/checkpoint overflow');
    return false;
  }

  function quiet<T>(run: () => T): T {
    const previous = muted;
    muted = true;
    try {
      return run();
    } finally {
      muted = previous;
    }
  }

  function read(mesh: AbstractMesh, force = false): Observation {
    return quiet(() => {
      const matrix = mesh.computeWorldMatrix(force);
      const info = mesh.getBoundingInfo();
      const local = mesh.rawBoundingInfo ?? info;
      const thin = mesh instanceof Mesh ? mesh._thinInstanceDataStorage.matrixData : null;
      const lineage: number[] = [];
      for (let parent = mesh.parent; parent; parent = parent.parent) lineage.push(parent.uniqueId);
      const world = boxValues(info.boundingBox);
      const input: GeometryInput = {
        min: local.minimum.asArray(),
        max: local.maximum.asArray(),
        aggregate: thin ? { min: info.minimum.asArray(), max: info.maximum.asArray() } : null,
        world: Array.from(matrix.asArray()),
        lineage,
        eligible:
          mesh.isEnabled() &&
          mesh.isVisible &&
          mesh.visibility > 0 &&
          mesh.isPickable &&
          !mesh.material?.needAlphaBlending(),
        fallback:
          mesh.getClassName() !== 'Mesh' ||
          !mesh.getTotalVertices() ||
          !!thin ||
          !!mesh.skeleton ||
          !!mesh.morphTargetManager ||
          !!mesh.billboardMode,
        thin:
          thin && mesh instanceof Mesh
            ? Array.from(thin.subarray(0, mesh.thinInstanceCount * 16))
            : null,
      };
      return { id: ids.get(mesh)!, input, world: world.every(Number.isFinite) ? world : null };
    });
  }

  function emit(
    kind: WriterKind,
    id: number,
    after: Observation | null,
    slot?: number,
    refreshThin?: boolean,
  ) {
    if (!frame) return;
    if (seq >= limit) {
      gap('writer trace overflow');
      return;
    }
    const before = last.get(id) ?? null;
    if (!reserve(sizeOf(before) + sizeOf(after))) return;
    frame.writes.push({
      seq: seq++,
      frame: frame.frame,
      tick,
      phase,
      id,
      kind,
      before,
      after,
      slot,
      refreshThin,
    });
    if (after) last.set(id, after);
    else last.delete(id);
  }

  function attach(mesh: AbstractMesh) {
    if (ids.has(mesh)) return;
    const id = ids.size;
    ids.set(mesh, id);
    trace.identities.push({ id, mesh: mesh.uniqueId, name: mesh.name });
    const compute = mesh.computeWorldMatrix;
    const ownCompute = Object.hasOwn(mesh, 'computeWorldMatrix');
    // Babylon propagates effective enable changes through non-mesh ancestors and
    // reparenting synchronously, before any world-matrix read or checkpoint.
    const effective = mesh.onEffectiveEnabledStateChangedObservable;
    const enabled = effective.add(() => {
      if (frame && !muted) emit('eligibility', id, read(mesh, true));
    });
    mesh.computeWorldMatrix = function (...args) {
      if (!frame || muted) return compute.apply(this, args);
      const result = compute.apply(this, args);
      const previous = last.get(id);
      const after = read(mesh);
      const same = previous && sameGeometry(previous.input, after.input);
      emit(
        !previous
          ? 'spawn'
          : same
            ? 'check'
            : previous.input.lineage.join() !== after.input.lineage.join()
              ? 'reparent'
              : 'world',
        id,
        after,
      );
      return result;
    };
    let undoThin = () => {};
    if (mesh instanceof Mesh) {
      const set = mesh.thinInstanceSetBuffer,
        edit = mesh.thinInstanceSetMatrixAt,
        upload = mesh.thinInstanceBufferUpdated;
      mesh.thinInstanceSetBuffer = function (...args) {
        if (args[0] !== 'matrix') return set.apply(this, args);
        return write('thin-replace', [mesh], () => set.apply(this, args), undefined, !!args[1]);
      };
      mesh.thinInstanceSetMatrixAt = function (...args) {
        return write('thin-edit', [mesh], () => edit.apply(this, args), args[0], args[2] ?? true);
      };
      mesh.thinInstanceBufferUpdated = function (...args) {
        if (args[0] !== 'matrix') return upload.apply(this, args);
        return write('thin-edit', [mesh], () => upload.apply(this, args), undefined, false);
      };
      undoThin = () => {
        Reflect.deleteProperty(mesh, 'thinInstanceSetBuffer');
        Reflect.deleteProperty(mesh, 'thinInstanceSetMatrixAt');
        Reflect.deleteProperty(mesh, 'thinInstanceBufferUpdated');
      };
    }
    restore.set(mesh, () => {
      if (ownCompute) mesh.computeWorldMatrix = compute;
      else Reflect.deleteProperty(mesh, 'computeWorldMatrix');
      effective.remove(enabled);
      undoThin();
    });
  }

  function write<T>(
    kind: WriterKind,
    meshes: readonly AbstractMesh[],
    run: () => T,
    slot?: number,
    refreshThin?: boolean,
  ): T {
    if (!frame || muted) return run();
    const result = quiet(run);
    for (const mesh of meshes)
      if (ids.has(mesh)) emit(kind, ids.get(mesh)!, read(mesh, true), slot, refreshThin);
    return result;
  }

  const add = scene.addMesh,
    remove = scene.removeMesh;
  scene.addMesh = function (...args) {
    const result = add.apply(this, args);
    // Mesh construction may not yet have initialized vertex buffers. Register identity now;
    // its first world publication supplies the operands, or reconciliation reports a gap.
    attach(args[0]);
    return result;
  };
  scene.removeMesh = function (...args) {
    const mesh = args[0];
    const result = remove.apply(this, args);
    const id = ids.get(mesh);
    if (id !== undefined && last.has(id)) emit('dispose', id, null);
    else if (frame && id !== undefined) gap(`retired mesh ${id} before initial publication`);
    return result;
  };
  scene.meshes.forEach(attach);
  const api = {
    trace,
    gap,
    quiet,
    write,
    recording: () => !!frame && !muted,
    begin(nativeFrame: number, from: number) {
      if (frame) throw new Error('writer frame already open');
      if (!trace.frames.length) {
        trace.seed = scene.meshes.map((mesh) => read(mesh, true));
        for (const observation of trace.seed) last.set(observation.id, observation);
      }
      frame = { frame: nativeFrame, from, to: from, writes: [], checks: [] };
      api.phase('fixed', from);
    },
    phase(next: Phase, step: number) {
      phase = next;
      tick = step;
    },
    checkpoint(ray: GroundRay | null = null) {
      if (!frame || scalars > scalarLimit) return;
      const sceneAtCheck = scene.meshes.map((mesh) => read(mesh, true));
      if (!reserve(sceneAtCheck.reduce((n, o) => n + sizeOf(o), 0))) return;
      frame.checks.push({
        at: seq,
        phase,
        tick,
        scene: sceneAtCheck,
        ray,
      });
    },
    end(to: number, keep = true) {
      if (!frame) return;
      frame.to = to;
      if (keep) trace.frames.push(frame);
      else {
        seq = 0;
        scalars = 0;
        last.clear();
      }
      frame = null;
    },
    close() {
      captures.delete(scene);
      scene.addMesh = add;
      scene.removeMesh = remove;
      for (const undo of restore.values()) undo();
      frame = null;
    },
  };
  captures.set(scene, api);
  return api;
}
