import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Ray } from '@babylonjs/core/Culling/ray.js';
import type { PickingInfo } from '@babylonjs/core/Collisions/pickingInfo.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { Engine } from '@babylonjs/core/Engines/engine.js';
import type { Game } from '../src/gameTypes.ts';
import type { ViewSettings } from '../src/visualTrial.ts';
import type { Hit } from './cursor-evidence.ts';
import type { Bounds, GroundRay } from './cursor-attribution-model.ts';
import { createReplay } from './cursor-attribution-replay.ts';
import { BoundingBox } from '@babylonjs/core/Culling/boundingBox.js';
import { billboardLineage, cachedBounds, captureWriters } from './cursor-attribution-writers.ts';
import { scratchPass, scratchRegistration } from './cursor-publication-replay.ts';
import type { ScratchArm } from './cursor-publication-replay.ts';
import { compactWriterRecords, writerDecoder } from './cursor-writer-stream.ts';
import { browserVolume } from './cursor-capture-volume.ts';
import { decodePageBase64, liveProducer, pageBytes } from './cursor-capture-stream.ts';
import type { Packet } from './cursor-capture-stream.ts';

export const shrine = 'prop:shrine-entrance-0';
type Point = [number, number];
export type CaptureConfig = {
  kind: 'preflight' | 'shrine' | 'floor' | 'idle';
  mode: 'count' | 'time';
  point?: Point;
  window: [number, number];
  smoke: boolean;
  expectedReady?: string;
  runId?: string;
  writerVisit?: string;
};
type Pick =
  | { kind: 'floor' }
  | { kind: 'object'; id: string }
  | { kind: 'enemy'; actor: { id: string } };
type Ports = {
  canvas: HTMLCanvasElement;
  pointerRay(g: Game, x: number, y: number): Ray | null;
  pickPointer(g: Game, ray: Ray): Pick;
  currentOperation(g: Game, id: string): unknown;
  inUseReach(g: Game, id: string): boolean;
  ground(g: Game, ray: Ray): unknown;
};
type WebGLTimer = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };
type SendPage = (packet: Packet) => Promise<{ visit: string; seq: number; digest: string }>;
export const emptyCounts = () => ({
  visits: 0,
  admitted: 0,
  forced: 0,
  matrices: 0,
  mesh: 0,
  instance: 0,
  batchBounds: 0,
  instanceAdmitted: 0,
});
export type Pass = { ms: number | null; work: ReturnType<typeof emptyCounts> | null };
export type Pose = {
  world: number[];
  enabled: boolean;
  visible: boolean;
  visibility: number;
  alpha: boolean;
  parent: number | null;
  bounds: Bounds | null;
  thin: number[] | null;
  thinCount: number;
  thinPick: boolean;
};
type Sample = { poses: Pose[]; alive: boolean[]; ray: Ray | null; hit: Hit | null };
type PublicSample = Omit<Sample, 'ray'> & {
  ray: { origin: number[]; direction: number[]; length: number } | null;
};
export type NativeRow = {
  from: number;
  to: number;
  ticks: number;
  valid: boolean;
  hit: Hit | null;
  outlined: number;
  pick: number | null;
  sync: number | null;
  syncs: number | null;
  passes: Pass[];
  rig: number | null;
  cue: number | null;
  renderCpu: number | null;
  gpu: number | null;
  sample: PublicSample;
};
type ActivePass = {
  work: ReturnType<typeof emptyCounts> | null;
  pass: Pass[];
  sync: number | null;
  syncs: number | null;
  hits: (PickingInfo | null)[];
};
let active: ActivePass | null = null;

export function syncDiagnostic(actors: ReadonlyMap<AbstractMesh, unknown>) {
  const start = active?.sync === null || !active ? 0 : performance.now();
  // Proxy sync is deliberately retained in both replay arms, not credited to a tile query.
  for (const [mesh] of actors) mesh.computeWorldMatrix(true);
  if (active?.syncs !== null && active) active.syncs = actors.size;
  if (active?.sync !== null && active) active.sync = performance.now() - start;
}

