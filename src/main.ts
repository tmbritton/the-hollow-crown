import './style.css';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { DungeonEngine } from './engine.ts';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import '@babylonjs/core/Culling/ray';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import { Effect } from '@babylonjs/core/Materials/effect';
import { FxaaPostProcess } from '@babylonjs/core/PostProcesses/fxaaPostProcess';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import '@babylonjs/core/Layers/effectLayerSceneComponent';
import { CustomMaterial } from '@babylonjs/materials/custom/customMaterial';
import { generateDungeonWithReport, validateDungeon } from './world.ts';
import {
  buildPracticeRoom,
  createPracticeFoes,
  decidePracticeRound,
  selectContent,
} from './practiceRoom.ts';
import type { PracticeCommand, PracticeRound } from './practiceRoom.ts';
import { tileAt, heightAt } from './worldSpatial.ts';
import { createGenerationReport } from './generation/report.ts';
import type { GenerationReport } from './generation/report.ts';
import { createMaterials, createRoomBandUniforms } from './materials.ts';
import { buildDungeon } from './buildDungeon.ts';
import { createPlayer, movePlayer, stopPlayer } from './player.ts';
import { RouteBudget } from './routeBudget.ts';
import { Navigator, projectGroundAim } from './navigation.ts';
import { initialTravelControl, travelControl } from './travelControls.ts';
import { decideUse, idleUse, transitionUse } from './playerInteraction.ts';
import type { Operation, UseState } from './playerInteraction.ts';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import '@babylonjs/core/Rendering/outlineRenderer';
import { createGameCursor } from './gameCursor.ts';
import { pointerFeedback } from './pointerPreview.ts';
import { ECS } from './ecs.ts';
import { CombatSystem, clearSight, seedEnemies } from './combat.ts';
import { cancelAttack, cancelWork, requestDefense, requestJump } from './actors.ts';
import type { Actor } from './actors.ts';
import { DiscoveryRecord } from './discoveries.ts';
import { prepareLastEmber, emberClue, EMBER } from './lastEmber.ts';
import { installObjectiveWork } from './objectiveWork.ts';
import { createLastEmberRendering } from './lastEmberRendering.ts';
import { prepareTribute } from './tribute.ts';
import { createTributeRendering } from './tributeRendering.ts';
import type { ObservedEvent } from './discoveries.ts';
import { GenerationError, generationIdentity } from './generation/identity.ts';
import { acceptsGenerationReady } from './machines/ui/session.ts';
import { CameraObservation, updateInstanceMatrices } from './observation.ts';
import { animateActors, ACTOR_OBSERVATION_RADIUS } from './actorRendering.ts';
import { launchProfile, ProfileWork, transitionProfile } from './enemyFreezeProfile.ts';
import type { EnemyProfileMode, ProfileState } from './enemyFreezeProfile.ts';
import { cpuTiming } from './cpuMetrics.ts';
import { createEnemyRendering } from './enemyRendering.ts';
import { registerWorld, registerDungeonRendering, updateDoors } from './worldEntities.ts';
import { ActorGeometry } from './actorGeometry.ts';
import { SupportTiles } from './supportTiles.ts';
import { TerrainCandidates } from './terrainCandidates.ts';
import { UI, bindEnemyProfile, bindVisualTrialPanel, fromVisualTrial } from './ui.ts';
import { createVisualTrial } from './machines/ui/visualTrial.ts';
import { BASE_FOV } from './visualTrial.ts';
import { createPaletteRenderer, createVisualTrialRenderer } from './visualTrialRendering.ts';
import { createCornerWearRenderer } from './cornerWearRendering.ts';
import { InspectionController } from './inspection.ts';
import { Statechart } from './machines/statechart.ts';
import { animateChest, progressionMachine } from './machines/world/interactions.ts';
import { pointerMachine } from './machines/ui/pointer.ts';
import { inspectorMachine } from './machines/ui/inspector.ts';
import { required } from './assert.ts';
import { element, html } from './dom.ts';
import type { ShowInspector } from '@babylonjs/inspector';
import type { Entity, PlayableContent, Spawn, World } from './worldTypes.ts';
import type { DungeonScenario, Game } from './gameTypes.ts';

const canvas = element('game', HTMLCanvasElement);
const cursor = createGameCursor(canvas);
const loading = html('loading');
const loadingCaption = required(loading.querySelector('p'), 'Loading caption missing');
const retryButton = html('retry-generation');
const ui = new UI(),
  keys = new Set<string>();
const gameKeys = new Set(['KeyE', 'KeyF', 'KeyR', 'KeyM', 'BracketLeft', 'BracketRight', 'Space']);
let travel = travelControl(initialTravelControl, { type: 'cancel' });
const editingText = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || !!target.closest('input,textarea,select'));
const nativeControl = (target: EventTarget | null) =>
  editingText(target) || (target instanceof Element && !!target.closest('button,a[href]'));
let engine: DungeonEngine,
  game: Game | null = null;
const entry = new URLSearchParams(location.search);
const requestedRoom = entry.get('room');
const debug = import.meta.env.DEV && entry.has('debug');
const generationDiagnostics =
  import.meta.env.DEV && debug
    ? (await import('./generation/localDiagnostics.ts')).createLocalGenerationDiagnostics()
    : undefined;
let failNextGeneration = import.meta.env.DEV && debug && entry.get('generationFailure') === '1';
type GenerationRequest = {
  seed: string | null;
  pinSeed: boolean;
  practiceRound: PracticeRound;
  mode?: EnemyProfileMode;
};
let enemyProfile:
  | {
      scene: Scene;
      mode: EnemyProfileMode;
      state: ProfileState;
      work: ProfileWork;
      display: ReturnType<typeof bindEnemyProfile>;
    }
  | undefined;
let currentRequest: GenerationRequest | null = null;
let retryRequest: GenerationRequest | null = null;
const activeGame = () => required(game, 'No active dungeon');
const currentGame = () => game;
const trialPanel = bindVisualTrialPanel((event) => visualTrial.send(event));
const visualTrial = createVisualTrial(
  {
    applyView(settings) {
      if (game) game.visualTrial.apply(settings, game.logicalRadius, game.inspection.active);
      trialPanel.update(visualTrial.mode, settings);
    },
    copySettings: (text) => void trialPanel.copy(text),
  },
  entry.get('view') === 'original' ? 'original' : 'tuned',
);
trialPanel.update(visualTrial.mode, visualTrial.settings);
let animationReview: import('./animationReview.ts').AnimationReview | undefined;
let initialGenerationReport: GenerationReport | null = null;
let last = performance.now(),
  accumulator = 0,
  uiClock = 0;
let quality: 'high' | 'low' = 'high';
let inspectorToken: ReturnType<typeof ShowInspector> | null = null;
const pointer = new Statechart(pointerMachine);
const inspector = new Statechart(inspectorMachine);
let lastPointerRoute = 0;
let useState: UseState = idleUse;
let hoverPoint: { x: number; y: number } | null = null;
let outlines: AbstractMesh[] = [];
let useProbe: {
  id: string;
  game: Game;
  from: Spawn;
  index: number;
  nav: Navigator;
  budget: RouteBudget;
  retry: number;
} | null = null;

function clearUseProbe() {
  useProbe?.nav.cancel();
  useProbe = null;
}

function clearPreview() {
  clearUseProbe();
  for (const mesh of outlines) mesh.renderOutline = false;
  outlines = [];
  cursor.hide();
  game?.enemyRendering.preview();
}

function resetMovement(reason: 'cancel' | 'input-lost' = 'cancel'): void {
  hoverPoint = null;
  clearPreview();
  useState = transitionUse(useState, { type: 'cancel' }).state;
  travel = travelControl(travel, { type: reason });
  keys.clear();
  pointer.send({ type: 'CANCEL' });
  if (game) {
    stopPlayer(game.player);
    game.enemyRendering.update();
    ui.combatTarget(null);
  }
}

function surfaceOwner(current: Game, mesh: AbstractMesh): string | undefined {
  const cargo = current.scenario?.tributeRendering.pickOwners.get(mesh);
  if (cargo) return cargo;
  if (mesh.name.includes(':use/')) return mesh.name.split(':use/')[1];
  for (const e of current.world.entities) {
    if (e.type === 'door' && e.pivot && mesh.isDescendantOf(e.pivot)) return e.id;
    if (
      e.type === 'chest' &&
      mesh.parent &&
      (mesh.parent.name === e.id || mesh.parent.parent?.name === e.id)
    )
      return e.id;
    if (e.type === 'altar' && mesh === e.crystal) return e.id;
    if (e.type === 'portrait' && current.ecs.get(e.id)?.get('render')?.meshes.includes(mesh))
      return e.id;
  }
}

