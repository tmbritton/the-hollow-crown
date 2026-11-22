# CPU0 — reproducible CPU and correctness baseline

**Implemented, verified and independently reviewed READY; R1–R3 resolved.** Documentation prerequisite committed as
`013079c`. Measurements identify that revision **plus the uncommitted implementation source SHA-256**:
`e8b4bc7a5adc9fcb2e00444fec19a0b527caa59a370f7da348b1edf5076d1307` (**recipe 2**).
Reports carry their actual UTC timestamps (2026-11-22); the local development session began November 21.
This delivers measurement tooling and budgets, not a CPU optimization or hardware frame-rate claim.

## Run and reproduce

Requires the ordinary Node/browser setup. The runner starts/reuses a local development server and
cleans up only its owned server/browser. `DEMO_URL` selects an already available custom deployment.

```sh
npm run profile:cpu                         # entrance/stable/hitch, three repetitions, all modes
CPU_CASES=all CPU_REPEATS=2 CPU_LABEL=matrix npm run profile:cpu
CPU_CASES=bones,burst,settled CPU_REPEATS=2 CPU_LABEL=deaths npm run profile:cpu
CPU_REPLAY=test-results/cpu0-review-baseline-hitch.json CPU_LABEL=replay npm run profile:cpu
CPU_GPU=hardware CPU_CASES=live-low,live-high CPU_MODES=off,coarse CPU_LABEL=hardware npm run profile:cpu
npm run test:cpu
npm run test:cpu:regressions
npm run build && npm run test:cpu:production && npm run test:production
```

This host's headless checks require `DISPLAY= WAYLAND_DISPLAY=` before software-browser commands;
hardware mode intentionally uses the desktop environment. A bounded headed launch timed out after
15 seconds; a subsequent desktop run completed on the RTX 2070. No system settings were changed.
Software/generic renderer strings cannot satisfy the hardware evidence check.

- `CPU_CASES`: comma-separated catalog names below, or `all`; default `entrance,stable,hitch`.
- `CPU_MODES`: `off,coarse,detailed` by default. `off` keeps outer timers/checkpoints but installs no
  subsystem wrappers; it is not a zero-overhead control. `coarse` times major systems and requests.
  `detailed` adds operation counts, nested timings and route-phase records. Do not use its inflated
  times as uninstrumented performance claims.
- `CPU_REPEATS`: 1–5, default three; ordering reverses on alternating repetitions. Every cell starts
  a fresh `MOURNING-731` world. Hooks are installed **before** warmup; samples begin afterwards.
- `CPU_LABEL`: bounded filename label. Raw samples, compact summaries, optional hitch pin and
  selected captures go under ignored `test-results/cpu0-LABEL*`.
- `CPU_REPLAY` replays the whole pinned recipe, including warmup/caches, then asserts the exact
  request inputs and output. Request ordinals include warmup; `step` denotes the containing frame's
  starting simulation step. A pin is retained even if it falls outside that run's eight slowest
  requests. Changed source requires explicit `CPU_ALLOW_CHANGED_SOURCE=1`; this permits a candidate
  comparison but still checks the input/result contract. It does not claim identical source.
  Recipe mismatches remain rejected; use the recipe-2 pin above rather than the historical recipe-1 pin.

## Workloads and comparison policy

The pure catalog is `tests/cpu-cases.ts`; browser recipes are in `tests/cpu-workloads.ts`.

| Group | Cases | Scope |
| --- | --- | --- |
| Natural-world fixed-step | `entrance`, `stable`, `hitch`, `movement`, `doorway` | Normal inhabitants/AI; hero invulnerable to hold the measurement location. Entrance/stable warm 120 ticks then sample 240; hitch warms 360 then samples ticks 361–660. |
| Authored action fixtures | `shield`, `phalanx`, `cargo` | Real main ticks, accepted block batches and carry/combat/resume. Recipe-2 phalanx retains its live brains/motors on a real clear rectangle; 360 measured ticks must show rank recovery, opening, resolved long thrust, recovery and actual health loss. |
| Authored death fixtures | `ragdoll`, `bones`, `bolt`, `javelin`, `hazard`, `airborne`, `stairs`, `landing`, `settled` | Accepted lethal damage and real released projectiles, exact handoff, active/settled physics; landing uses the actual hero motor and same-tick respawn. Settled setup advances 501 unmeasured ticks before crossing. |
| Natural population stress | `burst` | All 24 original enemies die through accepted damage, then simulate/settle. Separately labelled extreme load, not the ordinary living baseline. |
| Controlled rendered cadence | `frames-low`, `frames-high` | Original tick/presentation plus actual scene draws; repeating 0/1/2/4-tick schedule for 72 displayed frames. Quality variants must have equal state fingerprints. |
| Native render loop | `live-low`, `live-high` | 72 callbacks from the original application loop, with its real accumulator/catch-up, scene rendering and feedback updates. Records actual ticks, callback cost and inter-frame intervals. |

