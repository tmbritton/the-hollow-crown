# A5 — articulated kobold tails

**2026-11-20. Implemented and verified locally; independent review pending.**
This extends [A4 actions](rig-actions.md). A6 shield anticipation/reaction is next.

## Anatomy and ownership

`withTail` in `src/rigs/tail.ts` extends the cached humanoid definition with four semantic joints:
`tailBase → tailMiddle → tailEnd → tailTip`. The base is parented to the solved pelvis. The core
joint indices, limb chains and sockets are shared; both kobold roles use the same 24-joint
`humanoid-with-tail` definition. Definitions, dimensions, limits and coarse future physics-body
mappings are immutable. The other profiles retain the 20-joint core.

All twelve kobolds replace their old rigid stub with four tapered procedural boxes, using the
existing brick material. Link lengths are **0.22 / 0.20 / 0.18 / 0.15** (0.75 total); widths taper
from 0.15 to 0.055. A pelvis-bound haunch box joins the tail visibly to the torso. The stowed shield
and boss sit 0.06 higher to clear the tail root through hacky-sack preparation.

`rigPose.tail` owns eight angular springs, pose/projection buffers and captured death angles.
`rigPose.tailClearance` owns reusable contact bounds and nearby-body data. After the full-body
solve, the tail reads final pelvis matrices and writes only its four local rotations. The existing
binding is the sole mesh writer. Tail meshes are registered for shadows, observation and settled
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
- A fixed set of fifteen curls/side tucks finds a clear chain. Up to four bisections approach the
  safe boundary, avoiding coarse candidate jumps. Contact projection clears conflicting angular
  velocity. Impossible arrangements return `blocked` with a bounded least-conflicting pose.
- Clearance uses actual oriented-box corners for floors and a separating-axis check for torso,
  stowed shield and carried/slung cargo. The proximal link may join the pelvis/vest seam; distal
  links cannot re-enter the torso. Nearby living bodies use conservative presentation boxes.
  Static prop footprints are indexed once per world; whole-link bounds catch thin barriers.
  Missing floor is a wall/void boundary. Navigation's **inflated** `tile.blocked` cells are not
  substituted for physical prop geometry. Stair checks include rendered tread height as well as ramps.
- Doors retain live opening/locking/collider behavior. Their chart-backed flags are read only
  after an overlapping-footprint test. Reused tile reads avoid querying the same floor eight times.

Zero-time reads reapply the completed living tail pose without advancing springs. Reset/teleport
clears angles, velocities and history. Death captures the current tail, retires live inertia,
and samples its transition against corpse age while counter-rotating the falling root. Direct
and progressive age sampling agree; the settled tail participates in ordinary corpse surfaces.
P8 will take over these semantic joints through the later A7 physics handoff.

## Budgets

- Tail: **19 candidate/refinement chains**, **80 tail-joint evaluations**, **76 clearance calls**,
  at most eight corner-floor probes per call, with retained numerical buffers.
- Existing full-body solve: four passes / 16 limb solves. The shared maximum is now **273 joint
  evaluations**, accounting for four extra joints in at most six complete FK traversals; the
  20-joint core's previous 249 bound is unchanged. Tail projection is separate and never revisits IK.
- Original 25 actors remain. Resources plateau at **2,382 meshes / 495 nodes / 28 materials /
  4 textures / 5,719 entities**: +48 meshes and +48 transform nodes over A4, all constructed once.
- The A4 observation radius remains **4.8** after rechecking actual drawn bounds. Maximum normalized
  tail radius in the dense tail catalog is **1.260569**; the long spear still determines the envelope.

## Verification

```sh
node --test tests/rig-tail.test.ts
npm run test:rig:tails       # running development server required
TAIL_CLIPS=travel,stairs-down,hackysack npm run test:rig:tails
npm run test:rig
```

Six pure regressions cover family contracts, bounded dynamics/limits, zero-time reads, wall tuck,
infeasibility, age-sampled death and nearby-door/coarse-cell behavior. The browser suite checks all
twelve registrations and **34 role/action sequences / 4,488 every-frame samples**, actual mesh/FK
agreement, equipment intersections, floor/bounds, repeat reads, rear-wall/door release, teleports
and both-role carry/combat/resume. Social fixtures select the actual spearman for spear-role checks.

The 25-actor workload initially measured **3.682 / 4.50 ms mean/p95**, triggering A5 investigation.
A bounded CPU trace identified repeated distant door chart reads in clearance. After proximity-first
reads and tile reuse, the same fixture measured **2.905 / 3.70 ms**, below the **3.2 / 4.5 ms**
investigation thresholds. These are Chromium/SwiftShader CPU observations, not hardware FPS or a
portable performance guarantee. See [VERIFICATION.md](../VERIFICATION.md) for complete checks,
query/allocation qualifications, visual review and pending independent review status.
