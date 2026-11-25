# Epic 14 startup FPS follow-up

Diagnostic only; no game changes. Protocol: `docs/plan/epic-14/startup-fps-follow-up.md` as supplied at the start of the run.

**Finding:** stationary shrine hover regressed, but its dominant added work was **picking/occlusion**, not synchronous approach construction or routing. It does not explain idle or the reported single-digit sustained play. The largest measured main-thread slice even in `ccdc078` was Babylon scene submission; the largest fixed-step slice was actor animation/grounding.

## Production cadence

Each cell is **FPS / median ms / p95 ms / intervals >100 ms** for the next ~10 s. Deltas are B minus A in pair order. The refresh-quantized median measures whether a frame made the next refresh; the extra 16.6 ms in the median is not a measurement of 16.6 ms of new CPU work.

| Pointer / pair | A (`d7f6562`) | B (`ccdc078`) | Δ FPS / median ms |
| --- | ---: | ---: | ---: |
| None 1 | 19.08 / 50.0 / 83.4 / 5 | 36.91 / 16.8 / 66.7 / 2 | +17.83 / −33.2 |
| None 2 | 48.76 / 16.7 / 33.4 / 2 | 47.56 / 16.7 / 33.4 / 1 | −1.20 / 0.0 |
| None 3 | 52.06 / 16.7 / 33.4 / 2 | 43.89 / 16.7 / 33.5 / 1 | −8.17 / 0.0 |
| Floor 1 | 51.36 / 16.7 / 33.4 / 1 | 47.96 / 16.7 / 33.4 / 2 | −3.40 / 0.0 |
| Floor 2 | 48.36 / 16.7 / 33.4 / 2 | 43.36 / 16.7 / 33.4 / 2 | −5.00 / 0.0 |
| Floor 3 | 49.66 / 16.7 / 33.4 / 2 | 41.77 / 16.7 / 33.5 / 2 | −7.89 / 0.0 |
| Shrine 1 | 50.66 / 16.7 / 33.4 / 2 | 36.07 / 33.3 / 49.8 / 2 | −14.59 / +16.6 |
| Shrine 2 | 47.16 / 16.7 / 33.4 / 1 | 34.57 / 33.3 / 33.5 / 2 | −12.59 / +16.6 |
| Shrine 3 | 48.88 / 16.7 / 33.4 / 2 | 33.77 / 33.3 / 49.9 / 2 | −15.11 / +16.6 |

**Shrine hover regressed**: +16.6 ms in all three paired medians, versus <0.1 ms repeat span on either side. Floor throughput fell in all three pairs without a median or meaningful p95 step; idle was mixed, with large first-pair variance (33.3 ms median span in A, 0.1 ms in B). The reported sustained single-digit FPS did **not** reproduce (slowest window 19.08 FPS in A and 33.77 in B). Navigation→ready was 1.97–3.80 s in A and 1.99–3.02 s in B, separate from sustained cadence; the slow first idle pair was retained. No `f0b2595` campaign: the hover path was introduced in `ccdc078`, and there was no repeatable idle median regression to bisect.

## What consumed the frame?

One diagnostic visit per cell below, aggregated over fixed ticks 180–480 (native render loop, not step-pumped). Times are means except the GPU column. The two shrine attribution visits also ran Chromium CPU sampling, so compare magnitude and ownership, not sub-ms differences across visits.

| Revision / pointer | `scene.render` CPU ms/frame | GPU scene timer median / p95 ms | Fixed ticks/frame | Tick ms/frame | Tick ms/tick (rig subset) | Preview ms/frame |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A / none | 10.92 | 7.43 / 11.42 | 1.12 | 6.24 | 5.58 (3.22) | — |
| B / none | 12.20 | 7.53 / 12.24 | 1.22 | 6.90 | 5.66 (3.29) | 0.02 |
| A / floor | 11.42 | 7.29 / 12.22 | 1.14 | 6.40 | 5.61 (3.24) | — |
| B / floor | 11.56 | 7.08 / 11.44 | 1.25 | 6.87 | 5.50 (3.21) | 1.22 |
| A / shrine | 12.02 | 7.77 / 13.01 | 1.24 | 7.46 | 6.00 (3.47) | — |
| B / shrine | 11.07 | 8.08 / 11.73 | 1.75 | 9.98 | 5.69 (3.36) | 6.84 |

