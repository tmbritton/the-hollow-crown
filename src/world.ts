import { generateRoyalPortrait } from './royalty.ts';
import { required } from './assert.ts';
import { hasApproach } from './worldTypes.ts';
import { generateKeepIdentity } from './generation/keep.ts';
import { applyKeepPresentation } from './generation/keepPresentation.ts';
import { planScene } from './generation/scenes.ts';
import { emberBlueprint } from './generation/lastEmber.ts';
import { Navigator } from './navigation.ts';
import type { KeepIdentity } from './generation/keep.ts';
import { randomFrom } from './generation/random.ts';
import { localPoint, footprint, inwardRotations } from './generation/placement.ts';
export { localPoint, footprint } from './generation/placement.ts';
export { randomFrom } from './generation/random.ts';
import {
  GenerationError,
  generationIdentity,
  MAX_GENERATION_ATTEMPTS,
} from './generation/identity.ts';
import type { GenerationTrace } from './generation/identity.ts';
import type {
  AltarEntity,
  ThroneEntity,
  Axis,
  Connection,
  Entity,
  Footprint,
  LayoutNode,
  Pair,
  Placement,
  PlacedType,
  Point,
  Prop,
  PropType,
  Room,
  RoomId,
  Tile,
  World,
} from './worldTypes.ts';

