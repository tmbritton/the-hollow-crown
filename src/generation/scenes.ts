import type { Footprint, Frame, Point, Prop, PropType, Room, Tile } from '../worldTypes.ts';
import type { GenerationIdentity } from './identity.ts';
import { footprint, inwardRotations, localPoint, segmentIntersectsBox } from './placement.ts';
import { randomStream } from './random.ts';

export type SceneRoom = 'smithy' | 'bakery';
interface SceneObject {
  type: PropType;
  w: number;
  d: number;
}
export interface SceneRecipe {
  id: string;
  anchor: SceneObject;
  work: SceneObject;
  optional: readonly (SceneObject & { role: string; relativeTo: 'anchor' | 'work' })[];
  maxProps: number;
}

/** Existing meshes only: at most the previous workshop prop budget, no new lights or actors. */
export const SCENE_RECIPES: Readonly<Record<SceneRoom, SceneRecipe>> = {
  smithy: {
    id: 'forge-workplace',
    anchor: { type: 'furnace', w: 2.7, d: 2.5 },
    work: { type: 'anvil', w: 1.6, d: 1.25 },
    optional: [
      { role: 'tools', type: 'tool-bench', w: 2.8, d: 1.4, relativeTo: 'anchor' },
      { role: 'cooling', type: 'quench', w: 1.5, d: 1.5, relativeTo: 'work' },
    ],
    maxProps: 4,
  },
  bakery: {
    id: 'bread-workplace',
    anchor: { type: 'bread-oven', w: 2.9, d: 2.7 },
    work: { type: 'bread-table', w: 2.8, d: 1.6 },
    optional: [
      { role: 'bread', type: 'bread-rack', w: 2.1, d: 1.4, relativeTo: 'anchor' },
      { role: 'flour', type: 'flour-sacks', w: 1.7, d: 1.5, relativeTo: 'work' },
    ],
    maxProps: 4,
  },
};
export const MAX_SCENE_ANCHORS = 96;

export interface SceneSocketResult {
  role: string;
  attempts: number;
  socket: number | null;
  reason: 'preferred' | 'alternate-socket' | 'omitted' | 'disabled';
}
export interface ScenePlacement {
  id: string;
  recipeId: string;
  room: SceneRoom;
  props: Prop[];
  reserved: Point[];
  sockets: SceneSocketResult[];
  anchorAttempts: number;
}
interface SceneSpace {
  tiles: ReadonlyMap<string, Tile>;
  reserved: ReadonlySet<string>;
  blockers: readonly Footprint[];
}
interface SceneOptions {
  /** Optional constrained anchor list, still checked and capped by the ordinary planner. */
  anchors?: readonly (Frame & { rotation: number })[];
  includeOptional?: boolean;
}
export type SceneResult =
  | { status: 'placed'; anchorAttempts: number; scene: ScenePlacement }
  | { status: 'rejected'; anchorAttempts: number; reason: string };

const key = (p: Point) => `${p.x},${p.z}`;
const offsets: readonly Point[] = [
  { x: 4, z: 0 },
  { x: -4, z: 0 },
  { x: 4, z: -1 },
  { x: -4, z: -1 },
  { x: 4, z: 1 },
  { x: -4, z: 1 },
  { x: 0, z: -4 },
  { x: 0, z: 4 },
  { x: 8, z: 0 },
  { x: -8, z: 0 },
  { x: 0, z: -8 },
  { x: 0, z: 8 },
];

