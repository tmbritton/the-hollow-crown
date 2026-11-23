# CPU4 — limit collision candidates to relevant geometry

- **Task source**: `docs/cpu-performance-plan.md:325–367`
- **Status**: implemented; short pursuit follow-up fixed and independently checked within that scope
- **Branch**: main

## Goal

Walking, jumping and steering past walls, gates, furniture and other actors should produce the same movement as today, even when two actors move in succession. The cost of finding what can block a move should depend on the nearby collision environment, not how much of the keep is decorated or how many actors are elsewhere.

## Acceptance criteria

- [ ] Replay identical inputs from identical seeds through indexed and full-scan adapters. Compare every accepted x/z displacement and support h (absolute tolerance 1e-6 world units), blocked/arrived decisions and door transitions, not just final positions. Exercise fast and diagonal travel, stairs, corners, live crowds and regeneration.
- [ ] At fixed local density, adding distant colliders, distant actors or decorative meshes does not increase candidates visited by the indexed narrow phases. On the reference 2,382-render-mesh workload report actual scene size, nearby candidates and fallback frequency; the normal seeded path must not quietly use full scans.
- [ ] One current prepared record per eligible living entity; unchanged bodies are not rebuilt per caller. Both movement directions agree with uncached scans after slides, height/shape changes, same-tick accepted movement, teleport, death, removal and same-ID replacement.
- [ ] Door eligibility follows the actual collision threshold through opening, closing and reset. Camera cutaways, corpses and scattered bones never change living clearance; P8/P9 terrain and per-piece coverage remain intact.
- [ ] Repeated regeneration/disposal retires all old buckets, memberships, scratch references and optional cache entries. Report peak and post-disposal counts as well as candidate and CPU costs. Keep narrow-phase memoization only with measured net savings and exact-query parity.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Swept bucket lookup vs exhaustive bounds | `tests/collision-candidates.test.ts` (new) | Negative coordinates, touching cell faces, elevated/large footprints spanning cells; unique candidates in oracle order. Decoration and distant population do not increase local work. | fail: no bounded lookup |
| Real adapter differential | `tests/movement-browser.ts` | Replay seeded paths in twin fresh runs, including multi-step diagonal sweeps, a corner where the slide hits a second wall, ramp landings, props and a gate before/after each collision threshold and regeneration. Include an unsupported collider fixture that must select full scan. | fail: no selectable indexed adapter or fallback evidence |
| Live view vs scan after each operation | `tests/occupancy.test.ts` | Query A→B and B→A, including identical repeats, tangent slide, blocked and escaping initial overlap. Move A then query B before tick ends; vary displacement, support, radius/height, teleport, kill/remove/replace same ID and replace run. Compare stand/segment answers and accepted motion. | fail: no shared current records or indexed comparator |
| Stable query, current next query | `tests/navigation.test.ts` | During synchronous multi-probe work all probes see the same bodies except self; the next query observes changes. Deferred CPU3 planning retains its detached validation snapshot. | fail: no versioned view to exercise |
| Bounded work and retirement | `tests/cpu-regressions-browser.ts`, `tests/resources-browser.ts` | Compare identical local paths with/without far population; count builds, queries, candidates, fallbacks and live resources through spawn, death and repeated resets. Assert retired owner counts zero and new owner counts match fresh run. | fail: no CPU4 counters or retirement probe |
| Death terrain isolation | `tests/skeleton-breakup-browser.ts`, `tests/ragdoll-contacts-browser.ts` | Living candidate membership excludes all pieces, including distant ones; retain existing physical contact/terrain assertions on discrete stairs, walls and apertures. | fail: living membership cannot yet be inspected; existing physics assertions should pass |

## Design

