import { jointNames, tailNames } from './types.ts';
import type { JointDefinition, JointName, RigDefinition, RigProfile, XYZ } from './types.ts';

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export const profiles: Readonly<Record<RigProfile['id'], RigProfile>> = freeze({
  player: {
    id: 'player',
    hipWidth: 0.2,
    shoulderWidth: 0.48,
    shoulderHeight: 1.18,
    headHeight: 1.28,
    soleForward: 0.06,
    soleHalfWidth: 0.14,
    soleHalfDepth: 0.2,
    gait: 'ordinary',
    gaitSpeed: 4.8,
  },
  skeleton: {
    id: 'skeleton',
    hipWidth: 0.18,
    shoulderWidth: 0.35,
    shoulderHeight: 1.22,
    headHeight: 1.35,
    soleForward: 0.08,
    soleHalfWidth: 0.11,
    soleHalfDepth: 0.17,
    gait: 'skeleton',
    gaitSpeed: 1.65,
  },
  goblin: {
    id: 'goblin',
    hipWidth: 0.18,
    shoulderWidth: 0.37,
    shoulderHeight: 1.02,
    headHeight: 1.12,
    soleForward: 0.08,
    soleHalfWidth: 0.11,
    soleHalfDepth: 0.17,
    gait: 'ordinary',
    gaitSpeed: 2.5,
  },
  kobold: {
    id: 'kobold',
    hipWidth: 0.18,
    shoulderWidth: 0.37,
    shoulderHeight: 1.02,
    headHeight: 1.12,
    soleForward: 0.08,
    soleHalfWidth: 0.11,
    soleHalfDepth: 0.17,
    gait: 'ordinary',
    gaitSpeed: 2.1,
  },
});
const cache = new WeakMap<RigProfile, RigDefinition>();
export function humanoid(profile: RigProfile): RigDefinition {
  const cached = cache.get(profile);
  if (cached) return cached;
  const index = Object.fromEntries(jointNames.map((name, i) => [name, i])) as Record<
    JointName,
    number
  >;
  const joints: JointDefinition[] = [];
  const add = (
    name: JointName,
    parent: JointName | null,
    rest: XYZ,
    x: readonly [number, number] = [-Math.PI, Math.PI],
  ) => {
    const hinge = name.endsWith('Shin') || name.endsWith('Forearm');
    joints.push({
      name,
      parent: parent === null ? -1 : index[parent],
      rest,
      axis: name === 'root' ? [0, 1, 0] : [1, 0, 0],
      limits: [x, hinge ? [0, 0] : [-Math.PI, Math.PI], hinge ? [0, 0] : [-Math.PI, Math.PI]],
    });
  };
  add('root', null, [0, 0, 0]);
  add('pelvis', 'root', [0, 0.55, 0]);
  add('spine', 'pelvis', [0, 0, 0]);
  add('chest', 'spine', [0, 0.4, 0]);
  add('neck', 'chest', [0, profile.headHeight - 0.95, 0]);
  add('head', 'neck', [0, 0, 0]);
  for (const side of ['left', 'right'] as const) {
    const sign = side === 'left' ? -1 : 1;
    add(`${side}Shoulder`, 'chest', [
      sign * profile.shoulderWidth,
      profile.shoulderHeight - 0.95,
      0,
    ]);
    add(`${side}UpperArm`, `${side}Shoulder`, [0, 0, 0]);
    add(`${side}Forearm`, `${side}UpperArm`, [0, -0.28, 0]);
    add(`${side}Hand`, `${side}Forearm`, [0, -0.27, 0]);
  }
  for (const side of ['left', 'right'] as const) {
    add(`${side}Thigh`, 'pelvis', [(side === 'left' ? -1 : 1) * profile.hipWidth, 0, 0]);
    add(`${side}Shin`, `${side}Thigh`, [0, -0.25, 0], [0, Math.PI]);
    add(`${side}Foot`, `${side}Shin`, [0, -0.25, 0]);
  }
  const arm = (side: 'left' | 'right') => ({
    root: `${side}UpperArm` as const,
    middle: `${side}Forearm` as const,
    end: `${side}Hand` as const,
    upperLength: 0.28,
    lowerLength: 0.27,
    bendHint: [0, 0, -1] as XYZ,
  });
  const leg = (side: 'left' | 'right') => ({
    root: `${side}Thigh` as const,
    middle: `${side}Shin` as const,
    end: `${side}Foot` as const,
    upperLength: 0.25,
    lowerLength: 0.25,
    bendHint: [0, 0, 1] as XYZ,
  });
  const socket = (joint: JointName, offset: XYZ) => ({
    joint,
    offset,
    forward: [0, 0, 1] as XYZ,
    up: [0, 1, 0] as XYZ,
  });
  const definition: RigDefinition = {
    family: 'humanoid',
    profile: { ...profile },
    index,
    joints,
    chains: {
      leftArm: arm('left'),
      rightArm: arm('right'),
      leftLeg: leg('left'),
      rightLeg: leg('right'),
    },
    sockets: {
      leftGrip: socket('leftHand', [0, 0, 0]),
      rightGrip: socket('rightHand', [0, 0, 0]),
      leftSole: socket('leftFoot', [0, -0.05, profile.soleForward]),
      rightSole: socket('rightFoot', [0, -0.05, profile.soleForward]),
      gaze: socket('head', [0, 0.2, 0.3]),
      back: socket('chest', [0, 0, -0.25]),
    },
    bodies: [
      { joint: 'pelvis', center: [0, 0.08, 0], size: [0.4, 0.2, 0.28] },
      { joint: 'chest', center: [0, 0, 0], size: [0.58, 0.55, 0.36] },
      { joint: 'head', center: [0, 0.2, 0], size: [0.48, 0.4, 0.4] },
      ...Object.values({
        leftArm: arm('left'),
        rightArm: arm('right'),
        leftLeg: leg('left'),
        rightLeg: leg('right'),
      }).flatMap((chain) => [
        {
          joint: chain.root,
          center: [0, -chain.upperLength / 2, 0] as XYZ,
          size: [0.18, chain.upperLength, 0.18] as XYZ,
        },
        {
          joint: chain.middle,
          center: [0, -chain.lowerLength / 2, 0] as XYZ,
          size: [0.16, chain.lowerLength, 0.17] as XYZ,
        },
      ]),
    ],
  };
  validateRig(definition);
  freeze(definition);
  cache.set(profile, definition);
  return definition;
}

