# R6 approach trace v4 — persisted witness and separate CPU/frame verdicts

## Completed RTX 2070 run

`test-results/encounter/trace-r6-v4-31faeede/` passed the native gate and offline archive verification: six alternating Low visits, no replacements or reported trace loss. KDE's `kde-inhibit --screenSaver --power` wrapped only the hardware command. In all visits the first displacement was callback 2 and the next moving callback was 3. That neighbor processed catch-up ticks, so it is not an equal-tick workload.

| Case (three repeats each) | Shader-preprocessing CPU samples, first / next | First minus next render-call wall time | First minus next callback interval |
| --- | --- | --- | --- |
| Reduced encounter | 290/0, 275/0, 303/0 | +40.3–43.9 ms | +26.9–32.7 ms |
| No-alert doorway | 144/0, 161/0, 160/0 | +23.0–28.6 ms | +14.0–17.3 ms |

Each sample containing `ProcessIncludes` or `_processShaderCodeAsync` counts once. Every matching sample fell inside the first movement's render call. This identifies a shared CPU-side lead before alert or door motion. All 12 selected frames linked through presentation; none provided on-device execution timing. Next, identify the material/effect variant involved, then test targeted preparation or reuse in untraced runs including startup. These diagnostics do not establish a speedup or attribute the entire render-call difference to shaders.

## Bounded protocol (new batch, not a retry of v2/v3)

1. Verify both sealed predecessor batches and replay all four rejected reduced visits under the
   new checks. Never use the replay to admit them. Check the three frozen Low/off starts per
   case, including door, against their first repeat. Keep the historical trailing snapshots and
   archived decisions untouched.
2. On the unlocked Wayland desktop, require the frozen host/launch configuration, foreground
   WebGL2 RTX 2070 and the owned Vite root. Before starting CDP, run fresh untraced Low/off
   reduced and door contexts. Compare the real Playwright objects and their written JSON
   against the matching frozen references. Require valid terminal witnesses and equal, empty
   parity verdicts. Check all four own `undefined` loose-owner slots become JSON `null`, and
   that concrete owner changes, signed transform changes, holes and nonfinite numbers fail.
   Abort before timing on disagreement; no software substitution for this gate.
3. If both pass, run exactly one new write-once `trace-r6-v4-*` batch with six slots, alternating
   reduced and door. Every slot gets a fresh context. Keep the 489-tick warmup, tick-459 CDP
   gate, 16 marked callbacks, 200 ms presentation tail, and existing time/byte limits. One
   immediate replacement total for a hard failure, seven attempts maximum. Stop immediately
   for source/cleanup integrity loss or desktop lock. No retry to improve timing or to get
   a missing presentation link. Do not run other builds/rendering alongside this collection.
4. Report CPU and frame controls separately. CPU requires healthy trace transport, valid
   matched witnesses, aligned marks and application samples in both windows. A missing
   renderer→Viz→swap→presentation link makes the frame control incomplete, not the CPU
   observation invalid; report which window/link is missing. Swap/presentation is not device
   execution. Device-clock evidence is required to quantify GPU execution; otherwise unknown.
   Verify and replay from disk. No visit here is a performance outcome.

```sh
node tests/encounter-trace-archive.ts test-results/encounter/trace-r6-c7b03a12 --prevalidate-v4
node tests/encounter-trace-archive.ts test-results/encounter/trace-r6-v3-29d7711b --prevalidate-v4
# Optional standalone hardware gate; timed mode always repeats both native checks before CDP.
CPU_TRACE=prevalidate-v4 CPU_GPU=hardware CPU_DISPLAY=wayland CPU_QUALITIES=low CPU_MODES=off \
  CPU_LABEL=native-r6-v4 node tests/encounter-browser.ts
CPU_TRACE=approach-v4 CPU_GPU=hardware CPU_DISPLAY=wayland CPU_QUALITIES=low CPU_MODES=off \
  CPU_LABEL=trace-r6-v4 node tests/encounter-browser.ts
node tests/encounter-trace-archive.ts test-results/encounter/<printed-batch>
```

## Evidence before collection

- The two v2 and two v3 reduced traces reproduced their original failed verdicts. V4
  counterfactual replay found no differences on either archived JSON or reconstructed live
  owner slots. The three frozen repeats of each case match repeat 1 under v4 parity. Frozen
  terminal snapshots remain one tick late: reduced 1433 vs terminal 1432, door 667 vs 666.
- Fresh native Chromium 159.0.8154.6 Playwright runs on SwiftShader are saved in
  `test-results/encounter/native-wire-smoke-46b44d54/`. Both reproduced all four explicit
  undefined slots and passed the owner, transform, hole and nonfinite mutations. Reduced
  matched phase ticks **489/693/697/1297/1372/1432** with end snapshot **1432**; door matched
  **489/649/666** with end snapshot **666** and 666 unaware ticks. No signed gameplay
  differences. Both had DPR **1** vs frozen **0.9999999812016114** (same 800×450 viewport and
  533×300 render target). The other differences were renderer, vendor, hardware flag and GPU
  identity. The DPR check stays exact; software does not clear hardware prevalidation.
- The door smoke also exposed a false callback rejection: callbacks **45–46** were
  **662→666** (terminal) and **666→672** (trailing). `holdWarmup` interrupts the accumulator
  at the terminal tick, so the trailing frame drains carry plus a new capped update. At 60 Hz
  the pair can consume up to `floor(2 × 0.08 × 60 + <1) = 10` ticks. V4 allows the remainder
  of that budget only on the trailing callback at the signed terminal tick; all active windows
  still cap at five and the historical validators are unchanged.

## Actual stop and what the numbers support

The opt-in Playwright regression passed on both fresh software contexts with the final encoder.
The RTX 2070 (driver `615.78.08`) was present, but ScreenSaver returned `true` at the actual
hardware gate. `test-results/encounter/native-r6-v4-77d1e7dd/` is the sealed, offline-verified
setup record: **zero hardware encounters started, zero replacements, zero new traces**.
No timed command was started. This is a desktop-lock blocker, not a demonstrated compositor
frame-delivery failure. Foreground hardware native parity, the matched CPU comparison and GPU
device execution all remain unmeasured by v4.

For context only, frozen untraced hardware callback 2 minus callback 3 entry gaps were
approximately **22–26 ms reduced** and **7–22 ms door** (three Low/off repeats per case).
The four rejected historic reduced traces had **23–52 ms** extra first-callback work and
**39–69 ms** extra submission wall time, with **271–352** shader-preprocessing stack samples
on first movement versus **0** on its neighbor. There are no equivalent door stacks. That
locates a repeatable historical CPU observation, not whether the same work explains the door's
hitch, nor how long the GPU executed. No optimization candidate or speedup is established.
