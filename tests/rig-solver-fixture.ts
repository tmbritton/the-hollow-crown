import { humanoid, profiles } from '../src/rigs/humanoid.ts';
import { createPose, setEuler } from '../src/rigs/pose.ts';
import type { RigDefinition, RigProfile } from '../src/rigs/types.ts';
import type { RigTargets, QuaternionTuple } from '../src/rigs/targets.ts';

/** One action-owned weapon frame, two grip sockets; fixed support and a raised sloping step. */
export function solverFixture(id: RigProfile['id'] | RigDefinition) {
  const definition = typeof id === 'string' ? humanoid(profiles[id]) : id;
  const profile = definition.profile,
    base = createPose(definition);
  const left: [number, number, number] = [-profile.hipWidth, 0, profile.soleForward];
  const right: [number, number, number] = [profile.hipWidth, 0, profile.soleForward];
  const leftGrip: [number, number, number] = [0, 0, 0],
    rightGrip: [number, number, number] = [0, 0, 0];
  const gripRotation: [number, number, number, number] = [0, 0, 0, 1];
  const footRotation: [number, number, number, number] = [0, 0, 0, 1];
  const flat: QuaternionTuple = [0, 0, 0, 1];
  const targets: RigTargets = {
    leftSole: { space: 'world', position: left, rotation: flat, required: true },
    rightSole: { space: 'world', position: right, rotation: footRotation, required: true },
    leftGrip: { space: 'world', position: leftGrip, rotation: gripRotation, required: true },
    rightGrip: { space: 'world', position: rightGrip, rotation: gripRotation, required: true },
  };
  return {
    base,
    targets,
    sample(frame: number, step = false) {
      const phase = (frame / 60) * Math.PI;
      const yaw = Math.sin(phase) * 0.14;
      setEuler(base.local[0], 0, yaw, 0);
      setEuler(base.local[base.definition.index.spine], Math.sin(phase) * 0.045, 0, 0);
      const weaponYaw = Math.sin(phase) * 0.1;
      gripRotation[1] = Math.sin(weaponYaw / 2);
      gripRotation[3] = Math.cos(weaponYaw / 2);
      for (const [position, sign] of [
        [leftGrip, -1],
        [rightGrip, 1],
      ] as const) {
        position[0] = sign * 0.16 * Math.cos(weaponYaw);
        position[1] = profile.shoulderHeight - 0.12 + Math.sin(phase) * 0.015;
        position[2] = 0.53 - sign * 0.16 * Math.sin(weaponYaw);
      }
      const lift = step ? (1 - Math.cos(phase)) * 0.5 : 0;
      right[1] = lift * 0.12;
      right[2] = profile.soleForward + lift * 0.1;
      footRotation[0] = Math.sin(lift * 0.1);
      footRotation[3] = Math.cos(lift * 0.1);
    },
  };
}
