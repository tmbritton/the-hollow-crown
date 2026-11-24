# Keep a failed mouse hold settled until a reachable opening changes

- **Task source**: `docs/plan/roadmap.md:103–105`, [Story 14.2](story-2.md), third correctness rejection
- **Epic / Story**: 14 / 2, follow-up 1
- **Status**: proposed
- **Branch**: main; extend the current working diff, not a clean baseline

## Goal

Holding the mouse against a blocked lane should not restart navigation because someone moves behind the obstruction. The same hold should resume when the hero can make legal progress, even if the exact aim is still blocked.

## Acceptance criteria

- [ ] With hero at x=0, front body at .905, rear at 1.81 and aim at 3 (z=0), moving the rear to 1.811 leaves the failed hold `unreachable`: null destination, unchanged request sequence, no queued or consumed route work.
- [ ] The same rule holds when two obstacles independently block the same reachable probe: removing one is not an opening. Opening a previously blocked reachable probe permits one budgeted retry, without new input.
- [ ] Preserve successful exact and partial endpoint selection, live route validation, changed-aim/cancel behavior and all previously verified Story 14.2 cases.

## Test plan (write these first)

Use `tests/navigation.test.ts`, real actor sizes, a one-tile-wide lane and `RouteBudget(4)`. Cap each drain at 120 ticks; assert `used <= 4` each tick and an empty queue at the cap. Check queue size immediately after each hold, not just after draining.

| Test | Behavior pinned | Expected first run |
| --- | --- | --- |
| Masked rear motion | Establish failure first. Alternate rear x=1.811/1.81 for 12 held samples past the retry interval; assert all failure invariants above. Repeat with rear motion during the initial drain: the original request must settle within the cap. | Red: nearby shape changes invalidate the settled command. |
| Redundant obstruction | Two bodies each deny the same start exit (fixture may use overlapping collision cylinders). Move either away in separate runs: still failed. Move the last away: next hold increments sequence once; drain to `ready`, destination exactly (3,0). | Red on redundant removal; last-removal assertion guards against over-filtering. |
| Partial opening | In the masked fixture move only the front body out of the lane. Expect one retry and `ready` with a live-clear endpoint strictly between start and rear, not the aim. Keep existing successful endpoint regression tests unchanged. | Positive control: rejecting every body change would leave destination null. |

## Design

`RouteProof.fingerprint` sorts nearby cylinder shapes. Its chunk test answers “could this body matter?”, not “did this exit open?”. Keep it as a cheap negative filter only. For failure, retain the tested exits from reachable starts (including continuous start connectors and sub-tile frontier sweeps). Record the decision for each whole exit: legal progress or blocked, using support, static clearance, passability and **all** live bodies together. A clear endpoint beyond a blocked prefix is not a reachable exit; speculative goal stands and ranking samples are not independent witnesses. Successful routes still need their selected endpoint and travel-leg evidence.

On changed geometry use the existing spatial index with both old and new bounds to select affected witnesses. Recheck their effective outcomes against one current snapshot; unchanged obstruction refreshes the cached comparison inputs without scheduling a search. Use the same decision when publishing a pending failure and when reusing a settled one. Avoid a full search or full-proof scan per held tick; keep draft sealing/validation sliced under the existing budget.

### State model

Reuse Navigator's lifecycle. Pending + current failed proof → settled failure; stale result cannot publish. Settled failure + same aim/no opening → stay, no effect; + reachable opening or new aim → pending, enqueue once. Pending + success → ready with exact or frontier destination. Ready holds retain existing route/arrival guards; cancel or replacement invalidates the prior sequence in every state. Keep the comparison pure; Navigator owns enqueue/publication effects.

**Shared-budget follow-up:** A failed proof is current for the snapshot it checked, not necessarily for the latest body coordinates. A sliced check can settle without resampling because a failure installs no route. Keep the checked snapshot for the next hold; do not stamp the failure with newer geometry that the proof did not check. If the check itself sees a reachable opening, retry planning. Owner, footprint, capability and grid guards still apply at publication, and positive routes still require live geometry validation. See [verification](../../../VERIFICATION.md#142-follow-up--failed-hold-publication-under-shared-load).

### Ports and adapters

Use existing Occupancy, world and caller-driven budget boundaries. ECS supplies living bodies and shared door state; no new I/O, chart or clock.

### Alternatives rejected

Coordinate rounding misses small real openings. Watching the first blocker by identity misclassifies redundant blockers and depends on iteration order. Neither tests clearance.

## File changes

| File | Change | Why |
| --- | --- | --- |
| `src/navigation.ts` | Capture reachable exit decisions and consult them on failure publication/reuse. | Separate failed holds from successful endpoints. |
| `src/routeProof.ts` | Index and compare affected failure witnesses. | Distinguish changed geometry from changed obstruction. |
| `tests/navigation.test.ts` | Add bounded paired failure/opening cases above. | Detect both needless retries and missed wakeups. |

## Edge cases and failure modes

Retain disconnected aim islands, unsupported diagonals, farther gates behind a gate or body, bodies behind gates, unlock without opening, and reachable sub-tile openings. Do not discard an alternative reachable exit because the direct lane is masked.

## Verification

```sh
node --test tests/navigation.test.ts tests/partial-navigation.test.ts
npm run check:full && npm run build  # includes typecheck, tests, lint and format checks
# With npm run dev in another terminal:
npm run test:movement && npm run test:combat
```

## Risks and rollout

A failure-only filter applied to success could leave a stale waypoint. Review the complete diff against the original contact escapes, collision safety and budget checks as well as the new failure/opening pairs before advancing the story.

## Out of scope

No motor tolerance, controls, geometry, scheduler limit or roadmap changes. Preserve prior verification evidence; it does not close this rejection.
