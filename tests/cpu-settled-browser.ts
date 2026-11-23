import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { withViteServer } from './testServer.ts';
import { probeCpuPasses } from './cpu-pass-probe.ts';
import type { DebugWindow } from './browserTypes.ts';
declare const window: DebugWindow;

const base = process.env.DEMO_URL ?? 'http://127.0.0.1:5173';
const reference = process.env.CPU_SETTLED_REFERENCE === '1';
const compare = process.env.CPU_SETTLED_COMPARE === '1';
const label = reference ? 'reference' : 'candidate';
const hardware = process.env.CPU_GPU === 'hardware';
await mkdir('test-results', { recursive: true });
await withViteServer(base, 'dev', async () => {
  const browser = await chromium.launch({
    headless: !hardware,
    args: hardware
      ? ['--no-sandbox', '--ignore-gpu-blocklist']
      : ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const deadline = setTimeout(() => void browser.close(), 180000);
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/?debug&seed=MOURNING-731`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
    await page.evaluate(() => {
      window.__dungeon.engine.stopRenderLoop();
      window.__dungeon.animation.pause();
      window.__dungeon.regenerate('MOURNING-731');
    });
    await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
    const work = {
      low: await page.evaluate(probeCpuPasses, 'low' as const),
      high: await page.evaluate(probeCpuPasses, 'high' as const),
    };
    const result = await page.evaluate(async () => {
      const d = window.__dungeon,
        g = d.game;
      d.engine.stopRenderLoop();
      d.animation.pause();
      for (let i = 0; i < 12; i++) d.step([], 1);
      const deathsPath = '/src/deathPhysics.ts',
        terrainPath = '/src/corpseRendering.ts';
      const { DeathPhysics } = (await import(
        deathsPath
      )) as typeof import('../src/deathPhysics.ts');
      const { readCorpseTerrain } = (await import(
        terrainPath
      )) as typeof import('../src/corpseRendering.ts');
      const physics = new DeathPhysics(g.ecs, g.world);
      const actors = [...g.combat.enemies];
      const dt = 1 / 60;
      const capture = () =>
        actors
          .filter((a) => a.entity.has('ragdoll'))
          .map((a) => {
            const rig = a.entity.require('rigPose');
            const ragdoll = a.entity.require('ragdoll');
            const h = rig.history.snapshot();
            return {
              id: a.id,
              mode: ragdoll.mode,
              radius: ragdoll.radius,
              settled: ragdoll.settled,
              world: h.world,
              linear: h.linear,
              angular: h.angular,
              meshes: a.entity.require('render').meshes.map((m) => {
                m.computeWorldMatrix(true);
                return [m.name, m.isEnabled(), Array.from(m.getWorldMatrix().m)];
              }),
            };
          });
      const kill = (a: (typeof actors)[number]) => {
        if (!g.combat.damage(a, 1000, undefined, { kind: 'melee', travel: { x: 1, z: 0 } }))
          throw new Error(`CPU settled fixture survived: ${a.id}`);
      };
      // Freeze a moving island before its next publication, as with cap eviction.
      kill(actors[0]);
      physics.advance(0);
      for (let i = 0; i < 12; i++) physics.advance(dt);
      const active = capture();
      actors[0].entity.require('ragdoll').freeze();
      for (const actor of actors.slice(1)) kill(actor);
      physics.advance(dt);
      const frozen = capture();
      for (let i = 0; i < 501; i++) physics.advance(dt);
      const before = capture();
      // Count actual world matrix publications, not calls to a potentially guarded binding.
      let writes = 0;
      const restore = actors.map((a) => {
        const root = a.entity.require('rig').root;
        const original = root.freezeWorldMatrix;
        root.freezeWorldMatrix = function (...args) {
          writes++;
          return original.apply(this, args);
        };
        return () => Reflect.deleteProperty(root, 'freezeWorldMatrix');
      });
      try {
        for (let i = 0; i < 180; i++) physics.advance(dt);
        // The alternate binding.apply entry must not republish either.
        for (const a of actors) a.entity.require('rigPose').apply();
      } finally {
        for (const undo of restore) undo();
      }
      const after = capture();
      const contacts = readCorpseTerrain(g.ecs, g.world);
      for (let i = 0; i < 30; i++) g.scene.render();
      const repeats = [];
      for (let repeat = 0; repeat < 3; repeat++) {
        const timings = [];
        for (let i = 0; i < 60; i++) {
          const start = performance.now();
          physics.advance(dt);
          const advanced = performance.now();
          g.scene.render();
          const rendered = performance.now();
          timings.push([advanced - start, rendered - advanced]);
          if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
        }
        repeats.push(timings);
      }
      const image = d.engine.getRenderingCanvas()!.toDataURL().split(',')[1];
      const camera = [g.camera.getViewMatrix().asArray(), g.camera.getProjectionMatrix().asArray()];
      // Attribute pass callbacks separately from the timing window. Names alone are not unique.
      const identities = new Map(g.scene.meshes.map((mesh, i) => [mesh, `${i}:${mesh.name}`]));
      const shadow: (string | undefined)[] = [],
        glow: (string | undefined)[] = [];
      const shadowDraw = g.shadow.onBeforeShadowMapRenderMeshObservable;
      const glowDraw = g.glow.onBeforeRenderMeshToEffect;
      const shadowObserver = shadowDraw.add((m) => {
        shadow.push(identities.get(m));
      });
      const glowObserver = glowDraw.add((m) => {
        glow.push(identities.get(m));
      });
      const replay = [];
      try {
        for (const quality of ['low', 'high']) {
          const select = document.querySelector<HTMLSelectElement>('#quality')!;
          select.value = quality;
          select.dispatchEvent(new Event('change'));
          for (let turn = 0; turn < 4; turn++) {
            g.camera.alpha = -Math.PI / 4 + (turn * Math.PI) / 2;
            for (const radius of [8, 35]) {
              g.camera.radius = radius;
              for (let i = 0; i < 4; i++) g.scene.render();
              shadow.length = glow.length = 0;
              g.scene.render();
              const active = g.scene.getActiveMeshes();
              replay.push({
                quality,
                turn,
                radius,
                step: g.steps,
                camera: [g.camera.getViewMatrix().m, g.camera.getProjectionMatrix().m].map((m) =>
                  Array.from(m),
                ),
                active: active.data.slice(0, active.length).map((m) => identities.get(m)),
                casters: g.shadowMap.renderList?.map((m) => identities.get(m)),
                shadow: [...shadow],
                glow: [...glow],
                image: d.engine.getRenderingCanvas()!.toDataURL().split(',')[1],
              });
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
          }
        }
      } finally {
        shadowDraw.remove(shadowObserver);
        glowDraw.remove(glowObserver);
      }
      const actor = actors[0],
        binding = actor.entity.require('rigPose');
      actor.entity.remove('corpse');
      actor.health.current = actor.health.max;
      physics.advance(dt);
      const reused =
        !actor.entity.has('ragdoll') && !actor.entity.require('rig').root.isWorldMatrixFrozen;
      const living = binding.pose.world.every(Number.isFinite);
      physics.dispose();
      return {
        active,
        frozen,
        before,
        after,
        contacts,
        camera,
        replay,
        writes,
        repeats,
        reused,
        living,
        image,
        renderer: d.engine.getGlInfo(),
        shadows: g.scene.shadowsEnabled,
        glow: g.glow.isEnabled,
      };
    });
    const { image, replay, ...report } = result;
    const digest = createHash('sha256')
      .update(
        JSON.stringify([
          result.active,
          result.frozen,
          result.after,
          result.contacts,
          result.camera,
        ]),
      )
      .digest('hex');
    const path = (name: string) =>
      `test-results/cpu5-settled-${hardware ? 'hardware' : 'software'}-${name}`;
    const rendered = [];
    for (const { image: frame, ...row } of replay) {
      const bytes = Buffer.from(frame, 'base64');
      await writeFile(`${path(label)}-${row.quality}-${row.turn}-${row.radius}.png`, bytes);
      rendered.push({ ...row, pixels: createHash('sha256').update(bytes).digest('hex') });
    }
    await writeFile(
      `${path(label)}.json`,
      JSON.stringify({ ...report, rendered, work, digest, errors }),
    );
    await writeFile(`${path(label)}.png`, Buffer.from(image, 'base64'));
    assert.deepEqual(errors, []);
    assert.equal(result.before.length, 24);
    assert.ok(work.low.main.candidates > 0 && work.high.main.candidates > 0);
    assert.equal(work.low.shadow.passes + work.low.glow.passes, 0);
    assert.ok(work.high.shadow.passes && work.high.glow.passes);
    assert.equal(result.active[0].settled, false);
    assert.equal(result.frozen[0].settled, true);
    assert.ok(result.reused && result.living && result.contacts.length > 0);
    assert.deepEqual(result.before, result.after);
    for (const actor of result.after) {
      assert.ok(actor.settled);
      assert.ok([...actor.linear, ...actor.angular].every((v) => Math.abs(v) < 1e-9));
    }
    assert.ok(
      replay.filter((r) => r.quality === 'low').every((r) => !r.shadow.length && !r.glow.length),
    );
    assert.ok(replay.some((r) => r.quality === 'high' && r.shadow.length && r.glow.length));
    assert.ok(replay.some((r) => r.shadow.some((caster) => !r.active.includes(caster))));
    if (!reference && compare) {
      const baseline = JSON.parse(await readFile(`${path('reference')}.json`, 'utf8')) as {
        digest: string;
        rendered: typeof rendered;
        work: typeof work;
      };
      assert.deepEqual(work, baseline.work, 'CPU4 pass work on the unchanged warmed living view');
      assert.equal(
        digest,
        baseline.digest,
        'CPU4 phase, affine mesh, contact and camera fingerprint',
      );
      // Compare the artifact representation (JSON normalizes a matrix's -0 to 0).
      assert.equal(baseline.rendered.length, rendered.length);
      for (const [i, row] of rendered.entries()) {
        for (const key of Object.keys(row) as (keyof typeof row)[]) {
          assert.ok(
            JSON.stringify(row[key]) === JSON.stringify(baseline.rendered[i][key]),
            `CPU4 rendered replay: ${row.quality} turn ${row.turn}, radius ${row.radius}, ${key}`,
          );
        }
      }
    }
    assert.equal(result.writes, 0, 'unchanged settled root matrix publications');
    console.log(
      `PASS settled publication: ${result.writes} root writes; ${rendered.length} rendered views; ${digest}`,
    );
  } finally {
    clearTimeout(deadline);
    await browser.close();
  }
});
