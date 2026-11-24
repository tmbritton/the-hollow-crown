# Encounter replay and comparison gate

**Status: complete R6 hardware baseline, 54/54 eligible visits.** All six outcome cells miss the
16.7 ms interval budget in every repeat at p95. The baseline establishes measured cadence and tails
on one host; it does not establish a cause or a speedup. CPU7's results and fixtures are unchanged.

## Replay

From the checkout under measurement, on a responsive graphical desktop:

```sh
CPU_GPU=hardware CPU_DISPLAY=wayland CPU_REPEATS=3 CPU_MODES=off,coarse,detailed CPU_LABEL=baseline-r6 \
  DEMO_URL=http://127.0.0.1:5471 node tests/encounter-browser.ts
node tests/encounter-report.ts test-results/encounter/<printed-baseline-directory-name>
```

The runner owns a strict-port server, verifies its root with a launch nonce, and checks a blank
headed WebGL2 page before loading the game. Keep the browser foreground; stop concurrent rendering,
builds, and traces. Record refresh via `CPU_REFRESH_HZ` when known. Each batch has a unique local
directory. Its `manifest.json` records the replay command, recipe, checkout, host and source hashes;
`index.json` has each visit's filename and SHA-256 and the after-capture identity. The input-scoped
binary patch and archived untracked inputs represent the dirty overlay. The reporter reconstructs
the index against HEAD in a disposable Git index and object store, checking every input hash,
including deletions and the lockfile. For a runnable reconstruction use a separate clean checkout
at the recorded HEAD, apply `working-tree.patch` and restore the archived untracked files. Do not
apply archived overlays to a working checkout or publish unrelated working files.

R6 uses `MOURNING-795`, `pack:stairs` and four stable member IDs. Full and reduced use the same
fixed-tick ordinary key edges: approach the east doorway at z = −2, interact, step to about x = 18,
then back up and hold near x = 16 while the pack forms. Reduced uses normal lethal handoff for all
eight skeletons before the common 489-tick warmup. R5's 300 ticks left one throne skeleton moving;
the longer R6 warmup covers the eight-second natural ragdoll lifetime. The control takes the
negative-Z hallway through `door-1` from the same spawn and camera. No synthetic steps, teleport
or AI changes take place in the captured window. `visible` means membership of enabled visible
actor meshes in the active camera mesh list, not an occlusion measurement.

## Raw local evidence

All paths below are under `test-results/encounter/`. Use the batch's `index.json` for exact visit
IDs and hashes. Invalid attempts remain in their original directories.

| Batch | Observation |
| --- | --- |
| `witness-92d1407f` | Default headed Chromium timed out at launch. Six planned cells recorded as setup failures, not six separate hardware executions. |
| `witness-wayland-4b8db013` | Explicit Wayland headed launch also timed out; no confirmed hardware WebGL2. |
| `scout-cff4f798` | Initial headless setup could not reach readiness and required shutdown of the owned stalled browser. |
| `scout-isolated-5fc52791` | Software boot worked with display variables unset and Mesa/surfaceless settings. `MOURNING-731`: `pack:treasury` targeted `goblin:treasury:0` at tick 1, invalidating the no-alert premise. |
| `scout-r2-2126397f` | Revised seed `MOURNING-747`: `door-low-off-1` opened and crossed without an alert in software. `full-low-off-1` alerted at tick 586 and travelled at 587 (both callback 94), then stalled before physical rank readiness. Reduced was interrupted by dev reload. |
| `scout-r3-efb75191` | Deeper encounter waypoints did not resolve either replay. Full alerted/travelled at ticks 586/587 (callback 93); reduced started with 18 living and six settled remains and alerted/travelled at 585/586 (callback 66). Neither reached ranked/open/resolved. Door opened at tick 498 (callback 47) and crossed at 524 (callback 52) with no alert observed. Source hashing also marks this batch changed during capture; it is scouting evidence only. |

After reboot, `nvidia-smi -L` found the RTX 2070 and the blank headed Wayland preflight reported
foreground WebGL2, `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2070/PCIe/SSE2, OpenGL ES 3.2)`.
No system changes were made.

