import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import {
  WALL_OFFSET,
  WALL_THICKNESS,
  WALL_LENGTH,
  WALL_BASE,
  WALL_CAP,
  DOOR_HEIGHT,
} from './wallGeometry.ts';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { Batcher, part, tagRoomBand, thinBoxes } from './geometry.ts';
import { roomRole, roomRoles } from './roomPalette.ts';
import { stairLandingTops } from './stairLandings.ts';
import { key, tileAt, heightAt } from './worldSpatial.ts';
import { randomFrom } from './generation/random.ts';
import { localPoint } from './generation/placement.ts';
import { buildThemedProp } from './themedProps.ts';
import { buildPortraits } from './portraits.ts';
import { required } from './assert.ts';
import type { Scene } from '@babylonjs/core/scene';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import type { Materials, MaterialName } from './materials.ts';
import type { Frame, PlayableContent, Tile, Triple } from './worldTypes.ts';
import type { BoxInstance, RoomBand } from './geometry.ts';
import type { Creature, FloatingObject, LightSource, Obstacle, Wall } from './renderTypes.ts';

export type DungeonScene = ReturnType<typeof buildDungeon>;
interface WallGroup {
  batch: Batcher<MaterialName>;
  dx: number;
  dz: number;
  base: number;
  x: number;
  z: number;
  count: number;
  sx: number;
  sz: number;
}

