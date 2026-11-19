import type { GenerationIdentity } from './identity.ts';

/** Existing numeric stream: keep its algorithm and legacy salts stable for layout-v2. */
export function randomFrom(seed: string | number) {
  let h = 2166136261;
  for (const char of String(seed)) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** New semantic streams include version identity and unambiguous domain/object boundaries. */
export function randomStream(identity: GenerationIdentity, domain: string, objectId: string) {
  return randomFrom(
    JSON.stringify([
      identity.seed,
      identity.generatorVersion,
      identity.contentVersion,
      domain,
      objectId,
    ]),
  );
}
