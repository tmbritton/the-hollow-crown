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
import { matrixRotation, orthonormalize } from './ikMath.ts';
import { bodyOwner } from '../ragdoll.ts';
import type { RagdollShape } from '../ragdoll.ts';
import { PoseHistory } from './history.ts';
import type { Spawn } from '../worldTypes.ts';
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
  readonly tailSurfaces: readonly RigSurface[];
  sampleSurfaces(tailOnly?: boolean): void;
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
  apply(deferTail?: boolean): void;
  applyTail(): void;
  applyPhysics(world: Float64Array): void;
  physicsShapes(): RagdollShape[];
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
  const writeMatrix = (entry: Entry) => {
    const m = local,
      p = entry.pivot,
      node = entry.node;
    const sx = Math.hypot(m[0], m[1], m[2]),
      sy = Math.hypot(m[4], m[5], m[6]),
      sz = Math.hypot(m[8], m[9], m[10]);
    if (Math.min(sx, sy, sz) < 1e-9 || !Number.isFinite(sx + sy + sz))
      throw new Error('Invalid binding scale');
    if (
      (pose.definition.joints[entry.joint].name.endsWith('Shin') ||
        pose.definition.joints[entry.joint].name.endsWith('Forearm')) &&
      Math.max(Math.abs(m[1]), Math.abs(m[2]), Math.abs(m[4]), Math.abs(m[8])) < 1e-9
    ) {
      // The logical hinge has a full signed X range. Canonical Y-X-Z decomposition would turn
      // a folded knee into an equivalent small X plus π yaw/roll, obscuring its actual bend.
      node.rotation.set(Math.atan2(m[6] / sy, m[5] / sy), 0, 0);
    } else {
      const pitch = Math.asin(Math.max(-1, Math.min(1, -m[9] / sz)));
      const yaw =
        Math.abs(Math.cos(pitch)) > 1e-7
          ? Math.atan2(m[8] / sz, m[10] / sz)
          : Math.atan2(-m[2] / sx, m[0] / sx);
      const roll = Math.abs(Math.cos(pitch)) > 1e-7 ? Math.atan2(m[1] / sx, m[5] / sy) : 0;
      node.rotation.set(pitch, yaw, roll);
    }
    node.scaling.set(sx, sy, sz);
    node.position.set(
      m[12] - p[0] + m[0] * p[0] + m[4] * p[1] + m[8] * p[2],
      m[13] - p[1] + m[1] * p[0] + m[5] * p[1] + m[9] * p[2],
      m[14] - p[2] + m[2] * p[0] + m[6] * p[1] + m[10] * p[2],
    );
  };
  let stepDuration = 0;
  const attached: { binding: FrameAttachment; frame: ActionFrame; visible?: () => boolean }[] = [];
  let physicsAttachments:
    | { joint: number; offset: Float64Array; frame: Float64Array; matrix: Matrix }[]
    | null = null;
  const tailEntries = entries.filter((e) => definition.tail?.some((s) => s.index === e.joint));
  const surfaces: RigSurface[] = [];
  const surfaceSources: {
    mesh: AbstractMesh;
    matrix: Float64Array;
    local: Float64Array;
    world: Float64Array;
    center: XYZ;
    size: XYZ;
    surface: RigSurface;
    dynamic: boolean;
  }[] = [];
  const registerSurface = (
    mesh: AbstractMesh,
    matrix: Float64Array,
    local: Float64Array,
    rootJoin = false,
    tail = false,
  ) => {
    if (surfaces.length >= RIG_SURFACE_LIMIT) throw new Error('Rig surface budget exceeded');
    const b = mesh.getBoundingInfo().boundingBox;
    const surface: RigSurface = {
      name: mesh.name,
      bounds: clearanceBox(true),
      rootJoin,
      tail,
      enabled: false,
    };
    surfaces.push(surface);
    surfaceSources.push({
      mesh,
      matrix,
      local,
      world: new Float64Array(16),
      surface,
      center: [
        (b.minimum.x + b.maximum.x) / 2,
        (b.minimum.y + b.maximum.y) / 2,
        (b.minimum.z + b.maximum.z) / 2,
      ],
      size: [b.maximum.x - b.minimum.x, b.maximum.y - b.minimum.y, b.maximum.z - b.minimum.z],
      dynamic: mesh === rig.cape,
    });
  };
  for (const mesh of entity.get('render')?.meshes ?? []) {
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
  // Cargo is scene-root geometry, but its current solved frame belongs to this actor. Publish
  // its coffer/strap envelope alongside anatomy so other tails protect it too.
  const cargoSurface: RigSurface = {
    name: `${entity.id}:carried cargo`,
    bounds: clearanceBox(true),
    rootJoin: false,
    tail: false,
    enabled: false,
  };
  if (surfaces.length >= RIG_SURFACE_LIMIT) throw new Error('Rig surface budget exceeded');
  surfaces.push(cargoSurface);
  const finishHistory = () => {
    history.publish(stepDuration);
    stepDuration = 0;
  };
  const applyEntry = (entry: Entry) => {
    multiply(pose.world, entry.joint * 16, entry.offset, 0, entry.world, 0);
    inverse(entry.world, 0, entry.inverse);
    if (entry.parent) multiply(entry.parent.inverse, 0, entry.world, 0, local, 0);
    else local.set(entry.world);
    writeMatrix(entry);
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
    surfaces,
    tailSurfaces: surfaces.filter((s) => s.tail),
    sampleSurfaces(tailOnly = false) {
      for (const s of surfaceSources) {
        if (tailOnly && !s.surface.tail) continue;
        s.surface.enabled = s.mesh.isEnabled() && s.mesh.isVisible;
        if (!s.surface.enabled) continue;
        if (s.dynamic) composeNode(s.mesh, s.local);
        multiply(s.matrix, 0, s.local, 0, s.world, 0);
        setClearanceBox(s.surface.bounds, s.world, 0, s.center, s.size);
      }
      if (!tailOnly) {
        cargoSurface.enabled = actions.carrying && rig.root.isEnabled();
        if (cargoSurface.enabled)
          setClearanceBox(
            cargoSurface.bounds,
            actions.frames.cargo,
            0,
            [0, 0.26, 0],
            [0.66, 0.53, 0.53],
          );
      }
    },
    attach(node, frame, offset, visible) {
      if (node.parent !== rig.root)
        throw new Error('Attachment must be parented to its actor root');
      if (attached.some((a) => a.binding.node === node))
        throw new Error('Duplicate attachment writer');
      const attachment = new FrameAttachment(node, offset);
      attached.push({ binding: attachment, frame, visible });
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
    apply(deferTail = false) {
      if (rig.root.isDisposed()) throw new Error('Cannot apply a retired rig');
      if (entity.has('ragdoll')) {
        binding.applyPhysics(entity.require('ragdoll').world);
        return;
      }
      evaluatePose(pose);
      for (const entry of entries)
        if (!deferTail || !tailEntries.includes(entry)) applyEntry(entry);
      if (rig.cape) rig.cape.rotation.x = binding.cape;
      for (const mesh of rig.equipment ?? []) mesh.setEnabled(!actions.stowed);
      for (const mesh of rig.stowedEquipment ?? []) mesh.setEnabled(actions.stowed);
      rig.spear?.setEnabled(!actions.stowed && actions.mode !== 'throw');
      rig.javelin?.setEnabled(!actions.stowed && actions.mode === 'throw' && !actions.released);
      actions.finish(pose);
      for (const a of attached) {
        if (a.visible) a.binding.node.setEnabled(a.visible());
        a.binding.apply(actions.frames[a.frame], entries[0].inverse);
      }
      if (!deferTail) finishHistory();
    },
    applyTail() {
      if (entity.has('ragdoll')) return;
      for (const entry of tailEntries) applyEntry(entry);
      finishHistory();
    },
    applyPhysics(world) {
      if (rig.root.isDisposed()) throw new Error('Cannot apply a retired rig');
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
        attached[i].binding.apply(a.frame, entries[0].inverse);
        Matrix.FromArrayToRef(attached[i].binding.world, 0, a.matrix);
        attached[i].binding.node.freezeWorldMatrix(a.matrix);
      }
      finishHistory();
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
    history.retire();
    entity.remove('deathHandoff');
    entity.remove('rigPose');
    bindings.delete(rig);
  });
  return binding;
}
