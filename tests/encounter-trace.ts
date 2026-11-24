export interface MotionFrame {
  callback: number;
  from: number;
  to: number;
  dx: number;
  dz: number;
  phases: readonly string[];
}

export interface TraceEvent {
  cat?: string;
  name: string;
  ph: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  id?: string | number;
  id2?: { local?: string; global?: string };
  args?: Record<string, unknown>;
}

export function parseTrace(json: string): TraceEvent[] {
  // CDP emits decimal uint64 frame IDs as JSON numbers. Preserve the original lexemes
  // rather than joining IDs made equal by rounding to a JS double (Node 22+ reviver context).
  const raw: { traceEvents?: TraceEvent[] } = JSON.parse(
    json,
    (_key, value: unknown, context?: { source?: string }) =>
      typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)
        ? context?.source
        : value,
  );
  if (!Array.isArray(raw.traceEvents)) throw new Error('Missing trace events');
  return raw.traceEvents;
}

export function selectWindows(frames: readonly MotionFrame[], edges: readonly number[]) {
  if (
    frames.some(
      (frame, index) =>
        frame.callback !== index ||
        !Number.isFinite(frame.dx) ||
        !Number.isFinite(frame.dz) ||
        (index > 0 && frames[index - 1]?.to !== frame.from) ||
        frame.to < frame.from,
    )
  )
    throw new Error('Invalid motion witness');
  const moving = (frame: MotionFrame) =>
    frame.to > frame.from && (frame.dx !== 0 || frame.dz !== 0);
  const first = frames.find(moving);
  if (!first || first.phases.join() !== 'approach') throw new Error('Missing pure first movement');
  const steady = frames.slice(first.callback + 1).find(moving);
  if (
    !steady ||
    steady.phases.join() !== 'approach' ||
    edges.some((tick) => tick > first.to && tick <= steady.to) ||
    frames.slice(first.callback + 1, steady.callback).some((f) => f.phases.join() !== 'approach')
  )
    throw new Error('Missing unchanged-input steady neighbor');
  return { first: first.callback, steady: steady.callback, historical: 2 };
}

export function alignMarks(events: readonly TraceEvent[], visit: string, callback: number) {
  const get = (index: number, tag: string) => {
    const name = `encounter-trace:${visit}:${index}:${tag}`;
    const matches = events.filter(
      (event) =>
        event.name === name &&
        event.cat?.split(',').includes('blink.user_timing') &&
        ['I', 'i', 'R'].includes(event.ph),
    );
    if (matches.length !== 1) throw new Error(`${name}: missing or ambiguous mark`);
    return matches[0]!;
  };
  const entry = get(callback, 'entry');
  const submit = get(callback, 'submit');
  const submitted = get(callback, 'submitted');
  const exit = get(callback, 'exit');
  const next = get(callback + 1, 'entry');
  const marks = [entry, submit, submitted, exit, next];
  if (
    marks.some(
      (m, i) =>
        m.pid !== entry.pid ||
        m.tid !== entry.tid ||
        !Number.isFinite(m.ts) ||
        (i > 0 && m.ts <= marks[i - 1]!.ts),
    )
  )
    throw new Error('Invalid mark order or renderer clock');
  return {
    pid: entry.pid,
    tid: entry.tid,
    entry: entry.ts,
    submit: submit.ts,
    submitted: submitted.ts,
    exit: exit.ts,
    next: next.ts,
  };
}

type Evidence =
  | { kind: 'sample'; hasStack: boolean }
  | { kind: 'gpu-lane' | 'driver-wait' }
  | { kind: 'device'; linked: boolean; deviceClock: boolean };

export function classifyEvidence(event: Evidence) {
  switch (event.kind) {
    case 'sample':
      return event.hasStack ? 'js' : 'unknown';
    case 'gpu-lane':
      return 'gpu-process-cpu';
    case 'driver-wait':
      return 'driver-wait-cpu';
    case 'device':
      return event.linked && event.deviceClock ? 'device' : 'unknown';
  }
}

export function traceIssues(v: {
  eof: boolean;
  loss: boolean;
  samples: boolean;
  tracks: boolean;
  source: boolean;
  parity: boolean;
  hardware: boolean;
  outcome: boolean;
}) {
  return [
    !v.eof && 'Stream did not reach EOF',
    v.loss && 'Trace data loss or buffer limit',
    !v.samples && 'Missing sampled application stacks',
    !v.tracks && 'Missing frame-linked cross-process compositor/GPU CPU evidence',
    !v.source && 'Source drift',
    !v.parity && 'R6 parity failed',
    !v.hardware && 'Not matched hardware',
    v.outcome && 'Tracing-only visit is ineligible as outcome',
  ].filter((value): value is string => typeof value === 'string');
}

