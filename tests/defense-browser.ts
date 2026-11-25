import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { DebugWindow } from './browserTypes.ts';
import { clickWorld } from './world-pointer.ts';

declare const window: DebugWindow;
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const checks: string[] = [],
  errors: string[] = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultNavigationTimeout(90000);
const pass = (name: string) => {
  checks.push(name);
  console.log(`PASS ${name}`);
};
const step = (frames = 1, codes: string[] = []) =>
  page.evaluate(
    ({ frames, codes }) => {
      window.__dungeon.step(codes, frames);
    },
    { frames, codes },
  );
const state = () =>
  page.evaluate(() => {
    const g = window.__dungeon.game,
      a = g.player.actor,
      rig = a.entity.require('rig');
    const V = g.camera.target.constructor as typeof Vector3;
    rig.forearms[0].computeWorldMatrix(true);
    rig.shield!.computeWorldMatrix(true);
    const hand = V.TransformCoordinates(new V(0, -0.27, 0), rig.forearms[0].getWorldMatrix());
    const grip = V.TransformCoordinates(new V(0, -0.12, -0.28), rig.shield!.getWorldMatrix());
    return {
      defending: a.defending,
      defense: a.entity.require('defense').chart.snapshot.value,
      health: a.health.current,
      protection: a.health.invulnerable,
      swing: a.attack.swing,
      target: a.attack.target,
      position: { ...a.position },
      speed: a.motion.actualSpeed,
      jump: a.jump.active,
      armYaw: rig.arms[0].rotation.y,
      shieldGripError: V.Distance(hand, grip),
      actionMode: a.entity.require('rigPose').actions.mode,
      shieldWeight: a.entity.require('rigPose').actions.shield.weight,
      particles: g.ecs.query('particle').map((e) => e.require('particle').kind),
      plants: rig.footPlants.map((p) => p.anchor),
      head: rig.head?.rotation.asArray(),
    };
  });
async function fixture(ranged = false, front = true) {
  await page.keyboard.up('f');
  return page.evaluate(
    ({ ranged, front }) => {
      const d = window.__dungeon,
        g = d.game;
      for (const a of g.combat.enemies) {
        a.entity.remove('brain');
        a.entity.remove('corpse');
        a.entity.remove('work');
        a.attack.reset();
        a.navigator.cancel();
        a.health.current = a.health.max;
        Object.assign(a.position, { x: 1000, z: 1000, h: 0 });
        a.motion.speed = a.motion.actualSpeed = 0;
      }
      for (const e of [...g.ecs.query('particle'), ...g.ecs.query('projectile')])
        g.ecs.remove(e.id);
      const target = g.combat.enemies.find((a) => a.kind === (ranged ? 'goblin' : 'skeleton'))!;
      Object.assign(target.position, { x: 0, z: (front ? 1 : -1) * (ranged ? 4.8 : 1.2), h: 0 });
      d.teleport(0, 0);
      g.player.heading = 0;
      g.player.health = 100;
      g.player.actor.health.invulnerable = 0;
      g.player.actor.attack.cooldown = 0;
      g.camera.alpha = g.desiredAlpha = -Math.PI / 2;
      g.camera.beta = 0.64;
      g.camera.radius = g.desiredRadius = 20;
      d.step([], 1);
      return target.id;
    },
    { ranged, front },
  );
}
async function attack(id: string, ranged = false) {
  assert.ok(
    await page.evaluate(
      ({ id, ranged }) => {
        const g = window.__dungeon.game;
        return g.combat.startAttack(g.combat.actor(id)!, g.player.actor, ranged);
      },
      { id, ranged },
    ),
  );
}
async function capture(name: string, alpha: number) {
  const geometry = await page.evaluate(
    ({ alpha, name }) => {
      const d = window.__dungeon,
        g = d.game,
        a = g.player.actor;
      const V = g.camera.target.constructor as typeof Vector3;
      g.camera.alpha = g.desiredAlpha = alpha;
      g.camera.beta = name === 'ramp' ? 0.45 : 1.12;
      g.camera.radius = g.desiredRadius = 6;
      // Settle only presentation/cutaways at the capture angle, without advancing combat.
      for (let i = 0; i < 60; i++) d.step([], 0);
      g.camera.target.set(a.position.x, a.elevation + 0.95, a.position.z);
      if (name.startsWith('raised-'))
        for (const enemy of g.combat.enemies) enemy.entity.require('rig').root.setEnabled(false);
      g.scene.render();
      const shield = a.entity.require('render').meshes.find((m) => m.name === 'shield')!;
      const normal = V.TransformNormal(new V(-1, 0, 0), shield.getWorldMatrix()).normalize();
      const center = shield.getAbsolutePosition();
      return {
        normal: normal.asArray(),
        forwardDot:
          normal.x * Math.sin(a.position.heading) + normal.z * Math.cos(a.position.heading),
        frontOffset:
          (center.x - a.position.x) * Math.sin(a.position.heading) +
          (center.z - a.position.z) * Math.cos(a.position.heading),
        height: center.y - a.elevation,
      };
    },
    { alpha, name },
  );
  assert.ok(geometry.forwardDot > 0.98, JSON.stringify(geometry));
  assert.ok(geometry.frontOffset > 0.3, JSON.stringify(geometry));
  const style = await page.addStyleTag({
    content: 'body > :not(#game) { visibility: hidden !important; }',
  });
  try {
    await page.screenshot({ path: `test-results/chromium-defense-${name}.png` });
  } finally {
    await style.evaluate((node) => node.parentNode?.removeChild(node));
    await page.evaluate(() => {
      for (const enemy of window.__dungeon.game.combat.enemies)
        enemy.entity.require('rig').root.setEnabled(true);
    });
  }
  return geometry;
}

