import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { multiplyAffine } from './pose.ts';
import type { XYZ } from './types.ts';

/** A scene adapter for an explicit solved frame, with a fixed mesh-local offset. Its parent, when
 * present, must be the actor root. No hierarchy queries or per-update matrix allocations. */
export class FrameAttachment {
  readonly node: TransformNode;
  private readonly offset: XYZ;
  private readonly world = new Float64Array(16);
  private readonly local = new Float64Array(16);
  constructor(node: TransformNode, offset: XYZ = [0, 0, 0]) {
    this.node = node;
    this.offset = [...offset];
  }
  apply(frame: Float64Array, parentInverse?: Float64Array): void {
    this.world.set(frame);
    for (let row = 0; row < 3; row++)
      this.world[12 + row] +=
        frame[row] * this.offset[0] +
        frame[4 + row] * this.offset[1] +
        frame[8 + row] * this.offset[2];
    if (parentInverse) {
      multiplyAffine(parentInverse, 0, this.world, 0, this.local, 0);
    } else this.local.set(this.world);
    const m = this.local,
      node = this.node;
    const sx = Math.hypot(m[0], m[1], m[2]),
      sy = Math.hypot(m[4], m[5], m[6]),
      sz = Math.hypot(m[8], m[9], m[10]);
    const pitch = Math.asin(Math.max(-1, Math.min(1, -m[9] / sz)));
    const yaw =
      Math.abs(Math.cos(pitch)) > 1e-7
        ? Math.atan2(m[8] / sz, m[10] / sz)
        : Math.atan2(-m[2] / sx, m[0] / sx);
    const roll = Math.abs(Math.cos(pitch)) > 1e-7 ? Math.atan2(m[1] / sx, m[5] / sy) : 0;
    node.position.set(m[12], m[13], m[14]);
    node.rotation.set(pitch, yaw, roll);
    node.scaling.set(sx, sy, sz);
  }
}
