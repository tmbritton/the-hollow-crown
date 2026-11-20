import type { Game } from '../src/gameTypes.ts';
import { animateActors, resetActorRig } from '../src/actorRendering.ts';
import { moveActor, requestDefense, requestJump, stopActor } from '../src/actors.ts';
import { ATTACKS } from '../src/attackKinds.ts';
import type { AttackKind } from '../src/attackKinds.ts';
import { heightAt } from '../src/world.ts';
import { WorkAction } from '../src/machines/actors/work.ts';
import { Cargo, synchronizeCargo } from '../src/cargo.ts';
import { KoboldSquad } from '../src/koboldSquads.ts';
import type { MonsterPerception } from '../src/machines/monsters/types.ts';

export const reviewProfiles = ['player', 'skeleton', 'goblin', 'shieldbearer', 'spearman'] as const;
export type ReviewProfile = (typeof reviewProfiles)[number];
export const reviewClips = [
  'travel',
  'stairs',
  'stairs-down',
  'corpse',
  'jump',
  'melee',
  'moving-melee',
  'crossbow',
  'hide-peek',
  'guard',
  'thrust',
  'throw',
  'formation',
  'opening',
  'retreat',
  'cards',
  'smoke',
  'hackysack',
  'shrine',
  'focus',
  'packing',
  'unloading',
  'carry',
  'death',
  'interrupt',
] as const;
export type ReviewClip = (typeof reviewClips)[number];
export const reviewCatalog: { profile: ReviewProfile; clip: ReviewClip }[] = [
  ...reviewProfiles.map((profile) => ({ profile, clip: 'travel' as const })),
  ...(
    [
      'stairs',
      'stairs-down',
      'corpse',
      'jump',
      'melee',
      'moving-melee',
      'guard',
      'shrine',
      'interrupt',
    ] as const
  ).map((clip) => ({ profile: 'player' as const, clip })),
  ...(['crossbow', 'hide-peek', 'focus', 'death'] as const).map((clip) => ({
    profile: 'goblin' as const,
    clip,
  })),
  ...(['thrust', 'throw'] as const).map((clip) => ({ profile: 'spearman' as const, clip })),
  ...(
    [
      'formation',
      'opening',
      'retreat',
      'cards',
      'smoke',
      'hackysack',
      'packing',
      'unloading',
      'carry',
    ] as const
  ).map((clip) => ({ profile: 'shieldbearer' as const, clip })),
  { profile: 'skeleton', clip: 'death' },
];

/** Browser-only authored review fixtures. Real input uses the controller's ordinary game tick.
 * These short clips exercise production motor/pose/clock code, not AI or objective outcomes. */
