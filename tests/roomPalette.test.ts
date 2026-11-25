import assert from 'node:assert/strict';
import test from 'node:test';
import { roomRole, roomSwatches, bandThresholds, roomInk } from '../src/roomPalette.ts';

test('room ownership has a stable unowned passage fallback', () => {
  assert.equal(roomRole({ surface: 'stair' }), 'stair');
  assert.equal(roomRole({ surface: 'stone', room: 'stairs' }), 'stair');
  assert.equal(roomRole({ surface: 'dais', room: 'altar' }), 'altar');
  assert.equal(roomRole({ surface: 'stone', room: 'entrance' }), 'chamber');
  assert.equal(roomRole({ surface: 'stone' }), 'chamber');
});

test('RGB8 bands remain distinct, ordered and chromatic over a full hue rotation', () => {
  const rgb8 = (rgb: readonly number[]) => rgb.map((c) => Math.round(c * 255));
  const chroma = (c: number[]) => Math.max(...c) - Math.min(...c);
  const lum = ([r, g, b]: number[]) => 0.213 * r + 0.715 * g + 0.072 * b;
  for (const role of ['stair', 'chamber', 'altar'] as const) {
    assert.deepEqual(roomSwatches(role, 0), roomSwatches(role, 360));
    for (let hue = 0; hue <= 360; hue++) {
      const bands = roomSwatches(role, hue).map(rgb8);
      assert.ok(bands.every((band) => chroma(band) >= 8));
      assert.ok(lum(bands[0]) > lum(rgb8(roomInk)) + 10);
      assert.ok(lum(bands[1]) - lum(bands[0]) > 20);
      assert.ok(lum(bands[2]) - lum(bands[1]) > 20);
    }
  }
  assert.ok(chroma(rgb8(roomInk)) >= 8);
  const [r, g, b] = roomSwatches('stair', 275)[2];
  assert.ok(b > g && g > r);
  assert.equal(Math.max(...roomSwatches('altar', 275)[2]), roomSwatches('altar', 275)[2][1]);
});

test('coverage classifies progressively more fixed samples as dark without moving the light cutoff', () => {
  const samples = Array.from({ length: 101 }, (_, i) => i / 100);
  const counts = [0, 50, 100].map((percent) => {
    const [dark, light] = bandThresholds(percent);
    assert.ok(0 < dark && dark < light && light < 1);
    assert.equal(light, bandThresholds(0)[1]);
    return samples.filter((sample) => sample < dark).length;
  });
  assert.ok(counts[0] < counts[1] && counts[1] < counts[2]);
});
