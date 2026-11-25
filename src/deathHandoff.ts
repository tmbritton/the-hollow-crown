import type { Actor } from './actors.ts';
import type { ECS, Entity } from './ecs.ts';
import type { DamageImpact } from './combat.ts';
import type { PoseSnapshot } from './rigs/history.ts';
import type { XYZ } from './rigs/types.ts';

/** Detached, once-only input for P8; no physics backend or second pose writer is installed here. */
export interface DeathHandoff {
  readonly run: ECS;
  readonly target: Entity;
  readonly source: Entity | null;
  readonly time: number;
  readonly kind: 'melee' | 'projectile' | 'hazard';
  readonly magnitude: number;
  readonly travel: XYZ | null;
  readonly position: XYZ;
  readonly heading: number;
  readonly velocity: XYZ;
  readonly pose: PoseSnapshot | null;
}
export function captureDeath(
  run: ECS,
  target: Actor,
  time: number,
  magnitude: number,
  source?: Actor,
  impact?: DamageImpact,
): DeathHandoff {
  const binding = target.entity.get('rigPose');
  const position: XYZ = Object.freeze([target.position.x, target.elevation, target.position.z]);
  const velocity: XYZ = Object.freeze([
    target.motion.velocity.x,
    target.jump.airborne ? target.jump.velocity : target.motion.supportVelocity,
    target.motion.velocity.z,
  ]);
  const length = impact ? Math.hypot(impact.travel.x, impact.travel.h ?? 0, impact.travel.z) : 0;
  const travel: XYZ | null =
    impact && Number.isFinite(length) && length > 1e-8
      ? Object.freeze([
          impact.travel.x / length,
          (impact.travel.h ?? 0) / length,
          impact.travel.z / length,
        ])
      : null;
  return Object.freeze({
    run,
    target: target.entity,
    source: source?.entity ?? null,
    time,
    kind: impact?.kind ?? 'hazard',
    magnitude,
    travel,
    position,
    heading: target.position.heading,
    velocity,
    pose:
      binding?.deathPose({ position, heading: target.position.heading, velocity }, time) ?? null,
  });
}