export function validateRig(rig: RigDefinition): void {
  const tailed = rig.family === 'humanoid-with-tail';
  if (
    rig.joints.length !== jointNames.length + (tailed ? 4 : 0) ||
    (tailed ? rig.tail?.length !== 4 : !!rig.tail)
  )
    throw new Error('Invalid humanoid topology');
  for (const [i, joint] of rig.joints.entries()) {
    if (
      joint.name !== (i < jointNames.length ? jointNames[i] : tailNames[i - jointNames.length]) ||
      (i < jointNames.length && rig.index[jointNames[i]] !== i) ||
      !Number.isInteger(joint.parent) ||
      joint.parent >= i ||
      joint.parent < -1 ||
      (i === 0) !== (joint.parent === -1)
    )
      throw new Error('Invalid parent topology');
    if (
      !joint.rest.every(Number.isFinite) ||
      !joint.axis.every(Number.isFinite) ||
      Math.abs(Math.hypot(...joint.axis) - 1) > 1e-10
    )
      throw new Error('Invalid rest or axis');
    for (const [min, max] of joint.limits)
      if (!Number.isFinite(min) || !Number.isFinite(max) || min > max)
        throw new Error('Invalid joint limit');
  }
  for (const [i, segment] of (rig.tail ?? []).entries()) {
    const joint = rig.joints[segment.index];
    if (
      segment.index !== jointNames.length + i ||
      segment.name !== tailNames[i] ||
      joint.parent !== (i ? rig.tail![i - 1].index : rig.index.pelvis) ||
      ![segment.length, segment.width, segment.height].every((v) => Number.isFinite(v) && v > 0) ||
      (i > 0 &&
        (joint.rest[0] !== 0 || joint.rest[1] !== 0 || joint.rest[2] !== -rig.tail![i - 1].length))
    )
      throw new Error('Invalid tail chain');
  }
  for (const chain of Object.values(rig.chains)) {
    const middle = rig.joints[rig.index[chain.middle]],
      end = rig.joints[rig.index[chain.end]];
    if (
      !middle ||
      !end ||
      !(chain.upperLength > 0) ||
      !(chain.lowerLength > 0) ||
      !chain.bendHint.every(Number.isFinite) ||
      middle.parent !== rig.index[chain.root] ||
      end.parent !== rig.index[chain.middle] ||
      Math.abs(Math.hypot(...middle.rest) - chain.upperLength) > 1e-10 ||
      Math.abs(Math.hypot(...end.rest) - chain.lowerLength) > 1e-10 ||
      Math.abs(Math.hypot(...chain.bendHint) - 1) > 1e-10
    )
      throw new Error('Invalid limb chain');
  }
  for (const socket of Object.values(rig.sockets)) {
    if (
      !(socket.joint in rig.index) ||
      !socket.offset.every(Number.isFinite) ||
      !socket.forward.every(Number.isFinite) ||
      !socket.up.every(Number.isFinite) ||
      Math.abs(Math.hypot(...socket.forward) - 1) > 1e-10 ||
      Math.abs(Math.hypot(...socket.up) - 1) > 1e-10 ||
      Math.abs(socket.forward.reduce((sum, v, i) => sum + v * socket.up[i], 0)) > 1e-10
    )
      throw new Error('Invalid socket frame');
  }
  for (const body of rig.bodies)
    if (
      !rig.joints.some((j) => j.name === body.joint) ||
      !body.center.every(Number.isFinite) ||
      !body.size.every((v) => Number.isFinite(v) && v > 0)
    )
      throw new Error('Invalid body mapping');
}
