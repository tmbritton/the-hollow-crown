import type { DungeonDebug } from './gameTypes.ts';

declare global {
  interface Window {
    /** Present only in a development build opened with ?debug. */
    __dungeon?: DungeonDebug;
  }
}
