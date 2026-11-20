import { PoseVector } from './types.ts';
import type { JointName, JointPose, PoseBuffer, RigDefinition, SocketName, XYZ } from './types.ts';

export function createPose(definition: RigDefinition): PoseBuffer {
  const local = definition.joints.map((joint) => ({
    position: new PoseVector().set(...joint.rest),
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: new PoseVector().setAll(1),
  }));
  const size = local.length * 16;
  return {
    definition,
    local,
    matrices: new Float64Array(size),
    world: new Float64Array(size),
    previousWorld: new Float64Array(size),
  };
}
export function resetLocal(pose: PoseBuffer): void {
  pose.local.forEach((joint, i) => {
    joint.position.set(...pose.definition.joints[i].rest);
    joint.scale.setAll(1);
    joint.rotation.x = joint.rotation.y = joint.rotation.z = 0;
    joint.rotation.w = 1;
  });
}
export function setEuler(joint: JointPose, x: number, y: number, z: number): void {
  const sx = Math.sin(x / 2),
    cx = Math.cos(x / 2),
    sy = Math.sin(y / 2),
    cy = Math.cos(y / 2),
    sz = Math.sin(z / 2),
    cz = Math.cos(z / 2);
  joint.rotation.x = cy * sx * cz + sy * cx * sz;
  joint.rotation.y = sy * cx * cz - cy * sx * sz;
  joint.rotation.z = cy * cx * sz - sy * sx * cz;
  joint.rotation.w = cy * cx * cz + sy * sx * sz;
}
export function compose(joint: JointPose, out: Float64Array, o = 0): void {
  const { x, y, z, w } = joint.rotation,
    s = joint.scale,
    p = joint.position;
  const xx = x * x,
    yy = y * y,
    zz = z * z,
    xy = x * y,
    xz = x * z,
    yz = y * z,
    wx = w * x,
    wy = w * y,
    wz = w * z;
  out[o] = (1 - 2 * (yy + zz)) * s.x;
  out[o + 1] = 2 * (xy + wz) * s.x;
  out[o + 2] = 2 * (xz - wy) * s.x;
  out[o + 3] = 0;
  out[o + 4] = 2 * (xy - wz) * s.y;
  out[o + 5] = (1 - 2 * (xx + zz)) * s.y;
  out[o + 6] = 2 * (yz + wx) * s.y;
  out[o + 7] = 0;
  out[o + 8] = 2 * (xz + wy) * s.z;
  out[o + 9] = 2 * (yz - wx) * s.z;
  out[o + 10] = (1 - 2 * (xx + yy)) * s.z;
  out[o + 11] = 0;
  out[o + 12] = p.x;
  out[o + 13] = p.y;
  out[o + 14] = p.z;
  out[o + 15] = 1;
}
/** Column-major a*b. Output may alias a (not b); used with distinct buffers by FK. */
export function multiply(
  a: Float64Array,
  ao: number,
  b: Float64Array,
  bo: number,
  out: Float64Array,
  o: number,
): void {
  for (let row = 0; row < 4; row++) {
    const a0 = a[ao + row],
      a1 = a[ao + 4 + row],
      a2 = a[ao + 8 + row],
      a3 = a[ao + 12 + row];
    for (let col = 0; col < 4; col++)
      out[o + col * 4 + row] =
        a0 * b[bo + col * 4] +
        a1 * b[bo + col * 4 + 1] +
        a2 * b[bo + col * 4 + 2] +
        a3 * b[bo + col * 4 + 3];
  }
}
/** Affine a*b for pose/binding transforms (bottom row 0,0,0,1). Same alias contract as multiply. */
export function multiplyAffine(
  a: Float64Array,
  ao: number,
  b: Float64Array,
  bo: number,
  out: Float64Array,
  o: number,
): void {
  for (let row = 0; row < 3; row++) {
    const a0 = a[ao + row],
      a1 = a[ao + 4 + row],
      a2 = a[ao + 8 + row],
      a3 = a[ao + 12 + row];
    out[o + row] = a0 * b[bo] + a1 * b[bo + 1] + a2 * b[bo + 2];
    out[o + 4 + row] = a0 * b[bo + 4] + a1 * b[bo + 5] + a2 * b[bo + 6];
    out[o + 8 + row] = a0 * b[bo + 8] + a1 * b[bo + 9] + a2 * b[bo + 10];
    out[o + 12 + row] = a0 * b[bo + 12] + a1 * b[bo + 13] + a2 * b[bo + 14] + a3;
  }
  out[o + 3] = out[o + 7] = out[o + 11] = 0;
  out[o + 15] = 1;
}
export function inverse(m: Float64Array, o: number, out: Float64Array): void {
  const a = m[o],
    b = m[o + 4],
    c = m[o + 8],
    d = m[o + 1],
    e = m[o + 5],
    f = m[o + 9],
    g = m[o + 2],
    h = m[o + 6],
    i = m[o + 10];
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12)
    throw new Error('Singular rig transform');
  const k = 1 / determinant;
  out[0] = (e * i - f * h) * k;
  out[4] = (c * h - b * i) * k;
  out[8] = (b * f - c * e) * k;
  out[1] = (f * g - d * i) * k;
  out[5] = (a * i - c * g) * k;
  out[9] = (c * d - a * f) * k;
  out[2] = (d * h - e * g) * k;
  out[6] = (b * g - a * h) * k;
  out[10] = (a * e - b * d) * k;
  const x = m[o + 12],
    y = m[o + 13],
    z = m[o + 14];
  out[12] = -(out[0] * x + out[4] * y + out[8] * z);
  out[13] = -(out[1] * x + out[5] * y + out[9] * z);
  out[14] = -(out[2] * x + out[6] * y + out[10] * z);
  out[3] = out[7] = out[11] = 0;
  out[15] = 1;
}
export function evaluatePose(pose: PoseBuffer): void {
  for (let i = 0; i < pose.local.length; i++) {
    const o = i * 16,
      parent = pose.definition.joints[i].parent;
    compose(pose.local[i], pose.matrices, o);
    if (parent < 0) for (let n = 0; n < 16; n++) pose.world[o + n] = pose.matrices[o + n];
    else multiplyAffine(pose.world, parent * 16, pose.matrices, o, pose.world, o);
  }
}
export function resetHistory(pose: PoseBuffer): void {
  pose.previousWorld.set(pose.world);
}
const origin: XYZ = [0, 0, 0];
export function transformPoint(m: Float64Array, o: number, p: XYZ): [number, number, number] {
  return [
    m[o] * p[0] + m[o + 4] * p[1] + m[o + 8] * p[2] + m[o + 12],
    m[o + 1] * p[0] + m[o + 5] * p[1] + m[o + 9] * p[2] + m[o + 13],
    m[o + 2] * p[0] + m[o + 6] * p[1] + m[o + 10] * p[2] + m[o + 14],
  ];
}
export function worldPoint(
  pose: PoseBuffer,
  joint: JointName,
  local: XYZ = origin,
): [number, number, number] {
  return transformPoint(pose.world, pose.definition.index[joint] * 16, local);
}
export function localPoint(
  pose: PoseBuffer,
  joint: JointName,
  world: XYZ,
): [number, number, number] {
  const m = new Float64Array(16);
  inverse(pose.world, pose.definition.index[joint] * 16, m);
  return transformPoint(m, 0, world);
}
export function socketPoint(pose: PoseBuffer, name: SocketName): [number, number, number] {
  const socket = pose.definition.sockets[name];
  return worldPoint(pose, socket.joint, socket.offset);
}

