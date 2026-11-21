# A5 — articulated kobold tails

**2026-11-20. Implemented and verified; final independent review READY.**
This extends [A4 actions](rig-actions.md). [A6 shield motion](rig-shields.md) now supplies bounded
block/opening counter-motion through the same tail planner; [A7 cutover/handoff](rig-handoff.md) is reviewed READY.

## Anatomy and ownership

`withTail` in `src/rigs/tail.ts` extends the cached humanoid definition with four semantic joints:
`tailBase → tailMiddle → tailEnd → tailTip`. The base is parented to the solved pelvis. The core
joint indices, limb chains and sockets are shared; both kobold roles use the same 24-joint
`humanoid-with-tail` definition. Definitions, dimensions, limits and coarse future physics-body
mappings are immutable. The other profiles retain the 20-joint core.

All twelve kobolds replace their old rigid stub with four tapered procedural boxes, using the
existing brick material. Link lengths are **0.22 / 0.20 / 0.18 / 0.15** (0.75 total); widths taper
from 0.15 to 0.055; heights are 0.12 / 0.08 / 0.06 / 0.045. The base sits at pelvis-local
`[0, -0.12, -0.22]`; maximum base pitch is 1.55 radians. A pelvis-bound haunch box joins the tail visibly to the torso. The stowed shield
and boss sit 0.06 higher to clear the tail root through hacky-sack preparation.

`rigPose.tail` owns eight angular springs, pose/projection buffers and captured death angles.
`rigPose.tailClearance` reads reusable drawn-surface snapshots published by the bindings. Every
living body/equipment pose is finished before tail projection. Tail chains use stable entity-ID
priority; the final pair check marks both participants in any remaining infeasible overlap.
The tail reads final pelvis matrices and writes only its four local rotations. The existing
binding is the sole mesh writer, with a deferred tail-only application. Tail meshes are registered for shadows, observation and settled
corpse sampling; selection proxies and living collision footprints retain their existing sizes.
Review samples/overlays include all four tail joints.

## Motion and constraints

- Follow-through uses measured pelvis acceleration, wrapped yaw change/rate and travel-driven gait.
  The base preserves bounded angular inertia through turns; progressively softer distal springs
  trail it. Idle motion settles, and blocked movement cannot manufacture a running sway.
- Jump tuck, attack counter-motion and backward-travel lift layer on the same chain. Tail input
  never controls movement, defense, attacks, projectiles, work clocks or cargo ownership.
- Local pitch/yaw limits are enforced on every candidate. Links keep their authored translations
  and scales; the root never moves to satisfy decorative clearance.
- A fixed set of nineteen curls/side tucks finds a clear chain. Up to four bisections approach the
  safe boundary. If the driven pose fails, the published contact pose is checked before switching
  presets. Infeasible contacts retain a stable best-effort pose, clear conflicting spring velocity,
  and report `blocked`. Entry/release changes total at most six radians/second across the chain;
  the actual limited pose is checked again, so interpolation cannot falsely claim clearance.
- Clearance uses oriented boxes captured from actual procedural mesh geometry and final numerical
  joint/attachment matrices, including posed legs, shields, weapons, neighboring tails and cargo.
  Only the proximal link may join the explicitly registered **vest, haunches and fitted pack sash**;
  tiny clothing contact at that waist seam is intentional. Other ornaments and every limb/equipment
  surface remain solid to the entire tail. Social prop visibility is applied by bindings before
  snapshots, including the first transition frame.
  Static prop footprints are indexed once per world; whole-link bounds catch thin barriers.
  Missing floor is a wall/void boundary. Navigation's **inflated** `tile.blocked` cells are not
  substituted for physical prop geometry. Stair checks include rendered tread height as well as ramps.
  `src/wallGeometry.ts` shares the physical plinth/course/trim/cap profile with dungeon construction;
  height-aware indexed bounds include inward overhangs even when upper walls are cut away.
- Doors retain live opening/locking/collider behavior. Their chart-backed flags are read only
  after an overlapping-footprint test. Reused tile reads avoid querying the same floor eight times.

