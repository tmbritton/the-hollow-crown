import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { distribution, fingerprint, rendererKind } from '../src/cpuMetrics.ts';
import type { DebugWindow } from './browserTypes.ts';

declare const window: DebugWindow;
const seed = 'MOURNING-731';
const candidate = process.env.DEMO_URL ?? 'http://127.0.0.1:5173';
const reference = process.env.CPU5_URL;
const hardware = process.env.CPU_GPU === 'hardware';
const browser = await chromium.launch({
  headless: !hardware,
  args: hardware
    ? ['--ignore-gpu-blocklist']
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

async function replay(
  base: string,
  detailed: boolean,
  scenario: 'living' | 'death',
  variant = 'normal',
) {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`${base}/?debug&seed=${seed}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
    await page.evaluate((seed) => {
      const d = window.__dungeon;
      d.engine.stopRenderLoop();
      d.animation.pause();
      d.regenerate(seed);
    }, seed);
    await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
    const result = await page.evaluate(
      async ({ detailed, scenario, variant }) => {
        const paths = ['/src/actorRendering.ts', '/src/cpuMetrics.ts', '/src/corpseRendering.ts'];
        const { animateActors } = (await import(
          paths[0]
        )) as typeof import('../src/actorRendering.ts');
        const { CpuMetrics, setCpuMetrics } = (await import(
          paths[1]
        )) as typeof import('../src/cpuMetrics.ts');
        const terrain = (await import(paths[2])) as typeof import('../src/corpseRendering.ts');
        const d = window.__dungeon,
          g = d.game;
        d.engine.stopRenderLoop();
        d.animation.pause();
        const quality = document.querySelector<HTMLSelectElement>('#quality')!;
        quality.value = 'high';
        quality.dispatchEvent(new Event('change'));
        const dt = 1 / 60;
        for (let i = 0; i < 12; i++) d.step([], 1);
        const actors = g.combat.actors;
        const tailed = actors.filter((actor) => actor.entity.require('rigPose').tail);
        const walker = g.player.actor;
        const origin = { ...walker.position };
        const sample = () => ({
          camera: [g.camera.getViewMatrix().asArray(), g.camera.getProjectionMatrix().asArray()],
          actors: actors.map((a) => {
            const b = a.entity.require('rigPose');
            return {
              id: a.id,
              enabled: a.entity.require('rig').root.isEnabled(),
              alive: a.alive,
              position: a.position,
              pose: [...b.pose.world],
              blocked: b.tail?.blocked,
              feet: b.grounding.contacts.map((c) => [c.step, c.position]),
            };
          }),
          boxes: terrain.readCorpseTerrain(g.ecs, g.world),
        });
        const counts = new CpuMetrics();
        let full = 0,
          eagerVisits = 0,
          step = 0;
        const sampled = new Set<string>();
        const eligible = (a: typeof walker) => a.alive && a.entity.require('rig').root.isEnabled();
        if (detailed || variant !== 'normal') {
          const query = g.ecs.query.bind(g.ecs);
          g.ecs.query = (...components) => {
            const result = query(...components);
            if (components.join(',') === 'actor,transform,health') eagerVisits += result.length;
            return result;
          };
          for (const a of actors) {
            const binding = a.entity.require('rigPose');
            const original = binding.sampleSurfaces;
            binding.sampleSurfaces = function (tailOnly, cargo, cargoRevision) {
              const published = original.call(this, tailOnly, cargo, cargoRevision);
              if (!tailOnly) {
                if (published !== false) full++;
                sampled.add(a.id);
              }
              if (variant === 'copy' && published !== false) {
                // Force the production inspection copy on every write, without changing the solver.
                if (tailOnly) void binding.tailSurfaces;
                else void binding.bodySurfaces;
              }
              return published;
            };
          }
          if (detailed) setCpuMetrics(counts, true);
        }
        const run = (delta: number) => {
          sampled.clear();
          animateActors(g.ecs, delta, ++step * dt, g.world);
          // Work-only ablation: eagerly build the normally skipped eligible bodies. This isolates
          // extra geometry from differences in tail search order/solver (and is not all of CPU5).
          if (variant === 'eager' && sampled.size)
            for (const a of actors)
              if (eligible(a) && !sampled.has(a.id)) a.entity.require('rigPose').sampleSurfaces();
        };
        const phases: {
          name: string;
          length: number;
          capture: ReturnType<typeof sample>;
          end: ReturnType<typeof sample>;
          full: number;
          eagerVisits: number;
          totals: Record<string, number>;
          timings: [number, number][];
        }[] = [];
        const measure = async (name: string, delta = dt, timingsEnabled = !detailed) => {
          const length = name === 'settled' && detailed ? 180 : 45;
          const timings: [number, number][] = [];
          const first = counts.snapshot().samples.length;
          const startFull = full,
            startVisits = eagerVisits;
          const capture = structuredClone(sample());
          for (let i = 0; i < length; i++) {
            if (detailed) counts.begin(step);
            const start = timingsEnabled ? performance.now() : 0;
            run(delta);
            if (timingsEnabled) {
              const animated = performance.now();
              g.scene.render();
              timings.push([animated - start, performance.now() - start]);
            }
            if (detailed) counts.end();
            if (i % 5 === 4) await new Promise((resolve) => setTimeout(resolve, 0));
          }
          const totals: Record<string, number> = {};
          for (const tick of counts.snapshot().samples.slice(first))
            for (const [key, value] of Object.entries(tick.counts))
              totals[key] = (totals[key] ?? 0) + value;
          phases.push({
            name,
            length,
            capture,
            end: structuredClone(sample()),
            full: full - startFull,
            eagerVisits: eagerVisits - startVisits,
            totals,
            timings,
          });
        };
        // Keep authored poses intact; only move most actors away from the first tail's demand.
        for (let i = 0; i < actors.length; i++) {
          const a = actors[i];
          if (a !== walker && a !== tailed[0])
            Object.assign(a.position, { x: origin.x + 40 + 20 * i, z: origin.z });
        }
        Object.assign(tailed[0].position, { x: origin.x + 4, z: origin.z, h: origin.h });
        for (let i = 0; i < 30; i++) {
          run(dt);
          if (!detailed) g.scene.render();
        }
        if (scenario === 'death') {
          // Brand-new run, same camera, 12 full fixed steps + 30 identical animation steps.
          // No parked/revived formation actors, cargo claims or presentation from a prior phase.
          const warm = structuredClone(sample());
          const ragdollPath = '/src/ragdoll.ts';
          const { RAGDOLL_LIMIT } = (await import(
            ragdollPath
          )) as typeof import('../src/ragdoll.ts');
          // Keep every island active until the controlled first-settled boundary below.
          // The cap eviction path is exercised separately in the binding/lifecycle tests.
          const victims = actors.filter((a) => a !== walker).slice(0, RAGDOLL_LIMIT);
          for (const a of victims)
            if (!g.combat.damage(a, 1000, undefined, { kind: 'melee', travel: { x: 1, z: 0 } }))
              throw new Error(`rejected lethal: ${a.id}`);
          const handoffs = victims.map((a) => {
            const { target, run: _run, source, ...handoff } = a.entity.require('deathHandoff');
            return { ...handoff, target: target.id, source: source?.id };
          });
          run(dt);
          const entry = structuredClone(sample());
          await measure('active');
          if (victims.some((a) => a.entity.require('ragdoll').settled))
            throw new Error('unexpected settlement before the controlled publication boundary');
          for (const a of victims) a.entity.require('ragdoll').freeze();
          // Flush the final render transforms at the same boundary in both builds.
          // CPU5's reader uses Babylon world AABBs, which otherwise may still be from the
          // previous render ID on the first settled step after a no-render active replay.
          const deathPath = '/src/deathPhysics.ts';
          const { advanceDeathPhysics } = (await import(
            deathPath
          )) as typeof import('../src/deathPhysics.ts');
          advanceDeathPhysics(g.ecs, g.world, 0);
          for (const a of victims)
            for (const mesh of a.entity.require('render').meshes) {
              const matrix = mesh.computeWorldMatrix(true);
              mesh.getBoundingInfo().boundingBox._update(matrix);
            }
          run(dt);
          const firstSettled = structuredClone(sample());

          const paths = ['/src/world.ts', '/src/corpseTerrain.ts'];
          const { heightAt } = (await import(paths[0])) as typeof import('../src/world.ts');
          const { corpseStep } = (await import(
            paths[1]
          )) as typeof import('../src/corpseTerrain.ts');
          const drawn = victims.flatMap((a) =>
            a.entity.require('render').meshes.flatMap((mesh) => {
              if (mesh.isDisposed() || !mesh.isEnabled() || !mesh.isVisible || mesh.visibility <= 0)
                return [];
              const matrix = mesh.computeWorldMatrix(true).m;
              const { minimum: lo, maximum: hi } = mesh.getBoundingInfo().boundingBox;
              const corners = Array.from({ length: 8 }, (_, i) => {
                const x = i & 4 ? hi.x : lo.x,
                  y = i & 2 ? hi.y : lo.y,
                  z = i & 1 ? hi.z : lo.z;
                return [0, 1, 2].map(
                  (j) => x * matrix[j] + y * matrix[4 + j] + z * matrix[8 + j] + matrix[12 + j],
                );
              });
              const h = heightAt(g.world, matrix[12], matrix[14]) ?? a.position.h;
              return [{ corners, h }];
            }),
          );
          // Independent oracle: intersect a vertical line with the drawn box's face triangles,
          // not the inverse slabs, aggregate index or cached box reader.
          const faces = [
            [0, 1, 3, 2],
            [4, 5, 7, 6],
            [0, 1, 5, 4],
            [2, 3, 7, 6],
            [0, 2, 6, 4],
            [1, 3, 7, 5],
          ];
          const direct = ({ x, z, h }: { x: number; z: number; h: number }) => {
            let top = 0;
            for (const box of drawn) {
              if (Math.abs(box.h - h) > 0.45) continue;
              for (const [i, j, k, l] of faces)
                for (const [b, c] of [
                  [j, k],
                  [k, l],
                ]) {
                  const [a, v, w] = [box.corners[i], box.corners[b], box.corners[c]];
                  const ux = v[0] - a[0],
                    uz = v[2] - a[2],
                    vx = w[0] - a[0],
                    vz = w[2] - a[2];
                  const det = ux * vz - uz * vx;
                  if (Math.abs(det) < 1e-12) continue;
                  const s = ((x - a[0]) * vz - (z - a[2]) * vx) / det;
                  const t = (ux * (z - a[2]) - uz * (x - a[0])) / det;
                  if (s >= -1e-9 && t >= -1e-9 && s + t <= 1 + 1e-9)
                    top = Math.max(top, a[1] + s * (v[1] - a[1]) + t * (w[1] - a[1]) - h);
                }
            }
            return Math.min(0.46, top);
          };
          const ahead = { x: 0.2, z: 0.1 },
            phase = Math.PI * 1.37;
          // CPU5 consumes live Vector3 bounds; a structured clone loses their getters.
          const query =
            terrain.publishCorpseContacts?.(g.ecs, g.world) ??
            terrain.readCorpseTerrain(g.ecs, g.world);
          const probes = drawn.map(({ corners, h }) => {
            const p = {
              x: (corners[0][0] + corners[7][0]) / 2,
              z: (corners[0][2] + corners[7][2]) / 2,
              h,
            };
            const contact = direct(p);
            const swing = Math.max(
              contact,
              Math.sin(phase - Math.PI) *
                Math.max(
                  contact,
                  ...[-1, -0.5, 0.5, 1].map((t) =>
                    direct({ x: p.x + ahead.x * t, z: p.z + ahead.z * t, h }),
                  ),
                ),
            );
            if (
              Math.abs(corpseStep(query, p, ahead, 0) - contact) > 1e-5 ||
              Math.abs(corpseStep(query, p, ahead, phase) - swing) > 1e-5
            )
              throw new Error(`first settled drawn-box probe mismatch at ${JSON.stringify(p)}`);
            return { p, contact, swing };
          });
          if (!probes.some((p) => p.contact > 0) || !probes.some((p) => p.swing > p.contact))
            throw new Error(
              'first settled fixture did not exercise both positive contact and swing',
            );
          for (let i = 0; i < 8; i++) run(dt);
          await measure('settled');
          await measure('paused', 0);
          setCpuMetrics(null);
          return {
            renderer: d.engine.getGlInfo(),
            phases,
            death: { warm, handoffs, entry, firstSettled, probes },
          };
        }
        await measure('distant');
        const reviewPath = '/tests/animation-review-fixture.ts';
        const { createReviewStage } = (await import(
          reviewPath
        )) as typeof import('./animation-review-fixture.ts');
        const stage = createReviewStage(g);
        const formation = stage.fixture('shieldbearer', 'formation');
        formation.advance(60);
        await measure('busy');
        const carrier = actors.find((a) => a.id === formation.id)!;
        const crate = g.ecs.query('cargo')[0].require('cargo');
        if (!crate.claim(carrier.entity)) throw new Error('cargo benchmark claim failed');
        crate.commit(carrier.entity, 'pickup');
        for (let i = 0; i < 30; i++) run(dt);
        if (!carrier.entity.require('rigPose').actions.carrying)
          throw new Error('cargo benchmark did not pose the coffer');
        await measure('cargo');
        setCpuMetrics(null);
        return { renderer: d.engine.getGlInfo(), phases, death: undefined };
      },
      { detailed, scenario, variant },
    );
    assert.deepEqual(errors, []);
    if (hardware)
      assert.equal(rendererKind(result.renderer.renderer, result.renderer.vendor), 'hardware');
    return result;
  } finally {
    await page.close();
  }
}

try {
  const counts = await replay(candidate, true, 'living');
  const deathCounts = await replay(candidate, true, 'death');
  assert.ok(deathCounts.death!.firstSettled.boxes.length > 0);
  const settled = deathCounts.phases.find((phase) => phase.name === 'settled')!;
  assert.equal(settled.totals['alloc.corpseLists'] ?? 0, 0);
  assert.equal(settled.totals['corpse.meshVisits'] ?? 0, 0, 'settled production mesh visits');
  assert.equal(settled.totals['corpse.supportLookups'] ?? 0, 0, 'settled support lookups');
  const summarize = (result: typeof counts) =>
    result.phases.map(({ capture, end, timings, ...phase }) => ({
      ...phase,
      digest: fingerprint(capture),
      endDigest: fingerprint(end),
      animation: distribution(timings.map(([animation]) => animation)),
      frame: distribution(timings.map(([, frame]) => frame)),
    }));
  const report = {
    renderer: counts.renderer,
    counts: [...summarize(counts), ...summarize(deathCounts)],
    reference: [] as ReturnType<typeof summarize>[],
    candidate: [] as ReturnType<typeof summarize>[],
    eager: [] as ReturnType<typeof summarize>[],
    copy: [] as ReturnType<typeof summarize>[],
    deathParity: {
      matched: false,
      probes: deathCounts.death!.probes.length,
      digest: fingerprint(deathCounts.death),
    },
    cpu5PhaseParity: [] as { name: string; start: string[]; end: string[] }[][],
  };
  const differences = (a: (typeof counts.phases)[number]['capture'], b: typeof a) => {
    const result: string[] = [];
    const differs = (x: unknown, y: unknown) => JSON.stringify(x) !== JSON.stringify(y);
    if (differs(a.camera, b.camera)) result.push('camera');
    if (differs(a.boxes, b.boxes)) result.push('corpse boxes');
    for (const [i, actor] of a.actors.entries()) {
      const other = b.actors[i];
      const fields = (
        ['id', 'enabled', 'alive', 'position', 'pose', 'blocked', 'feet'] as const
      ).filter((key) => differs(actor[key], other[key]));
      if (fields.length)
        result.push(
          `${actor.id} (${actor.alive ? 'alive' : 'dead'}, ${actor.enabled ? 'drawn' : 'disabled'}): ${fields.join(', ')}`,
        );
    }
    return result;
  };
  if (reference) {
    const baseline = await replay(reference, true, 'living');
    const death = await replay(reference, true, 'death');
    for (const key of ['warm', 'handoffs', 'entry', 'firstSettled', 'probes'] as const)
      assert.equal(
        fingerprint(death.death![key]),
        fingerprint(deathCounts.death![key]),
        `unmatched death checkpoint: ${key}`,
      );
    report.deathParity.matched = true;
    report.reference.push([...summarize(baseline), ...summarize(death)]);
  }
  for (let i = 0; i < 3; i++) {
    const normal = await replay(candidate, false, 'living');
    const death = await replay(candidate, false, 'death');
    assert.equal(fingerprint(death.death), report.deathParity.digest);
    report.candidate.push([...summarize(normal), ...summarize(death)]);
    for (const variant of (i % 2 ? ['copy', 'eager'] : ['eager', 'copy']) as ('copy' | 'eager')[]) {
      const control = await replay(candidate, false, 'living', variant);
      assert.deepEqual(
        normal.phases.map(({ capture, end }) => [capture, end]),
        control.phases.map(({ capture, end }) => [capture, end]),
      );
      report[variant].push(summarize(control));
    }
    if (reference) {
      const a = await replay(reference, false, 'living');
      const baselineDeath = await replay(reference, false, 'death');
      assert.equal(fingerprint(baselineDeath.death), report.deathParity.digest);
      report.reference.push([...summarize(a), ...summarize(baselineDeath)]);
      report.cpu5PhaseParity.push(
        a.phases.map((phase, i) => ({
          name: phase.name,
          start: differences(phase.capture, normal.phases[i].capture),
          end: differences(phase.end, normal.phases[i].end),
        })),
      );
    }
  }
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/cpu6a-geometry.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