| Post-reboot artifact | Observation |
| --- | --- |
| `scout-r4-offline.json`, `witness-r4-6b2b88ab` | The x=31, z=0 then z=−2 route restored sight to up to three members briefly; maximum slot error never fell below 2.67 in the stopped-RAF scout. On hardware both encounters stalled at travel; the door crossed. |
| `scout-sweep2.stderr`, `offline-screen3.jsonl`, `offline-targeted.jsonl` | Bounded browser and pure geometry/input screening. The broad pure sweep retained 379 outcomes through `MOURNING-1100`; `795` and `882` formed ranks in several paths. A targeted `795` close western stop yielded a release candidate; pure screening was not eligibility evidence. |
| `scout-795-browser.json`, `scout-795-pair.json` | Confirmed the ordinary-input release on both populations in stopped-RAF browser scouting. Removing either six remote skeletons or just the two roamers left a warmed mismatch in other skeleton routes; R6 retires all eight rather than ignoring differences in common actors. |
| `witness-r5-4fb04afb` | Full resolved and the door crossed, but one of the eight reduced remains had not settled at tick 300. |
| `witness-r6-35486095` | Three eligible Low/off hardware witnesses, no common-start or fixed-input mismatch. Full alert → rank → opening → javelin release at ticks 694 → 1312 → 1387 → 1447; reduced 693 → 1297 → 1372 → 1432. Door opened at 649 and made the no-alert collider-clear plane crossing at 666. |

These witness batches are not repeats in the timing matrix. Only repeat a failed matrix cell once
for a documented setup repair; retain failures and report incomplete if the matrix is still short.

## Frozen hardware matrix

Local archive: `test-results/encounter/baseline-r6-480ffe1b/`. All 54 planned visits ran once, with
fresh contexts, no retry, no source edits or simultaneous builds during timing, and no eligible-cell
start or input mismatch. Signatures and lookup:

| Artifact / identity | SHA-256 or Git ID |
| --- | --- |
| `index.json` (all raw IDs and individual JSON SHA-256s) | `a12424b1d3b5ea3ffd46a7f9689cefa7e8cdf03ff1a64beb8a211de17984d4e9` |
| `manifest.json` (exact command, host and before-source manifest) | `563ac6b995e576fde2cae37b6857492ad72a3c58d175320f3f1dfac19630cb3a` |
| `report.json` (all 18 cells, ordered repeats and outcome spreads) | `c1d235f6103dc8bf81a5b744da7602b5642a54c2fa06e114970929a89d5b1f14` |
| `preflight.json` | `04aabfbf278312e218c252fd343e47c65b9fbbd32207b44f2d5f111dc267bb03` |
| Reconstructed source digest | `f14ca2d53eac5f50f4864c00a8190ed9fbdd3cef50d180aa7587df9db6cc043f` |
| R6 recipe digest | `daa05239638dc05200156dd951cad19ba35a75019521dc810531b30eedd5e0ae` |
| Git HEAD (plus archived patch and untracked inputs) | `398a1cf01fdebf8c072741c3de20670012795439` |

Host: Ryzen 5 2600X, 12 logical CPUs, RTX 2070 / NVIDIA 615.78.08, foreground WebGL2 in Chromium
159.0.8154.6 on Wayland; Node 26.0.0. Resolution 800×450, DPR 1; raw start snapshots record the
actual quality, render dimensions and camera. Refresh rate and power profile were not known.
Order was full, door, reduced, then Low before High and off before coarse/detailed within each
case/quality. In particular, the full/Low repeat drift limits any population inference.

`off` only. Each cell below lists the actual three repeat values, in order; no pooled frames.
Full precision, per-metric min/max, phase durations, per-phase worst frames, startup latency, active
sample counts and 0–5 ticks/callback histograms are in `report.json`. Frame-join and cadence formulas
were separately recomputed directly from all 18 outcome visits.

| Case / quality | FPS (min–max) | Interval p95 ms | Interval p99 ms | Interval max ms (min–max) | Callback max ms | Intervals >16.7 ms |
| --- | --- | --- | --- | --- | --- | --- |
| Full / Low | 57.4 / 33.4 / 23.0 (23.0–57.4) | 21.5 / 47.8 / 70.3 | 28.8 / 53.3 / 82.7 | 43.8 / 72.8 / 89.1 (43.8–89.1) | 43.1 / 71.9 / 87.8 | 59.8% / 99.6% / 99.5% |
| Full / High | 44.1 / 45.5 / 49.8 (44.1–49.8) | 29.2 / 30.5 / 26.4 | 35.5 / 43.9 / 29.9 | 50.3 / 52.8 / 54.0 (50.3–54.0) | 49.8 / 51.7 / 53.3 | 99.4% / 98.2% / 96.9% |
| Door / Low | 56.8 / 58.2 / 57.2 (56.8–58.2) | 18.7 / 18.4 / 17.9 | 32.2 / 23.5 / 34.1 | 42.5 / 45.4 / 41.2 (41.2–45.4) | 41.9 / 44.9 / 40.3 | 82.8% / 73.4% / 87.1% |
| Door / High | 56.3 / 55.6 / 56.8 (55.6–56.8) | 21.8 / 21.2 / 19.7 | 37.3 / 31.1 / 26.6 | 45.2 / 43.8 / 45.1 (43.8–45.2) | 44.7 / 43.2 / 44.2 | 62.9% / 80.7% / 80.5% |
| Reduced / Low | 57.0 / 57.2 / 57.5 (57.0–57.5) | 18.8 / 19.4 / 19.1 | 23.8 / 25.1 / 22.7 | 58.5 / 66.8 / 61.9 (58.5–66.8) | 57.9 / 66.2 / 61.3 | 83.3% / 75.0% / 76.2% |
| Reduced / High | 50.4 / 50.0 / 47.1 (47.1–50.4) | 25.9 / 25.7 / 26.9 | 31.5 / 35.0 / 30.0 | 66.8 / 64.9 / 70.3 (64.9–70.3) | 66.0 / 63.7 / 69.6 | 96.7% / 98.0% / 99.5% |

