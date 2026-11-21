# P8 — directional ragdoll deaths

**2026-11-21. Implemented and verified; final independent review READY.**

Accepted lethal damage now transfers the [A7 final pose and velocity](rig-handoff.md) to
presentation-only rigid bodies. Enemies launch in the killing blow's direction, hit structural
walls and furniture, tumble over the visible stair treads, and become persistent frozen remains.
At the P8 checkpoint skeletons remained articulated. [P9](skeleton-breakup.md) now releases their
anatomical chunks, adds scattered terrain/perception coverage and reduces the population's active
constraint budget from 288 to 208. The P8 evidence below remains its historical delivery baseline.

## Ownership and backend

- `cannon-es` **0.20.0** is pinned and bundled as ordinary JavaScript. There are no external
  runtime requests, WASM initialization, assets or different Pages-path setup.
- `Components.ragdoll` owns one 11-body humanoid or 15-body tailed island. The run's
  `deathPhysics` component owns transfer, stepping and retirement. Original meshes, render identity,
  equipment, shadows, health/death attribution and cargo ownership are retained.
- One exact entry publication precedes simulation. Animation, IK, shield and tail writers cannot
  overwrite a physical body. Coarse anatomy uses constrained joints, with the torso attached at
  the authored waist, hinge-like elbow/knee constraints and bounded tail joints. Joint angular
  excursions are relative to the captured death pose; this is a stylized ragdoll, not an anatomical
  biomechanics model or a replacement for living rig limits.
- Body transforms rigidly carry the captured affine geometry, including its current squash/stretch.
  The binding publishes exact world matrices for physics, avoiding shear from decomposing a newly
  rotated limb beneath a scaled parent. Reset unfreezes those matrices. Settled corpse reads respect
  that ownership instead of reconstructing the old procedural transforms.
- Equipment retains its current attachment relationship and visibility. Bounds from drawn anatomy
  are merged per coarse body; held/stowed attachments get compound box shapes, rather than a body
  for every decorative voxel. Carried tribute still drops through the existing gameplay system.

## Direction and variation

The normalized 3D melee/projectile travel controls the launch. An exaggerated velocity increment
adds about 5–7 units/s along travel plus 2.4–3.2 units/s lift, capped independently of overkill damage.
Pre-stop movement/ballistic velocity and measured articulation are inherited once. Angular inheritance
is bounded at ±14 rad/s per axis before a small randomized spin is added.

Each death gets a seeded variation key containing the world seed, exact actor/source identities,
simulation time and a run-local death sequence. Strength varies by ±10%, horizontal deflection by
about ±10°, and limb spins by ±1.5 rad/s. Thus deaths vary without losing the blow's dominant direction,
while reproducing the same run/events reproduces its motion. Hazard deaths invent no attack direction
or launch impulse. Variation consumes its own RNG stream, not generation/combat randomness.

## Contacts, lifecycle and budgets

- The fixed 60Hz caller permits at most **three 1/180s substeps**, each with **16 solver iterations**.
  There is no wall-clock catch-up. At most **24 active islands / 312 bodies / 288 constraints** are
  needed by the ordinary population; excess admissions freeze the oldest island deterministically.
- Each island streams a 9×9 tile patch around its pelvis, refreshing on tile-cell or door-state
  changes. Floors use discrete `tile.h`, including the drawn 0.03-unit stair caps, not navigation
  ramp interpolation. Structural wall cores, authored base/trim sections and caps remain physical
  during camera cutaways. Door height is shared with the rendered 2.8-unit planks. Production furniture
  uses the existing collision proxies' actual heights; doors retain their full aperture until their
  shared collision state opens. Headless fixtures can supply blocker envelopes.
- Islands collide only with the world, not living actors or other corpses. Navigation, support,
  water speed, attacks and living-body blocking stay authoritative. No corpse can push a living actor.
- Quiet bodies freeze after a short dwell, with a hard **eight-second** simulation lifetime. Freezing
  releases the entire Cannon world, including contact/friction pools, bodies and constraints.
  Final geometry remains until regeneration. No new corpse meshes are allocated.
- Dead entity positions follow the relocated physical root for proximity/discovery queries. Settled
  surface sampling uses final drawn boxes and local support heights, preserving bounded, render-only
  foot lifting and full-speed traversal. Active flying bodies are not footholds.
- Menu, inspection and hidden-tab suspension stop physics through the existing simulation gate;
  visible blur keeps enemy simulation running. Hero death still respawns in the same gameplay tick,
  without a duplicate hero corpse. Teleport/reset, corpse removal, scene disposal and regeneration
  retire physical ownership and restore the appropriate animation binding.
  Run disposal is terminal, and consumed handoff identities cannot be resubmitted after component
  removal. Scene disposal clears the remaining binding/component references.

The entry contract assumes the completed coordinated rig solve. The reviewer confirmed normal-scale
entry controls, but manually forcing nonuniform root scale after solving can reveal a pre-existing
live-equipment TRS/affine mismatch when physics takes over. That low-level mutation is outside the
ordinary animation path. Likewise an inherited pose can already overlap a discrete stair tread:
final settled clearance is checked separately from initial or transient contacts.
Future enemy resurrection also needs a fresh-handoff preservation rule when reset and re-death
occur before the old record's cleanup update. That unsupported low-level ordering can currently
discard the new handoff; ordinary hero respawn and regeneration do not use it.

## Verification

```sh
node --test tests/ragdoll.test.ts tests/rig-bindings.test.ts
npm run test:ragdoll          # running development server required
npm run test:ragdoll:contacts # actual planks and wall-base geometry, both axes/corners
npm run test:combat
npm run test:discoveries
npm run test:rig:handoff
npm run test:rig:handoff:landing
npm run check
npm run build && npm run test:production
```

The dedicated browser suite checks eleven entry/motion cases, real timed melee and both released
projectiles, actual final mesh/floor geometry, a 24-death burst, menu/inspection/hidden/blur policies,
same-tick respawn and regeneration. Pure tests check launch bounds, reproducible variation, travel,
constraints, physical steps/doors, bounded settling/disposal and waist continuity. The actual-mesh
binding regression protects scaled-parent continuity and frozen corpse sampling. Existing browser
fixtures now compare settled physical remains rather than expecting the old age-sampled Euler pose.
Initial independent review found a short door barrier and missing masonry overhangs. The persisted
24-case structural-contact regression reproduces the faults and passes after correction; the run
disposal/replay concern is also corrected. Independent follow-up cleared both contact blockers and
the reported disposal/replay defect, returning READY for the current gameplay scope.
See [VERIFICATION.md](../VERIFICATION.md) for measured results and review attribution.
