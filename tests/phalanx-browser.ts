import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { DebugWindow } from './browserTypes.ts';

declare const window: DebugWindow;
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultNavigationTimeout(90000);
const checks: string[] = [],
  errors: string[] = [],
  captures: unknown[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const pass = (name: string) => {
  checks.push(name);
  console.log(`PASS ${name}`);
};
const state = () =>
  page.evaluate(() => {
    const g = window.__dungeon.game,
      s = g.ecs.get('pack:stable')!.require('koboldSquad');
    return {
      state: s.state,
      elapsed: s.chart.snapshot.context.elapsed,
      heading: s.heading,
      health: g.player.health,
      projectiles: g.ecs
        .query('projectile')
        .map((e) => ({ ...e.require('transform'), ...e.require('projectile') })),
      actors: s.members.map((m) => {
        const a = g.combat.actor(m.entity.id)!,
          r = a.entity.require('rig');
        return {
          p: { ...a.position },
          guard: a.defending,
          alive: a.alive,
          swing: a.attack.swing,
          armYaw: r.arms[0].rotation.y,
          spear: r.spear?.position.asArray(),
          spearPitch: r.spear?.rotation.x,
          javelin: r.javelin?.isEnabled(),
          rootHeading: r.root.rotation.y,
        };
      }),
    };
  });
async function step(frames = 1) {
  await page.evaluate((n) => window.__dungeon.step([], n), frames);
}
async function until(phase: string) {
  const result = await page.evaluate((phase) => {
    const d = window.__dungeon,
      s = d.game.ecs.get('pack:stable')!.require('koboldSquad');
    for (let n = 0; n < 900 && s.state !== phase; n++) d.step([], 1);
    return s.state;
  }, phase);
  assert.equal(result, phase);
}
async function fixture(range: number, circle = false) {
  return page.evaluate(
    async ({ range, circle }) => {
      const d = window.__dungeon,
        g = d.game;
      const actorsPath = '/src/actors.ts',
        squadPath = '/src/koboldSquads.ts';
      const { stopActor }: typeof import('../src/actors.ts') = await import(actorsPath);
      const { KoboldSquad }: typeof import('../src/koboldSquads.ts') = await import(squadPath);
      const group = g.ecs.get('pack:stable')!,
        pack = group.require('koboldSquad').members.map((m) => g.combat.actor(m.entity.id)!);
      g.ecs.get('run')!.remove('tribute');
      for (const a of g.combat.enemies) {
        stopActor(a);
        a.health.current = 0;
        a.entity.require('rig').root.setEnabled(false);
        a.entity.remove('corpse');
      }
      for (const e of g.ecs.query('koboldSquad')) if (e !== group) e.remove('koboldSquad');
      for (const e of [...g.ecs.query('projectile'), ...g.ecs.query('particle')])
        g.ecs.remove(e.id);
      stopActor(g.player.actor);
      Object.assign(g.player.actor.position, { x: 1000, z: 1000 });
      // Find an actual unobstructed rectangle in the seeded world; no geometry/collision edits.
      const base = [...g.world.tiles.values()].find((t) => {
        for (let x = circle ? -3 : -2; x <= (circle ? 3 : 2); x += 0.5)
          for (let z = circle ? -5 : -3; z <= 8; z += 0.5) {
            const p = { x: t.x + x, z: t.z + z };
            if (
              !g.player.navigator.canStand(p) ||
              g.world.tiles.get(`${Math.round(p.x)},${Math.round(p.z)}`)?.h !== t.h
            )
              return false;
          }
        return true;
      });
      if (!base) throw new Error('No clear phalanx rectangle in fixture seed');
      (circle
        ? [
            [1.5, 0],
            [0, -1.5],
            [-1.5, 0],
            [0, 1.5],
          ]
        : [
            [-1.15, 0.3],
            [0, 0.3],
            [1.15, 0.3],
            [0.175, -0.9],
          ]
      ).forEach(([x, z], i) => {
        const a = pack[i];
        a.health.current = a.health.max;
        a.attack.reset();
        a.entity.require('rig').root.setEnabled(true);
        Object.assign(a.position, { x: base.x + x, z: base.z + z, h: base.h, heading: 0 });
        Object.assign(a.brain!.home, a.position);
        a.brain!.think = 0;
        a.entity.get('collision')?.sync?.(a.position);
      });
      group.add('koboldSquad', new KoboldSquad(g.ecs, group, pack));
      d.teleport(base.x + 0.575, base.z + range);
      g.player.health = 100;
      g.player.actor.health.invulnerable = 0;
      g.player.heading = Math.PI;
      g.camera.radius = g.desiredRadius = 11;
      g.camera.beta = 0.9;
      d.step([], 1);
      return { x: base.x, z: base.z, h: base.h };
    },
    { range, circle },
  );
}
async function recoverRank(name: string) {
  const result = await page.evaluate(() => {
    const d = window.__dungeon,
      g = d.game,
      s = g.ecs.get('pack:stable')!.require('koboldSquad');
    const pack = s.members.map((m) => g.combat.actor(m.entity.id)!);
    let frames = 0,
      minimum = Infinity,
      maximumStep = 0,
      plans = 0;
    const methods = pack.map((a) => a.navigator.goTo);
    pack.forEach((a, i) => {
      a.navigator.goTo = (...args) => {
        plans++;
        return methods[i].apply(a.navigator, args);
      };
    });
    try {
      for (; frames < 1200 && g.player.health === 100; frames++) {
        const before = pack.map((a) => ({ ...a.position }));
        d.step([], 1);
        pack.forEach((a, i) => {
          maximumStep = Math.max(
            maximumStep,
            Math.hypot(a.position.x - before[i].x, a.position.z - before[i].z),
          );
          for (const b of pack)
            if (a !== b)
              minimum = Math.min(
                minimum,
                Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z),
              );
        });
      }
    } finally {
      pack.forEach((a, i) => {
        a.navigator.goTo = methods[i];
      });
    }
    return {
      seconds: frames / 60,
      health: g.player.health,
      impacts: pack[3].attack.chart.snapshot.context.impacts,
      minimum,
      maximumStep,
      plans,
      heading: s.heading,
      phase: s.state,
    };
  });
  captures.push({ name, ...result });
  assert.ok(result.health < 100 && result.impacts > 0, JSON.stringify(result));
  assert.ok(result.minimum >= 0.9 - 1e-5 && result.maximumStep < 0.025, JSON.stringify(result));
  assert.ok(result.plans <= 48, JSON.stringify(result));
  await capture(name, Math.PI / 2 - result.heading);
  console.log(`${name}: ${JSON.stringify(result)}`);
}
async function capture(name: string, alpha: number) {
  const geometry = await page.evaluate(
    async ({ name, alpha }) => {
      const d = window.__dungeon,
        g = d.game,
        s = g.ecs.get('pack:stable')!.require('koboldSquad');
      const path = '/src/actorRendering.ts';
      const { animateActors }: typeof import('../src/actorRendering.ts') = await import(path);
      // Presentation-only settling at a frozen authoritative combat clock.
      animateActors(g.ecs, 1 / 60, g.time, g.world);
      g.camera.alpha = g.desiredAlpha = alpha;
      g.camera.beta = 1.02;
      g.camera.radius = g.desiredRadius = 10;
      const center = s.center;
      g.camera.target.set(center.x, g.player.actor.position.h + 1, center.z + 0.6);
      g.scene.render();
      const geometry = s.members.map((m) => {
        const a = g.combat.actor(m.entity.id)!,
          r = a.entity.require('rig');
        for (const mesh of a.entity.require('render').meshes) mesh.computeWorldMatrix(true);
        return {
          slot: m.slot,
          guard: a.defending,
          heading: a.position.heading,
          rootHeading: r.root.rotation.y,
          spearTip: a.entity
            .require('render')
            .meshes.find((mesh) => mesh.name.endsWith(':long spear tip'))
            ?.getAbsolutePosition()
            .asArray(),
          shield: a.entity
            .require('render')
            .meshes.find((mesh) => mesh.name.endsWith(':squad shield'))
            ?.getAbsolutePosition()
            .asArray(),
          position: { ...a.position },
          swing: a.attack.swing,
          armYaw: r.arms[0].rotation.y,
        };
      });
      return { name, phase: s.state, geometry };
    },
    { name, alpha },
  );
  const style = await page.addStyleTag({
    content: 'body > :not(#game) { visibility:hidden !important; }',
  });
  try {
    await page.screenshot({ path: `test-results/chromium-phalanx-${name}.png` });
  } finally {
    await style.evaluate((n) => n.parentNode?.removeChild(n));
  }
  captures.push(geometry);
  for (const a of geometry.geometry) assert.ok(Math.abs(a.heading - a.rootHeading) < 1e-6);
  const gate = geometry.geometry[1];
  if (name === 'front')
    assert.ok(
      gate.shield && gate.shield[0] - gate.position.x > 0.25,
      'closed centre shield covers the right-hand spear lane',
    );
  if (name === 'opening')
    assert.ok(
      gate.shield && gate.shield[0] - gate.position.x < -0.4,
      'open shield clears the spear lane and chest',
    );
}
await mkdir('test-results', { recursive: true });
try {
  await page.goto(`${process.env.DEMO_URL || 'http://localhost:5173'}/?debug&seed=MOURNING-731`);
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  await page.evaluate(() => window.__dungeon.engine.stopRenderLoop());
  await page.evaluate(async () => {
    const d = window.__dungeon,
      g = d.game,
      group = g.ecs.get('pack:stable')!;
    const path = '/src/actors.ts',
      squadPath = '/src/koboldSquads.ts';
    const { teleportActor }: typeof import('../src/actors.ts') = await import(path);
    const { KoboldSquad }: typeof import('../src/koboldSquads.ts') = await import(squadPath);
    const pack = group.require('koboldSquad').members.map((m) => g.combat.actor(m.entity.id)!);
    g.ecs.get('run')!.remove('tribute');
    for (const a of g.combat.enemies) {
      if (pack.some((p) => p.entity === a.entity)) {
        teleportActor(a, g.world, a.brain!.home);
        a.brain!.think = 0;
      } else {
        a.health.current = 0;
        a.entity.require('rig').root.setEnabled(false);
      }
    }
    group.add('koboldSquad', new KoboldSquad(g.ecs, group, pack));
    d.teleport(-2, -61);
    g.player.health = 100;
    g.player.actor.health.invulnerable = 0;
  });
  await recoverRank('recovery-seeded');
  await fixture(7, true);
  await recoverRank('recovery-circle');
  pass(
    'original adverse seeded and circular gatherings recover real collision-safe ranks and deliver impacts within twenty seconds',
  );
  await fixture(7);
  await until('engaging');
  const before = await state();
  await step(35);
  const advancing = await state();
  assert.ok(advancing.actors.every((a, i) => a.p.z > before.actors[i].p.z));
  assert.ok(advancing.actors.slice(0, 3).every((a) => a.guard));
  assert.ok(advancing.actors.slice(0, 3).every((a) => a.p.z > advancing.actors[3].p.z + 1));
  await capture('front', Math.PI / 2);
  await capture('side', 0);
  pass(
    'actual Babylon movement advances three raised shields with rear spear and authoritative facing',
  );
  await until('opening');
  await step(20);
  const open = await state();
  assert.equal(open.actors[1].guard, false);
  assert.ok(open.actors[1].armYaw < 0.05);
  await capture('opening', Math.PI / 2);
  await until('attacking');
  assert.equal((await state()).actors[3].swing?.kind, 'THROW_JAVELIN');
  await step(18);
  await capture('throw-windup', 0);
  await step(7);
  const flight = await state();
  assert.equal(flight.projectiles.length, 1);
  assert.equal(flight.health, 100);
  assert.equal(flight.actors[3].javelin, false);
  await step(12);
  await capture('javelin-flight', 0);
  await step(50);
  assert.equal((await state()).health, 90);
  pass('opening visibly moves shield aside; short javelin leaves hand, travels and damages once');
  await fixture(2.5);
  await until('opening');
  await step(20);
  const accepted = await page.evaluate(() => {
    const g = window.__dungeon.game,
      s = g.ecs.get('pack:stable')!.require('koboldSquad');
    return g.combat.damage(g.combat.actor(s.members[1].entity.id)!, 3, g.player.actor, {
      kind: 'melee',
      travel: { x: 0, z: -1 },
    });
  });
  assert.ok(accepted);
  await capture('thrust-opening', Math.PI / 2);
  await until('attacking');
  assert.equal((await state()).actors[3].swing?.kind, 'LONG_THRUST');
  await step(13);
  await capture('thrust-load', 0);
  await step(9);
  assert.equal((await state()).health, 88);
  await capture('thrust-impact', 0);
  await capture('thrust-front', Math.PI / 2);
  await until('recovering');
  assert.ok((await state()).actors[1].guard);
  pass(
    'frontal opening takes actual damage; long shaft extends through lane at the shared impact clock',
  );
  await page.evaluate(() => {
    const g = window.__dungeon.game,
      s = g.ecs.get('pack:stable')!.require('koboldSquad');
    g.combat.damage(g.combat.actor(s.members[0].entity.id)!, 1000);
    g.combat.damage(g.combat.actor(s.members[2].entity.id)!, 1000);
  });
  const retreatBefore = await state();
  await step(45);
  const retreat = await state();
  assert.equal(retreat.state, 'retreating');
  assert.ok(retreat.actors[1].p.z < retreatBefore.actors[1].p.z - 0.2);
  assert.ok(retreat.actors[1].guard && Math.cos(retreat.actors[1].p.heading) > 0.9);
  await capture('retreat-front', Math.PI / 2);
  await capture('retreat-side', 0);
  pass(
    'casualties trigger backward unit withdrawal with surviving shield visibly facing the threat',
  );
  // Real modal input pauses phase/flight clocks and cancels hero defense through the normal path.
  await page.keyboard.down('f');
  await page.keyboard.press('Escape');
  const paused = await state();
  await step(120);
  assert.deepEqual(await state(), paused);
  await page.keyboard.press('Escape');
  await page.keyboard.up('f');
  pass('menu input freezes group and projectile clocks');
  const edgeBase = await fixture(7);
  const edge = await page.evaluate(async (base) => {
    const d = window.__dungeon,
      g = d.game,
      s = g.ecs.get('pack:stable')!.require('koboldSquad');
    const ally = g.combat.actor(s.members[0].entity.id)!,
      owner = g.combat.actor(s.members[3].entity.id)!;
    const path = '/src/actors.ts';
    const { stopActor }: typeof import('../src/actors.ts') = await import(path);
    for (const e of g.ecs.query('koboldSquad')) e.remove('koboldSquad');
    const actors = g.combat.actors;
    for (const a of actors) {
      stopActor(a);
      a.entity.remove('brain');
      if (![ally.id, owner.id, 'player'].includes(a.id)) a.health.current = 0;
    }
    const results = [];
    for (const first of ['player', 'ally']) {
      // Reattach the indexed attack components in both orders, retaining the real actors/rigs.
      const ordered = actors
        .filter((a) => a.id !== ally.id && a.id !== 'player')
        .concat(first === 'player' ? [g.player.actor, ally] : [ally, g.player.actor]);
      const components = ordered.map((a) => a.attack);
      ordered.forEach((a) => a.entity.remove('attack'));
      ordered.forEach((a, i) => a.entity.add('attack', components[i]));
      Object.assign(ally.position, { x: base.x - 0.455, z: base.z + 1, h: base.h });
      Object.assign(owner.position, { x: base.x, z: base.z - 2, h: base.h });
      ally.entity.get('collision')?.sync?.(ally.position);
      owner.entity.get('collision')?.sync?.(owner.position);
      d.teleport(base.x + 0.455, base.z + 1.02);
      g.player.health = 100;
      g.player.actor.health.invulnerable = 0;
      const shot = g.ecs
        .create()
        .add('transform', { x: base.x, z: base.z + 0.8, h: base.h + 0.85, heading: 0 })
        .add('projectile', {
          owner: owner.id,
          kind: 'THROW_JAVELIN',
          vx: 0,
          vy: 0,
          vz: 10,
          life: 1,
          damage: 10,
        });
      const order = g.combat.actors
        .filter((a) => a.id === 'player' || a.id === ally.id)
        .map((a) => (a.id === 'player' ? 'player' : 'ally'));
      d.step([], 1);
      results.push({
        first,
        order,
        health: g.player.health,
        allyHealth: ally.health.current,
        allyMax: ally.health.max,
        removed: !g.ecs.get(shot.id),
        contact: shot.require('transform').z - base.z,
      });
    }
    return results;
  }, edgeBase);
  for (const sample of edge) {
    assert.equal(sample.order[0], sample.first);
    assert.equal(sample.health, 100);
    assert.equal(sample.allyHealth, sample.allyMax);
    assert.ok(sample.removed && Math.abs(sample.contact - 0.8471111514857935) < 1e-8);
  }
  captures.push({ name: 'swept-flight-edge', samples: edge });
  pass(
    'real in-flight javelin meets the friendly edge first in both ECS orders without friendly damage',
  );
  const pool = await page.evaluate(() => {
    const g = window.__dungeon.game;
    return {
      meshes: g.scene.meshes.length,
      pool: g.scene.getMeshByName('thrown javelins')?.getTotalVertices(),
    };
  });
  assert.ok(pool.pool);
  await page.evaluate(() => window.__dungeon.regenerate('MOURNING-731'));
  await page.waitForFunction(() => window.__dungeon?.ready, {}, { timeout: 90000 });
  await page.evaluate(() => window.__dungeon.engine.stopRenderLoop());
  const fresh = await page.evaluate(() => {
    const g = window.__dungeon.game;
    return {
      enemies: g.combat.enemies.length,
      squads: g.ecs.query('koboldSquad').map((e) => ({
        count: e.require('koboldSquad').members.length,
        state: e.require('koboldSquad').state,
      })),
      shots: g.ecs.query('projectile').length,
      pools: g.scene.meshes.filter((m) => m.name === 'thrown javelins').length,
    };
  });
  assert.equal(fresh.enemies, 24);
  assert.equal(fresh.shots, 0);
  assert.equal(fresh.pools, 1);
  assert.ok(fresh.squads.every((s) => s.count === 4 && s.state === 'idle'));
  pass(
    'regeneration replaces group/action state and the bounded reusable javelin pool; population stays 24',
  );
  assert.deepEqual(errors, []);
} finally {
  await writeFile(
    'test-results/chromium-phalanx-report.json',
    JSON.stringify({ checks, errors, captures }, null, 2),
  );
  await browser.close();
}
