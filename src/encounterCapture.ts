import type { Game } from './gameTypes.ts';
import type { CpuMode, CpuProfile } from './cpuProfile.ts';
import { populationIssue, recipe, terminal, transition } from './encounterRecipe.ts';
import type {
  AttackWitness,
  EncounterCase,
  Fact,
  Frame,
  Phase,
  PhysicalEvidence,
  SlotEvidence,
  Witness,
} from './encounterRecipe.ts';

interface EncounterPort {
  current(): Game;
  fresh(seed: string): void;
  input(codes: readonly string[]): void;
  interact(): void;
  ready(): boolean;
  clock(): number;
  resetClock(now: number): void;
  cpu: CpuProfile;
}

interface ApproachTrace {
  id: string;
  signal(edge: 'warm' | 'tail'): Promise<void>;
}
const markedCallbacks = 16;
const traceWarmTick = recipe.warmup - 30;

export function warmupTraceGate(start: () => Promise<void>, fail: (reason: string) => void) {
  let state: 'waiting' | 'pending' | 'acknowledged' | 'running' = 'waiting';
  return {
    request() {
      if (state !== 'waiting') return;
      state = 'pending';
      void start().then(
        () => {
          state = 'acknowledged';
        },
        (error: unknown) => fail(String(error)),
      );
    },
    resume(reset: () => void) {
      if (state === 'acknowledged') {
        reset();
        state = 'running';
      }
      return state === 'running';
    },
  };
}