/** Full affine joint-local socket -> world frame, retaining authored visual scale. Caller owns
 * the reusable output. An orthonormal aim basis needs an explicit scale/shear-removal policy. */
export function socketMatrix(pose: PoseBuffer, name: SocketName, out: Float64Array): void {
  if (out.length !== 16) throw new Error('Socket output needs 16 elements');
  const socket = pose.definition.sockets[name],
    m = pose.world,
    o = pose.definition.index[socket.joint] * 16;
  const [ux, uy, uz] = socket.up,
    [fx, fy, fz] = socket.forward;
  const rx = uy * fz - uz * fy,
    ry = uz * fx - ux * fz,
    rz = ux * fy - uy * fx;
  for (let row = 0; row < 3; row++) {
    out[row] = m[o + row] * rx + m[o + 4 + row] * ry + m[o + 8 + row] * rz;
    out[4 + row] = m[o + row] * ux + m[o + 4 + row] * uy + m[o + 8 + row] * uz;
    out[8 + row] = m[o + row] * fx + m[o + 4 + row] * fy + m[o + 8 + row] * fz;
    out[12 + row] =
      m[o + row] * socket.offset[0] +
      m[o + 4 + row] * socket.offset[1] +
      m[o + 8 + row] * socket.offset[2] +
      m[o + 12 + row];
  }
  out[3] = out[7] = out[11] = 0;
  out[15] = 1;
}
