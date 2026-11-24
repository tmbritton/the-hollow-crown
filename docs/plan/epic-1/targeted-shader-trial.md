# Fix the rig reset race, then test targeted shader preparation

- **Task source**: `docs/shader-warmup-trial-result.md:5–24,34–52`; prior contract: `shader-warmup-trial.md:45–59` (same directory).
- **Epic / Story**: Epic 1, ad-hoc follow-up
- **Status**: proposed
- **Branch**: `epic-1-encounter-hitch`

## Goal

Make focus loss safe throughout the player's lifetime. Then ask whether preparing only the missing first-movement scale variants reduces the visible hitch without adding more than 100 ms to any paired load. The broad prototype moved the first-displacement median by 50.8 ms versus parent but added 1,357.2 ms to median Low regeneration; all six pairs were inadmissible. Neither its timings nor its runtime are a baseline to reuse.

## Acceptance criteria

- [ ] Reproduce the original exception without warmup, identify the owning page and event order, and demonstrate the regression passes with the lifecycle fix alone. Keep the live-rig assertion.
- [ ] In an untimed draw audit, targeted first-moving programs are ready before input on both qualities; no speculative passes, simulation ticks, visible transform changes or lost shadow casters.
- [ ] Publish reconstructible arms, registration, raw ordered pairs and a verdict under the gates below. Correctness is independently retainable; shader preparation is not retainable on coverage or primary timings alone.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Reset across disposal | `tests/rig-lifecycle-browser.ts` (new) | Attach external page-error listeners before navigation through context close. Record page ID, generation, monotonic time, event, persisted flag, disposal and full stack on ordinary W and R6 reset pages. Exercise real navigation/close and replay the observed ordering deterministically. | Red on unmodified parent with the stack below; if not reproduced, stop before timing. |
| Live vs retired owner | `tests/rig-lifecycle.test.ts` (new) | Active blur/hide stops movement, clears keys/pointer, marker, jump/pose and target; persisted hide/show resumes with fresh input and no catch-up. After retirement, repeated blur/hide/dispose cannot touch a rig or dispose twice; regeneration binds a working new owner. | Red: reset still targets retired player. |
| Key selection and ownership | `tests/targeted-shader.test.ts`, `tests/targeted-shader-browser.ts` (new) | Fake compiler checks exact-key deduplication, Low exclusion, empty work, failure, timeout, late completion and quality replacement. Real submitted draws verify selected keys, resource cleanup, unchanged render state and gameplay. | Red: selected keys absent at READY. |
| Pair admission and verdict | `tests/encounter-report.test.ts` | Reject page errors even after final frame, missing endpoints, parity failures and mixed generations; test equality at cap and spread, sign, incomplete controls and secondary regression. | Red: missing combined decision. |

## Design

**Evidence first.** Under `test-results/encounter/shader-trial-lboASK/`, `timed-primary-repair/parent-1-parent.json:85073` records `HTMLDocument.<anonymous> → resetMovement → stopPlayer → resetActorRig → rigBinding` throwing `Humanoid rig must be bound before animation`. All 12 sides reported an error, without page/time attribution. `src/main.ts:957–973` resets on blur, pagehide and visibility change; non-persisted pagehide also disposes the engine. A truthy `game` at line 102 is not proof its rig is bound. Test disposal followed by visibility change as a hypothesis, not a known teardown exemption.

### State model and ports

Use one generation-owned reset target: `absent → live` on binding; on replacement or terminal hide, stop the live player while bound, retire the target **before** disposal, then release the scene/engine. Persisted hide stops but retains ownership. Input cancellation always clears page-level intent; only `live` emits actor/render effects. Terminal hide is absorbing, duplicate disposal is idempotent, stale generation events are rejected. Preserve active hide/show UI and clock semantics. Do not catch `rigBinding` errors or invent a second gameplay-ready flag.

For preparation use a pure selector and a small revision-tagged transition: scene-ready → preparing → complete releases existing READY once; empty work completes immediately. Current failure/timeout/context loss fails loading visibly; supersession cancels and releases resources; stale/duplicate events cannot release control. Enumerate and test rejected transitions. `main.ts` wires injected clock, reset target and scene-owned compiler ports; DOM events, Babylon objects and effect lifetime stay in adapters. Use fake ports for deterministic cases; add model cases for any exported machine.

