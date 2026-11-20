/** One action discriminator shared by simulation, equipment and procedural poses. */
export type AttackKind = 'MELEE' | 'CROSSBOW' | 'LONG_THRUST' | 'THROW_JAVELIN';
export const ATTACKS = {
  MELEE: { range: 1.5, duration: 0.62, impact: 0.25, projectile: false, damage: 6 },
  CROSSBOW: { range: 16, duration: 0.85, impact: 0.45, projectile: true, damage: 7 },
  LONG_THRUST: { range: 3.8, duration: 0.85, impact: 0.35, projectile: false, damage: 12 },
  THROW_JAVELIN: { range: 9, duration: 0.9, impact: 0.4, projectile: true, damage: 10 },
} as const;
