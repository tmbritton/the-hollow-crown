import type { DungeonDebug, Snapshot } from '../src/gameTypes.ts';

/** Browser callbacks run after the suite has waited for the opt-in harness. */
export type DebugWindow = Window & { __dungeon: DungeonDebug };
export interface TestReport {
  checks: string[];
  success?: boolean;
  error?: string;
  errors?: string[];
}
export interface ShadowProbe {
  allCast: boolean;
  allReceive: boolean;
  allLit: boolean;
  parts: number;
  darkenedPixels: number;
  totalDifference: number;
  locallyLitPixels: number;
}
export interface BrowserReport extends TestReport {
  browser: string;
  screenshots: string[];
  heroShadow?: ShadowProbe;
  renderer?: string;
  regenerations: Pick<
    Snapshot,
    'seed' | 'meshes' | 'materials' | 'textures' | 'effects' | 'shaderSources'
  >[];
  browserErrors?: string[];
}
export interface InspectionReport extends TestReport {
  detailProbe?: { changedPixels: number; traits: number[] };
}
export interface ProfileSample extends Snapshot {
  meanMs: number;
  p95Ms: number;
  heapBytes?: number;
}
export interface ProfileReport {
  date: string;
  viewport: string;
  quality: string;
  samples: ProfileSample[];
  renderer?: string;
  browser?: string;
  inspector?: string;
  errors?: string[];
}
