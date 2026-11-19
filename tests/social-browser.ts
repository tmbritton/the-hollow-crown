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
  for (const activity of ['cards', 'hackysack', 'smoke'] satisfies SocialActivity[]) {
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
      for (const actor of g.combat.enemies) {
        if (group.members.includes(actor.id)) continue;
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
          soles: rig.feet.map((foot) => {
            foot.computeWorldMatrix(true);
            return foot.getAbsolutePosition().y - 0.05 * rig.root.scaling.y - actor.position.h;
          }),
        };
      });
    }, fixture.group.members);
    assert.ok(
      resting.every((actor) => actor.state === activity && !actor.equipment),
      JSON.stringify(resting),
    );
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
      d.step([], 1);
      return group.members.map((id) => {
        const actor = g.combat.actor(id)!;
        return {
          state: actor.brain!.state,
          target: actor.attack.target,
          equipment: actor.entity.require('rig').equipment!.every((mesh) => mesh.isEnabled()),
        };
      });
    }, fixture.group);
    assert.ok(
      alerted.every(
        (actor) =>
          !['cards', 'hackysack', 'smoke', 'returning'].includes(actor.state) &&
          actor.target === 'player' &&
          actor.equipment,
      ),
      JSON.stringify(alerted),
    );
    checks.push(`${activity}: visible threat interrupts activity and draws weapons`);
    await page.evaluate((safe) => {
      window.__dungeon.teleport(safe.x, safe.z);
      window.__dungeon.step([], 900);
    }, fixture.escape);
    const returned = await page.evaluate(
      (members) => members.map((id) => window.__dungeon.game.combat.actor(id)!.brain!.state),
      fixture.group.members,
    );
    assert.ok(
      returned.every((state) => state === activity),
      JSON.stringify(returned),
    );
    checks.push(`${activity}: survivors return to their activity after the threat is lost`);
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
