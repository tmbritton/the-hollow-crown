import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import type { DebugWindow } from './browserTypes.ts';
import type { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';

declare const window: DebugWindow;
const production = process.argv.includes('--production');
const base = new URL(process.env.DEMO_URL ?? `http://localhost:${production ? 4173 : 5173}/`);
const tag = production ? (base.pathname === '/' ? 'root' : 'pages') : 'dev';
const browser = await chromium.launch({
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const deadline = setTimeout(() => void browser.close(), 600000);
const modes = ['control', 'decisions', 'poses'] as const;
try {
  await mkdir('test-results', { recursive: true });
  const snapshots = [];
  for (const mode of modes) {
    const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // Scene readiness uses its own polling; manual dev steps must start at tick zero.
    if (!production)
      await page.addInitScript(() => {
        window.requestAnimationFrame = () => 0;
      });
    const url = new URL(
      `?enemyProfile=${mode}&seed=MOURNING-731${production ? '' : '&debug'}`,
      base,
    );
    await page.goto(url.href);
    await page.waitForSelector('#loading.done', { state: 'attached', timeout: 90000 });
    const panel = page.locator('#enemy-profile');
    await panel.waitFor({ timeout: 5000 });
    assert.match(await panel.innerText(), new RegExp(`${mode}.*MOURNING-731`, 'i'));
    assert.equal(await page.locator('#quality').inputValue(), 'high');
    if (production) {
      assert.equal(await page.evaluate(() => '__dungeon' in window), false);
      assert.equal(await page.locator('#seed-label').textContent(), 'MOURNING-731');
      assert.equal(await page.locator('#room-name').textContent(), 'The Ashen Vestibule');
      await panel.locator('[data-phase="complete"]').waitFor({ timeout: 90000 });
      const text = await panel.innerText();
      const row = text.match(
        /Window: ([\d.]+) s · (\d+) frames · HUD FPS: ([\d.]+)\nFrame interval: median ([\d.]+) ms · p95 ([\d.]+) ms\nPer frame: ([\d.]+) ticks · ([\d.]+) squad · ([\d.]+) individual · ([\d.]+) poses\nCPU per frame: decisions ([\d.]+) ms · rig ([\d.]+) ms/,
      );
      assert.ok(row, text);
      const [
        duration,
        frames,
        fps,
        median,
        p95,
        ticks,
        squad,
        individual,
        poses,
        decisionsMs,
        rigMs,
      ] = row.slice(1).map(Number);
      assert.ok(
        duration >= 10 && frames > 0 && fps > 0 && median > 0 && p95 >= median && ticks > 0,
      );
      assert.equal(squad > 0 && individual > 0 && decisionsMs > 0, mode !== 'decisions');
      if (mode === 'decisions') assert.deepEqual([squad, individual, decisionsMs], [0, 0, 0]);
      assert.equal(poses > 0 && rigMs > 0, mode !== 'poses');
      if (mode === 'poses') assert.deepEqual([poses, rigMs], [0, 0]);
      console.log(url.href, '\n' + text);
      await page.screenshot({ path: `test-results/enemy-profile-${tag}-${mode}.png` });
      const map = () =>
        page.locator('#map').evaluate((canvas) => {
          if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing minimap canvas');
          return canvas.toDataURL();
        });
      const beforeMove = await map();
      await page.mouse.click(565, 350);
      await expect.poll(map, { timeout: 15000 }).not.toBe(beforeMove);
      assert.equal(await panel.innerText(), text);
      if (mode === 'control') {
        await page.reload();
        await page.waitForSelector('#loading.done', { state: 'attached', timeout: 90000 });
        assert.equal(await page.locator('#seed-label').textContent(), 'MOURNING-731');
        assert.equal(await panel.locator('[data-phase="complete"]').count(), 0);
      }
      await page.keyboard.press('Escape');
      await page.locator('#regenerate').waitFor();
      await page.locator('#regenerate').click();
      await page.waitForSelector('#loading.done', { state: 'attached', timeout: 90000 });
      assert.equal(await panel.count(), 0);
      assert.equal(new URL(page.url()).searchParams.has('enemyProfile'), false);
    } else {
      await page.waitForFunction(() => window.__dungeon?.ready, {}, { polling: 100 });
      const result = await page.evaluate(() => {
        const d = window.__dungeon;
        d.engine.stopRenderLoop();
        const g = d.game;
        if (g.steps !== 0) throw new Error(`Initial live frame escaped: tick ${g.steps}`);
        const actors = g.combat.enemies;
        const pose = (id: string) => {
          const r = g.combat.actor(id)!.entity.require('rig');
          return [...r.arms, ...r.forearms, ...r.legs, ...(r.tail ?? [])].map((n) => [
            ...n.position.asArray(),
            ...(n.rotationQuaternion?.asArray() ?? n.rotation.asArray()),
          ]);
        };
        const snapshot = () => ({
          actors: g.combat.actors.map((a) => [
            { ...a.position },
            a.health.current,
            a.attack.target,
          ]),
          objectives: [
            g.active,
            g.complete,
            g.scenario?.run.get('tribute')?.clock,
            g.scenario?.run.get('lastEmber')?.state,
          ],
        });
        const initial = snapshot();
        const joints = actors.map((a) => JSON.stringify(pose(a.id)));
        const hero = JSON.stringify(pose(g.player.actor.id));
        d.step(['Space'], 18);
        d.step([], 75);
        const updated = snapshot();
        const animated = actors.filter(
          (a, i) => a.alive && JSON.stringify(pose(a.id)) !== joints[i],
        ).length;
        const tracked = actors
          .filter((a) => a.alive)
          .every((a) => {
            const r = a.entity.require('rig');
            const at = r.root.getAbsolutePosition();
            return (
              Math.hypot(at.x - a.position.x, at.z - a.position.z, at.y - a.elevation) < 1e-5 &&
              Math.abs(Math.sin(r.root.rotation.y - a.position.heading)) < 1e-5
            );
          });
        const enemy = actors.find((a) => a.alive)!;
        const root = enemy.entity.require('rig').root;
        const jointsBefore = JSON.stringify(pose(enemy.id));
        root.setEnabled(false);
        d.step([], 1);
        const hidden = !root.isEnabled();
        root.setEnabled(true);
        d.step([], 1);
        const revealed = root.isEnabled();
        const sameAfterHide = jointsBefore === JSON.stringify(pose(enemy.id));
        const heroAnimated = hero !== JSON.stringify(pose(g.player.actor.id));
        Object.assign(enemy.position, { x: 4, z: 0, h: 0 });
        d.teleport(0, 0);
        g.camera.alpha = g.desiredAlpha = -Math.PI / 2;
        d.step([], 1);
        return {
          initial,
          updated,
          animated,
          tracked,
          hidden,
          revealed,
          sameAfterHide,
          heroAnimated,
          enemy: { id: enemy.id, ...enemy.position },
          obstructed: !g.player.actor.navigator.canOccupy(enemy.position),
        };
      });
      assert.ok(result.hidden && result.revealed && result.obstructed);
      const { id, x, z, h } = result.enemy;
      const contacts = await page.evaluate((id) => {
        const { game, engine } = window.__dungeon;
        game.scene.render();
        const actor = game.combat.actor(id)!;
        const V = game.camera.target.constructor as typeof Vector3;
        const M = game.camera.getWorldMatrix().constructor as typeof Matrix;
        const w = engine.getRenderWidth(),
          h = engine.getRenderHeight();
        const rect = document.querySelector('#game')!.getBoundingClientRect();
        return actor.entity
          .require('render')
          .meshes.filter((mesh) => mesh.isEnabled() && mesh.isVisible)
          .map((mesh) => {
            mesh.computeWorldMatrix(true);
            const p = V.Project(
              mesh.getBoundingInfo().boundingBox.centerWorld,
              M.Identity(),
              game.scene.getTransformMatrix(),
              game.camera.viewport.toGlobal(w, h),
            );
            return { x: rect.left + (p.x * rect.width) / w, y: rect.top + (p.y * rect.height) / h };
          });
      }, id);
      for (const point of contacts) {
        await page.mouse.click(point.x, point.y);
        if (
          await page.evaluate((id) => window.__dungeon.game.player.actor.attack.target === id, id)
        )
          break;
      }
      assert.equal(await page.evaluate(() => window.__dungeon.game.player.actor.attack.target), id);
      await page.screenshot({ path: `test-results/enemy-profile-dev-${mode}-living.png` });
      const death = await page.evaluate((id) => {
        const d = window.__dungeon;
        const enemy = d.game.combat.actor(id)!;
        d.game.combat.damage(enemy, 1000);
        const handoff = enemy.entity.require('deathHandoff').pose;
        const root = handoff?.world.slice(12, 15);
        const angular = handoff?.angular.every((v) => v === 0);
        d.step([], 240);
        d.game.scene.render();
        return {
          root,
          angular,
          corpse: enemy.entity.has('corpse'),
          settled: enemy.entity.get('ragdoll')?.settled ?? false,
        };
      }, id);
      assert.ok(death.corpse && death.settled);
      assert.deepEqual(death.root, [x, h, z]);
      if (mode === 'poses') assert.equal(death.angular, true);
      await page.screenshot({ path: `test-results/enemy-profile-dev-${mode}-settled.png` });
      if (mode === 'poses') {
        const cargo = await page.evaluate(() => {
          const d = window.__dungeon,
            g = d.game;
          const actor = g.combat.enemies.find((a) => a.alive && a.kind === 'kobold')!;
          const cargo = g.ecs.get('run')!.require('tribute').cargo[0].require('cargo');
          const crate = g.scene.getTransformNodeByName('Royal tribute crate 0')!;
          cargo.claim(actor.entity);
          cargo.commit(actor.entity, 'pickup');
          // Hold the test carrier still so a pure yaw change tests the socket, not AI steering.
          actor.entity.remove('brain');
          d.step([], 1);
          const first = crate.position.asArray();
          const elevated = crate.position.y - actor.elevation > 0.2;
          actor.position.heading += Math.PI / 2;
          d.step([], 1);
          const turned = Math.hypot(crate.position.x - first[0], crate.position.z - first[2]) > 0.1;
          const aligned = Math.cos(crate.rotation.y - actor.position.heading) > 0.999;
          const turnedX = crate.position.x;
          actor.position.x += 0.5;
          d.step([], 1);
          return {
            elevated,
            turned,
            aligned,
            followed: Math.abs(crate.position.x - turnedX - 0.5) < 1e-5,
          };
        });
        assert.deepEqual(cargo, { elevated: true, turned: true, aligned: true, followed: true });
      }
      await page.evaluate(() => window.__dungeon.regenerate('MOURNING-731'));
      assert.equal(await panel.count(), 0);
      assert.ok(result.heroAnimated);
      if (mode === 'poses')
        assert.ok(result.animated === 0 && result.tracked && result.sameAfterHide);
      else assert.ok(result.animated > 0);
      if (mode === 'decisions')
        assert.deepEqual(result.updated.actors.slice(1), result.initial.actors.slice(1));
      snapshots.push(result);
      console.log(url.href, 'drawn boundary passed');
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  if (!production) {
    assert.deepEqual(snapshots[0].initial, snapshots[1].initial);
    assert.deepEqual(snapshots[0].initial, snapshots[2].initial);
    assert.deepEqual(snapshots[0].updated, snapshots[2].updated);
  }
  for (const query of [
    '',
    '?enemyProfile=unknown&seed=MOURNING-731',
    '?enemyProfile=poses&enemyProfile=poses',
    '?room=practice&enemyProfile=poses',
    '?debug',
  ]) {
    const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
    await page.goto(new URL(query, base).href);
    await page.waitForSelector('#loading.done', { state: 'attached', timeout: 90000 });
    assert.equal(await page.locator('#enemy-profile').count(), 0);
    if (!production && query === '?debug')
      await page.waitForFunction(() => '__dungeon' in window, {}, { polling: 100 });
    assert.equal(
      await page.evaluate(() => '__dungeon' in window),
      !production && query === '?debug',
    );
    if (query.startsWith('?enemyProfile=unknown')) {
      assert.equal(await page.locator('#seed-label').textContent(), 'MOURNING-731');
      await page.reload();
      await page.waitForSelector('#loading.done', { state: 'attached', timeout: 90000 });
      assert.notEqual(await page.locator('#seed-label').textContent(), 'MOURNING-731');
      assert.equal(await page.locator('#enemy-profile').count(), 0);
    }
    await page.close();
  }
  console.log(`${tag}: 3 variant visits and 5 non-opt-in visits passed`);
} finally {
  clearTimeout(deadline);
  await browser.close();
}