**One candidate.** From `browser-red.json` intersect actual first-displacement draws absent at READY with camera `NONUNIFORMSCALING` and High directional-shadow scale variants. Freeze the observed signature families before timing. Select one real generated representative per matching pass, shader source, vertex/instance layout and full applied defines (including custom vertex color and lighting); skip already-ready keys. No seed, mesh ID or recipe switches. Check READY cache against actual submitted pass/program keys on 795 door Low and reduced High, and ordinary MOURNING-731 W Low/High. Report residual misses separately; they are not permission to expand. Reject the broad prototype's all-submesh queue, glow/FXAA/alternate inventory and hidden render: none is justified by these target draws. Preserve visibility, bindings, fixed clock and generated-resource cleanup.

### Paired experiment and stopping rule

1. Preserve the sealed `timed-primary/CPU_TRIAL.json` (`adda38f6…`) and archives. In a new ignored output root reconstruct the dirty parent and frozen R6, verify manifests, 54 frozen visits and six v4 admissions. Apply the same verified lifecycle fix to **all** measured arms; both references have no warmup. Document frozen v4 compatibility, identical passive markers and candidate-minus-fixed-parent diff. Seal new measured source digests, runner, schedule, workload, thresholds and control rules **before** timing. Never compare to historical milliseconds.
2. Match registered foreground RTX 2070/Wayland WebGL2, Chromium/driver, viewport 800×450, DPR/render dimensions, strict-port owned server and power inhibition. Sequential fresh Chromium launch per side, fresh contexts: ordinary non-debug default High navigation and real W first, then R6 navigation to High, quality selection and regeneration. No cold-driver claim. No traces, key auditing or profiling in outcome visits. Require zero page errors through close, native v4 signed starts, input/physical/phase witnesses, paired authoritative terminals, matching generation/quality and 489 warmup ticks. Lock, drift, missing marks or cleanup failure invalidates the pair.
3. Primary: seed 795 reduced/Low/off approach. Interleave parent and frozen comparisons by repeat, each AB/BA/AB (A reference); three pairs per reference, never pool. Measure RAF entry at the first actual x/z displacement to **next RAF entry**, and maximum approach interval. For **each metric against each reference**, all three reference-minus-candidate deltas must be positive; median ≥8 ms and strictly greater than **both** arm ranges (max−min). Report ordered values, spreads, next gap, work and catch-up counts.
4. Startup: candidate minus reference **≤100 ms on every pair and endpoint**, not on average: ordinary navigation origin → playable, separate R6 High navigation origin → playable, and that visit's regeneration entry → same-generation playable at selected quality. Use synchronous input-enabled marks, not debug polling, post-warmup `startupMs` or W latency. Keep ordinary W interval as a displaced-hitch control. Preserve outliers.
5. Stop on a necessary gate failure. An invalid comparison is incomplete, not negative; allow at most one documented setup replacement pair in the original order, never retry valid slow results. Only if primary passes, finish the registered full/door/reduced × Low/High × off/coarse/detailed matrix (216 side-visits total including primary). Door/Low/off no-alert first displacement must improve in all three pairs per reference; verify crossing and combat release witnesses. High tests the shadow path; full population tests whether benefit survives normal work. Use off for outcomes; coarse/detailed for attribution and parity. Apply startup cap to every off cell. Report phase p95/p99/max and over-budget share; reject repeatable new playable-adjacent hitch or other off-phase worst regression in all three pairs with median increase exceeding either arm's range.

## File changes (prospective)

| File | Change | Why |
| --- | --- | --- |
| `src/main.ts` | Own reset-target lifetime and pre-READY revision | Prevent calls into disposed scenes; share normal/reset path |
| `src/targetedShader.ts`, `src/targetedShaderRendering.ts` | Pure selection/transition and narrow Babylon adapter | Separate policy from compilation |
| Test files above, `tests/models/cases.ts`, isolated trial runner | Lifecycle, draw audit, admission and paired reporting | Keep diagnostics out of player and timing paths |

## Edge cases and verification

Exercise blur before binding, rapid regeneration/quality changes during compile, BFCache restore and context close on both pages. Fail closed on unknown ownership or missing coverage. Run `node --test tests/rig-lifecycle.test.ts tests/targeted-shader.test.ts tests/encounter-report.test.ts`, `npm run check:full` (includes typecheck, lint and formatting), then the two new browser scripts with `node` against an owned dev server, `npm run test:movement`, and `npm run build && npm run test:production`. Run hardware visits separately from checks.

## Risks, rollout and out of scope

A ready key does not prove driver work disappeared. A valid miss on timing or startup ends this candidate: record the failed gate and defer warmup; no widened allowlist, threshold tuning or extra repeats. Reopen only on fresh bottleneck evidence. Review the lifecycle-only diff separately if shader work is dropped; review exact retained runtime and controls before delivery. No historical result reclassification, roadmap completion, general shader cache or gameplay changes.
