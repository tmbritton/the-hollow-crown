# CPU6a follow-up 2 — enforce one clearance surface budget per binding

- **Task source**: At the third rejection, the sole outstanding finding was that the live publication guard accepted a replacement with 64 drawn body meshes and one drawn tail mesh, exceeding the [rig budget](../rig-tails.md#L69).
- **Epic / Story**: CPU performance / CPU6a
- **Status**: Implemented and included in the [final independent CPU6a **APPROVE**](../../VERIFICATION.md#cpu6a--animation-geometry).
- **Branch**: `main`

## Goal

Publish complete clearance geometry when it fits the binding's 64-surface budget. If it does not fit, reject the layout before clearance can consume a partial body, tail or load. Do not make ordinary unchanged actors pay for overflow detection every tick.

## Acceptance criteria

- [x] Exactly `RIG_SURFACE_LIMIT` slots succeed, in any partition; slot 65 throws `Rig surface budget exceeded`, regardless of sample order. Count body/equipment, tail and supplied drawn cargo together. Keep authored registration's existing combined cap.
- [x] Overflow neither truncates geometry nor changes the last successful clearance buffers, corners or inspection snapshots. It records no successful publication or reusable certificate for the rejected inputs. Restoring a valid layout permits a complete retry.
- [x] An unchanged certified body request still returns `false` with the same snapshot, zero mesh/cargo visits, zero surface checks and zero box builds. Unowned and open layouts remain live; tail demand still publishes the current tail.
- [x] All [original CPU6a criteria and verification gates](cpu6a-animation-geometry.md), the [backlog contract](../cpu-performance-plan.md#cpu6a--only-construct-animation-geometry-when-needed) and [follow-up 1 criteria](cpu6a-follow-up-1.md#acceptance-criteria) remain binding. This is an additional gate, not a replacement for demand, same-frame clearance, deterministic pair ordering, settled contacts, lifecycle invalidation, inspection or matched replay.

## Test plan (write these first)

Use `node:test` and the Babylon binding fixture. Give each member a unique name; assert the expected names in each partition, not just array lengths. Warm a valid publication before inducing overflow.

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Inclusive boundary | `tests/rig-bindings.test.ts` | 63 live bodies + one tail; separately 62 bodies + one tail + one visible cargo. Sample both partitions; all 64 accounted for, cargo only in body. | Green boundary guards. |
| Split overflow | `tests/rig-bindings.test.ts` | Replace render membership with 64 bodies + one tail; on fresh fixtures demand body first or tail first. Each first demand must throw without needing to sample the other partition. Repeat with owned edited membership. | Red: neither partition alone exceeds 64. |
| Cargo overflow | `tests/rig-bindings.test.ts` | Add one visible cargo to a valid 63 + 1 live layout. Also supply enough visible cargo to bring an unedited authored binding to 65 registered/published slots. Hide/remove the excess and retry at 64. | Red: cargo appended after the guard. |
| Atomic failure and recovery | `tests/rig-bindings.test.ts` | Save both live lists' names and copied corners plus inspection snapshots; change an early mesh's transform and overflow late (also try 65 body-only). Assert throw, unchanged live values and retained inspections, repeated failure, then a complete refresh on repair. | Red: split overflow accepted; same-partition guard can throw after mutating output. |
| Certified hit | `tests/rig-bindings.test.ts` | Repeat valid owned edited body demand with unchanged versioned cargo. Assert `false`, snapshot identity and no member/cargo visits (instrument fixture iterators or mesh reads); retain browser trace assertions for zero checks/builds. | Green performance guard. |

## Design

Enforce capacity inside the binding, before `publish` writes even the first reused surface or cached cargo box. Use a bounded preflight on a miss: determine the slots for **both** partitions from the same current input, then add visible cargo. Stop at the first excess slot. For authored sources use the existing combined registered slot count (disabled placeholders still occupy slots); for live sources use current membership, visibility/disposal and tail ancestry exactly as the publisher does. Share selection logic so validation and output cannot disagree. Preserve source order and root-join flags. Keep scratch membership bounded to 64; walking hidden members of an uncertified list on demand can still be necessary.

Body requests validate with the supplied cargo, including an explicit transition to no cargo. Tail-only requests receive no cargo argument today: include the cargo represented by the retained body publication; do not interpret a tail-only call as a handoff. Check that replacing just the requested partition also fits alongside the retained opposite partition (repartitioning can leave that buffer from a different revision). Reject an oversized combination before exposing it; refresh a stale opposite partition coherently if necessary for a valid repartition. Do not rebuild opposite-partition boxes merely to count them.

Keep the certified body early return ahead of enumeration. Reuse a validated count only for the input revisions it covers; on tail-only work reuse certified membership counts where valid, never trust a stale length for mutable unowned input. Validate first, then commit buffers, snapshot invalidations, publication counters and successful key. On failure keep last good data and force revalidation on retry. No new public API or scene-wide pass is needed.

### Alternatives rejected

- Checking `output.length` in each branch, even after appending cargo, still permits 64 + 1 across partitions.
- Slicing to 64 hides real obstacles. Checking the combined inspection getter is too late: clearance reads the live arrays directly.
- Recounting before the certified hit fixes the bound by undoing the CPU6a work reduction.

## File changes

| File | Future change | Why |
| --- | --- | --- |
| `src/rigs/bindings.ts` | Preflight combined capacity at publication; retain the existing registration limit and fast return. | Owns both live buffers, cargo and the publication key. |
| `tests/rig-bindings.test.ts` | Add the boundary, split, cargo, failure/retry and hit cases above. | Exercises the same binding API as clearance without depending on scene size. |

## Edge cases and failure modes

- Empty live membership contributes zero rig slots, not the old authored count. Hidden/disposed live members and invisible cargo do not consume published slots.
- Reparenting a visible link or changing the same unowned list in place must not bypass the cap. Cargo without a writer revision cannot authorize a body hit.
- A failed first demand has no previous sampled result to restore: leave initial buffers untouched. Never return `false` to signal overflow; that means a valid cache hit.

## Verification

Capture the split and cargo reds independently before implementation. After green:

```sh
node --test tests/rig-bindings.test.ts tests/rig-tail.test.ts tests/corpse-terrain.test.ts
npm run check:full   # typecheck, core + extended tests, lint, format:check
npm run build
# With npm run dev -- --port 5173 --strictPort in a separate terminal:
npm run test:rig:tails:clearance && npm run test:inspection && npm run test:cpu:regressions
```

Preserve [prior evidence and its qualifications](../../VERIFICATION.md#cpu6a--animation-geometry), including the round-2 independent approval of those fixes only, browser/production gates and matched RTX 2070 replay against CPU5 `f3fa9a3` (digest `926cd1a6`, 614 probes; zero settled mesh visits/support lookups/list rebuilds over 180 ticks and zero paused mesh visits). Since publication is a measured path, repeat `CPU_GPU=hardware CPU5_URL=http://127.0.0.1:5187 node tests/cpu-animation-geometry-browser.ts` with the matched baseline served there. Distinguish fresh results from carried-forward gates; no general FPS or approval claim.

## Risks and rollout

The two likely regressions are a hidden second scan on hits and a late throw after mutating shared corner arrays. Review the early return and the first mutation against the work and atomicity tests. Require independent recheck of both overflow paths and the original gates before accepting CPU6a.

## Out of scope

No limit increase, content trimming, demand-radius change, solver/order change, settled-cache redesign, CPU6b scheduling or CPU7 work. This plan changes no source, tests or prior evidence.
