import { Matrix } from '@babylonjs/core/Maths/math.vector.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Ray } from '@babylonjs/core/Culling/ray.js';
import type { Game } from '../src/gameTypes.ts';
import { sameHit } from './cursor-reference.ts';
import { createOccupancy, offlineList } from './cursor-attribution-model.ts';
import type { GroundRay } from './cursor-attribution-model.ts';
import { countScope, pickDiagnostic } from './cursor-attribution-probe.ts';
import type { NativeRow, Pass, ReplayPorts, ReplaySample } from './cursor-attribution-probe.ts';
import type { BatchClock } from './cursor-evidence.ts';

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
export type ReplayWork = {
  i: number;
  exhaustive: Pass[];
  local: Pass[];
  forcedProxy: (number | null)[];
};

export function createReplay(
  ports: ReplayPorts,
  game: Game,
  meshes: AbstractMesh[],
  samples: ReplaySample[],
  rows: NativeRow[],
  reverse: boolean,
  smoke: boolean,
  ground: (ray: Ray) => GroundRay,
  clock: BatchClock,
) {
  const { scene } = game;
  const materials = meshes.map((mesh) => mesh.material);
  const originalAlpha = new Map(
    materials.flatMap((m) => (m ? [[m, m.needAlphaBlending] as const] : [])),
  );
  const pickFrames = samples.flatMap((sample, i) => {
    if (!sample.ray || !sample.hit) return [];
    const occupants = sample.poses.map((pose, id) => ({ id, bounds: pose.bounds }));
    const r = ground(sample.ray);
    const list = createOccupancy(occupants).walk(r);
    if (JSON.stringify(list.ids) !== JSON.stringify(offlineList(occupants, r).ids))
      throw new Error(`populated/offline list mismatch at native sample ${i}`);
    const ids = new Set(list.ids);
    return [
      {
        sample,
        i,
        ray: sample.ray,
        hit: sample.hit,
        list,
        local: list.ids.map((id) => meshes[id]),
        off: meshes.filter((_, id) => !ids.has(id)),
      },
    ];
  });
  const restore = (sample: ReplaySample) => {
    scene.incrementRenderId();
    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i],
        p = sample.poses[i];
      if (p.parent !== (mesh.parent?.uniqueId ?? null) || materials[i] !== mesh.material)
        throw new Error('unreplayed parent or material replacement');
      mesh.setEnabled(p.enabled);
      mesh.isVisible = p.visible;
      mesh.visibility = p.visibility;
      mesh.freezeWorldMatrix(Matrix.FromArray(p.world));
      if (mesh instanceof Mesh && p.thin) {
        const buffer = mesh._thinInstanceDataStorage.matrixData;
        if (!buffer || p.thinCount > buffer.length / 16)
          throw new Error('unreplayed thin buffer lifecycle');
        buffer.set(p.thin);
        mesh.thinInstanceCount = p.thinCount;
        mesh.thinInstanceEnablePicking = p.thinPick;
        if (p.thinCount) mesh.thinInstanceRefreshBoundingInfo(false);
      }
    }
    const alpha = new Map<(typeof meshes)[number]['material'], boolean>();
    for (const [i, material] of materials.entries()) {
      if (!material) continue;
      const value = sample.poses[i].alpha;
      if (alpha.has(material) && alpha.get(material) !== value)
        throw new Error('inconsistent captured alpha policy');
      alpha.set(material, value);
    }
    for (const [material, required] of alpha)
      if (material) {
        const original = originalAlpha.get(material)!;
        material.needAlphaBlending = original;
        if (material.needAlphaBlending() !== required) material.needAlphaBlending = () => required;
      }
    if (game.combat.enemies.some((a, i) => a.alive !== sample.alive[i]))
      throw new Error('unreplayed proxy liveness change');
  };

  const lists = pickFrames.map(({ list, i }) => ({ i, ...list }));
  const registration = () => {
    const start = smoke ? 0 : clock();
    const occupancy = samples[0]?.poses.map((p, id) => ({ id, bounds: p.bounds })) ?? [];
    const index = createOccupancy(occupancy);
    const ms = smoke ? null : clock() - start;
    const buckets = index.representation();
    // Representation size, not a JS heap/RSS measurement.
    return {
      ms,
      serializedBucketBytes: new TextEncoder().encode(JSON.stringify(buckets)).byteLength,
      runtimeMemory: 'unmeasured' as const,
      tiles: buckets.length - 1,
    };
  };
  const cold = registration();
  const counts: (ReplayWork & {
    nativeHit: ReplaySample['hit'];
    exhaustiveHit: ReplaySample['hit'];
    localHit: ReplaySample['hit'];
  })[] = [];
  const timed: {
    i: number;
    exhaustive: number | null;
    local: number | null;
    stages: (number | null)[][];
    isolated: { off: number | null; empty: number | null }[];
  }[] = [];
  try {
    if (pickFrames.length) {
      // First run parity + actual intersection counts outside every timing arm.
      const undo = countScope(meshes);
      try {
        for (const f of pickFrames) {
          restore(f.sample);
          const a = pickDiagnostic(ports, game, f.ray, 'count');
          restore(f.sample);
          const b = pickDiagnostic(ports, game, f.ray, 'count', f.local);
          if (!sameHit(a.hit, f.hit) || !sameHit(b.hit, f.hit))
            throw new Error(
              `replay hit parity at frame ${f.i}: ${JSON.stringify([f.hit, a.hit, b.hit])}`,
            );
          const native = rows[f.i].passes;
          if (
            native.some((p) => p.work) &&
            JSON.stringify(native.map((p) => p.work)) !==
              JSON.stringify(a.passes.map((p) => p.work))
          ) {
            throw new Error(`native/exhaustive entry counts differ at frame ${f.i}`);
          }
          counts.push({
            i: f.i,
            nativeHit: f.hit,
            exhaustiveHit: a.hit,
            localHit: b.hit,
            exhaustive: a.passes,
            local: b.passes,
            forcedProxy: [a.syncs, b.syncs],
          });
        }
      } finally {
        undo();
      }

      // Burn in each arm equally; no clocks per predicate, mesh or instance.
      for (const f of pickFrames.slice(0, 3))
        for (const local of [null, f.local]) {
          restore(f.sample);
          pickDiagnostic(ports, game, f.ray, 'parity', local);
        }
      for (const f of pickFrames) {
        const arm = (local: AbstractMesh[] | null) => {
          restore(f.sample);
          return pickDiagnostic(ports, game, f.ray, smoke ? 'parity' : 'time', local);
        };
        const [a, b] = reverse ? [arm(f.local), arm(null)].reverse() : [arm(null), arm(f.local)];
        if (!sameHit(a.hit, f.hit) || !sameHit(b.hit, f.hit))
          throw new Error(`timed arm parity at ${f.i}`);
        restore(f.sample);
        const stages = pickDiagnostic(ports, game, f.ray, 'parity').stages;
        const isolated = stages.map((args) => {
          // Only the same pass's removed entries, minus its empty dispatch. Sync isn't credited.
          const run = (list: AbstractMesh[]) => {
            restore(f.sample);
            scene.meshes = list;
            try {
              const start = smoke ? 0 : clock();
              scene.pickWithRay(...args);
              return smoke ? null : clock() - start;
            } finally {
              scene.meshes = meshes;
            }
          };
          if (reverse) {
            const empty = run([]);
            return { off: run(f.off), empty };
          }
          return { off: run(f.off), empty: run([]) };
        });
        timed.push({
          i: f.i,
          exhaustive: a.ms,
          local: b.ms,
          stages: [a.passes.map((p) => p.ms), b.passes.map((p) => p.ms)],
          isolated,
        });
      }
    }
  } finally {
    for (const [material, fn] of originalAlpha) material.needAlphaBlending = fn;
  }
  const values = (key: 'exhaustive' | 'local') => {
    const value = timed.map((r) => r[key]);
    return value.length && value.every((v): v is number => v !== null) ? mean(value) : null;
  };
  return {
    lists,
    counts,
    timed,
    registration: cold,
    exhaustive: values('exhaustive'),
    local: values('local'),
    parity: pickFrames.length === counts.length,
    order: reverse ? 'local/exhaustive' : 'exhaustive/local',
  };
}
