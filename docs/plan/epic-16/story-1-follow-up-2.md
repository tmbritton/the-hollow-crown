# Bound writer upkeep and populated traversal in the 16.1 diagnostic

- **Task source:** [Frozen story 1, lines 33–45](story-1.md#design); [restart boundary](../../epic14-startup-fps.md#current-restart-boundary)
- **Epic / Story:** 16 / 16.1, follow-up 2
- **Status:** proposed tooling only; hardware evidence pending (Xid79)
- **Branch:** `main`, starting at `b1261a7`

## Goal

Make the recurring cost `U` auditable: measure the work to publish changed geometry even without a pointer, and the work to collect candidates from occupied cells. Today `publishDemand` compares snapshots, and `measureScratch` tiles finished bounds and probes an empty map. Neither measures those costs. Deliver a software-testable capture → replay → ledger path, not a feasibility result.

## Acceptance criteria

- [ ] In count mode, trace actual writer publications by kind, native frame, tick/phase and stable mesh/batch/instance identity for shrine, floor and idle. Retain inputs to bounds refresh, old/new memberships, crossed cells and operation counts. Two writes that undo one another before the next snapshot still count twice.
- [ ] Replay real bounds refresh and membership publication from those inputs; replay each pick against its synchronized **populated** occupancy. Reconcile measured operations, ordered candidates and hits with independent fixture expectations and existing offline list/exhaustive parity. Report cold registration time and memory separately.
- [ ] Save raw inputs, coverage gaps, work units, batch times and per-case ms/native frame. A reviewer can reconstruct `U` without trusting a boolean. Software proves accounting only; missing or unmatched evidence cannot yield either feasibility verdict.

## Test plan (write these first)

| Test | File (under `tests/`) | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Writer trace → refresh → publish | `cursor-attribution-writers.test.ts` (new) | Drive real Babylon geometry in NullEngine through a moving parent, posed/reparented child, door crossing and returning, thin matrix edit/batch replacement, spawn/disposal and unchanged check; assert hand-computed world bounds, event order and membership deltas across multiple ticks in one idle frame. | Red: phase snapshots lose intermediate writes and lack refresh operands. |
| Populated ray walk | `cursor-attribution-model.test.ts` | Pin empty and occupied steps, two occupants sharing a bucket, duplicate across cells, corner touch and oversized/unknown fallback. Assert raw entries, unique scene order and equality to `offlineList`; no pointer means zero traversal, not zero upkeep. | Red: scalar envelope estimate has no bucket reads. |
| Ledger admission | `cursor-evidence.test.ts` | With injected batch times verify largest valid unit rate × observed frame demand, no nested double charge. Delete a writer kind, stale a run ID, omit a demanded rate, or supply software rows with otherwise passing numbers: each must withhold verdict. Complete synthetic records exercise the pure arithmetic only. | Red: coverage tag has no supporting records. |

## Design

1. **Capture at writers, not at the next pick.** Inventory final writers in the pinned diagnostic build and map each to a count hook and fixture. Capture before/after local geometry, transforms/parent chain, dirty/unchanged checks and thin matrix slots needed to reproduce world bounds. Include lifecycle removal, owner/eligibility invalidation and cleanup. Reconcile replayed bounds/membership at phase boundaries against scene snapshots; snapshots alone cannot establish writer coverage. Unknown path or unsynchronized geometry → named gap, never zero.
2. **One scratch experiment.** Outside native timing, replay publications on scratch geometry and buckets seeded from captured occupancy. Time world/instance bounds refresh from writer operands, membership checks/diff, insert/remove, invalidation, allocation and cleanup. Walk the clipped ray supercover through actual empty and populated cells, consume bucket entries plus fallback, deduplicate and restore scene order. Compare with the independent offline overlap scan; do not time a scan of the whole scene as traversal. Preserve raw counts for each operation. Warm up, then three batches of 240 frames with equally instrumented work/control arms and consumed outputs; no per-entry clocks. Match each unit to its demand (including unchanged checks), charge once, and use the largest supported batch rate. If capture misses a cost or replay does not bound live demand, retain `unmeasured` with the reason.
3. **Evidence boundary.** Replace constant `scratchCoverage` with a pure validation of raw capture, replay reconciliation, batch coverage and common run provenance. Feed its result into the existing decision machine; do not add a second lifecycle. `planned + unavailable → pending`; successful preflight starts collection; fault, mismatch or incomplete evidence after start → stopped/inconclusive. Only complete fresh matched rows reach the frozen numerical gate; terminal runs reject new events. The runner writes artifacts as an effect. Writer samples, batch clock and sink are injected ports; Babylon hooks, browser timer and filesystem are adapters wired by the diagnostic runner. NullEngine and fake clock exercise the same accounting code.

### Alternatives rejected

Counting changed owners misses within-frame writes. Timing `Map.has` on missing keys omits reading occupants and building the list. Flipping `unmeasured` to `upper-bounded` would hide both defects.

## File changes (implementation phase only)

| File (under `tests/`) | Change and purpose |
| --- | --- |
| `cursor-attribution-build.ts`, `cursor-attribution-probe.ts` | Pin diagnostic-only writer hooks, emit synchronized records; fail on unmatched hook sites. |
| `cursor-attribution-model.ts`, `cursor-attribution-replay.ts` | Typed trace, populated walk, refresh/publication replay and batch accounting. |
| `cursor-attribution.ts`, `cursor-evidence.ts` | Persist and validate run-local coverage; pass validated costs to the unchanged decision thresholds. |
| Three tests above; `cursor-attribution-build.test.ts` | Pin operation-level results, admission failures and scratch-build hook placement. |

## Edge cases and failure modes

Fallback occupants stay candidates even when every visited cell is empty. A missing instance, stale parent, dropped event, nonfinite cost, partial frame window or parity failure leaves the affected cost unresolved. Distinguish a witnessed zero from absent instrumentation. Bound trace size to the frozen windows; overflow invalidates the visit rather than dropping rows silently.

## Verification (future tooling change, software only)

```sh
node --test tests/cursor-attribution-writers.test.ts tests/cursor-attribution-model.test.ts tests/cursor-attribution-build.test.ts tests/cursor-evidence.test.ts
npm run typecheck && npm run lint && npm run format:check
npm run check:full && npm run build
node tests/cursor-attribution.ts --smoke
```

Record focused red then green and inspect the software smoke artifacts: populated reads and writer rows present, software provenance explicit, no admissible timing verdict. No wall-clock assertions in CI.

## Risks and rollout

Heavy capture can distort timing: keep writer probes in matched count visits, not native timing arms. Stop tooling work after fixture reconciliation and fail-closed integration. **Later only**, on independently restored healthy matched RTX 2070 hardware, start a new run with fresh build/probe hashes, renderer and workload preflight. Follow story 1's fixed visit cap, calibration (≤10% per shrine visit), floor/idle charges, three paired rows, spread/error gate and stop rules verbatim. Never mix archived or smoke batches into that run. Independent review of qualifying raw evidence, not passing fixtures, is the gate to 16.2.

## Out of scope

No hardware probe, reset, recovery or campaign now. No production index, picker changes, tuning, new scaling study, positive/negative finding, roadmap edit or dependent story.
