import { Body, Box, ConeTwistConstraint, GSSolver, SAPBroadphase, Vec3, World } from 'cannon-es';
import type { NavigationWorld } from './navigation.ts';
import { heightAt, key, randomFrom } from './world.ts';
import {
  WALL_BASE,
  WALL_CAP,
  WALL_LENGTH,
  WALL_OFFSET,
  WALL_THICKNESS,
  DOOR_HEIGHT,
} from './wallGeometry.ts';
import type { PoseSnapshot } from './rigs/history.ts';
import type { XYZ } from './rigs/types.ts';
import { PoseVector } from './rigs/types.ts';
import { compose, inverse, multiplyAffine } from './rigs/pose.ts';
import { Quaternion } from 'cannon-es';

export const RAGDOLL_LIFETIME = 8;
export const RAGDOLL_LIMIT = 24;
const STEP = 1 / 180;
const vec = (p: XYZ) => new Vec3(...p);
export interface RagdollShape {
  body: number;
  center: XYZ;
  size: XYZ;
  rotation: readonly [number, number, number, number];
}
export function bodyOwner(source: PoseSnapshot, joint: number): number {
  if (source.definition.joints[joint].name === 'spine') joint = source.definition.index.chest;
  while (joint >= 0) {
    const body = source.bodies.findIndex((b) => b.joint === source.definition.joints[joint].name);
    if (body >= 0) return body;
    joint = source.definition.joints[joint].parent;
  }
  return 0;
}

/** Velocity impulse: kill magnitude cannot turn an overkill/debug hit into an unbounded launch.
 * Variation is keyed to the death, not render cadence or global random calls. */
export function deathImpulse(travel: XYZ | null, magnitude: number, seed = 'death'): XYZ {
  if (!travel) return [0, 0, 0];
  const random = randomFrom(seed);
  const yaw = (random() - 0.5) * 0.36;
  const strength = (5.6 + Math.min(30, Math.max(0, magnitude)) * 0.035) * (0.9 + random() * 0.2);
  return [
    (travel[0] * Math.cos(yaw) + travel[2] * Math.sin(yaw)) * strength,
    travel[1] * strength + 2.4 + random() * 0.8,
    (travel[2] * Math.cos(yaw) - travel[0] * Math.sin(yaw)) * strength,
  ];
}

export interface TerrainBox {
  name: string;
  position: XYZ;
  size: XYZ;
  yaw: number;
  top: number;
}
/** Actual tile-height treads, not the living motor's smooth ramp. Stream a bounded local patch.
 * Physical walls persist when their upper artwork is cut away by the camera. */
export type RagdollTerrain = NavigationWorld & { physicalObstacles?: readonly TerrainBox[] };
export function physicalTerrain(world: RagdollTerrain, point: XYZ): TerrainBox[] {
  const boxes: TerrainBox[] = [];
  const add = (
    name: string,
    x: number,
    top: number,
    z: number,
    w: number,
    h: number,
    d: number,
    yaw = 0,
  ) => boxes.push({ name, position: [x, top - h / 2, z], size: [w, h, d], yaw, top });
  const cx = Math.round(point[0]),
    cz = Math.round(point[2]);
  for (let x = cx - 4; x <= cx + 4; x++)
    for (let z = cz - 4; z <= cz + 4; z++) {
      const tile = world.tiles.get(key(x, z));
      if (!tile) continue;
      add(`floor:${key(x, z)}`, x, tile.h + (tile.surface === 'stair' ? 0.03 : 0), z, 1, 1, 1);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (world.tiles.has(key(x + dx, z + dz))) continue;
        add(
          `wall:${key(x, z)}:${dx},${dz}`,
          x + dx * WALL_OFFSET,
          tile.h + 3.4,
          z + dz * WALL_OFFSET,
          dx ? WALL_THICKNESS : WALL_LENGTH,
          3.4,
          dz ? WALL_THICKNESS : WALL_LENGTH,
        );
        for (const [i, section] of WALL_BASE.entries())
          add(
            `wall-base:${key(x, z)}:${dx},${dz}:${i}`,
            x + dx * WALL_OFFSET,
            tile.h + section.center + section.height / 2,
            z + dz * WALL_OFFSET,
            (dx ? WALL_THICKNESS : WALL_LENGTH) + section.overhang,
            section.height,
            (dz ? WALL_THICKNESS : WALL_LENGTH) + section.overhang,
          );
        const cap = 0.74 + Math.floor((tile.room ? 2.3 : 1.5) / 0.46 + 1e-6) * 0.46;
        add(
          `wall-cap:${key(x, z)}:${dx},${dz}`,
          x + dx * WALL_OFFSET,
          tile.h + cap + WALL_CAP.height / 2,
          z + dz * WALL_OFFSET,
          (dx ? WALL_THICKNESS : WALL_LENGTH) + WALL_CAP.overhang,
          WALL_CAP.height,
          (dz ? WALL_THICKNESS : WALL_LENGTH) + WALL_CAP.overhang,
        );
      }
    }
  for (const b of world.physicalObstacles ?? []) {
    if (
      Math.abs(b.position[0] - cx) <= 5 + b.size[0] / 2 &&
      Math.abs(b.position[2] - cz) <= 5 + b.size[2] / 2
    )
      boxes.push(b);
  }
  for (const b of world.physicalObstacles ? [] : world.blockers) {
    if (Math.abs(b.x - cx) > 5 + b.w / 2 || Math.abs(b.z - cz) > 5 + b.d / 2) continue;
    const h = heightAt(world, b.x, b.z) ?? 0;
    // World blocker footprints are the authoritative furniture/pillar envelopes.
    add(`prop:${b.id}`, b.x, h + 2.4, b.z, b.w, 2.4, b.d, b.rotation ?? 0);
  }
  for (const door of world.entities) {
    if (
      door.type !== 'door' ||
      (door.open && !door.collider?.checkCollisions) ||
      Math.abs(door.x - cx) > 5 ||
      Math.abs(door.z - cz) > 5
    )
      continue;
    add(
      `door:${door.id}`,
      door.x,
      door.h + DOOR_HEIGHT,
      door.z,
      door.axis === 'x' ? 0.4 : 2.96,
      DOOR_HEIGHT,
      door.axis === 'x' ? 2.96 : 0.4,
    );
  }
  return boxes;
}

