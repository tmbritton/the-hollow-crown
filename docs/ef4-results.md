# EF4 — cost comparison and adoption decision

**NOT READY.** Production integration is implemented on `main`. Public Effect subpaths brought
both native startup medians within their unchanged limits. Generation latency is still inconclusive,
and the retained candidate does not have an independent READY verdict. The content prerequisite
remains open; no timing margin was increased.

## Final candidate latency campaign — predeclared, not started

After the source-only checkpoint is reviewed and pushed to `origin/main`, record its full SHA as
the candidate in the write-once manifest. Do not run `freeze` before that push. A is the historical
`398a1cf01fdebf8c072741c3de20670012795439`; B is that exact clean checkpoint, not the current dirty
working tree. Each gets a separately checked archive, lock, and `npm ci --ignore-scripts --offline`
dependency tree. Prime **both** locks before freezing. The same plain Node 26.0.0 binary and harness
run each arm with `LANG=C`, `TZ=UTC`, no Node flags, diagnostics, tracing, profiling or compile cache.
Use the original Ryzen 5 2600X Linux host with `/proc`, cpufreq policy/boost, and k10temp telemetry.
The manifest freezes source/dependency/tool hashes, both locks, host, settings, exact commands or
their argument templates, and [the ten unrounded historical midpoints and additions](../tests/ef0-contract.ts)
from the original `native-1/2.json`. No calibration or per-candidate recalculation.

- Exactly one campaign, 16 blocks, a fresh sequential process for each arm, two warmup rotations
  then 100 measured rotations over `MOURNING-731`, `trial-23`, `trial-27`, `ember-70`, `tribute-12` in
  that order. Order uses Fisher–Yates on eight AB/eight BA with the unsigned 32-bit LCG seeded by
  `0xef040001`. Windows start five minutes after freeze, then every 30 minutes; each lasts ten
  minutes. Collection must be started before the first window and span at most seven elapsed days,
  with at most 180 s per process and two hours active across the blocks. No booking or A/A run.
- Before each arm, take a five-second quiet interval; sample about every five seconds during the
  arm and once immediately after. Require at least 80% aggregate idle per interval, one-minute
  load ≤3, runnable count ≤6, k10temp below 75 °C, no observed competing browser/build/benchmark,
  and no sample gap above eight seconds. Close competing programs; arrange exclusive host use if
  needed. No simultaneous build, browser or profile. Boot/governor/boost drift, starts eight or more
  seconds after a window opens,
  invalid/missing telemetry or any invalid pair after the exclusive attempt claim is terminal.
- Use per-process rank 50 median and nearest-rank p95 (rank 95). For each seed and endpoint sort
  the 16 within-block B−A differences and report their spread and one-based `[d5,d12]`. A control
  median across blocks must be within the historical midpoint ± its frozen addition. On each
  matched endpoint, `d12 <= addition` passes, `d5 > addition` is over budget, and a crossing is
  inconclusive. All ten must pass. No pooled rotations, trimming, replacement blocks or retry.

```sh
# After publication, from the exact clean main checkout:
node tests/measure-generation-paired.ts freeze "$CHECKPOINT_SHA"
node tests/measure-generation-paired.ts collect
node tests/measure-generation-paired.ts replay
```

Freeze and collection write only to ignored `test-results/ef4-final-latency/`. Retain the attempt
marker, partial output, process identities, telemetry, exact commands, and verdict. Replay checks
the frozen inputs and reconstructs the numerical report; it does not clear EF4. Review block
independence, host drift and order effects, and reconcile correctness, trace/recovery, resources,
allocation, startup, animation, and root/Pages checks against the exact candidate before an
independent READY decision. A repeatable fixture oracle is not repeatable timing evidence.

## Source and measurement

### Review follow-up: startup-only trial predeclaration

