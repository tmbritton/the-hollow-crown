import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { clickWorld } from './world-pointer.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import type { DebugWindow } from './browserTypes.ts';
import type { createReviewStage } from './animation-review-fixture.ts';
import { assertReviewSequence } from './animation-review-assertions.ts';

declare const window: DebugWindow & {
  reviewStage: ReturnType<typeof createReviewStage>;
  reviewClip: ReturnType<ReturnType<typeof createReviewStage>['fixture']>;
};

const selector = process.env.ANIMATION_SCENARIOS || 'all';
const selected = new Set(selector.split(','));
const groups = ['controls', 'catalog', 'baseline'];
assert.ok(
  [...selected].every((s) => s === 'all' || groups.includes(s)),
  'Unknown ANIMATION_SCENARIOS',
);
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const deadline = setTimeout(() => void browser.close().catch(() => {}), 480000);
const errors: string[] = [];
const checks: string[] = [];
const includes = (name: string) => selected.has('all') || selected.has(name);
const sequences: {
  name: string;
  view: string;
  camera: { alpha: number; beta: number; radius: number };
  frames: {
    frame: number;
    image: string;
    pose: ReturnType<DebugWindow['__dungeon']['animation']['sample']>;
  }[];
}[] = [];
const measurements: Record<string, unknown> = {};
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await mkdir('test-results', { recursive: true });
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  if (includes('controls')) {
    const before = await page.evaluate(() => {
      const d = window.__dungeon;
      d.animation.pause();
      return d.game.steps;
    });
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.__dungeon.game.steps), before);
    const stepped = await page.evaluate(() => {
      const d = window.__dungeon;
      d.animation.step(3);
      const first = d.animation.sample('player');
      d.animation.render();
      d.animation.render();
      return { steps: d.game.steps, first, second: d.animation.sample('player') };
    });
    assert.equal(stepped.steps, before + 3);
    assert.deepEqual(
      stepped.first,
      stepped.second,
      'sampling/rendering must not advance animation',
    );
    checks.push('paused fixed stepping and repeated-render idempotence');
    const cutaway = await page.evaluate(() => {
      const d = window.__dungeon;
      const walls = d.game.ecs.query('cutaway').map((e) => e.require('cutaway'));
      const before = walls.map((w) => w.scale);
      d.animation.camera('side');
      d.animation.render();
      const during = walls.map((w) => w.scale);
      d.animation.camera(null);
      return { before, during, after: walls.map((w) => w.scale) };
    });
    assert.deepEqual(
      cutaway.before,
      cutaway.after,
      'review camera restores ordinary cutaway scales',
    );
    assert.ok(cutaway.during.every((s) => s === 0.05 || s === 1));
    const invalid = await page.evaluate(() => {
      const a = window.__dungeon.animation;
      let rejected = 0;
      for (const f of [
        () => a.step(-1),
        () => a.step(121),
        () => a.step(0.5),
        () => a.play(NaN),
        () => a.play(2),
      ]) {
        try {
          f();
        } catch {
          rejected++;
        }
      }
      return rejected;
    });
    assert.equal(invalid, 5);
    const hero = await page.evaluate(() => ({ ...window.__dungeon.game.player.actor.position }));
    await clickWorld(page, hero.x + 3, hero.z, hero.h);
    const traveled = await page.evaluate(() => {
      const d = window.__dungeon,
        p = d.game.player.actor.position;
      const before = { ...p };
      d.animation.step(18);
      return Math.hypot(p.x - before.x, p.z - before.z);
    });
    assert.ok(traveled > 0.5, 'real mouse input flows through the normal motor tick');
    await page.keyboard.down('f');
    assert.ok(
      await page.evaluate(() => {
        window.__dungeon.animation.step();
        return window.__dungeon.game.player.actor.defending;
      }),
    );
    await page.keyboard.up('f');
    assert.equal(await page.evaluate(() => window.__dungeon.game.player.actor.defending), false);
    await page.keyboard.press('Escape');
    const modal = await page.evaluate(() => {
      const d = window.__dungeon,
        before = d.game.steps;
      d.animation.step(6);
      return { before, after: d.game.steps };
    });
    assert.equal(modal.before, modal.after, 'review stepping honors the menu pause');
    await page.keyboard.press('Escape');
    const slow = await page.evaluate(
      () =>
        new Promise<{ frames: number; expected: number }>((resolve) => {
          const d = window.__dungeon;
          let previous = 0,
            elapsed = 0,
            count = 0,
            start = 0;
          const observer = d.game.scene.onBeforeRenderObservable.add(() => {
            const now = performance.now();
            if (count === 0) start = d.game.steps;
            else elapsed += Math.min(0.08, (now - previous) / 1000);
            previous = now;
            if (++count === 17) {
              d.game.scene.onBeforeRenderObservable.remove(observer);
              d.animation.pause();
              resolve({ frames: d.game.steps - start, expected: elapsed * 60 * 0.25 });
            }
          });
          d.animation.play(0.25);
        }),
    );
    assert.ok(Math.abs(slow.frames - slow.expected) <= 2, JSON.stringify(slow));
    await page.evaluate(() => {
      window.__dungeon.animation.play();
      window.__dungeon.regenerate('MOURNING-731');
    });
    await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
    await page.waitForFunction(() => window.__dungeon.game.steps >= 3);
    assert.equal(
      await page.evaluate(() => window.__dungeon.animation.speed),
      1,
      'ordinary debug regeneration keeps playing',
    );
    checks.push('bounded controls, real W/F input, modal pause and quarter-speed playback');
  }

  const fresh = async () => {
    await page.evaluate(() => {
      window.__dungeon.animation.pause();
      window.__dungeon.regenerate('MOURNING-731');
    });
    await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
    return page.evaluate(async () => {
      const path = '/tests/animation-review-fixture.ts';
      const module = (await import(path)) as typeof import('./animation-review-fixture.ts');
      const d = window.__dungeon;
      d.animation.pause();
      d.engine.stopRenderLoop();
      window.reviewStage = module.createReviewStage(d.game);
      return module.reviewCatalog;
    });
  };
  const available = await fresh();
  const clips = process.env.ANIMATION_CLIPS?.split(',');
  if (clips)
    assert.ok(
      clips.every((name) => available.some((s) => `${s.profile}/${s.clip}` === name)),
      'Unknown ANIMATION_CLIPS',
    );
  const catalog = available.filter((s) => !clips || clips.includes(`${s.profile}/${s.clip}`));
  if (includes('catalog')) {
    await page.addStyleTag({
      content:
        'body > :not(#game):not(#animation-review-overlay){display:none!important}body::after{display:none!important}',
    });
    for (const item of catalog) {
      // Replay the same short fixed-clock sequence for each camera, rather than changing
      // camera halfway through an action. 10 Hz captures represent a 60 Hz simulation.
      for (const view of ['gameplay', 'side'] as const) {
        await page.evaluate(
          ({ item, view }) => {
            const d = window.__dungeon;
            window.reviewClip = window.reviewStage.fixture(item.profile, item.clip);
            d.animation.camera(view, window.reviewClip.id);
            d.animation.overlay(false);
          },
          { item, view },
        );
        const frames: (typeof sequences)[number]['frames'] = [];
        for (let frame = 6; frame <= (item.clip === 'opening' ? 132 : 84); frame += 6) {
          const captured = await page.evaluate(() => {
            window.reviewClip.advance(6);
            const d = window.__dungeon;
            d.animation.render();
            const canvas = d.engine.getRenderingCanvas()!;
            return {
              pose: d.animation.sample(window.reviewClip.id),
              image: canvas.toDataURL('image/jpeg', 0.65).split(',')[1],
            };
          });
          const { pose, image } = captured;
          assert.ok(
            pose.joints.every((j) =>
              [...j.position, ...j.localRotation, ...j.scale].every(Number.isFinite),
            ),
          );
          frames.push({ frame, pose, image });
        }
        if (view === 'side') {
          const other = sequences.at(-1)!;
          assert.deepEqual(
            frames.map((f) => f.pose),
            other.frames.map((f) => f.pose),
            'camera replay must have identical simulation/pose samples',
          );
        }
        assertReviewSequence(
          item.clip,
          frames.map((f) => f.pose),
        );
        const camera = await page.evaluate(() => {
          const c = window.__dungeon.game.camera;
          return { alpha: c.alpha, beta: c.beta, radius: c.radius };
        });
        sequences.push({ name: `${item.profile}/${item.clip}`, view, camera, frames });
      }
      console.log(`CAPTURE ${item.profile}/${item.clip}`);
    }
    const repeat = await page.evaluate(() => {
      const d = window.__dungeon;
      window.reviewClip = window.reviewStage.fixture('spearman', 'thrust');
      window.reviewClip.advance(30);
      d.animation.camera('side', window.reviewClip.id);
      const before = d.animation.sample(window.reviewClip.id),
        resources = d.animation.resources();
      d.animation.overlay(true);
      d.animation.render();
      d.animation.render();
      return {
        before,
        after: d.animation.sample(window.reviewClip.id),
        resources,
        afterResources: d.animation.resources(),
      };
    });
    assert.deepEqual(repeat.before, repeat.after);
    assert.deepEqual(repeat.resources, repeat.afterResources);
    await page.screenshot({ path: 'test-results/animation-review-overlay.png' });
    checks.push(
      `${catalog.length} authored motor/clock clips × two camera replays; finite world poses; observational overlay`,
    );
  }
  if (includes('baseline')) {
    await fresh();
    const client = await page.context().newCDPSession(page);
    const resources = await page.evaluate(() => window.__dungeon.animation.resources());
    await client.send('HeapProfiler.startSampling', {
      samplingInterval: 32768,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: true,
    });
    measurements.cpu = await page.evaluate(() => window.reviewStage.baseline());
    const allocation = await client.send('HeapProfiler.stopSampling');
    const total = (node: typeof allocation.profile.head): number =>
      node.selfSize + node.children.reduce((n, child) => n + total(child), 0);
    measurements.allocation = {
      sampledBytes: total(allocation.profile.head),
      interval: 32768,
      includesCollected: true,
      scope:
        'statistical CDP estimate, includes setup/warmup/yields and test instrumentation; not retained heap or exact allocation count',
    };
    const after = await page.evaluate(() => window.__dungeon.animation.resources());
    assert.equal(after.actors, 25);
    for (const key of ['meshes', 'nodes', 'materials', 'textures'] as const)
      assert.equal(after[key], resources[key]);
    measurements.resources = { before: resources, after };
    const regenerations = [];
    for (let i = 0; i < 3; i++) {
      await fresh();
      regenerations.push(
        await page.evaluate(() => ({
          ...window.__dungeon.animation.resources(),
          overlay: !!document.getElementById('animation-review-overlay'),
          speed: window.__dungeon.animation.speed,
          steps: window.__dungeon.game.steps,
        })),
      );
    }
    assert.deepEqual(regenerations[0], regenerations[1]);
    assert.deepEqual(regenerations[1], regenerations[2]);
    assert.equal(regenerations[0].overlay, false);
    assert.equal(regenerations[0].steps, 0);
    measurements.regenerations = regenerations;
    measurements.environment = {
      browser: browser.version(),
      renderer: await page.evaluate(() => window.__dungeon.engine.getGlInfo().renderer),
      viewport: '800×600',
      seed: 'MOURNING-731',
    };
    checks.push(
      '25-actor CPU/query/allocation baseline and stable resources across three regenerations',
    );
    await client.detach();
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  const label = `${selector === 'all' ? '' : `-${selector.replaceAll(',', '-')}`}${clips ? '-selected' : ''}`;
  await writeFile(
    `test-results/animation-review${label}.json`,
    JSON.stringify(
      {
        checks,
        measurements,
        sequences: sequences.map((s) => ({
          ...s,
          frames: s.frames.map(({ frame, pose }) => ({ frame, pose })),
        })),
        errors,
      },
      null,
      2,
    ),
  );
  if (sequences.length) {
    const data = sequences.map((s) => ({
      ...s,
      frames: s.frames.map(({ frame, image }) => ({ frame, image })),
    }));
    await writeFile(
      `test-results/animation-review${label}.html`,
      `<!doctype html><meta charset="utf-8"><title>A0 motion baseline</title>
<style>body{background:#14191c;color:#e1d4ae;font:16px system-ui}img{max-width:95vw}button,select{font:inherit;margin:8px}small{display:block}</style>
<h1>A0 motion baseline</h1><select id="clip"></select><button id="play">Pause</button><button id="step">Step</button><select id="rate"><option value="1">1×</option><option value="0.25">¼×</option></select><span id="frame"></span><br><img id="pose"><small>60 Hz production simulation sampled at 10 Hz. Authored fixtures, not AI outcome tests. Review at 1× before ¼×.</small>
<script>const data=${JSON.stringify(data)};const clip=document.getElementById('clip'),pose=document.getElementById('pose'),label=document.getElementById('frame');
data.forEach((s,i)=>clip.add(new Option(s.name+' · '+s.view,i)));let playing=true,t=0,last=null;
document.getElementById('play').onclick=()=>{playing=!playing;document.getElementById('play').textContent=playing?'Pause':'Play'};
clip.onchange=()=>t=0;document.getElementById('step').onclick=()=>{playing=false;t+=.1};
function draw(now){const s=data[Number(clip.value)];if(playing&&last!==null)t+=Math.max(0,now-last)/1000*Number(document.getElementById('rate').value);last=now;const f=s.frames[Math.floor(t*10)%s.frames.length];pose.src='data:image/jpeg;base64,'+f.image;label.textContent='frame '+f.frame;requestAnimationFrame(draw)}requestAnimationFrame(draw);</script>`,
    );
    const gallery = await browser.newPage();
    gallery.on('pageerror', (error) => errors.push(error.message));
    await gallery.goto(
      new URL(`../test-results/animation-review${label}.html`, import.meta.url).href,
    );
    await gallery.waitForFunction(() =>
      document.querySelector('#frame')?.textContent?.startsWith('frame '),
    );
    await gallery.close();
    assert.deepEqual(errors, []);
  }
  console.log(`PASS animation review: ${checks.join('; ')}`);
} finally {
  clearTimeout(deadline);
  await browser.close();
}