const pickOwners = new WeakMap<Game, Map<AbstractMesh, string>>();
function ownersFor(current: Game) {
  let owners = pickOwners.get(current);
  if (!owners) {
    owners = new Map();
    for (const mesh of current.scene.meshes) {
      const id = surfaceOwner(current, mesh);
      if (id) owners.set(mesh, id);
    }
    pickOwners.set(current, owners);
  }
  return owners;
}

function pointerRay(current: Game, clientX: number, clientY: number) {
  const point = pointerSample(current, clientX, clientY);
  if (!point) return null;
  return current.scene.createPickingRay(point.x, point.y, Matrix.Identity(), current.camera);
}

function pickPointer(current: Game, ray: NonNullable<ReturnType<typeof pointerRay>>) {
  const enemy = current.enemyRendering.pick(ray);
  const meshes = ownersFor(current);
  const eligibleSurface = (mesh: AbstractMesh) =>
    mesh.isEnabled() && mesh.isVisible && mesh.visibility >= 0.5;
  const object = current.scene.pickWithRay(
    ray,
    (mesh) => meshes.has(mesh) && eligibleSurface(mesh),
  );
  if (!enemy && !object?.hit) return { kind: 'floor' } as const;
  // Use the drawn surfaces, not the invisible collision proxies. Babylon's predicate
  // replaces its default visibility/pickability filter, so filter visibility explicitly.
  const hit = current.scene.pickWithRay(ray, (mesh) => {
    if (
      !eligibleSurface(mesh) ||
      (mesh.hasThinInstances &&
        !('thinInstanceEnablePicking' in mesh && mesh.thinInstanceEnablePicking)) ||
      current.player.shadowMeshes.includes(mesh) ||
      enemy?.actor.entity.get('render')?.meshes.includes(mesh)
    )
      return false;
    return (
      meshes.has(mesh) ||
      (!mesh.material?.needAlphaBlending() &&
        !mesh.name.includes('ring') &&
        mesh.name !== 'click destination' &&
        mesh.name !== 'hostile target')
    );
  });
  if (enemy && (!hit?.hit || enemy.distance <= hit.distance + 0.0001))
    return { kind: 'enemy', actor: enemy.actor } as const;
  const id = hit?.pickedMesh && meshes.get(hit.pickedMesh);
  if (id) return { kind: 'object', id } as const;
  return { kind: 'floor' } as const;
}

function refreshPreview(current: Game) {
  const at = hoverPoint;
  if (
    !at ||
    !ui.ready ||
    paused() ||
    current.inspection.active ||
    document.hidden ||
    document.elementFromPoint(at.x, at.y) !== canvas
  ) {
    clearPreview();
    return;
  }
  current.camera.getViewMatrix();
  const ray = pointerRay(current, at.x, at.y);
  if (!ray) {
    clearPreview();
    return;
  }
  const pick = pickPointer(current, ray);
  if (pick.kind !== 'object' || pick.id !== useProbe?.id) clearUseProbe();
  const feedback = pointerFeedback(
    pick.kind === 'enemy'
      ? { kind: 'enemy', id: pick.actor.id }
      : pick.kind === 'object'
        ? { ...pick, usable: !!useEligibility(current, pick.id, true)?.reachable }
        : pick,
  );
  current.enemyRendering.preview(pick.kind === 'enemy' ? pick.actor : undefined);
  const next =
    feedback.kind === 'outline'
      ? [...ownersFor(current)].filter(([, id]) => id === feedback.id).map(([mesh]) => mesh)
      : [];
  for (const mesh of outlines) if (!next.includes(mesh)) mesh.renderOutline = false;
  for (const mesh of next) {
    mesh.renderOutline = true;
    mesh.outlineColor.set(0.83, 0.67, 0.22);
    mesh.outlineWidth = 0.017;
  }
  outlines = next;
  cursor.draw(at.x, at.y, feedback.kind === 'sword', performance.now());
}

function useEligibility(current: Game, id: string, preview: boolean) {
  const operation = currentOperation(current, id);
  if (!operation || !current.player.actor.alive) {
    clearUseProbe();
    return null;
  }
  if (inUseReach(current, id)) {
    clearUseProbe();
    return { operation, candidates: [], reachable: true };
  }
  const from = current.player.actor.position;
  const nav = current.player.navigator;
  const candidates = useApproaches(current, id);
  const direct = candidates.find((p) => nav.liveSegmentClear(from, p));
  if (direct) {
    clearUseProbe();
    return {
      operation,
      candidates: [direct, ...candidates.filter((p) => p !== direct)],
      reachable: true,
    };
  }
  if (!candidates.length) {
    clearUseProbe();
    return null;
  }
  // Speculative exact routing uses the fixed-tick budget, never the hero's route.
  // A press can submit the same unresolved candidates; no cue is shown until a route is proven.
  const now = performance.now();
  if (
    useProbe &&
    (useProbe.game !== current ||
      useProbe.id !== id ||
      Math.hypot(from.x - useProbe.from.x, from.z - useProbe.from.z) > 0.2 ||
      now >= useProbe.retry)
  )
    clearUseProbe();
  if (!useProbe && preview) {
    const probe = new Navigator(current.world, nav.occupancy);
    const start = { ...from };
    const budget = new RouteBudget();
    probe.scheduleWith(budget, () => start);
    useProbe = { id, game: current, from: start, index: 0, nav: probe, budget, retry: Infinity };
    probe.request(start, candidates[0]);
  }
  const probe = useProbe;
  if (preview) probe?.budget.tick();
  if (probe && !probe.nav.pending && probe.retry === Infinity) {
    const path = probe.nav.path;
    const end = path.at(-1);
    if (
      probe.nav.planningResult === 'ready' &&
      end &&
      candidates.some((p) => p.x === end.x && p.z === end.z) &&
      path.every((p, i) => nav.liveSegmentClear(path[i - 1] ?? from, p))
    ) {
      const proven = candidates.find((p) => p.x === end.x && p.z === end.z)!;
      return {
        operation,
        candidates: [proven, ...candidates.filter((p) => p !== proven)],
        reachable: true,
      };
    }
    const next = candidates[++probe.index];
    if (next) probe.nav.request(probe.from, next);
    else probe.retry = now + 350;
  }
  return { operation, candidates, reachable: false };
}

function navigatePointer(clientX: number, clientY: number, initialPress = false): void {
  if (!game || !ui.ready || paused() || game.inspection.active) return;
  const actor = game.player.actor;
  const ray = pointerRay(game, clientX, clientY);
  if (!ray) return;
  if (initialPress) {
    useState = transitionUse(useState, { type: 'cancel' }).state;
    actor.navigator.cancel();
    const pick = pickPointer(game, ray);
    if (pick.kind === 'object') {
      pointer.send({ type: 'SELECT_TARGET' });
      beginUse(pick.id);
      return;
    }
    cancelWork(actor);
    if (pick.kind === 'enemy') {
      pointer.send({ type: 'SELECT_TARGET' });
      game.combat.target(game.player.actor, pick.actor);
      return;
    }
    cancelAttack(actor);
  } else cancelWork(actor);
  const referenceHeight = pointer.snapshot.context.referenceHeight;
  const point =
    referenceHeight === null ? null : projectGroundAim(game.world, ray, referenceHeight);
  if (point) {
    if (initialPress)
      game.player.navigator.request(game.player.actor.position, point, { partial: true });
    else game.player.navigator.followFloor(game.player.actor.position, point, performance.now());
  }
  lastPointerRoute = performance.now();
}

function pointerSample(game: Game, x: number, y: number) {
  const rect = canvas.getBoundingClientRect();
  return game.visualTrial.pick(x - rect.left, y - rect.top, rect.width, rect.height);
}

function freshSeed() {
  return `ASH-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().slice(0, 6)}`;
}
function paused() {
  return ui.paused;
}
function pauseEnemyProfile(): void {
  if (!enemyProfile) return;
  enemyProfile.state = transitionProfile(enemyProfile.state, { type: 'pause' });
  enemyProfile.work.stop();
}
function applyQuality() {
  engine.setHardwareScalingLevel(
    quality === 'low' ? 1.5 : 1 / Math.min(window.devicePixelRatio || 1, 1.5),
  );
  if (game) {
    game.scene.shadowsEnabled = quality === 'high';
    game.glow.isEnabled = quality === 'high';
    game.fxaa.samples = quality === 'high' ? Math.min(4, engine.getCaps().maxMSAASamples) : 1;
  }
  engine.resize();
}

function discoveryRecord(): DiscoveryRecord {
  return required(activeGame().ecs.get('run'), 'Run entity missing').require('discoveries');
}

