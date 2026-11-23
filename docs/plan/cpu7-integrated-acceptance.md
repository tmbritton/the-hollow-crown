# CPU7 — integrated acceptance and remaining GPU work

- **Task source**: [CPU performance plan §6, lines 565–586](../cpu-performance-plan.md#6-cpu7--integrated-acceptance-and-remaining-gpu-work); targets at lines 517–536 and in the [CPU0 measurement contract](../cpu-baseline.md).
- **Epic / Story**: ad-hoc / CPU performance, CPU7
- **Status**: [Investigation approved](../cpu7-integrated-results.md); performance acceptance not granted. The original criteria and checkboxes below are retained as the study contract, not a pass record.
- **Branch**: `main` at `88a297e`

## Goal

Answer two questions separately: how much faster is the shipped game than CPU0 on a real display, and does the same amount of gameplay still produce the intended results without new hitches, leaks or visual defects? Deliver a reproducible report even if the answer is “no improvement.” Use it to recommend the next GPU investigation, or explain why none is justified.

## Acceptance criteria

- [ ] Publish one row per comparison, quality, host and workload described below, with exact source and recipe identity, valid repeat count, spread, evidence location and verdict. Never fill an unavailable measurement with a historical number. Attempt the quiet hardware desktop comparison; label it pending if unavailable. Record M1 availability and, if available, compare both revisions there separately.
- [ ] All controlled pairs have matching starting conditions, input/camera scripts and measured simulation steps, with event and visual witnesses for every scenario. Report missing witnesses, divergent states or broken interactions as findings, not savings.
- [ ] Report single-step and complete frame costs, interval distribution and actual catch-up, p95/max hitches, allocations, resource lifetimes and capture review. Distinguish a regression from an invalid comparison, and a result within repeat variability from a demonstrated win.
- [ ] Score **performance targets separately from delivery**: ≥30% reduction of median combined tick/presentation cost in **both** entrance and stable; warmed update/submission p95 <~12 ms; actual desktop 60 FPS / 16.7 ms frame budget by quality; no new adversarial p95/max regression. Check pinned route ≤4 ms or documented work/latency bound and report active vs settled death budgets separately. Mark each met, unmet, inconclusive or pending with evidence. A reviewed negative report completes the investigation, not the missed targets.
- [ ] Document the GPU recommendation and confidence, retain CPU6b's full-rate correctness-only verdict and deferred scheduler/LOD, and obtain independent review of the evidence and any tooling before closeout.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| ---- | ---- | --------------- | ------------------ |
| Pair eligibility (table-driven `node:test`) | `tests/cpu7-report.test.ts` (new) | Synthetic reports reject differing recipe, viewport, quality, host, actor state or tick window for controlled pairs; native pairs match start, not end tick. Unverified renderer cannot yield hardware FPS. Missing counters stay unavailable. | Red: comparison helper absent. |
| Summary arithmetic and verdict | same | Known frame intervals yield FPS from reciprocal mean interval, not callback time; histogram includes zero-tick frames; overlapping repeat ranges cannot establish a win. Negative and pending cells survive reporting. | Red: no summarizer. |
| Existing recipe and session contracts | `tests/cpu-browser.ts`, `tests/cpu-regressions-browser.ts`, `tests/cpu-workloads.ts` | Lifecycle cleanup, real draws, controlled replay and scenario witnesses; validate each revision against its own supported contracts before comparing. | Existing checks should pass; abort invalid cells on failure. |
| Interaction transcript | `tests/cpu5-interactions-browser.ts` as fixture reference; `tests/cpu7-interactions-browser.ts` if needed | Same off-root target visible/pickable, inspection pauses/restores camera, same-seed regeneration releases old scene resources. Assert the target is actually off root and compare sampled world/pose/visibility outcomes, not implementation-specific cache counters. | Existing probe covers portions; missing matched transcript/resource samples fail the new contract. |

## Design

**Freeze the comparison before timing.** Use separate clean checkouts of original CPU0 `abf8586` and shipped `88a297e`, not CPU6a, CPU4, or a candidate switch. Verify CPU0's recipe-2 source SHA-256 against `e8b4bc7a5adc9fcb2e00444fec19a0b527caa59a370f7da348b1edf5076d1307` (archived as `013079c` **plus** implementation); resolve discrepancies before calling it the original. Save full SHAs, status, harness hashes, lockfile, Node/browser/OS/driver, actual renderer, viewport, DPR, render dimensions, quality, display refresh/power state and background load. Explicitly map each server URL to its checkout; never reuse an unknown server. External CPU7 readers may normalize reports; no backport of candidate simulation to CPU0.

**Two lanes, never pooled:**

1. **Native RAF, integrated outcome.** Run original `live-low,live-high` recipe, fresh `MOURNING-731`, same stable-room setup (the original recipe teleports there), camera, warmup, quality-specific settings and 800×450 viewport. Three paired quiet repeats per quality and mode on the same desktop; alternate checkout order AB/BA/AB. Close other workloads; no concurrent builds, traces or screenshots in timed windows. Use all 72 real callbacks/window, `off` for outcomes, separate `coarse` for attribution. Record actual simulation time and steps per callback (0 through 5, including accumulator carry), cap hits if observed, callback and interval median/mean/p95/max, FPS, fraction above 16.7 ms and slowest frames. Do not force equal terminal simulation time in RAF: catch-up is an outcome. Qualify claims as measured recipe/viewport, not production at every resolution. M1 uses its own matched pairs and actual renderer.
2. **Equal-work replay, feature-state evidence.** Three fresh repeats per side, same recipe warmup/length, starting actor roles, health, equipment, doors, physics ages, camera path, quality and fixed `1/60` elapsed steps. Use `coarse` for outer timings, separate `detailed` for counts, never sum nested timers. Use the catalog's `frames-low/high` scheduled 0/1/2/4-step draws for equal-time presentation. Compare semantic checkpoints across revisions (document intended differences, not blindly equating version-specific hashes); assert repeated fingerprints within each revision. Keep any within-revision feature-state comparison explicitly labelled and matched on all other inputs. It cannot substitute for lane 1.

| Controlled coverage | Witness to record alongside cost |
| --- | --- |
| `entrance,stable,hitch,movement,doorway` | Idle population, traveled path, door transition and pinned request input/result; single-step combined cost, sweep/door reads and request latency. |
| `phalanx,shield,cargo` | Live rank recovery/opening, thrust and actual impact; repeated accepted blocks and visible shield reactions; pickup, carry, interruption/resume. Verify measured intervals include the events. |
| `ragdoll,bones,burst,settled` | Separate cold handoff, moving articulated islands, separated pieces, accumulated frozen bones and crossing contacts. Sample active/retired counts and allocations per phase; flag 24-death stress as such. |
| Off-root observation, inspection and regeneration | Use the same scripted camera and displaced remains on both sides; capture subject/outline, geometry, shadows and cutaways, enter/exit inspection and verify restored camera. Repeat three identical regenerate/settle cycles after warmup; compare scene/mesh/material/texture/render-target counts and observer ownership at equivalent post-disposal points. |

For each row record per-repeat medians, p95s and maxima, range across repeats and paired deltas. Require consistent direction and separation beyond repeat spread for a timing claim; inspect the worst sample and relate it to catch-up, route, death, render or unknown. Record explicit allocation counters with units and heap snapshots separately (GC-dependent, not total allocations). Review labelled untimed captures at matched checkpoints for popping, missing bodies/equipment, floating contacts, shield lag and stale scenes. Counts still growing after warmup are findings, not a plateau. Keep raw JSON, manifests, screenshots and traces under ignored `test-results/` with unique labels. Stop after the planned repeats; replace an invalid pair once with the reason retained, otherwise mark pending. No tuning loop.

**GPU decision.** Compare Low/High native intervals against CPU tick/submission and catch-up on the same host. If CPU headroom exists but frame intervals remain high, request a bounded hardware GPU/compositor trace or one-variable resolution, shadow or AA probe at identical scene state; distinguish pixel cost from CPU traversal and vsync. Low/High alone changes several variables and cannot identify one setting. Recommend native-resolution defaults or cheaper shadows/AA only as follow-up hypotheses supported by the evidence. Consider generation-time baking only for demonstrated static lighting cost, accounting for dynamic characters/doors, player-following shadows and camera cutaways. If attribution is ambiguous, report “unresolved” and name the discriminating measurement.

### State model and ports/adapters

No game state machine changes. Reuse the existing profiler's prepare/warm/sample/report/stop lifecycle and `finally` restoration. The report is a pure classification of immutable observations: missing evidence → pending; mismatched controls → invalid; eligible pair → scored. No retries inside that classifier. Its input port is a pair of typed run summaries, output a verdict and reasons; Node reads JSON and writes summaries, Playwright collects observations. The standalone test CLI wires them together. No runtime service, clock or filesystem in comparison tests.

### Alternatives rejected

- Historical RTX numbers vs today's candidate — different sessions cannot bound today's variability.
- Suppressed draws, software RAF, synthetic cadence or feature-flag A/B as desktop FPS — none measures the shipped hardware loop against CPU0.
- Reopen CPU6b or change quality until a target passes — changes the subject of acceptance.

## File changes (subsequent execution)

| File | Change | Why |
| ---- | ------ | --- |
| `tests/cpu7-report.ts`, `tests/cpu7-report.test.ts` | Small test-side reader/comparator and deterministic cases | Validate comparability and arithmetic outside measured code. |
| `tests/cpu7-interactions-browser.ts` | Fill only missing paired interaction/resource evidence using existing fixtures | No production instrumentation or change to CPU0 recipe semantics. |
| `docs/cpu7-integrated-results.md` | Human-readable methods, per-lane tables, exclusions, target scorecard and GPU decision | Durable report independent of local raw files. |
| `VERIFICATION.md`, `docs/cpu-performance-plan.md`, `docs/README.md`, `README.md` | Link reviewed outcome and reconcile current status only | Preserve historical baselines; record only checks actually run. |

## Edge cases and failure modes

- Hardware timeout, SwiftShader/generic renderer, remote or busy desktop → keep CPU/count evidence; hardware gate pending. M1 unavailable → say so; no extrapolation.
- Recipe drift, missed shield impact, different elapsed ticks in controlled runs, stale URL or absent samples → exclude with reason; do not compare unequal work. Native terminal divergence alone is expected.
- Regeneration cancels a session → collect before disposal, start a fresh session after recreation; never continue timing through a stale observer. Record transition hitch separately from warmed costs.

## Verification

These are the original study commands, not checks claimed by this plan. Use the [execution report](../cpu7-integrated-results.md#reproduce) for the frozen-data reader and current untimed off-root invocation. Use Node 22.18+. In each checkout run its own locked dependencies and dev server sequentially; stop the previous server before switching revision. Store report labels with revision and repeat. Example commands for one visit (repeat as specified above):

```sh
git rev-parse HEAD && git status --short
REV=$(git rev-parse --short HEAD); R=1
CPU_GPU=hardware CPU_CASES=live-low,live-high CPU_MODES=off,coarse CPU_REPEATS=1 CPU_LABEL="raf-$REV-$R" npm run profile:cpu
CPU_CASES=all CPU_MODES=coarse,detailed CPU_REPEATS=1 CPU_LABEL="controlled-$REV-$R" npm run profile:cpu
# Use only controlled cells from the second command for equal-work comparisons.
```

On the study checkout, run checks outside timing windows. Start `npm run dev` for targeted browser scripts; run serially, then stop it. Use the supported browser for each suite. Check the built preview separately, not against dev.

```sh
node --test tests/cpu7-report.test.ts
npm run typecheck && npm run lint && npm run format:check
npm test && npm run check:full
npm run test:cpu && npm run test:cpu:regressions
node tests/cpu7-interactions-browser.ts
npm run test:movement && npm run test:phalanx && npm run test:rig:shield:transitions
npm run test:rig:handoff && npm run test:ragdoll:contacts && npm run test:skeleton:breakup
npm run test:discoveries && npm run test:inspection
npm run build && npm run test:cpu:production && npm run test:production
git diff --check
```

## Risks and rollout

The main risks are measuring observer overhead and mistaking a cheaper but different scene for a win. Keep instrumentation modes separate, verify witnesses before interpreting time and review captures as well as counters. Independent review should reconstruct one pair from raw data, verify both build identities and challenge any GPU attribution; resolve findings and re-review before updating status. There is no runtime rollout or defaults change to revert.

## Out of scope

No new optimization, CPU6b scheduler/LOD, physics simplification, GPU defaults, baked lighting, EF work or portable FPS threshold in CI.
