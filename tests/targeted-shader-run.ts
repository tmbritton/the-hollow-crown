import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cpus, release, totalmem } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { chromium } from '@playwright/test';
import { recipe } from '../src/encounterRecipe.ts';
import { arms, artifacts, baseline, buildArms, hash, json, put } from './targeted-shader-arms.ts';
import {
  pairOrderIssue,
  startDifferences,
  summarizeFrames,
  targetedDecision,
  targetedPairIssue,
  targetedSeparation,
  type Visit,
} from './encounter-report.ts';
import { sha256, sourceManifest, validateSourceArchive } from './encounter-source.ts';
import { prevalidateNative } from './encounter-trace-archive.ts';
import { deadline, withTrialPage, type TrialPageEvidence } from './targeted-shader-page.ts';
import { withViteServer } from './testServer.ts';
import './browserTypes.ts';

const [, , command, directory] = process.argv;
assert.ok(
  directory && ['freeze', 'preflight', 'run'].includes(command ?? ''),
  'usage: targeted-shader-run.ts freeze|preflight|run NEW_OUTPUT',
);
const output = resolve(directory);
assert.ok(output.startsWith(artifacts + sep), 'Output must be under ignored encounter results');
const base = 'http://127.0.0.1:5484';
const args = ['--no-sandbox', '--ignore-gpu-blocklist', '--ozone-platform=wayland'];
const lock = () =>
  execFileSync(
    'qdbus',
    ['org.freedesktop.ScreenSaver', '/ScreenSaver', 'org.freedesktop.ScreenSaver.GetActive'],
    { encoding: 'utf8', timeout: 3000 },
  ).trim();
const unlocked = () => assert.equal(lock(), 'false', 'Desktop not explicitly unlocked');
const primary = { name: 'reduced', quality: 'low', mode: 'off' } as const;
const cells = [
  primary,
  ...(['door', 'full', 'reduced'] as const).flatMap((name) =>
    (['low', 'high'] as const).flatMap((quality) =>
      (['off', 'coarse', 'detailed'] as const).map((mode) => ({ name, quality, mode })),
    ),
  ),
].filter(
  (c, i) =>
    !i || !(c.name === primary.name && c.quality === primary.quality && c.mode === primary.mode),
);
const schedule = cells.map((cell) => ({
  cell,
  key: `${cell.name}-${cell.quality}-${cell.mode}`,
  pairs: [1, 2, 3].flatMap((repeat) =>
    (['parent', 'frozen'] as const).map(
      (reference) =>
        ({
          repeat,
          reference,
          order:
            repeat === 2
              ? (['candidate', reference] as const)
              : ([reference, 'candidate'] as const),
        }) as const,
    ),
  ),
}));
const runnerPaths = [
  'tests/targeted-shader-run.ts',
  'tests/targeted-shader-arms.ts',
  'tests/targeted-shader-browser.ts',
  'tests/targeted-shader-page.ts',
  'tests/targeted-shader-teardown-browser.ts',
  'tests/encounter-report.ts',
  'tests/encounter-trace-archive.ts',
  'tests/encounter-source.ts',
  'tests/testServer.ts',
  'src/encounterRecipe.ts',
  'package-lock.json',
];
const historical = await json<Visit>(join(baseline, 'reduced-low-off-1.json'));
const host = historical.host as Record<string, unknown>;
const browserExpected = historical.graphics!;
const environment = {
  host,
  args,
  graphics: browserExpected,
  viewport: { width: 800, height: 450 },
  scale: 1,
};
const contract = {
  environment,
  schedule,
  sides: 216,
  seed: recipe.seed,
  warmup: 489,
  startupCap: 100,
  medianFloor: 8,
  ordinary:
    'fresh default High, non-debug seeded navigation; real W; first displacement to next RAF',
  reset:
    'fresh debug High navigation, quality selection, regenerate; native v4 parity and pair terminal equality',
  teardown:
    'after endpoints, navigate each app page to a same-origin landing; require a durable trusted terminal hide then hidden event, no journal or external errors, and context close',
  stop: 'Stop on first valid startup cap or sign failure; no controls unless primary passes. Stop on door sign failure or repeatable secondary regression. Invalid pair incomplete; one manual globally documented replacement in original order at most. No automatic retries.',
};
const hashes = async () =>
  Object.fromEntries(await Promise.all(runnerPaths.map(async (p) => [p, await hash(p)])));
