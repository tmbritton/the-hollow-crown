import type { Effect } from '@babylonjs/core/Materials/effect';
import type { Scene } from '@babylonjs/core/scene';
import { createPreparation, selectWork } from './targetedShader.ts';

type Quality = 'low' | 'high';
export interface ScaleSignature {
  quality: Quality;
  pass: 'camera' | 'shadow';
  source: string;
  sibling: string;
  scaled: string;
}

/** Clone only the scale delta of a real ready effect from the generated scene's normal loads. */
export function prepareScalePrograms(
  scene: Scene,
  signatures: readonly ScaleSignature[],
  quality: () => Quality,
  playable: () => void,
  failed: (reason: string) => void,
  clock: () => number,
) {
  const engine = scene.getEngine();
  let requestedRevision = 0;
  // Last revision handed to the compilation lifecycle, which may still be idle.
  let revision = 0;
  let released = false;
  let retired = false;
  let pending: { timer?: ReturnType<typeof setTimeout>; effects: Set<Effect> } | undefined;
  const leases = new Set<Effect>();
  type Work = ReturnType<typeof gather>;
  let work: Work = [];

  function gather(current: Quality) {
    // Babylon 9.37 WebGL2 cache. Never manufacture a mesh, material, pass or layout.
    const effects = engine['_compiledEffects'] as Record<string, Effect>;
    const ready = new Set(
      Object.values(effects)
        .filter((e) => e.isReady())
        .map((e) => e.key),
    );
    const jobs = signatures.flatMap(({ quality, source, pass, sibling, scaled }) => {
      if (quality !== current) return [];
      const material = scene.materials.find((m) => m.name === source && '_createdShaderName' in m);
      const token =
        material && '_createdShaderName' in material ? material._createdShaderName : source;
      if (typeof token !== 'string' || !token) return [];
      const prefix = `${token}+${token}@`;
      const representative = effects[prefix + sibling];
      if (!representative?.isReady() || !sibling.startsWith(representative.defines)) return [];
      const suffix = sibling.slice(representative.defines.length);
      if (!scaled.endsWith(suffix)) return [];
      return [
        {
          pass,
          key: prefix + scaled,
          layout: JSON.stringify(representative.getAttributesNames()),
          representative,
          defines: scaled.slice(0, scaled.length - suffix.length),
        },
      ];
    });
    return selectWork(jobs, current, ready);
  }

  function cancel() {
    if (!pending) return;
    const task = pending;
    pending = undefined;
    clearTimeout(task.timer);
    for (const effect of task.effects) effect.dispose();
  }

  const preparation = createPreparation({
    compile(current) {
      const task: NonNullable<typeof pending> = { effects: new Set() };
      pending = task;
      const deadline = clock() + 12000;
      try {
        for (const { representative: e, defines, key } of work) {
          const effect = engine.createEffect(
            e.name,
            {
              attributes: [...e.getAttributesNames()],
              uniformsNames: [...new Set(e.getUniformNames())],
              uniformBuffersNames: e.getUniformBuffersNames() ?? [],
              samplers: e.getSamplers(),
              indexParameters: e.getIndexParameters(),
              shaderLanguage: e.shaderLanguage,
              defines,
              fallbacks: null,
              onCompiled: null,
              onError: null,
            },
            engine,
          );
          task.effects.add(effect);
          if (effect.key !== key) throw new Error('Scale program key changed');
        }
      } catch (error) {
        preparation.send({ type: 'failed', revision: current, reason: String(error) });
        return;
      }
      const poll = () => {
        if (pending !== task) return;
        const effects = [...task.effects];
        if (effects.every((e) => e.isReady())) {
          for (const effect of effects) leases.add(effect);
          pending = undefined;
          preparation.send({ type: 'complete', revision: current });
          return;
        }
        const error = effects.find((e) => e.getCompilationError())?.getCompilationError();
        if (error || clock() >= deadline) {
          preparation.send({
            type: 'failed',
            revision: current,
            reason: error || 'Scale program preparation timed out',
          });
          return;
        }
        task.timer = setTimeout(poll, 8);
      };
      poll();
    },
    cancel,
    ready() {
      released = true;
      playable();
    },
    fail(_revision, reason) {
      released = true;
      failed(reason);
    },
  });
  const fail = (reason: string) => {
    if (retired || released) return;
    if (!preparation.send({ type: 'failed', revision, reason })) {
      released = true;
      failed(reason);
    }
  };
  const replace = () => {
    if (retired || released) return;
    const current = ++requestedRevision;
    const selectedQuality = quality();
    // Do not retain in-flight effects while Babylon prepares the new quality's siblings.
    cancel();
    scene.executeWhenReady(() => {
      if (retired || released || current !== requestedRevision || current === revision) return;
      try {
        work = gather(selectedQuality);
      } catch (error) {
        fail(String(error));
        return;
      }
      preparation.send({ type: 'begin', revision: (revision = current), empty: !work.length });
    });
  };
  const contextLoss = engine.onContextLostObservable.add(() => {
    fail('WebGL context lost during loading');
  });
  scene.onDisposeObservable.addOnce(() => {
    retired = true;
    preparation.send({ type: 'retire', revision });
    engine.onContextLostObservable.remove(contextLoss);
    for (const effect of leases) effect.dispose();
    leases.clear();
  });
  replace();
  return replace;
}
