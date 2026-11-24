# Publish the baseline and comparison gate

- **Task source**: `docs/plan/roadmap.md:46–53,60–63`
- **Epic / Story**: Epic 1 / Story 1.2
- **Status**: proposed
- **Branch**: `epic-1-encounter-hitch`
- **Depends on**: accepted [1.1 recipe and control witnesses](story-1.md); gates 1.3.

## Goal

Give later encounter changes a hardware comparison that can distinguish a slow simulation callback from a long gap between callbacks. Publish the frozen baseline, including misses; a complete baseline need not meet a frame budget or explain the hitch.

## Acceptance criteria

- [ ] Publish raw visit IDs, artifact locations and SHA-256s, exact replay command, source and warmed-start manifests. For each of full encounter, no-alert doorway and reduced-living encounter, collect three fresh valid visits at each of Low and High **per mode**, all witnessed under native RAF (54 visits). Keep invalid attempts and reasons.
- [ ] `off` supplies outcomes: FPS, interval and callback p95/p99/max and shares over 16.7 ms, sample counts, 0–5 ticks/callback histogram, phase durations and per-phase worst frames. Report each repeat and min–max across repeats, not pooled frames. Separate startup latency from cadence.
- [ ] Separate DEV-only coarse/detailed replays identify tick, squad/route requests and credits, occupancy/door probes, rig solve and render submission where measurable. No new nested timers, no summing inclusive scopes, no GPU-time inference. Unresolved attribution names a matched GPU/compositor trace as the next measurement.
- [ ] Publish a gate for **every** runtime-changing encounter story in Epics 1–5: matched comparison against both immediate parent and frozen baseline, including controls, repeat spread, phase durations and tails. Unmatched runs can describe behavior but cannot establish a speedup. A reproducible tail regression blocks progression pending investigation.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Delayed launch then slow callback | `tests/encounter-report.test.ts` | Exclude launch interval; associate longest gap with previous callback and next tick count, including five; count zero-tick renders | Red: no phase-aware report |
| Mixed phase, singleton, empty and tied maxima | `tests/encounter-report.test.ts` | Ordered phase labels/counts, explicit unavailable statistics, deterministic ties; no silent zero substitution | Red: summary missing |
| Changed start or evidence | `tests/encounter-report.test.ts` | Detect moved NPC, changed door collider, untracked source change, missing control/repeat, software renderer and detailed-only evidence | Red: no eligibility gate |
| Attribution parity | `tests/encounter-browser.ts` | Hooks restored; same setup and attack/door witnesses across modes; no subsystem hooks in off | Red: encounter attribution absent |

## Design

Use the 1.1 driver. Before each visit record input/recipe hash, actual quality settings, viewport (start at 800×450), DPR, camera, warmup steps and the authoritative end-of-warmup snapshot: hero, every actor ID, role, HP, pose/location, heading, motion, task/alert/attack, squad membership/slots, route intent, objective clocks, door open/locked/motion/collision state and population/settling. Compare canonical fields, not just hash or seed; list mismatches. Native end ticks may differ. Pin software versions, CPU, OS, GPU, driver, actual Chromium/WebGL renderer, refresh rate, power profile or unknown, foreground/display state and background load. No concurrent build, screenshots, traces or browser tests.

**Reproduce the source, not just its commit.** Follow `tests/cpu-profile.ts`'s content hashing, extended to all served inputs and the runner/recipe. Record `git rev-parse HEAD`, `git branch --show-current`, `git status --porcelain=v1 -uall`, lockfile and path/content digest before and after capture. For dirty captures archive `git diff --binary HEAD` plus nonignored untracked input files with relative paths and hashes; represent deletions explicitly. Reconstruct against HEAD and verify the measured input digest before comparing. Keep patch/source snapshots locally with the raw data; publish manifest and access location, not unrelated private files. Decline if identity is incomplete, changes mid-run, or the Vite process cannot be tied to this checkout.

