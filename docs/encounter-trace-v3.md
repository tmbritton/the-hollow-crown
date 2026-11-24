# R6 approach trace protocol v3 — stopped, no matched matrix

## Why this is a new batch, not a retry of v2

`test-results/encounter/trace-r6-c7b03a12/` stopped after two resolved reduced visits
(first slot and its one replacement); both were rejected, zero admitted, no door visits.
Both traces drained to EOF without reported loss and have sampled stacks and linked
renderer/Viz/swap/presentation chains in both selected windows. Offline comparison with
the archived `baseline-r6-480ffe1b/reduced-low-off-1.json` leaves exactly `start.camera.4`.
Of the other 181 paths per visit, 177 were explicit `undefined` object properties and
four were `undefined` cargo tuple positions in the live Playwright result. JSON omits
the former and writes the latter as `null`. The verifier separately had the same
representation problem for five added source paths with no `frozen` hash. Hash and source
reconstruction checks stay in place; the original report and attempt order are unchanged.

The only numeric discrepancy is target Y: frozen `0.7499999999999997`, saved attempts
`0.7499999999999998` and `0.7499999999999999` (one and two binary64 steps). `renderUpdate`
lerps the camera target to stationary player support height plus `0.75` using
`1 - exp(-7*dt)`; cadence affects the last rounded additions. The pinned rule is:
only start camera index 4, both values within `4 × 2^-53` of `0.75` and of each other,
with identical binary32 rounding. Four steps allow the rounded lerp to stall at an
approximately 1/60-second cadence (`0.5 / (1 - exp(-7/60)) ≈ 4.54` steps), but the
bound is not expanded for other cadences. The other camera coordinates, display,
Low quality, warmed population/actor state, recipe/input, and exact physical phase/tick
evidence retain their prior checks. No tolerance for missing concrete values, null, changed
hardware/source or missing frame links. No changes under `src/` between v2 and v3;
four test/tooling files changed, including the browser runner.

## Bounded collection (historical; do not rerun)

1. Before browser launch, verify the historical seal/source/report and replay the v3 checks on
   **both** original traces. Require both counterfactual checks to pass; never count them as
   v3 visits. Require explicit unlocked desktop, matched R6 host, foreground Wayland WebGL2
   RTX 2070, original viewport and Low/off settings; no concurrent builds/rendering.
2. Run one new write-once `trace-r6-v3-*` batch: fresh contexts in reduced/door order,
   three repeats each. Same 489-tick warmup, CDP gate at 459, mark prefix, presentation tail,
   and CDP bounds. Validate before advancing. One immediate replacement total; stop on a second
   failure (seven attempts maximum) or immediately on source/cleanup integrity loss. Do not
   restart for missing presentation, inconvenient timing or matrix incompleteness.
3. Run the offline verifier on the new output. Only use admitted rows for matrix comparisons.
   These are diagnostic visits, never eligible as outcomes.

```sh
node tests/encounter-trace-archive.ts test-results/encounter/trace-r6-c7b03a12 --prevalidate-v3
CPU_TRACE=approach-v3 CPU_GPU=hardware CPU_DISPLAY=wayland CPU_QUALITIES=low CPU_MODES=off \
  CPU_LABEL=trace-r6-v3 node tests/encounter-browser.ts
node tests/encounter-trace-archive.ts test-results/encounter/<printed-trace-r6-v3-batch>
```

## Actual execution and stop

The initial v3 prevalidation cleared both old captures on parsed JSON, but did **not**
recreate live array slots. V3 removed the 177 object-property diffs and cleared the
camera check; the live runner still compared `undefined` against archived `null` at
`start.state.detail.authority.cargo.{0,1,2,3}.3`. These are `owner?.id` slots
(`src/cpuProfile.ts`); all four cargoes are loose with no owner, and ID, revision and
transform are unchanged. The mismatch persisted in the one replacement. **Two reduced
visits started and resolved at tick 1432, two trace streams, two parity rejections, zero
admitted, zero door visits.** No further hardware run. The offline tool reconstructs the
four live slots only for the pinned v3 seal and reproduces both failed verdicts. The v2
replay now reports parsed archive and reconstructed live cargo parity separately. Neither
archive was edited or reclassified. Source reconstruction and before/after checks passed.
Both batches used RTX 2070 hardware WebGL2, Chromium 159.0.8154.6 and the R6 host/launch
configuration; all four reduced captures retain frozen phase ticks 489/693/697/1297/1372/1432.

**Next gate, not another retry:** make live admission consume the exact serialized visit
that the offline verifier consumes, or introduce an explicit nullable owner slot in a
separately versioned format. Exercise the actual live-to-write-to-offline path before
proposing hardware: require equal verdicts and rejection of changed concrete owner or
position, null object fields, array shape (including sparse arrays), gameplay and camera. Validate all four saved
attempts and a frozen door witness offline first. Do not widen the camera bound or waive
the missing door control.

## Qualified observations (all rows rejected; all reduced)

