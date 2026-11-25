import type { Page } from '@playwright/test';
import type { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { DebugWindow } from './browserTypes.ts';

declare const window: DebugWindow;

export function worldScreen(page: Page, x: number, z: number, y = 0) {
  return page.evaluate(
    ({ x, z, y }) => {
      const { game: g, engine } = window.__dungeon;
      g.scene.render();
      const V = g.camera.target.constructor as typeof Vector3;
      const M = g.camera.getWorldMatrix().constructor as typeof Matrix;
      const w = engine.getRenderWidth(),
        h = engine.getRenderHeight();
      const p = V.Project(
        new V(x, y, z),
        M.Identity(),
        g.scene.getTransformMatrix(),
        g.camera.viewport.toGlobal(w, h),
      );
      const r = document.querySelector('#game')!.getBoundingClientRect();
      return { x: r.left + (p.x * r.width) / w, y: r.top + (p.y * r.height) / h };
    },
    { x, z, y },
  );
}

export async function clickWorld(page: Page, x: number, z: number, y = 0) {
  const p = await worldScreen(page, x, z, y);
  await page.mouse.click(p.x, p.y);
}
