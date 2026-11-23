import type { DebugWindow } from './browserTypes.ts';
declare const window: DebugWindow;

/** Reversible diagnostics only: no changes to render membership outside main evaluation. */
export async function trialTraversal() {
  const d = window.__dungeon,
    g = d.game,
    scene = g.scene;
  const original = scene.getActiveMeshCandidates;
  const fixed = new Set(
    scene.meshes.filter(
      (m) =>
        m.isWorldMatrixFrozen &&
        m.isVisible &&
        !m.parent &&
        !m.actionManager &&
        !m.alwaysSelectAsActiveMesh &&
        !m.isAnInstance &&
        !('hasThinInstances' in m && m.hasThinInstances),
    ),
  );
  const before = scene.onBeforeActiveMeshesEvaluationObservable;
  const after = scene.onAfterActiveMeshesEvaluationObservable;
  let count = 0;
  const apply = () => {
    scene.getActiveMeshCandidates = () => {
      const all = original.call(scene);
      const data = all.data
        .slice(0, all.length)
        .filter((m) => !fixed.has(m) || m.isInFrustum(scene.frustumPlanes));
      count = data.length;
      return { data, length: data.length };
    };
  };
  const active = () => {
    const list = scene.getActiveMeshes();
    return list.data
      .slice(0, list.length)
      .map((m) => m.uniqueId)
      .join(',');
  };
  const image = () => d.engine.getRenderingCanvas()!.toDataURL();
  const results = [];
  for (const quality of ['low', 'high']) {
    const select = document.querySelector<HTMLSelectElement>('#quality')!;
    select.value = quality;
    select.dispatchEvent(new Event('change'));
    for (let i = 0; i < 12; i++) scene.render();
    const views = [];
    for (const turn of [0, 1, 2, 3]) {
      g.camera.alpha = -Math.PI / 4 + (turn * Math.PI) / 2;
      const shadowList = g.shadowMap.renderList;
      scene.render();
      const expected = active(),
        pixels = image();
      const enter = before.add(apply);
      const exit = after.add(() => {
        scene.getActiveMeshCandidates = original;
      });
      try {
        scene.render();
        views.push({
          turn,
          candidates: count,
          parity: expected === active() && pixels === image(),
          shadowListUnchanged: shadowList === g.shadowMap.renderList,
        });
      } finally {
        scene.getActiveMeshCandidates = original;
        before.remove(enter);
        after.remove(exit);
      }
    }
    const repeats = [];
    for (const mode of ['plain', 'trial', 'trial', 'plain', 'plain', 'trial']) {
      const enter = mode === 'trial' ? before.add(apply) : null;
      const exit =
        mode === 'trial'
          ? after.add(() => {
              scene.getActiveMeshCandidates = original;
            })
          : null;
      const ms = [];
      try {
        for (let i = 0; i < 48; i++) {
          g.camera.alpha = -Math.PI / 4 + (i % 24) * 0.035;
          const t = performance.now();
          scene.render();
          ms.push(performance.now() - t);
          if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
        }
      } finally {
        scene.getActiveMeshCandidates = original;
        if (enter) before.remove(enter);
        if (exit) after.remove(exit);
      }
      repeats.push({ mode, ms });
    }
    results.push({ quality, views, repeats });
  }
  // Read actual source geometry. A direct merge changes the winning representative’s box;
  // preserving a separate triangle source would be necessary before removing any head meshes.
  const skeletons = g.combat.enemies.filter((a) => a.kind === 'skeleton');
  const rigid = skeletons.map((a) => {
    const binding = a.entity.require('rigPose');
    const shapes = binding.physicsShapes();
    const head = a.entity.require('render').meshes.filter((m) => /:(skull|jaw)$/.test(m.name));
    return {
      actor: a.id,
      shapes: shapes.length,
      representatives: binding.bodyMeshes.map((m) => m.name),
      head: head.map((m) => ({
        name: m.name,
        parent: m.parent?.name,
        material: m.material?.name,
        vertices: m.getTotalVertices(),
        bounds: [
          m.getBoundingInfo().boundingBox.minimum.asArray(),
          m.getBoundingInfo().boundingBox.maximum.asArray(),
        ],
      })),
    };
  });
  const wallMeshes = g.ecs.query('cutaway').flatMap((e) => e.require('cutaway').meshes);
  const writes = [];
  for (const mode of ['still', 'rotate'] as const) {
    let identical = 0,
      changed = 0;
    for (let i = 0; i < 60; i++) {
      if (mode === 'rotate') g.desiredAlpha += 0.04;
      const values = wallMeshes.map((m) => m.scaling.y);
      // Presentation only. Unlike paused dt=0, use the normal 1/60 wall easing.
      d.step([], 0);
      wallMeshes.forEach((m, j) => {
        if (m.scaling.y === values[j]) identical++;
        else changed++;
      });
    }
    writes.push({ mode, identical, changed });
  }
  return {
    renderer: d.engine.getGlInfo(),
    meshes: scene.meshes.length,
    fixed: fixed.size,
    results,
    rigid,
    writes,
    batches: [...fixed]
      .filter((m) => /:-?\d+,-?\d+$/.test(m.name))
      .map((m) => ({
        name: m.name,
        material: m.material?.name,
        vertices: m.getTotalVertices(),
        indices: m.getTotalIndices(),
      })),
    instanced: scene.meshes
      .filter((m) => 'hasThinInstances' in m && m.hasThinInstances)
      .map((m) => m.name),
  };
}
