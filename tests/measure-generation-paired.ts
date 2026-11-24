import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { cpus, hostname, loadavg, release } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  candidateLock,
  ef0Lock,
  ef0Revision,
  framedDigest,
  historicalNative,
  historicalTiming,
  captureEnvironment,
} from './ef0-contract.ts';
import {
  dependencyHash,
  digest,
  git,
  identifyArchive,
  materialize,
  newOutput,
  verifyCaptureEnvironment,
  verifyToolRoot,
  writeOnce,
} from './ef0-replay.ts';
import {
  activeDeadline,
  analyzeCandidate,
  buildSchedule,
  collect,
  cycles,
  hostLimits,
  orderSeed,
  parseArm,
  processDeadline,
  seeds,
  validateHostInterval,
  validateHostSample,
  validateArmTelemetry,
  validateBlockStart,
  warmCycles,
  type Hashes,
  type HostSample,
  type Label,
  type Schedule,
} from './generation-pair-analysis.ts';

const campaignName = 'ef4-final-latency';
const harness = 'tests/measure-generation-paired.ts';
const childTools = [
  harness,
  'tests/generation-pair-analysis.ts',
  'tests/ef0-contract.ts',
  'tests/ef0-replay.ts',
];
const tools = [...childTools, 'docs/ef4-results.md'];
const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const labels = ['A', 'B'] as const;
const locks = { A: ef0Lock, B: candidateLock };
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const read = (path: string) => readFileSync(path, 'utf8');
const save = (path: string, value: unknown) => writeOnce(path, json(value));
const cmd = (exe: string, ...args: string[]) =>
  execFileSync(exe, args, { encoding: 'utf8', timeout: 5000 }).trim();
const evidence = () => resolve('test-results', campaignName);
const artifact = (name: string) => join(evidence(), name);
const kitRoot = (label: Label) => artifact(label);
const toolHashes = () => Object.fromEntries(tools.map((path) => [path, digest(path)]));
const settings = {
  orderSeed,
  seeds,
  warmCycles,
  cycles,
  processDeadline,
  activeDeadline,
  hostLimits,
  historicalNative,
  historicalTiming,
};
const childEnv = { LANG: 'C', TZ: 'UTC' };

function verifyCandidate(revision: string) {
  verifyToolRoot(root);
  verifyCaptureEnvironment();
  assert.match(revision, /^[0-9a-f]{40}$/, 'Supply the full pushed checkpoint SHA');
  assert.notEqual(revision, ef0Revision, 'Checkpoint has not landed');
  assert.equal(git('rev-parse', 'HEAD'), revision, 'Check out the exact candidate on main');
  assert.equal(
    git('status', '--porcelain', '--untracked-files=all'),
    '',
    'Use a clean candidate checkout',
  );
  assert.equal(digest('package-lock.json'), candidateLock, 'Wrong candidate lock');
}

function power() {
  const base = '/sys/devices/system/cpu/cpufreq';
  const names = readdirSync(base)
    .filter((name) => /^policy\d+$/.test(name))
    .sort();
  assert.ok(names.length, 'Missing CPU governor telemetry');
  return {
    boot: read('/proc/sys/kernel/random/boot_id').trim(),
    boost: read(join(base, 'boost')).trim(),
    policies: names.map((name) => [
      name,
      ...['scaling_driver', 'scaling_governor', 'scaling_min_freq', 'scaling_max_freq'].map(
        (file) => read(join(base, name, file)).trim(),
      ),
    ]),
  };
}

function host() {
  const cpu = cpus().map(({ model }) => model);
  assert.ok(
    cpu.length === 12 && cpu.every((model) => model.includes('Ryzen 5 2600X')),
    'Use the original EF0 host CPU',
  );
  return {
    hostname: hostname(),
    kernel: release(),
    cpu,
    power: power(),
    node: process.version,
    binary: digest(process.execPath),
    npm: cmd('npm', '--version'),
  };
}