1. **Keep the reference path.** Preserve `proxy.moveWithCollisions` with no candidate override and the existing ECS filter/map + cylinder solver as independently selectable test oracles. Change candidate discovery, not support sampling, step length, slide count, jump clearance, tie-breaking or fixed-step order. Drive the actual motor in both modes; report the first diverging seed, step, mover, query bounds and ordered candidates.
2. **Terrain: index build output, not the scene each frame.** Register motor collider meshes from `buildDungeon` (including the separate `wallColliderBatch.finish()` path, not just `obstacles`). Use world-space bounds in every intersected x/z grid cell, then intersect elevation, deduplicate and return in scene traversal order. Measure wall batch extents: partition collision-only batches by spatial chunk if their bounds otherwise span the dungeon; preserve source faces and validate seam contacts. Keep doors registered across animation and test live `checkCollisions`, not just `door.open`. Refresh changed world bounds before use. Register additions/removals at lifecycle boundaries; mark coverage incomplete on unknown collidable geometry rather than silently omitting it.
3. **Feed the engine at the sweep boundary.** Recheck the installed Babylon version and coordinator before binding. In the current 9.37.0 coordinator each recursive retry selects `excludedMesh.surroundingMeshes` or `scene.meshes`. Prefer the public proxy candidate list plus world-owned lookup, restored in `finally`. Query anew inside each terrain move, including every occupancy substep and redirected slide. A list for one Babylon call must cover **all** its internal retries: derive a conservative reach in ellipsoid-scaled space from the supported origin, clamped displacement length, retry limit and collision skin, transform back to world axes and expand by ellipsoid radii. Validate against the installed response math and oracle, including sideways deflection and vertical reach. Do not use a thin start/end box for retries. If conservative coverage, ordering, registration or synchronous list lifetime cannot be established, leave the override unset and count the fallback reason. Do not patch engine internals.
4. **Living bodies: share data, not movement results.** Replace `createActor`'s per-actor registry collector with a run/ECS-owned index of ground-based cylinders (support `h`, not airborne visual height). Store entity incarnation, immutable prepared geometry, stable registry order and occupied cells. Use point envelopes for standing and actual terrain-resolved segments for contacts; exclude self, retain the existing cylinder math. Door occupancy uses the same bucket mechanism over a separate publication of actor centers so its exact center/height predicate does not depend on body eligibility. A synchronous read view pins one publication while successive probes query local buckets; keep scratch caller-owned and release it on exit. Where a CPU3 route job explicitly needs a longer-lived snapshot, retain immutable records of that publication, not mutable buckets. Preserve planning vs live clearance policy in navigation and explicit body-list callers.
5. **Publish on writes.** Audit authoritative spawn, transform/support, body replacement/size mutation, teleport, health/corpse and ECS removal paths; route relevant writes through a publish/remove boundary before another query can run. Compare old and new bounds, remove obsolete memberships and rebuild only changed records. Publish once after accepted movement, not on speculative slides or solely from a render sync (headless actors also move). Allocate a new incarnation for replacement and a fresh owner per run. Never freeze the whole tick's bodies or scan the registry merely to discover dirty records on each lookup.
6. **Measure before caching.** Compare full-scan uncached, indexed uncached and, only if warranted, indexed cached on identical seeds/inputs. In a detailed probe count record builds, cells/entries inspected, candidates per sweep (median/p95/max), exact query repeats, eligible hits/misses and invalidations. Measure lookup, maintenance/invalidation and total collision time separately on warmed repeated runs; keep detailed instrumentation out of timing-only samples. Record seed, workload, build/version, sample counts and environment. For repeated symmetric overlap only, key an unordered pair by owner, both incarnations and geometry revisions, reversing the normal for reversed callers. A swept result is directional: do not reuse it across movers, origins, deltas, support or policy. Prefer no sweep cache. Reject any cache without bounded lifetime, differential coverage and repeatable total savings including key construction and invalidation.

### Alternatives rejected

- Camera/frustum candidates — invisible walls still block, including behind the mover on a slide.
- Once-per-tick body arrays or ID-pair/tick caches — later movers would see stale geometry, and reciprocal moves need not have reciprocal outcomes.
- One terrain representation for locomotion and death physics — smooth motor support cannot represent discrete treads, wall bases/caps or full door apertures. Neither a root-only patch nor a rectangle covering an entire scatter is equivalent to per-piece patches.

## File changes

Expected implementation diff (this planning step changes only this document):

