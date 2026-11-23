# CPU6a — Only construct animation geometry when needed

- **Task source**: [CPU6a backlog contract](../cpu-performance-plan.md#cpu6a--only-construct-animation-geometry-when-needed)
- **Epic / Story**: CPU performance / CPU6a
- **Status**: [Final independent **APPROVE**](../../VERIFICATION.md#cpu6a--animation-geometry), including [follow-up 1](cpu6a-follow-up-1.md) and [follow-up 2](cpu6a-follow-up-2.md). Uncommitted on `main`; [CPU6b is next](../cpu-performance-plan.md#cpu6b--separate-presentation-solving-from-simulation-frequency).
- **Branch**: `main`, baseline CPU5 `f3fa9a3`. No commits requested.

## Goal

Preparing one kobold's tail should not rebuild a distant actor's equipment, and planting a foot on a settled bone should not require inspecting every mesh of every corpse. Reduce that work without changing what a tail avoids, where a foot lands, or what happens when the player pauses to inspect either pose.

## Acceptance criteria

- [x] With no living tail requesting clearance, prepare zero living full-body snapshots; with one or more requests, rebuild zero outside their combined neighborhoods and at most once per demanded binding at a given revision. Re-entry after an unsampled change uses the current pose.
- [x] Against eager sampling at identical fixed steps, match body, shield, spear, cargo and final tail bounds within existing rig tolerances. Reversing insertion order gives the same chains and blocked flags. Final validation visits each unordered tail pair once; an intersecting final pair flags both actors. Existing infeasible-search limits hold.
- [x] On the first eligible settled step, all foot and swing probes agree with exhaustive drawn-box sampling, including off-root pieces. Over 180 unchanged ticks after publication there are no settled-list rebuilds, per-mesh matrix/visibility checks or support lookups for unchanged entries. Subsequent motion, withdrawal and replacement affect queries on the same step. No stale references after regeneration.
- [x] Repeated zero-time inspection does not mutate retained sample values or advance history. Corpses remain passable at full speed; support height, jump and navigation results match CPU5.
- [x] In matched warmed CPU5/candidate replays, record reductions in surface work and neighborhood visits separately from coarse animation/contact and frame timing. Claim a timing win only beyond repeat spread; no gain purchased by delaying publication or omitting parts. Full, build and affected browser gates pass.

## Test plan (write these first)

Use `node:test` for deterministic fixtures; use actual binding/mesh output, not the optimized candidate list, as the browser oracle. Pin CPU5 parity before adding count assertions: existing behavior checks should not be forced red.

| Test | File | Behavior pinned | Expected red on CPU5 |
| --- | --- | --- | --- |
| Demand boundary and re-entry | `tests/rig-tail.test.ts`, `tests/rig-tail-clearance-browser.ts` | No tails, two overlapping neighborhoods, spear at the inclusive six-unit boundary, far moving carrier, then teleport into range. Count full publications by binding. | One active tail causes full sampling of distant living rigs. |
| Revision and snapshot lifetime | `tests/rig-bindings.test.ts` | Hold root fixed; repeat an unchanged read, then turn, recoil, stow/throw and exchange cargo. Compare enabled bounds with fresh samples; retain the old snapshot through a later update and a zero-time read. | Mutable surfaces/no revision-keyed publication. |
| Ordered tail solve | `tests/rig-tail-clearance-browser.ts` | Replay crowded feasible and infeasible poses in reversed ECS order. Check changing candidate boxes against one stationary neighbor, earlier tails against later bodies, final blocked flags and bounded attempts. | Parity is a green guard; shared-demand/reuse count missing. |
| Settled list and exact probe | `tests/corpse-terrain.test.ts` | Freeze a rotated off-root chunk; compare contact and swing heights with exhaustive boxes on cell edges and overlapping floors. Repeat reads, then independently move, hide, resize or change support underneath it. | Existing inverse cache hits, but list rebuilt and meshes revisited; local query absent. |
| Publication and retirement | `tests/cpu-settled-browser.ts`, `tests/cpu-regressions-browser.ts` | Sample living feet on first settled tick; resume motion, evict at cap, replace with same ID, reset and regenerate. Compare to visible final meshes; retain pre-change sample for inspection. | Settled-hit work ceiling fails; lifecycle parity should already pass. |

## Design

1. **Compute demand after final living body poses.** `src/actorRendering.ts:199–206` currently promotes a single tail request to a scene-wide sample. Use the existing actor list to collect tails needing `prepare` and their eligible neighbors. Share the inclusive distance predicate from `TailClearance.prepare` (`src/rigs/tailClearance.ts:215–225`); six units accounts for current long weapons, unlike the motor radius. Include the requester itself, neighbor equipment and carried cargo. Union by binding; keep per-requester membership so `prepare` need not rescan ECS. Start with the compact actor list, not a new global spatial index.
2. **Publish before consuming.** Publish every demanded final body/equipment snapshot before the first living tail solve. In stable entity-ID order, resolve each requester's neighbor bodies and only earlier IDs' *latest final tails*. Publish the tail-only result after each solve; preserve valid reused tails for final validation at `actorRendering.ts:237–249`. Keep the separate collapse path (own surfaces, no living neighbors). Never memoize `clear(candidate, segment)` from body revisions: a different candidate against the same box can hit.
3. **Give each publication an owner and a validity rule.** Use run, entity object and binding identity, not ID alone. At final writers track actual changes to solved pose, world transform (including parent, heading and scale), attachment/geometry, equipment, cargo frame/ownership and visible/enabled membership. Keep tail revision separate so solving a tail cannot dirty every body. Unpublished/dirty + demand → build and publish; clean + matching key → reuse; dirty without demand → defer; retirement → discard. Publish replacement numeric bounds, never mutate arrays/corners held by an inspection reader. If a writer cannot certify an unchanged input, revalidate it rather than guessing from elapsed time.
4. **Extend the existing corpse cache.** `src/corpseRendering.ts:12–66` already caches inverses by mesh but reconstructs the list, visits visible meshes and reads floor height per call. Keep those box entries; add local geometry revision to matrix/floor validity. Keep a run-owned published list per eligible corpse and aggregate bounds from **all enabled world boxes**, not its root. Rebuild membership/bounds only on changed publications. Maintain a local candidate query over those bounds: filter for the actual probe point (including each swing probe), then use the existing inverse-box slab test, floor gate, max union and cap. Keep an exhaustive read for review/debug callers; distinguish world-backed support from the no-world fallback.
5. **Publish contacts before living grounding** at `actorRendering.ts:118`, after physical binding or collapse writes. Active ragdolls are ineligible; first settled publication uses final matrices. Preserve non-ragdoll age eligibility, not age as a cache key. Changed physical pose, geometry/visibility, world/support or binding invalidates a settled entry; reactivation withdraws it until eligible again. Reconcile live membership before reads, including disposal, eviction and same-ID replacement. Reset drops the entire run's ownership. This is derived render data, not an ECS gameplay statechart or a new service.

### Alternatives rejected

- Shorter radius, root-only bounds or camera culling misses long weapons, scattered bones or off-camera neighbors. Use conservative membership and exact detailed tests.
- A second inverse cache or CPU4 collision-result reuse saves the wrong work. Measure list construction, mesh checks, support queries and aggregate visits separately.
- Skipping fixed steps would change history and shield reaction timing. CPU6b must prove that change separately.

### Round 1 disposition (historical)

- Demand comes only from living enabled tails. Body eligibility is separate from tail eligibility:
  a still-drawn crate or body can remain in the neighborhood after its carrier's tail is hidden.
  Withdraw stale links before an earlier-ID neighbor contributes its final tail. The renderer,
  not the rig's carry flag, owns scene-root crate membership and the sampled coffer/strap frame.
- Keep transient binding-owned solver buffers and copy on inspection read; do not pay per-piece
  immutable publication on every solve. The compact scan reduces busy/cargo neighborhood work,
  not distant candidate visits. Demand still avoids rebuilding distant full-body geometry.
- A frozen physics affine does **not** certify mutable mesh membership, visibility, geometry or
  terrain support. There is no complete notification contract for these inputs, so round 1
  removes partial subscriptions and revalidates conservatively. Unchanged numeric lists and the
  contact index are reused, but settled mesh/support visits are **not** eliminated. The measured
  settled/paused workload regressed; neither the zero-visit target nor a net timing win is closed.
- The actual tailed definition fixes the pre-existing solver fixture mismatch. All ordered
  browser suites were attempted; social and Firefox movement are still red on both CPU5 and the
  candidate. The hardware replay and visual spot checks are recorded in [verification](../../VERIFICATION.md#cpu6a--animation-geometry).

### Round 2 disposition (before follow-ups)

- The actor renderer closes membership only after building the social attachments. Its owned
  membership and mesh-edit revision, the binding's final physical pose/owner revision, root
  enablement, and the runtime support map identity/revision certify a settled publication. A
  mutable fixture world or unowned/replaced render component still scans. Intentional raw Babylon
  edits must use the writer or opt out. There is no per-mesh check on an unchanged certified read.
- The final living body writer tracks affine, cape, attachment and drawn-equipment changes
  independently of tail writes. The crate writer supplies actual carried geometry, frame and
  visibility. Demand still controls whether a dirty body is sampled at all.
- The death benchmark uses a fresh run and checks prelethal state, handoffs, entry and first
  settled direct and swing contacts before accepting a timing comparison. The independent oracle
  intersects face triangles built directly from drawn box corners. Cap eviction is tested separately.
- Social lethals compare per-mesh enablement straight before damage and after handoff, exercising
  both stowed and drawn. The movement fixture uses a 0.17-unit interior pointer bias and a separate
  exact-coordinate reroot check on the same navigator.

## File changes (implementation only)

| File | Change and reason |
| --- | --- |
| `src/actorRendering.ts` | Coordinate demand, publication, tail order and contact availability at existing phase boundaries. |
| `src/rigs/bindings.ts`, `src/rigs/tailClearance.ts` | Own versioned sampled geometry at the binding; consume conservative membership without caching clearance decisions. |
| `src/corpseRendering.ts`, `src/corpseTerrain.ts`, `src/rigs/grounding.ts` | Publish settled membership over existing per-mesh entries; route contact and swing samples through local bounds without changing heights. |
| `src/deathPhysics.ts` | At physical publication/retirement expose changed binding state if not already observable; leave physics and caps untouched. |
| `src/cpuMetrics.ts` and test files in table | Development-only counts and parity/replay fixtures to distinguish fewer rebuilds from work shifted into lookup. |

## Edge cases and failure modes

- Multiple fixed steps in one Babylon render ID → use simulation publication revisions, not render ID. Changed pose with identical root or overlapping demand must neither go stale nor publish twice.
- Disabled/hidden/disposed mesh, no world, no corpse, or no requester → preserve existing eligibility and floor fallback; empty membership supplies no contact. Unknown changed geometry → refresh affected entry conservatively.
- Off-root tread on another elevation → evaluate support at the piece, not at the corpse. An aggregate is a rejection bound, never a contact height.

## Verification gates

```sh
node --test tests/rig-tail.test.ts tests/rig-bindings.test.ts tests/corpse-terrain.test.ts
npm run typecheck
npm run check:full  # typechecked full/core+extended suite, lint, format:check
npm run build
npm run test:production
npm run test:cpu:production
```

Install browser binaries if needed (`npx playwright install chromium firefox`). Start `npm run dev -- --port 5173 --strictPort` in another terminal. Run sequentially, stopping on the first failure:

```sh
for suite in rig rig:solver rig:actions rig:tails rig:tails:clearance rig:shield \
  rig:shield:transitions animation defense social phalanx tribute combat movement jump \
  rig:handoff rig:handoff:landing ragdoll ragdoll:contacts skeleton:breakup discoveries \
  inspection cpu cpu:regressions; do npm run "test:$suite" || exit 1; done
BROWSER=firefox npm run test:movement
npm run profile:cpu
```

Compare repeated CPU5 and candidate sessions with identical seed, step count, actor state, camera and quality: solitary/distant actors, busy phalanx and cargo handoff, active deaths, piles of settled remains, paused inspection and regeneration. Separate instrumented counts from timing runs. Inspect tail, shield and corpse-foot captures; report repeat spread, regressions and actual commands/results for independent review before declaring ready.

## Risks and rollout

Stage living demand and settled reuse independently against the eager oracles. Missed writer invalidation is the main risk: perturb each input in isolation and verify same-step output. If revision maintenance or aggregate traversal erases the saving, keep the simpler measured path for that stage; do not weaken the clearance envelope, physics limits or contact oracle to pass a timing gate.

## Out of scope

CPU6b catch-up scheduling, LOD, animation frequency and history changes; CPU4 collision caching; CPU5 scene traversal; gameplay support/navigation, ragdoll dynamics, art changes and CPU7 integrated acceptance. CPU5's later cap/replacement regression is already included in `f3fa9a3`.
