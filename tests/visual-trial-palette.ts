import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import type { DebugWindow } from './browserTypes.ts';
import { routes, view } from './visual-trial-fixture.ts';
import { compareVisualMedia } from './visual-trial-media.ts';
import { BASE_FOV, DEFAULT_VIEW } from '../src/visualTrial.ts';

declare const window: DebugWindow;
const root = 'test-results/visual-trial/15.2';
await mkdir(root, { recursive: true });
const output = await mkdtemp(`${root}/palette-run-`);
console.log(`Palette evidence: ${output}`);
const base = process.env.DEMO_URL ?? 'http://localhost:5173';
const fixture = '/tests/visual-trial-fixture.ts';
// Historical indicated points, retained as fixture checks, not a fresh blind read.
const indicated: Record<string, Record<string, [number, number]>> = {
  dojo: { safeFloor: [615, 560] },
  landing: { stair: [700, 351], landingTop: [796, 298] },
  'lava-bridge': { hazard: [642, 468], bridge: [639, 398] },
  altar: { shrine: [621, 141] },
};
// At the pinned stair pose, straddle the seam between two flat rows and sample beyond the apron.
const landingProbes: Record<string, [number, number]> = {
  apronFirst: [765, 309],
  apronBeforeSeam: [771, 304],
  apronAfterSeam: [777, 299],
  apronLast: [800, 280],
  chamber: [833, 253],
};
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: view, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /Unable to compile effect|SHADER ERROR|WebGL.*INVALID/i.test(message.text())
    )
      errors.push(message.text().slice(0, 500));
  });
  await page.addInitScript(() => {
    let harness: DebugWindow['__dungeon'];
    const nativeFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      nativeFrame(function hold(time) {
        if (!harness && document.querySelector('#loading.done')) nativeFrame(hold);
        else callback(time);
      });
    Object.defineProperty(window, '__dungeon', {
      configurable: true,
      get: () => harness,
      set: (value: DebugWindow['__dungeon']) => {
        harness = value;
        harness.animation.pause();
        window.requestAnimationFrame = nativeFrame;
      },
    });
  });

  async function open(name: keyof typeof routes, tick: number) {
    await page.goto(`${base}/${routes[name].query}`);
    await page.waitForFunction(() => window.__dungeon?.ready);
    if (name === 'practice') {
      for (const id of ['reset-practice', 'start-practice-foe']) {
        await page.locator(`#${id}`).click();
        await page.waitForFunction(() => window.__dungeon.ready);
      }
    }
    assert.equal(await page.locator('#view-original').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#quality').inputValue(), 'high');
    await page.evaluate(
      async ({ fixture, inputs, tick }) => {
        const { advanceRoute } = (await import(
          fixture
        )) as typeof import('./visual-trial-fixture.ts');
        const d = window.__dungeon;
        if (d.game.steps !== 0) throw Error('Route not frozen at tick zero');
        while (d.game.steps < tick) advanceRoute(d, inputs);
      },
      { fixture, inputs: routes[name].inputs, tick },
    );
  }

  type Focus = 'route' | 'lava' | 'altar';
  async function capture(
    label: string,
    focus: Focus,
    alpha: number,
    radius: number,
    coverage?: number,
  ) {
    const result = await page.evaluate(
      async ({ fixture, focus, alpha, radius, coverage, label, marks }) => {
        const { captureCamera } = (await import(
          fixture
        )) as typeof import('./visual-trial-fixture.ts');
        const d = window.__dungeon;
        const { game: g, engine } = d;
        d.visualTrial.orbit(alpha, 0.64, radius);
        d.step([], 0);
        if (focus === 'route') {
          g.camera.target.copyFrom(g.player.root.position);
          g.camera.target.y += 0.75;
        } else {
          const room = g.world.rooms.find((r) => r.id === focus);
          if (!room) throw Error(`Missing supplemental room ${focus}`);
          g.camera.target.set(room.x, room.h + 0.75, room.z);
        }
        const mode = coverage === undefined ? 'original' : 'tuned';
        const select = d.visualTrial.select;
        assertEvent(select({ type: 'SELECT', mode }));
        if (coverage !== undefined) {
          assertEvent(select({ type: 'PALETTE', enabled: true }));
          assertEvent(select({ type: 'EDIT', key: 'shadowCoverage', value: coverage }));
        }
        function assertEvent(accepted: boolean) {
          if (!accepted) throw Error('Palette event not accepted');
        }
        g.scene.render();
        const canvas = engine.getRenderingCanvas()!;
        const png = canvas.toDataURL();
        const landmarks = Object.fromEntries(
          Object.entries(marks ?? {}).map(([name, [x, y]]) => {
            const hit = g.scene.pick(
              x,
              y,
              (mesh) => mesh.isVisible && mesh.isEnabled() && !!mesh.material,
              false,
              g.camera,
            );
            const point = hit?.pickedPoint;
            const tile =
              point && g.world.tiles.get(`${Math.round(point.x)},${Math.round(point.z)}`);
            return [
              name,
              {
                screen: [x, y],
                mesh: hit?.pickedMesh?.name,
                point: point?.asArray(),
                tile: tile && {
                  x: tile.x,
                  z: tile.z,
                  h: tile.h,
                  surface: tile.surface,
                  room: tile.room,
                },
              },
            ];
          }),
        );
        const image = new Image();
        image.src = png;
        await image.decode();
        const copy = document.createElement('canvas');
        copy.width = canvas.width;
        copy.height = canvas.height;
        const ctx = copy.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        const rgb = (x: number, y: number) =>
          Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
        let strip: { strongEdges: number; png: string } | undefined;
        if (label.startsWith('floor-near')) {
          const [x, y, width, height] = [445, 515, 295, 150];
          const crop = ctx.getImageData(x, y, width, height);
          let strongEdges = 0;
          for (let row = 0; row < height; row++)
            for (let col = 1; col < width; col++) {
              const i = 4 * (row * width + col);
              if (Math.abs(crop.data[i + 2] - crop.data[i - 2]) >= 8) strongEdges++;
            }
          copy.width = width;
          copy.height = height;
          ctx.putImageData(crop, 0, 0);
          strip = { strongEdges, png: copy.toDataURL().split(',')[1] };
        }
        let values:
          | { dark: number; mid: number; lit: number; sample: Record<string, number[]> }
          | undefined;
        if (label.startsWith('dojo') || label.startsWith('coverage')) {
          const { data } = ctx.getImageData(350, 220, 550, 380);
          let dark = 0,
            mid = 0,
            lit = 0;
          for (let i = 0; i < data.length; i += 4) {
            const [r, green, b] = [data[i], data[i + 1], data[i + 2]];
            if (r - green < 8 || b - r < 8) continue; // exclude ink and actors
            if (b < 70) dark++;
            else if (b < 145) mid++;
            else lit++;
          }
          values = {
            dark,
            mid,
            lit,
            sample: {
              void: rgb(25, 25),
              shadedMasonry: rgb(820, 432),
              litMasonry: rgb(498, 352),
              floor: rgb(615, 560),
              shadow: rgb(451, 407),
            },
          };
        }
        return {
          png: png.split(',')[1],
          strip,
          values,
          landmarks,
          landmarkColors: Object.fromEntries(
            Object.entries(marks ?? {}).map(([name, [x, y]]) => [name, rgb(x, y)]),
          ),
          checkpoint: {
            tick: g.steps,
            scene: g.scene.uid,
            seed: g.world.seed,
            hero: { ...g.player.actor.position },
            camera: captureCamera(d),
            view: [innerWidth, innerHeight],
            dpr: devicePixelRatio,
            size: [canvas.width, canvas.height],
            renderer: engine.getGlInfo(),
            gl: engine.webGLVersion,
          },
        };
      },
      {
        fixture,
        focus,
        alpha,
        radius,
        coverage,
        label,
        marks:
          coverage === 50
            ? label === 'landing-tuned'
              ? { ...indicated.landing, ...landingProbes }
              : indicated[label.replace(/-tuned$/, '')]
            : undefined,
      },
    );
    const { checkpoint } = result;
    assert.equal(checkpoint.gl, 2);
    assert.deepEqual(checkpoint.view, [view.width, view.height]);
    assert.ok(Math.abs(checkpoint.dpr - 1) < 1e-6);
    assert.equal(checkpoint.camera.fov, BASE_FOV);
    assert.equal(checkpoint.camera.logicalRadius, radius);
    assert.equal(checkpoint.camera.distortion, false);
    const file = `${output}/${label}.png`;
    await writeFile(file, Buffer.from(result.png, 'base64'), { flag: 'wx' });
    const crop = result.strip ? `${output}/${label}-crop.png` : undefined;
    if (crop && result.strip)
      await writeFile(crop, Buffer.from(result.strip.png, 'base64'), { flag: 'wx' });
    return {
      file,
      checkpoint,
      values: result.values,
      landmarks: result.landmarks,
      landmarkColors: result.landmarkColors,
      crop,
      stripEdges: result.strip?.strongEdges,
    };
  }
  const checks: (() => Promise<unknown>)[] = [];
  const manifest: object[] = [];
  async function pair(label: string, focus: Focus, radius = 36, alpha = view.alpha) {
    const original = await capture(`${label}-original`, focus, alpha, radius);
    const tuned = await capture(`${label}-tuned`, focus, alpha, radius, 50);
    const restored = await capture(`${label}-restored`, focus, alpha, radius);
    assert.deepEqual(
      tuned.checkpoint,
      original.checkpoint,
      `${label}: unmatched camera or simulation`,
    );
    assert.deepEqual(
      restored.checkpoint,
      original.checkpoint,
      `${label}: unmatched restored frame`,
    );
    const row = { label, focus, original, tuned, restored, comparison: {} };
    manifest.push(row);
    checks.push(
      async () =>
        (row.comparison = await compareVisualMedia(
          [original.file, restored.file, tuned.file],
          original.checkpoint.size,
          false,
        )),
    );
    return row;
  }
  await open('practice', routes.practice.still);
  const dojo = await pair('dojo', 'route');
  const near = await pair('floor-near', 'route', 18);
  const low = await capture('coverage-0', 'route', view.alpha, 36, 0);
  const high = await capture('coverage-100', 'route', view.alpha, 36, 100);
  assert.deepEqual(high.checkpoint, low.checkpoint);
  manifest.push({ low, high });
  await open('dungeon', 430);
  const landing = await pair('landing', 'route');
  for (const [i, offset] of [-0.16, 0.16].entries())
    await pair(`turn-${i}`, 'route', 36, view.alpha + offset);
  const lava = await pair('lava-bridge', 'lava');
  const altar = await pair('altar', 'altar');
  checks.push(async () => {
    assert.ok(near.original.stripEdges !== undefined && near.original.stripEdges > 100);
    assert.ok(
      near.tuned.stripEdges !== undefined && near.tuned.stripEdges < near.original.stripEdges / 10,
      `near edge count ${near.original.stripEdges} → ${near.tuned.stripEdges}`,
    );
    assert.ok(dojo.tuned.values && low.values && high.values);
    const { dark, mid, lit, sample } = dojo.tuned.values;
    assert.ok(dark > 1000 && mid > 1000 && lit > 1000, 'all three room values must be visible');
    assert.ok(sample.void[2] - sample.void[1] >= 8 && Math.max(...sample.void) <= 35);
    assert.ok(sample.shadedMasonry[2] - sample.shadedMasonry[1] >= 8);
    assert.ok(sample.litMasonry[2] - sample.shadedMasonry[2] >= 60);
    assert.ok(low.values.dark < dark && dark < high.values.dark, 'dark area must grow');
    assert.deepEqual(low.values.sample.floor, high.values.sample.floor, 'lit floor must not dim');
  });
  checks.push(async () => {
    assert.equal(dojo.tuned.landmarks.safeFloor.tile?.surface, 'stone');
    assert.equal(landing.tuned.landmarks.stair.tile?.surface, 'stair');
    assert.equal(landing.tuned.landmarks.landingTop.tile?.room, 'bakery');
    assert.equal(lava.tuned.landmarks.hazard.tile?.surface, 'lava');
    assert.equal(lava.tuned.landmarks.bridge.tile?.surface, 'bridge');
    assert.equal(altar.tuned.landmarks.shrine.mesh, 'altar ember');
  });
  checks.push(async () => {
    const { landmarks, landmarkColors } = landing.tuned;
    const chroma = (name: string) => landmarkColors[name][1] - landmarkColors[name][0];
    for (const [name, z] of Object.entries({
      apronFirst: 20,
      apronBeforeSeam: 20,
      apronAfterSeam: 21,
      apronLast: 22,
      chamber: 24,
    })) {
      const hit = landmarks[name];
      assert.ok(hit.mesh?.startsWith('floor:'), `${name} must hit existing floor geometry`);
      assert.deepEqual(hit.tile, { x: -1, z, h: -2.4, surface: 'stone', room: 'bakery' });
    }
    for (const name of Object.keys(landingProbes).filter((name) => name !== 'chamber')) {
      assert.ok(
        chroma(name) - chroma('chamber') >= 24,
        `${name} must read cooler than coplanar floor`,
      );
    }
    assert.ok(Math.abs(chroma('apronBeforeSeam') - chroma('apronAfterSeam')) <= 10);
  });

  const outcomes = [];
  for (const check of checks) {
    try {
      await check();
      outcomes.push('pass');
    } catch (error) {
      outcomes.push(String(error));
    }
  }
  await writeFile(
    `${output}/manifest.json`,
    JSON.stringify(
      {
        browser: browser.version(),
        base,
        recipe: { ...DEFAULT_VIEW, paletteEnabled: true },
        routes,
        manifest,
        outcomes,
        errors,
      },
      null,
      2,
    ),
  );
  assert.deepEqual(errors, []);
  assert.ok(
    outcomes.every((result) => result === 'pass'),
    outcomes.join('\n'),
  );
} finally {
  await browser.close();
}