One trial compares the repaired candidate with Effect root imports to the same candidate with only
the three production import lines changed to public `effect/{Cause,Context,Effect,Exit}` subpaths.
Both arms use the same scratch path, installed dependency tree, lock, native Node flags, and
unchanged EF0 import-only test fixture. Run the original cold-import and native start-to-exit
commands with 20 fresh processes per arm per lane, alternating AB/BA within each lane; no other
benchmark, loader hooks, profiling, build or browser suite concurrently. No retries or exclusions.
Report every sample and rank-10 medians/spread. Retain the subpaths only if their medians are at or
below both frozen ceilings (224.919097 ms cold, 469.3455785 ms native). This is not a generation
latency or allocation comparison. Procedure: [`ef4-startup-trial.mjs`](ef0-evidence/ef4-startup-trial.mjs).

### Review follow-up: startup-only trial result

On Ryzen 5 2600X / Node 26.0.0, one-minute load was 1.71 → 2.04 over the measured 38.6 s. All
80 samples, per-run load, sequence, exact commands and source/lock/fixture checksums are in
local `test-results/ef-checkpoint/original/docs/ef0-evidence/ef4-startup-trial.json`.
Import and native start are in ms.

| Lane | Root median (min–max) | Public subpaths median (min–max) | Δ median | Original ceiling | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Cold `world.ts` import | 390.342 (374.929–411.908) | 200.201 (181.404–214.380) | −190.140 | 224.919097 | Within; retain |
| Native import-only test start-to-exit | 637.441 (621.721–780.709) | 440.261 (420.185–493.139) | −197.180 | 469.3455785 | Within; retain |

Two native subpath samples exceeded the limit (pairs 9 and 10, 493.139 and 488.668 ms); the gate is
on the median and no samples were removed. The retained source matches the three measured subpath
checksums exactly. No lazy path, instrumentation, extra dependency, or startup timing retry was used.

### Review follow-up: matched animation spot check

One sequential pair used the unchanged EF0 hardware probe, the archived `398a1cf` source on owned
port 46410, and the retained candidate on 46411. Same headed Chromium 159.0.8154.6, hardware
ANGLE/OpenGL ES 3.2 on RTX 2070 (615.78.08), 800×600 CSS → 799×599 render, DPR ~1, High with shadows,
`MOURNING-731`, 60 warmups and 240 `animateActors` updates. Both had 25 actors, four settled corpses,
all four attack kinds, identical mean/max terrain queries (670.717/1,016) and identical captured
resource counts. Adjacent one-minute load 2.00 → 2.00 → 2.45; GPU 40°C at all three boundaries.

| Metric | Archived control | Retained candidate | Δ | Frozen ceiling | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `animateActors` CPU p95 | 4.100 ms | 4.400 ms | +0.300 ms | 4.510 ms | Within on this matched pair |
| `animateActors` CPU mean | 3.292 ms | 3.405 ms | +0.112 ms | — | Descriptive |

The rerun control is within the qualified EF0 4.000–4.200 ms repeat range. This is one matched
within-ceiling observation, not a new repeatability campaign, a speedup claim, or gameplay FPS
evidence. No second pair or favorable-sample selection. Raw logs: `test-results/ef4-review-anim-{baseline,candidate,host-before,host-mid,host-after}.log`.

### Review follow-up: production size

The same root Vite inventory (`node tests/measure-generation.ts assets`, gzip level 9 per file)
recorded **2,419,239 B raw / 634,459 B gzip** shipped JS (+31,680 / +10,725 B against EF0;
ceilings 2,649,703 / 689,270 B). Initial HTML-linked JS: 2,096,833 / 544,482 B. All shipped
files: 2,439,355 / 640,841 B. The root collector/fault marker scan passed. The extra copies are
opt-in only; the new sync exit wrapper does add Effect bookkeeping independent of diagnostics.
No new sampled allocation or generation latency numbers were collected in the startup trial.

### Original candidate comparison

