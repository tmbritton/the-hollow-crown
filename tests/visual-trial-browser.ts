import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { DebugWindow } from './browserTypes.ts';
import { budget, recipe, routes, view } from './visual-trial-fixture.ts';
import { checkCaptureCamera } from './visual-trial-camera.ts';
import type { CaptureCamera } from './visual-trial-camera.ts';
import { visualTolerance } from './visual-trial-comparison.ts';
import { checkMediaShape, clip, compareVisualMedia } from './visual-trial-media.ts';
import { publishVisualTrial } from './visual-trial-output.ts';
import {
  checkLimits,
  checkPanel,
  checkPassLifecycle,
  checkShortPanel,
} from './visual-trial-panel.ts';

declare const window: DebugWindow;
const base = process.env.DEMO_URL ?? 'http://localhost:5173';
const controlRoot = process.env.VISUAL_TRIAL_OUTPUT ?? 'test-results/visual-trial/15.1';
const baseline = process.argv.includes('--baseline');
const measure = process.argv.includes('--measure');
const panelOnly = process.argv.includes('--panel');
type RouteName = keyof typeof routes;
type Mode = 'original' | 'tuned';
type Trace = ReturnType<typeof import('./visual-trial-fixture.ts').advanceRoute>[];
const fixtureModule = '/tests/visual-trial-fixture.ts';
const routeNames = ['practice', 'dungeon'] as const;
const radii = [18, 36] as const;
const stillName = (radius: number, turn: number) => `radius-${radius}-turn-${turn}.png`;
const stills = radii.flatMap((radius) => [0, 1, 2, 3].map((turn) => stillName(radius, turn)));
const files = [...stills, 'motion.mp4'];

async function buildIdentity() {
  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' });
  const files = git(
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
    'src',
    'tests',
    'index.html',
    'package-lock.json',
    'vite.config.ts',
  )
    .split('\0')
    .filter(Boolean)
    .sort();
  const hash = createHash('sha256');
  for (const file of files)
    hash
      .update(file)
      .update('\0')
      .update(await readFile(file))
      .update('\0');
  return { head: git('rev-parse', 'HEAD').trim(), sourceSha256: hash.digest('hex') };
}

async function select(page: Page, mode: Mode) {
  await page.evaluate(
    ({ mode, recipe }) => {
      const trial = window.__dungeon.visualTrial;
      if (!trial.select({ type: 'SELECT', mode })) throw Error(`Cannot select ${mode}`);
      if (mode === 'tuned')
        for (const [key, value] of Object.entries(recipe))
          if (!trial.select({ type: 'EDIT', key, value })) throw Error(`Cannot edit ${key}`);
    },
    { mode, recipe },
  );
}

async function open(page: Page, name: RouteName) {
  await page.goto(`${base}/${routes[name].query}`);
  await page.waitForFunction(() => window.__dungeon?.ready);
  if (name === 'practice') {
    for (const id of ['reset-practice', 'start-practice-foe']) {
      await page.locator(`#${id}`).click();
      await page.waitForFunction(() => window.__dungeon.ready);
    }
  }
  assert.equal(await page.evaluate(() => window.__dungeon.game.steps), 0);
  assert.equal(await page.locator('#quality').inputValue(), 'high');
  const display = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    dpr: devicePixelRatio,
  }));
  assert.deepEqual([display.width, display.height], [view.width, view.height]);
  assert.ok(Math.abs(display.dpr - 1) < 1e-6, `Unexpected DPR ${display.dpr}`);
}

