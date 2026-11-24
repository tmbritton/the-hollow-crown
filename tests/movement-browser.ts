import { chromium, expect, firefox } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { DebugWindow, TestReport } from './browserTypes.ts';
import type { Point } from '../src/worldTypes.ts';
import { MELEE_RANGE } from '../src/combat.ts';

declare const window: DebugWindow & {
  movementTestLoops?: readonly (() => void)[];
  practiceWitness?: {
    engine: DebugWindow['__dungeon']['engine'];
    scene: DebugWindow['__dungeon']['game']['scene'];
  };
  finishPracticeLoading?: () => void;
};
const browserName = process.env.BROWSER || 'chromium';
const browser = await (browserName === 'firefox' ? firefox : chromium).launch({
  headless: true,
  ...(browserName === 'chromium'
    ? { args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
    : {}),
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1.5,
});
const errors: string[] = [],
  report: TestReport = { checks: [] };
const assemblyFault = 'Injected practice assembly failure';
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await mkdir('test-results', { recursive: true });
const pass = (name: string) => {
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
const step = (codes: string[], frames: number) =>
  page.evaluate(({ codes, frames }) => window.__dungeon.step(codes, frames), { codes, frames });
const state = () =>
  page.evaluate(() => {
    const p = window.__dungeon.game.player;
    return {
      x: p.root.position.x,
      z: p.root.position.z,
      h: p.root.position.y,
      speed: p.motion.speed,
      phase: p.motion.animation.phase,
      lean: p.body.rotation.x,
      cape: p.cape.rotation.x,
      destination: p.navigator.destination,
      path: p.navigator.path,
      marker: p.destinationMarker.isEnabled(),
    };
  });
async function reset(point: Point = { x: 0, z: 0 }) {
  await page.evaluate((point) => {
    const d = window.__dungeon,
      g = d.game;
    d.teleport(point.x, point.z);
    g.camera.alpha = g.desiredAlpha = -Math.PI / 2;
    g.camera.beta = 0.64;
    g.camera.radius = g.desiredRadius = 27;
    d.step([], 1);
    g.scene.render();
  }, point);
}
async function screenPoint(point: Point, elevation = 0) {
  const screen = await page.evaluate(
    ({ point, elevation }) => {
      const d = window.__dungeon,
        g = d.game,
        V = g.camera.target.constructor as typeof Vector3,
        M = g.camera.getWorldMatrix().constructor as typeof Matrix;
      const tile = g.world.tiles.get(`${Math.round(point.x)},${Math.round(point.z)}`);
      if (!tile) throw new Error('No floor at click fixture');
      g.scene.render();
      const projected = V.Project(
        new V(point.x, tile.h + elevation, point.z),
        M.Identity(),
        g.scene.getTransformMatrix(),
        g.camera.viewport.toGlobal(d.engine.getRenderWidth(), d.engine.getRenderHeight()),
      );
      const canvas = document.querySelector<HTMLCanvasElement>('#game');
      if (!canvas) throw new Error('Missing canvas');
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + (projected.x * rect.width) / d.engine.getRenderWidth(),
        y: rect.top + (projected.y * rect.height) / d.engine.getRenderHeight(),
      };
    },
    { point, elevation },
  );
  assert.ok(
    screen.x > 0 && screen.x < 1440 && screen.y > 94 && screen.y < 780,
    JSON.stringify(screen),
  );
  return screen;
}
async function click(point: Point) {
  const screen = await screenPoint(point);
  await page.mouse.click(screen.x, screen.y);
  // An expensive command may be pending. It must publish within a bounded number
  // of actual simulation ticks; never drive the scheduler outside the game loop.
  await page.evaluate(() => {
    const d = window.__dungeon;
    for (let i = 0; i < 120 && d.game.player.navigator.pending; i++) d.step([], 1);
    if (d.game.player.navigator.pending) throw Error('floor click still pending after two seconds');
  });
}
async function arrive(target: Point, frames = 600) {
  const result = await page.evaluate(
    ({ target, frames }) => {
      const d = window.__dungeon,
        p = d.game.player;
      for (
        let i = 0;
        i < frames &&
        (p.navigator.active || p.motion.speed > 0 || p.motion.animation.phase !== 'idle');
        i++
      )
        d.step([], 1);
      return {
        distance: Math.hypot(p.root.position.x - target.x, p.root.position.z - target.z),
        active: p.navigator.active,
        speed: p.motion.speed,
        phase: p.motion.animation.phase,
      };
    },
    { target, frames },
  );
  assert.ok(result.distance < 0.04, JSON.stringify(result));
  assert.equal(result.active, false);
  assert.equal(result.speed, 0);
  assert.equal(result.phase, 'idle');
}

async function holdSettled(target: Point) {
  const screen = await screenPoint(target);
  await page.mouse.move(screen.x, screen.y);
  await page.mouse.down();
  await step([], 90);
  const settled = await state();
  await page.evaluate(() => {
    for (const loop of window.movementTestLoops ?? []) window.__dungeon.engine.runRenderLoop(loop);
  });
  await page.waitForTimeout(1500);
  await page.mouse.up();
  await page.evaluate(() => window.__dungeon.engine.stopRenderLoop());
  const after = await state();
  assert.equal(after.destination, null);
  assert.equal(after.speed, 0);
  assert.equal(after.marker, false);
  assert.ok(Math.hypot(after.x - settled.x, after.z - settled.z) < 0.015);
}

const base = process.env.DEMO_URL || 'http://localhost:5173';

async function openPractice() {
  await page.goto(new URL('?room=practice&debug&seed=MOURNING-731', base).href);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  await expect(page.locator('#room-name')).toHaveText('Practice Room');
}

async function quietRoom() {
  await expect(page.locator('.quest-panel')).toBeHidden();
  await expect(page.locator('#agenda')).toBeHidden();
  assert.deepEqual(
    await page.evaluate(() => {
      const { ecs, combat } = window.__dungeon.game;
      const run = ecs.get('run');
      return [
        combat.actors.length,
        combat.enemies.length,
        ...(['lastEmber', 'tribute', 'objectiveWork'] as const).map((key) => !!run?.has(key)),
      ];
    }),
    [1, 0, false, false, false],
  );
}

async function pointerAt(point: Point, elevation = 0) {
  const { x, y } = await screenPoint(point, elevation);
  await page.mouse.move(x, y);
}

const waitForStep = async (count: number) => {
  const from = await page.evaluate(() => window.__dungeon.game.steps);
  await page.waitForFunction((goal) => window.__dungeon.game.steps >= goal, from + count, {
    timeout: 20000,
  });
};

// Drive the fixed clock without substituting any movement input for real DOM events.
const pauseClock = () => page.evaluate(() => window.__dungeon.animation.pause());
const tickInput = (frames: number) =>
  page.evaluate((frames) => window.__dungeon.animation.step(frames), frames);

async function practiceControls() {
  await openPractice();
  await quietRoom();
  await expect(page.locator('#interaction')).toBeHidden();
  await expect(page.locator('#loading')).toHaveCSS('opacity', '0');
  await page.screenshot({ path: `test-results/${browserName}-practice-spawn.png` });
  const {
    practiceDestinations: { beyondPillar },
  } = await import('../src/practiceRoom.ts');
  const pillar = await page.evaluate(() => window.__dungeon.game.world.props[0]);
  await pointerAt(beyondPillar);
  await page.mouse.down();
  await page.mouse.up();
  const detour = await page.waitForFunction(
    ({ target, pillar }) => {
      const p = window.__dungeon.game.player;
      const { x, z } = p.root.position;
      if (
        Math.abs(x - pillar.x) < pillar.w / 2 + 0.29 &&
        Math.abs(z - pillar.z) < pillar.d / 2 + 0.29
      )
        throw Error('hero clipped through pillar');
      return Math.hypot(x - target.x, z - target.z) < 0.11;
    },
    { target: beyondPillar, pillar },
  );
  await detour.dispose();

  await openPractice();
  await pauseClock();
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyA');
  await tickInput(80);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyA');
  assert.ok((await state()).x > pillar.x + pillar.w / 2, 'manual travel stops at pillar');
  assert.ok((await state()).x < -1, 'manual travel reaches pillar');

  await openPractice();
  await pointerAt({ x: 4, z: -4 });
  await page.mouse.down();
  await page.waitForFunction(
    () => (window.__dungeon.game.player.navigator.destination?.x ?? 0) > 3,
  );
  await pointerAt({ x: 1, z: -1 });
  await page.waitForFunction(
    () => (window.__dungeon.game.player.navigator.destination?.z ?? -4) > -2,
  );
  await page.mouse.up();
  await page.keyboard.press('KeyX');
  await waitForStep(30);
  const stopped = await state();
  assert.equal(stopped.destination, null);
  assert.equal(stopped.speed, 0);
  await waitForStep(12);
  const after = await state();
  assert.equal(after.destination, null);
  assert.equal(after.marker, false);
  assert.equal(Math.hypot(after.x - stopped.x, after.z - stopped.z), 0);

  await openPractice();
  await page.keyboard.press('KeyR');
  await page.waitForFunction(
    () => Math.abs(window.__dungeon.game.camera.alpha - Math.PI / 4) < 0.01,
  );
  await pointerAt({ x: 4, z: -4 });
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForFunction(() => window.__dungeon.game.player.navigator.active);
  const start = await state();
  await page.keyboard.down('ArrowUp');
  await waitForStep(18);
  const walk = await state();
  assert.ok(walk.x < start.x - 0.4 && walk.z < start.z - 0.4);
  assert.equal(walk.destination, null);
  await page.keyboard.up('ArrowUp');

  const stride = async (running: boolean) => {
    await openPractice();
    // Freeze wall-clock advancement only. Animation review's fixed clock ticks the
    // actual held keyboard events; __dungeon.step would overwrite those inputs.
    await pauseClock();
    const from = await state();
    if (running) await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyD');
    await tickInput(20);
    const to = await state();
    await page.keyboard.up('KeyD');
    if (running) await page.keyboard.up('ShiftLeft');
    return Math.hypot(to.x - from.x, to.z - from.z);
  };
  const walking = await stride(false);
  const running = await stride(true);
  assert.ok(walking > 0.8 && running > 1.45 * walking, JSON.stringify({ walking, running }));
  await openPractice();

  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__dungeon.game.player.actor.jump.airborne);
  await page.waitForFunction(() => !window.__dungeon.game.player.actor.jump.airborne);
  assert.equal((await state()).h, 0);
  await page.keyboard.down('KeyF');
  await page.waitForFunction(() =>
    window.__dungeon.game.player.actor.entity.require('defense').chart.snapshot.matches('raised'),
  );
  await page.keyboard.up('KeyF');
  await page.waitForFunction(() =>
    window.__dungeon.game.player.actor.entity.require('defense').chart.snapshot.matches('lowered'),
  );
  pass(
    'Practice real floor click, pillar detour and motor, held steering, rotated arrows, WASD, Shift, X, Space and F',
  );
}

