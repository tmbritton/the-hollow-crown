import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import type { Effect } from '@babylonjs/core/Materials/effect';
import { withViteServer } from './testServer.ts';
import { json } from './targeted-shader-arms.ts';
import { sourceManifest } from './encounter-source.ts';
import type { ScaleSignature } from '../src/targetedShaderRendering.ts';
import { signatures as shippingSignatures } from '../src/targetedShaderSignatures.ts';
import './browserTypes.ts';

const shipping = process.argv.length === 2;
const nonce = randomUUID();
const root = resolve(process.argv[2] ?? '.');
const output = shipping ? `test-results/targeted-shader-shipping-${nonce}.json` : process.argv[3];
assert.ok(output, 'usage: targeted-shader-browser.ts [ARM OUTPUT]');
const base = 'http://127.0.0.1:5483';
const hardware = process.env.CPU_GPU === 'hardware';
// First-displacement draw fixtures, not the full preparation allowlist. Pin the stable
// pass/source identities independently of the observed draws and generated shader names.
const entranceCamera = ['bone', 'cloth', 'dark', 'default', 'gold', 'iron', 'stone', 'trim'];
const ordinaryCamera = [...entranceCamera, 'brick', 'wood'];
const cameraPass = 'Camera overhead camera';
const shadowPass = 'graphic key light_shadowMap#0';
const visits = [
  { seed: '795', quality: 'low', name: 'door', camera: entranceCamera },
  { seed: '795', quality: 'high', name: 'reduced', camera: entranceCamera },
  { seed: 'MOURNING-731', quality: 'low', name: null, camera: ordinaryCamera },
  { seed: 'MOURNING-731', quality: 'high', name: null, camera: ordinaryCamera },
] as const;
const signatures = shipping
  ? shippingSignatures
  : await json<ScaleSignature[]>(join(dirname(root), 'signatures.json')).catch(
      (e: NodeJS.ErrnoException) => {
        if (e.code === 'ENOENT' && !hardware) return undefined;
        throw e;
      },
    );
