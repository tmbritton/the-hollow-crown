import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Batcher } from './geometry.ts';
import type { Prop } from './worldTypes.ts';
import type { BoxBuilder, PropBuildContext } from './renderTypes.ts';

function lizardSteed(prop: Prop, { scene, materials, shadow, creatures }: PropBuildContext): void {
  const root = new TransformNode(`${prop.id}-steed`, scene);
  root.position.set(prop.x, prop.h, prop.z);
  root.rotation.y = prop.rotation;
  const head = new TransformNode('steed head', scene);
  head.parent = root;
  head.position.z = -0.75;
  const tail = new TransformNode('steed tail', scene);
  tail.parent = root;
  tail.position.z = 0.8;
  function assemble(parent: TransformNode, recipe: (box: BoxBuilder) => void) {
    const batch = new Batcher(scene, materials, shadow);
    const box: BoxBuilder = (m, x, y, z, w, h, d, t = 1) =>
      batch.box(m, x, y, z, w, h, d, t, 63, 'steed');
    recipe(box);
    for (const mesh of batch.finish()) {
      mesh.unfreezeWorldMatrix();
      mesh.parent = parent;
    }
  }
  assemble(root, (b) => {
    b('scales', 0, 0.78, 0, 0.9, 0.65, 1.65, 0.85 + prop.variant * 0.07);
    b('scales', 0, 1.1, 0, 0.66, 0.18, 1.3);
    b('bone', 0, 0.55, -0.12, 0.65, 0.16, 1.3, 0.6);
    for (const side of [-1, 1])
      for (const z of [-0.55, 0.6]) {
        b('scales', side * 0.5, 0.4, z, 0.26, 0.63, 0.32);
        b('scales', side * 0.58, 0.12, z - 0.1, 0.38, 0.2, 0.48);
        for (let claw = -1; claw <= 1; claw++)
          b('bone', side * 0.58 + claw * 0.1, 0.08, z - 0.38, 0.06, 0.08, 0.2);
      }
    b('wood', 0, 1.21, 0.15, 0.77, 0.15, 0.8);
    b('cloth', 0, 1.31, 0.15, 0.62, 0.12, 0.66);
    b('gold', 0, 1.38, -0.22, 0.56, 0.2, 0.12);
    b('iron', 0, 0.84, 0.37, 0.96, 0.59, 0.08);
    for (const side of [-1, 1]) b('iron', side * 0.6, 0.72, 0.28, 0.12, 0.28, 0.2);
    for (const z of [-0.62, 0.72]) b('bone', 0, 1.25, z, 0.13, 0.25, 0.22, 0.75);
  });
  assemble(head, (b) => {
    b('scales', 0, 0.95, -0.25, 0.57, 0.5, 0.75);
    b('scales', 0, 1.13, -0.75, 0.71, 0.4, 0.8);
    b('scales', 0, 1.02, -1.18, 0.57, 0.25, 0.43);
    b('bone', 0, 0.86, -1.02, 0.54, 0.12, 0.62, 0.76);
    for (const side of [-1, 1]) {
      b('dark', side * 0.36, 1.18, -0.88, 0.045, 0.14, 0.2);
      b('eyes', side * 0.388, 1.2, -0.9, 0.025, 0.07, 0.1);
      b('dark', side * 0.16, 1.08, -1.405, 0.08, 0.055, 0.025);
      b('bone', side * 0.26, 1.45, -0.5, 0.14, 0.34, 0.18, 0.85);
      b('wood', side * 0.39, 1.05, -1.03, 0.055, 0.06, 0.5);
    }
    b('wood', 0, 1.13, -1.1, 0.64, 0.07, 0.08);
  });
  assemble(tail, (b) => {
    for (let i = 0; i < 5; i++) {
      const size = 0.42 - i * 0.065,
        z = 0.2 + i * 0.38,
        x = Math.sin(i * 0.65) * 0.23;
      b('scales', x, 0.65 - i * 0.075, z, size, size, 0.53, 0.82 + prop.variant * 0.07);
      if (i < 3) b('bone', x, 0.9 - i * 0.1, z, 0.1, 0.18, 0.13, 0.8);
    }
  });
  creatures.push({ root, head, tail, phase: prop.variant * 1.7 });
}

