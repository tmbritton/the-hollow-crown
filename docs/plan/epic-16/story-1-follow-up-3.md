# Distinguish an oversized sweep from zero crossed cells

- **Task source:** Third review rejection; [writer accounting contract, lines 14–16](story-1-follow-up-2.md#acceptance-criteria).
- **Epic / Story:** 16 / 16.1, follow-up 3
- **Status:** proposed; software only (Xid79)
- **Branch:** `main`

## Goal

When a writer moves from cell `0:0` to `65:0`, both endpoints fit the index but the 66-cell swept envelope exceeds its 64-cell enumeration cap. Record a coverage gap rather than claiming that none of the 64 intervening cells were crossed.

## Acceptance criteria

- [ ] Both occupancy publication and snapshot demand report the oversized sweep as unresolved. Neither `[]`, one `fallback` cell, nor a numeric diff is evidence for its cost. Endpoint removal and insertion still occur normally.
- [ ] The gap survives replay and serialization with writer identity, frame, and reason. A gap in any shrine, floor, or idle visit blocks both feasibility verdicts, even with otherwise qualifying evidence.

## Test plan (write these first)

| Test | File (under `tests/`) | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Sweep limit in both model APIs | `cursor-attribution-model.test.ts` | Use point bounds at world `(2,2)` and `(262,2)`; expect old `0:0`, next `65:0`, one removal/insertion and an unresolved diff. Control: `0:0` → `63:0` enumerates `1:0` through `62:0`. | Red: `publish` filters out fallback; `publishDemand` counts it once. |
| Replay a long move without a pick | `cursor-attribution-writers.test.ts` | Drive the same move in an idle frame; inspect the serialized write and case gap, then check final occupancy at the destination. | Red: replay reports complete coverage. |
| Admission after round trip | `cursor-evidence.test.ts` | Carry that replay gap into an otherwise complete synthetic matched report, varying the affected case; assert unresolved upkeep and no decision for either side of the numerical gate. | Red: the movement creates no blocking gap. |

## Design

Use one pure sweep classifier in `publish` and `publishDemand`: check padded tile limits before enumeration; return either exact intermediate keys (excluding both endpoint sets) or a named gap with no keys or diff total. Keep endpoint membership fallback separate. A confirmed unchanged check is still exact zero. Reuse the existing decision transition for incomplete evidence and the existing archive adapter; this calculation needs neither a new FSM nor a new I/O port.

### Alternatives rejected

Raising the cap only moves the bug. A truncated list or fallback token cannot establish a cost bound.

## File changes (future implementation, under `tests/`)

| File | Change | Why |
| --- | --- | --- |
| `cursor-attribution-model.ts` | Share the classifier and make incomplete demand explicit. | Prevent the two accounting paths from disagreeing. |
| `cursor-publication-replay.ts` | Preserve the result in `apply`, reconciliation and batch replay; never convert missing demand to zero. | Keep the write and case report auditable. |
| `cursor-attribution.ts`, `cursor-writer-evidence.ts`, `cursor-evidence.ts` | Verify archive-before-stop, report validation and decision admission; reuse existing gap guards wherever sufficient. | No artifact, batch cost or ledger may promote partial evidence. |
| Three test files above | Add deterministic model, replay and admission regressions. | Exercise consumers, not just the classifier. |

## Edge cases and failure modes

Test the first over-cap envelope (65 tiles), reverse movement, and unsafe tile coordinates without allocating by distance. Preserve exact empty lists for adjacent cells and existing spawn/disposal semantics; crossed cells are not persistent occupants.

## Verification

```sh
node --test tests/cursor-attribution-model.test.ts tests/cursor-attribution-writers.test.ts tests/cursor-evidence.test.ts
npm run typecheck && npm run lint && npm run format:check
npm run check:full && npm run build
```

## Risks and rollout

A valid long move may now stop a diagnostic visit. That is intentional: retain the raw reason for review rather than lowering the evidence gate. Do not reuse earlier gap-free summaries as proof.

## Out of scope

No hardware probe, recovery or timing campaign while blocked by Xid79; no production picker change, feasibility finding, roadmap update or advancement to 16.2.
