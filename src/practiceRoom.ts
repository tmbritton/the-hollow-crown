import { key } from './worldSpatial.ts';
import { createActor } from './actors.ts';
import type { ECS } from './ecs.ts';
import type {
  Axis,
  DoorEntity,
  InteriorWall,
  PracticeLayout,
  Prop,
  Room,
  Tile,
} from './worldTypes.ts';

const layout = {
  // Inclusive tile centers. The partition spans the floor across the travel axis.
  floor: { minX: -8, maxX: 8, minZ: -7, maxZ: 7 },
  door: { x: 0, z: 2, axis: 'z' as Axis },
  gap: 3.4,
  partition: { thickness: 0.55, height: 3.3 },
  pillar: { x: -3, z: -4, w: 1.45, d: 1.45, height: 3.2 },
  spawn: { x: 0, z: -4, h: 0 },
  foe: { x: 5, z: -2, h: 0 },
};

export const PRACTICE_NAME = 'The Dojo';
const { floor, door: doorway, pillar: footprint, spawn } = layout;
const alongZ = doorway.axis === 'z';
const doorwayOffset = (distance: number) => ({
  x: doorway.x + (alongZ ? 0 : distance),
  z: doorway.z + (alongZ ? distance : 0),
});
export const practiceDestinations = {
  beyondPillar: { x: 2 * footprint.x - spawn.x, z: 2 * footprint.z - spawn.z },
  approach: doorwayOffset(-2),
  landing: doorwayOffset(3),
};

export type PracticeRound = 'quiet' | 'singleFoe';
export type PracticeCommand = 'reset' | 'startSingleFoe';
type PracticeContext = PracticeRound | 'loading' | 'dungeon';
type PracticeDecision =
  | { kind: 'rebuild'; round: PracticeRound }
  | { kind: 'unavailable' | 'alreadySelected' };

// A round stays selected even after its opponent dies. Readiness belongs to the session.
export function decidePracticeRound(
  context: PracticeContext,
  command: PracticeCommand,
): PracticeDecision {
  if (context === 'loading' || context === 'dungeon') return { kind: 'unavailable' };
  if (command === 'reset') return { kind: 'rebuild', round: 'quiet' };
  return context === 'quiet'
    ? { kind: 'rebuild', round: 'singleFoe' }
    : { kind: 'alreadySelected' };
}

export function selectContent<D, P>(
  room: string | null,
  seed: string | null,
  providers: { dungeon(seed: string | null): D; practice(round: PracticeRound): P },
  round: PracticeRound = 'quiet',
): { kind: 'dungeon'; world: D } | { kind: 'practice'; world: P } {
  return room === 'practice'
    ? { kind: 'practice', world: providers.practice(round) }
    : { kind: 'dungeon', world: providers.dungeon(seed) };
}

export function createPracticeFoes(ecs: ECS, world: PracticeLayout, round: PracticeRound) {
  if (round === 'quiet') return [];
  const foe = createActor(ecs, world, 'skeleton:practice:0', 'skeleton', layout.foe);
  foe.enableAI();
  return [foe];
}

export function buildPracticeRoom(round: PracticeRound = 'quiet'): PracticeLayout {
  const bounds = {
    minX: floor.minX - 0.5,
    maxX: floor.maxX + 0.5,
    minZ: floor.minZ - 0.5,
    maxZ: floor.maxZ + 0.5,
  };
  const room: Room = {
    id: 'entrance',
    name: PRACTICE_NAME,
    kicker: 'TRAINING GROUND',
    description:
      round === 'quiet'
        ? 'A quiet place to try movement and door interaction.'
        : 'Click the skeleton to practise pursuit and melee attacks.',
    x: (bounds.minX + bounds.maxX) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
    h: 0,
    w: bounds.maxX - bounds.minX,
    d: bounds.maxZ - bounds.minZ,
    gx: 0,
    gz: 0,
    parent: -1,
    depth: 0,
    shape: 'rectangle',
    ports: [],
  };
  const tiles = new Map<string, Tile>();
  for (let x = floor.minX; x <= floor.maxX; x++)
    for (let z = floor.minZ; z <= floor.maxZ; z++)
      tiles.set(key(x, z), { x, z, h: room.h, surface: 'stone', room: room.id });

  const pillar: Prop = {
    ...footprint,
    id: 'practice-pillar',
    type: 'pillar',
    room: room.id,
    h: room.h,
    rotation: 0,
    variant: 0,
  };
  const door: DoorEntity = {
    ...doorway,
    id: 'practice-door',
    type: 'door',
    room: room.id,
    h: room.h,
    open: false,
    locked: false,
    requiresAltar: false,
  };
  const cross = alongZ ? door.x : door.z;
  const span = alongZ ? [bounds.minX, bounds.maxX] : [bounds.minZ, bounds.maxZ];
  const { thickness, height } = layout.partition;
  const partition: InteriorWall[] = [
    [span[0], cross - layout.gap / 2],
    [cross + layout.gap / 2, span[1]],
  ].map(([start, end], i) => ({
    id: `practice-partition-${i}`,
    h: room.h,
    height,
    x: alongZ ? (start + end) / 2 : door.x,
    z: alongZ ? door.z : (start + end) / 2,
    w: alongZ ? end - start : thickness,
    d: alongZ ? thickness : end - start,
  }));
  return {
    seed: 'practice',
    bounds,
    spawn: { ...spawn },
    rooms: [room],
    roomById: { entrance: room },
    tiles,
    props: [pillar],
    entities: [door],
    partition,
    blockers: [pillar, ...partition],
    connections: [],
    reserved: new Set(),
  };
}
