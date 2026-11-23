# CPU5 — Reduce scene traversal and transform overhead

Task source: [CPU5, including its gate](../cpu-performance-plan.md#cpu5--reduce-scene-traversal-and-transform-overhead).  
Status: [final independent **APPROVE**](../../VERIFICATION.md#cpu5--final-independent-review). The test-only cap-eviction and same-ID replay was added after approval and awaits review. [CPU6a is next](../cpu-performance-plan.md#cpu6a--only-construct-animation-geometry-when-needed).  
Branch: `main`, starting at CPU4 `242b520`. No commits requested.

CPU5 retained only the settled transform-publication optimization, alongside resource retirement
fixes. The sections below preserve the original plan; the [verification record](../../VERIFICATION.md#cpu5--fix-round-1)
reports which trials and gates actually ran.

## Goal

Spend less CPU deciding what to draw and republishing transforms that have not changed. Compare the same scene, camera and simulation state, not two different views of the dungeon. A mesh not needed by the camera can still cast a shadow, block a sight ray or supply a corpse contact surface.

## Original acceptance criteria

- [ ] On matched warmed CPU4/CPU5 rendered samples, active-mesh candidate or transform work falls in repeatable counts **and** the corresponding coarse CPU cost improves beyond repeat spread. Report main-camera, shadow and glow work separately, including disabled passes. Do not claim a win from drawing less content than the reference or moving work outside the timer.
- [ ] All reference-visible surfaces and contributing casters survive four camera orientations, zoom extremes, room edges, inspection enter/exit and quality switches. Inspect paired stills and motion sequences for cutaways, silhouettes, lighting, glow, shields, equipment and shadows (including an off-camera caster).
- [ ] For active, newly frozen and long-settled corpses, reference world matrices, chunk contacts, envelopes, representative hits and history agree within existing rig tolerances. After final publication and stabilization, 180 unchanged settled ticks do not reapply physical bindings. Reset/reuse publishes valid living transforms again.
- [ ] Target-pick identity, door/wall and living-body collision, corpse passability and knowledge events agree with CPU4: observed death once, unseen death not revealed, later discovery only on qualifying evidence. Test a visible distant bone and an occluding bone before and after settling.
- [ ] At least three warmed same-seed regenerations plateau at the **new** live scene/mesh/node/material/texture/render-target/effect counts and owned cache sizes; retired meshes, observers and casters are not referenced. Production build has no profiling hooks. Full and affected browser gates below pass.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Paired traversal replay | `tests/cpu-regressions-browser.ts`, `tests/cpu-workloads.ts` | At explicit fixed steps, record logical visible parts, caster membership, view/projection and state fingerprints plus candidate, matrix, bounds and readiness counts per pass. Include warm stable view and camera-only changes without a simulation tick. | CPU4 parity oracle green; new counter/reduction assertion red or missing. |
| Candidate containment | `tests/scene-traversal.test.ts` (new, `node:test`) | Compare bounded candidates to brute-force box/frustum tests across edge-touching, tall, multi-room and unknown bounds; no duplicates; fallback includes unknowns. | Red: no candidate helper. |
| Actual pass/interaction parity | `tests/cpu-regressions-browser.ts`, `tests/inspection-browser.ts` | Compare drawn surfaces, hero and off-screen shadows on visible floor, emissives, wall easing, portrait inspection, equipment swap, pick target/distance and unchanged physical wall. Capture reference views and consecutive frames. | Reference green; removing a required surface from just its pass must fail. |
| Semantic surfaces after consolidation | `tests/skeleton-breakup-browser.ts`, `tests/observation.test.ts` | Compare joint-owned shape extents, number of bodies, held/stowed membership, actual triangle hits including gaps between ribs, ordinary ≤3 and separated ≤11 representatives. Reject evidence if one bone is player-eligible but only another is camera-visible. | Characterization green on CPU4; naive material merge fails. |
| Frozen publication | `tests/ragdoll-contacts-browser.ts`, `tests/skeleton-breakup-browser.ts`, `tests/cpu-regressions-browser.ts` | Intact and separated deaths under scaled parents; compare final 16 affine entries, stable velocities, actual sole/observation reads; exercise forced cap freeze, removal, teleport/reset, same-ID replacement and disposal. Count writes, not just allocations. | Geometry oracle green; unchanged-write budget red. |
| Run ownership | `tests/resources-browser.ts`, `tests/cpu-browser.ts` | Switch quality, regenerate ≥3 times after selection, scatter and inspection; compare warmed counts and observer cleanup, including failed diagnostic setup. | Existing lifecycle green; missing CPU5 cache instrumentation red. |

## Design

1. **Take a paired baseline first.** Historical draw-suppressed Low measured 5.52 ms active evaluation inside 9.37 ms `scene.render`; High's 13.22 ms was preparation, not an isolated shadow cost. [CPU0](../cpu-baseline.md) measured RTX 2070 coarse scene render at 9.3/12.0 ms Low/High, and 180 physical publications / 3,960 corpse-mesh visits / **zero** new corpse boxes in 180 settled ticks. These are reference points, not CPU4 measurements or additive budgets. Capture CPU4 now, using identical diagnostic probes before optimization. Save source ID, seed `MOURNING-731`, viewport 800×450, quality, renderer, camera, tick, population, warm-up and per-repeat distributions under `test-results/`. Separate deterministic rendered frames from native catch-up, physics-only windows and uninstrumented runs. Compare matching state fingerprints, not live frame numbers alone.
2. **Attribute before pruning.** Extend the existing dev-only profiling session with bounded counters/timers for candidates vs accepted meshes, frustum/visibility checks, matrix requests vs actual hierarchy updates, bounds refreshes and material readiness calls. Scope probes to actual pass execution, restore on exit/error; do not sum nested durations. Low disables shadows and glow; High enables both and changes sampling/resolution. Measure shadow-list maintenance separately from shadow rendering. Compare repeat medians/p95/max and raw counts; retest coarse with detailed probes off.
3. **Start with existing spatial batches.** `geometry.ts` already freezes static batch world matrices; `buildDungeon.ts` deliberately unfreezes pivoted cutaway walls and retains separate collision meshes. Index immutable batches by their full world bounds at scene construction. Query conservative chunk bounds against the current camera with margin; preserve scene order for surviving candidates. Keep dynamic, newly added and unclassified meshes on the ordinary path; include any uncertain chunk. Feed only the camera candidate stage, not `setEnabled` or the scene-wide mesh array. Verify Babylon's actual pass context; if a candidate hook is shared and cannot distinguish a pass, delegate to its original list there. Recompute on view/projection, viewport, zoom or inspection changes, not just player room/tick. For cutaways avoid redundant writes only on identical scale; never freeze easing or door motion.
4. **Keep other consumers independent.** Preserve `main.ts`'s unconditional hero casters and its near-player caster rule (center within 23, refreshed every 12 steps or on empty lights); do not intersect that list with the camera list. If indexed, use conservative caster bounds then the original predicate. Maintain glow membership independently. For separated remains, any broad rejection must use the current union of all chunks, including after freeze; never substitute pelvis distance or the living 4.8-unit envelope. Fall back to testing all chunks. Observation still tests actual eligible surfaces against rendered occluders, not collision proxies or coarse bounds. Preserve `enemyRendering.pick`'s alive actor proxy and the CPU4 collision adapters.
5. **Reduce rigid traversal only where the contract is known.** Inventory by actor, material, joint/local frame, separated body owner, shadow/glow, visibility and pick behavior. Trial one same-material skull/jaw or ribs/spine group; never batch across owners, stow/held variants or independently visible details. Prefer emitting one local vertex/index buffer with the original boxes, normals, colors and gaps at construction, not merging disposed children after binding. Before removing sources, map original local boxes and representative surfaces to their joint, attachment, actor and surviving triangles: `physicsShapes()` currently aggregates enabled sources per body and chooses the largest original mesh as representative. Preserve those box extents and actual representative hit regions, including for corpse contact and off-root occlusion; a merged mesh's bounding box/center is not a substitute. If this requires widening the surface contract without a measured gain, retain separate meshes. Compare bounded per-chunk instancing for identical static repeats against existing batches; reject if it expands bounds, changes pick/lighting semantics or costs more. No requirement to ship all trials.
6. **Publish settled physics once.** `DeathPhysics.advance` currently calls `begin`/`applyPhysics` even after freeze; `binding.apply` can also route into `applyPhysics`. Guard at the publication boundary with binding + ragdoll ownership and final-publication state, not the identity of the mutable world array. Preserve entry and active tick ordering. Publish final exact world affine matrices for entries and attachments and final all-chunk envelope, then advance history until previous/current represent rest before skipping writes. Keep lifecycle checks, current transform/support and corpse/observation reads valid independently of rendering. Invalidate on ownership/pose reset, teleport, removal, rebinding or disposal; unfreeze living nodes and clear old surface references. Keep existing retired-rig error behavior.

## Alternatives rejected

- Global active-list/bounds freeze, room-center culling or disabling whole roots: stale after inspection or scatter, and changes non-camera passes.
- Merge by material alone or use a single hull for the rib cage: loses articulation, gaps, representative evidence or death breakup. Per-voxel bodies increase simulation cost and change contacts.
- Recompose frozen local TRS or skip the entire death system when settled: loses shear under scaled parents or masks resets and final history publication.

## File changes (implementation only)

| File | Change | Why |
| --- | --- | --- |
| `src/cpuProfile.ts`, `src/cpuMetrics.ts` | Bounded dev-only pass/work probes | Attribute work without changing production. |
| `src/geometry.ts`, `src/buildDungeon.ts`, proposed `src/sceneTraversal.ts` | Expose immutable batch bounds, own conservative candidate query; trial rigid builder only as justified | Reuse existing batching and frozen transforms. |
| `src/main.ts` | Install/retire scene-owned query; keep camera, shadow and glow policies distinct | Correct transitions and lifecycle. |
| `src/enemyRendering.ts`, `src/player.ts` | Audit rigid groups, proxy and caster registration; change only measured safe groups | Preserve selection, edges and equipment. |
| `src/rigs/bindings.ts`, `src/deathPhysics.ts` | Guard final publication; retain semantic surface sources for any accepted merge | Exact frozen contacts, history and shapes. |
| `src/observation.ts` | Adapt representative/ray lookup only if merged sources need it | Preserve evidence on actual surfaces. |
| Test files named above | Paired oracle, counts, negative and lifecycle probes | Detect speedups bought with missing content. |
| `VERIFICATION.md` | Record actual comparisons, captures, limitations and independent verdict | Keep historical measurements attributed. |

## Edge cases and failure modes

Force full candidates for invalid bounds, unknown passes and uninitialized cameras. Test resize while paused, rotation across a doorway, large caster just outside view, inspection restore, transient effects and meshes added after initialization. Do not cache observed/unobserved decisions across camera motion or wall animation. A cap-forced freeze may occur before that island's update; a stable world-array reference does not mean the final pose was published. Dispose caches/list hooks with their scene even on interrupted setup. No persistent data, permissions or migrations are involved.

## Verification shell commands

Implementation only. Use Node 22.18+, installed lockfile dependencies and Playwright Chromium/Firefox. Run rendering suites sequentially, with `npm run dev` in another terminal for targeted scripts. Run the reference profile before changing behavior, then repeat with the same harness and a different label:

```sh
CPU_CASES=frames-low,frames-high,live-low,live-high,ragdoll,bones,burst,settled CPU_REPEATS=3 CPU_LABEL=cpu4-reference npm run profile:cpu
# After implementation:
CPU_CASES=frames-low,frames-high,live-low,live-high,ragdoll,bones,burst,settled CPU_REPEATS=3 CPU_LABEL=cpu5-candidate npm run profile:cpu
node --test tests/scene-traversal.test.ts tests/observation.test.ts tests/skeleton-breakup.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test && npm run check:full && npm run build
set -e
for suite in cpu cpu:regressions movement combat defense animation rig rig:actions rig:tails:clearance rig:shield:transitions rig:handoff ragdoll ragdoll:contacts skeleton:breakup phalanx inspection discoveries portraits resources browser; do
  npm run "test:$suite"
done
npm run test:cpu:production && npm run test:production
```

Inspect paired screenshots and sequences rather than relying on counts alone. If desktop hardware is available, repeat the matched `live-low,live-high` profiles with `CPU_GPU=hardware`; label headless SwiftShader results as CPU diagnostics, not hardware FPS.

## Risks and rollout

Land nothing on timing alone. Evaluate frozen publication, camera candidates and rigid groups separately against the same reference. Drop a trial with overlapping timing spread, unexplained pass regressions, changed evidence or resource growth; if none meets the gate, report the failed gate rather than lowering it. Keep reference paths in tests, not permanent parallel gameplay implementations. After implementation and verification, obtain independent review, address findings and rerun affected gates before reporting ready.

## Out of scope

CPU6 animation construction/cadence, GPU quality reductions, AI/pathfinding or CPU4 collision redesign, gameplay/knowledge changes, new assets, dependencies, global engine patches, commits and pushes. Only settled publication was retained as a CPU optimization; the test-only trials and ownership fixes are recorded separately from the original design below the initial checkpoint in `VERIFICATION.md`.
