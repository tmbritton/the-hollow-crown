import { World as PhysicsWorld } from 'cannon-es';
import { Navigator } from './navigation.ts';
import { PoseHistory } from './rigs/history.ts';
import { Ragdoll } from './ragdoll.ts';
import { CpuMetrics, fingerprint, patchMethod, setCpuMetrics } from './cpuMetrics.ts';
import type { CpuMethod } from './cpuMetrics.ts';
import type { Game } from './gameTypes.ts';

export type CpuMode = 'off' | 'coarse' | 'detailed';
/** Loaded only inside DEV + ?debug. Patches belong to one scene and restore exact descriptors. */
export function createCpuProfile(
  current: () => Game,
  tick: (codes: string[]) => void,
  present: (dt: number) => void,
  resetClock: () => void,
) {
  const applicationLoops = [...current().scene.getEngine().activeRenderLoops];
  let cancelLive: (() => void) | null = null;
  let session: { game: Game; mode: CpuMode; metrics: CpuMetrics; restore: (() => void)[] } | null =
    null;
  const stop = () => {
    cancelLive?.();
    if (!session) return;
    setCpuMetrics(null);
    for (const restore of session.restore.reverse()) restore();
    session = null;
  };
  const recordFrame = (run: (m: CpuMetrics) => void, requestedTicks?: number) => {
    const s = session;
    if (!s || current() !== s.game || s.game.scene.isDisposed)
      throw new Error('CPU session retired');
    const m = s.metrics,
      step = s.game.steps,
      before = population(s.game);
    m.begin(step);
    const started = m.clock();
    try {
      run(m);
    } finally {
      m.finish('frame', started);
      m.count('ticks', s.game.steps - step);
      if (requestedTicks !== undefined) m.count('requestedTicks', requestedTicks);
      for (const [key, value] of Object.entries(before)) m.count(`population.${key}`, value);
      m.end();
    }
  };
  const state = () => {
    const g = current();
    const authority = {
      seed: g.world.seed,
      steps: g.steps,
      time: g.time,
      actors: g.combat.actors.map((a) => ({
        id: a.id,
        kind: a.kind,
        p: { ...a.position },
        hp: a.health.current,
        protection: a.health.invulnerable,
        motion: {
          speed: a.motion.actualSpeed,
          velocity: { ...a.motion.velocity },
          support: a.motion.supportVelocity,
        },
        jump: [
          a.jump.height,
          a.jump.velocity,
          a.jump.airborne,
          a.jump.active,
          a.jump.held,
          a.jump.landings,
        ],
        attack: a.attack.swing,
        target: a.attack.target,
        brain: a.brain
          ? [a.brain.state, a.brain.think, a.brain.memory, a.brain.cover, a.brain.hideTime]
          : null,
        route: a.navigator.chart.snapshot.context,
        defense: a.defending,
        work: a.entity.get('work')?.snapshot(),
        corpse: a.entity.get('corpse')?.age,
        block: a.entity.get('blockFeedback')?.last?.sequence,
        pending: a.entity.get('blockFeedback')?.pendingCount,
      })),
      doors: g.world.entities
        .filter((e) => e.type === 'door')
        .map((e) => [e.id, e.open, e.locked, e.angle, e.collider?.checkCollisions]),
      projectiles: g.ecs
        .query('projectile', 'transform')
        .map((e) => [e.id, e.require('transform'), e.require('projectile')]),
      particles: g.ecs
        .query('particle', 'transform')
        .map((e) => [e.id, e.require('transform'), e.require('particle')]),
      cargo: g.ecs
        .query('cargo')
        .map((e) => [
          e.id,
          e.require('cargo').state,
          e.require('cargo').revision,
          e.require('cargo').owner?.id,
          e.get('transform'),
        ]),
      squads: g.ecs.query('koboldSquad').map((e) => {
        const squad = e.require('koboldSquad'),
          context = squad.chart.snapshot.context;
        return { id: e.id, state: squad.state, ...context, target: context.target?.id };
      }),
      objectives: g.ecs.get('run')?.get('objectives')?.snapshot(),
      discoveries: g.ecs.get('run')?.get('discoveries')?.snapshot(),
    };
    const poses = g.combat.actors.map((a) => {
      const b = a.entity.require('rigPose'),
        r = a.entity.get('ragdoll');
      if (!b.pose.world.every(Number.isFinite) || !b.pose.previousWorld.every(Number.isFinite))
        throw new Error(`Non-finite CPU pose: ${a.id}`);
      return {
        id: a.id,
        world: Array.from(b.pose.world),
        previous: Array.from(b.pose.previousWorld),
        shield: b.actions.shield.snapshot(),
        tail: b.tail?.blocked,
        death: a.entity.get('deathHandoff')?.pose,
        physics: r
          ? [r.seed, r.mode, r.settled, r.radius, r.bodyCount, r.constraintCount, r.staticCount]
          : null,
      };
    });
    return structuredClone({
      authority: fingerprint(authority),
      presentation: fingerprint(poses),
      population: population(g),
      resources: resources(g),
      actors: authority.actors,
    });
  };
  return {
    start(mode: CpuMode, captureRequest?: number) {
      if (session || cancelLive) throw new Error('CPU session already active or restoring');
      if (!['off', 'coarse', 'detailed'].includes(mode)) throw new Error('Invalid CPU mode');
      if (
        captureRequest !== undefined &&
        (!Number.isInteger(captureRequest) || captureRequest < 0 || captureRequest > 1000000)
      )
        throw new Error('Invalid CPU request identity');
      const g = current(),
        m = new CpuMetrics(),
        restore: (() => void)[] = [];
      session = { game: g, mode, metrics: m, restore };
      m.captureRequest = captureRequest;
      const patch = <T extends object, K extends keyof T>(
        object: T,
        key: K,
        replace: (old: T[K]) => CpuMethod<T, T[K]>,
      ) => restore.push(patchMethod(object, key, replace));
      try {
        const token = g.scene.onDisposeObservable.addOnce(stop);
        restore.push(() => g.scene.onDisposeObservable.remove(token));
        if (mode === 'off') return;
        setCpuMetrics(m, mode === 'detailed');
        patch(
          g.combat,
          'update',
          (old) =>
            function (...args) {
              return m.measure('combat', () => old.apply(this, args));
            },
        );
        patch(
          g.enemyRendering,
          'update',
          (old) =>
            function (...args) {
              return m.measure('effects', () => old.apply(this, args));
            },
        );
        patch(
          g.observation,
          'visible',
          (old) =>
            function (...args) {
              return m.measure('observation', () => old.apply(this, args));
            },
        );
        patch(
          g.scene,
          'render',
          (old) =>
            function (...args) {
              return m.measure('scene.render', () => old.apply(this, args));
            },
        );
        let activeStart = 0;
        const before = g.scene.onBeforeActiveMeshesEvaluationObservable.add(() => {
          activeStart = m.clock();
        });
        restore.push(() => g.scene.onBeforeActiveMeshesEvaluationObservable.remove(before));
        const after = g.scene.onAfterActiveMeshesEvaluationObservable.add(() =>
          m.finish('scene.activeMeshes', activeStart),
        );
        restore.push(() => g.scene.onAfterActiveMeshesEvaluationObservable.remove(after));
        if (mode === 'coarse') {
          const actors = new Map(g.combat.actors.map((a) => [a.navigator, a.id]));
          let request = 0;
          patch(
            Navigator.prototype,
            'request',
            (old) =>
              function (from, to, options = {}) {
                m.startRoute({
                  id: request++,
                  actor: actors.get(this) ?? 'temporary',
                  from: { x: from.x, z: from.z },
                  to: { x: to.x, z: to.z },
                  options,
                  reason: 'coarse-unpartitioned',
                });
                let status: ReturnType<Navigator['request']> = 'invalidated';
                try {
                  return (status = m.measure('route.total', () =>
                    old.call(this, from, to, options),
                  ));
                } finally {
                  m.finishRoute({ status, destination: this.destination, path: this.path });
                }
              },
          );
          return;
        }
        for (const door of g.world.entities) {
          if (door.type !== 'door') continue;
          for (const key of ['open', 'locked', 'angle'] as const) {
            const descriptor = Object.getOwnPropertyDescriptor(door, key);
            if (!descriptor?.get || !descriptor.configurable)
              throw new Error(`Unobservable door field: ${key}`);
            const get = descriptor.get;
            Object.defineProperty(door, key, {
              ...descriptor,
              get() {
                m.count(`doors.${key}`);
                return get.call(this);
              },
            });
            restore.push(() => Object.defineProperty(door, key, descriptor));
          }
        }
        for (const a of g.combat.actors) {
          const collision = a.entity.get('collision'),
            b = a.entity.require('rigPose');
          if (collision)
            patch(
              collision,
              'move',
              (old) =>
                function (from, displacement) {
                  const size = Math.hypot(displacement.x, displacement.z);
                  m.count(
                    size === 0
                      ? 'collision.exactZero'
                      : size < 1e-10
                        ? 'collision.tinyNonzero'
                        : 'collision.moving',
                  );
                  return m.measure(size === 0 ? 'collision.zeroMs' : 'collision.movingMs', () =>
                    old.call(this, from, displacement),
                  );
                },
            );
          patch(
            b,
            'apply',
            (old) =>
              function (...args) {
                return m.measure('binding.apply', () => old.apply(this, args));
              },
          );
          patch(
            b,
            'applyPhysics',
            (old) =>
              function (...args) {
                return m.measure(
                  a.entity.get('ragdoll')?.settled ? 'binding.frozen' : 'binding.physical',
                  () => old.apply(this, args),
                );
              },
          );
          patch(
            b,
            'physicsShapes',
            (old) =>
              function (...args) {
                return m.measure('physics.shapes', () => old.apply(this, args));
              },
          );
          patch(
            b,
            'sampleSurfaces',
            (old) =>
              function (...args) {
                return m.measure('rig.surfaces', () => old.apply(this, args));
              },
          );
          patch(
            b.actions.shield,
            'sample',
            (old) =>
              function (...args) {
                return m.measure('shield', () => old.apply(this, args));
              },
          );
          if (b.tail)
            patch(
              b.tail,
              'sample',
              (old) =>
                function (...args) {
                  return m.measure('tail', () => old.apply(this, args));
                },
            );
          const feedback = a.entity.get('blockFeedback');
          if (feedback)
            patch(
              feedback,
              'consume',
              (old) =>
                function (...args) {
                  const batch = old.apply(this, args);
                  if (batch) m.count('blocks.consumed', batch.count);
                  return batch;
                },
            );
        }
        patch(
          g.scene.collisionCoordinator,
          'getNewPosition',
          (old) =>
            function (...args) {
              return m.measure('collision.engine', () => old.apply(this, args));
            },
        );
        for (const mesh of g.scene.meshes) {
          patch(
            mesh,
            'isEnabled',
            (old) =>
              function (...args) {
                if (m.scopes.includes('collision.engine')) m.count('collision.meshChecks');
                return old.apply(this, args);
              },
          );
          patch(
            mesh,
            '_checkCollision',
            (old) =>
              function (...args) {
                m.count('collision.narrowCandidates');
                return old.apply(this, args);
              },
          );
        }
        for (const node of [...g.scene.meshes, ...g.scene.transformNodes])
          patch(
            node,
            'computeWorldMatrix',
            (old) =>
              function (...args) {
                m.count('matrices.compute');
                if (args[0]) m.count('matrices.forced');
                return old.apply(this, args);
              },
          );
        patch(
          PoseHistory.prototype,
          'publish',
          (old) =>
            function (...args) {
              return m.measure('history.publish', () => old.apply(this, args));
            },
        );
        patch(
          PoseHistory.prototype,
          'snapshot',
          (old) =>
            function (...args) {
              m.count('alloc.poseSnapshots');
              return m.measure('history.snapshot', () => old.apply(this, args));
            },
        );
        patch(
          PhysicsWorld.prototype,
          'step',
          (old) =>
            function (...args) {
              return m.measure('physics.substep', () => old.apply(this, args));
            },
        );
        patch(
          PhysicsWorld.prototype,
          'addBody',
          (old) =>
            function (...args) {
              m.count(args[0].mass ? 'alloc.dynamicBodies' : 'alloc.staticBodies');
              return old.apply(this, args);
            },
        );
        patch(
          Ragdoll.prototype,
          'advance',
          (old) =>
            function (...args) {
              return m.measure(
                this.settled ? 'physics.frozenAdvance' : 'physics.activeAdvance',
                () => old.apply(this, args),
              );
            },
        );
        patch(
          Ragdoll.prototype,
          'freeze',
          (old) =>
            function (...args) {
              if (!this.settled) m.count('physics.freezes');
              return old.apply(this, args);
            },
        );
        const actorByNav = new Map(g.combat.actors.map((a) => [a.navigator, a]));
        let request = 0;
        patch(
          Navigator.prototype,
          'steer',
          (old) =>
            function (...args) {
              return m.measure('navigation.steer', () => old.apply(this, args));
            },
        );
        patch(
          Navigator.prototype,
          'followFloor',
          (old) =>
            function (...args) {
              return m.measure('navigation.floor', () => old.apply(this, args));
            },
        );
        patch(
          Navigator.prototype,
          'request',
          (old) =>
            function (from, to, options = {}) {
              const a = actorByNav.get(this);
              const input = m.inspect(() => ({
                id: request++,
                actor: a?.id ?? 'temporary',
                from: { x: from.x, z: from.z },
                to: { x: to.x, z: to.z },
                options,
                reason: m.scopes.includes('navigation.steer')
                  ? 'steer-replan'
                  : m.scopes.includes('navigation.floor')
                    ? 'floor-input'
                    : 'direct',
                callerState: [a?.brain?.state, a?.attack.target, a?.entity.get('work')?.snapshot()],
                doors: fingerprint(
                  g.world.entities
                    .filter((e) => e.type === 'door')
                    .map((e) => [e.id, e.open, e.locked, e.collider?.checkCollisions]),
                ),
                occupancy: fingerprint(g.combat.actors.map((a) => [a.id, a.alive, a.position])),
              }));
              m.startRoute(input);
              let status: ReturnType<Navigator['request']> = 'invalidated';
              try {
                return (status = m.measure('route.total', () => old.call(this, from, to, options)));
              } finally {
                m.finishRoute({ status, destination: this.destination, path: this.path });
              }
            },
        );
      } catch (error) {
        stop();
        throw error;
      }
    },
    frame(codes: string[] = [], ticks = 1, render = false, event?: () => void) {
      const s = session;
      if (!s || current() !== s.game || s.game.scene.isDisposed)
        throw new Error('CPU session retired');
      if (!Number.isInteger(ticks) || ticks < 0 || ticks > 4)
        throw new Error('CPU frame tick budget exceeded');
      recordFrame((m) => {
        if (event) m.measure('event', event);
        for (let i = 0; i < ticks; i++) m.measure('tick', () => tick(codes));
        m.measure('presentation', () => present(ticks / 60));
        if (render) {
          if (s.mode === 'off') m.measure('scene.render', () => s.game.scene.render());
          else s.game.scene.render();
        }
      }, ticks);
    },
    live(frames = 120): Promise<void> {
      if (!session || cancelLive) throw new Error('CPU live session unavailable');
      if (!Number.isInteger(frames) || frames < 1 || frames > 240)
        throw new Error('CPU live frame budget exceeded');
      const engine = session.game.scene.getEngine();
      const previous = [...engine.activeRenderLoops];
      const callbacks = previous.length ? previous : applicationLoops;
      engine.stopRenderLoop();
      resetClock();
      return new Promise((resolve, reject) => {
        let count = 0;
        let done = false;
        let previousFrame = performance.now();
        const finish = (error?: Error) => {
          if (done) return;
          done = true;
          clearTimeout(deadline);
          engine.stopRenderLoop(loop);
          // Babylon iterates its live callback array. Restoring inside that iteration can execute
          // an old callback twice; settle only after restoration at the microtask boundary.
          queueMicrotask(() => {
            cancelLive = null;
            try {
              for (const callback of previous) engine.runRenderLoop(callback);
            } catch (restoreError) {
              reject(restoreError);
              return;
            }
            if (error) reject(error);
            else resolve();
          });
        };
        const loop = () => {
          try {
            recordFrame((m) => {
              m.finish('frame.interval', previousFrame);
              previousFrame = performance.now();
              for (const callback of callbacks) {
                if (done) break;
                callback();
              }
            });
            if (++count >= frames) finish();
          } catch (error) {
            finish(error instanceof Error ? error : new Error(String(error)));
          }
        };
        const deadline = setTimeout(
          () => finish(new Error('CPU live frame deadline exceeded')),
          90000,
        );
        cancelLive = () => finish(new Error('CPU live session cancelled'));
        engine.runRenderLoop(loop);
      });
    },
    report() {
      if (!session) throw new Error('CPU session retired');
      return session.metrics.snapshot();
    },
    get active() {
      return !!session;
    },
    state,
    stop,
  };
}
export function population(g: Game) {
  const result = {
    living: 0,
    inactive: 0,
    synthetic: 0,
    articulated: 0,
    separated: 0,
    frozen: 0,
    bodies: 0,
    constraints: 0,
    statics: 0,
  };
  for (const a of g.combat.actors) {
    const r = a.entity.get('ragdoll');
    if (r) {
      result[r.settled ? 'frozen' : r.mode]++;
      result.bodies += r.bodyCount;
      result.constraints += r.constraintCount;
      result.statics += r.staticCount;
    } else if (a.entity.has('corpse')) result.synthetic++;
    else if (a.alive) result.living++;
    else result.inactive++;
  }
  return result;
}
export function resources(g: Game) {
  return {
    actors: g.ecs.query('actor').length,
    entities: g.ecs.size,
    meshes: g.scene.meshes.length,
    nodes: g.scene.transformNodes.length,
    materials: g.scene.materials.length,
    textures: g.scene.textures.length,
  };
}
export type CpuProfile = ReturnType<typeof createCpuProfile>;