Authored fixtures isolate participants by disabling other actors but retain their original meshes
and rig components. Their population reports explicitly include **inactive** actors; these rigs may
still participate in presentation queries. Use subsystem costs, not their whole-frame totals, to
estimate ordinary mixed-world death costs. Fixture setup and the two shader/setup draws are untimed.

Controlled presentation uses the scheduled ticks' duration; the native-loop cases retain the
application's wall-clock render delta. Controlled runs compare detached gameplay and presentation fingerprints at matching checkpoints and
the final state, and require repeated detailed operation counts to match. Authority includes actor
transforms/health/motion, jump/action/navigation/brain state, doors, squads, work/cargo/objectives,
particles/projectiles and knowledge. Pose comparison includes final/previous matrices, shield state,
accepted death snapshots and physics mode/bounds/resources. No snapshot extraction or pose writer
is invoked merely to read completed history. FNV fingerprints detect divergence; source identity
uses SHA-256. These are broad regressions, not a formal proof of complete state equivalence.

Native-loop runs intentionally **do not** assert identical final states or counts: timer overhead
changes how many fixed ticks fit into a wall-clock window. Their comparisons are timing/catch-up
diagnostics; the controlled recipes establish instrumentation parity. Native profiling starts a
fresh frame-clock window and restores the prior callback list afterwards. Software draws are real,
not suppressed; their cost cannot be compared directly with the old suppressed-draw investigation.

## Observers, ownership and bounds

- `src/cpuMetrics.ts`: synchronous bounded samples, inclusive timing/counts, phase attribution,
  top-eight requests plus one explicit pin, detached reports and exact descriptor restoration.
- `src/cpuProfile.ts`: imported only by **DEV + `?debug`**, exposes `window.__dungeon.cpu` and installs
  scene-owned wrappers. Stop, setup failure and scene disposal restore methods/getters/observers;
  regeneration cannot carry a session into its replacement world. A cancelled live run rejects its
  promise and removes its loop. Ordinary simulation has no new chart or background actor.
  Each observer's rollback is registered immediately. Native callback restoration waits until the
  microtask boundary after Babylon's live-array iteration; the promise settles after restoration.
  Cancellation stops the remaining callbacks in that sampled frame, and new sessions wait for restoration.
- Small `import.meta.env.DEV` guards in the tick, animation, navigation, corpse and terrain paths
  expose otherwise inaccessible phases/work. Native Node paths use optional env access where
  required. Root/Pages builds erase diagnostics; the bundle check inspects all JavaScript chunks.
- One session holds at most **2,048 frame samples / 160 metric keys / eight slow requests + one pin**.
  Manual frames permit 0–4 requested ticks; reports count actual ticks (including zero while paused).
  Native windows permit at most 240 frames and have a 90-second deadline. The CLI has a 30-minute
  deadline, finite case/mode/repetition bounds and yielding batches of twelve controlled frames.
- `cpu.start(mode)`, `cpu.frame(codes, ticks, render)`, `await cpu.live(frames)`, `cpu.state()`,
  `cpu.report()` and `cpu.stop()` are development APIs. Use `try/finally` with `stop()`; an exception
  ends its current sample but leaves a session available for reporting until explicitly stopped.

The CLI owns pause/render-loop control. For direct manual `frame` calls, stop the automatic loop
first and restore your saved callbacks afterwards; `start` alone does not automatically collect
frames. `live` manages and restores the preexisting callback list itself.