Raw roots (under `test-results/encounter/`): `trace-r6-c7b03a12/` and
`trace-r6-v3-29d7711b/`. In each, read `reduced-low-off-1` and
`reduced-low-off-1-replacement` with suffixes `.trace.json` (raw CDP), `.json` (raw visit),
`.evidence.json` (transport), or `.alignment.json` (marked windows, stacks and frame IDs).
Bytes in that order: **11,785,491 / 10,755,314** (v2) and **11,695,103 / 10,607,707**
(v3); 49,340 / 46,257 and 50,458 / 45,386 trace events. All reached EOF without reported
loss; peak buffer usage stayed below 7.5%.

Callbacks are zero-based. First displacement `Δz` is −0.015941 in every visit; the
neighbor is −0.227320 for five ticks or −0.168408 for four. “Next” is ticks in the
following callback, not ticks in the preceding gap. Times are ms.

| Attempt | Window (callback; ticks) | Work | Submit | Following gap | Post-exit | Next | Samples (app) | Shader stack samples |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| v2 first | First / historical 2; 489→490 | 76.095 | 65.435 | 77.038 | 0.943 | 5 | 484 (473) | 271 |
| | Neighbor 3; 490→495 | 53.107 | 26.051 | 54.695 | 1.588 | 3 | 328 (327) | 0 |
| v2 replacement | First 1; 489→490 | 104.810 | 91.200 | 114.057 | 9.247 | 4 | 585 (583) | 352 |
| | Neighbor / historical 2; 490→494 | 52.332 | 22.203 | 53.391 | 1.059 | 4 | 269 (269) | 0 |
| v3 first | First / historical 2; 489→490 | 108.126 | 97.160 | 111.302 | 3.176 | 5 | 643 (624) | 331 |
| | Neighbor 3; 490→495 | 70.926 | 36.755 | 72.495 | 1.569 | 4 | 392 (389) | 0 |
| v3 replacement | First / historical 2; 489→490 | 94.327 | 82.991 | 100.103 | 5.776 | 5 | 560 (551) | 332 |
| | Neighbor 3; 490→495 | 61.308 | 22.509 | 62.891 | 1.583 | 4 | 359 (357) | 0 |

First-minus-neighbor work / submit / gap: **+22.988 / +39.384 / +22.343**,
**+52.478 / +68.997 / +60.666**, **+37.200 / +60.405 / +38.807**, and
**+33.019 / +60.482 / +37.212** ms, respectively. These are traced wall times, not
outcome results or matched repeats. Neighbors are catch-up callbacks, not equal-tick
controls. In v2, `animateActors` occurs in 28→96 and 42→100 stacks; that tick-side work
does not explain the first callback's excess submission wall time.

The repeatable **CPU observation**, not a selected hotspot, is Babylon
`StandardMaterial.isReadyForSubMesh` → `createEffect` → `Effect` → `_processShaderCodeAsync`
→ `shadersLoaded` → `Process` → `ProcessIncludes` under `Scene.render` called from
`src/main.ts` `renderFrame`. The table counts each sample once if its stack contains
`ProcessIncludes` or `_processShaderCodeAsync` (Chromium's zero-based locations include
`shaderProcessor-*.js:930`, `effect.pure-*.js:1125`, `standardMaterial-*.js:2573`). Both v2
windows also show `_evaluateActiveMeshes` and world-matrix stacks. GL entry points
such as `shaderSource`, `getProgramParameter` and `linkProgram` do not measure native
driver or GPU shader duration. Without the door control we cannot tell whether the
first-movement material activation is shared or depends on the reduced scene.

Both selected windows in all attempts link `ProxyMain::BeginMainFrame` → `MainFrame.Draw`
→ generated surface → Viz `STEP_SURFACE_AGGREGATION` → display-linked GPU-process
`STEP_FINISH_BUFFER_SWAP` → renderer `AnimationFrame::Presentation` (matching begin-frame
IDs). Entry-to-aggregation / swap-finish / presentation in ms:

| Attempt | First | Neighbor |
| --- | --- | --- |
| v2 first | 77.767 / 117.191 / 149.615 | 55.005 / 58.555 / 89.255 |
| v2 replacement | 107.562 / 112.236 / 125.583 | 56.447 / 58.724 / 78.131 |
| v3 first | 109.842 / 131.241 / 145.435 | 72.737 / 78.825 / 100.864 |
| v3 replacement | 96.892 / 99.888 / 109.085 | 63.755 / 69.200 / 92.417 |

For example, v2 first callback 2 links main `6760600052940208796`, surface
`-1562663304934488548`, display `-1562663304934488550`; Viz/swap runs in PID 199297,
separate from renderer PID 199427. These are ordered dependencies, not additive CPU
durations. Swap/presentation can fall outside the next-entry boundary. `CrGpuMain`
`CommandBufferStub::WaitForGetOffsetInRange` appears in two neighbors (10 slices at 2–7 µs;
6 at 2–18 µs), not in any selected first window. These are CPU-side command-buffer slices,
not a linked blocking driver fence on the renderer. `disabled-by-default-gpu.device`
contained raster/main context labels but no linked device-clock execution intervals.
**On-device execution and any first-callback blocking driver wait are unknown, not zero.**