/** Player perception and actual rendered camera visibility must both permit observation. */
function observesActor(actor: Actor): boolean {
  const current = game;
  if (!current || !ui.ready || paused() || current.inspection.active || !current.player.actor.alive)
    return false;
  const player = current.player.actor.position;
  if (actor.entity.get('ragdoll')?.mode === 'separated') {
    return current.observation.visible(
      actor.entity.require('render'),
      actor.entity.require('rigPose').bodyMeshes,
      (point) =>
        Math.hypot(player.x - point.x, player.z - point.z) <= 8 &&
        clearSight(current.world, player, {
          x: point.x,
          z: point.z,
          h: heightAt(current.world, point.x, point.z) ?? actor.position.h,
        }),
    );
  }
  const position = actor.position;
  if (
    Math.hypot(player.x - position.x, player.z - position.z) > 8 ||
    !actor.entity.get('render')?.root?.isEnabled() ||
    !clearSight(current.world, player, position)
  )
    return false;
  return current.observation.visible(actor.entity.require('render'));
}

function observedLabel(actor: Actor): string {
  const identity = actor.entity.get('inhabitant');
  return identity && discoveryRecord().hasDiscovery(identity.id)
    ? `${identity.name}, ${identity.title}`
    : `a ${actor.kind}`;
}

function recordEvent(event: ObservedEvent, notify = false): void {
  if (!game) return;
  const record = discoveryRecord();
  if (record.recordEvent(event, game.playTime) && notify) {
    const entry = record.snapshot().events.at(-1);
    if (entry) ui.toast(entry.description);
  }
}

function observeDeath(victim: Actor, source?: Actor): void {
  if (!game) return;
  const identity = victim.entity.get('inhabitant');
  if (!identity || !observesActor(victim)) return;
  const killer =
    source && (source.id === game.player.actor.id || observesActor(source))
      ? {
          id: source.entity.get('inhabitant')?.id ?? source.id,
          label: source.kind === 'player' ? 'you' : observedLabel(source),
        }
      : undefined;
  recordEvent(
    {
      kind: 'death-witnessed',
      subjectId: identity.id,
      label: observedLabel(victim),
      ...(killer ? { killer } : {}),
    },
    true,
  );
}

function retireGame(): void {
  const old = game;
  game = null;
  if (enemyProfile) {
    enemyProfile.state = transitionProfile(enemyProfile.state, { type: 'dispose' });
    enemyProfile.work.stop();
    enemyProfile.display.remove();
    enemyProfile = undefined;
  }
  initialGenerationReport = null;
  inspectorToken?.dispose();
  inspectorToken = null;
  inspector.send({ type: 'CLOSE' });
  if (old) {
    old.scenario?.run.get('objectiveWork')?.retire();
    old.inspection.dispose();
    disposeScene(old.scene);
  }
}

function disposeScene(scene: Scene): void {
  const shaderNames = scene.materials
    .filter((m): m is CustomMaterial => m instanceof CustomMaterial)
    .map((m) => m._createdShaderName)
    .filter(Boolean);
  scene.dispose();
  engine.releaseEffects();
  for (const name of shaderNames) {
    delete Effect.ShadersStore[`${name}VertexShader`];
    delete Effect.ShadersStore[`${name}PixelShader`];
  }
}

function showFailure(message: string, retry: GenerationRequest | null = null): void {
  retryRequest = retry;
  ui.transition({ type: 'FAIL' });
  loading.inert = false;
  loading.classList.remove('done');
  loadingCaption.textContent = message;
  retryButton.hidden = !retry;
  retryButton.textContent =
    requestedRoom === 'practice' ? 'Retry practice round' : 'Retry this seed';
  if (retry) retryButton.focus();
}

function installDungeonScenario(
  world: World,
  ecs: ECS,
  player: Actor,
  scene: Scene,
  materials: ReturnType<typeof createMaterials>,
  shadow: ShadowGenerator,
): DungeonScenario {
  const emberPlan = prepareLastEmber(ecs, world, player);
  const tributePlan = prepareTribute(ecs, world, player);
  installObjectiveWork(
    ecs,
    world,
    {
      objectives: [...emberPlan.plan.objectives, ...tributePlan.plan.objectives],
      races: [...emberPlan.plan.races, ...tributePlan.plan.races],
    },
    [...emberPlan.bindings, ...tributePlan.bindings],
  );
  const emberRendering = createLastEmberRendering(scene, ecs, materials);
  const tributeRendering = createTributeRendering(scene, ecs, materials, shadow);
  const clue = emberClue(world);
  const landmark = world.entities.find((e) => e.id === emberPlan.scenario.sites.clue.id);
  if (landmark?.inspection) landmark.inspection.description += `\n\n${clue.description}`;
  const progression = new Statechart(progressionMachine);
  for (const entity of world.entities)
    if (entity.type === 'altar')
      Object.defineProperty(entity, 'active', {
        enumerable: true,
        get: () => !progression.snapshot.matches('seekingAltar'),
      });
  return {
    world,
    run: required(ecs.get('run'), 'Run entity missing'),
    clue,
    progression,
    emberRendering,
    tributeRendering,
  };
}

function requestPractice(command: PracticeCommand): boolean {
  const context =
    requestedRoom !== 'practice'
      ? 'dungeon'
      : !game || !currentRequest || paused() || game.inspection.active
        ? 'loading'
        : currentRequest.practiceRound;
  const decision = decidePracticeRound(context, command);
  if (decision.kind !== 'rebuild') return false;
  start(null, { practiceRound: decision.round });
  return true;
}

function start(
  seed: string | null,
  { pinSeed = false, practiceRound = 'quiet', mode }: Partial<Omit<GenerationRequest, 'seed'>> = {},
): void {
  if (!engine) return;
  const wasProfiling = !!currentRequest?.mode;
  const request = { seed, pinSeed, practiceRound, mode };
  if (wasProfiling && !mode) {
    const url = new URL(location.href);
    url.searchParams.delete('enemyProfile');
    history.replaceState(null, '', url);
  }
  currentRequest = request;
  retryRequest = null;
  retryButton.hidden = true;
  loadingCaption.textContent =
    requestedRoom === 'practice' ? 'Opening the practice room…' : 'Carving the hollow…';
  loading.inert = false;
  loading.classList.remove('done');
  if (import.meta.env.DEV) animationReview?.reset();
  ui.unload();
  resetMovement();
  retireGame();
  accumulator = 0;
  last = performance.now();
  let content: PlayableContent;
  let debugReport: GenerationReport | null = null;
  try {
    content = selectContent(
      requestedRoom,
      seed,
      {
        practice: buildPracticeRoom,
        dungeon(requestedSeed) {
          const actualSeed = requestedSeed ?? freshSeed();
          request.seed = actualSeed;
          const maxAttempts = import.meta.env.DEV && failNextGeneration ? 1 : undefined;
          if (import.meta.env.DEV) failNextGeneration = false;
          const generated = generateDungeonWithReport(actualSeed, {
            maxAttempts,
            diagnostics: generationDiagnostics?.port,
          });
          if (import.meta.env.DEV && debug)
            debugReport = createGenerationReport(generated.world, generated.report);
          return generated.world;
        },
      },
      practiceRound,
    );
  } catch (error) {
    if (error instanceof GenerationError) {
      const reason = error.report.attempts.at(-1)?.reasons[0];
      showFailure(reason ? `${error.message}. ${reason}.` : error.message, request);
    } else {
      showFailure(
        requestedRoom === 'practice'
          ? 'Could not open the practice room.'
          : `Unexpected dungeon generation error for seed ${request.seed}.`,
        requestedRoom === 'practice' ? request : null,
      );
      console.error(error);
    }
    return;
  }
  let scene: Scene | undefined;
  try {
    scene = new Scene(engine);
    assembleScene(scene, content, request, debugReport);
  } catch (error) {
    if (content.kind === 'dungeon') throw error;
    ui.unload();
    if (game) retireGame();
    else if (scene) disposeScene(scene);
    showFailure('Could not open the practice room.', request);
    console.error(error);
  }
}

