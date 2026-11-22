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
import { generateDungeonWithReport, validateDungeon, tileAt, heightAt } from './world.ts';
import { createGenerationReport } from './generation/report.ts';
import type { GenerationReport } from './generation/report.ts';
import { createMaterials } from './materials.ts';
import { buildDungeon } from './buildDungeon.ts';
import { createPlayer, movePlayer, stopPlayer } from './player.ts';
import { pickGround } from './navigation.ts';
import { MOVEMENT_KEYS } from './locomotion.ts';
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
import { generationIdentity } from './generation/identity.ts';
import { CameraObservation, updateInstanceMatrices } from './observation.ts';
import { animateActors, ACTOR_OBSERVATION_RADIUS } from './actorRendering.ts';
import { cpuTiming } from './cpuMetrics.ts';
import { createEnemyRendering } from './enemyRendering.ts';
import { registerWorld, registerDungeonRendering, updateDoors } from './worldEntities.ts';
import { UI } from './ui.ts';
import { InspectionController } from './inspection.ts';
import { Statechart } from './machines/statechart.ts';
import { animateChest, progressionMachine } from './machines/world/interactions.ts';
import { pointerMachine } from './machines/ui/pointer.ts';
import { inspectorMachine } from './machines/ui/inspector.ts';
import { required } from './assert.ts';
import { element, html } from './dom.ts';
import type { ShowInspector } from '@babylonjs/inspector';
import type { Entity } from './worldTypes.ts';
import type { Game } from './gameTypes.ts';

const canvas = element('game', HTMLCanvasElement);
const loading = html('loading');
const ui = new UI(),
  keys = new Set<string>();
const gameKeys = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyE',
  'KeyF',
  'KeyQ',
  'KeyR',
  'KeyM',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
  'Space',
  'KeyX',
]);
const editingText = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || !!target.closest('input,textarea,select'));
let engine: DungeonEngine, game: Game;
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

function resetMovement(): void {
  keys.clear();
  pointer.send({ type: 'CANCEL' });
  if (game) {
    stopPlayer(game.player);
    game.enemyRendering.update();
    ui.combatTarget(null);
  }
}

function navigatePointer(clientX: number, clientY: number, initialPress = false): void {
  if (!ui.ready || paused() || game.inspection.active) return;
  const rect = canvas.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom)
    return;
  cancelWork(game.player.actor);
  const ray = game.scene.createPickingRay(
    clientX - rect.left,
    clientY - rect.top,
    Matrix.Identity(),
    game.camera,
  );
  if (initialPress) {
    const enemy = game.enemyRendering.pick(ray);
    const doors = game.ecs
      .query('door')
      .map((entity) => entity.require('door'))
      .filter((door) => !door.open || door.collider?.checkCollisions);
    const doorHit = game.scene.pickWithRay(ray, (mesh) =>
      doors.some((door) => door.collider === mesh),
    );
    const door = doors.find((door) => door.collider === doorHit?.pickedMesh);
    if (door && (!enemy || (doorHit?.distance ?? Infinity) < enemy.distance)) {
      pointer.send({ type: 'SELECT_TARGET' });
      if (!game.combat.requestDoor(game.player.actor, door.id)) {
        resetMovement();
        ui.toast('The gate remembers an oath. Kindle the violet altar.');
      }
      return;
    }
    if (enemy) {
      pointer.send({ type: 'SELECT_TARGET' });
      game.combat.target(game.player.actor, enemy.actor);
      return;
    }
    cancelAttack(game.player.actor);
  }
  const point = pickGround(game.world, ray);
  if (point) {
    if (initialPress)
      game.player.navigator.goTo(game.player.actor.position, point, { partial: true });
    else game.player.navigator.followFloor(game.player.actor.position, point, performance.now());
  } else game.player.navigator.cancel();
  lastPointerRoute = performance.now();
}

function freshSeed() {
  return `ASH-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().slice(0, 6)}`;
}
function paused() {
  return ui.paused;
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
  return required(game.ecs.get('run'), 'Run entity missing').require('discoveries');
}

/** Player perception and actual rendered camera visibility must both permit observation. */
function observesActor(actor: Actor): boolean {
  if (!ui.ready || paused() || game.inspection.active || !game.player.actor.alive) return false;
  const player = game.player.actor.position;
  if (actor.entity.get('ragdoll')?.mode === 'separated') {
    return game.observation.visible(
      actor.entity.require('render'),
      actor.entity.require('rigPose').bodyMeshes,
      (point) =>
        Math.hypot(player.x - point.x, player.z - point.z) <= 8 &&
        clearSight(game.world, player, {
          x: point.x,
          z: point.z,
          h: heightAt(game.world, point.x, point.z) ?? actor.position.h,
        }),
    );
  }
  const position = actor.position;
  if (
    Math.hypot(player.x - position.x, player.z - position.z) > 8 ||
    !actor.entity.get('render')?.root?.isEnabled() ||
    !clearSight(game.world, player, position)
  )
    return false;
  return game.observation.visible(actor.entity.require('render'));
}

