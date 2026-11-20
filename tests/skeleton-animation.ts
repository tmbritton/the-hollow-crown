import assert from 'node:assert/strict';
import type { Page } from '@playwright/test';
import type { DebugWindow } from './browserTypes.ts';

declare const window: DebugWindow;
type Sequence =
  | 'ordinary control'
  | 'flat lurch'
  | 'stairs lurch'
  | 'corpse lurch'
  | 'moving attack';

/** Consecutive real motor steps, not stationary speed injection. Included in the one animation pass. */
export async function captureSkeletonGait(page: Page) {
  const captures: { title: string; image: string }[] = [];
  const sequences = [];
  for (const mode of [
    'ordinary control',
    'flat lurch',
    'stairs lurch',
    'corpse lurch',
    'moving attack',
  ] as const) {
    const id = await page.evaluate(async (mode: Sequence) => {
      const actorsPath = '/src/actors.ts',
        renderPath = '/src/actorRendering.ts',
        worldPath = '/src/world.ts';
      const { stopActor } = (await import(actorsPath)) as typeof import('../src/actors.ts');
      const { resetActorRig } = (await import(
        renderPath
      )) as typeof import('../src/actorRendering.ts');
      const { heightAt } = (await import(worldPath)) as typeof import('../src/world.ts');
      const g = window.__dungeon.game;
      // The suite stops the loop immediately after regeneration, before this renderer's
      // first update. Place its coffers at their real sites instead of leaving them at (0,0).
      g.tributeRendering.update();
      const actor = g.combat.enemies.find((a) => a.kind === 'skeleton')!;
      const dead = g.combat.enemies.find((a) => a.kind === 'skeleton' && a.id !== actor.id)!;
      for (const other of g.combat.actors) {
        stopActor(other);
        other.attack.reset();
        other.entity.remove('brain');
        other.entity.remove('corpse');
        other.health.current = other.health.max;
        Object.assign(other.position, { x: 1000, z: 1000, h: 0 });
        const rig = other.entity.require('rig');
        resetActorRig(rig);
        rig.root.setEnabled(other.id === actor.id);
      }
      const stairs = mode === 'stairs lurch';
      const start = stairs ? { x: -52, z: 16 } : { x: -1.5, z: 0 };
      Object.assign(actor.position, {
        ...start,
        h: heightAt(g.world, start.x, start.z)!,
        heading: stairs ? Math.PI : Math.PI / 2,
      });
      const rig = actor.entity.require('rig');
      rig.root.rotation.y = actor.position.heading;
      actor.entity.get('collision')?.sync?.(actor.position);
      // A labelled same-mesh ordinary species reference; restore kind after the sequence.
      // It uses the same 1.65-unit motor intent, not a second animation implementation.
      if (mode === 'ordinary control') actor.entity.require('actor').kind = 'kobold';
      if (mode === 'corpse lurch' || mode === 'moving attack') {
        Object.assign(dead.position, { x: 0, z: -0.8, h: 0, heading: 0 });
        dead.health.current = 0;
        dead.entity.add('corpse', { age: 1 });
        const fallen = dead.entity.require('rig');
        fallen.root.rotation.y = 0;
        fallen.root.setEnabled(true);
      }
      g.player.marker.setEnabled(false);
      g.player.destinationMarker.setEnabled(false);
      g.camera.alpha = stairs ? -Math.PI / 2 + 0.15 : -Math.PI / 2 + 0.65;
      g.camera.beta = stairs ? 1.1 : 1.25;
      g.camera.radius = mode === 'moving attack' ? 6.3 : 4.8;
      return actor.id;
    }, mode);
    const frames = [];
    let previous = 0;
    for (const frame of mode === 'moving attack'
      ? [28, 38, 43, 47, 56, 68, 84, 100]
      : [24, 36, 48, 60, 72, 84, 96, 108]) {
      const result = await page.evaluate(
        async ({ id, mode, previous, frame }) => {
          const actorsPath = '/src/actors.ts',
            renderPath = '/src/actorRendering.ts',
            worldPath = '/src/world.ts',
            locomotionPath = '/src/locomotion.ts';
          const { moveActor } = (await import(actorsPath)) as typeof import('../src/actors.ts');
          const { animateActors, ACTOR_OBSERVATION_RADIUS } = (await import(
            renderPath
          )) as typeof import('../src/actorRendering.ts');
          const { heightAt } = (await import(worldPath)) as typeof import('../src/world.ts');
          const { animateLocomotion } = (await import(
            locomotionPath
          )) as typeof import('../src/locomotion.ts');
          const g = window.__dungeon.game,
            actor = g.combat.actor(id)!,
            rig = actor.entity.require('rig');
          const direction = mode === 'stairs lurch' ? { x: 0, z: -1 } : { x: 1, z: 0 };
          let distance = 0;
          for (let step = previous + 1; step <= frame; step++) {
            if (mode === 'moving attack' && step === 29)
              actor.attack.start(
                {
                  target: 'visual-target',
                  elapsed: 0,
                  duration: 0.62,
                  impact: 0.25,
                  resolved: false,
                  kind: 'MELEE',
                },
                1,
              );
            const before = { ...actor.position };
            moveActor(actor, g.world, { direction, speed: 1.65 }, 1 / 60);
            actor.attack.advance(1 / 60);
            distance += Math.hypot(actor.position.x - before.x, actor.position.z - before.z);
            const authoritative = JSON.stringify({
              p: actor.position,
              speed: actor.motion.actualSpeed,
              jump: actor.jump.height,
              swing: actor.attack.swing,
              route: actor.navigator.path,
            });
            animateActors(g.ecs, 1 / 60, step / 60, g.world);
            if (
              JSON.stringify({
                p: actor.position,
                speed: actor.motion.actualSpeed,
                jump: actor.jump.height,
                swing: actor.attack.swing,
                route: actor.navigator.path,
              }) !== authoritative
            )
              throw new Error('Rendering changed authoritative movement/action state');
            if (
              actor.position.h !== heightAt(g.world, actor.position.x, actor.position.z) ||
              actor.elevation !== actor.position.h
            )
              throw new Error('Lurch changed support or jump');
            if (rig.attackPose) {
              const base = animateLocomotion(
                actor.motion.animation,
                actor.motion.actualSpeed,
                true,
                0,
                1.65,
              );
              const expected =
                base.rightArm + (rig.attackPose.rightArm - base.rightArm) * rig.attackBlend;
              if (Math.abs(rig.arms[1].rotation.x - expected) > 1e-10)
                throw new Error('Lurch overwrote the ordinary weapon-arm blend');
            }
          }
          g.camera.target.set(
            actor.position.x,
            actor.position.h + (mode === 'moving attack' ? 1.05 : 0.85),
            actor.position.z,
          );
          g.scene.render();
          const radius = ACTOR_OBSERVATION_RADIUS * Math.max(...rig.root.scaling.asArray());
          for (const mesh of rig.root.getChildMeshes())
            if (mesh.isVisible && mesh.isEnabled())
              for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld)
                if (corner.subtract(rig.root.position).length() > radius)
                  throw new Error(`Lurch exceeded observation envelope: ${mesh.name}`);
          return {
            frame,
            distance,
            stride: actor.motion.animation.stride,
            speed: actor.motion.actualSpeed,
            position: { x: actor.position.x, z: actor.position.z, h: actor.position.h },
            body: rig.body.rotation.asArray(),
            head: rig.head!.rotation.asArray(),
            legs: rig.legs.map((l) => l.rotation.x),
            knees: rig.knees.map((k) => k.rotation.x),
            soles: rig.feet.map(
              (f) => f.getAbsolutePosition().y - 0.05 * rig.root.scaling.y - actor.position.h,
            ),
            floorClearance: rig.feet.map((f) => {
              const p = f.getAbsolutePosition();
              return (
                p.y - 0.05 * rig.root.scaling.y - (heightAt(g.world, p.x, p.z) ?? actor.position.h)
              );
            }),
            arm: rig.arms[1].rotation.x,
            attack: actor.attack.swing?.elapsed ?? null,
          };
        },
        { id, mode, previous, frame },
      );
      assert.ok(
        result.distance > 0.1 && result.speed > 1.6 && result.speed <= 1.650001,
        JSON.stringify(result),
      );
      assert.ok(
        result.soles.every((h) => h < 0.65) && result.floorClearance.every((h) => h > -0.04),
        JSON.stringify(result),
      );
      frames.push(result);
      captures.push({
        title: `${mode} · frame ${frame}`,
        image: (await page.screenshot()).toString('base64'),
      });
      previous = frame;
    }
    if (mode === 'flat lurch') {
      assert.ok(
        Math.max(...frames.map((f) => f.body[0])) - Math.min(...frames.map((f) => f.body[0])) > 0.2,
      );
      assert.ok(
        Math.max(...frames.map((f) => f.body[2])) - Math.min(...frames.map((f) => f.body[2])) > 0.2,
      );
      assert.ok(
        Math.max(...frames.map((f) => f.head[0])) - Math.min(...frames.map((f) => f.head[0])) >
          0.15,
      );
    }
    if (mode === 'moving attack') {
      assert.ok(frames[1].arm < -1.5, 'clear wind-up');
      assert.ok(Math.abs(frames[2].attack! - 0.25) < 1e-10, 'contact uses existing impact clock');
      assert.ok(Math.abs(frames[2].head[0]) < 0.001, 'head lurch yields to the strike');
    }
    sequences.push({ mode, frames });
    await page.evaluate((id) => {
      window.__dungeon.game.combat.actor(id)!.entity.require('actor').kind = 'skeleton';
    }, id);
  }
  assert.deepEqual(
    sequences[0].frames.map((f) => f.position),
    sequences[1].frames.map((f) => f.position),
    'ordinary and lurch have identical measured travel',
  );
  assert.deepEqual(
    sequences[1].frames.map((f) => f.position),
    sequences[3].frames.map((f) => f.position),
    'corpse crossing retains full-speed travel',
  );

  const resets = [];
  for (const boundary of ['blur', 'stop', 'teleport', 'death'] as const) {
    const result = await page.evaluate(async (boundary) => {
      const actorsPath = '/src/actors.ts',
        renderPath = '/src/actorRendering.ts';
      const { moveActor, stopActor, teleportActor } = (await import(
        actorsPath
      )) as typeof import('../src/actors.ts');
      const { animateActors, resetActorRig } = (await import(
        renderPath
      )) as typeof import('../src/actorRendering.ts');
      const g = window.__dungeon.game,
        actor = g.combat.enemies.find((a) => a.kind === 'skeleton')!,
        rig = actor.entity.require('rig');
      for (const other of g.combat.actors) {
        other.entity.remove('corpse');
        other.entity.require('rig').root.setEnabled(other.id === actor.id);
      }
      stopActor(actor);
      actor.attack.reset();
      actor.health.current = actor.health.max;
      resetActorRig(rig);
      Object.assign(actor.position, { x: -1.5, z: 0, h: 0, heading: Math.PI / 2 });
      actor.entity.get('collision')?.sync?.(actor.position);
      rig.root.rotation.y = actor.position.heading;
      for (let i = 0; i < 48; i++) {
        moveActor(actor, g.world, { direction: { x: 1, z: 0 }, speed: 1.65 }, 1 / 60);
        animateActors(g.ecs, 1 / 60, i / 60, g.world);
      }
      const before = rig.head!.rotation.asArray();
      if (boundary === 'blur') {
        window.dispatchEvent(new Event('blur'));
        // Existing visible-blur policy clears hero input; it does not stop enemy simulation.
        if (
          actor.motion.actualSpeed < 1.6 ||
          rig.head!.rotation.asArray().some((v, i) => v !== before[i])
        )
          throw new Error('Visible blur changed enemy simulation policy');
        const hero = g.player.actor,
          heroRig = hero.entity.require('rig');
        if (hero.motion.actualSpeed !== 0 || heroRig.footPlants.some((p) => p.anchor))
          throw new Error('Blur did not clear hero movement');
      } else if (boundary === 'stop') stopActor(actor);
      else if (boundary === 'teleport') teleportActor(actor, g.world, { x: 1, z: 0 });
      else {
        g.combat.damage(actor, 10000);
        actor.entity.require('corpse').age = 1;
      }
      animateActors(g.ecs, 0, 200, g.world);
      g.camera.target.set(
        actor.position.x + (boundary === 'death' ? 0.5 : 0),
        0.8,
        actor.position.z,
      );
      g.scene.render();
      return {
        boundary,
        before,
        head: rig.head!.rotation.asArray(),
        body: rig.body.rotation.asArray(),
        anchors: rig.footPlants.map((p) => p.anchor),
        stride: actor.motion.animation.stride,
      };
    }, boundary);
    assert.ok(result.before.some((v) => Math.abs(v) > 0.01));
    if (boundary !== 'blur') {
      assert.ok(result.head.every((v) => v === 0));
      assert.ok(result.body.every((v) => v === 0));
      assert.deepEqual(result.anchors, [null, null]);
      assert.equal(result.stride, 0);
    }
    resets.push(result);
    captures.push({
      title: `boundary · ${boundary}`,
      image: (await page.screenshot()).toString('base64'),
    });
  }
  await page.evaluate(async () => {
    await window.__dungeon.regenerate('MOURNING-731');
    window.__dungeon.engine.stopRenderLoop();
  });
  await page.waitForFunction(() => window.__dungeon.ready);
  const regenerated = await page.evaluate(() => {
    const g = window.__dungeon.game;
    return g.combat.enemies
      .filter((a) => a.kind === 'skeleton')
      .every((a) => {
        const rig = a.entity.require('rig');
        return (
          rig.head?.rotation.equalsToFloats(0, 0, 0) &&
          rig.footPlants.every((p) => p.anchor === null) &&
          a.motion.animation.stride === 0
        );
      });
  });
  assert.ok(regenerated, 'regeneration creates fresh neutral skeleton rigs');
  return { captures, report: { sequences, resets, regenerated } };
}
