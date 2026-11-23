import type { Actor } from './actors.ts';
import type { Spawn, World } from './worldTypes.ts';
import { randomFrom } from './world.ts';
import type { ECS } from './ecs.ts';
import { tributeBlueprint } from './generation/tribute.ts';

export type SocialActivity = 'cards' | 'hackysack' | 'smoke';
export interface SocialGroup {
  id: string;
  activity: SocialActivity;
  center: Spawn;
  members: string[];
  phase: number;
}

/** Place gatherings on validated floor. Each participant owns its own behavior. */
export function seedSocialGroups(actors: Actor[], world: World): void {
  const tribute = tributeBlueprint(world),
    approaches = [...tribute.cargo, tribute.exit];
  const random = randomFrom(`${world.seed}:social`);
  const activities: SocialActivity[] = ['cards', 'hackysack', 'smoke'];
  for (let i = activities.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [activities[i], activities[j]] = [activities[j], activities[i]];
  }
  const packs = new Map<string, Actor[]>();
  for (const actor of actors) {
    const brain = actor.brain;
    if (!brain || actor.kind === 'skeleton') continue;
    const id = brain.pack || `social:${actor.id}`;
    const members = packs.get(id) ?? [];
    members.push(actor);
    packs.set(id, members);
  }
  let packIndex = 0;
  for (const [id, members] of packs) {
    const leader = members[0];
    let center: Spawn = { ...leader.position };
    let activity: SocialActivity =
      members.length > 1 ? activities[packIndex++ % activities.length] : 'smoke';
    if (members.length > 1) {
      const room = world.tiles.get(`${Math.round(center.x)},${Math.round(center.z)}`)?.room;
      const candidates = [...world.tiles.values()]
        .filter((tile) => tile.room === room && tile.surface === 'stone' && !tile.ramp)
        .map((tile) => ({ tile, order: random() }))
        .sort((a, b) => a.order - b.order);
      let placed = false;
      for (const { tile } of candidates) {
        const positions = members.map((_, i) => ({
          x: tile.x + Math.sin((i * Math.PI * 2) / members.length) * 1.35,
          z: tile.z + Math.cos((i * Math.PI * 2) / members.length) * 1.35,
          h: tile.h,
        }));
        if (
          !leader.navigator.canStand(tile) ||
          !positions.every(
            (p, i) =>
              members[i].navigator.canStand(p) &&
              members[i].navigator.segmentClear(tile, p) &&
              approaches.every((at) => Math.hypot(p.x - at.x, p.z - at.z) > 1.2) &&
              world.entities.every(
                (entity) =>
                  !entity.approach ||
                  Math.hypot(p.x - entity.approach.x, p.z - entity.approach.z) > 1.2,
              ) &&
              actors.every(
                (other) =>
                  members.includes(other) ||
                  Math.hypot(p.x - other.position.x, p.z - other.position.z) > 1.25,
              ),
          )
        )
          continue;
        center = { x: tile.x, z: tile.z, h: tile.h };
        members.forEach((actor, i) => {
          actor.entity.setPosition({ ...actor.position, ...positions[i] });
          actor.brain!.home = { ...positions[i] };
        });
        placed = true;
        break;
      }
      if (!placed) activity = 'smoke';
    }
    const group: SocialGroup = {
      id,
      activity,
      center,
      members: members.map((a) => a.id),
      phase: random() * 10,
    };
    for (const actor of members) {
      actor.brain!.social = group;
      if (members.length > 1)
        actor.position.heading = Math.atan2(
          center.x - actor.position.x,
          center.z - actor.position.z,
        );
    }
  }
}

export function isSocializing(actor: Actor): boolean {
  const state = actor.brain?.state;
  return (
    actor.alive &&
    !actor.attack.target &&
    !actor.attack.swing &&
    !actor.entity.has('work') &&
    (state === 'cards' || state === 'hackysack' || state === 'smoke')
  );
}

export function hackySackPass(group: SocialGroup, ecs: ECS, time: number) {
  const members = group.members.filter((id) => {
    const entity = ecs.get(id);
    return (
      (entity?.get('health')?.current ?? 0) > 0 &&
      entity?.get('brain')?.state === 'hackysack' &&
      !entity.get('attack')?.target
    );
  });
  if (members.length < 2) return null;
  const turn = (time + group.phase) / 1.15;
  const index = Math.floor(turn) % members.length;
  return { from: members[index], to: members[(index + 1) % members.length], progress: turn % 1 };
}