/** Pure, transactional planning. Required pairs retry anchors; optional sockets can only omit. */
export function planScene(
  identity: GenerationIdentity,
  room: Room,
  space: SceneSpace,
  { anchors, includeOptional = true }: SceneOptions = {},
): SceneResult {
  if (room.id !== 'smithy' && room.id !== 'bakery')
    return { status: 'rejected', anchorAttempts: 0, reason: `No scene recipe for ${room.id}` };
  const recipe = SCENE_RECIPES[room.id];
  const sceneId = `scene:${room.id}`;
  const random = randomStream(identity, 'scene-layout', sceneId);
  const candidates = anchors
    ? [...anchors]
    : [...space.tiles.values()]
        .filter((t) => t.room === room.id && t.surface === 'stone' && !t.ramp && !t.blocked)
        .sort((a, b) => a.x - b.x || a.z - b.z)
        .flatMap((t) =>
          inwardRotations(room, t).map((q) => ({ x: t.x, z: t.z, rotation: (q * Math.PI) / 2 })),
        );
  if (!anchors) {
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
  }
  const floor = (p: Point) => {
    const t = space.tiles.get(key(p));
    return t?.room === room.id && t.surface === 'stone' && !t.ramp && !t.blocked && t.h === room.h;
  };
  const inside = (p: Point, b: Footprint, margin: number) =>
    Math.abs(p.x - b.x) < b.w / 2 + margin && Math.abs(p.z - b.z) < b.d / 2 + margin;
  const existing = space.blockers.map(footprint);
  const makeProp = (
    spec: SceneObject,
    role: string,
    frame: Frame & { rotation: number },
  ): Prop => ({
    type: spec.type,
    w: spec.w,
    d: spec.d,
    ...frame,
    id: `${sceneId}:${role}`,
    room: room.id,
    h: room.h,
    variant: Math.floor(randomStream(identity, 'scene-appearance', `${sceneId}:${role}`)() * 4),
    frontClearance: localPoint(frame, 0, -Math.ceil(spec.d / 2 + 0.65)),
  });
  let anchorAttempts = 0;
  for (const frame of candidates.slice(0, MAX_SCENE_ANCHORS)) {
    anchorAttempts++;
    const props: Prop[] = [];
    const lane = new Map<string, Point>();
    const sockets: SceneSocketResult[] = [];
    const safe = (p: Point, objects: readonly Prop[]) =>
      floor(p) && ![...existing, ...objects.map(footprint)].some((b) => inside(p, b, 0.32));
    const fits = (prop: Prop) => {
      const b = footprint(prop);
      if (
        !inwardRotations(room, prop).some((q) => Math.abs(prop.rotation - (q * Math.PI) / 2) < 1e-9)
      )
        return false;
      for (let x = Math.ceil(b.x - b.w / 2 - 0.5); x <= Math.floor(b.x + b.w / 2 + 0.5); x++) {
        for (let z = Math.ceil(b.z - b.d / 2 - 0.5); z <= Math.floor(b.z + b.d / 2 + 0.5); z++) {
          const p = { x, z };
          if (!floor(p) || space.reserved.has(key(p)) || lane.has(key(p))) return false;
        }
      }
      return ![...existing, ...props.map(footprint)].some(
        (other) =>
          Math.abs(b.x - other.x) < (b.w + other.w) / 2 + 1.15 &&
          Math.abs(b.z - other.z) < (b.d + other.d) / 2 + 1.15,
      );
    };
    const path = (start: Point, objects: readonly Prop[]): Point[] | null => {
      if (!safe(start, objects) || !safe(room, objects)) return null;
      const boxes = [...existing, ...objects.map(footprint)];
      const queue = [start];
      const parents = new Map<string, Point | null>([[key(start), null]]);
      for (let i = 0; i < queue.length; i++) {
        const p = queue[i];
        if (p.x === room.x && p.z === room.z) {
          const result: Point[] = [];
          let cursor: Point | null = p;
          while (cursor) {
            result.push(cursor);
            cursor = parents.get(key(cursor)) ?? null;
          }
          return result;
        }
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const next = { x: p.x + dx, z: p.z + dz };
          if (parents.has(key(next)) || !safe(next, objects)) continue;
          if (boxes.some((b) => segmentIntersectsBox(p, next, b, 0.32))) continue;
          parents.set(key(next), p);
          queue.push(next);
        }
      }
      return null;
    };
    const accept = (prop: Prop) => {
      if (!fits(prop) || !prop.frontClearance) return false;
      const route = path(prop.frontClearance, [...props, prop]);
      if (!route) return false;
      props.push(prop);
      for (const p of route) lane.set(key(p), p);
      return true;
    };
    const anchor = makeProp(recipe.anchor, 'anchor', frame);
    if (!accept(anchor)) continue;
    const placeSocket = (spec: SceneObject, role: string, origin: Prop): boolean => {
      const mirror = randomStream(identity, 'scene-sockets', `${sceneId}:${role}`)() < 0.5 ? -1 : 1;
      for (let i = 0; i < offsets.length; i++) {
        const offset = offsets[i];
        const position = localPoint(origin, offset.x * mirror, offset.z);
        for (const q of inwardRotations(room, position)) {
          const prop = makeProp(spec, role, { ...position, rotation: (q * Math.PI) / 2 });
          if (!accept(prop)) continue;
          sockets.push({
            role,
            attempts: i + 1,
            socket: i,
            reason: i ? 'alternate-socket' : 'preferred',
          });
          return true;
        }
      }
      sockets.push({ role, attempts: offsets.length, socket: null, reason: 'omitted' });
      return false;
    };
    if (!placeSocket(recipe.work, 'work', anchor)) continue;
    const work = props[1];
    for (const spec of recipe.optional) {
      if (includeOptional)
        placeSocket(spec, spec.role, spec.relativeTo === 'anchor' ? anchor : work);
      else sockets.push({ role: spec.role, attempts: 0, socket: null, reason: 'disabled' });
    }
    return {
      status: 'placed',
      anchorAttempts,
      scene: {
        id: sceneId,
        recipeId: recipe.id,
        room: room.id,
        props,
        reserved: [...lane.values()],
        sockets,
        anchorAttempts,
      },
    };
  }
  return {
    status: 'rejected',
    anchorAttempts,
    reason: `Cannot place ${recipe.id} with connected work approaches`,
  };
}
