# Get clear of an obstacle by mouse

- **Task source**: `docs/plan/roadmap.md:103–105`
- **Epic / Story**: 14 / 2; depends on 14.1
- **Status**: implemented and verified in the working tree; see [verification evidence](../../../VERIFICATION.md#story-142--mouse-escape-from-obstacle-contact).
- **Branch**: main (planning baseline `d7f6562`)

## Goal

A hero who walks into contact with the practice pillar can steer around it and away again using only the mouse. Crowded dungeon doorways must obey the same rules.

## Acceptance criteria

- [x] From actual motor contact, reach a point beyond the pillar, turn a corner under hold and reverse away. Repeat at furniture and a doorway beside a living blocker without a key, teleport or reset as an escape.
- [x] Sample fixed steps: no segment penetrates terrain, crosses a closed gate, loses support or passes through a living body. An impossible request settles; unchanged ticks and disconnected-door toggles do not enqueue repeated failed searches.
- [x] A changed floor request, a relevant blocker vacating the lane, or a relevant gate becoming passable permits travel again. RouteBudget limits and 14.1 exact/frontier behavior stay unchanged.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Start at contact | `tests/partial-navigation.test.ts` | Reproduce contact by advancing the motor, record first legal outward/tangential segment, contrast an inward step, then run detour to completion. | Red on reachable request with no usable first segment; isolate planner versus motor with the recorded start. |
| Failed start proof | `tests/navigation.test.ts` | Count scheduled work for a boxed-in start across identical requests, disconnected-door toggles, new aim and changed living occupancy. Check that a lane gate must become passable before a retry, within the same work cap. | Red if an irrelevant door change restarts a settled hold or a relevant opening fails to restore travel. |
| Mouse-only escape | `tests/movement-browser.ts` | Practice pillar then dungeon furniture/door with moving actor; verify actual displacement through waypoints and reverse from contact. | Red at first stalled turn; a planned path alone cannot pass. |

## Design

Compare Navigator's start-cell attachment and smoothed first leg with `moveActor`'s actual clearance at the failing coordinates. Connect the **continuous start** to a bounded set of neighboring legal route anchors by swept segments; retain the ordinary exact/direct fast path. Where contact tolerance differs, share the tested clearance rule: touching permits separating movement, not deeper penetration. Validate the first executed segment too. No snapping to a cell center.

**State/events/effects:** reuse navigator request sequence: new goal → pending under existing budget → following on proven path or settled failure keyed by aim and relevant geometry/occupancy. Same request/stamp reuses result; changed relevant stamp or aim invalidates it. Replacement/cancel makes late results ineligible. Fixed-step motor alone applies displacement.

**Ports/adapters:** Navigator consumes world support, obstacles, door state and Occupancy; actor motor uses the same live collision facts. `main.ts` supplies the 14.1 absolute pick. Test with small grids, real actor radii and a caller-driven budget. Reject global clearance shrink (allows clipping), free rescue jumps and unbudgeted exhaustive replans.

## File changes

| File | Change | Why |
| --- | --- | --- |
| `src/navigation.ts`, `src/routeProof.ts` | Prove first leg and invalidate failed start proof only on relevant change. | Avoid both dead starts and retry storms. |
| `src/actors.ts`, `src/occupancy.ts` | Align separating-step checks only if the reproducer shows planner/motor disagreement. | Preserve shared actor safety. |
| `tests/partial-navigation.test.ts`, `tests/navigation.test.ts`, `tests/movement-browser.ts` | Add the reproduction, budget counters and actual mouse sequence. | Release gate for retiring key movement. |

## Edge cases and failure modes

Two touching blockers may leave no separating lane. Stop; do not choose a segment through either. Validate height at steps and gate state before moving, including when a blocker changes after planning. Cancel on pause/reset as usual.

## Verification

```sh
node --test tests/navigation.test.ts tests/partial-navigation.test.ts
# With npm run dev in a second terminal:
npm run test:movement && npm run test:combat
npm test && npm run typecheck && npm run lint && npm run format:check && npm run check:full && npm run build
```

## Risks and rollout

An easier AI route could change crowd behavior. Exercise both motor and scheduler and compare existing living-body and gate regressions before advancing to 14.3.

## Out of scope

No control remap, level geometry edits, path-budget tuning or collision bypass for the player.