/** DEV adapter. Babylon still calls the original application callback once per native RAF. */
export function createEncounterCapture(port: EncounterPort) {
  let session: ReturnType<typeof visit> | undefined;
  const visit = (name: EncounterCase, mode: CpuMode, trace?: ApproachTrace) => {
    const game = port.current();
    const engine = game.scene.getEngine();
    const enemies = game.combat.enemies;
    const squads = game.ecs.query('koboldSquad').map((e) => e.require('koboldSquad'));
    const pack = game.ecs.get(recipe.pack)?.get('koboldSquad');
    const members = pack?.members.map((m) => m.entity.id) ?? [];
    const gate = recipe.door;
    const door = game.world.entities.find((e) => e.id === gate.id && e.type === 'door');
    const doorDistance = (p: { z: number }) => (p.z - gate.z) * gate.direction;
    const doorLateral = (p: { x: number; z: number }) => Math.abs(p.x - gate.x);
    const edges = name === 'door' ? recipe.doorEdges : recipe.encounterEdges;
    const facts: Fact[] = [],
      frames: Frame[] = [];
    const input: { tick: number; codes: string[] }[] = [];
    const attacks: (AttackWitness & { tick: number; callback: number })[] = [];
    const motion: {
      callback: number;
      from: number;
      to: number;
      phases: Phase[];
      dx: number;
      dz: number;
    }[] = [];
    const mark = (tag: 'entry' | 'submit' | 'submitted' | 'exit') => {
      if (trace && callback >= 0 && callback < markedCallbacks) {
        const name = `encounter-trace:${trace.id}:${callback}:${tag}`;
        performance.mark(name);
        performance.clearMarks(name);
      }
    };
    const view = () =>
      enemies
        .filter((a) =>
          a.entity
            .get('render')
            ?.meshes.some(
              (m) =>
                m.isEnabled() &&
                m.isVisible &&
                m.visibility > 0 &&
                game.scene.getActiveMeshes().indexOf(m) >= 0,
            ),
        )
        .map((a) => a.id);
    const population = () => ({
      alive: enemies.filter((a) => a.alive).map((a) => a.id),
      active: enemies
        .filter((a) => a.alive || (a.entity.has('ragdoll') && !a.entity.get('ragdoll')?.settled))
        .map((a) => a.id),
      settled: enemies.filter((a) => a.entity.get('ragdoll')?.settled).map((a) => a.id),
      visible: view(),
    });
    const snapshot = () => ({
      state: port.cpu.state(true),
      population: population(),
      members,
      camera: [
        game.camera.alpha,
        game.camera.beta,
        game.camera.radius,
        ...game.camera.target.asArray(),
      ],
      display: [
        innerWidth,
        innerHeight,
        devicePixelRatio,
        engine.getRenderWidth(),
        engine.getRenderHeight(),
      ],
      quality: {
        shadows: game.scene.shadowsEnabled,
        glow: game.glow.isEnabled,
        samples: game.fxaa.samples,
        scaling: engine.getHardwareScalingLevel(),
      },
      objectives: [
        game.ecs.get('run')?.get('lastEmber')?.state,
        game.ecs.get('run')?.get('tribute')?.clock,
      ],
    });
    let start: ReturnType<typeof snapshot> | undefined;
    let end: ReturnType<typeof snapshot> | undefined;
    let witness: Witness = { phase: 'setup' };
    let phaseTags: Phase[] = [];
    let callback = -1,
      launch = 0;
    let beforeSlots: SlotEvidence[] = [];
    let previousX = 0,
      previousZ = 0,
      unawareTicks = 0;
    let done = false;
    let warmCallbacks = 0;
    let reason: string | undefined;
    let cpuStarted = false;
    const add = (phase: Phase, evidence?: unknown, failure?: string) => {
      const next: Fact = { phase, tick: game.steps, callback, evidence, reason: failure };
      facts.push(next);
      witness = transition(name, witness, next);
      if (terminal(witness.phase)) port.input([]);
      if (!phaseTags.includes(witness.phase)) phaseTags.push(witness.phase);
    };
    const physical = <P extends keyof PhysicalEvidence>(phase: P, evidence: PhysicalEvidence[P]) =>
      add(phase, evidence);
    const slots = () =>
      pack!.members.map((m) => ({
        id: m.entity.id,
        position: { ...m.entity.require('transform') },
        slot: pack!.approach(m),
      }));
    let resolve!: (value: ReturnType<typeof result>) => void;
    const result = () => ({
      name,
      mode,
      launch,
      warmCallbacks,
      start,
      end,
      frames,
      facts,
      input,
      attacks,
      witness,
      reason,
      attribution: cpuStarted ? port.cpu.report() : undefined,
      ...(trace && { trace: { id: trace.id, motion, outcome: false as const } }),
    });
    const promise = new Promise<ReturnType<typeof result>>((accept) => {
      resolve = accept;
    });
    const finish = (failure?: string) => {
      if (done) return;
      done = true;
      reason = failure ?? ('reason' in witness ? witness.reason : undefined);
      if (failure && !terminal(witness.phase)) add('invalid', undefined, failure);
      clearTimeout(deadline);
      window.removeEventListener('blur', blurred);
      engine.onContextLostObservable.remove(context);
      game.scene.onDisposeObservable.remove(disposed);
      game.combat.encounterAttack = undefined;
      game.combat.encounterSquad = undefined;
      port.input([]);
      session = undefined;
      try {
        resolve(result());
      } catch (err) {
        resolve({
          name,
          mode,
          launch,
          warmCallbacks,
          start,
          end: undefined,
          frames,
          facts,
          input,
          attacks,
          witness,
          reason: String(err),
          attribution: undefined,
          ...(trace && { trace: { id: trace.id, motion, outcome: false as const } }),
        });
      } finally {
        if (cpuStarted) port.cpu.stop();
      }
    };
    const deadline = setTimeout(() => finish('Visit wall deadline exceeded'), recipe.deadlineMs);
    const traceGate = trace && warmupTraceGate(() => trace.signal('warm'), finish);
    let traceWarmRunning = false;
    const blurred = () => finish('Page lost foreground focus');
    window.addEventListener('blur', blurred);
    const context = engine.onContextLostObservable.add(() => finish('WebGL context lost'));
    const disposed = game.scene.onDisposeObservable.add(() => finish('Scene retired'));
    const unaware = () =>
      !squads.some((s) => s.active) && !enemies.some((a) => a.alive && (a.brain?.memory ?? 0) > 0);
    game.combat.encounterAttack = (event) => {
      if (
        witness.phase === 'open' &&
        members.includes(event.actor) &&
        event.target === game.player.actor.id
      ) {
        attacks.push({ ...event, tick: game.steps, callback });
        if (event.outcome !== 'no-release') physical('resolved', event);
      }
    };
    game.combat.encounterSquad = (id, squad, event) => {
      if (name === 'door' && event === 'alerted' && !terminal(witness.phase)) {
        add('invalid', undefined, 'Squad alerted during door control');
        return;
      }
      if (!start || id !== recipe.pack || name === 'door' || terminal(witness.phase)) return;
      const target = squad.target?.id;
      if (event === 'alerted' && witness.phase === 'approach' && target) {
        beforeSlots = slots();
        physical('alerted', { pack: id, members, target, positions: beforeSlots });
      } else if (event === 'ranked' && witness.phase === 'travelling') {
        physical('ranked', { pack: id, slots: slots() });
      } else if (event === 'open' && witness.phase === 'ranked') {
        const gate = squad.members.find((m) => squad.isOpening(m));
        const kind = squad.chart.snapshot.context.attack;
        if (gate && kind && target && squad.spear)
          physical('open', { pack: id, gate: gate.entity.id, spear: squad.spear.id, kind, target });
      }
    };
    game.desiredAlpha = game.camera.alpha = recipe.cameraAlpha;
    return {
      promise,
      mark,
      prepare() {
        if (name !== 'reduced') return;
        for (const id of recipe.retire) {
          const actor = enemies.find((a) => a.id === id);
          if (!actor?.alive) return finish(`Missing retirement actor ${id}`);
          game.combat.damage(actor, actor.health.max + 1);
        }
      },
      beforeTick() {
        if (!start || terminal(witness.phase)) return;
        const p = game.player.actor.position;
        if (name === 'door') {
          previousX = p.x;
          previousZ = p.z;
        }
        const edge = edges[input.length];
        if (edge?.tick !== game.steps + 1) return;
        const codes: readonly string[] = edge.codes;
        if (codes.includes('KeyE')) port.interact();
        port.input(codes.filter((code) => code !== 'KeyE'));
        input.push({ tick: edge.tick, codes: [...codes] });
      },
      afterTick() {
        if (terminal(witness.phase)) return;
        if (!start) {
          if (!unaware()) add('invalid', undefined, 'Alert during warmup');
          else unawareTicks++;
          return;
        }
        const p = game.player.actor.position;
        if (name === 'door') {
          if (!unaware()) return add('invalid', undefined, 'Alert during door control');
          unawareTicks++;
          if (
            witness.phase === 'approach' &&
            door?.type === 'door' &&
            door.open &&
            (door.angle ?? 0) !== 0
          )
            physical('opening', { id: door.id, angle: door.angle!, open: door.open });
          if (
            doorDistance({ z: previousZ }) <= 0 &&
            doorDistance(p) > 0 &&
            doorLateral(p) < 0.7 &&
            door?.type === 'door' &&
            door.open &&
            door.collider?.checkCollisions === false
          )
            physical('crossed', {
              id: door.id,
              open: door.open,
              collision: door.collider.checkCollisions,
              from: { x: previousX, z: previousZ },
              to: { x: p.x, z: p.z },
              unawareTicks,
            });
          return;
        }
        if (!pack) return;
        if (witness.phase === 'alerted') {
          for (const [i, member] of pack.members.entries()) {
            const { position: from, slot } = beforeSlots[i]!,
              to = member.entity.require('transform');
            if (
              Math.hypot(to.x - from.x, to.z - from.z) > 0.03 &&
              Math.hypot(to.x - slot.x, to.z - slot.z) <
                Math.hypot(from.x - slot.x, from.z - slot.z)
            ) {
              physical('travelling', { id: member.entity.id, from, to: { ...to }, slot });
              break;
            }
          }
        }
      },
      frame(run: (now?: number) => void) {
        const entry = port.clock();
        try {
          if (document.hidden || port.current() !== game) return finish('Page hidden or reset');
          if (!port.ready()) {
            if (start || game.steps > 0) return finish('Application paused');
            run(); // Babylon's initial shader/scene readiness may finish on a later callback.
            return;
          }
          if (!start) {
            if (traceGate && game.steps >= traceWarmTick && !traceWarmRunning) {
              traceGate.request();
              traceWarmRunning = traceGate.resume(() => port.resetClock(entry));
              if (!traceWarmRunning) return;
            }
            warmCallbacks++;
            if (!unaware()) return finish('Alert before warmed start');
            run();
            if (terminal(witness.phase)) return finish();
            if (game.steps < recipe.warmup) return;
            start = snapshot();
            const issue = populationIssue(
              name,
              start.population.alive,
              start.population.settled,
              members,
            );
            if (issue) return finish(issue);
            if (
              name === 'door' &&
              (door?.type !== 'door' || door.open || door.locked || !door.collider?.checkCollisions)
            )
              return finish('Door not initially closed, unlocked and colliding');
            if (mode !== 'off') {
              port.cpu.start(mode);
              cpuStarted = true;
            }
            launch = port.clock();
            port.resetClock(launch);
            return;
          }
          callback++;
          const observed = trace && callback < markedCallbacks;
          const player = game.player.actor.position;
          const x = observed ? player.x : 0;
          const z = observed ? player.z : 0;
          if (observed) mark('entry');
          const trailing = terminal(witness.phase);
          if (trailing) end = snapshot();
          const workStart = trailing ? port.clock() : entry;
          phaseTags = [
            trailing ? 'trailing' : witness.phase === 'setup' ? 'approach' : witness.phase,
          ];
          const from = game.steps;
          if (witness.phase === 'setup') add('approach');
          if (cpuStarted && !trailing) port.cpu.nativeCallback(run);
          else if (trailing) run(entry); // Snapshot cannot manufacture catch-up time in the last join.
          else run();
          if (observed) {
            mark('exit');
            const p = game.player.actor.position;
            motion.push({
              callback,
              from,
              to: game.steps,
              phases: phaseTags,
              dx: p.x - x,
              dz: p.z - z,
            });
            if (callback === markedCallbacks - 1)
              void trace.signal('tail').catch((err: unknown) => finish(String(err)));
          }
          frames.push({
            entry,
            work: port.clock() - workStart,
            from,
            to: game.steps,
            phases: phaseTags,
          });
          if (trailing || witness.phase === 'invalid') return finish();
          if (game.steps - recipe.warmup >= recipe.maxTicks || frames.length >= recipe.maxCallbacks)
            return finish(`Budget exceeded in ${witness.phase}`);
        } catch (err) {
          finish(String(err));
        }
      },
      holdWarmup() {
        return !start
          ? game.steps >= (traceGate && !traceWarmRunning ? traceWarmTick : recipe.warmup)
          : terminal(witness.phase) && !phaseTags.includes('trailing');
      },
    };
  };
  return {
    run(name: EncounterCase, mode: CpuMode, trace?: ApproachTrace) {
      if (session || port.cpu.active) throw new Error('An observer is already active');
      if (trace && mode !== 'off') throw new Error('Trace requires CPU scopes off');
      port.fresh(recipe.seed);
      const active = visit(name, mode, trace);
      session = active;
      active.prepare();
      return active.promise;
    },
    frame(run: (now?: number) => void) {
      if (session) session.frame(run);
      else run();
    },
    beforeTick: () => session?.beforeTick(),
    afterTick: () => session?.afterTick(),
    mark: (tag: 'submit' | 'submitted') => session?.mark(tag),
    holdWarmup: () => session?.holdWarmup() ?? false,
  };
}

export type EncounterCapture = ReturnType<typeof createEncounterCapture>;