export function pickDiagnostic(
  ports: Ports,
  game: Game,
  ray: Ray,
  mode: 'time' | 'count' | 'parity',
  local: AbstractMesh[] | null = null,
  beforeFirstPass?: () => void,
) {
  const { scene } = game;
  const full = scene.meshes;
  if (local) scene.meshes = local;
  const timed = mode === 'time';
  const result: ActivePass = {
    pass: [],
    sync: timed ? 0 : null,
    syncs: mode === 'count' ? 0 : null,
    work: null,
    hits: [],
  };
  const native = scene.pickWithRay;
  const stages: Parameters<Scene['pickWithRay']>[] = [];
  scene.pickWithRay = function (...args) {
    if (!result.pass.length) beforeFirstPass?.();
    if (mode === 'parity') stages.push(args);
    const work = mode === 'count' ? emptyCounts() : null;
    result.work = work;
    const predicate = args[1];
    if (work && predicate)
      args[1] = (mesh, index) => {
        const ok = predicate(mesh, index);
        if (index === -1) {
          work.visits++;
          if (ok) work.admitted++;
        } else if (ok) work.instanceAdmitted++;
        return ok;
      };
    const start = timed ? performance.now() : 0;
    const hit = native.apply(this, args);
    result.pass.push({ ms: timed ? performance.now() - start : null, work });
    result.hits.push(hit);
    result.work = null;
    return hit;
  };
  active = result;
  const start = timed ? performance.now() : 0;
  let picked: Pick;
  let ms: number | null;
  try {
    picked = ports.pickPointer(game, ray);
    ms = timed ? performance.now() - start : null;
  } finally {
    active = null;
    scene.pickWithRay = native;
    scene.meshes = full;
  }
  const hit = result.hits[picked.kind === 'enemy' ? 0 : 2];
  const surface =
    hit?.hit && hit.pickedMesh
      ? {
          mesh: `${hit.pickedMesh.uniqueId}:${hit.pickedMesh.name}`,
          distance: hit.distance,
          instance: hit.thinInstanceIndex,
        }
      : null;
  let dto: Hit;
  if (picked.kind === 'floor') dto = surface ? { kind: 'floor', ...surface } : { kind: 'floor' };
  else if (!surface) throw new Error('missing winning pick surface');
  else
    dto = {
      kind: picked.kind,
      id: picked.kind === 'enemy' ? picked.actor.id : picked.id,
      ...surface,
    };
  return {
    picked,
    hit: dto,
    ms,
    sync: result.sync,
    syncs: result.syncs,
    passes: result.pass,
    stages,
  };
}

export function countScope(meshes: readonly AbstractMesh[]) {
  const undo: (() => void)[] = [];
  for (const mesh of meshes) {
    const { intersects, computeWorldMatrix } = mesh;
    mesh.intersects = function (...args) {
      const work = active?.work;
      if (work) {
        if (args[3]) work.batchBounds++;
        else if (mesh.hasThinInstances) work.instance++;
        else work.mesh++;
      }
      return intersects.apply(this, args);
    };
    mesh.computeWorldMatrix = function (...args) {
      const work = active?.work;
      if (work) {
        work.matrices++;
        if (args[0]) work.forced++;
      }
      return computeWorldMatrix.apply(this, args);
    };
    undo.push(() => {
      mesh.intersects = intersects;
      mesh.computeWorldMatrix = computeWorldMatrix;
    });
  }
  return () => {
    for (const restore of undo) restore();
  };
}

function groundRay(ray: Ray): GroundRay {
  return {
    x: ray.origin.x,
    z: ray.origin.z,
    dx: ray.direction.x,
    dz: ray.direction.z,
    length: ray.length,
  };
}

