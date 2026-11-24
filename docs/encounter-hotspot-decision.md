# Encounter hotspot decision

**Follow-up:** [Six matched RTX 2070 traces](encounter-trace-v4.md#completed-rtx-2070-run) identify CPU-side shader preprocessing on first movement in both the reduced encounter and no-alert doorway. No optimization has been tested. The original baseline decision below is retained.

- **Investigation: complete baseline, attribution unresolved.** No single runtime hotspot was
  selected. See the [raw visit index and comparison gate](encounter-baseline.md).
- **Performance: baseline misses budget; optimization untested.** No trial was registered or
  retained and no speedup is claimed. Earlier stalled fixtures are not negative optimization results.

The largest Low full gap moves between visits: `full-low-off-1` callback 2 (approach) was
43.8 ms after 43.1 ms of callback work, followed by 3 ticks; repeat 2 callback 481 (ranked) was
72.8 ms after 71.9 ms, followed by 4 ticks; repeat 3 callback 107 (travelling) was 89.1 ms after
87.8 ms, followed by 5 ticks. Low full travelling maxima alone spread from 27.8 to 89.1 ms.
High full peaks are narrower at 50.3–54.0 ms, but still split between approach and travelling.

Both no-alert door qualities peak at callback 2 (41.2–45.4 ms Low; 43.8–45.2 ms High), **before**
door motion. So do all reduced repeats (58.5–66.8 ms Low; 64.9–70.3 ms High). Reduced/Low
travelling is much steadier at 25.4–29.9 ms, but the unpaired population difference and large
full/Low drift do not isolate per-actor work. The repeated approach peak does not require alert,
rank assembly or an opening. Conversely, the later full tails can't all be ascribed to that
first movement or to RAF delay outside the callback; preceding measured work largely spans
those gaps.

**Next discriminating measurement:** separate from outcome timing, take a matched CPU and
GPU/compositor trace around the first moving approach callback and its steady-approach neighbor,
using reduced/Low and the same-quality no-alert door. Distinguish JavaScript and render submission
from driver waits, GPU execution and compositor scheduling. Use full/Low travelling as a separate
comparison only if its regression reproduces under a controlled run order. Coarse/detailed
submission, route and rig wall times do not justify a runtime change on their own.

## Trace follow-up — hardware run blocked before visit 1

The [approach trace plan](plan/epic-1/trace-follow-up.md) now has a separate DEV capture and
offline analysis lane. I ran the prescribed hardware command. The runner revalidated the frozen
54-visit R6 archive and source overlay, and verified the Vite root nonce. NVIDIA reported an
RTX 2070 with driver `615.78.08`, but the Wayland screen-lock check returned `true`. The runner
stopped before browser launch. **One setup failure, zero encounters started, zero hardware
traces.** The six scheduled visits were not six failed attempts. No replacement was used and the
lock was not bypassed.

Setup artifact: `test-results/encounter/trace-r6-1ec26a44/`. See `desktop.json`, `r6-source-diff.json`,
`index.json`, and `trace-report.json`. The batch is write-once and offline hash/source verification
passed. SHA-256 of `SHA256SUMS`:
`64b162d72918f5e00b385828584613a07e4f899ea60486f454fa6d3e6de3bba7`.

After the review repairs, the desktop lock check again returned `true`. No browser was launched,
and the original setup artifact remains unchanged. See [verification](../VERIFICATION.md#epic-1--approach-trace-review-repairs).

### What the existing untraced hardware data can locate

The numbers below are from the six Low/off JSON visits in `baseline-r6-480ffe1b`, **not** from
the failed trace batch. Tick spans refer to the work at callback 2 (zero-based); the reported
gap is `entry[3] − entry[2]`. Callback 3's catch-up ticks belong to callback 3's work, not
callback 2's. Both callbacks were approach-only.

| Frozen visit | Callback 2 ticks | Callback 2 work / following gap (ms) | Callback 3 ticks | Callback 3 work / following gap (ms) |
| --- | --- | --- | --- | --- |
| `reduced-low-off-1` | 489→490 | 57.9 / 58.5 | 490→494 | 32.0 / 34.3 |
| `door-low-off-1` | 489→490 | 41.9 / 42.5 | 490→493 | 31.7 / 32.2 |
| `reduced-low-off-2` | 489→490 | 66.2 / 66.8 | 490→494 | 43.8 / 44.5 |
| `door-low-off-2` | 489→491 | 44.9 / 45.4 | 491→493 | 23.0 / 23.5 |
| `reduced-low-off-3` | 489→490 | 61.3 / 61.9 | 490→494 | 35.6 / 36.0 |
| `door-low-off-3` | 489→490 | 40.3 / 41.2 | 490→493 | 31.3 / 34.1 |

In all six historical visits, callbacks 0–1 took zero ticks and callback 2 consumed the first
input edge at tick 490. The frozen raw frames have no per-callback displacement, so this locates
the first input-bearing callback, not the first displacement. Callback 3 is also an unusually
busy neighbor in several visits. Do not substitute these callback ordinals for the movement
selection or treat callback 3 as a proven steady window. In a real trace, inspect both selected
windows, callback 2, and the other marked neighbors if the spike has moved.

The existing coarse reduced/Low `scene.render` wall time (58.3–70.7 ms) is a diagnostic scope,
not device time. There are no new encounter JS sample counts, traced submission times, linked
presentation delays, explicit driver waits, or on-device execution times. **Attribution remains
unresolved; no candidate or performance outcome.**

### Historical replay instructions (superseded)

Keep the page foreground and avoid concurrent rendering or builds. From the Epic 1 checkout:

```sh
CPU_TRACE=approach CPU_GPU=hardware CPU_DISPLAY=wayland CPU_QUALITIES=low CPU_MODES=off CPU_LABEL=trace-r6 \
  node tests/encounter-browser.ts
node tests/encounter-trace-archive.ts test-results/encounter/<printed-trace-batch>
```

The runner requires an explicit ScreenSaver `false` response; a locked desktop or any unknown
status blocks browser launch. It uses the existing fixed-input R6 recipe and six fresh contexts in
reduced/door order. At tick 459, the DEV adapter holds warmup until browser-wide `Tracing.start`
is acknowledged, then resets the fixed-step clock so CDP startup latency cannot create catch-up
ticks. The final 30 warmup ticks run at native cadence. The app marks the first 16 native
callbacks and records tick ranges, phases and displacement. The runner takes a bounded
200 ms presentation tail, then drains the stream through EOF with time/size bounds; the game
continues to its terminal witness. Capture settings, actual trace categories, raw CDP JSON,
raw visits, and per-window alignment and stack counts go in the new batch. The runner validates
and saves each attempt before opening the next context. The first recoverable failure gets one
immediate fresh-context replacement of the same slot, recorded with a `-replacement` ID and a
link to the retained failed attempt. Any subsequent failure stops the batch (seven attempts max).
Source drift, failed context shutdown, or unconfirmed shutdown of the browser-wide recorder
stop immediately. A setup failure starts no visits and does not trigger an automatic setup retry.
The offline verifier rehashes artifacts, reconstructs source, replays the canonical attempt order,
recomputes stability and admission from the raw records, and checks the generated report. It
computes first-minus-steady per visit and case min–max across admitted repeats, not across pooled
frames. Traced visits are ineligible in the outcome reporter, even with CPU scopes off.

Stack counts are samples, not time spent. Both selected callbacks need a renderer main-frame →
surface → cross-process Viz aggregation → display-linked GPU-process swap chain with matching
renderer presentation feedback. Temporal overlap with unrelated Viz or GPU activity does not
qualify. A swap acknowledgment or presentation feedback is not device
execution. GPU-process slices are CPU activity, and a gap without samples is not evidence of a
driver wait. A separate headless WebGL2 protocol smoke check (no game, not part of R6) drained
911,680 bytes through EOF without reported loss; decoding the first four synthetic windows
found 44, 33, 42, and 40 samples and linked four presentation events. Its only purpose was to
exercise Chrome's actual signed sample deltas and 64-bit identifiers. It is not a substitute for
any hardware visit and provides no game or GPU timing result.

## Unlocked capture follow-up — bounded stop reached

See the [v3 protocol and findings](encounter-trace-v3.md). The original two hardware
attempts and the two separately versioned follow-up attempts all resolved, but no visit
was admitted and no traced door control was collected. The offline tool verified both
failed batches without changing their verdicts. Shader preprocessing is sampled on the
first displacement; GPU device execution and matched attribution remain unresolved.
Do not rerun either batch.

## V4 — wire parity repaired; hardware comparison not collected

The [separate v4 protocol and evidence](encounter-trace-v4.md) preserves those verdicts.
Fresh Playwright reduced and door visits reproduced all four absent cargo owners and matched
the signed phase ticks. The frozen door snapshot is one tick late; the live one is at 666.
The software smoke also exposed a real 4+6 terminal/trailing tick pair, which v4 checks without
relaxing the active-window cap. The RTX 2070 gate stopped before launch because Wayland was
locked. Frozen Low/off gaps shrank by roughly **22–26 ms** from callback 2 to 3 in reduced and
**7–22 ms** at the door, but only the old rejected reduced traces have stacks. No new matched
CPU/GPU attribution or outcome; the next gate is both untraced native hardware witnesses on
an unlocked desktop, not a reinterpretation of the old traces.