Coarse/detailed are separate attribution visits, not outcomes. Each raw `capture.attribution`
contains samples and bounded route records with inclusive scopes and counters, paired to its own
`capture.frames` by callback order and starting tick. All 36 attributed visits pass sample joins and
mode-specific instrumentation checks. The reporter compares each to its same-case, same-quality,
same-repeat `off` visit: all 36 pairs match exact gameplay facts, including rank member positions
and slots. Callback IDs and transient projectile IDs are ignored. For example,
the reduced/Low coarse callback 2 contains 58.3–70.7 ms of `scene.render` wall time and only
1.4–2.1 ms in `combat` across those three replays; do not sum inclusive scopes or interpret
submission wall time as GPU time. See the [hotspot decision](encounter-hotspot-decision.md) for the
limits and the next measurement.

Independent review found that the original archive's `end` snapshot follows the diagnostic trailing
callback, not the terminal tick. The terminal witness, tick and active-frame timing are intact;
do not use that legacy `end` field as exact terminal population/visibility. The reporter enforces
terminal tick equality in all modes and qualifies only the frozen archive after checking the pinned
manifest and index hashes, the reconstructed source, and each visit hash. The live harness
snapshots at trailing **entry**, before further simulation, without charging that snapshot to
the preceding callback interval or passing its elapsed time to the trailing tick accumulator.
The current reporter revalidated the unchanged 54 visits and all 18 complete cells without a
recapture. Timing results match the original report; the new output adds cross-mode matches and
explicit legacy snapshot annotations. The separate `terminal-witness-r6-6c8f22ed` hardware run
passed all three Low/off cases under strict end/terminal tick equality (full 1447, door 666, reduced
1432), without any archive exception.

## Gate for every runtime-changing encounter story in Epics 1–5

1. Require witnessed full, no-alert door and reduced runs, Low and High, three valid visits
   per lane. Keep `off` as outcome only; join each interval to its **preceding** callback's cost,
   phase(s) and tick range, and to the **next** callback's catch-up count. Report startup
   separately and do not pool raw frames across repeats. Mixed callbacks have their own label.
2. Use separate coarse/detailed replays to compare phase-aligned CPU scopes and work counters.
   Require gameplay parity with the matching `off` visit and actual detailed-only counters in the
   detailed lane; labels and shared timing scopes alone are not evidence of detailed instrumentation.
   Scopes can be inclusive; do not add them. Render submission is not GPU time. If attribution
   remains ambiguous after a complete baseline, collect a separate matched GPU/compositor trace
   across the implicated phase and a control. Do not trace the outcome visits.
3. Compare each candidate to **both** its immediate parent and the frozen baseline on the same
   host with AB/BA/AB order per cell. Run paired captures with `CPU_REPEATS=1`, a shared
   `CPU_PAIR` label per pair, and `CPU_REPEAT_NUMBER=1`, `2`, or `3`. Capture all three lanes on
   both sides. Give the reporter
   comma-separated lists of candidate, parent and frozen batches. For distinct candidate batches
   against frozen, use `candidate-for-parent-list::candidate-for-frozen-list` as the first argument.
   Verify source and each warmed start, route edges, evidence, environment, and visit
   order. Report each repeat, sample counts, min–max, phase durations and tails, including control
   regressions and intended gameplay changes. A reproducible regression blocks progression;
   an unmatched comparison can describe behavior but cannot support a performance claim.
4. Preregister at most one experiment after attribution. Require all three paired reductions
   in the designated phase's worst interval and a median reduction larger than either side's
   spread against both references, with intact witnesses and no displaced hitch. See the
   [decision record](encounter-hotspot-decision.md). For a retention decision, pass the same
   `CPU_TRIAL` JSON before launching **each** paired batch, then pass that file as the fourth
   reporter argument. It names `name`, `quality`, exact `phase`, `parent`, `frozen` and `candidate`
   source digests, and the `hypothesis`, code `boundary`, gameplay `invariant` and `stopRule`.
   A new contract at report time cannot authorize retention. If the compared frozen harness
   predates a capture-only correction, disclose the shared measurement overlay and archive the
   new matched replay instead of replacing its original baseline files.
