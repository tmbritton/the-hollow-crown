import assert from 'node:assert/strict';
import type { Page } from '@playwright/test';
import type { DebugWindow } from './browserTypes.ts';
import { DEFAULT_VIEW } from '../src/visualTrial.ts';

declare const window: DebugWindow;
const probes = '/tests/visual-trial-probes.ts';

async function state(page: Page) {
  return page.evaluate(() => {
    const g = window.__dungeon.game;
    return {
      scene: g.scene.uid,
      tick: g.steps,
      hero: { ...g.player.actor.position },
      destination: g.player.navigator.destination,
      target: g.player.actor.attack.target,
      guarded: g.player.actor.defending,
      jumping: g.player.actor.jump.active,
      desiredAlpha: g.desiredAlpha,
      alpha: g.camera.alpha,
      beta: g.camera.beta,
      cameraTarget: g.camera.target.asArray(),
      logicalRadius: g.logicalRadius,
      desiredRadius: g.desiredRadius,
      fov: g.camera.fov,
      radius: g.camera.radius,
    };
  });
}

export async function checkPanel(page: Page, output: string) {
  const panel = page.locator('#visual-trial');
  const lens = page.locator('#view-lens');
  assert.equal(await panel.getAttribute('open'), null);
  assert.equal(await page.locator('#view-original').getAttribute('aria-pressed'), 'true');
  await panel.locator('summary').click();
  assert.equal(await lens.isDisabled(), true);
  assert.equal(await page.locator('#view-palette').count(), 1, 'room palette control absent');
  const palette = page.locator('#view-palette');
  const hue = page.locator('#view-hue');
  assert.ok(await palette.isDisabled());
  assert.ok(await hue.isDisabled());
  await page.evaluate(() => {
    const d = window.__dungeon;
    d.visualTrial.orbit(-Math.PI / 4, 0.64, 18);
    const hero = d.game.player.actor;
    hero.navigator.request(hero.position, { x: 2, z: -5 });
    // Force clipboard failure to test the selectable fallback without host permissions.
    Object.defineProperty(navigator.clipboard, 'writeText', {
      value: () => Promise.reject(new Error('denied')),
    });
  });
  const start = await state(page);
  const neutral = await frame(page);
  await page.locator('#view-tuned').click();
  assert.equal(await frame(page), neutral, 'default Tuned must render identically to Original');
  const box = await lens.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 4 });
  await page.mouse.move(800, 600);
  await page.mouse.up();
  const dragged = Number(await lens.inputValue());
  assert.ok(dragged > 40 && dragged <= 60);
  await lens.press('ArrowLeft');
  assert.equal(Number(await lens.inputValue()), dragged - 1);
  assert.equal(await page.locator('#view-lens-value').inputValue(), await lens.inputValue());
  await page.mouse.move(box.x + 5, box.y + 4);
  await page.mouse.wheel(0, 100);
  for (const key of ['w', 'r', 'e', 'f', 'x', 't', 'Space', 'Escape']) await lens.press(key);
  const adjusted = await state(page);
  const adjustedFrame = await frame(page);
  assert.notEqual(adjustedFrame, neutral, 'the next frame must show the Lens edit');
  assert.deepEqual({ ...adjusted, fov: start.fov, radius: start.radius }, start);
  assert.notEqual(adjusted.fov, start.fov);
  assert.notEqual(adjusted.radius, start.radius);
  await page.locator('#view-original').click();
  assert.deepEqual(await state(page), start);
  await page.locator('#view-copy').click();
  const copied = page.locator('#view-copy-text');
  await copied.waitFor({ state: 'visible' });
  const saved = JSON.parse(await copied.inputValue());
  assert.deepEqual(saved, { mode: 'original', ...DEFAULT_VIEW, lensDegrees: dragged - 1 });
  await page.locator('#view-tuned').click();
  assert.deepEqual(await state(page), adjusted);
  await page.locator('#view-reset').click();
  assert.deepEqual(await state(page), start);
  assert.equal(await frame(page), neutral);
  await page.locator('#view-lens-value').fill(String(saved.lensDegrees));
  await page.locator('#view-lens-value').press('Tab');
  assert.deepEqual(await state(page), adjusted);
  assert.equal(
    await frame(page),
    adjustedFrame,
    're-entering the copied setting must reproduce the view',
  );
  await page.locator('#view-reset').click();
  await page.locator('#view-fisheye').press('ArrowRight');
  assert.equal(await page.locator('#view-fisheye-value').inputValue(), '1');
  assert.deepEqual(
    await state(page),
    start,
    'Fisheye cannot change FOV, zoom or a gameplay command',
  );
  await page.locator('#view-reset').click();
  assert.equal(await palette.isChecked(), false);
  await palette.check();
  const treated = await frame(page);
  assert.notEqual(treated, neutral, 'palette-only selection must affect the rendered scene');
  const hueBox = await hue.boundingBox();
  assert.ok(hueBox);
  const y = hueBox.y + hueBox.height / 2;
  await page.mouse.move(hueBox.x + hueBox.width * 0.76, y);
  await page.mouse.down();
  await page.mouse.move(hueBox.x + hueBox.width * 0.3, y, { steps: 4 });
  await page.mouse.up();
  const draggedHue = Number(await hue.inputValue());
  assert.ok(draggedHue > 0 && draggedHue < 180, `dragged hue ${draggedHue}`);
  await hue.press('ArrowRight');
  assert.equal(Number(await hue.inputValue()), draggedHue + 1);
  await page.locator('#view-coverage-value').fill('83.125');
  await page.locator('#view-coverage-value').press('Tab');
  const editedPalette = await frame(page);
  assert.notEqual(editedPalette, treated);
  assert.deepEqual(await state(page), start);
  await page.locator('#view-original').click();
  assert.equal(await frame(page), neutral);
  await page.locator('#view-copy').click();
  await copied.waitFor({ state: 'visible' });
  const palettePreset = {
    ...DEFAULT_VIEW,
    paletteEnabled: true,
    roomHue: draggedHue + 1,
    shadowCoverage: 83.125,
  };
  assert.deepEqual(JSON.parse(await copied.inputValue()), { mode: 'original', ...palettePreset });
  await page.locator('#view-tuned').click();
  assert.equal(await frame(page), editedPalette);
  await page.locator('#view-reset').click();
  assert.equal(await frame(page), neutral);
  await page.locator('#view-hue-value').fill(String(palettePreset.roomHue));
  await page.locator('#view-hue-value').press('Tab');
  await page.locator('#view-coverage-value').fill(String(palettePreset.shadowCoverage));
  await page.locator('#view-coverage-value').press('Tab');
  await palette.check();
  assert.equal(await frame(page), editedPalette);
  await page.screenshot({ path: `${output}/practice-panel.png` });
  await page.locator('#reset-practice').click();
  await page.waitForFunction(() => window.__dungeon.ready);
  assert.equal(await palette.isChecked(), true);
  assert.equal(await page.locator('#view-coverage-value').inputValue(), '83.125');
  assert.equal(await page.locator('#view-tuned').getAttribute('aria-pressed'), 'true');
  assert.notEqual((await state(page)).scene, start.scene);
}