function sample(): HostSample & { power: ReturnType<typeof power> } {
  const cpu = read('/proc/stat').split('\n')[0].trim().split(/\s+/).slice(1, 9).map(Number);
  const runnable = Number(read('/proc/loadavg').split(/\s+/)[3]?.split('/')[0]);
  const sensors = readdirSync('/sys/class/hwmon')
    .map((name) => join('/sys/class/hwmon', name))
    .filter((path) => read(join(path, 'name')).trim() === 'k10temp');
  const temps = sensors.flatMap((path) =>
    readdirSync(path)
      .filter((name) => /^temp\d+_input$/.test(name))
      .map((name) => Number.parseInt(read(join(path, name)), 10)),
  );
  const competitors = cmd('ps', '-eo', 'pid=,comm=,args=')
    .split('\n')
    .filter((line) => {
      const [, comm, args] = /^\s*\d+\s+(\S+)\s+(.*)$/.exec(line) ?? [];
      return (
        /^(?:chrome.*|chromium.*|firefox.*|brave.*|msedge.*|vite|tsc|oxlint|oxfmt|esbuild|cargo|rustc|make|gcc|clang|cc1|ninja|stress-ng|perf|Xvfb)$/.test(
          comm ?? '',
        ) ||
        /\b(?:vite|playwright|measure-generation\.ts|cpu-profile|check:full|run build)\b|--test\b/.test(
          args ?? '',
        )
      );
    })
    .map((line) => line.trim().split(/\s+/).slice(0, 2).join(' '));
  return {
    at: Date.now(),
    cpu,
    load: loadavg(),
    runnable,
    temperature: Math.max(...temps),
    competitors,
    power: power(),
  };
}

type Manifest = {
  format: 'ef4-final-v1';
  created: number;
  candidate: string;
  control: string;
  schedule: Schedule;
  tools: ReturnType<typeof toolHashes>;
  host: ReturnType<typeof host>;
  hashes: Hashes;
  dependencies: Hashes;
  locks: typeof locks;
  settings: typeof settings;
  command: string;
};
type Sample = ReturnType<typeof sample>;
type Start = {
  id: number;
  label: Label;
  pid: number;
  start: number;
  elapsedStart: number;
  command: string[];
  cwd: string;
  timeout: number;
};
type End = {
  end: number;
  elapsedEnd: number;
  code: number | null;
  signal: string | null;
  failure?: string;
};
type Attempt = { manifest: string; start: number; binary: string; nodePath: string };

export function claimAttempt(directory: string, attempt: Attempt) {
  // Atomic claim stays forever, even after a failure or interruption.
  save(join(directory, 'attempt.json'), attempt);
}

function inspect(revision: string) {
  const hashes = {} as Hashes;
  const dependencies = {} as Hashes;
  for (const label of labels) {
    const dir = kitRoot(label);
    const identity = identifyArchive(dir, label === 'A' ? ef0Revision : revision, locks[label]);
    hashes[label] = framedDigest(Object.entries(identity.hashes));
    dependencies[label] = dependencyHash(dir);
    for (const path of childTools)
      assert.equal(digest(join(dir, path)), digest(path), `Drift in arm ${label}: ${path}`);
  }
  return { hashes, dependencies };
}

function freeze(candidate: string) {
  verifyCandidate(candidate);
  assert.equal(cmd('npm', '--version'), captureEnvironment.npm, 'Use the pinned npm');
  const upstream = execFileSync('git', ['ls-remote', '--exit-code', 'origin', 'refs/heads/main'], {
    encoding: 'utf8',
    timeout: 30_000,
  }).trim();
  assert.equal(
    upstream,
    `${candidate}\trefs/heads/main`,
    'Push the checkpoint to origin/main before freezing',
  );
  const dest = newOutput(campaignName);
  for (const label of labels) {
    const identity = materialize(
      dest,
      label,
      label === 'A' ? ef0Revision : candidate,
      locks[label],
    );
    for (const path of childTools) {
      const tool = join(identity.root, path);
      if (existsSync(tool))
        assert.equal(digest(tool), digest(path), `Checkpoint tool differs: ${path}`);
      else writeFileSync(tool, readFileSync(path), { flag: 'wx' });
    }
  }
  const kits = inspect(candidate);
  const machine = host();
  const created = Date.now();
  const manifest: Manifest = {
    format: 'ef4-final-v1',
    candidate,
    control: ef0Revision,
    created,
    schedule: buildSchedule(created),
    tools: toolHashes(),
    host: machine,
    ...kits,
    locks,
    settings,
    command: 'git archive REV | tar -x -C ROOT; npm ci --ignore-scripts --offline',
  };
  save(artifact('manifest.json'), manifest);
  console.log(`Frozen; first block at ${new Date(manifest.schedule[0].start).toISOString()}`);
}