- **B shrine vs floor:** all sampled hits remained on the intended target. Picking was **6.15 ms/frame** (p95 **7.1**) vs **1.05** (p95 **1.3**). `pickPointer` adds an occlusion sweep when it gets an object hit. Three vs two scene rays visited ~7,203 vs 4,790 mesh predicates/frame and admitted ~2,173 vs 239 mesh candidates; those are not counts of exact triangle tests. `enemyRendering.pick` forced 24 actor-proxy matrices/frame **before** filtering by alive/enabled, in both cases. The B CPU trace corroborated the timings: `InternalPick` was on ~1.99 s of inclusive sampled stacks vs ~2.26 s for `refreshPreview` over the whole capture. Separately, `scene.render` accounted for ~4.37 s inclusive; active traversal and opaque draw submission were prominent in both revisions.
- **Synchronous approach is repeated, but small here.** B tested 25 endpoint samples (eight accepted) and eight direct segments/frame. Endpoint construction/validation averaged **0.19 ms** (p95 0.3); direct sweep **0.025 ms**; all eligibility **0.47 ms**. One speculative route was submitted (~5.1 ms total submission/service in the full visit, none of consequence after tick 180); proof reuse still rechecks endpoints/segments. Outline bookkeeping was **0.04 ms**, seven meshes outlined. The B shrine visit averaged ~797 draws vs ~784 on its floor visit. GPU timer queries are asynchronous and cover scene commands only; do not add them to overlapping CPU times or use them to explain all RAF gaps.
- **Fixed-step amplification is not slower AI per tick.** B shrine commonly ran two ticks/frame (126 of 171 measured frames) vs B floor (58 of 241). B combat including AI and motors was 1.63–1.67 ms/tick, including ~0.44–0.46 ms squad/formation, ~0.12 ms think and ~0.66–0.68 ms motor/movement. Top-level route-budget service was ~0.001–0.002 ms/tick, not an inclusive measurement of navigation done inside combat. The rig work runs in `tick`, not once per render. The instrumented 10 s calls advanced 587–594 ticks after the first gameplay frame; 80 ms clamp discarded ~125–239 ms over those visits, early rather than in the 180–480 bin. First post-ready `scene.render` began ~2–6 ms after ready in these attribution visits (CPU frame timing, not a present timestamp). Clean cadence did not expose exact simulation tick counts.

**Recommendation:** address stationary hover's redundant scene-wide pick/occlusion work first. Prototype early spatial rejection or dirty-input/scene invalidation; verify exact hit IDs, occlusion (including thin instances), moving actors, door/camera changes and outline parity against the exhaustive picker before retaining it. Cache/bound approach validation only if it shows material cost in another trace; do not start by tuning the route budget. For idle/floor or the original single-digit report, capture the actual slow hardware/view/quality and prioritize Babylon active traversal/submission and fixed-step rig work. Do not call parity a playability fix or claim FPS recovery from this diagnostic.

## Population contrast: not a settled-remains comparison

Three instrumented shrine pairs per revision, same entrance camera and tick bin (180–480). The fixed casualties were every other enemy in spawn order (12 IDs listed in each `contrast-*-half.json`); the fixture used `Combat.damage`, letting the normal death handlers run. The initial attempt at tick 0 failed with `Singular rig transform`; the replacement applied damage after 12 completed ticks so rigs had valid poses. Values are **FPS / median ms / p95 ms**, full → half:

| Pair | A | B |
| --- | --- | --- |
| 1 | 57.58 / 16.7 / 22.3 → 43.10 / 20.5 / 33.7 | 35.37 / 27.7 / 38.2 → 27.28 / 33.8 / 56.0 |
| 2 | 53.53 / 17.9 / 25.4 → 42.16 / 21.4 / 34.5 | 33.26 / 30.4 / 37.0 → 29.23 / 32.1 / 49.5 |
| 3 | 53.58 / 17.8 / 23.8 → 38.21 / 26.5 / 33.9 | 35.03 / 28.9 / 33.0 → 24.68 / 36.6 / 60.7 |

