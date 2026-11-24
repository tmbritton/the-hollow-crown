import type { Tile, Triple } from './worldTypes.ts';

export const roomRoles = ['chamber', 'stair', 'altar'] as const;
export type RoomRole = (typeof roomRoles)[number];
export const roomInk: Triple = [0.041, 0.026, 0.092];

export function roomRole(tile?: Pick<Tile, 'surface' | 'room'>): RoomRole {
  if (tile?.room === 'altar') return 'altar';
  if (tile?.surface === 'stair' || tile?.room === 'stairs') return 'stair';
  return 'chamber';
}

const hueOffset: Record<RoomRole, number> = { chamber: 0, stair: -65, altar: -130 };

export function roomSwatches(role: RoomRole, roomHue: number): [Triple, Triple, Triple] {
  const h = ((((roomHue + hueOffset[role]) % 360) + 360) % 360) / 60;
  // A shared hue with separate RGB ranges; both value and chroma survive display rounding.
  const channel = (offset: number) => {
    const k = (h + offset) % 6;
    return 1 - Math.max(0, Math.min(k, 4 - k, 1));
  };
  const band = (low: number, high: number): Triple => [
    low + (high - low) * channel(5),
    low + (high - low) * channel(3),
    low + (high - low) * channel(1),
  ];
  return [band(0.105, 0.245), band(0.29, 0.55), band(0.58, 0.93)];
}

/** Coverage moves one cutoff; it is not a target fraction of the framebuffer. */
export function bandThresholds(coverage: number): [number, number] {
  return [0.25 + 0.4 * (coverage / 100), 0.76];
}