function assembleScene(
  scene: Scene,
  content: PlayableContent,
  request: GenerationRequest,
  debugReport: GenerationReport | null,
): void {
  const { world } = content;
  const { pinSeed, practiceRound, mode } = request;
  scene.clearColor = new Color4(0.044, 0.065, 0.075, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.015;
  scene.fogColor = new Color3(0.044, 0.065, 0.075);
  scene.collisionsEnabled = true;
  scene.skipPointerMovePicking = true;
  scene.ambientColor = new Color3(0.055, 0.065, 0.075);
  const camera = new ArcRotateCamera(
    'overhead camera',
    -Math.PI / 4,
    0.64,
    27,
    new Vector3(0, 0.8, 0),
    scene,
  );
  camera.fov = BASE_FOV;
  camera.minZ = 0.1;
  camera.maxZ = 110;
  camera.inputs.clear();
  const ambient = new HemisphericLight('cold sky fill', new Vector3(0.2, 1, -0.3), scene);
  ambient.intensity = 0.43;
  ambient.diffuse = new Color3(0.69, 0.81, 0.87);
  ambient.groundColor = new Color3(0.15, 0.19, 0.23);
  // Side lighting exposes the hero's cast shadow instead of hiding it directly
  // behind his silhouette from the default overhead camera.
  const sun = new DirectionalLight(
    'graphic key light',
    new Vector3(-0.7, -1, -0.4).normalize(),
    scene,
  );
  sun.intensity = 1.25;
  sun.diffuse = new Color3(0.94, 0.85, 0.67);
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 70;
  sun.shadowFrustumSize = 38;
  sun.autoUpdateExtends = false;
  const shadow = new ShadowGenerator(2048, sun);
  shadow.bias = 0.0008;
  shadow.normalBias = 0.025;
  shadow.setDarkness(0.12);
  shadow.usePercentageCloserFiltering = true;
  shadow.filteringQuality = ShadowGenerator.QUALITY_HIGH;
  const glow = new GlowLayer('embers and votives', scene, {
    mainTextureRatio: 0.35,
    blurKernelSize: 32,
  });
  glow.intensity = 0.38;
  // Smooth shader/shadow edges as well as silhouettes; DOM text stays crisp.
  const fxaa = new FxaaPostProcess('edge antialiasing', 1, camera);
  const bands =
    content.kind === 'practice' || (import.meta.env.DEV && debug) ? createRoomBandUniforms() : null;
  const materials = createMaterials(scene, bands);
  const wear = createCornerWearRenderer(scene);
  const dungeon = buildDungeon(scene, content, materials, shadow, glow, bands !== null, wear);
  const ecs = new ECS();
  const discoveries = new DiscoveryRecord(generationIdentity(world.seed));
  ecs.create('run').add('discoveries', discoveries);
  world.tiles = new SupportTiles(world.tiles);
  registerWorld(ecs, world);
  registerDungeonRendering(ecs, dungeon);
  const player = createPlayer(scene, materials, shadow, world, ecs);
  const enemies =
    content.kind === 'dungeon'
      ? seedEnemies(ecs, content.world)
      : createPracticeFoes(ecs, content.world, practiceRound);
  const profileWork = mode ? new ProfileWork(() => performance.now()) : undefined;
  const combat = new CombatSystem(ecs, world, [player.actor, ...enemies], world.seed, {
    onDeath: observeDeath,
    mode,
    work: profileWork,
  });
  const routeBudget = new RouteBudget();
  for (const actor of combat.actors)
    actor.navigator.scheduleWith(routeBudget, () =>
      ecs.get(actor.id) === actor.entity && actor.alive && !actor.entity.has('corpse')
        ? actor.position
        : null,
    );
  scene.onDisposeObservable.addOnce(() => {
    routeBudget.dispose();
    ecs.living.dispose();
  });
  const scenario =
    content.kind === 'dungeon'
      ? installDungeonScenario(content.world, ecs, player.actor, scene, materials, shadow)
      : null;
  const enemyRendering = createEnemyRendering(scene, combat, materials, shadow);
  const trialRenderer = createVisualTrialRenderer(
    camera,
    createPaletteRenderer(scene, materials, bands),
    [
      ...combat.actors.flatMap((actor) => {
        const rig = actor.entity.require('rig');
        const shield = rig.shield?.getChildMeshes() ?? [];
        const weapon = [rig.weapon, rig.spear, rig.javelin].flatMap(
          (mount) => mount?.getChildMeshes() ?? [],
        );
        const gear = new Set([...shield, ...weapon]);
        const body = actor.entity.require('render').meshes.filter((mesh) => !gear.has(mesh));
        const visible = () => actor.alive && ecs.get(actor.id) === actor.entity;
        return [
          { meshes: body, visible, kind: 'silhouette' as const },
          { meshes: weapon, visible, kind: 'gear' as const },
          { meshes: shield, visible, kind: 'gear' as const },
        ].filter(({ meshes }) => meshes.length > 0);
      }),
      ...dungeon.portraits.map(({ root }) => ({
        meshes: root.getChildMeshes(),
        visible: () => !root.isDisposed(),
        kind: 'silhouette' as const,
      })),
    ],
    wear.apply,
  );
  for (const actor of combat.actors) new ActorGeometry(actor.entity);
  // This closed bootstrap builds only authored motor colliders and permanent render meshes
  // (including the effects pools and actor proxies). Never classify later scene additions here.
  const authoredColliders = new Set(dungeon.colliders);
  new TerrainCandidates(
    scene,
    dungeon.colliders,
    scene.meshes.filter((mesh) => !(mesh instanceof Mesh && authoredColliders.has(mesh))),
  );
  // Render batches can serve many logical tiles/props without duplicating geometry.
  const actorMeshes = new Set(
    ecs.query('render').flatMap((entity) => entity.require('render').meshes),
  );
  for (const mesh of scene.meshes)
    if (!actorMeshes.has(mesh))
      ecs.create(`render:${mesh.uniqueId}`).add('render', { root: null, meshes: [mesh] });
  const shadowMap = required(shadow.getShadowMap(), 'Shadow map unavailable');
  const shadowCasters = [...(shadowMap.renderList ?? [])];
  const heroCasters = new Set(player.shadowMeshes);
  scene.onDisposeObservable.addOnce(() => {
    shadowCasters.length = 0;
    heroCasters.clear();
    if (shadowMap.renderList) shadowMap.renderList.length = 0;
  });
  for (const mesh of scene.meshes)
    if (
      mesh instanceof Mesh &&
      ['flame', 'violetFlame', 'magic', 'rune', 'ember', 'lava', 'eyes'].includes(
        mesh.material?.name ?? '',
      )
    )
      glow.addIncludedOnlyMesh(mesh);
  camera.target.copyFrom(player.root.position).addInPlace(new Vector3(0, 0.6, 0));
  let playerVisibility = { root: true, marker: true };
  const inspection = new InspectionController(camera, {
    getViewport: () => ({
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      footer: ui.inspection.getBoundingClientRect().height + 48,
    }),
    onOpen: (target) => {
      if (game?.scene !== scene) return;
      pauseEnemyProfile();
      trialRenderer.apply(visualTrial.settings, game.logicalRadius, true);
      resetMovement();
      accumulator = 0;
      playerVisibility = { root: player.root.isEnabled(), marker: player.marker.isEnabled() };
      player.root.setEnabled(false);
      player.marker.setEnabled(false);
      ui.openInspection(target, game.playTime);
      if (scenario && target.id === scenario.clue.subjectId)
        discoveries.present(scenario.clue, game.playTime);
    },
    onClose: () => {
      if (game?.scene !== scene) return;
      keys.clear();
      accumulator = 0;
      player.root.setEnabled(playerVisibility.root);
      player.marker.setEnabled(playerVisibility.marker);
      game.desiredAlpha = camera.alpha;
      game.desiredRadius = game.logicalRadius;
      trialRenderer.apply(visualTrial.settings, game.logicalRadius, false);
      ui.closeInspection();
      canvas.focus();
    },
  });
  game = {
    routeBudget,
    scene,
    world,
    scenario,
    camera,
    visualTrial: trialRenderer,
    ambient,
    sun,
    shadow,
    shadowMap,
    shadowCasters,
    heroCasters,
    glow,
    fxaa,
    materials,
    dungeon,
    player,
    ecs,
    combat,
    enemyRendering,
    observation: new CameraObservation(camera, [
      ...ecs.query('rig').map((entity) => ({
        root: entity.require('rig').root,
        radius: ACTOR_OBSERVATION_RADIUS,
        worldRadius: () => entity.get('ragdoll')?.radius,
      })),
      ...dungeon.creatures.map((creature) => ({
        root: creature.root,
        radius: creature.observationRadius,
      })),
    ]),
    inspection,
    time: 0,
    playTime: 0,
    desiredAlpha: camera.alpha,
    desiredRadius: 27,
    logicalRadius: 27,
    get active() {
      return !!scenario && !scenario.progression.snapshot.matches('seekingAltar');
    },
    get complete() {
      return scenario?.progression.snapshot.matches('complete') ?? false;
    },
    chests: 0,
    checkpoint: { ...world.spawn },
    damageCooldown: 0,
    nearest: null,
    steps: 0,
    nearLights: [],
  };
  trialRenderer.apply(visualTrial.settings, game.logicalRadius, false);
  initialGenerationReport = debugReport;
  ui.reset(content, discoveries);
  applyQuality();
  if (mode && profileWork) {
    // The same unsampled starting pose in every comparison, before the first fixed tick.
    animateActors(ecs, 0, 0, world);
    enemyProfile = {
      scene,
      mode,
      work: profileWork,
      state: { phase: 'waiting' },
      display: bindEnemyProfile(mode, world.seed),
    };
  }
  // Random runs must not write a seed back into the URL and pin future loads.
  if (content.kind === 'dungeon') {
    const url = new URL(location.href);
    if (pinSeed) url.searchParams.set('seed', required(request.seed, 'Missing pinned seed'));
    else url.searchParams.delete('seed');
    history.replaceState(null, '', url);
  }
  scene.executeWhenReady(() => {
    if (
      scene !== game?.scene ||
      !acceptsGenerationReady(
        ui.flow.snapshot.matches({ mode: 'loading' }),
        currentRequest,
        request,
      )
    )
      return;
    ui.transition({ type: 'READY' });
    if (content.kind === 'practice') ui.showPracticeRound(practiceRound);
    loading.classList.add('done');
    loading.inert = true;
    ui.room(required(world.roomById.entrance, 'Missing entrance'), game.playTime);
    canvas.focus();
    ui.toast(
      scenario || practiceRound === 'singleFoe'
        ? 'Click an enemy to pursue and attack. Hold F to defend. Click the floor to break pursuit.'
        : 'Click or hold the floor to move. Click the door or press E nearby to use it.',
      6500,
    );
  });
}

function lineOfSight(entity: Entity, p: Spawn): boolean {
  const game = activeGame();
  const dx = entity.x - p.x,
    dz = entity.z - p.z;
  const distance = Math.hypot(dx, dz),
    steps = Math.ceil(distance / 0.15);
  for (let i = 1; i < steps; i++) {
    const x = p.x + (dx * i) / steps,
      z = p.z + (dz * i) / steps;
    if (!tileAt(game.world, x, z)) return false;
    for (const obstacle of game.dungeon.obstacles) {
      if (obstacle.mesh === entity.collider || !obstacle.mesh.checkCollisions) continue;
      if (Math.abs(x - obstacle.x) < obstacle.w / 2 && Math.abs(z - obstacle.z) < obstacle.d / 2)
        return false;
    }
  }
  return true;
}
function entityInReach(e: Entity, p: Spawn): boolean {
  return (
    Math.hypot(e.x - p.x, e.z - p.z) < (e.type === 'altar' || e.type === 'throne' ? 3.1 : 2.6) &&
    Math.abs(e.h - p.h) < 1.4 &&
    lineOfSight(e, p)
  );
}
function findInteraction(): Entity | null {
  const game = activeGame();
  const p = playerUsePosition(game);
  return (
    game.ecs
      .query('interaction')
      .map((entity) => entity.require('interaction'))
      .map((e) => ({ e, d: Math.hypot(e.x - p.x, e.z - p.z) }))
      .filter(({ e }) => entityInReach(e, p))
      .sort((a, b) => a.d - b.d)[0]?.e || null
  );
}
function playerUsePosition(current: Game): Spawn {
  const { x, y: h, z } = current.player.root.position;
  return { x, h, z };
}
function emberSite(current: Game, id: string) {
  const ember = current.scenario?.run.get('lastEmber');
  if (!ember) return null;
  for (const kind of ['shrine', 'focus'] as const)
    if (ember.sites[kind].sourceId === id) return { ember, kind };
  return null;
}
function currentOperation(current: Game, id: string): Operation | null {
  const e = current.ecs.get(id)?.get('interaction');
  if (e?.inspection) return 'inspect';
  switch (e?.type) {
    case 'door':
      return e.locked || (e.open && doorOccupied(current, e)) ? null : e.open ? 'close' : 'open';
    case 'chest':
      return e.open ? null : 'open';
    case 'altar':
      return current.active ? 'rest' : 'kindle';
    case 'throne':
      return current.active && !current.complete ? 'claim' : null;
  }
  const site = emberSite(current, id);
  if (site) {
    const { ember, kind } = site;
    if (kind === 'focus') return ember.focusEnabled ? 'disable' : null;
    if (ember.state === 'dormant' || ember.state === 'active') return 'restore';
    if (ember.focusEnabled) return null;
    if (ember.state === 'corrupted') return 'cleanse';
    if (ember.state === 'fractured') return 'repair';
    return null;
  }
  const cargo = current.ecs.get(id)?.get('cargo');
  return cargo?.state === 'loose' || cargo?.state === 'claimed' ? 'recover' : null;
}
function inUseReach(current: Game, id: string, p?: Spawn): boolean {
  const e = current.ecs.get(id)?.get('interaction');
  if (e) return entityInReach(e, p ?? playerUsePosition(current));
  const site = emberSite(current, id);
  if (site) return site.ember.inReach(site.kind, p);
  return !!current.scenario?.run.get('tribute')?.nearby(id, p);
}
function useApproaches(current: Game, id: string): Spawn[] {
  const e = current.ecs.get(id)?.get('interaction');
  const site = emberSite(current, id);
  const preferred =
    e && 'approach' in e
      ? e.approach
      : (site?.ember.sites[site.kind].approach ?? current.ecs.get(id)?.get('workSite')?.approach);
  const center = preferred ?? e;
  if (!center) return [];
  const p = current.player.actor.position;
  const points = preferred ? [preferred] : [];
  // Sample both sides, including both faces of a door, then try exact legal endpoints.
  for (const r of preferred ? [0.7, 1.4, 2.2] : [1.15, 1.85, 2.35])
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      points.push({ x: center.x + r * Math.cos(a), z: center.z + r * Math.sin(a) });
    }
  const result: Spawn[] = [];
  for (const point of points) {
    const h = heightAt(current.world, point.x, point.z);
    if (h === null || !current.player.navigator.canOccupy(point)) continue;
    const at = { ...point, h };
    if (inUseReach(current, id, at)) result.push(at);
  }
  return result.sort((a, b) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(p.x - b.x, p.z - b.z));
}
function advanceUse(current: Game) {
  if (useState.kind !== 'approaching') return;
  const { ref } = useState;
  const result = decideUse(
    ref.operation,
    currentOperation(current, ref.id),
    inUseReach(current, ref.id),
  );
  const nav = current.player.navigator;
  const next = transitionUse(useState, {
    type: 'check',
    result,
    travelling: nav.active || nav.pending,
  });
  useState = next.state;
  if (next.effect?.type === 'route') nav.request(current.player.actor.position, next.effect.point);
  else if (next.effect) {
    nav.cancel();
    if (next.effect.type === 'execute') executeUse(current, next.effect.ref.id);
  }
}
function beginUse(id: string) {
  const current = activeGame();
  // A visible target may answer in reach without advertising an available action
  // (a sealed gate, an unkindled throne, or a spent shrine). Never scan for a neighbor.
  if (inUseReach(current, id)) {
    clearUseProbe();
    cancelAttack(current.player.actor);
    executeUse(current, id);
    return;
  }
  const eligibility = useEligibility(current, id, false);
  clearUseProbe();
  cancelAttack(current.player.actor);
  if (!eligibility) return;
  cancelWork(current.player.actor);
  useState = transitionUse(useState, {
    type: 'select',
    ref: { id, operation: eligibility.operation },
    candidates: eligibility.candidates,
  }).state;
  advanceUse(current);
}
function doorOccupied(current: Game, e: Extract<Entity, { type: 'door' }>) {
  return current.combat.enemies.some(
    (a) =>
      a.alive &&
      Math.abs(a.position.h - e.h) < 1.2 &&
      Math.abs(a.position.x - e.x) < 1.9 &&
      Math.abs(a.position.z - e.z) < 1.9,
  );
}
function doorRefusal(current: Game, e: Extract<Entity, { type: 'door' }>) {
  if (e.locked) ui.toast('The gate remembers an oath. Kindle the violet altar.');
  else if (e.open && doorOccupied(current, e)) ui.toast('Someone is in the doorway.');
  else return false;
  return true;
}
function promptFor(e: Entity | null): string {
  const game = activeGame();
  if (!e) return '';
  if (e.inspection) return `Inspect ${e.inspection.title}`;
  if (e.type === 'door')
    return e.locked ? 'Sealed by an ancient oath' : e.open ? 'Close the door' : 'Open the door';
  if (e.type === 'altar')
    return game.active ? 'Rest at the kindled altar' : 'Kindle the ancient altar';
  if (e.type === 'throne') return game.complete ? 'The crown is yours' : 'Claim the Hollow Crown';
  return e.type === 'chest' ? (e.open ? 'An empty reliquary' : 'Open the reliquary') : '';
}
function interact() {
  if (!game || !ui.ready) return;
  if (!ui.ready || paused()) return;
  if (game.inspection.active) {
    game.inspection.close();
    return;
  }
  const tribute = game.scenario?.run.get('tribute')?.nearby();
  const ember = game.scenario?.run.get('lastEmber');
  const site = ember?.nearby();
  const id = tribute?.id ?? (site && ember ? ember.sites[site].sourceId : findInteraction()?.id);
  if (!id) return;
  if (useState.kind === 'approaching') game.player.navigator.cancel();
  useState = transitionUse(useState, { type: 'cancel' }).state;
  executeUse(game, id);
}
function executeUse(game: Game, id: string) {
  if (!game.player.actor.alive || !inUseReach(game, id)) return;
  const { scenario } = game;
  const tribute = scenario?.run.get('tribute');
  if (tribute?.recover(id)) {
    ui.setHealth(game.player.health);
    ui.toast(
      `Royal tribute secured · ${tribute.recovered} of 4 recovered (+10 health). Delivered crates remain lost.`,
    );
    return;
  }
  const target = emberSite(game, id);
  if (target) {
    const { ember, kind: site } = target;
    if (site === 'focus') {
      if (ember.disableFocus()) {
        const evidence = {
          id: 'ember:focus-disabled',
          kind: 'landmark' as const,
          subjectId: ember.sites.focus.id,
          title: 'Profaning focus disabled',
          description:
            'You disabled the smithy focus. Unfinished profanation cannot resume; completed corruption is not undone.',
          factIds: [],
        };
        ui.toast(evidence.description);
        discoveryRecord().present(evidence, game.playTime);
      } else ui.toast(ember.prompt(site));
    } else {
      const evidence = ember.shrineEvidence();
      ui.toast(evidence.description, 6500);
      discoveryRecord().present(evidence, game.playTime);
      ember.startHero();
    }
    return;
  }
  const e = game.ecs.get(id)?.get('interaction');
  if (!e) return;
  if (e.inspection) {
    game.inspection.open(e.inspection);
    return;
  }
  if (e.type === 'door') {
    if (doorRefusal(game, e)) return;
    e.open = !e.open;
    if (!e.open) required(e.collider, 'Door collider missing').checkCollisions = true;
  } else if (scenario && e.type === 'altar') {
    scenario.progression.send({ type: 'KINDLE' });
    recordEvent({ kind: 'altar-kindled', subjectId: 'altar', label: 'The violet altar' });
    game.player.health = 100;
    ui.setHealth(100);
    game.checkpoint = {
      ...e.approach,
      h: required(
        heightAt(game.world, e.approach.x, e.approach.z),
        'Checkpoint needs floor support',
      ),
    };
    for (const door of game.world.entities) {
      if (door.type === 'door' && door.locked) {
        door.locked = false;
        door.seal?.setEnabled(false);
      }
    }
    required(e.crystal, 'Altar crystal missing').scaling.setAll(1.25);
    ui.altar();
    ui.toast('The oath is rekindled. The crowned chamber is unsealed.', 6000);
  } else if (scenario && e.type === 'throne') {
    if (game.complete) {
      ui.toast('The keep is yours. There are still quiet corners to explore.');
      return;
    }
    if (!game.active) {
      ui.toast('The crown waits for the altar’s flame.');
      return;
    }
    scenario.progression.send({ type: 'CLAIM' });
    recordEvent({ kind: 'crown-claimed', subjectId: 'throne', label: 'The Hollow Crown' });
    resetMovement();
    ui.complete(game.playTime, game.chests);
  } else if (scenario && e.type === 'chest' && !e.open) {
    e.open = true;
    recordEvent({
      kind: 'reliquary-claimed',
      subjectId: e.id,
      label: `Reliquary · ${scenario.world.roomById[e.room].name}`,
    });
    game.chests++;
    game.player.health = Math.min(100, game.player.health + 30);
    ui.setHealth(game.player.health);
    ui.toast(`A forgotten relic. ${game.chests} of 3 recovered. Your resolve is restored.`);
  }
}