async function practiceDoor() {
  const {
    practiceDestinations: { landing },
  } = await import('../src/practiceRoom.ts');
  const door = () =>
    page.evaluate(() => {
      const e = window.__dungeon.game.world.entities[0];
      if (e?.type !== 'door') throw Error('No practice door');
      return { x: e.x, z: e.z, open: e.open, collides: e.collider?.checkCollisions };
    });
  const forward = async (down: boolean) => {
    const action = down
      ? page.keyboard.down.bind(page.keyboard)
      : page.keyboard.up.bind(page.keyboard);
    await action('KeyW');
    await action('KeyD');
  };
  const cross = async () => {
    await tickInput(60);
    assert.equal((await door()).open, true);
    assert.equal((await door()).collides, false);
    await forward(true);
    for (let i = 0; i < 10 && (await state()).z <= landing.z - 0.4; i++) await tickInput(12);
    await forward(false);
    const crossed = await state();
    assert.ok(crossed.z > landing.z - 0.4, JSON.stringify(crossed));
    await quietRoom();
  };
  await openPractice();
  const closed = await door();
  assert.equal(closed.collides, true);
  const start = await state();
  await pointerAt(closed, 1.35);
  await page.mouse.down();
  await page.mouse.up();
  assert.equal((await door()).open, false);
  await expect.poll(door, { timeout: 15000 }).toMatchObject({ open: true });
  assert.ok((await state()).z > start.z + 2, 'door click approaches before opening');
  await pauseClock();
  await cross();
  await page.screenshot({ path: `test-results/${browserName}-practice-through-door.png` });

  await openPractice();
  await pauseClock();
  await page.keyboard.press('KeyE');
  await tickInput(6);
  assert.equal((await door()).open, false);
  await forward(true);
  await tickInput(120);
  await forward(false);
  const blocked = await state();
  assert.ok(blocked.z < closed.z - 0.3 && blocked.z > closed.z - 1, JSON.stringify(blocked));
  assert.equal((await door()).open, false);
  await page.keyboard.press('KeyE');
  await cross();
  pass(
    'Practice door blocks manual movement; remote click approaches and opens; E opens only within reach; both admit crossing',
  );
}

