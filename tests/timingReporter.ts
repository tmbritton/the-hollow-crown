import type { TestEvent } from 'node:test/reporters';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative } from 'node:path';
import { inspect } from 'node:util';

interface Timing {
  name: string;
  file?: string;
  line?: number;
  nesting: number;
  durationMs: number;
  passed: boolean;
}

/** Native test reporting only: selection, isolation and failure exit status stay with Node. */
export default async function* timingReporter(source: AsyncIterable<TestEvent>) {
  const tests: Timing[] = [];
  const summaries: Extract<TestEvent, { type: 'test:summary' }>['data'][] = [];
  for await (const event of source) {
    if (event.type === 'test:pass' || event.type === 'test:fail') {
      const data = event.data;
      tests.push({
        name: data.name,
        file: data.file && relative(process.cwd(), data.file),
        line: data.line,
        nesting: data.nesting,
        durationMs: data.details.duration_ms,
        passed: event.type === 'test:pass',
      });
      if (event.type === 'test:fail')
        yield `FAIL ${data.name}\n${inspect(event.data.details.error)}\n`;
    } else if (event.type === 'test:summary') {
      const data = event.data;
      summaries.push({ ...data, file: data.file && relative(process.cwd(), data.file) });
      if (data.file)
        yield `${data.success ? 'PASS' : 'FAIL'} ${relative(process.cwd(), data.file)} (${(data.duration_ms / 1000).toFixed(2)}s)\n`;
    }
  }
  tests.sort((a, b) => b.durationMs - a.durationMs);
  const fileTotals = new Map<string, number>();
  for (const test of tests)
    if (test.file && test.nesting === 0)
      fileTotals.set(test.file, (fileTotals.get(test.file) ?? 0) + test.durationMs);
  const files = [...fileTotals]
    .map(([file, durationMs]) => ({ file, durationMs }))
    .sort((a, b) => b.durationMs - a.durationMs);
  const output = process.env.TEST_TIMING_FILE ?? 'test-results/test-timings.json';
  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    JSON.stringify({ node: process.version, summaries, files, tests }, null, 2),
  );
  const total = summaries.filter((summary) => !summary.file).at(-1);
  if (total)
    yield `\n${total.success ? 'PASS' : 'FAIL'} ${total.counts.passed}/${total.counts.tests} tests passed; ${(total.duration_ms / 1000).toFixed(2)}s elapsed\n`;
  yield '\nSlowest tests (overlapping durations are not additive wall time):\n';
  for (const test of tests.slice(0, 10))
    yield `${(test.durationMs / 1000).toFixed(2)}s  ${test.file}:${test.line}  ${test.name}\n`;
  yield `\nTiming report: ${output}\n`;
}
