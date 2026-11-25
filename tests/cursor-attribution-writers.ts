import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { BoundingBox } from '@babylonjs/core/Culling/boundingBox.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo.js';
import type { Bounds, GroundRay } from './cursor-attribution-model.ts';
import type { Visit } from './cursor-evidence.ts';
import { phases, writerKinds } from './cursor-writer-evidence.ts';
import type { WriterKind } from './cursor-writer-evidence.ts';
import {
  identityLimit,
  observationDelta,
  observationLimit,
  stateScalars,
  thinFragmentScalars,
} from './cursor-writer-stream.ts';
import type { Site, WriterRecord } from './cursor-writer-stream.ts';
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
  authored?: number[];
  boundsDirty?: boolean;
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
      equalArray(a.authored ?? [], b.authored ?? []) &&
      a.boundsDirty === b.boundsDirty &&
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
export function billboardLineage(mesh: AbstractMesh) {
  for (let node: typeof mesh.parent = mesh; node; node = node.parent)
    if ('billboardMode' in node && node.billboardMode) return true;
  return false;
}
const boxValues = (b: BoundingBox) => [...b.minimumWorld.asArray(), ...b.maximumWorld.asArray()];

// Pinned Babylon: getBoundingInfo can update the world bounds and clear the dirty bit.
// worldMatrixFromCache is a plain read. Do not replace either read with getWorldMatrix.
export function cachedBounds(mesh: AbstractMesh) {
  type Cache = {
    _masterMesh: AbstractMesh | null;
    _boundingInfo: BoundingInfo | null;
    _boundingInfoIsDirty: boolean;
  };
  let cache = mesh as unknown as Cache;
  while (cache._masterMesh) cache = cache._masterMesh as unknown as Cache;
  return { info: cache._boundingInfo, dirty: cache._boundingInfoIsDirty };
}

// Leaf-first Babylon TRS operands. The common record is fixed width; pivot and
// explicitly frozen matrices occur only on the paths that use them.
const transformScalars = 16;
const quaternion = 1,
  pivot = 2,
  postPivot = 4,
  frozen = 8,
  unsupported = 16;
function appendTransform(out: number[], node: TransformNode) {
  const q = node.rotationQuaternion;
  const flags =
    (q ? quaternion : 0) |
    (node.isUsingPivotMatrix() ? pivot : 0) |
    (node.isUsingPostMultiplyPivotMatrix() ? postPivot : 0) |
    (node.isWorldMatrixFrozen ? frozen : 0) |
    (node.infiniteDistance ||
    node.reIntegrateRotationIntoRotationQuaternion ||
    (node as unknown as { _transformToBoneReferal: unknown })._transformToBoneReferal
      ? unsupported
      : 0);
  out.push(
    node.position.x,
    node.position.y,
    node.position.z,
    node.scaling.x,
    node.scaling.y,
    node.scaling.z,
    node.rotation.x,
    node.rotation.y,
    node.rotation.z,
    node.billboardMode,
    q?.x ?? 0,
    q?.y ?? 0,
    q?.z ?? 0,
    q?.w ?? 0,
    node.scalingDeterminant,
    flags,
  );
  if (flags & pivot) for (const value of node.getPivotMatrix().m) out.push(value);
  if (flags & frozen) for (const value of node.worldMatrixFromCache.m) out.push(value);
}

const transformLength = (flags: number) =>
  transformScalars + (flags & pivot ? 16 : 0) + (flags & frozen ? 16 : 0);

export function ownTransform(input: GeometryInput) {
  const a = input.authored;
  return a?.slice(0, a.length < transformScalars ? a.length : transformLength(a[15]));
}

/** Evaluate only copied operands, never a live Babylon node or camera. Billboard
 * lineages are native-observed fallback entries, not spatially indexed poses. */
