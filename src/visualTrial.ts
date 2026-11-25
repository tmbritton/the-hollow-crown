export const BASE_FOV = 0.65;
export const BARREL_COEFFICIENT = 0.42;

export interface ViewSettings {
  readonly lensDegrees: number;
  readonly fisheyePercent: number;
  readonly paletteEnabled: boolean;
  readonly roomHue: number;
  readonly shadowCoverage: number;
  readonly inkWidth: number;
}

export const DEFAULT_VIEW: ViewSettings = Object.freeze({
  lensDegrees: (BASE_FOV * 180) / Math.PI,
  fisheyePercent: 0,
  paletteEnabled: false,
  roomHue: 275,
  shadowCoverage: 50,
  inkWidth: 0,
});

export const VIEW_RANGES = {
  lensDegrees: [25, 60],
  fisheyePercent: [0, 100],
  roomHue: [0, 360],
  shadowCoverage: [0, 100],
  inkWidth: [0, 4],
} as const satisfies Record<
  Exclude<keyof ViewSettings, 'paletteEnabled'>,
  readonly [number, number]
>;

export function viewKey(key: string): key is keyof typeof VIEW_RANGES {
  return Object.hasOwn(VIEW_RANGES, key);
}

export function lensFov(degrees: number): number {
  return degrees === DEFAULT_VIEW.lensDegrees ? BASE_FOV : (degrees * Math.PI) / 180;
}

export function lensRadius(logicalRadius: number, fov: number): number {
  return fov === BASE_FOV
    ? logicalRadius
    : (logicalRadius * Math.tan(BASE_FOV / 2)) / Math.tan(fov / 2);
}

export function sceneAxes(aspect: number): [number, number] {
  return [Math.min(1, aspect), Math.min(1, 1 / aspect)];
}

export function barrelStrength(percent: number): number {
  return (BARREL_COEFFICIENT * percent) / 100;
}

/** Inverse lookup used by both the image and the pointer. Origin may be top or
 * bottom left: the map is symmetric about either axis. Minimum radial derivative
 * is 1 - strength, so the mapping cannot fold or duplicate an image region. */
export function sceneSample(u: number, v: number, aspect: number, percent: number) {
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  if (percent === 0) return { u, v };
  const [ax, ay] = sceneAxes(aspect);
  const x = u - 0.5;
  const y = v - 0.5;
  const r2 = 4 * ((x * ax) ** 2 + (y * ay) ** 2);
  const scale = 1 + barrelStrength(percent) * (r2 - 1);
  const source = { u: 0.5 + x * scale, v: 0.5 + y * scale };
  return source.u < 0 || source.u > 1 || source.v < 0 || source.v > 1 ? null : source;
}
