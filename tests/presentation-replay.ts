import { fingerprint } from '../src/cpuMetrics.ts';
import { requestDefense } from '../src/actors.ts';
import type { DebugWindow } from './browserTypes.ts';

/** Exercise the app's fixed-step and presentation callbacks, not a second animation loop. */
export async function presentationReplay(
  d: DebugWindow['__dungeon'],
  batches: number[],
  slot: number,
) {
  d.cpu.stop();
  d.animation.pause();
  d.engine.stopRenderLoop();
  d.regenerate('MOURNING-731');
  while (!d.ready) await new Promise((resolve) => setTimeout(resolve, 10));
  const g = d.game;
  const player = g.player.actor;
  const victim = g.combat.actor('skeleton:crypt:0')!;
  const other = g.combat.actor('goblin:bakery:0')!;
  const sampled = [player, victim, other];
  const body = victim.entity.require('rig').body.position;
  const write = body.set;
  let writes = 0;
  body.set = function (...args) {
    writes++;
    return write.apply(this, args);
  };
  const step = g.combat.update;
  let accepted = 0;
  g.combat.update = function (dt) {
    step.call(this, dt);
    const tick = g.steps;
    if (tick === 5 || tick === 6 || tick === 7) {
      const heading = player.position.heading;
      for (let i = 0; i < (tick === 5 ? 2 : 1); i++) {
        const hp = player.health.current;
        this.damage(player, 8, undefined, {
          kind: 'melee',
          travel: { x: -Math.sin(heading), z: -Math.cos(heading) },
        });
        if (player.health.current === hp) accepted++;
      }
    }
    if (tick === 8 + slot) {
      this.damage(victim, 1000, player, { kind: 'melee', travel: { x: 0, z: 1 } });
      this.damage(other, 1000);
    }
    if (tick === 20) this.damage(player, 1000);
  };
  const ticks: string[] = [];
  const diagnostic: unknown[] = [];
  for (const a of [victim, other]) {
    const b = a.entity.require('rigPose');
    const shapes = b.physicsShapes;
    b.physicsShapes = () => {
      const result = shapes();
      diagnostic.push([a.id, result]);
      return result;
    };
  }
  const meshes: Record<number, string> = {};
  const update = g.enemyRendering.update;
  g.enemyRendering.update = function () {
    update.call(this);
    ticks.push(
      fingerprint({
        tick: g.steps,
        actors: g.combat.actors.map((a) => {
          const b = a.entity.require('rigPose');
          const island = a.entity.get('ragdoll');
          const handoff = a.entity.get('deathHandoff');
          const block = a.entity.get('blockFeedback')?.last;
          return [
            a.id,
            a.position,
            a.health.current,
            a.motion.velocity,
            a.attack.swing,
            a.navigator.path,
            a.entity.get('corpse')?.age,
            b.pose.world,
            b.pose.previousWorld,
            b.history.snapshot(),
            b.actions.shield.snapshot(),
            b.tail?.blocked,
            block && [block.sequence, block.time, block.travel, block.contact],
            a.entity.get('blockFeedback')?.pendingCount,
            island && [island.seed, island.settled, island.world, island.staticCount],
            handoff && [handoff.source?.id, handoff.time, handoff.pose],
          ];
        }),
      }),
    );
  };
  d.cpu.start('off');
  requestDefense(player);
  const writeCounts: number[] = [];
  let frame = 0;
  try {
    while (g.steps < 120) {
      const n = Math.min(batches[frame++ % batches.length], 120 - g.steps);
      const before = writes;
      d.cpu.frame(['KeyF'], n);
      writeCounts.push(writes - before);
      meshes[g.steps] = fingerprint(
        sampled.map((actor) => {
          const { meshes } = actor.entity.require('render');
          return meshes.map((m) => [m.isEnabled(), [...m.computeWorldMatrix(true).m]]);
        }),
      );
      if (frame % 12 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return {
      ticks,
      diagnostic,
      meshes,
      writeCounts,
      accepted,
      islands: sampled.map((a) => a.entity.get('ragdoll')?.mode ?? null),
      heroHealth: player.health.current,
    };
  } finally {
    d.cpu.stop();
    body.set = write;
    g.combat.update = step;
    g.enemyRendering.update = update;
  }
}