async function practiceRounds() {
  await openPractice();
  await pauseClock();
  await expect(page.locator('#loading')).toHaveCSS('opacity', '0');
  const resetButton = page.getByRole('button', { name: 'Reset practice', exact: true });
  const startFoe = page.getByRole('button', { name: 'Start single-foe practice' });
  await expect(resetButton).toBeVisible({ timeout: 4500 });
  const url = page.url();
  const sample = () =>
    page.evaluate(() => {
      const d = window.__dungeon,
        g = d.game,
        hero = g.player.actor;
      const [foe] = g.combat.enemies;
      const door = g.world.entities[0];
      if (door?.type !== 'door') throw Error('No practice door');
      return {
        hero: { ...hero.position },
        hp: hero.health.current,
        protectedFor: hero.health.invulnerable,
        target: hero.attack.target,
        interaction: hero.attack.interaction,
        swing: hero.attack.swing?.kind,
        pending: hero.navigator.pending,
        destination: hero.navigator.destination,
        door: {
          x: door.x,
          z: door.z,
          open: door.open,
          locked: door.locked,
          collides: door.collider?.checkCollisions,
        },
        corpses: g.ecs.query('corpse').length,
        particles: g.ecs.query('particle').length,
        projectiles: g.ecs.query('projectile').length,
        foe: foe && { position: { ...foe.position }, hp: foe.health.current, id: foe.id },
        gap: foe && Math.hypot(hero.position.x - foe.position.x, hero.position.z - foe.position.z),
        size: d.animation.resources(),
      };
    });
  const pristine = await sample();
  const remember = () =>
    page.evaluate(() => {
      const d = window.__dungeon;
      window.practiceWitness = { engine: d.engine, scene: d.game.scene };
    });
  const replacement = async (act: () => Promise<void>) => {
    await remember();
    await act();
    await page.waitForFunction(
      () => window.__dungeon.ready && window.__dungeon.game.scene !== window.practiceWitness?.scene,
    );
    await pauseClock();
    await expect(page.locator('#loading')).toHaveCSS('opacity', '0');
    assert.equal(page.url(), url);
    assert.equal(
      await page.evaluate(() => {
        const d = window.__dungeon;
        return (
          window.practiceWitness?.engine === d.engine &&
          window.practiceWitness.scene.isDisposed &&
          d.engine.scenes.length === 1
        );
      }),
      true,
    );
  };
  const quietReset = async (act: () => Promise<void>) => {
    await replacement(act);
    await expect(startFoe).toBeEnabled();
    await quietRoom();
    await tickInput(30);
    assert.deepEqual(await sample(), pristine);
    assert.equal((await state()).phase, 'idle');
  };
  const reopen = async () => {
    await pointerAt(pristine.door, 1.35);
    await page.mouse.down();
    await page.mouse.up();
    await tickInput(100);
    assert.deepEqual((await sample()).door, { ...pristine.door, open: true, collides: false });
  };
  await reopen();
  const beforeTravel = await sample();
  await click({ x: 6, z: 0 });
  await tickInput(16);
  const traveling = await sample();
  assert.ok(traveling.destination && traveling.hero.x > beforeTravel.hero.x + 0.4);
  await quietReset(() => resetButton.click());
  await reopen();

  await pointerAt({ x: 5, z: -4 });
  await page.mouse.down();
  await tickInput(12);
  assert.ok((await sample()).destination);
  await quietReset(() => page.keyboard.press('KeyT'));
  await pointerAt({ x: 3, z: -3 });
  await tickInput(20);
  await page.mouse.up();
  assert.deepEqual(await sample(), pristine);

  await page.keyboard.down('KeyD');
  await tickInput(16);
  assert.notDeepEqual((await sample()).hero, pristine.hero);
  await quietReset(() => page.keyboard.down('KeyT'));
  await remember();
  await page.keyboard.down('KeyT'); // Real repeats of both held keys must not start a new round or move.
  await page.keyboard.down('KeyD');
  await tickInput(30);
  assert.deepEqual(await sample(), pristine);
  assert.equal(
    await page.evaluate(() => window.practiceWitness?.scene === window.__dungeon.game.scene),
    true,
  );
  await page.keyboard.up('KeyT');
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyD');
  await tickInput(16);
  await page.keyboard.up('KeyD');
  assert.notDeepEqual((await sample()).hero, pristine.hero);
  pass(
    'Practice reset reuses page/engine, replaces scene, closes the door, clears travel and held inputs, and allows new commands',
  );

  async function pursueFoe(capture = false) {
    await replacement(() => startFoe.click());
    await expect(startFoe).toBeDisabled();
    const before = await sample();
    assert.equal(before.size.actors, 2);
    assert.ok(before.foe && before.gap! > MELEE_RANGE);
    if (capture)
      await page.screenshot({ path: `test-results/${browserName}-practice-single-foe.png` });
    await pointerAt(before.foe.position, 1.35);
    await page.mouse.down();
    await page.mouse.up();
    assert.equal((await sample()).target, before.foe.id);
    await tickInput(12);
    const pursuit = await sample();
    assert.ok(pursuit.gap! < before.gap! && pursuit.gap! > MELEE_RANGE);
    assert.ok(Math.hypot(pursuit.hero.x - before.hero.x, pursuit.hero.z - before.hero.z) > 0.3);
    assert.equal(pursuit.foe?.hp, before.foe.hp);
    return before.foe.hp;
  }

  const foeHP = await pursueFoe(true);
  let hit = await sample();
  for (let i = 0; i < 120 && hit.foe?.hp === foeHP; i++) {
    await tickInput(1);
    hit = await sample();
  }
  assert.ok(hit.foe && hit.foe.hp < foeHP && hit.gap! <= MELEE_RANGE);
  assert.equal(hit.swing, 'MELEE');
  assert.ok(hit.particles > 0);
  let hurt = hit;
  for (let i = 0; i < 20 && hurt.hp === pristine.hp; i++) {
    await tickInput(6);
    hurt = await sample();
  }
  assert.ok(hurt.hp < pristine.hp && hurt.hp > 0 && hurt.particles > 0);
  await quietReset(() => resetButton.click());
  await pursueFoe();
  await quietReset(() => page.keyboard.press('KeyT'));
  await pursueFoe();
  await tickInput(120);
  await tickInput(120);
  assert.equal((await sample()).corpses, 1);
  await expect(startFoe).toBeDisabled();
  assert.equal((await sample()).size.actors, 2);
  await quietReset(() => resetButton.click());

  await replacement(() => startFoe.click());
  for (let i = 0; i < 20 && !(await sample()).protectedFor; i++) await tickInput(120);
  assert.ok((await sample()).protectedFor > 0, 'ordinary skeleton attacks defeat the idle hero');
  await expect(page.locator('#toast')).toContainText('You fall');
  await quietReset(() => resetButton.click());
  pass(
    'Practice opt-in supports real enemy picking, pursuit, melee hits, damage, kill and defeat; reset clears combat and does not accumulate resources',
  );
}