const registrationPath = join(output, 'CPU_TRIAL.json');
if (command === 'freeze') {
  const sources = await buildArms(output);
  await put(registrationPath, {
    contract,
    sources,
    runner: await hashes(),
    overlay: await hash(join(output, 'overlay.json')),
    signatures: await hash(join(output, 'signatures.json')),
  });
  console.log(registrationPath, await hash(registrationPath));
  process.exit(0);
}
const registration = await json<{
  contract: typeof contract;
  sources: Record<(typeof arms)[number], string>;
  runner: Record<string, string>;
  overlay: string;
  signatures: string;
}>(registrationPath);
const registrationHash = await hash(registrationPath);
assert.deepEqual(registration.contract, contract);
assert.equal(registration.overlay, await hash(join(output, 'overlay.json')));
assert.equal(registration.signatures, await hash(join(output, 'signatures.json')));
assert.deepEqual(registration.runner, await hashes());
const fresh = async (arm: (typeof arms)[number]) => {
  const root = join(output, arm);
  assert.equal(await hash(registrationPath), registrationHash);
  assert.deepEqual(registration.runner, await hashes());
  assert.equal((await sourceManifest(undefined, root)).digest, registration.sources[arm]);
};
const owned = async <T>(arm: (typeof arms)[number], visit: () => Promise<T>) => {
  const root = join(output, arm),
    nonce = randomUUID();
  return withViteServer(
    base,
    'dev',
    async () => {
      assert.deepEqual(
        await (
          await fetch(`${base}/__encounter-root`, { signal: AbortSignal.timeout(4000) })
        ).json(),
        { nonce, root, cwd: root },
      );
      return visit();
    },
    true,
    { root, nonce },
  );
};
const setup = {
  lock: lock(),
  node: process.version,
  os: `${process.platform} ${release()}`,
  cpu: cpus()[0]?.model,
  logicalCpus: cpus().length,
  ram: totalmem(),
  session: process.env.XDG_SESSION_TYPE,
};
for (const arm of arms) {
  await fresh(arm);
  const archive = join(output, `source-${arm}`);
  const source = await json<Awaited<ReturnType<typeof sourceManifest>>>(
    join(archive, 'source.json'),
  );
  assert.equal(source.digest, registration.sources[arm]);
  assert.ok(await validateSourceArchive(archive, source, join(output, arm)));
  if (command === 'preflight')
    await owned(arm, async () => {
      assert.match(await (await fetch(base)).text(), /<canvas/);
    });
}
if (command === 'preflight') {
  const result = {
    setup,
    registrationHash,
    checked: ['source archives', 'runner', 'owned strict-port roots'],
    hardware: setup.lock === 'false' ? 'not launched in offline preflight' : 'blocked by lock',
  };
  await put(join(output, 'preflight.json'), result);
  console.log(result);
  process.exit(0);
}
unlocked();
for (const key of ['node', 'os', 'cpu', 'logicalCpus', 'ram', 'session'] as const)
  assert.equal(setup[key], host[key]);
assert.ok(process.env.WAYLAND_DISPLAY);
// Requires a passing, untimed audit generated against this exact candidate root.
const audit = await json<{
  hardware: boolean;
  root: string;
  source: string;
  result: { missingScale: string[]; errors: string[] }[];
}>(join(output, 'hardware-audit.json'));
assert.equal(audit.root, join(output, 'candidate'));
assert.equal(audit.source, registration.sources.candidate);
assert.ok(
  audit.hardware &&
    audit.result.length === 4 &&
    audit.result.every((r) => !r.missingScale.length && !r.errors.length),
);
await put(join(output, 'run-start.json'), {
  registrationHash,
  audit: await hash(join(output, 'hardware-audit.json')),
  time: new Date().toISOString(),
  setup,
});