Timings are **inclusive**: `animation` contains `death.owner` and corpse/binding/history work;
`main.tick` contains combat and animation; `scene.render` contains active-mesh evaluation. Manual
`tick`/`presentation` are outer counterparts of `main.tick`/`main.presentation`, not extra costs to
add. `frame` is combined tick/presentation in non-rendered cases and the sampled callback when
rendered; `frame.interval` is only the native inter-frame interval. Source hashing, fixture setup,
checkpoint serialization and yielding are outside the measured interval, but can still influence
host load/GC. Record repeat spread rather than assuming zero observer overhead.

Detailed counters include door accessors, requested exact-zero/tiny/nonzero adapter motion,
mesh-enabled checks within collision coordination, actual `_checkCollision` candidates, route
nodes/edges/clearance samples and phase work, grounding/binding/surface/tail/shield/history calls,
accepted feedback consumption, physics steps/terrain changes/freezes and selected allocation events.
Route metadata reads are muted so they do not inflate application door counts. Corpse box/list,
pose snapshot and physics-body allocation counts plus CDP heap snapshots are **not a complete JS
allocation census**. Reports include actual renderer/browser, source/recipe identity, quality,
viewport, hardware description, host load/memory and per-window populations/resources.

## Refreshed measurements and budgets

Current recipe-2 reports: `cpu0-review-baseline{,-summary,-hitch}`, `cpu0-review{,-summary}` and
`cpu0-review-replay`. **45 windows / 10,044 samples**, plus the pin replay: 27 baseline windows,
six corrected phalanx windows and twelve native-loop windows. All 33 controlled windows match
authority/pose fingerprints and repeated detailed counts. All identify the current source hash above.

The earlier `cpu0-baseline-final` / `cpu0-workloads-{a,b}-final` checkpoint contained 141 windows /
42,948 samples at recipe 1, hash `1d66e60d9c9940dcf99ab1eb824711c8d796cdef77c9fab56581530ceaa9d06a`.
Its six phalanx windows were degenerate and are **not accepted coverage**. The 96 controlled windows
for the other sixteen unchanged workloads are reused with that historical source attribution;
this is not a new single-source full-matrix run. Core baseline, phalanx and native windows were refreshed.
Chromium/SwiftShader, Ryzen 5 2600X, 800×450; core cases use Low quality and no scene draw.

Pooled **coarse** milliseconds across three repetitions:

| Case | Combined mean | p50 | p95 | max | Combat mean | Animation mean |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Entrance | 13.04 | 12.20 | 18.40 | 50.60 | 8.07 | 3.34 |
| Stable | 15.28 | 14.70 | 20.20 | 42.30 | 9.69 | 3.37 |
| Late hitch window | 17.13 | 14.80 | 20.00 | 249.50 | 11.23 | 3.39 |

Individual coarse run means span **11.82–14.03**, **14.59–15.81**, and **16.97–17.29ms** respectively.
Host load and diagnostic overhead are material. Do not infer a regression or speedup by subtracting
the older `3cfb378` timings from these results.

- Door accessor reads/tick: **3,569 entrance / 5,303 stable / 7,849 late window**. Repeated counts are
  exact. Each entrance run has **3,301 exact-zero / 5,233 total** adapter calls; stable has
  **2,231 / 4,589**. No tiny-nonzero calls were observed in these windows. This identifies an exact
  zero fast-path opportunity, not permission to skip small movement or whole actor updates.
- Collision-scope mesh checks average approximately **51,938 / 45,546 / 45,298 per tick**. These
  counters describe filter work; they are not triangle-test counts.
- The pinned failed replan is **`kobold:treasury:3`**, request **47**, frame-entry step **476**,
  from `(-19.0113935, 0.0056548)` to `(-19.0384212, -2.6751948)`, `steer-replan`, openDoors true,
  partial false. It expands **3,207 nodes / 12,828 neighbor probes**, with **18,728 segment samples**.
  Coarse request times are **197.2–216.6ms**; the most expensive detailed capture is **275.4ms**,
  including tracing overhead. Exact-input/result replay passes; no route is published.