async function practiceRetry() {
  await openPractice();
  const retry = page.getByRole('button', { name: 'Retry practice round' });
  await page.evaluate((message) => {
    const { engine, game } = window.__dungeon;
    window.practiceWitness = { engine, scene: game.scene };
    const log = console.error;
    console.error = (...args: unknown[]) => {
      if (args[0] instanceof Error && args[0].message === message) console.error = log;
      else log(...args);
    };
    const create = engine.createVertexBuffer;
    engine.createVertexBuffer = () => {
      engine.createVertexBuffer = create;
      throw new Error(message);
    };
  }, assemblyFault);
  await page.getByRole('button', { name: 'Start single-foe practice' }).click();
  await expect(retry).toBeFocused({ timeout: 5000 });
  assert.equal(await page.evaluate(() => window.practiceWitness?.engine.scenes.length), 0);
  await page.keyboard.press('Enter');
  await expect(page.locator('#practice-round')).toHaveText('Single-foe round');
  assert.deepEqual(
    await page.evaluate(() => {
      const { engine, game } = window.__dungeon;
      return [
        engine === window.practiceWitness?.engine,
        engine.scenes.length,
        game.combat.enemies.length,
      ];
    }),
    [true, 1, 1],
  );
  pass('Practice assembly failure disposes its partial scene and retries the same roster');
}

async function practiceLoading() {
  await openPractice();
  const startFoe = page.getByRole('button', { name: 'Start single-foe practice' });
  await page.evaluate(() => {
    const { scene } = window.__dungeon.game;
    const prototype: Pick<typeof scene, 'executeWhenReady'> = Object.getPrototypeOf(scene);
    const original = prototype.executeWhenReady;
    prototype.executeWhenReady = function (callback, checkRenderTargets) {
      prototype.executeWhenReady = original;
      window.finishPracticeLoading = () => original.call(this, callback, checkRenderTargets);
    };
  });
  await startFoe.click();
  await page.waitForFunction(() => !!window.finishPracticeLoading);
  const sceneId = () => page.evaluate(() => window.__dungeon.engine.scenes[0]?.uid);
  const loadingScene = await sceneId();
  assert.ok(loadingScene);
  await expect(startFoe).toBeHidden();
  await expect(page.getByRole('button', { name: 'Reset practice', exact: true })).toBeHidden();
  await page.keyboard.press('KeyT');
  assert.equal(await sceneId(), loadingScene);
  await page.evaluate(() => window.finishPracticeLoading?.());
  await expect(page.locator('#practice-round')).toHaveText('Single-foe round');
  assert.equal(await sceneId(), loadingScene);
  pass('An opt-in still loading does not accept a second round request from the real shortcut');
}