function observedLabel(actor: Actor): string {
  const identity = actor.entity.get('inhabitant');
  return identity && discoveryRecord().hasDiscovery(identity.id)
    ? `${identity.name}, ${identity.title}`
    : `a ${actor.kind}`;
}

function recordEvent(event: ObservedEvent, notify = false): void {
  const record = discoveryRecord();
  if (record.recordEvent(event, game.playTime) && notify) {
    const entry = record.snapshot().events.at(-1);
    if (entry) ui.toast(entry.description);
  }
}

function observeDeath(victim: Actor, source?: Actor): void {
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

function start(seed: string, { pinSeed = false }: { pinSeed?: boolean } = {}): void {
  if (import.meta.env.DEV) animationReview?.reset();
  initialGenerationReport = null;
  ui.transition({ type: 'LOAD' });
  resetMovement();
  accumulator = 0;
  last = performance.now();
  inspectorToken?.dispose();
  inspectorToken = null;
  inspector.send({ type: 'CLOSE' });
  if (game) {
    game.ecs.get('run')?.get('objectiveWork')?.retire();
    game.inspection.dispose();
    const shaderNames = game.scene.materials
      .filter((m): m is CustomMaterial => m instanceof CustomMaterial)
      .map((m) => m._createdShaderName)
      .filter(Boolean);
    game.scene.dispose();
    engine.releaseEffects();
    for (const name of shaderNames) {
      delete Effect.ShadersStore[`${name}VertexShader`];
      delete Effect.ShadersStore[`${name}PixelShader`];
    }
  }
  const { world, report } = generateDungeonWithReport(seed);
  const errors = validateDungeon(world);
  if (errors.length) throw new Error(`Dungeon validation failed: ${errors.join(', ')}`);
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('debug'))
    initialGenerationReport = createGenerationReport(world, report);
  const scene = new Scene(engine);
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
  camera.fov = 0.65;
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
  const materials = createMaterials(scene);
  const dungeon = buildDungeon(scene, world, materials, shadow, glow);
  const ecs = new ECS();
  const discoveries = new DiscoveryRecord(generationIdentity(seed));
  ecs.create('run').add('discoveries', discoveries);
  registerWorld(ecs, world);
  registerDungeonRendering(ecs, dungeon);
  const player = createPlayer(scene, materials, shadow, world, ecs);
  const combat = new CombatSystem(
    ecs,
    world,
    [player.actor, ...seedEnemies(ecs, world)],
    world.seed,
    { onDeath: observeDeath },
  );
  const emberPlan = prepareLastEmber(ecs, world, player.actor);
  const tributePlan = prepareTribute(ecs, world, player.actor);
  installObjectiveWork(
    ecs,
    world,
    {
      objectives: [...emberPlan.plan.objectives, ...tributePlan.plan.objectives],
      races: [...emberPlan.plan.races, ...tributePlan.plan.races],
    },
    [...emberPlan.bindings, ...tributePlan.bindings],
  );
  const ember = emberPlan.scenario;
  const emberRendering = createLastEmberRendering(scene, ecs, materials);
  const tributeRendering = createTributeRendering(scene, ecs, materials, shadow);
  const clue = world.entities.find((e) => e.id === ember.sites.clue.id);
  if (clue?.inspection) clue.inspection.description += `\n\n${emberClue(world).description}`;
  const enemyRendering = createEnemyRendering(scene, combat, materials, shadow);
  // Render batches can serve many logical tiles/props without duplicating geometry.
  const actorMeshes = new Set(
    ecs.query('render').flatMap((entity) => entity.require('render').meshes),
  );
  for (const mesh of scene.meshes)
    if (!actorMeshes.has(mesh))
      ecs.create(`render:${mesh.uniqueId}`).add('render', { root: null, meshes: [mesh] });
  const shadowMap = required(shadow.getShadowMap(), 'Shadow map unavailable');
  const shadowCasters = [...(shadowMap.renderList ?? [])];
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
      resetMovement();
      accumulator = 0;
      playerVisibility = { root: player.root.isEnabled(), marker: player.marker.isEnabled() };
      player.root.setEnabled(false);
      player.marker.setEnabled(false);
      ui.openInspection(target, game.playTime);
      if (target.id === ember.sites.clue.id) discoveries.present(emberClue(world), game.playTime);
    },
    onClose: () => {
      keys.clear();
      accumulator = 0;
      player.root.setEnabled(playerVisibility.root);
      player.marker.setEnabled(playerVisibility.marker);
      game.desiredAlpha = camera.alpha;
      game.desiredRadius = camera.radius;
      ui.closeInspection();
      canvas.focus();
    },
  });
  const progression = new Statechart(progressionMachine);
  for (const entity of world.entities)
    if (entity.type === 'altar')
      Object.defineProperty(entity, 'active', {
        enumerable: true,
        get: () => !progression.snapshot.matches('seekingAltar'),
      });
  game = {
    scene,
    world,
    camera,
    ambient,
    sun,
    shadow,
    shadowMap,
    shadowCasters,
    heroCasters: new Set(player.shadowMeshes),
    glow,
    fxaa,
    materials,
    dungeon,
    player,
    ecs,
    combat,
    enemyRendering,
    emberRendering,
    tributeRendering,
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
    progression,
    get active() {
      return !progression.snapshot.matches('seekingAltar');
    },
    get complete() {
      return progression.snapshot.matches('complete');
    },
    chests: 0,
    checkpoint: { ...world.spawn },
    damageCooldown: 0,
    nearest: null,
    steps: 0,
    nearLights: [],
  };
  ui.reset(world, discoveries);
  applyQuality();
  // Random runs must not write a seed back into the URL and pin future loads.
  const url = new URL(location.href);
  if (pinSeed) url.searchParams.set('seed', seed);
  else url.searchParams.delete('seed');
  history.replaceState(null, '', url);
  scene.executeWhenReady(() => {
    if (scene !== game.scene) return;
    ui.transition({ type: 'READY' });
    loading.classList.add('done');
    ui.room(world.roomById.entrance, game.playTime);
    canvas.focus();
    ui.toast(
      'Click an enemy to pursue and attack. Hold F to defend. Space jumps. X cancels commands.',
      6500,
    );
  });
}