Zero-time reads reapply the completed living tail pose without advancing springs. Reset/teleport
clears angles, velocities and history. Death captures the current tail, retires live inertia,
and samples its transition against corpse age while counter-rotating the falling root. Corpses
never avoid living neighbors; settled tails retain their final angles without clearance queries.
Direct and progressive age sampling agree; the settled tail participates in ordinary corpse surfaces.
P8 will take over these semantic joints through the completed A7 physics handoff.

## Budgets

- Tail: **25 candidate/refinement/check chains**, **104 tail-joint evaluations**, **100 clearance calls**,
  at most eight corner-floor probes per call, with retained numerical buffers. This includes the
  held-pose check and rate-limited final check. Each binding registers at most **64 surfaces**;
  the fixed 25-actor scene and four-link pair checks bound neighbor work separately.
- Existing full-body solve: four passes / 16 limb solves. The shared maximum is now **273 joint
  evaluations**, accounting for four extra joints in at most six complete FK traversals; the
  20-joint core's previous 249 bound is unchanged. Tail projection is separate and never revisits IK.
- Original 25 actors remain. Resources plateau at **2,382 meshes / 495 nodes / 28 materials /
  4 textures / 5,719 entities**: +48 meshes and +48 transform nodes over A4, all constructed once.
- The A4 observation radius remains **4.8** after rechecking actual drawn bounds. Maximum normalized
  tail radius in the corrected dense catalog is **1.222845**; the long spear still determines the envelope.

## Verification

```sh
node --test tests/rig-tail.test.ts
npm run test:rig:tails       # running development server required
npm run test:rig:tails:clearance # independent actual-mesh anatomy, neighbors, masonry and stability
TAIL_CLIPS=travel,stairs-down,hackysack npm run test:rig:tails
npm run test:rig
```

Six pure regressions cover family contracts, bounded dynamics/limits, zero-time reads, wall tuck,
infeasibility, age-sampled death and nearby-door/coarse-cell behavior. The browser suite checks all
twelve registrations and **34 role/action sequences / 4,488 every-frame samples**, actual mesh/FK
agreement, equipment intersections, floor/bounds, repeat reads, rear-wall/door release, teleports
and both-role carry/combat/resume. Social fixtures select the actual spearman for spear-role checks.

The review-derived clearance suite additionally checks every active group member, reversed ECS
ordering, settled visitor enter/leave, 128 two-actor placements in both directions, generated masonry,
first-frame prop visibility and four prolonged partial-contact/frozen-contact/release arrangements.
Ordinary fixtures have zero unresolved contacts. Eight tight sweep placements have an infeasible
participant (seven on the primary actor); no intersecting tail is reported clear. Fixed roots may
already be inside a neighbor's shield in such cases; stability is preserved instead of moving actors.

The 25-actor workload initially measured **3.682 / 4.50 ms mean/p95**, triggering A5 investigation.
A bounded CPU trace identified repeated distant door chart reads in clearance. After proximity-first
reads and tile reuse, the same fixture measured **2.905 / 3.70 ms**, below the **3.2 / 4.5 ms**
investigation thresholds. These are Chromium/SwiftShader CPU observations, not hardware FPS or a
portable performance guarantee. Those numbers are the pre-review checkpoint. The corrected final
catalog measured **3.238/4.10ms**, prompting one bounded trace (**3.945/5.30ms instrumented**) and
same-workload recheck (**3.163/3.90ms**). The trace shows binding/surface construction and grounded
solving rather than the former repeated distant-door chart reads. Retain the numerical bounds and
timing qualifications. The independent reviewer accepts this investigated band with limited headroom.

**Final independent review: READY.** Original corpse reactivation, missing anatomy/equipment and
masonry-overhang blockers are cleared. The follow-up fallback-oscillation blocker is also cleared:
independent prolonged tests found zero late motion/velocity under stationary and frozen contacts,
with bounded smooth release and preserved real-death entry/age sampling. The reviewer independently
checked both frozen subjects; the persisted regression now pins the historically failing neighbor
even when all late-motion measurements are zero. See [VERIFICATION.md](../VERIFICATION.md) for
attributed checks, historical qualifications and the stable-infeasibility visual limitation.