| File | Change | Why |
| --- | --- | --- |
| `src/collisionCandidates.ts` (new), `src/buildDungeon.ts` | Typed bounds/bucket lookup and world collider registration | Separate collision geometry from décor and preserve stable order |
| `src/actorRendering.ts`, `src/main.ts`, `src/ecs.ts` | Bind the typed candidate provider, oracle mode and owner lifecycle at run composition | Keep engine meshes out of domain queries; retire resources on reset |
| `src/actors.ts`, `src/occupancy.ts` | Register/publish prepared living bodies; query views in the existing solver | Eliminate per-mover scans without changing sequential movement |
| `src/navigation.ts`, `src/koboldSquads.ts`, `src/combat.ts`, `src/objectiveWork.ts` | Adapt explicit body queries/snapshots and lethal publication where applicable | Preserve caller policy and CPU3 deferred validation |
| `src/worldEntities.ts`, `src/machines/world/interactions.ts` | Query doorway occupants locally; preserve shared door and collider authority at the angle threshold | Avoid stale gates or a second door state |
| `src/cpuMetrics.ts`, test files above | Dev-only counters, oracle selection, paired workloads and resource assertions | Prove cost, parity and ownership independently |
| `VERIFICATION.md` | Record actual comparison data, fallback/cache decision, commands and subsequent independent review | Keep measurements distinct from historical CPU0 baseline |

## Edge cases and failure modes

- Empty bucket → empty candidate list; unknown coverage → full scan. They are not the same state.
- Equal-time contacts across two cells → deduplicate by identity and preserve oracle order, not hash iteration order.
- Zero travel or jump in place → no synthetic horizontal sweep or expulsion; retain support, velocity and proxy publication. Vertical separation still uses current body bounds.
- Open door still swinging, force-closed gate, or same seed regenerated → use current collider eligibility and new run identity; never reuse an old mesh.
- Dead body renders or splits while another actor queries → remove living membership on death; rendering never re-registers a piece.

## Verification

See [round 1 evidence](../../VERIFICATION.md#cpu4--local-motor-collision-candidates-astra-fix-round-1-follow-up-review-pending). The original wall batcher's authored order and existing spatial groups are retained: they were already local and extra splitting changed the triangle order. Doorway occupancy uses its own point index so motor body changes do not change the original doorway predicate. No narrow-phase cache shipped.

[Round 2 evidence](../../VERIFICATION.md#cpu4--sol-fix-round-2-follow-up-review-pending) covers mover radius and height in held-floor and exhausted partial-search cache validity, and synchronous publication of death and revival from all supported health chart writes.

The [partial-route locality follow-up](cpu4-partial-route-locality.md) separates live probes from
partial-cache identity. The [short pursuit follow-up](../../VERIFICATION.md#cpu4--short-pursuit-locality-follow-up-finding-fixed)
removes the synchronous full-list sweep in `CombatSystem.pursue` and measures it separately
from unchanged CPU3 admission. See that entry for full-scan parity, door controls and the caller audit.

Use Node 22.18+ and the locked dependencies. Start `npm run dev -- --strictPort --port 5173` in a separate terminal for targeted browser suites. Run nonhardware checks headless and sequentially:

```bash
set -e
export DISPLAY= WAYLAND_DISPLAY=
node --test tests/collision-candidates.test.ts tests/occupancy.test.ts tests/navigation.test.ts
npm run check:full  # typecheck, all Node tests, lint, format:check
npm run build
for suite in movement jump combat phalanx objective-work ragdoll:contacts skeleton:breakup resources cpu cpu:regressions; do
  npm run "test:$suite"
done
npm run test:cpu:production
npm run test:production
```

## Risks and rollout

- A faster broad phase could omit a rare blocker — land differential tests first, run both modes on the same paths and enable indexed behavior only where the fallback contract is satisfied.
- A stale record can pass ordinary walking tests — exercise same-tick mutations and repeated-ID replacement with no render pass in between. Compare owner counts before and after disposal, not only browser heap totals.
- Instrumentation or software rendering can dominate timing — gate locality on deterministic counts; label software timing as such, not GPU/FPS evidence. Keep the uncached index if cache benefit is ambiguous.
- After implementation and verification, obtain independent CPU4 review and resolve blockers before marking ready. Stop at CPU4.

## Out of scope

- CPU5 and later queue items; CPU3 planner redesign, dependencies upgrade, render batching for aesthetics, altered gameplay thresholds, and P8/P9 terrain streaming changes.
- Feature implementation, executing its benchmark campaign, commits or pushes in this plan-only step.
