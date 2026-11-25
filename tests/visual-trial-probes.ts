import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { DungeonDebug } from '../src/gameTypes.ts';

function projector(d: DungeonDebug) {
  const { camera } = d.game;
  const canvas = d.engine.getRenderingCanvas()!;
  const { width, height } = canvas.getBoundingClientRect();
  const transform = camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true));
  const viewport = camera.viewport.toGlobal(width, height);
  return (point: Vector3) => Vector3.Project(point, Matrix.Identity(), transform, viewport);
}

export async function heroHeight(d: DungeonDebug) {
  const { player, scene } = d.game;
  const hero = player.root.getChildMeshes().filter((m) => m.isEnabled() && m.isVisible);
  const saved = hero.map((mesh) => mesh.material);
  // Render an emissive silhouette in place: depth, occlusion and rasterization are still real.
  const mask = new StandardMaterial('hero verification mask', scene);
  mask.disableLighting = true;
  mask.emissiveColor.set(1, 0, 1);
  const source = d.engine.getRenderingCanvas()!;
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d')!;
  try {
    for (const mesh of hero) mesh.material = mask;
    await Promise.all(hero.map((mesh) => mask.forceCompilationAsync(mesh)));
    scene.render();
    const image = new Image();
    image.src = source.toDataURL();
    await image.decode();
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let top = canvas.height;
    let bottom = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (data[i] > 120 && data[i] > data[i + 1] * 2 && data[i + 2] > data[i + 1] * 2) {
          top = Math.min(top, y);
          bottom = y;
        }
      }
    }
    return Math.max(0, bottom - top + 1);
  } finally {
    hero.forEach((mesh, i) => (mesh.material = saved[i]));
    mask.dispose();
  }
}

/** Independently project a known world fixture, then invert the reference image
 * equation numerically. No call into the application's pick or lens helpers. */
export function edgePoint(d: DungeonDebug, kind: 'floor' | 'door' | 'foe', strength: number) {
  const g = d.game;
  const canvas = d.engine.getRenderingCanvas()!;
  const { left, top, width, height } = canvas.getBoundingClientRect();
  const point =
    kind === 'floor'
      ? new Vector3(3, 0, -5)
      : kind === 'door'
        ? g.world.entities.find((e) => e.type === 'door' && e.id === 'practice-door')
        : g.combat.actor('skeleton:practice:0')?.position;
  if (!point) throw Error(`Missing ${kind} fixture`);
  const p = new Vector3(point.x, point instanceof Vector3 ? 0 : point.h + 0.85, point.z);
  const base = g.camera.target.clone();
  let chosen: { x: number; y: number; error: number; target: Vector3 } | null = null;
  for (let x = -12; x <= 12; x += 0.5)
    for (let z = -12; z <= 12; z += 0.5) {
      g.camera.target.set(base.x + x, base.y, base.z + z);
      const source = projector(d)(p);
      if (source.z < 0 || source.z > 1) continue;
      const u = source.x / width - 0.5;
      const v = source.y / height - 0.5;
      const aspect = d.engine.getRenderWidth(true) / d.engine.getRenderHeight(true);
      const r2 = 4 * (u * u + (v / aspect) ** 2);
      let lower = 0;
      let upper = 2;
      for (let i = 0; i < 32; i++) {
        const m = (lower + upper) / 2;
        const r = m * (1 + ((0.42 * strength) / 100) * (r2 * m * m - 1));
        if (r < 1) lower = m;
        else upper = m;
      }
      const displayX = (0.5 + lower * u) * width;
      const displayY = (0.5 + lower * v) * height;
      if (
        displayX < width * 0.8 ||
        displayX > width * 0.96 ||
        displayY < height * 0.35 ||
        displayY > height * 0.7
      )
        continue;
      const error = Math.hypot(displayX - width * 0.86, displayY - height * 0.57);
      if (!chosen || error < chosen.error)
        chosen = { x: left + displayX, y: top + displayY, error, target: g.camera.target.clone() };
    }
  if (!chosen) throw Error(`No outer-edge framing for ${kind}`);
  g.camera.target.copyFrom(chosen.target);
  g.scene.render();
  return { x: chosen.x, y: chosen.y };
}
