import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Inspect the actual current build, including lazy chunks, rather than assuming DEV guards erase it.
const files = (await readdir('dist/assets')).filter((file) => file.endsWith('.js'));
assert.ok(files.length > 0, 'Build the application before checking CPU diagnostics isolation');
for (const file of files)
  assert.doesNotMatch(
    await readFile(`dist/assets/${file}`, 'utf8'),
    /CPU session|CPU sample|CPU metric|route\.expanded|alloc\.poseSnapshots|physics\.terrainChecks|cpuProfile|cpuMetrics/,
    `CPU0 diagnostic code leaked into ${file}`,
  );
console.log(`PASS CPU0 production isolation: ${files.length} bundled JavaScript chunks`);
