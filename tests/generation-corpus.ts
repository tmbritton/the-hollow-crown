import { mkdir, writeFile } from 'node:fs/promises';
import { generateDungeonWithReport } from '../src/world.ts';
import { createGenerationReport } from '../src/generation/report.ts';
import { GENERATION_CORPUS_SEEDS, selectGallerySeeds } from '../src/generation/corpus.ts';

const traceSeed = process.env.GENERATION_TRACE_SEED;
const local = traceSeed
  ? (await import('../src/generation/localDiagnostics.ts')).createLocalGenerationDiagnostics()
  : undefined;

// Process one blueprint at a time; retain only JSON-safe metadata, not worlds or ECS registries.
const reports = GENERATION_CORPUS_SEEDS.map((seed) => {
  const { world, report } = generateDungeonWithReport(seed, {
    diagnostics: seed === traceSeed ? local?.port : undefined,
  });
  return createGenerationReport(world, report);
});
const gallery = selectGallerySeeds(reports);
await mkdir('test-results', { recursive: true });
if (local) {
  try {
    await writeFile(
      'test-results/generation-execution.json',
      JSON.stringify(local.snapshot(), null, 2) + '\n',
    );
  } catch {
    console.warn('Local generation execution export failed');
  } finally {
    local.dispose();
  }
}
await writeFile(
  'test-results/generation-corpus.json',
  JSON.stringify({ schemaVersion: 1, reports, gallery }, null, 2) + '\n',
);
const failures = reports.filter(
  (r) =>
    r.validationErrors.length || r.resources.enemies !== 24 || r.progression.requiredRoute === null,
);
if (failures.length)
  throw new Error(`Invalid corpus seeds: ${failures.map((r) => r.trace.identity.seed).join(', ')}`);
console.log(
  `Exported ${reports.length} valid seeds and ${gallery.length} gallery selections to test-results/generation-corpus.json`,
);