The casualty visits were slower, but **six remains were still unsettled at tick 180 and four at the end**, so the requested settled population inference is inconclusive. At tick 180 visible live rigs went 3 → 2 and route owners 7 → 3; survivor behavior also changed (two moving flankers in half vs a regrouping set in full). These are unmatched behavior bins, not a per-enemy measurement. In B the combat slice fell from 1.63–1.69 to 1.02–1.06 ms/tick while the animation/death-physics slice rose from 3.33–3.36 to 5.31–5.60 ms/tick. No target switch was needed. This contrast shows why killing half the enemies is not equivalent to removing half the runtime cost. No extra campaign was run to chase settling or to test a proposed optimization.

## Replay and evidence

- **A:** `d7f6562ddd705e38156e622d81590b536d1b604e`; **B:** `ccdc078f7991d1858a3eaad4bb04c2d5acbbd6c5`. Independent detached clones, lockfile installs, identical minified production build settings. Probes were compiled into separate output directories in the clones; the cadence bundles contain no probes.
- Headed Playwright Chromium `159.0.8154.6`, Ryzen 5 2600X, NVIDIA driver `615.78.08`, Wayland desktop at ~59.91 Hz, `balanced-bazzite`. Actual canvas renderer: **WebGL2 / ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2070/PCIe/SSE2, OpenGL ES 3.2)**. 1920×1080 CSS viewport, nominal DPR 1 (reported 0.99999998, 1919×1079 backing buffer), default High. Shared desktop, not a dedicated lab; power profile unchanged, clocks not locked.
- Fresh context and navigation to `?seed=MOURNING-731`, no-store server, new page per run, sequential foreground canvas, no inspection, clicks or held input. No browser/GPU process restart between runs of a mode (driver shader caches were not cleared). Start at hero `[0,0,0]`; camera `alpha=-π/4, beta=0.64, radius=27`, target eases toward `[0,0.75,0]`. Exact matrices and generated/actor snapshots are in the raw preflight and probe files.
- Clone snapshots matched 13 rooms, connections, entity placement, door state, hero/camera parameters and the IDs, transforms and initial behavior of 24 live enemies at tick 0. Four enemy render sets intersected Babylon's active-mesh list at first ready render; three at tick 180 in the full-alive visits (not a line-of-sight count). A and B are not mesh-identical: new use batches and pointer rendering in B changed scene mesh counts (2,382 → 2,395 at ready); the preflight screenshots show the same shrine/floor geometry. A lacks B's use-surface tags.
- No pointer means no canvas input. Floor `(920,580)` projects near `(-0.21,-0.74)` on the entrance floor. Object `(1436,700)` targets the entrance shrine (`prop:shrine-entrance-0`, restore), out of reach with eight eligible endpoints and no direct approach in B's preflight. Each pointer fixture dispatches one synthetic mouse move at ready, then no more input; CDP blocks unrelated physical input. A has no stationary hover picker or approach operation; its treatment is the same scene/pixel and input, not an equivalent route workload.
- Cadence sampled with native `requestAnimationFrame`, not the HUD's smoothed FPS. An external observer records ready from `#loading.done`, uses the first post-ready RAF as the anchor and records until the first RAF at or after +10 seconds. One preliminary idle pair was rejected when physical mouse movement reached B; the campaign replaced it with input isolation. No forced clocks, stepping, pauses or time scaling.

## Reproduce locally

From the original repository root, with Chromium installed (`npx playwright install chromium` if needed **inside the clone**). Keep the screen awake and foreground. The local harness, fixtures, JSON samples and Chrome CPU profiles are ignored under `test-results/epic14-startup/`. They are not source-controlled; keep that directory to rerun the exact probes.