try {
  await practiceRetry();
  await practiceLoading();
  await practiceRounds();
  await practiceControls();
  await practiceDoor();
  await page.goto(`${base}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  // A development optimizer reload deliberately randomizes the run; pin this fixture explicitly.
  await page.evaluate(() => window.__dungeon.regenerate('MOURNING-731'));
  await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
  await page.evaluate(() => {
    window.movementTestLoops = [...window.__dungeon.engine.activeRenderLoops];
    window.__dungeon.engine.stopRenderLoop();
  });
  const differential = await page.evaluate(async () => {
    const modulePath = '/tests/collision-replay.ts';
    const { collisionReplay } = (await import(
      modulePath
    )) as typeof import('./collision-replay.ts');
    return collisionReplay(window.__dungeon);
  });
  console.log('CPU4 paired replay', differential);
  pass('CPU4 indexed and full-scan motors agree at each step, including door thresholds');
  await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
  assert.equal(
    await page.evaluate(() => window.__dungeon.game.player.navigator.occupancy!.bodies().length),
    24,
  );
  const liveTarget = { x: 3.2, z: 1.1 };
  await click(liveTarget);
  const liveCommand = await state();
  assert.ok(
    liveCommand.destination &&
      Math.hypot(
        liveCommand.destination.x - liveTarget.x,
        liveCommand.destination.z - liveTarget.z,
      ) < 0.04,
    'a fresh-world floor click must work with enemy collision bodies present',
  );
  await step([], 6);
  await page.evaluate(() => window.__dungeon.game.scene.render());
  await page.screenshot({ path: `test-results/${browserName}-movement-live-actors.png` });
  await arrive(liveTarget);
  pass('Fresh-world floor click routes and arrives with all living actor bodies present');

  await page.evaluate(() => {
    // Isolate floor navigation; the combat suite checks rendered actor collision and corpse traversal.
    for (const enemy of window.__dungeon.game.combat.enemies) {
      enemy.entity.remove('brain');
      enemy.entity.remove('body');
      enemy.entity.require('render').root?.setEnabled(false);
    }
  });
  const scenes = await page.evaluate(() => {
    const { world } = window.__dungeon.game.scenario!;
    const { scene: renderScene } = window.__dungeon.game;
    return world.scenes.map((scene) => ({
      room: scene.room,
      center: { x: world.roomById[scene.room].x, z: world.roomById[scene.room].z },
      props: scene.props.map((prop) => ({
        id: prop.id,
        front: prop.frontClearance!,
        collider: renderScene.getMeshByName(prop.id)?.checkCollisions ?? false,
      })),
    }));
  });
  assert.equal(scenes.length, 2);
  for (const scene of scenes) {
    for (const prop of scene.props) {
      assert.ok(prop.collider, `${prop.id}: rendered collider missing`);
      await reset(scene.center);
      await page.evaluate(() => {
        const g = window.__dungeon.game;
        g.camera.radius = g.desiredRadius = 35;
      });
      await click(prop.front);
      await arrive(prop.front);
      await click(scene.center);
      await arrive(scene.center);
    }
    await page.evaluate(() => window.__dungeon.game.scene.render());
    await page.screenshot({ path: `test-results/${browserName}-scene-${scene.room}.png` });
  }
  pass('Recipe work faces have rendered colliders and support real floor-click arrival and return');
  await reset();
  const target = { x: 3.2, z: 1.1 };
  await click(target);
  const commanded = await state();
  assert.ok(
    commanded.destination &&
      Math.hypot(commanded.destination.x - target.x, commanded.destination.z - target.z) < 0.04,
  );
  await step([], 1);
  const first = await state();
  assert.ok(first.speed > 0 && first.speed < 4.8);
  assert.equal(first.phase, 'starting');
  assert.equal(first.marker, true);
  await step([], 5);
  assert.ok((await state()).lean > 0.1);
  await page.evaluate(() => window.__dungeon.game.scene.render());
  await page.screenshot({ path: `test-results/${browserName}-movement-route.png` });
  await arrive(target);
  assert.equal((await state()).marker, false);
  pass('Real high-DPI floor click accelerates, travels, brakes precisely, and settles to idle');

  await click({ x: 0, z: 3 });
  await step([], 12);
  await click({ x: 0, z: -3 });
  await arrive({ x: 0, z: -3 });
  pass('A new click replaces the route while moving');

  await reset();
  const heldScreen = await screenPoint({ x: 2, z: 0 });
  await page.mouse.move(heldScreen.x, heldScreen.y);
  await page.mouse.down();
  await page.evaluate(() => {
    for (const loop of window.movementTestLoops ?? []) window.__dungeon.engine.runRenderLoop(loop);
  });
  await page.waitForFunction(
    () => (window.__dungeon.game.player.navigator.destination?.x ?? 0) > 2.1,
  );
  const redirectedScreen = await screenPoint({ x: 0, z: 3 });
  await page.mouse.move(redirectedScreen.x, redirectedScreen.y);
  await page.waitForFunction(
    () => (window.__dungeon.game.player.navigator.destination?.z ?? 0) > 2,
  );
  await page.mouse.up();
  await page.evaluate(() => window.__dungeon.engine.stopRenderLoop());
  const heldGoal = (await state()).destination;
  assert.ok(heldGoal);
  await arrive(heldGoal);
  pass('Holding left mouse continuously steers as the camera and cursor move');

  await reset();
  await click({ x: 4, z: 0 });
  await step([], 10);
  await page.keyboard.down('KeyW');
  await step(['KeyW'], 12);
  await page.keyboard.up('KeyW');
  assert.equal((await state()).destination, null);
  const release = await state();
  await step([], 1);
  const braking = await state();
  assert.ok(braking.speed > 0 && braking.speed < release.speed);
  assert.equal(braking.phase, 'stopping');
  await step([], 30);
  const stopped = await state();
  assert.equal(stopped.speed, 0);
  assert.equal(stopped.phase, 'idle');
  assert.ok(stopped.z > release.z && stopped.z - release.z < 0.3);
  pass('WASD overrides the route and release eases into a short stop animation');

  await reset();
  await step(['KeyD'], 20);
  const walking = await state();
  await reset();
  await step(['KeyD', 'ShiftLeft'], 20);
  const running = await state();
  assert.ok(walking.speed > 4.6 && running.speed > 7.1 && running.x > walking.x * 1.45);
  await click({ x: 0, z: 3 });
  await page.keyboard.press('KeyX');
  await step([], 40);
  assert.equal((await state()).destination, null);
  assert.equal((await state()).speed, 0);
  pass('Faster walking and Shift-running retain easing; X cancels travel');

  const obstacle = await page.evaluate(() => {
    const g = window.__dungeon.game,
      n = g.player.navigator;
    const props = g.world.props.filter((p) => p.room === 'entrance');
    for (const b of g.world.blockers.filter((b) => props.some((p) => p.id === b.id))) {
      for (const axis of ['x', 'z'] as const) {
        const extent = (axis === 'x' ? b.w : b.d) / 2 + 1.4;
        const from = { x: b.x - (axis === 'x' ? extent : 0), z: b.z - (axis === 'z' ? extent : 0) };
        const to = { x: b.x + (axis === 'x' ? extent : 0), z: b.z + (axis === 'z' ? extent : 0) };
        if (n.canStand(from) && n.canStand(to) && n.goTo(from, to) && n.path.length > 1) {
          n.cancel();
          return { blocker: b, from, to };
        }
      }
    }
    throw new Error('No furniture routing fixture');
  });
  await reset(obstacle.from);
  await click(obstacle.to);
  assert.ok((await state()).path.length > 1);
  const detour = await page.evaluate(({ blocker, to }) => {
    const d = window.__dungeon,
      p = d.game.player;
    let clipped = false;
    for (let i = 0; i < 600 && (p.navigator.active || p.motion.speed > 0); i++) {
      d.step([], 1);
      if (
        Math.abs(p.root.position.x - blocker.x) < blocker.w / 2 + 0.29 &&
        Math.abs(p.root.position.z - blocker.z) < blocker.d / 2 + 0.29
      )
        clipped = true;
    }
    return { clipped, distance: Math.hypot(p.root.position.x - to.x, p.root.position.z - to.z) };
  }, obstacle);
  assert.equal(detour.clipped, false);
  assert.ok(detour.distance < 0.04, JSON.stringify(detour));
  pass('Click movement physically routes around furniture without cutting corners');

  const interiorAim = (traveler: Point) => {
    const { x, z, w, d } = obstacle.blocker;
    const distance = Math.hypot(traveler.x - x, traveler.z - z);
    const point = {
      x: x + (0.17 * (traveler.x - x)) / distance,
      z: z + (0.17 * (traveler.z - z)) / distance,
    };
    assert.ok(Math.abs(point.x - x) < w / 2 && Math.abs(point.z - z) < d / 2);
    return point;
  };
  await reset(obstacle.from);
  const firstAim = interiorAim(obstacle.from);
  await click(firstAim);
  const partialProp = (await state()).destination;
  assert.ok(partialProp, 'blocked furniture floor click must install a partial route');
  assert.ok(
    Math.hypot(partialProp.x - obstacle.blocker.x, partialProp.z - obstacle.blocker.z) <
      Math.hypot(obstacle.from.x - obstacle.blocker.x, obstacle.from.z - obstacle.blocker.z),
  );
  await step([], 1);
  const ring = await page.evaluate(() => {
    const p = window.__dungeon.game.player;
    return {
      x: p.destinationMarker.position.x,
      z: p.destinationMarker.position.z,
      visible: p.destinationMarker.isEnabled(),
      safe: p.navigator.canOccupy(p.navigator.destination!),
    };
  });
  assert.equal(ring.visible, true);
  assert.equal(ring.safe, true);
  assert.equal(ring.x, partialProp.x);
  assert.equal(ring.z, partialProp.z);
  await page.evaluate(() => window.__dungeon.game.scene.render());
  await page.screenshot({ path: `test-results/${browserName}-movement-partial-furniture.png` });
  await arrive(partialProp);
  await holdSettled(firstAim);
  pass(
    'Blocked furniture floor clicks show the effective ring, arrive precisely and held input stays settled',
  );

  // Keep the same navigator and actually travel to the opposing side before clicking
  // the blocked floor again; old-root caches and coordinate-only ties hid in reset tests.
  await click(obstacle.to);
  await arrive(obstacle.to);
  await click(interiorAim(obstacle.to));
  const opposite = await state();
  assert.ok(opposite.destination);
  const toward = { x: obstacle.to.x - obstacle.blocker.x, z: obstacle.to.z - obstacle.blocker.z };
  assert.ok(
    (opposite.destination.x - obstacle.blocker.x) * toward.x +
      (opposite.destination.z - obstacle.blocker.z) * toward.z >
      0,
    'the repeated blocked click should approach the current side',
  );
  let routeCost = 0,
    previous = { x: opposite.x, z: opposite.z };
  for (const point of opposite.path) {
    routeCost += Math.hypot(point.x - previous.x, point.z - previous.z);
    previous = point;
  }
  assert.ok(routeCost < Math.hypot(toward.x, toward.z), JSON.stringify(opposite));
  await step([], 1);
  await page.evaluate(() => window.__dungeon.game.scene.render());
  await page.screenshot({ path: `test-results/${browserName}-movement-partial-opposite.png` });
  await arrive(opposite.destination);
  pass('Interior blocked floor clicks choose the safe approach on the current side');

  // Separately send the exact same world coordinate on both sides, bypassing screen rounding.
  // Keep the same navigator across the trip so a stale cached root cannot pass this test.
  const exact = () =>
    page.evaluate(({ x, z }) => {
      const d = window.__dungeon,
        p = d.game.player,
        n = p.navigator;
      n.goTo(p.actor.position, { x, z }, { partial: true });
      for (let i = 0; n.pending && i < 120; i++) d.step([], 1);
      if (n.pending || !n.destination || !n.canOccupy(n.destination))
        throw new Error('unsafe exact partial route');
      return n.destination;
    }, obstacle.blocker);
  await reset(obstacle.from);
  const exactFrom = await exact();
  await arrive(exactFrom);
  await click(obstacle.to);
  await arrive(obstacle.to);
  const exactTo = await exact();
  assert.ok((exactTo.x - exactFrom.x) * toward.x + (exactTo.z - exactFrom.z) * toward.z > 0);
  await arrive(exactTo);
  pass('Exact-coordinate blocked requests re-root after travel without pointer rounding');

  const lava = await page.evaluate(() => {
    const g = window.__dungeon.game,
      n = g.player.navigator;
    for (const target of g.world.tiles.values()) {
      if (target.surface !== 'lava') continue;
      for (const from of g.world.tiles.values()) {
        const distance = Math.hypot(from.x - target.x, from.z - target.z);
        if (from.room !== target.room || distance < 2 || distance > 3 || !n.canOccupy(from))
          continue;
        if (n.goTo(from, target, { partial: true }) && n.destination) {
          const endpoint = n.destination;
          n.cancel();
          return { from: { x: from.x, z: from.z }, target: { x: target.x, z: target.z }, endpoint };
        }
      }
    }
    throw new Error('No unreachable lava-floor fixture');
  });
  await reset(lava.from);
  await click(lava.target);
  const lavaEnd = (await state()).destination;
  assert.ok(lavaEnd);
  assert.ok(Math.hypot(lavaEnd.x - lava.target.x, lavaEnd.z - lava.target.z) > 0.8);
  assert.ok(Math.hypot(lavaEnd.x - lava.from.x, lavaEnd.z - lava.from.z) > 0.5);
  await step([], 1);
  await page.evaluate(() => window.__dungeon.game.scene.render());
  await page.screenshot({ path: `test-results/${browserName}-movement-partial-lava.png` });
  await arrive(lavaEnd);
  assert.equal(
    await page.evaluate(() => {
      const p = window.__dungeon.game.player;
      return p.navigator.canOccupy(p.actor.position);
    }),
    true,
  );
  await holdSettled(lava.target);
  // Cancel a partial route through the real modal path, then retry the same floor request.
  await reset(lava.from);
  await click(lava.target);
  await step([], 6);
  await page.locator('#menu-button').click();
  const cancelledPartial = await state();
  assert.equal(cancelledPartial.destination, null);
  assert.equal(cancelledPartial.speed, 0);
  await page.keyboard.press('Escape');
  await step([], 60);
  assert.equal((await state()).x, cancelledPartial.x);
  assert.equal((await state()).z, cancelledPartial.z);
  await click(lava.target);
  const retry = (await state()).destination;
  assert.ok(retry);
  await arrive(retry);
  pass(
    'Unreachable lava-floor clicks/holds stop safely; modal reset clears the partial command and allows retry',
  );

  const stairs = await page.evaluate(() => {
    const c = window.__dungeon.game.world.connections.find((c) => c.ramp);
    if (!c?.ramp) throw new Error('Missing stairs');
    return {
      from: c.axis === 'x' ? { x: c.start, z: c.cross } : { x: c.cross, z: c.start },
      to: c.axis === 'x' ? { x: c.end, z: c.cross } : { x: c.cross, z: c.end },
      height: c.ramp.b,
    };
  });
  await reset(stairs.from);
  await click(stairs.to);
  await arrive(stairs.to);
  assert.ok(Math.abs((await state()).h - stairs.height) < 0.05);
  pass('Floor picking and click travel traverse elevation-changing stairs');

  const gate = await page.evaluate(() => {
    const g = window.__dungeon.game,
      e = g.world.entities.find((e) => e.type === 'door' && e.requiresAltar);
    if (e?.type !== 'door') throw new Error('Missing throne gate');
    const c = g.world.connections.find((c) => c.door === e.id);
    if (!c) throw new Error('Missing gate passage');
    const sign = c.b === 'throne' ? c.sign : -c.sign;
    return {
      id: e.id,
      axis: e.axis,
      from: {
        x: e.x - (e.axis === 'x' ? 2.2 * sign : 0),
        z: e.z - (e.axis === 'z' ? 2.2 * sign : 0),
      },
      to: {
        x: e.x + (e.axis === 'x' ? 2.2 * sign : 0),
        z: e.z + (e.axis === 'z' ? 2.2 * sign : 0),
      },
    };
  });
  await reset(gate.from);
  await page.evaluate((axis) => {
    const g = window.__dungeon.game;
    // See the far floor from beside the doorway: a ray through the door correctly
    // invokes door interaction instead of a floor command.
    g.camera.alpha = g.desiredAlpha = axis === 'z' ? 0 : -Math.PI / 2;
    g.camera.beta = 0.35;
    g.scene.render();
  }, gate.axis);
  await click(gate.to);
  const gateEnd = (await state()).destination;
  assert.ok(gateEnd, 'a floor click beyond the gate approaches its reachable side');
  assert.ok(Math.hypot(gateEnd.x - gate.to.x, gateEnd.z - gate.to.z) > 2.5);
  assert.ok(Math.hypot(gateEnd.x - gate.from.x, gateEnd.z - gate.from.z) > 1);
  await step([], 1);
  assert.ok((await state()).marker);
  await page.evaluate(() => window.__dungeon.game.scene.render());
  await page.screenshot({ path: `test-results/${browserName}-movement-partial-gate.png` });
  await arrive(gateEnd);
  await holdSettled(gate.to);
  assert.equal(
    await page.evaluate((id) => {
      const e = window.__dungeon.game.world.entities.find((e) => e.id === id);
      return e?.type === 'door' && e.locked && !e.open;
    }, gate.id),
    true,
  );
  await page.evaluate((id) => {
    const d = window.__dungeon,
      e = d.game.world.entities.find((e) => e.id === id);
    if (e?.type !== 'door') throw new Error('Missing gate');
    e.locked = false;
    d.interact();
    d.step([], 60);
  }, gate.id);
  // The partial endpoint is inside the door's anti-crush occupancy zone. Start far
  // enough away for the closing leaf to settle before the hero reaches that zone.
  const closingFrom = {
    x: gate.from.x + (gate.from.x - gate.to.x) / 4.4,
    z: gate.from.z + (gate.from.z - gate.to.z) / 4.4,
  };
  await reset(closingFrom);
  await click(gate.to);
  assert.ok(
    (await state()).destination,
    JSON.stringify(
      await page.evaluate(() => ({
        target: window.__dungeon.game.player.actor.attack.target,
        interaction: window.__dungeon.game.player.actor.attack.interaction,
        doors: window.__dungeon.snapshot().doors,
      })),
    ),
  );
  await page.evaluate((id) => {
    const e = window.__dungeon.game.world.entities.find((e) => e.id === id);
    if (e?.type !== 'door' || !e.collider) throw new Error('Missing gate collider');
    e.open = false;
    if (e.open) throw new Error('Closing-door fixture is still occupied');
    e.collider.checkCollisions = true;
  }, gate.id);
  await step([], 180);
  assert.equal((await state()).destination, null);
  assert.ok(Math.hypot((await state()).x - gate.to.x, (await state()).z - gate.to.z) > 1);
  assert.equal(
    await page.evaluate((id) => {
      const e = window.__dungeon.game.world.entities.find((e) => e.id === id);
      return e?.type === 'door' && !e.open && e.collider?.checkCollisions;
    }, gate.id),
    true,
  );
  await reset(gate.from);
  await page.keyboard.press('KeyE');
  await step([], 60);
  assert.equal(
    await page.evaluate((id) => {
      const e = window.__dungeon.game.world.entities.find((e) => e.id === id);
      return e?.type === 'door' && e.open && !e.collider?.checkCollisions;
    }, gate.id),
    true,
  );
  await click(gate.to);
  await arrive(gate.to);
  pass('Locked and closing doors block click routes; an opened door allows passage');

  await reset();
  await click({ x: 3, z: 0 });
  await step([], 10);
  await page.locator('#menu-button').click();
  const paused = await state();
  assert.equal(paused.destination, null);
  assert.equal(paused.speed, 0);
  await page.mouse.click(20, 120);
  assert.equal((await state()).destination, null);
  await page.locator('#quality').selectOption('low');
  await page.keyboard.press('Escape');
  await step([], 60);
  assert.equal((await state()).x, paused.x);
  await click({ x: 0, z: 3 });
  await arrive({ x: 0, z: 3 });
  pass('HUD and pause clicks do not move the hero; picking works at low render resolution');

  const portrait = await page.evaluate(() => {
    const e = window.__dungeon.game.world.entities.find((e) => e.type === 'portrait');
    if (!e) throw new Error('Missing portrait');
    return {
      approach: e.approach,
      destination: {
        x: e.approach.x - e.wallDirection[0] * 0.4,
        z: e.approach.z - e.wallDirection[1] * 0.4,
      },
    };
  });
  await reset(portrait.approach);
  await click(portrait.destination);
  assert.ok((await state()).destination);
  await page.keyboard.press('KeyE');
  await page.evaluate(() => window.__dungeon.game.inspection.update(1));
  assert.equal(await page.evaluate(() => window.__dungeon.game.inspection.state), 'viewing');
  assert.equal((await state()).destination, null);
  assert.equal((await state()).speed, 0);
  await page.locator('#game').dispatchEvent('pointerdown', {
    button: 0,
    isPrimary: true,
    pointerId: 1,
    clientX: 720,
    clientY: 450,
  });
  assert.equal((await state()).destination, null);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__dungeon.game.inspection.update(1));
  await step([], 60);
  assert.ok(
    Math.hypot((await state()).x - portrait.approach.x, (await state()).z - portrait.approach.z) <
      0.01,
  );
  pass('Inspection cancels queued travel, ignores floor clicks, and returns without drift');

  await reset();
  await click({ x: 0, z: 3 });
  await step([], 20);
  await click({ x: 0, z: 0 });
  await step([], 8);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal((await state()).destination, null);
  assert.equal((await state()).speed, 0);
  await click({ x: 0, z: 0 });
  await page.evaluate(() => window.__dungeon.regenerate('MOVEMENT-RESET'));
  await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
  assert.equal((await state()).destination, null);
  assert.equal((await state()).speed, 0);
  pass('Focus loss and regeneration clear movement intent and momentum');

  // Capture readable close-up poses using the same actual player/controller.
  await reset();
  await page.evaluate(() => {
    const g = window.__dungeon.game;
    g.camera.radius = g.desiredRadius = 7;
    g.camera.beta = 1;
  });
  await step(['KeyD'], 6);
  await page.evaluate(() => window.__dungeon.game.scene.render());
  await page.screenshot({ path: `test-results/${browserName}-movement-start.png` });
  await step(['KeyD'], 20);
  await step([], 8);
  await page.evaluate(() => window.__dungeon.game.scene.render());
  await page.screenshot({ path: `test-results/${browserName}-movement-stop.png` });
  assert.deepEqual(errors, []);
  report.success = true;
} catch (error) {
  report.success = false;
  report.error = error instanceof Error ? error.stack : String(error);
  report.errors = errors;
  console.error(error);
  process.exitCode = 1;
  await page
    .screenshot({ path: `test-results/${browserName}-movement-failure.png` })
    .catch(() => {});
} finally {
  await writeFile(
    `test-results/${browserName}-movement-report.json`,
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
