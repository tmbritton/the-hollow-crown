# CPU performance plan — queries, collision, rendering and animation

**Status:** CPU0 through CPU3 are independently reviewed **READY**. Astra's final independent
CPU4 review returned **APPROVE with zero findings**. The [final independent CPU5 review](../VERIFICATION.md#cpu5--final-independent-review)
returned **APPROVE**; the later cap/replacement test landed in `f3fa9a3`.
[CPU6a received final independent **APPROVE**](../VERIFICATION.md#cpu6a--animation-geometry),
including both follow-ups, at `96849ae`. **CPU6b scheduler/LOD is deferred.** The [CPU7 investigation](cpu7-integrated-results.md)
was independently approved; performance targets were not accepted.
See [delivery evidence](../VERIFICATION.md) and the [CPU0 baseline/tooling](cpu-baseline.md). This plan retains the completed CPU investigation at
**`3cfb378`**; its historical measurements excluded concurrent shield-animation work. CPU0 must
refresh them against the reviewed A0–A7/P8/P9 integration before accepting optimization results.

**Integration audit:** updated against **`3bf6bb4`** on **2026-11-21**, after checking current
source and delivered animation contracts. This is a scope/acceptance update, not a new timing run.
CPU0 records the exact revision it actually measures; the source audit is not its completed baseline.

**Goal:** recover responsive frame times on the Ryzen 5 2600X-class desktop while preserving the
[compact living-dungeon direction](game-direction.md): autonomous inhabitants, readable combat,
procedural animation and approachable controls. Remove unnecessary work before reducing detail.

## 1. Evidence and limits

### Fixed-step baseline

Seed `MOURNING-731`, 25 actors, 2,382 scene meshes, AMD Ryzen 5 2600X, Chromium/SwiftShader,
800×450 viewport, Low quality. Each case regenerates the same seed, warms 120 ticks, then measures
240 ticks in yielding batches of 12. The player remains invulnerable to hold the encounter location;
other actors retain ordinary behavior. Scene rendering is excluded. Each measured tick is followed
by one presentation/UI update through the existing development harness.

| Mean milliseconds | Entrance, player idle | Stable encounter |
| --- | ---: | ---: |
| AI, combat and enemy movement | 6.77 | 7.93 |
| Actor animation | 3.41 | 3.51 |
| Complete simulation tick, including other work | 11.28 | 13.06 |
| Presentation/UI update | 0.45 | 0.47 |
| Combined, before scene rendering | 11.73 | 13.53 |
| Combined p95 | 16.70 | 18.30 |

The complete tick includes AI and animation: these rows must not be added together. The entrance
is quiet for the player, not for the whole dungeon; five actors have targets at the end of that
sample, compared with nine in the stable encounter. All 25 remain alive in these windows.

### Confirmed sources of work

- **Door accessors:** a separate 120-tick stable probe counted 323,060 `locked`, 291,492 `open`
  and 40,620 `angle` reads: approximately **5,460 reads/tick**. Two isolated runs reproduced those
  counts. The stable CPU trace attributed approximately **2.28 ms/tick inclusive** to the getters,
  already included in navigation/AI costs. Spatially irrelevant doors are often queried before
  geometric rejection, and spreading a live door into a geometry record invokes its getters.
- **Zero-motion collision:** 3,301 of 5,233 entrance collision calls (**63.1%**) and 2,231 of 4,589
  stable calls (**48.6%**) fell below the probe's **`1e-10` displacement-magnitude threshold**.
  They cost approximately **1.46/0.98 ms per tick** respectively. This measurement category does
  not establish that tiny nonzero movement is safe to skip. Actor proxies use Babylon's default
  scene-wide collision candidate search.
- **Replan hitch:** a later stable sample, ticks 361–660, recorded 24 plans, including one taking
  **217.5 ms**. The enclosing AI update reached 242.5 ms and the complete tick 247.3 ms. Full route
  searches are intermittent; frequent route validation and occasional large searches are distinct
  problems.
- **Animation:** all 25 actors receive grounding/binding updates each tick: 6,000 grounding samples
  per 240-tick case. Setup renders selected four or five actors with active meshes; those are setup
  snapshots, not continuous visibility measurements. Detailed stable means include grounding
  **1.18 ms**, bindings **0.66 ms**, surface snapshots **0.30 ms**, and tail solving **0.30 ms/tick**.
- **Catch-up:** two-tick batches spent **6.89 ms** on animation, four-tick batches **12.78 ms**, before
  rendering. The normal loop repeats simulation and animation for catch-up, subject to its existing
  80 ms elapsed-time cap.

### Rendering evidence is diagnostic

Hardware WebGL was unavailable in the isolated headed check. A separate disposable browser
suppressed raw GPU draw commands while retaining scene evaluation and other GL calls. Its final
warmed Low-quality window measured **9.37 ms mean / 9.20 ms median** for `scene.render`, including
**5.52 ms mean** for active-mesh evaluation. High-quality preparation averaged 13.22 ms.

These are CPU-side preparation/submission observations, **not hardware FPS, complete GPU/driver
cost, or a controlled High-versus-Low speedup**. The first Low window contained a 612.5 ms render
outlier; simulation continued between windows. Do not sum these results with the fixed-step table
to predict exact FPS. They justify measuring scene traversal separately from pixel/shadow cost.

### Evidence retention

The investigation ran in `/tmp/opencode/the-hollow-crown-perf` at
`3cfb378904eac87a8ccb11bea4bf358d6d26281e`; the source snapshot SHA-256 was
`ba3ef7d70cf1d4b3527c5c31f482e3168f93ac52c5a24f716a561195995ea3ca`.
Local artifacts include `test-results/cpu-investigation.md`, `cpu-breakdown-HEAD-software*.json`,
CPU traces/rankings, `cpu-breakdown-runner.mjs`, and `validate-cpu-measurements.mjs`. Validation passed
across 2,064 timing samples, checking fingerprints, counts, finite timings and reported browser errors.
These ignored artifacts may be absent in a fresh checkout. This section preserves the findings;
CPU0 below makes the reusable measurement method part of the project before relying on it as a gate.

### Delivered changes since the measured baseline

The scheduling update placed this workstream next; the source audit below updates what its optimizations
must account for. The original all-living timing table does not describe these new workloads.

| Delivered slice | Current ownership / source | Consequence for the CPU pass |
| --- | --- | --- |
| **A6 shield motion** — `7e6616d` | `src/blockFeedback.ts`, `src/rigs/shield.ts`, `src/rigs/actions.ts`: accepted-hit batches, supporting springs, constrained lowering/re-raise and phalanx opening | Stationary actors can still need animation. Delaying feedback consumption can replace or expire a block; geometry caching must follow shield pose/visibility, not just motor movement. |
| **A7 cutover/handoff** — `27945e0` | `src/rigs/bindings.ts`, `src/rigs/history.ts`, `src/deathHandoff.ts`: semantic final writer, completed fixed-step history and detached pre-stop lethal capture | Instrument current semantic paths. Velocity extraction is already on demand. Reduced solving must preserve adjacent-step articulation and once-only motor/support/ballistic inheritance; the legacy adapter is gone. |
| **P8 physical deaths** — `14f441c` | `src/deathPhysics.ts`, `src/ragdoll.ts`: run-owned admission, world contacts, constrained bodies/tails, settling and terminal retirement | `animateActors` now contains physics stepping as well as visual solving. Active physical time cannot be deferred with mesh binding; measure cold admission, active simulation and settled publication separately. |
| **P9 skeleton breakup** — `3bf6bb4` | Separated body mode, per-piece terrain patches, binding `bodyMeshes`, dynamic observation radius and same-piece player/camera checks | Root-only visibility/contact neighborhoods are insufficient. Geometry merges must respect separate death chunks; preserve the original logical death identity and actual eligible surfaces. |

Relevant implemented contracts: [shields](rig-shields.md), [handoff](rig-handoff.md),
[ragdolls](ragdoll-deaths.md), and [skeleton breakup](skeleton-breakup.md).

Current paths to distinguish in profiles:

- `main.ts` advances combat/hazards, commits objective work and respawns the hero **before** shared
  animation. Accepted lethal damage captures the pose before cancellation and invokes death
  observation inside combat, before the next animation pass.
- `animateActors` first calls `advanceDeathPhysics`, finishes any synthetic no-handoff collapse,
  reads settled corpse surfaces, solves living body/equipment poses, then publishes surfaces and
  solves tails in stable-ID order. Its timer is no longer synonymous with living animation cost.
- Active islands step at up to three 1/180s substeps per 1/60s caller update. Settled islands retain
  no backend bodies, but `DeathPhysics.advance` still reapplies their matrices/history and refreshes
  the logical root/support; `readCorpseTerrain` still visits their meshes. These are **candidates to
  measure**, not established dominant bottlenecks. Corpse inverse/box entries are already cached
  by mesh matrix and support height; avoid crediting that existing cache as a new optimization.
- All eight skeleton deaths use 88 bodies without constraints. The ordinary simultaneous 24-enemy
  burst uses **312 bodies / 208 constraints** across at most 24 islands. P8's old 288-constraint
  count is historical. Retained scene geometry does not increase per death, so mesh counts alone
  cannot reveal active physics or repeated settled publication cost.

## 2. Contracts to preserve

- Gameplay remains fixed at **1/60 second**. Off-screen inhabitants continue movement, combat and
  objective work under the same rules. Low quality changes presentation rather than outcomes.
- Preserve the tick's door → player movement/pursuit → combat/hazards → objective commit ordering.
  Death or interruption at a work boundary must still cancel unfinished credit.
- Door charts own mutable state. Retain shared entity identity and snapshot-backed access; any
  cached derived view must invalidate with its authoritative snapshot/collider state.
- Maintain safe route clearance, exact/partial floor destinations, live-body blocking, door opening,
  altar gating, jump clearance, 52% grounded water speed and full-speed corpse traversal.
- Preserve camera observation, discovery attribution, picking, character shadows, cutaways and
  inspection. A rendering optimization must not manufacture a witnessed event or hide a valid target.
- Pose detail never determines damage, navigation or support height. Drawn corpse/contact geometry,
  grip positions and death-pose history still need coherent presentation snapshots.
- Preserve A6's immediate protective frame, feasible re-raise continuity and once-only accepted-block
  consumption. A motionless motor does not imply dormant shield, action, contact or tail state.
- Preserve A7's exact captured pose and pre-stop velocity, P8/P9's once-only admission/seed order,
  exact entry publication before the first physical step, and same-tick hero respawn without debris.
  Active physics stays on the fixed-step clock even when its geometry is off-screen.
- Preserve world-only death contacts, authored masonry/door height and discrete stair treads.
  Flying pieces are not footholds. Settled bones retain their actual surfaces and one logical
  discovery identity; final clearance tolerances are not an all-frame nonpenetration guarantee.
- Pause, focus loss, teleport, death, regeneration and scene disposal retain explicit reset/cleanup
  behavior. New caches have bounded ownership and retire with the world or actor that owns them.

## 3. Delivery sequence and integration

These are the next feature-sized investigation/implementation slices. Each gets its own before/after
evidence and acceptance review. Deliver **CPU0 → CPU1 → CPU2 → CPU3 → CPU4 → CPU5 → CPU6a → CPU6b
→ CPU7**, then EF0–EF4. CPU2 retains an independent CPU0 comparison despite its delivery position.
CPU5–CPU6 must preserve the completed rig, ragdoll and separated-remains ownership contracts.

| Slice | Scope | Depends on |
| --- | --- | --- |
| **CPU0** | Complete; independent review READY — [baseline and tooling](cpu-baseline.md) | `013079c` plus recorded implementation source hash; software diagnostics and desktop hardware baseline |
| **CPU1** | Spatially relevant door/blocker queries and cheap geometry records | CPU0 |
| **CPU2** | Zero-displacement movement fast path | CPU0; measure independently of CPU1 |
| **CPU3** | Reproduce and bound expensive route replans | CPU1; CPU2 integrated for comparison |
| **CPU4** | Bounded nearby collision candidates | CPU2–CPU3 |
| **CPU5** | Lower CPU scene traversal, transform and repeated frozen-publication cost | CPU0–CPU4 results; A7/P8/P9 binding and chunk identities |
| **CPU6a** | Demand-driven/cached animation and settled-contact geometry | CPU5 review; current grounding/tail/shield and scattered-remains contracts |
| **CPU6b** | Separate presentation solving from catch-up and add animation LOD | CPU6a; fixed-step physics/feedback/history separation proven before throttling |
| **CPU7** | Integrated frame-time, resource and visual acceptance | Delivered slices plus the full-rate CPU6b subset, not the deferred scheduler |

The [implementation path](implementation-path.md) records the user's promotion of this queue after
P9. Refresh CPU0 on the delivered revision, including A7's cutover, P8's pose/velocity handoff and P9's
separated anatomy, per-piece terrain and scattered-remains perception. The Effect prerequisite
remains attached to future procedural-feature expansion and follows CPU7.

## 4. Scoped work and acceptance

### CPU0 — make the measurements repeatable

Promote the useful parts of the temporary probe into bounded development tooling and meaningful
fixtures. Capture revision/source identity, seed, browser, renderer, viewport, quality, host load,
warmup, sample count, actor states and timer scope. Keep diagnostics out of production builds.

Measure simulation, animation, presentation and scene evaluation separately. Record p50/p95/max,
tick counts per rendered frame, door reads, collider candidates, route searches, per-phase planning
work (including expanded nodes), grounding/pose/surface evaluations and allocations. Child timings
remain labeled inclusive.
Separate exact-zero displacement counts from tiny nonzero movement before selecting CPU2's fast path.

Use the entrance and stable cases above, the later 361–660-tick hitch window, and representative
movement, doorway, phalanx, cargo, corpse and regeneration situations. Reproduce the exact costly
request with actor/request IDs, endpoints, route reason and occupancy/door revisions; the original
profile establishes a spike but does not identify a fully pinned single-request regression fixture.

Include ordinary active ragdolls, skeleton breakup, settled remains and a separately labelled
all-enemy death burst. Attribute death-physics stepping/terrain work within animation instead of
conflating active simulation with settled mesh/binding cost. Record cold/active/settled resource
counts; the existing P8/P9 stress timings include frozen updates and are not a fresh CPU0 baseline.

#### Post-animation measurement matrix

| Case | Controlled inputs and observations |
| --- | --- |
| All-living entrance/stable and late hitch window | Preserve the old workload recipe for comparison, but fingerprint current actions/targets, seed and revision. Separate zero motor displacement from active pose work. |
| Shield/phalanx transitions | Idle guard, moving raise/lower/re-raise, multiple accepted hits at one timestamp and consecutive timestamps, opening/thrust/recovery, tail response and cargo handoff. Count consumed feedback, spring updates, projection/solve work and changed surfaces. |
| Cold lethal handoff | Real accepted melee, bolt, javelin and hazard deaths during turning, work, block reaction, jump and landing. Time snapshot/velocity extraction, shape capture, island/static construction and exact first publication separately from ordinary ticks. |
| Active articulated and separated deaths | Goblin/kobold and skeleton cases on flat ground, stairs, closed/opening doors and masonry; include pieces outside the root neighborhood. Count substeps, bodies/constraints, terrain-key checks/rebuilds, static add/removal, contacts and binding writes. |
| Settled remains and crossing | Same deaths after all solver resources retire, plus living walk/run crossings. Count remaining record traversal, matrix/history publication, corpse-list visits/cache hits, foot queries and observation preparation. |
| Population burst and cleanup | The separately labelled all-24 burst, active/settled distributions, menu/inspection/hidden pause, visible blur, hero respawn and repeated regeneration. Record allocation/retirement peaks and post-cleanup plateaus. |
| Real render cadence | Equivalent input streams under zero/one/multiple ticks per displayed frame, Low/High quality and camera/inspection changes. Keep this separate from the synthetic one-presentation-update-per-tick harness workload. |

Create physical-death cases through accepted combat damage, not solely by installing a `corpse`
component: the latter can exercise the retained synthetic collapse rather than P8/P9. Fix event times,
source/target identities and admission order so seeded death variation remains comparable. Report
living, synthetic-collapse, active-articulated, active-separated and frozen populations per window.
Exclude post-freeze portions from **active-only** physics timing summaries, while retaining separate
whole-scenario totals and all updates until an island settles. Gate instrumentation against gameplay,
feedback consumption and physical pose/resource traces so measuring snapshots does not itself
create work or change state.

**Gate:** same-seed runs reproduce workload counts and authoritative state; bounded instrumentation
does not change outcomes. Measure coarse/uninstrumented timing separately from detailed tracing,
alternate baseline/candidate order, and avoid simultaneous heavy browser suites. Record multiple
runs and distribution spread. Establish a real hardware Low/High baseline when WebGL is available;
software rendering or suppressed draws remain explicitly diagnostic.
Root and Pages production smokes must also confirm that the new instrumentation stays development-only.

### CPU1 — avoid unnecessary door and obstacle queries

**Touchpoints:** `src/navigation.ts`, `src/combat.ts`, `src/machines/world/interactions.ts`,
`src/worldEntities.ts`, `src/ragdoll.ts`, and existing world/spatial data.

1. Reject doors outside a point/segment's conservative bounds before reading chart-backed flags.
2. Pass explicit geometry fields instead of spreading mutable entities into intersection records.
3. If repeated local queries remain expensive, share immutable door bounds and a per-world spatial
   index. Include footprint clearance and swept segments; retain references to the actual doors.
4. Profile before adding derived-state caches. If needed, key them by the authoritative snapshot
   and relevant collider revision, including opening animation's solidity threshold. Never mirror
   mutable `open`/`locked` flags with an independently maintained truth source.
5. Apply the same broad-phase approach to repeatedly scanned static blockers where the trace
   demonstrates a benefit. Preserve exact narrow-phase geometry checks.
6. Include death-physics door reads in the refreshed count. `Ragdoll.syncTerrain` currently reads
   door collision state across the run for each active island's cache key, and terrain rebuilding
   inspects door state before distance rejection. Measure these separately from AI/navigation.
   A local key/query must cover the **union of every piece's patch**, detect newly relevant doors
   when pieces cross cells, and retain the opening collider threshold and stable terrain ordering.

**Gate:** old/new query results agree for open/closed/opening/closing/locked doors, both segment
directions, thin walls, ramps and room corners. Door changes take effect at the existing tick
boundary, including multiple queries within a tick. Distant doors should incur no state reads in
a local-query regression. Use CPU0 to set reduction targets for the refreshed living/active-death
workloads; demonstrate material whole-tick improvement rather than only a faster isolated getter.
The historical 5,460 reads/tick is not a current measurement. Verify articulated and separated
contacts across door changes; a distant door change should not rebuild unrelated patches after
any local-cache optimization.

### CPU2 — stop searching collision space for zero displacement

**Touchpoints:** `src/actors.ts`, `src/occupancy.ts`, `src/actorRendering.ts`, `src/locomotion.ts`.

Introduce a narrow stationary path when the requested displacement is truly zero and no explicit
resynchronization/depenetration policy requires a sweep. Preserve velocity/acceleration settling,
facing, jump clocks and landing, support sampling, collision-proxy synchronization, route progress,
door waiting and cancellation. Treat tiny real movement separately; an epsilon must not erase
arrival motion or change a route endpoint. Keep the existing moving clip-and-slide path initially.

This is a movement-sweep optimization, not a whole-actor sleep decision. Preserve A7's
`movement.supportVelocity` maintenance, including clearing stale support derivatives on stationary/
locked steps. Shield recoil, lowering, pending feedback and living rig history may still advance.

**Gate:** stationary supported actors avoid terrain collision sweeps while all lifecycle/grounding
updates remain correct. Exercise idle, held blocked movement, braking, jump-in-place, standing on
stairs/water, blocked doors, actor overlaps, teleport and respawn. Compare actual paths, support,
attack/work outcomes and arrival state, not just call counts. Re-measure the entrance and stable
zero-motion cost independently before combining with CPU1. Add lethal landing/stationary stair
boundaries and stationary shield reactions so the fast path cannot retain airborne Y velocity or
suppress presentation events.

### CPU3 — remove route-planning hitches without stale routes

**Touchpoints:** `src/navigation.ts`, `src/koboldSquads.ts`, `src/combat.ts`, `src/occupancy.ts`.

Start from CPU0's pinned costly request. Separate candidate generation, repeated clearance work,
search expansion, smoothing and invalidation cost. Re-measure after CPU1 before changing algorithms.
Cache immutable clearance/topology, avoid redundant requests with identical relevant inputs, and
scope dynamic invalidation to geometry that can affect a route. Distant actor movement should not
discard unrelated useful work; an actor entering the swept route must invalidate it immediately.

If the original late-window spike no longer reproduces after the delivered features and CPU1/CPU2,
record that result and pin the current worst reproducible request instead. The historical 217.5ms
sample is evidence for investigation, not a claim about present request cost.

Prefer reducing synchronous work first. If a remaining search cannot fit the selected budget,
design deterministic incremental search as a separate sub-slice with these contracts:

- **Total planning-work budget:** share a deterministic per-tick bound across all requests and
  phases, not only node expansion. Include candidate generation/sorting, clearance queries,
  expansion, closest-reachable selection/refinement, reconstruction, smoothing, invalidation/repair
  and final result validation. Each phase must participate in the budget or have a demonstrated
  bounded synchronous cost accounted for in the aggregate limit. Several searches finishing
  together must not move unbudgeted work into one long completion tick.
- **Queue and progress:** bound/coalesce queued requests, use deterministic fair ordering, and
  define explicit pending/blocked states, cancellation/replacement and safe behavior while waiting.
  Test a bounded-wait/termination policy under declared workload and input-change limits. Repeated
  repairs or restarts must not silently starve a request. Wall-clock execution time must not choose
  gameplay results.
- **Pending input consistency:** define snapshot ownership and relevant revisions for the world/run,
  actor/request identity, origin/goal and traversal capabilities, door/collider state and occupancy.
  Specify how a pending search responds to relevant changes: deterministic repair, restart or
  rejection. Refreshing live inputs while retaining incompatible cached links, including rejected
  links, must not create a search assembled from contradictory world states. Dependencies include
  relevant explored/rejected frontiers and alternatives, not only the eventual chosen route.
- **Publication validation:** before applying a successful route, partial destination or unreachable
  conclusion, validate the current request/origin and relevant world dependencies. Reject, repair
  or restart stale results under the same deterministic policy. A blocker leaving a choke or a door
  opening can invalidate a negative/partial result just as a new obstruction can invalidate a route.
  Spatially unrelated changes should preserve useful work rather than causing global invalidation.

These consistency and publication rules apply to main-thread incremental searches as well as any
later worker-offloading alternative. Worker offloading remains a separate option, not the default fix.

**Gate:** bring CPU0's refreshed expensive request within the selected bounded-work/latency budget.
Preserve route quality, nearest-reachable semantics, physical clearance, valid door operation, phalanx recovery and
tribute takeover/delivery. Report per-phase work, aggregate per-tick planning work, calls and worst
request latency over adversarial fixtures and multiple seeds. Include multiple requests finishing
together, long paths with costly smoothing, and unreachable/partial searches with frontier refinement.
For pending searches, change doors and move blockers both into and out of relevant geometry; also
exercise actor death, origin movement/teleport, goal replacement and regeneration. Check publication
of successful, partial and unreachable outcomes against the current world, including recovery when
a previously blocked choke clears. If requests span ticks, specify and test the new latency/activation
contract explicitly; do not present changed gameplay timing as an invisible optimization.

### CPU4 — limit collision candidates to relevant geometry

**Implementation status:** Implemented and independently approved; see [Astra's final review and verification evidence](../VERIFICATION.md#cpu4--final-independent-review).
Synchronous [partial-route planning](plans/cpu4-partial-route-locality.md) uses one pinned
occupancy view for collision probes and a separate complete list for cache identity. The crowded
detour and reachable frontier match full scan without reading distant candidates in indexed
narrow-phase probes. Short pursuit also uses the bounded lookup; CPU3 deferred planning still
uses detached body data and its existing scheduler.

**Touchpoints:** `src/actors.ts`, `src/occupancy.ts`, `src/actorRendering.ts`, `src/buildDungeon.ts`,
`src/worldEntities.ts` and collision adapter contracts. Evaluate a world-owned spatial index or the engine's candidate-list mechanism
against the refreshed installed library version during implementation.

Index collision geometry separately from decorative render meshes. Query a conservative swept
actor volume, including ellipsoid size, movement direction, elevation and clip/slide response.
Account for doors, stairs, large footprints, chunk boundaries and multi-step movement. Refresh
candidates for every actual sweep/slide where necessary; a camera-frustum list is insufficient.
Use the current full scan as a test oracle and explicit fallback for unsupported arrangements.

For living actor-to-actor queries, prioritize shared prepared body records and a run-owned spatial
index over repeated whole-registry scans and per-actor body-list allocation. Give each synchronous
query a stable view, then publish accepted movement before later actors query in the same tick.
Preserve the existing sequential movement semantics. Update relevant bounds/membership after movement,
height or body-size changes, death, removal and teleport; replacing the run retires its index.

Reuse genuinely symmetric overlap work by canonical unordered pair when both entities' geometry
versions match; orient any contact normal appropriately for the caller. Swept movement results also
depend on mover, origin, displacement, support and query policy. Checking A's proposed move against B
does not establish the result for B's different move against A. Cache identity must include run/entity
identity and relevant transform/shape revisions; a pair of IDs plus a tick number is insufficient
because movement and sliding can change geometry within that tick. Repeated-ID replacement cannot
inherit an old result.

Measure body-record builds, candidate counts, repeated identical queries, cache hit rate and lookup/
invalidation overhead before adding narrow-phase result memoization. For cheap cylinder tests, use
the shared data/index improvements first and retain result caching only when it shows a net benefit.

Keep the living motor's collision candidates distinct from P8/P9 terrain streaming. Rendered bones
remain passable; they must not enter the living obstacle index. A shared spatial lookup may reuse
immutable bounds, but physical deaths still need discrete treads, wall base/caps and full door
apertures rather than the motor's smooth ramp or camera-cutaway geometry. Every separated piece's
patch participates; a root-only query or rectangle spanning the entire scatter is not equivalent.

**Gate:** candidate scans scale with the nearby collision environment instead of all 2,382 render
meshes. Full-scan and indexed adapters agree on displacement across seeded paths, high-speed/diagonal
motion, walls, gates, ramps and live occupancy. Opening/closing or regenerating a door cannot leave
a stale candidate set. Bounds and resource ownership are measured and tested.
Compare cached/indexed and uncached actor queries through both movement directions, blocked/escaping
overlaps, sliding and same-tick A-then-B updates, including death/teleport/body changes and entity
replacement. A reused result must remain valid for the exact current query.

### CPU5 — reduce scene traversal and transform overhead

**Delivered and independently approved:** publish each settled ragdoll's final transform once
and retire scene-owned caster and observation records. Camera candidate pruning, rigid merging,
instancing and cutaway write changes were not retained. See the [CPU5 plan and closeout](plans/cpu5-scene-traversal.md).

**Touchpoints:** `src/geometry.ts`, `src/buildDungeon.ts`, `src/player.ts`, `src/enemyRendering.ts`,
`src/rigs/bindings.ts`, `src/deathPhysics.ts`, `src/observation.ts` and `src/main.ts`.

Profile active-mesh evaluation into visibility checks, hierarchy/matrix updates, bounds and material
readiness. Retain existing static spatial/material batching. Investigate merging rigid pieces that
share a material and move together, bounded instancing, and reuse of unchanged static transforms.
Keep articulated joints and independently changing equipment/cutaway parts separate where needed.

For skeletons, a merge group must remain rigid in **both living and separated-death lifecycles**.
Skull/jaw/eye details and the coherent ribs/spine are candidates within their own groups; combining
pelvis, ribs and limbs merely because they share a material destroys breakup. Preserve `physicsShapes`
capture, chunk representatives, attachment visibility, shadows, selection and logical identity, or
replace those mappings explicitly before disposing old meshes. Do not add per-voxel physics bodies.

Measure the repeated `applyPhysics` path for frozen islands. A settled-publication fast path may
reuse the final affine matrices/envelope and stable history instead of dirtying the same bindings
each tick, but must validate reset/removal/teleport/disposal and preserve actual corpse/observation
reads. Retain exact frozen affine world matrices: reconstructing them as local TRS beneath scaled
parents can reintroduce P8's shear/contact defect.

Use conservative room/chunk visibility with margins and correct camera rotation/zoom/inspection
handling. Track visible shadow contributors independently of camera-visible meshes. Picking,
observation and collision should use explicit logical mappings when render geometry is consolidated.
Choose selective caching over globally freezing the active mesh list or dynamic bounds.

P9's live world-space envelope can extend far beyond the pelvis and survives settling. Frustum,
room, shadow and observation rejection must include all chunks; do not restore the old 4.8-unit
intact-body envelope. Discovery uses at most eleven representative surfaces, with player eligibility
and camera visibility on the **same** surface, versus three defaults for ordinary rigs. Preserve
off-root occlusion as well as finding a distant bone without duplicating or revealing death identity.

**Gate:** measured active-mesh/transform work falls on equivalent camera/state samples. Inspect
screenshots and animation sequences for silhouettes, lighting, cutaways, equipment and shadow parity.
Verify target picking and observed-versus-unobserved discovery events. Three-or-more regenerations
must plateau in scene, mesh, effect and cache resources. Any rendering merger must update the rig
surface/observation contracts before old meshes are removed.

### CPU6a — only construct animation geometry when needed

**Status:** Independently approved, including both follow-ups. See the [slice plan](plans/cpu6a-animation-geometry.md)
and [closeout evidence](../VERIFICATION.md#cpu6a--animation-geometry).

**Touchpoints:** `src/actorRendering.ts`, `src/rigs/bindings.ts`, `src/rigs/tailClearance.ts`,
`src/corpseRendering.ts` and grounding/contact consumers.

Build a conservative demand set for full body/equipment surfaces: actors with active tails and
their possible neighbors, carried cargo and the current long-weapon envelope. Publish all required
body surfaces before solving tails, retaining deterministic ID priority and final pair checks.
Reuse unchanged snapshots using explicit pose/equipment/visibility/world revisions. Cache settled
corpse surfaces with invalidation for any later death-physics motion or lifecycle reset.

Extend the existing per-mesh corpse-box cache rather than duplicating it. Profile remaining list
construction, visibility/matrix checks, support lookups and aggregate neighborhood traversal. Use
run/entity/binding identity plus pose/geometry/visibility/support revisions, not only corpse age or
root coordinates. Active → settled publication must make the final surfaces available before living
foot queries; removal/reset must withdraw them. Neighborhood bounds must include scattered pieces.
Shield movement, stow/throw visibility and cargo handoff can invalidate geometry without root travel.
Preserve immutable sampled snapshots for zero-time inspection and avoid full-scene preparation.

Keep this prepared-geometry reuse distinct from collision-result reuse in CPU4. Tail clearance tests
can change their candidate pose while the neighboring body stays still; any memoized detailed test
needs the actual shape/snapshot revisions and candidate inputs. Retain the existing once-per-unordered-
pair final tail validation and stable-ID solve priority.

**Gate:** distant actors outside every relevant contact neighborhood incur no unnecessary surface
rebuilds. Nearby participants retain same-frame anatomy/equipment clearance, no falsely clear tail
overlap, bounded infeasible fallback and ECS-order independence. Grounded feet still sample the
drawn corpse geometry; corpses remain passable and cannot change support/navigation.

### CPU6b — separate presentation solving from simulation frequency

**Status: deferred — scheduler/LOD performance gate unmet.** Keep the
[full-rate subset](plans/cpu6b-retained-subset.md) for ownership and observability only.
The contract below is for any future scheduling work, not a description of the retained code.
The subsequent CPU7 investigation did not reopen the scheduler or establish an FPS pass.

Introduce explicit stages for fixed-step motion/action/feedback state, death-physics advance and
consumer publication, expensive living pose solving, and mesh binding. Prove the stage boundaries
before throttling the solver or adding detail tiers. Preserve caller-owned clocks and required
fixed-step history while allowing only eligible solve/binding work to serve the final displayed state.

**Current implementation traps to resolve in the design:**

1. `animateActors` is not a purely cosmetic callback: it advances P8/P9 physics first. Moving it
   wholesale after the catch-up loop loses simulation time; `Ragdoll.advance` clamps each call to
   1/60s. Keep every fixed physics step, age/quiet dwell, deterministic admission/overflow order and
   terrain update. Decouple mesh application only when contacts, bounds, observation and corpse
   consumers have a coherent current snapshot. Exact entry publication precedes the first step.
2. A6's mailbox retains one simulation-time batch, replaces it at a newer timestamp and expires
   it after 1/30s. Consume and integrate accepted feedback at fixed-step boundaries even when mesh
   binding is deferred, or prove an equivalent bounded representation. Two hits on successive
   catch-up ticks must both affect the eventual reaction; a zero-time sample must not consume either.
   Retain immediate protection, controlled lowering, feasible re-raise pose/velocity and tail response.
3. A7 captures before cancellation using the last completed solved pose rebased to the current
   death transform. Sparse display poses cannot supply its adjacent-fixed-step joint/body velocities.
   Define a bounded reconstruction/history policy before reducing solves, or retain solving for
   that dependency. Do not divide a multi-tick displacement by 1/60s, add root velocity twice, or
   replace grounded support velocity with stale airborne history. Snapshot extraction is already
   on demand; this slice must not turn it into a full extraction for every living actor every tick.
4. Death witnessing runs inside accepted combat damage, before end-of-tick animation; remains
   discovery runs during presentation. Refreshing geometry only just before `scene.render` is too
   late for the former. Document which completed/event-time snapshot each consumer receives without
   changing knowledge, killer attribution, once-only admission or same-tick hero respawn.

Define conservative detail tiers: full detail for the player and visible/nearby/inspected actors,
shadow contributors and contact-relevant neighbors; reduced or deferred expensive presentation for
distant actors. Apply hysteresis and bounded refresh latency. Refresh before re-entry, inspection
or any observation that requires current drawn geometry. Visibility must not throttle AI or work.

Treat camera observation/death witnessing, corpse contacts, block feedback, attack release/impact,
and death/ragdoll pose/velocity capture as explicit consumers. Provide event-time refreshes/history
where required rather than relying on a stale last-drawn pose. Integrate springs and movement over
elapsed simulation time with validated subdivision/analytic policies; skipping updates must not
change cadence, introduce foot drift or make tails snap on return.

**Gate:** compare identical inputs under zero/one/multiple ticks per display frame and different
render rates. Simulation outcomes, routes and impact clocks agree; visible poses, contacts, grips,
shield reaction and death handoffs meet existing tolerances. Exercise off-screen → visible →
inspection transitions, camera rotation, long pauses, teleport, regeneration and deaths between
frames. Record solve/binding counts per tick and displayed frame, including event-critical refreshes.
Update the documented architecture and model partitions before accepting changed scheduling.

Specifically replay several accepted blocks and a lethal hit at **each position within a catch-up
batch**, including off-screen actors, a landing boundary and an opening/withdrawal transition.
Compare handoff matrices/velocities, seeded physical trajectories, active → settled timing, final
surfaces, observation outcomes and resource retirement, in addition to authoritative gameplay.
Zero-tick frames, menu/inspection/hidden pause and visible blur must retain their existing policies.
Lower detail must not reduce physical stepping or silently discard accepted block reactions.

## 5. Performance targets and verification

**CPU0 must finalize budgets on the integration revision.** The following are proposed targets,
not achieved results or portable CI timing assertions:

- Aim for **60 FPS on the reference desktop**, using a complete hardware-rendered frame budget of
  16.7 ms. Target a warmed main-thread update/submission p95 below approximately **12 ms** to leave
  headroom; confirm GPU/compositor behavior separately rather than adding unrelated CPU/GPU medians.
- Seek at least **30% lower median combined tick/presentation cost** in both baseline cases before
  considering the CPU pass successful. No new p95/max regressions in adversarial scenarios.
- Target **≤4 ms per synchronous route search** on the pinned hitch fixture, or an explicit bounded
  total planning-work budget across phases and requests with tested result validity and end-to-end
  latency contracts. Record any unmet target.
- Ordinary idle actors should issue **zero terrain sweeps**. Local query tests should read only
  geometrically relevant door state. CI should enforce work bounds and correctness, not noisy FPS.
- Re-measure active-mesh evaluation and full animation costs; promote only changes whose gains
  exceed baseline spread and survive whole-frame measurements. Avoid accumulating nominal savings
  from overlapping counters.
- Set distinct CPU0 budgets for cold admission, active articulated/separated deaths and frozen
  publication/contact queries. Retain P8/P9's operation/resource ceilings (three substeps, sixteen
  solver iterations, 24 active islands, eight-second lifetime and bounded patch unions); record any
  deliberate contract change separately rather than meeting a timing target by reducing physics.

### Correctness and browser gates

Use focused `node --test` cases while iterating, plus type checking. Add regressions for changed
invariants: query equivalence, cache invalidation, zero-motion lifecycle, swept candidate completeness,
pending-route behavior and presentation scheduling. Extend machine models for changed states/guards.

| Area | Existing affected browser checks |
| --- | --- |
| Queries, routing, collision | `npm run test:movement`, `npm run test:combat`, `npm run test:phalanx`, `npm run test:jump`, `npm run test:tribute`, `npm run test:last-ember`; add death-contact suites when sharing terrain/door queries and handoff/landing for support fast paths |
| Scene/mesh changes | `npm run test:inspection`, `npm run test:discoveries`, `npm run test:portraits`, `npm run test:skeleton:breakup`, affected combat/animation suites |
| Rig/scheduling changes | `npm run test:rig`, `npm run test:rig:solver`, `npm run test:rig:actions`, `npm run test:rig:tails`, `npm run test:rig:tails:clearance`, `npm run test:rig:shield`, `npm run test:rig:shield:transitions`, `npm run test:animation`, `npm run test:defense`, `npm run test:social`, plus the death/handoff row for CPU6b |
| Death physics and handoff | `npm run test:rig:handoff`, `npm run test:rig:handoff:landing`, `npm run test:ragdoll`, `npm run test:ragdoll:contacts`, `npm run test:skeleton:breakup`, `npm run test:discoveries` |

Targeted suites require a development server. Select the affected checks per slice and run
rendering-heavy suites sequentially. Refresh this list for newly landed animation/shield checks.
Use supported Firefox variants for cross-browser input/rendering concerns and review relevant captures.

Existing focused contracts include `tests/block-feedback.test.ts`, `tests/rig-shield.test.ts`,
`tests/rig-handoff.test.ts`, `tests/rig-bindings.test.ts`, `tests/ragdoll.test.ts`,
`tests/skeleton-breakup.test.ts` and `tests/observation.test.ts`. The catch-up/LOD matrix above needs
new regression coverage during CPU6b; existing passing fixed-cadence suites do not prove it already.

For code deliveries, run `npm run format:check`, `npm run lint`, `npm test`, and `npm run build`.
Cross-cutting query/collision/scheduling changes also require `npm run check:full`, along with affected
browser checks and the production smoke check. Reuse trustworthy completed checks during independent
review; add targeted probes for suspected gaps instead of repeating broad suites without cause.

## 6. CPU7 — integrated acceptance and remaining GPU work

See the [CPU7 execution report](cpu7-integrated-results.md) for the approved negative investigation.
Measured desktop budgets are unmet, strict matched-start speedup is inconclusive, and GPU
attribution is unresolved. The criteria below remain the performance contract, not a pass verdict.

Repeat bounded baseline/candidate sessions at equal seeds, actor states, elapsed simulation times,
camera paths and quality settings. Include idle, travel, doors, busy phalanxes, repeated shield
reactions, cargo, active articulated/separated deaths, accumulated settled bones, off-root
observation, inspection and regeneration. Record single-step and real-frame costs, catch-up distribution,
p95/max hitches, allocations, resource plateaus and visible artifacts. Use a quiet desktop for
timing; compare the M1 as a secondary platform without treating its absolute timings as the desktop's.

Require a real hardware-rendered profile for a hardware FPS claim. If unavailable, record that gate
as pending and report only the CPU/operation-count evidence actually obtained. Accept incremental
CPU improvements honestly without labeling the full frame-rate goal complete.

Only then decide whether GPU work warrants native-resolution defaults, cheaper shadows/antialiasing,
or generation-time baked illumination. A bake would need a deliberate static/dynamic split for
characters, doors, the player-following shadow frustum and camera cutaways. It is a later measured
option, not a prerequisite for the CPU fixes or an assumed cure for the observed slowdown.

Each implemented slice follows the [delivery loop](implementation-path.md#delivery-loop): verification,
automatic independent review, fixes/follow-up review, and truthful documentation before delivery.
Update [VERIFICATION.md](../VERIFICATION.md) only with checks actually run. Record performance evidence
against exact revisions and keep generated reports/captures outside source control.
