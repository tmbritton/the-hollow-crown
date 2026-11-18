import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCapturePlan, galleryHtml } from './generationGallery.ts';

test('gallery capture budget is finite and filenames cannot escape the output directory', () => {
  const plan = createCapturePlan(
    Array.from({ length: 12 }, (_, i) => ({ seed: `../seed/${i}`, reasons: ['fixture'] })),
  );
  assert.equal(plan.length, 12);
  assert.equal(plan.flatMap((entry) => entry.captures).length, 48);
  assert.equal(
    new Set(plan.flatMap((entry) => entry.captures.map((capture) => capture.file))).size,
    48,
  );
  for (const capture of plan.flatMap((entry) => entry.captures))
    assert.match(capture.file, /^seed-\d{2}-(entrance|smithy|bakery|altar)\.png$/);
  assert.throws(() => createCapturePlan([...plan, { seed: 'extra', reasons: [] }]), /twelve/i);
  assert.throws(() => createCapturePlan([plan[0], plan[0]]), /unique/i);
});

test('gallery labels are escaped and grayscale review is available without external assets', () => {
  const html = galleryHtml(
    createCapturePlan([{ seed: '<img src=x onerror=alert(1)>', reasons: ['A & B'] }]),
  );
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('A &amp; B'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('grayscale(1)'));
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('https://'));
});
