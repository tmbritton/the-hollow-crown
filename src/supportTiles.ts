import type { Tile } from './worldTypes.ts';

/** Runtime support writer. Generation and arbitrary fixture maps remain mutable/unowned.
 * Freeze values as well as ramp inputs so edits cannot bypass the map's revision. */
export class SupportTiles extends Map<string, Tile> {
  private version = 0;

  constructor(source: ReadonlyMap<string, Tile>) {
    super();
    for (const [key, tile] of source) this.set(key, tile);
  }

  get revision() {
    return this.version;
  }

  override set(key: string, tile: Tile): this {
    if (this.get(key) === tile) return this;
    if (tile.ramp) Object.freeze(tile.ramp);
    Object.freeze(tile);
    this.version++;
    return super.set(key, tile);
  }

  override delete(key: string): boolean {
    if (!super.delete(key)) return false;
    this.version++;
    return true;
  }

  override clear(): void {
    if (this.size) this.version++;
    super.clear();
  }
}
