import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { setup } from 'xstate';
import { modelCases } from './models/cases.ts';
import { modelCase } from './models/coverage.ts';
import type { CoverageReport } from './models/coverage.ts';
import { workModel } from './models/work.ts';

const reports: CoverageReport[] = [];
const extendedReports: CoverageReport[] = [];
let coreStarted = false;
let extendedStarted = false;
for (const specification of modelCases) {
  test(`model coverage and invariants: ${specification.id}`, (t) => {
    coreStarted = true;
    const report = specification.run();
    reports.push(report);
    t.diagnostic(
      `${report.states.length}/${report.declaredStates} states, ${report.transitions}/${report.declaredTransitions} branches; ${report.generatedPaths} generated paths and ${report.cyclicSteps} cyclic steps`,
    );
  });
}

test('[extended] objectiveWork replays every 60 Hz integer and decimal boundary path', (t) => {
  extendedStarted = true;
  const report = workModel(true).run();
  extendedReports.push(report);
  t.diagnostic(`${report.generatedPaths} every-tick paths; ${report.cyclicSteps} cyclic steps`);
});

test('every exported production machine has a model-based specification', async () => {
  const discovered = new Set<string>();
  const visit = async (directory: URL): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) await visit(path);
      else if (entry.name.endsWith('.ts')) {
        const exports = (await import(path.href)) as Record<string, unknown>;
        for (const value of Object.values(exports)) {
          if (
            value &&
            typeof value === 'object' &&
            'id' in value &&
            typeof value.id === 'string' &&
            'getInitialSnapshot' in value &&
            'transition' in value
          )
            discovered.add(value.id);
        }
      }
    }
  };
  await visit(new URL('../src/machines/', import.meta.url));
  assert.deepEqual([...discovered].sort(), modelCases.map((model) => model.id).sort());
});

test('model coverage rejects an unreachable declared state instead of silently skipping it', () => {
  const broken = setup({ types: { events: {} as { type: 'GO' } } }).createMachine({
    id: 'unreachable-fixture',
    initial: 'idle',
    states: { idle: {}, unreachable: {} },
  });
  assert.throws(
    () =>
      modelCase(broken, {
        inputs: [undefined],
        events: () => [{ type: 'GO' as const }],
        invariant: () => {},
      }).run(),
    /unreachable declared states/,
  );
});

test('model coverage rejects an unexercised guard branch even when every state is reachable', () => {
  const broken = setup({ types: { events: {} as { type: 'GO' } } }).createMachine({
    id: 'uncovered-branch-fixture',
    initial: 'idle',
    states: {
      idle: { on: { GO: [{ guard: () => false, target: 'done' }, { target: 'done' }] } },
      done: {},
    },
  });
  assert.throws(
    () =>
      modelCase(broken, {
        inputs: [undefined],
        events: () => [{ type: 'GO' as const }],
        invariant: () => {},
      }).run(),
    /uncovered declared transition branches/,
  );
});

after(async () => {
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  // An extended-only invocation must not overwrite the complete everyday machine report.
  if (coreStarted)
    await writeFile(
      new URL('../test-results/machine-model-report.json', import.meta.url),
      JSON.stringify(
        { complete: reports.length === modelCases.length, machines: reports },
        null,
        2,
      ),
    );
  if (extendedStarted)
    await writeFile(
      new URL('../test-results/machine-model-extended-report.json', import.meta.url),
      JSON.stringify(
        { complete: extendedReports.length === 1, machines: extendedReports },
        null,
        2,
      ),
    );
});