export function detachedWorld(input: GeometryInput): number[] | null {
  const a = input.authored;
  if (!a || a.length < transformScalars) return null;
  const locals: Matrix[] = [];
  let terminatesAtFrozen = false;
  let offset = 0;
  for (let depth = 0; depth <= input.lineage.length; depth++) {
    const flags = a[offset + 15];
    const len = transformLength(flags);
    if (!Number.isInteger(flags) || flags < 0 || flags > 31 || offset + len > a.length) return null;
    let local: Matrix;
    if (flags & frozen) {
      local = Matrix.FromArray(a, offset + len - 16);
    } else {
      if (a[offset + 9] || flags & unsupported) return null;
      const determinant = a[offset + 14];
      const scale = Vector3.FromArray(a, offset + 3).scaleInPlace(determinant);
      const rotation =
        flags & quaternion
          ? Quaternion.FromArray(a, offset + 10)
          : Quaternion.RotationYawPitchRoll(a[offset + 7], a[offset + 6], a[offset + 8]);
      const translation = Vector3.FromArray(a, offset);
      if (flags & pivot) {
        const p = Matrix.FromArray(a, offset + transformScalars);
        const r = Matrix.Identity();
        rotation.toRotationMatrix(r);
        local = p.multiply(Matrix.Scaling(scale.x, scale.y, scale.z)).multiply(r);
        if (flags & postPivot) local.multiplyToRef(p.clone().invert(), local);
        local.addTranslationFromFloats(translation.x, translation.y, translation.z);
      } else local = Matrix.Compose(scale, rotation, translation);
    }
    locals.push(local);
    offset += len;
    if (flags & frozen) {
      terminatesAtFrozen = true;
      break;
    }
  }
  if (offset !== a.length && !terminatesAtFrozen) return null;
  let world = locals.pop()!;
  while (locals.length) world = locals.pop()!.multiply(world);
  return Array.from(world.m);
}
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
export const observationSize = (o: Observation | null) =>
  o
    ? 48 + o.input.lineage.length + (o.input.authored?.length ?? 0) + (o.input.thin?.length ?? 0)
    : 0;