export function createReviewStage(g: Game) {
  const brains = new Map(g.combat.enemies.map((a) => [a.id, a.brain]));
  const initial = new Map(g.combat.actors.map((a) => [a.id, { ...a.position }]));
  const perception: MonsterPerception = {
    type: 'THINK',
    hasTarget: false,
    navigating: false,
    threatened: false,
    swinging: false,
    hidden: false,
    rested: false,
    readyToShoot: false,
    coolingDown: false,
    regroup: false,
    melee: false,
    atHome: false,
    activity: 'smoke',
  };
  const attack = (id: string, kind: AttackKind) => {
    const actor = g.combat.actor(id)!;
    actor.attack.reset();
    actor.attack.start(
      {
        target: 'authored-review-target',
        elapsed: 0,
        resolved: false,
        kind,
        duration: ATTACKS[kind].duration,
        impact: ATTACKS[kind].impact,
      },
      1,
    );
  };
  return {
    fixture(profile: ReviewProfile, clip: ReviewClip) {
      for (const a of g.combat.actors) {
        stopActor(a);
        a.attack.reset();
        a.entity.get('defense')?.release();
        a.entity.remove('corpse');
        a.health.current = 0;
        Object.assign(a.position, { x: 1000, z: 1000, h: 0, heading: 0 });
        const rig = a.entity.require('rig');
        resetActorRig(rig);
        rig.root.setEnabled(false);
        const original = brains.get(a.id);
        if (original && a.kind !== 'player') {
          a.enableAI(original.pack, original.slot);
          Object.assign(a.brain!, { home: original.home, social: original.social });
          a.brain!.behavior.send(perception);
        }
      }
      for (const group of g.ecs.query('koboldSquad')) {
        const members = group
          .require('koboldSquad')
          .members.map((m) => g.combat.actor(m.entity.id)!);
        group.add('koboldSquad', new KoboldSquad(g.ecs, group, members));
      }
      for (const entity of g.ecs.query('cargo')) entity.add('cargo', new Cargo());
      const social = clip === 'cards' || clip === 'smoke' || clip === 'hackysack';
      const actor = g.combat.actors.find((a) =>
        social
          ? a.kind === 'kobold' &&
            a.brain?.social?.activity === clip &&
            (profile !== 'spearman' || a.entity.get('squadMember')?.role === 'spearman')
          : profile === 'shieldbearer'
            ? a.entity.get('squadMember')?.role === profile &&
              a.entity.get('squadMember')?.slot === 1
            : profile === 'spearman'
              ? a.entity.get('squadMember')?.role === profile
              : a.kind === profile,
      );
      if (!actor) throw new Error(`Missing review profile: ${profile}/${clip}`);
      const p =
        clip === 'stairs'
          ? { x: -52, z: 16 }
          : clip === 'stairs-down'
            ? { x: -52, z: 12 }
            : { x: -1.5, z: 0 };
      const place = (id: string, at: { x: number; z: number; heading?: number }) => {
        const a = g.combat.actor(id)!;
        Object.assign(a.position, {
          ...at,
          h: heightAt(g.world, at.x, at.z) ?? 0,
          heading: at.heading ?? Math.PI / 2,
        });
        a.health.current = a.health.max;
        a.entity.get('collision')?.sync?.(a.position);
        const rig = a.entity.require('rig');
        rig.root.setEnabled(true);
        rig.root.rotation.y = a.position.heading;
      };
      place(actor.id, {
        ...p,
        heading: clip === 'stairs' ? Math.PI : clip === 'stairs-down' ? 0 : Math.PI / 2,
      });
      if (social) {
        for (const id of actor.brain!.social!.members) {
          place(id, initial.get(id)!);
          g.combat.actor(id)!.brain!.behavior.send({ ...perception, atHome: true, activity: clip });
        }
      }
      if (clip === 'corpse') {
        const dead = g.combat.enemies.find((a) => a.kind === 'skeleton')!;
        place(dead.id, { x: 0, z: -0.8, heading: 0 });
        dead.health.current = 0;
        dead.entity.add('corpse', { age: 1 });
      }
      if (clip === 'carry') {
        const cargo = g.ecs.query('cargo')[0].require('cargo');
        cargo.claim(actor.entity);
        cargo.commit(actor.entity, 'pickup');
      }
      const duration = { shrine: 6, focus: 20, packing: 20, unloading: 8 };
      if (clip in duration) {
        const work = new WorkAction(actor.entity, `review:${clip}`);
        actor.entity.add('work', work);
        work.chart.send({
          type: 'START',
          id: `review:${clip}`,
          duration: duration[clip as keyof typeof duration],
        });
      }
      const squad = actor.entity.get('squadMember')?.group.get('koboldSquad');
      const squadTick = {
        type: 'TICK' as const,
        dt: 1 / 60,
        survivors: 4,
        valid: true,
        cohesive: true,
        home: false,
        attack: 'LONG_THRUST' as const,
      };
      const formation = clip === 'formation' || clip === 'opening';
      if (formation) {
        for (const member of squad!.members)
          place(member.entity.id, {
            x: p.x + (member.slot === 3 ? 0.175 : (member.slot - 1) * 1.15),
            z: p.z + (member.slot === 3 ? -0.9 : 0.3),
            heading: 0,
          });
        squad!.chart.send({ type: 'ALERT', target: g.player.actor.entity });
        if (clip === 'opening') {
          squad!.chart.send(squadTick);
          squad!.chart.send({ ...squadTick, dt: 1.25 });
        }
      }
      g.player.marker.setEnabled(false);
      g.player.destinationMarker.setEnabled(false);
      g.time = g.combat.time = 0;
      g.steps = 0;
      let frame = 0;
      return {
        id: actor.id,
        advance(frames: number) {
          if (!Number.isInteger(frames) || frames < 0 || frames > 120)
            throw new Error('Bounded review batch required');
          for (let i = 0; i < frames; i++) {
            frame++;
            const dt = 1 / 60;
            if (frame === 12) {
              const kind: AttackKind | null =
                clip === 'crossbow'
                  ? 'CROSSBOW'
                  : clip === 'thrust'
                    ? 'LONG_THRUST'
                    : clip === 'throw'
                      ? 'THROW_JAVELIN'
                      : ['melee', 'moving-melee', 'interrupt'].includes(clip)
                        ? 'MELEE'
                        : null;
              if (kind) attack(actor.id, kind);
              if (clip === 'jump') requestJump(actor);
              if (clip === 'death') {
                actor.health.current = 0;
                actor.entity.add('corpse', { age: 0 });
              }
            }
            if (clip === 'interrupt' && frame === 22) requestDefense(actor);
            if (clip === 'guard' || clip === 'retreat') {
              if (frame === 6) requestDefense(actor);
              if (clip === 'guard' && frame === 54) actor.entity.get('defense')?.release();
            }
            if (formation) {
              const before = squad!.state;
              const rear = g.combat.actor(squad!.members[3].entity.id)!;
              squad!.chart.send({
                ...squadTick,
                cohesive: clip === 'opening' || frame >= 18,
                blocked: clip === 'formation' && frame >= 54,
                attackDone: before === 'attacking' && !rear.attack.swing,
              });
              if (before !== 'attacking' && squad!.state === 'attacking')
                attack(rear.id, 'LONG_THRUST');
              rear.attack.advance(dt);
              for (const member of squad!.members) {
                const a = g.combat.actor(member.entity.id)!;
                if (member.role === 'shieldbearer') {
                  if (squad!.isOpening(member)) a.entity.get('defense')?.release();
                  else if (!a.defending) {
                    a.entity.get('defense')?.release();
                    requestDefense(a);
                  }
                }
                moveActor(
                  a,
                  g.world,
                  {
                    direction: {
                      x: 0,
                      z: clip === 'formation' && squad!.state === 'engaging' ? 1 : 0,
                    },
                    speed: 1.1,
                    facing: 0,
                  },
                  dt,
                );
              }
            }
            if (clip === 'hide-peek')
              actor.brain!.behavior.send({ ...perception, hasTarget: true, hidden: frame < 48 });
            const moving = [
              'travel',
              'stairs',
              'stairs-down',
              'corpse',
              'moving-melee',
              'retreat',
              'carry',
            ].includes(clip);
            const speed =
              clip === 'retreat'
                ? 0.85
                : profile === 'skeleton'
                  ? 1.65
                  : profile === 'player'
                    ? frame < 36
                      ? 4.8
                      : 7.4
                    : actor.entity.require('actor').speed;
            const active = moving && (clip !== 'travel' || (frame >= 6 && frame < 66));
            const direction =
              clip === 'stairs'
                ? { x: 0, z: -1 }
                : clip === 'stairs-down'
                  ? { x: 0, z: 1 }
                  : clip === 'retreat'
                    ? { x: -1, z: 0 }
                    : clip === 'travel' && frame >= 48
                      ? { x: -1, z: 0 }
                      : { x: 1, z: 0 };
            if (clip !== 'death' && !formation)
              moveActor(
                actor,
                g.world,
                {
                  direction: active ? direction : { x: 0, z: 0 },
                  speed,
                  ...(clip === 'retreat' ? { facing: Math.PI / 2 } : {}),
                },
                dt,
              );
            actor.attack.advance(dt);
            actor.entity.get('work')?.chart.send({ type: 'TICK', dt });
            const corpse = actor.entity.get('corpse');
            if (corpse) corpse.age += dt;
            g.time = g.combat.time = frame / 60;
            g.steps = frame;
            synchronizeCargo(g.ecs, g.world);
            animateActors(g.ecs, dt, g.time, g.world);
            g.enemyRendering.update();
            g.tributeRendering.update();
          }
          return frame;
        },
      };
    },
    /** All 25 original rigs, all four action kinds, 4 settled corpses. Animation CPU only. */
    async baseline(frames = 240) {
      const kinds: AttackKind[] = ['MELEE', 'CROSSBOW', 'LONG_THRUST', 'THROW_JAVELIN'];
      for (const [i, actor] of g.combat.actors.entries()) {
        stopActor(actor);
        actor.attack.reset();
        actor.entity.remove('brain');
        actor.entity.remove('corpse');
        actor.health.current = actor.health.max;
        Object.assign(actor.position, initial.get(actor.id)!);
        const rig = actor.entity.require('rig');
        resetActorRig(rig);
        rig.root.setEnabled(true);
        actor.motion.actualSpeed = actor.entity.require('actor').speed;
        actor.motion.wantsMovement = true;
        if (i >= 21) {
          actor.health.current = 0;
          actor.entity.add('corpse', { age: 1 });
        }
      }
      const actionActors = [
        g.player.actor,
        g.combat.enemies.find((a) => a.kind === 'goblin')!,
        ...g.combat.enemies
          .filter((a) => a.entity.get('squadMember')?.role === 'spearman')
          .slice(0, 2),
      ];
      let queries = 0;
      const get = g.world.tiles.get;
      g.world.tiles.get = function (key) {
        queries++;
        return get.call(this, key);
      };
      const timings: number[] = [],
        queryCounts: number[] = [];
      try {
        for (let i = -60; i < frames; i++) {
          if ((i + 60) % 60 === 0) actionActors.forEach((a, n) => attack(a.id, kinds[n]));
          for (const actor of actionActors) actor.attack.advance(1 / 60);
          queries = 0;
          const start = performance.now();
          animateActors(g.ecs, 1 / 60, (i + 60) / 60, g.world);
          const elapsed = performance.now() - start;
          if (i >= 0) {
            timings.push(elapsed);
            queryCounts.push(queries);
          }
          if (i % 12 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
        }
      } finally {
        g.world.tiles.get = get;
      }
      timings.sort((a, b) => a - b);
      return {
        frames,
        warmup: 60,
        actors: g.combat.actors.length,
        corpses: g.ecs.query('corpse').length,
        actionKinds: kinds,
        meanMs: timings.reduce((a, b) => a + b, 0) / frames,
        p95Ms: timings[Math.floor(frames * 0.95)],
        maxTileQueries: Math.max(...queryCounts),
        meanTileQueries: queryCounts.reduce((a, b) => a + b, 0) / frames,
        scope:
          'animateActors only; stationary travel-driven pose load; diagnostic sampling and scene rendering excluded',
      };
    },
  };
}