function tick(dt: number): void {
  if (!game || !ui.ready || paused() || game.inspection.active) return;
  enemyProfile?.work.tick();
  const cpu = import.meta.env.DEV ? cpuTiming : null;
  const cpuStart = cpu?.clock() ?? 0;
  game.time += dt;
  game.playTime += dt;
  game.steps++;
  const healthBefore = game.player.health;
  const jump = game.player.actor.jump;
  if (keys.has('Space') && !jump.held) requestJump(game.player.actor);
  jump.held = keys.has('Space');
  updateDoors(game.ecs, dt);
  game.routeBudget.tick();
  const { scenario } = game;
  const ember = scenario?.run.get('lastEmber');
  const tribute = scenario?.run.get('tribute');
  const emberWarning = ember?.approachActivation(),
    tributeWarning = tribute?.approachActivation();
  if (emberWarning || tributeWarning)
    ui.toast(
      [
        emberWarning
          ? 'Last Ember threatened: six 20-second rites at the smithy. Restore the shrine or disable its focus.'
          : '',
        tributeWarning
          ? 'Royal tribute threatened: kobold porters carry four crates from the stairs cache to the stable hatch. Intercept them; E recovers loose cargo.'
          : '',
      ]
        .filter(Boolean)
        .join(' '),
      10000,
    );
  tribute?.update(enemyProfile?.mode !== 'decisions', enemyProfile?.work);
  const work = scenario?.run.get('objectiveWork');
  work?.advance(game.steps, dt);
  const locked = game.combat.pursue(game.player.actor, dt);
  const tile = movePlayer(game.player, game.world, travel.gait, dt, locked);
  game.combat.update(dt);
  const room = tile?.room && game.world.roomById[tile.room];
  if (room) ui.room(room, game.playTime);
  game.damageCooldown -= dt;
  if (tile?.surface === 'lava' && !game.player.actor.jump.airborne && game.damageCooldown <= 0) {
    game.combat.damage(game.player.actor, 18);
    game.damageCooldown = 0.6;
  }
  // COMMIT BOUNDARY: movement, attacks/projectiles and hazards have all resolved.
  // Validate before respawn can make a killed hero appear eligible again.
  const outcome = work?.commit(game.steps);
  if (ember && outcome) {
    const reward = ember.reward;
    ember.consume(outcome.outcomes);
    if (ember.reward > reward) {
      const evidence = ember.shrineEvidence();
      discoveryRecord().present(evidence, game.playTime);
      ui.toast(evidence.description, 6500);
    }
  }
  if (game.player.health > healthBefore) ui.setHealth(game.player.health);
  if (game.player.health < healthBefore) {
    ui.setHealth(game.player.health);
    ui.damage();
  }
  if (game.player.health <= 0) {
    resetMovement();
    game.player.actor.entity.remove('corpse');
    game.player.actor.attack.reset();
    game.player.teleport(game.checkpoint.x, game.checkpoint.z, game.world);
    game.player.health = 100;
    game.player.actor.health.invulnerable = 2.5;
    ui.setHealth(100);
    game.damageCooldown = 1;
    ui.toast('You fall. The last safe flame calls you back.', 4500);
  }
  animateActors(game.ecs, dt, game.time, game.world, enemyProfile?.mode, enemyProfile?.work);
  game.enemyRendering.update();
  for (const entity of game.ecs.query('interaction')) {
    const e = entity.require('interaction');
    if (e.type === 'chest') animateChest(e, dt);
  }
  advanceUse(game);
  cpu?.finish('main.tick', cpuStart);
}

