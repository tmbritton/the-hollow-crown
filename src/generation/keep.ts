import { randomStream } from './random.ts';
import type { GenerationIdentity } from './identity.ts';
import type { RoomId } from '../worldTypes.ts';

export type KeepProfileId = 'ashen-foundry' | 'drowned-court' | 'pilgrim-redoubt';
export interface KeepProfile {
  id: KeepProfileId;
  name: string;
  purpose: string;
  occupation: string;
  scarcity: string;
  catastrophe: string;
  catastropheRoom: RoomId;
  symbol: string;
  palette: number;
  epithets: readonly [string, string, string];
}

/** Authored compatible combinations; composition/visual expression is a later consumer. */
export const KEEP_PROFILES: readonly KeepProfile[] = [
  {
    id: 'ashen-foundry',
    name: 'Ashen Foundry',
    purpose: 'A royal foundry sustained by sworn labor',
    occupation: 'Scavengers shelter among unfinished royal commissions',
    scarcity: 'Fuel and sound iron',
    catastrophe: 'The crown furnace burned through its bindings',
    catastropheRoom: 'lava',
    symbol: 'a crown above a split anvil',
    palette: 5,
    epithets: ['the Forgebinder', 'the Ironhearted', 'the Ashen'],
  },
  {
    id: 'drowned-court',
    name: 'Drowned Court',
    purpose: 'A court built above its dynastic burial halls',
    occupation: 'Survivors and scavengers occupy the dry upper chambers',
    scarcity: 'Dry shelter and unspoiled stores',
    catastrophe: 'The lower gallery was deliberately flooded to seal the dead',
    catastropheRoom: 'water',
    symbol: 'a crown beneath three waves',
    palette: 1,
    epithets: ['the Stonekeeper', 'the Mourning', 'the Last Tide'],
  },
  {
    id: 'pilgrim-redoubt',
    name: 'Pilgrim Redoubt',
    purpose: 'A fortified sanctuary on a forgotten pilgrimage road',
    occupation: 'Survivors and scavengers shelter around the old sanctuary',
    scarcity: 'Food and safe passage',
    catastrophe: 'The sanctuary gates were sealed during the final siege',
    catastropheRoom: 'entrance',
    symbol: 'a flame within a broken crown',
    palette: 2,
    epithets: ['the Waymaker', 'the Oathkeeper', 'the Vigilant'],
  },
];

export interface MonarchIdentity {
  id: string;
  title: string;
  house: string;
  reignStart: number;
  reignEnd: number;
  predecessorId: string | null;
}
export type KeepFact = {
  id: string;
  personId: string;
} & (
  | { kind: 'successorOf'; predecessorId: string }
  | { kind: 'founded' | 'catastrophe' | 'commemoratedAt'; room: RoomId }
);
export interface HistoryEvent {
  id: string;
  year: number;
  personId: string;
  factId: string;
  text: string;
}
export interface KeepIdentity {
  profile: KeepProfile;
  house: string;
  monarchs: MonarchIdentity[];
  facts: KeepFact[];
  history: HistoryEvent[];
}

/** IDs are semantic within a versioned run; persist them together with GenerationIdentity. */
export function generateKeepIdentity(identity: GenerationIdentity): KeepIdentity {
  const choose = <T>(domain: string, id: string, values: readonly T[]) =>
    values[Math.floor(randomStream(identity, domain, id)() * values.length)];
  const profile = structuredClone(choose('keep', 'profile', KEEP_PROFILES));
  const house = choose('keep', 'house', [
    'Veyr',
    'Thorne',
    'Mourn',
    'Caldrien',
    'Valecourt',
    'Blackbriar',
  ]);
  const dates = randomStream(identity, 'history', 'chronology');
  let year = 80 + Math.floor(dates() * 250);
  const monarchs = ['founder', 'heir', 'last'].map((role, index): MonarchIdentity => {
    const id = `monarch:${role}`;
    const rank = choose('monarch', `${id}:rank`, ['King', 'Queen', 'Regent']);
    const name = choose('monarch', `${id}:name`, [
      'Alwen',
      'Osric',
      'Ysra',
      'Mordren',
      'Elian',
      'Vesper',
      'Caelis',
      'Rowan',
      'Isolde',
      'Theron',
      'Maera',
      'Valen',
    ]);
    const reignStart = year;
    year += 18 + Math.floor(dates() * 25);
    return {
      id,
      title: `${rank} ${name} ${profile.epithets[index]}`,
      house,
      reignStart,
      reignEnd: year,
      predecessorId: index === 0 ? null : index === 1 ? 'monarch:founder' : 'monarch:heir',
    };
  });
  const [founder, heir, last] = monarchs;
  const facts: KeepFact[] = [
    { id: 'fact:founding', kind: 'founded', personId: founder.id, room: 'entrance' },
    {
      id: 'fact:succession:heir',
      kind: 'successorOf',
      personId: heir.id,
      predecessorId: founder.id,
    },
    { id: 'fact:succession:last', kind: 'successorOf', personId: last.id, predecessorId: heir.id },
    {
      id: 'fact:catastrophe',
      kind: 'catastrophe',
      personId: last.id,
      room: profile.catastropheRoom,
    },
    { id: 'fact:memorial', kind: 'commemoratedAt', personId: last.id, room: 'crypt' },
  ];
  const history: HistoryEvent[] = [
    {
      id: 'event:founding',
      year: founder.reignStart,
      personId: founder.id,
      factId: 'fact:founding',
      text: `${founder.title} of House ${house} founded the keep: ${profile.purpose.toLowerCase()}.`,
    },
    {
      id: 'event:succession:heir',
      year: heir.reignStart,
      personId: heir.id,
      factId: 'fact:succession:heir',
      text: `${heir.title} of House ${house} succeeded ${founder.title}.`,
    },
    {
      id: 'event:succession:last',
      year: last.reignStart,
      personId: last.id,
      factId: 'fact:succession:last',
      text: `${last.title} of House ${house} succeeded ${heir.title}.`,
    },
    {
      id: 'event:catastrophe',
      year: last.reignEnd,
      personId: last.id,
      factId: 'fact:catastrophe',
      text: `${profile.catastrophe} in the final year of ${last.title} of House ${house}.`,
    },
  ];
  return { profile, house, monarchs, facts, history };
}