function loadManifest(): Manifest {
  const manifest: Manifest = JSON.parse(read(artifact('manifest.json')));
  assert.equal(manifest.format, 'ef4-final-v1');
  assert.equal(manifest.control, ef0Revision);
  assert.deepEqual(manifest.locks, locks);
  assert.deepEqual(manifest.settings, settings);
  assert.deepEqual(manifest.schedule, buildSchedule(manifest.created));
  assert.deepEqual(manifest.tools, toolHashes());
  validatePower(manifest.host.power);
  return manifest;
}

function verifyKits(manifest: Manifest) {
  assert.deepEqual(
    inspect(manifest.candidate),
    { hashes: manifest.hashes, dependencies: manifest.dependencies },
    'Changed source, tooling or dependencies',
  );
}

const argsFor = (id: number, label: Label, manifest: Manifest) => [
  harness,
  'child',
  String(id),
  label,
  manifest.hashes[label],
];
const armFile = (id: number, label: Label, suffix: string) => artifact(`${id}-${label}.${suffix}`);

async function child(id: number, label: Label, hash: string) {
  verifyCaptureEnvironment();
  assert.equal(realpathSync(process.cwd()), root);
  assert.match(root, new RegExp(`/test-results/${campaignName}/${label}$`));
  assert.equal(readFileSync(0, 'utf8'), 'start\n', 'Arm is not owned by the campaign');
  const manifest: Manifest = JSON.parse(read(join(root, '..', 'manifest.json')));
  const attempt: Attempt = JSON.parse(read(join(root, '..', 'attempt.json')));
  assert.equal(attempt.manifest, digest(join(root, '..', 'manifest.json')));
  assert.equal(hash, manifest.hashes[label]);
  const claim: Start = JSON.parse(read(join(root, '..', `${id}-${label}.start.json`)));
  assert.equal(claim.pid, process.pid, 'Arm is not owned by the campaign');
  const { generateDungeon } = await import('../src/world.ts');
  for (let i = 0; i < warmCycles; i++) for (const seed of seeds) generateDungeon(seed);
  console.log(JSON.stringify({ id, label, hash, seeds }));
  for (let i = 0; i < cycles; i++) {
    console.log(
      JSON.stringify(
        seeds.map((seed) => {
          const start = performance.now();
          generateDungeon(seed);
          return performance.now() - start;
        }),
      ),
    );
  }
}

function validateSample(current: Sample, manifest: Manifest, previous?: Sample) {
  validatePower(current.power);
  assert.deepEqual(current.power, manifest.host.power, 'CPU governor, boost or boot drift');
  if (previous) validateHostInterval(previous, current);
  else validateHostSample(current);
}

export function validatePower(value: ReturnType<typeof power> | undefined) {
  assert.ok(
    value &&
      /^[0-9a-f-]{36}$/.test(value.boot) &&
      /^(?:0|1)$/.test(value.boost) &&
      Array.isArray(value.policies) &&
      value.policies.length > 0 &&
      value.policies.every(
        (row) =>
          row.length === 5 &&
          /^policy\d+$/.test(row[0]) &&
          !!row[1] &&
          !!row[2] &&
          /^\d+$/.test(row[3]) &&
          /^\d+$/.test(row[4]) &&
          Number(row[4]) >= Number(row[3]),
      ),
    'Missing or invalid CPU power telemetry',
  );
}