const source = await sourceManifest(undefined, root);
const unlocked = () => {
  if (hardware)
    assert.equal(
      execFileSync(
        'qdbus',
        ['org.freedesktop.ScreenSaver', '/ScreenSaver', 'org.freedesktop.ScreenSaver.GetActive'],
        { encoding: 'utf8', timeout: 4000 },
      ).trim(),
      'false',
    );
};
const result: { missingScale: string[]; [key: string]: unknown }[] = [];
try {
  unlocked();
  await withViteServer(
    base,
    'dev',
    async () => {
      assert.deepEqual(await (await fetch(`${base}/__encounter-root`)).json(), {
        nonce,
        cwd: root,
        root,
      });
      const browser = await chromium.launch({
        headless: !hardware,
        args: hardware
          ? ['--no-sandbox', '--ignore-gpu-blocklist', '--ozone-platform=wayland']
          : [],
      });
      try {
        for (const { seed, quality, name, camera } of visits) {
          unlocked();
          const context = await browser.newContext({
            viewport: { width: 800, height: 450 },
            deviceScaleFactor: 1,
          });
          const errors: string[] = [];
          try {
            const page = await context.newPage();
            page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
            if (!hardware && !shipping)
              await page.route('**/src/encounterRecipe.ts*', async (route) => {
                const response = await route.fetch();
                const text = await response.text();
                await route.fulfill({
                  response,
                  body: text.replace(/deadlineMs: (?:60_000|60000)\b/, 'deadlineMs: 240000'),
                });
              });
            await page.goto(`${base}/?debug&seed=${seed}`);
            await page.waitForFunction(() => window.__dungeon?.ready, null, { timeout: 45000 });
            const preflight = await page.evaluate(() => ({
              ...window.__dungeon!.engine.getGlInfo(),
              webgl: window.__dungeon!.engine.webGLVersion,
              foreground: !document.hidden && document.hasFocus(),
              dimensions: [innerWidth, innerHeight, devicePixelRatio],
            }));
            assert.equal(preflight.webgl, 2);
            if (hardware) {
              assert.match(preflight.renderer, /RTX 2070/);
              assert.ok(preflight.foreground);
            }
            const audit = await page.evaluateHandle(() => {
              const dungeon = window.__dungeon!;
              const engine = dungeon.engine;
              const ready: string[] = [];
              const draws = new Set<string>();
              const shaders: Record<string, string> = {};
              const prepared = new Set<Effect>();
              let drawCount = 0;
              const violations: string[] = [];
              const renderState = () => {
                const { scene, shadowMap, player, steps } = dungeon.game;
                return JSON.stringify([
                  scene.getFrameId(),
                  steps,
                  engine.currentRenderPassId,
                  drawCount,
                  player.root.position.asArray(),
                  shadowMap.renderList?.map((mesh) => mesh.uniqueId),
                  scene.meshes.map((mesh) => [
                    mesh.uniqueId,
                    mesh.isEnabled(),
                    mesh.isVisible,
                    mesh.visibility,
                    mesh.scaling.asArray(),
                  ]),
                ]);
              };
              const create = engine.createEffect.bind(engine);
              engine.createEffect = (...args) => {
                const options = args[1];
                const candidate =
                  !Array.isArray(options) &&
                  options.defines?.includes('NONUNIFORMSCALING') &&
                  /targetedShaderRendering\.ts/.test(new Error().stack ?? '');
                const before = candidate ? renderState() : '';
                const effect = create(...args);
                if (candidate) {
                  if (dungeon.ready || dungeon.game.steps !== 0 || before !== renderState())
                    violations.push(effect.key);
                  prepared.add(effect);
                }
                return effect;
              };
              let origin: { x: number; z: number } | undefined;
              let firstFrame = -1;
              let tick = -1;
              const observe = () => {
                drawCount++;
                const effect: Effect | null | undefined = engine['_currentEffect'];
                if (!effect || !origin) return;
                const { x, z } = dungeon.game.player.root.position;
                if (firstFrame === -1 && (x !== origin.x || z !== origin.z)) {
                  firstFrame = engine.frameId;
                  tick = dungeon.game.steps;
                }
                if (firstFrame === engine.frameId)
                  draws.add(
                    JSON.stringify([
                      engine.getRenderPassNames()[engine.currentRenderPassId],
                      effect.key,
                    ]),
                  );
              };
              const elements = engine.drawElementsType.bind(engine);
              engine.drawElementsType = (...args) => {
                observe();
                elements(...args);
              };
              const arrays = engine.drawArraysType.bind(engine);
              engine.drawArraysType = (...args) => {
                observe();
                arrays(...args);
              };
              const loading = document.getElementById('loading')!.classList;
              const add = loading.add.bind(loading);
              loading.add = (...names) => {
                if (names.includes('done')) {
                  ready.push(
                    ...Object.values(engine['_compiledEffects'] as Record<string, Effect>)
                      .filter((e) => e.isReady())
                      .map((e) => e.key),
                  );
                  const { x, z } = dungeon.game.player.root.position;
                  origin = { x, z };
                  for (const m of dungeon.game.scene.materials) {
                    if ('_createdShaderName' in m && typeof m._createdShaderName === 'string')
                      shaders[m._createdShaderName] = m.name;
                  }
                }
                add(...names);
              };
              const oldScene = dungeon.game.scene;
              return (retire = false) => {
                const state = {
                  ready,
                  firstMotion: [...draws].sort(),
                  shaders,
                  tick,
                  prepared: [...prepared].filter((e) => !e.isDisposed).map((e) => e.key),
                  violations,
                  surviving: [] as string[],
                };
                if (retire) {
                  const before = dungeon.game.scene;
                  dungeon.regenerate(dungeon.game.world.seed, { pinSeed: true });
                  if (!before.isDisposed || !oldScene.isDisposed)
                    violations.push('scene not disposed');
                  state.surviving = [...prepared].filter((e) => !e.isDisposed).map((e) => e.key);
                }
                return state;
              };
            });
            const witness = await page.evaluate(
              async ({ seed, name, quality }) => {
                const select = document.querySelector<HTMLSelectElement>('#quality')!;
                select.value = quality;
                select.dispatchEvent(new Event('change'));
                if (name === null) {
                  window.__dungeon!.regenerate(seed, { pinSeed: true });
                  return null;
                }
                const { witness, reason, start, end } = await window.__dungeon!.encounter.run(
                  name,
                  'off',
                );
                return { witness, reason, start, end };
              },
              { seed, name, quality },
            );
            await page.waitForFunction(() => window.__dungeon?.ready, null, { timeout: 45000 });
            if (name === null) {
              const before = await page.evaluate(() => window.__dungeon!.snapshot().position);
              await page.keyboard.down('KeyW');
              await page.waitForFunction((p) => {
                const n = window.__dungeon!.snapshot().position;
                return n[0] !== p[0] || n[2] !== p[2];
              }, before);
              await page.keyboard.up('KeyW');
            }
            const draws = await audit.evaluate((snapshot) => snapshot(true));
            assert.ok(
              draws.ready.length && draws.firstMotion.length,
              'missing submitted draw coverage',
            );
            const missing = draws.firstMotion.filter(
              (row) => !draws.ready.includes(JSON.parse(row)[1]),
            );
            const scale = draws.firstMotion.filter(
              (row) =>
                row.includes('NONUNIFORMSCALING') &&
                /Camera overhead camera|graphic key light_shadowMap/.test(row),
            );
            const describe = (passName: string, key: string) => {
              const vertex = key.slice(0, key.indexOf('+'));
              return {
                passName,
                source: draws.shaders[vertex] ?? vertex,
                defines: key.slice(key.indexOf('@') + 1),
              };
            };
            const describeRow = (row: string) => {
              const [passName, key]: [string, string] = JSON.parse(row);
              return describe(passName, key);
            };
            const isSelected = ({ passName, source, defines }: ReturnType<typeof describe>) =>
              !signatures ||
              signatures.some(
                (s) =>
                  s.quality === quality &&
                  (s.pass === 'camera' ? cameraPass : shadowPass) === passName &&
                  s.source === source &&
                  s.scaled === defines,
              );
            const targeted = scale.filter((row) => isSelected(describeRow(row)));
            const identity = (passName: string, source: string) => `${passName}: ${source}`;
            const targetedIdentities = targeted
              .map((row) => {
                const { passName, source } = describeRow(row);
                return identity(passName, source);
              })
              .sort();
            const expectedIdentities = [
              ...camera.map((source) => identity(cameraPass, source)),
              ...(quality === 'high' ? [identity(shadowPass, 'shadowMap')] : []),
            ].sort();
            const missingScale = targeted.filter((row) => missing.includes(row));
            const unregistered = draws.prepared.filter(
              (key) => ![cameraPass, shadowPass].some((pass) => isSelected(describe(pass, key))),
            );
            result.push({
              seed,
              quality,
              name,
              preflight,
              browser: browser.version(),
              witness,
              errors,
              ...draws,
              missing,
              targeted,
              targetedIdentities,
              ...(shipping ? { expectedIdentities } : {}),
              missingScale,
              unregistered,
            });
            if (shipping)
              assert.deepEqual(
                targetedIdentities,
                expectedIdentities,
                `${seed}/${quality}: wrong first-motion scale identities`,
              );
            console.log({
              seed,
              quality,
              name,
              missing: missing.length,
              missingScale: missingScale.length,
              targeted: targeted.length,
              reason: witness?.reason,
            });
            if (hardware || shipping) {
              assert.ok(targeted.length, 'no selected keys submitted');
              if (quality === 'high') assert.ok(targeted.some((row) => row.includes('_shadowMap')));
              else assert.ok(scale.every((row) => !row.includes('_shadowMap')));
              if (hardware && name)
                assert.ok(
                  witness?.witness && !witness.reason,
                  `missing workload witness: ${witness?.reason}`,
                );
            }
            if (signatures) {
              assert.ok(
                draws.prepared.length,
                'candidate compiler did not issue any selected requests',
              );
              assert.deepEqual(
                { unregistered, violations: draws.violations, surviving: draws.surviving },
                { unregistered: [], violations: [], surviving: [] },
              );
            }
          } finally {
            await context.close();
          }
          assert.deepEqual(errors, []);
          unlocked();
        }
      } finally {
        await browser.close();
      }
    },
    true,
    { root, nonce },
  );
} finally {
  if (shipping) await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    JSON.stringify(
      { diagnosticOnly: true, hardware, root, source: source.digest, result },
      null,
      2,
    ),
    { flag: 'wx' },
  );
}
assert.equal(result.length, 4);
assert.ok(
  result.every((r) => Array.isArray(r.targeted) && r.targeted.length > 0),
  'no selected draw coverage',
);
assert.ok(
  result.every((r) => r.missingScale.length === 0),
  'targeted first-moving programs absent at READY',
);
