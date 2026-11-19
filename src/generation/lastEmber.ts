import type { World, Spawn } from '../worldTypes.ts';

export const EMBER = {
  shrine: 'ember:shrine',
  focus: 'ember:focus',
  worker: 'goblin:smithy:0',
  restore: 'ember:restore',
  profane: 'ember:profane',
  cleanse: 'ember:cleanse',
  repair: 'ember:repair',
  rite: 'ember:old-rite',
} as const;

export interface EmberSite extends Spawn {
  id: string;
  sourceId: string;
  approach: Spawn;
}
/** Reuse authored geometry and its reserved approaches; no late collider placement. */
export function emberBlueprint(world: World) {
  const shrine = world.props.find((p) => p.type === 'shrine' && p.room === 'entrance');
  const focus = world.scenes
    .find((s) => s.room === 'smithy')
    ?.props.find((p) => p.type === 'anvil');
  const clue = world.entities.find((e) => e.type === 'portrait' && e.room === 'entrance');
  if (!shrine?.frontClearance || !focus?.frontClearance || !clue?.approach)
    throw new Error('Last Ember needs shrine, focus and clue approaches');
  const site = (
    id: string,
    sourceId: string,
    p: Spawn,
    approach: { x: number; z: number },
  ): EmberSite => ({ id, sourceId, x: p.x, z: p.z, h: p.h, approach: { ...approach, h: p.h } });
  return {
    shrine: site(EMBER.shrine, `prop:${shrine.id}`, shrine, shrine.frontClearance),
    focus: site(EMBER.focus, `prop:${focus.id}`, focus, focus.frontClearance),
    clue: site(clue.id, clue.id, clue, clue.approach),
  };
}