**Frame accounting.** Number callbacks from entry. Startup is launch → entry 0. For entry i>0 the interval ends at i and starts at i−1: join the phases/tick range and measured work of callback i−1, then the catch-up count at i. Mark mixed phases explicitly; don't assign the gap to a later alert. Record one trailing callback after the terminal witness so its cost can be joined to the next entry; label it, don't extend gameplay phase duration. Off records only outer callback work, never invent a subsystem breakdown. FPS = 1000 × between-callback interval count / their summed milliseconds; report callback durations separately. Use `src/cpuMetrics.ts` distribution convention, report phase sample sizes and histogram totals; a short phase's p99 may be its maximum.

**Attribution and stop rule.** Reuse `src/cpuProfile.ts`'s existing disjoint outer scopes and detailed counters. Where a count is missing, count at its existing work boundary without timing each probe. Report actual work per tick as well as per callback; multiple ticks can follow a slow frame. Correlate by phase across visits, not by pretending different visits share frame IDs. Finish the prescribed matrix once. One replacement per invalid cell visit only for a documented correctable setup fault; if still short, publish incomplete, not a frozen comparison. No sampling until a favorable result appears.

### State model, events, transitions and effects

No new game lifecycle. Treat report generation as a pure classification of immutable visits: validate identity/start/witnesses → ineligible with reasons or eligible by lane. Complete eligible cells → baseline; missing cells → incomplete. Comparison additionally requires both reference manifests and matched pairs; evidence outside the required lane is rejected. Only the CLI reads files and writes summaries. No retry state in the classifier.

### Ports and adapters

Reporter consumes typed visit records and returns tables/verdicts. Inject filesystem, revision/host reader and browser capture at the Node runner, using the existing CPU harness conventions; tests pass fixture arrays directly. No telemetry service or database.

### Alternatives rejected

CPU7 stable RAF, controlled tick throughput and EF0 generation spans are not encounter baselines. Average FPS hides a single bad activation. Low/High differences are not proof of a GPU bottleneck.

## File changes

| File | Change | Why |
| --- | --- | --- |
| `tests/encounter-browser.ts`, `src/cpuProfile.ts` | Complete native capture, manifests and isolated attribution modes | Reuse hardware/session boundary |
| `tests/encounter-report.ts`, `tests/encounter-report.test.ts` | Add deterministic report and matching rules, using CPU7 report as reference | Same gate for future stories |
| `docs/encounter-baseline.md` | Publish results, artifacts, gate and reproduction instructions | Durable reference outside ignored `test-results/` |

## Edge cases and failure modes

Unknown renderer, hardware unavailable, invalid phases, non-monotonic samples, truncated buffers or mismatched warmed actors → invalid/untested, never imputed. Preserve standalone costs. When future behavior intentionally changes phase lengths, report that change separately; if starts differ, identify first divergence rather than weakening the gate.

## Verification

On the graphical host from this worktree, after the new entry points exist (runner owns `:5471`; never reuse another checkout's server):

```sh
node --test tests/encounter-report.test.ts
CPU_GPU=hardware CPU_REPEATS=3 CPU_MODES=off,coarse,detailed CPU_LABEL=baseline DEMO_URL=http://127.0.0.1:5471 node tests/encounter-browser.ts
node tests/encounter-report.ts test-results/encounter/baseline
npm run check:full
npm run build
npm run test:cpu:production
```

Separately start `npm run dev -- --strictPort` on 5173; run `npm run test:phalanx` then `npm run test:cpu:regressions`. Independently recompute a worst-frame join and cadence from the raw off rows. For future A/B comparisons capture one fresh repeat on each side in AB/BA/AB order per cell, with dedicated strict-port servers and unique labels. Compare parent/candidate and frozen/candidate separately under the same environment; preserve the original archive even if a fresh frozen-source replay is required.

## Risks and rollout

Observer cost, thermal drift and compositor stalls can look like simulation work. Keep attribution out of outcome runs, publish spreads and host limitations; investigate repeatable worse tails in any phase/control, not just the encounter median.

## Out of scope

No optimization, revised quality default, GPU attribution from submission wall time, hardware extrapolation or amendment of CPU7's negative verdict.
