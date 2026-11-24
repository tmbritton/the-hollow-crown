import type { ScaleSignature } from './targetedShaderRendering.ts';

// The sealed targeted-shader-review-v2 allowlist, in measured request order.
// Factor repeated text, but preserve the exact full Babylon cache keys (including line endings).
const camera = `MATERIALPLUGIN_1
DETAILDIRECTUV 0
DETAIL_NORMALBLENDMETHOD 0
PREPASS_COLOR_INDEX -1
PREPASS_IRRADIANCE_LEGACY_INDEX -1
PREPASS_IRRADIANCE_INDEX -1
PREPASS_ALBEDO_INDEX -1
PREPASS_ALBEDO_SQRT_INDEX -1
PREPASS_DEPTH_INDEX -1
PREPASS_SCREENSPACE_DEPTH_INDEX -1
PREPASS_NORMALIZED_VIEW_DEPTH_INDEX -1
PREPASS_NORMAL_INDEX -1
PREPASS_WORLD_NORMAL_INDEX -1
PREPASS_POSITION_INDEX -1
PREPASS_LOCAL_POSITION_INDEX -1
PREPASS_VELOCITY_INDEX -1
PREPASS_VELOCITY_LINEAR_INDEX -1
PREPASS_REFLECTIVITY_INDEX -1
PREPASS_OBJECT_ID_INDEX -1
PREPASS_MESH_BLEND_TAG_INDEX -1
SCENE_MRT_COUNT 0
VIGNETTEBLENDMODEMULTIPLY
TONEMAPPING 0
SAMPLER3DGREENDEPTH
SAMPLER3DBGRMAP
DIFFUSEDIRECTUV 0
AMBIENTDIRECTUV 0
OPACITYDIRECTUV 0
EMISSIVEDIRECTUV 0
SPECULARDIRECTUV 0
BUMPDIRECTUV 0
FOG
SPECULARTERM
NORMAL
VERTEXCOLOR
NUM_BONE_INFLUENCERS 0
BonesPerMesh 0
LIGHTMAPDIRECTUV 0
NUM_MORPH_INFLUENCERS 0
ALPHABLEND
CAMERA_PERSPECTIVE
AREALIGHTSUPPORTED
VERTEX_PULLING_USE_INDEX_BUFFER
CLUSTLIGHT_SLICES 0
CLUSTLIGHT_BATCH 0
TEXTURE_REPETITION_MODE 0
LIGHT0
HEMILIGHT0
LIGHT1
DIRLIGHT1
LIGHT2
POINTLIGHT2
LIGHT3
POINTLIGHT3
LIGHT4
POINTLIGHT4
LIGHTCOUNT 5
MAXLIGHTCOUNT 5`.split('\n');

const shadow = `SM_LIGHTTYPE_DIRECTIONALLIGHT
SM_FLOAT 1
SM_ESM 0
SM_DEPTHTEXTURE 1
SM_NORMALBIAS 1
SM_DIRECTIONINLIGHTDATA 1
SM_USEDISTANCE 0
SM_SOFTTRANSPARENTSHADOW 0
NORMAL
NUM_BONE_INFLUENCERS 0`.split('\n');

function signature(
  quality: ScaleSignature['quality'],
  pass: ScaleSignature['pass'],
  source: string,
  defines: string[],
): ScaleSignature {
  const index = defines.indexOf(pass === 'camera' ? 'ALPHABLEND' : 'NUM_BONE_INFLUENCERS 0');
  const text = (lines: string[]) =>
    lines.map((line) => `#define ${line}`).join('\n') + (pass === 'camera' ? '\n' : '');
  const scaled = [...defines];
  scaled.splice(index, 0, 'NONUNIFORMSCALING');
  return { quality, pass, source, sibling: text(defines), scaled: text(scaled) };
}

function cameraSignature(quality: ScaleSignature['quality'], source: string) {
  const colored = source === 'stone' || source === 'trim';
  const defines = camera.filter((line) => colored || line !== 'VERTEXCOLOR');
  if (source === 'default') {
    defines.splice(defines.indexOf('LIGHT0'));
    defines.splice(defines.indexOf('SPECULARTERM'), 2);
  } else if (quality === 'high') {
    defines.splice(defines.indexOf('NUM_MORPH_INFLUENCERS 0'), 0, 'SHADOWFLOAT');
    defines.splice(defines.indexOf('LIGHT2'), 0, 'SHADOW1', 'SHADOWPCF1');
    defines.splice(defines.indexOf('LIGHTCOUNT 5'), 0, 'SHADOWS');
  }
  return signature(quality, 'camera', source, defines);
}

export const signatures: readonly ScaleSignature[] = [
  ...['stone', 'trim', 'dark', 'iron', 'bone'].map((source) => cameraSignature('low', source)),
  signature('high', 'shadow', 'shadowMap', shadow),
  ...['stone', 'trim'].map((source) => cameraSignature('high', source)),
  ...['wood', 'gold', 'cloth', 'brick', 'default'].map((source) => cameraSignature('low', source)),
  ...['dark', 'wood', 'iron', 'gold', 'bone', 'cloth', 'brick', 'default'].map((source) =>
    cameraSignature('high', source),
  ),
];
