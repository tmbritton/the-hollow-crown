import type { Game } from '../src/gameTypes.ts';
import type { DebugWindow } from './browserTypes.ts';
declare const window: DebugWindow;

/** Detailed, one-frame browser diagnostic. Never installed during coarse samples. */
export function probeCpuPasses(quality: 'low' | 'high') {
  const d = window.__dungeon;
  const g = d.game;
  const select = document.querySelector<HTMLSelectElement>('#quality')!;
  const previous = select.value;
  const setQuality = (value: string) => {
    select.value = value;
    select.dispatchEvent(new Event('change'));
  };
  const counters = () => ({
    passes: 0,
    candidates: 0,
    frustumChecks: 0,
    matrixRequests: 0,
    matrixUpdates: 0,
    boundsUpdates: 0,
    meshReady: 0,
    materialReady: 0,
  });
  const result = { main: counters(), shadow: counters(), glow: counters() };
  let pass = result.main;
  const restore: (() => void)[] = [];
  const wrap = <T extends object, K extends keyof T>(
    owner: T,
    key: K,
    hook: (old: T[K]) => T[K],
  ) => {
    const original = Object.getOwnPropertyDescriptor(owner, key);
    Object.defineProperty(owner, key, { configurable: true, value: hook(owner[key]) });
    restore.push(() => {
      if (original) Object.defineProperty(owner, key, original);
      else Reflect.deleteProperty(owner, key);
    });
  };
  const addPass = (target: Game['shadowMap'], scope: typeof pass) => {
    const before = target.onBeforeRenderObservable.add(() => {
      scope.passes++;
      pass = scope;
    });
    restore.push(() => target.onBeforeRenderObservable.remove(before));
    const after = target.onAfterRenderObservable.add(() => {
      pass = result.main;
    });
    restore.push(() => target.onAfterRenderObservable.remove(after));
  };
  try {
    setQuality(quality);
    for (let i = 0; i < 8; i++) g.scene.render();
    addPass(g.shadowMap, result.shadow);
    addPass(g.glow.mainTexture, result.glow);
    wrap(g.scene, 'getActiveMeshCandidates', (original) => () => {
      const candidates = original.call(g.scene);
      pass.candidates += candidates.length;
      return candidates;
    });
    for (const node of [...g.scene.transformNodes, ...g.scene.meshes]) {
      wrap(node, 'computeWorldMatrix', (original) => (...args) => {
        pass.matrixRequests++;
        return original.apply(node, args);
      });
      const update = node.onAfterWorldMatrixUpdateObservable.add(() => {
        pass.matrixUpdates++;
      });
      restore.push(() => node.onAfterWorldMatrixUpdateObservable.remove(update));
    }
    for (const mesh of g.scene.meshes) {
      wrap(mesh, '_updateBoundingInfo', (original) => () => {
        pass.boundsUpdates++;
        return original.call(mesh);
      });
      wrap(mesh, 'isInFrustum', (original) => (...args) => {
        pass.frustumChecks++;
        return original.apply(mesh, args);
      });
      wrap(mesh, 'isReady', (original) => (...args) => {
        pass.meshReady++;
        return original.apply(mesh, args);
      });
    }
    for (const material of [...g.scene.materials, ...g.scene.multiMaterials]) {
      wrap(material, 'isReady', (original) => (...args) => {
        pass.materialReady++;
        return original.apply(material, args);
      });
      wrap(material, 'isReadyForSubMesh', (original) => (...args) => {
        pass.materialReady++;
        return original.apply(material, args);
      });
    }
    result.main.passes++;
    g.scene.render();
    return result;
  } finally {
    for (const undo of restore.reverse()) undo();
    if (previous !== quality) setQuality(previous);
  }
}
