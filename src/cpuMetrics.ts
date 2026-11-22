/** CPU0 observer storage. Runtime call sites are statically guarded by Vite DEV; the controller
 * is loaded only by the opt-in development harness. No timers, subscriptions or background work. */
export interface CpuSample {
  step: number;
  ms: Record<string, number>;
  counts: Record<string, number>;
}
export interface CpuRoute {
  step: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  ms: number;
  phases: Record<string, number>;
  work: Record<string, Record<string, number>>;
  counts: Record<string, number>;
}
export const CPU_SAMPLE_LIMIT = 2048;
const KEY_LIMIT = 160;
export function rendererKind(renderer: string, vendor = ''): 'hardware' | 'software' | 'unknown' {
  const description = `${renderer} ${vendor}`;
  if (/swiftshader|llvmpipe|softpipe|lavapipe|software|\bwarp\b/i.test(description))
    return 'software';
  if (
    /nvidia|geforce|radeon|\bamd\b|\bintel\b|\bapple\b|adreno|mali|powervr|\bradv\b/i.test(
      description,
    )
  )
    return 'hardware';
  return 'unknown';
}
export function distribution(values: readonly number[]) {
  if (values.some((v) => !Number.isFinite(v) || v < 0)) throw new Error('Expected finite timings');
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0;
  return {
    count: values.length,
    mean: values.reduce((a, b) => a + b, 0) / (values.length || 1),
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: sorted.at(-1) ?? 0,
  };
}
/** Stable non-cryptographic comparison of detached observations; Node reports also carry SHA-256 source identity. */
export function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
export type CpuMethod<T, F> = F extends (...args: infer A) => infer R
  ? (this: T, ...args: A) => R
  : never;
export function patchMethod<T extends object, K extends keyof T>(
  object: T,
  key: K,
  replace: (original: T[K]) => CpuMethod<T, T[K]>,
): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  const original = object[key];
  Object.defineProperty(object, key, {
    configurable: true,
    writable: true,
    value: replace(original),
  });
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    if (descriptor) Object.defineProperty(object, key, descriptor);
    else Reflect.deleteProperty(object, key);
  };
}
export class CpuMetrics {
  readonly clock: () => number;
  private readonly limit: number;
  private readonly samples: CpuSample[] = [];
  private sample: CpuSample | null = null;
  private readonly keys = new Set<string>();
  private readonly routes: CpuRoute[] = [];
  private route: CpuRoute | null = null;
  private routeStarted = 0;
  private phaseStarted = 0;
  private phaseName = '';
  private muted = 0;
  captureRequest: number | undefined;
  private replay: CpuRoute | null = null;
  readonly scopes: string[] = [];
  constructor(clock = () => performance.now(), limit = CPU_SAMPLE_LIMIT) {
    if (!Number.isInteger(limit) || limit < 1 || limit > CPU_SAMPLE_LIMIT)
      throw new Error('Invalid sample budget');
    this.clock = clock;
    this.limit = limit;
  }
  begin(step: number): void {
    if (this.sample) throw new Error('CPU sample already active');
    if (this.samples.length >= this.limit) throw new Error('CPU sample budget exhausted');
    this.sample = { step, ms: {}, counts: {} };
  }
  end(): void {
    if (!this.sample || this.scopes.length || this.route) throw new Error('Unbalanced CPU sample');
    this.samples.push(this.sample);
    this.sample = null;
  }
  private add(target: Record<string, number>, name: string, value: number): void {
    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid CPU metric');
    if (!this.keys.has(name) && this.keys.size >= KEY_LIMIT)
      throw new Error('CPU metric budget exhausted');
    this.keys.add(name);
    target[name] = (target[name] ?? 0) + value;
  }
  count(name: string, value = 1): void {
    if (!this.sample || this.muted) return;
    this.add(this.sample.counts, name, value);
    if (this.route) {
      this.add(this.route.counts, name, value);
      this.add((this.route.work[this.phaseName] ??= {}), name, value);
    }
  }
  finish(name: string, started: number): void {
    if (!this.sample || this.muted) return;
    this.add(this.sample.ms, name, Math.max(0, this.clock() - started));
    this.count(`calls.${name}`);
  }
  measure<T>(name: string, run: () => T): T {
    if (!this.sample || this.muted) return run();
    const started = this.clock();
    this.scopes.push(name);
    try {
      return run();
    } finally {
      this.scopes.pop();
      this.finish(name, started);
    }
  }
  inspect<T>(read: () => T): T {
    this.muted++;
    try {
      return read();
    } finally {
      this.muted--;
    }
  }
  startRoute(input: Record<string, unknown>): void {
    if (!this.sample) return;
    if (this.route) throw new Error('Nested route instrumentation');
    this.count('route.requests');
    this.route = {
      step: this.sample.step,
      input: structuredClone(input),
      output: {},
      ms: 0,
      phases: {},
      work: {},
      counts: {},
    };
    this.routeStarted = this.phaseStarted = this.clock();
    this.phaseName = 'setup';
  }
  phase(name: string): void {
    if (!this.route) return;
    const now = this.clock();
    this.add(this.route.phases, this.phaseName, Math.max(0, now - this.phaseStarted));
    this.phaseStarted = now;
    this.phaseName = name;
  }
  finishRoute(output: Record<string, unknown>): void {
    if (!this.route) return;
    this.phase('done');
    this.route.ms = this.clock() - this.routeStarted;
    this.route.output = structuredClone(output);
    if (this.route.input.id === this.captureRequest) this.replay = this.route;
    this.routes.push(this.route);
    this.routes.sort((a, b) => b.ms - a.ms);
    this.routes.length = Math.min(8, this.routes.length);
    this.route = null;
  }
  snapshot() {
    return structuredClone({ samples: this.samples, routes: this.routes, replay: this.replay });
  }
}
export let cpuTrace: CpuMetrics | null = null;
export let cpuTiming: CpuMetrics | null = null;
export function setCpuMetrics(value: CpuMetrics | null, detailed = false): void {
  cpuTiming = value;
  cpuTrace = detailed ? value : null;
}
