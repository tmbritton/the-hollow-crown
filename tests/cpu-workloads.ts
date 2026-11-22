import type { DungeonDebug } from '../src/gameTypes.ts';
import { createReviewStage } from './animation-review-fixture.ts';
import { requestDefense, requestJump, stopActor } from '../src/actors.ts';
import { KoboldSquad } from '../src/koboldSquads.ts';

export { cpuCases, CPU_RECIPE_VERSION } from './cpu-cases.ts';
import type { CpuCase } from './cpu-cases.ts';

function phalanxWorkload(d: DungeonDebug) {
  const g = d.game,
    entity = g.ecs.get('pack:stable')!;
  const pack = entity.require('koboldSquad').members.map((m) => g.combat.actor(m.entity.id)!);
  g.ecs.get('run')!.remove('tribute');
  for (const actor of g.combat.enemies) {
    stopActor(actor);
    actor.attack.reset();
    actor.entity.remove('corpse');
    actor.health.current = 0;
    actor.entity.require('rig').root.setEnabled(false);
    if (!pack.some((member) => member.entity === actor.entity)) actor.entity.remove('brain');
  }
  for (const group of g.ecs.query('koboldSquad')) if (group !== entity) group.remove('koboldSquad');
  stopActor(g.player.actor);
  Object.assign(g.player.actor.position, { x: 1000, z: 1000, h: 0 });
  // The existing combat fixture's real, prop-free rectangle; no world/collision geometry edits.
  const base = [...g.world.tiles.values()].find((tile) => {
    for (let x = -2; x <= 2; x += 0.5)
      for (let z = -3; z <= 8; z += 0.5) {
        const point = { x: tile.x + x, z: tile.z + z };
        if (
          !g.player.actor.navigator.canStand(point) ||
          g.world.tiles.get(`${Math.round(point.x)},${Math.round(point.z)}`)?.h !== tile.h
        )
          return false;
      }
    return true;
  });
  if (!base) throw new Error('No clear CPU phalanx rectangle');
  for (const [i, actor] of pack.entries()) {
    const side = i === 3 ? 0.175 : (i - 1) * 1.15;
    // A small recoverable rank offset ensures the shared motor really runs before the attack.
    Object.assign(actor.position, {
      x: base.x + side,
      z: base.z + (i === 3 ? -0.9 : i === 0 ? 0.08 : 0.3),
      h: base.h,
      heading: 0,
    });
    actor.health.current = actor.health.max;
    actor.entity.require('rig').root.setEnabled(true);
    actor.entity.require('rigPose').reset(actor.position);
    Object.assign(actor.brain!.home, actor.position);
    actor.brain!.think = 0;
    actor.entity.get('collision')?.sync?.(actor.position);
  }
  const squad = new KoboldSquad(g.ecs, entity, pack);
  entity.add('koboldSquad', squad);
  g.player.health = 100;
  g.player.actor.health.invulnerable = 0;
  d.teleport(base.x + 0.575, base.z + 2.8);
  squad.alert(g.player.actor.entity);
  const phases = new Set<string>(),
    attacks = new Set<string>();
  const initial = pack.map((a) => ({ ...a.position }));
  let moved = false,
    resolved = false;
  const observe = () => {
    phases.add(squad.state);
    pack.forEach((a, i) => {
      moved ||= Math.hypot(a.position.x - initial[i].x, a.position.z - initial[i].z) > 0.001;
      if (a.attack.swing) attacks.add(a.attack.swing.kind);
      if (a.attack.swing?.kind === 'LONG_THRUST' && a.attack.swing.resolved) resolved = true;
    });
  };
  const evidence = () => ({
    phases: [...phases],
    attacks: [...attacks],
    moved,
    resolved,
    impacts: pack[3].attack.chart.snapshot.context.impacts,
    health: g.player.health,
  });
  return {
    kind: 'authored-phalanx',
    warmup: 0,
    frames: 360,
    rendering: false,
    live: false,
    keys: (_frame: number): string[] => [],
    ticks: (_frame: number) => 1,
    event: (_frame: number) => {
      observe();
      // Keep the scenario running after proving an actual landed hit, rather than pre-empting damage.
      if (g.player.health < 100 && g.player.actor.health.invulnerable < 1)
        g.player.actor.health.invulnerable = 1e9;
    },
    evidence,
    validate() {
      observe();
      if (
        !moved ||
        !resolved ||
        !attacks.has('LONG_THRUST') ||
        !['opening', 'attacking', 'recovering'].every((phase) => phases.has(phase)) ||
        g.player.health >= 100 ||
        g.player.health <= 0
      )
        throw new Error(
          `CPU phalanx did not exercise motor/opening/impact/recovery: ${JSON.stringify(evidence())}`,
        );
    },
  };
}

