/** Bump these when the public seed interpretation or authored content changes. */
export const GENERATOR_VERSION = 'layout-v2';
export const CONTENT_VERSION = 'keep-v1';
export const MAX_GENERATION_ATTEMPTS = 40;

export interface GenerationIdentity {
  seed: string;
  generatorVersion: string;
  contentVersion: string;
}

export interface GenerationAttempt {
  attempt: number;
  stage: 'placement' | 'validation' | 'accepted';
  reasons: string[];
}

export interface GenerationTrace {
  identity: GenerationIdentity;
  acceptedAttempt: number | null;
  attempts: GenerationAttempt[];
}

export function generationIdentity(seed: string): GenerationIdentity {
  return { seed, generatorVersion: GENERATOR_VERSION, contentVersion: CONTENT_VERSION };
}

export class GenerationError extends Error {
  readonly report: GenerationTrace;

  constructor(report: GenerationTrace) {
    super(`Could not construct a traversable dungeon for seed ${report.identity.seed}`);
    this.name = 'GenerationError';
    this.report = report;
  }
}