function renderUpdate(dt: number): void {
  const game = currentGame();
  if (!game) return;
  const cpu = import.meta.env.DEV ? cpuTiming : null;
  const cpuStart = cpu?.clock() ?? 0;
  const { player, camera, sun, materials, dungeon } = game;
  if (game.inspection.active) game.inspection.update(dt);
  else {
    camera.alpha += (game.desiredAlpha - camera.alpha) * (1 - Math.exp(-7 * dt));
    game.logicalRadius += (game.desiredRadius - game.logicalRadius) * (1 - Math.exp(-8 * dt));
    game.visualTrial.apply(visualTrial.settings, game.logicalRadius, false);
    const p = player.actor.position;
    const target = new Vector3(p.x, p.h + 0.75, p.z);
    Vector3.LerpToRef(camera.target, target, 1 - Math.exp(-7 * dt), camera.target);
  }
  sun.position.copyFrom(player.root.position).addInPlace(new Vector3(14, 20, 8));
  for (const name of ['water', 'lava', 'flame', 'violetFlame', 'magic'] as const)
    materials[name].setFloat('time', game.time);
  dungeon.particles.forEach((p, i) => {
    const life = (game.time * p.speed + p.phase) % 1.7,
      o = i * 16;
    const size = 0.035 * (1 - life / 1.7);
    dungeon.sparkMatrices[o] = dungeon.sparkMatrices[o + 5] = dungeon.sparkMatrices[o + 10] = size;
    dungeon.sparkMatrices[o + 12] = p.x + Math.sin(game.time * 1.2 + p.phase) * life * 0.15;
    dungeon.sparkMatrices[o + 13] = p.y + life;
    dungeon.sparkMatrices[o + 14] = p.z + Math.cos(game.time + p.phase) * life * 0.15;
  });
  if (dungeon.particles.length) updateInstanceMatrices(dungeon.sparkMesh, dungeon.sparkMatrices);
  for (const entity of game.ecs.query('floating')) {
    const a = entity.require('floating');
    a.mesh.position.y = a.y + Math.sin(game.time * 1.6 + a.phase) * 0.12;
    a.mesh.rotation.y = game.time * a.spin;
    a.mesh.rotation.z = Math.sin(game.time + a.phase) * 0.08;
  }
  for (const entity of game.ecs.query('ambientMotion')) {
    const creature = entity.require('ambientMotion');
    creature.root.scaling.y = 1 + Math.sin(game.time * 1.4 + creature.phase) * 0.018;
    creature.head.rotation.y = Math.sin(game.time * 0.7 + creature.phase) * 0.08;
    creature.tail.rotation.y = Math.sin(game.time * 1.1 + creature.phase) * 0.14;
  }
  for (const entity of game.ecs.query('cutaway')) {
    const wall = entity.require('cutaway');
    const facing = wall.dx * Math.cos(camera.alpha) + wall.dz * Math.sin(camera.alpha);
    const desired = facing > 0.15 ? 0.05 : 1;
    wall.scale += (desired - wall.scale) * (1 - Math.exp(-9 * dt));
    for (const mesh of wall.meshes) mesh.scaling.y = wall.scale;
  }
  for (const entity of game.ecs.query('portrait')) {
    const portrait = entity.require('portrait');
    const facing = portrait.dx * Math.cos(camera.alpha) + portrait.dz * Math.sin(camera.alpha);
    portrait.root.setEnabled(portrait.inspected || facing <= 0.15);
  }
  if (game.steps % 12 === 0 || game.nearLights.length === 0) {
    game.nearLights = game.ecs
      .query('lightSource')
      .map((entity) => entity.require('lightSource'))
      .sort(
        (a, b) =>
          Vector3.DistanceSquared(a.position, player.root.position) -
          Vector3.DistanceSquared(b.position, player.root.position),
      )
      .slice(0, 3);
    game.shadowMap.renderList = game.shadowCasters.filter((mesh) => {
      // Animated hero parts always cast, even immediately after a room transition.
      if (game.heroCasters.has(mesh)) return true;
      const center = mesh.getBoundingInfo().boundingSphere.centerWorld;
      return Math.hypot(center.x - player.root.position.x, center.z - player.root.position.z) < 23;
    });
  }
  dungeon.lightPool.forEach((light, i) => {
    const source = game.nearLights[i];
    if (!source) return;
    light.position.copyFrom(source.position);
    light.diffuse.copyFrom(source.color);
    light.intensity =
      1.5 +
      Math.sin(game.time * 7 + source.phase) * 0.12 +
      Math.sin(game.time * 13 + source.phase) * 0.06;
  });
  game.nearest = game.inspection.active ? null : findInteraction();
  const { scenario } = game;
  const ember = scenario?.run.get('lastEmber');
  const emberSite = !game.inspection.active && ember?.nearby();
  const tribute = scenario?.run.get('tribute');
  ui.prompt(
    !game.inspection.active && tribute?.nearby()
      ? 'Recover royal tribute (+10 health)'
      : ember && emberSite
        ? ember.prompt(emberSite)
        : promptFor(game.nearest),
  );
  if (scenario) {
    const worker = ember ? game.combat.actor(EMBER.worker) : undefined;
    ui.agenda([
      ...(tribute?.agenda() ?? []),
      ...(ember?.agenda(!!worker && observesActor(worker)) ?? []),
    ]);
    scenario.emberRendering.update();
    scenario.tributeRendering.update();
  }
  const target = game.combat.actor(game.player.actor.attack.target);
  ui.combatTarget(target && observesActor(target) ? target : null, game.playTime);
  const record = discoveryRecord();
  for (const actor of game.combat.enemies) {
    const identity = actor.entity.get('inhabitant');
    if (
      identity &&
      actor.entity.has('corpse') &&
      !record.hasEvent('death-witnessed', identity.id) &&
      !record.hasEvent('remains-found', identity.id) &&
      observesActor(actor)
    )
      recordEvent(
        { kind: 'remains-found', subjectId: identity.id, label: observedLabel(actor) },
        true,
      );
  }
  cpu?.finish('main.presentation', cpuStart);
  refreshPreview(game);
}