try {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await mkdir('test-results', { recursive: true });
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  await page.evaluate(() => window.__dungeon.engine.stopRenderLoop());

  if (process.env.DEFENSE_CAPTURES_ONLY) {
    const id = await fixture();
    await page.keyboard.down('f');
    await step();
    const frontGeometry = await capture('raised-front', Math.PI / 2);
    const sideGeometry = await capture('raised-side', Math.PI);
    await attack(id);
    await step(16);
    await capture('frontal-block', Math.PI / 4);
    await page.keyboard.up('f');
    await fixture();
    const alpha = await page.evaluate(() => {
      const d = window.__dungeon,
        g = d.game,
        c = g.world.connections.find((c) => c.ramp)!;
      const along = (c.start + c.end) / 2;
      d.teleport(c.axis === 'x' ? along : c.cross, c.axis === 'x' ? c.cross : along);
      g.player.heading = c.axis === 'x' ? Math.PI / 2 : 0;
      return c.axis === 'x' ? Math.PI / 2 : 0;
    });
    await page.keyboard.down('f');
    await step();
    await capture('ramp', alpha);
    await page.keyboard.up('f');
    assert.deepEqual(errors, []);
    await writeFile(
      'test-results/chromium-defense-visual-report.json',
      JSON.stringify({ success: true, frontGeometry, sideGeometry, errors }, null, 2),
    );
  } else {
    let id = await fixture();
    await page.keyboard.down('f');
    await step();
    assert.ok((await state()).defending);
    const frontGeometry = await capture('raised-front', Math.PI / 2);
    const sideGeometry = await capture('raised-side', Math.PI);
    await attack(id);
    await step(16);
    assert.equal((await state()).health, 100);
    assert.equal((await state()).protection, 0);
    assert.ok((await state()).particles.includes('block'));
    assert.ok(!(await state()).particles.includes('blood'));
    await capture('frontal-block', Math.PI / 4);
    await page.keyboard.up('f');
    await step();
    assert.equal((await state()).defending, false);
    assert.ok((await state()).shieldWeight > 0 && (await state()).shieldWeight < 1);
    assert.ok((await state()).shieldGripError < 0.01);
    assert.equal((await state()).actionMode, 'free');
    await step(60);
    assert.equal((await state()).shieldWeight, 0);
    assert.ok(Math.abs((await state()).armYaw) < 1e-6);
    pass(
      'Real F down/up raises a physically forward shield, blocks melee with sparks, and restores pose',
    );

    for (const ranged of [false, true])
      for (const front of [true, false]) {
        id = await fixture(ranged, front);
        await page.keyboard.down('f');
        await attack(id, ranged);
        if (ranged) {
          await step(28);
          assert.equal(
            await page.evaluate(() => window.__dungeon.game.ecs.query('projectile').length),
            1,
          );
          await page.evaluate((id) => {
            window.__dungeon.game.combat.actor(id)!.position.z *= -1;
          }, id);
          await step(32);
        } else await step(16);
        assert.equal((await state()).health, front ? 100 : ranged ? 93 : 91);
        await page.keyboard.up('f');
      }
    pass(
      'Frontal melee/bolts block, rear hits damage, and bolt direction survives shooter relocation',
    );

    id = await fixture();
    await page.evaluate((id) => {
      const g = window.__dungeon.game,
        enemy = g.combat.actor(id)!;
      g.combat.target(g.player.actor, enemy);
      if (!g.combat.startAttack(g.player.actor, enemy)) throw new Error('No windup');
    }, id);
    await step(14);
    await page.keyboard.down('f');
    assert.equal((await state()).swing, null);
    assert.equal((await state()).target, id);
    await step(90);
    assert.equal(
      await page.evaluate((id) => window.__dungeon.game.combat.actor(id)!.health.current, id),
      48,
    );
    await page.keyboard.up('f');
    await step(14);
    assert.equal((await state()).swing, null, 'cannot swing while lowering');
    await step(17);
    assert.equal(
      await page.evaluate((id) => window.__dungeon.game.combat.actor(id)!.health.current, id),
      24,
    );
    pass(
      'F interrupts the last windup frame and suspends autoswing; release resumes selected pursuit',
    );

    for (const run of [false, true]) {
      const traces: number[][] = [];
      for (const corpse of [false, true]) {
        id = await fixture();
        await page.evaluate(
          ({ id, corpse }) => {
            const g = window.__dungeon.game,
              target = g.combat.actor(id)!;
            if (corpse) {
              g.combat.damage(target, 1000);
              target.entity.require('corpse').age = 1;
            } else Object.assign(target.position, { x: 1000, z: 1000 });
          },
          { id, corpse },
        );
        await page.keyboard.down('f');
        if (run) await page.keyboard.press('KeyR');
        await clickWorld(page, 0, 5);
        const samples = await page.evaluate(() => {
          const d = window.__dungeon,
            g = d.game,
            samples: number[] = [];
          for (let i = 0; i < 30; i++) {
            d.step([], 1);
            if (!g.player.actor.defending) throw new Error('Guard dropped while moving');
            samples.push(g.player.actor.position.z, g.player.motion.actualSpeed);
          }
          return samples;
        });
        traces.push(samples);
        assert.ok(Math.abs((await state()).speed - (run ? 7.4 : 4.8)) < 0.02);
        assert.ok(Math.abs((await state()).position.heading) < 0.03);
        await capture(`${run ? 'run' : 'walk'}-${corpse ? 'corpse' : 'floor'}`, 0);
        await page.keyboard.up('f');
      }
      assert.deepEqual(traces[0], traces[1]);
    }
    pass('Guarded walk/run retain normal speed, heading and identical full-speed corpse crossings');

    await fixture();
    const ramp = await page.evaluate(() => {
      const d = window.__dungeon,
        g = d.game;
      const c = g.world.connections.find((c) => c.ramp)!;
      const from = c.axis === 'x' ? { x: c.start, z: c.cross } : { x: c.cross, z: c.start };
      const to = c.axis === 'x' ? { x: c.end, z: c.cross } : { x: c.cross, z: c.end };
      d.teleport(from.x, from.z);
      if (!g.player.navigator.goTo(g.player.actor.position, to))
        throw new Error('Ramp route missing');
      return { to, height: c.ramp!.b };
    });
    await page.keyboard.down('f');
    for (let i = 0; i < 20; i++) {
      await step(30);
      if (await page.evaluate(() => !window.__dungeon.game.player.navigator.active)) break;
    }
    const atRamp = await state();
    assert.ok(atRamp.defending);
    assert.ok(Math.hypot(atRamp.position.x - ramp.to.x, atRamp.position.z - ramp.to.z) < 0.05);
    assert.ok(Math.abs(atRamp.position.h - ramp.height) < 0.05);
    await capture('ramp', 0);
    await page.keyboard.up('f');
    pass('Held defense preserves floor routing and supported travel across the real seeded ramp');

    await fixture();
    await page.keyboard.down('f');
    await page.keyboard.press('Space');
    await step(10);
    assert.equal((await state()).defending, false);
    assert.ok((await state()).jump);
    await step(80);
    await page.keyboard.down('f');
    await step();
    assert.equal((await state()).defending, false);
    await page.keyboard.up('f');
    await page.keyboard.down('f');
    await step();
    assert.ok((await state()).defending);
    await clickWorld(page, 2, -2);
    await page.keyboard.down('f');
    await step();
    assert.equal((await state()).defending, true);
    await page.keyboard.up('f');
    await page.keyboard.down('f');
    await step();
    assert.ok((await state()).defending);
    pass('Jump lowers guard until a fresh press; floor clicks preserve held defense');

    for (const reset of ['blur', 'menu', 'inspection', 'hidden', 'teleport', 'death'] as const) {
      await fixture();
      await page.keyboard.down('f');
      await page.keyboard.press('KeyR');
      await step();
      if (reset === 'menu') await page.keyboard.press('Escape');
      else
        await page.evaluate((reset) => {
          const d = window.__dungeon,
            g = d.game;
          if (reset === 'blur') window.dispatchEvent(new Event('blur'));
          if (reset === 'inspection') {
            const portrait = g.world.entities.find(
              (e) => e.type === 'portrait' && e.room === 'entrance',
            );
            if (!portrait?.inspection) throw new Error('No inspection target');
            g.inspection.open(portrait.inspection);
          }
          if (reset === 'hidden') {
            Object.defineProperty(document, 'hidden', { configurable: true, value: true });
            document.dispatchEvent(new Event('visibilitychange'));
          }
          if (reset === 'teleport') d.teleport(0, 0);
          if (reset === 'death') {
            g.combat.damage(g.player.actor, 1000);
            d.step([], 1);
          }
        }, reset);
      assert.equal((await state()).defending, false, reset);
      assert.equal((await state()).armYaw, 0, reset);
      assert.ok((await state()).shieldGripError < 0.01, reset);
      assert.equal((await state()).actionMode, 'free', reset);
      if (reset !== 'death') assert.deepEqual((await state()).plants, [null, null], reset);
      if (reset === 'menu') await page.keyboard.press('Escape');
      if (reset === 'inspection')
        await page.evaluate(() => window.__dungeon.game.inspection.close({ immediate: true }));
      if (reset === 'hidden')
        await page.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, value: false });
          document.dispatchEvent(new Event('visibilitychange'));
        });
      await page.keyboard.down('f');
      await step(3);
      assert.equal((await state()).defending, false, `${reset}: repeat cannot resume held F`);
      await page.keyboard.up('f');
      await page.keyboard.down('f');
      await step();
      assert.ok((await state()).defending, `${reset}: genuine fresh press works`);
      await page.keyboard.up('f');
    }
    pass(
      'Blur/menu/inspection/hidden/death/teleport snap-reset guard; physically held F repeats cannot resume it',
    );

    await fixture();
    await page.keyboard.down('Control');
    await page.keyboard.down('f');
    await step();
    assert.equal((await state()).defending, false);
    await page.keyboard.up('Control');
    await page.keyboard.down('f');
    await step();
    assert.equal((await state()).defending, false);
    await page.keyboard.up('f');
    // A repeated keydown after RELEASE (e.g. an out-of-window press) is also not a fresh press.
    await page.evaluate(() =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'KeyF', repeat: true, bubbles: true }),
      ),
    );
    assert.equal((await state()).defending, false);
    await page.keyboard.down('f');
    await page.keyboard.down('f');
    await step();
    assert.ok((await state()).defending);
    await page.keyboard.up('f');
    pass(
      'Modified F and unowned repeats do not raise; repeated downs during a valid hold remain stable',
    );

    await page.keyboard.down('f');
    await page.evaluate(() => window.__dungeon.regenerate('MOURNING-731'));
    await page.waitForFunction(() => window.__dungeon.ready, {}, { timeout: 90000 });
    await page.keyboard.down('f');
    await step();
    assert.equal((await state()).defending, false);
    await page.keyboard.up('f');
    await page.keyboard.down('f');
    await step();
    assert.ok((await state()).defending);
    const enemies = await page.evaluate(() =>
      window.__dungeon.game.combat.enemies.map((a) => ({
        id: a.id,
        kind: a.kind,
        role: a.entity.get('squadMember')?.role,
        defense: a.entity.has('defense'),
      })),
    );
    assert.equal(enemies.length, 24);
    assert.equal(enemies.filter((a) => a.kind === 'kobold' && a.role === 'shieldbearer').length, 9);
    assert.equal(enemies.filter((a) => a.kind === 'kobold' && a.role === 'spearman').length, 3);
    assert.equal(enemies.filter((a) => a.kind === 'skeleton').length, 8);
    assert.equal(enemies.filter((a) => a.kind === 'goblin').length, 4);
    assert.equal(enemies.filter((a) => a.defense).length, 9);
    for (const enemy of enemies)
      assert.equal(
        enemy.defense,
        enemy.kind === 'kobold' && enemy.role === 'shieldbearer',
        `${enemy.id}: only shield bearers opt into enemy defense`,
      );
    await page.keyboard.up('f');
    pass(
      'Regeneration restores player/role-based defense; a still-held key cannot raise the hero guard',
    );
    assert.deepEqual(errors, []);
    await writeFile(
      'test-results/chromium-defense-report.json',
      JSON.stringify({ success: true, checks, errors, frontGeometry, sideGeometry }, null, 2),
    );
  }
} finally {
  await browser.close();
}
