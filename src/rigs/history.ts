import type { PoseBuffer, RigDefinition, XYZ } from './types.ts';
import { matrixRotation, orthonormalize } from './ikMath.ts';
import { transformPoint } from './pose.ts';

export interface PoseSnapshot {
  readonly definition: RigDefinition;
  readonly world: readonly number[];
  /** World units/second and world-axis radians/second at each joint origin (three per joint). */
  readonly linear: readonly number[];
  readonly angular: readonly number[];
  readonly duration: number;
  readonly bodies: readonly {
    readonly joint: RigDefinition['bodies'][number]['joint'];
    readonly parent: number;
    readonly position: XYZ;
    readonly rotation: readonly [number, number, number, number];
    readonly size: XYZ;
    readonly anchor: XYZ;
    readonly linear: XYZ;
    readonly angular: XYZ;
  }[];
}
export interface PoseRebase {
  readonly position: XYZ;
  readonly heading: number;
  /** Replaces sampled root translation, never adds it a second time. */
  readonly velocity: XYZ;
}
const freeze3 = (v: number[]): XYZ => Object.freeze([v[0], v[1], v[2]] as const);

/** Final published fixed-step history, including constrained secondary motion. No mesh reads.
 * Velocity extraction is on demand (death/debug), not 25 quaternion traversals every render tick. */
export class PoseHistory {
  private readonly pose: PoseBuffer;
  private readonly current: Float64Array;
  private valid = false;
  private retired = false;
  private duration = 0;
  constructor(pose: PoseBuffer) {
    this.pose = pose;
    this.current = new Float64Array(pose.world.length);
  }
  invalidate(): void {
    this.valid = false;
    this.duration = 0;
    this.pose.previousWorld.set(this.pose.world);
    this.current.set(this.pose.world);
  }
  publish(dt: number): void {
    if (this.retired) throw new Error('Cannot publish a retired rig');
    if (!Number.isFinite(dt) || dt < 0) throw new Error('Invalid pose history duration');
    const world = this.pose.world;
    if (dt === 0 && this.valid && world.every((v, i) => v === this.current[i])) return;
    this.duration = this.valid && dt > 0 ? dt : 0;
    this.pose.previousWorld.set(this.duration ? this.current : world);
    this.current.set(world);
    this.valid = true;
  }
  get verticalSpeed(): number {
    return this.duration ? (this.current[13] - this.pose.previousWorld[13]) / this.duration : 0;
  }
  snapshot(rebase?: PoseRebase): PoseSnapshot {
    if (this.retired) throw new Error('Cannot snapshot a retired rig');
    const { definition, previousWorld: previous } = this.pose;
    const source = this.current,
      duration = this.duration;
    const heading = Math.atan2(source[8], source[10]);
    const angle = rebase ? rebase.heading - heading : 0;
    const sin = Math.sin(angle),
      cos = Math.cos(angle);
    const rotate = (v: readonly number[]) => [
      cos * v[0] + sin * v[2],
      v[1],
      -sin * v[0] + cos * v[2],
    ];
    const origin = rebase?.position ?? [source[12], source[13], source[14]];
    const delta = (a: readonly number[], b: readonly number[]) =>
      a.map((v, i) => (duration ? (v - b[i]) / duration : 0));
    const rootVelocity = delta(
      Array.from(source.slice(12, 15)),
      Array.from(previous.slice(12, 15)),
    );
    const inherited = rebase?.velocity ?? rootVelocity;
    const velocity = (a: readonly number[], b: readonly number[]): XYZ =>
      freeze3(
        rotate(delta(a, b).map((v, i) => v - rootVelocity[i])).map((v, i) => v + inherited[i]),
      );
    const point = (p: readonly number[]): XYZ =>
      freeze3(rotate(p.map((v, i) => v - source[12 + i])).map((v, i) => v + origin[i]));
    const rotation = (m: Float64Array, o: number) => {
      const basis = m.slice(o, o + 16);
      orthonormalize(basis);
      const q = { x: 0, y: 0, z: 0, w: 1 };
      matrixRotation(basis, q);
      return q;
    };
    const world = new Float64Array(source.length),
      linear: number[] = [],
      angular: number[] = [];
    for (let o = 0; o < source.length; o += 16) {
      for (const column of [0, 4, 8])
        world.set(rotate(Array.from(source.slice(o + column, o + column + 3))), o + column);
      world.set(point(Array.from(source.slice(o + 12, o + 15))), o + 12);
      world[o + 15] = 1;
      linear.push(
        ...velocity(
          Array.from(source.slice(o + 12, o + 15)),
          Array.from(previous.slice(o + 12, o + 15)),
        ),
      );
      if (!duration) {
        angular.push(0, 0, 0);
        continue;
      }
      const a = rotation(source, o),
        b = rotation(previous, o);
      // q_current * inverse(q_previous): shortest WORLD-axis delta, invariant to quaternion sign.
      let x = -a.w * b.x + a.x * b.w - a.y * b.z + a.z * b.y;
      let y = -a.w * b.y + a.x * b.z + a.y * b.w - a.z * b.x;
      let z = -a.w * b.z - a.x * b.y + a.y * b.x + a.z * b.w;
      let w = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
      if (w < 0) {
        x = -x;
        y = -y;
        z = -z;
        w = -w;
      }
      const length = Math.hypot(x, y, z);
      const scale = length < 1e-12 ? 0 : (2 * Math.atan2(length, w)) / (length * duration);
      angular.push(...rotate([x * scale, y * scale, z * scale]));
    }
    const indices = definition.bodies.map((b) =>
      definition.joints.findIndex((j) => j.name === b.joint),
    );
    const bodies = definition.bodies.map((body, i) => {
      const joint = indices[i],
        o = joint * 16,
        q = rotation(world, o);
      let parent = definition.joints[joint].parent;
      while (parent >= 0 && !indices.includes(parent)) parent = definition.joints[parent].parent;
      return Object.freeze({
        joint: body.joint,
        parent: indices.indexOf(parent),
        position: point(transformPoint(source, o, body.center)),
        rotation: Object.freeze([q.x, q.y, q.z, q.w] as const),
        size: body.size,
        anchor: freeze3(Array.from(world.slice(o + 12, o + 15))),
        linear: velocity(
          transformPoint(source, o, body.center),
          transformPoint(previous, o, body.center),
        ),
        angular: freeze3(angular.slice(joint * 3, joint * 3 + 3)),
      });
    });
    return Object.freeze({
      definition,
      world: Object.freeze(Array.from(world)),
      linear: Object.freeze(linear),
      angular: Object.freeze(angular),
      duration,
      bodies: Object.freeze(bodies),
    });
  }
  retire(): void {
    this.invalidate();
    this.retired = true;
    this.current.fill(0);
    this.pose.previousWorld.fill(0);
  }
}
