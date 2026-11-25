import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Ray } from '@babylonjs/core/Culling/ray';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { required } from '../src/assert.ts';
import { WALL_BASE } from '../src/wallGeometry.ts';
import type { DebugWindow } from './browserTypes.ts';

// Read the indexed triangles, not local bounds: a diagonal can cross this ray even
// when none of its vertices are at the sample height or tangent coordinate.
function triangles(meshes: AbstractMesh[]) {
  return meshes.flatMap((mesh) => {
    const matrix = mesh.computeWorldMatrix(true);
    const positions = required(mesh.getVerticesData('position'), mesh.name);
    const indices = required(mesh.getIndices(), mesh.name);
    const points = [];
    for (let i = 0; i < positions.length; i += 3)
      points.push(Vector3.TransformCoordinates(Vector3.FromArray(positions, i), matrix));
    const result = [];
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [points[indices[i]], points[indices[i + 1]], points[indices[i + 2]]];
      const outwardX = Vector3.Cross(c.subtract(a), b.subtract(a)).x;
      if (Math.abs(outwardX) > 1e-8) result.push({ a, b, c, outwardX });
    }
    return result;
  });
}

export function probeJunction(d: DebugWindow['__dungeon'], side: -1 | 1) {
  const { scene, ecs, world } = d.game;
  if (d.game.scenario !== null) throw new Error('Dojo required');
  const partition = required(
    world.blockers.find(({ id, x }) => id.startsWith('practice-partition-') && side * x > 0),
    'Partition',
  );
  const end = partition.x + (side * partition.w) / 2;
  const owners = ecs.query('cutaway').map((entity) => entity.require('cutaway'));
  const perimeter = owners.filter(({ dx }) => dx === side);
  const wall = required(perimeter[0], 'Perimeter owner');
  const fixed = triangles(
    scene.meshes.filter(
      (mesh) =>
        !owners.some(({ meshes }) => meshes.some((owned) => owned === mesh)) &&
        /^(dark|stone|trim):/.test(mesh.name) &&
        !mesh.checkCollisions &&
        mesh.isVisible,
    ),
  );
  const upper = triangles(perimeter.flatMap(({ meshes }) => meshes));
  const upperMatrix = wall.meshes[0].getWorldMatrix();
  const tipFaces = fixed.filter(
    ({ a, b, c, outwardX }) =>
      side * outwardX > 0 && [a, b, c].every(({ x }) => Math.abs(x - end) < 1e-5),
  );
  const samples = [
    ...WALL_BASE.map(({ center }) => ({ localY: center, cutaway: false })),
    ...[0.96, 1.42, 1.88, 2.34, 2.8, 3.04].map((localY) => ({ localY, cutaway: true })),
  ].flatMap(({ localY, cutaway }) => {
    const y = cutaway
      ? Vector3.TransformCoordinates(new Vector3(0, localY, 0), upperMatrix).y
      : localY;
    // Sample across the sideways-shifting end face, plus the reported fixed point.
    const span = tipFaces
      .flatMap(({ a, b, c }) =>
        [
          [a, b],
          [b, c],
          [c, a],
        ].flatMap(([p, q]) => {
          if (p.y < y === q.y < y) return [];
          return [p.z + ((y - p.y) / (q.y - p.y)) * (q.z - p.z)];
        }),
      )
      .filter((z) => Math.abs(z - partition.z) < 0.7);
    if (!span.length) throw new Error(`No partition end face at y=${y}`);
    const low = Math.min(...span),
      high = Math.max(...span);
    const coordinates = [0.1, 0.5, 0.9].map((fraction) => low + (high - low) * fraction);
    if (localY === 2.8) coordinates.push(partition.z + side * 0.25);
    return coordinates.map((z) => {
      const ray = new Ray(new Vector3(end - side, y, z), new Vector3(side, 0, 0), 2);
      const hits = (faces: ReturnType<typeof triangles>, facing: number) =>
        faces.flatMap(({ a, b, c, outwardX }) => {
          if (facing * outwardX <= 0) return [];
          const hit = ray.intersectsTriangle(a, b, c);
          return hit && Math.abs(hit.distance - 1) < 0.4 ? [end - side + side * hit.distance] : [];
        });
      const tip = hits(fixed, side).sort((a, b) => Math.abs(a - end) - Math.abs(b - end))[0];
      const inner = hits(cutaway ? upper : fixed, -side).sort((a, b) => side * (a - b))[0];
      return { localY, y, z, tip: tip ?? null, inner: inner ?? null };
    });
  });
  return {
    end,
    scale: wall.scale,
    samples,
    ownership: owners.map(({ dx, dz, meshes }) => [
      dx,
      dz,
      meshes.map((mesh) => [mesh.uniqueId, mesh.getPivotPoint().asArray()]),
    ]),
    colliders: scene.meshes
      .filter((mesh) => mesh.checkCollisions)
      .map((mesh) => ({
        id: mesh.uniqueId,
        matrix: Array.from(mesh.computeWorldMatrix(true).asArray()),
        positions: Array.from(mesh.getVerticesData('position') ?? []),
        indices: Array.from(mesh.getIndices() ?? []),
      })),
  };
}