```sh
evidence="$PWD/test-results/epic14-startup"
root=$(mktemp -d /tmp/opencode/epic14.XXXXXX)
for side in A B; do
  if [ "$side" = A ]; then rev=d7f6562; else rev=ccdc078; fi
  git clone --no-local --no-hardlinks . "$root/$side"
  git -C "$root/$side" switch --detach "$rev"
  git -C "$root/$side" rev-parse HEAD
  (cd "$root/$side" && npm ci && npm run build &&
    ./node_modules/.bin/vite build --base ./ --logLevel error &&
    python "$evidence/probe.py" "$root" "$side" detail &&
    ./node_modules/.bin/vite build --base ./ --outDir dist-diag --sourcemap --logLevel error &&
    ./node_modules/.bin/vite build --base ./ --outDir dist-pop --logLevel error)
done
node "$evidence/run.mjs" "$root" preflight
node "$evidence/run.mjs" "$root" cadence
node "$evidence/run.mjs" "$root" attribute object
node "$evidence/run.mjs" "$root" contrast object
node "$evidence/analyze.mjs"
```

## Current-main cursor query trial (2026-11-24)

**Delivery: not retained.** This is a separate trial under [the approved cursor query plan](plan/cursor-query.md), not a revision of the historical comparisons above. The instrumented shrine comparison moved inclusive pick cost in the wrong direction. The clean cadence campaign is **inconclusive**: an RTX driver failure prevented the planned repeats and controls. The one completed clean pair also favored the baseline. Neither the missing cadence evidence nor the lower work counts imply a refresh or playability recovery.

### What was compared

- A: unmodified `7f389bb26097eeb1c00f22692ceebae1b0cf97d1`. B: the exact candidate archived below. Independent clones with `npm ci`, identical minified Vite settings, and separate instrumented bundles for preflight and diagnostics. No debug query, frame stepping, game probes, or CPU profiler in the cadence bundles. Cadence used an externally injected RAF/ready observer.
- Headed Chromium `159.0.8154.6`, Linux `7.2.9-ogc3.1.fc44.x86_64`, Ryzen 5 2600X, NVIDIA `615.78.08`, `balanced-bazzite`, shared Wayland 59.95 Hz desktop at 2560×1440 (scale 1.3). Actual game canvas WebGL2 renderer: `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2070/PCIe/SSE2, OpenGL ES 3.2)`. CSS 1920×1080, DPR `0.9999999812016114`, backing buffer 1919×1079. Clocks and desktop load were not locked.
- Fresh foreground navigations to `?seed=MOURNING-731`. Both preflights had High, hero `[0,0,0]`, 24 live enemies, identical room/connection/entity/door and mesh-name lists, and Tuned settings: 60° vertical lens, 35% fisheye, palette off (saved hue 360°, shadow coverage 54.1122213681783%), ink 4, corner wear 40. Orbit `[-π/4, 0.64, 15.757487093894618]`, target `[0,0.6,0]` at ready. Projection matrices matched; first rendered camera target Y differed slightly (`0.6451` vs `0.6510`) as the native easing started. Exact matrices and both entrance views are in `preflight-none-1-{A,B}.{json,png}`.
- The old shrine pixel `(1436,700)` was floor on both builds. Froze `(1490,740)` after both preflight picks returned `prop:shrine-entrance-0`, operation `restore`, out of reach, same eight approach options, no direct option. `(920,580)` was entrance floor on both. Pointer visits dispatched one synthetic canvas move at ready with physical input blocked; idle dispatched none. No clicks or stepping. The three diagnostic shrine pairs retained the same hit ID and seven outlined meshes in the sampled interval; floor and idle retained the intended classes and no outlines.

### Clean cadence: one completed shrine pair

| Arm | FPS | Median RAF ms | p95 ms | >100 ms | Worst ms | Navigation→ready ms | Window ms / intervals |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 23.585 | 38.9 | 64.6 | 2 | 323.7 | 3240.7 | 10006.5 / 236 |
| B | 20.293 | 44.4 | 77.5 | 2 | 393.2 | 3185.5 | 10003.3 / 203 |
| B − A | −3.291 | +5.5 | +12.9 | 0 | +69.5 | −55.2 | — |

