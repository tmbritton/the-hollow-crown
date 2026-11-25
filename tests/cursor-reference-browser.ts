import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { withViteServer } from './testServer.ts';

const base = 'http://127.0.0.1:5187';
await withViteServer(base, 'dev', async () => {
  const browser = await chromium.launch({
    channel: 'chromium',
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Append a dev-only bridge in the served response. Do not replace the gameplay function,
    // cache a shortlist, or ship debug hooks with the production bundle.
    await page.route('**/src/main.ts', async (route) => {
      const response = await route.fetch();
      const source = await response.text();
      await route.fulfill({ response, body: `${source}\n${fixtureSource()}` });
    });
    await page.goto(`${base}/?seed=MOURNING-731&debug`);
    await page.locator('#loading.done').waitFor({ state: 'attached', timeout: 45000 });
    const rows = (await page.evaluate('globalThis.__cursorReferenceBrowser()')) as {
      x: number;
      y: number;
      kind: string;
      id?: string;
      parity: boolean;
    }[];
    assert.deepEqual(errors, []);
    assert.ok(
      rows.every((row) => row.parity),
      JSON.stringify(rows.filter((row) => !row.parity)),
    );
    assert.ok(
      rows.some((row) => row.kind === 'object' && row.id === 'prop:shrine-entrance-0'),
      'no shrine sample',
    );
    assert.ok(
      rows.some((row) => row.kind === 'floor'),
      'no floor sample',
    );
    await mkdir('test-results/epic16', { recursive: true });
    await writeFile(
      'test-results/epic16/browser-parity.json',
      `${JSON.stringify(rows, null, 2)}\n`,
    );
    console.log(`PASS ${rows.length} native lens-adjusted picks match the frozen reference`);
  } finally {
    await browser.close();
  }
});

// A string so the bridge is evaluated inside the real main module, with its original
// private pointerRay and pickPointer. The reference builds its ownership independently.
function fixtureSource() {
  return `
import { exhaustive, sameHit } from '/tests/cursor-reference.ts';
globalThis.__cursorReferenceBrowser = async () => {
  engine.stopRenderLoop();
  const {scene, world, ecs, scenario, combat, player} = game;
  const proxies = new Map(combat.enemies.map((actor) => [
    scene.getMeshByName(actor.id + ':selection'),
    {id: actor.id, alive: actor.alive, artwork: actor.entity.get('render')?.meshes ?? []}
  ]));
  if (proxies.has(null)) throw new Error('missing enemy selection proxy');
  const ownerOf = (mesh) => {
    const cargo = scenario?.tributeRendering.pickOwners.get(mesh);
    if (cargo) return cargo;
    if (mesh.name.includes(':use/')) return mesh.name.split(':use/')[1];
    return world.entities.find((e) =>
      (e.type === 'door' && e.pivot && mesh.isDescendantOf(e.pivot)) ||
      (e.type === 'chest' && (mesh.parent?.name === e.id || mesh.parent?.parent?.name === e.id)) ||
      (e.type === 'altar' && mesh === e.crystal) ||
      (e.type === 'portrait' && ecs.get(e.id)?.get('render')?.meshes.includes(mesh)))?.id;
  };
  const reference = exhaustive({ scene, proxies, ownerOf, shadows: player.shadowMeshes });
  const pixels = [[920, 580], [1490, 740]];
  for (let x = 1200; x <= 1680; x += 24) {
    for (let y = 576; y <= 912; y += 24) pixels.push([x, y]);
  }
  return pixels.flatMap(([x, y]) => {
    const ray = pointerRay(game, x, y);
    if (!ray) return [];
    const passes = [];
    const native = scene.pickWithRay;
    scene.pickWithRay = function (...args) {
      const hit = native.apply(this, args);
      passes.push(hit);
      return hit;
    };
    let actual;
    try { actual = pickPointer(game, ray); } finally { scene.pickWithRay = native; }
    const picked = actual.kind === 'enemy' ? passes[0] : passes[2];
    const surface = picked?.hit ? { mesh: picked.pickedMesh.name, instance: picked.thinInstanceIndex,
      distance: picked.distance } : {};
    const hit = actual.kind === 'enemy' ? { kind: 'enemy', id: actual.actor.id, ...surface }
      : { ...actual, ...surface };
    const expected = reference(ray);
    return [{x, y, ...hit, parity: sameHit(hit, expected), expected}];
  });
};`;
}
