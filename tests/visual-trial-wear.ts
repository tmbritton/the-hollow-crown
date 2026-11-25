import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import type { DebugWindow } from './browserTypes.ts';
import { routes, view } from './visual-trial-fixture.ts';
import { DEFAULT_VIEW } from '../src/visualTrial.ts';

declare const window: DebugWindow;
const base = process.env.DEMO_URL ?? 'http://localhost:5173';
const fixture = '/tests/visual-trial-fixture.ts';
const probes = '/tests/visual-trial-probes.ts';
const spatial = '/src/worldSpatial.ts';
const outputRoot = 'test-results/visual-trial/15.4';
await mkdir(outputRoot, { recursive: true });
const output = await mkdtemp(`${outputRoot}/wear-run-`);
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

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
    const frame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      frame(function hold(time) {
        if (!harness && document.querySelector('#loading.done')) frame(hold);
        else callback(time);
      });
    Object.defineProperty(window, '__dungeon', {
      configurable: true,
      get: () => harness,
      set: (value: DebugWindow['__dungeon']) => {
        harness = value;
        harness.animation.pause();
        window.requestAnimationFrame = frame;
      },
    });
  });

  async function open(name: keyof typeof routes) {
    await page.goto(`${base}/${routes[name].query}`);
    await page.waitForFunction(() => window.__dungeon?.ready);
    if (name === 'practice')
      for (const id of ['reset-practice', 'start-practice-foe']) {
        await page.locator(`#${id}`).click();
        await page.waitForFunction(() => window.__dungeon.ready);
      }
    assert.equal(await page.evaluate(() => window.__dungeon.game.steps), 0);
    assert.equal(await page.locator('#quality').inputValue(), 'high');
  }

  async function select(wear: number) {
    assert.ok(
      await page.evaluate((wear) => {
        const { select } = window.__dungeon.visualTrial;
        if (wear < 0) return select({ type: 'SELECT', mode: 'original' });
        return (
          select({ type: 'SELECT', mode: 'tuned' }) &&
          select({ type: 'EDIT', key: 'cornerWear', value: wear })
        );
      }, wear),
    );
  }

  async function orbit(alpha: number, radius: number, target?: number[]) {
    await page.evaluate(
      ({ alpha, beta, radius, target }) => {
        const d = window.__dungeon;
        const { camera } = d.game;
        d.visualTrial.orbit(alpha, beta, radius);
        for (let i = 0; i < 70; i++) d.step([], 0);
        if (target) camera.target.set(target[0], target[1], target[2]);
      },
      { alpha, beta: view.beta, radius, target },
    );
  }

  type Subject = {
    center: number[];
    mesh?: string;
    material?: string;
    span?: number[];
    height?: number[];
  };
  const captures: {
    label: string;
    value: number;
    hash: string;
    geometry: string;
    vertices: number;
    state: unknown;
  }[] = [];
  async function capture(label: string, value: number, subject?: Subject) {
    const result = await page.evaluate(
      async ({ fixture, subject }) => {
        const { captureCamera } = (await import(
          fixture
        )) as typeof import('./visual-trial-fixture.ts');
        const d = window.__dungeon;
        const { scene, world, combat, camera, ecs } = d.game;
        scene.render();
        await scene.whenReadyAsync();
        scene.render();
        const png = d.engine.getRenderingCanvas()!.toDataURL().split(',')[1];
        const meshes = scene.meshes;
        const positions: number[] = [];
        const indices: number[] = [];
        const bounds: number[][] = [];
        if (subject) {
          const { center, mesh: name, span = [1, 1], height = [-2, 4], material } = subject;
          for (const mesh of meshes) {
            if (mesh.checkCollisions || mesh.isPickable || !mesh.isVisible) continue;
            if (
              name
                ? mesh.name !== name ||
                  mesh.getAbsolutePosition().subtract(camera.target).length() > 5
                : mesh.parent || !mesh.name.startsWith(`${material}:`)
            )
              continue;
            const data = mesh.getVerticesData('position');
            if (!data) continue;
            if (name) {
              for (const p of data) positions.push(p);
              for (const i of mesh.getIndices() ?? []) indices.push(i);
              const box = mesh.getBoundingInfo().boundingBox;
              bounds.push([...box.minimum.asArray(), ...box.maximum.asArray()]);
            } else
              for (let i = 0; i < data.length; i += 3) {
                const x = data[i] - center[0],
                  y = data[i + 1] - center[1],
                  z = data[i + 2] - center[2];
                if (
                  Math.abs(x) <= span[0] &&
                  Math.abs(z) <= span[1] &&
                  y >= height[0] &&
                  y <= height[1]
                )
                  positions.push(data[i], data[i + 1], data[i + 2]);
              }
          }
        }
        return {
          png,
          positions,
          indices,
          bounds,
          tick: d.game.steps,
          camera: captureCamera(d),
          seed: world.seed,
          hero: { ...combat.actors[0].position },
          walls: ecs.query('cutaway').map((e) => e.require('cutaway').scale),
          counts: {
            meshes: meshes.length,
            batches: meshes.filter((m) => m.name.includes(':') && !m.parent).length,
            materials: scene.materials.length,
            geometries: scene.geometries.length,
            thin: meshes.reduce(
              (n, m) => n + ('thinInstanceCount' in m ? Number(m.thinInstanceCount) : 0),
              0,
            ),
          },
        };
      },
      { fixture, subject },
    );
    const { png, positions, indices, bounds, ...state } = result;
    await writeFile(`${output}/${label}-${value}.png`, Buffer.from(png, 'base64'), { flag: 'wx' });
    const geometry = sha(JSON.stringify({ positions, indices, bounds }));
    const hash = sha(png);
    captures.push({ label, value, state, hash, geometry, vertices: positions.length / 3 });
    return { state, hash, geometry, vertices: positions.length / 3 };
  }

  const visibility: { label: string; original: number; worn: number }[] = [];
  const heroHeight = () =>
    page.evaluate(async (probes) => {
      const { heroHeight } = (await import(probes)) as typeof import('./visual-trial-probes.ts');
      return heroHeight(window.__dungeon);
    }, probes);

  async function compare(label: string, subject?: Subject, scrub = false, checkHero = false) {
    await select(-1);
    const original = await capture(label, -1, subject);
    const untreatedHero = checkHero ? await heroHeight() : null;
    await select(100);
    const full = await capture(label, 100, subject);
    assert.deepEqual(full.state, original.state, `${label}: capture state/resources`);
    assert.ok(full.hash !== original.hash, `${label}: no visible change`);
    if (untreatedHero !== null) {
      const worn = await heroHeight();
      assert.ok(
        untreatedHero > 0 && worn >= untreatedHero * 0.9,
        `${label}: hero height ${untreatedHero} -> ${worn}`,
      );
      visibility.push({ label, original: untreatedHero, worn });
    }
    if (subject) {
      assert.ok(original.vertices > 0 && full.vertices > 0, `${label}: empty geometry probe`);
      assert.notEqual(full.geometry, original.geometry, `${label}: no profile change`);
    }
    if (scrub) {
      await select(50);
      const mid = await capture(label, 50, subject);
      assert.ok(mid.hash !== original.hash && mid.hash !== full.hash, `${label}: no midpoint`);
      await select(0);
      assert.deepEqual(
        await capture(label, 0, subject),
        original,
        `${label}: zero must restore image, buffers and bounds`,
      );
      await select(50);
      assert.deepEqual(
        await capture(`${label}-revisit`, 50, subject),
        mid,
        `${label}: drift after scrub`,
      );
    }
    return full.geometry;
  }

  await open('practice');
  const junctions = [];
  for (const side of [1, -1] as const) {
    for (const raised of [true, false]) {
      const alpha = (side === 1) === raised ? Math.PI : 0;
      await orbit(alpha, 18, [side * 8, 1.6, 2]);
      const snapshots = [];
      for (const wear of [0, 50, 100]) {
        await select(wear);
        const probe = await page.evaluate(
          async ({ side, path }) => {
            const { probeJunction } = (await import(
              path
            )) as typeof import('./visual-trial-junction.ts');
            return probeJunction(window.__dungeon, side);
          },
          { side, path: '/tests/visual-trial-junction.ts' },
        );
        snapshots.push({ wear, ...probe });
        if (raised) await capture(`dojo-junction-${side}`, wear);
      }
      junctions.push({ side, raised, snapshots });
    }
  }
  await writeFile(`${output}/junctions.json`, JSON.stringify(junctions));
  console.log(`Dojo world-triangle samples: ${output}/junctions.json`);
  for (const { side, raised, snapshots } of junctions) {
    const control = snapshots[0];
    assert.equal(control.end, side * 8.5);
    assert.ok(raised ? control.scale > 0.99 : control.scale < 0.06);
    for (const { wear, scale, ownership, colliders, samples } of snapshots) {
      assert.equal(scale, control.scale);
      assert.deepEqual(ownership, control.ownership);
      assert.deepEqual(colliders, control.colliders);
      for (const [index, { y, z, tip, inner }] of samples.entries()) {
        const label = `side=${side} wear=${wear} y=${y} z=${z}, tip=${tip} inner=${inner}`;
        assert.ok(tip !== null && inner !== null, label);
        assert.ok(Math.abs(tip - control.end) <= 1e-5, label);
        assert.ok(side * (inner - tip) <= 1e-5, label);
        const originalInner = control.samples[index].inner;
        assert.ok(originalInner !== null && Math.abs(inner - originalInner) <= 1e-5, label);
      }
    }
  }

  async function replay(name: keyof typeof routes, wear: number) {
    await open(name);
    await orbit(view.alpha, 18);
    await select(wear);
    return page.evaluate(
      async ({ fixture, spatial, route, name }) => {
        const { advanceRoute } = (await import(
          fixture
        )) as typeof import('./visual-trial-fixture.ts');
        const { heightAt } = (await import(spatial)) as typeof import('../src/worldSpatial.ts');
        const d = window.__dungeon;
        const { world, player, combat } = d.game;
        const placement = JSON.stringify({
          seed: world.seed,
          tiles: [...world.tiles],
          props: world.props,
          blockers: world.blockers,
          entities: world.entities.map(({ id, type, x, z, h }) => [id, type, x, z, h]),
        });
        const trace = [];
        const record = () => {
          const { x, z, h } = player.actor.position;
          return {
            x,
            z,
            h,
            support: heightAt(world, x, z),
            path: player.navigator.path.map((p) => ({ ...p })),
            angles: world.entities.flatMap((e) => (e.type === 'door' ? [e.angle] : [])),
          };
        };
        const grips = () =>
          combat.actors.map((a) => {
            const rig = a.entity.require('rig');
            return [rig.root, rig.weapon, rig.spear, rig.shield].map(
              (node) => node?.computeWorldMatrix(true).asArray().slice() ?? null,
            );
          });
        for (let i = 0; i <= (name === 'practice' ? 365 : 709); i++) {
          const tick = advanceRoute(d, route.inputs);
          trace.push({ tick, ...record(), grips: i % 12 === 0 ? grips() : null });
        }
        const ascent = [];
        if (name === 'dungeon') {
          d.teleport(-1, 19);
          player.navigator.request(player.actor.position, { x: -1, z: 7 });
          for (let i = 0; i < 360; i++) {
            d.step([]);
            ascent.push(record());
          }
        }
        return { placement, trace, ascent };
      },
      { fixture, spatial, route: routes[name], name },
    );
  }

  const parity = [];
  for (const name of ['practice', 'dungeon'] as const) {
    const original = await replay(name, -1);
    const worn = await replay(name, 100);
    for (const joint of [0, 1]) {
      const samples = original.trace.flatMap(({ grips }) =>
        grips ? [JSON.stringify(grips[0][joint])] : [],
      );
      assert.ok(new Set(samples).size > 1, `${name}: hero matrix ${joint} never changed`);
    }
    assert.equal(sha(worn.placement), sha(original.placement), `${name}: layout or placement`);
    for (const [i, row] of original.trace.entries())
      assert.deepEqual(worn.trace[i], row, `${name}: route tick ${i}`);
    for (const [i, row] of original.ascent.entries())
      assert.deepEqual(worn.ascent[i], row, `${name}: ascent tick ${i}`);
    if (name === 'practice') {
      assert.ok(
        original.trace.some(({ angles }) =>
          angles.some((a) => a !== undefined && a > 0.1 && a < 1),
        ),
      );
      assert.ok(original.trace.some(({ x, z }) => x < -4 && Math.abs(z + 4) < 0.5));
      assert.ok(
        original.trace
          .slice(0, 120)
          .every(({ x, z }) => Math.abs(x + 3) >= 0.7 || Math.abs(z + 4) >= 0.7),
      );
    } else {
      assert.ok(
        original.trace.some(
          ({ z, support }) => z > 12 && z < 17 && support !== null && support < -0.7,
        ),
      );
      assert.ok(original.ascent.some(({ z, support }) => z < 8 && support === 0));
    }
    parity.push({
      name,
      placement: sha(original.placement),
      ticks: original.trace.length,
      ascent: original.ascent.length,
    });
    await writeFile(`${output}/${name}-trace.json`, JSON.stringify(original));
  }

  const picks = [];
  const originalPoints: { x: number; y: number }[] = [];
  for (const value of [-1, 100]) {
    await open('practice');
    await orbit(view.alpha, 18);
    await select(value);
    for (const [i, kind] of (['floor', 'foe', 'door'] as const).entries()) {
      if (kind === 'door') await page.evaluate(() => window.__dungeon.teleport(0, 0.5));
      const point = await page.evaluate(
        async ({ probes, kind }) => {
          const { edgePoint } = (await import(probes)) as typeof import('./visual-trial-probes.ts');
          return edgePoint(window.__dungeon, kind, 0);
        },
        { probes, kind },
      );
      if (value === -1) originalPoints.push(point);
      else assert.deepEqual(point, originalPoints[i]);
      await page.mouse.click(originalPoints[i].x, originalPoints[i].y);
      picks.push(
        await page.evaluate((kind) => {
          const d = window.__dungeon;
          const { actor } = d.game.player;
          if (kind === 'foe') return actor.attack.target;
          if (kind === 'floor')
            return [actor.navigator.destination?.x, actor.navigator.destination?.z].map((v) =>
              Math.round(v ?? NaN),
            );
          d.step([], 20);
          return d.snapshot().doors.find(({ id }) => id === 'practice-door')?.open;
        }, kind),
      );
    }
  }
  assert.deepEqual(picks, [
    [3, -5],
    'skeleton:practice:0',
    true,
    [3, -5],
    'skeleton:practice:0',
    true,
  ]);

  for (const name of ['practice', 'dungeon'] as const) {
    await open(name);
    for (const radius of [18, 36])
      for (let side = 0; side < 4; side++) {
        await orbit(view.alpha + (side * Math.PI) / 2, radius);
        await compare(`${name}-radius${radius}-side${side}`, undefined, false, true);
      }
    if (name === 'practice') {
      const pillar = { center: [-3, 0, -4], material: 'stone', height: [0.2, 3] };
      await orbit(view.alpha, 18, [-3, 1.5, -4]);
      await compare('dojo-pillar', pillar, true);
      await orbit(view.alpha, 18, [0, 2, 2]);
      const door = { center: [0, 0, 2], mesh: 'door plank' };
      await compare('dojo-door-closed', door, true);
      await compare('dojo-door-frame', { ...door, mesh: 'door lintel' });
      await select(-1);
      await page.evaluate(() => {
        const d = window.__dungeon;
        d.teleport(0, 0.5);
        if (!d.game.combat.requestDoor(d.game.player.actor, 'practice-door'))
          throw Error('Door request failed');
        d.step([], 10);
      });
      await orbit(view.alpha, 18, [0, 2, 2]);
      await compare('dojo-door-swinging', door);
      for (const side of [0.3, 0.6, 0.9]) {
        await page.evaluate(() => window.__dungeon.step([], 4));
        await orbit(view.alpha + (side * Math.PI) / 2, 18, [0, 2, 2]);
        await compare(`dojo-door-motion-${side}`, door);
      }
      await orbit(view.alpha, 18, [4, 1.5, 2]);
      await compare('dojo-partition', {
        center: [4, 0, 2],
        material: 'stone',
        span: [3, 1],
        height: [0.2, 3.2],
      });
      await orbit(view.alpha + Math.PI, 18, [4, 0.7, -7.7]);
      for (const [label, material, height] of [
        ['base', 'stone', [0, 0.7]],
        ['course', 'stone', [0.8, 3.2]],
        ['cap', 'trim', [2.85, 3.2]],
      ] as const)
        await compare(`masonry-${label}`, {
          center: [4, 0, -7.7],
          material,
          span: [2, 0.6],
          height: [...height],
        });
    } else {
      for (const [label, center] of [
        ['run', [-1, -1.2, 14]],
        ['arrival', [-1, -2.2, 19]],
      ] as const) {
        const subject = { center: [...center], material: 'floor', span: [1.6, 0.6] };
        await orbit(view.alpha + Math.PI / 2, 18, [...center]);
        const geometry = await compare(`stairs-${label}`, subject, true);
        await orbit(view.alpha + Math.PI, 36, [...center]);
        await select(100);
        assert.equal((await capture(`stairs-${label}-rotated`, 100, subject)).geometry, geometry);
        if (label === 'arrival') {
          await open(name);
          await orbit(view.alpha + Math.PI / 2, 18, [...center]);
          await select(100);
          assert.equal((await capture(`stairs-${label}-rebuilt`, 100, subject)).geometry, geometry);
        }
      }
      const pillar = await page.evaluate(() => {
        const p = window.__dungeon.game.world.props.find((p) => p.type === 'pillar')!;
        return [p.x, p.h, p.z];
      });
      await orbit(view.alpha + Math.PI / 2, 18, [pillar[0], pillar[1] + 1.5, pillar[2]]);
      await compare('dungeon-pillar', {
        center: pillar,
        material: 'stone',
        span: [0.8, 0.8],
        height: [0.25, 3],
      });
      await page.evaluate(() => {
        const d = window.__dungeon;
        d.teleport(-1, 10);
        d.game.player.navigator.request(d.game.player.actor.position, { x: -1, z: 21 });
      });
      for (let i = 0; i < 4; i++) {
        await page.evaluate(() => window.__dungeon.step([], 28));
        await orbit(view.alpha + (i * Math.PI) / 6, 18);
        await compare(`stairs-motion-${i}`);
      }
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      { view, settings: DEFAULT_VIEW, captures, visibility, parity, picks, originalPoints },
      null,
      2,
    ),
  );
  console.log(`Corner wear matched evidence: ${output}`);
} finally {
  await browser.close();
}
