import type { Components } from '../ecs.ts';
import { PoseVector } from './types.ts';
import type { JointName, JointPose, PoseBuffer } from './types.ts';
import { resetLocal, setEuler } from './pose.ts';

/** Temporary numerical adapter for the authored A0 samplers. No Babylon mutation methods. */
export class LegacyNode {
  readonly position = new PoseVector();
  readonly rotation = new PoseVector();
  readonly scaling = new PoseVector().setAll(1);
  parent: LegacyNode | null = null;
  enabled = true;
  setEnabled(value: boolean): void {
    this.enabled = value;
  }
}
type Nodes =
  | 'root'
  | 'body'
  | 'head'
  | 'arms'
  | 'forearms'
  | 'legs'
  | 'knees'
  | 'feet'
  | 'cape'
  | 'shield'
  | 'spear'
  | 'javelin'
  | 'weapon'
  | 'stowed'
  | 'equipment'
  | 'stowedEquipment';
export type LegacyRig = Omit<Components['rig'], Nodes> & {
  root: LegacyNode;
  body: LegacyNode;
  head?: LegacyNode;
  arms: LegacyNode[];
  forearms: LegacyNode[];
  legs: LegacyNode[];
  knees: LegacyNode[];
  feet: LegacyNode[];
  cape?: LegacyNode;
  shield?: LegacyNode;
  spear?: LegacyNode;
  javelin?: LegacyNode;
  equipment?: LegacyNode[];
  stowedEquipment?: LegacyNode[];
};
function copy(source: LegacyNode, target: JointPose): void {
  target.position.copyFrom(source.position);
  target.scale.copyFrom(source.scaling);
  setEuler(target, source.rotation.x, source.rotation.y, source.rotation.z);
}

/** Convert old pivots/absolute hip offsets to the shared parent-first anatomical topology.
 * Legacy body bob stays in spine/thigh translations until A3 moves it into coordinated pelvis goals. */
export function sampleLegacy(rig: LegacyRig, pose: PoseBuffer): void {
  resetLocal(pose);
  const joint = (name: JointName) => pose.local[pose.definition.index[name]];
  copy(rig.root, joint('root'));
  copy(rig.body, joint('spine'));
  if (rig.head) copy(rig.head, joint('head'));
  for (const [i, side] of (['left', 'right'] as const).entries()) {
    const shoulder = joint(`${side}Shoulder`),
      upper = joint(`${side}UpperArm`),
      thigh = joint(`${side}Thigh`);
    shoulder.position.copyFrom(rig.arms[i].position);
    shoulder.position.y -= 0.95;
    copy(rig.arms[i], upper);
    upper.position.setAll(0);
    copy(rig.forearms[i], joint(`${side}Forearm`));
    copy(rig.legs[i], thigh);
    thigh.position.y -= 0.55;
    copy(rig.knees[i], joint(`${side}Shin`));
    copy(rig.feet[i], joint(`${side}Foot`));
  }
}
