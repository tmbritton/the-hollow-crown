import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess';
import { Constants } from '@babylonjs/core/Engines/constants';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { barrelStrength, lensFov, lensRadius, sceneAxes, sceneSample } from './visualTrial.ts';
import type { ViewSettings } from './visualTrial.ts';

const shader = 'hollowCrownVisualTrial';

export function createVisualTrialRenderer(camera: ArcRotateCamera) {
  const engine = camera.getEngine();
  let pass: PostProcess | null = null;
  let strength = 0;
  const aspect = () => engine.getAspectRatio(camera, true);
  const setDistortion = (percent: number) => {
    strength = percent;
    if (!percent) {
      if (!pass) return;
      // Babylon detaches by leaving a null. Reclaim only the slot this pass owned,
      // and only at the tail so other passes keep their indices (including holes).
      const chain = camera._postProcesses;
      const slot = chain.indexOf(pass);
      pass.dispose(camera);
      if (slot >= 0 && slot === chain.length - 1 && chain[slot] === null) chain.pop();
      pass = null;
    } else if (!pass) {
      // One shared static shader; only an opted-in scene allocates a pass or textures.
      ShaderStore.ShadersStore[`${shader}PixelShader`] ??= `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 axes;
uniform float strength;
void main(void) {
  vec2 delta = vUV - 0.5;
  vec2 q = 2.0 * delta * axes;
  vec2 source = 0.5 + delta * (1.0 + strength * (dot(q, q) - 1.0));
  if (any(lessThan(source, vec2(0.0))) || any(greaterThan(source, vec2(1.0))))
    gl_FragColor = vec4(0.044, 0.065, 0.075, 1.0);
  else
    gl_FragColor = texture2D(textureSampler, source);
}`;
      pass = new PostProcess(
        'Visual trial fisheye',
        shader,
        ['axes', 'strength'],
        null,
        1,
        camera,
        Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
      );
      pass.onApply = (effect) => {
        const [x, y] = sceneAxes(aspect());
        effect.setFloat2('axes', x, y);
        effect.setFloat('strength', barrelStrength(strength));
      };
    }
  };
  camera.getScene().onDisposeObservable.addOnce(() => setDistortion(0));
  return {
    apply(settings: ViewSettings, logicalRadius: number, inspecting: boolean) {
      setDistortion(inspecting ? 0 : settings.fisheyePercent);
      if (!inspecting) {
        camera.fov = lensFov(settings.lensDegrees);
        camera.radius = lensRadius(logicalRadius, camera.fov);
      }
    },
    pick(x: number, y: number, width: number, height: number) {
      if (width <= 0 || height <= 0 || x < 0 || x >= width || y < 0 || y >= height) return null;
      const v = camera.viewport;
      const left = v.x * width;
      const top = (1 - v.y - v.height) * height;
      const w = width * v.width;
      const h = height * v.height;
      if (!strength) return x >= left && x < left + w && y >= top && y < top + h ? { x, y } : null;
      const sample = sceneSample((x - left) / w, (y - top) / h, aspect(), strength);
      return sample && { x: left + sample.u * w, y: top + sample.v * h };
    },
  };
}
