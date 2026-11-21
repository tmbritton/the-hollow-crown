# CPU performance plan — queries, collision, rendering and animation

**Status:** proposed implementation plan, grounded in a completed CPU investigation. None of the
optimizations below is implemented by this document. The measured baseline is **`3cfb378`**;
concurrent shield-animation work was excluded from the final baseline measurements.

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
- Pause, focus loss, teleport, death, regeneration and scene disposal retain explicit reset/cleanup
  behavior. New caches have bounded ownership and retire with the world or actor that owns them.

## 3. Delivery sequence and integration

These are feature-sized investigation/implementation slices. Each gets its own before/after evidence
and acceptance review. CPU1–CPU4 target measured runtime work without requiring new content.
CPU5–CPU6 overlap rig/render ownership and must be reconciled with animation work at integration.

| Slice | Scope | Depends on |
| --- | --- | --- |
| **CPU0** | Reproducible subsystem timing and correctness baseline | Current integration revision |
| **CPU1** | Spatially relevant door/blocker queries and cheap geometry records | CPU0 |
| **CPU2** | Zero-displacement movement fast path | CPU0; measure independently of CPU1 |
| **CPU3** | Reproduce and bound expensive route replans | CPU1; CPU2 integrated for comparison |
| **CPU4** | Bounded nearby collision candidates | CPU2–CPU3 |
| **CPU5** | Lower CPU scene traversal and transform cost | CPU0–CPU4 results; refreshed rig/render contracts |
| **CPU6a** | Demand-driven/cached animation geometry | CPU5 review; current grounding/tail contracts |
| **CPU6b** | Separate presentation solving from catch-up and add animation LOD | CPU6a; explicit lifecycle/observation/death handoff |
| **CPU7** | Integrated frame-time, resource and visual acceptance | Implemented slices above |

The [implementation path](implementation-path.md) remains the global scheduling record. This plan
defines internal dependencies, not an automatic replacement of the active animation/death-physics
queue. Rebase onto completed concurrent work and refresh CPU0 before landing changes. Coordinate
CPU6b with A7's cutover and P8's pose/velocity handoff. The Effect prerequisite remains attached to
future procedural-feature expansion; runtime query/collision fixes do not add generated content.

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

**Gate:** same-seed runs reproduce workload counts and authoritative state; bounded instrumentation
does not change outcomes. Measure coarse/uninstrumented timing separately from detailed tracing,
alternate baseline/candidate order, and avoid simultaneous heavy browser suites. Record multiple
runs and distribution spread. Establish a real hardware Low/High baseline when WebGL is available;
software rendering or suppressed draws remain explicitly diagnostic.

### CPU1 — avoid unnecessary door and obstacle queries

**Touchpoints:** `src/navigation.ts`, `src/combat.ts`, `src/machines/world/interactions.ts`,
`src/worldEntities.ts`, and existing world/spatial data.

1. Reject doors outside a point/segment's conservative bounds before reading chart-backed flags.
2. Pass explicit geometry fields instead of spreading mutable entities into intersection records.
3. If repeated local queries remain expensive, share immutable door bounds and a per-world spatial
   index. Include footprint clearance and swept segments; retain references to the actual doors.
4. Profile before adding derived-state caches. If needed, key them by the authoritative snapshot
   and relevant collider revision, including opening animation's solidity threshold. Never mirror
   mutable `open`/`locked` flags with an independently maintained truth source.
5. Apply the same broad-phase approach to repeatedly scanned static blockers where the trace
   demonstrates a benefit. Preserve exact narrow-phase geometry checks.

**Gate:** old/new query results agree for open/closed/opening/closing/locked doors, both segment
directions, thin walls, ramps and room corners. Door changes take effect at the existing tick
boundary, including multiple queries within a tick. Distant doors should incur no state reads in
a local-query regression. Use CPU0 to set a reduction target for the 5,460-read workload; demonstrate
material whole-tick improvement rather than only a faster isolated getter.