export const key = (x: number, z: number): string => `${x},${z}`;
const directions: Pair[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
// These recipes expose their usable/display face along local -Z.
export const INWARD_FACING_TYPES = new Set([
  'throne',
  'altar',
  'chest',
  'shrine',
  'rack',
  'furnace',
  'bread-oven',
  'tool-bench',
  'bread-rack',
  'meat-rack',
  'butcher-block',
  'bread-table',
  'lizard-stall',
  'tack-rack',
]);
export const ROOM_DEFINITIONS: readonly [RoomId, string, string, string][] = [
  ['entrance', 'The Ashen Vestibule', 'I · THE THRESHOLD', 'Even the stones remember.'],
  ['water', 'The Drowned Gallery', 'II · STILL WATERS', 'Something stirs beneath the green.'],
  ['stairs', 'The Pilgrim’s Descent', 'III · BELOW THE LIGHT', 'Every step is a small surrender.'],
  ['lava', 'The Cinder Forge', 'IV · A HEART OF FIRE', 'The old furnace has never gone cold.'],
  ['altar', 'The Violet Sanctum', 'V · THE SLEEPING GOD', 'An ember waits for a willing hand.'],
  ['throne', 'The Hollow Court', 'VI · A CROWN OF ASH', 'All kingdoms end here.'],
  ['crypt', 'The Nameless Crypt', 'VII · THE UNREMEMBERED', 'No names. Only the weight of years.'],
  ['armory', 'The Broken Watch', 'VIII · RUST & OATHS', 'Their watch outlived them.'],
  ['treasury', 'The Tithe Chamber', 'IX · EARTHLY THINGS', 'Not everything buried is dead.'],
  ['butchery', 'The Red Larder', 'X · THE BUTCHERY', 'The cleavers have not lost their edge.'],
  [
    'smithy',
    'The Oathbound Smithy',
    'XI · IRON & EMBERS',
    'Here, old promises are hammered into steel.',
  ],
  ['bakery', 'The Last Hearth', 'XII · BREAD & ASH', 'Even in the deep, someone tends the oven.'],
  ['stable', 'The Scale & Saddle', 'XIII · THE UNDERSTABLE', 'Patient eyes watch from the straw.'],
];

export function tileAt(world: Pick<World, 'tiles'>, x: number, z: number): Tile | undefined {
  return world.tiles.get(key(Math.round(x), Math.round(z)));
}
export function heightAt(world: Pick<World, 'tiles'>, x: number, z: number): number | null {
  const tile = tileAt(world, x, z);
  if (!tile) return null;
  if (tile.ramp) {
    const r = tile.ramp;
    const t = Math.max(
      0,
      Math.min(1, (((r.axis === 'x' ? x : z) - r.start) * r.sign) / r.distance),
    );
    return r.a + (r.b - r.a) * t;
  }
  return tile.h;
}

interface PlacementOptions {
  interactive?: boolean;
  clearance?: number;
  rotations?: number[];
  candidates?: Point[];
}

function buildAttempt(seed: string, attempt: number, keep: KeepIdentity): World | string[] {
  // Retain the established topology stream; layout-v3 changes furnishing placement below.
  const random = randomFrom(`${seed}:layout-v2:${attempt}`);
  const integer = (a: number, b: number) => a + Math.floor(random() * (b - a + 1));
  const pick = <T>(values: readonly T[]): T => values[integer(0, values.length - 1)];
  const shuffle = <T>(values: readonly T[]): T[] => {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = integer(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };

  // Grow an irregular connected cluster, not a fixed room-position template.
  const nodes: LayoutNode[] = [{ gx: 0, gz: 0, parent: -1, depth: 0 }],
    occupied = new Set(['0,0']);
  const edges: Pair[] = [];
  while (nodes.length < ROOM_DEFINITIONS.length) {
    const candidates: LayoutNode[] = [];
    nodes.forEach((node, index) => {
      for (const [dx, dz] of directions) {
        const gx = node.gx + dx,
          gz = node.gz + dz;
        if (Math.abs(gx) > 2 || Math.abs(gz) > 2 || occupied.has(key(gx, gz))) continue;
        candidates.push({ gx, gz, parent: index, depth: node.depth + 1 });
      }
    });
    const next = pick(candidates);
    edges.push([next.parent, nodes.length]);
    nodes.push(next);
    occupied.add(key(next.gx, next.gz));
  }
  const leaves = nodes
    .map((_, i) => i)
    .filter((i) => i > 0 && !nodes.some((node) => node.parent === i));
  const deepest = Math.max(...leaves.map((i) => nodes[i].depth));
  const throneIndex = pick(leaves.filter((i) => nodes[i].depth >= Math.max(2, deepest - 1)));
  const available = shuffle(nodes.map((_, i) => i).filter((i) => i !== 0 && i !== throneIndex));
  const roles = new Map<number, RoomId>([
    [0, 'entrance'],
    [throneIndex, 'throne'],
  ]);
  for (const [id] of ROOM_DEFINITIONS.filter(([id]) => !['entrance', 'throne'].includes(id)))
    roles.set(required(available.pop(), 'Missing room slot'), id);
  const extraEdges: Pair[] = [];
  for (let a = 0; a < nodes.length; a++)
    for (let b = a + 1; b < nodes.length; b++) {
      if (
        a === throneIndex ||
        b === throneIndex ||
        edges.some(([u, v]) => (u === a && v === b) || (u === b && v === a))
      )
        continue;
      if (Math.abs(nodes[a].gx - nodes[b].gx) + Math.abs(nodes[a].gz - nodes[b].gz) === 1)
        extraEdges.push([a, b]);
    }
  edges.push(...shuffle(extraEdges).slice(0, integer(1, 3)));
  const spacingX = integer(26, 30),
    spacingZ = integer(26, 30);
  const lowerFromDepth = Math.min(integer(2, 3), deepest);
  const rooms: Room[] = nodes.map((layout, index) => {
    const node = { ...layout, id: required(roles.get(index), 'Missing room role') };
    const [, name, kicker, description] = required(
      ROOM_DEFINITIONS.find((def) => def[0] === node.id),
      'Missing room definition',
    );
    const themed = ['butchery', 'smithy', 'bakery', 'stable'].includes(node.id);
    const monumental = ['entrance', 'altar', 'throne'].includes(node.id) || themed;
    const w = node.id === 'stable' ? 21 : monumental ? pick([17, 19]) : pick([13, 15, 17, 19]);
    const d = node.id === 'stable' ? 21 : monumental ? pick([17, 19]) : pick([13, 15, 17, 19]);
    return {
      ...node,
      x: node.gx * spacingX,
      z: node.gz * spacingZ,
      h: node.depth >= lowerFromDepth ? -2.4 : 0,
      w,
      d,
      name,
      kicker,
      description,
      shape: themed
        ? 'rectangle'
        : monumental
          ? pick(['rectangle', 'octagon'])
          : pick(['rectangle', 'octagon', 'cross']),
      ports: [],
    };
  });
  // The sealed gate has a flat landing; elevation changes happen elsewhere.
  rooms[throneIndex].h = rooms[nodes[throneIndex].parent].h;
  if (rooms.every((r) => r.h === 0))
    required(
      rooms.find((r) => r.id === 'lava'),
      'Missing lava room',
    ).h = -2.4;
  // Every definition is assigned once by the role map above.
  const roomById = Object.fromEntries(rooms.map((r) => [r.id, r])) as Record<RoomId, Room>;
  const bounds = {
    minX: Math.min(...rooms.map((r) => r.x - r.w / 2)) - 1,
    maxX: Math.max(...rooms.map((r) => r.x + r.w / 2)) + 1,
    minZ: Math.min(...rooms.map((r) => r.z - r.d / 2)) - 1,
    maxZ: Math.max(...rooms.map((r) => r.z + r.d / 2)) + 1,
  };
  const world: World = {
    seed,
    keep,
    attempt,
    rooms,
    roomById,
    bounds,
    tiles: new Map(),
    entities: [],
    connections: [],
    props: [],
    scenes: [],
    blockers: [],
    reserved: new Set(),
    spawn: { x: 0, z: 0, h: 0 },
  };
  const { tiles, entities, connections, props, blockers, reserved } = world;
  function put(x: number, z: number, data: Partial<Tile>) {
    tiles.set(key(x, z), { x, z, h: 0, surface: 'stone', ...data });
  }
  function reserve(x: number, z: number, radius = 1) {
    for (let dx = -radius; dx <= radius; dx++)
      for (let dz = -radius; dz <= radius; dz++)
        reserved.add(key(Math.round(x) + dx, Math.round(z) + dz));
  }
  for (const r of rooms) {
    const hw = (r.w - 1) / 2,
      hd = (r.d - 1) / 2;
    for (let dx = -hw; dx <= hw; dx++)
      for (let dz = -hd; dz <= hd; dz++) {
        if (r.shape === 'octagon' && Math.abs(dx) + Math.abs(dz) > hw + hd - 3) continue;
        if (r.shape === 'cross' && Math.abs(dx) > hw - 4 && Math.abs(dz) > hd - 4) continue;
        put(r.x + dx, r.z + dz, { h: r.h, room: r.id });
        if (Math.abs(dx) <= 1 || Math.abs(dz) <= 1) reserved.add(key(r.x + dx, r.z + dz));
      }
  }
  edges.forEach(([ai, bi], index) => {
    const a = rooms[ai],
      b = rooms[bi],
      axis: Axis = a.x === b.x ? 'z' : 'x',
      cross: Axis = axis === 'x' ? 'z' : 'x';
    const point = (along: number, across: number): Point =>
      axis === 'x' ? { x: along, z: across } : { x: across, z: along };
    const sign = Math.sign(b[axis] - a[axis]),
      offset = integer(-2, 2),
      crossValue = a[cross] + offset;
    const start = a[axis] + (sign * ((axis === 'x' ? a.w : a.d) - 1)) / 2;
    const end = b[axis] - (sign * ((axis === 'x' ? b.w : b.d) - 1)) / 2;
    const distance = Math.abs(end - start);
    const ramp = a.h !== b.h ? { axis, start, distance, sign, a: a.h, b: b.h } : null;
    for (let s = 1; s < distance; s++)
      for (let lane = -1; lane <= 1; lane++) {
        const pos = point(start + s * sign, crossValue + lane);
        put(pos.x, pos.z, {
          h: a.h + ((b.h - a.h) * s) / distance,
          surface: ramp ? 'stair' : 'stone',
          ramp,
        });
      }
    // Extend support sampling onto the landings, avoiding a half-tile jump.
    if (ramp)
      for (const edge of [start, end])
        for (let lane = -1; lane <= 1; lane++) {
          const pos = point(edge, crossValue + lane),
            tile = tileAt(world, pos.x, pos.z);
          if (tile) tile.ramp = ramp;
        }
    for (const r of [a, b]) {
      const edge = r === a ? start : end;
      for (let value = Math.min(r[axis], edge); value <= Math.max(r[axis], edge); value++) {
        const pos = point(value, crossValue);
        reserve(pos.x, pos.z);
      }
      r.ports.push({ axis, cross: crossValue, direction: r === a ? sign : -sign });
    }
    const pos = point(Math.round((start + end) / 2), crossValue);
    const points = [
      { x: a.x, z: a.z },
      { ...a, [cross]: crossValue },
      { ...b, [cross]: crossValue },
      { x: b.x, z: b.z },
    ].map(({ x, z }) => ({ x, z }));
    const c: Connection = {
      id: `passage-${index}`,
      a: a.id,
      b: b.id,
      axis,
      cross: crossValue,
      start,
      end,
      sign,
      distance,
      ramp,
      width: 3,
      ...pos,
      points,
    };
    const locked = a.id === 'throne' || b.id === 'throne';
    if (locked || (!ramp && (index === 0 || random() < 0.72))) {
      const e: Entity = {
        id: `door-${index}`,
        type: 'door',
        ...pos,
        h: required(heightAt(world, pos.x, pos.z), 'Door needs floor support'),
        axis,
        locked,
        requiresAltar: locked,
        open: false,
      };
      entities.push(e);
      c.door = e.id;
    }
    connections.push(c);
  });

  for (const id of ['water', 'lava'] as const) {
    const r = roomById[id],
      hw = Math.min(5, (r.w - 5) / 2),
      hd = Math.min(5, (r.d - 5) / 2);
    r.pool = {
      x: r.x + integer(-1, 1),
      z: r.z + integer(-1, 1),
      hw: integer(3, hw),
      hd: integer(3, hd),
      bridgeAxis: pick(['x', 'z']),
      cutCorners: random() > 0.5,
    };
    const pool = r.pool;
    for (const tile of tiles.values()) {
      if (tile.room !== id) continue;
      const dx = Math.abs(tile.x - pool.x),
        dz = Math.abs(tile.z - pool.z);
      if (dx > pool.hw || dz > pool.hd || (pool.cutCorners && dx + dz > pool.hw + pool.hd - 1))
        continue;
      const bridge = reserved.has(key(tile.x, tile.z)) || (pool.bridgeAxis === 'x' ? dz : dx) <= 1;
      if (bridge) tile.surface = 'bridge';
      else {
        tile.surface = id;
        tile.h -= id === 'water' ? 0.18 : 0.28;
      }
    }
  }

  // Place gameplay objects first. Every collider, clearance, and approach is data.
  const claimed = new Set();
  function canFit(r: Room, object: Footprint, margin = 0.5) {
    const b = footprint(object);
    for (let x = Math.floor(b.x - b.w / 2 - margin); x <= Math.ceil(b.x + b.w / 2 + margin); x++) {
      for (
        let z = Math.floor(b.z - b.d / 2 - margin);
        z <= Math.ceil(b.z + b.d / 2 + margin);
        z++
      ) {
        if (Math.abs(x - b.x) > b.w / 2 + margin || Math.abs(z - b.z) > b.d / 2 + margin) continue;
        const tile = tiles.get(key(x, z));
        if (
          !tile ||
          tile.room !== r.id ||
          tile.surface !== 'stone' ||
          reserved.has(key(x, z)) ||
          claimed.has(key(x, z))
        )
          return false;
      }
    }
    return true;
  }
  function occupy(object: Placement) {
    const b = footprint(object);
    blockers.push({ ...b, id: object.id });
    for (let x = Math.floor(b.x - b.w / 2 - 0.65); x <= Math.ceil(b.x + b.w / 2 + 0.65); x++) {
      for (let z = Math.floor(b.z - b.d / 2 - 0.65); z <= Math.ceil(b.z + b.d / 2 + 0.65); z++) {
        if (Math.abs(x - b.x) <= b.w / 2 + 0.65 && Math.abs(z - b.z) <= b.d / 2 + 0.65)
          claimed.add(key(x, z));
        if (Math.abs(x - b.x) < b.w / 2 + 0.32 && Math.abs(z - b.z) < b.d / 2 + 0.32) {
          const tile = tiles.get(key(x, z));
          if (tile) tile.blocked = true;
        }
      }
    }
  }
  function place<T extends PlacedType>(
    r: Room,
    type: T,
    w: number,
    d: number,
    {
      interactive = false,
      clearance = 0.5,
      rotations = [0, 1, 2, 3],
      candidates,
    }: PlacementOptions = {},
  ): Placement<T> | null {
    const positions =
      candidates || [...tiles.values()].filter((t) => t.room === r.id && t.surface === 'stone');
    for (const pos of shuffle(positions)) {
      const facing = INWARD_FACING_TYPES.has(type) ? inwardRotations(r, pos) : rotations;
      // Keep seeded tie-breaking at room diagonals. If an inward orientation
      // doesn't fit, try another position rather than turning toward a wall.
      for (const quarter of shuffle(rotations.filter((q) => facing.includes(q)))) {
        const object: Placement<T> = {
          id: `${type}-${r.id}-${props.length}`,
          type,
          room: r.id,
          x: pos.x,
          z: pos.z,
          h: r.h,
          w,
          d,
          rotation: (quarter * Math.PI) / 2,
          variant: integer(0, 3),
        };
        if (!canFit(r, object, clearance)) continue;
        if (interactive || INWARD_FACING_TYPES.has(type)) {
          const distance = interactive ? (type === 'chest' ? 2 : 3) : Math.ceil(d / 2 + 0.65);
          const front = localPoint(object, 0, -distance);
          const t = tileAt(world, front.x, front.z);
          if (
            !t ||
            t.room !== r.id ||
            t.surface !== 'stone' ||
            t.blocked ||
            claimed.has(key(t.x, t.z))
          )
            continue;
          if (interactive) object.approach = front;
          else object.frontClearance = front;
          reserve(front.x, front.z, interactive ? 1 : 0);
        }
        occupy(object);
        return object;
      }
    }
    return null;
  }
  const altarPlacement = place(roomById.altar, 'altar', 2.7, 2, {
    interactive: true,
    clearance: 0.8,
  });
  const thronePlacement = place(roomById.throne, 'throne', 2.7, 2.2, {
    interactive: true,
    clearance: 1.5,
  });
  if (!altarPlacement || !thronePlacement)
    return [
      ...(!altarPlacement ? ['Cannot place altar with reachable approach'] : []),
      ...(!thronePlacement ? ['Cannot place throne with reachable approach'] : []),
    ];
  const altar: AltarEntity = {
    ...altarPlacement,
    id: 'altar',
    active: false,
    approach: required(altarPlacement.approach, 'Missing altar approach'),
  };
  const throne: ThroneEntity = {
    ...thronePlacement,
    id: 'throne',
    approach: required(thronePlacement.approach, 'Missing throne approach'),
  };
  entities.push(altar, throne);
  // Dais is traversable; orient its low steps toward the throne's approach.
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -3; dz <= 1; dz++) {
      const p = localPoint(throne, dx, dz),
        tile = tileAt(world, p.x, p.z);
      if (tile?.room === 'throne') {
        tile.h += dz === -3 ? 0.15 : dz === -2 ? 0.3 : 0.45;
        tile.surface = 'dais';
      }
    }
  throne.h += 0.45;
  const chestRooms = shuffle(rooms.filter((r) => !['entrance', 'throne'].includes(r.id)));
  for (const r of chestRooms) {
    if (entities.filter((e) => e.type === 'chest').length === 3) break;
    const chest = place(r, 'chest', 1.3, 0.9, { interactive: true });
    if (chest)
      entities.push({
        ...chest,
        open: false,
        approach: required(chest.approach, 'Missing chest approach'),
      });
  }
  if (entities.filter((e) => e.type === 'chest').length !== 3)
    return ['Cannot place three reliquaries with reachable approaches'];

  for (const r of rooms) {
    const add = (type: PropType, w: number, d: number, options?: PlacementOptions): Prop | null => {
      const p = place(r, type, w, d, options);
      if (p) props.push(p);
      return p;
    };
    if (r.id === 'butchery') {
      if (!add('butcher-block', 2.7, 1.9) || !add('meat-rack', 3, 1.6))
        return ['Cannot place required butchery furnishings'];
      add('butcher-block', 2.7, 1.9);
      add('barrel', 1.3, 1.3);
    }
    if (r.id === 'smithy' || r.id === 'bakery') {
      const result = planScene(generationIdentity(seed), r, world);
      if (result.status === 'rejected')
        return [`${result.reason} (${result.anchorAttempts} anchors)`];
      world.scenes.push(result.scene);
      for (const p of result.scene.reserved) reserve(p.x, p.z, 0);
      for (const prop of result.scene.props) {
        occupy(prop);
        props.push(prop);
      }
    }
    if (r.id === 'stable') {
      if (!add('lizard-stall', 4.4, 5.6) || !add('lizard-stall', 4.4, 5.6))
        return ['Cannot place two lizard stalls'];
      add('feed-trough', 2.4, 1.2);
      add('tack-rack', 2, 1.4);
      add('hay-bales', 1.8, 1.5);
    }
    if (r.id === 'entrance') add('shrine', 5.7, 1.5, { clearance: 0.65 });
    if (r.id === 'crypt') for (let i = 0; i < integer(2, 4); i++) add('sarcophagus', 1.5, 2.35);
    if (r.id === 'lava') for (let i = 0; i < 2; i++) add('anvil', 1.6, 1.25);
    if (r.id === 'armory') for (let i = 0; i < integer(1, 3); i++) add('rack', 1.3, 0.5);
    for (let i = 0, n = integer(2, 5); i < n; i++) {
      const p = add('pillar', 1.45, 1.45);
      if (p) {
        p.height = pick([1.6, 2.6, 3.2, 3.6]);
        p.torch = i < 2;
      }
    }
    for (let i = 0, n = integer(1, 3); i < n; i++) add(pick(['crates', 'barrel']), 1.3, 1.3);
  }
  // Hang paintings on real, straight wall sections with a clear viewing approach.
  const portraitRooms = [
    roomById.entrance,
    roomById.throne,
    roomById.throne,
    ...shuffle(rooms.filter((r) => !['entrance', 'throne'].includes(r.id))).slice(0, 5),
  ];
  for (const r of portraitRooms) {
    const candidates = shuffle(
      [...tiles.values()].filter((t) => t.room === r.id && !t.blocked && t.surface === 'stone'),
    );
    let placed = false;
    for (const tile of candidates) {
      if (placed) break;
      for (const [dx, dz] of shuffle(directions)) {
        if (tileAt(world, tile.x + dx, tile.z + dz)) continue;
        if (
          ![-1, 1].every(
            (side) =>
              tileAt(world, tile.x + dz * side, tile.z + dx * side)?.room === r.id &&
              !tileAt(world, tile.x + dx + dz * side, tile.z + dz + dx * side),
          )
        )
          continue;
        const approach = { x: tile.x - dx * 2, z: tile.z - dz * 2 };
        // Existing shrine/forge work faces are real E interactions too. Keep the clue's
        // viewing approach outside their activation radius, before selecting a portrait.
        if (
          props.some(
            (prop) =>
              ((prop.type === 'shrine' && prop.room === 'entrance') ||
                (prop.type === 'anvil' && prop.room === 'smithy')) &&
              prop.frontClearance &&
              Math.hypot(prop.frontClearance.x - approach.x, prop.frontClearance.z - approach.z) <
                1.1,
          )
        )
          continue;
        if (
          ![0, 1, 2].every((s) => {
            const t = tileAt(world, tile.x - dx * s, tile.z - dz * s);
            return t?.room === r.id && !t.blocked && t.surface === 'stone';
          })
        )
          continue;
        const x = tile.x + dx * 0.43,
          z = tile.z + dz * 0.43;
        if (entities.some((e) => e.type === 'portrait' && Math.hypot(e.x - x, e.z - z) < 3))
          continue;
        // A decorative inspection target must not steal E at a landmark's
        // reserved interaction spot, or have its own spot claimed by one.
        if (
          entities.some(
            (e) =>
              e.approach &&
              (Math.hypot(x - e.approach.x, z - e.approach.z) < 2.6 ||
                Math.hypot(e.x - approach.x, e.z - approach.z) <
                  (['altar', 'throne'].includes(e.type) ? 3.1 : 2.6)),
          )
        )
          continue;
        const rotation = dx === 1 ? Math.PI / 2 : dx === -1 ? -Math.PI / 2 : dz === 1 ? 0 : Math.PI;
        entities.push({
          id: `portrait-${entities.length}`,
          type: 'portrait',
          room: r.id,
          x,
          z,
          h: r.h,
          rotation,
          wallDirection: [dx, dz],
          approach,
          royal: generateRoyalPortrait(random),
        });
        reserved.add(key(approach.x, approach.z));
        placed = true;
        break;
      }
    }
  }
  return world;
}

export function generateDungeon(seed = 'MOURNING-731'): World {
  return generateDungeonWithReport(seed).world;
}

/** Initial generation only: plain data, no timing samples or runtime actor/door state. */
export function generateDungeonWithReport(
  seed = 'MOURNING-731',
  { maxAttempts = MAX_GENERATION_ATTEMPTS }: { maxAttempts?: number } = {},
): { world: World; report: GenerationTrace } {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_GENERATION_ATTEMPTS)
    throw new RangeError(`maxAttempts must be an integer from 1 to ${MAX_GENERATION_ATTEMPTS}`);
  const report: GenerationTrace = {
    identity: generationIdentity(seed),
    acceptedAttempt: null,
    attempts: [],
  };
  const keep = generateKeepIdentity(report.identity);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const world = buildAttempt(seed, attempt, keep);
    if (Array.isArray(world)) {
      report.attempts.push({ attempt, stage: 'placement', reasons: world });
      continue;
    }
    const reasons = validateDungeon(world);
    report.attempts.push({ attempt, stage: reasons.length ? 'validation' : 'accepted', reasons });
    if (!reasons.length) {
      report.acceptedAttempt = attempt;
      applyKeepPresentation(world);
      return { world, report };
    }
  }
  throw new GenerationError(report);
}