async function replay(
  page: Page,
  name: RouteName,
  capture?: { directory: string; original?: number[][] },
  offset = 0,
) {
  const route = routes[name];
  const directory = capture?.directory;
  if (directory) await mkdir(directory);
  const targets: number[][] = [];
  const checkCamera = (camera: CaptureCamera, alpha: number, radius: number) => {
    const reference = capture?.original;
    const target = reference?.[targets.length];
    if (reference) assert.ok(target, 'missing Original camera sample');
    checkCaptureCamera(camera, alpha, radius, reference ? 'tuned' : 'original', target);
    targets.push(camera.target);
  };
  const inputs = route.inputs.map((input, i) =>
    i === 0 ? { ...input, tick: input.tick + offset } : input,
  );
  const shot = async (path: string, alpha: number, radius: number) => {
    const { png, camera } = await page.evaluate(
      async ({ alpha, beta, radius, fixtureModule }) => {
        const { captureCamera } = (await import(
          fixtureModule
        )) as typeof import('./visual-trial-fixture.ts');
        const d = window.__dungeon;
        const g = d.game;
        g.camera.alpha = g.desiredAlpha = alpha;
        g.camera.beta = beta;
        g.camera.radius = g.desiredRadius = radius;
        d.visualTrial?.orbit(alpha, beta, radius);
        for (let i = 0; i < 80; i++) d.step([], 0);
        g.scene.render();
        const png = d.engine.getRenderingCanvas()!.toDataURL();
        return { png: png.slice(png.indexOf(',') + 1), camera: captureCamera(d) };
      },
      { alpha, beta: view.beta, radius, fixtureModule },
    );
    checkCamera(camera, alpha, radius);
    await writeFile(path, Buffer.from(png, 'base64'), { flag: 'wx' });
  };
  const trace: Trace = [];
  const clipEnd = route.clipStart + 300;
  // Chunk between display frames; simulation ticks and controls do not depend on wall time.
  for (let start = 0; start <= clipEnd; start += 4) {
    const count = Math.min(4, clipEnd + 1 - start);
    const { rows, frame } = await page.evaluate(
      async ({ count, inputs, view, captureFrame, fixtureModule }) => {
        const d = window.__dungeon;
        const g = d.game;
        const { advanceRoute, captureCamera } = (await import(
          fixtureModule
        )) as typeof import('./visual-trial-fixture.ts');
        g.camera.alpha = g.desiredAlpha = view.alpha;
        g.camera.beta = view.beta;
        g.camera.radius = g.desiredRadius = 18;
        d.visualTrial?.orbit(view.alpha, view.beta, 18);
        const rows = Array.from({ length: count }, () => advanceRoute(d, inputs));
        if (!captureFrame) return { rows, frame: null };
        g.scene.render();
        const png = d.engine.getRenderingCanvas()!.toDataURL().split(',')[1];
        return { rows, frame: { png, camera: captureCamera(d) } };
      },
      {
        count,
        inputs,
        view,
        fixtureModule,
        captureFrame: !!directory && start >= route.clipStart && start < clipEnd,
      },
    );
    trace.push(...rows);
    if (frame) {
      checkCamera(frame.camera, view.alpha, 18);
      await writeFile(
        `${directory}/frame-${String((start - route.clipStart) / 4).padStart(3, '0')}.png`,
        Buffer.from(frame.png, 'base64'),
        { flag: 'wx' },
      );
    }
    if (directory && start + count === route.still) {
      for (const radius of radii)
        for (let turn = 0; turn < 4; turn++)
          await shot(
            `${directory}/${stillName(radius, turn)}`,
            view.alpha + (turn * Math.PI) / 2,
            radius,
          );
    }
  }
  if (directory)
    execFileSync('ffmpeg', [
      '-loglevel',
      'error',
      '-nostdin',
      '-n',
      '-framerate',
      String(clip.fps),
      '-i',
      `${directory}/frame-%03d.png`,
      '-frames:v',
      String(clip.frames),
      '-vf',
      'pad=1280:720',
      '-pix_fmt',
      'yuv420p',
      `${directory}/motion.mp4`,
    ]);
  if (directory)
    assert.equal(targets.length, clip.frames + stills.length, 'capture camera inventory');
  return { trace, targets };
}

