import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawnCorpseHeightAt } from '../src/animationReviewMetrics.ts';
import { corpseHeightAt } from '../src/corpseTerrain.ts';
import type { CorpseBox } from '../src/corpseTerrain.ts';

test('review exposes tall drawn remains above the capped solver-contact surface', () => {
  const box: CorpseBox = {
    inverse: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    min: { x: -0.5, y: 0, z: -0.5 },
    max: { x: 0.5, y: 1.1, z: 0.5 },
    worldMin: { x: -0.5, y: 0, z: -0.5 },
    worldMax: { x: 0.5, y: 1.1, z: 0.5 },
    floor: 0,
  };
  const point = { x: 0, z: 0, h: 0 };
  assert.equal(corpseHeightAt([box], point), 0.46);
  assert.equal(drawnCorpseHeightAt([box], point), 1.1);
  assert.equal(drawnCorpseHeightAt([box, box], point), 1.1);
  assert.equal(drawnCorpseHeightAt([box], { ...point, x: 0.6 }), 0);
  assert.equal(drawnCorpseHeightAt([box], { ...point, h: 2 }), 0);
});