**Stop rule:** completed one AB shrine pair. The second shrine pair's first arm (B) timed out before producing a valid capture. `nvidia-smi` reported `GPU requires reset`; the kernel logged TLB invalidation failure and NVIDIA Xids 175/154/79, including “GPU has fallen off the bus” (`gpu-stop.log`). No replacement pair was attempted on the failed hardware. Shrine pairs 2–3 and all clean floor/idle pairs are missing, so no clean repeat spread, control regression verdict, or one-refresh recovery can be established. No reset, software-rendered substitute, threshold change, retuning, alternate seed, or extra visits. These events establish a host failure during collection, not its cause.

### Separate timing runs (instrumented builds, ticks 180–480)

These observations are separate from clean RAF cadence. Columns are mean/p95 inclusive pick milliseconds per frame; index upkeep is included.

| Fixture / pair | A mean / p95 | B mean / p95 | B − A mean / p95 |
| --- | ---: | ---: | ---: |
| Shrine 1 | 5.690 / 6.5 | 11.596 / 13.2 | +5.906 / +6.7 |
| Shrine 2 | 5.709 / 6.6 | 11.277 / 12.2 | +5.568 / +5.6 |
| Shrine 3 | 5.605 / 6.3 | 11.756 / 14.0 | +6.151 / +7.7 |
| Floor 1 | 1.041 / 1.2 | 1.372 / 1.6 | +0.331 / +0.4 |
| No pointer 1 | 0 / 0 | 0 / 0 | 0 / 0 |

Shrine median of visit means: **5.690 → 11.596 ms/frame** (threshold ≤2.845 ms); median paired saving **−5.906 ms**. Within-side mean spreads: **0.104 / 0.479 ms**, p95 spreads **0.3 / 1.8 ms** (A/B). No pair saved time. Floor and idle diagnostic controls have one pair each, not clean controls or repeat statistics.

In the shrine bin, A→B enemy pass was 0.423–0.466 → 0.233–0.245 ms/frame; forced proxy sync fell from 24 calls (0.056–0.060 ms) to zero. Object pass was 0.628–0.647 → 0.671–0.694. Index maintenance was ~0.001 → 0.525–0.567 and candidate collection added 0.068–0.084. Cover pass was 4.531–4.596 → 9.767–10.184; B measured 2.916–3.194 ms/frame for synchronization across passes, nested inside those timings. A issued three Babylon rays with 7,203 predicate calls per shrine frame; B evaluated 2,103 selections in its candidate passes and another 2,413 predicates in the native thin-instance cover fallback, plus six direct mesh `intersects` calls. The probes did not count exact triangle intersections inside Babylon's native picker or isolate its exact-cover time from the inclusive cover pass. Per-candidate diagnostics add unequal overhead; do not take these numbers as an uninstrumented effect size. The remaining Babylon scan and live synchronization are leads, not proof that removing them is sufficient.

Shrine eligibility was 0.412–0.426 → 0.413–0.432 ms/frame; outline work 0.030–0.047 → 0.015–0.018. Tick rate was 2.020–2.197 → 2.479–2.771 ticks/frame, tick cost 5.134–5.309 → 5.213–5.537 ms/tick and 10.370–11.664 → 12.924–15.343 ms/frame. Rig subset was 3.070–3.122 → 3.171–3.372 ms/tick. `scene.render` CPU was 15.141–16.385 → 14.779–16.530 ms/frame. Async GPU timer medians were 13.283–14.951 → 14.685–16.765 ms, p95 18.989–20.653 → 19.597–21.690 ms. These scopes overlap; do not add inclusive stacks or CPU to GPU. All individual visits and control breakouts are in the report script output.

### Exact candidate and replay

The unretained source changes are `src/cursorQuery.ts`, `src/cursorSelection.ts`, `src/main.ts`, `src/gameTypes.ts`, `src/enemyRendering.ts`, `tests/cursor-query.test.ts`, `tests/epic14-browser.ts`, `tests/rig-browser.ts`, and `tests/cpu5-interactions-browser.ts`. The prototype uses a pure lifecycle table; direct proxy and owner queries; an XZ index for frozen, non-instanced cover; live transform synchronization; native Babylon thin-instance fallback; and a shared fresh ray for preview and down. It does **not** apply an unproven whole-rig envelope or change camera observation, route policy, or visual settings. Broad dynamic-cover synchronization and incomplete instance pruning were intentional conservative fallbacks in this trial, not changes adopted in main.