export function buildThemedProp(prop: Prop, context: PropBuildContext): number | null {
  const { scene, materials, glow, box, transform, lights, flames } = context;
  const { x, z, h, type } = prop;
  function loaf(lx: number, ly: number, lz: number, size = 0.5) {
    box('bread', lx, ly + 0.1, lz, size, 0.2, size * 0.65);
    box('bread', lx, ly + 0.24, lz, size * 0.8, 0.12, size * 0.52, 1.1);
    for (const dx of [-0.2, 0, 0.2])
      box('bone', lx + dx * size, ly + 0.305, lz, size * 0.07, 0.015, size * 0.36, 0.75);
  }
  function table(width: number, depth: number, height = 1) {
    for (const dx of [-1, 1])
      for (const dz of [-1, 1])
        box(
          'wood',
          x + dx * (width / 2 - 0.15),
          h + height / 2,
          z + dz * (depth / 2 - 0.15),
          0.16,
          height,
          0.16,
        );
    box('wood', x, h + height, z, width, 0.22, depth);
  }
  function hearth(y: number, localZ: number, width = 0.8) {
    const p = transform(x, localZ);
    const flame = MeshBuilder.CreatePlane(
      'hearth flame',
      { width, height: 0.9, sideOrientation: Mesh.DOUBLESIDE },
      scene,
    );
    flame.position.set(p.x, y + 0.4, p.z);
    flame.rotation.y = prop.rotation;
    flame.material = materials.flame;
    flame.isPickable = false;
    glow.referenceMeshToUseItsOwnMaterial(flame);
    flames.push(flame);
    lights.push({
      position: new Vector3(p.x, y + 0.5, p.z),
      color: new Color3(1, 0.4, 0.12),
      phase: prop.variant,
    });
  }
  if (type === 'butcher-block') {
    table(2.5, 1.6, 0.9);
    box('trim', x, h + 1.06, z, 2.4, 0.18, 1.5, 0.7);
    box('wood', x - 0.55, h + 1.2, z, 0.95, 0.12, 0.9, 1.2);
    box('iron', x - 0.55, h + 1.5, z - 0.1, 0.55, 0.46, 0.07);
    box('wood', x - 0.28, h + 1.78, z - 0.1, 0.12, 0.4, 0.14);
    box('meat', x + 0.6, h + 1.25, z, 0.6, 0.2, 0.5);
    box('bone', x + 0.6, h + 1.37, z, 0.12, 0.06, 0.53);
    return 1.8;
  }
  if (type === 'meat-rack') {
    for (const dx of [-1.2, 1.2]) {
      box('wood', x + dx, h + 1.35, z, 0.18, 2.7, 0.2);
      box('dark', x + dx, h + 0.1, z, 0.5, 0.2, 1.5);
    }
    box('iron', x, h + 2.65, z, 2.8, 0.17, 0.2);
    for (let i = 0; i < 3; i++) {
      const lx = x + (i - 1) * 0.8,
        y = h + 1.25 + (i % 2) * 0.2;
      for (let link = 0; link < 4; link++)
        box('iron', lx, h + 2.45 - link * 0.12, z, 0.06, 0.09, 0.06);
      box('bone', lx, y + 0.57, z, 0.15, 0.32, 0.18);
      box('meat', lx, y, z, 0.45, 0.85, 0.4, 0.85 + i * 0.1);
      box('meat', lx + 0.1, y - 0.35, z, 0.45, 0.35, 0.4);
      box('bone', lx, y + 0.1, z - 0.215, 0.1, 0.38, 0.035);
    }
    return 2.8;
  }
  if (type === 'furnace' || type === 'bread-oven') {
    const bakery = type === 'bread-oven',
      mat = bakery ? 'brick' : 'dark';
    box('dark', x, h + 0.18, z, 2.65, 0.36, 2.45);
    box(mat, x, h + 1.3, z + 0.65, 2.35, 2.2, 0.7);
    for (const dx of [-0.9, 0.9])
      for (let row = 0; row < 4; row++)
        box(mat, x + dx, h + 0.55 + row * 0.45, z - 0.25, 0.5, 0.42, 1.45, 0.9 + row * 0.03);
    box(mat, x, h + 2.25, z - 0.2, 2.4, 0.4, 1.6);
    box('trim', x, h + 0.53, z - 0.95, 1.85, 0.16, 0.5, 0.65);
    box('dark', x, h + 0.7, z - 0.12, 1.25, 0.18, 1.35);
    box('ember', x, h + 0.79, z - 0.25, 0.95, 0.04, 0.7);
    if (bakery) {
      box('brick', x, h + 2.56, z, 0.9, 0.25, 1.4);
      loaf(x - 0.28, h + 0.9, z - 0.6, 0.4);
      loaf(x + 0.28, h + 0.9, z - 0.6, 0.4);
    } else {
      box('iron', x, h + 2.65, z, 2.5, 0.18, 2.2);
      box('dark', x, h + 3.1, z + 0.4, 0.8, 0.85, 0.8);
      for (const dx of [-0.45, 0, 0.45]) box('iron', x + dx, h + 1.05, z - 0.91, 0.05, 0.6, 0.06);
    }
    hearth(h + 0.82, z - 0.62, bakery ? 0.65 : 1.05);
    return bakery ? 2.8 : 3.6;
  }
  if (type === 'tool-bench') {
    table(2.65, 1.2);
    box('wood', x, h + 1.65, z + 0.5, 2.65, 1.1, 0.16);
    for (let i = 0; i < 4; i++) {
      const lx = x - 1 + i * 0.65;
      box('wood', lx, h + 1.55, z + 0.35, 0.08, 0.65, 0.1);
      box('iron', lx, h + 1.92, z + 0.35, 0.4, 0.18, 0.16);
    }
    box('iron', x - 0.6, h + 1.2, z - 0.15, 0.8, 0.12, 0.35);
    box('gold', x + 0.6, h + 1.2, z - 0.15, 0.65, 0.15, 0.32);
    return 2.3;
  }
  if (type === 'quench') {
    box('iron', x, h + 0.3, z, 1.3, 0.6, 1.3);
    box('blue', x, h + 0.62, z, 1.05, 0.035, 1.05);
    for (const side of [-1, 1]) box('iron', x + side * 0.6, h + 0.65, z, 0.1, 0.14, 1.3);
    return 0.75;
  }
  if (type === 'bread-table') {
    table(2.6, 1.4);
    box('bone', x - 0.65, h + 1.12, z, 0.9, 0.04, 0.9, 0.83);
    for (let i = 0; i < 3; i++) loaf(x + 0.5, h + 1.12, z - 0.45 + i * 0.45, 0.48);
    box('wood', x - 0.6, h + 1.23, z, 0.8, 0.1, 0.12);
    return 1.5;
  }
  if (type === 'bread-rack') {
    for (const dx of [-0.9, 0.9]) box('wood', x + dx, h + 1.15, z, 0.12, 2.3, 1.2);
    for (let row = 0; row < 3; row++) {
      const y = h + 0.4 + row * 0.65;
      box('wood', x, y, z, 1.9, 0.1, 1.2);
      for (let i = 0; i < 3; i++) loaf(x + (i - 1) * 0.5, y + 0.06, z, 0.43);
    }
    return 2.35;
  }
  if (type === 'flour-sacks') {
    for (let i = 0; i < 3; i++) {
      const lx = x + (i - 1) * 0.45,
        lz = z + (i % 2) * 0.4 - 0.2;
      box('bone', lx, h + 0.35, lz, 0.5, 0.65, 0.6, 0.8 + i * 0.05);
      box('bone', lx, h + 0.72, lz, 0.3, 0.14, 0.4);
      box('wood', lx, h + 0.69, lz, 0.34, 0.06, 0.44);
      box('gold', lx, h + 0.39, lz - 0.305, 0.18, 0.22, 0.025, 0.65);
    }
    return 0.9;
  }
  if (type === 'lizard-stall') {
    // Closed side/back rails leave the lizard silhouette visible above the straw.
    for (const dx of [-2, 2]) {
      for (const dz of [-2.55, 0, 2.55]) box('wood', x + dx, h + 0.7, z + dz, 0.18, 1.4, 0.18);
      for (const y of [0.45, 1.05]) box('wood', x + dx, h + y, z, 0.1, 0.12, 5.2);
    }
    for (const y of [0.45, 1.05]) box('wood', x, h + y, z + 2.55, 4, 0.12, 0.12);
    box('wood', x, h + 0.5, z - 2.55, 4, 0.1, 0.12);
    for (let i = 0; i < 30; i++) {
      const dx = (((i * 17 + prop.variant * 3) % 29) / 29) * 3.6 - 1.8,
        dz = (((i * 13) % 31) / 31) * 4.8 - 2.4;
      box('gold', x + dx, h + 0.025, z + dz, 0.4, 0.035, 0.045, 0.65);
    }
    lizardSteed(prop, context);
    return 1.7;
  }
  if (type === 'feed-trough') {
    box('wood', x, h + 0.3, z, 2.25, 0.6, 1);
    box('dark', x, h + 0.61, z, 1.95, 0.05, 0.7);
    for (let i = 0; i < 8; i++)
      box('moss', x - 0.8 + i * 0.22, h + 0.7, z, 0.2, 0.12, 0.45, 0.8 + (i % 3) * 0.1);
    for (const dx of [-1, 1]) box('iron', x + dx * 0.8, h + 0.3, z, 0.07, 0.66, 1.05);
    return 0.8;
  }
  if (type === 'tack-rack') {
    for (const dx of [-0.8, 0.8]) box('wood', x + dx, h + 0.85, z, 0.15, 1.7, 0.8);
    box('wood', x, h + 1.6, z, 1.9, 0.15, 0.25);
    box('cloth', x, h + 1.38, z, 0.9, 0.4, 0.65);
    for (const dx of [-0.7, 0.7]) box('wood', x + dx, h + 1, z - 0.2, 0.1, 1, 0.1);
    box('gold', x, h + 1.62, z - 0.3, 0.65, 0.12, 0.15);
    return 1.8;
  }
  if (type === 'hay-bales') {
    for (const dx of [-0.45, 0.45]) {
      box('gold', x + dx, h + 0.35, z, 0.8, 0.7, 1.25, 0.72);
      for (const dz of [-0.4, 0.4]) box('wood', x + dx, h + 0.36, z + dz, 0.82, 0.72, 0.05);
    }
    return 0.8;
  }
  return null;
}
