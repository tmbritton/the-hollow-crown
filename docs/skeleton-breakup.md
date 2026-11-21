# P9 — skeleton breakup and settled bone decoration

**2026-11-21. Implemented, verified and independently reviewed READY.**

Skeleton deaths now release **eleven anatomical chunks** from the exact final pose: pelvis,
ribcage/spine, skull, two upper arms, two forearms/hands, two thighs and two shins/feet.
Jaw and eye sockets stay with the skull; the held blade stays with its hand. Existing procedural
meshes, materials, shadows and logical death identity are reused. No per-voxel bodies or new meshes
are created. The pelvis mesh now belongs to its semantic pelvis rather than the ribcage.

The independent review found no current-scope blockers and verified actual distant-chunk support,
geometry, occlusion, negative player-visibility cases and once-only discovery. Final settled support
is not an all-frame clearance guarantee: exact entry can inherit live-pose overlap, and brief impact
penetration resolves during simulation. Those limitations are quantified in the verification record.

## Physics and ownership

`Ragdoll.mode` selects `separated` for the skeleton profile and `articulated` for other profiles.
The [P8 run owner](ragdoll-deaths.md) consumes the same once-only A7 handoff. Skeletons omit the ten
anatomical constraints. The initial published matrices remain exact; simulation starts on the next
fixed update. Inherited linear/angular motion and the killing-blow impulse retain P8's ownership.

A separate per-death `:scatter` RNG stream adds **0.6–1.2 units/s horizontal scatter** in a seeded
direction and **0–0.7 units/s lift** to each released chunk. This remains smaller than the common
directional launch; it never depends on render cadence or consumes generation/combat randomness.
Hazard deaths inherit motion and gravity without inventing an attack or scatter impulse.

Pieces collide with world floors, discrete stair treads, masonry, furniture and closed doors.
The existing world-only collision policy excludes living actors, other corpses and mutual chunk
contacts. Bone overlaps in a crowded pile are therefore possible; these are stylized decorative
remains, not interacting gameplay objects. The compact ribcage and hand-bound blade are deliberate
coarse chunks rather than individually simulated ribs or detachable equipment.

Each released chunk supplies a **5×5 terrain patch**. The union deduplicates boxes by stable name;
it covers at most **11 × 25 floor cells**, plus their bounded wall sections and nearby existing
props/doors. It never fills the whole rectangle between distant fragments. The cache refreshes
when a chunk changes tile cell or door collision state changes. Articulated bodies retain P8's
single 9×9 pelvis patch. A regression launches the skull beyond that old patch and checks support.

Three 1/180s substeps, sixteen solver iterations, 24 active death islands and the eight-second
hard lifetime remain the ceilings. The ordinary all-enemy burst uses **312 bodies / 208 constraints**
(the eight skeletons release 80 constraints). Quiet or expired islands freeze and release the
entire backend world; settled decoration uses only the existing geometry and final matrices.

## Scattered remains and perception

- There is still one actor/corpse/inhabitant identity. No fragment gains health, targeting,
  interaction, damage, cargo or discovery state. Living traversal stays full speed and water alone
  retains its 52% grounded speed; settled surfaces provide bounded visual foot contact only.
- The physics envelope follows every chunk and its held equipment. Camera occlusion uses this
  live world-space radius instead of the old intact-body radius, including after settling.
- The binding supplies one actual anatomical mesh per chunk. Named remains discovery tries at
  most eleven surfaces; **the same surface** must pass player range/sight and camera visibility.
  A visible remote piece cannot borrow player visibility from another occluded piece. Ordinary
  living/intact observations keep their three-surface budget.
- Finding any eligible named remains records the original identity once. An unwitnessed death
  stays unwitnessed; a skull alone does not reveal an unknown name or killer.
- Menu/inspection/hidden-tab pause, visible-blur simulation, same-tick hero respawn, reset/teleport,
  removal and regeneration keep the shared owner. Reset clears chunk sample references and frozen
  matrices. Future reanimation still needs an explicit logical rebuild policy; the unsupported
  reset/re-death-before-cleanup ordering documented in P8 is not a new resurrection feature.

## Verification

```sh
node --test tests/skeleton-breakup.test.ts tests/ragdoll.test.ts tests/observation.test.ts
npm run test:skeleton:breakup  # running dev server; optional P9_CLIPS=stairs-down,wall
npm run test:ragdoll:contacts
npm run test:ragdoll
npm run test:combat
npm run test:discoveries
npm run test:animation
npm run check:full
npm run build && npm run test:production
```

The new browser suite verifies seven entry/motion cases, eleven actual chunk samples, skull-detail
rigidity, bounds, final tread contacts, zero added geometry, settled stability and reset. A generated
named skeleton dies out of sight; revealing only its skull grants exactly one remains event.
Existing structural-contact and death suites add both door axes/corners, real melee/bolt/javelin,
all-24 stress, skeleton pause/respawn/regeneration and resource plateau. Captures and a sampled
normal/quarter-speed viewer are under ignored `test-results/p9-*`.

See [VERIFICATION.md](../VERIFICATION.md) for actual results, qualifications and review status.