export function buildDungeon(
  scene: Scene,
  content: PlayableContent,
  materials: Materials,
  shadow: ShadowGenerator,
  glow: GlowLayer,
  withRoomBands: boolean,
) {
  const { world } = content;
  const random = randomFrom(`${world.seed}:decoration`);
  const batch = new Batcher(scene, materials, shadow, withRoomBands);
  const walls: Wall[] = [];
  const colliders: Mesh[] = [];
  const flames: Mesh[] = [];
  const lights: LightSource[] = [];
  const animated: FloatingObject[] = [];
  const creatures: Creature[] = [];
  const obstacles: Obstacle[] = [];
  let frame: Frame | null = null;
  const band = (tile?: Pick<Tile, 'room' | 'surface'>, bias = 0, overlay = false): RoomBand => [
    roomRoles.indexOf(roomRole(tile)),
    bias,
    Number(overlay),
    0,
  ];
  const landingTops = withRoomBands ? stairLandingTops(world) : undefined;
  const landingBand: RoomBand = [roomRoles.indexOf('stair'), 0, 0, 1];
  function tagPart(mesh: Mesh, x: number, z: number) {
    if (withRoomBands) tagRoomBand(mesh, band(tileAt(world, x, z)));
    return mesh;
  }
  function transform(x: number, z: number, w = 0, d = 0) {
    if (!frame) return { x, z, w, d };
    const p = localPoint(frame, x - frame.x, z - frame.z);
    const swap = Math.abs(Math.round(Math.sin(frame.rotation || 0))) === 1;
    return { ...p, w: swap ? d : w, d: swap ? w : d };
  }
  function collision(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    name = 'obstacle',
  ): Mesh {
    ({ x, z, w, d } = transform(x, z, w, d));
    const mesh = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    mesh.position.set(x, y, z);
    mesh.isVisible = false;
    mesh.isPickable = false;
    mesh.checkCollisions = true;
    mesh.computeWorldMatrix(true);
    colliders.push(mesh);
    obstacles.push({ x, z, w, d, mesh });
    return mesh;
  }
  function box(
    mat: MaterialName,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    t = 1,
  ) {
    const p = transform(x, z, w, d);
    const tile = tileAt(world, frame?.x ?? p.x, frame?.z ?? p.z);
    batch.box(mat, p.x, y, p.z, p.w, h, p.d, t, 63, '', band(tile));
  }
  function torch(x: number, y: number, z: number, violet = false) {
    box('dark', x, y - 0.32, z, 0.48, 0.18, 0.48);
    box('iron', x, y - 0.05, z, 0.38, 0.35, 0.38);
    box('gold', x, y + 0.1, z, 0.49, 0.08, 0.49);
    const flame = MeshBuilder.CreatePlane(
      'shader flame',
      { width: 0.65, height: 1.05, sideOrientation: Mesh.DOUBLESIDE },
      scene,
    );
    const position = transform(x, z);
    flame.position.set(position.x, y + 0.6, position.z);
    flame.billboardMode = Mesh.BILLBOARDMODE_Y;
    flame.material = violet ? materials.violetFlame : materials.flame;
    flame.isPickable = false;
    glow.referenceMeshToUseItsOwnMaterial(flame);
    flames.push(flame);
    lights.push({
      position: new Vector3(position.x, y + 0.8, position.z),
      color: violet ? new Color3(0.56, 0.26, 0.9) : new Color3(1, 0.48, 0.16),
      phase: random() * 10,
    });
  }
  function pillar(x: number, h: number, z: number, height = 3.2) {
    box('dark', x, h + 0.14, z, 1.45, 0.28, 1.45);
    box('trim', x, h + 0.37, z, 1.2, 0.18, 1.2);
    for (let i = 0; i < Math.floor((height - 0.5) / 0.5); i++)
      box(
        i % 3 === 1 ? 'trim' : 'stone',
        x,
        h + 0.7 + i * 0.5,
        z,
        0.85,
        0.47,
        0.85,
        0.85 + random() * 0.2,
      );
    box('trim', x, h + height - 0.12, z, 1.22, 0.25, 1.22);
    box('dark', x, h + height + 0.06, z, 1.38, 0.16, 1.38);
  }
  function skull(x: number, y: number, z: number, s = 0.3) {
    box('bone', x, y + s * 0.45, z, s, s * 0.9, s * 0.8);
    box('bone', x, y + s * 0.04, z - s * 0.12, s * 0.65, s * 0.2, s * 0.75);
    for (const dx of [-0.22, 0.22])
      box('dark', x + dx * s, y + s * 0.48, z - s * 0.405, s * 0.22, s * 0.22, 0.015);
    box('dark', x, y + s * 0.24, z - s * 0.41, s * 0.1, s * 0.16, 0.016);
  }
  function candle(x: number, y: number, z: number) {
    const h = 0.2 + random() * 0.25;
    box('bone', x, y + h / 2, z, 0.1, h, 0.1);
    box('ember', x, y + h + 0.05, z, 0.06, 0.1, 0.06);
  }

  // Tile faces are exposed only at the top and at changes in floor elevation.
  for (const t of world.tiles.values()) {
    const depth = 0.75,
      h = t.h;
    let mask = 1;
    [
      [1, 0, 4],
      [-1, 0, 8],
      [0, 1, 16],
      [0, -1, 32],
    ].forEach(([dx, dz, bit]) => {
      const other = world.tiles.get(key(t.x + dx, t.z + dz));
      if (!other || other.h < h - 0.04) mask |= bit;
    });
    const mat =
      t.surface === 'bridge'
        ? t.room === 'water'
          ? 'wood'
          : 'dark'
        : t.surface === 'dais'
          ? 'trim'
          : 'floor';
    batch.box(
      mat,
      t.x,
      h - depth / 2,
      t.z,
      1,
      depth,
      1,
      0.88 + random() * 0.18,
      mask,
      '',
      band(t, t.surface === 'bridge' || t.surface === 'dais' ? 0.09 : 0),
      landingTops?.has(key(t.x, t.z)) ? landingBand : undefined,
    );
    if (t.surface === 'water' || t.surface === 'lava') {
      batch.box(t.surface, t.x, h + 0.09, t.z, 1, 0.04, 1, 1, 1, `liquid-${t.surface}`);
    }
    if (t.surface === 'stair')
      batch.box('trim', t.x, h + 0.015, t.z, 0.98, 0.03, 0.98, 0.8, 63, '', band(t, 0, true));
  }
  if (content.kind === 'dungeon') {
    const pool = required(content.world.roomById.water.pool, 'Water room needs a pool');
    materials.water.setVector3('center', new Vector3(pool.x, 0, pool.z));
    materials.water.setVector3('bounds', new Vector3(pool.hw + 0.5, pool.hd + 0.5, 0));
  }

  // Perimeter masonry, with separately transformable upper sections for camera cutaways.
  const wallGroups = new Map<string, WallGroup>();
  // Batcher already partitions collision-only masonry by 10-unit world cells.
  // Preserve its group and face order for Babylon's equal-distance contact ties.
  const wallColliderBatch = new Batcher(
    scene,
    { collider: materials.dark },
    { addShadowCaster: () => shadow },
  );
  for (const t of world.tiles.values()) {
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      if (world.tiles.has(key(t.x + dx, t.z + dz))) continue;
      const x = t.x + dx * WALL_OFFSET,
        z = t.z + dz * WALL_OFFSET;
      const w = dx ? WALL_THICKNESS : WALL_LENGTH,
        d = dz ? WALL_THICKNESS : WALL_LENGTH;
      for (const section of WALL_BASE)
        batch.box(
          section.material,
          x,
          t.h + section.center,
          z,
          w + section.overhang,
          section.height,
          d + section.overhang,
          section.shade,
          63,
          '',
          band(t),
        );
      wallColliderBatch.box('collider', x, t.h + 1.7, z, w, 3.4, d);
      const groupId = `${t.room || 'corridor'}:${dx},${dz}:${Math.floor(t.x / 18)},${Math.floor(t.z / 18)}:${t.h.toFixed(2)}`;
      if (!wallGroups.has(groupId))
        wallGroups.set(groupId, {
          batch: new Batcher(scene, materials, shadow, withRoomBands),
          dx,
          dz,
          base: t.h + 0.72,
          x,
          z,
          count: 0,
          sx: 0,
          sz: 0,
        });
      const g = required(wallGroups.get(groupId), 'Missing wall batch');
      g.count++;
      g.sx += x;
      g.sz += z;
      const height = t.room ? 2.3 : 1.5;
      const courses = Math.floor(height / 0.46 + 1e-6);
      for (let course = 0; course < courses; course++) {
        g.batch.box(
          'stone',
          x,
          t.h + 0.96 + course * 0.46,
          z,
          w,
          0.435,
          d,
          0.78 + random() * 0.3,
          63,
          groupId,
          band(t),
        );
      }
      g.batch.box(
        'trim',
        x,
        t.h + 0.74 + courses * 0.46,
        z,
        w + WALL_CAP.overhang,
        WALL_CAP.height,
        d + WALL_CAP.overhang,
        0.76,
        63,
        groupId,
        band(t),
      );
    }
  }
  for (const g of wallGroups.values()) {
    const meshes = g.batch.finish();
    for (const mesh of meshes) {
      mesh.unfreezeWorldMatrix();
      mesh.setPivotPoint(new Vector3(0, g.base, 0));
    }
    walls.push({ meshes, dx: g.dx, dz: g.dz, x: g.sx / g.count, z: g.sz / g.count, scale: 1 });
  }
  for (const mesh of wallColliderBatch.finish()) {
    mesh.isVisible = false;
    mesh.checkCollisions = true;
    colliders.push(mesh);
  }

  const rubble: BoxInstance[] = [];
  for (const r of content.kind === 'dungeon' ? world.rooms : []) {
    const roomTiles = [...world.tiles.values()].filter((t) => t.room === r.id);
    const clear = roomTiles.filter(
      (t) => t.surface === 'stone' && !t.blocked && !world.reserved.has(key(t.x, t.z)),
    );
    for (const t of roomTiles) {
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (!tileAt(world, t.x + dx, t.z + dz))
          batch.box(
            'trim',
            t.x + dx * 0.34,
            t.h + 0.015,
            t.z + dz * 0.34,
            dx ? 0.07 : 0.4,
            0.025,
            dz ? 0.07 : 0.4,
            0.65,
            63,
            '',
            band(t, 0, true),
          );
        if (
          t.surface === 'bridge' &&
          t.room === 'water' &&
          (t.x + t.z) % 2 === 0 &&
          tileAt(world, t.x + dx, t.z + dz)?.surface === 'water'
        ) {
          box('dark', t.x + dx * 0.45, t.h + 0.3, t.z + dz * 0.45, 0.18, 0.6, 0.18);
          box('trim', t.x + dx * 0.45, t.h + 0.63, t.z + dz * 0.45, 0.27, 0.07, 0.27);
        }
      }
      if (r.id === 'entrance') {
        const across = r.ports[0]?.axis === 'x' ? t.z - r.z : t.x - r.x;
        const along = r.ports[0]?.axis === 'x' ? t.x - r.x : t.z - r.z;
        if (Math.abs(across) <= 1 && Math.abs(along) <= 4)
          batch.box(
            'cloth',
            t.x,
            t.h + 0.018,
            t.z,
            0.98,
            0.025,
            0.98,
            0.7,
            63,
            '',
            band(t, 0, true),
          );
      }
    }
    for (let i = 0; i < 18 && clear.length; i++) {
      const t = clear[Math.floor(random() * clear.length)],
        s = 0.12 + random() * 0.3;
      rubble.push({
        position: [t.x + (random() - 0.5) * 0.4, t.h + s * 0.3, t.z + (random() - 0.5) * 0.4],
        size: [s, s * 0.6, s * (0.7 + random())],
        rotation: random() * 3,
        tint: 0.7 + random() * 0.4,
      });
      if (i < 3 && !['water', 'lava'].includes(r.id)) skull(t.x, t.h, t.z, 0.24 + random() * 0.12);
    }
  }
  for (const prop of world.props) {
    frame = prop;
    const { x, z, h } = prop;
    let height = 1.5;
    if (prop.type === 'pillar') {
      height = required(prop.height, 'Pillar needs a height');
      if (content.kind === 'practice') {
        box('stone', x, h + (height - 0.24) / 2, z, prop.w, height - 0.24, prop.d);
        box('trim', x, h + height - 0.12, z, prop.w, 0.24, prop.d);
      } else pillar(x, h, z, height);
      if (prop.torch) torch(x, h + height + 0.12, z, prop.room === 'altar');
    } else if (prop.type === 'shrine') {
      height = 3.9;
      pillar(x - 2.1, h, z, 3.4);
      pillar(x + 2.1, h, z, 3.4);
      box('dark', x, h + 3.5, z, 5.7, 0.5, 1.25);
      box('trim', x, h + 3.85, z, 5.3, 0.2, 1.1);
      box('dark', x, h + 1.3, z, 2, 2.6, 0.6);
      box('gold', x, h + 2.1, z - 0.35, 0.16, 1.05, 0.1);
      box('gold', x, h + 2.4, z - 0.35, 0.75, 0.14, 0.1);
      skull(x, h + 0.25, z - 0.5, 0.65);
      for (const dx of [-2.1, 2.1]) torch(x + dx, h + 3.7, z);
      for (let strip = 0; strip < 5; strip++) {
        const length = 1.2 + random() * 0.35;
        box('cloth', x + 1 + (strip - 2) * 0.2, h + 3.2 - length / 2, z - 0.5, 0.2, length, 0.055);
      }
    } else if (prop.type === 'sarcophagus') {
      height = 0.95;
      box('dark', x, h + 0.36, z, 1.3, 0.72, 2.2);
      box('trim', x, h + 0.79, z, 1.5, 0.15, 2.35);
      skull(x, h + 0.88, z + 0.5, 0.38);
    } else if (prop.type === 'anvil') {
      height = 1.3;
      box('dark', x, h + 0.3, z, 1.4, 0.6, 1.2);
      box('iron', x, h + 0.85, z, 0.8, 0.5, 0.7);
      box('iron', x, h + 1.17, z, 1.6, 0.18, 0.85);
    } else if (prop.type === 'rack') {
      height = 2.2;
      box('wood', x, h + 1, z, 1.2, 2, 0.2);
      box('iron', x, h + 1.5, z - 0.15, 0.7, 0.9, 0.18);
      box('gold', x, h + 1.5, z - 0.26, 0.12, 0.65, 0.07);
    } else if (prop.type === 'crates') {
      height = prop.variant % 2 ? 1.7 : 0.9;
      for (let level = 0; level < (height > 1 ? 2 : 1); level++) {
        const y = h + level * 0.86;
        box('wood', x, y + 0.43, z, 0.86, 0.86, 0.86);
        for (const dy of [0.08, 0.78]) box('iron', x, y + dy, z, 0.92, 0.07, 0.92);
        for (const dx of [-0.38, 0.38])
          box('trim', x + dx, y + 0.43, z - 0.45, 0.07, 0.8, 0.06, 0.6);
      }
    } else if (prop.type === 'barrel') {
      height = 1.1;
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        box(
          'wood',
          x + Math.cos(angle) * 0.3,
          h + 0.5,
          z + Math.sin(angle) * 0.3,
          0.27,
          1,
          0.27,
          0.85 + random() * 0.2,
        );
      }
      box('wood', x, h + 1.02, z, 0.63, 0.06, 0.63);
      for (const y of [0.2, 0.8]) box('iron', x, h + y, z, 0.85, 0.09, 0.85);
    } else {
      height =
        buildThemedProp(prop, {
          scene,
          materials,
          shadow,
          glow,
          box,
          transform,
          lights,
          flames,
          creatures,
        }) ?? height;
    }
    collision(x, h + height / 2, z, prop.w, height, prop.d, prop.id);
    frame = null;
  }
  if (content.kind === 'dungeon') {
    const forge = content.world.roomById.lava;
    const lavaPool = required(forge.pool, 'Lava room needs a pool');
    lights.push({
      position: new Vector3(lavaPool.x, forge.h + 1.6, lavaPool.z),
      color: new Color3(1, 0.21, 0.045),
      phase: 0,
    });
  } else {
    for (const { x, z, w, d, h, height, id } of content.world.partition) {
      box('stone', x, h + (height - 0.18) / 2, z, w, height - 0.18, d);
      box('trim', x, h + height - 0.09, z, w + 0.08, 0.18, d + 0.08);
      collision(x, h + height / 2, z, w, height, d, id);
    }
  }

  for (const entity of world.entities) {
    const { x, z, h } = entity;
    frame = ['altar', 'throne'].includes(entity.type) ? entity : null;
    if (entity.type === 'door') {
      const alongX = entity.axis === 'x';
      const root = new TransformNode(entity.id, scene);
      root.position.set(x, h, z);
      root.rotation.y = alongX ? Math.PI / 2 : 0;
      const frame = (mat: MaterialName, name: string, size: Triple, pos: Triple) =>
        tagPart(part(scene, materials[mat], name, size, pos, root, shadow), x, z);
      for (const sign of [-1, 1]) {
        frame('dark', 'door pier', [0.65, 3.3, 0.85], [sign * 1.77, 1.65, 0]);
        frame('trim', 'pier base', [0.86, 0.24, 1], [sign * 1.77, 0.12, 0]);
        frame('trim', 'pier capital', [0.85, 0.27, 1], [sign * 1.77, 3.1, 0]);
      }
      frame('dark', 'door lintel', [4.25, 0.5, 0.95], [0, 3.45, 0]);
      frame('trim', 'door keystone', [0.5, 0.7, 1.05], [0, 3.5, 0]);
      const pivot = new TransformNode(`${entity.id}-hinge`, scene);
      pivot.parent = root;
      pivot.position.x = -1.45;
      const doorPart = (mat: MaterialName, name: string, size: Triple, pos: Triple) =>
        tagPart(part(scene, materials[mat], name, size, pos, pivot, shadow), x, z);
      for (let i = 0; i < 6; i++)
        doorPart(
          entity.locked ? 'iron' : 'wood',
          'door plank',
          [0.47, DOOR_HEIGHT, 0.22],
          [0.25 + i * 0.48, DOOR_HEIGHT / 2, 0],
        );
      for (const y of [0.4, 2.3])
        doorPart(entity.locked ? 'gold' : 'iron', 'door band', [2.9, 0.13, 0.3], [1.45, y, 0]);
      doorPart('gold', 'latch', [0.12, 0.25, 0.18], [2.45, 1.35, -0.22]);
      if (entity.locked) {
        const seal = part(
          scene,
          materials.rune,
          'sealed gate',
          [0.25, 0.85, 0.1],
          [1.45, 1.45, -0.19],
          pivot,
        );
        entity.seal = seal;
      }
      entity.pivot = pivot;
      entity.angle = 0;
      entity.collider = collision(
        x,
        h + DOOR_HEIGHT / 2,
        z,
        alongX ? 0.35 : 2.95,
        DOOR_HEIGHT,
        alongX ? 2.95 : 0.35,
        'door collider',
      );
    }
    if (entity.type === 'altar') {
      box('dark', x, h + 0.13, z, 3, 0.26, 2.5);
      box('trim', x, h + 0.33, z, 2.6, 0.18, 2.1);
      box('dark', x, h + 0.8, z, 1.9, 0.8, 1.45);
      box('trim', x, h + 1.27, z, 2.8, 0.25, 2.1);
      box('dark', x, h + 1.43, z, 2.45, 0.07, 1.8);
      for (const dx of [-0.9, 0.9]) for (const dz of [-0.6, 0.6]) candle(x + dx, h + 1.48, z + dz);
      for (let i = -2; i <= 2; i++)
        box('rune', x + i * 0.32, h + 0.92, z - 0.74, 0.09, 0.28, 0.035);
      const crystal = MeshBuilder.CreatePolyhedron('altar ember', { type: 1, size: 0.46 }, scene);
      crystal.material = materials.rune;
      crystal.position.set(x, h + 2.35, z);
      crystal.isPickable = false;
      entity.crystal = crystal;
      animated.push({ mesh: crystal, y: h + 2.35, phase: 0, spin: 0.45 });
      const rune = MeshBuilder.CreateGround('altar circle', { width: 5.7, height: 5.7 }, scene);
      rune.position.set(x, h + 0.025, z);
      rune.material = materials.magic;
      rune.isPickable = false;
      glow.referenceMeshToUseItsOwnMaterial(rune);
      entity.rune = rune;
      entity.collider = collision(x, h + 0.8, z, 2.7, 1.6, 2, 'altar collider');
      lights.push({
        position: new Vector3(x, h + 2.5, z),
        color: new Color3(0.49, 0.23, 0.82),
        phase: 1,
      });
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3;
        const shard = part(
          scene,
          materials.dark,
          'floating votive',
          [0.18, 0.3, 0.18],
          [x + Math.cos(angle) * 1.1, h + 2.2, z + Math.sin(angle) * 1.1],
        );
        animated.push({ mesh: tagPart(shard, x, z), y: h + 2.2, phase: i, spin: 0.7 });
      }
    }
    if (entity.type === 'throne') {
      box('dark', x, h + 0.13, z, 3, 0.26, 2.7);
      box('gold', x, h + 0.3, z, 2.7, 0.1, 2.35, 0.7);
      box('dark', x, h + 0.7, z, 1.9, 0.8, 1.7);
      box('cloth', x, h + 1.14, z - 0.12, 1.45, 0.14, 1.35);
      box('dark', x, h + 2.05, z + 0.65, 2, 3.2, 0.5);
      box('cloth', x, h + 2.12, z + 0.36, 1.4, 1.65, 0.09);
      for (const dx of [-1, 1]) {
        box('dark', x + dx, h + 1.1, z - 0.1, 0.4, 1.8, 1.8);
        box('gold', x + dx, h + 2.02, z - 0.1, 0.5, 0.15, 1.85);
        box('gold', x + dx * 0.84, h + 3, z + 0.65, 0.17, 1.7, 0.65);
        skull(x + dx, h + 1.95, z - 0.85, 0.32);
      }
      for (let i = -2; i <= 2; i++)
        box('gold', x + i * 0.42, h + 3.9 - Math.abs(i) * 0.18, z + 0.65, 0.26, 0.65, 0.55);
      box('rune', x, h + 3.3, z + 0.36, 0.25, 0.45, 0.08);
      entity.collider = collision(x, h + 1, z, 2.7, 2.2, 2.2, 'throne collider');
      for (const dx of [-1, 1]) torch(x + dx, h + 2.15, z - 0.1);
      for (let dz = -4; dz <= -2; dz++) {
        const p = transform(x, z + dz),
          floor = heightAt(world, p.x, p.z);
        if (floor !== null) box('cloth', x, floor + 0.035, z + dz, 2.8, 0.04, 0.98, 0.8);
      }
    }
    if (entity.type === 'chest') {
      const root = new TransformNode(entity.id, scene);
      root.position.set(x, h, z);
      root.rotation.y = entity.rotation;
      part(scene, materials.wood, 'chest body', [1.25, 0.65, 0.85], [0, 0.325, 0], root, shadow);
      for (const dx of [-0.45, 0.45])
        part(scene, materials.gold, 'chest bands', [0.1, 0.7, 0.9], [dx, 0.35, 0], root, shadow);
      const lid = new TransformNode('chest hinge', scene);
      lid.parent = root;
      lid.position.set(0, 0.65, 0.42);
      part(scene, materials.wood, 'chest lid', [1.3, 0.22, 0.9], [0, 0.1, -0.42], lid, shadow);
      part(scene, materials.gold, 'chest lock', [0.2, 0.25, 0.1], [0, 0.65, -0.47], root, shadow);
      frame = entity;
      entity.lid = lid;
      entity.angle = 0;
      entity.collider = collision(x, h + 0.4, z, 1.3, 0.8, 0.9, 'chest collider');
    }
    frame = null;
  }
  const staticMeshes = batch.finish();
  for (const mesh of staticMeshes) {
    if (mesh.material && ['water', 'lava'].includes(mesh.material.name)) {
      shadow.removeShadowCaster(mesh);
      glow.referenceMeshToUseItsOwnMaterial(mesh);
      if (mesh.material.name === 'water') glow.addExcludedMesh(mesh);
    }
  }
  for (const r of content.kind === 'dungeon' ? world.rooms : []) {
    const entries = rubble.filter(
      (e) => Math.abs(e.position[0] - r.x) < r.w / 2 && Math.abs(e.position[2] - r.z) < r.d / 2,
    );
    const mesh = thinBoxes(scene, materials.stone, entries, `rubble-${r.id}`);
    // Each existing thin group belongs to one room, so its base vertices can carry the role.
    if (mesh && withRoomBands) tagRoomBand(mesh, band({ room: r.id, surface: 'stone' }));
  }

  // Reuse a small pool of lights instead of giving every torch a live light.
  const lightPool = Array.from({ length: 3 }, (_, i) => {
    const light = new PointLight(`nearby-light-${i}`, Vector3.Zero(), scene);
    light.range = 9;
    light.intensity = 0;
    return light;
  });
  const portraits =
    content.kind === 'dungeon' ? buildPortraits(scene, content.world, materials, shadow) : [];
  const particles = flames.flatMap((flame) =>
    Array.from({ length: 3 }, () => ({
      x: flame.position.x,
      y: flame.position.y,
      z: flame.position.z,
      phase: random() * 8,
      speed: 0.4 + random() * 0.3,
    })),
  );
  const sparkMatrices = new Float32Array(particles.length * 16);
  particles.forEach((p, i) => {
    const o = i * 16;
    sparkMatrices[o] = sparkMatrices[o + 5] = sparkMatrices[o + 10] = 0.035;
    sparkMatrices[o + 15] = 1;
    sparkMatrices[o + 12] = p.x;
    sparkMatrices[o + 13] = p.y + 1;
    sparkMatrices[o + 14] = p.z;
  });
  const sparkMesh = MeshBuilder.CreateBox('pooled embers', { size: 1 }, scene);
  sparkMesh.material = materials.ember;
  sparkMesh.isPickable = false;
  if (particles.length) {
    sparkMesh.thinInstanceSetBuffer('matrix', sparkMatrices, 16, false);
    sparkMesh.thinInstanceRefreshBoundingInfo();
  } else sparkMesh.setEnabled(false);
  return {
    walls,
    colliders,
    obstacles,
    flames,
    lights,
    lightPool,
    animated,
    staticMeshes,
    particles,
    sparkMatrices,
    sparkMesh,
    creatures,
    portraits,
  };
}
