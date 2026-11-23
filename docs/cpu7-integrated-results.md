# CPU7 integrated acceptance — 2026-11-23 desktop study

**Investigation independently approved as a negative measurement report, not performance acceptance.** The measured desktop budgets are unmet, and strict matched-start speedup remains inconclusive. No runtime or quality change was retained. CPU6b stays [correctness-only](../VERIFICATION.md#cpu6b--retained-full-rate-subset), with scheduler/LOD deferred.

## Identity and availability

| Study side | Exact clean revision | CPU profiler source SHA-256 |
| --- | --- | --- |
| A — original CPU0 | `abf8586ee8fd372e22decbe57a548ce5c019cc5f` | `e8b4bc7a5adc9fcb2e00444fec19a0b527caa59a370f7da348b1edf5076d1307` |
| B — shipped CPU6b subset | `88a297e793a994129738f63a0ca6dda43cf87563` | `61c34ee25b0c986455214e6bf4da6a66a2b6ca218e1c5a8e19d128bb891ed8d4` |

The archived CPU0 label was `013079c` **plus** implementation; the actual `abf8586` tree reproduces the archived recipe-2 hash without an overlay. No candidate code was backported. Each detached checkout installed the same lockfile (`npm ci --ignore-scripts`, lock SHA-256 `565e12186123643d38540a2773ff1253c081955952d1bfec3987cb67328fa93f`). Both `tests/cpu-profile.ts` hash to `883664eaae20b463708bbce708f4069dba75ccdbd50f3dcf0efb367047220b0c`; both catalogs to `5cae28feb23d3defcaa6fb8aad86ff9d20050bd1e9564b1ad8f5d281b78dbef1`. Workload module hashes: A `652ecfbb607404e418ba81453edc4c5b9c69c253f2d135beef77e3be9df9d21e`, B `4e75a7471375755a8746e9126b426e2dbf713ae385644d7ca53e5842bc2f1c3e`. The workload diff only exports the phalanx fixture and includes its pack/squad in the returned fixture object. The runtime observer does differ: e.g. route hook `goTo` → `request`, and binding/grounding attribution changed. Do not compare renamed nested counters as if they were the same work.

- A `/tmp/opencode/cpu7-a` → `http://127.0.0.1:5471`; B `/tmp/opencode/cpu7-b` → `:5472`. Unoccupied ports were chosen because the standard dev port was already listening. The profiler runs its own strict-port Vite server from the corresponding checkout. Verification dev and built preview use `:5473` and `:5474`, not the timed servers.
- Local platform: Ryzen 5 2600X (12 logical CPUs), Fedora Linux x86_64 kernel `7.2.9-ogc3.1.fc44`, Node `26.0.0`, npm `11.12.1`, Playwright Chromium `159.0.8154.6`. Actual headed WebGL2 renderer on both: `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2070/PCIe/SSE2, OpenGL ES 3.2)`; NVIDIA driver `615.78.08`. KDE Wayland session/Xwayland available, 2560×1440 HDMI @ 59.95 Hz, scale 1.3, VRR unavailable. Chromium uses an 800×450 test viewport. Display/GPU state snapshots under `test-results/cpu7/`. GPU was P8/16 W at the snapshot; that is not a trace or energy measurement, and CPU/platform power profile was not verified.
- No concurrent builds, traces, screenshots, or browser suites during native windows. This was not an isolated/confirmed quiet desktop: compositor, Vivaldi and Steam were present; report-start 1-minute loads were 4.44–9.16. Load snapshots include previous visits and do not establish what ran during individual windows. No windows were promoted as quiet after the fact. M1 was not available in this execution environment; neither revision was measured there. No cloud host or paid hardware was provisioned; energy and monetary running cost were not measured.
- The detached trees were still clean after profiling. The raw profiler artifacts are also archived under ignored `test-results/cpu7/frozen-profiler-artifacts.tar.gz` (SHA-256 `c941d4779020e8c525c472669521c17e92485ddc68980918aad702d3ffc8e72e`), including the clean A pin replay; witness PNGs and logs are stored separately in that directory. No generated output is part of the source diff.

## Native RAF: real cadence, invalid matched comparison

Used the original recipe-2 `live-low,live-high`, modes `off,coarse`, 72 callbacks per window, 120 warmup steps, fresh `MOURNING-731`, and checkout order AB/BA/AB. **The frozen recipe teleports `live-*` to the stable, not the entrance** (hero at `(0, -58)` in this seed). The original plan wording was corrected to match source rather than changing the recipe. `off` is the outcome lane (outer timer, no subsystem hooks); `coarse` is attribution only. A first `frame.interval` is launch-to-first-callback, not a between-callback interval. Tables use all 72 observations as requested; omitting the first interval changes B `off` ranges to 44.5–49.1 Low and 37.4–41.8 High, without changing the budget finding.

| RTX 2070 / recipe 2 | 72-callback windows A:B / valid pairs | FPS A → B, repeat order 1/2/3 | Interval p95 range A → B, ms | Callback p95 range A → B, ms | Verdict |
| --- | --- | --- | --- | --- | --- |
| Stable Low / off | 3:3 / 0 | 17.9/15.3/18.4 → 45.7/49.8/45.1 | 77.0–101.8 → 29.6–35.5 | 76.7–101.5 → 29.3–31.1 | Invalid matched start; B alone misses 60 |
| Stable High / off | 3:3 / 0 | 20.4/13.7/15.6 → 38.0/38.3/42.4 | 78.7–91.7 → 29.8–33.9 | 78.2–91.2 → 29.5–33.6 | Invalid matched start; B alone misses 60 |
| Stable Low / coarse | 3:3 / 0 | 22.5/18.6/18.6 → 56.2/48.7/47.7 | 60.3–81.0 → 22.9–30.2 | 60.0–80.4 → 22.4–29.8 | Invalid matched start; attribution only |
| Stable High / coarse | 3:3 / 0 | 20.0/14.9/16.7 → 40.3/41.2/39.4 | 75.9–89.4 → 31.3–31.6 | 75.4–89.0 → 31.1–31.4 | Invalid matched start; attribution only |
| M1 Low/High, both modes | 0:0 / 0 | unavailable | unavailable | unavailable | Pending: no host |

Actor roles, count, hero location, seed and warmup length are the same; **7 NPCs already differ in heading, position or motion** at measurement start even after discarding route-chart internals and CPU0-only room metadata in positions. Example: `kobold:treasury:3` z `1.1120` vs `0.9481`. This repeats in every measured pair, so it is not random contamination that can be removed by replacing one pair with another identical visit. It invalidates the strict matched-start speedup, not the observed independent hardware costs. Native end-step equality was not required. Full source and raw observations: `{A,B}` checkout `test-results/cpu0-cpu7-raf-<side><repeat>.json`; consolidated `test-results/cpu7/raf.json` records repeat-level statistics, start actor differences and worst frames.

| RTX 2070 / recipe 2 | Actual ticks per 72 callbacks A → B | Share >16.7 ms A → B | Worst interval A → B (ms) |
| --- | --- | --- | --- |
| Low / off | 239/270/233 → 94/86/95 | 98.6% → 81.9–90.3% | 120.4 → 54.6 |
| High / off | 210/306/273 → 113/112/101 | 98.6% → 98.6% | 102.8 → 37.2 |
| Low / coarse | 191/231/232 → 76/88/90 | 98.6% → 59.7–94.4% | 90.2 → 35.1 |
| High / coarse | 215/284/254 → 107/104/109 | 98.6% → 98.6% | 106.4 → 35.7 |

Actual simulation seconds are tick totals / 60 (e.g. Low/off A 3.88–4.50 s, B 1.43–1.58 s). Both sources clamp the input delta to 80 ms; accumulator carry permits **five** ticks, not just four. Low/off A2 histogram `[1,1,1,21,36,12]` vs B2 `[1,56,15,0,0,0]` for 0 through 5. The worst A Low/off interval was 120.4 ms at starting step 357, followed by five catch-up ticks. B's worst Low/off interval 54.6 ms at step 183 was followed by four ticks. Exact clamp hits are unavailable; the reported count of measured intervals ≥80 ms is a proxy (Low/off A 8/10/3, B 0/0/0), not the internal clamp input. Inspect the preceding callback for causality; a slow interval and its following catch-up belong to different scopes.

Candidate `coarse` combined tick/presentation p95 was 12.1–16.6 ms Low and 15.4–16.2 ms High. Including the disjoint `scene.render` scope gives update/submission p95 **22.3–29.6 ms Low, 29.7–31.0 ms High**. This is CPU wall time in the callback, not GPU elapsed; driver blocking can be inside `scene.render`. A's rendered submission p95 was 59.8–78.4 ms Low and 73.4–87.0 ms High. No nested timers were added to these totals.

## Controlled replay: equal tick schedules are not necessarily equal gameplay

The coarse outer `tick + presentation` p50 excludes authored `event` and scene draw time. The complete `frame` envelope includes both when present. `detailed` is for counts and pin data, not latency comparison; all count names are retained in `test-results/cpu7/controlled.json`. The 72 scheduled render frames advance 126 ticks per visit, not 72. No controlled cadence was converted to FPS. Three visits per side at 800×450, AB/BA/AB. The full matrix took about 24 minutes of profile invocation wall time, excluding verification gaps; hardware was local. All within-revision workload fingerprints and detailed counter totals repeated across visits; same-source fingerprints agreed between modes. Actor-state matching compares observed authoritative fields at both ends, not identical internal route-chart or pose hashes across revisions. Endpoint matching alone is not gameplay or visual acceptance.

| Workload (Low unless noted) | Endpoint-matched pairs | Combined p50 repeat range A → B, ms | Frame p95 repeat range A → B, ms | Frame max repeat range A → B, ms |
| --- | ---: | --- | --- | --- |
| Entrance | 0/3 | 10.0–11.1 → 5.8–6.8 | 14.4–20.9 → 8.0–8.6 | 37.5–44.5 → 11.7–28.8 |
| Stable | 0/3 | 14.2–15.7 → 7.0–7.9 | 18.5–21.1 → 8.9–11.0 | 39.5–40.5 → 11.9–22.5 |
| Hitch | 0/3 | 14.1–15.1 → 6.6–7.2 | 18.3–20.8 → 8.2–9.1 | 227.7–229.9 → 10.6–28.9 |
| Movement | 0/3 | 13.8–15.0 → 6.5–6.9 | 18.1–19.6 → 8.4–8.8 | 39.5–40.7 → 11.3–16.0 |
| Doorway | 0/3 | 13.8–14.2 → 6.7–6.8 | 17.7–18.7 → 8.4–8.9 | 40.1–43.5 → 12.8–20.5 |
| Shield | 3/3 | 4.9–5.9 → 3.8–4.6 | 6.2–7.9 → 5.0–6.4 | 9.6–11.5 → 8.7–11.5 |
| Phalanx | 3/3 | 6.1–6.6 → 5.0–5.4 | 8.6–9.1 → 6.7–7.3 | 18.2–21.1 → 12.2–15.1 |
| Cargo | 3/3 | 5.2–5.5 → 4.4–4.7 | 6.6–6.8 → 5.9–6.1 | 8.3–9.0 → 7.4–9.6 |
| Ragdoll | 3/3 | 5.6–6.3 → 4.3–5.3 | 7.3–8.9 → 6.0–8.3 | 18.0–19.8 → 18.3–32.2 |
| Bones | 3/3 | 5.5–5.9 → 3.7–4.6 | 7.3–8.5 → 5.8–7.6 | 11.3–12.9 → 9.7–14.4 |
| Bolt | 3/3 | 5.2–6.0 → 4.1–5.1 | 7.1–8.2 → 5.8–7.2 | 9.9–12.0 → 8.1–10.5 |
| Javelin | 3/3 | 5.2–6.3 → 4.4–4.8 | 6.7–8.3 → 6.2–7.4 | 8.7–10.5 → 11.7–15.1 |
| Hazard | 3/3 | 5.4–5.6 → 4.0–4.2 | 6.9–7.3 → 5.7–6.2 | 9.6–10.5 → 7.5–10.1 |
| Landing | 3/3 | 4.8–5.4 → 3.6–4.0 | 6.1–7.1 → 4.8–5.2 | 8.0–10.4 → 7.7–11.2 |
| Airborne | 3/3 | 5.3–5.7 → 3.9–4.1 | 7.2–8.4 → 5.5–6.9 | 9.5–20.2 → 8.3–11.3 |
| Stairs | 3/3 | 5.5–6.1 → 4.3–4.6 | 6.9–8.9 → 6.3–6.9 | 11.1–13.6 → 9.0–14.5 |
| Burst | 0/3 | 10.1–11.6 → 8.9–10.4 | 32.9–35.9 → 32.3–35.1 | 74.4–82.9 → 61.7–63.4 |
| Settled | 3/3 | 5.4–5.6 → 3.9–4.3 | 6.8–7.4 → 5.2–6.6 | 8.7–11.0 → 6.9–28.9 |
| Frames Low | 0/3 | 20.3–24.5 → 9.7–11.0 | 76.6–82.8 → 44.7–48.3 | 92.1–103.0 → 48.5–53.5 |
| Frames High | 0/3 | 20.4–23.1 → 8.8–9.7 | 82.4–91.8 → 46.6–49.6 | 89.1–104.0 → 48.0–53.6 |

Zero matched pairs means **invalid**, not a win or regression. All 12 endpoint-matched cases have a lower combined p50 beyond measured spread; six core scenarios (shield, phalanx, cargo, ragdoll, bones, settled) have corresponding sampled visual witnesses below. E.g. paired phalanx deltas B−A are −1.2/−1.2/−0.7 ms. This does not cover the aggregate 30% gate. **Javelin full-frame maximum worsened beyond repeat spread**, always in B's frame starting at step 18 (attack initiation, before the projectile kill); most of the time is in the tick, not the event callback. The worst ragdoll B repeat (32.2 ms, step 245) is within active physics, not cold admission; settled B's 28.9 ms at step 608 is inside the tick. They are isolated outliers with attribution beyond the tick unresolved. Active ragdoll p95 ranges overlap (7.6–8.6 vs 6.8–8.8 ms), as do active bones ranges (8.1–8.6 vs 6.3–8.3 ms). The corresponding frozen ranges favor B on bones (6.4–7.6 vs 4.7–5.6 ms), overlap on ragdoll (6.4–9.2 vs 5.1–7.2 ms), and are separate from active costs. Per-repeat values, deltas, and full worst samples are in `controlled.json`.

| RTX 2070 / recipe 2 | Quality | Ticks A:B | Coarse tick + presentation p50 A → B, ms | Full frame p95 / max A → B, ms | A1:B1 observation |
| --- | --- | ---: | ---: | ---: | --- |
| Entrance | Low | 240:240 | 11.1 → 6.8 | 20.9/37.5 → 8.6/28.0 | Invalid actor start/end |
| Stable | Low | 240:240 | 15.7 → 7.9 | 21.1/39.5 → 11.0/14.9 | Invalid actor start/end |
| Hitch | Low | 300:300 | 15.1 → 7.2 | 20.8/227.7 → 8.7/10.6 | Invalid actor start/end |
| Movement | Low | 240:240 | 15.0 → 6.7 | 19.6/40.7 → 8.4/11.8 | Invalid actor start/end |
| Doorway | Low | 240:240 | 13.8 → 6.8 | 18.2/40.1 → 8.5/20.5 | Invalid actor start/end |
| Shield | Low | 180:180 | 5.9 → 4.6 | 7.9/11.5 → 6.4/8.7 | Matched endpoints; 10 consumed blocks each |
| Phalanx | Low | 360:360 | 6.6 → 5.4 | 9.1/21.1 → 6.7/15.1 | Matched endpoints and event transcript |
| Cargo | Low | 180:180 | 5.2 → 4.7 | 6.8/9.0 → 6.1/9.6 | Matched endpoints; final carry, max higher in B1 |
| Ragdoll | Low | 500:500 | 6.3 → 4.3 | 8.9/19.8 → 6.0/18.5 | Matched endpoints; 244 active samples each |
| Bones | Low | 500:500 | 5.9 → 4.1 | 8.5/11.3 → 6.1/9.7 | Matched endpoints; 153 active each |
| Bolt | Low | 500:500 | 5.8 → 4.5 | 7.8/9.9 → 6.4/9.5 | Matched endpoints |
| Javelin | Low | 500:500 | 6.3 → 4.4 | 8.3/10.4 → 7.4/13.8 | Matched endpoints; max higher in B1 |
| Hazard | Low | 500:500 | 5.6 → 4.2 | 7.3/9.6 → 6.0/10.1 | Matched endpoints; max higher in B1 |
| Landing | Low | 500:500 | 5.4 → 4.0 | 7.1/10.4 → 5.2/7.7 | Matched endpoints |
| Airborne | Low | 500:500 | 5.7 → 3.9 | 8.4/20.2 → 5.5/8.3 | Matched endpoints |
| Stairs | Low | 500:500 | 5.8 → 4.6 | 7.6/12.7 → 6.9/14.5 | Matched endpoints; max higher in B1 |
| Burst (24 simultaneous deaths) | Low | 500:500 | 11.6 → 10.4 | 35.9/82.9 → 34.8/62.6 | Invalid actor start/end; same count is not same physical state |
| Settled crossing | Low | 180:180 | 5.5 → 4.1 | 7.4/9.1 → 5.4/6.9 | Matched endpoints; one already-frozen island |
| Frames Low (0/1/2/4) | Low | 126:126 | 24.5 → 10.9 | 82.8/103.0 → 48.3/53.5 | Invalid actor start/end |
| Frames High (0/1/2/4) | High | 126:126 | 21.7 → 9.7 | 91.8/104.0 → 48.6/53.6 | Invalid actor start/end |

Raw reports: each checkout's ignored `test-results/cpu0-cpu7-controlled-<side><repeat>.json` with matching summary, route pin and captures. Workload/mode switches on each clean revision agreed on controlled fingerprints within the initial visit. A1/B1 phalanx both observed assembling → engaging → opening → attacking → recovering, resolved `LONG_THRUST`, one impact and hero health 88. An endpoint and matching block count are not proof of visually correct per-impact shield timing; the separate untimed transcript is the appropriate witness.

**Death phases, first coarse AB:** active p95 ragdoll **8.6 → 6.8 ms** and bones **8.6 → 6.5 ms**; frozen-only p95 **9.2 → 5.1 ms** and **7.6 → 5.4 ms**, respectively. Already-settled crossing is separate above. A1/B1 both retire all body/constraint/static counts, have one freeze per isolated death, and have 24 freezes and 481 active samples in burst, but burst trajectories are invalid for a timing claim. Cold admission is separate: at the steps with first detailed dynamic allocation (18 for isolated deaths, 120 for burst), the coarse full-frame costs were **19.8 → 18.5 ms** ragdoll, **10.6 → 9.7 ms** bones and **82.9 → 62.6 ms** burst (unmatched). Isolated ragdoll has 2 pose snapshots, 11 dynamic bodies and 222 static bodies each; bones has 2/11/80. In the same ragdoll window, corpse lists were 500 → 1 and boxes were 21 → 21; these are counts of instrumented allocation sites, not bytes or a total JS allocation analysis. B's absent settled list counter stays unavailable in the reader. Heap samples are GC-dependent snapshots, not totals (bones detailed used bytes A1 146,175,568 vs B1 437,083,324). Do not infer a leak or savings from these alone.

**Route latency:** the measured A1 detailed hitch's worst was request `47`, step `476`, **280.8 ms**. That input and output match the archived pin as serialized in the raw A1 report. B1's worst in the measured hitch was a different request (`55`, step `558`, **1.3 ms**). A1/B1 logged 24 requests each but differing inputs and boundaries; neither that equal count nor the observed timing difference substitutes for the reference pin. Aggregate detailed door-open reads in the invalid hitch fell from 1,000,525 to 6,063; this is a diagnostic of current execution, not a controlled per-request speedup. A1's 227.7 ms coarse worst frame at step 476 includes 196.4 ms in the inclusive route wrapper. This is nested attribution, not additive to the total.

**Evidence exclusions.** Initial attempts to collect standalone interactions and run the pin via a manually owned Vite port used the right binary but the wrong Vite root (the study cwd), and are invalid on both sides. They are preserved as `a/b-witnesses`, `a/b-off-root` and `a/b-pin` under `test-results/cpu7/`, not cited as paired evidence. This was isolated to that adapter invocation; the clean profiler's own Vite server uses the npm checkout cwd. The recheck explicitly passes the Vite root and allows 36 instead of 24 fixed steps for inspection to finish returning before scoring camera restoration.

### Untimed witnesses, corrected checkouts

Artifacts: `test-results/cpu7/{a,b}-recheck-witnesses.json`, `*-recheck-off-root-cpu5.json`, individual PNGs and `witness-montage.png`. Same 800×450 CSS viewport, reported DPR ~1, actual render dimensions **533×300 Low and 799×449 High** on both. The probes sample fixed steps and are outside all timed runs. `pose.world` and PNGs were compared at the declared samples, not used as global equality proofs.

| Workload or interaction | Observed on A and B |
| --- | --- |
| Entrance, stable, hitch | Same hero location and 25 living; differing actor poses off camera. Stable/hitch sampled PNGs are equal; entrance terminal PNG differs. This does not restore equal eligibility. |
| Movement and doorway | Movement visits approximately `(4.00,4.88)`, `(0.59,7.53)`, `(0.43,7.69)` on both; terminal pixels differ. Doorway moves hero x from −15.58 to −12.41, with an open door by frame 60 on both; three sampled doorway PNGs differ. No basis to call different pixels a timing saving. |
| Phalanx | Real thrust and impact (hero health 88), recovery, and identical world pose and PNG at all four samples. |
| Shield | Block sequence 2, 6, 10 at frames 4, 6, 31 respectively with guard pose; final free pose. All four observed world poses and PNGs agree. No continuous visual-lag or popping claim from four snapshots. |
| Cargo | Starts with authored carry; frame 31 is interrupted (`free`), frame 91 and end show `carry`. Pose/PNG parity at those four samples. Live pickup was not reproduced in the timed cargo recipe. |
| Ragdoll, bones, settled | Active then frozen phases, then crossing an already settled island. Three samples per workload agree on pose and PNG. Burst exercises 24 active deaths and subsequent frozen remains; the final PNG differs and the natural actor start differs. |
| Off-root and inspection | Displaced skull 4.888 active / 5.502 settled units from the root on both, beyond the 4.8 intact envelope. Same ray/visibility/occlusion outcomes and `remains-found`; living selection picked `goblin:smithy:0`. The corpse witness is a ray hit on actual geometry, not living-target selection of a corpse. Both restore the saved overhead camera/target and freeze steps/play time during held-input inspection; 18 of 19 off-root fixture PNGs were byte-identical; the `inspection-low` transition capture differed. |
| Regeneration | Four identical same-seed 120-tick settle → recreate cycles (first warm, three subsequent). Same per-cycle counts on both: 25 actors, 5,719 ECS entities, 2,382 meshes, 495 transform nodes, 28 materials, 4 scene textures, 4 enumerated render targets, one engine scene. Old scene disposed and observer retired every cycle. Post-warm regeneration call elapsed A 1,450.9–1,556.2 ms / B 1,125.9–1,297.7 ms; untimed diagnostic, not a paired latency claim or proof of no JS heap leak. |

I inspected the paired catalog and corrected witness montages. No obvious missing actor/equipment or stale scene stood out at those sampled views; corpse and shield silhouettes are small at gameplay zoom. That is not frame-by-frame clearance or lag review. The `inspection-low` byte difference and the non-matching natural-scene snapshots remain visible-evidence limitations, not silently certified parity.

## Scorecard (targets are not delivery)

| Target | Status | Evidence |
| --- | --- | --- |
| ≥30% median reduction, **both** entrance and stable | Inconclusive | Descriptive ranges improve; all compared starts/ends differ. |
| Warmed update/submission p95 <~12 ms | Unmet in measured desktop windows | B native coarse p95 22.3–29.6 ms Low and 29.7–31.0 ms High; rendering/submission is not GPU time. |
| 60 FPS / 16.7 ms, Low | Unmet in measured stable windows | B off 45.1–49.8 FPS; 81.9–90.3% >16.7 ms. Quiet matched-start acceptance pending. |
| 60 FPS / 16.7 ms, High | Unmet in measured stable windows | B off 38.0–42.4 FPS; 98.6% >16.7 ms. Quiet matched-start acceptance pending. |
| M1 hardware check | Pending | No M1 access. |
| ≤4 ms pinned route or demonstrated end-to-end bound on that request | Inconclusive on B | Correct-root A replay passed input/output at step 476, **299.3 ms**; B rejected the pin on input mismatch. The separate B hitch maxima and work counts do not establish the bound for the archived request. |
| No new adversarial p95/max regression | Unmet in the javelin diagnostic | Endpoint-matched full-frame max **8.7–10.5 → 11.7–15.1 ms**, all three pairs worse. No umbrella parity claim for unmatched cases. |
| Cold, active and settled death budgets | Inconclusive overall | Distinct phases above, consistent retirement and favorable settled medians, but overlapping active p95, individual outliers, and invalid burst. |
| Equal gameplay, visual and lifetime evidence | Inconclusive | Divergent warmed states are recorded, not counted as savings. |
| Investigation delivery | Approved | Independent review accepted the negative measurement report. This does not turn invalid comparisons or missed targets into passes. |

## GPU decision

**Unresolved, with measured CPU/submission pressure.** The candidate does not already have 12 ms of headroom in these native windows; higher High render cost is not sufficient to conclude fill, shadows, AA or compositor is the main bottleneck. The next discriminating experiment is a bounded GPU/compositor trace on this hardware, at a matched stable scene and fixed quality/camera, with CPU tick/submission and presentation timestamps. If those separate a GPU-bound pass, one resolution-only change at the same state is a reasonable follow-up; retain shadow/AA settings there. Do not change defaults or adopt baking on the strength of the Low/High comparison. No evidence isolates static lighting cost or resolves dynamic shadows/cutaways. CPU6b scheduler/LOD stays deferred.

## Verification

Logs are under `test-results/cpu7/`. The CPU7 comparator went red on a missing module, then green; a second red case exercised native five-tick carry found in the raw data, then went green with a separate controlled limit of four. The core is a pure, deterministic classification; the CLI and browser adapter own I/O and use the existing profile session lifecycle. There is no new domain lifecycle requiring an FSM.

| Command | Result |
| --- | --- |
| `node --test tests/cpu7-report.test.ts` | Red `ERR_MODULE_NOT_FOUND` (`red.log`); native-five red (`red-native-five.log`); 11 green (`green.log`). |
| `npm run typecheck`, `npm run lint`, `npm run format:check` | Pass; also run by core/full/build as applicable. |
| `npm test` | 455 passed on final tooling (`final-core.log`; initial 452). |
| `npm run check:full` | 473 passed on final tooling, lint/format pass (`final-full.log`; initial 470). |
| `npm run build` | Pass before and after review fixes (`verify-build.log`, `final-build.log`). |
| `npm run test:cpu:production` | Pass: 82 bundled chunks, development diagnostics isolated (`final-isolation.log`). |
| `DEMO_URL=http://127.0.0.1:5474/ npm run test:production` | Pass against final built preview, not dev (`final-production.log`). |
| `npm run test:cpu`, `npm run test:cpu:regressions` | Pass on A and B with own Vite roots, and on the study checkout (`contracts-{a1,b1}.log`, `verify-cpu*.log`). |
| `npm run test:movement`, `npm run test:phalanx`, `npm run test:rig:shield:transitions`, `npm run test:rig:handoff`, `npm run test:ragdoll:contacts`, `npm run test:skeleton:breakup`, `npm run test:discoveries`, `npm run test:inspection` | Pass against the study dev server (`verify-*.log`, supported browser per suite). |
| `node tests/cpu7-interactions-browser.ts`, `node tests/cpu5-interactions-browser.ts` in CPU7 mode | Pass on each correct-root side; first wrong-root batch excluded. |
| `CPU_REPLAY=… npm run profile:cpu` | A pass; B rejects input, not a timing pass. Correct-root recheck logs under `test-results/cpu7/`. |
| `git diff --check` | Pass. |

First independent read-only review (`test-results/cpu7/review.log`) reconstructed native Low, stable fixed-work and shield AB from raw inputs, supported the measured desktop budget miss and rejected a matched speedup. It identified the wrong-root witness batch (excluded above), duplicate-visit risk, matched truncation and missing-scope zero substitution, and noted that endpoints cannot stand in for complete witnesses. Follow-up focused tests exercised repeated visit IDs, identically truncated runs and missing required timers: `review-red.log` → **14/14** in `review-green.log`; typecheck, lint and format also passed after these changes. The reader now reports endpoint matches and exploratory timing, not an acceptance decision.

The follow-up independent review (`test-results/cpu7/final-review.log`) accepted the negative investigation, confirmed the javelin diagnostic and treated the corrected visual witnesses as sampled parity only. Two delivery fixes were exercised red → green: a single missing or invalid frame timer now returns `frame: null`, `frameStatus: "unavailable"` and no worst frame; the CPU7 off-root CLI now requires a verified clean study worktree and owns its strict-port server, refusing an occupied port without probing it. The RAF and controlled summaries reproduced byte-for-byte from the frozen input reports, with the archive checksum unchanged. No new timing campaign was run. See [delivery checks](../VERIFICATION.md#cpu7--approved-investigation-not-performance-acceptance).

## Reproduce

Use the [study plan](plan/cpu7-integrated-acceptance.md), the revisions above and two empty local ports. Commands below use A1; switch URL, directory and label for the other visits. Allow each invocation to finish before starting another. Run comparison tooling from the study checkout, not from either measured tree.

```sh
git worktree add --detach /tmp/opencode/cpu7-a abf8586
git worktree add --detach /tmp/opencode/cpu7-b 88a297e
npm --prefix /tmp/opencode/cpu7-a ci --ignore-scripts
npm --prefix /tmp/opencode/cpu7-b ci --ignore-scripts

DEMO_URL=http://127.0.0.1:5471 CPU_GPU=hardware CPU_LABEL=cpu7-raf-a1 \
  CPU_CASES=live-low,live-high CPU_MODES=off,coarse CPU_REPEATS=1 \
  npm --prefix /tmp/opencode/cpu7-a run profile:cpu

DEMO_URL=http://127.0.0.1:5471 CPU_GPU=hardware CPU_LABEL=cpu7-controlled-a1 \
  CPU_CASES=entrance,stable,hitch,movement,doorway,shield,phalanx,cargo,ragdoll,bones,bolt,javelin,hazard,landing,airborne,stairs,burst,settled,frames-low,frames-high \
  CPU_MODES=coarse,detailed CPU_REPEATS=1 npm --prefix /tmp/opencode/cpu7-a run profile:cpu

node tests/cpu7-read.ts \
  /tmp/opencode/cpu7-a/test-results/cpu0-cpu7-raf-a1.json \
  /tmp/opencode/cpu7-b/test-results/cpu0-cpu7-raf-b1.json \
  /tmp/opencode/cpu7-b/test-results/cpu0-cpu7-raf-b2.json \
  /tmp/opencode/cpu7-a/test-results/cpu0-cpu7-raf-a2.json \
  /tmp/opencode/cpu7-a/test-results/cpu0-cpu7-raf-a3.json \
  /tmp/opencode/cpu7-b/test-results/cpu0-cpu7-raf-b3.json >test-results/cpu7/raf.json
```

For the untimed off-root replay, run from the study checkout with an unused port and a fresh
artifact label. The script verifies the worktree against the frozen side and starts and closes
its own Vite server; do not start one on that port first. For B, switch side, root, port and label.

```sh
CPU7_SIDE=a CPU7_CHECKOUT=/tmp/opencode/cpu7-a CPU7_INTERACTION_LABEL=a-new-witness \
  DEMO_URL=http://127.0.0.1:5471 CPU_GPU=hardware node tests/cpu5-interactions-browser.ts
```

The separate catalog/resource collector still uses a manually owned server. Start it with the
explicit checkout root, e.g. `node /tmp/opencode/cpu7-a/node_modules/vite/bin/vite.js /tmp/opencode/cpu7-a --host 127.0.0.1 --port 5471 --strictPort`, then run `DEMO_URL=http://127.0.0.1:5471 CPU_GPU=hardware CPU_LABEL=a-new-catalog node tests/cpu7-interactions-browser.ts` from the study checkout. **Pass the checkout as Vite's project root, not just as part of the executable path.** Never use the CPU5 fixture's historical byte-for-byte CPU4 parity oracle for an A/B study. For the original hitch reexecute the historical recipe-2 **input** pin using `CPU_REPLAY=/absolute/path/to/cpu0-review-baseline-hitch.json`; `CPU_ALLOW_CHANGED_SOURCE=1` is required only for B and does not bypass input/output checking. Historical timing must not substitute for failed replay.