export function reachableTiles(world: World, unlocked = false): Set<string> {
  return new Set(reachableTileDistances(world, unlocked).keys());
}

/** Four-neighbor tile steps, with ordinary doors operable and the altar gate explicit. */
export function reachableTileDistances(
  world: World,
  unlocked = false,
  origin: Point = world.spawn,
): Map<string, number> {
  const gate = world.entities.find((e) => e.type === 'door' && e.requiresAltar);
  const start = key(Math.round(origin.x), Math.round(origin.z)),
    first = world.tiles.get(start);
  if (!first || first.blocked || first.surface === 'lava') return new Map();
  const seen = new Map([[start, 0]]),
    queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const tile = required(world.tiles.get(queue[i]), 'Navigation tile missing');
    for (const [dx, dz] of directions) {
      const k = key(tile.x + dx, tile.z + dz),
        next = world.tiles.get(k);
      if (
        !next ||
        next.blocked ||
        next.surface === 'lava' ||
        seen.has(k) ||
        Math.abs(next.h - tile.h) > 0.65
      )
        continue;
      if (
        !unlocked &&
        gate?.type === 'door' &&
        (gate.axis === 'x'
          ? next.x === gate.x && Math.abs(next.z - gate.z) <= 1
          : next.z === gate.z && Math.abs(next.x - gate.x) <= 1)
      )
        continue;
      seen.set(k, required(seen.get(queue[i]), 'Missing route distance') + 1);
      queue.push(k);
    }
  }
  return seen;
}