function matched(actual: Trace, expected: Trace) {
  const message = 'divergent route (tick/pose/door/health/action)';
  assert.equal(actual.length, expected.length, `${message}: length`);
  // Bound the diagnostic on deliberate mismatch: assert.deepEqual on entire dungeon
  // traces formats hundreds of thousands of lines before constructing the error.
  const first = actual.findIndex((row, i) => !isDeepStrictEqual(row, expected[i]));
  assert.equal(first, -1, `${message}: first difference at tick ${first}`);
}

function checkRoute(name: RouteName, trace: Trace) {
  assert.ok(trace.every((row, tick) => row.tick === tick));
  if (name === 'practice') {
    assert.equal(trace[100].actors[0].pose.x, -6);
    assert.equal(trace[0].doors.find(([id]) => id === 'practice-door')?.[1], false);
    assert.equal(trace[220].doors.find(([id]) => id === 'practice-door')?.[1], true);
    assert.equal(trace[routes.practice.still].actors[0].swing?.target, 'skeleton:practice:0');
  } else {
    const portrait = trace[180].actors[0].pose;
    assert.ok(Math.hypot(portrait.x + 9.43, portrait.z + 4) < 1.5);
    const stair = trace[430].actors[0].pose;
    assert.ok(stair.z >= 13.5 && stair.z < 14.5 && stair.h < 0 && stair.h > -2.4);
    const bakery = trace[580].actors[0].pose;
    assert.deepEqual([bakery.x, bakery.z, bakery.h], [-1, 24, -2.4]);
    assert.equal(trace[routes.dungeon.still].actors[0].swing?.target, 'goblin:bakery:0');
  }
}

function summarize(ms: number[], draws: number[]) {
  const sorted = [...ms].sort((a, b) => a - b);
  return {
    frames: draws.length,
    p95Ms: sorted[Math.ceil(0.95 * sorted.length) - 1],
    meanDraws: draws.reduce((a, b) => a + b, 0) / draws.length,
  };
}

async function timed(page: Page, name: RouteName, mode: Mode, radius: number, expected: Trace) {
  await open(page, name);
  await select(page, mode);
  const result = await page.evaluate(
    async ({ fixtureModule, inputs, view, radius, ticks }) => {
      const { advanceRoute } = (await import(
        fixtureModule
      )) as typeof import('./visual-trial-fixture.ts');
      const d = window.__dungeon;
      const { engine, game } = d;
      const loops = [...engine.activeRenderLoops];
      d.visualTrial.orbit(view.alpha, view.beta, radius);
      const trace: Trace = [];
      const ms: number[] = [];
      const draws: number[] = [];
      let warmFrames = 0;
      let previous: number | undefined;
      engine.stopRenderLoop();
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Timed replay deadline')), 60000);
          engine.runRenderLoop(() => {
            try {
              // The headed browser can report nominal DPR 1 as 0.99999998 under XWayland.
              if (document.hidden || Math.abs(devicePixelRatio - 1) >= 1e-6)
                throw Error(
                  `Presentation environment changed: ${document.visibilityState}, DPR ${devicePixelRatio}`,
                );
              // Warm this very scene/pass without advancing gameplay or sampling intervals.
              if (warmFrames < 24) {
                warmFrames++;
                game.scene.render();
                return;
              }
              const now = performance.now();
              if (previous !== undefined) ms.push(now - previous);
              previous = now;
              engine._drawCalls.fetchNewFrame();
              trace.push(advanceRoute(d, inputs));
              game.scene.render();
              draws.push(engine._drawCalls.current);
              if (trace.length === ticks) {
                clearTimeout(timeout);
                resolve();
              }
            } catch (error) {
              clearTimeout(timeout);
              reject(error);
            }
          });
        });
      } finally {
        engine.stopRenderLoop();
        for (const loop of loops) engine.runRenderLoop(loop);
      }
      return { trace, ms, draws };
    },
    { fixtureModule, inputs: routes[name].inputs, view, radius, ticks: expected.length },
  );
  matched(result.trace, expected);
  return result;
}

