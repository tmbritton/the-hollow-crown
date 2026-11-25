import { build } from 'vite';

function patch(source: string, edits: readonly [string, string][]) {
  for (const [before, after] of edits) {
    if (source.split(before).length !== 2)
      throw new Error(`diagnostic hook missing or ambiguous: ${before}`);
    source = source.replace(before, after);
  }
  return source;
}

export async function buildDiagnostic(outDir: string) {
  if (process.env.NODE_ENV && process.env.NODE_ENV !== 'production')
    throw new Error('diagnostic build requires production NODE_ENV');
  const probes = new Map<string, string>();
  await build({
    configFile: false,
    envDir: false,
    publicDir: false, // The pinned baseline has no public assets.
    css: { postcss: { plugins: [] } }, // Inline options bypass external PostCSS discovery.
    mode: 'production',
    build: { outDir, emptyOutDir: false, minify: 'oxc', sourcemap: false },
    plugins: [
      {
        name: 'epic16-diagnostic-only',
        enforce: 'pre',
        transform(source, id) {
          if (id.endsWith('/src/main.ts')) {
            const code = patch(source, [
              [
                'function refreshPreview(current: Game) {',
                'function refreshPreview(current: Game) {\n  ep.none();',
              ],
              [
                '\n  const pick = pickPointer(current, ray);',
                '\n  const pick = ep.hover(current, ray);\n  const epCue = ep.clock();',
              ],
              ['  outlines = next;', '  outlines = next; ep.cue(epCue, next.length);'],
              [
                "    loading.classList.add('done');",
                "    loading.classList.add('done'); ep.ready(game, engine, quality, visualTrial.settings);",
              ],
              [
                '    engine._drawCalls.fetchNewFrame();',
                '    if (game && ui.ready) ep.begin(game);\n    engine._drawCalls.fetchNewFrame();',
              ],
              [
                '\n          tick(1 / 60);\n          accumulator',
                '\n          tick(1 / 60); ep.tick(game);\n          accumulator',
              ],
              [
                '  animateActors(game.ecs, dt, game.time, game.world);',
                '  ep.rig(() => animateActors(game.ecs, dt, game.time, game.world));',
              ],
              ['\n    game.scene.render();', '\n    ep.render(game, engine);'],
              [
                '  const meshes = ownersFor(current);',
                '  const meshes = ep.owners(() => ownersFor(current));',
              ],
            ]);
            const transformed = `import { cursorDiagnostic } from '../tests/cursor-attribution-probe.ts';\n${code}`;
            // Initialize before start()/runRenderLoop, after lexical declarations exist.
            const wired = patch(transformed, [
              [
                'try {\n  if (!Engine.isSupported())',
                `const ep = cursorDiagnostic({canvas, pointerRay, pickPointer, currentOperation, inUseReach, ground: (g, ray) => projectGroundAim(g.world, ray, g.player.actor.position.h)});\ntry {\n  if (!Engine.isSupported())`,
              ],
            ]);
            probes.set('main.ts', wired);
            return wired;
          }
          if (id.endsWith('/src/enemyRendering.ts')) {
            const code = patch(source, [
              [
                '      for (const [mesh] of pickActors) mesh.computeWorldMatrix(true);',
                '      epSync(pickActors);',
              ],
            ]);
            const wired = `import { syncDiagnostic as epSync } from '../tests/cursor-attribution-probe.ts';\n${code}`;
            probes.set('enemyRendering.ts', wired);
            return wired;
          }
        },
      },
    ],
  });
  if (probes.size !== 2) throw new Error('diagnostic build omitted required probes');
  return Object.fromEntries(probes);
}