- Control: Git archive of `398a1cf01fdebf8c072741c3de20670012795439`, `npm ci --ignore-scripts
  --offline`, unchanged EF0 harness and standalone import fixture overlaid. Candidate: the
  uncommitted EF1–EF4 implementation on `main` (same base), lock SHA-256
  `a32adb7ea1df998bb678a544d52a551ac9bbd06a7bcc6655651286c57f901b3f`.
- `node tests/measure-generation.ts` ran control then candidate, using the same original EF0
  harness (SHA-256 `051d7e328b4acd27193d5a115e83c359f4560e23845ce79ee17642fdd69026f8`),
  Node 26.0.0 on Ryzen 5 2600X. Each arm had five fresh processes × two warmups and ten timed
  rotations, separate profiled batches of ten worlds per seed/process, and 20 fresh processes per
  startup lane. No browser, build or other verification benchmark ran alongside the native arms.
  Boundary one-minute load fell **6.39 → 4.16 → 2.80**; the arms had different host load. This is
  one adjacent comparison, not the 16 independent paired blocks from the unexecuted design.
- Local raw artifacts: `test-results/ef4-native-{baseline,candidate}.json`,
  `ef4-native-{baseline,candidate}-host.txt`, `ef4-hardware-{baseline,candidate}.log`,
  `ef4-resources.json` and the Vite asset inventories. Baseline/candidate raw native file SHA-256:
  `4e5ee146ff8d41948cfa998d04355eedd4a70cda6de557ce9520fba1f7db217b` /
  `de7d699453606956e6d694c3feedb61ae1852f7f3388aad4a1cf0207345b8d11`.

## Original candidate generation time, diagnostics off

Times in ms. Control/candidate are within-window median-of-process statistics. Δ is candidate
minus control. The additions are those from the original EF0 evidence, not recalculated from
this control. Nearest-rank p95 of ten is a process maximum; across-process spread is shown to
avoid treating point estimates or overlapping samples as non-regression proof.

| Seed | Median control → candidate (Δ / allowance) | p95 control → candidate (Δ / allowance) | Process p95 ranges control / candidate |
| --- | ---: | ---: | ---: |
| `MOURNING-731` | 59.838 → 59.246 (−0.592 / 5.877) | 70.658 → 76.594 (+5.936 / 10.435) | 65.410–88.570 / 66.143–94.928 |
| `trial-23` | 232.579 → 226.720 (−5.859 / 22.894) | 268.897 → 264.354 (−4.542 / 37.056) | 253.235–278.581 / 249.131–298.269 |
| `trial-27` | 55.138 → 55.108 (−0.030 / 5.548) | 65.686 → 60.859 (−4.827 / 9.519) | 59.345–86.836 / 56.075–68.446 |
| `ember-70` | 69.644 → 69.598 (−0.047 / 7.119) | 80.247 → 77.263 (−2.984 / 11.903) | 74.735–87.378 / 73.621–85.782 |
| `tribute-12` | 63.271 → 62.711 (−0.560 / 6.307) | 73.911 → 71.956 (−1.956 / 10.773) | 66.559–76.683 / 65.139–78.821 |

Median process ranges (control / candidate, same seed order): 58.601–60.600 / 56.964–60.207;
226.826–234.830 / 224.449–228.468; 54.621–57.232 / 54.874–55.742;
69.491–72.519 / 68.277–71.772; 62.232–65.285 / 61.392–65.078.
**All ten point deltas are within the additions; all ten endpoints are unqualified** given the
single block and differing load, with process p95 spreads greater than the nominal additions.
Neither a speedup nor timing non-regression was demonstrated.

## Original candidate separate cost lanes