async function launch(id: number, label: Label, timeout: number, manifest: Manifest) {
  const file = (suffix: string) => armFile(id, label, suffix);
  for (const suffix of ['stdout', 'stderr', 'telemetry.jsonl'])
    writeFileSync(file(suffix), '', { flag: 'wx' });
  let previous: Sample | undefined;
  const observe = () => {
    const current = sample();
    appendFileSync(file('telemetry.jsonl'), JSON.stringify(current) + '\n');
    validateSample(current, manifest, previous);
    previous = current;
  };
  observe();
  await wait(hostLimits.sampleMs);
  observe();
  const cwd = kitRoot(label);
  const args = argsFor(id, label, manifest);
  const slot = manifest.schedule[id - 1];
  timeout = Math.min(
    timeout < processDeadline ? timeout - hostLimits.maxGapMs : timeout,
    slot.end - Date.now() - hostLimits.maxGapMs,
  );
  assert.ok(timeout > 0, 'Insufficient time after quiet check');
  const start = Date.now();
  const elapsedStart = performance.now();
  const proc = spawn(process.execPath, args, {
    cwd,
    env: childEnv,
    timeout,
    killSignal: 'SIGKILL',
  });
  save(file('start.json'), {
    id,
    label,
    pid: proc.pid,
    start,
    elapsedStart,
    command: [process.execPath, ...args],
    cwd,
    timeout,
  } satisfies Omit<Start, 'pid'> & { pid?: number });
  let failure: string | undefined;
  proc.on('error', (error) => {
    failure = error.message;
  });
  proc.stdin.on('error', (error) => {
    failure = error.message;
  });
  proc.stdin.end('start\n');
  proc.stdout.on('data', (chunk: Buffer) => appendFileSync(file('stdout'), chunk));
  proc.stderr.on('data', (chunk: Buffer) => appendFileSync(file('stderr'), chunk));
  const monitor = setInterval(() => {
    try {
      observe();
    } catch (error) {
      failure = String(error);
      proc.kill('SIGKILL');
    }
  }, hostLimits.sampleMs);
  const exit = await new Promise<{ code: number | null; signal: string | null }>((done) =>
    proc.once('close', (code, signal) => done({ code, signal })),
  );
  clearInterval(monitor);
  const end = Date.now();
  const elapsedEnd = performance.now();
  try {
    observe();
  } catch (error) {
    failure ??= String(error);
  }
  save(file('end.json'), { end, elapsedEnd, ...exit, failure } satisfies End);
  return readArm(manifest, { nodePath: process.execPath }, id, label).arm;
}

function readArm(manifest: Manifest, attempt: Pick<Attempt, 'nodePath'>, id: number, label: Label) {
  const file = (suffix: string) => armFile(id, label, suffix);
  const start: Start = JSON.parse(read(file('start.json')));
  const end: End = JSON.parse(read(file('end.json')));
  const slot = manifest.schedule[id - 1];
  assert.ok(
    start.id === id && start.label === label && Number.isSafeInteger(start.pid) && start.pid > 0,
    'Wrong process identity',
  );
  assert.deepEqual(
    start.command,
    [attempt.nodePath, ...argsFor(id, label, manifest)],
    'Wrong arm command',
  );
  assert.equal(start.cwd, kitRoot(label));
  assert.ok(
    Number.isSafeInteger(start.start) &&
      Number.isSafeInteger(end.end) &&
      start.start >= slot.start &&
      end.end < slot.end &&
      end.end > start.start,
    'Arm outside frozen window',
  );
  assert.ok(
    Number.isSafeInteger(start.timeout) &&
      start.timeout > 0 &&
      start.timeout <= processDeadline &&
      Number.isFinite(start.elapsedStart) &&
      end.elapsedEnd > start.elapsedStart &&
      end.elapsedEnd - start.elapsedStart <= start.timeout,
    'Bad elapsed time',
  );
  assert.ok(
    end.code === 0 && end.signal === null && !end.failure && !read(file('stderr')),
    end.failure ?? 'Invalid arm exit',
  );
  const lines = read(file('telemetry.jsonl')).split('\n');
  assert.equal(lines.pop(), '', 'Truncated telemetry');
  const samples: Sample[] = lines.map((line) => JSON.parse(line));
  validateArmTelemetry(samples, slot.start, start.start, end.end);
  for (const value of samples) validateSample(value, manifest);
  const transcript = read(file('stdout')).split('\n');
  assert.ok(
    transcript.pop() === '' && transcript.length === cycles + 1,
    'Truncated arm transcript',
  );
  const arm = parseArm(
    JSON.stringify({
      ...JSON.parse(transcript[0]),
      samples: transcript.slice(1).map((row) => JSON.parse(row)),
    }),
  );
  return { start, end, samples, arm };
}

