import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Inspect the actual current build, including lazy chunks, rather than assuming DEV guards erase it.
const files = (await readdir('dist/assets')).filter((file) => file.endsWith('.js'));
assert.ok(files.length > 0, 'Build the application before checking CPU diagnostics isolation');
let hasTargetedPreparation = false;
for (const file of files) {
  const source = await readFile(`dist/assets/${file}`, 'utf8');
  assert.doesNotMatch(
    source,
    /CPU session|CPU sample|CPU metric|route\.expanded|alloc\.poseSnapshots|physics\.terrainChecks|binding\.(transfer|completion|draw)|grounding\.solve|cpuProfile|cpuMetrics|encounterAttack|encounterSquad|encounterCapture|Visit wall deadline|encounter-trace:|Trace requires CPU scopes off|shaderTrialObservation|__shaderTrial|shader-trial/,
    `Measurement code leaked into ${file}`,
  );
  hasTargetedPreparation ||= source.includes('Scale program preparation timed out');
}
assert.ok(hasTargetedPreparation, 'Production build is missing targeted shader preparation');
console.log(`PASS production measurement isolation: ${files.length} bundled JavaScript chunks`);