Evidence lives under ignored `test-results/cursor-query/`. Apply the tracked diff and new files only in a **fresh scratch clone** checked out at the base revision (`7f389bb26097eeb1c00f22692ceebae1b0cf97d1`). Run the following from the scratch clone root:

```sh
evidence=/var/home/tom/Projects/the-hollow-crown/test-results/cursor-query
git apply "$evidence/candidate-tracked.patch"
tar -xzf "$evidence/candidate-new-files.tar.gz"
npm ci
node --test tests/cursor-query.test.ts
```

| Artifact | SHA-256 |
| --- | --- |
| `candidate-tracked.patch` | `38a89ce8c5898981b49ea46157d5a5af29779c09f057851e1f587b521569e519` |
| `candidate-new-files.tar.gz` | `32165a45e5e7f3b29c1c74230623c30e11c3b403b2aaf259264bd73c45d2d47e` |
| Clean A `index-CmfVJhib.js` | `a78bf074cc7f8d384a91f11e824e19a77ec8a1e00309590fdb0b704d682b3a77` |
| Clean B `index-DRiBa0Ie.js` | `b3fb9c926b182ffd6f9e697c2c3955c0cf00dda51e00fad40051ead4bcae32be` |

Scratch candidate checkout: `/tmp/opencode/cursor-query.SRNpXI/B`. Raw captures: `cadence-*`, `attribute-*`, and `preflight-*`; `fixtures.json` pins the points and `run.mjs`, `probe.py`, and `report.mjs` preserve collection and analysis. `node "$evidence/report.mjs"` outputs the completed diagnostic and clean rows. Reopening requires working matched RTX capture and fresh evidence of a material bottleneck with a plausible way to remove it; a smaller predicate count is not that evidence.

### Verification of B (not a delivery approval)

- `node --test tests/cursor-query.test.ts`: candidate tests were authored and run before adding the adapter (`red.log`). The first run had six missing-contract failures and a broken torus characterization (the fixture had not registered a material, triggering Babylon's built-in bounds fallback). The corrected fixture replayed against the base with the reference passing and six missing-contract failures (`red-replay.log`); B passed **7/7**. Tests compare stable IDs, mesh identity, thin-instance index and hit distance against an independent exhaustive reference. They cover work admission, holes, live parent/pose changes, instance count/matrix changes, cutaway/cover, ties, enable/death, disposal and replacement.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm test` passed (**618 tests**). A combined command was cut off by a 120 s tool timeout during the extended run; `npm run check:full` finished on retry (**638 tests**, lint and format green, `check-full.log`).
- The unmodified Epic 14 controls test failed on clean A because it clicked source pixels under the Tuned lens (`browser-clean-baseline.log`). B's browser fixture projects into displayed CSS coordinates with the existing lens mapping; the corrected controls fixture passed on A (`browser-fixture-baseline.log`). It also checks that disabling the previewed practice foe before down, with no intervening frame, prevents stale pursuit. This is a reference characterization, not a feature-specific red test.
- Serial browser/build gates on the exact B source: `DEMO_URL=http://localhost:5181 npm run test:epic14`, `npm run build`, and `npm run test:production` all exited **0** (`gates-status.log`, `browser-retry.log`, `build.log`, `production.log`). Earlier browser attempts ended at debug-hook initialization and at the tool's 120 s deadline, respectively; the unchanged candidate completed on the final uninterrupted run. Browser fixtures exercised practice and dungeon interactions and the pose matrix; they are not exhaustive proof of every live geometry writer. If revisiting this candidate, scrutinize the thin-instance fallback, the coverage of nested/reparented and frozen transforms and owner changes, and missing dedicated browser cases for an intervening *different valid* owner before down. No independent delivery sign-off is claimed.
