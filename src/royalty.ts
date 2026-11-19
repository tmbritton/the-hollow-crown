import type { Random } from './worldTypes.ts';

export interface RoyalPortrait {
  personId?: string;
  factIds?: string[];
  description?: string;
  title: string;
  house: string;
  year: number;
  artSeed: number;
  palette: number;
  skin: number;
  hair: number;
  beard: number;
  crown: number;
}

// Portrait identity and appearance are plain seeded data, independent of rendering.
export function generateRoyalPortrait(random: Random): RoyalPortrait {
  const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)];
  const rank = pick(['King', 'Queen', 'Regent', 'Emperor', 'Empress']);
  const name = pick([
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
  const epithet = pick([
    'the Ashen',
    'the Patient',
    'the Last',
    'the Ironhearted',
    'the Pale',
    'the Oathkeeper',
    'the Silent',
    'the Gilded',
  ]);
  return {
    title: `${rank} ${name} ${epithet}`,
    house: pick(['Veyr', 'Thorne', 'Mourn', 'Caldrien', 'Valecourt', 'Blackbriar']),
    year: 80 + Math.floor(random() * 430),
    artSeed: 1 + Math.floor(random() * 10000),
    palette: Math.floor(random() * 6),
    skin: Math.floor(random() * 6),
    hair: Math.floor(random() * 4),
    beard: ['Queen', 'Empress'].includes(rank) ? 0 : Math.floor(random() * 3),
    crown: Math.floor(random() * 3),
  };
}
