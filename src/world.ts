import { MAX_GENERATION_ATTEMPTS } from './generation/identity.ts';
import { runGeneration } from './generation/run.ts';
import type { GenerationResult } from './generation/pipeline.ts';
import type { GenerationDiagnostics } from './generation/diagnostics.ts';
import type { World } from './worldTypes.ts';

export { INWARD_FACING_TYPES, ROOM_DEFINITIONS, validateDungeon } from './generation/stages.ts';
export { heightAt, key, tileAt, reachableTiles, reachableTileDistances } from './worldSpatial.ts';
export { localPoint, footprint } from './generation/placement.ts';
export { randomFrom } from './generation/random.ts';

export function generateDungeon(seed = 'MOURNING-731'): World {
  return generateDungeonWithReport(seed).world;
}

export function generateDungeonWithReport(
  seed = 'MOURNING-731',
  {
    maxAttempts = MAX_GENERATION_ATTEMPTS,
    diagnostics,
  }: { maxAttempts?: number; diagnostics?: GenerationDiagnostics } = {},
): GenerationResult {
  return runGeneration(seed, maxAttempts, diagnostics);
}