type Load = {
  generation: number;
  begin: number;
  applied: number;
  playable: number;
  quality: 'low' | 'high';
  width: number;
  height: number;
  preparations: number;
};
type Motion = {
  generation: number;
  entry: number;
  successor: number;
  work: number;
  dx: number;
  dz: number;
};
type Cell = (typeof cells)[number];
async function collect(
  arm: (typeof arms)[number],
  cell: Cell,
  repeat: number,
  id: string,
  key: string,
) {
  unlocked();
  await fresh(arm);
  const file = join(output, `${id}-${arm}.json`);
  const reference = await json<Visit>(join(baseline, `${key}-${repeat}.json`));
  const start = Date.now();
  const teardown: TrialPageEvidence[] = [];
  const partial: Record<string, unknown> = {};
  try {
    const result = await owned(arm, async () => {
      const browser = await chromium.launch({ headless: false, args, timeout: 12000 });
      const watch = (
        label: string,
        run: (page: import('@playwright/test').Page) => Promise<void>,
      ) => {
        const evidence: TrialPageEvidence = { label, errors: [] };
        teardown.push(evidence);
        return withTrialPage(
          browser,
          base,
          {
            viewport: environment.viewport,
            deviceScaleFactor: environment.scale,
          },
          evidence,
          run,
        );
      };
      try {
        assert.equal(browser.version(), browserExpected.browserVersion);
        const session = await browser.newBrowserCDPSession();
        const gpuSystem = (await deadline(session.send('SystemInfo.getInfo'), 6000)).gpu;
        await session.detach();
        assert.deepEqual(
          gpuSystem.devices,
          (browserExpected.gpuSystem as { devices: unknown }).devices,
        );
        const ready = () => performance.getEntriesByName('shader-trial:playable').length > 0;
        const layout = (load: Load, quality: Cell['quality'], generation: number) => {
          const size = quality === 'high' ? [799, 449] : [533, 300];
          assert.deepEqual(
            [load.generation, load.quality, load.width, load.height, load.preparations],
            [generation, quality, ...size, Number(arm === 'candidate')],
          );
          assert.ok(
            [load.begin, load.applied, load.playable].every(Number.isFinite) &&
              load.begin <= load.applied &&
              load.applied <= load.playable,
          );
        };
        const focused = (page: import('@playwright/test').Page) =>
          page.evaluate(
            () =>
              document.hasFocus() &&
              !document.hidden &&
              !performance.getEntriesByName('shader-trial:lost-focus').length,
          );
        const loadsOf = (page: import('@playwright/test').Page): Promise<Load[]> =>
          page.evaluate(() =>
            performance
              .getEntriesByName('shader-trial:playable')
              .map((x) => (x as PerformanceMark).detail),
          );
        let ordinary!: Load;
        let motion!: Motion;
        await watch('ordinary', async (page) => {
          await page.goto(`${base}/?shader-trial&seed=${recipe.seed}`, { waitUntil: 'commit' });
          await page.waitForFunction(ready, null, { timeout: 45000 });
          assert.ok(await focused(page));
          assert.ok(await page.evaluate(() => !window.__dungeon));
          await page.keyboard.down('KeyW');
          await page.waitForFunction(
            () => performance.getEntriesByName('shader-trial:motion').length === 1,
            null,
            { timeout: 8000 },
          );
          await page.keyboard.up('KeyW');
          motion = await page.evaluate(
            () =>
              (performance.getEntriesByName('shader-trial:motion')[0] as PerformanceMark).detail,
          );
          const loads = await loadsOf(page);
          assert.equal(loads.length, 1);
          ordinary = loads[0]!;
          layout(ordinary, 'high', 1);
          assert.ok(
            Number.isFinite(motion.successor) &&
              motion.successor > motion.entry &&
              motion.entry >= ordinary.playable &&
              !!(motion.dx || motion.dz),
          );
          assert.ok(await focused(page));
          Object.assign(partial, { ordinary, motion });
        });
        let payload!: {
          stats: ReturnType<typeof summarizeFrames>;
          visit: Visit;
          endpoints: number[];
          generations: number[];
          parity: string[];
          movement: {
            interval: number;
            nextGap: number | null;
            work: number;
            ticks: number;
            nextTicks: number;
            callback: number;
          };
        };
        await watch('R6', async (page) => {
          await page.goto(`${base}/?debug&shader-trial&seed=${recipe.seed}`, {
            waitUntil: 'commit',
          });
          await page.waitForFunction(() => window.__dungeon?.ready, null, { timeout: 45000 });
          assert.ok(await focused(page));
          const gl = await page.evaluate(() => ({
            ...window.__dungeon!.engine.getGlInfo(),
            webgl: window.__dungeon!.engine.webGLVersion,
            foreground: document.hasFocus() && !document.hidden,
          }));
          assert.deepEqual(
            [gl.renderer, gl.vendor, gl.webgl, gl.foreground],
            [browserExpected.renderer, browserExpected.vendor, 2, true],
          );
          const capture = await deadline(
            page.evaluate(async ({ name, quality, mode }) => {
              const select = document.querySelector<HTMLSelectElement>('#quality')!;
              select.value = quality;
              select.dispatchEvent(new Event('change'));
              return window.__dungeon!.encounter.run(name, mode);
            }, cell),
            recipe.deadlineMs + 5000,
          );
          const loads = await loadsOf(page);
          Object.assign(partial, { loads, capture });
          assert.equal(loads.length, 2);
          const [nav, reset] = loads as [Load, Load];
          layout(nav, 'high', 1);
          layout(reset, cell.quality, 2);
          assert.ok(await focused(page));
          assert.ok(
            await page.evaluate(
              () =>
                !window.__dungeon!.cpu.active &&
                !window.__dungeon!.game.combat.encounterAttack &&
                !window.__dungeon!.game.combat.encounterSquad,
            ),
          );
          const c = capture as typeof capture & {
            generation: number;
            displacement: { dx: number; dz: number; from: number; to: number; callback: number }[];
          };
          assert.equal(c.start?.state.detail?.authority.steps, 489);
          assert.deepEqual(c.start?.display, reference.capture?.start?.display);
          assert.ok(c.launch >= reset.playable && c.displacement.length === c.frames.length);
          c.displacement.forEach((d, i) =>
            assert.deepEqual([d.callback, d.from, d.to], [i, c.frames[i]!.from, c.frames[i]!.to]),
          );
          const i = c.displacement.findIndex((d) => d.dx !== 0 || d.dz !== 0);
          const a = c.frames[i],
            b = c.frames[i + 1],
            next = c.frames[i + 2];
          assert.ok(i >= 0 && a && b && b.entry > a.entry && a.phases.join() === 'approach');
          const visit: Visit = {
            ...cell,
            id: reference.id,
            repeat,
            sourceDigest: registration.sources[arm],
            recipeHash: sha256(JSON.stringify(recipe)),
            host,
            graphics: { ...gl, hardware: true, browserVersion: browser.version(), gpuSystem },
            capture,
          };
          const validated = prevalidateNative(reference, visit);
          payload = {
            stats: summarizeFrames(c.launch, c.frames),
            visit: JSON.parse(validated.bytes),
            endpoints: [ordinary.playable, nav.playable, reset.playable - reset.begin],
            generations: [ordinary.generation, motion.generation, reset.generation, c.generation],
            parity: [...validated.witness, ...validated.parity],
            movement: {
              callback: i,
              interval: b.entry - a.entry,
              nextGap: next ? next.entry - b.entry : null,
              work: a.work,
              ticks: a.to - a.from,
              nextTicks: b.to - b.from,
            },
          };
        });
        return { ...payload, ordinary, motion };
      } finally {
        await deadline(browser.close(), 6000);
      }
    });
    unlocked();
    await fresh(arm);
    const row = {
      arm,
      ...result,
      registrationHash,
      errors: teardown.flatMap((page) => page.errors),
      teardown,
      cleanup: true,
      stamp: { id, batch: `${id}-${arm}`, started: start, ended: Date.now() },
    };
    await put(file, row);
    return row;
  } catch (error) {
    await put(file, {
      arm,
      error: error instanceof Error ? error.stack : String(error),
      errors: teardown.flatMap((page) => page.errors),
      teardown,
      registrationHash,
      partial,
    });
    throw error;
  }
}

