# A1 — shared humanoid rig foundation

**2026-11-20. Implemented; independent review READY.** Builds on the
[A0 baseline](animation-baseline.md). A2's [coordinated target solver](rig-solver.md) is now delivered;
A3's [locomotion/contact migration](rig-grounding.md) is also delivered; A4's
[action/grip migration](rig-actions.md) is also verified and independently reviewed READY. The
architecture/evidence below records the A1 checkpoint. A3 replaces living legacy leg writes with
semantic poses/targets; A4 replaces action/attachment and temporary-death ownership. Remaining
reset/debug compatibility was removed by [A7](rig-handoff.md); its current APIs supersede the
historical adapter and commit/capture APIs described below.

## Contracts and ownership

| Module | Implemented contract |
| --- | --- |
| `src/rigs/types.ts` | Semantic joint names, immutable definition/profile/chain/socket/body descriptors, numerical joint transforms and pose buffers |
| `src/rigs/humanoid.ts` | Four species profiles sharing one 20-joint humanoid topology; cached immutable definitions, rest dimensions and validation |
| `src/rigs/pose.ts` | Pure quaternion FK, affine composition/inversion, world/local points, full socket frames and explicit previous-pose history |
| `src/rigs/legacy.ts` | Temporary numerical `LegacyNode` adapter translating the existing authored animation conventions into semantic poses |
| `src/rigs/bindings.ts` | Existing-node inverse-bind/pivot adapter and final mesh writer; ECS installation, history/reset handling and legacy equipment frames |

Every production actor owns `Components.rigPose`. It contains a definition, independent pose
buffers, numerical legacy channels and a binding. `Components.rig` retains render references for
existing consumers. Its blend fields forward to the same numerical state, and foot-plant arrays
are shared by reference rather than duplicated. The lookup used by legacy reset calls is weak-keyed;
there is no global strong registry retaining old actors/scenes.

The anatomical tree is root → pelvis → spine → chest → neck/head and shoulders/arms/hands,
with thighs/shins/feet descending from the pelvis. Both kobold equipment roles share the same
kobold definition. Role equipment remains independent of anatomy. Each profile records current
hip/shoulder/head/sole proportions and gait tuning. `gaitSpeed` is the authored cadence reference,
**not motor speed**. The legacy sampler selects its motion profile from actor kind, preserving
the existing same-mesh ordinary/skeleton control fixture independently of the anatomical binding.

There are logical head and hand joints even where the original geometry had no corresponding
scene node. Player/goblin/kobold head parts bind explicitly to the head joint; skeletons retain
their existing pivot. Hand joints supply wrist/grip frames. These are numerical joints: no extra
Babylon nodes or meshes are needed. Mesh parents, materials, ornaments, render surfaces, shadow
registrations and selection proxies retain their identity.

## Pose pipeline

```text
existing authoritative movement/action/work state
  → authored samplers + existing leg contact algorithm write numerical legacy channels
  → sampleLegacy translates pivot/hip conventions to semantic local poses
  → evaluatePose computes parent-first world matrices
  → binding applies inverse-bind offsets through the existing mesh hierarchy
```

`actorRendering.ts` and production `placeFeet()` now write data, not Babylon joint transforms.
The binding is the final transform writer. Corpse poses are applied before settled-body geometry
is sampled for living contacts. Player movement/ground markers read authoritative positions;
terrain/room lookup also reads the current actor position, not the later render root.

The current body bob and hip offsets remain explicit compatibility translations in the spine
and thighs. A3 migrates them to coordinated targets. Cape and root/forearm-mounted equipment
retain buffered legacy attachment channels until A4. Anatomical grip/sole/gaze/back sockets and
attachment-local shield/spear/javelin grip descriptors are available, but A1 does not solve them
or correct A0's floating-equipment defects. Joint limits and coarse anatomical body mappings are
validated metadata; constraint enforcement belongs to A2 and death-physics ownership to A7/P8.

## Coordinates and APIs

World and rig-local +Y are up, +Z is forward; heading zero faces world +Z. Gameplay support uses
`h`, with jump elevation separate. Local rotations are XYZW quaternions, sampled from the existing
Y-X-Z Euler convention. Local/world/previous matrices are preallocated column-major `Float64Array`
buffers. Babylon's rendered world matrices remain its own precision; comparisons allow their
Float32 rounding at distant world coordinates.

- `createPose(definition)`, `evaluatePose(pose)`, `setEuler(joint, x, y, z)` handle numerical poses.
- `worldPoint` / `localPoint` are convenience point queries; their returned tuples are detached.
- `socketMatrix(pose, name, output)` writes a full **affine** socket frame into caller-owned storage.
  It includes authored visual scale; an orthonormal orientation needs an explicit scale/shear-removal
  policy. `socketPoint` reads its origin.
- `binding.begin(dt)` records previous-step history only for advancing steps; `commit()` translates
  the compatibility channels and applies the pose. `apply()` can inspect a directly edited semantic
  pose without advancing clocks or history.
- `stopActor` invalidates history. The next application collapses previous/current matrices together;
  explicit rig reset applies a reset snapshot immediately. Teleport/reset displacement therefore
  cannot become inherited velocity. New runs allocate independent buffers; retired bindings reject
  application to disposed nodes.

Pose evaluation does not alter gameplay transforms, collision, attack release or work clocks.
The arrays are current/previous pose snapshots, not yet A7's final velocity/handoff contract.

## Verification and comparison

```sh
node --test tests/rigs.test.ts tests/rig-bindings.test.ts
npm run test:rig                 # requires a running dev server
# Optional: compare against a preserved A0 report, if available locally:
A0_POSE_REPORT=test-results/animation-review-catalog.json npm run test:rig
```

The normal rig browser check runs without historical artifacts. When `A0_POSE_REPORT` is supplied,
it must contain all 30 A0 side-view clips; preserve that report before regenerating review outputs.
Artifacts are ignored `test-results/rig-report.json` and `rig-*.png`. The runner closes its browser
in `finally`, has a four-minute deadline, and reuses the bounded/yielding A0 cost fixture.

Recorded A1 results:

- **428 samples across 30 clips:** maximum scalar drift from preserved A0 poses **2.384e−7**;
  maximum semantic FK/rendered-joint error **5.644e−6**. Gameplay facts/clocks are compared too.
- Mesh/material/parent/vertex/pickability, shadow-list and observation-reference identity checks
  pass. Real rays still select every enemy profile/role through original selection proxies.
- **2,291 meshes / 397 transform nodes / 28 materials / 4 textures**, stable through the workload
  and three regenerations; **42 terrain lookups/update**, matching A0.
- CDP-enabled warm animation mean/p95 **1.127 / 1.50 ms** versus A0's **1.06 / 1.70 ms**. Sampled
  allocation estimate **157,565,116 bytes**, including setup/warmup/yields/instrumentation and
  collected objects. These single-run CPU observations are not isolated speedup, exact allocation,
  retained-heap or GPU claims. A0's fixture qualifications and future A2 budgets still apply.
- Seven new pure tests plus **309 everyday tests**, typecheck, lint, format and build pass.
  Animation, movement (**16**), jump (**8**) and root production (**5**) browser checks pass.
- Independent review clears the stale-render-root terrain regression and confirms matrix/socket
  math, reset history and acceptance evidence. Detailed red/fix/probe results are in VERIFICATION.md.