async function benchmark(
  page: Page,
  name: RouteName,
  expected: Trace,
  output: string,
  build: Awaited<ReturnType<typeof buildIdentity>>,
  browserVersion: string,
) {
  const hardware = {
    renderer: await page.evaluate(() => window.__dungeon.engine.getGlInfo()),
    driver: execFileSync('nvidia-smi', ['--query-gpu=driver_version', '--format=csv,noheader'], {
      encoding: 'utf8',
    }).trim(),
    refresh: execFileSync('xrandr', ['--current'], { encoding: 'utf8' })
      .split('\n')
      .filter((line) => line.includes('*')),
    power: execFileSync('tuned-adm', ['active'], { encoding: 'utf8' }).trim(),
  };
  assert.doesNotMatch(hardware.renderer.renderer, /swiftshader|llvmpipe|software/i);
  const run = async (mode: Mode) => {
    const near = await timed(page, name, mode, 18, expected);
    const far = await timed(page, name, mode, 36, expected);
    return {
      near: summarize(near.ms, near.draws),
      far: summarize(far.ms, far.draws),
      both: summarize([...near.ms, ...far.ms], [...near.draws, ...far.draws]),
    };
  };
  await run('original');
  await run('tuned');
  type Run = Awaited<ReturnType<typeof run>>;
  const pairs: { order: Mode[]; original: Run; tuned: Run; delta: typeof budget }[] = [];
  for (let i = 0; i < 3; i++) {
    const order: Mode[] = i % 2 === 0 ? ['original', 'tuned'] : ['tuned', 'original'];
    const rows = new Map<Mode, Awaited<ReturnType<typeof run>>>();
    for (const mode of order) rows.set(mode, await run(mode));
    const a = rows.get('original')!;
    const b = rows.get('tuned')!;
    const delta = {
      p95Ms: b.both.p95Ms - a.both.p95Ms,
      meanDraws: b.both.meanDraws - a.both.meanDraws,
    };
    pairs.push({ order, original: a, tuned: b, delta });
    console.log(name, `pair ${i + 1}:`, delta);
  }
  const spread = (key: keyof typeof budget) => {
    const [min, median, max] = pairs.map((pair) => pair.delta[key]).sort((a, b) => a - b);
    return { min, median, max };
  };
  const within = ({ delta }: (typeof pairs)[number]) =>
    delta.p95Ms <= budget.p95Ms && delta.meanDraws <= budget.meanDraws;
  const outcome = pairs.every(within)
    ? 'within budget'
    : (['p95Ms', 'meanDraws'] as const).some((key) =>
          pairs.every((pair) => pair.delta[key] > budget[key]),
        )
      ? 'over budget'
      : 'inconclusive';
  await writeFile(
    `${output}/timing-${name}.json`,
    JSON.stringify(
      {
        hardware,
        build,
        browser: browserVersion,
        view,
        quality: 'high',
        recipe,
        route: routes[name],
        budget,
        method:
          'Babylon render-loop callback intervals; 24 untimed frames per scene plus one full untimed replay per mode',
        pairs,
        frameIntervalDelta: spread('p95Ms'),
        meanDrawsDelta: spread('meanDraws'),
        outcome,
      },
      null,
      2,
    ),
    { flag: 'wx' },
  );
}