export async function checkPassLifecycle(page: Page) {
  const results = await page.evaluate(() => {
    const { game, visualTrial } = window.__dungeon;
    const { camera, scene, fxaa } = game;
    const chain = camera._postProcesses;
    const name = 'Visual trial fisheye';
    const initial = chain.length;
    let tunedValid = true;
    let originalValid = chain.length === 1 && chain[0] === fxaa;
    for (let cycle = 0; cycle < 12; cycle++) {
      visualTrial.select({ type: 'SELECT', mode: 'tuned' });
      visualTrial.select({ type: 'EDIT', key: 'fisheyePercent', value: 100 });
      tunedValid &&= chain[0] === fxaa && chain.filter((p) => p?.name === name).length === 1;
      visualTrial.select({ type: 'SELECT', mode: 'original' });
      originalValid &&= chain[0] === fxaa && !scene.postProcesses.some((p) => p.name === name);
    }
    const after = chain.length;
    const extra = fxaa.clone()!;
    const hole = fxaa.clone()!;
    camera.attachPostProcess(hole);
    camera.attachPostProcess(extra);
    hole.dispose(camera);
    const otherSlots = [...chain];
    visualTrial.select({ type: 'SELECT', mode: 'tuned' });
    visualTrial.select({ type: 'RESET' });
    visualTrial.select({ type: 'SELECT', mode: 'original' });
    const othersIntact =
      chain.length === otherSlots.length && chain.every((p, i) => p === otherSlots[i]);
    extra.dispose(camera);
    return { initial, after, tunedValid, originalValid, othersIntact };
  });
  assert.equal(results.after, results.initial, 'camera chain grew over 12 toggle cycles');
  assert.ok(
    results.tunedValid && results.originalValid && results.othersIntact,
    JSON.stringify(results),
  );
}