/** Isolated presentation-only rigid-body island. Collision masks exclude living actors and other
 * corpses; constraints keep this body's anatomy together. Frozen remains retain no solver objects. */
export class Ragdoll {
  readonly world: Float64Array;
  readonly seed: string;
  private readonly terrain: RagdollTerrain;
  private simulation: World | null;
  private readonly parts: Body[] = [];
  private readonly joints: ConeTwistConstraint[] = [];
  private readonly statics = new Map<string, Body>();
  private readonly offsets: Float64Array[] = [];
  private readonly deltas: Float64Array[] = [];
  private readonly start: Float64Array;
  private readonly owners: number[];
  private age = 0;
  private remainder = 0;
  private quiet = 0;
  private retired = false;
  private terrainKey = '';
  settled = false;
  contacts = 0;
  maxJointError = 0;
  private readonly matrix = new Float64Array(16);
  private readonly scratch = {
    position: new PoseVector(),
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: new PoseVector().setAll(1),
  };
  constructor(
    terrain: RagdollTerrain,
    source: PoseSnapshot,
    travel: XYZ | null,
    magnitude: number,
    seed = 'death',
    shapes: readonly RagdollShape[] = [],
  ) {
    this.terrain = terrain;
    this.seed = seed;
    this.world = new Float64Array(source.world);
    this.start = new Float64Array(source.world);
    const simulation = (this.simulation = new World({
      gravity: new Vec3(0, -18, 0),
      allowSleep: true,
    }));
    simulation.broadphase = new SAPBroadphase(simulation);
    const solver = new GSSolver();
    solver.iterations = 16;
    solver.tolerance = 1e-6;
    simulation.solver = solver;
    simulation.defaultContactMaterial.friction = 0.55;
    simulation.defaultContactMaterial.restitution = 0.12;
    const impulse = deathImpulse(travel, magnitude, seed);
    const random = randomFrom(`${seed}:spin`);
    for (const [index, spec] of source.bodies.entries()) {
      const body = new Body({
        mass:
          spec.joint === 'pelvis' || spec.joint === 'chest'
            ? 4
            : spec.joint.startsWith('tail')
              ? 0.25
              : 1,
        position: vec(spec.position),
        linearDamping: 0.12,
        angularDamping: 0.4,
        collisionFilterGroup: 2,
        collisionFilterMask: 1,
        sleepSpeedLimit: 0.18,
        sleepTimeLimit: 0.5,
      });
      body.quaternion.set(...spec.rotation);
      const geometry = shapes.filter((s) => s.body === index);
      if (geometry.length)
        for (const shape of geometry)
          body.addShape(
            new Box(new Vec3(shape.size[0] / 2, shape.size[1] / 2, shape.size[2] / 2)),
            vec(shape.center),
            new Quaternion(...shape.rotation),
          );
      else
        body.addShape(
          new Box(new Vec3(...(spec.size.map((v) => v / 2) as [number, number, number]))),
        );
      body.velocity.set(...(spec.linear.map((v, i) => v + impulse[i]) as [number, number, number]));
      body.angularVelocity.set(
        ...(spec.angular.map(
          (v) => Math.max(-14, Math.min(14, v)) + (travel ? (random() - 0.5) * 3 : 0),
        ) as [number, number, number]),
      );
      simulation.addBody(body);
      this.parts.push(body);
      this.bodyMatrix(body);
      const inv = new Float64Array(16);
      inverse(this.matrix, 0, inv);
      this.offsets.push(inv);
      this.deltas.push(new Float64Array(16));
    }
    this.owners = source.definition.joints.map((_, i) => bodyOwner(source, i));
    for (let i = 0; i < source.bodies.length; i++) {
      const spec = source.bodies[i];
      if (spec.parent < 0) continue;
      const a = this.parts[spec.parent],
        b = this.parts[i];
      const hinge = spec.joint.endsWith('Shin') || spec.joint.endsWith('Forearm');
      const axis = b.vectorToWorldFrame(new Vec3(hinge ? 1 : 0, hinge ? 0 : 1, 0));
      const waist = source.definition.index.spine * 16;
      const anchor =
        spec.joint === 'chest'
          ? new Vec3(source.world[waist + 12], source.world[waist + 13], source.world[waist + 14])
          : vec(spec.anchor);
      const joint = new ConeTwistConstraint(a, b, {
        pivotA: a.pointToLocalFrame(anchor),
        pivotB: b.pointToLocalFrame(anchor),
        axisA: a.vectorToLocalFrame(axis),
        axisB: b.vectorToLocalFrame(axis),
        angle: hinge
          ? 0.04
          : spec.joint.startsWith('tail')
            ? 0.6
            : spec.joint === 'chest'
              ? 0.55
              : 1.1,
        twistAngle: hinge ? 1.5 : 0.55,
        maxForce: 1e5,
        collideConnected: false,
      });
      this.joints.push(joint);
      simulation.addConstraint(joint);
    }
    this.syncTerrain();
  }
  get bodyCount(): number {
    return this.parts.length;
  }
  get constraintCount(): number {
    return this.joints.length;
  }
  get staticCount(): number {
    return this.statics.size;
  }
  get velocities(): XYZ[] {
    return this.parts.map((b) => [b.velocity.x, b.velocity.y, b.velocity.z]);
  }
  private bodyMatrix(body: Body): void {
    this.scratch.position.copyFrom(body.position);
    Object.assign(this.scratch.rotation, body.quaternion);
    compose(this.scratch, this.matrix);
  }
  private syncTerrain(): void {
    const simulation = this.simulation;
    if (!simulation) return;
    const p = this.parts[0].position;
    const terrainKey = `${Math.round(p.x)},${Math.round(p.z)}:${this.terrain.entities
      .filter((e) => e.type === 'door')
      .map((e) => (e.type === 'door' && e.open && !e.collider?.checkCollisions ? '1' : '0'))
      .join('')}`;
    if (terrainKey === this.terrainKey) return;
    this.terrainKey = terrainKey;
    const boxes = physicalTerrain(this.terrain, [p.x, p.y, p.z]);
    const current = new Set(boxes.map((b) => b.name));
    for (const [name, body] of this.statics)
      if (!current.has(name)) {
        simulation.removeBody(body);
        this.statics.delete(name);
      }
    for (const box of boxes)
      if (!this.statics.has(box.name)) {
        const body = new Body({
          mass: 0,
          position: vec(box.position),
          collisionFilterGroup: 1,
          collisionFilterMask: 2,
        });
        body.addShape(new Box(new Vec3(box.size[0] / 2, box.size[1] / 2, box.size[2] / 2)));
        body.quaternion.setFromAxisAngle(new Vec3(0, 1, 0), box.yaw);
        simulation.addBody(body);
        this.statics.set(box.name, body);
      }
  }
  private publish(): void {
    this.parts.forEach((b, i) => {
      this.bodyMatrix(b);
      multiplyAffine(this.matrix, 0, this.offsets[i], 0, this.deltas[i], 0);
    });
    for (let i = 0; i < this.owners.length; i++)
      multiplyAffine(this.deltas[this.owners[i]], 0, this.start, i * 16, this.world, i * 16);
    for (const j of this.joints) {
      const a = j.bodyA.pointToWorldFrame(j.pivotA),
        b = j.bodyB.pointToWorldFrame(j.pivotB);
      this.maxJointError = Math.max(this.maxJointError, a.distanceTo(b));
    }
  }
  advance(dt: number): void {
    const simulation = this.simulation;
    if (this.retired || this.settled || !simulation || dt <= 0) return;
    // Caller owns 60Hz gameplay. No wall-clock catch-up or unbounded substep loop.
    const elapsed = Math.min(dt, 1 / 60);
    this.remainder += elapsed;
    this.age += elapsed;
    this.syncTerrain();
    for (let i = 0; i < 3 && this.remainder >= STEP - 1e-10; i++) {
      simulation.step(STEP);
      this.contacts += simulation.contacts.length;
      this.remainder -= STEP;
    }
    this.publish();
    const quiet = this.parts.every(
      (b) => b.velocity.length() < 0.18 && b.angularVelocity.length() < 0.25,
    );
    this.quiet = quiet ? this.quiet + elapsed : 0;
    if ((this.age > 0.5 && this.quiet > 0.5) || this.age >= RAGDOLL_LIFETIME) this.freeze();
  }
  freeze(): void {
    if (this.settled) return;
    this.settled = true;
    this.release();
  }
  private release(): void {
    for (const joint of this.joints) this.simulation?.removeConstraint(joint);
    for (const body of [...this.parts, ...this.statics.values()]) this.simulation?.removeBody(body);
    this.parts.length = this.joints.length = 0;
    this.statics.clear();
    // Cannon contact/friction pools refer to the last bodies too; release the entire island.
    this.simulation = null;
  }
  dispose(): void {
    this.release();
    this.retired = true;
  }
}