async function run(output: string) {
  const build = await buildIdentity();
  const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage({
      viewport: { width: view.width, height: view.height },
      deviceScaleFactor: 1,
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      // Freeze the existing fixed-step driver synchronously, before the first ready frame.
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
    if (!baseline && !measure) {
      await open(page, 'practice');
      await checkPanel(page, output);
      const limits = await checkLimits(page, () => open(page, 'practice'), output);
      await writeFile(`${output}/limits.json`, JSON.stringify(limits, null, 2), { flag: 'wx' });
      console.log('PASS live panel and Lens/Fisheye limits');
    }
    for (const name of panelOnly ? [] : routeNames) {
      await open(page, name);
      if (!baseline && name === 'practice') {
        assert.equal(
          await page.locator('#visual-trial').count(),
          1,
          'practice trial controls absent',
        );
      }
      if (!baseline && name === 'dungeon')
        assert.equal(await page.locator('#visual-trial').isVisible(), false);
      const display = await page.evaluate(() => {
        const { engine } = window.__dungeon;
        return {
          renderer: engine.getGlInfo(),
          buffer: [engine.getRenderWidth(true), engine.getRenderHeight(true)],
          dpr: devicePixelRatio,
        };
      });
      const originalDir = `${output}/${baseline ? 'before' : 'paired'}-${name}-original`;
      const { trace: original, targets } = await replay(
        page,
        name,
        measure ? undefined : { directory: originalDir },
      );
      checkRoute(name, original);
      if (baseline) {
        for (const file of stills) checkMediaShape(`${originalDir}/${file}`, display.buffer, false);
        checkMediaShape(`${originalDir}/motion.mp4`, [view.width, view.height], true);
        await writeFile(
          `${output}/before-${name}.json`,
          JSON.stringify(
            {
              build,
              browser: browser.version(),
              ...display,
              quality: 'high',
              route: routes[name],
              view,
              budget,
              recipe,
              original,
            },
            null,
            2,
          ),
          { flag: 'wx' },
        );
      } else {
        const control = JSON.parse(await readFile(`${controlRoot}/before-${name}.json`, 'utf8'));
        matched(original, control.original);
        assert.deepEqual(display.buffer, control.buffer, 'control framebuffer dimensions changed');
        assert.deepEqual(control.route, routes[name], 'control route changed');
        assert.deepEqual(control.view, view, 'control camera or viewport changed');
        assert.deepEqual(control.recipe, recipe, 'control recipe changed');
        assert.equal(control.quality, 'high');
        if (measure) {
          await benchmark(page, name, original, output, build, browser.version());
          continue;
        }
        await open(page, name);
        const { trace: offsetTrace } = await replay(page, name, undefined, 1);
        assert.throws(() => matched(offsetTrace, original), /divergent route/);
        await open(page, name);
        await select(page, 'tuned');
        const tunedDir = `${output}/paired-${name}-tuned`;
        const { trace: tuned } = await replay(page, name, {
          directory: tunedDir,
          original: targets,
        });
        matched(tuned, original);
        const media = [];
        for (const file of files) {
          const motion = file === 'motion.mp4';
          const stats = await compareVisualMedia(
            [
              `${controlRoot}/before-${name}-original/${file}`,
              `${originalDir}/${file}`,
              `${tunedDir}/${file}`,
            ],
            motion ? [view.width, view.height] : display.buffer,
            motion,
          );
          media.push({ file, ...stats });
        }
        await writeFile(
          `${output}/paired-${name}.json`,
          JSON.stringify(
            {
              controlBuild: control.build,
              build,
              browser: browser.version(),
              ...display,
              route: routes[name],
              view,
              recipe,
              budget,
              quality: 'high',
              original,
              tuned,
              files,
              comparison: { tolerance: visualTolerance, media },
            },
            null,
            2,
          ),
          { flag: 'wx' },
        );
        console.log(
          `PASS ${name}: matched untouched Original and Tuned at ${original.length} ticks`,
        );
      }
    }
    if (!baseline && !measure) {
      // Keep the capture viewport fixed until all matched stills and clips are saved.
      await open(page, 'practice');
      await checkPassLifecycle(page);
      await open(page, 'practice');
      await checkShortPanel(page, output);
      console.log('PASS camera pass lifecycle and 844x390 pointer scroll and copy fallback');
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}

assert.ok(
  [baseline, measure, panelOnly].filter(Boolean).length <= 1,
  'Choose one visual trial mode',
);
const mode = baseline ? 'baseline' : measure ? 'timing' : panelOnly ? 'panel' : 'paired';
console.log(`Published ${mode} evidence: ${await publishVisualTrial(controlRoot, mode, run)}`);