export async function checkShortPanel(page: Page, output: string) {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      value: () => Promise.reject(new Error('denied')),
    });
  });
  const start = await state(page);
  async function click(id: string) {
    const point = await page.locator(id).evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;
      return { x, y, hit: el.contains(document.elementFromPoint(x, y)) };
    });
    assert.ok(point.hit, `${id} must be pointer-reachable without automated scrolling`);
    await page.mouse.click(point.x, point.y);
  }
  await click('#visual-trial summary');
  await click('#view-tuned');
  const summary = await page.locator('#visual-trial summary').boundingBox();
  assert.ok(summary);
  await page.mouse.move(summary.x + 12, summary.y + summary.height / 2);
  await page.mouse.wheel(0, 85);
  // Observe native scrolling, not Playwright's locator.click() auto-scroll.
  const fisheye = page.locator('#view-fisheye');
  await page.waitForFunction(
    () => {
      const slider = document.querySelector('#view-fisheye')!;
      const rect = slider.getBoundingClientRect();
      return (
        slider.closest('#visual-trial')!.scrollTop > 0 &&
        slider === document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      );
    },
    undefined,
    { timeout: 3000 },
  );
  await click('#view-fisheye');
  assert.ok(Number(await fisheye.inputValue()) > 0);
  await click('#view-palette');
  const scroller = await panelPoint(page);
  await page.mouse.move(scroller.x, scroller.y);
  await page.mouse.wheel(0, 350);
  await page.waitForFunction(() => {
    const control = document.querySelector('#view-coverage')!;
    const rect = control.getBoundingClientRect();
    return control === document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
  });
  await click('#view-coverage');
  await click('#view-reset');
  assert.equal(await fisheye.inputValue(), '0');
  await click('#view-copy');
  const fallback = page.locator('#view-copy-text');
  await fallback.waitFor({ state: 'visible' });
  assert.deepEqual(JSON.parse(await fallback.inputValue()), {
    mode: 'tuned',
    ...DEFAULT_VIEW,
  });
  assert.ok(
    await fallback.evaluate((text: HTMLTextAreaElement) => {
      const rect = text.getBoundingClientRect();
      return (
        text === document.activeElement &&
        text.selectionStart === 0 &&
        text.selectionEnd === text.value.length &&
        rect.bottom <= innerHeight &&
        text === document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      );
    }),
  );
  assert.deepEqual(await state(page), start, 'panel pointer and wheel must not affect gameplay');
  await page.screenshot({ path: `${output}/practice-panel-short.png` });
}