const transitions = {
  ready: { preflight: ['recording', 'record'] },
  recording: { stop: ['draining', 'drain'] },
  draining: { eof: ['validating', 'validate'] },
  validating: { checks: ['archived', 'archive'] },
} as const;
type Active = keyof typeof transitions;
export type TraceState = Active | 'archived' | 'failed';
type TraceEventName = 'preflight' | 'stop' | 'eof' | 'checks' | 'failure' | 'timeout';

export function transitionTrace(state: TraceState, event: TraceEventName) {
  if (state !== 'archived' && state !== 'failed') {
    if (event === 'failure' || event === 'timeout')
      return { state: 'failed', effect: 'retain' } as const;
    const next = Object.entries(transitions[state]).find(([on]) => on === event)?.[1];
    if (next) return { state: next[0], effect: next[1] } as const;
  }
  throw new Error(`Invalid trace transition: ${state} + ${event}`);
}

interface CallFrame {
  functionName?: string;
  scriptId?: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
}
interface ProfileNode {
  id: number;
  parent?: number;
  callFrame: CallFrame;
}
interface ProfileData {
  startTime?: number;
  cpuProfile?: { nodes?: ProfileNode[]; samples?: number[] };
  timeDeltas?: number[];
}

export function decodeSamples(events: readonly TraceEvent[], pid: number, tid: number) {
  const profiles = new Map<string, TraceEvent[]>();
  for (const e of events) {
    if (e.pid !== pid || (e.name !== 'Profile' && e.name !== 'ProfileChunk')) continue;
    const id = e.id ?? e.id2?.local ?? e.id2?.global;
    if (id === undefined) throw new Error('Missing profile ID');
    const group = profiles.get(String(id)) ?? [];
    group.push(e);
    profiles.set(String(id), group);
  }
  const result: { ts: number; stack: CallFrame[] }[] = [];
  for (const group of profiles.values()) {
    const starts = group.filter((e) => e.name === 'Profile');
    if (starts.length && starts.every((e) => e.tid !== tid)) continue;
    const data = (e: TraceEvent) => e.args?.data as ProfileData | undefined;
    const start = starts[0] && data(starts[0])?.startTime;
    if (starts.length !== 1 || typeof start !== 'number' || !Number.isFinite(start))
      throw new Error('Missing or ambiguous profile clock');
    const chunks = group.filter((e) => e.name === 'ProfileChunk').sort((a, b) => a.ts - b.ts);
    const nodes = new Map(
      chunks.flatMap((e) => data(e)?.cpuProfile?.nodes ?? []).map((node) => [node.id, node]),
    );
    const stacks = new Map<number, CallFrame[]>();
    let ts = start;
    for (const e of chunks) {
      const chunk = data(e);
      const ids = chunk?.cpuProfile?.samples ?? [];
      const deltas = chunk?.timeDeltas ?? [];
      if (ids.length !== deltas.length || deltas.some((d) => !Number.isFinite(d)))
        throw new Error('Invalid profile deltas');
      for (const [i, id] of ids.entries()) {
        ts += deltas[i]!;
        let stack = stacks.get(id);
        if (!stack) {
          stack = [];
          let next: number | undefined = id;
          const seen = new Set<number>();
          while (next !== undefined) {
            const node: ProfileNode | undefined = nodes.get(next);
            if (!node || seen.has(next) || !node.callFrame)
              throw new Error('Invalid profile node graph');
            seen.add(next);
            stack.push(node.callFrame);
            next = node.parent;
          }
          stacks.set(id, stack);
        }
        result.push({ ts, stack });
      }
    }
  }
  return result.sort((a, b) => a.ts - b.ts);
}

type FrameWindow = { pid: number; tid: number; entry: number; exit: number };
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? Object.fromEntries(Object.entries(value)) : {};
const idOf = (value: unknown) =>
  typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value))
    ? String(value)
    : undefined;
const only = <T>(values: T[]) => (values.length === 1 ? values[0] : undefined);
const encloses = (outer: TraceEvent, start: number, end: number) =>
  outer.ph === 'X' && outer.ts <= start && outer.ts + (outer.dur ?? 0) >= end;

