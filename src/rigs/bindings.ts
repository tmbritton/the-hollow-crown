import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Node } from '@babylonjs/core/node.js';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { Matrix } from '@babylonjs/core/Maths/math.vector.js';
import type { Components, Entity } from '../ecs.ts';
import type { JointName, JointPose, PoseBuffer, RigProfile, XYZ } from './types.ts';
import { PoseVector } from './types.ts';
import { humanoid } from './humanoid.ts';
import {
  compose,
  createPose,
  evaluatePose,
  inverse,
  multiplyAffine as multiply,
  resetLocal,
  setEuler,
  transformPoint,
} from './pose.ts';
import { copyLocal, matrixRotation, orthonormalize } from './ikMath.ts';
import { bodyOwner } from '../ragdoll.ts';
import type { Ragdoll, RagdollShape } from '../ragdoll.ts';
import { PoseHistory } from './history.ts';
import type { Spawn } from '../worldTypes.ts';
import type { Actor } from '../actors.ts';
import type { LocomotionPose } from '../locomotion.ts';
import type { NavigationWorld } from '../navigation.ts';
import type { CorpseContactQuery } from '../corpseTerrain.ts';
import { GroundedLocomotion } from './grounding.ts';
import { ActionRig, SHIELD_GRIP, SPEAR_GRIPS } from './actions.ts';
import type { ActionFrame } from './actions.ts';
import { FrameAttachment } from './attachments.ts';
import { TailRig, withTail } from './tail.ts';
import {
  TailClearance,
  clearanceBox,
  setClearanceBox,
  RIG_SURFACE_LIMIT,
} from './tailClearance.ts';
import type { RigSurface } from './tailClearance.ts';
import { cpuTiming, cpuTrace } from '../cpuMetrics.ts';
import { actorGeometry } from '../actorGeometry.ts';

export interface RigBinding {
  readonly pose: PoseBuffer;
  readonly history: PoseHistory;
  heading: number;
  cape: number;
  readonly grounding: GroundedLocomotion;
  readonly actions: ActionRig;
  readonly tail?: TailRig;
  readonly tailClearance?: TailClearance;
  readonly surfaces: readonly RigSurface[];
  readonly bodySurfaces: readonly RigSurface[];
  readonly tailSurfaces: readonly RigSurface[];
  certifiedGeometry(): ReturnType<typeof actorGeometry>;
  settledPoseRevision(owner: Ragdoll): number | undefined;
  /** Transient solver data; inspection must read the detached snapshot getters instead. */
  clearanceSurfaces(tailOnly?: boolean): readonly RigSurface[];
  sampleSurfaces(
    tailOnly?: boolean,
    cargo?: readonly AbstractMesh[],
    cargoRevision?: number,
  ): boolean;
  attach(node: TransformNode, frame: ActionFrame, offset?: XYZ, visible?: () => boolean): void;
  readonly attachments: readonly {
    name: string;
    space: 'attachment-local';
    primaryGrip: XYZ;
    secondaryGrip?: XYZ;
  }[];
  begin(dt: number): void;
  invalidateHistory(): void;
  reset(position?: Spawn, heading?: number): void;
  applyGrounded(
    actor: Actor,
    motion: LocomotionPose,
    world?: NavigationWorld,
    corpses?: CorpseContactQuery,
  ): void;
  apply(deferTail?: boolean): void;
  applyTail(): void;
  applyPhysics(ragdoll: Ragdoll): void;
  physicsShapes(): RagdollShape[];
  /** One actual anatomical surface per physical chunk, populated at handoff. */
  readonly bodyMeshes: readonly AbstractMesh[];
}
const bindings = new WeakMap<Components['rig'], RigBinding>();
export function rigBinding(rig: Components['rig']): RigBinding {
  const binding = bindings.get(rig);
  if (!binding) throw new Error('Humanoid rig must be bound before animation');
  return binding;
}

/** Retain every original mesh, material, parent, shadow and pick registration. Logical head/hands
 * live in the pose buffer; bindings need no additional scene nodes or per-frame hierarchy walks. */
