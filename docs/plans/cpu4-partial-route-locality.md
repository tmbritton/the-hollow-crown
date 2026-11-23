# CPU4: Keep synchronous partial-floor route probes local

Task source: `docs/cpu-performance-plan.md:337–367`; CPU4 third-review blocker at `src/navigation.ts:615–621`  
Status: implemented and verified locally; see [partial-route evidence](../../VERIFICATION.md#cpu4--synchronous-partial-route-locality-implemented-and-verified-independent-review-pending)  
Branch: `main` (existing uncommitted CPU4 work is the baseline)

## Goal

Make a synchronous `goTo(..., { partial: true })` pay for distant bodies when fingerprinting its cache, not every time it checks a stand or swept segment. The review's 21×9 stone-floor detour took the same path with one blocker as with 128 additional distant bodies, yet actual body-array reads rose from 522 to 53,770. Preserve that path, the reachable-frontier result when there is no exact route, and the conditions under which a later command may reuse either result.

## Acceptance criteria

- [ ] On the review fixture, indexed routing performs exactly the same number of candidate-element reads per probe kind with 0 and 128 distant bodies, reads no distant candidate in either narrow phase, and actually tests the local obstruction. Full-scan routing on the crowded fixture does more work but gives the same acceptance, destination and ordered waypoints.
- [ ] A synchronous indexed partial search enters one pinned view and takes one complete cache snapshot; exact synchronous routing takes no cache snapshot. Neither the lookup nor its arrays escape into a floor command or search tree.
- [ ] Unchanged exhausted searches demonstrably reuse connectivity; changed local occupancy, continuous geometry or mover footprint never authorize stale reuse. Held-command reuse and reachable-frontier results agree with fresh full-scan planning. A scan-only occupancy remains correct without an index.
- [ ] Deferred CPU3 tests and verification gates below pass without changing scheduler behavior, credit accounting or validation data.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Crowded detour, indexed vs scan | `tests/navigation.test.ts` | Use `grid(10,4)`, start (−4,0), target (4,0), living blocker (0,0); add 0 or 128 equal bodies at (100+4i,0), i=0…127. Use the real living-view adapter and an independent full-scan navigator. Require success at target, a waypoint off the straight line, identical ordered paths and exact sparse/crowded read-count equality for indexed stand and segment separately. As a positive control the unobstructed route is direct. | Red: same detour but partial search bypasses the view and crowded reads grow. |
| Input lifetime and fallback adapter | `tests/navigation.test.ts` | Count view entries and cache-list captures for partial vs exact. Repeat detour through the default two-argument `Occupancy` (no index); assert the same non-direct route. Count cache capture separately from the default adapter's own scan to establish its view. | Partial view contract red; scan parity and exact behavior green. |
| Exhaustion, reuse and invalidation | `tests/navigation.test.ts` | Adapt the existing split-floor exhausted-tree fixture to an indexed mover with a real blocker. First command does positive BFS edge work and reaches a non-start frontier short of the request. At identical origin repeat `goTo` (not held-input shortcut): require zero repeated expansion-edge probes, identical endpoint/path, and fresh scan parity. Move the blocker into the used approach so the scan route changes; require positive expansion work and exact fresh parity. Repeat the existing radius/height invalidations, including changes that leave discrete cells unchanged. Compare sparse/crowded narrow-phase work on cold fallback and warm reuse. | Existing reuse/parity should pass; cold fallback locality red. Dropping the cache snapshot must break the invalidation control. |
| Held floor command | `tests/partial-navigation.test.ts` | Exercise `followFloor` with an active fallback: unchanged publication suppresses a search; moving a relevant body after the retry window causes one and changes the route to match fresh scan. Use a sub-cell geometry change affecting the continuous approach without relying solely on a changed cell mask. Keep disconnected-island and cursor-throttle controls. | Behavior green before split; fails if command fingerprint is published from an empty list. |

Use `node:test` and strict assertions. Wrap the inputs to the real `Occupancy.canStand` and `segmentClear` in the test: for a lookup, forward its bounds and proxy the returned array; for an explicit array, proxy that array. Count numeric element gets during the real predicates/iteration (including short circuit), not `.length`, wrapper calls, timings or DEV trace counters. Distinguish fingerprint singleton probes and snapshot enumeration from planner probes; do not exempt the old whole-list planner input. Count full-unit grid-edge probes in the expansion phase separately from connector, fingerprint and smoothing sweeps. Assert positive cold expansion and positive lookup/probe activity before asserting warm zeros or sparse/crowded equality. Report the two read totals on failure; the review numbers diagnose the old path, not a permanent operation budget.

## Design

Give `steps` and `plan` two explicit inputs: `BodyInput` for collision decisions and a readonly body list for partial-cache identity. Today both infer the latter from `typeof bodies`, so simply passing a function would silently fingerprint an empty environment. At synchronous `goTo`, retain pending-work cancellation. With occupancy, enter `withView` once; inside its callback capture `occupancy.bodies()` once for a partial command only, before running any probes, then `finish(steps(...))` before returning. There is no asynchronous handoff or intervening simulation write between pin and capture. Without occupancy keep terrain-only behavior.

Pass only the lookup through direct checks, connectors, cell/edge traversal, `localFrontier`, `closestReachable`, continuous approach and smoothing. Use the separate snapshot for `steps`' prior-tree environment comparison and command publication, and `plan`'s same-origin geometry check and exhausted-tree environment/geometry publication. Keep `environment`'s per-body singleton checks, bounds filtering, door signature and `moverFootprint` unchanged. Cache the existing signatures/tree, not the view. Leave `followFloor`'s comparison against current bodies intact.

At the scheduled draft's `steps` call, use its existing detached body array for probes and, for partial work, for fingerprints. No scheduler-held lookup; do not change admission, yields, retries, proof watching, publication checks or failure stamps. Preserve the existing `withView` scan fallback for unsupported bodies and scan adapters; locality is a gate for indexable inputs only.

### Alternatives rejected

- A snapshot alone is stable but scans the world per probe. A lookup alone cannot describe all geometry relevant to the next cache comparison.
- Filtering once around the start–goal segment can miss blockers on a detour or at a fallback anchor. Reopening a view per edge loses the single-publication guarantee.
- Disabling partial-cache reuse or adding a contact-result cache changes the work contract rather than fixing candidate selection.

## File changes

Expected implementation diff (this planning step writes only this document):

| File | Change | Why |
| --- | --- | --- |
| `src/navigation.ts` | Split probe and fingerprint arguments at synchronous entry, throughout cache consumers and at the scheduled draft call site. | Reuse existing occupancy APIs; no new index or public navigation API. |
| `tests/navigation.test.ts` | Add exact read accounting, scan oracle, adapter/lifetime checks and exhausted-tree controls. | Catch both population-scaled work and a spuriously cheap empty fingerprint. |
| `tests/partial-navigation.test.ts` | Strengthen held-command invalidation and reuse assertions against fresh routes. | Verify what floor input actually publishes and reuses. |

## Edge cases and failure modes

Empty occupancy is not missing terrain support; keep no-occupancy and direct/at-goal returns intact. A blocked nearby goal can return a local prefix, which must not be saved as an exhausted component. After movement do not reuse parents rooted at the old origin. Preserve exact geometry for continuous connectors even if directed discrete edges match. Door state, mover size, reset and cancellation still invalidate as today. Keep self-exclusion and scan order from the adapter, including giant/outlier fallback; do not tighten collision tolerances to reduce counts.

## Verification shell commands

From the repository root, during implementation (not claims of completed checks):

```sh
git status --short --branch
node --test tests/navigation.test.ts tests/partial-navigation.test.ts tests/route-budget.test.ts
npm run check:full
npm test
npm run build
# Terminal A: start if a development server is not already running
npm run dev -- --port 5173 --strictPort
# Terminal B: sequential headless Playwright suites; production starts/reuses preview
DEMO_URL=http://localhost:5173 npm run test:movement
npm run test:production
git diff --check
```

## Risks and rollout

The most likely false green is an equal route with no measured candidate work; the local blocker, scan control and observed cold/warm edge work distinguish that from genuine locality. A second risk is mixing live and detached publications; review every `steps` caller and both cache writers together. Before delivery, request independent review of read counts, parity and CPU3 isolation; resolve blockers and rerun affected gates. If parity diverges, isolate this argument split against the dirty baseline rather than resetting other CPU4 changes.

## Out of scope

No deferred CPU3 optimization, fingerprint redesign, collision-result memoization, terrain/render/death changes, new telemetry, broad CPU4 cleanup, commit or push. No gameplay, control or deployment change.

## Follow-up: short pursuit

The full-feature review found a separate synchronous full-list sweep in `CombatSystem.pursue`.
It now uses the existing live lookup with planning door semantics. That change does not
touch the partial-route cache split or CPU3 snapshots. See [pursuit evidence and caller audit](../../VERIFICATION.md#cpu4--short-pursuit-locality-follow-up-finding-fixed).
