// Untimed, stopped-RAF scouting only. Never imported by the encounter capture.
import { chromium } from '@playwright/test';
import { withViteServer } from './testServer.ts';
import type { DebugWindow } from './browserTypes.ts';
declare const window: DebugWindow;

const base = 'http://127.0.0.1:5471';
await withViteServer(
  base,
  'dev',
  async () => {
    const browser = await chromium.launch({
      headless: false,
      timeout: 12000,
      args: ['--ozone-platform=wayland', '--ignore-gpu-blocklist'],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
      page.on('console', (msg) => {
        if (msg.text().startsWith('SCOUT ')) console.error(msg.text());
      });
      await page.goto(`${base}/?debug&seed=MOURNING-747`);
      await page.waitForFunction(() => window.__dungeon?.ready, null, { timeout: 30000 });
      const evidence = await page.evaluate(
        async ({ sweep, candidate }) => {
          const modules = ['/src/combat.ts', '/src/encounterRecipe.ts'];
          const { clearSight }: typeof import('../src/combat.ts') = await import(modules[0]!);
          const { movement, recipe }: typeof import('../src/encounterRecipe.ts') = await import(
            modules[1]!
          );
          const d = window.__dungeon;
          d.engine.stopRenderLoop();
          const scout = async (
            seed: string,
            points: readonly (readonly [number, number])[],
            packId: string = recipe.pack,
            retire: readonly string[] = [],
          ) => {
            d.regenerate(seed, { pinSeed: true });
            const g = d.game,
              p = g.player.actor.position;
            await g.scene.whenReadyAsync();
            if (!d.ready || g.steps !== 0) throw new Error('Offline fresh start failed');
            const pack = g.ecs.get(packId)!.require('koboldSquad');
            const gate = g.world.entities.find(
              (e) =>
                e.type === 'door' && e.axis === 'x' && Math.abs(e.x - 14) < 3 && Math.abs(e.z) <= 2,
            );
            const path =
              gate && gate.z !== 0 ? ([[0, gate.z], [18, gate.z], ...points] as const) : points;
            if (path.some(([x, z]) => !g.player.actor.navigator.canStand({ x, z })))
              return { seed, points, blockedWaypoint: true };
            g.desiredAlpha = g.camera.alpha = recipe.cameraAlpha;
            d.cpu.start('off');
            try {
              for (const id of retire) {
                const a = g.combat.enemies.find((a) => a.id === id)!;
                g.combat.damage(a, a.health.max + 1);
              }
              const log: unknown[] = [],
                edges: { tick: number; codes: string[] }[] = [];
              const squads = g.ecs.query('koboldSquad');
              let index = 0,
                interacted = false,
                prevKeys: string[] = [],
                prev = '',
                near = 0,
                outcome = '';
              let minError = Infinity;
              let start: ReturnType<typeof d.cpu.state> | undefined;
              g.combat.encounterAttack = (event) => {
                if (
                  pack.members.some((m) => m.entity.id === event.actor) &&
                  event.target === g.player.actor.id
                ) {
                  log.push({ tick: g.steps, ...event });
                  if (event.outcome !== 'no-release') outcome = event.outcome;
                }
              };
              for (let tick = 1; tick <= recipe.warmup + recipe.maxTicks; ++tick) {
                let codes: string[] = [];
                let press = false;
                if (tick > recipe.warmup) {
                  codes = path[index] ? movement(p.x, p.z, path[index]!) : [];
                  if (!codes.length && path[index])
                    codes = path[++index] ? movement(p.x, p.z, path[index]!) : [];
                  press =
                    !!gate &&
                    !interacted &&
                    p.x >= gate.x - 1.45 &&
                    p.x < gate.x &&
                    Math.abs(p.z - gate.z) < 0.4;
                }
                if (press || codes.join() !== prevKeys.join()) {
                  edges.push({ tick, codes: press ? [...codes, 'KeyE'] : codes });
                  prevKeys = codes;
                }
                d.cpu.frame(
                  codes,
                  1,
                  false,
                  press
                    ? () => {
                        interacted = true;
                        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
                        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
                      }
                    : undefined,
                );
                if (
                  tick <= recipe.warmup &&
                  (squads.some((e) => e.require('koboldSquad').active) ||
                    g.combat.enemies.some((a) => a.alive && (a.brain?.memory ?? 0) > 0))
                ) {
                  return { seed, points, warmAlert: tick };
                }
                if (candidate && tick === recipe.warmup) start = d.cpu.state(true);
                if (tick > recipe.warmup) {
                  const sight = pack.living.filter((m) => {
                    const a = m.entity.require('transform');
                    return Math.hypot(a.x - p.x, a.z - p.z) < 10 && clearSight(g.world, a, p);
                  }).length;
                  const error = Math.max(
                    ...pack.living.map((m) => {
                      const a = m.entity.require('transform'),
                        b = pack.approach(m);
                      return Math.hypot(a.x - b.x, a.z - b.z);
                    }),
                  );
                  if (pack.active) minError = Math.min(error, minError);
                  if (pack.state !== prev || sight !== near || tick % 120 === 0)
                    log.push({
                      tick,
                      p: { ...p },
                      state: pack.state,
                      target: pack.target?.id,
                      sight,
                      error,
                    });
                  prev = pack.state;
                  near = sight;
                  if (outcome) break;
                }
              }
              return {
                seed,
                points: path,
                packId,
                retire,
                outcome,
                minError,
                edges,
                log,
                start: start?.detail?.authority,
              };
            } finally {
              g.combat.encounterAttack = undefined;
              d.cpu.stop();
            }
          };
          if (candidate) {
            const points = candidate.route as [number, number][];
            return [
              await scout(candidate.seed, points),
              await scout(candidate.seed, points, recipe.pack, candidate.retire),
            ];
          }
          if (!sweep)
            return scout('MOURNING-747', [
              [31, 0],
              [31, -2],
            ]);
          const attempts = [];
          for (let n = 747; n <= 770; n++) {
            const seed = `MOURNING-${n}`;
            for (const points of [
              [
                [31, 0],
                [31, -2],
              ],
              [
                [24, 0],
                [31, 2],
              ],
              [
                [29, 0],
                [33, 0],
              ],
            ] as const) {
              const result = await scout(seed, points);
              attempts.push(result);
              console.log(`SCOUT ${JSON.stringify(result)}`);
              if (result.outcome) {
                const reduced = await scout(seed, points, recipe.pack, recipe.retire);
                attempts.push(reduced);
                if (
                  reduced.outcome &&
                  JSON.stringify(result.edges) === JSON.stringify(reduced.edges)
                )
                  return attempts;
              }
            }
          }
          return attempts;
        },
        {
          sweep: process.argv.includes('--sweep'),
          candidate: process.env.SCOUT_CANDIDATE
            ? (JSON.parse(process.env.SCOUT_CANDIDATE) as {
                seed: string;
                route: [number, number][];
                retire: string[];
              })
            : undefined,
        },
      );
      console.log(JSON.stringify(evidence));
    } finally {
      await browser.close();
    }
  },
  true,
);
