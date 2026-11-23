# CPU6b closeout — retain full-rate pose ownership, not a scheduler

- **Task source**: User decision to stop tuning and take CPU7 next; [CPU6b contract, lines 455–509](../cpu-performance-plan.md#cpu6b--separate-presentation-solving-from-simulation-frequency); [follow-up and round 2 evidence, lines 7–222](../../VERIFICATION.md#cpu6b--follow-up-1-diagnostics-and-shadow-census-stopped-before-replay).
- **Epic / Story**: CPU performance / CPU6b retained subset.
- **Status**: The exact retained subset received [final independent **APPROVE** for correctness only](../../VERIFICATION.md#cpu6b--retained-full-rate-subset). Scheduler/LOD deferred; whole-frame criterion unmet. CPU7 integrated acceptance is next by decision, not by a CPU6b performance pass.
- **Branch**: `main`; compare the dirty tree to CPU6a `96849ae`, not to an experimental switch in the candidate.

## Goal

Keep the distinction between computing a pose and writing it to the scene without changing when either happens. Players, combat witnesses and corpse contacts must see the same pose as on CPU6a, including during catch-up. Keep the tests and measurements that can detect a broken boundary.

## Acceptance criteria

- [ ] Each living fixed tick completes and writes the body; each completed tick publishes one final history sample after any tail constraint. Zero ticks produce no such work. Physics ownership and contact order are unchanged.
- [ ] Seeded tick traces and drawn transforms match the independent CPU6a oracle and grouped replay, including lethal slots 1–4. No oracle regeneration to make cleanup pass.
- [ ] Development attribution measures actual stage calls; ordinary production bundles expose no driver, timers or debug globals. No alternate scheduler, certified-limb fast path or experimental write switch remains.
- [ ] Review the exact retained diff separately; record correctness and observability, not a frame-time win. Leave the CPU6b performance item unchecked.

## Test plan (write these first)

| Test / file | Behavior pinned | Expected first run |
| --- | --- | --- |
| `tests/presentation-replay.ts`, `presentation-events.ts`, `cpu-regressions-browser.ts` | Pin CPU6a single-step fingerprints first; compare mixed zero/one/multi-tick draws, repeated blocks, landing/opening, event-time witness, seeded physical shapes, contacts and retirement at every lethal offset. | Green on existing dirty path; any first differing tick or sampled mesh after pruning blocks retention. |
| `tests/rig-bindings.test.ts` | Adopted pose equals independently evaluated FK including root scale; subsequent solver scratch mutation cannot change binding pose/history. Authored edits still evaluate. | Keep parity green; missing transfer/copy isolation must fail the targeted check. |
| `tests/cpu-browser.ts` | For 25 living actors at 0/1/2/4 ticks, each living stage has 0/25/50/100 calls and zero ticks have no stage timing entry. | Historical red: transfer reported zero for 25; green before and after pruning. |

Preserve behavioral solver and sheared/touching-box tests; remove assertions whose sole contract is fewer limb evaluations or experimental allocation counts.

## Design and alternatives

- **Keep one synchronous pipeline.** Grounding solves/refines; the binding completes action sockets from final joint matrices, then writes Babylon nodes, visibility and equipment. Body and cargo precede tail clearance; final tail precedes history. Keep the existing fixed-step composition and injected floor/contact and timing inputs. No pending-pose state, new chart or adapter hierarchy is needed.
- **Keep FK adoption as transfer of a result, not a second solver.** Grounded living input is the binding’s own just-finished, same-definition result: copy root and all local TRS, local matrices and globals into binding-owned storage. Do not alias scratch, adopt history or replay FK on that input. Reject incompatible definitions. Reset/authored/collapse inputs have locals, not a solved result: retain ordinary FK there. This distinction follows input ownership, not a quality tier.
- **Drop optional numerical paths.** Restore CPU6a’s single generic limb traversal rather than maintaining certified layouts, revision guards and special initial-target evaluation. Restore the simpler ordered tail SAT rather than carrying the allocation-only rewrite: fewer sampled allocations did not reliably improve frames. Preserve axes, early-outs and tolerances. Neither change is required to transfer a solved pose.
- **Keep corrected attribution.** `grounding.solve` is nested inside `grounding`; `binding.transfer`, `binding.completion` and `binding.draw` cover copies, action frames and synchronous body writes respectively. Generic `binding.apply` is not the living writer; history and tail work are outside those body timings. Do not sum nested percentiles or equate CPU render submission with GPU completion.
- **Stop condition already reached.** In round 2’s 32 production-mode visits, early Low four-tick whole-frame p95 was 38.2–40.5 ms on CPU6a versus 38.7–41.1 ms on the candidate. Follow-up census found one provisional 14-tick early run and none late; post-solve bounds and mutable support cannot certify safety before a read. Zero solves skipped. Preserve this evidence; do not retain a runtime eligibility path or repeat the experiment.

## File changes (subsequent implementation)

| Files | Disposition |
| --- | --- |
| `src/actorRendering.ts`, `src/rigs/{bindings,grounding}.ts` | Retain only full-rate orchestration, solved-result transfer, completion/write split and guarded timing at actual owners. |
| `src/rigs/{solver,tailClearance}.ts`, associated pure tests | Remove CPU6b specializations hunk by hunk; preserve CPU6a behavior and independent correctness cases. |
| Replay and attribution files above, `tests/cpu6b-visual-browser.ts` | Retain independent checks and drawn cadence coverage, not a candidate-vs-itself switch. |
| `tests/presentation-census*.ts`, `tests/presentation-schedule.test.ts`, `tests/cpu6b-{bench*,trace*}.ts` | Separate investigation-only tooling from delivery. Omit census/eligibility and one-off trial machinery and their exclusive hooks/tests; preserve historical reports and identify their source snapshot. Keep shared replay dependencies. |
| `VERIFICATION.md`, `README.md`, `docs/{README,rig-handoff,cpu-performance-plan,implementation-progress,implementation-path,game-direction}.md` | At closeout distinguish subset verdict, deferred scheduler and CPU7 queue; do not rewrite historical measurements as results for the pruned tree. |

## Edge cases and failure modes

- Lethal event mid-batch → capture adjacent completed history rebased to the event transform before stopping movement; physical writer takes over once. Publish corpse contacts before living feet read them.
- Zero-tick inspection, picking or shadow refresh → read the latest written geometry; never consume feedback or advance history. Reset/regeneration → no inherited velocity, retired writes or stale pose buffers.

## Verification

Inventory tracked **and untracked** changes (`git diff 96849ae`, `git status --short`); preserve unrelated edits. Run on the pruned tree, serially for browser checks, with a fresh dev server for targeted suites:

```sh
node --test tests/rig-bindings.test.ts tests/rig-handoff.test.ts
npm test && npm run check:full  # typecheck, full tests, lint, format
CPU_GPU=hardware npm run test:cpu:regressions
npm run test:cpu
node tests/cpu6b-visual-browser.ts
npm run test:rig:handoff && npm run test:rig:handoff:landing && npm run test:rig:tails:clearance
npm run build && npm run test:cpu:production && npm run test:production
```

Inspect matched Low/High 30/60/120 Hz captures. Verify Pages with `npm run build:pages` and production smoke at the Pages base. Record unavailable hardware checks as pending; historical passes do not approve a different diff.

## Risks and scope

Pruning by whole file can erase CPU6a fixes or disable the independent oracle; inspect each hunk and run parity before and after removal. Stop on a mismatch and repair ownership, not fixtures. No new tuning, scheduler prototype, LOD, physics-budget change, CPU7 execution, FPS claim or commit in this task.
