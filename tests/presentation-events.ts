import { fingerprint } from '../src/cpuMetrics.ts';
import { moveActor, requestDefense, stopActor } from '../src/actors.ts';
import { readCorpseTerrain } from '../src/corpseRendering.ts';
import { phalanxWorkload } from './cpu-workloads.ts';
import type { DebugWindow } from './browserTypes.ts';

export async function eventReplay(
  d: DebugWindow['__dungeon'],
  batches: number[],
  slot: number,
  opening: boolean,
  quality: string,
  visualOnly = false,
  capture?: (tick: number, count: number) => void,
) {
  d.cpu.stop();
  d.animation.pause();
  d.engine.stopRenderLoop();
  const select = document.querySelector<HTMLSelectElement>('#quality')!;
  select.value = quality;
  select.dispatchEvent(new Event('change'));
  d.regenerate('MOURNING-731');
  while (!d.ready) await new Promise((resolve) => setTimeout(resolve, 10));
  const g = d.game;
  const player = g.player.actor;
  const phalanx = phalanxWorkload(d);
  const victim = opening
    ? phalanx.pack.find((a) => phalanx.squad.isGate(a.entity.require('squadMember')))!
    : phalanx.pack[1];
  const skeleton = g.combat.actor('skeleton:crypt:0')!;
  const place = (actor: typeof victim, x: number, z: number, h: number) => {
    Object.assign(actor.position, { x, z, h, heading: 0 });
    actor.entity.require('collision').sync?.(actor.position);
    actor.entity.require('rigPose').reset(actor.position);
  };
  const run = g.ecs.get('run')!;
  const record = run.require('discoveries');
  const persona = g.combat.enemies
    .find((a) => a.entity.has('inhabitant'))!
    .entity.require('inhabitant');
  const actors = opening ? [victim] : [victim, skeleton];
  for (const actor of actors)
    actor.entity.add('inhabitant', { ...persona, id: `replay:${actor.id}`, actorId: actor.id });
  if (!opening) {
    phalanx.pack.forEach((actor) => actor.entity.remove('squadMember'));
    for (const entity of g.ecs.query('koboldSquad')) entity.remove('koboldSquad');
    for (const actor of phalanx.pack) {
      stopActor(actor);
      actor.entity.remove('brain');
      if (actor === victim) continue;
      actor.health.current = 0;
      actor.entity.require('rig').root.setEnabled(false);
    }
    place(victim, 0, 3, 0);
    place(skeleton, 3, 3, 0);
    skeleton.health.current = skeleton.health.max;
    skeleton.entity.require('rig').root.setEnabled(true);
    d.teleport(0, 0);
    if (!requestDefense(victim)) throw new Error('Guard fixture not armed');
  }
  player.health.invulnerable = 1e9;
  const diagnostics: string[] = [];
  for (const actor of actors) {
    const binding = actor.entity.require('rigPose');
    const sample = binding.physicsShapes;
    binding.physicsShapes = () => {
      const result = sample();
      diagnostics.push(fingerprint([actor.id, result]));
      return result;
    };
  }
  const trace: string[] = [];
  const displays: { tick: number; count: number; meshes: string; record: string }[] = [];
  const entry = new Map<string, boolean>();
  const settled = new Map<string, number>();
  let accepted = 0;
  let reacted = false;
  let landing = false;
  let lethal = 0;
  let openingPose = 0;
  let witness: ReturnType<typeof record.snapshot>['events'] = [];
  const update = g.combat.update;
  const effects = g.enemyRendering.update;
  g.combat.update = function (dt) {
    const tick = g.steps;
    update.call(this, dt);
    if (!opening && tick === 7 + slot) {
      skeleton.jump.height = 0.065;
      skeleton.jump.velocity = -2.8;
      moveActor(skeleton, g.world, {}, dt);
    }
    if (!opening && tick >= 5 && tick <= 7) {
      for (let n = 0; n < (tick === 5 ? 2 : 1); n++) {
        const before = victim.entity.require('blockFeedback').last?.sequence ?? 0;
        this.damage(victim, 8, player, { kind: 'melee', travel: { x: 0, z: -1 } });
        if ((victim.entity.require('blockFeedback').last?.sequence ?? 0) === before + 1) accepted++;
      }
    }
    if (lethal || (opening ? !openingPose : tick !== 8 + slot)) return;
    lethal = tick;
    // Pin the event camera, not the next display's camera. Witness must still pass real mesh and
    // occlusion checks; the separated second body is deliberately disabled at damage time.
    g.camera.alpha = g.desiredAlpha = -Math.PI / 2;
    g.camera.radius = g.desiredRadius = 12;
    g.camera.target.set(player.position.x, player.position.h + 0.75, player.position.z);
    g.camera.getViewMatrix(true);
    if (!opening) {
      moveActor(skeleton, g.world, {}, dt);
      landing = skeleton.jump.phase === 'landing';
      skeleton.entity.require('rig').root.setEnabled(false);
    }
    if (
      !this.damage(victim, 1000, player, {
        kind: 'melee',
        travel: opening
          ? {
              x: -Math.sin(victim.position.heading),
              z: -Math.cos(victim.position.heading),
            }
          : { x: 0, z: 1 },
      })
    )
      throw new Error('Expected an accepted lethal hit on the shield owner');
    if (!opening) {
      if (!this.damage(skeleton, 1000)) throw new Error('Expected landing lethality');
      skeleton.entity.require('rig').root.setEnabled(true);
    }
    witness = record
      .snapshot()
      .events.filter((e) => 'subjectId' in e && e.subjectId.startsWith('replay:'));
  };
  g.enemyRendering.update = function () {
    effects.call(this);
    const tick = g.steps;
    const shield = victim.entity.require('rigPose').actions.shield;
    reacted ||= shield.recoil > 0;
    if (!openingPose && opening && victim.entity.require('rigPose').actions.opening === 1)
      openingPose = tick;
    trace.push(
      fingerprint(
        actors.map((a) => {
          const b = a.entity.require('rigPose');
          const r = a.entity.get('ragdoll');
          const h = a.entity.get('deathHandoff');
          if (r && tick === lethal)
            entry.set(a.id, !!h?.pose && r.world.every((v, i) => Object.is(v, h.pose!.world[i])));
          if (r?.settled && !settled.has(a.id)) settled.set(a.id, tick);
          return [
            a.position,
            a.health.current,
            a.jump,
            a.attack.swing,
            a.navigator.path,
            b.pose.world,
            b.pose.previousWorld,
            b.actions.shield.snapshot(),
            a.entity.get('blockFeedback')?.pendingCount,
            tick <= lethal + 1 && h && [h.source?.id, h.time, h.pose],
            r && [r.seed, r.world, r.settled, r.bodyCount, r.constraintCount, r.staticCount],
          ];
        }),
      ),
    );
  };
  d.cpu.start('off');
  const warmupTo = opening ? () => openingPose > 0 : () => g.steps >= 8;
  const frame = (count: number, render: boolean) => {
    d.cpu.frame([], count, render);
    if (render) capture?.(g.steps, count);
    displays.push({
      tick: g.steps,
      count,
      meshes: fingerprint(
        actors.map((a) =>
          a.entity
            .require('render')
            .meshes.map((m) => [m.isEnabled(), m.computeWorldMatrix(true).m]),
        ),
      ),
      record: fingerprint(
        record
          .snapshot()
          .events.filter((e) => 'subjectId' in e && e.subjectId.startsWith('replay:')),
      ),
    });
  };
  try {
    // Shared one-tick prelude only for phase-triggered opening. From the first completed opening
    // pose the very next tick is lethal. Group that tick with the remaining ticks in the display.
    if (opening) while (!warmupTo() && g.steps < 180) frame(1, false);
    const end = visualOnly ? 24 : opening ? 620 : 380;
    for (let i = 0; g.steps < end; i++) {
      frame(
        Math.min(batches[i % batches.length], end - g.steps),
        visualOnly || g.steps < (openingPose || 8) + 16,
      );
      if (i % 20 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (visualOnly && batches.includes(0)) frame(0, true);
    if (!lethal) throw new Error('No lethal tick in replay');
    const boxes = readCorpseTerrain(g.ecs, g.world);
    const final = fingerprint(
      boxes.map(({ floor, inverse, worldMin, worldMax }) => [
        floor,
        inverse,
        [worldMin.x, worldMin.y, worldMin.z],
        [worldMax.x, worldMax.y, worldMax.z],
      ]),
    );
    const resources = actors.map((actor) => {
      const r = actor.entity.require('ragdoll');
      return [r.mode, r.settled, r.bodyCount, r.constraintCount, r.staticCount] as const;
    });
    const islands = actors.map((actor) => actor.entity.require('ragdoll'));
    d.cpu.stop();
    d.regenerate('MOURNING-731');
    while (!d.ready) await new Promise((resolve) => setTimeout(resolve, 10));
    const retired =
      g.scene.isDisposed &&
      actors.every(
        (actor, i) =>
          !actor.entity.has('ragdoll') &&
          !actor.entity.has('deathHandoff') &&
          islands[i].bodyCount === 0,
      );
    return {
      trace,
      displays,
      diagnostics,
      accepted,
      reacted,
      landing,
      lethal,
      openingPose,
      witness,
      entry: [...entry.values()],
      settled: [...settled.values()],
      final,
      boxes: boxes.length,
      resources,
      retired,
    };
  } finally {
    d.cpu.stop();
    g.combat.update = update;
    g.enemyRendering.update = effects;
  }
}