export function bindHumanoid(
  entity: Entity,
  profile: RigProfile,
  headMeshes: readonly TransformNode[] = [],
  pelvisMeshes: readonly TransformNode[] = [],
  tailJoinMeshes: readonly TransformNode[] = [],
): RigBinding {
  const rig = entity.require('rig');
  const authoredRender = entity.get('render');
  if (bindings.has(rig)) throw new Error('Humanoid rig already bound');
  if (rig.root.parent) throw new Error('Actor anchor must be a scene root');
  const definition = rig.tail ? withTail(humanoid(profile)) : humanoid(profile);
  const actions = new ActionRig(definition);
  const tail = definition.tail ? new TailRig(definition) : undefined;
  const tailClearance = tail ? new TailClearance() : undefined;
  const pose = createPose(definition);
  const history = new PoseHistory(pose);
  const grounding = new GroundedLocomotion(pose.definition, rig.footPlants);
  pose.local[0].position.copyFrom(rig.root.position);
  setEuler(pose.local[0], 0, rig.root.rotation.y, 0);
  evaluatePose(pose);
  const scratch: JointPose = {
    position: new PoseVector(),
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: new PoseVector().setAll(1),
  };
  const local = new Float64Array(16),
    inv = new Float64Array(16);
  interface Entry {
    node: TransformNode;
    joint: number;
    offset: Float64Array;
    world: Float64Array;
    inverse: Float64Array;
    parent: Entry | null;
    pivot: XYZ;
    physics: Matrix;
  }
  const entries: Entry[] = [],
    byNode = new Map<Node, Entry>();
  const composeNode = (node: TransformNode, out: Float64Array) => {
    scratch.position.copyFrom(node.position);
    scratch.scale.copyFrom(node.scaling);
    setEuler(scratch, node.rotation.x, node.rotation.y, node.rotation.z);
    compose(scratch, out);
    const pivot = node.getPivotPoint();
    out[12] += pivot.x - out[0] * pivot.x - out[4] * pivot.y - out[8] * pivot.z;
    out[13] += pivot.y - out[1] * pivot.x - out[5] * pivot.y - out[9] * pivot.z;
    out[14] += pivot.z - out[2] * pivot.x - out[6] * pivot.y - out[10] * pivot.z;
  };
  const add = (node: TransformNode, name: JointName | number) => {
    if (byNode.has(node)) throw new Error('Duplicate joint binding');
    const parent = node.parent ? byNode.get(node.parent) : null;
    if (node.parent && !parent) throw new Error(`Unbound parent for ${node.name}`);
    const pivot = node.getPivotPoint();
    const entry: Entry = {
      node,
      joint: typeof name === 'number' ? name : pose.definition.index[name],
      offset: new Float64Array(16),
      world: new Float64Array(16),
      inverse: new Float64Array(16),
      parent: parent ?? null,
      pivot: [pivot.x, pivot.y, pivot.z],
      physics: Matrix.Identity(),
    };
    composeNode(node, local);
    if (parent) multiply(parent.world, 0, local, 0, entry.world, 0);
    else entry.world.set(local);
    inverse(pose.world, entry.joint * 16, inv);
    multiply(inv, 0, entry.world, 0, entry.offset, 0);
    entries.push(entry);
    byNode.set(node, entry);
  };
  add(rig.root, 'root');
  add(rig.body, 'spine');
  if (rig.head) add(rig.head, 'head');
  for (const [i, side] of (['left', 'right'] as const).entries()) {
    add(rig.arms[i], `${side}UpperArm`);
    add(rig.forearms[i], `${side}Forearm`);
    add(rig.legs[i], `${side}Thigh`);
    add(rig.knees[i], `${side}Shin`);
    add(rig.feet[i], `${side}Foot`);
  }
  for (const mesh of headMeshes) add(mesh, 'head');
  for (const mesh of pelvisMeshes) add(mesh, 'pelvis');
  if (rig.tail && definition.tail) {
    if (rig.tail.length !== definition.tail.length) throw new Error('Incomplete tail binding');
    rig.tail.forEach((node, i) => add(node, definition.tail![i].index));
  }
  const writeMatrix = (entry: Entry, trackChange: boolean) => {
    const m = local,
      p = entry.pivot,
      node = entry.node;
    const sx = Math.hypot(m[0], m[1], m[2]),
      sy = Math.hypot(m[4], m[5], m[6]),
      sz = Math.hypot(m[8], m[9], m[10]);
    if (Math.min(sx, sy, sz) < 1e-9 || !Number.isFinite(sx + sy + sz))
      throw new Error('Invalid binding scale');
    let pitch: number, yaw: number, roll: number;
    if (
      (pose.definition.joints[entry.joint].name.endsWith('Shin') ||
        pose.definition.joints[entry.joint].name.endsWith('Forearm')) &&
      Math.max(Math.abs(m[1]), Math.abs(m[2]), Math.abs(m[4]), Math.abs(m[8])) < 1e-9
    ) {
      // The logical hinge has a full signed X range. Canonical Y-X-Z decomposition would turn
      // a folded knee into an equivalent small X plus π yaw/roll, obscuring its actual bend.
      pitch = Math.atan2(m[6] / sy, m[5] / sy);
      yaw = roll = 0;
    } else {
      pitch = Math.asin(Math.max(-1, Math.min(1, -m[9] / sz)));
      yaw =
        Math.abs(Math.cos(pitch)) > 1e-7
          ? Math.atan2(m[8] / sz, m[10] / sz)
          : Math.atan2(-m[2] / sx, m[0] / sx);
      roll = Math.abs(Math.cos(pitch)) > 1e-7 ? Math.atan2(m[1] / sx, m[5] / sy) : 0;
    }
    const x = m[12] - p[0] + m[0] * p[0] + m[4] * p[1] + m[8] * p[2],
      y = m[13] - p[1] + m[1] * p[0] + m[5] * p[1] + m[9] * p[2],
      z = m[14] - p[2] + m[2] * p[0] + m[6] * p[1] + m[10] * p[2];
    const changed =
      trackChange &&
      (!node.position.equalsToFloats(x, y, z) ||
        !node.rotation.equalsToFloats(pitch, yaw, roll) ||
        !node.scaling.equalsToFloats(sx, sy, sz));
    node.rotation.set(pitch, yaw, roll);
    node.scaling.set(sx, sy, sz);
    node.position.set(x, y, z);
    return changed;
  };
  let stepDuration = 0;
  const attached: { binding: FrameAttachment; frame: ActionFrame; visible?: () => boolean }[] = [];
  let physicsAttachments:
    | { joint: number; offset: Float64Array; frame: Float64Array; matrix: Matrix }[]
    | null = null;
  const tailEntries = entries.filter((e) => definition.tail?.some((s) => s.index === e.joint));
  let bodySnapshot: readonly RigSurface[] | undefined,
    tailSnapshot: readonly RigSurface[] | undefined;
  let combined: readonly RigSurface[] | undefined;
  const bodyMeshes: AbstractMesh[] = [];
  const surfaceSources: {
    mesh: AbstractMesh;
    matrix: Float64Array;
    local: Float64Array;
    world: Float64Array;
    center: XYZ;
    size: XYZ;
    surface: RigSurface & { enabled: boolean };
    dynamic: boolean;
  }[] = [];
  const bodies: RigSurface[] = [],
    tails: RigSurface[] = [];
  let hasPublished = false;
  const bodySources: typeof surfaceSources = [],
    tailSources: typeof surfaceSources = [];
  const authoredSurfaces = new Map<AbstractMesh, RigSurface>();
  const registerSurface = (
    mesh: AbstractMesh,
    matrix: Float64Array,
    local: Float64Array,
    rootJoin = false,
    tail = false,
  ) => {
    if (surfaceSources.length >= RIG_SURFACE_LIMIT) throw new Error('Rig surface budget exceeded');
    const b = mesh.getBoundingInfo().boundingBox;
    const surface = {
      name: mesh.name,
      bounds: clearanceBox(true),
      rootJoin,
      tail,
      enabled: false,
    };
    const source = {
      mesh,
      matrix,
      local,
      world: new Float64Array(16),
      surface,
      center: [
        (b.minimum.x + b.maximum.x) / 2,
        (b.minimum.y + b.maximum.y) / 2,
        (b.minimum.z + b.maximum.z) / 2,
      ] as XYZ,
      size: [
        b.maximum.x - b.minimum.x,
        b.maximum.y - b.minimum.y,
        b.maximum.z - b.minimum.z,
      ] as XYZ,
      dynamic: mesh === rig.cape,
    };
    surfaceSources.push(source);
    authoredSurfaces.set(mesh, surface);
    (tail ? tailSources : bodySources).push(source);
    if (!hasPublished) (tail ? tails : bodies).push(surface);
  };
  for (const mesh of authoredRender?.meshes ?? []) {
    if (rig.equipment?.includes(mesh) || rig.stowedEquipment?.includes(mesh)) continue;
    const own = byNode.get(mesh),
      parent = mesh.parent ? byNode.get(mesh.parent) : undefined;
    const entry = own ?? parent;
    if (!entry) continue;
    const local = new Float64Array(16);
    if (own) {
      local[0] = local[5] = local[10] = local[15] = 1;
    } else composeNode(mesh, local);
    registerSurface(
      mesh,
      entry.world,
      local,
      tailJoinMeshes.includes(mesh),
      tailEntries.includes(entry),
    );
  }
  const snapshot = (surfaces: readonly RigSurface[]) =>
    surfaces.map((s) => ({
      ...s,
      bounds: { ...s.bounds, corners: s.bounds.corners!.slice() },
    }));
  const cargoPieces = new WeakMap<AbstractMesh, RigSurface>();
  const visible = (mesh: AbstractMesh) =>
    !mesh.isDisposed() && mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0;
  const drawnPiece = (mesh: AbstractMesh, piece: RigSurface) => {
    const sync = (node: Node): void => {
      if (node.parent) sync(node.parent);
      node.computeWorldMatrix(true);
    };
    sync(mesh);
    const { minimum: a, maximum: b } = mesh.getBoundingInfo().boundingBox;
    setClearanceBox(
      piece.bounds,
      mesh.getWorldMatrix().m,
      0,
      [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2],
      [b.x - a.x, b.y - a.y, b.z - a.z],
    );
    if (import.meta.env?.DEV) cpuTrace?.count('rig.surfaceBoxes');
  };
  const tailNodes = new Set<Node>(tailEntries.map((entry) => entry.node));
  const attachmentNodes = new Set<Node>();
  let checkedGeometry: ReturnType<typeof actorGeometry>;
  let checkedRevision: number;
  let closedPaths = false;
  const hasClosedPaths = (
    geometry: NonNullable<ReturnType<typeof actorGeometry>>,
    meshes: readonly AbstractMesh[],
  ) => {
    for (const mesh of meshes) {
      if (mesh.isDisposed()) continue;
      let node: Node | null = mesh;
      for (; node && node !== rig.root; node = node.parent)
        if (
          !byNode.has(node) &&
          !attachmentNodes.has(node) &&
          !(node instanceof AbstractMesh && geometry.includes(node))
        )
          return false;
      if (node !== rig.root) return false;
    }
    return true;
  };
  const liveBody: AbstractMesh[] = [],
    liveTail: AbstractMesh[] = [],
    drawnCargo: AbstractMesh[] = [],
    publishedCargo: RigSurface[] = [];
  let selectedGeometry: ReturnType<typeof actorGeometry>;
  let selectedRevision: number;
  let selectedBodyRevision: number;
  let selectedEnabled: boolean;
  const retireBodySample = () => {
    sampledRevision = -1;
    sampledGeometry = undefined;
  };
  const clearSelection = () => {
    selectedGeometry = undefined;
    liveBody.length = liveTail.length = drawnCargo.length = 0;
  };
  const overflow = (): never => {
    clearSelection();
    retireBodySample();
    throw new Error('Rig surface budget exceeded');
  };
  const selectLive = (meshes: readonly AbstractMesh[] | undefined, cargoSlots: number) => {
    clearSelection();
    let slots = cargoSlots;
    for (const mesh of meshes ?? []) {
      if (import.meta.env?.DEV) cpuTrace?.count('rig.surfaceChecks');
      if (!visible(mesh)) continue;
      if (++slots > RIG_SURFACE_LIMIT) overflow();
      let partition = liveBody;
      for (let node: Node | null = mesh; node && node !== rig.root; node = node.parent) {
        if (tailNodes.has(node)) {
          partition = liveTail;
          break;
        }
      }
      partition.push(mesh);
    }
  };
  const publish = (tailOnly: boolean, geometry: ReturnType<typeof actorGeometry>) => {
    const output = tailOnly ? tails : bodies;
    if (!geometry || geometry.edited) {
      // Authored offsets cannot describe a modified or unowned layout. Read the current
      // drawn hierarchy even when the current membership is empty.
      output.length = 0;
      for (const mesh of tailOnly ? liveTail : liveBody) {
        const piece = {
          name: mesh.name,
          bounds: clearanceBox(true),
          rootJoin: authoredSurfaces.get(mesh)?.rootJoin ?? false,
          tail: tailOnly,
          enabled: true,
        };
        drawnPiece(mesh, piece);
        output.push(piece);
      }
    } else {
      const sources = tailOnly ? tailSources : bodySources;
      output.length = sources.length;
      for (const [i, s] of sources.entries()) {
        output[i] = s.surface;
        if (import.meta.env?.DEV) cpuTrace?.count('rig.surfaceChecks');
        s.surface.enabled = geometry.includes(s.mesh) && visible(s.mesh);
        if (s.surface.enabled) {
          const b = s.mesh.getBoundingInfo().boundingBox;
          const cx = (b.minimum.x + b.maximum.x) / 2,
            cy = (b.minimum.y + b.maximum.y) / 2,
            cz = (b.minimum.z + b.maximum.z) / 2;
          const sx = b.maximum.x - b.minimum.x,
            sy = b.maximum.y - b.minimum.y,
            sz = b.maximum.z - b.minimum.z;
          if (s.dynamic) composeNode(s.mesh, s.local);
          multiply(s.matrix, 0, s.local, 0, s.world, 0);
          setClearanceBox(s.surface.bounds, s.world, 0, [cx, cy, cz], [sx, sy, sz]);
          if (import.meta.env?.DEV) cpuTrace?.count('rig.surfaceBoxes');
        }
      }
    }
    if (!tailOnly) {
      for (const piece of publishedCargo) bodies.push(piece);
      bodySnapshot = undefined;
    } else tailSnapshot = undefined;
    combined = undefined;
    if (import.meta.env?.DEV)
      cpuTrace?.count(tailOnly ? 'rig.tailPublications' : 'rig.bodyPublications');
  };
  const publishCargo = () => {
    publishedCargo.length = 0;
    for (const mesh of drawnCargo) {
      let piece = cargoPieces.get(mesh);
      if (!piece) {
        piece = {
          name: mesh.name,
          bounds: clearanceBox(true),
          rootJoin: false,
          tail: false,
          enabled: true,
        };
        cargoPieces.set(mesh, piece);
      }
      drawnPiece(mesh, piece);
      publishedCargo.push(piece);
    }
  };
  const finishHistory = () => {
    history.publish(stepDuration);
    stepDuration = 0;
  };
  let finalOwner: Ragdoll | undefined;
  let restDuration = 0;
  let physicalRevision = 0;
  let bodyRevision = 0;
  let sampledRevision = -1;
  let sampledGeometry: ReturnType<typeof actorGeometry>;
  let sampledGeometryRevision: number | undefined;
  let sampledMembership: readonly AbstractMesh[] | undefined;
  let sampledEnabled = false;
  let sampledCargo: readonly AbstractMesh[] | undefined;
  let sampledCargoRevision: number | undefined;
  const bodyEntries = entries.filter((entry) => !tailEntries.includes(entry));
  const bodyWorld = new Float64Array(16);
  const different = (a: Float64Array, b: Float64Array) => a.some((value, i) => value !== b[i]);
  // Edited-layout publications read actual node transforms, not the authored frames.
  // An edit can be sampled before a writer restores its node to the same logical pose.
  const sampledDraw = () => sampledRevision === bodyRevision && sampledGeometry?.edited === true;
  const sampledFrames = () => sampledRevision === bodyRevision && !sampledGeometry?.edited;
  const enablePart = (node: TransformNode, enabled: boolean) => {
    if (node.isEnabled(false) !== enabled) bodyRevision++;
    node.setEnabled(enabled);
  };
  const applyEntry = (entry: Entry, body = false) => {
    multiply(pose.world, entry.joint * 16, entry.offset, 0, body ? bodyWorld : entry.world, 0);
    if (body) {
      if (sampledFrames() && different(entry.world, bodyWorld)) bodyRevision++;
      entry.world.set(bodyWorld);
    }
    inverse(entry.world, 0, entry.inverse);
    if (entry.parent) multiply(entry.parent.inverse, 0, entry.world, 0, local, 0);
    else local.set(entry.world);
    if (writeMatrix(entry, body && sampledDraw())) bodyRevision++;
  };
  const writeDraw = (deferTail: boolean) => {
    for (const entry of bodyEntries) applyEntry(entry, true);
    if (!deferTail) for (const entry of tailEntries) applyEntry(entry);
    if (rig.cape) {
      if (rig.cape.rotation.x !== binding.cape) bodyRevision++;
      rig.cape.rotation.x = binding.cape;
    }
    for (const mesh of rig.equipment ?? []) enablePart(mesh, !actions.stowed);
    for (const mesh of rig.stowedEquipment ?? []) enablePart(mesh, actions.stowed);
    if (rig.spear) enablePart(rig.spear, !actions.stowed && actions.mode !== 'throw');
    if (rig.javelin)
      enablePart(rig.javelin, !actions.stowed && actions.mode === 'throw' && !actions.released);
    for (const a of attached) {
      if (a.visible) enablePart(a.binding.node, a.visible());
      const frames = sampledFrames();
      if (frames) bodyWorld.set(a.binding.world);
      const changed = a.binding.apply(actions.frames[a.frame], entries[0].inverse, sampledDraw());
      if (changed || (frames && different(a.binding.world, bodyWorld))) bodyRevision++;
    }
  };
  const completeBody = (solved?: PoseBuffer) => {
    if (solved) {
      if (solved.definition !== pose.definition) throw new Error('Incompatible grounded pose');
      const started = import.meta.env?.DEV && cpuTiming ? cpuTiming.clock() : 0;
      // Synchronous transfer from this binding's own solver, with no intervening local edits.
      // The root is part of the transfer (not rebased); history and tail writes stay binding-owned.
      copyLocal(solved.local, pose.local);
      pose.matrices.set(solved.matrices);
      pose.world.set(solved.world);
      if (import.meta.env?.DEV) cpuTiming?.finish('binding.transfer', started);
    } else {
      evaluatePose(pose);
    }
    const started = import.meta.env?.DEV && solved && cpuTiming ? cpuTiming.clock() : 0;
    actions.finish(pose);
    if (import.meta.env?.DEV && solved) cpuTiming?.finish('binding.completion', started);
  };
  const publishBody = (deferTail: boolean, solved?: PoseBuffer) => {
    if (rig.root.isDisposed()) throw new Error('Cannot apply a retired rig');
    if (entity.has('ragdoll')) {
      binding.applyPhysics(entity.require('ragdoll'));
      return;
    }
    completeBody(solved);
    const started = import.meta.env?.DEV && solved && cpuTiming ? cpuTiming.clock() : 0;
    writeDraw(deferTail);
    if (import.meta.env?.DEV && solved) cpuTiming?.finish('binding.draw', started);
    if (!deferTail) finishHistory();
  };
  const binding: RigBinding = {
    pose,
    history,
    heading: rig.root.rotation.y,
    cape: -0.16,
    grounding,
    actions,
    tail,
    tailClearance,
    bodyMeshes,
    get surfaces() {
      return (combined ??= tails.length
        ? [...binding.bodySurfaces, ...binding.tailSurfaces]
        : binding.bodySurfaces);
    },
    get bodySurfaces() {
      return (bodySnapshot ??= snapshot(bodies));
    },
    get tailSurfaces() {
      return (tailSnapshot ??= snapshot(tails));
    },
    clearanceSurfaces(tailOnly = false) {
      return tailOnly ? tails : bodies;
    },
    certifiedGeometry() {
      const render = entity.get('render');
      const geometry = actorGeometry(render);
      // No writer covers an ancestor above the actor, including for frozen physics poses.
      if (
        !render ||
        render.root !== rig.root ||
        rig.root.parent ||
        !geometry?.ownsLayout(authoredRender)
      )
        return undefined;
      if (checkedGeometry !== geometry || checkedRevision !== geometry.revision) {
        // Include hidden meshes and the entire tail partition: an unowned path can change
        // either effective visibility or which partition a mesh belongs to without an edit.
        closedPaths = hasClosedPaths(geometry, render.meshes);
        checkedGeometry = geometry;
        checkedRevision = geometry.revision;
      }
      return closedPaths ? geometry : undefined;
    },
    settledPoseRevision(owner) {
      return owner.settled && finalOwner === owner ? physicalRevision : undefined;
    },
    sampleSurfaces(tailOnly = false, cargo, cargoRevision) {
      const render = entity.get('render');
      const geometry = binding.certifiedGeometry();
      const enabled = rig.root.isEnabled();
      const certifiable = geometry && (!cargo || cargoRevision !== undefined);
      if (
        !tailOnly &&
        certifiable &&
        sampledRevision === bodyRevision &&
        sampledGeometry === geometry &&
        sampledGeometryRevision === geometry.revision &&
        sampledMembership === render?.meshes &&
        sampledEnabled === enabled &&
        sampledCargo === cargo &&
        sampledCargoRevision === cargoRevision
      )
        return false;

      // Select both partitions before mutating even one box. Tail demand can reuse a
      // certified rig selection but keeps the cargo from the last body publication.
      const retainedCargoSlots = tailOnly ? publishedCargo.length : 0;
      const live = !geometry || geometry.edited;
      if (!live) clearSelection();
      else if (
        !tailOnly ||
        !geometry ||
        selectedGeometry !== geometry ||
        selectedRevision !== geometry.revision ||
        selectedBodyRevision !== bodyRevision ||
        selectedEnabled !== enabled
      )
        selectLive(render?.meshes, retainedCargoSlots);

      const bodySlots = live ? liveBody.length : bodySources.length;
      const tailSlots = live ? liveTail.length : tailSources.length;
      let slots = bodySlots + tailSlots + retainedCargoSlots;
      if (slots > RIG_SURFACE_LIMIT) overflow();
      if (!tailOnly && cargo) {
        for (const mesh of cargo) {
          if (!visible(mesh)) continue;
          if (++slots > RIG_SURFACE_LIMIT) overflow();
          drawnCargo.push(mesh);
        }
      }

      // The other buffer may predate a repartition. Refresh it only if keeping it
      // would exceed the validated budget; tail solving otherwise owns tail writes.
      if (tailOnly) {
        if (bodies.length + tailSlots > RIG_SURFACE_LIMIT) {
          retireBodySample();
          publish(false, geometry);
        }
      } else {
        retireBodySample();
        if (slots - tailSlots + tails.length > RIG_SURFACE_LIMIT) publish(true, geometry);
        publishCargo();
      }
      publish(tailOnly, geometry);
      hasPublished = true;
      drawnCargo.length = 0;
      if (geometry?.edited) {
        selectedGeometry = geometry;
        selectedRevision = geometry.revision;
        selectedBodyRevision = bodyRevision;
        selectedEnabled = enabled;
      } else clearSelection();
      if (!tailOnly && certifiable) {
        sampledRevision = bodyRevision;
        sampledGeometry = geometry;
        sampledGeometryRevision = geometry.revision;
        sampledMembership = render?.meshes;
        sampledEnabled = enabled;
        sampledCargo = cargo;
        sampledCargoRevision = cargoRevision;
      }
      return true;
    },
    attach(node, frame, offset, visible) {
      if (node.parent !== rig.root)
        throw new Error('Attachment must be parented to its actor root');
      if (attached.some((a) => a.binding.node === node))
        throw new Error('Duplicate attachment writer');
      const attachment = new FrameAttachment(node, offset);
      attached.push({ binding: attachment, frame, visible });
      attachmentNodes.add(node);
      checkedGeometry = undefined;
      bodyRevision++;
      if (visible) node.setEnabled(visible());
      // Capture geometry-to-frame offsets once. Runtime snapshots use numerical matrices only.
      node.computeWorldMatrix(true);
      const parent = new Float64Array(node.getWorldMatrix().m),
        inverseParent = new Float64Array(16);
      inverse(parent, 0, inverseParent);
      for (const mesh of [
        ...(node instanceof AbstractMesh ? [node] : []),
        ...node.getChildMeshes(),
      ]) {
        mesh.computeWorldMatrix(true);
        const local = new Float64Array(16);
        multiply(inverseParent, 0, new Float64Array(mesh.getWorldMatrix().m), 0, local, 0);
        registerSurface(mesh, attachment.world, local);
      }
    },
    attachments: [
      ...(rig.shield
        ? [
            {
              name: 'shield',
              space: 'attachment-local' as const,
              primaryGrip: SHIELD_GRIP,
            },
          ]
        : []),
      ...(rig.spear
        ? [
            {
              name: 'spear',
              space: 'attachment-local' as const,
              primaryGrip: SPEAR_GRIPS[1],
              secondaryGrip: SPEAR_GRIPS[0],
            },
          ]
        : []),
      ...(rig.javelin
        ? [{ name: 'javelin', space: 'attachment-local' as const, primaryGrip: [0, 0, 0] as XYZ }]
        : []),
    ],
    begin(dt) {
      stepDuration = dt;
    },
    invalidateHistory() {
      finalOwner = undefined;
      bodyRevision++;
      restDuration = 0;
      entity.get('blockFeedback')?.reset();
      grounding.reset();
      actions.reset();
      tail?.reset();
      history.invalidate();
      stepDuration = 0;
    },
    reset(position, heading = binding.heading) {
      entity.get('ragdoll')?.dispose();
      entity.remove('ragdoll');
      if (physicsAttachments) {
        for (const e of entries) e.node.unfreezeWorldMatrix();
        for (const a of attached) a.binding.node.unfreezeWorldMatrix();
      }
      physicsAttachments = null;
      bodyMeshes.length = 0;
      entity.remove('deathHandoff');
      const root = pose.local[0];
      const x = position?.x ?? root.position.x,
        y = position?.h ?? root.position.y,
        z = position?.z ?? root.position.z;
      binding.invalidateHistory();
      resetLocal(pose);
      root.position.set(x, y, z);
      setEuler(root, 0, heading, 0);
      binding.heading = heading;
      binding.cape = -0.16;
      tail?.apply(pose);
      binding.apply();
    },
    applyGrounded(actor, motion, world, corpses) {
      const started = import.meta.env?.DEV && cpuTiming ? cpuTiming.clock() : 0;
      const solved = grounding.sample(actor, motion, binding.heading, world, corpses, actions);
      if (import.meta.env?.DEV) cpuTiming?.finish('grounding', started);
      publishBody(!!tail, solved.pose);
    },
    apply(deferTail = false) {
      publishBody(deferTail);
    },
    applyTail() {
      if (entity.has('ragdoll')) return;
      for (const entry of tailEntries) applyEntry(entry);
      finishHistory();
    },
    applyPhysics(ragdoll) {
      if (rig.root.isDisposed()) throw new Error('Cannot apply a retired rig');
      if (ragdoll.settled && finalOwner === ragdoll) {
        // The next positive step must move previous/current to the same pose; a
        // render-only zero step must not erase velocity from the last physical tick.
        if (stepDuration !== 0 && stepDuration !== restDuration) {
          const duration = stepDuration;
          finishHistory();
          restDuration = duration;
        } else stepDuration = 0;
        return;
      }
      const world = ragdoll.world;
      bodyRevision++;
      physicalRevision++;
      if (!physicsAttachments) {
        grounding.reset();
        entity.get('blockFeedback')?.reset();
        physicsAttachments = attached.map((a) => {
          const joint =
            definition.index[
              a.frame === 'shield' ? 'leftHand' : a.frame === 'back' ? 'chest' : 'rightHand'
            ];
          inverse(pose.world, joint * 16, inv);
          const offset = new Float64Array(16);
          multiply(inv, 0, actions.frames[a.frame], 0, offset, 0);
          return { joint, offset, frame: new Float64Array(16), matrix: Matrix.Identity() };
        });
      }
      pose.world.set(world);
      for (const entry of entries) {
        applyEntry(entry);
        // Independent rigid rotations under a nonuniformly scaled animated parent would require
        // local shear. Publish the exact world affine matrix instead of lossy TRS decomposition.
        Matrix.FromArrayToRef(entry.world, 0, entry.physics);
        entry.node.freezeWorldMatrix(entry.physics);
      }
      for (let i = 0; i < attached.length; i++) {
        const a = physicsAttachments[i];
        multiply(world, a.joint * 16, a.offset, 0, a.frame, 0);
        attached[i].binding.apply(a.frame, entries[0].inverse, false);
        Matrix.FromArrayToRef(attached[i].binding.world, 0, a.matrix);
        attached[i].binding.node.freezeWorldMatrix(a.matrix);
      }
      finishHistory();
      // Freeze can happen before the island's turn (cap eviction) or inside advance.
      // Only mark the owner after publishing every final affine matrix and history.
      finalOwner = ragdoll.settled ? ragdoll : undefined;
      restDuration = 0;
    },
    physicsShapes() {
      // One coarse box per anatomical body, plus one per held/stowed attachment. Decorative
      // voxels contribute bounds, never individual physics bodies. Capture once at ownership transfer.
      const snapshot = history.snapshot();
      const bodyFrames = snapshot.bodies.map((b) => {
        scratch.position.set(...b.position);
        Object.assign(scratch.rotation, {
          x: b.rotation[0],
          y: b.rotation[1],
          z: b.rotation[2],
          w: b.rotation[3],
        });
        scratch.scale.setAll(1);
        const frame = new Float64Array(16);
        compose(scratch, frame);
        return frame;
      });
      const groups = new Map<
        string,
        { body: number; frame: Float64Array; min: number[]; max: number[] }
      >();
      const representatives = new Map<number, { mesh: AbstractMesh; volume: number }>();
      for (const s of surfaceSources) {
        if (!s.mesh.isEnabled() || !s.mesh.isVisible) continue;
        const entry = entries.find((e) => e.world === s.matrix);
        const attachment = attached.findIndex((a) => a.binding.world === s.matrix);
        const frameName = attachment >= 0 ? attached[attachment].frame : null;
        const joint =
          entry?.joint ??
          definition.index[
            frameName === 'shield' ? 'leftHand' : frameName === 'back' ? 'chest' : 'rightHand'
          ];
        const body = bodyOwner(snapshot, joint);
        if (attachment < 0) {
          const volume = s.size[0] * s.size[1] * s.size[2];
          if (volume > (representatives.get(body)?.volume ?? 0))
            representatives.set(body, { mesh: s.mesh, volume });
        }
        const key = attachment >= 0 ? `attachment:${attachment}` : `body:${body}`;
        let group = groups.get(key);
        if (!group) {
          const frame = new Float64Array(attachment >= 0 ? s.matrix : bodyFrames[body]);
          orthonormalize(frame);
          group = {
            body,
            frame,
            min: [Infinity, Infinity, Infinity],
            max: [-Infinity, -Infinity, -Infinity],
          };
          groups.set(key, group);
        }
        inverse(group.frame, 0, inv);
        multiply(s.matrix, 0, s.local, 0, s.world, 0);
        multiply(inv, 0, s.world, 0, local, 0);
        for (let corner = 0; corner < 8; corner++) {
          const p = transformPoint(local, 0, [
            s.center[0] + ((corner & 4 ? 1 : -1) * s.size[0]) / 2,
            s.center[1] + ((corner & 2 ? 1 : -1) * s.size[1]) / 2,
            s.center[2] + ((corner & 1 ? 1 : -1) * s.size[2]) / 2,
          ]);
          for (let i = 0; i < 3; i++) {
            group.min[i] = Math.min(group.min[i], p[i]);
            group.max[i] = Math.max(group.max[i], p[i]);
          }
        }
      }
      bodyMeshes.length = 0;
      bodyMeshes.push(...[...representatives.values()].map((r) => r.mesh));
      return [...groups.values()].map((g) => {
        inverse(bodyFrames[g.body], 0, inv);
        multiply(inv, 0, g.frame, 0, local, 0);
        const center = transformPoint(local, 0, [
          (g.min[0] + g.max[0]) / 2,
          (g.min[1] + g.max[1]) / 2,
          (g.min[2] + g.max[2]) / 2,
        ]);
        matrixRotation(local, scratch.rotation);
        const q = scratch.rotation;
        return {
          body: g.body,
          center,
          size: [
            Math.max(0.02, g.max[0] - g.min[0]),
            Math.max(0.02, g.max[1] - g.min[1]),
            Math.max(0.02, g.max[2] - g.min[2]),
          ],
          rotation: [q.x, q.y, q.z, q.w],
        };
      });
    },
  };
  bindings.set(rig, binding);
  entity.add('rigPose', binding);
  for (const key of ['weapon', 'shield', 'spear', 'javelin'] as const)
    if (rig[key]) binding.attach(rig[key], key);
  if (rig.stowed) binding.attach(rig.stowed, 'back');
  binding.reset();
  rig.root.onDisposeObservable.addOnce(() => {
    entity.get('ragdoll')?.dispose();
    entity.remove('ragdoll');
    binding.invalidateHistory();
    bodyMeshes.length = 0;
    history.retire();
    entity.remove('deathHandoff');
    entity.remove('rigPose');
    bindings.delete(rig);
  });
  return binding;
}
