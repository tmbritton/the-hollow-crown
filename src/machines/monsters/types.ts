import type { SocialActivity } from '../../social.ts';

/** Sensing produces facts; individual species charts decide what to do with them. */
export interface MonsterPerception {
  type: 'THINK';
  hasTarget: boolean;
  navigating: boolean;
  threatened: boolean;
  swinging: boolean;
  hidden: boolean;
  rested: boolean;
  readyToShoot: boolean;
  coolingDown: boolean;
  regroup: boolean;
  melee: boolean;
  atHome: boolean;
  activity: SocialActivity;
}
export type MonsterEvent =
  | MonsterPerception
  | { type: 'ENGAGE'; melee: boolean; swinging: boolean }
  | { type: 'DIE' }
  | { type: 'REVIVE' };
