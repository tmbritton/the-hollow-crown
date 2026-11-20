# A2 — coordinated humanoid target solving

**2026-11-20. Implemented and verified; independent review READY.** Builds on the
[A1 foundation](rig-foundation.md). A3's [locomotion/contact planner](rig-grounding.md) is now
delivered in ordinary gameplay; A4's action/equipment migration is next. Measurements below
record the A2 checkpoint.

A3 adds an optional final-contact refinement callback to `solve()`, inside the existing four-pass
budget. Target-space bases stay frozen to the authored input. Live refinement retains the latest
checked candidate instead of restoring an older pose with stale contact. `pelvisUp` can further
restrict the positive correction bound; the default A2 policy is preserved. Terrain query counts
belong to the caller's contact planner, separately from the solver's internal zero-query contract.

## Contracts and ownership

| Module | Responsibility |
| --- | --- |
| `src/rigs/targets.ts` | Four semantic sole/grip targets, explicit spaces, orientation, priority, weight and authored release |
| `src/rigs/ikMath.ts` | Affine orientation extraction, quaternion conversion, periodic Y-X-Z joint-limit projection and pose copying |
| `src/rigs/solver.ts` | Coordinated body correction, generalized unequal-length limb IK, final residuals and operation budgets |

Create one `FullBodySolver(definition)` per participating rig and retain it. Call
`solver.solve(authoredPose, targets)` with a separate authored pose. The returned `SolveResult`
and its pose/residual buffers are reused on the next call; copy any snapshots that must outlive
that call. Feeding its solved pose back as the authored input is rejected. Identical inputs give
identical outputs without advancing simulation, springs, history or events.

After sampling and solving, `copyLocal(result.pose.local, binding.pose.local)` followed by
`binding.apply()` applies the pose through A1's single final mesh writer. Fixed-step history and
reset remain caller-owned through the binding. The solver owns no ECS entity, Babylon node,
terrain sampler, gameplay root movement or asynchronous work.

### Targets and spaces

- `leftSole`, `rightSole`, `leftGrip` and `rightGrip` address the definition's socket frames.
- `space: 'world'` supplies a world frame; `'rig'` uses the authored root; `'joint'` additionally
  names a joint in the **authored input**. Joint-local goals never follow changing solved joints,
  avoiding a cyclic weapon/hand dependency. The browser fixture uses one weapon frame and two grips.
- `position` is a three-component vector. Optional `rotation` is a normalized XYZW quaternion.
  Omitting it preserves the authored socket orientation, which is still measured and enforced.
- Required targets share priority zero. Optional targets use priority one or two. Weight affects
  body compensation and residual ranking; a required zero-weight target is invalid unless
  `release: true`. Only the action/target planner can release required support.
- Bend hints are normalized rest poles perpendicular to the declared -Y links. The solver
  transports them with the limb direction, rather than projecting them onto a singular plane.

Within each priority, the stable order is left sole, right sole, left grip, right grip. Body
compensation uses weighted reach errors from the highest active priority. Lower-priority limbs
can solve their own targets but cannot displace that support through body correction. After each
whole-body pass, all final socket residuals are measured. The best pass is retained using
lexicographic priority and weighted squared errors normalized by acceptance tolerances.

### Geometry, scale and fallback

The gameplay root is fixed. Default per-axis correction limits from the authored pose are
**0.14 units for pelvis translation**, **0.28 rad spine**, **0.20 rad chest**, and **0.18 rad
shoulder**. Body changes are followed by fresh limb solving and complete FK validation.
Required feet and hands are never silently dropped to satisfy the other pair.

Analytic limbs support unequal upper/lower lengths, -Y rest links and an X hinge, with
definition-driven socket offsets/bases and joint limits. Supported link lengths are 0.001–10
units. Neither joint translations nor link scales may stretch anatomy. Joint limits consider
periodically equivalent angles and both Y-X-Z branches; a tiny crossing of π cannot snap a
folded knee straight.

