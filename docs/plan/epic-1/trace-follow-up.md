# What delays the first moving approach callback?

- **Task source**: `docs/encounter-hotspot-decision.md:22–27`
- **Epic / Story**: Epic 1 / investigation follow-up
- **Status**: proposed
- **Branch**: `epic-1-encounter-hitch`

## Goal

Determine which work, if any, consistently accounts for the first-movement hitch compared with the next steady approach callback. Use the R6 reduced encounter and no-alert door control; neither traced wall time nor a successful diagnosis is a performance outcome.

## Acceptance criteria

- [ ] Archive six matched hardware traces: reduced, door, reduced, door, reduced, door; fresh context and seeded visit each time, Low quality throughout. Report every attempt in order, including failures.
- [ ] For both callbacks in each visit, publish the selection evidence, aligned trace slices and sampled stacks. Show first-minus-steady differences per visit and min–max across repeats per case, not pooled frames.
- [ ] Name a candidate only if repeatable excess work maps to a specific source or frame dependency across all three repeats and the door comparison supports that interpretation. Otherwise record what remains unresolved; never substitute estimated GPU time.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Select and align | `tests/encounter-trace.test.ts` | Synthetic zero-tick, mixed-phase and delayed frames select by movement, not callback number or longest duration; reject ambiguous marks. | Red: selector absent |
| Classify evidence | Same | Known stacks and linked device events classify separately; GPU-thread tasks alone, absent samples, dropped packets and unfinished streams cannot establish device execution. | Red: classifier absent |
| Admit visit | Same | Test each lifecycle transition and invalid event; reject source drift, unmatched R6 witness, software rendering and trace visits offered as outcomes. | Red: admission rule absent |

## Design

1. Reuse `tests/encounter-browser.ts` preflight and source archive. Require foreground headed hardware WebGL2, same host/browser/driver/display, 800×450 DPR 1, no concurrent rendering or builds. Record actual renderer, settings, launch args and order. Verify before/after input hashes, served-root nonce and reconstructible overlay; diff against frozen R6, allowing only disclosed capture/tooling differences.
2. Run R6 `MOURNING-795`, native RAF, 489-tick warmup and original fixed-tick input edges. Match each visit to its case's Low/off witness: camera, quality, warmed population/actor state, route and terminal tick evidence (eight settled skeletons and pack alert→rank→opening→release for reduced; door-1 opens and crosses without alert for door). Do not require equal callback numbers across visits. Continue gameplay to terminal after the short trace ends.
3. Require explicit unlocked desktop status. Hold warmup at tick 459 until browser-wide CDP `Tracing.start` is acknowledged, then reset the cadence clock before running the final 30 warmup ticks. Enable User Timing, timeline, V8 CPU profiler samples, `cc`, `viz` and `gpu` categories. Request supported device timing events and record actual categories. In the DEV capture adapter emit visit/callback-keyed `performance.mark` at callback entry, render-submit boundaries and exit; record tick span, phase and player displacement. Select the first approach callback with actual displacement and the next moving approach-only callback under unchanged input before door motion. Never pick the fastest neighbor. Capture through the next entry and linked presentation; join entry-to-entry gaps to the **preceding** work and following catch-up ticks.
4. End tracing, await `Tracing.tracingComplete`, drain the CDP stream through EOF. Decode profile nodes, sample IDs and time deltas on the renderer trace clock; cite function/script/location, sample counts and marked windows. Follow frame/flow IDs across renderer, compositor, Viz and GPU process. Report JS samples, CPU submission slices, explicit driver waits, device-timestamped execution and compositor scheduling separately. Overlap or an unsampled gap is not a wait; GPU-process CPU work is not device execution. Do not add inclusive or concurrent slices.

**State and boundaries:** Pure reducer: ready + preflight pass → recording; recording + stop → draining; draining + EOF → validating; validating + checks pass → archived. Failure/timeout in any active state → failed; reject other pairs. The runner wires capture and archive ports to Playwright/CDP and write-once filesystem adapters; selection, alignment and admission use plain records and no I/O. No new gameplay machine.

**Alternatives rejected:** Playwright action traces, coarse CPU scopes and isolated FPS readings cannot correlate sampled application work with browser frame scheduling.

## File changes (during execution)

| File | Change | Why |
| --- | --- | --- |
| `src/encounterCapture.ts` | Opt-in DEV marks and motion witness | Identify the actual callback without changing simulation |
| `tests/encounter-browser.ts`, `tests/encounter-trace.ts` | Separate trace schedule, CDP adapter and pure analysis | Reuse hardware/source checks without admitting diagnostic visits to the timing matrix |
| `tests/encounter-trace.test.ts` | Deterministic fixtures above | Guard evidence interpretation |
| `docs/encounter-hotspot-decision.md` | Append verdict and artifact IDs | Preserve historical findings |

## Edge cases and failure modes

Check buffer usage, `dataLossOccurred`, truncation, timestamps, mark pairs, sample coverage and frame-linked cross-process evidence in both selected windows. Loss, missing required tracks, failed parity or ambiguous windows → retain the raw attempt as incomplete. Unsupported device timing → explicitly unknown, not zero; still report independently supported CPU/compositor findings. Validate before scheduling the next visit. Allow one documented setup repair and one immediate replacement of the failed slot (seven visit attempts maximum); stop on a second failure, or immediately if source or cleanup integrity is lost. Never retry to improve a result.

## Verification

```sh
npm test && npm run lint && npm run format:check && npm run typecheck && npm run build
# Proposed diagnostic entry point; run separately after build, on the hardware desktop.
CPU_TRACE=approach CPU_GPU=hardware CPU_DISPLAY=wayland CPU_QUALITIES=low CPU_MODES=off CPU_LABEL=trace-r6 node tests/encounter-browser.ts
```

## Risks and rollout

Tracing perturbs cadence. Store traces, raw visits, profiles, settings, source manifest, hashes and report in a new write-once `test-results/encounter/trace-r6-*` batch. Verify hashes offline; leave CPU7 and all R6 archives untouched. Even with CPU scopes off, these are **diagnostic visits only**. Keep the untraced parent/frozen outcome and preregistration gate in `docs/encounter-baseline.md:126–157` unchanged.

## Out of scope

No gameplay or optimization changes, speedup claim or roadmap advancement. Defer full/Low travelling to a separate investigation only if its regression reproduces under controlled order.
