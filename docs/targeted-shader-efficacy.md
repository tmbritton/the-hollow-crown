# Targeted shader preparation: efficacy and adoption

**Adopted on `epic-1-encounter-hitch` with explicit acceptance of the extra load time.**
The separate efficacy study ran 32 fixed pairs (64 sides, 128 timed page visits), on one
RTX 2070/Wayland WebGL2 Chromium setup and one timed seed, 795. Each side had a fresh ordinary
default-High real-W page and an R6 page (489 warmup ticks); order was balanced within each cell.
The four headed draw-audit visits were untimed, including MOURNING-731. This is evidence for
a shorter first-movement hitch, not a steady-FPS or cross-machine claim.

## Results

First-displacement interval = entry to the RAF callback with actual initial displacement through
entry to the next RAF callback. Benefit is the median of paired reference minus candidate values.

| Workload / reference | Pairs | Reference → candidate arm medians | Paired benefit [min, max] | Favorable |
| --- | ---: | ---: | ---: | ---: |
| Reduced Low / parent (primary) | 8 | 61.5 → 25.7 ms | **35.0 ms** [31.8, 37.9] | 8/8 |
| Door Low / parent | 4 | 40.8 → 22.8 ms | 18.1 ms [16.8, 41.1] | 4/4 |
| Full Low / parent | 4 | 40.2 → 22.9 ms | 17.3 ms [15.0, 18.9] | 4/4 |
| Full High / parent | 4 | 48.9 → 25.8 ms | 21.6 ms [17.4, 27.4] | 4/4 |
| Reduced High / parent | 4 | 67.6 → 29.9 ms | 37.8 ms [23.7, 51.7] | 4/4 |
| Door High / parent | 4 | 46.0 → 25.8 ms | 20.6 ms [15.3, 21.4] | 4/4 |
| Reduced Low / frozen R6 (ancillary) | 4 | 58.8 → 29.8 ms | 31.0 ms [25.5, 34.0] | 4/4 |

Primary two-sided exact sign p = 0.0078125; the conservative median interval is
[31.8, 37.9] ms (99.22% attained nominal coverage). Benefit was 33.8 ms parent-first
and 36.3 ms candidate-first; the four-pair cells are descriptive. Ordinary W improved
25.2 ms paired median in 28/28 parent comparisons; this is not keydown-to-motion latency.
Later-phase maxima were mixed (15 better, 13 worse versus parent), including a Door High
opening slowdown in all four pairs (+3.6 ms median, +2.1 to +6.5 ms).

Load cost measured from navigation origin or regeneration entry to playable. The 28 parent
pairs below are a descriptive pool; the remaining four are the separate frozen contrast.

| Endpoint | Paired penalty median [min, max] | Above 100 ms |
| --- | ---: | ---: |
| Ordinary default-High startup | **+127.2 ms** [−3976.3, +502.2] | 18/28 |
| Debug High startup | +56.8 ms [−239.3, +667.8] | 10/28 |
| Regeneration | +112.7 ms [−26.9, +381.9] | 16/28 |

The [broad warmup trial](shader-warmup-trial-result.md) was not retained. The original
[capped targeted trial](targeted-shader-trial-result.md) was initially locked and later stopped
with a valid `reject` at +113.1 ms regeneration on its first pair. Neither result changed.
The separately registered efficacy study had no load veto and did not reuse old timings.
No measured side was excluded, replaced or rerun. The admission amendment corrected a historical
1–3 repeat validator restriction at repeat 4 using the same raw capture, preserving actual IDs,
timing, order and the original record.

## Provenance and source fidelity

Local experiment archive: `test-results/encounter/shader-efficacy-v1/` (`PROTOCOL.md`,
`registration.json`, `amendment1.json`, `report.json`, `REPORT.md`, audit, side and pair records).
These are historical artifacts, not build or regression inputs. Key SHA-256 values:

| Artifact | SHA-256 |
| --- | --- |
| Sealed `targeted-shader-review-v2/CPU_TRIAL.json` | `3f3055cfec4dea9458a37085369452b223dfebc1ab6ceccc3b333d827408e5db` |
| Efficacy `registration.json` | `230169e54ab9c450c849ea608d200e53c6d7e69e1047b09fc801a3025db4e8c5` |
| Efficacy `amendment1.json` | `08c651ad453f6ee47bf76e2dda8cc515e6e83d80c4826f350725cd74d782758b` |
| Efficacy `report.json` | `eeea0b6550d3a1d9a1c9c439ed8f4bd3017dfbad316136b0ae469a9fe82e760d` |

The efficacy roots' runtime source matches the sealed roots. Sealed parent → candidate changes
only `main.ts` and the three `targetedShader*.ts` modules. Integration keeps the identical
selection/transition core and all 21 exact, ordered signatures (the source factors out shared
define text; the resulting ordered data matches byte-for-byte when serialized). It uses the
same normally ready sibling effect, full define key and binding layout; no extra pass,
speculative variants, hidden render, simulation tick or transform change. Low has no shadow
requests. The existing rig lifecycle is identical in both measured arms and was already present
locally. No load markers, trial URL switch, collector or measurement overlays were imported.

Integration-only hardening: a cache lookup exception uses the existing visible failure path
and cancels any pending revision; regeneration resets the caption and discards the outgoing
quality callback; terminal disposal clears it and guards quality changes. The underlying
Babylon 9.37 WebGL2 cache is private: check the draw-key regression when upgrading. The new
browser runs are correctness checks, not a fourth measured arm or a rerun of efficacy.

### Adoption review repairs

Babylon scene readiness now belongs to the requested quality revision. A pre-READY quality
change cancels and disposes in-flight preparation, then registers a fresh scene-readiness check.
Only its current callback can inspect the sibling cache and accept empty work. In particular,
Low readiness is not evidence that the shadow-enabled High camera siblings are ready. The
shader allowlist, selection rules and post-READY quality behavior are unchanged.

The shipping browser audit now pins the exact first-motion pass/source set per visit in source,
independent of the ignored trial artifacts. It resolves generated shader names to stable material
names, matches the full allowlisted defines, and requires each submitted key to be ready at
input release. See the [review verification](../VERIFICATION.md#epic-1--adoption-review-repairs).