function toggleMenu() {
  if (!game || !ui.ready) return;
  resetMovement();
  if (ui.victory.open) return;
  game?.inspection.close({ immediate: true });
  if (game) ui.refreshRecord();
  ui.transition({ type: 'TOGGLE_MENU' });
  if (ui.menu.open) pauseEnemyProfile();
  if (!ui.menu.open) canvas.focus();
}
window.addEventListener('keydown', (event) => {
  if (fromVisualTrial(event.target)) return;
  if (import.meta.env.DEV && event.code === 'F2') {
    event.preventDefault();
    if (!game || !ui.ready || event.repeat) return;
    resetMovement();
    inspector.send({ type: 'TOGGLE' });
    inspectorToken?.dispose();
    inspectorToken = null;
    if (inspector.snapshot.matches('loading')) {
      const request = inspector.snapshot.context.request;
      const scene = game.scene;
      import('@babylonjs/inspector')
        .then(({ ShowInspector }) => {
          if (
            scene !== game?.scene ||
            !inspector.snapshot.matches('loading') ||
            inspector.snapshot.context.request !== request
          )
            return;
          inspectorToken = ShowInspector(scene);
          inspector.send({ type: 'RESOLVE', request });
        })
        .catch((error) => {
          if (
            scene !== game?.scene ||
            !inspector.snapshot.matches('loading') ||
            inspector.snapshot.context.request !== request
          )
            return;
          inspector.send({ type: 'REJECT', request });
          console.error(error);
          ui.toast('Could not open the development inspector.');
        });
    }
    return;
  }
  if (event.code === 'KeyF') {
    const gameplay =
      !nativeControl(event.target) && !event.metaKey && !event.ctrlKey && !event.altKey;
    if (gameplay) event.preventDefault();
    if (gameplay && !event.repeat) keys.add(event.code);
    if (game)
      requestDefense(
        game.player.actor,
        event.repeat,
        gameplay && ui.ready && !paused() && !game.inspection.active,
      );
    return;
  }
  if (game?.inspection.active) {
    if (gameKeys.has(event.code) || event.code === 'Escape') event.preventDefault();
    if (!event.repeat && ['Escape', 'KeyE'].includes(event.code)) game.inspection.close();
    return;
  }
  if (event.code === 'Escape') {
    event.preventDefault();
    toggleMenu();
    return;
  }
  if (paused() || nativeControl(event.target) || event.metaKey || event.ctrlKey || event.altKey)
    return;
  if (event.code === 'KeyT') {
    if (!event.repeat && !event.shiftKey && requestPractice('reset')) event.preventDefault();
    return;
  }
  // Cancel native text/press-and-hold actions on every event, including repeats.
  // Keep editable fields and browser shortcuts outside gameplay input handling.
  if (gameKeys.has(event.code)) event.preventDefault();
  // A held key cleared at a scene boundary cannot send new intent until pressed again.
  if (event.repeat || !game || !ui.ready || keys.has(event.code)) return;
  if (gameKeys.has(event.code)) keys.add(event.code);
  if (event.code === 'Space') requestJump(game.player.actor);
  if (event.code === 'KeyE') interact();
  if (!event.shiftKey && event.code === 'BracketLeft') game.desiredAlpha -= Math.PI / 2;
  if (!event.shiftKey && event.code === 'BracketRight') game.desiredAlpha += Math.PI / 2;
  if (!event.shiftKey && event.code === 'KeyR')
    travel = travelControl(travel, { type: 'down', repeat: event.repeat });
  if (event.code === 'KeyM') ui.transition({ type: 'TOGGLE_MAP' });
});
window.addEventListener('keyup', (event) => {
  const held = keys.delete(event.code);
  if (event.code === 'KeyR') travel = travelControl(travel, { type: 'up' });
  if (event.code === 'KeyF' && (held || !fromVisualTrial(event.target)))
    game?.player.actor.entity.get('defense')?.release();
});
window.addEventListener('blur', () => {
  pauseEnemyProfile();
  resetMovement('input-lost');
});
window.addEventListener('pagehide', (event) => {
  pauseEnemyProfile();
  resetMovement('input-lost');
  // Release GPU resources promptly on a real reload/navigation. A page retained
  // by the back/forward cache keeps its engine so it can resume normally.
  if (!event.persisted) {
    currentRequest = null;
    if (import.meta.env.DEV) {
      animationReview?.reset();
      generationDiagnostics?.dispose();
    }
    ui.unload();
    retireGame();
    engine?.dispose();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseEnemyProfile();
  resetMovement(document.hidden ? 'input-lost' : 'cancel');
  ui.transition({ type: document.hidden ? 'HIDE' : 'SHOW' });
  last = performance.now();
  accumulator = 0;
});
canvas.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    if (game && !paused() && !game.inspection.active)
      game.desiredRadius = Math.max(
        18,
        Math.min(36, game.desiredRadius + Math.sign(event.deltaY) * 1.5),
      );
  },
  { passive: false },
);
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !event.isPrimary || event.ctrlKey || event.metaKey || event.altKey)
    return;
  if (!game || !ui.ready || paused() || game.inspection.active) return;
  if (!pointerSample(game, event.clientX, event.clientY)) return;
  event.preventDefault();
  canvas.focus();
  pointer.send({
    type: 'DOWN',
    pointer: { id: event.pointerId, x: event.clientX, y: event.clientY },
    referenceHeight: game.player.actor.position.h,
  });
  navigatePointer(event.clientX, event.clientY, true);
});
canvas.addEventListener('pointerleave', () => {
  hoverPoint = null;
  clearPreview();
});
window.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'mouse' && event.target === canvas)
    hoverPoint = { x: event.clientX, y: event.clientY };
  pointer.send({
    type: 'MOVE',
    pointer: { id: event.pointerId, x: event.clientX, y: event.clientY },
    pressed: !!(event.buttons & 1),
  });
});
window.addEventListener('pointerup', (event) => {
  pointer.send({ type: 'UP', id: event.pointerId });
});
window.addEventListener('pointercancel', (event) => {
  if (pointer.snapshot.context.pointer?.id === event.pointerId) resetMovement();
});
window.addEventListener('resize', () => engine?.resize());
html('menu-button').onclick = toggleMenu;
html('reset-practice').onclick = () => requestPractice('reset');
html('start-practice-foe').onclick = () => requestPractice('startSingleFoe');
html('inspection-close').onclick = () => game?.inspection.close();
ui.inspection.addEventListener('cancel', (event) => {
  event.preventDefault();
  game?.inspection.close();
});
ui.menu.addEventListener('close', () => {
  if (!ui.menu.open) ui.transition({ type: 'CLOSE_MENU' });
  keys.clear();
  canvas.focus();
});
ui.menu.addEventListener('cancel', (event) => {
  event.preventDefault();
  toggleMenu();
});
html('rebuild').onclick = () => {
  const seed = element('seed-input', HTMLInputElement).value.trim();
  start(seed || freshSeed(), { pinSeed: !!seed });
};
html('regenerate').onclick = () => start(freshSeed());
const qualitySelect = element('quality', HTMLSelectElement);
qualitySelect.onchange = () => {
  if (qualitySelect.value === 'high' || qualitySelect.value === 'low') {
    quality = qualitySelect.value;
    applyQuality();
  }
};
html('continue').onclick = () => {
  ui.transition({ type: 'CONTINUE' });
  canvas.focus();
};
html('another-run').onclick = () => start(freshSeed());
retryButton.onclick = () => {
  if (retryRequest && ui.flow.snapshot.matches({ mode: 'failed' }))
    start(retryRequest.seed, retryRequest);
};

