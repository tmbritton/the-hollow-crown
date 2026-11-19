import { generateRoyalPortrait } from '../royalty.ts';
import { generationIdentity } from './identity.ts';
import { randomStream } from './random.ts';
import type { World } from '../worldTypes.ts';

/** Bind accepted placement to existing facts; no placement RNG or gameplay flags are changed. */
export function applyKeepPresentation(world: World): void {
  const keep = world.keep;
  const [founder, heir, last] = keep.monarchs;
  const ending = `${keep.profile.catastrophe}, ending the reign of ${last.title} in year ${last.reignEnd}.`;
  const rooms = world.roomById;
  rooms.entrance.description = `${keep.profile.name} — House ${keep.house}. ${ending}`;
  rooms.entrance.factIds = ['fact:catastrophe'];
  rooms.crypt.description = `${last.title} of House ${keep.house} is commemorated here. ${ending}`;
  rooms.crypt.factIds = ['fact:memorial', 'fact:catastrophe'];
  rooms.altar.description = `${ending} Kindle the violet altar to unseal the throne gate.`;
  rooms.altar.factIds = ['fact:catastrophe'];
  rooms.throne.description = `${last.title} of House ${keep.house} held this seat in years ${last.reignStart}–${last.reignEnd}. Kindle the altar before claiming the Hollow Crown.`;
  rooms.throne.factIds = [];

  const identity = generationIdentity(world.seed);
  const portraits = world.entities.filter((entity) => entity.type === 'portrait');
  // The entrance introduces the founder; the next two surviving paintings establish succession.
  const rank = (room: string) => (room === 'entrance' ? 0 : room === 'throne' ? 1 : 2);
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  portraits.sort(
    (a, b) =>
      rank(a.room) - rank(b.room) ||
      compare(a.room, b.room) ||
      a.x - b.x ||
      a.z - b.z ||
      a.rotation - b.rotation ||
      compare(a.id, b.id),
  );
  for (const [index, portrait] of portraits.entries()) {
    const paintingId = JSON.stringify([portrait.room, portrait.x, portrait.z, portrait.rotation]);
    const painting = randomStream(identity, 'painting', paintingId);
    const person =
      index === 0
        ? founder
        : index === 1
          ? last
          : index === 2
            ? heir
            : keep.monarchs[
                Math.floor(
                  randomStream(identity, 'painting-subject', paintingId)() * keep.monarchs.length,
                )
              ];
    const appearance = generateRoyalPortrait(
      randomStream(identity, 'monarch-appearance', person.id),
    );
    const event = keep.history.find((event) => event.personId === person.id);
    portrait.royal = {
      ...appearance,
      personId: person.id,
      title: person.title,
      house: keep.house,
      year: person.reignStart + Math.floor(painting() * (person.reignEnd - person.reignStart)),
      // Different painters can vary the composition while the subject's core traits agree.
      artSeed: 1 + Math.floor(painting() * 10000),
      palette: keep.profile.palette,
      beard: person.title.startsWith('Queen ') ? 0 : appearance.beard,
      // A subject link is not permission to disclose the monarch's entire biography.
      factIds: event ? [event.factId] : [],
      description: `${event?.text ?? person.title} Reign: ${person.reignStart}–${person.reignEnd}.`,
    };
  }
}
