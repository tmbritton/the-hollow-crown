import { GALLERY_SEED_LIMIT } from '../src/generation/corpus.ts';
import assert from 'node:assert/strict';
import type { GenerationReport } from '../src/generation/report.ts';
import type { Snapshot } from '../src/gameTypes.ts';

/** Frozen-gallery renders do not run the engine's frame counter or FPS sampler. */
export function galleryResources(snapshot: Snapshot) {
  return {
    meshes: snapshot.meshes,
    materials: snapshot.materials,
    textures: snapshot.textures,
    effects: snapshot.effects,
    shaderSources: snapshot.shaderSources,
    triangles: snapshot.triangles,
  };
}

export function assertGenerationReportsMatch(actual: GenerationReport, expected: GenerationReport) {
  const { encounters: actualActors, ...actualRest } = actual;
  const { encounters: expectedActors, ...expectedRest } = expected;
  assert.deepEqual(actualRest, expectedRest);
  assert.equal(actualActors.length, expectedActors.length);
  for (const [index, actor] of actualActors.entries()) {
    const { x, z, h, ...identity } = actor;
    const { x: ex, z: ez, h: eh, ...expectedIdentity } = expectedActors[index];
    assert.deepEqual(identity, expectedIdentity);
    // Math.sin/cos in social gathering placement can differ by an ulp across JS engines.
    assert.ok(
      Math.abs(x - ex) < 1e-9 && Math.abs(z - ez) < 1e-9 && Math.abs(h - eh) < 1e-9,
      `Encounter position mismatch: ${actor.id}`,
    );
  }
}

export function createCapturePlan(selections: readonly { seed: string; reasons: string[] }[]) {
  if (selections.length > GALLERY_SEED_LIMIT) throw new Error('Gallery is limited to twelve seeds');
  if (new Set(selections.map((entry) => entry.seed)).size !== selections.length)
    throw new Error('Gallery requires unique seeds');
  return selections.map((entry, index) => ({
    seed: entry.seed,
    reasons: [...entry.reasons],
    captures: (['entrance', 'smithy', 'bakery', 'altar'] as const).map((room) => ({
      room,
      file: `seed-${String(index).padStart(2, '0')}-${room}.png`,
    })),
  }));
}

export function galleryHtml(plan: ReturnType<typeof createCapturePlan>): string {
  const escape = (text: string) =>
    text.replace(
      /[&<>"']/g,
      (char) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[char]!,
    );
  return `<!doctype html>
<html lang="en"><meta charset="utf-8"><title>The Hollow Crown — generation gallery</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:24px;background:#10191d;color:#dfd8c6;font:15px system-ui}h1,h2{font-weight:500}
section{margin:30px 0}p,figcaption{color:#b1bdba} .captures{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
figure{margin:0}img{width:100%;display:block}figcaption{padding:5px 0}a{color:#d4b875}
#grayscale:checked~main img{filter:grayscale(1)}
@media(max-width:800px){.captures{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
<h1>The Hollow Crown — generation baseline</h1>
<p>Twelve-seed budget · four views per seed · identical camera and viewport · high quality.<br>
Simulation advances one explicit step per view; captures are visual fixtures, not performance measurements.
<a href="report.json">Generation and resource metadata</a>.</p>
<input id="grayscale" type="checkbox"><label for="grayscale"> Grayscale comparison</label>
<main>${plan
    .map(
      (
        entry,
      ) => `<section><h2>${escape(entry.seed)}</h2><p>${entry.reasons.map(escape).join(' · ')}</p>
<div class="captures">${entry.captures.map((capture) => `<figure><a href="${capture.file}"><img loading="lazy" src="${capture.file}" alt="${escape(entry.seed)} — ${capture.room}"></a><figcaption>${capture.room}</figcaption></figure>`).join('')}</div></section>`,
    )
    .join('')}
</main></html>`;
}
