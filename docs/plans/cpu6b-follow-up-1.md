# CPU6b follow-up 1 — can a distant living pose skip a solve?

- **Task source**: Third CPU6b review (changes requested); [backlog contract, lines 455–509](../cpu-performance-plan.md#cpu6b--separate-presentation-solving-from-simulation-frequency), [original plan](cpu6b-presentation.md) and [measured results, lines 7–264](../../VERIFICATION.md#cpu6b--round-2-profiler-attribution-and-hardware-gate).
- **Epic / Story**: CPU performance / CPU6b, after CPU6a and before CPU7.
- **Status**: Proposed repair plan. No scheduling class or controlled whole-frame gain accepted. A negative feasibility result leaves CPU6b blocked.
- **Branch**: `main`; `96849ae` is the independent CPU6a oracle. Freeze and identify the uncommitted round 2 source separately as the incremental control.

## Goal

Spend less of a catch-up frame solving distant characters nobody needs to see. If the camera turns, a weapon releases or a character dies between draws, the first consumer must still see exactly what full-rate animation would have produced at that instant. Savings must be visible in the time to process and submit the entire frame, not merely in a smaller writer count.

## Acceptance criteria

- [ ] Retain full-rate stage ownership, independent pose-buffer transfer, certified solver reuse/fallback, corrected stage attribution, allocation-only ordered SAT change and their regression tests. Preserve raw evidence and its qualifications; do not resurrect the rejected setter or write-only experiments as wins.
- [ ] Attribute early Low separately at zero and four ticks in mapped production diagnostic builds. Show which costs track solves, scene work and GC and which remain unresolved.
- [ ] On the unchanged seeded fixture a nonempty class actually omits expensive numerical solves. Count net solves **after** demand, replay and deadline refresh; show a gain over the retained path with scheduling alone enabled. No weakening eligibility to manufacture population.
- [ ] Match the independent tick/event oracle, adjacent pose history, actual drawn/consumed geometry and seeded deaths across the original partitions, including the first demanded frame. Document the ownership and model partitions.
- [ ] Pass the predeclared controlled hardware decision below and the original verification gates. No success by relabeling work, replacing a workload or shifting the decision to CPU7.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Trace accounting | `tests/cpu6b-bench.ts` and local diagnostic runner | Join each sample to build, frame, phase and tick count; unresolved stacks and GC outside frames remain visible. No fixed work on zero ticks. | Existing stage counts green; missing phase/stack join red. |
| Shadow qualification (classify but do not skip) | `tests/presentation-schedule.test.ts` (new), `tests/cpu-regressions-browser.ts` | Known distant isolated grounded humanoid qualifies after four outside ticks; just-inside margins, unknown bounds, shadow-only caster, nearby tail, contact, changed attachment/parent or observer force full before use. Compare classification to exhaustive actual-mesh/consumer reads including reversed entity order. | Full-rate safe; positive qualification and reason counters absent. |
| Reconstruction oracle | `tests/presentation-schedule.test.ts`, `tests/rig-handoff.test.ts` | Fork at a full sample, vary inputs over 0–4 missed ticks, compare independent eager vs reconstructed previous/current world arrays, duration, linear/angular velocities, body frames and transformed equipment corners exactly. Mutate source scratch after recording; repeat reads without advancing. | New replay path absent; final-only pose fails derivatives. |
| Event boundary and retirement | `tests/presentation-events.ts`, `tests/presentation-replay.ts`, `tests/cpu-regressions-browser.ts` | Force a previously deferred actor to die in each slot 1–4; compare pre-stop entry, shapes, physical tick 1 through settle, witness, attribution and retirement. Also run full-rate controls: repeated blocks, landing on lethal tick, phalanx opening, hero respawn and both corpse modes. Assert which path actually ran. | Old oracle passes; required skipped-solve → event refresh not exercised. |
| Promotion and burst | `tests/cpu6b-visual-browser.ts`, `tests/models/cases.ts`, schedule tests | Camera turn/zoom, inspection/pick while paused, demand twice, teleport, same-ID replacement, regeneration and simultaneous promotions/deaths. Compare first demanded mesh and subsequent cadence with full-rate; bounded queue and aggregate recovery. | No tier transitions, replay bound or net-work assertion today. |

## Design

### 1. Diagnose before selecting work

The write-only trial saved 18.3% of body bindings but zero numerical completions. Round 1 eliminated real FK work; round 2 measured four-tick grounding at 4.5–5.1 ms **including** 3.1–3.2 ms solve/refinement, versus 0.1–0.2 ms transfer. Yet early Low tick medians fell while render p95 rose in every pair, and even zero-tick frames slowed. Neither “the solver regressed” nor “SAT allocations caused GC pauses” follows.

Use `tests/cpu6b-bench.config.ts` on the two frozen sources, minified production with matching local-only source maps. Save bundle/map digests; resolve sampled frames to application and Babylon source, verifying representative stacks. At stable `MOURNING-731`, Low, after tick 120, collect one AB and one BA pair per diagnostic mode with the existing `[0,1,2,4]` frame driver. First collect CPU profiles with aligned tick, presentation and `scene.render` boundaries; separately collect GC timeline events (minor/major, duration, heap before/after) with frame markers, not CPU or heap sampling enabled concurrently. Split render into active-mesh evaluation, dirty world-matrix/bounds updates and draw/submission; report unassigned/wait time rather than forcing attribution. Compare counts, self time, inclusive time and intersecting GC pause time by stratum, including work after a preceding four-tick frame. Inspect tail frames as well as medians. Check state hashes, hardware and repeat direction; samples and allocation estimates are not measured stalls. Save raw traces, mapped stacks and a baseline/candidate table in `test-results/`. No tracing or maps required in shipping builds; profiled timings never decide acceptance.

### 2. Establish what can be omitted

Instrument the retained full-rate path first. Inventory each read/write around `animateActors`, grounding/refinement, binding completion/history and the consumers below: owner, phase, inputs, mutations, earliest required revision. Keep doors/motion/combat/objectives/respawn and death physics, corpse-contact publication, action/feedback clocks, heading, stride, springs and any solver state feeding a subsequent tick on the original 1/60 clock. In particular, `actions.layer` and landing impulses must not run again during recovery. Identify whether foot locks, support sampling, prior IK results or solved equipment feed the next compact update. **If the compact update itself needs the full solve, exclude that case.** Do not save an entire solved rig every tick and call it compact.

Test one class: unedited certified non-player, tailless grounded humanoid on invariant support, free of social/cargo, shield/phalanx, jump, attack and interaction dependencies. Use conservative swept body/attachment bounds vs camera, proximity, shadow reach and CPU6a contact/neighbor demand. No stale active-mesh list, root-only test or quality-based safety decision. Require positive evidence of owned geometry and complete inputs; unknown edits/layouts/support revisions remain full. Log eligible actor-ticks, contiguous runs and each exclusion/refresh reason on the real early/late Low/High windows. Test each exclusion on both sides and during an already-deferred run. Distance alone does not disqualify a witness or prevent lethal damage.

### 3. Bounded replay probe (not a promise that replay wins)

Run-owned record keyed by entity **and binding instance**: `full → deferred` only after four consecutive excluded-from-demand ticks and a valid last full checkpoint (including previous/current history, solver continuation and world root). Journal at most four immutable tick-input packets in preallocated storage. Specify and measure bytes for checkpoint and packet: exact root/heading/scale, fixed dt, compact evaluated pose/action parameters, support/contact inputs and revisions actually read by the eligible solve. Never replay against today's mutable world, consume ECS events/RNG or retain aliases into solver scratch. If an input cannot be captured cheaply/exactly, fail closed *before* skipping. On discontinuity flush before mutation if old geometry is needed; otherwise invalidate as the eager reset does.

On demand reconstruct the last completed tick, not an uncompleted lethal tick. Run the existing numerical path in isolation from the checkpoint, in original order, publishing previous/current adjacent samples once, then required local/global/body/equipment nodes before the reader. At accepted damage do this before witness/shape capture, cancellation or `stopActor`; rebase to the event transform with support/ballistic velocity exactly once. Preserve exact entry before first physics advance, active→settled contacts and per-piece observation. At display/pick refresh after current camera/inspection is known but before shadow bounds, discovery and draw. Promote immediately on dependency entry, including releases and neighboring geometry reads. Repeated display at the same revision does not consume feedback, advance physics or append history. Retire on disposal; no replay into a replacement rig.

At four ticks refresh or re-anchor, never extend the log. **Replaying every missed solve on every deadline is not solve savings.** Test whether the expensive completion is a pure function of each saved compact sample: at an ordinary deadline evaluate just the final adjacent pair if independently sufficient, rebuild the checkpoint, and compare with sequential replay and the eager oracle at *every* offset. If an intermediate solved result is recurrent, use ordered replay only when needed; charge every replayed solve, including mandatory re-anchors. Reject if this merely redistributes the same work. Bound simultaneous debt for the probe to four deferred actors × four ticks; excess actors stay full, never postpone a demanded read. Measure worst-case synchronized recovery as well as ordinary costs.

### Decision and stop rule (set before profiling)

One diagnostic series, one shadow census, one class and at most one isolated replay prototype. Budget one AB/BA early Low screening pair in each order (240 frames/visit) against frozen round 2 plus one final matrix against CPU6a. Only rerun an invalid capture (wrong renderer, fingerprint, competing job or missing map) once with the reason recorded. No iterative threshold tuning. Stop before integration if there is no eligible residency on the unchanged fixture, an unbounded/mutable dependency, any reconstruction mismatch, no net reduction in numerical completions, or no positive net timed savings in both screen orders. Charge qualification, compact advancement, copying/allocations, re-anchors and forced replay; report gross skips vs paid solves, bytes, replay depth, per-event and burst p95/max. Reject a burst regression beyond full-rate repeat spread. A trace-supported pre-decomposition identical-affine shortcut could be investigated separately with live edit/ancestor invalidation tests; it is not a scheduling class or a substitute trial here.

For acceptance use the unchanged 32 visits: four alternating AB/BA pairs × Low/High × warmup 120/360, 384 frames/672 ticks per visit. Primary endpoints are controlled **whole-frame** four-tick and all-frame p50/p95, not tick subtotal or FPS. Require early Low improvement for all four endpoints in both orders, median paired reduction greater than the corresponding baseline repeat range; no other quality/window or zero-tick stratum may regress beyond its baseline repeat range. Publish every pair and max, not pooled favorable cells. Also require same-direction whole-frame improvement in the incremental early Low screen with the scheduler as the only difference. If diagnostics, correctness, feasibility or timing fail, remove/disable the trial, preserve retained fixes and negative evidence, state the failed gate and return for a backlog decision. Do not declare CPU6b done, promote CPU7 or broaden the class in this pass.

### Alternatives rejected

- Final display-only solves or sparse velocities lose the lethal adjacent pair; delayed geometry changes what a witness observes.
- Unbounded event replay trades ordinary frame time for an uncontrolled hitch. Writing less after the same solves, GC-only cleanup and setter comparisons have already failed to establish the required win.

## File changes (prospective implementation only)

| File | Change | Why |
| --- | --- | --- |
| `tests/cpu6b-bench{,.config}.ts`, `src/cpuMetrics.ts` | Local mapped diagnostic capture, class/work counters and paired reports | Separate attribution from timing. |
| `src/actorRendering.ts`, `src/rigs/{grounding,bindings,history}.ts`, proposed `src/presentationSchedule.ts` | Compact advance, certified read set, bounded record and exact materialization | Keep simulation ownership independent of draw cadence. |
| `src/main.ts`, `src/deathHandoff.ts`, `src/observation.ts` and audited consumer call sites | Supply current demand; request exact geometry before read | Combat never selects a presentation tier. |
| Tests above, `docs/rig-handoff.md`, `README.md`, `VERIFICATION.md` | Pin partitions, ownership table, measured costs and outcome | Keep historical reports intact; record only executed checks. |

## Edge cases and failure modes

Two blocks on one tick and successive ticks must each affect the fixed spring, never a replay mailbox. A camera jump on a zero-tick frame may demand geometry but cannot change duration. Hidden/menu pause accrues no debt; visible blur preserves world time. New corpse surfaces, moving parents, cargo changes or uncertain neighboring demand invalidate qualification before consumption. Synthetic collapse, active/frozen deaths and separated pieces are not living replay candidates. Compare same-piece inspection, shadows and actual matrices, not just semantic pose hashes.

## Verification

Run on Node 22.18+; start a fresh dev server for targeted browser suites. Execute serially, separate from benchmark visits:

```sh
node --test tests/presentation-schedule.test.ts tests/rig-handoff.test.ts tests/rig-bindings.test.ts tests/block-feedback.test.ts
npm run test:models && npm run typecheck && npm run lint && npm run format:check && npm test && npm run check:full
for s in cpu cpu:regressions rig rig:solver rig:actions rig:tails rig:tails:clearance rig:shield rig:shield:transitions animation defense social rig:handoff rig:handoff:landing ragdoll ragdoll:contacts skeleton:breakup discoveries inspection jump phalanx combat browser; do npm run "test:$s" || exit 1; done
BROWSER=firefox npm run test:combat && BROWSER=firefox npm run test:social
node tests/cpu6b-visual-browser.ts
CPU_GPU=hardware CPU_CASES=all CPU_REPEATS=3 CPU_LABEL=cpu6b-f1 npm run profile:cpu
npm run build && npm run test:cpu:production && npm run test:production
npm run build:pages && npm run test:cpu:production && DEMO_URL=http://localhost:4187/the-hollow-crown/ npm run test:production
```

Use the [original local build recipe](cpu6b-presentation.md#verification) with detached `96849ae`, preserved round 2 and candidate directories. On isolated RTX 2070/Ryzen 5 2600X headed Chromium/WebGL2 at 800×450 run `CPU_WINDOWS=low-120 CPU_REPEATS=2 CPU_FRAMES=240 node tests/cpu6b-bench.ts "$R2" "$TRIAL" f1-screen`, then `node tests/cpu6b-bench.ts "$CPU6A" "$TRIAL" f1-final` with defaults. Match tick-indexed inputs and start/end fingerprints; record source/bundle hashes, host/load, populations, reason counts per tick/display, distribution by 0/1/2/4 ticks, tick/presentation/render and whole frame. Inclusive submission is not GPU completion. Native RAF is context only. Replay original single/mixed partitions plus matched 30/60/120 Hz Low/High drawn sequences, first return/inspection, foot/grip/shield/tail and event-to-settle contacts. Hardware unavailable means pending, not pass.

## Risks and rollout

Main risk is that conservative eligibility or the adjacent-history requirement consumes all prospective savings. Shadow-classify first; compare reconstruction out of band before enabling one class. Keep the eager path available as a test control. Leave only verified changes after a failed experiment. Independent review of parity, workload controls and measured whole-frame benefit is required before approval.

## Out of scope

This replan changes only this file. No code, commit, backlog edits, CPU7 acceptance, AI/gameplay cadence, lower physics/clearance budgets, GPU work or rewriting prior evidence.