const rows: (Parameters<typeof targetedDecision>[0][number] & {
  cell: string;
  phases: Record<string, number[]>;
})[] = [];
const primaryRows = () => rows.filter((r) => r.cell === schedule[0]!.key);
let controls: Parameters<typeof targetedDecision>[1] = 'pending';
let stop: string | undefined;
try {
  for (const block of schedule) {
    if (block.cell !== primary && targetedDecision(primaryRows(), 'pending') !== 'controls') break;
    for (const step of block.pairs) {
      const id = `${block.key}-${step.reference}-${step.repeat}`;
      const sides = [];
      for (const arm of step.order)
        sides.push(await collect(arm, block.cell, step.repeat, id, block.key));
      const a = sides.find((r) => r.arm === step.reference)!;
      const b = sides.find((r) => r.arm === 'candidate')!;
      const terminal = (side: typeof a) => ({ ...side.visit.capture?.end, camera: undefined });
      const parity = startDifferences(terminal(a), terminal(b));
      const approach = [
        a.stats.phases.approach?.interval?.max,
        b.stats.phases.approach?.interval?.max,
      ];
      const issue =
        targetedPairIssue(a, b) ??
        pairOrderIssue(a.stamp, b.stamp, step.repeat) ??
        (parity.length ? `terminal: ${parity.join(', ')}` : null) ??
        (approach.every(Number.isFinite) ? null : 'missing approach');
      const phases = Object.fromEntries(
        [...new Set([...Object.keys(a.stats.phases), ...Object.keys(b.stats.phases)])].map(
          (phase) => [
            phase,
            [
              a.stats.phases[phase]?.interval?.max ?? -1,
              b.stats.phases[phase]?.interval?.max ?? -1,
            ],
          ],
        ),
      );
      const pair = {
        cell: block.key,
        reference: step.reference,
        repeat: step.repeat,
        issue,
        startup: b.endpoints.map((t, i) => t - a.endpoints[i]!),
        displacement: [a.movement.interval, b.movement.interval],
        approach: approach.map((v) => v ?? -1),
        ordinaryW: [a.motion.successor - a.motion.entry, b.motion.successor - b.motion.entry],
        phases,
      };
      rows.push(pair);
      await put(join(output, `${id}.json`), { ...pair, order: step.order, terminalParity: parity });
      if (issue) throw new Error(issue);
      if (block.cell.mode === 'off') {
        if (pair.startup.some((delta) => delta > 100)) stop = `${id}: startup cap`;
        if (
          (block.cell === primary ||
            (block.cell.name === 'door' && block.cell.quality === 'low')) &&
          pair.displacement[0]! <= pair.displacement[1]!
        )
          stop ??= `${id}: displacement sign`;
        if (block.cell === primary && pair.approach[0]! <= pair.approach[1]!)
          stop ??= `${id}: approach sign`;
      }
      if (stop) break;
    }
    if (stop) break;
    if (block.cell.mode === 'off') {
      const group = rows.filter((r) => r.cell === block.key);
      for (const ref of ['parent', 'frozen']) {
        const matches = group.filter((r) => r.reference === ref);
        for (const phase of Object.keys(matches[0]?.phases ?? {})) {
          const values = matches.map((r) => r.phases[phase] ?? []);
          if (
            values.every((v) => v.length === 2 && v.every((x) => x > 0)) &&
            targetedSeparation(
              values.map((v) => [...v].reverse()),
              0,
            )
          )
            stop ??= `${block.key}: ${ref} ${phase} regression`;
        }
        if (
          targetedSeparation(
            matches.map((r) => [...r.ordinaryW].reverse()),
            0,
          )
        )
          stop ??= `${block.key}: ${ref} displaced W regression`;
      }
    }
    if (stop) break;
  }
  if (rows.length === 108 && !stop) controls = 'pass';
} catch (error) {
  controls = 'incomplete';
  await put(join(output, 'invalid.json'), {
    error: error instanceof Error ? error.stack : String(error),
    completed: rows.length,
    action: 'Stop; no automatic replacement',
  });
  throw error;
} finally {
  const report = {
    registrationHash,
    rows,
    stop,
    verdict: stop
      ? 'reject'
      : targetedDecision(primaryRows(), controls === 'pending' ? 'incomplete' : controls),
  };
  await put(join(output, 'report.json'), report);
  console.log(report.verdict, stop ?? '');
}
