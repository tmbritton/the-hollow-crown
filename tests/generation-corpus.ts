import { mkdir, writeFile } from 'node:fs/promises';
import { generateDungeonWithReport } from '../src/world.ts';
import { createGenerationReport } from '../src/generation/report.ts';
import { GENERATION_CORPUS_SEEDS, selectGallerySeeds } from '../src/generation/corpus.ts';

// Process one blueprint at a time; retain only JSON-safe metadata, not worlds or ECS registries.
const reports = GENERATION_CORPUS_SEEDS.map((seed) => {
  const { world, report } = generateDungeonWithReport(seed);
  return createGenerationReport(world, report);
});
const gallery = selectGallerySeeds(reports);
await mkdir('test-results', { recursive: true });
await writeFile(
  'test-results/generation-corpus.json',
  JSON.stringify({ schemaVersion: 1, reports, gallery }, null, 2) + '\n',
);
const failures = reports.filter(
  (r) =>
    r.validationErrors.length || r.resources.enemies !== 21 || r.progression.requiredRoute === null,
);
if (failures.length)
  throw new Error(`Invalid corpus seeds: ${failures.map((r) => r.trace.identity.seed).join(', ')}`);
console.log(
  `Exported ${reports.length} valid seeds and ${gallery.length} gallery selections to test-results/generation-corpus.json`,
);