### CPU2 — stop searching collision space for zero displacement

**Touchpoints:** `src/actors.ts`, `src/occupancy.ts`, `src/actorRendering.ts`, `src/locomotion.ts`.

Introduce a narrow stationary path when the requested displacement is truly zero and no explicit
resynchronization/depenetration policy requires a sweep. Preserve velocity/acceleration settling,
facing, jump clocks and landing, support sampling, collision-proxy synchronization, route progress,
door waiting and cancellation. Treat tiny real movement separately; an epsilon must not erase
arrival motion or change a route endpoint. Keep the existing moving clip-and-slide path initially.

**Gate:** stationary supported actors avoid terrain collision sweeps while all lifecycle/grounding
updates remain correct. Exercise idle, held blocked movement, braking, jump-in-place, standing on
stairs/water, blocked doors, actor overlaps, teleport and respawn. Compare actual paths, support,
attack/work outcomes and arrival state, not just call counts. Re-measure the entrance and stable
zero-motion cost independently before combining with CPU1.

### CPU3 — remove route-planning hitches without stale routes

**Touchpoints:** `src/navigation.ts`, `src/koboldSquads.ts`, `src/combat.ts`, `src/occupancy.ts`.

Start from CPU0's pinned costly request. Separate candidate generation, repeated clearance work,
search expansion, smoothing and invalidation cost. Re-measure after CPU1 before changing algorithms.
Cache immutable clearance/topology, avoid redundant requests with identical relevant inputs, and
scope dynamic invalidation to geometry that can affect a route. Distant actor movement should not
discard unrelated useful work; an actor entering the swept route must invalidate it immediately.

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

**Gate:** replace the 217.5 ms blocking request with a reproducible bounded path. Preserve route
quality, nearest-reachable semantics, physical clearance, valid door operation, phalanx recovery and
tribute takeover/delivery. Report per-phase work, aggregate per-tick planning work, calls and worst
request latency over adversarial fixtures and multiple seeds. Include multiple requests finishing
together, long paths with costly smoothing, and unreachable/partial searches with frontier refinement.
For pending searches, change doors and move blockers both into and out of relevant geometry; also
exercise actor death, origin movement/teleport, goal replacement and regeneration. Check publication
of successful, partial and unreachable outcomes against the current world, including recovery when
a previously blocked choke clears. If requests span ticks, specify and test the new latency/activation
contract explicitly; do not present changed gameplay timing as an invisible optimization.

### CPU4 — limit collision candidates to relevant geometry

**Touchpoints:** `src/actorRendering.ts`, `src/buildDungeon.ts`, `src/worldEntities.ts` and collision
adapter contracts. Evaluate a world-owned spatial index or the engine's candidate-list mechanism
against the refreshed installed library version during implementation.

Index collision geometry separately from decorative render meshes. Query a conservative swept
actor volume, including ellipsoid size, movement direction, elevation and clip/slide response.
Account for doors, stairs, large footprints, chunk boundaries and multi-step movement. Refresh
candidates for every actual sweep/slide where necessary; a camera-frustum list is insufficient.
Use the current full scan as a test oracle and explicit fallback for unsupported arrangements.

**Gate:** candidate scans scale with the nearby collision environment instead of all 2,382 render
meshes. Full-scan and indexed adapters agree on displacement across seeded paths, high-speed/diagonal
motion, walls, gates, ramps and live occupancy. Opening/closing or regenerating a door cannot leave
a stale candidate set. Bounds and resource ownership are measured and tested.

### CPU5 — reduce scene traversal and transform overhead

**Touchpoints:** `src/geometry.ts`, `src/buildDungeon.ts`, `src/player.ts`, `src/enemyRendering.ts`,
`src/rigs/bindings.ts`, `src/observation.ts` and `src/main.ts`.

Profile active-mesh evaluation into visibility checks, hierarchy/matrix updates, bounds and material
readiness. Retain existing static spatial/material batching. Investigate merging rigid pieces that
share a material and move together, bounded instancing, and reuse of unchanged static transforms.
Keep articulated joints and independently changing equipment/cutaway parts separate where needed.