function lineOfSight(entity: Entity): boolean {
  const p = game.player.root.position,
    dx = entity.x - p.x,
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
function findInteraction(): Entity | null {
  const p = game.player.root.position;
  return (
    game.ecs
      .query('interaction')
      .map((entity) => entity.require('interaction'))
      .map((e) => ({ e, d: Math.hypot(e.x - p.x, e.z - p.z) }))
      .filter(
        ({ e, d }) =>
          d < (e.type === 'altar' || e.type === 'throne' ? 3.1 : 2.6) &&
          Math.abs(e.h - p.y) < 1.4 &&
          lineOfSight(e),
      )
      .sort((a, b) => a.d - b.d)[0]?.e || null
  );
}
function promptFor(e: Entity | null): string {
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
  if (!ui.ready || paused()) return;
  if (game.inspection.active) {
    game.inspection.close();
    return;
  }
  const tribute = game.ecs.get('run')?.get('tribute');
  if (tribute?.recover()) {
    ui.setHealth(game.player.health);
    ui.toast(
      `Royal tribute secured · ${tribute.recovered} of 4 recovered (+10 health). Delivered crates remain lost.`,
    );
    return;
  }
  const ember = game.ecs.get('run')?.get('lastEmber');
  const site = ember?.nearby();
  if (ember && site) {
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
  const e = findInteraction();
  if (!e) return;
  if (e.inspection) {
    game.inspection.open(e.inspection);
    return;
  }
  if (e.type === 'door') {
    if (e.locked) {
      ui.toast('The gate remembers an oath. Kindle the violet altar.');
      return;
    }
    const p = game.player.root.position;
    // Reserve the full swing area, not just the doorway plane.
    if (
      e.open &&
      ((Math.abs(p.x - e.x) < 1.9 && Math.abs(p.z - e.z) < 1.9) ||
        game.combat.enemies.some(
          (a) =>
            a.alive && Math.abs(a.position.x - e.x) < 1.9 && Math.abs(a.position.z - e.z) < 1.9,
        ))
    ) {
      ui.toast('Step clear of the doorway before closing it.');
      return;
    }
    e.open = !e.open;
    if (!e.open) required(e.collider, 'Door collider missing').checkCollisions = true;
  } else if (e.type === 'altar') {
    game.progression.send({ type: 'KINDLE' });
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
  } else if (e.type === 'throne') {
    if (game.complete) {
      ui.toast('The keep is yours. There are still quiet corners to explore.');
      return;
    }
    if (!game.active) {
      ui.toast('The crown waits for the altar’s flame.');
      return;
    }
    game.progression.send({ type: 'CLAIM' });
    recordEvent({ kind: 'crown-claimed', subjectId: 'throne', label: 'The Hollow Crown' });
    resetMovement();
    ui.complete(game.playTime, game.chests);
  } else if (e.type === 'chest' && !e.open) {
    e.open = true;
    recordEvent({
      kind: 'reliquary-claimed',
      subjectId: e.id,
      label: `Reliquary · ${game.world.roomById[e.room].name}`,
    });
    game.chests++;
    game.player.health = Math.min(100, game.player.health + 30);
    ui.setHealth(game.player.health);
    ui.toast(`A forgotten relic. ${game.chests} of 3 recovered. Your resolve is restored.`);
  }
}

function tick(dt: number): void {
  if (!ui.ready || paused() || game.inspection.active) return;
  const cpu = import.meta.env.DEV ? cpuTiming : null;
  const cpuStart = cpu?.clock() ?? 0;
  game.time += dt;
  game.playTime += dt;
  game.steps++;
  const healthBefore = game.player.health;
  const jump = game.player.actor.jump;
  if (keys.has('Space') && !jump.held) requestJump(game.player.actor);
  jump.held = keys.has('Space');
  if ([...MOVEMENT_KEYS].some((key) => keys.has(key))) {
    cancelWork(game.player.actor);
    cancelAttack(game.player.actor);
  }
  updateDoors(game.ecs, dt);
  const ember = game.ecs.get('run')?.get('lastEmber');
  const tribute = game.ecs.get('run')?.get('tribute');
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
  tribute?.update();
  const work = game.ecs.get('run')?.get('objectiveWork');
  work?.advance(game.steps, dt);
  const locked = game.combat.pursue(game.player.actor, dt);
  const tile = movePlayer(game.player, game.world, keys, game.camera, dt, locked);
  game.combat.update(dt);
  if (tile?.room) ui.room(game.world.roomById[tile.room], game.playTime);
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
  animateActors(game.ecs, dt, game.time, game.world);
  game.enemyRendering.update();
  for (const entity of game.ecs.query('interaction')) {
    const e = entity.require('interaction');
    if (e.type === 'chest') animateChest(e, dt);
  }
  cpu?.finish('main.tick', cpuStart);
}

function renderUpdate(dt: number): void {
  const cpu = import.meta.env.DEV ? cpuTiming : null;
  const cpuStart = cpu?.clock() ?? 0;
  const { player, camera, sun, materials, dungeon } = game;
  if (game.inspection.active) game.inspection.update(dt);
  else {
    camera.alpha += (game.desiredAlpha - camera.alpha) * (1 - Math.exp(-7 * dt));
    camera.radius += (game.desiredRadius - camera.radius) * (1 - Math.exp(-8 * dt));
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
  updateInstanceMatrices(dungeon.sparkMesh, dungeon.sparkMatrices);
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
  const ember = game.ecs.get('run')?.get('lastEmber');
  const emberSite = !game.inspection.active && ember?.nearby();
  const tribute = game.ecs.get('run')?.get('tribute');
  ui.prompt(
    !game.inspection.active && tribute?.nearby()
      ? 'Recover royal tribute (+10 health)'
      : ember && emberSite
        ? ember.prompt(emberSite)
        : promptFor(game.nearest),
  );
  const worker = ember ? game.combat.actor(EMBER.worker) : undefined;
  ui.agenda([
    ...(tribute?.agenda() ?? []),
    ...(ember?.agenda(!!worker && observesActor(worker)) ?? []),
  ]);
  game.emberRendering.update();
  game.tributeRendering.update();
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
}

function toggleMenu() {
  resetMovement();
  if (ui.victory.open) return;
  game?.inspection.close({ immediate: true });
  if (game) ui.refreshRecord();
  ui.transition({ type: 'TOGGLE_MENU' });
  if (!ui.menu.open) canvas.focus();
}
window.addEventListener('keydown', (event) => {
  if (import.meta.env.DEV && event.code === 'F2') {
    event.preventDefault();
    if (!ui.ready || event.repeat) return;
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
            scene !== game.scene ||
            !inspector.snapshot.matches('loading') ||
            inspector.snapshot.context.request !== request
          )
            return;
          inspectorToken = ShowInspector(scene);
          inspector.send({ type: 'RESOLVE', request });
        })
        .catch((error) => {
          if (
            scene !== game.scene ||
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
      !editingText(event.target) && !event.metaKey && !event.ctrlKey && !event.altKey;
    if (gameplay) event.preventDefault();
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
  if (paused() || editingText(event.target) || event.metaKey || event.ctrlKey || event.altKey)
    return;
  // Cancel native text/press-and-hold actions on every event, including repeats.
  // Keep editable fields and browser shortcuts outside gameplay input handling.
  if (gameKeys.has(event.code)) event.preventDefault();
  if (MOVEMENT_KEYS.has(event.code)) {
    if (game) cancelWork(game.player.actor);
    pointer.send({ type: 'CANCEL' });
    game?.player.navigator.cancel();
    if (game) {
      cancelAttack(game.player.actor);
    }
  }
  if (event.code === 'KeyX') {
    game?.player.actor.entity.get('defense')?.cancel();
    if (game) cancelWork(game.player.actor);
    keys.clear();
    pointer.send({ type: 'CANCEL' });
    game?.player.navigator.cancel();
    if (game) {
      cancelAttack(game.player.actor);
    }
    return;
  }
  keys.add(event.code);
  if (event.repeat || !game) return;
  if (event.code === 'Space') requestJump(game.player.actor);
  if (event.code === 'KeyE') interact();
  if (event.code === 'KeyQ') game.desiredAlpha -= Math.PI / 2;
  if (event.code === 'KeyR') game.desiredAlpha += Math.PI / 2;
  if (event.code === 'KeyM') ui.transition({ type: 'TOGGLE_MAP' });
});
window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
  if (event.code === 'KeyF') game?.player.actor.entity.get('defense')?.release();
});
window.addEventListener('blur', resetMovement);
window.addEventListener('pagehide', (event) => {
  resetMovement();
  // Release GPU resources promptly on a real reload/navigation. A page retained
  // by the back/forward cache keeps its engine so it can resume normally.
  if (!event.persisted) {
    inspector.send({ type: 'CLOSE' });
    inspectorToken?.dispose();
    inspectorToken = null;
    engine?.dispose();
  }
});
document.addEventListener('visibilitychange', () => {
  resetMovement();
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
  if (!ui.ready || paused() || game.inspection.active) return;
  event.preventDefault();
  canvas.focus();
  pointer.send({
    type: 'DOWN',
    pointer: { id: event.pointerId, x: event.clientX, y: event.clientY },
  });
  navigatePointer(event.clientX, event.clientY, true);
});
window.addEventListener('pointermove', (event) => {
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
  // Opening a seed link is reproducible; Refresh always begins a fresh descent,
  // including URLs containing seeds automatically written by older versions.
  const navigation = performance.getEntriesByType('navigation')[0];
  const reloading =
    navigation instanceof PerformanceNavigationTiming && navigation.type === 'reload';
  const requestedSeed = reloading
    ? null
    : new URLSearchParams(location.search).get('seed')?.trim().slice(0, 40);
  start(requestedSeed || freshSeed(), { pinSeed: !!requestedSeed });
  engine.runRenderLoop(() => {
    engine._drawCalls.fetchNewFrame();
    const now = performance.now(),
      dt = Math.min(0.08, (now - last) / 1000);
    last = now;
    if (!game) return;
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
      uiClock = 0;
    }
  });
} catch (error) {
  ui.transition({ type: 'FAIL' });
  console.error(error);
  required(loading.querySelector('p'), 'Loading caption missing').textContent =
    error instanceof Error ? error.message : String(error);
}

// Opt-in diagnostics for reproducible browser checks, never enabled in normal play.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('debug')) {
  const { createAnimationReview } = await import('./animationReview.ts');
  const { createCpuProfile } = await import('./cpuProfile.ts');
  animationReview = createAnimationReview(
    () => game,
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
      () => game,
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
    get game() {
      return game;
    },
    get ready() {
      return ui.ready;
    },
    get engine() {
      return engine;
    },
    teleport(x, z) {
      game.player.teleport(x, z, game.world);
      game.camera.target.copyFrom(game.player.root.position);
    },
    interact,
    regenerate: start,
    generationReport() {
      return structuredClone(required(initialGenerationReport, 'Generation report unavailable'));
    },
    step(codes, frames = 1) {
      keys.clear();
      for (const code of codes) keys.add(code);
      for (let i = 0; i < frames; i++) tick(1 / 60);
      keys.clear();
      renderUpdate(1 / 60);
    },
    snapshot() {
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
        errors: validateDungeon(game.world),
      };
    },
  };
}
