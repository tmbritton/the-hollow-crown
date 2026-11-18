import { Statechart } from '../statechart.ts';
import { skeletonMachine } from './skeleton.ts';
import { goblinMachine } from './goblin.ts';
import { koboldMachine } from './kobold.ts';
import type { EnemyKind } from '../../ecs.ts';

export function createMonsterBehavior(kind: EnemyKind) {
  switch (kind) {
    case 'skeleton':
      return new Statechart(skeletonMachine);
    case 'goblin':
      return new Statechart(goblinMachine);
    case 'kobold':
      return new Statechart(koboldMachine);
  }
}
export type MonsterBehavior = ReturnType<typeof createMonsterBehavior>;
export type BrainState = MonsterBehavior['snapshot']['value'];