export function pose(mesh: AbstractMesh): Pose {
  const world = mesh.worldMatrixFromCache;
  const { info, dirty } = cachedBounds(mesh);
  const thin = mesh instanceof Mesh ? mesh._thinInstanceDataStorage.matrixData : null;
  const thinCount = mesh instanceof Mesh ? mesh.thinInstanceCount : 0;
  // Never eliminate a thin batch (even with a known aggregate), unusual shader geometry,
  // or uncertain bounds. Every admitted thin instance is tested by the same Babylon kernel.
  const spatial =
    mesh.getClassName() === 'Mesh' &&
    mesh.getTotalVertices() > 0 &&
    !thin &&
    !mesh.skeleton &&
    !mesh.morphTargetManager &&
    !billboardLineage(mesh);
  // Mirror Babylon's lazy bounds publication on a detached box, using only the
  // already-published matrix. Its result can differ from the raw cached extrema.
  const box =
    spatial && info
      ? dirty && !info.isLocked
        ? new BoundingBox(info.minimum, info.maximum, world)
        : info.boundingBox
      : null;
  const a = box?.minimumWorld,
    b = box?.maximumWorld;
  const bounds: Bounds | null =
    a && b && Number.isFinite(a.x + a.z + b.x + b.z) ? [a.x, a.z, b.x, b.z] : null;
  return {
    world: Array.from(world.asArray()),
    enabled: mesh.isEnabled(),
    visible: mesh.isVisible,
    visibility: mesh.visibility,
    alpha: !!mesh.material?.needAlphaBlending(),
    parent: mesh.parent?.uniqueId ?? null,
    bounds,
    thin: thin ? Array.from(thin.subarray(0, thinCount * 16)) : null,
    thinCount,
    thinPick: mesh instanceof Mesh && mesh.thinInstanceEnablePicking,
  };
}

