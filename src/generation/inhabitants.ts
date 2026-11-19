import type { Actor } from '../actors.ts';
import type { EnemyKind } from '../ecs.ts';
import type { RoomId, Spawn, World } from '../worldTypes.ts';
import { required } from '../assert.ts';
import { generationIdentity } from './identity.ts';
import { randomStream } from './random.ts';

export interface InhabitantIdentity {
  id: string;
  actorId: string;
  kind: EnemyKind;
  name: string;
  role: 'watchkeeper' | 'lookout' | 'dealer' | 'keeper';
  title: string;
  house: string;
  homeRoom: RoomId;
  home: Spawn;
  groupId: string | null;
  factIds: string[];
  motif: 'crown-clasp' | 'mourning-band' | 'royal-tokens';
  description: string;
}

/** Select from finalized spawns/gatherings; identity never changes capabilities or allegiance. */
export function seedInhabitant(world: World, actors: readonly Actor[]): void {
  const kind: EnemyKind = {
    'ashen-foundry': 'skeleton' as const,
    'drowned-court': 'goblin' as const,
    'pilgrim-redoubt': 'kobold' as const,
  }[world.keep.profile.id];
  const preferredRoom = kind === 'skeleton' ? 'armory' : 'smithy';
  const rank = (actor: Actor) =>
    kind === 'kobold'
      ? actor.brain?.social?.activity === 'cards'
        ? 0
        : 1
      : actor.id.includes(`:${preferredRoom}:`)
        ? 0
        : 1;
  const candidates = actors
    .filter((a) => a.kind === kind && a.brain)
    .sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const actor = candidates[0];
  // Partial diagnostic worlds may have no population; never invent an extra enemy.
  if (!actor) return;
  const brain = required(actor.brain, 'Inhabitant needs a home');
  // A gathering member may stand on a corridor landing; the gathering owns the home room.
  const homeAnchor = brain.social?.center ?? brain.home;
  const homeRoom = required(
    world.tiles.get(`${Math.round(homeAnchor.x)},${Math.round(homeAnchor.z)}`)?.room,
    'Inhabitant home needs a room',
  );
  const role =
    kind === 'skeleton'
      ? 'watchkeeper'
      : kind === 'goblin'
        ? 'lookout'
        : brain.social?.activity === 'cards'
          ? 'dealer'
          : 'keeper';
  const title = {
    watchkeeper: 'Oathbound Watchkeeper',
    lookout: 'Dryward Lookout',
    dealer: 'Royal Token Dealer',
    keeper: 'Royal Token Keeper',
  }[role];
  const names = {
    skeleton: ['Oswen', 'Halric', 'Veyla', 'Marrow'],
    goblin: ['Sedge', 'Nim', 'Brindle', 'Vetch'],
    kobold: ['Kip', 'Tikka', 'Skerr', 'Nackle'],
  }[kind];
  const random = randomStream(generationIdentity(world.seed), 'inhabitant', 'standout:name');
  const name = names[Math.floor(random() * names.length)];
  const motif =
    kind === 'skeleton' ? 'crown-clasp' : kind === 'goblin' ? 'mourning-band' : 'royal-tokens';
  const founding = required(
    world.keep.facts.find((f) => f.kind === 'founded'),
    'Missing founding fact',
  );
  const founder = required(
    world.keep.monarchs.find((m) => m.id === founding.personId),
    'Missing founder',
  );
  const ornament = {
    'crown-clasp': 'a crown clasp',
    'mourning-band': 'a mourning band',
    'royal-tokens': 'royal tokens',
  }[motif];
  const activity =
    role === 'watchkeeper'
      ? 'Wanders the old watch.'
      : role === 'lookout'
        ? 'Smokes between threats; seeks cover to fire.'
        : role === 'dealer'
          ? 'Plays cards with its pack.'
          : 'Rests with its pack.';
  actor.entity.add('inhabitant', {
    id: 'inhabitant:standout',
    actorId: actor.id,
    kind,
    name,
    role,
    title,
    house: world.keep.house,
    homeRoom,
    home: { x: brain.home.x, z: brain.home.z, h: brain.home.h },
    groupId: brain.social?.id ?? null,
    factIds: [founding.id],
    motif,
    description: `${world.roomById[homeRoom].name}. ${activity} Bears ${ornament} of House ${world.keep.house}, whose ${founder.title} founded the keep.`,
  });
}
