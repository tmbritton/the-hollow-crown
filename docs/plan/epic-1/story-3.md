# Decide whether to fix a measured hotspot

- **Task source**: `docs/plan/roadmap.md:46–53,64–65`
- **Epic / Story**: Epic 1 / Story 1.3
- **Status**: proposed
- **Branch**: `epic-1-encounter-hitch`
- **Depends on**: accepted [1.2 baseline and gate](story-2.md), built on [1.1](story-1.md).

## Goal

Decide whether one specific piece of runtime work explains a repeatable encounter hitch well enough to change it. Deliver a defensible decision even if no change is warranted; only a successful hardware trial can deliver a performance improvement.

## Acceptance criteria

- [ ] Cite the baseline visit/frame IDs, affected phase and quality, preceding callback, catch-up count and spread. Contrast no-alert door and population control at both qualities. Select **at most one** contributor with a falsifiable prediction. If evidence cannot separate the causes, record what is unresolved and the next discriminating measurement; do not edit runtime code.
- [ ] Before a trial, pin parent, frozen reference, exact recipe/host, hypothesis, one code boundary, phase metric, gameplay invariant and stop rule below. No alternative optimization if this one misses.
- [ ] Retain only if the affected phase improves beyond repeat variability against matched parent and the frozen comparison supports the finding, gameplay witnesses remain intact, and neither controls nor another phase acquire a reproducible hitch. Report every repeat, including adverse results.
- [ ] Publish investigation verdict and performance verdict separately. Negative/inconclusive evidence can close investigation, not meet the performance target. If the comparison was invalid, report untested/inconclusive rather than a negative effect.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Decision on fixed report fixtures | `tests/encounter-report.test.ts` | Reject overlapping repeat ranges, one winning outlier, a displaced door hitch, unmatched starts and attribution-only wins; accept separated improvement and intact controls | Red: trial rule absent |
| Target invariant (only after selection) | Existing `tests/*.test.ts` suite for selected owner | Name concrete input, outputs and work boundary in preregistration; pair unchanged gameplay outputs with a regression check for the measured redundant work | Existing parity passes on parent; new work check fails before change |
| Native control and gameplay parity | `tests/encounter-browser.ts` | Pack travels, forms, opens and resolves; door crosses without alert; reduced population settled; no dropped updates | Parent establishes witnesses; reject broken candidate |

## Design

Review full vs reduced at fixed quality to test population dependence; compare door-only with the same stage of traversal to test door work. In coarse/detailed runs look for a specific operation occurring **before** the repeated slow interval, not work accumulated in the following catch-up ticks. Check request/credit, probe and rig counts against phase duration and outer times. Counts alone are not an outcome. If the evidence points only to submission or unexplained gaps, request one matched GPU/compositor trace on and off the affected phase. Keep tracing separate from FPS runs. No candidate by default.

**Bounded trial.** Register the primary outcome as the maximum between-callback interval attributable to the selected phase per valid `off` visit, measured in ms (use 1.2's boundary/mixed-phase rule). Freeze the affected quality before seeing candidate timings. Make one local, reversible change preserving semantics; replay full, door and reduced at Low and High, three fresh matched repeat pairs each in AB/BA/AB order against parent and frozen baseline. Share the reference only if its measured source and environment match both. Use the same driver on every side and disclose any measurement-only overlay. Look at callback p95/p99/max, interval tails, shares over budget, phase durations, actual ticks and worst-frame joins to detect moved work.

For each cell report three values and range. Require all three paired reductions in the primary cell and a median reduction greater than the larger within-side max−min spread. Check the frozen reference by the same rule before claiming a baseline speedup. Hold if a control, other quality or adjacent phase shows a repeatable tail increase (all three pairs worse and median increase beyond the larger spread), or witnesses show a new stall even if an aggregate hides it. Flag ambiguous regressions rather than claiming no displacement. Publish absolute budget status separately: faster need not mean under 16.7 ms. One completed matrix ends the experiment. If invalid, allow only 1.2's bounded setup repair, not a tuning retry. Insufficient/negative evidence → do not retain the runtime diff; reopening requires new evidence and a new hypothesis.

### State model, events, transitions and effects

Decision table over immutable evidence, not a new runtime FSM: `review + ambiguous → unresolved` (publish question); `review + discriminated → registered` (freeze trial); `registered + invalid pairs → inconclusive`; `registered + valid matrix → retain` only on metric, parity and control pass, else `reject`. Missing evidence cannot transition to retain. Terminal decisions reject further data under this trial ID. Effects are report publication and conditional retention/removal of the candidate only; execute outside the pure report function.

### Ports and adapters

Consume 1.2's validated comparison records through its report interface; use the same hardware capture/file adapters and test with fixture records. If selected work is a pure local calculation, keep it in its existing owner: no new clocks, global instrumentation switches or framework. Do not introduce a gameplay state machine for an experiment decision.

### Alternatives rejected

Optimizing several suspected systems together makes attribution impossible. A smaller enemy roster, weaker rigs or quality cut changes what is played; the controls are not candidate fixes.

## File changes

| File | Change | Why |
| --- | --- | --- |
| `docs/encounter-hotspot-decision.md` | Register prediction before tuning; append raw IDs, deltas, parity, limits and verdict | Audit the decision even with no runtime diff |
| `tests/encounter-report.ts`, `tests/encounter-report.test.ts` | Extend the 1.2 report only as needed for paired decision and spread | No second profiler |
| One evidence-selected `src/` owner and its focused test, conditional | Name exact paths before trial (e.g. `src/occupancy.ts` **only if** occupancy dominates the affected callbacks); otherwise none | Bound trial; do not preselect a culprit |

## Edge cases and failure modes

If the baseline is absent or invalid, stop at dependency 1.2. Hardware unavailable or dirty source unreconstructable → no speedup claim. A missing attack, altered route, mismatched warmed start or cheaper frame caused by less gameplay invalidates retention even if timings improve. Preserve evidence of rejected candidates; don't leave a dormant shipping switch.

## Verification

Use 1.2's headed hardware command from each identified side, one repeat per invocation (`CPU_REPEATS=1`, unique labels/ports). Example single visit batch for the candidate after implementing the runner:

```sh
CPU_GPU=hardware CPU_REPEATS=1 CPU_MODES=off,coarse,detailed CPU_LABEL=candidate1 DEMO_URL=http://127.0.0.1:5472 node tests/encounter-browser.ts
node tests/encounter-report.ts test-results/encounter/candidate1
node --test tests/encounter-report.test.ts
npm run check:full
npm run build
npm run test:production
```

Repeat per the alternating matrix above, archiving the 1.2 manifest (revision **and** working source digest/dirty overlay) with each label. On a separate `npm run dev -- --strictPort` server run `npm run test:movement`, `npm run test:phalanx`, `npm run test:combat` and the selected owner's browser suite sequentially. Inspect untimed gameplay, not screenshots during capture. On the no-candidate branch verify the baseline/raw joins and report tests; record hardware trial as not run.

## Risks and rollout

Three repeats provide a conservative decision rule, not population-wide statistical proof. Report host and phase limits; don't move thresholds after capture. Independently review the exact retained diff and raw comparisons before describing a fix as delivered.

## Out of scope

Second candidates, tactical changes planned for Epic 2, scheduler/LOD revival, population cuts, EF0 generation targets, or declaring the original CPU7 budgets met from this investigation.