try {
  if (!Engine.isSupported())
    throw new Error(
      'WebGL is unavailable. Open this demo in a desktop browser with hardware acceleration enabled.',
    );
  engine = new DungeonEngine(canvas, true, { stencil: true, preserveDrawingBuffer: false }, false);
  if (engine.webGLVersion < 2)
    throw new Error(
      'This dungeon requires WebGL2. Please use a current desktop Chrome or Firefox.',
    );
  // An ordinary seed link reproduces a world only on navigation. The opt-in
  // comparison pins its entrance on both navigation and refresh.
  const navigation = performance.getEntriesByType('navigation')[0];
  const reloading =
    navigation instanceof PerformanceNavigationTiming && navigation.type === 'reload';
  const launch = launchProfile({
    variants: entry.getAll('enemyProfile'),
    practice: requestedRoom === 'practice',
    seed: entry.get('seed'),
    reloading,
  });
  engine.runRenderLoop(() => {
    engine._drawCalls.fetchNewFrame();
    const now = performance.now(),
      dt = Math.min(0.08, (now - last) / 1000);
    last = now;
    if (!game) return;
    const profile = enemyProfile;
    if (profile?.scene === game.scene && profile.state.phase !== 'complete') {
      if (
        ui.ready &&
        !paused() &&
        !game.inspection.active &&
        !document.hidden &&
        document.hasFocus()
      ) {
        profile.state = transitionProfile(profile.state, {
          type: 'frame',
          now,
          work: profile.work.begin(),
          fps: engine.getFps(),
        });
        if (profile.state.phase !== 'sampling') profile.work.stop();
      } else pauseEnemyProfile();
    }
    if (ui.ready && !paused()) {
      if (game.inspection.active) accumulator = 0;
      else {
        const heldPointer = pointer.snapshot.context.pointer;
        if (
          heldPointer &&
          pointer.snapshot.matches('floor') &&
          now - lastPointerRoute >= 120 &&
          document.elementFromPoint(heldPointer.x, heldPointer.y) === canvas
        )
          navigatePointer(heldPointer.x, heldPointer.y);
        accumulator += dt * (import.meta.env.DEV ? (animationReview?.speed ?? 1) : 1);
        while (accumulator >= 1 / 60) {
          tick(1 / 60);
          accumulator -= 1 / 60;
        }
      }
      renderUpdate(dt * (import.meta.env.DEV ? (animationReview?.speed ?? 1) : 1));
    } else accumulator = 0;
    if (import.meta.env.DEV) animationReview?.prepare();
    game.scene.render();
    if (import.meta.env.DEV) animationReview?.draw();
    ui.updateFeedback(now);
    uiClock += dt;
    if (uiClock > 0.12) {
      ui.update(game.player, engine.getFps());
      if (profile?.scene === game.scene && profile === enemyProfile)
        profile.display.update(profile.state, now);
      uiClock = 0;
    }
  });
  start(launch.seed, { pinSeed: !!launch.seed, mode: launch.mode });
} catch (error) {
  showFailure(error instanceof Error ? error.message : String(error));
  console.error(error);
}

// Opt-in diagnostics for reproducible browser checks, never enabled in normal play.
if (import.meta.env.DEV && debug && engine!) {
  const { createAnimationReview } = await import('./animationReview.ts');
  const { createCpuProfile } = await import('./cpuProfile.ts');
  animationReview = createAnimationReview(
    activeGame,
    () => {
      tick(1 / 60);
      renderUpdate(1 / 60);
    },
    () => {
      accumulator = 0;
    },
  );
  window.__dungeon = {
    cpu: createCpuProfile(
      engine,
      activeGame,
      (codes) => {
        keys.clear();
        for (const code of codes) keys.add(code);
        try {
          tick(1 / 60);
        } finally {
          keys.clear();
        }
      },
      renderUpdate,
      () => {
        last = performance.now();
        accumulator = 0;
      },
    ),
    animation: animationReview,
    visualTrial: {
      select: visualTrial.send,
      orbit(alpha, beta, radius) {
        const game = activeGame();
        game.camera.alpha = game.desiredAlpha = alpha;
        game.camera.beta = beta;
        game.logicalRadius = game.desiredRadius = radius;
        game.visualTrial.apply(visualTrial.settings, radius, game.inspection.active);
      },
    },
    get game() {
      return activeGame();
    },
    get ready() {
      return ui.ready;
    },
    get engine() {
      return engine;
    },
    teleport(x, z) {
      const game = activeGame();
      resetMovement();
      game.player.teleport(x, z, game.world);
      game.camera.target.copyFrom(game.player.root.position);
    },
    interact,
    pickedObjectAt(clientX, clientY) {
      const current = activeGame();
      const ray = pointerRay(current, clientX, clientY);
      if (!ray) return null;
      const pick = pickPointer(current, ray);
      return pick.kind === 'object' ? pick.id : null;
    },
    regenerate: start,
    generationReport() {
      return structuredClone(required(initialGenerationReport, 'Generation report unavailable'));
    },
    generationExecution() {
      return required(generationDiagnostics, 'Generation diagnostics unavailable').snapshot();
    },
    failNextGeneration() {
      failNextGeneration = true;
    },
    step(codes, frames = 1) {
      if (!game || !ui.ready) return;
      const injected = codes.filter((code) => !keys.has(code));
      for (const code of injected) keys.add(code);
      for (let i = 0; i < frames; i++) tick(1 / 60);
      for (const code of injected) keys.delete(code);
      renderUpdate(1 / 60);
    },
    snapshot() {
      const game = activeGame();
      return {
        seed: game.world.seed,
        position: game.player.root.position.asArray(),
        health: game.player.health,
        active: game.active,
        complete: game.complete,
        room: ui.roomId,
        meshes: game.scene.meshes.length,
        materials: game.scene.materials.length,
        textures: game.scene.textures.length,
        effects: engine.cachedEffectCount,
        shaderSources: Object.keys(Effect.ShadersStore).filter((k) => k.startsWith('custom_'))
          .length,
        drawCalls: engine._drawCalls.current,
        triangles: game.scene.meshes.reduce((n, m) => n + m.getTotalIndices() / 3, 0),
        fps: engine.getFps(),
        doors: game.world.entities
          .filter((e) => e.type === 'door')
          .map((e) => ({ id: e.id, open: e.open, locked: e.locked })),
        errors: game.scenario ? validateDungeon(game.scenario.world) : [],
      };
    },
  };
}
