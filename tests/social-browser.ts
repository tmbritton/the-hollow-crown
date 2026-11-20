import { chromium, firefox } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { DebugWindow } from './browserTypes.ts';
import type { SocialActivity } from '../src/social.ts';

declare const window: DebugWindow;
const browserName = process.env.BROWSER || 'chromium';
const browser = await (browserName === 'firefox' ? firefox : chromium).launch({
  headless: true,
  ...(browserName === 'chromium'
    ? { args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
const checks: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await mkdir('test-results', { recursive: true });
try {
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  await page.evaluate(() => window.__dungeon.engine.stopRenderLoop());
  for (const activity of ['cards', 'hackysack', 'smoke'] satisfies SocialActivity[]) {
    if (process.env.SOCIAL_ACTIVITY && process.env.SOCIAL_ACTIVITY !== activity) continue;
    if (activity !== 'cards')
      await page.evaluate(() => window.__dungeon.regenerate('MOURNING-731'));
    await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
    const fixture = await page.evaluate(async (activity) => {
      const d = window.__dungeon,
        g = d.game;
      d.engine.stopRenderLoop();
      // This fixture isolates ordinary idle gatherings; the tribute suite exercises
      // the same pack's higher-priority physical job and combat interruptions.
      g.ecs.get('run')!.remove('tribute');
      const path = '/src/actors.ts';
      const { teleportActor }: typeof import('../src/actors.ts') = await import(path);
      for (const actor of g.combat.enemies)
        if (actor.entity.get('work')?.objectiveId === 'tribute:carry-away' && actor.brain)
          teleportActor(actor, g.world, actor.brain.home);
      const group = g.combat.enemies.find(
        (actor) => actor.kind === 'kobold' && actor.brain?.social?.activity === activity,
      )?.brain?.social;
      if (!group) throw new Error(`Missing ${activity} group`);
      if (group.members.length !== 4) throw new Error('P6a needs four original participants');
      for (const actor of g.combat.enemies) {
        if (group.members.includes(actor.id)) {
          // Normalize only fixture setup: live startup frames may have begun ordinary travel.
          teleportActor(actor, g.world, actor.brain!.home);
          actor.brain!.think = 0;
          continue;
        }
        actor.health.current = 0;
        actor.entity.require('render').root?.setEnabled(false);
      }
      const tiles = [...g.world.tiles.values()].filter((tile) => g.player.navigator.canStand(tile));
      const safe = tiles
        .filter((tile) => Math.hypot(tile.x - group.center.x, tile.z - group.center.z) > 13)
        .sort(
          (a, b) =>
            Math.hypot(a.x - group.center.x, a.z - group.center.z) -
            Math.hypot(b.x - group.center.x, b.z - group.center.z),
        )[0];
      if (!safe) throw new Error('Missing safe observation tile');
      d.teleport(safe.x, safe.z);
      g.player.actor.health.invulnerable = 100;
      d.step([], 180);
      const escape = tiles.sort(
        (a, b) =>
          Math.hypot(b.x - group.center.x, b.z - group.center.z) -
          Math.hypot(a.x - group.center.x, a.z - group.center.z),
      )[0];
      return { group, safe, escape };
    }, activity);
    const resting = await page.evaluate((members) => {
      const g = window.__dungeon.game;
      return members.map((id) => {
        const actor = g.combat.actor(id)!;
        const rig = actor.entity.require('rig');
        return {
          state: actor.brain!.state,
          x: actor.position.x,
          z: actor.position.z,
          home: actor.brain!.home,
          equipment: actor.entity.require('rig').equipment!.some((mesh) => mesh.isEnabled()),
          stowed: rig.stowedEquipment!.every((mesh) => mesh.isEnabled()),
          role: actor.entity.require('squadMember').role,
          shield: !!rig.shield,
          spear: rig.equipment!.some((mesh) => mesh.name.endsWith(':long spear haft')),
          soles: rig.feet.map((foot) => {
            foot.computeWorldMatrix(true);
            return foot.getAbsolutePosition().y - 0.05 * rig.root.scaling.y - actor.position.h;
          }),
        };
      });
    }, fixture.group.members);
    assert.ok(
      resting.every((actor) => actor.state === activity && !actor.equipment && actor.stowed),
      JSON.stringify(resting),
    );
    assert.deepEqual(
      resting.map((a) => a.role),
      ['shieldbearer', 'shieldbearer', 'shieldbearer', 'spearman'],
    );
    assert.ok(resting.slice(0, 3).every((a) => a.shield && !a.spear));
    assert.ok(resting[3].spear && !resting[3].shield);
    assert.ok(
      resting.every((actor) => Math.hypot(actor.x - actor.home.x, actor.z - actor.home.z) < 0.2),
    );
    if (activity !== 'hackysack')
      assert.ok(
        resting.every((actor) => actor.soles.every((height) => Math.abs(height) < 0.04)),
        'relaxed and seated feet stay on the floor',
      );
    if (activity === 'hackysack') {
      const positions = await page.evaluate((id) => {
        const d = window.__dungeon,
          ball = d.game.scene.getMeshByName(`${id}:hacky sack`)!;
        const before = ball.position.asArray();
        d.step([], 20);
        return [before, ball.position.asArray()];
      }, fixture.group.id);
      assert.notDeepEqual(positions[0], positions[1]);
    } else {
      const visible = await page.evaluate(
        ({ members, activity }) =>
          members.every((id) =>
            window.__dungeon.game.scene
              .getMeshByName(`${id}:${activity === 'cards' ? 'held card' : 'pipe'}`)
              ?.isEnabled(),
          ),
        { members: fixture.group.members, activity },
      );
      assert.ok(visible, `${activity} hand props should be visible`);
    }
    await page.evaluate((center) => {
      const g = window.__dungeon.game;
      g.camera.target.set(center.x, center.h + 0.75, center.z);
      g.camera.radius = 12;
      g.camera.beta = 0.3;
      // The scoped fixture observes a real gathering; remove only the finished loading overlay.
      document.getElementById('loading')?.classList.add('hidden');
      g.scene.render();
    }, fixture.group.center);
    await page.screenshot({ path: `test-results/${browserName}-social-${activity}.png` });
    checks.push(`${activity}: stable gathering, relaxed pose and animated props`);
    const alerted = await page.evaluate((group) => {
      const d = window.__dungeon,
        g = d.game,
        leader = g.combat.actor(group.members[0])!;
      const tile = [...g.world.tiles.values()].find((tile) => {
        const distance = Math.hypot(tile.x - group.center.x, tile.z - group.center.z);
        return (
          distance > 3 &&
          distance < 5 &&
          g.player.navigator.canStand(tile) &&
          leader.navigator.segmentClear(tile, leader.position)
        );
      });
      if (!tile) throw new Error('Missing visible approach to group');
      d.teleport(tile.x, tile.z);
      for (const id of group.members) g.combat.actor(id)!.brain!.think = 0;
      d.step([], 10);
      return group.members.map((id) => {
        const actor = g.combat.actor(id)!;
        return {
          state: actor.brain!.state,
          target: actor.attack.target,
          equipment: actor.entity.require('rig').equipment!.every((mesh) => mesh.isEnabled()),
          squad: actor.entity.require('squadMember').group.require('koboldSquad').state,
          stowed: actor.entity.require('rig').stowedEquipment!.some((mesh) => mesh.isEnabled()),
        };
      });
    }, fixture.group);
    assert.ok(
      alerted.every(
        (actor) =>
          !['cards', 'hackysack', 'smoke', 'returning'].includes(actor.state) &&
          actor.target === 'player' &&
          actor.equipment &&
          !actor.stowed &&
          actor.squad === 'assembling',
      ),
      JSON.stringify(alerted),
    );
    checks.push(`${activity}: visible threat interrupts activity and draws weapons`);
    await page.evaluate((center) => {
      const g = window.__dungeon.game;
      g.camera.target.set(center.x, center.h + 0.8, center.z);
      g.camera.radius = 14;
      g.scene.render();
    }, fixture.group.center);
    await page.screenshot({ path: `test-results/${browserName}-squad-${activity}-assembling.png` });
    const engaged = await page.evaluate((group) => {
      const d = window.__dungeon,
        g = d.game;
      let minimum = Infinity;
      for (let i = 0; i < 180; i++) {
        d.step([], 1);
        const actors = [g.player.actor, ...group.members.map((id) => g.combat.actor(id)!)];
        for (let a = 0; a < actors.length; a++)
          for (let b = a + 1; b < actors.length; b++) {
            minimum = Math.min(
              minimum,
              Math.hypot(
                actors[a].position.x - actors[b].position.x,
                actors[a].position.z - actors[b].position.z,
              ),
            );
          }
      }
      const squad = g.ecs.get(group.id)!.require('koboldSquad');
      const center = squad.center;
      g.camera.target.set(center.x, group.center.h + 0.8, center.z);
      g.camera.radius = 12;
      g.scene.render();
      return {
        state: squad.state,
        minimum,
        target: squad.target?.id,
        attacked: group.members.some((id) => g.combat.actor(id)!.attack.cooldown > 0),
      };
    }, fixture.group);
    assert.equal(engaged.state, 'engaging');
    assert.equal(engaged.target, 'player');
    assert.ok(engaged.minimum >= 0.9 - 1e-6, JSON.stringify(engaged));
    assert.ok(engaged.attacked, JSON.stringify(engaged));
    await page.screenshot({ path: `test-results/${browserName}-squad-${activity}-engaged.png` });
    checks.push(
      `${activity}: group engages through ordinary melee with four nonoverlapping role rigs`,
    );
    await page.evaluate((safe) => {
      window.__dungeon.teleport(safe.x, safe.z);
      // Unlike the old alert-only fixture, the squad has actually fought for three seconds.
      // Live allies can force a long legal return around a room/doorway; require bounded arrival.
    }, fixture.escape);
    let returnFrames = 0;
    for (; returnFrames < 5400; returnFrames += 60) {
      const home = await page.evaluate(
        (members) =>
          members.every((id) => {
            const a = window.__dungeon.game.combat.actor(id)!;
            return Math.hypot(a.position.x - a.brain!.home.x, a.position.z - a.brain!.home.z) < 0.2;
          }),
        fixture.group.members,
      );
      if (home && returnFrames > 60) break;
      await page.evaluate(() => window.__dungeon.step([], 60));
    }
    await page.evaluate(() => window.__dungeon.step([], 30));
    const returned = await page.evaluate(
      (members) =>
        members.map((id) => {
          const a = window.__dungeon.game.combat.actor(id)!;
          return {
            state: a.brain!.state,
            position: a.position,
            home: a.brain!.home,
            path: a.navigator.path,
            destination: a.navigator.destination,
          };
        }),
      fixture.group.members,
    );
    assert.ok(
      returned.every((a) => a.state === activity),
      JSON.stringify(returned),
    );
    assert.ok(
      returnFrames <= 1200,
      `temporary allied occupancy must not preserve a dungeon-sized return detour (${returnFrames / 60}s)`,
    );
    checks.push(`${activity}: survivors return to their activity after the threat is lost`);
    console.log(`${activity}: physical return in ${returnFrames / 60} seconds`);
    const death = await page.evaluate((members) => {
      const d = window.__dungeon,
        g = d.game;
      for (const id of members) g.combat.damage(g.combat.actor(id)!, 1000);
      d.step([], 45);
      return members.map((id) => {
        const a = g.combat.actor(id)!,
          rig = a.entity.require('rig');
        return {
          corpse: a.entity.has('corpse'),
          drawn: rig.equipment!.every((m) => m.isEnabled()),
          stowed: rig.stowedEquipment!.some((m) => m.isEnabled()),
          state: a.entity.require('squadMember').group.require('koboldSquad').state,
        };
      });
    }, fixture.group.members);
    assert.ok(death.every((a) => a.corpse && a.drawn && !a.stowed && a.state === 'defeated'));
    checks.push(`${activity}: death retains drawn role equipment and defeats the original squad`);
  }
  assert.deepEqual(errors, []);
  for (const check of checks) console.log(`PASS ${check}`);
  await writeFile(
    `test-results/${browserName}-social-report.json`,
    JSON.stringify({ checks, errors }, null, 2),
  );
} finally {
  await browser.close();
}
