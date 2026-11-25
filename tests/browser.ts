import { chromium, firefox } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { withViteServer } from './testServer.ts';
import type { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Entity, EntityType, RoomId } from '../src/worldTypes.ts';
import type { BrowserReport, DebugWindow } from './browserTypes.ts';
import { clickWorld } from './world-pointer.ts';

declare const window: DebugWindow & { clickTravel(x: number, y: number): Promise<void> };

const base = process.env.DEMO_URL || 'http://localhost:5173',
  browserName = process.env.BROWSER || 'chromium',
  replaySeeds = process.env.LANDMARK_REPLAY?.split(',');
await withViteServer(base, 'dev', async () => {
  await mkdir('test-results', { recursive: true });
  const browser = await (browserName === 'firefox' ? firefox : chromium).launch({
    headless: true,
    ...(browserName === 'chromium'
      ? { args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
      : { firefoxUserPrefs: { 'webgl.force-enabled': true } }),
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.exposeFunction('clickTravel', (x: number, y: number) => page.mouse.click(x, y));
    page.setDefaultNavigationTimeout(90000);
    const errors: string[] = [],
      requests: string[] = [];
    const report: BrowserReport & { travel?: unknown[] } = {
      browser: browserName,
      checks: [],
      screenshots: [],
      regenerations: [],
      travel: [],
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
        const r = window.__dungeon.game.scenario!.world.roomById[id];
        return { x: r.x, z: r.z, h: r.h };
      }, id);
    }

    // Tile routes are proposals, not proof a floor command can traverse each edge.
    // Keep live physics/AI, retry around failed edges, and use ordinary combat for blockers.
    async function walkTo(x: number, z: number) {
      const result = await page.evaluate(
        async ({ x, z }) => {
          const d = window.__dungeon,
            g = d.game,
            p = g.player.root.position,
            w = g.world;
          const immunity = g.player.actor.health.invulnerable;
          const proxy = g.scene.getMeshByName(`${g.player.actor.id} collision proxy`)!;
          const contacts = new Set<string>();
          const loops = [...d.engine.activeRenderLoops];
          d.engine.stopRenderLoop();
          const beta = g.camera.beta;
          g.camera.beta = 0.12;
          const observer = proxy.onCollideObservable.add((mesh) => contacts.add(mesh.name));
          const occupancy = g.player.navigator.occupancy!;
          const previousProbe = occupancy.contactProbe;
          let livingContact: string | undefined;
          occupancy.contactProbe = ({ hit, from, to, bodies }) => {
            if (!hit) return;
            const probe = occupancy.contactProbe;
            occupancy.contactProbe = undefined;
            try {
              const body = bodies.find((b) => !occupancy.segmentClear(from, to, [b]));
              if (body)
                livingContact = g.combat.enemies.find(
                  (a) => a.alive && a.position.x === body.x && a.position.z === body.z,
                )?.id;
            } finally {
              occupancy.contactProbe = probe;
            }
          };
          const rejected = new Set<string>();
          const stalls = [];
          g.player.actor.health.invulnerable = Infinity;
          try {
            route: for (let replans = 0; replans < 48; replans++) {
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
                  if (
                    !next ||
                    next.blocked ||
                    next.surface === 'lava' ||
                    Math.abs(next.h - tile.h) > 0.65
                  )
                    continue;
                  if (
                    gate?.type === 'door' &&
                    (gate.axis === 'x'
                      ? next.x === gate.x && Math.abs(next.z - gate.z) <= 1
                      : next.z === gate.z && Math.abs(next.x - gate.x) <= 1)
                  )
                    continue;
                  const k = key(next.x, next.z);
                  if (parents.has(k) || rejected.has(`${queue[i]}>${k}`)) continue;
                  parents.set(k, queue[i]);
                  queue.push(k);
                }
              }
              if (!parents.has(goal))
                return {
                  ok: false,
                  reason: 'No navigation route',
                  goal,
                  position: p.asArray(),
                  stalls,
                };
              const route: number[][] = [];
              for (let at: string | null = goal; at !== null; at = parents.get(at) ?? null)
                route.unshift(at.split(',').map(Number));
              for (const [index, [tx, tz]] of route.entries()) {
                contacts.clear();
                livingContact = undefined;
                const finalWaypoint = index === route.length - 1;
                let reached = false,
                  stuck = 0;
                const clickWaypoint = async () => {
                  const V = g.camera.target.constructor as typeof Vector3;
                  const M = g.camera.getWorldMatrix().constructor as typeof Matrix;
                  const width = d.engine.getRenderWidth(),
                    height = d.engine.getRenderHeight();
                  const h = w.tiles.get(key(tx, tz))!.h;
                  g.camera.getViewMatrix();
                  g.scene.setTransformMatrix(
                    g.camera.getViewMatrix(),
                    g.camera.getProjectionMatrix(),
                  );
                  const s = V.Project(
                    new V(tx, h, tz),
                    M.Identity(),
                    g.scene.getTransformMatrix(),
                    g.camera.viewport.toGlobal(width, height),
                  );
                  const rect = d.engine.getRenderingCanvas()!.getBoundingClientRect();
                  await window.clickTravel(
                    rect.left + (s.x * rect.width) / width,
                    rect.top + (s.y * rect.height) / height,
                  );
                };
                if (Math.hypot(tx - p.x, tz - p.z) >= 0.075) await clickWaypoint();
                for (let i = 0; i < 150; i += 3) {
                  const remaining = Math.hypot(tx - p.x, tz - p.z);
                  if (remaining < 0.075 && (!finalWaypoint || g.player.motion.speed === 0)) {
                    reached = true;
                    break;
                  }
                  const door = g.nearest;
                  if (door?.type === 'door' && !door.locked && !door.open) {
                    d.interact();
                    if (door.open) {
                      d.step([], 40);
                      await clickWaypoint();
                    }
                  }
                  const old = p.clone();
                  d.step([], 3);
                  if (old.subtract(p).lengthSquared() < 1e-7) stuck += 3;
                  else stuck = 0;
                  if (stuck > 15) break;
                }
                if (!reached) {
                  const edge = `${route[index - 1]?.join(',') ?? start}>${key(tx, tz)}`;
                  const blocker = livingContact ? g.combat.actor(livingContact) : undefined;
                  const stall = {
                    step: g.steps,
                    edge,
                    waypoint: [tx, tz],
                    position: p.asArray(),
                    controller: {
                      speed: g.player.motion.speed,
                      actualSpeed: g.player.motion.actualSpeed,
                      alpha: g.camera.alpha,
                      inspection: g.inspection.state,
                      nearest: g.nearest?.id,
                    },
                    blocker: livingContact,
                    contacts: [...contacts],
                    doors: w.entities.flatMap((e) =>
                      e.type === 'door' && Math.hypot(e.x - p.x, e.z - p.z) < 4
                        ? [[e.id, e.open, e.locked, e.x, e.z]]
                        : [],
                    ),
                  };
                  if (blocker?.alive) {
                    g.combat.target(g.player.actor, blocker);
                    // Bounded normal combat: no direct damage, actor deletion or disabled collision.
                    for (
                      let frame = 0;
                      frame < 600 && blocker.alive && g.player.actor.attack.target;
                      frame += 4
                    )
                      d.step([], 4);
                    g.player.actor.attack.cancel();
                    g.player.actor.navigator.cancel();
                    stalls.push({ ...stall, resumedAt: g.steps, defeated: !blocker.alive });
                    if (!blocker.alive) continue route;
                  } else stalls.push(stall);
                  if (index === 0) {
                    // If rounding put us in the obstructed target cell, start planning from
                    // here rather than forcing the center of that cell before leaving it.
                    if (!finalWaypoint) continue;
                    break route;
                  }
                  rejected.add(edge);
                  continue route;
                }
              }
              return { ok: true, position: p.asArray(), stalls };
            }
            return {
              ok: false,
              reason: 'Traversal replan budget exhausted',
              position: p.asArray(),
              stalls,
            };
          } finally {
            proxy.onCollideObservable.remove(observer);
            occupancy.contactProbe = previousProbe;
            g.player.actor.health.invulnerable = immunity;
            g.camera.beta = beta;
            for (const loop of loops) d.engine.runRenderLoop(loop);
          }
        },
        { x, z },
      );
      const state = await page.evaluate(() => ({
        seed: window.__dungeon.game.world.seed,
        step: window.__dungeon.game.steps,
        position: window.__dungeon.game.player.root.position.asArray(),
      }));
      const evidence = { ...state, goal: [x, z], ...result };
      report.travel!.push(evidence);
      assert.ok(result.ok, JSON.stringify(evidence));
    }
    async function captureLandmark(name: string) {
      await page.evaluate(() => {
        const g = window.__dungeon.game;
        g.camera.alpha = g.desiredAlpha = -Math.PI / 4;
        g.scene.render();
      });
      await screenshot(name);
      await north();
    }
    async function completeRun(capture = false) {
      // This autopilot verifies physical progression, not combat strategy. Keep AI
      // running, but isolate it from deaths while the driver visits every landmark.
      // Real combat damage, avoidance and respawn are covered by the combat suites.
      const immunity = await page.evaluate(() => {
        const health = window.__dungeon.game.player.actor.health;
        const saved = health.invulnerable;
        health.invulnerable = Number.POSITIVE_INFINITY;
        return saved;
      });
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
        if (capture) await captureLandmark(id);
      }
      const altar = await entity('altar');
      await walkTo(altar.approach.x, altar.approach.z);
      await page.evaluate(() => window.__dungeon.interact());
      assert.equal((await snapshot()).active, true);
      if (capture) await captureLandmark('altar');
      const throne = await entity('throne');
      await walkTo(throne.approach.x, throne.approach.z);
      if (capture) await captureLandmark('throne');
      await page.evaluate(() => window.__dungeon.interact());
      assert.equal((await snapshot()).complete, true);
      await page.locator('#continue').click();
      await north();
      await page.evaluate((immunity) => {
        window.__dungeon.game.player.actor.health.invulnerable = immunity;
      }, immunity);
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
      if (replaySeeds) {
        await page.goto(`${base}/?debug&seed=MOURNING-731`);
        await settle();
        for (const seed of replaySeeds) {
          await page.evaluate((seed) => {
            const d = window.__dungeon;
            d.engine.stopRenderLoop();
            d.regenerate(seed);
          }, seed);
          await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
          assert.equal(await page.evaluate(() => window.__dungeon.game.steps), 0);
          await completeRun();
          pass(`Fixed-step landmark replay ${seed}`);
        }
        report.success = true;
        return;
      }
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
      assert.equal(
        await page.evaluate(() => window.__dungeon.game.shadowMap.getSize().width),
        2048,
      );
      assert.ok(await page.evaluate(() => window.__dungeon.game.fxaa.isSupported));
      pass('Filtered shadows and FXAA compile and render');
      await screenshot('entrance');
      report.heroShadow = await probeHeroShadow();
      assert.ok(
        report.heroShadow.allCast && report.heroShadow.allReceive && report.heroShadow.allLit,
      );
      assert.ok(
        report.heroShadow.darkenedPixels > 60 && report.heroShadow.locallyLitPixels > 15,
        JSON.stringify(report.heroShadow),
      );
      pass('Hero casts a ground shadow and visibly responds to colored local lights');
      report.renderer = await page.evaluate(() => window.__dungeon.engine.getGlInfo().renderer);
      await north();
      const start = (await snapshot()).position;
      await clickWorld(page, start[0] + 2, start[2], start[1]);
      await page.waitForFunction(
        (x) => window.__dungeon.game.player.root.position.x > x + 0.3,
        start[0],
        { timeout: 15000 },
      );
      pass('Real mouse movement');
      await page.keyboard.press('Escape');
      const paused = (await snapshot()).position;
      await clickWorld(page, paused[0], paused[2] + 3, paused[1]);
      await page.waitForTimeout(350);
      assert.deepEqual((await snapshot()).position, paused);
      await page.keyboard.press('Escape');
      pass('Pause freezes movement');
      const door = await entity('door'),
        alongX = door.axis === 'x';
      await page.evaluate(() => window.__dungeon.engine.stopRenderLoop());
      await teleport(door.x - (alongX ? 2.3 : 0), door.z - (alongX ? 0 : 2.3));
      // Aim at the far-side ground from the far side, not through the clickable leaf.
      const camera = await page.evaluate(
        ({ x, z, h, alongX }) => {
          const g = window.__dungeon.game;
          const saved = { alpha: g.desiredAlpha, beta: g.camera.beta, radius: g.desiredRadius };
          g.camera.alpha = g.desiredAlpha = alongX ? 0 : Math.PI / 2;
          g.camera.beta = 0.12;
          g.camera.radius = g.desiredRadius = 10;
          g.camera.target.set(x, h + 0.75, z);
          return saved;
        },
        { ...door, alongX },
      );
      const cross = () =>
        clickWorld(page, door.x + (alongX ? 2.3 : 0), door.z + (alongX ? 0 : 2.3), door.h);
      // This point is on our side of the visible leaf but inside its clearance margin.
      // An across-map aim can legitimately plan around the closed door instead.
      await clickWorld(page, door.x - (alongX ? 0.35 : 0), door.z - (alongX ? 0 : 0.35), door.h);
      await step([], 100);
      const blockedAxis = (await snapshot()).position[alongX ? 0 : 2];
      assert.ok(
        blockedAxis < (alongX ? door.x : door.z) - 0.3 &&
          blockedAxis > (alongX ? door.x : door.z) - 1,
        JSON.stringify({ blockedAxis, door, after: (await snapshot()).position }),
      );
      const blocked = await snapshot();
      await interact();
      await step([], 60);
      assert.equal(
        (await snapshot()).doors.find((d) => d.id === door.id)?.open,
        true,
        JSON.stringify({ door, blocked: blocked.position, after: (await snapshot()).position }),
      );
      await cross();
      await step([], 70);
      assert.ok((await snapshot()).position[alongX ? 0 : 2] > (alongX ? door.x : door.z) + 1);
      pass('Generated door blocks and then allows passage');
      await teleport(door.x, door.z);
      await interact();
      assert.equal((await snapshot()).doors.find((d) => d.id === door.id)?.open, false);
      pass('Hero alone does not prevent closing the door');
      await page.evaluate(({ alpha, beta, radius }) => {
        const g = window.__dungeon.game;
        g.camera.alpha = g.desiredAlpha = alpha;
        g.camera.beta = beta;
        g.camera.radius = g.desiredRadius = radius;
      }, camera);
      const stair = await page.evaluate(() => {
        const c = window.__dungeon.game.world.connections.find((c) => c.ramp);
        if (!c?.ramp) throw new Error('Missing stairs');
        return {
          axis: c.axis,
          cross: c.cross,
          start: c.start,
          end: c.end,
          a: c.ramp.a,
          b: c.ramp.b,
        };
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
      await clickWorld(page, wet.x + 2, wet.z, wet.h);
      await step([], 20);
      const wetDistance = (await snapshot()).position[0] - wet.x;
      await teleport(0, 0);
      await clickWorld(page, 2, 0);
      await step([], 20);
      assert.ok(wetDistance < (await snapshot()).position[0] * 0.75);
      pass('Water slows movement');
      const lava = await page.evaluate(() =>
        [...window.__dungeon.game.world.tiles.values()].find(
          (t) => t.surface === 'lava' && !t.blocked,
        ),
      );
      assert.ok(lava);
      await teleport(lava.x, lava.z);
      await step([], 1);
      assert.ok((await snapshot()).health < 100);
      await step([], 250);
      assert.equal((await snapshot()).health, 100);
      assert.ok(Math.hypot((await snapshot()).position[0], (await snapshot()).position[2]) < 0.1);
      pass('Lava damage and respawn');
      // Start the next live-world fixture in a fresh visit, with its render loop running.
      await page.goto(`${base}/?debug&seed=MOURNING-731`);
      // Regression: a static terrain route cannot walk through a stationary living body.
      await settle();
      await north();
      const blockingActor = await page.evaluate(() => {
        const g = window.__dungeon.game;
        const actor = g.combat.enemies.find((e) => e.kind === 'skeleton');
        if (!actor?.brain) throw new Error('Missing traversal blocker');
        actor.attack.cancel();
        actor.navigator.cancel();
        actor.brain.think = Infinity;
        Object.assign(actor.position, { x: 0, z: 2, h: 0 });
        actor.entity.get('collision')?.sync?.(actor.position);
        g.player.actor.health.invulnerable = 0;
        return actor.id;
      });
      await walkTo(0, 4);
      assert.equal(
        await page.evaluate(() => window.__dungeon.game.player.actor.health.invulnerable),
        0,
      );
      assert.equal(
        await page.evaluate(
          (id) => window.__dungeon.game.ecs.get(id)?.has('corpse'),
          blockingActor,
        ),
        true,
      );
      assert.ok(
        Math.hypot((await snapshot()).position[0], (await snapshot()).position[2] - 4) < 0.1,
      );
      pass(
        'Landmark driver clears a living blocker through ordinary combat and resumes physical travel',
      );
      await page.evaluate(() => window.__dungeon.regenerate('MOURNING-731'));
      await settle();
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
      await writeFile(
        process.env.BROWSER_REPORT || `test-results/${browserName}-report.json`,
        JSON.stringify(report, null, 2),
      );
    }
  } finally {
    await browser.close();
  }
});
