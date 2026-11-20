import { setEuler } from './pose.ts';
import type { JointDefinition, JointPose } from './types.ts';

export const clamp = (n: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, n));

/** Forward-first Gram-Schmidt: the orientation contract for affine/scaled socket frames. */
export function orthonormalize(m: Float64Array): void {
  let x = m[8],
    y = m[9],
    z = m[10];
  const length = Math.hypot(x, y, z);
  x /= length;
  y /= length;
  z /= length;
  const dot = x * m[4] + y * m[5] + z * m[6];
  let ux = m[4] - dot * x,
    uy = m[5] - dot * y,
    uz = m[6] - dot * z;
  const upLength = Math.hypot(ux, uy, uz);
  ux /= upLength;
  uy /= upLength;
  uz /= upLength;
  m[0] = uy * z - uz * y;
  m[1] = uz * x - ux * z;
  m[2] = ux * y - uy * x;
  m[4] = ux;
  m[5] = uy;
  m[6] = uz;
  m[8] = x;
  m[9] = y;
  m[10] = z;
}

export function matrixRotation(m: Float64Array, q: JointPose['rotation']): void {
  const trace = m[0] + m[5] + m[10];
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q.w = s / 4;
    q.x = (m[6] - m[9]) / s;
    q.y = (m[8] - m[2]) / s;
    q.z = (m[1] - m[4]) / s;
  } else if (m[0] > m[5] && m[0] > m[10]) {
    const s = Math.sqrt(1 + m[0] - m[5] - m[10]) * 2;
    q.w = (m[6] - m[9]) / s;
    q.x = s / 4;
    q.y = (m[4] + m[1]) / s;
    q.z = (m[8] + m[2]) / s;
  } else if (m[5] > m[10]) {
    const s = Math.sqrt(1 + m[5] - m[0] - m[10]) * 2;
    q.w = (m[8] - m[2]) / s;
    q.x = (m[4] + m[1]) / s;
    q.y = s / 4;
    q.z = (m[9] + m[6]) / s;
  } else {
    const s = Math.sqrt(1 + m[10] - m[0] - m[5]) * 2;
    q.w = (m[1] - m[4]) / s;
    q.x = (m[8] + m[2]) / s;
    q.y = (m[9] + m[6]) / s;
    q.z = s / 4;
  }
  const n = Math.hypot(q.x, q.y, q.z, q.w);
  q.x /= n;
  q.y /= n;
  q.z /= n;
  q.w /= n;
}

function angleLimit(angle: number, min: number, max: number): number {
  const unwrapped = angle + Math.round(((min + max) / 2 - angle) / (Math.PI * 2)) * Math.PI * 2;
  return clamp(unwrapped, min, max);
}

function similarity(x: number, y: number, z: number, q: JointPose['rotation']): number {
  const sx = Math.sin(x / 2),
    cx = Math.cos(x / 2),
    sy = Math.sin(y / 2),
    cy = Math.cos(y / 2),
    sz = Math.sin(z / 2),
    cz = Math.cos(z / 2);
  return Math.abs(
    q.x * (cy * sx * cz + sy * cx * sz) +
      q.y * (sy * cx * cz - cy * sx * sz) +
      q.z * (cy * cx * sz - sy * sx * cz) +
      q.w * (cy * cx * cz + sy * sx * sz),
  );
}

/** Y-X-Z limits. Consider equivalent Euler branches and wrap relative to the permitted interval. */
export function limitJoint(joint: JointPose, definition: JointDefinition): void {
  const q = joint.rotation,
    limits = definition.limits;
  if (
    limits[0][0] <= -Math.PI &&
    limits[0][1] >= Math.PI &&
    limits[1][0] <= -Math.PI &&
    limits[1][1] >= Math.PI &&
    limits[2][0] <= -Math.PI &&
    limits[2][1] >= Math.PI
  )
    return;
  let x: number, y: number, z: number;
  if (limits[1][0] === 0 && limits[1][1] === 0 && limits[2][0] === 0 && limits[2][1] === 0) {
    x = angleLimit(2 * Math.atan2(q.x, q.w), limits[0][0], limits[0][1]);
    setEuler(joint, x, 0, 0);
    return;
  } else {
    x = Math.asin(clamp(2 * (q.w * q.x - q.y * q.z), -1, 1));
    if (Math.abs(Math.cos(x)) > 1e-7) {
      y = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
      z = Math.atan2(2 * (q.x * q.y + q.w * q.z), 1 - 2 * (q.x * q.x + q.z * q.z));
    } else {
      y = Math.atan2(2 * (q.w * q.y - q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
      z = 0;
    }
  }
  const ax = angleLimit(x, limits[0][0], limits[0][1]),
    ay = angleLimit(y, limits[1][0], limits[1][1]),
    az = angleLimit(z, limits[2][0], limits[2][1]);
  const bx = angleLimit(Math.PI - x, limits[0][0], limits[0][1]),
    by = angleLimit(y + Math.PI, limits[1][0], limits[1][1]),
    bz = angleLimit(z + Math.PI, limits[2][0], limits[2][1]);
  if (similarity(bx, by, bz, q) > similarity(ax, ay, az, q) + 1e-12) setEuler(joint, bx, by, bz);
  else setEuler(joint, ax, ay, az);
}

export function copyLocal(from: readonly JointPose[], to: readonly JointPose[]): void {
  for (let i = 0; i < from.length; i++) {
    const a = from[i],
      b = to[i];
    b.position.copyFrom(a.position);
    b.scale.copyFrom(a.scale);
    b.rotation.x = a.rotation.x;
    b.rotation.y = a.rotation.y;
    b.rotation.z = a.rotation.z;
    b.rotation.w = a.rotation.w;
  }
}