export function validateDungeon(world: World): string[] {
  const errors: string[] = [];
  for (const [id] of ROOM_DEFINITIONS) if (!world.roomById[id]) errors.push(`Missing ${id}`);
  const before = reachableTiles(world, false),
    after = reachableTiles(world, true);
  try {
    const sites = emberBlueprint(world);
    const navigation = new Navigator(world);
    for (const site of Object.values(sites))
      if (
        !before.has(key(Math.round(site.approach.x), Math.round(site.approach.z))) ||
        !world.reserved.has(key(Math.round(site.approach.x), Math.round(site.approach.z))) ||
        !navigation.goTo(world.spawn, site.approach, { openDoors: true })
      )
        errors.push(`Last Ember approach inaccessible: ${site.id}`);
    for (const site of [sites.shrine, sites.focus])
      if (
        world.entities.some(
          (entity) =>
            entity.approach &&
            Math.hypot(entity.approach.x - site.approach.x, entity.approach.z - site.approach.z) <
              1.1,
        )
      )
        errors.push(`Last Ember interaction overlaps another approach: ${site.id}`);
  } catch {
    errors.push('Missing Last Ember shrine, focus or clue');
  }
  const altar = world.entities.find((e) => e.type === 'altar'),
    throne = world.entities.find((e) => e.type === 'throne');
  const approachKey = (e: Entity | undefined): string =>
    e?.approach ? key(e.approach.x, e.approach.z) : '';
  if (!before.has(approachKey(altar))) errors.push('Altar not reachable before gate');
  if (before.has(approachKey(throne))) errors.push('Throne gate can be bypassed');
  if (!after.has(approachKey(throne))) errors.push('Throne not reachable after altar');
  for (const r of world.rooms)
    if (!after.has(key(r.x, r.z))) errors.push(`Room ${r.id} inaccessible`);
  for (const e of world.entities.filter((e) => e.type === 'chest'))
    if (!before.has(approachKey(e))) errors.push(`Chest ${e.id} inaccessible`);
  const portraits = world.entities.filter((e) => e.type === 'portrait');
  if (portraits.length < 4) errors.push('Too few royal portraits');
  for (const e of portraits)
    if (!after.has(approachKey(e))) errors.push(`Portrait ${e.id} inaccessible`);
  for (const surface of ['water', 'lava', 'stair'])
    if (![...world.tiles.values()].some((t) => t.surface === surface && !t.blocked))
      errors.push(`Missing ${surface}`);
  for (const [room, required] of Object.entries({
    butchery: ['butcher-block', 'meat-rack'],
    smithy: ['furnace', 'anvil'],
    bakery: ['bread-oven', 'bread-table'],
    stable: ['lizard-stall'],
  })) {
    for (const type of required)
      if (!world.props.some((p) => p.room === room && p.type === type))
        errors.push(`Missing ${room} feature: ${type}`);
  }
  for (const e of world.entities.filter(hasApproach)) {
    if (Math.hypot(e.x - e.approach.x, e.z - e.approach.z) > (e.type === 'chest' ? 2.6 : 3.1))
      errors.push(`Interaction out of range: ${e.id}`);
  }
  for (const object of [...world.props, ...world.entities]) {
    if (!INWARD_FACING_TYPES.has(object.type)) continue;
    if (object.type === 'door' || object.type === 'portrait') continue;
    const r = world.roomById[object.room],
      front = localPoint(object, 0, -1);
    const dx = r.x - object.x,
      dz = r.z - object.z;
    const alignment = (front.x - object.x) * dx + (front.z - object.z) * dz;
    if (alignment < Math.max(Math.abs(dx), Math.abs(dz)) - 1e-9)
      errors.push(`Furniture faces away from room center: ${object.id}`);
    if (object.frontClearance && !after.has(key(object.frontClearance.x, object.frontClearance.z)))
      errors.push(`Furniture front inaccessible: ${object.id}`);
  }
  for (const room of ['smithy', 'bakery']) {
    const scene = world.scenes.find((s) => s.room === room);
    if (!scene) errors.push(`Missing ${room} scene recipe`);
    else
      for (const p of scene.reserved) {
        if (!world.reserved.has(key(p.x, p.z)) || !before.has(key(p.x, p.z))) {
          errors.push(`Scene work path inaccessible: ${scene.id}`);
          break;
        }
      }
  }
  return errors;
}