export function equalObservation(before: Observation | undefined | null, after: Observation) {
  return (
    !!before &&
    sameGeometry(before.input, after.input) &&
    equalArray(before.world ?? [], after.world ?? [])
  );
}
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
export function writerDiagnostic<T>(
  kind: 'door' | 'chest' | 'pose' | 'physics',
  node: TransformNode,
  run: () => T,
): T {
  const capture = captures.get(node.getScene());
  if (capture?.recording()) return capture.source(kind, node, run);
  return run();
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
  stream?: { append(record: WriterRecord): void; fail(reason: string): void },
) {
  const trace: WriterTrace = { ...metadata, seed: [], frames: [], identities: [], gaps: [] };
  const ids = new Map<AbstractMesh, number>();
  const last = new Map<number, Observation>();
  const priorCheckpoint = new Map<number, Observation>();
  let activeScalars = 0,
    checkpointScalars = 0,
    frames = 0,
    started = false,
    failed = false;
  const restore = new Map<AbstractMesh, () => void>();
  const gap = (reason: string) => {
    if (trace.gaps.length < 16 && !trace.gaps.includes(reason))
      trace.gaps.push(reason.slice(0, 512));
  };
  function overflow(reason: string) {
    gap(reason);
    stream?.fail(reason);
    failed = true;
  }
  function track(map: Map<number, Observation>, id: number, o: Observation | null) {
    const delta = observationSize(o) - observationSize(map.get(id) ?? null);
    if (map === last) activeScalars += delta;
    else checkpointScalars += delta;
    if (stream && Math.max(activeScalars, checkpointScalars) > stateScalars) {
      overflow('live writer active state overflow');
      return;
    }
    if (o) map.set(id, o);
    else map.delete(id);
  }
  function observationRecord(row: ['seed' | 'mesh', Observation] | ['write', Site, Observation]) {
    if (!stream) return;
    const o = row[0] === 'write' ? row[2] : row[1];
    const thin = o.input.thin;
    if (!thin || thin.length <= thinFragmentScalars) {
      stream.append(row);
      return;
    }
    const head = { ...o, input: { ...o.input, thin: null } };
    stream.append(
      row[0] === 'write' ? ['write', row[1], head, thin.length] : [row[0], head, thin.length],
    );
    for (let i = 0; i < thin.length; i += thinFragmentScalars)
      stream.append(['thin', i, thin.slice(i, i + thinFragmentScalars)]);
  }
  let frame: WriterFrame | null = null,
    seq = 0,
    scalars = 0,
    muted = false,
    phase: Phase = 'fixed',
    tick = 0;
  // Bound retained input and checkpoint payloads as well as event count. The scalar
  // budget is a storage guard, not a heap-size estimate or a performance threshold.
  const scalarLimit = 8_000_000;
  const sizeOf = observationSize;
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

  function read(mesh: AbstractMesh, matrix = mesh.worldMatrixFromCache): Observation {
    const { info, dirty } = cachedBounds(mesh);
    const local = mesh.rawBoundingInfo ?? info;
    const thin = mesh instanceof Mesh ? mesh._thinInstanceDataStorage.matrixData : null;
    const lineage: number[] = [];
    const authored: number[] = [];
    if (
      stream &&
      thin &&
      mesh instanceof Mesh &&
      mesh.thinInstanceCount * 16 > observationLimit - 48
    ) {
      overflow(`thin matrix operand overflow for ${mesh.name}`);
      return {
        id: ids.get(mesh)!,
        input: {
          min: [],
          max: [],
          aggregate: null,
          world: [],
          lineage,
          eligible: false,
          fallback: true,
          thin: null,
        },
        world: null,
      };
    }
    for (let node: typeof mesh.parent = mesh; node; node = node.parent) {
      if (stream && authored.length + lineage.length > observationLimit - 64) {
        overflow('ancestry operand overflow');
        break;
      }
      if (node !== mesh) lineage.push(node.uniqueId);
      if ('rotationQuaternion' in node) appendTransform(authored, node as TransformNode);
    }
    if (!local || !info)
      gap(`missing cached bounds for ${ids.get(mesh)} ${mesh.name} (${phase}, tick ${tick})`);
    const world = info ? boxValues(info.boundingBox) : null;
    const input: GeometryInput = {
      min: local?.minimum.asArray() ?? [],
      max: local?.maximum.asArray() ?? [],
      aggregate: thin && info ? { min: info.minimum.asArray(), max: info.maximum.asArray() } : null,
      world: Array.from(matrix.asArray()),
      lineage,
      authored,
      // Babylon skips the lazy update for a locked box.
      boundsDirty: dirty && !info?.isLocked,
      eligible:
        mesh.isEnabled() &&
        mesh.isVisible &&
        mesh.visibility > 0 &&
        mesh.isPickable &&
        !mesh.material?.needAlphaBlending(),
      fallback:
        !info ||
        mesh.getClassName() !== 'Mesh' ||
        !mesh.getTotalVertices() ||
        !!thin ||
        !!mesh.skeleton ||
        !!mesh.morphTargetManager ||
        billboardLineage(mesh),
      thin:
        thin && mesh instanceof Mesh
          ? Array.from(thin.subarray(0, mesh.thinInstanceCount * 16))
          : null,
    };
    return { id: ids.get(mesh)!, input, world: world?.every(Number.isFinite) ? world : null };
  }

  function emit(
    kind: WriterKind,
    id: number,
    after: Observation | null,
    slot?: number,
    refreshThin?: boolean,
  ) {
    if (!frame || failed) return;
    if (!stream && seq >= limit) {
      gap('writer trace overflow');
      return;
    }
    const before = last.get(id) ?? null;
    if (!stream && !reserve(sizeOf(before) + sizeOf(after))) return;
    const site = {
      seq: seq++,
      frame: frame.frame,
      tick,
      phase,
      id,
      kind,
      slot,
      refreshThin,
    };
    if (stream) {
      const fields: Site = [
        id,
        tick,
        phases.indexOf(phase),
        writerKinds.indexOf(kind),
        slot ?? null,
        refreshThin ?? null,
      ];
      if (!after || equalObservation(before, after))
        stream.append(['write', fields, after ? false : null]);
      else {
        const delta = observationDelta(before, after);
        if (delta) stream.append(['write-delta', fields, delta]);
        else observationRecord(['write', fields, after]);
      }
    } else frame.writes.push({ ...site, before, after });
    track(last, id, after);
  }

  function attach(mesh: AbstractMesh) {
    if (ids.has(mesh)) return;
    if (stream && (ids.size >= identityLimit || mesh.name.length > 256)) {
      overflow('live writer identity overflow');
      return;
    }
    const id = ids.size;
    ids.set(mesh, id);
    trace.identities.push({ id, mesh: mesh.uniqueId, name: mesh.name });
    if (started) stream?.append(['id', trace.identities[id]]);
    const compute = mesh.computeWorldMatrix;
    const ownCompute = Object.hasOwn(mesh, 'computeWorldMatrix');
    const bounds = mesh.getBoundingInfo;
    const ownBounds = Object.hasOwn(mesh, 'getBoundingInfo');
    // Babylon propagates effective enable changes through non-mesh ancestors and
    // reparenting synchronously, before any world-matrix read or checkpoint.
    const effective = mesh.onEffectiveEnabledStateChangedObservable;
    const enabled = effective.add(() => {
      if (frame && !muted) emit('eligibility', id, read(mesh));
    });
    const collision = mesh.onCollisionPositionChangeObservable.add(() => {
      if (frame && !muted && !failed) emit('physics', id, read(mesh));
    });
    mesh.computeWorldMatrix = function (...args) {
      if (!frame || muted || failed) return compute.apply(this, args);
      const result = compute.apply(this, args);
      const previous = last.get(id);
      const after = read(mesh, result);
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
    mesh.getBoundingInfo = function (...args) {
      const result = bounds.apply(this, args);
      if (frame && !muted && !failed) {
        const before = last.get(id);
        const after = read(mesh);
        if (
          !before ||
          !sameGeometry(before.input, after.input) ||
          !equalArray(before.world ?? [], after.world ?? [])
        )
          emit(before ? 'world' : 'spawn', id, after);
      }
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
      if (ownBounds) mesh.getBoundingInfo = bounds;
      else Reflect.deleteProperty(mesh, 'getBoundingInfo');
      effective.remove(enabled);
      mesh.onCollisionPositionChangeObservable.remove(collision);
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
    if (!frame || muted || failed) return run();
    const result = quiet(run);
    for (const mesh of meshes)
      if (ids.has(mesh)) emit(kind, ids.get(mesh)!, read(mesh), slot, refreshThin);
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
    source<T>(kind: 'door' | 'chest' | 'pose' | 'physics', node: TransformNode, run: () => T) {
      const affected = node.getChildMeshes();
      if (node instanceof AbstractMesh) affected.push(node);
      affected.sort((a, b) => (ids.get(a) ?? Infinity) - (ids.get(b) ?? Infinity));
      return write(kind, affected, run);
    },
    recording: () => !!frame && !muted && !failed,
    begin(nativeFrame: number, from: number) {
      if (failed) return;
      if (frame) throw new Error('writer frame already open');
      if (!started) {
        started = true;
        stream?.append(['start', metadata]);
        if (stream) for (const id of trace.identities) stream.append(['id', id]);
        for (const mesh of scene.meshes) {
          if (failed) return;
          const observation = read(mesh);
          track(last, observation.id, observation);
          if (stream) {
            track(priorCheckpoint, observation.id, observation);
            observationRecord(['seed', observation]);
          } else trace.seed.push(observation);
        }
      }
      frame = { frame: nativeFrame, from, to: from, writes: [], checks: [] };
      stream?.append(['begin', nativeFrame, from]);
      api.phase('fixed', from);
    },
    phase(next: Phase, step: number) {
      phase = next;
      tick = step;
    },
    checkpoint(ray: GroundRay | null = null) {
      if (!frame || failed || scalars > scalarLimit) return;
      if (stream) {
        stream.append(['check', { at: seq, phase, tick, ray }]);
        const seen = new Set<number>();
        for (const mesh of scene.meshes) {
          if (failed) return;
          const observation = read(mesh);
          const { id } = observation;
          seen.add(id);
          const unchanged = equalObservation(priorCheckpoint.get(id), observation);
          if (unchanged) stream.append(['mesh', id]);
          else {
            const delta = observationDelta(priorCheckpoint.get(id), observation);
            if (delta) stream.append(['mesh-delta', delta]);
            else observationRecord(['mesh', observation]);
          }
          if (!unchanged) track(priorCheckpoint, id, observation);
        }
        for (const id of priorCheckpoint.keys())
          if (!seen.has(id)) track(priorCheckpoint, id, null);
        stream.append(['end-check']);
        return;
      }
      const sceneAtCheck = scene.meshes.map((mesh) => read(mesh));
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
      if (stream) {
        if (!keep) overflow('unexpected discarded live writer frame');
        else {
          stream.append(['end', to]);
          frames++;
        }
      } else if (keep) trace.frames.push(frame);
      else {
        seq = 0;
        scalars = 0;
        last.clear();
        trace.seed = [];
        started = false;
        activeScalars = 0;
      }
      frame = null;
    },
    trailer() {
      stream?.append(['trailer', frames, seq, trace.gaps]);
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
