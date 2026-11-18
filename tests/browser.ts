import { chromium, firefox } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Entity, EntityType, RoomId } from '../src/worldTypes.ts';
import type { BrowserReport, DebugWindow } from './browserTypes.ts';

declare const window: DebugWindow;

const base = process.env.DEMO_URL || 'http://localhost:5173',
  browserName = process.env.BROWSER || 'chromium';
let server: ChildProcess | undefined;
try {
  await fetch(base);
} catch {
  server = spawn('npm', ['run', 'dev', '--', '--port', '5173'], { stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(base);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}
await mkdir('test-results', { recursive: true });
const browser = await (browserName === 'firefox' ? firefox : chromium).launch({
  headless: true,
  ...(browserName === 'chromium'
    ? { args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
    : { firefoxUserPrefs: { 'webgl.force-enabled': true } }),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultNavigationTimeout(90000);
const errors: string[] = [],
  requests: string[] = [];
const report: BrowserReport = {
  browser: browserName,
  checks: [],
  screenshots: [],
  regenerations: [],
};
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('request', (r) => requests.push(r.url()));
function pass(name: string) {
  report.checks.push(name);
  console.log(`PASS ${name}`);
}
const snapshot = () => page.evaluate(() => window.__dungeon.snapshot());
async function settle() {
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  await page.waitForTimeout(400);
}
async function step(codes: string[], frames: number) {
  await page.evaluate(({ codes, frames }) => window.__dungeon.step(codes, frames), {
    codes,
    frames,
  });
}
async function teleport(x: number, z: number) {
  await page.evaluate(({ x, z }) => window.__dungeon.teleport(x, z), { x, z });
}
async function north() {
  await page.evaluate(() => {
    const g = window.__dungeon.game;
    g.camera.alpha = g.desiredAlpha = -Math.PI / 2;
  });
}
async function interact() {
  await page.keyboard.press('KeyE');
}
async function screenshot(name: string) {
  await page.screenshot({ path: `test-results/${browserName}-${name}.png` });
  report.screenshots.push(`${browserName}-${name}.png`);
}
async function entity<T extends EntityType>(type: T) {
  const result = await page.evaluate((type) => {
    const e = window.__dungeon.game.world.entities.find((e) => e.type === type);
    if (!e) throw new Error(`Missing ${type}`);
    return {
      id: e.id,
      x: e.x,
      z: e.z,
      h: e.h,
      type: e.type,
      axis: e.type === 'door' ? e.axis : undefined,
      approach: e.approach,
    };
  }, type);
  // The lookup is checked against T in the browser; only plain data crosses Playwright.
  return result as Pick<
    Extract<Entity, { type: T }>,
    'id' | 'x' | 'z' | 'h' | 'type' | 'approach'
  > & { axis?: 'x' | 'z' };
}
async function room(id: RoomId) {
  return page.evaluate((id) => {
    const r = window.__dungeon.game.world.roomById[id];
    return { x: r.x, z: r.z, h: r.h };
  }, id);
}

// A data-driven pathfinder: the test must discover routes, just like the player.
// It uses the real controller/collision/interaction updates, not teleportation.
async function walkTo(x: number, z: number) {
  const result = await page.evaluate(
    ({ x, z }) => {
      const d = window.__dungeon,
        g = d.game,
        p = g.player.root.position,
        w = g.world;
      const key = (x: number, z: number) => `${Math.round(x)},${Math.round(z)}`;
      const start = key(p.x, p.z),
        goal = key(x, z),
        parents = new Map<string, string | null>([[start, null]]),
        queue = [start];
      const gate = w.entities.find((e) => e.type === 'door' && e.requiresAltar && e.locked);
      for (let i = 0; i < queue.length && !parents.has(goal); i++) {
        const tile = w.tiles.get(queue[i]);
        if (!tile) throw new Error('Missing navigation tile');
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const next = w.tiles.get(key(tile.x + dx, tile.z + dz));
          if (!next || next.blocked || next.surface === 'lava' || Math.abs(next.h - tile.h) > 0.65)
            continue;
          if (
            gate?.type === 'door' &&
            (gate.axis === 'x'
              ? next.x === gate.x && Math.abs(next.z - gate.z) <= 1
              : next.z === gate.z && Math.abs(next.x - gate.x) <= 1)
          )
            continue;
          const k = key(next.x, next.z);
          if (parents.has(k)) continue;
          parents.set(k, queue[i]);
          queue.push(k);
        }
      }
      if (!parents.has(goal))
        return { ok: false, reason: 'No navigation route', goal, position: p.asArray() };
      const route: number[][] = [];
      for (let at: string | null = goal; at !== null; at = parents.get(at) ?? null)
        route.unshift(at.split(',').map(Number));
      for (const [tx, tz] of route) {
        let reached = false,
          stuck = 0;
        for (let i = 0; i < 150; i++) {
          if (Math.hypot(tx - p.x, tz - p.z) < 0.075) {
            reached = true;
            break;
          }
          const door = w.entities.find(
            (e) =>
              e.type === 'door' && !e.open && !e.locked && Math.hypot(e.x - p.x, e.z - p.z) < 2.3,
          );
          if (door) {
            d.interact();
            d.step([], 60);
          }
          const codes = [];
          if (tx - p.x > 0.045) codes.push('KeyD');
          else if (tx - p.x < -0.045) codes.push('KeyA');
          if (tz - p.z > 0.045) codes.push('KeyW');
          else if (tz - p.z < -0.045) codes.push('KeyS');
          const old = p.clone();
          d.step(codes, 1);
          if (old.subtract(p).lengthSquared() < 1e-7) stuck++;
          else stuck = 0;
          if (stuck > 15) break;
        }
        if (!reached)
          return {
            ok: false,
            reason: 'Physical collision',
            waypoint: [tx, tz],
            position: p.asArray(),
          };
      }
      return { ok: true, position: p.asArray() };
    },
    { x, z },
  );
  assert.ok(result.ok, JSON.stringify(result));
}
async function showRoom(id: RoomId, name: string = id) {
  const target = id === 'altar' || id === 'throne' ? (await entity(id)).approach : await room(id);
  await teleport(target.x, target.z);
  await page.evaluate(() => {
    const g = window.__dungeon.game;
    g.camera.alpha = g.desiredAlpha = -Math.PI / 4;
  });
  await page.waitForTimeout(500);
  await screenshot(name);
  await north();
}
async function completeRun(capture = false) {
  await north();
  const rooms: RoomId[] = [
    'water',
    'stairs',
    'lava',
    ...(capture ? (['butchery', 'smithy', 'bakery', 'stable'] as const) : []),
  ];
  for (const id of rooms) {
    const r = await room(id);
    await walkTo(r.x, r.z);
    if (capture) {
      await page.evaluate(() => {
        const g = window.__dungeon.game;
        g.camera.alpha = g.desiredAlpha = -Math.PI / 4;
      });
      await page.waitForTimeout(300);
      await screenshot(id);
      await north();
    }
  }
  const altar = await entity('altar');
  await walkTo(altar.approach.x, altar.approach.z);
  await interact();
  assert.equal((await snapshot()).active, true);
  if (capture) await showRoom('altar');
  const throne = await entity('throne');
  await walkTo(throne.approach.x, throne.approach.z);
  if (capture) await showRoom('throne');
  await interact();
  assert.equal((await snapshot()).complete, true);
  await page.locator('#continue').click();
  await north();
}
async function probeHeroShadow() {
  return page.evaluate(async () => {
    const d = window.__dungeon,
      g = d.game,
      engine = d.engine,
      loops = [...engine.activeRenderLoops];
    const casters = g.shadowMap.renderList;
    if (!casters) throw new Error('Missing shadow caster list');
    const allCast = g.player.shadowMeshes.every((m) => casters.includes(m));
    const allReceive = g.player.shadowMeshes.every((m) => m.receiveShadows);
    const allLit = g.player.shadowMeshes
      .filter((m) => m.material?.name !== 'eyes')
      .every(
        (m) =>
          m.material !== null && 'disableLighting' in m.material && !m.material.disableLighting,
      );
    engine.stopRenderLoop();
    try {
      g.scene.render();
      const V = g.player.root.position.constructor as typeof Vector3,
        M = g.player.root.getWorldMatrix().constructor as typeof Matrix;
      const point = g.player.root.position.add(new V(-0.85, 0.01, -0.5));
      const projected = V.Project(
        point,
        M.Identity(),
        g.scene.getTransformMatrix(),
        g.camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()),
      );
      const x = Math.max(0, Math.round(projected.x) - 48),
        y = Math.max(0, engine.getRenderHeight() - Math.round(projected.y) - 48);
      const on = new Uint8Array((await engine.readPixels(x, y, 96, 96)).buffer);
      g.shadowMap.renderList = casters.filter((m) => !g.heroCasters.has(m));
      g.scene.render();
      const off = new Uint8Array((await engine.readPixels(x, y, 96, 96)).buffer);
      let darkenedPixels = 0,
        totalDifference = 0;
      for (let i = 0; i < on.length; i += 4) {
        const diff = off[i] + off[i + 1] + off[i + 2] - on[i] - on[i + 1] - on[i + 2];
        if (diff > 12) darkenedPixels++;
        totalDifference += diff;
      }
      g.shadowMap.renderList = casters;
      const lamp = g.dungeon.lightPool[0],
        saved = {
          position: lamp.position.clone(),
          diffuse: lamp.diffuse.clone(),
          intensity: lamp.intensity,
        };
      let locallyLitPixels = 0;
      try {
        const torso = V.Project(
          g.player.root.position.add(new V(0, 1.05, 0)),
          M.Identity(),
          g.scene.getTransformMatrix(),
          g.camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()),
        );
        const tx = Math.round(torso.x) - 10,
          ty = engine.getRenderHeight() - Math.round(torso.y) - 12;
        lamp.position.copyFrom(g.player.root.position).addInPlace(new V(1, 1.4, -1));
        lamp.intensity = 4;
        lamp.diffuse.set(1, 0.02, 0.02);
        g.scene.render();
        const red = new Uint8Array((await engine.readPixels(tx, ty, 20, 24)).buffer);
        lamp.diffuse.set(0.02, 0.02, 1);
        g.scene.render();
        const blue = new Uint8Array((await engine.readPixels(tx, ty, 20, 24)).buffer);
        for (let i = 0; i < red.length; i += 4)
          if (
            Math.abs(red[i] - blue[i]) +
              Math.abs(red[i + 1] - blue[i + 1]) +
              Math.abs(red[i + 2] - blue[i + 2]) >
            12
          )
            locallyLitPixels++;
      } finally {
        lamp.position.copyFrom(saved.position);
        lamp.diffuse.copyFrom(saved.diffuse);
        lamp.intensity = saved.intensity;
      }
      return {
        allCast,
        allReceive,
        allLit,
        parts: g.player.shadowMeshes.length,
        darkenedPixels,
        totalDifference,
        locallyLitPixels,
      };
    } finally {
      g.shadowMap.renderList = casters;
      for (const loop of loops) engine.runRenderLoop(loop);
    }
  });
}

try {
  await page.goto(`${base}/?debug`);
  await settle();
  const loadSeeds = new Set([(await snapshot()).seed]);
  for (let i = 0; i < 2; i++) {
    await page.reload();
    await settle();
    loadSeeds.add((await snapshot()).seed);
    assert.equal(new URL(page.url()).searchParams.has('seed'), false);
  }
  assert.equal(loadSeeds.size, 3);
  pass('Page loads and reloads use fresh unpinned seeds');
  await page.goto(`${base}/?debug&seed=MOURNING-731`);
  await settle();
  assert.equal((await snapshot()).seed, 'MOURNING-731');
  await page.reload();
  await settle();
  assert.notEqual((await snapshot()).seed, 'MOURNING-731');
  pass('Explicit seed links reproduce worlds; refresh starts a new run');
  await page.goto(`${base}/?debug&seed=MOURNING-731`);
  await settle();
  assert.deepEqual((await snapshot()).errors, []);
  assert.equal(
    await page.evaluate(() => window.__dungeon.game.shadow.usePercentageCloserFiltering),
    true,
  );
  assert.equal(await page.evaluate(() => window.__dungeon.game.shadowMap.getSize().width), 2048);
  assert.ok(await page.evaluate(() => window.__dungeon.game.fxaa.isSupported));
  pass('Filtered shadows and FXAA compile and render');
  await screenshot('entrance');
  report.heroShadow = await probeHeroShadow();
  assert.ok(report.heroShadow.allCast && report.heroShadow.allReceive && report.heroShadow.allLit);
  assert.ok(
    report.heroShadow.darkenedPixels > 60 && report.heroShadow.locallyLitPixels > 15,
    JSON.stringify(report.heroShadow),
  );
  pass('Hero casts a ground shadow and visibly responds to colored local lights');
  report.renderer = await page.evaluate(() => window.__dungeon.engine.getGlInfo().renderer);
  await north();
  const start = (await snapshot()).position;
  await page.keyboard.down('KeyD');
  await page.waitForFunction(
    (x) => window.__dungeon.game.player.root.position.x > x + 0.3,
    start[0],
    { timeout: 15000 },
  );
  await page.keyboard.up('KeyD');
  pass('Real keyboard movement');
  await page.keyboard.press('Escape');
  const paused = (await snapshot()).position;
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(350);
  await page.keyboard.up('KeyW');
  assert.deepEqual((await snapshot()).position, paused);
  await page.keyboard.press('Escape');
  pass('Pause freezes movement');
  const door = await entity('door'),
    alongX = door.axis === 'x',
    positive = alongX ? 'KeyD' : 'KeyW';
  await teleport(door.x - (alongX ? 2.3 : 0), door.z - (alongX ? 0 : 2.3));
  await step([positive], 100);
  assert.ok((await snapshot()).position[alongX ? 0 : 2] < (alongX ? door.x : door.z) - 0.3);
  await interact();
  await step([], 60);
  await step([positive], 70);
  assert.ok((await snapshot()).position[alongX ? 0 : 2] > (alongX ? door.x : door.z) + 1);
  pass('Generated door blocks and then allows passage');
  await teleport(door.x, door.z);
  await interact();
  assert.equal((await snapshot()).doors.find((d) => d.id === door.id)?.open, true);
  pass('Door cannot close on player');
  const stair = await page.evaluate(() => {
    const c = window.__dungeon.game.world.connections.find((c) => c.ramp);
    if (!c?.ramp) throw new Error('Missing stairs');
    return { axis: c.axis, cross: c.cross, start: c.start, end: c.end, a: c.ramp.a, b: c.ramp.b };
  });
  await teleport(
    stair.axis === 'x' ? stair.start : stair.cross,
    stair.axis === 'z' ? stair.start : stair.cross,
  );
  await walkTo(
    stair.axis === 'x' ? stair.end : stair.cross,
    stair.axis === 'z' ? stair.end : stair.cross,
  );
  assert.ok(Math.abs((await snapshot()).position[1] - stair.b) < 0.05);
  await walkTo(
    stair.axis === 'x' ? stair.start : stair.cross,
    stair.axis === 'z' ? stair.start : stair.cross,
  );
  assert.ok(Math.abs((await snapshot()).position[1] - stair.a) < 0.05);
  pass('Generated stairs work in both directions');
  const wet = await page.evaluate(() => {
    const w = window.__dungeon.game.world;
    return [...w.tiles.values()].find(
      (t) =>
        t.surface === 'water' &&
        !t.blocked &&
        w.tiles.get(`${t.x + 1},${t.z}`)?.surface === 'water',
    );
  });
  assert.ok(wet);
  await teleport(wet.x, wet.z);
  await step(['KeyD'], 20);
  const wetDistance = (await snapshot()).position[0] - wet.x;
  await teleport(0, 0);
  await step(['KeyD'], 20);
  assert.ok(wetDistance < (await snapshot()).position[0] * 0.75);
  pass('Water slows movement');
  const lava = await page.evaluate(() =>
    [...window.__dungeon.game.world.tiles.values()].find((t) => t.surface === 'lava' && !t.blocked),
  );
  assert.ok(lava);
  await teleport(lava.x, lava.z);
  await step([], 1);
  assert.ok((await snapshot()).health < 100);
  await step([], 250);
  assert.equal((await snapshot()).health, 100);
  assert.ok(Math.hypot((await snapshot()).position[0], (await snapshot()).position[2]) < 0.1);
  pass('Lava damage and respawn');
  await completeRun(true);
  pass('Dynamic route through landmarks, altar, gate, and throne completes');
  assert.equal(await page.evaluate(() => window.__dungeon.game.dungeon.creatures.length), 2);
  pass('All four themed rooms render and the stable contains two animated steeds');
  const portrait = await entity('portrait');
  await walkTo(portrait.approach.x, portrait.approach.z);
  await interact();
  await page.waitForFunction(() => window.__dungeon.game.inspection.state === 'viewing');
  assert.ok((await page.locator('#inspection-subtitle').textContent())?.includes('HOUSE'));
  assert.equal(await page.evaluate(() => window.__dungeon.game.chests), 0);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__dungeon.game.inspection.active);
  pass('Royal portrait inspection focuses the camera and returns without awarding a relic');
  const chest = await entity('chest');
  await walkTo(chest.approach.x, chest.approach.z);
  await interact();
  assert.equal(await page.evaluate(() => window.__dungeon.game.chests), 1);
  pass('Relocated reliquary remains accessible');
  assert.ok(
    await page.evaluate(() =>
      window.__dungeon.game.player.shadowMeshes.every((m) =>
        window.__dungeon.game.shadowMap.renderList?.includes(m),
      ),
    ),
  );
  pass('Hero retains shadow casting after room transitions');
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('low');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__dungeon.game.scene.shadowsEnabled), false);
  await page.setViewportSize({ width: 900, height: 700 });
  await page.waitForTimeout(300);
  await screenshot('compact');
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('high');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__dungeon.game.scene.shadowsEnabled), true);
  pass('Resize and quality switching preserve post-processing');
  await page.setViewportSize({ width: 1440, height: 900 });
  report.regenerations = [];
  for (const seed of ['CINDER-42', 'VIOLET-7', 'BONE-81', 'MOURNING-731', 'MOURNING-731']) {
    await page.evaluate((seed) => window.__dungeon.regenerate(seed), seed);
    await settle();
    const current = await snapshot();
    assert.deepEqual(current.errors, []);
    report.regenerations.push({
      seed,
      meshes: current.meshes,
      materials: current.materials,
      textures: current.textures,
      effects: current.effects,
      shaderSources: current.shaderSources,
    });
    assert.ok(
      current.materials <= 32 &&
        current.textures <= 8 &&
        current.effects < 100 &&
        current.shaderSources <= 36,
    );
    if (['CINDER-42', 'VIOLET-7'].includes(seed)) {
      await screenshot(`layout-${seed}`);
      await completeRun();
      pass(`Different layout ${seed} is physically completable`);
    }
  }
  assert.deepEqual(report.regenerations.at(-1), report.regenerations.at(-2));
  pass('Regeneration releases rendering resources');
  assert.deepEqual(
    requests.filter(
      (url) => !url.startsWith(base) && !url.startsWith('data:') && !url.startsWith('blob:'),
    ),
    [],
  );
  assert.ok(!requests.some((url) => /\.(png|jpg|jpeg|webp|gltf|glb|obj)(\?|$)/i.test(url)));
  pass('No imported visual assets or remote requests');
  assert.deepEqual(errors, []);
  pass('No browser or shader errors');
  report.success = true;
} catch (error) {
  report.success = false;
  report.error = error instanceof Error ? error.stack : String(error);
  report.browserErrors = errors;
  await screenshot('failure').catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(`test-results/${browserName}-report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  server?.kill();
}
