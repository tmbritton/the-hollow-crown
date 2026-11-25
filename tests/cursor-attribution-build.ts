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
                '    a.mesh.position.y = a.y + Math.sin(game.time * 1.6 + a.phase) * 0.12;\n    a.mesh.rotation.y = game.time * a.spin;\n    a.mesh.rotation.z = Math.sin(game.time + a.phase) * 0.08;',
                "    epWrite('pose', a.mesh, () => {\n    a.mesh.position.y = a.y + Math.sin(game.time * 1.6 + a.phase) * 0.12;\n    a.mesh.rotation.y = game.time * a.spin;\n    a.mesh.rotation.z = Math.sin(game.time + a.phase) * 0.08;\n    });",
              ],
              ...[
                ['root', 'scaling.y = 1 + Math.sin(game.time * 1.4 + creature.phase) * 0.018;'],
                ['head', 'rotation.y = Math.sin(game.time * 0.7 + creature.phase) * 0.08;'],
                ['tail', 'rotation.y = Math.sin(game.time * 1.1 + creature.phase) * 0.14;'],
              ].map(([node, write]): [string, string] => [
                `    creature.${node}.${write}`,
                `    epWrite('pose', creature.${node}, () => { creature.${node}.${write} });`,
              ]),
              [
                '    for (const mesh of wall.meshes) mesh.scaling.y = wall.scale;',
                "    for (const mesh of wall.meshes) epWrite('pose', mesh, () => { mesh.scaling.y = wall.scale; });",
              ],
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
              ['    engine._drawCalls.fetchNewFrame();', '    engine._drawCalls.fetchNewFrame();'],
              [
                '    if (!game) return;\n    if (ui.ready && !paused()) {',
                '    if (!game) return;\n    if (ui.ready) ep.begin(game);\n    if (ui.ready && !paused()) {',
              ],
              [
                '        while (accumulator >= 1 / 60) {',
                '        ep.retain(game, accumulator);\n        while (accumulator >= 1 / 60) {',
              ],
              [
                '\n          tick(1 / 60);\n          accumulator',
                '\n          ep.fixed(game, () => tick(1 / 60));\n          accumulator',
              ],
              ['  game.steps++;', '  game.steps++; ep.fixedStep(game.steps);'],
              [
                '      renderUpdate(dt * (import.meta.env.DEV ? (animationReview?.speed ?? 1) : 1));',
                '      ep.presentation(game, () => renderUpdate(dt * (import.meta.env.DEV ? (animationReview?.speed ?? 1) : 1)));',
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
              [
                "    required(e.crystal, 'Altar crystal missing').scaling.setAll(1.25);",
                "    const crystal = required(e.crystal, 'Altar crystal missing');\n    epWrite('pose', crystal, () => crystal.scaling.setAll(1.25));",
              ],
            ]);
            const transformed = `import { cursorDiagnostic } from '../tests/cursor-attribution-probe.ts';\nimport { writerDiagnostic as epWrite } from '../tests/cursor-attribution-writers.ts';\n${code}`;
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
          if (id.endsWith('/src/socialRendering.ts')) {
            const code = patch(source, [
              [
                '          mesh.position.y = group.center.h + 0.1;\n          mesh.scaling.setAll(1);',
                "          epWrite('pose', mesh, () => {\n            mesh.position.y = group.center.h + 0.1;\n            mesh.scaling.setAll(1);\n          });",
              ],
              [
                '        mesh.position.set(\n',
                "        epWrite('pose', mesh, () => {\n          mesh.position.set(\n",
              ],
              [
                '        mesh.scaling.set(scale.x, scale.y, scale.z);',
                '        mesh.scaling.set(scale.x, scale.y, scale.z);\n        });',
              ],
            ]);
            const wired = `import { writerDiagnostic as epWrite } from '../tests/cursor-attribution-writers.ts';\n${code}`;
            probes.set('socialRendering.ts', wired);
            return wired;
          }
          if (id.endsWith('/src/actorRendering.ts')) {
            const code = patch(source, [
              [
                '    proxy.position.set(position.x, position.h + actor.jump.height + 0.72, position.z);',
                "    epWrite('physics', proxy, () => proxy.position.set(position.x, position.h + actor.jump.height + 0.72, position.z));",
              ],
              [
                '\n      proxy.position.set(from.x, from.h + 0.72, from.z);',
                "\n      epWrite('physics', proxy, () => proxy.position.set(from.x, from.h + 0.72, from.z));",
              ],
              [
                '        proxy.position.set(from.x, from.h + 0.72, from.z);',
                "        epWrite('physics', proxy, () => proxy.position.set(from.x, from.h + 0.72, from.z));",
              ],
              [
                '      proxy.position.y = (heightAt(world, proxy.position.x, proxy.position.z) ?? from.h) + 0.72;',
                "      epWrite('physics', proxy, () => { proxy.position.y = (heightAt(world, proxy.position.x, proxy.position.z) ?? from.h) + 0.72; });",
              ],
            ]);
            const wired = `import { writerDiagnostic as epWrite } from '../tests/cursor-attribution-writers.ts';\n${code}`;
            probes.set('actorRendering.ts', wired);
            return wired;
          }
          if (id.endsWith('/src/enemyRendering.ts')) {
            const code = patch(source, [
              [
                '      for (const [mesh] of pickActors) mesh.computeWorldMatrix(true);',
                '      epSync(pickActors);',
              ],
              [
                '        bar.root.position.set(p.x, p.h + 2.2, p.z);\n        bar.root.billboardMode = TransformNode.BILLBOARDMODE_ALL;\n        bar.fill.scaling.x = Math.max(0.001, bar.actor.health.current / bar.actor.health.max);',
                "        epWrite('pose', bar.root, () => {\n          bar.root.position.set(p.x, p.h + 2.2, p.z);\n          bar.root.billboardMode = TransformNode.BILLBOARDMODE_ALL;\n        });\n        epWrite('pose', bar.fill, () => {\n          bar.fill.scaling.x = Math.max(0.001, bar.actor.health.current / bar.actor.health.max);\n        });",
              ],
              [
                '    if (actor) mesh.position.set(actor.position.x, actor.position.h + 0.08, actor.position.z);',
                "    if (actor) epWrite('pose', mesh, () => mesh.position.set(actor.position.x, actor.position.h + 0.08, actor.position.z));",
              ],
              [
                '      if (target) ring.position.set(target.position.x, target.position.h + 0.08, target.position.z);',
                "      if (target) epWrite('pose', ring, () => ring.position.set(target.position.x, target.position.h + 0.08, target.position.z));",
              ],
            ]);
            const wired = `import { syncDiagnostic as epSync } from '../tests/cursor-attribution-probe.ts';\nimport { writerDiagnostic as epWrite } from '../tests/cursor-attribution-writers.ts';\n${code}`;
            probes.set('enemyRendering.ts', wired);
            return wired;
          }
          if (id.endsWith('/src/machines/world/interactions.ts')) {
            const code = patch(source, [
              [
                '  if (door.pivot) door.pivot.rotation.y = chart.snapshot.context.angle;',
                "  const pivot = door.pivot;\n  if (pivot) epWrite('door', pivot, () => { pivot.rotation.y = chart.snapshot.context.angle; });",
              ],
              [
                '  if (chest.lid) chest.lid.rotation.x = chart.snapshot.context.angle;',
                "  const lid = chest.lid;\n  if (lid) epWrite('chest', lid, () => { lid.rotation.x = chart.snapshot.context.angle; });",
              ],
            ]);
            const wired = `import { writerDiagnostic as epWrite } from '../../../tests/cursor-attribution-writers.ts';\n${code}`;
            probes.set('interactions.ts', wired);
            return wired;
          }
          if (id.endsWith('/src/observation.ts')) {
            const code = patch(source, [
              [
                "  mesh.thinInstanceBufferUpdated('matrix');\n  // Empty pools contain only zero-scale instances; their previous bound remains conservative.\n  if (active) mesh.thinInstanceRefreshBoundingInfo();",
                "  epThin(mesh, active, () => {\n    mesh.thinInstanceBufferUpdated('matrix');\n    if (active) mesh.thinInstanceRefreshBoundingInfo();\n  });",
              ],
            ]);
            const wired = `import { thinDiagnostic as epThin } from '../tests/cursor-attribution-writers.ts';\n${code}`;
            probes.set('observation.ts', wired);
            return wired;
          }
          if (id.endsWith('/src/rigs/bindings.ts')) {
            const code = patch(source, [
              [
                '    writeDraw(deferTail);',
                "    epPose('pose', rig.root, () => writeDraw(deferTail));",
              ],
              [
                '      for (const entry of tailEntries) applyEntry(entry);\n      finishHistory();',
                "      epPose('pose', rig.root, () => { for (const entry of tailEntries) applyEntry(entry); });\n      finishHistory();",
              ],
              [
                '      pose.world.set(world);\n      for (const entry of entries) {',
                "      epPose('physics', rig.root, () => {\n      pose.world.set(world);\n      for (const entry of entries) {",
              ],
              [
                '        attached[i].binding.node.freezeWorldMatrix(a.matrix);\n      }',
                '        attached[i].binding.node.freezeWorldMatrix(a.matrix);\n      }\n      });',
              ],
            ]);
            const wired = `import { writerDiagnostic as epPose } from '../../tests/cursor-attribution-writers.ts';\n${code}`;
            probes.set('bindings.ts', wired);
            return wired;
          }
        },
      },
    ],
  });
  if (probes.size !== 7) throw new Error('diagnostic build omitted required probes');
  return Object.fromEntries(probes);
}
