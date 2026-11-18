import { compareIds } from './report.ts';
import type { GenerationReport } from './report.ts';

export const GENERATION_CORPUS_SEEDS: readonly string[] = [
  'MOURNING-731',
  'CINDER-42',
  'VIOLET-7',
  ...Array.from({ length: 97 }, (_, index) => `trial-${index}`),
];
export const GALLERY_SEED_LIMIT = 12;

/** Fixed outliers plus evenly spaced area samples; reasons are descriptive, not quality scores. */
export function selectGallerySeeds(reports: readonly GenerationReport[]) {
  const sorted = [...reports].sort((a, b) =>
    compareIds(a.trace.identity.seed, b.trace.identity.seed),
  );
  if (new Set(sorted.map((r) => r.trace.identity.seed)).size !== sorted.length)
    throw new Error('Gallery requires unique seeds');
  const selected = new Map<string, { seed: string; reasons: string[] }>();
  const add = (report: GenerationReport | undefined, reason: string) => {
    if (!report) return;
    const seed = report.trace.identity.seed;
    const entry = selected.get(seed);
    if (entry) {
      if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
    } else if (selected.size < GALLERY_SEED_LIMIT) selected.set(seed, { seed, reasons: [reason] });
  };
  for (const seed of ['MOURNING-731', 'CINDER-42', 'VIOLET-7', 'trial-27'])
    add(
      sorted.find((r) => r.trace.identity.seed === seed),
      seed === 'trial-27' ? 'retry regression' : 'showcase baseline',
    );
  const area = (r: GenerationReport) =>
    (r.bounds.maxX - r.bounds.minX) * (r.bounds.maxZ - r.bounds.minZ);
  const extremes: [string, (r: GenerationReport) => number][] = [
    ['compact', area],
    ['sprawling', (r) => -area(r)],
    ['long required route', (r) => -(r.progression.requiredRoute ?? 0)],
    ['most retries', (r) => -r.trace.attempts.length],
    ['most loops', (r) => -r.graph.loops],
    ['tightest room', (r) => Math.min(...r.rooms.map((room) => room.openAreaTiles))],
    ['most doors', (r) => -r.resources.doors],
  ];
  for (const [reason, score] of extremes)
    add(
      [...sorted].sort(
        (a, b) => score(a) - score(b) || compareIds(a.trace.identity.seed, b.trace.identity.seed),
      )[0],
      reason,
    );
  const byArea = [...sorted].sort(
    (a, b) => area(a) - area(b) || compareIds(a.trace.identity.seed, b.trace.identity.seed),
  );
  const remaining = byArea.filter((r) => !selected.has(r.trace.identity.seed));
  const slots = Math.min(GALLERY_SEED_LIMIT - selected.size, remaining.length);
  for (let i = 0; i < slots; i++)
    add(remaining[Math.floor(((i + 0.5) * remaining.length) / slots)], 'area distribution');
  return [...selected.values()];
}