- Reused recipe-1 physical windows (unchanged recipes) separate active and frozen costs. Active-owner means are
  approximately **1.00–1.06ms** for the goblin and **0.9ms** for the skeleton; their full-frame costs
  also include inactive rig overhead. The all-24 burst peaks at **312 bodies / 208 constraints /
  2,972 local statics** and ends with zero active physics. Active-owner mean is **13.19–14.27ms**,
  p95 **31.60–33.70ms**; whole 500-frame means **15.71–16.78ms** include frozen updates.
- A settled skeleton still receives **180 physical binding applications and 3,960 corpse-mesh
  visits over 180 ticks**, but allocates **zero new corpse boxes**: its existing inverse/box cache
  is already effective. This distinguishes repeated publication/list traversal from cache misses.
- Native software windows show real catch-up and wide Low/High timing spread. They do not establish
  hardware FPS or a portable quality-level speedup. Three lifecycle regenerations retain **25
  actors / 5,719 entities / 2,382 meshes / 495 nodes / 28 materials / four textures**.

**Desktop hardware baseline (2026-11-22):** Ryzen 5 2600X, GeForce RTX 2070, Chromium 159,
800×450, `MOURNING-731`, 25 living actors. All 12 recipe-2 live windows completed (Low/High,
off/coarse, three repeats), using the same source hash as the corrective baseline. Across 216
off-mode frames per quality, Low mean/p95 frame intervals were **40.9/66.2 ms** (~24.5 FPS);
High **46.6/67.3 ms** (~21.5 FPS). FPS here is the reciprocal of the pooled mean interval.
The coarse runs averaged **28.6/31.2 ms** of simulation ticks per rendered frame (including
catch-up) and **9.3/12.0 ms** in scene rendering (Low/High). Compare future hardware runs on this
host using a fresh `CPU_LABEL`; the original local summary is `test-results/cpu0-hardware-summary.json`.

**Acceptance budgets for subsequent slices:** retain correctness/operation bounds as CI gates;
wall times are reference-host diagnostics. CPU1 must eliminate distant-door reads in local tests
and beat repeat spread in whole-tick measurements. CPU2 targets zero sweeps for genuinely stationary
eligible actors, preserving the nonzero path. CPU3 retains the proposed **≤4ms synchronous request**
target or a fully budgeted deterministic alternative, against the pinned request above. Across the
CPU pass, the 30% median combined-cost target corresponds to approximately **8.54ms entrance /
10.29ms stable** on this coarse reference; remeasure the paired baseline when integrating.
Existing physics ceilings stay fixed. Cold admission, active physics, frozen publication and full
rendered callbacks must each be reported separately and show no unexplained p95/max regression;
a faster frozen tail cannot hide slower active work. Hardware 60 FPS acceptance stays with CPU7
and the desktop baseline is below that target.

## Verification status

The pre-review full gate passed **400 tests**. After corrections, `npm run check` passes **382**,
typing/lint/format (**211 files**), and the CPU lifecycle plus new review regressions pass. Refreshed
core/phalanx/native profiles and recipe-2 replay, both production builds, both bundle-isolation
checks and root/Pages smokes pass. The broad full-suite evidence is reused, not claimed freshly rerun.
Ordinary movement (16), combat (15) and physical-contact (24) browser regressions also pass.
Representative entrance, stable, bones, burst and controlled-render captures were inspected.
Initial missing-module red and fixture corrections are recorded in [VERIFICATION.md](../VERIFICATION.md).
Initial independent review returned **NOT READY**: native callback restoration could execute a
callback twice, partial observer setup could leak a registration, and the original phalanx fixture
never attacked. Persisted regressions failed before fixes. Deferred restoration and immediate
rollback registration now pass both application-loop positions, throwing/cancelling callbacks and
fault injection. The corrected six-window phalanx evidence records real movement, all five phases,
a resolved `LONG_THRUST`, one impact and hero health **100 → 88**; its captures were inspected.
Independent follow-up returned **READY**, clearing all three findings with fresh three-callback,
exception/cancellation, observer rollback and real phalanx probes, plus report/source/replay audit.
Its direct phalanx oracle observes the thrust at frame134, impact count1 and HP88. Broad gates and
unaffected earlier measurements are reused with attribution in VERIFICATION.md. **CPU1 is next.**