export function cursorDiagnostic(ports: Ports, clock = () => performance.now()) {
  const bridge = window as unknown as {
    __cursorCaptureConfig?: CaptureConfig;
    __cursorCapture?: ReturnType<typeof api>;
    __cursorWriterPage?: SendPage;
    __cursorVolumePage?: SendPage;
  };
  const config = bridge.__cursorCaptureConfig;
  if (!config) throw new Error('diagnostic bundle needs a capture configuration');
  const { canvas } = ports;
  const rows: NativeRow[] = [];
  const samples: Sample[] = [];
  let game: Game;
  let engine: Engine;
  let meshes: AbstractMesh[] = [];
  let undoCount: (() => void) | undefined;
  let ready: ReturnType<typeof metadata> | null = null;
  let fail: string | null = null;
  let done = false;
  let registrationMs: number | null = null;
  let from = 0,
    rig = 0,
    cue = 0,
    outlined = 0;
  let writers: ReturnType<typeof captureWriters> | undefined;
  let stream: ReturnType<typeof liveProducer> | undefined;
  let scratch: ReturnType<typeof makeScratch> | undefined;
  let foregroundWatchdog: number | undefined;
  let nativeFrame = 0;
  let atPick: Sample | null = null;
  let picked: ReturnType<typeof pickDiagnostic> | null = null;
  let input = 0,
    lost = false,
    plannedInput: Event | null = null;
  let pendingQuery: { query: WebGLQuery; row: number } | null = null;
  let gl: WebGL2RenderingContext | null = null;
  let ext: WebGLTimer | null = null;
  const measuring = !config.smoke && config.mode === 'time';
  const snapshot = (ray: Ray | null, hit: Hit | null): Sample => ({
    poses: meshes.map(pose),
    alive: game.combat.enemies.map((actor) => actor.alive),
    ray,
    hit,
  });

  function contaminate(reason: string) {
    fail ??= reason;
    stream?.fail(fail);
    stopForegroundWatchdog();
  }
  function stopForegroundWatchdog() {
    if (foregroundWatchdog === undefined) return;
    window.clearInterval(foregroundWatchdog);
    foregroundWatchdog = undefined;
  }
  function sampleForeground() {
    if (document.hidden || !document.hasFocus()) contaminate('foreground lost');
  }
  canvas.addEventListener('webglcontextlost', () => {
    lost = true;
    contaminate('WebGL context lost');
  });
  window.addEventListener('blur', () => {
    if (ready) contaminate('foreground lost');
  });
  document.addEventListener('visibilitychange', () => {
    if (ready && document.hidden) contaminate('foreground lost');
  });
  for (const type of [
    'pointermove',
    'pointerleave',
    'pointerdown',
    'pointerup',
    'click',
    'keydown',
    'keyup',
    'wheel',
    'contextmenu',
  ]) {
    window.addEventListener(
      type,
      (event) => {
        if (!ready) return;
        if (event !== plannedInput || event.target !== canvas || input !== 0)
          contaminate('input contamination');
        else input++;
      },
      { capture: true },
    );
  }

  function metadata(quality: string, settings: ViewSettings) {
    const rect = canvas.getBoundingClientRect();
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      seed: new URL(location.href).searchParams.get('seed'),
      navigation: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)
        .type,
      steps: game.steps,
      quality,
      settings,
      renderer: debug && (gl?.getParameter(debug.UNMASKED_RENDERER_WEBGL) as string),
      visible: !document.hidden,
      focused: document.hasFocus(),
      webgl: engine.webGLVersion,
      dpr: devicePixelRatio,
      css: [rect.x, rect.y, rect.width, rect.height],
      backing: [canvas.width, canvas.height],
      hero: [...game.player.root.position.asArray()],
      camera: [
        game.camera.alpha,
        game.camera.beta,
        game.camera.radius,
        ...game.camera.target.asArray(),
      ],
      view: Array.from(game.camera.getViewMatrix().asArray()),
      projection: Array.from(game.camera.getProjectionMatrix().asArray()),
      rooms: game.world.rooms,
      connections: game.world.connections,
      meshNames: meshes.map((m) => m.name),
      entities: game.world.entities.map((e) => [
        e.id,
        e.type,
        e.x,
        e.z,
        e.type === 'door' ? [e.open, e.locked] : null,
      ]),
      actors: game.combat.enemies.map((a) => ({
        id: a.id,
        alive: a.alive,
        position: { ...a.position },
      })),
      gpuTimer: !!ext,
    };
  }

  function api() {
    return {
      status: () => {
        const failure = statusFailure();
        const writer = stream?.status();
        return {
          done: !failure && done && (!writer || writer.kind === 'sealed'),
          fail: failure,
          lost,
          writer,
        };
      },
      take: (start = 0, end = rows.length) => ({
        ready,
        rows: rows.slice(start, end),
        length: rows.length,
        fail: statusFailure(),
        input,
        registrationMs,
      }),
      resolve() {
        if (!ready || !done || config?.kind !== 'preflight') throw new Error('preflight not ready');
        const classify = (point: Point) => {
          if (document.elementFromPoint(...point) !== canvas) return null;
          const ray = ports.pointerRay(game, ...point);
          if (!ray) return null;
          const pick = ports.pickPointer(game, ray);
          if (pick.kind === 'object')
            return {
              point,
              kind: pick.kind,
              id: pick.id,
              operation: ports.currentOperation(game, pick.id),
              reach: ports.inUseReach(game, pick.id),
            };
          if (pick.kind === 'floor' && ports.ground(game, ray)) return { point, kind: pick.kind };
          return null;
        };
        const grid: Point[] = [
          [1490, 740],
          [920, 580],
        ];
        for (let y = 620; y <= 850; y += 12)
          for (let x = 1350; x <= 1650; x += 12) grid.push([x, y]);
        const targets = grid.map(classify);
        return {
          shrine:
            targets.find((r) => r?.id === shrine && r.operation === 'restore' && !r.reach) ?? null,
          floor: classify([920, 580]) ?? null,
        };
      },
      replay(reverse: boolean) {
        if (!done || statusFailure()) throw new Error('capture not valid for replay');
        undoCount?.();
        undoCount = undefined;
        return createReplay(
          ports,
          game,
          meshes,
          samples,
          rows,
          reverse,
          !!config?.smoke || config?.mode === 'count',
          groundRay,
          clock,
        );
      },
      scratchBegin(arm: ScratchArm | null, pad = 0) {
        if (
          !done ||
          statusFailure() ||
          lost ||
          config?.mode !== 'count' ||
          stream?.status().kind !== 'sealed' ||
          scratch
        )
          throw new Error('scratch requires a sealed count visit and no open session');
        scratch = makeScratch(arm, pad);
      },
      scratchPage(encoded: string) {
        if (!scratch || statusFailure() || lost) throw new Error('scratch unavailable');
        const result = scratch(encoded);
        if (result) scratch = undefined;
        return result;
      },
      volume(visit: string, frames: number) {
        if (!config?.smoke || !config.runId || !done || !bridge.__cursorVolumePage)
          throw new Error('synthetic transport requires a software fixture');
        return browserVolume(config.runId, visit, frames, bridge.__cursorVolumePage);
      },
    };
  }
  const exposed = api();
  bridge.__cursorCapture = exposed;

  return {
    bridge: exposed,
    clock: () => (measuring ? clock() : 0),
    owners<T>(make: () => T): T {
      if (registrationMs !== null || !measuring) return make();
      const start = clock(),
        result = make();
      registrationMs = clock() - start;
      return result;
    },
    ready(g: Game, e: Engine, quality: string, settings: ViewSettings) {
      game = g;
      engine = e;
      meshes = [...g.scene.meshes];
      gl = canvas.getContext('webgl2');
      ext = gl?.getExtension('EXT_disjoint_timer_query_webgl2') as WebGLTimer | null;
      ready = metadata(quality, settings);
      if (config.expectedReady && JSON.stringify(ready) !== config.expectedReady) {
        fail = 'fresh ready metadata mismatch';
        done = true;
        e.stopRenderLoop();
        return;
      }
      if (config.mode === 'count' && config.kind !== 'preflight') {
        if (!config.runId || !config.writerVisit || !bridge.__cursorWriterPage)
          throw new Error('count visit requires the live writer binding and archive identity');
        undoCount = countScope(meshes);
        stream = liveProducer(config.writerVisit, bridge.__cursorWriterPage);
        writers = captureWriters(
          g.scene,
          {
            runId: config.runId,
            kind: config.kind,
            provenance: config.smoke ? 'software' : 'matched',
          },
          500_000,
          { ...compactWriterRecords(stream.append), fail: stream.fail },
        );
      }
      for (const geometry of g.scene.getGeometries()) {
        const previous = geometry.onGeometryUpdated;
        geometry.onGeometryUpdated = (changed, kind) => {
          previous?.call(geometry, changed, kind);
          if (!done && config.kind !== 'preflight' && (kind === undefined || kind === 'position'))
            fail = 'CPU pick geometry changed without replayable vertex history';
        };
      }
      if (config.kind !== 'preflight' && !fail) {
        // The visit owns this page through admission. Do not stop with rendering,
        // the final ACK, or any scratch arm: gaps between those calls are guarded too.
        foregroundWatchdog = window.setInterval(sampleForeground, 50);
        window.addEventListener('pagehide', stopForegroundWatchdog, { once: true });
        sampleForeground();
      }
      if (config.point) {
        plannedInput = new PointerEvent('pointermove', {
          bubbles: true,
          clientX: config.point[0],
          clientY: config.point[1],
          pointerType: 'mouse',
          pointerId: 1,
          isPrimary: true,
        });
        try {
          canvas.dispatchEvent(plannedInput);
        } finally {
          plannedInput = null;
        }
      }
    },
    begin(g: Game) {
      from = g.steps;
      rig = 0;
      cue = 0;
      outlined = 0;
      nativeFrame++;
      if (g.steps >= config.window[0]) retain(g, 0);
      picked = null;
      atPick = null;
    },
    retain,
    none() {
      picked = null;
    },
    fixed(g: Game, run: () => void) {
      const step = g.steps;
      writers?.phase('fixed', g.steps);
      run();
      if (g.steps !== step) writers?.checkpoint();
    },
    fixedStep(step: number) {
      writers?.phase('fixed', step);
    },
    presentation(g: Game | null, run: () => void) {
      if (g) writers?.phase('presentation', g.steps);
      run();
    },
    rig(run: () => void) {
      const start = measuring ? clock() : 0;
      run();
      if (measuring) rig += clock() - start;
    },
    hover(g: Game, ray: Ray) {
      writers?.phase('pick', g.steps);
      const retained = !done && g.steps >= config.window[0];
      picked = pickDiagnostic(
        ports,
        g,
        ray,
        measuring ? 'time' : config.mode === 'count' ? 'count' : 'parity',
        null,
        retained && writers ? () => writers?.checkpoint(groundRay(ray)) : undefined,
      );
      // Keep scene sampling outside both the native pick timer and individual pass timers.
      if (retained) atPick = snapshot(ray, picked.hit);
      return picked.picked;
    },
    cue(start: number, n: number) {
      outlined = n;
      if (measuring) cue = clock() - start;
    },
    render(g: Game, e: Engine) {
      const capturing =
        ready && !done && config.kind !== 'preflight' && g.steps >= config.window[0];
      if (
        pendingQuery &&
        gl &&
        ext &&
        gl.getQueryParameter(pendingQuery.query, gl.QUERY_RESULT_AVAILABLE)
      ) {
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT) && rows[pendingQuery.row])
          rows[pendingQuery.row].gpu =
            gl.getQueryParameter(pendingQuery.query, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(pendingQuery.query);
        pendingQuery = null;
      }
      const query = capturing && measuring && ext && !pendingQuery ? gl?.createQuery() : null;
      if (gl && ext && query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
      if (capturing && !atPick) {
        writers?.phase('presentation', g.steps);
        writers?.checkpoint();
      }
      const beforeRender = capturing ? (atPick ?? snapshot(null, null)) : null;
      writers?.phase('render', g.steps);
      const start = measuring ? clock() : 0;
      g.scene.render();
      const renderCpu = measuring ? clock() - start : null;
      if (capturing) writers?.checkpoint();
      writers?.end(g.steps, !!capturing);
      if (gl && ext && query) {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        pendingQuery = { query, row: rows.length };
      }
      if (!ready || done) return;
      if (config.kind === 'preflight') {
        done = true;
        e.stopRenderLoop();
        return;
      }
      fail ??= statusFailure();
      if (meshes.length !== g.scene.meshes.length || g.scene.meshes.some((m, i) => m !== meshes[i]))
        fail ??= 'unreplayed mesh lifecycle change';
      if (capturing && beforeRender) {
        const hit = picked?.hit ?? null;
        const valid =
          !fail &&
          (config.kind === 'shrine'
            ? hit?.kind === 'object' &&
              hit.id === shrine &&
              outlined > 0 &&
              ports.currentOperation(g, shrine) === 'restore' &&
              !ports.inUseReach(g, shrine)
            : config.kind === 'floor'
              ? hit?.kind === 'floor' && outlined === 0
              : hit === null && outlined === 0);
        if (!valid) fail ??= 'native hit/cue mismatch';
        const { ray, ...rest } = beforeRender;
        samples.push(beforeRender);
        rows.push({
          from,
          to: g.steps,
          ticks: g.steps - from,
          valid,
          hit,
          outlined,
          pick: picked?.ms ?? (measuring ? 0 : null),
          sync: picked?.sync ?? null,
          syncs: picked?.syncs ?? null,
          passes: picked?.passes ?? [],
          rig: measuring ? rig : null,
          cue: measuring ? cue : null,
          renderCpu,
          gpu: null,
          sample: {
            ...rest,
            ray: ray && {
              origin: ray.origin.asArray(),
              direction: ray.direction.asArray(),
              length: ray.length,
            },
          },
        });
      }
      if (g.steps >= config.window[1] || fail) {
        done = true;
        if (fail) contaminate(fail);
        else if (stream) {
          writers?.trailer();
          stream.finish();
        }
        writers?.close();
        e.stopRenderLoop();
      } else if (capturing && rows.length === 1) stream?.flush();
    },
  };

  function statusFailure() {
    if (ready) {
      if (lost || gl?.isContextLost()) contaminate('WebGL context lost');
      else sampleForeground();
    }
    const writer = stream?.status();
    return fail ?? (writer?.kind === 'failed' ? writer.reason : null);
  }
  function retain(g: Game, available: number) {
    if (!stream || !writers || done) return;
    let to = g.steps;
    for (let left = available; left >= 1 / 60; left -= 1 / 60) to++;
    if (to < config!.window[0] || writers.recording()) return;
    if (stream.status().kind === 'armed') stream.begin();
    writers.begin(nativeFrame, from);
  }

  function makeScratch(arm: ScratchArm | null, pad: number) {
    const decoder = writerDecoder();
    const timer = config!.smoke ? null : clock;
    let pass: ReturnType<typeof scratchPass> | undefined;
    return (encoded: string) => {
      if (encoded.length > Math.ceil(pageBytes / 3) * 4)
        throw new Error('scratch page exceeds bound');
      const data = decodePageBase64(encoded);
      if (data.length > pageBytes) throw new Error('scratch page exceeds bound');
      for (const frame of decoder.consume(data)) {
        const header = decoder.header()!;
        if (
          header.runId !== config!.runId ||
          header.kind !== config!.kind ||
          header.provenance !== (config!.smoke ? 'software' : 'matched')
        )
          throw new Error('scratch archive identity mismatch');
        if (!arm) return { registration: scratchRegistration(header, timer) };
        pass ??= scratchPass(header, arm, timer, pad);
        pass.frame(frame);
        if (pass.done()) return { result: pass.result() };
      }
      return null;
    };
  }
}

export type ReplayPorts = Ports;
export type ReplaySample = Sample;