/** Authored workload inputs, never an alternative simulation loop. Every measured update calls
 * the real main tick/presentation through the opt-in harness. Fixture mutation is outside timings. */
export function cpuWorkload(d: DungeonDebug, name: CpuCase) {
  if (name === 'phalanx') return phalanxWorkload(d);
  const g = d.game;
  let warmup = name === 'hitch' ? 360 : 120;
  let frames = name === 'hitch' ? 300 : 240;
  const live = name.startsWith('live-');
  const rendering = name.startsWith('frames-') || live;
  if (rendering) frames = 72;
  g.player.actor.health.invulnerable = 1e9;
  let event: (frame: number) => void = () => {};
  let keys: (frame: number) => string[] = () => [];
  let validate = () => {};
  if (name === 'stable' || name === 'hitch' || rendering) {
    const room = g.world.roomById.stable;
    d.teleport(room.x, room.z);
  }
  if (name === 'movement') keys = (i) => (i < 90 ? ['KeyD', 'Shift'] : i < 150 ? ['KeyW'] : []);
  if (name === 'doorway') {
    const door = g.world.entities.find((e) => e.type === 'door' && !e.locked)!;
    if (door.type !== 'door') throw new Error('CPU doorway fixture');
    const dx = door.axis === 'x' ? 1 : 0,
      dz = door.axis === 'z' ? 1 : 0;
    d.teleport(door.x - dx * 1.6, door.z - dz * 1.6);
    event = (i) => {
      if (i === 0)
        g.player.actor.navigator.goTo(
          g.player.actor.position,
          { x: door.x + dx * 1.6, z: door.z + dz * 1.6 },
          { openDoors: true },
        );
    };
  }
  if (
    [
      'shield',
      'cargo',
      'ragdoll',
      'bones',
      'bolt',
      'javelin',
      'hazard',
      'landing',
      'airborne',
      'stairs',
      'settled',
    ].includes(name)
  ) {
    const stage = createReviewStage(g);
    const profile =
      name === 'shield' || name === 'landing'
        ? 'player'
        : name === 'cargo'
          ? 'shieldbearer'
          : name === 'ragdoll'
            ? 'goblin'
            : 'skeleton';
    const clip =
      name === 'shield'
        ? 'guard'
        : name === 'cargo'
          ? 'carry'
          : name === 'airborne'
            ? 'jump'
            : name === 'stairs'
              ? 'stairs-down'
              : 'travel';
    const fixture = stage.fixture(profile, clip);
    fixture.advance(name === 'airborne' ? 26 : 18);
    const a = g.combat.actor(fixture.id)!;
    let acceptedBlocks = 0;
    validate = () => {
      if (name === 'shield') {
        if (a.health.current !== 100 || acceptedBlocks !== 10)
          throw new Error('CPU shield fixture missed accepted block reactions');
      } else if (name === 'cargo') {
        if (a.entity.require('rigPose').actions.mode !== 'carry')
          throw new Error('CPU cargo did not resume carrying');
      } else if (name === 'landing') {
        if (!a.alive || a.health.current !== 100 || a.entity.has('ragdoll'))
          throw new Error('CPU hero respawn failed');
      } else {
        const r = a.entity.get('ragdoll');
        if (!r?.settled || r.bodyCount + r.constraintCount + r.staticCount !== 0)
          throw new Error('CPU death did not settle/retire');
      }
    };
    for (const actor of g.combat.enemies) actor.entity.remove('brain');
    for (const actor of g.combat.enemies) actor.entity.remove('squadMember');
    for (const group of g.ecs.query('koboldSquad')) group.remove('koboldSquad');
    if (profile !== 'player') {
      g.player.actor.health.current = 100;
      d.teleport(-6, -5);
      g.player.actor.entity.require('rig').root.setEnabled(true);
    }
    g.player.actor.health.invulnerable = name === 'landing' ? 0 : 1e9;
    warmup = 0;
    if (name === 'shield') {
      g.player.actor.health.invulnerable = 0;
      event = (i) => {
        if (i === 0) a.entity.require('defense').release();
        if ((i === 0 || i === 26 || i === 90) && !requestDefense(a))
          throw new Error('CPU shield raise rejected');
        if (i === 24 || i === 70) a.entity.require('defense').release();
        if ([4, 5, 6, 30, 31].includes(i))
          for (let hit = 0; hit < 2; hit++)
            g.combat.damage(a, 10, undefined, {
              kind: 'melee',
              travel: { x: -Math.sin(a.position.heading), z: -Math.cos(a.position.heading) },
            });
        acceptedBlocks = Math.max(
          acceptedBlocks,
          a.entity.require('blockFeedback').last?.sequence ?? 0,
        );
        if (i === 110) requestJump(a);
      };
      keys = (i) => (i >= 20 && i < 60 ? ['KeyD', 'Shift'] : []);
      frames = 180;
    } else if (name === 'cargo') {
      frames = 180;
      if (name === 'cargo')
        event = (i) => {
          if (i === 30) {
            d.teleport(a.position.x + 1, a.position.z);
            if (!g.combat.startAttack(a, g.player.actor))
              throw new Error('CPU cargo combat handoff failed');
          }
          if (i === 90) {
            a.attack.reset();
            a.attack.target = null;
            stopActor(a);
          }
        };
    } else {
      frames = 500;
      const kill = () => {
        const accepted = g.combat.damage(
          a,
          1000,
          undefined,
          name === 'hazard' || name === 'landing'
            ? undefined
            : {
                kind: 'melee',
                travel: name === 'stairs' ? { x: 0, z: 1 } : { x: 1, z: 0 },
              },
        );
        if (!accepted) throw new Error('CPU lethal fixture rejected');
      };
      if (name === 'settled') {
        kill();
        for (let i = 0; i < 501; i++) d.step([], 1);
        if (!a.entity.require('ragdoll').settled)
          throw new Error('CPU settled fixture still active');
        d.teleport(a.position.x - 1.7, a.position.z);
        frames = 180;
        keys = (i) => (i < 75 ? ['KeyD'] : i < 120 ? ['KeyA', 'Shift'] : []);
      } else if (name === 'bolt' || name === 'javelin') {
        const source = g.combat.enemies.find((actor) =>
          name === 'bolt' ? actor.kind === 'goblin' : !!actor.entity.require('rig').spear,
        )!;
        Object.assign(a.position, { x: 0, z: 0, h: 0, heading: 0 });
        Object.assign(source.position, {
          x: -3,
          z: name === 'javelin' ? 0.4 : 0,
          h: 0,
          heading: Math.PI / 2,
        });
        source.health.current = source.health.max;
        source.entity.require('rig').root.setEnabled(true);
        a.health.current = 1;
        for (const actor of [a, source]) actor.entity.require('rigPose').reset(actor.position);
        event = (i) => {
          if (
            i === 0 &&
            !g.combat.startAttack(source, a, name === 'bolt' ? 'CROSSBOW' : 'THROW_JAVELIN')
          )
            throw new Error('CPU projectile attack rejected');
          if (i === 120 && a.alive) throw new Error('CPU projectile failed to kill');
        };
      } else if (name === 'landing') {
        let airborne = false;
        let killed = false;
        event = (i) => {
          if (i === 0 && !requestJump(a)) throw new Error('CPU landing jump rejected');
          airborne ||= a.jump.airborne;
          if (airborne && !a.jump.airborne && !killed) {
            kill();
            killed = true;
          }
          if (i === 120 && !killed) throw new Error('CPU landing kill did not occur');
        };
      } else
        event = (i) => {
          if (i === 0) kill();
        };
    }
  }
  if (name === 'burst') {
    frames = 500;
    event = (i) => {
      if (i !== 0) return;
      for (const a of g.combat.enemies) {
        if (!a.alive) throw new Error('CPU burst warmup lost an enemy');
        if (
          !g.combat.damage(a, 1000, undefined, {
            kind: 'melee',
            travel: { x: Math.sin(a.position.heading), z: Math.cos(a.position.heading) },
          })
        )
          throw new Error('CPU burst death rejected');
      }
    };
    validate = () => {
      if (
        g.ecs.query('ragdoll').length !== 24 ||
        g.ecs.query('ragdoll').some((e) => !e.require('ragdoll').settled)
      )
        throw new Error('CPU population burst incomplete');
    };
  }
  // Ensure input/motor state does not inherit any bootstrap interaction. Authored moving-death
  // fixtures intentionally retain their just-published motion/history until the accepted kill.
  stopActor(g.player.actor);
  return {
    kind:
      rendering ||
      [
        'entrance',
        'stable',
        'hitch',
        'movement',
        'doorway',
        'burst',
        'frames-low',
        'frames-high',
      ].includes(name)
        ? 'natural-world'
        : 'authored-rig',
    warmup,
    frames,
    rendering,
    live,
    keys,
    event,
    validate,
    evidence: () => null,
    ticks: (i: number) => (rendering ? [0, 1, 2, 4][i % 4] : 1),
  };
}
