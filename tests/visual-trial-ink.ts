import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import type { DebugWindow } from './browserTypes.ts';
import { routes, view } from './visual-trial-fixture.ts';
import { checkInkLifecycle } from './visual-trial-panel.ts';

declare const window: DebugWindow;
const root = 'test-results/visual-trial/15.3';
await mkdir(root, { recursive: true });
const output = await mkdtemp(`${root}/ink-run-`);
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
const base = process.env.DEMO_URL ?? 'http://localhost:5173';
const fixture = '/tests/visual-trial-fixture.ts';
const probesModule = '/tests/visual-trial-probes.ts';

try {
  const page = await browser.newPage({ viewport: view, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /Unable to compile effect|SHADER ERROR|WebGL.*INVALID/i.test(message.text())
    )
      errors.push(message.text());
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

  async function open(name: keyof typeof routes, foe = false) {
    await page.goto(`${base}/${routes[name].query}`);
    await page.waitForFunction(() => window.__dungeon?.ready);
    if (foe) {
      await page.locator('#start-practice-foe').click();
      await page.waitForFunction(() => window.__dungeon.ready);
    }
    assert.equal(await page.evaluate(() => window.__dungeon.game.steps), 0);
    assert.equal(await page.locator('#quality').inputValue(), 'high');
  }

  async function orbit(alpha: number, beta: number, radius: number, settle = 70) {
    await page.evaluate(
      ({ alpha, beta, radius, settle }) => {
        const d = window.__dungeon;
        d.visualTrial.orbit(alpha, beta, radius);
        for (let i = 0; i < settle; i++) d.step([], 0);
        const { player, camera } = d.game;
        camera.target.copyFrom(player.root.position);
        camera.target.y += 0.95;
      },
      { alpha, beta, radius, settle },
    );
  }

  const shots: unknown[] = [];
  async function capture(name: string, positive = true, probes: [number, number][] = []) {
    const result = await page.evaluate(
      async ({ fixture, probes }) => {
        const { captureCamera } = (await import(
          fixture
        )) as typeof import('./visual-trial-fixture.ts');
        const d = window.__dungeon;
        const { scene, player, camera, combat, world, ecs } = d.game;
        const canvas = d.engine.getRenderingCanvas()!;
        const copy = document.createElement('canvas');
        copy.width = canvas.width;
        copy.height = canvas.height;
        const context = copy.getContext('2d', { willReadFrequently: true })!;
        const frames: string[] = [];
        const pixels: Uint8ClampedArray[] = [];
        const readPose = () => ({
          scene: scene.uid,
          step: d.game.steps,
          camera: captureCamera(d),
          actors: combat.actors.map((a) => ({
            id: a.id,
            pose: { ...a.position },
            hp: a.health.current,
            swing: a.attack.swing && { ...a.attack.swing },
            target: a.attack.target,
            guard: a.defending,
          })),
          shieldMatrix: player.actor.entity
            .require('rig')
            .shield!.computeWorldMatrix(true)
            .asArray(),
          weaponMatrix: player.actor.entity
            .require('rig')
            .weapon!.computeWorldMatrix(true)
            .asArray(),
          walls: ecs.query('cutaway').map((e) => e.require('cutaway').scale),
        });
        const pose = readPose();
        const select = d.visualTrial.select;
        select({ type: 'SELECT', mode: 'tuned' });
        for (const value of [0, 2, 4]) {
          select({ type: 'EDIT', key: 'inkWidth', value });
          scene.render();
          await scene.whenReadyAsync();
          const pass = camera._postProcesses.find((p) => p?.name === 'Visual trial ink');
          if (pass) {
            for (let i = 0; !pass.isReady() && i < 60; i++)
              await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
            if (!pass.isReady()) throw Error('Ink post process failed to compile');
          }
          scene.render();
          if (JSON.stringify(readPose()) !== JSON.stringify(pose))
            throw Error('Capture pose changed');
          const png = canvas.toDataURL();
          const image = new Image();
          image.src = png;
          await image.decode();
          context.drawImage(image, 0, 0);
          frames.push(png.split(',')[1]);
          pixels.push(context.getImageData(0, 0, copy.width, copy.height).data);
        }
        const counts = pixels.slice(1).map((data) => {
          let changed = 0;
          for (let i = 0; i < data.length; i += 4)
            if (
              Math.max(
                Math.abs(data[i] - pixels[0][i]),
                Math.abs(data[i + 1] - pixels[0][i + 1]),
                Math.abs(data[i + 2] - pixels[0][i + 2]),
              ) > 8
            )
              changed++;
          return changed;
        });
        return {
          frames,
          counts,
          pose,
          seed: world.seed,
          size: [canvas.width, canvas.height],
          dpr: devicePixelRatio,
          probeColors: probes.map(([x, y]) =>
            pixels.map((p) =>
              Array.from(p.slice(4 * (y * copy.width + x), 4 * (y * copy.width + x) + 3)),
            ),
          ),
        };
      },
      { fixture, probes },
    );
    const { frames, ...metadata } = result;
    await Promise.all(
      frames.map((png, i) =>
        writeFile(`${output}/${name}-${i * 2}.png`, Buffer.from(png, 'base64')),
      ),
    );
    shots.push({ name, ...metadata });
    if (positive) {
      assert.ok(result.counts[0] > 65, `${name}: no positive contour signal: ${result.counts}`);
      assert.ok(
        result.counts[1] > result.counts[0],
        `${name}: width did not thicken contour: ${result.counts}`,
      );
    } else {
      assert.deepEqual(result.counts, [0, 0], `${name}: ink leaks through opaque wall`);
      assert.equal(frames[0], frames[2], `${name}: opaque wall must be pixel-identical`);
    }
    return result;
  }

  await open('practice');
  await orbit(view.alpha, view.beta, 18);
  const still = await capture('exposed', true, [
    [400, 400],
    [647, 315],
    [646, 347],
  ]);
  assert.deepEqual(still.probeColors[0][0], still.probeColors[0][2], 'floor interior');
  assert.notDeepEqual(still.probeColors[1][0], still.probeColors[1][2], 'exposed contour');
  assert.deepEqual(still.probeColors[2][0], still.probeColors[2][2], 'overlapping body parts');

  // Put the hero inside the near wall, then snap to the other side before installing
  // any presentation ticks. The next zero-simulation steps lower the real wall.
  await page.evaluate(() => window.__dungeon.teleport(0, -6.75));
  await orbit(Math.PI / 2, 1.32, 18);
  await orbit(-Math.PI / 2, 1.32, 18, 0);
  const intact = await capture('wall-intact', false);
  await orbit(-Math.PI / 2, 1.32, 18, 7);
  const partial = await capture('wall-partial');
  await orbit(-Math.PI / 2, 1.32, 18);
  const cut = await capture('wall-cutaway');
  assert.ok(partial.counts[1] < cut.counts[1], 'partial cover must hide part of the contour');
  const wallIndex = intact.pose.walls.findIndex(
    (scale, i) => scale > 0.98 && cut.pose.walls[i] < 0.051,
  );
  assert.ok(
    wallIndex >= 0 && partial.pose.walls[wallIndex] > 0.1 && partial.pose.walls[wallIndex] < 0.8,
  );
  assert.equal(intact.pose.step, cut.pose.step);
  assert.deepEqual(intact.pose.actors, cut.pose.actors);

  for (const name of ['practice', 'dungeon'] as const) {
    const traces = [];
    for (const width of [0, 4]) {
      await open(name, name === 'practice');
      traces.push(
        await page.evaluate(
          async ({ fixture, width, route, view, end }) => {
            const { advanceRoute } = (await import(
              fixture
            )) as typeof import('./visual-trial-fixture.ts');
            const d = window.__dungeon;
            d.visualTrial.orbit(view.alpha, view.beta, 18);
            d.visualTrial.select({ type: 'SELECT', mode: 'tuned' });
            d.visualTrial.select({ type: 'EDIT', key: 'inkWidth', value: width });
            const trace = [];
            while (d.game.steps < end) {
              trace.push(advanceRoute(d, route.inputs));
              if (d.game.steps % 24 === 0) d.game.scene.render();
            }
            return trace;
          },
          { fixture, width, route: routes[name], view, end: name === 'practice' ? 365 : 709 },
        ),
      );
    }
    assert.deepEqual(traces[0], traces[1], `${name}: width changed fixed-step trace`);
    await writeFile(`${output}/${name}-trace.json`, JSON.stringify(traces[0]));
    await orbit(view.alpha, view.beta, 18);
    await capture(`${name}-route-end`);
  }

  await open('dungeon');
  await page.evaluate(async (fixture) => {
    const { advanceRoute, routes } = (await import(
      fixture
    )) as typeof import('./visual-trial-fixture.ts');
    const d = window.__dungeon;
    while (d.game.steps < 100) advanceRoute(d, routes.dungeon.inputs);
    const portrait = d.game.ecs.get('portrait-15')!.require('portrait');
    d.visualTrial.orbit(Math.atan2(-portrait.dz, -portrait.dx), 0.72, 18);
    for (let i = 0; i < 70; i++) d.step([], 0);
    d.game.camera.target.copyFrom(portrait.root.position);
    d.game.camera.target.y += 1.6;
    // Isolate the portrait's contribution from the hero and NPCs on the pinned route.
    for (const a of d.game.combat.actors) a.entity.require('rig').root.setEnabled(false);
  }, fixture);
  await capture('portrait-15');

  async function clickPoint(kind: 'floor' | 'foe' | 'door') {
    return page.evaluate(
      async ({ probesModule, kind }) => {
        const { edgePoint } = (await import(
          probesModule
        )) as typeof import('./visual-trial-probes.ts');
        return edgePoint(window.__dungeon, kind, 0);
      },
      { probesModule, kind },
    );
  }

  const picks = [];
  for (const width of [0, 4]) {
    await open('practice', true);
    await orbit(view.alpha, view.beta, 18);
    await page.evaluate((value) => {
      const { select } = window.__dungeon.visualTrial;
      select({ type: 'SELECT', mode: 'tuned' });
      select({ type: 'EDIT', key: 'inkWidth', value });
    }, width);
    for (const kind of ['floor', 'foe', 'door'] as const) {
      if (kind === 'door') await page.evaluate(() => window.__dungeon.teleport(0, 0.5));
      const point = await clickPoint(kind);
      await page.mouse.click(point.x, point.y);
      picks.push({
        kind,
        point,
        result: await page.evaluate((kind) => {
          const d = window.__dungeon;
          if (kind === 'foe') return d.game.player.actor.attack.target;
          if (kind === 'floor') {
            const destination = d.game.player.navigator.destination!;
            return [Math.round(destination.x), Math.round(destination.z)];
          }
          d.step([], 20);
          return d.snapshot().doors.find((door) => door.id === 'practice-door')?.open;
        }, kind),
      });
    }
  }
  assert.deepEqual(picks.slice(0, 3), picks.slice(3));
  assert.deepEqual(
    picks.slice(0, 3).map(({ result }) => result),
    [[3, -5], 'skeleton:practice:0', true],
  );

  async function stageFight(z: number, spacing: number) {
    await open('practice', true);
    await page.evaluate(
      ({ z, spacing }) => {
        const d = window.__dungeon;
        const foe = d.game.combat.enemies[0];
        foe.entity.remove('brain'); // Stationary target, as in the defense browser fixture.
        Object.assign(foe.position, { x: 3 + spacing, z, h: 0, heading: -Math.PI / 2 });
        d.teleport(3, z);
        d.game.player.heading = Math.PI / 2;
        d.step([]);
      },
      { z, spacing },
    );
  }

  // Interior of the visible shield face and a separate run along its red rim in
  // the pinned far/shadow guard shot (1280×720, DPR 1). Sample multiple rows so
  // a surviving highlight or one antialiased pixel cannot pass for the face.
  const face: [number, number][] = [360, 361, 362, 363, 364].flatMap((y) =>
    [647, 648, 649].map((x): [number, number] => [x, y]),
  );
  const rim: [number, number][] = [362, 364, 366, 368, 370, 372, 374].map((y) => [645, y]);
  function visibleShieldRead(colors: number[][][]) {
    const average = (samples: number[][][], width: number, measure: (rgb: number[]) => number) =>
      samples.reduce((total, rgb) => total + measure(rgb[width / 2]), 0) / samples.length;
    const read = [0, 2, 4].map((width) => ({
      width,
      faceLuma: average(
        colors.slice(0, face.length),
        width,
        ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b,
      ),
      rimRed: average(colors.slice(face.length), width, ([r, g, b]) => r - Math.max(g, b)),
    }));
    assert.ok(read[0].rimRed > 55, `expected the authored red rim: ${JSON.stringify(read)}`);
    assert.ok(
      read[2].faceLuma >= read[0].faceLuma,
      `thick ink lost shield fill: ${JSON.stringify(read)}`,
    );
    assert.ok(
      read[2].rimRed >= 0.8 * read[0].rimRed,
      `thick ink lost shield rim: ${JSON.stringify(read)}`,
    );
    assert.deepEqual(
      colors.map(([, , thick]) => thick),
      colors.map(([, medium]) => medium),
      'a wider actor contour must not grow across visible shield fill or trim',
    );
    return { face, rim, widths: read };
  }

  let shieldRead: ReturnType<typeof visibleShieldRead> | undefined;
  for (const [label, z] of [
    ['lit', -4],
    ['shadow', 0.5],
  ] as const) {
    await stageFight(z, 2.8);
    await orbit(-0.68, 0.73, 18);
    await capture(`${label}-neutral`);
    const point = await clickPoint('foe');
    await page.mouse.move(point.x, point.y);
    const hovered = await capture(`${label}-pointer-over-foe`);
    await page.mouse.click(point.x, point.y);
    await page.evaluate(() => window.__dungeon.game.enemyRendering.update());
    const targeted = await capture(`${label}-targeted`);
    assert.equal(targeted.pose.actors[0].target, 'skeleton:practice:0');
    assert.equal(hovered.pose.step, targeted.pose.step);
    assert.notEqual(
      hovered.frames[2],
      targeted.frames[2],
      'existing target marker must remain visible',
    );
    await page.evaluate(() => window.__dungeon.step([], 4));
    await orbit(-0.68, 0.73, 18);
    const approach = await capture(`${label}-approach`);
    assert.equal(approach.pose.actors[0].swing, null);
    assert.notDeepEqual(approach.pose.actors[0].pose, targeted.pose.actors[0].pose);
    const advance = (untilImpact: boolean) =>
      page.evaluate((untilImpact) => {
        const d = window.__dungeon;
        for (let i = 0; i < 120; i++) {
          const swing = d.game.player.actor.attack.swing;
          if (swing && (untilImpact ? swing.resolved : swing.elapsed >= swing.impact / 2)) return;
          d.step([]);
        }
        throw Error('Action checkpoint not reached');
      }, untilImpact);
    await advance(false);
    await orbit(-0.68, 0.73, 18);
    const windup = await capture(`${label}-windup`);
    assert.equal(windup.pose.actors[0].swing?.resolved, false);
    for (const radius of [18, 36])
      for (let turn = 0; turn < 7; turn++) {
        await orbit(-0.68 + turn * 0.13, 0.73, radius);
        await capture(`${label}-rotation-${radius}-${turn}`);
      }
    await orbit(-0.68, 0.73, 18);
    for (let motion = 0; motion < 4; motion++) {
      await page.evaluate(() => window.__dungeon.step([], 2));
      await capture(`${label}-swing-motion-${motion}`);
    }
    await advance(true);
    await orbit(-0.68, 0.73, 18);
    const impact = await capture(`${label}-impact`);
    assert.equal(impact.pose.actors[0].swing?.resolved, true);
    assert.ok(impact.pose.actors[1].hp < windup.pose.actors[1].hp);
    assert.notDeepEqual(impact.pose.weaponMatrix, windup.pose.weaponMatrix);

    await stageFight(z, 1.2);
    await orbit(-0.36, 0.78, 18);
    const lowered = await capture(`${label}-lowered`);
    await page.locator('#game').focus();
    await page.keyboard.down('f');
    await page.evaluate(() => window.__dungeon.step([], 8));
    await orbit(-0.36, 0.78, 18);
    const raised = await capture(`${label}-raised`);
    await page.keyboard.up('f');
    assert.equal(lowered.pose.actors[0].guard, false);
    assert.equal(raised.pose.actors[0].guard, true);
    assert.notDeepEqual(raised.pose.shieldMatrix, lowered.pose.shieldMatrix);
    await orbit(-0.65, 0.78, 36);
    const far = await capture(
      `${label}-raised-far`,
      true,
      label === 'shadow' ? [...face, ...rim] : [],
    );
    // Keep the historical release-before-orbit sequence. The input flag can
    // clear during zero-tick settling, but the drawn shield must stay raised.
    assert.equal(far.pose.step, raised.pose.step);
    assert.deepEqual(far.pose.shieldMatrix, raised.pose.shieldMatrix);
    if (label === 'shadow') shieldRead = visibleShieldRead(far.probeColors);
  }

  await open('practice', true);
  await checkInkLifecycle(page);
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/manifest.json`,
    JSON.stringify(
      {
        browser: browser.version(),
        view,
        quality: 'high',
        widths: [0, 2, 4],
        shieldRead,
        picks,
        shots,
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS fixed-pose widths, real cutaway, route/pick parity, swing and guard: ${output}`,
  );
} finally {
  await browser.close();
}
