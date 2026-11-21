/** Physical perimeter profile shared by procedural masonry and render-only contacts.
 * Upper camera cutaways never change these structural bounds. */
export const WALL_OFFSET = 0.7;
export const WALL_THICKNESS = 0.4;
export const WALL_LENGTH = 1.05;
export const WALL_BASE = [
  { material: 'dark', center: 0.12, height: 0.24, overhang: 0.12, shade: 1 },
  { material: 'stone', center: 0.43, height: 0.4, overhang: 0, shade: 0.9 },
  { material: 'trim', center: 0.66, height: 0.09, overhang: 0.05, shade: 0.7 },
] as const;
export const WALL_CAP = { overhang: 0.14, height: 0.14 } as const;
/** Shared by visible door planks, living collision and physical death contacts. */
export const DOOR_HEIGHT = 2.8;