The current render binding supports nonuniform scale on **root and spine**, each component in
**[0.1, 10]**. Other local scales must be one. Scaling logical pelvis/chest/shoulder joints can
create shear that the existing TRS mesh hierarchy cannot represent, so those inputs are rejected
before changing the published result. The two supported scale-bearing nodes also bound cumulative
inverse conditioning. Orientation is defined by forward-first Gram-Schmidt of affine frames.

At a fully folded limb, direction is smoothly regularized within **0.0001 × total link length**.
The antipodal +Y cone, normalized direction Y **0.95–0.99**, smoothly projects toward -Y before
analytic solving. This is a deterministic bounded fallback, not a claim that every geometrically
reachable target is solved. The original requested frame remains the residual oracle. Joint
limits, conflicting goals, unreachable targets and these singular projections can therefore
return **`infeasible`**; optional-only misses return **`relaxed`**.

`solved` requires every active target to meet **0.001-unit sole position**, **0.01-unit grip
position**, and **1° orientation** tolerances. Invalid input throws before mutation; ordinary
constraint conflicts return finite poses and residuals. `infeasible` means unsatisfied under this
bounded policy, not a global mathematical proof that no pose could exist.

## Budgets and evidence

`SOLVER_BUDGET` caps each call at **four whole-body passes / 16 limb solves / 249 joint evaluations /
zero terrain queries**. Body compensation evaluates only affected ancestors; every pass still
revalidates the complete final pose. Pose, target-frame, best-pose and scratch buffers are retained.
A3 must plan terrain/corpse samples at final soles within its own bounded query budget.

```sh
node --test tests/rig-solver.test.ts tests/rig-solver-bindings.test.ts
npm run test:rig:solver       # running development server required
npm run test:animation
```

The new browser suite explicitly regenerates `MOURNING-731`, pauses gameplay, runs five profile/
role fixtures, measures actual bound feet/forearm endpoints and sole corners, and exercises
normal/quarter-speed replay. Captures include side, gameplay and unobstructed front views. It has
a three-minute browser deadline and closes the browser in `finally`. Reports/captures are ignored
under `test-results/rig-solver-report.json` and `test-results/solver-*`.

Recorded results:

- **14 new pure tests**, including **968** continuous turn/step samples against independent
  Babylon FK and **300** actual-binding endpoint comparisons with supported nonuniform scales.
  Maximum scaled FK/binding mismatch **1.786e−7**.
- **1,210 browser samples**: maximum actual sole error **6.248e−8**, grip error **0.009902**,
  sole orientation error **8.941e−8 rad**, and worst corner penetration **6.748e−8**.
  Repeated solves/rendering preserve pose/history and gameplay positions.
- Browser workload needed at most **two passes / eight limb solves / 147 joint evaluations**.
  Isolated 25-rig solver mean/p95 **1.185 / 2.20 ms**; separate unchanged A0 animation workload
  **1.221 / 1.90 ms**, with **42** terrain lookups. Both use 60 warmup +240 measured updates,
  Chromium/SwiftShader at 800×600. These are separate workloads, not an integrated A3 timing or FPS
  claim. A3 must measure its actual migrated pipeline against the baseline budget.
- Statistical allocation sample **80,504,464 bytes**, including fixture setup/targets/yields and
  collected objects, at a 32KiB interval. This is not exact allocation count or retained heap.
- Original **2,291 meshes / 397 nodes / 28 materials / 4 textures / 5,767 entities** remain after
  fixture disposal and three regenerations. Temporary bar/step helpers are disposed.
- **323 everyday tests**, typecheck, lint, format, build and affected animation browser pass.
  Independent review cleared all reproduced scale, constraint-reporting, limit and continuity issues.

The reviewed captures show the coordinated support/step and two-grip pose across all profiles.
The worst remaining visible issue is legacy equipment placement: the player's old sword and the
smoking props can overlap the test grip bar. Equipment authoring/bindings migrate in A4. Static
captures and the exercised sampled replays establish this solver fixture, not final gameplay
acting quality. See [VERIFICATION.md](../VERIFICATION.md) for attributed checks and review probes.