export function linkPresentedFrame(events: readonly TraceEvent[], window: FrameWindow) {
  const { pid, tid, entry, exit } = window;
  const pipeline = (e: TraceEvent) => record(e.args?.main_frame_pipeline);
  const main = only(
    events.filter(
      (e) =>
        e.name === 'ProxyMain::BeginMainFrame' &&
        e.pid === pid &&
        e.tid === tid &&
        encloses(e, entry, exit),
    ),
  );
  const mainId = main && idOf(pipeline(main).main_frame_id);
  if (!main || !mainId) return;
  const mainEvents = events.filter(
    (e) => e.pid === pid && idOf(pipeline(e).main_frame_id) === mainId,
  );
  const draw = only(mainEvents.filter((e) => e.name === 'MainFrame.Draw' && e.ts >= exit));
  const drawnFrame = record(draw && pipeline(draw).last_begin_frame_id_during_first_draw);
  const source = idOf(drawnFrame.source_id);
  const sequence = idOf(drawnFrame.sequence_number);
  const presentation =
    source && sequence && draw
      ? only(
          events.filter((e) => {
            const key = record(e.args?.begin_frame_id);
            return (
              e.name === 'AnimationFrame::Presentation' &&
              e.pid === pid &&
              e.tid === tid &&
              e.ts >= draw.ts &&
              idOf(key.source_id) === source &&
              idOf(key.sequence_number) === sequence
            );
          }),
        )
      : undefined;
  const graphics = events.filter((e) => e.name === 'Graphics.Pipeline' && e.ph === 'X');
  const data = (e: TraceEvent) => record(e.args?.chrome_graphics_pipeline);
  const generation =
    draw &&
    only(
      graphics.filter(
        (e) =>
          e.pid === draw.pid &&
          e.tid === draw.tid &&
          encloses(draw, e.ts, e.ts + (e.dur ?? 0)) &&
          data(e).step === 'STEP_GENERATE_COMPOSITOR_FRAME',
      ),
    );
  const surfaceId = generation && idOf(data(generation).surface_frame_trace_id);
  const surface = surfaceId
    ? graphics.filter(
        (e) => e.ts >= generation.ts && idOf(data(e).surface_frame_trace_id) === surfaceId,
      )
    : [];
  const aggregate =
    surfaceId &&
    only(
      graphics.filter((e) => {
        const ids = data(e).aggregated_surface_frame_trace_ids;
        return (
          e.ts >= generation.ts &&
          data(e).step === 'STEP_SURFACE_AGGREGATION' &&
          Array.isArray(ids) &&
          ids.some((id: unknown) => idOf(id) === surfaceId)
        );
      }),
    );
  const displayId = aggregate && idOf(data(aggregate).display_trace_id);
  const display = displayId
    ? graphics.filter((e) => e.ts >= aggregate.ts && idOf(data(e).display_trace_id) === displayId)
    : [];
  return { mainId, mainEvents, surfaceId, surface, aggregate, displayId, display, presentation };
}

export function hasCrossProcessFrame(
  frame: ReturnType<typeof linkPresentedFrame>,
  isGpu: (event: TraceEvent) => boolean,
) {
  return frameControlIssue(frame, isGpu) === null;
}

export function frameControlIssue(
  frame: ReturnType<typeof linkPresentedFrame>,
  isGpu: (event: TraceEvent) => boolean,
) {
  if (!frame) return 'No unique renderer main frame';
  if (!frame.surfaceId) return 'No renderer draw-to-surface join';
  const { aggregate, presentation } = frame;
  if (!aggregate || !frame.displayId) return 'No surface-to-Viz display aggregation join';
  if (!presentation) return 'No matching renderer presentation feedback';
  if (aggregate.pid === presentation.pid) return 'Viz aggregation is not cross-process';
  const swap = frame.display.some(
    (e) =>
      e.ts <= presentation.ts &&
      e.pid !== presentation.pid &&
      isGpu(e) &&
      record(e.args?.chrome_graphics_pipeline).step === 'STEP_FINISH_BUFFER_SWAP',
  );
  return swap ? null : 'No display-linked GPU process swap finish before presentation';
}

