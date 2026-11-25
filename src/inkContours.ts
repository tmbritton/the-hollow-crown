import { Constants } from '@babylonjs/core/Engines/constants';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Material } from '@babylonjs/core/Materials/material';

export interface InkSubject {
  readonly meshes: readonly AbstractMesh[];
  readonly kind: 'silhouette' | 'gear';
  visible(): boolean;
}

const labelShader = {
  vertexSource: `
    attribute vec3 position;
    uniform mat4 worldViewProjection;
    void main() { gl_Position = worldViewProjection * vec4(position, 1.0); }
  `,
  fragmentSource: `
    precision highp float;
    uniform vec4 label;
    void main() { gl_FragColor = label; }
  `,
};
const composite = 'hollowCrownInk';
const bandShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D labels;
uniform vec2 pixel;
uniform float inkWidth;

float reach(vec2 direction, vec3 center, float width) {
  for (int i = 1; i <= 4; ++i) {
    if (float(i) > width) break;
    vec3 sampleLabel = texture2D(labels, vUV + float(i) * direction * pixel).rgb;
    if (any(greaterThan(abs(center - sampleLabel), vec3(0.0019)))) return float(i);
  }
  return 5.0;
}

void main() {
  vec4 color = texture2D(textureSampler, vUV);
  vec4 surface = texture2D(labels, vUV);
  vec3 center = surface.rgb;
  float amount = 0.0;
  // The center label belongs to the frontmost drawn surface. Do not spread
  // the gear treatment across actor or wall pixels, even beside a gear edge.
  bool gear = surface.a > 0.5;
  float width = gear ? 1.0 : inkWidth;
  if (any(greaterThan(center, vec3(0.0019)))) {
    for (int axis = 0; axis < 4; ++axis) {
      float angle = float(axis) * 0.7853981634;
      vec2 direction = vec2(cos(angle), sin(angle));
      float a = reach(direction, center, width), b = reach(-direction, center, width);
      float edge = min(a, b);
      if (edge <= width) {
        if (gear) {
          amount = 0.22;
          break;
        }
        // Avoid filling thin profiles and fade the inner edge of wider bands.
        float span = a + b - 1.0;
        float weight = mix(0.33, 0.86, smoothstep(1.0, 2.0 * width + 1.0, span));
        amount = max(amount, weight * mix(1.0, 0.65, (edge - 1.0) / width));
      }
    }
  }
  // Keep a narrow inset rim even at 4 px. A restrained warm lift preserves
  // the authored face and trim against shadow instead of covering them in violet.
  vec3 fill = gear ? color.rgb + (1.0 - color.rgb) * vec3(0.067, 0.055, 0.039) : color.rgb;
  gl_FragColor = vec4(mix(fill, vec3(0.070, 0.032, 0.100), amount), color.a);
}`;

/** Relabel the visible surfaces in the active camera list, with real opaque depth.
 * The mask owns its pass-specific materials; no color-pass material or mesh is changed. */
export function createInkContours(
  camera: ArcRotateCamera,
  subjects: readonly InkSubject[],
  before: PostProcess | null,
) {
  const scene = camera.getScene();
  const engine = camera.getEngine();
  const size = () => ({ width: engine.getRenderWidth(true), height: engine.getRenderHeight(true) });
  const mask = new RenderTargetTexture('Visual trial ink labels', size(), scene, {
    samplingMode: Constants.TEXTURE_NEAREST_SAMPLINGMODE,
    generateStencilBuffer: false,
    doNotChangeAspectRatio: true,
  });
  mask.clearColor = new Color4(0, 0, 0, 0);
  mask.renderParticles = false;
  mask.renderSprites = false;
  mask.renderList = null; // use the already evaluated camera-visible meshes (including cutaways)
  mask.activeCamera = camera;
  camera.customRenderTargets.push(mask);
  const resize = engine.onResizeObservable.add(() => mask.resize(size()));

  const labels = new Set<ShaderMaterial>();
  const bindings = subjects.map((subject, i) => {
    const label = i + 1; // RGB8 identifies the group (zero is non-subject); alpha marks gear.
    const material = new ShaderMaterial('Ink subject label', scene, labelShader, {
      attributes: ['position'],
      uniforms: ['worldViewProjection', 'label'],
    });
    material.setColor4(
      'label',
      new Color4(
        (label & 255) / 255,
        ((label >> 8) & 255) / 255,
        (label >> 16) / 255,
        subject.kind === 'gear' ? 1 : 0,
      ),
    );
    labels.add(material);
    return { subject, material, enabled: false };
  });
  mask.onBeforeRenderObservable.add(() => {
    for (const binding of bindings) {
      const enabled = binding.subject.visible();
      if (enabled === binding.enabled) continue;
      binding.enabled = enabled;
      for (const mesh of binding.subject.meshes)
        if (!mesh.isDisposed())
          mask.setMaterialForRendering(mesh, enabled ? binding.material : undefined);
    }
  });
  mask.customRenderFunction = (opaque, tested) => {
    const write = engine.getColorWrite();
    // Draw non-subject depth first. Drawing their depth after a label would leave
    // the old label in the color buffer even when that label is behind a wall.
    const isLabel = (material: Material | null) =>
      material instanceof ShaderMaterial && labels.has(material);
    engine.setColorWrite(false);
    try {
      for (const list of [opaque, tested]) {
        for (let i = 0; i < list.length; i++) {
          const sub = list.data[i];
          if (!isLabel(sub.getMaterial())) sub.render(false);
        }
      }
    } finally {
      engine.setColorWrite(write);
    }
    for (let i = 0; i < opaque.length; i++) {
      const sub = opaque.data[i];
      if (isLabel(sub.getMaterial())) sub.render(false);
    }
  };

  ShaderStore.ShadersStore[`${composite}PixelShader`] ??= bandShader;
  const pass = new PostProcess('Visual trial ink', composite, {
    uniforms: ['pixel', 'inkWidth'],
    samplers: ['labels'],
    samplingMode: Constants.TEXTURE_NEAREST_SAMPLINGMODE,
    engine,
  });
  camera.attachPostProcess(pass, before ? camera._postProcesses.indexOf(before) : null);
  let width = 0;
  pass.onApply = (effect) => {
    const { width: w, height: h } = mask.getSize();
    effect.setTexture('labels', mask);
    effect.setFloat2('pixel', 1 / w, 1 / h);
    effect.setFloat('inkWidth', width);
  };

  return {
    setWidth(value: number) {
      width = value;
    },
    dispose() {
      engine.onResizeObservable.remove(resize);
      const chain = camera._postProcesses;
      const slot = chain.indexOf(pass);
      pass.dispose(camera);
      // Reverse the exact insertion, preserving other passes and preexisting holes.
      if (slot >= 0) chain.splice(slot, 1);
      const target = camera.customRenderTargets.indexOf(mask);
      if (target >= 0) camera.customRenderTargets.splice(target, 1);
      for (const { subject } of bindings)
        for (const mesh of subject.meshes)
          if (!mesh.isDisposed()) mask.setMaterialForRendering(mesh, undefined);
      mask.dispose();
      for (const material of labels) material.dispose();
    },
  };
}