async function panelPoint(page: Page) {
  const box = await page.locator('#visual-trial').boundingBox();
  assert.ok(box);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function frame(page: Page) {
  return page.evaluate(() => {
    const d = window.__dungeon;
    d.game.scene.render();
    return d.engine.getRenderingCanvas()!.toDataURL();
  });
}

export async function checkLimits(page: Page, openPractice: () => Promise<void>, output: string) {
  const results = [];
  for (const lens of [25, 60])
    for (const strength of [0, 100]) {
      await openPractice();
      const zooms = await page.evaluate(
        async ({ probes, lens }) => {
          const { heroHeight } = (await import(
            probes
          )) as typeof import('./visual-trial-probes.ts');
          const d = window.__dungeon;
          const g = d.game;
          g.camera.target.copyFrom(g.player.root.position);
          g.camera.target.y += 0.75;
          const heights = [];
          for (const radius of [18, 36]) {
            d.visualTrial.orbit(-Math.PI / 4, 0.64, radius);
            d.visualTrial.select({ type: 'SELECT', mode: 'original' });
            const original = await heroHeight(d);
            d.visualTrial.select({ type: 'SELECT', mode: 'tuned' });
            d.visualTrial.select({ type: 'EDIT', key: 'lensDegrees', value: lens });
            const tuned = await heroHeight(d);
            heights.push({ radius, original, tuned });
          }
          return heights;
        },
        { probes, lens },
      );
      for (const { original, tuned } of zooms)
        assert.ok(
          Number.isInteger(original) &&
            Number.isInteger(tuned) &&
            Math.abs(tuned / original - 1) <= 0.03,
          `${lens}° visible pixel height ${original} vs ${tuned}`,
        );
      await page.evaluate((strength) => {
        const d = window.__dungeon;
        d.visualTrial.orbit(-Math.PI / 4, 0.64, 18);
        d.visualTrial.select({ type: 'EDIT', key: 'fisheyePercent', value: strength });
        for (let i = 0; i < 80; i++) d.step([], 0);
      }, strength);
      const walls = () =>
        page.evaluate(() =>
          window.__dungeon.game.ecs.query('cutaway').map((e) => e.require('cutaway').scale),
        );
      const before = await walls();
      await frame(page);
      await page.screenshot({ path: `${output}/rotation-${lens}-${strength}-before.png` });
      await page.keyboard.press('q');
      const revealed = await page.evaluate(async (probes) => {
        const { heroHeight } = (await import(probes)) as typeof import('./visual-trial-probes.ts');
        const d = window.__dungeon;
        for (let i = 0; i < 80; i++) d.step([], 0);
        return heroHeight(d);
      }, probes);
      assert.ok(revealed > 50, `rotated hero must be visible; got ${revealed} rows`);
      const after = await walls();
      assert.ok(
        after.some((scale, i) => scale < 0.06 && before[i] > 0.8),
        'rotation must lower a foreground wall',
      );
      await frame(page);
      await page.screenshot({ path: `${output}/rotation-${lens}-${strength}-after.png` });
      const clicks = [];
      for (const kind of ['floor', 'foe', 'door'] as const) {
        const point = await page.evaluate(
          async ({ probes, kind, strength }) => {
            const { edgePoint } = (await import(
              probes
            )) as typeof import('./visual-trial-probes.ts');
            const d = window.__dungeon;
            if (kind === 'door') d.teleport(0, 0.5);
            return edgePoint(d, kind, strength);
          },
          { probes, kind, strength },
        );
        const file = `click-${lens}-${strength}-${kind}.png`;
        await page.mouse.move(point.x, point.y);
        await page.screenshot({ path: `${output}/${file}` });
        await page.mouse.click(point.x, point.y);
        if (kind === 'floor') {
          const destination = (await state(page)).destination;
          assert.ok(destination);
          assert.deepEqual([Math.round(destination.x), Math.round(destination.z)], [3, -5]);
        } else if (kind === 'foe') assert.equal((await state(page)).target, 'skeleton:practice:0');
        else {
          const opened = await page.evaluate(() => {
            const d = window.__dungeon;
            for (let i = 0; i < 20; i++) d.step([]);
            return d.snapshot().doors.find((door) => door.id === 'practice-door')?.open;
          });
          assert.equal(opened, true);
        }
        clicks.push({ kind, ...point, file });
      }
      results.push({ lens, strength, zooms, revealed, walls: { before, after }, clicks });
    }
  return results;
}