// Legacy trace flow phases. A shared timestamp or equal process-local IDs are not a join.
export function linkedFlows(
  events: readonly TraceEvent[],
  window: { pid: number; tid: number; entry: number; exit: number },
) {
  const groups = new Map<string, TraceEvent[]>();
  for (const e of events) {
    if (!['s', 't', 'f'].includes(e.ph) || e.id2?.local !== undefined) continue;
    const id = e.id2?.global ?? e.id;
    if (id === undefined) continue;
    const key = JSON.stringify([e.cat, e.name, id]);
    const group = groups.get(key) ?? [];
    group.push(e);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((group) => {
    const ordered = group.sort((a, b) => a.ts - b.ts);
    const start = ordered[0];
    return start?.ph === 's' &&
      ordered.at(-1)?.ph === 'f' &&
      ordered.filter((e) => e.ph === 's' || e.ph === 'f').length === 2 &&
      start.pid === window.pid &&
      start.tid === window.tid &&
      start.ts >= window.entry &&
      start.ts < window.exit
      ? [ordered]
      : [];
  });
}

export function analyzeApproach(
  events: readonly TraceEvent[],
  id: string,
  motion: readonly MotionFrame[],
  edges: readonly number[],
  explainFrameControl = false,
) {
  const selected = selectWindows(motion, edges);
  const renderer = alignMarks(events, id, selected.first);
  const samples = decodeSamples(events, renderer.pid, renderer.tid);
  const processNames = new Map(
    events
      .filter((e) => e.ph === 'M' && e.name === 'process_name')
      .map((e) => [e.pid, String(e.args?.name)]),
  );
  const threadNames = new Map(
    events
      .filter((e) => e.ph === 'M' && e.name === 'thread_name')
      .map((e) => [`${e.pid}:${e.tid}`, String(e.args?.name)]),
  );
  const tags = (e: TraceEvent) => e.cat?.split(',') ?? [];
  const isCompositor = (e: TraceEvent) =>
    tags(e).some((c) => /^(cc|viz)$|^disabled-by-default-(cc|viz)\./.test(c));
  const isGpu = (e: TraceEvent) => /GPU Process/i.test(processNames.get(e.pid) ?? '');
  const windows = motion.slice(0, -1).map((motionFrame) => {
    const callback = motionFrame.callback;
    const mark = alignMarks(events, id, callback);
    const stacks = samples.filter((s) => s.ts >= mark.entry && s.ts < mark.exit);
    const counts = new Map<
      string,
      { stack: CallFrame[]; beforeSubmit: number; submit: number; afterSubmit: number }
    >();
    for (const { ts, stack } of stacks) {
      const key = JSON.stringify(stack);
      const row = counts.get(key) ?? { stack, beforeSubmit: 0, submit: 0, afterSubmit: 0 };
      row[ts < mark.submit ? 'beforeSubmit' : ts < mark.submitted ? 'submit' : 'afterSubmit']++;
      counts.set(key, row);
    }
    const laneEvents = events.filter(
      (e) =>
        e.ph !== 'M' &&
        Number.isFinite(e.ts) &&
        e.ts < mark.next &&
        e.ts + (e.dur ?? 0) >= mark.entry &&
        (isCompositor(e) || isGpu(e) || /FireAnimationFrame/.test(e.name)),
    );
    const lane = (e: TraceEvent) => ({
      ...e,
      clockFromEntryUs: e.ts - mark.entry,
      process: processNames.get(e.pid),
      thread: threadNames.get(`${e.pid}:${e.tid}`),
    });
    const links = linkedFlows(events, mark).map((group) => group.map(lane));
    return {
      motion: motionFrame,
      marksUs: mark,
      workMs: (mark.exit - mark.entry) / 1000,
      submissionWallMs: (mark.submitted - mark.submit) / 1000,
      gapMs: (mark.next - mark.entry) / 1000,
      postExitMs: (mark.next - mark.exit) / 1000,
      nextTicks: motion[callback + 1]!.to - motion[callback + 1]!.from,
      samples: stacks.length,
      appSamples: stacks.filter((s) => s.stack.some((f) => /\/src\//.test(f.url ?? ''))).length,
      sampleStacks: [...counts.values()],
      links,
      frame: linkPresentedFrame(events, mark),
      // These are overlapping trace slices, not causal joins or additive durations.
      compositor: laneEvents.filter(isCompositor).map(lane),
      gpuProcessCpu: laneEvents.filter(isGpu).map(lane),
      rendererRaf: laneEvents
        .filter(
          (e) => e.pid === mark.pid && e.tid === mark.tid && /FireAnimationFrame/.test(e.name),
        )
        .map(lane),
      driverWaitCandidates: laneEvents
        .filter((e) =>
          /ClientWaitSync|WaitForFence|eglWait|WaitForToken|WaitForGetOffset/i.test(e.name),
        )
        .map(lane),
    };
  });
  const first = windows[selected.first];
  const steady = windows[selected.steady];
  if (!first || !steady || !windows[selected.historical])
    throw new Error('Missing following entry or historical callback window');
  if (windows.some((w) => w.marksUs.pid !== renderer.pid || w.marksUs.tid !== renderer.tid))
    throw new Error('Renderer lane changed');
  const delta = {
    workMs: first.workMs - steady.workMs,
    gapMs: first.gapMs - steady.gapMs,
    submissionWallMs: first.submissionWallMs - steady.submissionWallMs,
    postExitMs: first.postExitMs - steady.postExitMs,
    samples: first.samples - steady.samples,
    appSamples: first.appSamples - steady.appSamples,
  };
  return {
    selected,
    windows,
    delta,
    observedCategories: [...new Set(events.flatMap(tags))].sort(),
    samplesPresent: !!(first.appSamples && steady.appSamples),
    tracksPresent:
      hasCrossProcessFrame(first.frame, isGpu) && hasCrossProcessFrame(steady.frame, isGpu),
    ...(explainFrameControl && {
      frameControlIssues: {
        first: frameControlIssue(first.frame, isGpu),
        steady: frameControlIssue(steady.frame, isGpu),
      },
    }),
    deviceExecution: null,
  };
}
