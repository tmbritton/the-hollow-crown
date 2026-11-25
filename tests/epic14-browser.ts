import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import type { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { DebugWindow } from './browserTypes.ts';
import { mkdir } from 'node:fs/promises';

declare const window: DebugWindow;
const browser = await chromium.launch({
  channel: 'chromium', // Full headless Chrome supports real tab focus; headless shell does not.
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const step = (n = 1) => page.evaluate((n) => window.__dungeon.step([], n), n);
  const freeze = () => page.evaluate(() => window.__dungeon.engine.stopRenderLoop());
  const at = () => page.evaluate(() => window.__dungeon.snapshot().position);
  const project = (x: number, z: number, y: number, leaf = false) =>
    page.evaluate(
      ({ x, z, y, leaf }) => {
        const d = window.__dungeon,
          g = d.game;
        g.scene.render();
        let p = new (g.camera.target.constructor as typeof Vector3)(x, y, z);
        const V = p.constructor as typeof Vector3;
        const M = g.camera.getWorldMatrix().constructor as typeof Matrix;
        if (leaf) {
          const mesh = g.world.entities.find((e) => e.type === 'door')?.pivot;
          p = V.TransformCoordinates(p, mesh!.computeWorldMatrix(true));
        }
        const screen = V.Project(
          p,
          M.Identity(),
          g.scene.getTransformMatrix(),
          g.camera.viewport.toGlobal(d.engine.getRenderWidth(), d.engine.getRenderHeight()),
        );
        const rect = document.querySelector('#game')!.getBoundingClientRect();
        return {
          x: rect.left + (screen.x * rect.width) / d.engine.getRenderWidth(),
          y: rect.top + (screen.y * rect.height) / d.engine.getRenderHeight(),
        };
      },
      { x, z, y, leaf },
    );
  const floor = async (x: number, z: number, y = 0) => {
    const p = await project(x, z, y);
    await page.mouse.click(p.x, p.y);
  };
  const base = process.env.DEMO_URL ?? 'http://localhost:5173';
  let visit = 0;
  async function load(query: string) {
    await page.goto(`${base}/?debug&${query}&visit=${++visit}`);
    await page.locator('#loading.done').waitFor({ state: 'attached' });
    await freeze();
  }
  const part = process.env.EPIC14_PART;
  if (!part || part === 'reach') {
    await load('room=practice');
    await page.locator('#start-practice-foe').click();
    await page.locator('#loading.done').waitFor({ state: 'attached' });
    await freeze();
    const setup = (late: boolean) =>
      page.evaluate((late) => {
        const d = window.__dungeon;
        const g = d.game;
        d.teleport(0, -4);
        const foe = g.combat.enemies[0];
        foe.entity.remove('brain');
        foe.attack.reset();
        const h = 0;
        foe.entity.setPosition({ x: 7, z: -4, h });
        g.world.blockers = g.world.blockers.filter((b) => !b.id.startsWith('preview-fixture:'));
        if (late) {
          g.world.blockers.push({ id: 'preview-fixture:detour', x: 0, z: -2, w: 8, d: 0.5 });
          // The nearest candidate can be stood on, but is inside a sealed pocket.
          // Keep these as navigation fixtures so they do not occlude the authored leaf.
          for (const side of [-1, 1]) {
            g.world.blockers.push({
              id: `preview-fixture:pocket-x:${side}`,
              x: side * 0.46,
              z: -0.35,
              w: 0.1,
              d: 1.02,
            });
            g.world.blockers.push({
              id: `preview-fixture:pocket-z:${side}`,
              x: 0,
              z: -0.35 + side * 0.46,
              w: 1.02,
              d: 0.1,
            });
          }
          if (!g.player.navigator.canOccupy({ x: 0, z: -0.35 }))
            throw new Error('The nearest candidate must remain legal to stand on');
        } else {
          for (const side of [-1, 1])
            g.world.blockers.push({
              id: `preview-fixture:${side}`,
              x: side * 4.6,
              z: -2,
              w: 8,
              d: 0.5,
            });
        }
        g.camera.alpha = g.desiredAlpha = -0.95;
        g.camera.beta = 0.88;
        g.camera.radius = g.desiredRadius = 18;
        d.step([], 1);
      }, late);
    const outlined = () =>
      page.evaluate(() => window.__dungeon.game.scene.meshes.some((m) => m.renderOutline));
    const moveFoe = (x: number, z: number) =>
      page.evaluate(
        ({ x, z }) => window.__dungeon.game.combat.enemies[0].entity.setPosition({ x, z, h: 0 }),
        { x, z },
      );
    const preview = (frames: number) =>
      page.evaluate((frames) => {
        for (let i = 0; i < frames; i++) window.__dungeon.step([], 0);
      }, frames);
    await setup(false);
    const gapDoor = await project(1.5, 0, 1.4, true);
    await page.mouse.move(gapDoor.x, gapDoor.y);
    await preview(1);
    assert.equal(await outlined(), true);
    await moveFoe(0, -2);
    await preview(80);
    assert.equal(
      await outlined(),
      false,
      'a live body plugging the only lane hides the stationary cue',
    );
    await moveFoe(7, -4);
    await preview(1);
    assert.equal(
      await outlined(),
      true,
      'a live body leaving the lane restores the cue without pointer movement',
    );
    assert.deepEqual(await at(), [0, 0, -4]);
    console.log(
      'PASS 14.4 stationary cursor clears and restores the outline on live-body lane changes',
    );

    await setup(true);
    const detourDoor = await project(1.5, 0, 1.4, true);
    await page.mouse.move(detourDoor.x, detourDoor.y);
    await preview(100);
    assert.equal(await outlined(), true, 'a later detour candidate earns the outline');
    await page.mouse.click(detourDoor.x, detourDoor.y);
    const first = await page.evaluate(() => {
      const d = window.__dungeon;
      const n = d.game.player.navigator;
      const sequence = n.requestSequence;
      for (let i = 0; i < 100 && n.pending && n.requestSequence === sequence; i++) d.step([], 1);
      return { result: n.planningResult, sequence, current: n.requestSequence, end: n.destination };
    });
    assert.ok(
      first.result === 'ready' && first.end && first.sequence === first.current,
      JSON.stringify(first),
    );
    assert.ok(Math.hypot(first.end.x, first.end.z + 0.35) > 0.1);
    await step(300);
    assert.equal(
      await page.evaluate(
        () => window.__dungeon.game.world.entities.find((e) => e.type === 'door')!.open,
      ),
      true,
    );
    console.log(
      'PASS 14.4 real click uses the proven later detour first and opens the selected door',
    );
  }
  if (!part || part === 'controls') {
    const retired = [
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'KeyQ',
      'KeyX',
      'ShiftLeft',
    ];
    const alpha = () => page.evaluate(() => window.__dungeon.game.desiredAlpha);
    for (const query of ['seed=MOURNING-731', 'room=practice']) {
      await load(query);
      const start = await at();
      const angle = await alpha();
      for (const code of retired) {
        await page.keyboard.down(code);
        await step(2);
        await page.keyboard.up(code);
      }
      assert.deepEqual(await at(), start);
      assert.equal(await alpha(), angle);
      await page.keyboard.press('BracketRight');
      assert.equal(await alpha(), angle + Math.PI / 2);
      await page.keyboard.press('BracketLeft');
      assert.equal(await alpha(), angle);
    }
    await page.keyboard.press('BracketRight');
    for (let i = 0; i < 45; i++) await step(0);
    await floor(5, -4);
    for (const code of retired) await page.keyboard.down(code);
    await step(35);
    const walking = (await at())[0];
    assert.ok(walking > 0.5 && walking < 4, JSON.stringify(await at()));
    for (const code of retired) await page.keyboard.up(code);
    await step(95);
    assert.ok(Math.abs((await at())[0] - 5) < 0.08, JSON.stringify(await at()));
    async function speed(input: () => Promise<void> = async () => {}) {
      await page.evaluate(() => window.__dungeon.teleport(0, -4));
      await input();
      await floor(7, -4);
      await step(28);
      return (await at())[0];
    }
    const walk = await speed();
    const down = (repeat = false) =>
      page.evaluate((repeat) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', repeat }));
      }, repeat);
    const run = await speed(async () => {
      await page.keyboard.down('KeyR');
      await down(); // Deliberate non-repeat duplicate, distinct from Playwright's repeat.
      await page.keyboard.down('KeyR');
      await page.keyboard.up('KeyR');
    });
    assert.ok(run > walk + 0.7, JSON.stringify({ walk, run }));
    console.log('PASS 14.3 retired inputs, brackets, rotated click and latched run');

    const other = await context.newPage();
    const session = await context.newCDPSession(page);
    // Playwright keeps pages focused by default, even when another tab is active.
    await session.send('Emulation.setFocusEmulationEnabled', { enabled: false });
    const otherSession = await context.newCDPSession(other);
    await otherSession.send('Emulation.setFocusEmulationEnabled', { enabled: false });
    await page.bringToFront();
    async function loseR() {
      // Use raw input so Playwright doesn't track R as held on the game page
      // when keyup is intentionally delivered to the other tab.
      await session.send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        code: 'KeyR',
        key: 'r',
        windowsVirtualKeyCode: 82,
      });
      await other.bringToFront();
      await page.waitForFunction(() => !document.hasFocus());
      await other.keyboard.up('KeyR');
      await page.bringToFront();
      await page.waitForFunction(() => document.hasFocus());
    }
    const assertSpeed = async (label: string, expected: number, input: () => Promise<void>) => {
      const actual = await speed(input);
      assert.ok(
        Math.abs(actual - expected) < 0.05,
        `${label}: got ${actual}, expected ${expected}`,
      );
    };
    await assertSpeed('blur without a game keyup restores walk', walk, loseR);
    await assertSpeed('repeat after blur stays at walk', walk, async () => {
      await loseR();
      await down(true);
    });
    await assertSpeed('fresh R after blur starts running', run, async () => {
      await loseR();
      await down(true);
      await page.keyboard.press('KeyR');
    });
    const cancelWhileHeld = async () => {
      await page.keyboard.down('KeyR');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => document.hasFocus()), true);
      await down();
      await page.keyboard.down('KeyR');
    };
    await assertSpeed(
      'focused cancel preserves latch against duplicate and repeat',
      walk,
      async () => {
        await cancelWhileHeld();
        await page.keyboard.up('KeyR');
      },
    );
    await assertSpeed('keyup re-arms R after a focused cancel', run, async () => {
      await cancelWhileHeld();
      await page.keyboard.up('KeyR');
      await page.keyboard.press('KeyR');
    });
    await other.close();
    console.log('PASS 14.3 R recovers from lost keyup without weakening focused cancellation');

    await load('room=practice');
    const doorState = () =>
      page.evaluate(() => {
        const e = window.__dungeon.game.world.entities.find((e) => e.type === 'door')!;
        return {
          open: e.open,
          angle: e.angle,
          solid: e.collider?.checkCollisions,
          outlined: e.pivot?.getChildMeshes().some((mesh) => mesh.renderOutline),
        };
      });
    async function leafClick() {
      const p = await project(1.5, 0, 1.4, true);
      await page.mouse.move(p.x, p.y);
      await step(0);
      assert.equal((await doorState()).outlined, true, JSON.stringify(p));
      await page.mouse.click(p.x, p.y);
    }
    await page.keyboard.down('KeyF');
    await step(4);
    await leafClick();
    assert.equal(
      await page.evaluate(
        () => window.__dungeon.game.player.actor.entity.require('defense').raised,
      ),
      true,
    );
    await page.keyboard.up('KeyF');
    await step(140);
    assert.equal((await doorState()).open, true);
    console.log('PASS 14.4 outlined practice leaf opens by click-to-approach');
    await page.evaluate(() => window.__dungeon.teleport(0, 1.75));
    const overlap = await at();
    await leafClick();
    await step(90);
    assert.deepEqual(await at(), overlap);
    assert.equal((await doorState()).open, false);
    assert.ok((await doorState()).solid);
    assert.ok(Math.abs((await doorState()).angle ?? 1) < 0.01);
    await floor(0, -2);
    const retreatPlan = await page.evaluate(() => {
      const { player } = window.__dungeon.game;
      return {
        route: player.navigator.path,
        result: player.navigator.planningResult,
        clear: player.navigator.segmentClear(player.actor.position, { x: 0, z: -2 }),
      };
    });
    await step(120);
    assert.ok(
      (await at())[2] < -1.9,
      JSON.stringify({ at: await at(), door: await doorState(), retreatPlan }),
    );
    await page.evaluate(() => window.__dungeon.teleport(0, 1.75));
    await page.keyboard.press('KeyE');
    await step(60);
    assert.ok((await doorState()).open);
    await page.keyboard.press('KeyE');
    await step(60);
    assert.ok(!(await doorState()).open);
    console.log('PASS 14.5 click/E close from overlap without displacement, same-side retreat');

    await page.evaluate(() => {
      const d = window.__dungeon;
      d.teleport(0, -4);
      // Every straight line to a use face hits this navigation barrier; both ends have room to pass.
      d.game.world.blockers.push({ id: 'fixture-detour', x: 0, z: -2, w: 8, d: 0.5 });
    });
    const detour = await project(1.5, 0, 1.4, true);
    await page.mouse.move(detour.x, detour.y);
    await page.evaluate(() => {
      for (let i = 0; i < 60; i++) window.__dungeon.step([], 0);
    });
    assert.equal((await doorState()).outlined, true, 'a reachable detour is eligible for hover');
    await page.mouse.click(detour.x, detour.y);
    assert.equal(await page.evaluate(() => window.__dungeon.game.player.navigator.pending), true);
    await page.evaluate(() => {
      window.__dungeon.game.world.entities.find((e) => e.type === 'door')!.open = true;
    });
    await step(1);
    assert.ok(
      await page.evaluate(() => {
        const nav = window.__dungeon.game.player.navigator;
        return !nav.active && !nav.pending;
      }),
      'a concurrent open retires the older command instead of toggling it',
    );
    assert.ok((await doorState()).open);
    console.log('PASS 14.4 detour hover and stale arrival retirement');

    await page.locator('#start-practice-foe').click();
    await page.locator('#loading.done').waitFor({ state: 'attached' });
    // Reset/start keeps the same engine; keep game clocks fixed through real pointer dispatch.
    await freeze();
    const foe = await page.evaluate(() => ({
      ...window.__dungeon.game.combat.enemies[0].position,
    }));
    const foePoint = await project(foe.x, foe.z, foe.h + 0.9);
    await page.mouse.move(foePoint.x, foePoint.y);
    await step(0);
    const target = () => page.evaluate(() => window.__dungeon.game.player.actor.attack.target);
    const ring = () =>
      page.evaluate(() =>
        window.__dungeon.game.scene.getMeshByName('enemy hover ring')!.isEnabled(),
      );
    assert.equal(await page.locator('#game-cursor').getAttribute('data-mode'), 'sword');
    assert.equal(await ring(), true);
    assert.equal(await target(), null);
    await page.evaluate(
      async ({ x, z, y }) => {
        const path = '/src/geometry.ts';
        const { thinBoxes }: typeof import('../src/geometry.ts') = await import(path);
        const g = window.__dungeon.game;
        const c = g.camera.position;
        thinBoxes(
          g.scene,
          g.scene.getMaterialByName('stone') ?? g.scene.defaultMaterial,
          [
            {
              position: [(x + c.x) / 2, (y + c.y) / 2, (z + c.z) / 2],
              size: [1.6, 1.6, 0.09],
            },
          ],
          'epic14 thin cover',
        );
      },
      { x: foe.x, z: foe.z, y: foe.h + 0.9 },
    );
    await step(0);
    assert.equal(await ring(), false, 'a drawn thin instance covers the actor');
    await page.mouse.click(foePoint.x, foePoint.y);
    assert.equal(await target(), null);
    const handPixels = () =>
      page.locator('#game-cursor').evaluate((c) => (c as HTMLCanvasElement).toDataURL());
    const frames = new Set([await handPixels()]);
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(105);
      await step(0);
      frames.add(await handPixels());
    }
    assert.ok(frames.size > 1, 'the stationary hand cycles through drawn frames');
    await page.evaluate(() => {
      const d = window.__dungeon;
      d.game.scene.getMeshByName('epic14 thin cover')!.dispose();
      d.game.player.navigator.cancel();
    });
    await step(0);
    assert.equal(await ring(), true, 'removing cover refreshes the stationary pointer');
    await page.keyboard.press('BracketRight');
    await page.evaluate(() => {
      for (let i = 0; i < 60; i++) window.__dungeon.step([], 0);
    });
    assert.equal(await ring(), false, 'camera rotation updates a stationary mouse');
    await page.keyboard.press('BracketLeft');
    await page.evaluate(() => {
      for (let i = 0; i < 120; i++) window.__dungeon.step([], 0);
    });
    assert.equal(await ring(), true);
    await page.keyboard.press('Escape');
    assert.equal(await ring(), false);
    assert.ok(await page.locator('#game-cursor').isHidden());
    await page.keyboard.press('Escape');
    await page.mouse.move(2, 2);
    await page.mouse.move(foePoint.x, foePoint.y);
    await step(0);
    assert.equal(await ring(), true);
    await page.mouse.click(foePoint.x, foePoint.y);
    assert.equal(await target(), 'skeleton:practice:0');
    await step(0);
    assert.equal(await ring(), false, 'hover ring does not duplicate selected ring');
    await page.mouse.move(2, 2);
    await step(30);
    assert.equal(await target(), 'skeleton:practice:0');
    console.log('PASS 14.6 hover-only cursor and real click target agreement');
    const accepted = await page.evaluate(() => {
      const d = window.__dungeon,
        p = d.game.player.actor;
      for (let i = 0; i < 360; i++) {
        d.step([], 1);
        if (p.entity.require('playerHurt').sample)
          return { hp: p.health.current, hit: p.entity.require('playerHurt').sample };
      }
      return null;
    });
    assert.ok(
      accepted && accepted.hp < 100 && accepted.hit?.sequence === 1,
      JSON.stringify(accepted),
    );
    console.log('PASS 14.8 real practice exchange publishes a surviving hit');
  }

  if (!part || part === 'matrix') {
    await mkdir('test-results', { recursive: true });
    let origin = 0;
    const state = () =>
      page.evaluate((origin) => {
        const g = window.__dungeon.game;
        const { run, progression } = g.scenario!;
        const ember = run.require('lastEmber');
        const tribute = run.require('tribute');
        const { discoveries, events, factIds } = run.require('discoveries').snapshot();
        return {
          hp: g.player.health,
          progression: progression.snapshot.value,
          checkpoint: g.checkpoint,
          doors: g.world.entities.flatMap((e) =>
            e.type === 'door' ? [{ id: e.id, open: e.open, locked: e.locked }] : [],
          ),
          loot: {
            chests: g.chests,
            opened: g.world.entities.flatMap((e) => (e.type === 'chest' && e.open ? [e.id] : [])),
            recovered: tribute.recovered,
            cargo: tribute.cargo.map((e, i) => ({
              id: e.id,
              state: e.require('cargo').state,
              revision: e.require('cargo').revision,
              drawn: g.scene.getTransformNodeByName(`Royal tribute crate ${i}`)!.isEnabled(),
            })),
          },
          ember: { state: ember.state, focus: ember.focusEnabled, reward: ember.reward },
          work: g.player.actor.entity.get('work')?.snapshot() ?? null,
          objectives: run
            .require('objectives')
            .snapshot()
            .objectives.map((o) => ({
              ...o,
              resolution: o.resolution && { ...o.resolution, step: o.resolution.step - origin },
            })),
          // Compare recorded content and order, not the initial live frames before freezing.
          evidence: {
            discoveries: discoveries.map((entry) => ({ ...entry, at: 0 })),
            events: events.map((entry) => ({ ...entry, at: 0 })),
            factIds,
          },
          hud: {
            health: document.querySelector('#health-text')!.textContent,
            toast: document.querySelector('#toast.visible')?.textContent ?? null,
            altar: document.querySelector('#altar-check')!.classList.contains('done'),
            throne: document.querySelector('#throne-check')!.classList.contains('done'),
            inspection:
              document.querySelector('#inspection[open] #inspection-title')?.textContent ?? null,
          },
        };
      }, origin);
    const matrix = [];
    for (const input of ['E', 'click']) {
      await load('seed=MOURNING-731');
      origin = await page.evaluate(() => {
        const g = window.__dungeon.game;
        g.player.health = 15;
        for (const enemy of g.combat.enemies) {
          enemy.entity.remove('brain');
          enemy.health.current = 0;
          enemy.entity.require('rig').root.setEnabled(false);
        }
        return g.steps;
      });
      const outcomes = [];
      let gateId: string | undefined;
      for (const kind of [
        'portrait',
        'chest',
        'spent-chest',
        'focus',
        'spent-focus',
        'shrine',
        'spent-shrine',
        'cargo',
        'recovered-cargo',
        'delivered-cargo',
        'locked',
        'unkindled',
        'altar',
        'gate',
        'throne',
      ] as const) {
        const aim = await page.evaluate((kind) => {
          const d = window.__dungeon,
            g = d.game,
            run = g.scenario!.run;
          const ember = run.require('lastEmber');
          const cargoIndex = kind === 'delivered-cargo' ? 1 : 0;
          const cargo = run.require('tribute').cargo[cargoIndex];
          if (kind === 'delivered-cargo') {
            // Arrange terminal cargo through the real lifecycle; the test is about later use,
            // not AI delivery (covered by tribute-browser).
            const carrier = g.combat.enemies[0].entity;
            const item = cargo.require('cargo');
            carrier.require('health').current = 1;
            if (!item.claim(carrier)) throw new Error('Unable to claim delivery fixture');
            item.commit(carrier, 'pickup');
            item.commit(carrier, 'deliver');
            carrier.require('health').current = 0;
          }
          const e = g.world.entities.find((e) =>
            kind === 'locked' || kind === 'gate'
              ? e.type === 'door' && e.requiresAltar
              : e.type ===
                  (kind === 'unkindled' ? 'throne' : kind === 'spent-chest' ? 'chest' : kind) &&
                (e.type !== 'portrait' || e.room === 'entrance'),
          );
          let p, x, z, y;
          if (
            kind === 'focus' ||
            kind === 'spent-focus' ||
            kind === 'shrine' ||
            kind === 'spent-shrine'
          ) {
            const focus = kind === 'focus' || kind === 'spent-focus';
            const s = ember.sites[focus ? 'focus' : 'shrine'];
            p = s.approach;
            x = s.x;
            z = s.z;
            y = s.h + (focus ? 0.8 : 1);
          } else if (kind === 'cargo' || kind.endsWith('-cargo')) {
            p = cargo.require('workSite').approach;
            ({ x, z } = cargo.require('transform'));
            y = p.h + (kind === 'cargo' ? 0.29 : 0.055);
          } else if (e?.type === 'portrait') {
            p = { x: e.x - e.wallDirection[0] * 1.75, z: e.z - e.wallDirection[1] * 1.75 };
            ({ x, z } = e);
            y = e.h + 1.85;
          } else if (e?.type === 'door') {
            p = { x: e.x - (e.axis === 'x' ? 2 : 0), z: e.z - (e.axis === 'z' ? 2 : 0) };
            x = e.x + (e.axis === 'z' ? 0.18 : 0);
            z = e.z + (e.axis === 'x' ? 0.18 : 0);
            y = e.h + 1.45;
          } else if (e?.type === 'altar' || e?.type === 'chest' || e?.type === 'throne') {
            p = e.approach;
            ({ x, z } = e);
            y = e.h + (e.type === 'altar' ? 2.35 : e.type === 'throne' ? 2.12 : 0.66);
          } else throw new Error(`Missing fixture ${kind}`);
          d.teleport(p.x, p.z);
          d.step([], 1); // Sample objective availability at the fixture, not at the previous aim.
          g.camera.alpha = g.desiredAlpha =
            kind === 'unkindled' ? -Math.PI / 2 : Math.atan2(p.z - z, p.x - x);
          g.camera.beta = kind === 'portrait' ? 1.28 : 0.93;
          g.camera.radius = g.desiredRadius = 2.8;
          g.camera.target.set(x, y, z);
          d.step([], 0);
          return { x, y, z, id: e?.id };
        }, kind);
        if (input === 'click' && kind === 'throne') {
          const carpet = await page.evaluate(() => {
            const g = window.__dungeon.game;
            const throne = g.world.entities.find((e) => e.type === 'throne')!;
            const point = {
              x: throne.x - 2 * Math.round(Math.sin(throne.rotation)),
              z: throne.z - 2 * Math.round(Math.cos(throne.rotation)),
              h: throne.h + 0.04,
            };
            g.camera.target.set(point.x, point.h, point.z);
            g.camera.alpha = g.desiredAlpha = Math.PI / 2;
            g.camera.beta = 0.35;
            g.camera.radius = g.desiredRadius = 7;
            point.h = (g.world.tiles.get(`${point.x},${point.z}`)?.h ?? throne.h) + 0.055;
            g.camera.target.y = point.h;
            return point;
          });
          const click = await project(carpet.x, carpet.z, carpet.h);
          assert.equal(
            await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, click),
            'game',
          );
          await page.mouse.click(click.x, click.y);
          assert.equal(
            await page.evaluate(() => window.__dungeon.game.complete),
            false,
            'the carpet must not claim a reachable crown',
          );
          assert.equal(
            await page.evaluate(() => {
              const n = window.__dungeon.game.player.navigator;
              return n.pending || n.active;
            }),
            true,
            JSON.stringify({
              message: 'the carpet issues a floor command',
              carpet,
              click,
              from: await at(),
              errors,
              nav: await page.evaluate(() => {
                const d = window.__dungeon;
                const n = d.game.player.navigator;
                return {
                  result: n.planningResult,
                  active: n.active,
                  path: n.path,
                  loops: d.engine.activeRenderLoops.length,
                };
              }),
            }),
          );
          await step(55);
          const [x, , z] = await at();
          assert.ok(Math.hypot(x - carpet.x, z - carpet.z) < 0.1, 'the hero reaches the carpet');
          assert.equal(await page.evaluate(() => window.__dungeon.game.complete), false);
          console.log('PASS 14.4 real carpet click travels without claiming the crown');
          await page.evaluate(({ x, y, z }) => {
            const g = window.__dungeon.game;
            g.camera.target.set(x, y, z);
            g.camera.alpha = g.desiredAlpha = -Math.PI / 2;
            g.camera.beta = 0.93;
            g.camera.radius = g.desiredRadius = 2.8;
          }, aim);
        }
        const before = await state();
        if (input === 'E') await page.keyboard.press('KeyE');
        else {
          const p = await project(aim.x, aim.z, aim.y);
          await page.mouse.move(2, 2);
          await page.mouse.move(p.x, p.y);
          await step(0);
          assert.equal(
            await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, p),
            'game',
          );
          const outlined = await page.evaluate(() =>
            window.__dungeon.game.scene.meshes.filter((m) => m.renderOutline).map((m) => m.name),
          );
          const available = ![
            'locked',
            'unkindled',
            'spent-chest',
            'spent-focus',
            'spent-shrine',
            'recovered-cargo',
            'delivered-cargo',
          ].includes(kind);
          if (outlined.length > 0 !== available) {
            const surfaces = await page.evaluate(({ x, y }) => {
              const g = window.__dungeon.game,
                M = g.camera.getWorldMatrix().constructor as typeof Matrix;
              const ray = g.scene.createPickingRay(x, y, M.Identity(), g.camera);
              return g.scene
                .multiPickWithRay(
                  ray,
                  (mesh) =>
                    mesh.isEnabled() &&
                    mesh.isVisible &&
                    mesh.visibility >= 0.5 &&
                    !mesh.hasThinInstances,
                )
                ?.sort((a, b) => a.distance - b.distance)
                .slice(0, 8)
                .map((hit) => [hit.pickedMesh?.name, hit.pickedMesh?.parent?.name, hit.distance]);
            }, p);
            assert.fail(JSON.stringify({ kind, aim, p, outlined, surfaces }));
          }
          await page.mouse.click(p.x, p.y);
        }
        const after = await state();
        const label = `${input}/${kind}`;
        const hpDelta = after.hp - before.hp;
        assert.equal(
          hpDelta,
          kind === 'chest' ? 30 : kind === 'cargo' ? 10 : kind === 'altar' ? 100 - before.hp : 0,
          label,
        );
        if (hpDelta) assert.equal(after.hud.health, `${after.hp} / 100`, label);
        outcomes.push({ kind, hpDelta, after });
        const gate = after.doors.find((d) => d.id === aim.id);
        switch (kind) {
          case 'portrait':
            assert.ok(after.hud.inspection, label);
            assert.ok(
              after.evidence.discoveries.some((e) => e.kind === 'portrait'),
              label,
            );
            break;
          case 'chest':
            assert.deepEqual(after.loot.opened, [aim.id], label);
            assert.equal(after.loot.chests, 1, label);
            assert.ok(
              after.evidence.events.some(
                (e) => e.kind === 'reliquary-claimed' && e.subjectId === aim.id,
              ),
              label,
            );
            break;
          case 'focus':
            assert.equal(after.ember.focus, false, label);
            assert.ok(
              after.evidence.discoveries.some((e) => e.id === 'ember:focus-disabled'),
              label,
            );
            break;
          case 'shrine': {
            assert.equal(after.work?.objectiveId, 'ember:restore', label);
            assert.ok(
              after.evidence.discoveries.some((e) => e.id.startsWith('ember:seen:')),
              label,
            );
            await step(90);
            const working = await state();
            assert.ok(working.work?.cycleId, label);
            await step(2200);
            const completed = await state();
            assert.equal(completed.ember.state, 'restored', label);
            assert.equal(completed.ember.reward, 30, label);
            assert.equal(completed.hp - after.hp, 30, label);
            assert.equal(completed.hud.health, `${completed.hp} / 100`, label);
            assert.equal(completed.work, null, label);
            outcomes.push({ working, completed });
            break;
          }
          case 'spent-focus':
          case 'spent-shrine':
            assert.deepEqual(
              {
                ...after,
                hud: { ...after.hud, toast: before.hud.toast },
                evidence: before.evidence,
              },
              before,
              label,
            );
            assert.equal(
              after.hud.toast,
              kind === 'spent-focus'
                ? 'Focus disabled'
                : 'You restored the Last Ember and received its blessing (+30 health once). Profanation can no longer finish.',
              label,
            );
            assert.deepEqual(after.evidence, before.evidence, label);
            if (kind === 'spent-shrine')
              assert.ok(
                after.evidence.discoveries.some((e) => e.id === 'ember:seen:restored'),
                label,
              );
            if (kind === 'spent-shrine') {
              await step(370);
              const later = await state();
              assert.deepEqual(
                { ...later, hud: { ...later.hud, toast: after.hud.toast } },
                after,
                'a full work cycle later, nothing was replayed',
              );
            }
            break;
          case 'cargo':
            assert.equal(after.loot.recovered, 1, label);
            assert.equal(after.loot.cargo[0].state, 'recovered', label);
            break;
          case 'spent-chest':
          case 'recovered-cargo':
          case 'delivered-cargo':
            if (kind.endsWith('-cargo')) {
              const item = after.loot.cargo[kind === 'delivered-cargo' ? 1 : 0];
              assert.equal(
                item.state,
                kind === 'delivered-cargo' ? 'delivered' : 'recovered',
                label,
              );
              assert.equal(item.drawn, false, label);
            }
            assert.deepEqual(after, before, label);
            break;
          case 'locked':
            assert.ok(gate?.locked && !gate.open, label);
            gateId = gate.id;
            assert.equal(
              after.hud.toast,
              'The gate remembers an oath. Kindle the violet altar.',
              label,
            );
            break;
          case 'gate':
            assert.ok(gate?.open && !gate.locked, label);
            break;
          case 'altar': {
            assert.deepEqual(
              after.doors.find((d) => d.id === gateId),
              { id: gateId, locked: false, open: false },
              label,
            );
            assert.equal(after.hud.altar, true, label);
            break;
          }
          case 'throne':
            assert.equal(after.progression, 'complete', label);
            assert.equal(after.hud.throne, true, label);
            break;
          case 'unkindled': {
            assert.equal(after.hud.toast, 'The crown waits for the altar’s flame.', label);
            assert.deepEqual(
              { ...after, hud: { ...after.hud, toast: before.hud.toast } },
              before,
              label,
            );
            assert.equal(
              await page.evaluate(() => {
                const nav = window.__dungeon.game.player.navigator;
                return nav.active || nav.pending;
              }),
              false,
              label,
            );
            if (input === 'click')
              await page.screenshot({ path: 'test-results/epic14-unkindled-throne.png' });
            break;
          }
        }
        if (kind === 'spent-chest' && input === 'click') {
          const previous = await page.evaluate(() => {
            const g = window.__dungeon.game;
            const tribute = g.scenario!.run.require('tribute');
            const site = tribute.cargo[0].require('workSite');
            const previous = site.approach;
            site.approach = { ...g.player.actor.position };
            if (tribute.nearby()?.id !== tribute.cargo[0].id)
              throw new Error('Exact-pick fixture requires E to see the nearby loose crate');
            return previous;
          });
          const p = await project(aim.x, aim.z, aim.y);
          assert.equal(
            await page.evaluate(({ x, y }) => window.__dungeon.pickedObjectAt(x, y), p),
            aim.id,
            'the real pointer ray resolves to the spent chest, not scenery or the nearby crate',
          );
          await page.mouse.click(p.x, p.y);
          assert.deepEqual(await state(), after, 'exact pick must not recover the nearby crate');
          await page.evaluate((previous) => {
            window.__dungeon.game
              .scenario!.run.require('tribute')
              .cargo[0].require('workSite').approach = previous;
          }, previous);
        }
        if (kind === 'portrait') {
          await page.keyboard.press('KeyE');
          await page.evaluate(() => window.__dungeon.game.inspection.update(2));
        }
        if (kind === 'gate') {
          await step(65);
          const face = await page.evaluate((id) => {
            const d = window.__dungeon,
              g = d.game;
            const e = g.world.entities.find((e) => e.id === id);
            if (e?.type !== 'door') throw new Error('Missing gate');
            const a = g.combat.enemies[0];
            a.health.current = a.health.max;
            a.entity.setPosition({ x: e.x, z: e.z, h: e.h });
            const side = {
              x: e.x + (e.axis === 'x' ? 1.8 : 0),
              z: e.z + (e.axis === 'z' ? 1.8 : 0),
            };
            d.teleport(side.x, side.z);
            const mesh = e.pivot!.getChildMeshes().find((m) => m.name === 'door plank')!;
            mesh.computeWorldMatrix(true);
            const p = mesh.getAbsolutePosition();
            g.camera.alpha = g.desiredAlpha = Math.atan2(side.z - e.z, side.x - e.x);
            g.camera.beta = 1.15;
            g.camera.target.copyFrom(p);
            d.step([], 0);
            return { x: p.x, y: p.y, z: p.z };
          }, aim.id);
          if (input === 'E') await page.keyboard.press('KeyE');
          else {
            const p = await project(face.x, face.z, face.y);
            await page.mouse.move(p.x, p.y);
            await step(0);
            assert.equal(
              await page.evaluate(() =>
                window.__dungeon.game.scene.meshes.some((m) => m.renderOutline),
              ),
              false,
            );
            await page.mouse.click(p.x, p.y);
          }
          assert.equal(
            await page.evaluate((id) => {
              const e = window.__dungeon.game.world.entities.find((e) => e.id === id);
              return e?.type === 'door' && e.open;
            }, aim.id),
            true,
          );
          await page.evaluate(() => {
            window.__dungeon.game.combat.enemies[0].health.current = 0;
          });
          assert.equal((await state()).hud.toast, 'Someone is in the doorway.', label);

          const opposite = await page.evaluate(
            ({ id, face }) => {
              const d = window.__dungeon;
              const g = d.game;
              const e = g.world.entities.find((e) => e.id === id);
              if (e?.type !== 'door') throw new Error('Missing gate');
              const { axis, x, z, h } = e;
              const onSide = (offset: number) => ({
                x: x + (axis === 'x' ? offset : 0),
                z: z + (axis === 'z' ? offset : 0),
              });
              const start = onSide(0.35);
              d.teleport(start.x, start.z);
              g.camera.target.set(face.x, face.y, face.z);
              return { axis, x, z, h, retreat: onSide(2.05) };
            },
            { id: aim.id, face },
          );
          const gateState = () =>
            page.evaluate((id) => {
              const g = window.__dungeon.game;
              const e = g.world.entities.find((e) => e.id === id);
              if (e?.type !== 'door') throw new Error('Missing gate');
              return {
                open: e.open,
                angle: e.angle,
                solid: e.collider!.checkCollisions,
                outlined: e.pivot!.getChildMeshes().some((m) => m.renderOutline),
              };
            }, aim.id);
          const closeFrom = await at();
          if (input === 'E') await page.keyboard.press('KeyE');
          else {
            const p = await project(face.x, face.z, face.y);
            await page.mouse.move(p.x, p.y);
            await step(0);
            assert.equal((await gateState()).outlined, true, 'opposite-side open leaf is usable');
            await page.mouse.click(p.x, p.y);
          }
          assert.equal((await gateState()).open, false, 'close is immediate');
          assert.equal((await gateState()).solid, true, 'solid during closing');
          for (const frames of [1, 20, 70]) {
            await step(frames);
            assert.deepEqual(await at(), closeFrom, 'closing must not displace the hero');
            assert.equal((await gateState()).open, false);
            assert.equal((await gateState()).solid, true);
          }
          assert.ok(Math.abs((await gateState()).angle ?? 1) < 0.01, 'closed leaf settles');
          await page.evaluate(({ retreat, h, axis }) => {
            const g = window.__dungeon.game;
            g.camera.alpha = g.desiredAlpha = axis === 'x' ? 0 : Math.PI / 2;
            g.camera.beta = 0.42;
            g.camera.radius = g.desiredRadius = 6;
            g.camera.target.set(retreat.x, h, retreat.z);
          }, opposite);
          await floor(opposite.retreat.x, opposite.retreat.z, opposite.h);
          for (const frames of [1, 9, 30, 80]) {
            await step(frames);
            const [x, , z] = await at();
            assert.ok(
              (opposite.axis === 'x' ? x - opposite.x : z - opposite.z) >= 0.34,
              'retreat stays on the closing side',
            );
          }
          const [x, , z] = await at();
          assert.ok(
            Math.hypot(x - opposite.retreat.x, z - opposite.retreat.z) < 0.08,
            JSON.stringify({ x, z, opposite }),
          );
          assert.equal((await gateState()).solid, true, 'retreat did not open the gate');
          if (input === 'click') {
            await page.evaluate(() => window.__dungeon.game.scene.render());
            await page.screenshot({ path: 'test-results/epic14-gate-after-retreat.png' });
          }
          if (input === 'E') await page.keyboard.press('KeyE');
          else {
            await page.evaluate(({ x, y, z }) => {
              const g = window.__dungeon.game;
              g.camera.beta = 1.15;
              g.camera.radius = g.desiredRadius = 2.8;
              g.camera.target.set(x, y, z);
            }, aim);
            const p = await project(aim.x, aim.z, aim.y);
            await page.mouse.move(p.x, p.y);
            await step(0);
            assert.equal(
              (await gateState()).outlined,
              true,
              'closed leaf is visible from retreat point',
            );
            await page.mouse.click(p.x, p.y);
          }
          await step(65);
          assert.equal((await gateState()).open, true, `${label}: reopened after physical retreat`);
          assert.equal((await gateState()).solid, false);
          assert.deepEqual(
            await at(),
            [x, closeFrom[1], z],
            'reopening was in reach after retreat',
          );
        }
        await step(1);
      }
      matrix.push(outcomes);
    }
    for (const [i, outcome] of matrix[0].entries())
      assert.deepEqual(
        outcome,
        matrix[1][i],
        `E/click parity: ${'kind' in outcome ? outcome.kind : 'shrine completion'}`,
      );
    console.log(
      'PASS 14.4 seeded E/click state, evidence, HUD, HP and work parity; no replay or neighbor fallback',
    );
    console.log(
      'PASS 14.5 dungeon gate refuses NPC overlap, then closes from the opposite side, settles, and allows mouse retreat and reopen',
    );
  }

  if (!part || part === 'pose') {
    await mkdir('test-results', { recursive: true });
    // Same authored skeleton species/camera in each comparison. Fixtures place actors;
    // all damage, selection and defense are ordinary game actions, not injected hits.
    for (const mode of ['practice', 'dungeon']) {
      const traces = [];
      for (const action of ['swing', 'hurt', 'block', 'hurt-without-presentation'] as const) {
        await load(mode === 'practice' ? 'room=practice' : 'seed=MOURNING-731');
        if (mode === 'practice') {
          await page.locator('#start-practice-foe').click();
          await page.locator('#loading.done').waitFor({ state: 'attached' });
          await freeze();
        }
        const foe = await page.evaluate((action) => {
          const d = window.__dungeon,
            g = d.game;
          const foe = g.combat.enemies.find((a) => a.kind === 'skeleton')!;
          for (const enemy of g.combat.enemies) {
            enemy.entity.remove('brain');
            enemy.attack.reset();
            if (enemy.id !== foe.id) {
              enemy.health.current = 0;
              enemy.entity.require('rig').root.setEnabled(false);
            }
          }
          const z = g.scenario ? 0 : -4;
          d.teleport(0, z);
          g.player.actor.position.heading = 0;
          foe.entity.setPosition({ x: 0, z: z + 1.35, h: 0 });
          foe.position.heading = Math.PI;
          if (action !== 'swing') foe.enableAI();
          if (action === 'hurt-without-presentation') {
            const feedback = g.player.actor.entity.require('playerHurt');
            feedback.publish = () => {};
          }
          g.camera.alpha = g.desiredAlpha = -0.2;
          g.camera.beta = 1.03;
          g.camera.radius = g.desiredRadius = 11;
          d.step([], 1);
          return { ...foe.position, id: foe.id };
        }, action);
        const p = await project(foe.x, foe.z, foe.h + 1);
        if (action === 'block') await page.keyboard.down('KeyF');
        else await page.mouse.click(p.x, p.y);
        const result = await page.evaluate(
          ({ id, action }) => {
            const d = window.__dungeon,
              g = d.game;
            const hero = g.player.actor,
              foe = g.combat.actor(id)!;
            const trace = [];
            let peak = false,
              hitFrame = -1;
            const start = action === 'swing' ? hero.attack.target === id : true;
            for (let i = 0; i < 170; i++) {
              d.step([], 1);
              trace.push({
                hero: hero.health.current,
                foe: foe.health.current,
                position: { ...hero.position },
                target: hero.attack.target,
                swing: hero.attack.swing ? { ...hero.attack.swing } : null,
                guard: hero.defending,
                cooldown: hero.attack.cooldown,
              });
              if (hero.health.current < 100 && hitFrame < 0) hitFrame = i;
              peak =
                action === 'block'
                  ? hero.entity.require('rigPose').actions.shield.snapshot().recoil > 0
                  : action === 'swing'
                    ? foe.health.current < foe.health.max
                    : hitFrame >= 0 && i === hitFrame + 2;
              if (peak) {
                g.scene.render();
                break;
              }
            }
            return { start, peak, trace, hit: hero.entity.require('playerHurt').sample };
          },
          { id: foe.id, action },
        );
        assert.ok(
          result.start && result.peak,
          `${mode}/${action} ${JSON.stringify(result.trace.at(-1))}`,
        );
        assert.equal(!!result.hit, action === 'hurt');
        if (action === 'hurt' || action === 'hurt-without-presentation') traces.push(result.trace);
        else assert.equal(result.trace.at(-1)!.hero, 100);
        if (action === 'block') await page.keyboard.up('KeyF');
        if (action !== 'hurt-without-presentation')
          await page.screenshot({ path: `test-results/epic14-${mode}-${action}.png` });
      }
      assert.deepEqual(
        traces[0],
        traces[1],
        `${mode}: presentation must not modify fixed-input gameplay`,
      );
      console.log(
        `PASS 14.8 ${mode} matched rendered swing/hurt/block and fixed-input gameplay parity`,
      );
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
