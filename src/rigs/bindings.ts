import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Node } from '@babylonjs/core/node.js';
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
  resetHistory,
  setEuler,
} from './pose.ts';
import { LegacyNode, sampleLegacy } from './legacy.ts';
import type { LegacyRig } from './legacy.ts';
import { GroundedLocomotion } from './grounding.ts';
import { ActionRig, SHIELD_GRIP, SPEAR_GRIPS } from './actions.ts';
import type { ActionFrame } from './actions.ts';
import { FrameAttachment } from './attachments.ts';

export interface RigBinding {
  readonly pose: PoseBuffer;
  readonly legacy: LegacyRig;
  readonly grounding: GroundedLocomotion;
  readonly actions: ActionRig;
  attach(node: TransformNode, frame: ActionFrame, offset?: XYZ): void;
  readonly attachments: readonly {
    name: string;
    space: 'attachment-local';
    primaryGrip: XYZ;
    secondaryGrip?: XYZ;
  }[];
  begin(dt: number): void;
  invalidateHistory(): void;
  commit(reset?: boolean): void;
  /** Temporary A4 death handoff: capture the current binding output into legacy channels once. */
  captureLegacy(): void;
  apply(): void;
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
): RigBinding {
  const rig = entity.require('rig');
  if (bindings.has(rig)) throw new Error('Humanoid rig already bound');
  if (rig.root.parent) throw new Error('Actor anchor must be a scene root');
  const nodes = new Map<Node, LegacyNode>();
  const channels: { node: TransformNode; data: LegacyNode }[] = [];
  const numeric = (node: TransformNode): LegacyNode => {
    const existing = nodes.get(node);
    if (existing) return existing;
    const data = new LegacyNode();
    data.position.copyFrom(node.position);
    data.rotation.copyFrom(node.rotation);
    data.scaling.copyFrom(node.scaling);
    data.enabled = node.isEnabled(false);
    nodes.set(node, data);
    channels.push({ node, data });
    return data;
  };
  const optional = (node: TransformNode | undefined) => (node ? numeric(node) : undefined);
  const legacy: LegacyRig = {
    root: numeric(rig.root),
    body: numeric(rig.body),
    head: optional(rig.head),
    arms: rig.arms.map(numeric),
    forearms: rig.forearms.map(numeric),
    legs: rig.legs.map(numeric),
    knees: rig.knees.map(numeric),
    feet: rig.feet.map(numeric),
    cape: optional(rig.cape),
    shield: optional(rig.shield),
    spear: optional(rig.spear),
    javelin: optional(rig.javelin),
    equipment: rig.equipment?.map(numeric),
    stowedEquipment: rig.stowedEquipment?.map(numeric),
    footPlants: rig.footPlants,
    attackBlend: rig.attackBlend,
    attackPose: rig.attackPose,
    socialBlend: rig.socialBlend,
    socialPose: rig.socialPose,
  };
  for (const [node, data] of nodes)
    data.parent = node.parent ? (nodes.get(node.parent) ?? null) : null;
  const actions = new ActionRig(humanoid(profile));
  // Existing debug/tests read the old rig contract; these alias the action layer's owned state.
  const alias = <K extends 'attackBlend' | 'attackPose' | 'socialBlend' | 'socialPose'>(key: K) =>
    Object.defineProperty(rig, key, {
      enumerable: true,
      configurable: true,
      get: () => actions[key],
      set: (value: ActionRig[K]) => {
        actions[key] = value;
      },
    });
  for (const key of ['attackBlend', 'attackPose', 'socialBlend', 'socialPose'] as const) {
    alias(key);
    Object.defineProperty(legacy, key, {
      get: () => actions[key],
      set: (value: (typeof actions)[typeof key]) => {
        Object.assign(actions, { [key]: value });
      },
    });
  }
  const pose = createPose(humanoid(profile));
  const grounding = new GroundedLocomotion(pose.definition, rig.footPlants);
  sampleLegacy(legacy, pose);
  evaluatePose(pose);
  const scratch: JointPose = {
    position: new PoseVector(),
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: new PoseVector().setAll(1),
  };
  const local = new Float64Array(16),
    inv = new Float64Array(16),
    hintMatrix = new Float64Array(16);
  interface Entry {
    node: TransformNode;
    joint: number;
    offset: Float64Array;
    world: Float64Array;
    inverse: Float64Array;
    parent: Entry | null;
    pivot: XYZ;
    hint: LegacyNode;
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
  const add = (node: TransformNode, name: JointName) => {
    if (byNode.has(node)) throw new Error('Duplicate joint binding');
    const parent = node.parent ? byNode.get(node.parent) : null;
    if (node.parent && !parent) throw new Error(`Unbound parent for ${node.name}`);
    const pivot = node.getPivotPoint();
    const entry: Entry = {
      node,
      joint: pose.definition.index[name],
      offset: new Float64Array(16),
      world: new Float64Array(16),
      inverse: new Float64Array(16),
      parent: parent ?? null,
      pivot: [pivot.x, pivot.y, pivot.z],
      hint: numeric(node),
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
  const extras = [rig.cape].filter((node): node is TransformNode => !!node);
  const visibility = channels.filter(({ node }) => node !== rig.root && node !== rig.body);
  const writeMatrix = (entry: Entry) => {
    const m = local,
      p = entry.pivot,
      node = entry.node,
      hint = entry.hint;
    let sx = Math.hypot(m[0], m[1], m[2]),
      sy = Math.hypot(m[4], m[5], m[6]),
      sz = Math.hypot(m[8], m[9], m[10]);
    if (Math.min(sx, sy, sz) < 1e-9 || !Number.isFinite(sx + sy + sz))
      throw new Error('Invalid binding scale');
    // Solved A3 legs have no authored Euler branch to preserve. Avoid reconstructing and
    // comparing the obsolete legacy leg hint on every final application.
    let same = !(grounding.active && entry.joint >= pose.definition.index.leftThigh);
    if (same) {
      setEuler(scratch, hint.rotation.x, hint.rotation.y, hint.rotation.z);
      scratch.scale.copyFrom(hint.scaling);
      scratch.position.setAll(0);
      compose(scratch, hintMatrix);
      for (let col = 0; col < 3; col++)
        for (let row = 0; row < 3; row++)
          if (Math.abs(m[col * 4 + row] - hintMatrix[col * 4 + row]) > 1e-10) same = false;
    }
    if (same) {
      node.rotation.set(hint.rotation.x, hint.rotation.y, hint.rotation.z);
      sx = hint.scaling.x;
      sy = hint.scaling.y;
      sz = hint.scaling.z;
    } else if (
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
  let resetPending = true;
  const attached: { binding: FrameAttachment; frame: ActionFrame }[] = [];
  const binding: RigBinding = {
    pose,
    legacy,
    grounding,
    actions,
    attach(node, frame, offset) {
      if (node.parent !== rig.root)
        throw new Error('Attachment must be parented to its actor root');
      if (attached.some((a) => a.binding.node === node))
        throw new Error('Duplicate attachment writer');
      attached.push({ binding: new FrameAttachment(node, offset), frame });
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
      if (dt > 0 && !resetPending) resetHistory(pose);
      // Temporary compatibility for explicit debug/root heading setup. Gameplay root translation
      // is sampled from the actor by actorRendering, never integrated from mesh displacement.
      legacy.root.rotation.copyFrom(rig.root.rotation);
    },
    invalidateHistory() {
      if (grounding.active) binding.captureLegacy();
      grounding.reset();
      actions.reset();
      resetPending = true;
    },
    captureLegacy() {
      for (const { node, data } of channels) {
        data.position.copyFrom(node.position);
        data.rotation.copyFrom(node.rotation);
        data.scaling.copyFrom(node.scaling);
      }
    },
    commit(reset = false) {
      sampleLegacy(legacy, pose);
      binding.apply();
      if (reset) resetHistory(pose);
    },
    apply() {
      if (rig.root.isDisposed()) throw new Error('Cannot apply a retired rig');
      evaluatePose(pose);
      for (const entry of entries) {
        multiply(pose.world, entry.joint * 16, entry.offset, 0, entry.world, 0);
        inverse(entry.world, 0, entry.inverse);
        if (entry.parent) multiply(entry.parent.inverse, 0, entry.world, 0, local, 0);
        else local.set(entry.world);
        writeMatrix(entry);
      }
      for (const node of extras) {
        const data = nodes.get(node)!;
        node.position.set(data.position.x, data.position.y, data.position.z);
        node.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
        node.scaling.set(data.scaling.x, data.scaling.y, data.scaling.z);
      }
      for (const { node, data } of visibility) node.setEnabled(data.enabled);
      actions.finish(pose);
      for (const a of attached) a.binding.apply(actions.frames[a.frame], entries[0].inverse);
      if (resetPending) {
        resetHistory(pose);
        resetPending = false;
      }
    },
  };
  bindings.set(rig, binding);
  entity.add('rigPose', binding);
  for (const key of ['weapon', 'shield', 'spear', 'javelin'] as const)
    if (rig[key]) binding.attach(rig[key], key);
  if (rig.stowed) binding.attach(rig.stowed, 'back');
  binding.commit(true);
  return binding;
}