function archivedReport(manifest: Manifest) {
  assert.ok(!existsSync(artifact('stop.json')), 'Stopped campaign');
  const attempt: Attempt = JSON.parse(read(artifact('attempt.json')));
  assert.equal(attempt.manifest, digest(artifact('manifest.json')), 'Wrong attempt manifest');
  assert.equal(attempt.binary, manifest.host.binary, 'Wrong attempt Node binary');
  assert.equal(digest(attempt.nodePath), attempt.binary, 'Recorded Node binary changed');
  assert.ok(
    Number.isSafeInteger(attempt.start) &&
      attempt.start >= manifest.created &&
      attempt.start < manifest.schedule[0].start,
    'Wrong attempt time',
  );
  const pids = new Set<number>();
  let active = 0;
  let previous: { start: number; elapsedStart: number } | undefined;
  const blocks = manifest.schedule.map(({ id, order }) => {
    const bounds: { start: number; end: number; elapsedStart: number; elapsedEnd: number } =
      JSON.parse(read(artifact(`${id}-block.json`)));
    validateBlockStart(manifest.schedule[id - 1], bounds.start);
    const pair = [...order].map((label) => readArm(manifest, attempt, id, label as Label));
    assert.ok(
      bounds.end < manifest.schedule[id - 1].end &&
        bounds.start <= pair[0].samples[0].at &&
        pair[0].samples.at(-1)!.at <= pair[1].samples[0].at &&
        pair[1].samples.at(-1)!.at <= bounds.end &&
        Number.isFinite(bounds.elapsedStart) &&
        Number.isFinite(bounds.elapsedEnd) &&
        bounds.elapsedStart <= pair[0].start.elapsedStart &&
        pair[0].end.elapsedEnd <= pair[1].start.elapsedStart &&
        pair[1].end.elapsedEnd <= bounds.elapsedEnd,
      'Overlapping arms or invalid block timing',
    );
    active += bounds.elapsedEnd - bounds.elapsedStart;
    if (previous)
      assert.ok(
        Math.abs(bounds.start - previous.start - (bounds.elapsedStart - previous.elapsedStart)) <
          1000,
        'Wall and monotonic clocks drifted between blocks',
      );
    previous = bounds;
    for (const arm of pair) {
      assert.ok(!pids.has(arm.start.pid), 'Reused process identity');
      pids.add(arm.start.pid);
    }
    return pair.map(({ arm }) => arm);
  });
  assert.ok(active < activeDeadline, 'Active deadline exceeded');
  return analyzeCandidate(manifest.schedule, manifest.hashes, historicalTiming, blocks);
}

async function campaign() {
  const manifest = loadManifest();
  verifyCandidate(manifest.candidate);
  claimAttempt(evidence(), {
    manifest: digest(artifact('manifest.json')),
    start: Date.now(),
    binary: digest(process.execPath),
    nodePath: process.execPath,
  } satisfies Attempt);
  try {
    assert.ok(Date.now() < manifest.schedule[0].start, 'Missed first slot');
    assert.deepEqual(host(), manifest.host, 'Host drift');
    verifyKits(manifest);
    let start = { start: 0, elapsedStart: 0 };
    const result = await collect(manifest.schedule, manifest.hashes, {
      now: Date.now,
      elapsed: () => performance.now(),
      waitUntil: async (at) => {
        while (Date.now() < at) await wait(Math.min(60_000, at - Date.now()));
      },
      prepare: () => {},
      observe: (id, boundary) => {
        if (boundary === 'start') {
          start = { start: Date.now(), elapsedStart: performance.now() };
          validateBlockStart(manifest.schedule[id - 1], start.start);
        } else
          save(artifact(`${id}-block.json`), {
            ...start,
            end: Date.now(),
            elapsedEnd: performance.now(),
          });
      },
      launch: (id, label, timeout) => launch(id, label, timeout, manifest),
      stop: () => {},
    });
    assert.ok(
      result.state === 'complete',
      result.state === 'stopped' ? result.reason : 'Incomplete campaign',
    );
    verifyKits(manifest);
    save(artifact('report.json'), archivedReport(manifest));
  } catch (error) {
    save(artifact('stop.json'), { at: Date.now(), reason: String(error) });
    throw error;
  }
}

if (import.meta.main) {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'freeze' && args.length === 1) freeze(args[0]);
  else if (mode === 'collect' && args.length === 0) await campaign();
  else if (mode === 'replay' && args.length === 0) {
    const manifest = loadManifest();
    verifyCandidate(manifest.candidate);
    verifyKits(manifest);
    const report = archivedReport(manifest);
    assert.equal(json(report), read(artifact('report.json')), 'Replayed report differs');
    console.log(json(report).trimEnd());
  } else if (mode === 'child' && args.length === 3 && (args[1] === 'A' || args[1] === 'B'))
    await child(Number(args[0]), args[1], args[2]);
  else throw Error(`Usage: node ${harness} freeze CHECKPOINT_SHA | collect | replay`);
}
