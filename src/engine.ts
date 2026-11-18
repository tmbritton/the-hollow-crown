import { Engine } from '@babylonjs/core/Engines/engine';

/** Keep diagnostics that depend on Babylon's protected cache in one place. */
export class DungeonEngine extends Engine {
  get cachedEffectCount(): number {
    return Object.keys(this._compiledEffects).length;
  }
}
