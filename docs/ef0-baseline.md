# EF0 pre-refactor baseline — Story 0.1

**Decision (2026-11-23):** The offline oracle and exact Effect probe pass. Allocation, native
startup, production size and [warm animation](#quiet-window-follow-up-2026-11-23) have pre-refactor
ceilings. Generation latency still does **not** have a qualified timing ceiling: the new pair
fails the original p95 repeat-spread check. EF1 stays blocked. No source, content, package
manifest, lockfile, or roadmap checkbox changed; no independent subagent review was available.

## Reference identity and boundary inventory

- Production source: clean `398a1cf01fdebf8c072741c3de20670012795439`, `main`. `npm ci --ignore-scripts`
  into a `.git`-free archive for native measures, browser test clients and the root production baseline.
  Lockfile SHA-256 `565e12186123643d38540a2773ff1253c081955952d1bfec3987cb67328fa93f`.
- `world.ts`: `generateDungeon` wraps `generateDungeonWithReport`; default `MOURNING-731`, integer
  `maxAttempts` 1–40 (default 40; invalid input throws `RangeError`). A run creates one keep identity,
  accumulates ordered zero-based placement/validation/acceptance attempts, and applies presentation
  only after successful validation. Exhaustion throws `GenerationError` with the full ordered trace.
  `identity.ts` pins `layout-v3`, `keep-v4`, `last-ember-v1+tribute-v2+kobold-squads-v1`.
- The other world exports are `key`, `tileAt`, `heightAt`, `reachableTiles`, `reachableTileDistances`,
  `validateDungeon`, `INWARD_FACING_TYPES`, `ROOM_DEFINITIONS`, and the `localPoint`, `footprint`,
  `randomFrom` re-exports. `navigation.ts` and `routeGrid.ts` import the spatial surface, not the
  generator; terrain/rendering/rigs/actor and scenario code also use it. Generation reports use
  traversal/validation but neither measure time nor snapshot live actor/door state.
- `main.ts` resets UI/movement timing and inspector ownership, retires old objective work and
  inspection, disposes the scene, releases effects and removes generated shader entries. It generates
  and validates the next world, takes the DEV/debug initial report **before** scene/ECS setup, wraps
  tiles in `SupportTiles`, and calls `registerWorld`/`registerDungeonRendering`. `worldEntities.ts`
  registers the tile, room, prop and interaction objects by reference, binds doors/chests, and adds
  obstacle/render components separately. The frozen oracle does not substitute for EF1's live identity test.

## Offline oracle

The original primary manifest and its 103 gzip payloads were preserved byte-for-byte in the
ignored local directory `test-results/ef-checkpoint/original/tests/fixtures/generation-ef0/`.
The manifest SHA-256 is
`b67b2d6243b84f7024f6857195566ba397ed0f57e18eefa897f6db9dca96816a`; all 116 source/package hashes
matched. A fresh Node process captured to a new directory, and `diff -qr` matched the manifest
and **compressed bytes** for every entry. The 103 entries include 100 corpus inputs, two additional
scenario inputs (`ember-70`, `tribute-12`), and the one-attempt limit variant. Default (argument
omitted), `trial-27`, `ember-70` and `tribute-12` accept at 0. `trial-23` records, in order:

1. Attempt 0, validation: `Furniture front inaccessible: meat-rack-butchery-44`.
2. Attempt 1, validation: `Missing Last Ember shrine, focus or clue`.
3. Attempt 2, accepted, no reasons.

For `{maxAttempts:1}`, the actual exception is `GenerationError`, message
`Could not construct a traversable dungeon for seed trial-23`, `acceptedAttempt: null`, with just
attempt 0 above and the full identity. There is no invented rejected world.

The separate supplemental manifest in the sibling `generation-ef0-scenarios/` directory
pins nine adverse sweep extrema from the same unchanged revision: `scene-world-3/36` (four optional
socket omissions each), `ember-78` (128-tile shrine/focus route), `ember-6/96` (accepted attempt 2),
`tribute-17/98` (126-tile shrine/cache route) and `tribute-2/86` (accepted attempt 2). These use the
same sweep ranges and distance calculations as the scenario tests, including ties; synthetic
`planScene` failure inputs in `scenes.test.ts` are not whole-world seeds. The supplemental capture
also matched a fresh repeat byte-for-byte; manifest SHA-256
`9c50c6c9a20eeb6ebc4e5e1c3c43b57ac16522b1df0eaf6c0d82fd9cde43bda3`.

Native tests hash the canonical world, trace and initial `createGenerationReport` bytes (or the
exact exception tuple). They check six named leaves, and `check:full` checks both ordered corpus
roots for all 112 inputs, with no generated fixtures, Git history or network. Serializer v1 normalizes
record keys, not arrays/Maps/Sets; it preserves aliasing, omitted vs. undefined values and special
numbers. An in-memory spawn perturbation must change the digest. Suite registration performs no
manifest reads, corpus construction or world generation. The [source contract](../tests/ef0-contract.ts)
pins SHA-256 leaves, original manifest bytes and compressed-tree roots. The tree root sorts relative
UTF-8 names bytewise, then hashes each 4-byte big-endian name length, name, and 32-byte raw digest.
Corpus roots use the same framing with ordered JSON identity tuples instead of filenames and the
uncompressed canonical digest instead of the file digest.

## Cost freeze and limits

Host: AMD Ryzen 5 2600X (6 cores / 12 threads), Fedora x86-64 kernel `7.2.9-ogc3.1.fc44`,
Node `26.0.0`, npm `11.12.1`, Chromium `159.0.8154.6`, RTX 2070 / NVIDIA `615.78.08`,
`acpi-cpufreq` / `schedutil`; desktop power profile not independently known. Native times exclude
diagnostics/report rendering. Each native window: five new Node processes, two warm cycles then ten
timed cycles in the fixed order below. Nearest-rank p95 among ten samples is the maximum; window
statistics are medians of process statistics. Per-seed allocation is a separate 10-world batch in
each process with 32 KiB CDP sampling and both collected-object flags, summing sample sizes with a
`generateDungeon` ancestor and dividing by completed worlds. This is estimated JS allocation churn,
not retained heap. Each startup lane uses 20 fresh processes per window: import elapsed inside
Node, or end-to-end `node --test` of the one-line import-only fixture. No overlapping builds or
browser work. Original samples, batch loads and generated reports are local-only under
`test-results/ef-checkpoint/original/docs/ef0-evidence/`; host and command
logs are under `test-results/ef0-frozen/logs/`.

The following uses the midpoint (median of two) of the two initial window statistics; calculations
use unrounded values. The timing arrows are **nominal**, not qualified release ceilings. Allocation
ceilings are frozen (integer bytes, round down); allocation stayed within allowance even on retry.

| Seed, in execution order | Generation median B → nominal cap, ms | Generation p95 B → nominal cap, ms | Allocation B → ceiling, B/world |
| --- | ---: | ---: | ---: |
| `MOURNING-731` | 58.768 → 64.645 | 69.566 → 80.001 | 55,488,874.96 → 63,812,206 |
| `trial-23` | 228.937 → 251.831 | 247.039 → 284.095 | 219,626,763.92 → 252,570,778 |
| `trial-27` | 55.482 → 61.030 | 63.462 → 72.981 | 58,182,659.92 → 66,910,058 |
| `ember-70` | 71.191 → 78.310 | 79.357 → 91.260 | 69,482,077.68 → 79,904,389 |
| `tribute-12` | 63.074 → 69.382 | 71.820 → 82.592 | 68,186,198.56 → 78,414,128 |

| Metric | Actual pre-refactor baseline | Frozen ceiling / rule |
| --- | ---: | ---: |
| Node cold import median | 124.919097 ms (window medians 118.525, 131.314) | 224.919097 ms |
| Native import-only test start-to-exit median | 369.3455785 ms (367.177, 371.514) | 469.3455785 ms |
| Root Vite shipped JS (82 files), raw / per-file gzip level 9 | 2,387,559 / 623,734 B | 2,649,703 / 689,270 B |
| Initial HTML-linked JS, raw / gzip | 2,065,153 / 533,773 B | Separately reported; aggregate JS ceilings above |
| All emitted files (84), raw / gzip | 2,407,540 / 630,084 B | Local original `assets.json`; zero added remote fetches |
| Same-seed post-ready regeneration | 2,382 meshes / 495 nodes / 28 materials / 4 textures / 4 render targets / 58 effects / 34 shader sources / 1 scene / 5,719 ECS entities | No increase or growth; same resource probe and 120 fixed settle ticks |

Initial native 1-minute loads were 2.02–2.56. The two window medians agreed within additions, but
individual process p95s exceeded the allowance (e.g. `MOURNING-731` 65.258–96.382 ms across both vs
10.435 ms addition; `trial-23` 235.030–280.952 vs 37.056 ms). The one bounded retry (windows 3–4)
was worse: 1-minute loads 6.07–8.74, and `trial-23` window-median p95 spread exceeded 50 ms, with
process p95 as high as 479.090 ms. Do not adopt the slower retry as B, drop outliers or increase
allowances. A new quiet matched session before any production cutover is required to qualify
generation time. Startup sample ranges (initial) were 112.386–150.148 ms import and
357.309–394.256 ms native start, below the 100 ms additions; retry window medians also remain
within those additions. Allocation sample counts exceeded 15,000 per seed/batch, so no extension.

### Animation and hardware qualification

Shipped workload: existing `animation-review-fixture.ts` `createReviewStage().baseline()`;
60 warmups + 240 `animateActors` updates, 25 original actors / four settled corpses and all four
attack kinds. `MOURNING-731`, High (shadows enabled), headed hardware WebGL ANGLE/RTX 2070,
800×600 CSS, 799×599 rendered, DPR ~1. Mean terrain reads/update 670.717, max 1,016, identical
in all captures. This times the animation CPU path only, not frame cadence or GPU time.
Initial p95 6.6 / 7.3 ms (B midpoint 6.95, nominal ceiling 7.645); spread 0.7 slightly exceeds
the unrounded 0.695 allowance. Retry p95 7.1 / 7.6 ms, but runnable counts reached 25 with high
host load, so it is not an eligible quiet freeze either. GPU snapshots were 40–41 °C / 5% / P8 at
the retry boundaries, not a trace. Do not use SwiftShader smoke results as hardware cost evidence.

[VERIFICATION](../VERIFICATION.md) A7 reported 3.1175 ms mean / 4.10 ms p95 for the historical
25-actor/four-corpse fixture and used the 3.2 / 4.5 ms **investigation triggers**, not portable
limits. Both triggers were exceeded here (see hardware logs). [CPU7](cpu7-integrated-results.md)
also left explicit misses: shipped warmed submission p95 22.3–29.6 Low / 29.7–31.0 High against
~12 ms, Stable Low 45.1–49.8 FPS / High 38.0–42.4 FPS vs 60 FPS, strict matched-start results
inconclusive and M1 not available. Those misses are not reset by this story. The original
warm-animation rule is `B + max(0.3 ms, 0.10 B)` on quiet matched hardware; no new FPS promise.

## Effect exact-version verification

**`effect@4.1.5`** is published; registry metadata has no `engines` field and root export
`./dist/index.js`. Registry and sandbox lock both resolve
`sha512-xyR20KhQI0vg2gD8ILUSQRTTESEYJ0JKdP+QD8J37xbwPTqXRxFM/l0+vUVD9fuSvoYruoTqyt33C4FZv1s4TQ==`.
Existing locked package entries were unchanged by the sandbox install. Context7 quota was
exhausted; release API was checked against the installed **4.1.5** declarations and behavior.

`Context.Service` and `Effect.provideService` preserve the required environment; a checked
negative type assertion verifies the runner rejects an unprovided environment. `runSyncExit`
returns success, failure (`Cause.findError`/`Result.isSuccess`), or defect (`Cause.findDefect`,
same error object and no typed error). Suspended `Effect.callback` in the sync runner returns
a `Cause.isAsyncFiberError` defect; explicitly interrupt its `.fiber` to clean up. A forked
callback receives an aborted `AbortSignal` on `Fiber.interrupt`, yields an interrupt cause from
`Fiber.await`, and runs callback cleanup and `Effect.ensuring` exactly once. Native Node and both
production preview bases returned the same values; the browser test blocks nonlocal/base-mismatched
requests and witnessed the built JS asset, not source modules. This is a compatibility pin, not an
installation in `main` or proof of later refactor parity.

## Checks and reproduction

- Focused native command from the story plan: **19 passed**. `npm test`: **459 passed**.
  `npm run build` and `npm run check:full`: pass (**479** full tests, strict typecheck, lint and
  format). `npm run report:generation`: pass (100 seeds). TDD evidence: supplemental oracle red on
  wrong manifest, then green on its separate fixture; native Effect red on missing probe module,
  then green. Original fixture sensitivity/oracle were already present at restart; no claim of a new
  red run before their original implementation.
- Owned strict-port DEV on main: `npm run test:generation` passed Node/browser initial-report and
  reset parity; `npm run gallery:generation` passed 48 captures and five identical stability samples;
  `npm run test:resources` passed three GC/scene retirement resets; `npm run test:animation` passed
  rendered gait, attack, death, foot contact and focus checks. The baseline root preview passed
  `npm run test:production`, including no external assets/development hooks.
- **Optional full recapture** from the main checkout: have the pinned commit locally, Git, Bash,
  tar and diff, Node **26.0.0** with `process.versions.zlib === '1.3.1.zlib-ng'`, npm **11.12.1**,
  and a primed npm cache for the historical lock. Use plain Node without `NODE_OPTIONS` or compile
  cache. The archive path is new each time, and source plus package bytes are checked against the
  historical Git blobs before capture. Only the capture driver, EF0 contract, replay helper, and
  generation observer are overlaid. A missing commit/cache or digest mismatch stops the recapture;
  it never uses the current generator as the reference.

  ```sh
  node tests/capture-generation-baseline.ts ef0-replay-1
  node tests/capture-generation-baseline.ts --diagnose test-results/ef0-replay-1/base
  ```

  The first command runs `git archive <pinned-sha> | tar -x -C BASE` and `npm ci --ignore-scripts
  --offline`, produces both level-9 gzip kits under `test-results/ef0-replay-1/base/`, verifies
  manifest, compressed tree and canonical digests, and runs `diff -qr` against the local originals
  if present. The second optionally compares the current candidate against verified historical
  payloads and reports the seed and first differing canonical path. Neither updates the contract.
  Measured startup/latency/allocation and hardware readings are historical; reruns cannot
  recreate their exact samples and are not part of recapture or normal CI.
- Historical measurement recipe (not a pending campaign): `git archive 398a1cf01fdebf8c072741c3de20670012795439 | tar -x -C "$BASE"`,
  `npm ci --ignore-scripts` in `BASE`, copy `tests/measure-generation.ts` and
  `tests/fixtures/ef0-import.test.ts` to the same paths there, and run `node tests/measure-generation.ts`
  twice sequentially in confirmed quiet windows. Run `npm run build` separately, then
  `node tests/measure-generation.ts assets`. Harness SHA-256
  `051d7e328b4acd27193d5a115e83c359f4560e23845ce79ee17642fdd69026f8`.
- Recreate the exact probe in a **different** source archive `PROBE`: `npm install --ignore-scripts
  --save-exact effect@4.1.5` there. Copy `effect-probe.ts` to `src/`, `effect-probe.test.ts` to
  `tests/`, `effect-probe.html` to `index.html`, and `effect-browser.mjs` to the sandbox root, all
  from `docs/ef0-evidence/`. Run `npm run typecheck`, `node --test tests/effect-probe.test.ts`, then
  `npm run build` / `npm run build:pages`, smoke each fresh matching strict-port preview. The
  [runner](ef0-evidence/run-reference-checks.sh) records commands, deadlines, port/root ownership
   and per-check exit status. Invoke from `SOURCE`; `SOURCE`, `BASE`, `PROBE`, and `OUTPUT` are
    absolute. Use new scratch archives and output directories under ignored `test-results/`, and
    verify/reselect ports if occupied. The runner continues
   independent checks, records build-dependent skips as `SKIP (<build> failed)` in
   `check-status.txt`, and exits nonzero if any check fails.
- Heavy captures and corpus, full exact probe lock, and `.git`-free source snapshot are kept under
  ignored `test-results/ef0-frozen/`, not `/tmp` and not overwritten by normal reports. SHA-256:
  `browser-captures-and-corpus.tar.gz` = `7d3776a738e409c281f2dd0b850505015ad976e33ad2cc8639ba49ce4508c04d`;
  `effect-probe-lock.json` = `a32adb7ea1df998bb678a544d52a551ac9bbd06a7bcc6655651286c57f901b3f`;
  `pre-refactor-source.tar.gz` = `804658065ab30ae51f94efbacc93041dd975128be178dc424851f110f3010a83`.

### Correctness follow-up (no timing retry)

- `node --test tests/ef0-tooling.test.ts`: before the fixes, five cases failed and the all-success
  control passed. The capture created a destination from a foreign Git cwd; the runner masked a
  simulated non-build failure and dispatched each preview after its build was made to fail. After
  the fixes, all six passed. The runner tests use command stubs and pre-existing `dist` files to
  verify that each failed build skips its own smoke (and the baseline asset inventory), unrelated
  checks continue, and the aggregate exit is nonzero. No real preview or hardware workload ran.
- `bash -n docs/ef0-evidence/run-reference-checks.sh`, `npm test` (465), `npm run build`, and
  `npm run check:full` (485, including strict typecheck, lint and format) passed. Both fresh captures
  to scratch directories matched their frozen manifests and gzip payloads byte-for-byte. The
  existing fixtures and archived evidence checksums were unchanged.
- The browser and Effect compatibility results above are from the prior evidence, not new smoke
  runs. No runtime or dependency changes, no new timing measurements or ceilings, and no change to
  the EF0/EF1 gate at that point: both timing lanes remained unqualified.

### Quiet-window follow-up (2026-11-23)

Ran two sequential native windows and then two fresh headed Chromium windows, with no
production build, other benchmark suite, or observed competing build. Native used a fresh
`.git`-free `398a1cf` archive with `npm ci --ignore-scripts` and the unchanged harness/lock hashes
above; `timeout -k 5s 180s node tests/measure-generation.ts` exited 0 twice. The archive's browser
client ran `node animation-hardware.mjs` via `owned-vite.py dev` (100 s client deadline) on two
isolated, strict-port loopback servers serving the unchanged `main` source, ports 5541 and 5542.
Both exited 0 and neither port remained listening. No other worktree was used.

Raw native samples, allocation batches, animation probe output, Vite logs and host telemetry are
retained locally under `test-results/ef0-frozen/quiet-20261123.JfZXYd/`. Same Ryzen 5 2600X, Node
26.0.0 / npm 11.12.1, kernel and RTX 2070/NVIDIA driver as above; `acpi-cpufreq` / `schedutil`,
desktop profile reported `balanced` after the runs. Native 1-minute load was 1.67–2.43 at harness
boundaries and between them at batch samples. One-second `vmstat` peaked at 5 runnable in each
native window, averaging 85.3% / 84.9% idle; no blocked tasks in those samples. Animation
preflight sampled 97–98% idle and 0% GPU; the two runs started at 1-minute load 2.13 / 2.25 and
ended at 2.35 / 2.35. During capture, runnable counts peaked at 3 / 6 and GPU temperature was
39–41 °C with similar P0/P8 transitions and 18% / 17% peak whole-GPU utilization. These are sampled
observations, not per-process CPU/GPU attribution or a thermal trace.

**Generation latency: inconclusive.** Window statistics and full spread across the ten process
statistics (ms); allowances follow the original formulas using the midpoint of this pair, for
qualification only. No samples dropped and no new generation ceilings adopted.

| Seed | Window medians A / B | Process median spread / allowance | Window p95s A / B | Window p95 spread | Process p95 spread / allowance |
| --- | ---: | ---: | ---: | ---: | ---: |
| `MOURNING-731` | 57.159 / 58.036 | 3.198 / 5.760 | 61.253 / 69.951 | 8.698 | 31.159 / 9.840 |
| `trial-23` | 222.236 / 226.473 | 10.644 / 22.435 | 241.807 / 248.035 | 6.227 | 53.500 / 36.738 |
| `trial-27` | 53.908 / 54.350 | 2.421 / 5.413 | 59.393 / 59.033 | 0.360 | 17.028 / 8.882 |
| `ember-70` | 67.769 / 69.407 | 5.037 / 6.859 | 73.524 / 77.209 | 3.684 | 26.323 / 11.305 |
| `tribute-12` | 61.534 / 62.441 | 3.591 / 6.199 | 70.205 / 91.833 | 21.628 | 27.819 / 12.153 |

`tribute-12` fails even at the window level; every seed exceeds its allowance at the process
p95 level. The original nominal caps are not promoted or replaced. The existing allocation and
startup ceilings remain unchanged: all new batch-window means for allocation were below the
per-seed ceilings (at least 15,441 attributed samples per batch); cold import medians were
118.371 / 120.173 ms and import-only test start-to-exit medians 378.444 / 373.415 ms.

**Warm animation: suitable for a matched-hardware ceiling.** The original High fixture ran
`MOURNING-731` at 800×600 CSS / 799×599 render pixels, DPR ~1, with shadows enabled, headed
Chromium 159.0.8154.6 on ANGLE/OpenGL ES 3.2 and hardware RTX 2070. Both runs had 60 warmups,
240 timed updates, 25 actors, four settled corpses, all four attack kinds and identical terrain
reads (670.717 mean / 1,016 max). Mean CPU times were 3.326 / 3.333 ms, and p95s 4.000 /
4.200 ms. Spread 0.200 ms is under the 0.410 ms allowance. **Baseline p95 B = 4.100 ms;
ceiling = 4.510 ms** (displayed rounded; use the midpoint of the retained p95s in the original
formula before rounding). The historical A7 mean investigation trigger is still exceeded; the
p95 trigger was not exceeded in this pair. This measures the animation CPU path, not frame cadence.

Stopped after this bounded follow-up; no further timing retries, changed budgets, or selection of
favorable samples. EF1 still needs a qualifying pre-cutover generation timing baseline and review
of the artifacts. The refactor is architectural: these are no-regression ceilings, not speedup
 requirements. Other correctness suites and the Effect probe were not rerun for this timing follow-up.

### Paired timing follow-up 1 — preflight only (2026-11-23)

[Historical paired-v1 preflight](ef0-evidence/paired-v1-preflight.md): tooling and the two
independently materialized reference kits passed verification, but 16 separately reserved quiet
windows were not available. No timing process ran, nothing was frozen from the paired design, and
the original unpaired generation result remains inconclusive. **EF1 remains blocked** pending one
qualifying paired calibration and independent review. No other gate disposition or allowance changed.

### Later decision — generation latency moves to EF4

The EF1 block statements above describe the historical checkpoints. The user subsequently
authorized EF1–EF3 on `main` using the frozen kits and moved the undecided generation latency
comparison to EF4. No new EF0 calibration was run during implementation and no ceiling or
tolerance was relaxed. The paired preflight is not an executed timing campaign. See the
[EF4 decision and actual comparison](../VERIFICATION.md#ef1ef4--generation-refactor-and-adoption-decision).
