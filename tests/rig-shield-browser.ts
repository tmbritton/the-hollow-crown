import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { DebugWindow } from './browserTypes.ts';
import type { createReviewStage } from './animation-review-fixture.ts';
import type { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';

declare const window: DebugWindow & { shieldStage?: ReturnType<typeof createReviewStage> };
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const deadline = setTimeout(() => void browser.close().catch(() => {}), 240000);
try {
  await mkdir('test-results', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } }),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  await page.evaluate(() => {
    const d = window.__dungeon;
    d.animation.pause();
    d.engine.stopRenderLoop();
    d.regenerate('MOURNING-731');
  });
  await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
  // Real input and real melee clock before the controlled numerical/geometry sequences.
  const source = await page.evaluate(() => {
    const d = window.__dungeon,
      g = d.game;
    for (const a of g.combat.enemies) {
      a.entity.remove('brain');
      a.attack.reset();
      a.health.current = 0;
      a.entity.require('rig').root.setEnabled(false);
    }
    const enemy = g.combat.enemies.find((a) => a.kind === 'skeleton')!;
    enemy.health.current = enemy.health.max;
    Object.assign(enemy.position, { x: 0, z: 1.2, h: 0 });
    d.teleport(0, 0);
    g.player.heading = 0;
    g.player.health = 100;
    g.player.actor.health.invulnerable = 0;
    d.step([], 1);
    return enemy.id;
  });
  await page.keyboard.down('f');
  const press = await page.evaluate((id) => {
    const d = window.__dungeon,
      g = d.game;
    d.step([], 1);
    const a = g.player.actor;
    const node = a.entity.require('rig').shield!;
    node.computeWorldMatrix(true);
    const m = node.getWorldMatrix().m,
      V = g.camera.target.constructor as typeof Vector3;
    const normal = V.Cross(new V(m[4], m[5], m[6]), new V(m[8], m[9], m[10]))
      .normalize()
      .scaleInPlace(-1);
    const result = {
      guarded: a.defending,
      weight: a.entity.require('rigPose').actions.shield.weight,
      normal: normal.x * Math.sin(a.position.heading) + normal.z * Math.cos(a.position.heading),
    };
    g.combat.startAttack(g.combat.actor(id)!, a);
    d.step([], 16);
    return {
      ...result,
      health: a.health.current,
      kind: a.entity.require('blockFeedback').last?.kind,
      recoil: a.entity.require('rigPose').actions.shield.recoil,
    };
  }, source);
  assert.ok(
    press.guarded &&
      press.weight > 0 &&
      press.normal > 0.98 &&
      press.health === 100 &&
      press.kind === 'melee' &&
      press.recoil > 0,
  );
  await page.keyboard.up('f');
  const release = await page.evaluate(() => {
    const d = window.__dungeon;
    d.step([], 1);
    const a = d.game.player.actor;
    return { guarded: a.defending, weight: a.entity.require('rigPose').actions.shield.weight };
  });
  assert.equal(release.guarded, false);
  assert.ok(release.weight > 0 && release.weight < 1);
  await page.keyboard.press('x');
  assert.equal(await page.evaluate(() => window.__dungeon.game.player.actor.defending), false);
  await page.keyboard.press('Escape');
  const reset = await page.evaluate(() => {
    const a = window.__dungeon.game.player.actor;
    return {
      motion: a.entity.require('rigPose').actions.shield.snapshot(),
      pending: a.entity.require('blockFeedback').pendingCount,
    };
  });
  assert.equal(reset.motion.weight, 0);
  assert.equal(reset.motion.recoil, 0);
  assert.equal(reset.pending, 0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__dungeon.regenerate('MOURNING-731'));
  await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
  const sequences = [];
  for (const profile of ['player', 'shieldbearer'] as const)
    for (const hits of [false, true])
      for (const view of ['side', 'gameplay'] as const) {
        const result = await page.evaluate(
          async ({ profile, hits, view }) => {
            const fixturePath = '/tests/animation-review-fixture.ts',
              actorPath = '/src/actors.ts',
              renderPath = '/src/actorRendering.ts',
              worldPath = '/src/world.ts';
            const { createReviewStage } = (await import(
              fixturePath
            )) as typeof import('./animation-review-fixture.ts');
            const { requestDefense, requestJump } = (await import(
              actorPath
            )) as typeof import('../src/actors.ts');
            const { animateActors } = (await import(
              renderPath
            )) as typeof import('../src/actorRendering.ts');
            const { heightAt } = (await import(worldPath)) as typeof import('../src/world.ts');
            const d = window.__dungeon,
              g = d.game;
            window.shieldStage ??= createReviewStage(g);
            const f = window.shieldStage.fixture(profile, 'guard'),
              a = g.combat.actor(f.id)!,
              b = a.entity.require('rigPose'),
              r = a.entity.require('rig');
            const source = g.combat.enemies.find((s) => s.kind === 'skeleton')!;
            const draw = () => {
              if (view === 'side') {
                // The generic review side favors the sword arm; inspect this feature from
                // the shield-side three-quarter angle so the grip and face remain visible.
                d.animation.camera(null);
                g.camera.alpha = Math.PI / 2 - a.position.heading + 0.6;
                g.camera.beta = 1.1;
                g.camera.radius = 6.5;
                g.camera.target.set(a.position.x, a.position.h + 0.9, a.position.z);
              } else d.animation.camera('gameplay', a.id);
              d.animation.render();
            };
            const V = g.camera.target.constructor as typeof Vector3;
            const frames = [];
            let maxGrip = 0,
              minSole = Infinity,
              minNormal = 1,
              maxRepeat = 0,
              rearEvent = false;
            for (let frame = 1; frame <= 132; frame++) {
              if (hits && (frame === 57 || frame === 62)) requestDefense(a);
              if (hits && frame === 60) a.entity.require('defense').release();
              if (hits && frame === 61) requestDefense(a, true);
              if (hits && frame === 75) requestJump(a);
              if (hits && [18, 21, 24].includes(frame)) {
                const n = frame === 24 ? 8 : 1;
                for (let i = 0; i < n; i++) {
                  const side = frame === 18 ? -0.7 : 0.7,
                    heading = a.position.heading;
                  g.combat.damage(a, frame === 18 ? 6 : 24, source, {
                    kind: i % 2 ? 'projectile' : 'melee',
                    travel: {
                      x: side * Math.cos(heading) - Math.sin(heading),
                      z: -side * Math.sin(heading) - Math.cos(heading),
                    },
                  });
                }
              }
              if (hits && frame === 40) {
                const seq = a.entity.require('blockFeedback').last?.sequence;
                g.combat.damage(a, 5, source, {
                  kind: 'projectile',
                  travel: { x: Math.sin(a.position.heading), z: Math.cos(a.position.heading) },
                });
                rearEvent = a.entity.require('blockFeedback').last?.sequence !== seq;
              }
              f.advance(1);
              r.root.computeWorldMatrix(true);
              for (const n of r.root.getDescendants()) n.computeWorldMatrix(true);
              const hand = V.TransformCoordinates(
                new V(0, -0.27, 0),
                r.forearms[0].getWorldMatrix(),
              );
              const grip = V.TransformCoordinates(
                new V(0, -0.12, -0.28),
                r.shield!.getWorldMatrix(),
              );
              maxGrip = Math.max(maxGrip, V.Distance(hand, grip));
              if (a.defending) {
                const m = r.shield!.getWorldMatrix().m;
                const normal = V.Cross(new V(m[4], m[5], m[6]), new V(m[8], m[9], m[10]))
                  .normalize()
                  .scaleInPlace(-1);
                minNormal = Math.min(
                  minNormal,
                  normal.x * Math.sin(a.position.heading) + normal.z * Math.cos(a.position.heading),
                );
                if (!b.actions.shield.guarded) throw new Error('Guard target delayed');
              }
              for (const foot of r.feet)
                for (const mesh of foot.getChildMeshes())
                  for (const p of mesh.getBoundingInfo().boundingBox.vectorsWorld)
                    minSole = Math.min(
                      minSole,
                      p.y - (heightAt(g.world, p.x, p.z) ?? a.position.h),
                    );
              const before = [...b.pose.world],
                motion = b.actions.shield.snapshot(),
                seq = a.entity.require('blockFeedback').last?.sequence;
              for (let i = 0; i < 3; i++) animateActors(g.ecs, 0, g.time, g.world);
              maxRepeat = Math.max(
                maxRepeat,
                ...b.pose.world.map((v, i) => Math.abs(v - before[i])),
              );
              if (
                JSON.stringify(motion) !== JSON.stringify(b.actions.shield.snapshot()) ||
                seq !== a.entity.require('blockFeedback').last?.sequence
              )
                throw new Error('Repeated read advanced shield state');
              let image: string | undefined,
                pose: ReturnType<typeof d.animation.sample> | undefined;
              if (frame % 6 === 0) {
                draw();
                image = d.engine.getRenderingCanvas()!.toDataURL('image/jpeg', 0.72).split(',')[1];
                pose = d.animation.sample(a.id);
              }
              frames.push({
                frame,
                guarded: a.defending,
                weight: b.actions.shield.weight,
                recoil: b.actions.shield.recoil,
                side: b.actions.shield.side,
                brace: b.actions.shield.brace,
                tail: b.tail ? [...b.tail.angles] : [],
                health: a.health.current,
                image,
                pose,
              });
            }
            draw();
            return {
              profile,
              hits,
              view,
              frames,
              maxGrip,
              minSole,
              minNormal,
              maxRepeat,
              rearEvent,
            };
          },
          { profile, hits, view },
        );
        sequences.push(result);
        if (view === 'gameplay')
          assert.deepEqual(
            result.frames.map((f) => ({ ...f, image: undefined })),
            sequences.at(-2)!.frames.map((f) => ({ ...f, image: undefined })),
            'camera replay must preserve shield/body/tail state',
          );
        assert.ok(result.maxGrip < 0.01, `${profile}: grip ${result.maxGrip}`);
        assert.ok(result.minSole >= -0.001, `${profile}: sole ${result.minSole}`);
        assert.ok(result.minNormal > 0.98, `${profile}: guard orientation ${result.minNormal}`);
        assert.ok(result.maxRepeat < 1e-5, `${profile}: repeat ${result.maxRepeat}`);
        assert.equal(result.rearEvent, false);
      }
  const tailControl = sequences.find((s) => s.profile === 'shieldbearer' && !s.hits)!;
  const tailHit = sequences.find((s) => s.profile === 'shieldbearer' && s.hits)!;
  const tailResponse = Math.max(
    ...tailHit.frames
      .slice(17, 40)
      .flatMap((f, i) => f.tail.map((v, j) => Math.abs(v - tailControl.frames[i + 17].tail[j]))),
  );
  assert.ok(tailResponse > 0.001, `tail response ${tailResponse}`);
  const moving = await page.evaluate(async () => {
    const actorPath = '/src/actors.ts',
      worldPath = '/src/world.ts';
    const { requestDefense } = (await import(actorPath)) as typeof import('../src/actors.ts');
    const { heightAt } = (await import(worldPath)) as typeof import('../src/world.ts');
    const g = window.__dungeon.game,
      rows = [];
    const V = g.camera.target.constructor as typeof Vector3;
    for (const profile of ['player', 'shieldbearer'] as const)
      for (const clip of ['stairs', 'stairs-down'] as const)
        for (const hits of [false, true]) {
          const f = window.shieldStage!.fixture(profile, clip),
            a = g.combat.actor(f.id)!,
            r = a.entity.require('rig'),
            b = a.entity.require('rigPose');
          const source = g.combat.enemies.find((e) => e.kind === 'skeleton')!;
          requestDefense(a);
          let maxGrip = 0,
            minSole = Infinity,
            worstFrame = 0,
            worstMode = '';
          const travel = [];
          for (let frame = 1; frame <= 120; frame++) {
            if (hits && [24, 48, 72].includes(frame))
              g.combat.damage(a, 24, source, {
                kind: 'projectile',
                travel: { x: -Math.sin(a.position.heading), z: -Math.cos(a.position.heading) },
              });
            f.advance(1);
            r.root.computeWorldMatrix(true);
            for (const n of r.root.getDescendants()) n.computeWorldMatrix(true);
            const hand = V.TransformCoordinates(new V(0, -0.27, 0), r.forearms[0].getWorldMatrix());
            const grip = V.TransformCoordinates(new V(0, -0.12, -0.28), r.shield!.getWorldMatrix());
            maxGrip = Math.max(maxGrip, V.Distance(hand, grip));
            for (let i = 0; i < 2; i++)
              if (!b.grounding.contacts[i].target.release)
                for (const mesh of r.feet[i].getChildMeshes())
                  for (const p of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
                    const clearance = p.y - (heightAt(g.world, p.x, p.z) ?? a.position.h);
                    if (clearance < minSole) {
                      minSole = clearance;
                      worstFrame = frame;
                      worstMode = b.grounding.contacts[i].mode;
                    }
                  }
            travel.push({
              x: a.position.x,
              z: a.position.z,
              h: a.position.h,
              speed: a.motion.actualSpeed,
              health: a.health.current,
            });
          }
          rows.push({ profile, clip, hits, maxGrip, minSole, worstFrame, worstMode, travel });
        }
    return rows;
  });
  console.log(
    moving.map((r) => ({
      profile: r.profile,
      clip: r.clip,
      hits: r.hits,
      maxGrip: r.maxGrip,
      minSole: r.minSole,
      worstFrame: r.worstFrame,
      worstMode: r.worstMode,
    })),
  );
  await writeFile('test-results/a6-moving-shield.json', JSON.stringify(moving, null, 2));
  for (let i = 0; i < moving.length; i += 2) {
    const control = moving[i],
      hit = moving[i + 1];
    assert.deepEqual(hit.travel, control.travel, 'block recoil cannot change motor/terrain/health');
    for (const row of [control, hit]) {
      assert.ok(row.maxGrip < 0.01, `${row.profile}/${row.clip}: moving grip ${row.maxGrip}`);
      assert.ok(row.minSole >= -0.001, `${row.profile}/${row.clip}: moving sole ${row.minSole}`);
    }
  }
  const gate = await page.evaluate(async () => {
    const d = window.__dungeon,
      g = d.game,
      f = window.shieldStage!.fixture('shieldbearer', 'opening'),
      a = g.combat.actor(f.id)!,
      r = a.entity.require('rig'),
      b = a.entity.require('rigPose');
    const V = g.camera.target.constructor as typeof Vector3,
      M = g.player.root.getWorldMatrix().constructor as typeof Matrix;
    const mesh = g.scene.getMeshByName(`${a.id}:squad shield`)!;
    const rows = [];
    for (let frame = 1; frame <= 132; frame++) {
      if ([95, 98].includes(frame))
        for (let i = 0; i < 4; i++)
          g.combat.damage(a, 24, g.player.actor, {
            kind: 'projectile',
            travel: { x: 0.75, z: -1 },
          });
      if (frame === 18) {
        const sequence = a.entity.require('blockFeedback').last?.sequence;
        if (!g.combat.damage(a, 5, g.player.actor, { kind: 'melee', travel: { x: 0, z: -1 } }))
          throw new Error('Opening incorrectly blocked damage');
        if (sequence !== a.entity.require('blockFeedback').last?.sequence)
          throw new Error('Opening invented a block reaction');
      }
      f.advance(1);
      r.root.computeWorldMatrix(true);
      r.shield!.computeWorldMatrix(true);
      mesh.computeWorldMatrix(true);
      const inv = M.Invert(mesh.getWorldMatrix()),
        box = mesh.getBoundingInfo().boundingBox;
      const start = V.TransformCoordinates(
        new V(a.position.x + 0.575, a.elevation + 0.85, a.position.z - 3),
        inv,
      );
      const end = V.TransformCoordinates(
        new V(a.position.x + 0.575, a.elevation + 0.85, a.position.z + 4),
        inv,
      );
      let enter = 0,
        exit = 1;
      for (const axis of ['x', 'y', 'z'] as const) {
        const delta = end[axis] - start[axis];
        if (Math.abs(delta) < 1e-9) {
          if (start[axis] < box.minimum[axis] || start[axis] > box.maximum[axis]) enter = 2;
        } else {
          const t0 = (box.minimum[axis] - start[axis]) / delta,
            t1 = (box.maximum[axis] - start[axis]) / delta;
          enter = Math.max(enter, Math.min(t0, t1));
          exit = Math.min(exit, Math.max(t0, t1));
        }
      }
      let side: string | undefined, gameplay: string | undefined;
      if (frame % 6 === 0) {
        d.animation.camera(null);
        g.camera.alpha = Math.PI / 2 - a.position.heading + 0.6;
        g.camera.beta = 1.1;
        g.camera.radius = 6.5;
        g.camera.target.set(a.position.x, a.position.h + 0.9, a.position.z);
        d.animation.render();
        side = d.engine.getRenderingCanvas()!.toDataURL('image/jpeg', 0.72).split(',')[1];
        d.animation.camera('gameplay', a.id);
        d.animation.render();
        gameplay = d.engine.getRenderingCanvas()!.toDataURL('image/jpeg', 0.72).split(',')[1];
      }
      rows.push({
        frame,
        guarded: a.defending,
        opening: b.actions.opening,
        covered: enter <= exit,
        recoil: b.actions.shield.recoil,
        phase: a.entity.require('squadMember').group.require('koboldSquad').state,
        side,
        gameplay,
      });
    }
    d.animation.camera('side', a.id);
    d.animation.render();
    return rows;
  });
  assert.ok(gate.some((f) => f.guarded));
  assert.ok(gate.some((f) => f.opening === 1));
  assert.ok(
    gate.some((f) => f.guarded && f.recoil > 0.01),
    'confirmed gate blocks must recoil',
  );
  assert.ok(
    gate.every((f) => !f.guarded || f.covered),
    'guarded gate exposed its spear lane',
  );
  assert.ok(
    gate.every((f) => f.opening < 1 || !f.covered),
    'opening obstructed the spear lane',
  );
  await page.screenshot({ path: 'test-results/a6-phalanx-recovery.png' });
  assert.deepEqual(errors, []);
  await writeFile(
    'test-results/rig-shield-report.json',
    JSON.stringify(
      {
        press,
        release,
        reset,
        sequences: sequences.map((s) => ({
          ...s,
          frames: s.frames.map((f) => ({ ...f, image: undefined })),
        })),
        tailResponse,
        moving,
        gate: gate.map((f) => ({ ...f, side: undefined, gameplay: undefined })),
        errors,
      },
      null,
      2,
    ),
  );
  const playback = [
    ...sequences.map((s) => ({
      name: `${s.profile}/${s.hits ? 'confirmed-blocks' : 'raise-lower'} · ${s.view}`,
      frames: s.frames.filter((f) => f.image).map((f) => ({ frame: f.frame, image: f.image })),
    })),
    ...(['side', 'gameplay'] as const).map((view) => ({
      name: `phalanx/opening-recoil · ${view}`,
      frames: gate.filter((f) => f[view]).map((f) => ({ frame: f.frame, image: f[view] })),
    })),
  ];
  await writeFile(
    'test-results/rig-shield-motion.html',
    `<!doctype html><meta charset="utf-8"><title>A6 shield motion</title><style>body{background:#14191c;color:#e1d4ae;font:16px system-ui}img{max-width:95vw}button,select{font:inherit;margin:8px}</style><h1>A6 shield motion</h1><select id="clip"></select><button id="play">Pause</button><select id="rate"><option value="1">1×</option><option value="0.25">¼×</option></select><span id="frame"></span><br><img id="pose"><p>60 Hz simulation sampled at 10 Hz. Normal speed first, then quarter speed.</p><script>const data=${JSON.stringify(playback)};const clip=document.getElementById('clip'),pose=document.getElementById('pose'),label=document.getElementById('frame');data.forEach((s,i)=>clip.add(new Option(s.name,i)));let playing=true,t=0,last=null;clip.onchange=()=>t=0;document.getElementById('play').onclick=()=>playing=!playing;function draw(now){if(playing&&last!==null)t+=(now-last)/1000*Number(document.getElementById('rate').value);last=now;const s=data[Number(clip.value)],f=s.frames[Math.floor(t*10)%s.frames.length];pose.src='data:image/jpeg;base64,'+f.image;label.textContent='frame '+f.frame;requestAnimationFrame(draw)}requestAnimationFrame(draw);</script>`,
  );
  console.log(
    'PASS shield motion: real F/melee, repeated reads, directional bursts, lowering/reversal/jump, contacts, tail response and phalanx lane',
  );
} finally {
  clearTimeout(deadline);
  await browser.close();
}