Use conservative room/chunk visibility with margins and correct camera rotation/zoom/inspection
handling. Track visible shadow contributors independently of camera-visible meshes. Picking,
observation and collision should use explicit logical mappings when render geometry is consolidated.
Choose selective caching over globally freezing the active mesh list or dynamic bounds.

**Gate:** measured active-mesh/transform work falls on equivalent camera/state samples. Inspect
screenshots and animation sequences for silhouettes, lighting, cutaways, equipment and shadow parity.
Verify target picking and observed-versus-unobserved discovery events. Three-or-more regenerations
must plateau in scene, mesh, effect and cache resources. Any rendering merger must update the rig
surface/observation contracts before old meshes are removed.

### CPU6a — only construct animation geometry when needed

**Touchpoints:** `src/actorRendering.ts`, `src/rigs/bindings.ts`, `src/rigs/tailClearance.ts`,
`src/corpseRendering.ts` and grounding/contact consumers.

Build a conservative demand set for full body/equipment surfaces: actors with active tails and
their possible neighbors, carried cargo and the current long-weapon envelope. Publish all required
body surfaces before solving tails, retaining deterministic ID priority and final pair checks.
Reuse unchanged snapshots using explicit pose/equipment/visibility/world revisions. Cache settled
corpse surfaces with invalidation for any later death-physics motion or lifecycle reset.

**Gate:** distant actors outside every relevant contact neighborhood incur no unnecessary surface
rebuilds. Nearby participants retain same-frame anatomy/equipment clearance, no falsely clear tail
overlap, bounded infeasible fallback and ECS-order independence. Grounded feet still sample the
drawn corpse geometry; corpses remain passable and cannot change support/navigation.

### CPU6b — separate presentation solving from simulation frequency

Introduce explicit stages for cheap motion/action history, expensive pose solving, and mesh binding.
Preserve caller-owned clocks and required fixed-step history while allowing a full solve/binding to
serve the final displayed state rather than every intermediate catch-up tick.

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

### Correctness and browser gates

Use focused `node --test` cases while iterating, plus type checking. Add regressions for changed
invariants: query equivalence, cache invalidation, zero-motion lifecycle, swept candidate completeness,
pending-route behavior and presentation scheduling. Extend machine models for changed states/guards.

| Area | Existing affected browser checks |
| --- | --- |
| Queries, routing, collision | `npm run test:movement`, `npm run test:combat`, `npm run test:phalanx`, `npm run test:jump`, `npm run test:tribute`, `npm run test:last-ember` |
| Scene/mesh changes | `npm run test:inspection`, `npm run test:discoveries`, `npm run test:portraits`, affected combat/animation suites |
| Rig/scheduling changes | `npm run test:rig`, `npm run test:rig:solver`, `npm run test:rig:actions`, `npm run test:rig:tails`, `npm run test:rig:tails:clearance`, `npm run test:animation`, `npm run test:defense`, `npm run test:social` |

Targeted suites require a development server. Select the affected checks per slice and run
rendering-heavy suites sequentially. Refresh this list for newly landed animation/shield checks.
Use supported Firefox variants for cross-browser input/rendering concerns and review relevant captures.

For code deliveries, run `npm run format:check`, `npm run lint`, `npm test`, and `npm run build`.
Cross-cutting query/collision/scheduling changes also require `npm run check:full`, along with affected
browser checks and the production smoke check. Reuse trustworthy completed checks during independent
review; add targeted probes for suspected gaps instead of repeating broad suites without cause.

## 6. CPU7 — integrated acceptance and remaining GPU work

Repeat bounded baseline/candidate sessions at equal seeds, actor states, elapsed simulation times,
camera paths and quality settings. Include idle, travel, doors, busy phalanxes, cargo, accumulated
corpses, inspection and regeneration. Record single-step and real-frame costs, catch-up distribution,
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