| Metric | Control → candidate | Δ | Frozen ceiling | Result |
| --- | ---: | ---: | ---: | --- |
| Cold `world.ts` import median | 122.475 → 393.419 ms | +270.943 ms | 224.919097 ms | **MISS** |
| Import-only native test start-to-exit median | 384.162 → 657.747 ms | +273.585 ms | 469.3455785 ms | **MISS** |
| Root Vite shipped JS (82 chunks), raw | 2,387,559 → 2,418,771 B | +31,212 B | 2,649,703 B | Within |
| Root Vite shipped JS, per-file gzip level 9 | 623,734 → 634,356 B | +10,622 B | 689,270 B | Within |
| Sampled allocation/world, `MOURNING-731` | 55,447,901 → 54,474,066 B | −973,836 B | 63,812,206 B | Within |
| Sampled allocation/world, `trial-23` | 219,339,957 → 217,492,427 B | −1,847,531 B | 252,570,778 B | Within |
| Sampled allocation/world, `trial-27` | 58,489,194 → 57,576,770 B | −912,424 B | 66,910,058 B | Within |
| Sampled allocation/world, `ember-70` | 69,991,511 → 68,352,209 B | −1,639,301 B | 79,904,389 B | Within |
| Sampled allocation/world, `tribute-12` | 68,349,721 → 67,553,950 B | −795,772 B | 78,414,128 B | Within |
| Warm animation CPU p95 | 4.600 → 4.500 ms | −0.100 ms | 4.510 ms | Candidate point within; matched result unqualified |

Startup ranges are disjoint: **110.159–136.178 vs 370.517–413.566 ms** (import) and
**365.579–400.220 vs 639.373–690.083 ms** (native start). The slower startup occurs on the arm
with lower sampled load; both control medians are below the frozen ceilings. These are actual
budget misses, not a prediction based on library size. Allocation is sampled churn, not retained
heap; the tested batches are below the original ceilings.

The unchanged asset-inventory command measured **2,096,365 / 544,379 B raw/gzip** for initial
HTML-linked JS and **2,438,887 / 640,739 B** for all shipped files. The root collector erase check
found neither the local collector warning marker nor the debug getter/fault controls. Production
request inventories contain only the document and bundled JS/CSS/shader chunks under each base.

Animation ran the same archived EF0 probe on strict ports 46376/46377, headed Chromium
159.0.8154.6 on ANGLE/OpenGL ES 3.2 / RTX 2070, High with shadows, 800×600 CSS → 799×599,
60 warmups + 240 `animateActors` updates. Both had 25 actors, four settled corpses, all four
attack kinds and identical tile-query counts (670.717 mean / 1,016 max). Control p95 was above
the qualified baseline repeat range (4.000–4.200), and this check supplies only one observation
per revision; it does not qualify a hardware pass or measure gameplay FPS.

The same-seed Low resource probe at 640×360 passed its three GC/retirement/regeneration cycles.
At 120 fixed settle ticks, each trial matched the EF0 inventory exactly: **2,382 meshes, 495 nodes,
28 materials, 4 textures, 4 render targets, 58 effects, 34 custom shader sources, 1 scene,
5,719 ECS entities**. Old scene/work/casters/observers/physics retired. This probe stops the
render loop for controlled stepping; the application failure/retry browser test separately
checks one application loop.

The `trial-23` Node sidecar contained 24 closed spans and a 3,461-byte minified run, with real
validation rejects on attempts 0 and 1 and success on attempt 2. These span timings describe that
traced invocation only. In a separate descriptive Node 26 session (three warmup pairs and 12
alternating on/off pairs per seed, one-minute load 2.25 → 2.45), medians were:

| Seed | Off median | On median | Median paired on−off (range) |
| --- | ---: | ---: | ---: |
| `MOURNING-731` | 57.497 ms | 58.362 ms | +0.435 ms (−3.103 to +16.325) |
| `trial-23` | 227.562 ms | 226.951 ms | −1.807 ms (−35.357 to +7.709) |

This single-process sample (`test-results/ef4-diagnostic-overhead.json`) cannot resolve a small
overhead and does not imply a speedup. It is separate from the disabled-path delivery comparison.
