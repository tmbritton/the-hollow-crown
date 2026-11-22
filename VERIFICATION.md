# Verification — The Hollow Crown

## Result

The playable exploration/combat demo uses a **typed ECS, XState 5.33.4, and strict TypeScript**, verified in Chromium and Firefox. Application code, all test scripts, and Vite configuration pass type checking. The production build also passes a separate smoke test. The state-machine/social update adds independent species charts, generated model-based coverage, and visible card games, hacky sack, and smoke breaks.

### CPU2 — exact-zero movement (independent review READY)

Stationary motor test failed with 90 redundant sweeps, then passed with zero and retained a tiny
nonzero sweep. Check/build and Chromium movement (16), jump (8), defense (9) passed. Entrance,
stable and late workloads eliminated 3,301/2,231/2,898 zero sweeps per repeat; all moving sweeps
and all 260 integrated checkpoints matched CPU0 and CPU1. The reviewer separately applied CPU2
alone to CPU0: 160 matching checkpoints and improved fixed-step times. Independent lifecycle
checks included lethal landing, stationary stair death, shield recoil, proxy sync and door travel.

### CPU1 — local door and blocker queries (independent review READY)

Remote-door regressions initially observed 606 living and four active-physics getter reads;
both now observe zero. Full 402 tests, type/lint/format, build, Chromium movement (16), combat
(15) and structural contacts (24) passed. The independent reviewer also ran the root production
smoke, 22,176 old/new queries, animation threshold and off-root separated-piece probes. All 428
controlled checkpoints matched across 16 windows (`CPU_CASES=entrance,stable,hitch,burst`,
coarse/detailed, two repeats, `CPU_LABEL=cpu1-accepted`). Coarse entrance/stable/late mean tick
times (ms) went from 12.62/14.86/16.71 to 8.92/11.23/10.62; detailed door reads per tick fell
from 3,569/5,303/7,849 to 20/20/21. The pinned request still takes 54–57 ms. These are software
fixed-step diagnostics. Locality is computed per query; no persistent door-state cache was needed.

### CPU0 — profiling tooling and refreshed baseline — 2026-11-21/22 (independent follow-up READY)

The requested planning update was committed as **`013079c`** with normal hooks (**377 tests**,
lint/format). CPU0 follows in a separate commit. It provides bounded DEV-only
timing/count sessions, source/recipe/environment fingerprints, controlled parity comparisons,
original-render-loop capture and exact slow-request replay. See [the baseline contract](docs/cpu-baseline.md)
for APIs, measurement semantics, scope qualifications and subsequent budgets.

**TDD and iteration:** `cpu0-initial-red.log` records the native test failing on the absent
`cpuMetrics.ts` module. Five pure tests now cover finite/empty distributions, storage bounds,
detached reports, exception-safe exact method restoration, route-phase/top-eight/pinned retention,
muted diagnostic reads and renderer evidence classification. Authored fixture validation caught
NPC jump cancellation and a latched shield press; the landing case now uses the real hero motor/
respawn, airborne enemy entry is separate, and the shield explicitly releases before pressing.
These were fixture corrections, not gameplay fixes. Final measurements install hooks before warmup;
earlier `smoke`, `matrix-*` and unsuffixed baseline/workload artifacts are iteration checkpoints.

**Pre-review measured checkpoint:** `013079c` plus SHA-256
`1d66e60d9c9940dcf99ab1eb824711c8d796cdef77c9fab56581530ceaa9d06a` over runtime/tooling source and
build/dependency configuration. Reports include the dirty working-tree identity and exact UTC
timestamps. The measurement files are `cpu0-baseline-final{,-summary,-hitch}.json`,
`cpu0-workloads-{a,b}-final{,-summary}.json`, and `cpu0-replay.json` under ignored `test-results/`.

- **141 windows / 42,948 samples / 22 cases**. Entrance/stable/hitch each have three repetitions
  of off/coarse/detailed modes; the other nineteen cases have two. All **129 controlled windows**
  match gameplay and final/previous-pose fingerprints at checkpoints; detailed work counts repeat
  exactly. Low/High controlled cadence also matches state. Twelve native-loop windows record actual
  catch-up/timing; their wall-clock-dependent outcomes are explicitly not a parity comparison.
- Coarse pooled combined tick/presentation mean/p50/p95/max (ms): entrance **13.22/12.80/18.00/40.50**;
  stable **16.01/15.10/23.00/42.50**; late window **17.02/14.40/21.00/245.70**. Children are inclusive,
  not additive. Host-load variation and trace overhead are recorded; these are software development
  measurements, not hardware FPS or an optimization improvement over the old investigation.
- Door reads/tick are **3,569 / 5,303 / 7,849**. Per entrance run, **3,301 of 5,233** adapter calls
  request exactly zero displacement; stable **2,231 of 4,589**. No tiny-nonzero calls occur in these
  windows. Collision-scope mesh checks average **51,938 / 45,546 / 45,298** per tick.
- The pinned failed `kobold:treasury:3` replan is request **47**, frame-entry step **476** (actual
  request during the following tick), from **(−19.0113935, 0.0056548)** toward
  **(−19.0384212, −2.6751948)**. It visits/expands **3,207 nodes**, probes **12,828 neighbors** and
  samples **18,728** segment points. Coarse request cost **196.6–211.6ms**; detailed capture
  **257.4ms**, primarily search. `CPU_REPLAY` reran the seeded recipe and passed exact input/result
  fingerprints, including door/occupancy state; no route is published for the failed request.
- Accepted melee/bolt/javelin/hazard, airborne/stair entries, shield batches and cargo handoffs are
  covered. The natural all-24 burst peaks at **312 bodies / 208 constraints / 2,972 statics** and
  retires to zero active physics. Active-owner mean **13.19–14.27ms**, p95 **31.60–33.70ms** is
  separated from the frozen portion. Authored single-death fixtures retain inactive rigs and are
  labelled accordingly. A settled skeleton receives 180 physical binding writes / 3,960 mesh visits
  in 180 ticks, with **zero newly allocated corpse boxes**.
- `npm run check:full`: **400 tests / 309.71s**, typing/lint/format pass. Final `npm test`:
  **382 / 32.03s**, including typing. No new production machine or changed transition partitions.
- `test:cpu` passes bounded/nested sessions, zero-time and throwing-event restoration, original
  getters/methods, scene retirement, native-loop tick accounting/cancellation and actual pause
  (three requested ticks, zero executed). Three instrumented regeneration cycles plateau at
  **25 actors / 5,719 entities / 2,382 meshes / 495 nodes / 28 materials / four textures**.
- Ordinary Chromium movement **16**, combat **15** and physical structural contacts **24** pass
  sequentially with profiling inactive. Final formatting (**210 files**), lint and diff checks pass.
- Root and Pages builds pass (**710 transformed modules**, CPU diagnostics tree-shaken). Explicit
  bundle checks pass on **82 JavaScript chunks** for each base. Root/Pages production browser smokes
  pass with local assets, input/regeneration/quality and no debug global or browser/network errors.
  Pages main **1,794.62kB / 466.44kB gzip**; existing chunk-size warning retained. CI is configured
  to run the same isolation check before both production smokes; no uncommitted CI run is claimed.
- Representative final entrance/stable, bones, burst and controlled-render captures were inspected.
  Diagnostics add no artwork or visible panel. A bounded headed hardware attempt timed out at
  **15 seconds** before measurement; **hardware timing remains pending**. Headless verification used
  `DISPLAY= WAYLAND_DISPLAY=` with SwiftShader, without system configuration changes.

The source guards are observational; CPU1–CPU7 optimizations have not started. The checkpoint above
is retained for its actual source/recipe, with the phalanx coverage qualification below.

**Initial independent review: NOT READY (R1–R3).** The attributed report is
`test-results/cpu0-independent-review.md`, with separate probe/follow-up artifacts. The reviewer
confirmed the retained report counts, controlled observations, operation counts and deep-equal
replay inputs/output, audited 7,895 descriptors on rollback paths, and reused the broad gates.
It found:

1. Restoring two callbacks inside Babylon's live-array iteration repeats the second callback. With
   the application callback second, three samples reported **5 ticks while gameplay advanced 9**.
2. The phalanx recipe removed its members' brains, disabling their motors. It aborted opening on
   frame0, stayed in assembly, never moved/swung and nevertheless passed validation.
3. Throwing during the second active-mesh observer registration leaked the first registration,
   even though the failed session became inactive.

**Persisted red and correction:** `cpu0-review-red.log` / `cpu0-review-red.json` reproduce all three
before production/fixture fixes. `test:cpu:regressions` now verifies both positions of the real
application callback, exact invocation/tick counts, completion, callback throw, in-frame and immediate
cancellation, partial observer failure and session restart. Restoration is deferred to a microtask
after the current engine iteration; its promise settles afterwards. Cancellation stops remaining
callbacks, and rollback is registered immediately after each observer acquisition.

The new **recipe 2** phalanx uses a real unobstructed rectangle, retains participant brains/motors,
recovers a small physical rank offset and validates actual opening → thrust/impact → recovery.
All six corrected mode/repetition cells show movement, `LONG_THRUST`, one impact and health
**100 → 88**, with identical observations/counts. Opening/attack/recovery captures were inspected.
The six original phalanx windows are **not accepted behavioral coverage**.

**Corrective evidence actually run:**

- Source SHA-256 **`e8b4bc7a5adc9fcb2e00444fec19a0b527caa59a370f7da348b1edf5076d1307`**, still based
  on `013079c` plus uncommitted implementation. `cpu0-review-baseline{,-summary,-hitch}.json`,
  `cpu0-review{,-summary}.json` and `cpu0-review-replay.json` record current recipes/source.
- **45 windows / 10,044 samples**, plus exact pin replay: 27 refreshed baseline windows, six
  corrected phalanx and twelve native windows. All 33 controlled cells match observations and
  repeatable detailed counts. Reuse 96 earlier controlled windows for the sixteen unchanged
  workloads with their old-source attribution; this is not a freshly repeated whole matrix.
- Updated coarse combined mean/p50/p95/max: entrance **13.04/12.20/18.40/50.60**, stable
  **15.28/14.70/20.20/42.30**, late window **17.13/14.80/20.00/249.50** ms. The same treasury
  request47/step476 reproduces **3,207 nodes**; coarse **197.2–216.6ms**, detailed max **275.4ms**.
  Recipe-2 replay again matches its exact inputs/result. Hardware evidence remains pending.
- `npm run check`: **382 / 31.41s**, typing, lint and format **211 files**. CPU lifecycle and
  new regression suites pass with zero page errors. Both root/Pages builds, 82-chunk isolation
  checks and production browser smokes pass again (`cpu0-review-*` logs). Earlier full400,
  movement16/combat15/contacts24 evidence is explicitly reused.

**Independent follow-up: READY; R1–R3 resolved, no current-scope blockers.** Attributed evidence is
in `test-results/cpu0-independent-followup-review.md` and `cpu0-independent-recheck.{mjs,json}`;
the original NOT READY report is preserved unchanged.

- Fresh three-callback native probes place the application first/middle/last. Every callback runs
  exactly three times; reported/actual ticks match **9/9**, **7/7**, **7/7**. Throws and cancellation
  at each position produce only the expected invocation prefix. Pending-restoration admission,
  restoration-error rejection, repeated stop and regeneration cleanup also pass.
- A fresh detailed phalanx run retains all four original brains, moves every member, and observes
  engagement at frame3, opening78, attack114, actual thrust/health loss134 and recovery165.
  `LONG_THRUST`, impact count1, health100→88. Validation rejects an unexercised fixture and passes
  twice after completion without changing observed gameplay or metric data. Three corrected
  captures were independently inspected.
- Fault injection at either active-mesh registration in coarse and detailed modes preserves
  observer counts exactly, restores method/getter identities, clears trace globals and permits
  restart: **zero leaks across all four cases**. Independent page errors are empty.
- The reviewer recomputes the current source hash, audits all **45 windows / 10,044 samples** and
  controlled comparison/count objects, and deep-compares current replay inputs/results. Old
  recipe-1 pins remain rejected even with source-change override. Fresh Pages isolation passes
  across **82 chunks**. Corrective parent gates/builds/smokes and earlier unaffected evidence are
  explicitly reused, not relabeled as independently rerun.

After review, the desktop hardware run completed all 12 live windows on an RTX 2070. Low/High
mean frame intervals were **40.9/46.6 ms** with instrumentation off; p95 was **66.2/67.3 ms**.
See the [hardware baseline](docs/cpu-baseline.md) for scope and reproduction. CPU1 is next.

### P9 — skeleton breakup — 2026-11-21 (independent review READY)

Baseline **`14f441c`** was clean and pushed. Skeletons now release eleven anatomical body groups
from P8's exact final-pose handoff. A separate seeded scatter stream adds bounded variation without
changing the common blow or hazard semantics. Existing geometry, skull details, held blade and
single death identity remain owned by the original entity. The pelvis mesh is bound to its semantic
pelvis. Per-chunk terrain patches cover separated pieces; dynamic envelopes and eligible actual
chunk surfaces support occlusion and once-only discovery. See [the P9 contract](docs/skeleton-breakup.md).

**TDD/iteration:** `test-results/p9-initial-red.log` records **14 pass / three fail** before
implementation: absent separated mode, missing distant-chunk envelope, and an off-root chunk
incorrectly rejected as an occluder. All pass after implementation. The stair browser initially
reported 0.218 units below a tread top at a vertical-side contact, but the corner entered that
tread by only 1.57e−7 horizontally. Its oracle now measures solid-box penetration along the
shallowest axis, retaining the 0.015 contact threshold. This was a measurement correction, not a
claimed physics repair. A discovery fixture initially used safe teleport to a void coordinate,
which returned the hero to the entrance and witnessed the kill; it now explicitly places the
fixture's hero out of range before the accepted death.

**Checks actually run:**

- Focused native physics/binding/observation: **25 passed**. New contracts cover exact entry,
  zero-time pause, eleven chunks/no constraints, bounded reproducible variation, hazard inheritance,
  detached skull travel beyond the old terrain patch, bounded terrain union, frozen stability and
  release. Observation tests cover remote occlusion and same-surface player eligibility.
- `npm run check:full`: **395 tests / 351.55s**, typing, lint and format pass. This includes the
  extended generation/model/cargo checks, not a reused prior full run. Final `npm run check`:
  **377 / 31.17s**, typing/lint/format **202 files** pass. No production machines were added.
- `test:skeleton:breakup`: **seven sequences** (travel, melee, moving melee, jump, descending stairs,
  wall, hazard), **448 captures** and actual geometry checks on every simulated frame. Max entry
  matrix difference **3.82e−6**, skull-detail relative-distance drift **2.93e−6**, envelope excess
  **zero**, worst final tread penetration **2.60e−5**. All expose eleven anatomical sample meshes,
  settle, remain frozen, reset, release active resources and allocate **zero additional meshes**.
  A real generated named skeleton dies unseen; exposing only its skull yields exactly one
  `remains-found` event, with no name/killer disclosure or rewritten witnessed death.
- `test:ragdoll:contacts`: **24 cases**, both door axes, skeleton/shield profiles, wall/corner and
  multiple death keys. All initial overlap zero; worst transient upper-door overlap **0.007504**,
  worst final masonry overlap **0.0000332**, below the unchanged 0.015 threshold.
- `test:ragdoll`: **eleven shared death sequences**, actual timed melee and released bolt/javelin,
  all-24 death stress and terminal cleanup pass. The population uses **312 bodies / 208 constraints**,
  zero extra meshes and zero active physical resources after settling. The lifecycle subject is now
  a skeleton: menu/inspection/hidden pause, visible-blur continuation, same-tick hero respawn and
  in-flight regeneration pass. Three regenerations plateau at **2,382 meshes / 495 nodes / 28
  materials / four textures / 5,719 entities / 25 actors**.
- Sequential Chromium combat **15**, discoveries **17**, and animation suites pass, including
  actual passable-corpse walk/run crossings, render-only foot contact, 52% water speed, real click
  attacks and knowledge/occlusion/reset contracts. No browser errors were reported.
- Root and Pages builds and both production smokes pass, with local bundled assets, real controls,
  quality/regeneration and no debug hooks or external/network/page errors. **709 modules**; Pages
  main **1,794.62kB / 466.44kB gzip**. The existing chunk-size warning remains.

**Cost/visual qualifications:** the all-24/500-update sample measures **13.64ms mean / 30.60ms p95**,
including all actor presentation and the frozen tail of the workload. This is a bounded software-
rendered stress fixture, not hardware FPS or the A0 living-animation benchmark. Per-piece patches
are bounded unions (at most eleven 5×5 floor patches); they do not fill an unbounded scatter rectangle.
Three substeps, sixteen solver iterations, 24 islands and eight-second lifetime remain fixed.
The 14-track sampled viewer was exercised at normal and quarter speed; representative launch,
wall, stair, airborne and settled captures were inspected. Sampling is not an every-frame perceptual
review. The main style limitation is coarse ribcage/hand-bound equipment, with possible bone overlap
in crowded piles under the inherited world-only collision policy. Chunks never push actors or add
gameplay interactions. No current-scope visual blocker was found in the parent's inspected captures.

Verification used `DISPLAY= WAYLAND_DISPLAY=` with headless SwiftShader. One cold navigation timeout
was resolved using the existing commit/readiness pattern; a combined three-suite shell deadline
interrupted the first shared-ragdoll run. Its independent rerun passed in full. No system settings
were changed. Logs and P9 captures are `test-results/p9-*`; the shared suites retain their existing
`p8-*` report filenames, now reflecting the P9 run.

**Independent review: READY, no current-scope blockers.** The reviewer inspected the diff/contract
and reused the completed broad gates, browser suites, resource and production evidence. Fresh
independent probes and twelve inspected captures are recorded in `test-results/p9-independent-review.md`
and `p9-independent-probe.{mjs,json}`. Attributed results:

- Six entry cases (travel, moving melee, airborne, both stair directions and distant skull), each
  with 500 advancing and 30 frozen updates. Full actual-mesh relative transforms and an independent
  OBB/solid-tread SAT oracle: entry error at most **9.54e−7**, anatomical group drift **5.36e−6**,
  envelope excess **zero**, final solid overlap **1.133e−5**. Eleven chunks/samples, zero constraints,
  zero new meshes and zero remaining active resources in every case.
- A deliberately injected **24 units/s skull velocity** tests support beyond ordinary scatter:
  the rendered skull reaches **15.049 units** from the root and settles. The actual distant skull
  occludes a probe target that the old 4.8-radius rejection misses; hiding it reveals the target.
- On generated **P9-NAMED-0**, camera visibility with player distance **17.310** grants no event;
  nearby player-side cover still grants none. Removing cover grants exactly one unidentified
  `remains-found` event. Original entity ownership, reset/sample cleanup, consumed-handoff replay
  rejection, fresh death after cleanup and regeneration pass. **Zero page errors**.
- Qualification: existing entry poses can already overlap treads (melee blade **0.15263**,
  ascending foot **0.09401**, descending blade **0.12094**). Brief impact overlap also occurs
  (**0.02286** travel pelvis / **0.02987** airborne foot; stress blade **0.07638** immediately after
  entry), resolving to the final bound above. Neither parent nor reviewer claims all-frame <0.015
  clearance. Coarse/overlapping piles and the unsupported pre-cleanup resurrection ordering remain
  documented nonblockers. The recorded sampled playback and stress timing retain their qualifications.

No production changes followed the READY verdict; subsequent documentation records review
attribution and the user's decision to run CPU0–CPU7 next, ahead of EF0–EF4. The CPU investigation's
historical timings are not post-P9 optimization results; CPU0 will establish that fresh baseline.

### P8 — directional, seed-varied ragdoll deaths — 2026-11-21 (final review READY)

`cannon-es` **0.20.0** consumes the detached A7 handoff once, using 11 anatomical bodies or 15 with
a tail. Rig bindings publish exact physical world matrices and retain equipment identity; living
layers cannot overwrite them. Discrete tile/tread contacts, structural walls, shared door collision
state and existing furniture proxy heights drive impacts. Seeded strength/lift/deflection/spin vary
deaths while retaining attack direction and reproducibility. Settled remains are relocated and
passable; hero respawn timing and cargo/discovery ownership remain authoritative.
See [the P8 contract](docs/ragdoll-deaths.md).

**Observed TDD/iteration evidence:** the new tests first failed on the absent `ragdoll.ts` module.
Further regressions failed for scaled-parent shear, settled corpse sampling reconstructing frozen
physics transforms, the undersized door aperture, and a **0.0611-unit waist separation** from using
the chest center as its physical pivot. Each now passes after its correction. Browser resurrection
also exposed frozen living bindings; ownership cleanup now resets them. Failures were observed in
tool output; no saved raw-red log is claimed. Historical tests that required a fixed collapse angle
or moved only a dead actor's old logical coordinate now exercise physical settling/relocated remains,
with unchanged movement, discovery and living rank-heading assertions.

**Checks actually run:**

- Full checkpoint `npm run check:full`: **389 tests / 322.28s**, lint and format pass. After the
  render/contact/waist and lifecycle corrections, `npm run check`: **373 tests / 32.25s**, strict
  typing, lint and formatting pass. The earlier extended generation/model evidence is reused;
  this is not a claim of a fresh 391-test full run. Seven new pure tests and expanded actual-binding
  tests cover reproducible/diverse outcomes, inherited motion, zero-time stability, discrete stairs,
  doors, constrained waist, bounded lifetime and disposal. Production machine coverage is unchanged.
- `test:ragdoll`: **eleven sequences** covering moving goblin, skeleton melee, spear thrust/throw,
  shield recoil, cargo, work, jump, turning, actual perimeter impact and stair fall. Entry snapshot
  error and repeat drift are **zero**. Worst final drawn-box floor penetration **0.00305 units**
  (ragdoll tolerance 0.015); worst recorded joint-anchor error **0.03471 units**. Every case settles,
  exposes actual corpse surfaces, stays frozen, and releases all active bodies/constraints/statics.
- Actual timed melee, released crossbow and released javelin all kill through ordinary combat and
  install physics. A simultaneous **24-enemy** death burst uses **312 bodies / 288 constraints**,
  allocates **zero extra meshes**, and ends with **zero active physical resources**.
- The dedicated lifecycle check passes menu/inspection/hidden pause, continued enemy physics on
  visible blur, same-tick hero respawn, in-flight regeneration and disposal. Three fresh regenerations
  plateau at **2,382 meshes / 495 nodes / 28 materials / four textures / 5,719 entities / 25 actors**.
- Sequential Chromium animation, combat **15**, discoveries **17**, defense **9**, phalanx **8**,
  tribute **9**, handoff **84 entries** and lethal-landing/support suites pass. Combat includes actual
  walk/run crossings of settled physical bodies with flat-ground travel parity and 52% water speed;
  tribute includes real carrier death/drop/recovery and survivor takeover.
- Root and Pages builds pass (**709 modules**, root main **1,792.77kB / 465.81kB gzip**, existing
  chunk-size warning). Both production smokes pass, with locally bundled assets, real input,
  regeneration, no development hooks and no external/network/page errors.

**Bounded cost:** three 1/180s substeps per gameplay tick, sixteen solver iterations, 24 active
islands, streamed 9×9 floor patches and an eight-second hard lifetime. The final 24-death/500-update
stress sample measured **15.47ms mean / 26.70ms p95**, including shared actor presentation; its tail
contains frozen updates. This intentionally extreme burst is not the A0 living-actor fixture or a
hardware FPS benchmark. Ordinary single-death fixtures measured approximately **2.65–3.43ms** mean
for all actor presentation. Frozen islands release Cannon contact/friction pools as well as bodies.

**Visual evidence:** saved **704 captures** (eleven cases, gameplay/side cameras, 10Hz samples through
three seconds plus final settled views). The 22-sequence viewer was played at normal and quarter
speed; representative launch/contact/settled views were inspected, including walls, stairs, guard,
airborne death and the long spear. `test-results/p8-motion.html` and `p8-motion-playback.json` preserve
the sampled playback. Sampling is not an every-frame perceptual review. The most conspicuous remaining
style limit is stiff held/stowed equipment: long weapons retain their captured hand relationship
while the constrained limbs tumble. No new art assets or breakup pieces are introduced.

Headless Chromium initially stalled while creating a WebGL context with inherited desktop display
variables; the same failure occurred in a minimal independent context probe. Verification ran with
`DISPLAY= WAYLAND_DISPLAY=` and SwiftShader, without changing application or system configuration.
Ignored evidence is under `test-results/p8-*`. The containing delivery records reviewed P8.

**Initial independent review: NOT READY (R1/R2).** The reviewer reproduced **0.10859 units** of
airborne foot penetration through an actual closed door's upper plank: physics used height 2.5
while artwork/collision use 2.8. It also found settled skeleton/spear penetration of **0.05612 /
0.05934 units** into the drawn wall base, whose authored overhangs were missing from physics.
Independent evidence additionally covered 48 action-phase entries, shape containment, 320 seeded
direction samples, stair/scale cases and lifecycle paths. Its **28 natural-scale entry controls**
passed. All findings and attributed/reused evidence are in ignored `p8-independent-review.md`.

**Corrections:** shared `DOOR_HEIGHT` now drives visible planks, ordinary collider and death physics;
streamed masonry includes `WALL_BASE` sections and `WALL_CAP`. New persisted actual-mesh tests
reproduced the door's **0.10859**, a settled wall-body **0.04948**, spear **0.06004** and corner
**0.02500** penetration before fixes. Corrective logs retain the door red and the pure door/replay
reds as `p8-review-contacts-red.log` / `p8-review-pure-red.log`. Run disposal is now terminal, resets
frozen bindings and clears handoffs; a weak consumed-identity set prevents removal/resubmission
from launching the same death again.

- Corrective `test:ragdoll:contacts`: **24 cases**, both door axes, two profiles, multiple death keys,
  straight walls and corners. All start clear; worst transient door overlap **0.00659 units**,
  final plank/base/corner overlap **zero**. Dedicated ragdoll/lifecycle/stress suite passes again;
  final stress **15.76ms mean / 27.40ms p95**, same qualification as above. Updated wall captures
  inspected and the regenerated 22-sequence viewer played at both rates.
- `npm run check`: **373 / 31.27s**, typing/lint/format **200 files**. Both corrective builds and
  production paths pass: **709 modules**, root **1,793.35kB / 465.98kB gzip**, Pages **1,793.36kB /
  465.99kB gzip**. Earlier broad gameplay and extended evidence is reused.
- Reviewer nonblockers are recorded rather than overstated: manually imposing nonuniform root
  scale *after* the living solve can expose an existing equipment TRS/affine mismatch at handoff;
  normal coordinated scale controls passed. One extra stair case inherited overlap already present
  in its entry pose and resolved before settling. Neither is an all-frame clearance guarantee.

**Final independent follow-up: READY; no current-scope blockers remain.** Attributed evidence in
`test-results/p8-independent-followup-review.md`:

- Original first-death door repro improves from **0.10859 to zero overlap**. The independent
  eighteen-case upper-door sweep peaks at **0.00884**, under the unchanged 0.015 tolerance.
- All sixteen original wall deaths settle clear. Four additional straight/corner probes check
  actual body corners against individual base/trim/cap sections on all 500 updates: max transient
  overlap **0.00276**, final overlap **zero**, all resources retired. Cutaway scaling leaves physical
  terrain identical. Corrected representative close overhead captures were independently inspected.
- Component removal, corpse removal, binding reset and teleport clear old resources/handoffs and
  frozen nodes. Same-object handoff replay is rejected; fresh deaths after cleanup are admitted.
  Repeated direct disposal is terminal, including subsequent updates and scene disposal; zero page errors.
- One new **nonblocking** low-level edge (C4) is retained for future enemy resurrection: resetting an
  already admitted corpse, reviving it and killing it again *before cleanup* can discard its new
  handoff. The game does not resurrect enemies; same-tick hero respawn precedes physics admission
  and is unaffected. Preserve a distinct fresh handoff before adding such a resurrection path.

The reviewer reused the corrective gates/builds/production, broader gameplay/model evidence and
sampled playback with their stated qualifications. Original NOT READY and corrective reports are
both preserved. **P8 is independently cleared for this delivery; P9 remains separate.**

### A7 — semantic rig cutover and death handoff — 2026-11-21 (final review READY)

Removed the numerical legacy adapter, mesh capture/commit, legacy Euler hints and render-component
blend aliases. The old leg algorithm is retained only under `tests/historical-foot-placement.ts`.
Final bindings publish fixed-step world history including constrained tails. On-demand immutable
snapshots contain joint/body linear/angular velocities, stable proxy dimensions and death rebasing.
Accepted lethal damage captures pre-stop motion and incoming travel before cancellation. Current
collapse, corpse passability and hero respawn remain unchanged. See [contract](docs/rig-handoff.md).

**Observed TDD/iteration evidence:** the handoff tests failed on the missing history module; the
disposal regression failed because a retired binding still exposed snapshots. Both now pass.
Adapter removal exposed test fixtures that wrote render heading and assertions tied to one Euler
branch. Fixtures now set semantic presentation heading; the same strict wind-up/blend thresholds
measure the actual forward-axis pitch, preserving equivalent orientations. No raw initial red log
is claimed; failures were observed in tool output.

**Checks actually run:**

- `npm run check:full`: **383 pass / 303.05s** before review; corrective `npm run check`:
  **366 / 29.61s**, typing, lint and formatting **195 files**. Seven new pure tests plus expanded binding retirement cover
  once-only lethal metadata, false-hit rejection, quaternion wrapping/scale, rebasing, detached
  immutable data and zero-time/reset derivatives. Models remain **22 machines / 105 states / 226 branches**.
- `test:rig:handoff`: **84 lethal entry points / 28 living catalog rows**, actual drawn hand/foot/
  tail origins and finite-difference velocities, exact repeats, root rebasing, once-only motor
  inheritance, immutable capture after collapse and reset retirement. Every case stays below
  **1e−5** pose / **0.001 units/s** velocity error; rebase/inheritance below **1e−8**.
- `test:rig`: **428 samples / all 30 clips**, exact A0 gameplay/clock parity, max joint error
  **5.6441e−6**, required grip **2.5742e−6**, sole penetration **2.5531e−7**, plant drift **4.3157e−6**.
  Material/mesh/selection identity and the three-regeneration resource plateau pass.
- Sequential affected Chromium suites: animation, rig-actions (including 2,714 collapse-age cases),
  shield transitions, tails4488, all-member tail clearance/stability, movement16, jump8, combat15,
  defense9, phalanx8, social15, objective-work17 and tribute9 all pass.
- Corrective root and Pages builds: **706 modules**, main **1,696.12kB / 437.45kB gzip** and **1,696.14kB /
  437.46kB gzip** respectively; existing chunk warning. Both production smokes pass five checks,
  including path-local assets, real controls, regeneration and no debug hooks/external requests/errors.
- Fresh review controls and **13 clips / 26 camera sequences / 380 samples** pass camera replay.
  Both views were played at normal then quarter speed; five temporal sheets inspected, covering
  locomotion/stairs/jump, moving strike, guard/interruption, crouch/death, throw/opening, hacky-sack
  and cargo. This is 60Hz simulation sampled at 10Hz, not every-frame perceptual review.

**Cost and lifecycle:** final 25-actor/four-corpse CPU fixture **3.1175ms mean / 4.10ms p95**; max/mean
tile reads **899 / 553.72**. Sampled allocation **333,945,668 bytes** includes setup/warmup/yields,
instrumentation and collected objects at 32KiB sampling; not retained heap or exact allocation count.
Resources plateau at **2,382 meshes / 495 nodes / 28 materials / four textures / 5,719 entities /
25 actors**. One fixed world buffer per rig; velocity/body extraction allocates only on explicit
snapshot requests/death. Existing solver/contact/tail operation ceilings remain. CPU measurements
are Chromium/SwiftShader observations, not hardware FPS or a causal speedup claim.

**Visual limits:** existing necessary immediate guard restoration and discrete equipment stowing
remain the sharpest transitions; temporary collapse is still the pre-P8 motion. No new visible
regression was identified in the inspected captures. **Final independent review READY.**
Logs/captures are ignored under `test-results/a7-*`, with `rig-handoff-report.json` and `rig-report.json`.

**Initial independent review: NOT READY (B1).** Reviewer math probes passed **144 snapshots / 3,024
joints / 1,728 bodies** including scale/shear, rebasing, angular and body-center velocities. Real
turning/airborne melee and both projectile lethal paths, resets and retirement of all 25 bindings
passed. However, a stationary jump's first grounded death inherited **−6.1 units/s** from stale root
elevation history (or **−2.5333** after publishing the landing pose). Timed melee and actual main-tick
lava/respawn independently reproduced it. This was handoff metadata, not collapse-motion regression.

The persistent `test:rig:handoff:landing` red reproduced **−6.1** (`a7-review-landing-red.log`). Grounded
capture now uses a separate current motor support derivative; airborne capture still uses ballistic
velocity. Real melee kills on landing frame41 now yield **zero** inherited/root Y before and after
publication; full-tick lava yields zero and normal respawn retires the event. Actual uphill/downhill
controls retain **+0.2086823 / −0.2086823 units/s**. A pure regression covers stop/teleport/locked-step
clearing. The 84-entry suite now derives its expected support velocity from actual pre/post motor
positions rather than mirroring the production history getter. Fresh handoff, jump8, movement16,
typing/lint/format/core and both build/production paths pass; unaffected extended generation/model,
rendering/resource and broad cross-system evidence above is reused.

**Final independent follow-up: READY; B1 cleared.** Attributed reviewer evidence:

- **20 browser boundary checks plus full-tick lava/respawn** pass with zero page errors. Legal melee
  at frame41 captures zero inherited/root Y before and after publication despite old root derivatives
  −6.1/−2.5333. Rising timed melee preserves **3.7333333 units/s** ballistic velocity exactly.
- Both stair directions preserve **±0.2086823** before/after publication and with history invalidated.
  Rising/falling flight over those slopes preserves **+2.0666667 / −4.6** ballistic velocity without
  adding support motion; world continuity error at most **2.22e−16**. Locked, stopped, teleported and
  fully blocked motors clear support motion before immediate lethal capture.
- **64 independent motor/headless cases** cover four species, both slope directions, grounded lethal
  inheritance, cleanup and flight. Earlier successful math, real projectile/death ownership and
  all-25 retirement evidence is reused alongside the parent's corrected gates/builds/browser checks.
- An extra uphill takeoff probe reproduced a pre-existing zero-height `Jump.advance` contact edge
  in unchanged code: a positive support rise at exact takeoff can land immediately. The reviewer
  isolated it independently of A7 and classified it as a separate, nonblocking gameplay follow-up.

Reports and original diagnostics are preserved as `a7-independent-review.md` and
`a7-independent-followup-review.md` with final `*-browser-final.json` / `*-motor.json` evidence under
ignored `test-results/`. This containing delivery records A7 after independent clearance.

### A6 — shield preparation, lowering and accepted-block recoil — 2026-11-20 (final review READY)

`blockFeedback` now publishes actor/run-owned accepted-block metadata and a bounded same-time
aggregate. `rigPose.actions.shield` samples six bounded springs for placement/aperture, supporting
load, directional recoil and phalanx counter-turn. Required guard targets are protective immediately;
all gameplay defense/attack/work clocks remain authoritative. See [docs/rig-shields.md](docs/rig-shields.md).

**TDD evidence:** five initial event tests failed on the missing component; the first motion suite
failed on the missing module. Subsequent live-plan reds caught absent supporting-body preparation
and counter-turn continuity. The quiet-state regression measured **480 unnecessary spring advances
over 120 samples**, now **zero**. A real moving-stair case failed at **0.001146253 units** of running-
flight sole penetration; fading grounded pelvis bracing during that flight restores **0.000906710**
or better. A malformed optional contact red (zero events for an accepted block) now uses the labelled
contact estimate. A queued world-direction regression also failed after a facing reversal; signed
projection preserves that impulse. A final red caught released recoil using a newer motor heading
instead of the actual eased rig heading; the rendering adapter now supplies the latter. These
focused failures were observed in tool runs; no saved raw initial
red log is claimed. The old immediate-neutral-arm browser assertion was updated to A6 lowering/
settling; hard-reset assertions remain. The rig oracle now recognizes the active lowering grip.

**Initial independent review: NOT READY.** The reviewer independently found two blockers:

1. Moving release immediately restored torso gait into the still-raised board. Actual F/run40/release
   overlapped the player's surcoat by **0.12020**, hood by **0.09765** and mask by **0.03777** units;
   kobold shield/vest overlap reached **0.10337**. A new independent-mesh-SAT regression reproduced
   the defect (`a6-review-red.log`). Coordinating the body release with a forward/outward shield arc
   and scale-aware board height removes the added head/torso/leg overlaps in those fixtures.
2. Mid-lower re-raise unconditionally reset placement and velocity, even when still protective.
   Placement/aperture now retain the feasible pose and velocity; unsafe frames use twelve bounded
   frame bisections to the first protective point along the guard path. Only outward constraint
   velocity is discarded. The one-frame reversals now have **zero corner jump**, retaining
   **−4.2016618056** placement velocity for both profiles.

The reviewer separately passed five event-integrity probes (including 75 rotated direction/guard
boundary cases), phase interruption and scale-bearing attachment checks. The original report and
captures remain under `test-results/a6-independent-*`. Final follow-up clears both blockers;
its independent measurements are attributed below.

**Corrective checks actually run:**

- Final full gate: `npm run check:full`, **377 pass / 299.59s**, typing/lint/format191.
  There are seventeen new pure tests; existing model coverage remains **22 machines / 105 states /
  226 branches**. No machine guards/durations or test selection rules changed. The earlier
  full374/core358 checkpoints are superseded. After a capture-only browser edit, final
  `npm run check` passes **359 / 29.43s**, including typing/lint/format191; transitions pass again.
- Final `npm run build`: **705 modules**, main bundle **1,696.37kB / 437.38kB gzip**; existing
  chunk-size warning. Root production smoke passes five checks, zero browser/network errors,
  absent development hooks and no external requests. No A6 hosted deployment is claimed.
- `test:rig:shield`: real F and real melee clock, immediate guard/release, modal reset, stronger/
  weaker/side/batched reactions, rear-hit rejection, normal lowering, rapid reversal/repeat/jump,
  exact zero-time reads, actual grips/soles and tail response. **Eight camera-replayed sequences /
  1,056 frames**, plus **960 moving stair frames** and **132 gate frames**. Moving control/hit runs
  have identical motor position/support/speed/health. Hand error is below **5.68e−6**; minimum guard
  face dot in the replay sequences is **0.9830406**. The guarded gate covers the actual spear line under recoil, and the
  fully open gate clears it throughout the action. Opening damage emits no block reaction.
- Ten playback tracks / **220 captured frames** (shield-side and gameplay) were exercised at normal
  then quarter speed after the corrections. Temporal sheets were inspected, including shield-side views and
  uninterrupted lowering. This is 60 Hz simulation sampled at 10 Hz, not every-frame perceptual review.
- `test:rig:shield:transitions`: **600 release/control frames** across five phases and both profiles,
  real F/run40/release30, twelve reversals and sixteen opening interruptions pass. No added torso/
  head/leg intersections versus controls; real-input pauldron maximum **0.029233** remains within
  its prior free-motion baseline. Feasible reversals preserve exact corner positions/velocity;
  unprotected reversals immediately cover the body/gate ray. Lost-target/death handoffs have zero
  pose jump; death retires feedback. Ten corrective captures saved; moving release and feasible
  reversal captures inspected.
- Fresh `test:rig`: **428 samples / 30 clips**, exact A0 authority parity; existing actual contact/grip
  tolerances and resource plateau pass. Corrective animation, defense9, phalanx8 and rig-actions
  passes precede only the final heading-basis fix; that evidence is reused (2,714 collapse-age checks).
  Fresh dense tails4488 and all-member tail-clearance/stability pass, preserving zero ECS-order
  error and settled-corpse invariance.

**Bounded cost:** one pending batch, five saturating integer sums and one latest immutable diagnostic
event per actor; no event backlog or new scene geometry. Burst power is capped at two. Quiet springs
skip integration; transitional placement adds one authored FK traversal and at most twelve board-frame
projection iterations, while full-body solve/contact ceilings stay unchanged. The final 25-actor/
four-corpse workload measures **3.1946ms mean / 4.00ms p95**, just below the 3.2/4.5ms investigation
thresholds with limited headroom. Earlier measurements were **3.3708/4.10ms** and **3.0979/3.60ms**;
the first prompted the dormant-spring work check. Timing variation prevents a causal speedup claim.
Tile reads remain max **899**, mean **553.72**. Sampled allocation estimate **329,756,420 bytes** includes setup/warmup/yields/instrumentation
and collected objects at 32KiB sampling; it is not retained heap or exact allocation count.
Resources plateau across three regenerations at **2,382 meshes / 495 nodes / 28 materials / four
textures / 5,719 entities**, with the same 25 actors. Chromium/SwiftShader CPU fixture, not hardware FPS.

**Visual review:** supporting load, recoil and the controlled drop are readable; corrective moving
release captures no longer show the head/torso tipping into the board. Feasible re-press captures
are identical. Re-raising from an actually unprotected pose still requires an immediate boundary
projection (up to **1.23492 units** at the farthest corner in the tested deep kobold lowers); this
is necessary protection, not claimed continuous motion. Discrete equipment stowing is unchanged.
Corrective logs use `a6-corrected-*`; raw reports, playback and captures remain ignored under
`test-results/`.

**Final independent review: READY**, clearing R1/R2 against the original acceptance contract.
Attributed reviewer evidence (`test-results/a6-independent-followup-review.md`):

- **22/22 native tests**, including five original independent event probes, pass. Actual F/run40/
  release30 and **240 phase-varied release/control frames** show no living head/torso/leg shield
  intersections. Actual attachment matrices agree within **4.08e−7** under nonuniform root scale.
- **48 stationary/moving reversals** include ten already-protective cases retaining exactly zero
  shield-corner, hand, full-pose and tail displacement, with all six spring velocities unchanged.
  Unprotected cases immediately restore coverage and remain protected; minimum guarded face dot
  **0.9802003302**. Twelve attack/recovery interruptions also pass. Zero-time replay drift is zero.
- **360 frames** across all three shield slots with turning/directional bursts and **180 carry/guard
  frames** preserve protection and grips without added tested living body intersections. Sixteen
  pre-rolled **live-target** opening interruptions include actual gate/spearman deaths, target loss
  and retreat; death handoff error is below **5.1e−16**, with feedback cleared. Twelve browser cases
  independently confirm exact rendered-heading impulse projection after release.
- Six new corrected captures inspected; instrumented probes have zero page errors. Broad parent
  checks, resource plateau and qualified CPU evidence were reused, not independently rerun.

The expanded independent turning case measures **1.49375 units** of necessary corner displacement,
including the existing authoritative root-facing snap; full-open gate restoration reaches about
**1.38546**. These remain the sharpest visual transitions. A **36-age inactive-shield death control**
also reproduces **0.00813-unit** temporary shield/vest overlap, separating that baseline collapse
limitation from the corrected living-release defect. Neither is a remaining A6 blocker. Optional
future persistent cases are the review's browser-level heading adapter and live-target spearman
casualty probes. This containing delivery records A6 after independent clearance.

### A5 — independent review corrections — 2026-11-20 (final review READY)

The independent reviewer inspected initial delivery **`688e491`**, reproduced three blockers, then
found a fourth during corrective follow-up. All four are now cleared by a final **READY** review
of the corrections recorded in this delivery. `AGENTS.md` and the delivery workflow now explicitly
require automatic review after implementation/verification, fixes and follow-up review before delivery.

**Reproduced blockers and corrections:**

1. A living visitor made a settled corpse tail jump **0.779495 units**. Corpses now exclude living
   avoidance, and settled tails retain their final angles without further clearance queries.
2. “Clear” tails intersected their own posed shins/feet and neighboring shields. Bindings now
   publish bounded actual-geometry surface snapshots after all body/equipment poses finish; tails
   solve in stable entity-ID order. This includes limbs, weapons/shields, social props, nearby tails
   and cargo. Remaining infeasible tail-pair overlaps flag both participants. The proximal attachment
   exception explicitly covers only vest/haunches/fitted sash; other decorations remain protected.
3. The floor-tile boundary missed inward masonry trim by **0.022095 units**. The builder and contact
   index now share `wallGeometry.ts` profiles for plinths, courses, trim and caps. A slightly tucked
   root, stronger middle/end taper, compact upright preset and adjusted sash placement retain room
   for the chain beside real walls. Geometry construction keeps its previous RNG consumption.
4. Correctly reported infeasible contacts still oscillated: independent follow-up measured a
   **1.970607-radian / 0.981389-unit** late snap and continued movement against frozen contacts.
   Failed driven poses now check the held pose first; blocked poses do not chase other partially
   failing presets. Conflicting spring velocities clear. Entry/release changes sum to at most
   **six radians/second**, and the actual limited pose is checked again before reporting success.

The persisted review regression failed before fixes (`a5-review-red.log`); a later prolonged-contact
red is retained in `a5-review-settling-red.log`. Social visibility is now applied by bindings before
surface publication, removing the reviewer's non-blocking first-frame delay.

**Parent verification actually run:**

- Cross-system corrective gate: `npm run check:full`, **360 pass / 295.87s**, typecheck/lint/format.
  After the final render-only stability/visibility changes, `npm run check` passes **342 / 29.17s**,
  including typing, lint and **185 formatted files**. Unchanged extended generation/model evidence
  is reused from the full gate. Final build: **703 modules**, **1,686.58kB / 434.17kB gzip** main
  bundle; existing chunk-size warning. Root production smoke passes five checks with zero errors.
- `test:rig:tails:clearance`: **840 fixture steps / 2,640 live tail-actor frames**, inspecting every
  active member with independent actual-mesh SAT. Ordinary fixtures have zero own/neighbor geometry
  overlaps and unresolved contacts; first-frame visibility mismatches and reversed-ECS pose error
  are **zero**. Five generated masonry offsets pass. Both actors in **128 neighbor placements** are
  checked: **seven primary-actor blocked / eight placements with either actor blocked**, with no
  intersecting tail reported clear. These deliberate tight placements can cover the fixed root.
- Four prolonged arrangements each run **600 animation steps**, **600 frozen-contact tail steps**,
  and **180 release steps**. All late angle changes are **zero**, all release successfully. After
  final review's optional test suggestion, the historical failing neighbor is pinned when all late
  steps are zero; the targeted suite, typing/lint/format were rerun. Maximum release joint step is
  **0.078131 radians**. The reviewer separately tested both frozen subjects, as attributed below.
- The dense **34 sequences / 4,488 frames** suite passes; minimum tail floor clearance **0.002919**,
  maximum normalized radius **1.222845** within the unchanged 4.8 envelope. Rig catalog **428 samples**
  retains exact A0 authority parity, grip/sole/plant tolerances and the three-regeneration resource
  plateau: **2,382 meshes / 495 nodes / 28 materials / 4 textures / 5,719 entities**.
- Final animation, rig-actions, phalanx8, social15 and production5 pass; earlier corrective defense9
  and discoveries17 passes are reused. Fresh controls plus **13 clips / 26 views / 380 samples** pass
  camera equality. Normal/quarter-speed playback exercised; five temporal sheets and relevant
  captures inspected. This remains sampled capture review, not every-frame perceptual review.

**Cost:** final catalog **3.2383ms mean / 4.10ms p95** exceeds the 3.2ms mean investigation trigger
by about 1.2%. One bounded trace measured **3.945/5.30ms instrumented**, followed by the same workload
with CDP heap sampling at **3.1629/3.90ms**, with no intervening code change. Ranking identifies
binding/surface construction and grounding, not the old repeated distant-door getter issue. Final
maximum/mean tile reads are **899 / 553.72**. Catalog allocation estimate **335,288,604 bytes** at
32KiB sampling includes setup/warmup/yields/instrumentation and collected objects, not retained heap.
The reviewer accepts this investigated timing band with limited headroom; no causal speedup or
portable sub-3.2ms guarantee is claimed. Chromium/SwiftShader CPU fixture, not hardware FPS.

The tail's declared ceiling is now **25 candidate/check chains / 104 tail-joint evaluations /
100 clearance calls**, including held-pose and limited-final checks. Bindings cap surfaces at **64**;
fixed actor/link counts separately bound snapshot and pair work. Full-body limits remain unchanged.

**Final independent review: READY.** Attributed evidence from the separate reviewer:

- Initial and first-follow-up probes established the original geometry/death defects, checked
  128 neighbor placements in both directions, and compared **20,465 enabled surface corners** over
  726 fixture frames (maximum adapter/drawn error **5.6223e−6**, at most 41 registered surfaces).
- Final focused pure tests **7/7** pass. Independent browser stress: **2,400 full-animation steps**
  observing both actors, **4,800 frozen-contact tail steps** covering both subjects, and **720 release
  steps** for historical worst subjects. Late motion/velocity is exactly zero in all four cases.
  Max release joint/summed changes **0.078131 / 0.091153 radians**, below the 0.1 summed step bound.
  No limit, finite-value, conditional rate, work-cap or reported-clear intersection violations.
- Eight regular real-damage deaths and one blocked-to-death case have **zero** entry, repeated,
  settled, direct/progressive and rewind/resettle errors. Settled visitor changes have zero effect;
  unchanged zero-time reads have zero drift and zero tail-clearance calls. First-frame social
  visibility and death-hide checks pass. Zero browser page errors. Final stable before/after captures
  and the refreshed motion sheet were inspected. Broad gates/resource/cost evidence were reused.

**Remaining visual limitation:** genuinely infeasible close-neighbor arrangements may retain stable,
explicitly reported overlap rather than moving the gameplay root. The former repeated snapping is
gone. Ordinary reviewed poses are coherent; instant guard/equipment swaps remain A6's next work.
Independent reports/captures are under ignored `test-results/a5-independent-{review,followup-*,final-*}`.
The initial A5 commit is `688e491`; this containing commit records the reviewed corrections and
automatic-review workflow update.

### A5 — initial articulated-tail checkpoint — 2026-11-20 (historical, before independent review)

The following records the selected checks at initial delivery `688e491`. The review above exposed
gaps outside those fixtures and supersedes its pending-review status, clearance policy and budgets.

All twelve kobolds now share the 24-joint `humanoid-with-tail` extension. Four tapered links replace
each rigid stub; pelvis-bound haunches join them visibly to the body. Numerical tail springs and
clearance projection run after the full-body solve, with final mesh application through the shared
binding. Death is age-sampled after capturing the current chain. See [docs/rig-tails.md](docs/rig-tails.md).

**Observed failures and corrections:**

- The first pure regression failed on the missing tail module. Browser iteration exposed proximal
  body/stowed-shield conflicts, conservative stair-box rejections and coarse tuck changes. Actual
  oriented-box separation/corner floors, bounded bisection and a 0.06 higher stowed shield resolve
  these fixtures. Base yaw retains bounded inertia through rapid turns.
- Selecting the actual spearman for social checks exposed an always-blocked stable tail. Its floor
  tile was marked by the generator's *inflated navigation clearance*, not a wall. Checking physical
  prop footprints instead fixes the false rejection; real rear-wall/door checks still pass.
- A heading-dependent collapse angle left a dead tail raised. Extracting intrinsic pitch and
  counter-rotating against the actual falling root gives heading-independent settling. Pure direct
  and progressive death-age samples agree, with no live spring velocity after handoff.

**Final checks actually run:**

- `npm run check`: **342 pass / 31.05s native runner**, typecheck, lint and formatting **183 files**.
  Six new pure tests cover immutable extension/limits, measured motion, stopping, repeated reads,
  wall tuck, explicit infeasibility, death entry/age independence and nearby-door/coarse-cell behavior.
  Existing machine coverage remains **22 machines / 105 states / 226 branches**; no new machine.
- `npm run build`: **701 modules**, main bundle **1,682.42kB / 432.88kB gzip**, existing chunk-size
  warning. Root `test:production` passes five checks, with no browser/network errors, external
  requests, Inspector or development global. Production shield capture inspected. No A5 publication
  or hosted/Pages-subpath verification is claimed.
- `npm run test:rig:tails`: **34 role/action sequences × 132 frames = 4,488 samples**, each followed
  by a zero-time replay. All twelve rigs have four registered shadow/observation segments and no
  old stub. Actual mesh/FK errors stay below **1e−5**; minimum drawn floor clearance **0.002189776**;
  zero unresolved clearances and zero actual own-equipment intersections. Maximum normalized tail
  radius **1.260568183**, safely within A4's **4.8** observation envelope.
- Additional tail-browser fixtures pass actual rear-wall and closed-door geometry (minimum drawn
  margin **1.94764e−5**), dynamic door-open release, teleport/zero-velocity/history reset and both-role
  carry → slung combat → resumed carrying. Pure tests exercise the impossible-contact fallback.
- `A0_POSE_REPORT=test-results/animation-review-catalog.json npm run test:rig`: **428 samples / all
  30 clips**, exact historical A0 authority parity. Actual required grip maximum **2.57411e−6**,
  sole penetration **2.55304e−7**, plant drift **4.31563e−6**, joint mismatch **5.64407e−6**. Selection,
  material/registration identity, observation bounds and three-regeneration resource plateau pass.
- Affected Chromium suites: **animation / defense9 / phalanx8 / rig-actions / discoveries17** pass.
  The A4 actual shaft/torso, cargo and 2,714 death-age regression remains green. Rendering-heavy
  suites ran sequentially. Animation was refreshed after the final haunch geometry addition.
- Controls plus **13 clips / 26 camera replays / 380 sampled poses** pass exact replay equality,
  including tail joints. All 13 side sequences were played at normal then quarter speed in the
  generated viewer. Five temporal sheets (**52 selected frames**) and gameplay/side, social,
  formation and settled-tail captures were inspected. These are 60 Hz simulations captured at
  10 Hz; playback exercise and temporal capture review do not claim every-frame perceptual review.

**Cost and bounds:** initial integrated 25-actor/four-corpse/four-action workload was **3.6817ms
mean / 4.50ms p95**, exceeding the A5 **3.2/4.5ms investigation thresholds**. A bounded instrumented
CPU trace (**4.0671/6.50ms**, not a comparable benchmark) identified clearance's repeated distant
door chart reads. Proximity-first reads and reused floor tiles reduce those operations; the final
same-fixture measurement is **2.9050ms mean / 3.70ms p95**, 60 warmup +240 measured updates, maximum
**939** and mean **586.21** tile lookups/update. Statistical allocated-byte estimate **261,285,996**
at 32KiB sampling includes setup/warmup/yields/instrumentation and collected objects, not retained
heap or exact allocations. Chromium/SwiftShader, 800×600 CPU fixture; not hardware FPS.

Tail work is capped at **19 candidate/refinement chains / 80 tail-joint evaluations / 76 clearance
calls**, each with at most eight floor-corner probes. The full-body four-pass/16-limb ceiling is
unchanged; its shared FK maximum is now **273** (four extra joints across up to six traversals,
versus the unchanged core's 249). Final resources plateau at **2,382 meshes / 495 nodes / 28 materials /
4 textures / 5,719 entities**, +48 meshes/+48 nodes over A4, with the same 25 actors.

**Visual review:** tapered curls read from side and overhead views and stay below the weapon lane;
haunches remove a visible attachment gap. The sharpest remaining tail motion is a rapid 180° travel
reversal reaching the bounded base-yaw range; it settles without persistent oscillation. Instant
guard placement and discrete equipment swaps remain the stronger whole-character discontinuities,
with guard anticipation/reaction assigned to A6. **Independent review remains pending.** This
containing commit records the locally verified A5 delivery requested by the user.
Raw reports, profiles, playback and captures remain ignored under `test-results/`.

### A4 — action layers, grips and attachments — 2026-11-20 (verified; final independent review READY)

`rigPose.actions` now owns shared attack/work/social layers, required hand targets and explicit
equipment frames. Required grips join the existing foot/body solve; bindings alone apply final
equipment transforms. Social props and cargo consume solved sockets. Temporary collapse samples
the captured semantic pose against corpse age. See [docs/rig-actions.md](docs/rig-actions.md).

**Observed reds and corrections:**

- The first action regression failed on the missing module. A later independent actual-matrix
  oracle failed for a pitched spear under nonuniform root scale: a uniform world frame beneath
  that root required shear. Matching the hierarchy's scale-before-rotation basis fixes it;
  origins remain in unscaled gameplay units. All **183 scaled actual-matrix comparisons** pass.
- Initial drawn spear bounds reached **4.1544** outside the old four-unit observation envelope.
  The first correction to 4.3 missed death/recovery cases found in independent review below.
  The final conservative envelope is **4.8**. Gameplay collision/selection and attack geometry
  are unchanged.
- Dense corpse crossings exposed stale heading when installing an already-settled corpse over
  an unrelated old pose. A persisted pure regression failed before the direct-settled heading fix;
  ordinary deaths retain captured eased facing. Final animation crossings pass again.
- Camera replay found forearm scales differing by **one/two floating-point epsilons** after reset.
  A persisted NullEngine regression failed first; resetting all anatomical scales removes the
  stale decomposition hint. Exact camera replay equality then passes.
- Legacy arm-equality and shield-local-offset assertions were replaced with actual grip/reset
  checks: coordinated arms may adjust when body/feet move, and shields now use explicit root frames.
  The phalanx coordinate-specific fixture explicitly regenerates `MOURNING-731` before its adverse
  approach; an initial unpinned setup had stayed idle with zero route plans.

**Independent review corrections (persisted reds before fixes):**

1. The original stance intersected the actual torso with the shaft for **45/84 frames**, up to
   **0.40946 units** of shaft, including **0.25010** at impact despite passing grip checks. A
   side-on torso/counterturned head and bounded fore/aft lunge now keep the shaft clear. The
   expanded regression also exposed stair recovery grip/foot conflicts; centring the ready pose
   over the feet and following visual lift fixes them. **252 flat/uphill/downhill frames** now
   have zero intersections with a torso OBB expanded by 0.05; maximum grip error **0.00681448**,
   lane error **1.526e−6** and final sole penetration **0.000534757**.
2. A scene-root slung crate could not reproduce the sheared back-socket matrix: actual matrix
   error **0.046524**, drawn strap-corner displacement **0.036232**. Its slung frame now explicitly
   uses rigid, orthonormal unit dimensions at the solved socket position. Both-role carry/combat/
   resume checks (**144 frames**) retain ownership and reach maximum corner error **1.208e−7**.
3. Dead spearmen pointed their attached shaft underground and outside the envelope. The temporary
   collapse now settles the arm at a supported angle and clock-samples the wrist outward/back,
   preserving age-zero pose and primary grip. Minimum spear corner height is **0.07899875** above
   support. Re-review caught post-release entry frame **38** at radius **4.624742**, outside the
   interim 4.6 bound; the parent's expanded red also found frame **12** at **4.666062**. The final
   **4.8** bound is checked for **every throw entry frame 12–66**, each across 46 collapse ages,
   plus thrust/carry/crossbow/shield deaths: **2,714 samples**, with three zero-time repeats each.

**Final checks actually run:**

- Final `npm run check`: **336 pass / 28.53s native runner**, typecheck, lint and formatting
  (**179 files**). Six new action tests cover **610 multi-profile grip/support samples**, same-clock
  release/cache invalidation, work/attack interruption, cargo/guard handoff, sampling-independent
  collapse and the scaled actual bindings. The existing reset test is strengthened. Complete
  machine coverage remains **22 machines / 105 states / 226 branches**, with no new machine.
- Final `npm run build` passes: **699 modules**, main bundle **1,671.09kB / 428.93kB gzip**;
  existing large-chunk warning. Final local root `test:production` passes **five** checks, zero
  browser/network errors, absent development hooks and no external requests. Its shield capture
  was inspected. No new hosted deployment or Pages-subpath publication is claimed.
- `A0_POSE_REPORT=test-results/animation-review-catalog.json npm run test:rig`: **428 samples /
  all 30 clips**, zero A0 gameplay/action-clock difference. Actual required hand/grip maximum
  **2.57411e−6**, sole-corner penetration **2.55304e−7**, plant drift **4.31563e−6**, semantic/actual
  joint mismatch **5.64408e−6**. Actual equipment matrices, enabled corner bounds, mesh/material/
  shadow/observation identity, selection and three-regeneration plateau pass. The separate
  `npm run test:rig:actions` covers the additional geometry/handoff cases above.
- Chromium affected suites pass: animation's gait/actions/jumps/corpse contacts and resets;
  **combat15 / defense9 / phalanx8 / social15 / tribute9 / objective-work17 / discoveries17**.
  These include actual held-F input, thrown release/flight, spear opening and recovery, real
  porter delivery/interception, work-clock boundaries and witnessed/hidden death semantics.
  Rendering-heavy suites ran sequentially; unchanged gameplay evidence was reused after targeted
  presentation corrections rather than repeating every suite after every edit. After the final
  review fixes, rig, phalanx, animation, discoveries and production were refreshed successfully.
- **18 clips / 36 camera replays / 520 sampled poses** pass exact replay equality. Normal then
  quarter-speed playback was exercised for all 18 side sequences. Five temporal sheets (72 chosen
  frames), spear/carry/formation/social and production captures were inspected. These are 60 Hz
  simulations sampled at 10 Hz, not a claim of every-frame motion review. After review corrections,
  controls and **thrust/throw/opening** passed a fresh six-camera replay check. Corrected impact and
  settled side/gameplay captures were inspected by the reviewer and parent.
- **2,334 meshes / 447 nodes / 28 materials / 4 textures / 5,719 entities** plateau across the
  workload and three regenerations. Compared with A3: +43 procedural meshes and +50 attachment
  mounts. The 48 social prop meshes now belong to actor render arrays, removing their former
  standalone render-wrapper entities; actor population remains 25.

**Cost:** the final recorded integrated 25-rig/four-corpse/four-action-kind workload, 60 warmup
+240 measured updates, is **2.3679ms mean / 3.00ms p95**, maximum **882** and mean **535.85**
terrain lookups/update. Statistical allocated-byte estimate **227,138,024** at 32KiB sampling
includes setup/warmup/yields/instrumentation and collected objects, not retained heap or exact
allocations. Chromium/SwiftShader, 800×600 CPU fixture; not GPU FPS.

The pre-review **2.9433/4.00ms** result exceeded A3's **2.2/3.4ms investigation thresholds**.
One bounded CPU trace identified binding,
matrix work and the combined action/contact pipeline; its instrumented **4.59/6.90ms** is not a
comparable benchmark. Reusing inverse-root and socket matrices removes redundant work but local
timing variation does not establish a causal speedup. The hard per-actor ceilings remain
**four passes / 16 limb solves / 249 joint evaluations / 66 floor / 74 corpse queries**. Independent
corrected measurement was **2.0342/2.70ms**. The reviewer accepts provisional A5 investigation
thresholds **3.2/4.5ms**; these are investigation triggers, not portable timing assertions.

**Final independent review: READY, all three blockers cleared.** Attributed reviewer evidence:

- Initial **552 every-frame action samples** with three repeats each; original **84-frame** torso
  probe; both-role cargo handoffs and **184** action-to-death samples. Seven focused tests pass.
- Corrective recheck: zero intersections in the original 84-frame thrust, primary/support grip
  error **1.666e−7**, lane x **0.400000006**, and zero repeat drift. Cargo corner error **1.208e−7**.
  Additional **593 phase/age samples** have zero incremental/full-FK or direct/progressive differences.
- Final narrow bound recheck: **55 entry frames × seven ages = 385 samples**, maximum radius
  **4.6660620863**, minimum clearance inside the **actual** observation sphere **0.175258152**,
  minimum spear height **0.078998751**, age-zero error at most **6.67e−16**, and zero FK/direct-sampling
  differences. The reviewer reused the parent's passing 2,714-sample persisted regression after
  inspecting it; it did not claim to rerun that full fixture. No browser page errors.
- Broad checks and resource evidence were reused. The parent subsequently ran the final check/build
  and affected browser refresh above. Review probes/reports and all captures remain ignored.

**Visual review:** hands now meet long-weapon/shield/crate grips, the carried crate is in front,
and props follow the body through social/work and collapse. The worst remaining visible
discontinuities are discrete equipment swaps and instant guard placement; A6 owns guard
preparation/settling. The rigid tail remains **A5's next feature**. A4 is independently reviewed
**READY**; this containing commit records the verified implementation and review corrections.

### A3 — live locomotion and grounding migration — 2026-11-20 (verified, independent review READY)

Living player/enemy rigs now compose semantic poses and coordinated sole targets through
`GroundedLocomotion`, owned by `rigPose`. The gameplay root stays at authoritative elevation;
pelvis pose carries bob, running lift and capped corpse assistance. Stance/swing/flight plans,
slope-oriented soles and final footprint checks run inside the four-pass solver budget. See
[docs/rig-grounding.md](docs/rig-grounding.md) for ownership, limits and A4 handoff.

**Observed reds and fixes:** the first test failed on missing grounding. Initial browser traversal
found **0.487658-unit** uphill skeleton penetration: stacking a full swing lift on a high corpse
pushed the short leg into its singular fallback. Taking the maximum of swing/obstacle clearance
and checking final ankle references as well as sole corners fixes the crossing. Moving lift beneath
the anchor required changing the browser oracle to the actual bound hip, while preserving the
existing lift thresholds. Authored Euler hints/full-range hinge output preserve action tests.

Independent review then reproduced **0.621566-unit** sole movement on an identical repeated release
frame, and retained hip Z **−0.121431** / thigh yaw **3.098876 rad** through reset/death. Both persisted
review tests were run red before fixes. A retained input-keyed presentation snapshot now consumes
contact decisions once; reset and temporary death settling handle all captured hip channels.

**Final checks actually run:**

- `npm run check`: **330 tests / 29.47s native runner elapsed**, typecheck, lint and format
  (**175 files**) pass. Includes **seven new A3 pure/NullEngine regressions**: continuous multi-profile
  ramps/corpse edges, fixed root/state preservation, phase/release/reset, repeated sampling, contact
  refinement budget/stale-best protection, overlap/retirement/full-speed travel and actual adapter
  reset/death handoff. Complete models remain **22 machines / 105 states / 226 branches**.
- `npm run build` passes. Main bundle **1,662.86kB / 426.50kB gzip**, including the now-live solver;
  the existing large-chunk warning remains. The parent did not run a new hosted/Pages deployment.
- `A0_POSE_REPORT=test-results/animation-review-catalog.json npm run test:rig`: **428 samples /
  all 30 clips**, **zero difference** in A0 gameplay/movement/action clocks. Pose parity is no longer
  the migration assertion. Maximum actual drawn sole-corner penetration **2.553039750718966e−7**,
  planted-sole drift **4.315629370066428e−6**, semantic FK/bound-joint mismatch
  **5.644070261669216e−6**. Catalog terrain-query maximum **38 per actor**. Identity, shadows,
  observation references, actual ray selection, current-position terrain lookup and history pass.
- Existing `test:animation` passes moving flat/sloped/rotated corpse crossings, gait/action/jump,
  skeleton sequences and reset checks. `test:movement` passes **16** checks; `test:jump` passes **8**.
  `test:production` passes **five** local root checks, zero browser/network errors, no development
  hooks or external requests. Suites ran sequentially after final source fixes.
- Selected motion review: **eight clips / 16 camera replays**, matching snapshots between gameplay
  and side views. Travel, lurch, stairs both ways, corpse traversal, jump, hide/peek and retreat.
  Normal then quarter-speed generated-viewer playback exercised; two side sheets and dense
  animation/skeleton captures inspected. Playback is 60 Hz simulation sampled at 10 Hz, not a
  claim of every-frame human motion review. Historical A0 catalog JSON was preserved.
- **2,291 meshes / 397 nodes / 28 materials / 4 textures / 5,767 entities** remain stable through
  the workload and three regenerations. Fixed buffers/request snapshots and cached references reset
  independently. Corpse-contact height remains **0.46**, visual corpse assistance **0.14**.

**Bounded cost investigation:** initial integrated rig measurement was **2.3971ms mean / 3.60ms p95**,
above A2's 2.2/3.4ms investigation thresholds. Intermediate standalone baseline runs measured
**2.545 / 3.50ms** and **2.6592 / 4.60ms**. One bounded CDP CPU sample identified final binding,
matrix work and validation among the main costs; its instrumented **3.0058 / 5.20ms** is not a
comparable benchmark. Changes avoid unnecessary authored FK, cull distant corpse boxes once,
skip obsolete solved-leg Euler hints and use an affine matrix fast path. Independent products,
including supported aliasing, match the original implementation exactly.

Final integrated 25-rig/four-corpse/four-action-kind workload, **60 warmup +240 measured updates**:
**1.8625ms mean / 2.50ms p95**, **840 maximum / 516.83 mean terrain lookups/update**. The hard
per-actor ceilings are **four passes / 16 limb solves / 249 solver joint evaluations / 66 floor /
74 corpse queries**; running-flight planning can additionally evaluate the 20-joint authored pose.
Statistical CDP allocation estimate **189,387,920 bytes** at 32KiB sampling includes setup/warmup/
yields/instrumentation and collected objects. Chromium/SwiftShader, 800×600 CPU fixture; not exact
allocations, retained heap, portable timing assertions or a GPU/FPS claim. Intermediate timing
variation prevents attributing an exact speedup to one change.

**Independent review: READY, both blockers cleared.** Initial reviewer probes covered **3,960**
oblique multi-profile moving samples and **400** additional scale/envelope samples. Follow-up
verified **zero** sole/knee displacement on the exact release reproduction, **44** snapshot
invalidations, **640** actual production-animator NullEngine frames with three zero-time repeats
each, and **48** changed/retired rendered-corpse cases. Repeats performed zero additional solves;
pose/history/contact state remained stable. Reset/settled hip offsets are anatomical within
floating-point tolerance, with zero yaw/roll; capture round-trip error is **2.98e−8**. It reused
broad evidence and ran bounded probes; the parent ran final browser/core/build verification.

**Worst remaining visual issue:** root-mounted/stowed equipment and carry/grip placement. A4 is
the next migration slice. Capped contact and uncapped drawn-remains diagnostics remain separate;
this delivery does not claim contacts above the authored corpse-height cap.

### A2 — coordinated full-body target solver — 2026-11-20 (verified, independent review READY)

The reusable pure solver coordinates required sole/grip frames, pelvis/spine/chest/shoulder
compensation, unequal-length limb IK and periodic joint limits. Every pass validates all final
end effectors; conflicts return finite residuals and explicit infeasibility. See
[docs/rig-solver.md](docs/rig-solver.md) for target, scale, singular-projection and ownership contracts.
Gameplay target planning/migration follows in A3/A4.

**Observed reds and corrections:** the initial test failed on the missing solver module. Review
reproduced a **0.128-unit** actual sole error from accepted logical-joint shear, a **0.458-unit**
knee flip across a tiny bend-pole change, preserved-orientation error incorrectly reported as zero,
zero-weight required contacts silently releasing, a π-boundary knee snap, and cumulative-scale
failure changing the published result. Four persisted review tests failed before fixes. Recheck
then found **0.422788 / 0.353553-unit** antipodal-transition/fold-threshold knee jumps; their persisted
regression failed before replacing quaternion interpolation/hard switching with continuous goal
direction regularization. Invalid scales are now rejected up front, including unrenderable shear.

**Checks actually run:**

- **14 new pure tests**; **968** temporal turn/step samples against independent Babylon FK,
  **300** actual bound endpoint comparisons for root/spine/combined nonuniform scaling, maximum
  mismatch **1.7858754167897082e−7**. Tests also cover singularities, opposite poles, limits,
  priority/weight conflicts, spaces/socket bases, release, finite residuals and idempotence.
- `npm test`: **323 pass / 28.15s native test-runner elapsed**. Complete machine coverage remains
  **22 machines / 105 states / 226 branches**. Lint first rejected two unnecessary spreads in
  test snapshots; the corrections pass focused tests and lint. Typecheck, format (**172 files**)
  and build pass; the existing Vite bundle warning remains.
- Final `npm run test:rig:solver`: **1,210 samples** across player, skeleton, goblin and both kobold
  roles, each with planted support/turning and a sloping one-foot step plus two grips. Actual
  mesh sole error **6.2478e−8**, forearm-end/grip error **0.009901774**, sole orientation error
  **8.9407e−8 rad**, worst drawn sole-corner penetration **6.7480e−8**. Repeated zero-time
  solves/rendering preserve pose/history and actor positions. Zero browser errors.
- Normal then quarter-speed sampled replay exercised; front, side and actual gameplay-view
  captures inspected. The existing `npm run test:animation` passes start/stop, gait, actions,
  jump/landing, corpse contact, skeleton and reset checks; pose/contact sheets were inspected.
- **2,291 meshes / 397 nodes / 28 materials / 4 textures / 5,767 entities** plateau after helper
  disposal and three same-seed regenerations. One iteration failed because the initial world was
  unpinned; the browser fixture now explicitly regenerates `MOURNING-731` before comparison.
- Final isolated 25-rig solver workload, 60 warmup +240 measured updates: **1.185ms mean / 2.20ms
  p95**, observed **2 passes / 8 limb solves / 147 joint evaluations**, zero terrain queries.
  Mandatory per-call ceilings are **4 / 16 / 249 / 0**. An initial redundant-FK implementation
  measured **2.2425 / 3.00ms**; limiting intermediate evaluations to affected ancestors reduces work.
  Separate final A0 animation workload: **1.2208 / 1.90ms**, **42 terrain lookups/update**. A3 must
  measure its actual combined migrated pipeline; these timings are not additive/integrated proof.
- Chromium/SwiftShader, 800×600 CPU fixtures; no GPU/FPS claim. Statistical allocated-byte estimate
  **80,504,464** at a 32KiB interval includes setup/target sampling/yields and collected objects,
  not exact allocations or retained heap. Reports/captures remain ignored under `test-results/`.

**Independent review: READY, all blockers cleared.** Reviewer reran the **14 focused tests** and
independent Babylon-FK continuity probes. The exact antipodal/fold reproductions now move the knee
by **7.45e−8 / 1.23e−7**, with bounded azimuth/fold-neighborhood sweeps also continuous. It rechecked
scale/binding, orientation, weight/release, periodic limits and invalid-input result preservation.
The reviewer reused broad evidence; the parent performed the final browser/core/build verification.

**Worst remaining visible issue:** legacy sword/pipe attachments overlap the two-grip test frame.
A4 migrates equipment and action attachment authoring. A2 establishes the solver/mesh contract;
the sampled replays/captures do not establish final migrated gameplay acting quality. A3 is next.

### A1 — shared humanoid definitions and bindings — 2026-11-20 (verified, independent review READY)

All **25 actors** now use the shared 20-joint humanoid definition, species profiles, numerical
pose/history buffers and final mesh bindings. Logical hand/head frames reuse existing nodes and
geometry. Both kobold roles share anatomy. Existing samplers/contact code write a numerical legacy
bridge; bindings translate semantic poses through inverse-bind offsets and the existing pivots.
See [docs/rig-foundation.md](docs/rig-foundation.md) for APIs and current migration boundaries.

**Observed reds and corrections:** pure definition/binding tests initially failed on their missing
modules. Independent review then reproduced terrain/room lookup reading the previous render root
after the motor moved. A persistent browser regression failed with `['stone', 'lava']` instead of
`['lava', 'stone']` on entering/leaving a boundary. `movePlayer` now reads its current actor `x/z`;
the corrected cases reach x=0.57/lava and x=0.43/stone. Socket-axis NaNs and invalid coarse body
mappings are rejected. The ordinary same-mesh skeleton reference continues selecting ordinary
motion through the legacy profile lookup and now asserts that it contains no lurch.

**Checks actually run:**

- **Seven new pure tests** cover shared topology/immutability, actual proportions and sockets,
  quaternion FK/local-world round trips versus Babylon, stable buffers/history, malformed
  definitions, independent wrist orientation, neutral mesh parity, head/limb application and
  retired binding rejection. Earlier focused rig/contact/leg iteration passed **17 tests** before
  the additional wrist test; all are included in the final everyday gate.
- `npm test`: **309 pass / 28.71s native test-runner elapsed** (excluding preceding typecheck).
  Complete machine coverage remains **22 machines / 105 states / 226 branches**. Format
  (**164 files**), lint, typecheck and production build pass; the existing bundle warning remains.
- `A0_POSE_REPORT=test-results/animation-review-catalog.json npm run test:rig`: **428 samples /
  30 clips**, maximum scalar difference from preserved A0 **2.384185791015625e−7**. Gameplay
  positions/facts/clocks are compared along with render transforms/contact metrics. Maximum
  pure-FK/rendered joint error **5.643607388144739e−6**, allowing Babylon Float32 world rounding.
- Mesh, material, parent, vertex-count and pickability identity, exact shadow-list identity,
  observation render-object/mesh-array identity and actual enemy-proxy ray selection all pass.
  Repeated application preserves current and previous snapshots; three regenerated worlds start
  with fresh current=previous history. **2,291 meshes / 397 transform nodes / 28 materials /
  4 textures** remain stable, with **42 terrain lookups/update** as in A0.
- Same bounded A0 workload (25 rigs, four corpses, four action kinds, 60 warmup +240 measured
  updates): CDP-enabled **1.127ms mean / 1.50ms p95**. Statistical allocated-byte estimate
  **157,565,116**, at a 32KiB interval including collected objects, setup/warmup/yields and test
  instrumentation. This is not exact allocation count, retained heap or a causal speedup claim.
  SwiftShader/800×600 CPU fixture; rendering/AI/motor/diagnostic sampling are outside the timed call.
- `npm run test:animation` passes existing poses, corpse crossings, skeleton sequences and resets.
  `test:movement` first found its pre-existing **21 ≠ 24** population assertion; correcting the
  fixture to the current roster yields **16 passing checks**. `test:jump` passes **8 checks**,
  including lava, airborne support, input cancellation and regeneration. Suites ran sequentially
  with bounded deadlines. Relevant rig and animation captures were inspected.
- `npm run test:production`: **five local root-path checks**, zero browser/network errors, no
  development global or Inspector/external requests. No new hosted/Pages-subpath deployment is
  claimed here. Reports/captures remain ignored under `test-results/`.

**Independent review: READY, blocker cleared.** Attributed probes: **96** transform samples across
four profiles / **20,352** matrix scalars versus separate Babylon hierarchies (pivots and nonuniform
scales), maximum error **9.54e−7**; semantic edits under nonuniform root scale within **6.03e−6**;
binding history/reset checks; actual `movePlayer` terrain and room boundary checks in both
directions; **42 invalid-input cases**; **72 socket-frame comparisons** including rotated bases
and nonuniform scale, maximum difference **1.96e−6**. Reviewer inspected the saved identity,
selection, parity and resource evidence and reused broad tests rather than rerunning them.

The worst existing visible issue remains A0's floating/root-mounted equipment and rear crate
placement. A1 intentionally establishes pose/binding parity; A2/A4 solve coordinated grips and
contacts. A2's bounded full-body IK is the next dependency-ready slice.

### A0 — animation motion-review baseline — 2026-11-20 (verified, independent review READY)

Implemented the development-only `window.__dungeon.animation` controller, pose/contact observer,
optional overlay, fixed-angle gameplay/side cameras, authored motion catalog, selectable browser
runner and HTML playback. Full inventory, reproduction commands, current defects and initial
cost budgets are in [docs/animation-baseline.md](docs/animation-baseline.md).

**Test-first:** the first browser check failed at missing `animation.pause()`. Subsequent controls
pass paused fixed steps, repeated-render/sample idempotence, bounded arguments, real W/F input,
menu pause, measured quarter-speed stepping and ordinary debug regeneration continuing at 1×.

**Checks actually run:**

- `npm test` passed, including typechecking: **302 tests / 27.84s native test-runner elapsed**
  (the native duration excludes the preceding typecheck). Models retain
  **22 machines / 105 states / 226 branches**. The new pure regression distinguishes actual
  1.1-unit drawn remains from the unchanged 0.46-unit contact cap.
- Format (**156 files**), lint and production build pass. Existing bundle-size warning remains.
- Controls + baseline browser pass in **30.46s**. Original **25 rigs**, four settled corpses,
  all four action kinds; 60 warmup + 240 measured animation-only updates. Mean **1.06 ms**, p95
  **1.70 ms**, maximum **42 tile lookups/update**. CDP allocation estimate **166,704,188 bytes**
  includes setup/warmup/yields/instrumentation and collected objects; not exact allocation count
  or retained heap. Chromium 159.0.8154.6, SwiftShader, 800×600: CPU fixture, not GPU benchmark.
- **2,291 meshes / 397 transform nodes / 28 materials / 4 textures** remain constant through
  the workload and three same-seed regenerations. Overlay/old camera references are cleared.
- Full catalog passes in **162.83s**: **30 clips × two camera replays, 856 samples**, matching
  world-pose snapshots between camera replays, finite transforms and asserted named behaviors.
  It includes all four profiles/both kobold roles, stairs both directions, moving/interrupted
  strikes, formation/hold/opening/retreat, social, work/carry, and settled collapse. These are
  authored motor/clock fixtures, not replacement AI/objective-outcome checks.
- `npm run test:animation` passes its existing gait, weapon/jump/death, corpse-crossing and
  skeleton/reset regressions. Relevant new captures and corrected stairs/card views were read.
  The HTML viewer's normal/quarter-speed playback was exercised; captures sample 60 Hz simulation
  at 10 Hz and do not establish every-frame smoothness.
- `npm run test:production`: **five root-path checks, zero browser/network errors**, no debug
  global/Inspector requests/external assets. Build has no review chunk. This is local production
  verification; no new hosted deployment or Pages-subpath run is claimed for A0.

**Review corrections:** independent review initially rejected regeneration forcing playback to
zero, an abbreviated opening fixture with no guarded recovery, close-up framing labelled gameplay,
and capped contact measurements presented as drawn clearance. These are fixed. Independent
recheck confirms preserved 1×/¼×/paused rates; rear attack starts at frame 36, finishes at 86
(51 fixed steps / 0.85s), with guarded recovery at 87; actual gameplay radius27/beta0.64; separate
uncapped geometry measurements; 60 replay-equivalent sequences and named-behavior assertions.
Final verdict **READY**, no source blockers. It reused broad checks and added bounded controller,
NullEngine, report and geometry probes.

Capture iteration also exposed excessive automatic rendering (deadline stopped the first run)
and a negative first-RAF elapsed time in the generated viewer. Explicit captures and first-frame
clock initialization fix these; the runner now opens its generated gallery and checks playback.
Visual review then found paused side cameras behind full-height stair walls. Review cameras now
apply/restorably save the ordinary cutaway scales. A final focused **controls + stairs-up/down +
cards** run passes six camera sequences, and its corrected sheet was inspected. The full catalog
and CPU evidence above are reused; the correction affects camera presentation only.

**Worst existing visual error:** floating root-mounted equipment (thrust/throw proximity roughly
0.85/1.22 units), plus the crate behind forward-reaching arms. Actual foot-corner sampling also
reveals existing stair/corpse-edge penetration, documented in the baseline. These are migration
targets, not claims that the future A2/A4 quality gates already pass. At this A0 checkpoint A1
was next; its subsequent delivery is recorded above.

### T2 — measured test cadence before animation — 2026-11-20 (verified, review READY; pre-A0 checkpoint)

The user requested faster feedback before starting A0. This changes test organization/fixtures,
model partitions, reporting, npm commands and the CI gate; there are **no application-source edits**.
The existing staged P7 publication records and animation roadmap remain preserved.

#### Measurements and retained coverage

Measurements used the same local **Node 26.0.0** installation. Native test durations were captured
with a custom reporter; `/usr/bin/time -p` supplied command wall/user/system times. The baseline
used the original runner's default concurrency; new suite commands cap file workers at **four**.
These are local observations, not general hardware guarantees or additive per-test wall times.

| Run | Result | Native runner elapsed | Command wall time |
| --- | --- | --- | --- |
| Original `tests/*.test.ts`, before edits | **315 passed** | **303.11s** | **303.24s**, excluding typing |
| First split, before compact everyday work model/long-simulation grouping | **303 passed** | **65.24s** | **65.38s**, excluding typing |
| Final `npm test` everyday gate | **301 passed** | **26.79s** | **28.82s**, including typing/npm overhead |
| Full profiling run (`npm run test:timings`) | **319 passed** | **301.57s** | **303.41s**, including typing/npm overhead |

The routine gate is about **91% shorter in native runner elapsed time**. It intentionally selects
a smaller everyday scope; full wall time is approximately unchanged. Aggregate user CPU in the
recorded full commands changed from **1,115.28s to 845.34s**, but concurrency/setup changed too, so
this is not an isolated optimization benchmark.

The baseline's dominant cases were tribute's 100-seed routes (**247.18s**), Last Ember's 100-seed
sites (**176.95s**), the generation-report corpus (**101.52s**), and other broad scene/inhabitant
corpora. The 1,200-duration sweep took **69.61s**, and exhaustive work-model coverage **42.05s**
under that concurrent load. The first split exposed those model/long-traversal costs in core too.

Changes:

- Prefix **18 top-level tests** with `[extended] ` for explicit native Node selection. This group
  retains broad generation/presentation/social corpora, all 1,200 authored durations, the original
  every-tick work-model graph and two long tribute simulations. No test is marked skip or TODO.
- Keep all original **315 named contracts** in the full suite (normalizing only the group prefix),
  plus three representative world/objective seed tests and the separately named exhaustive model.
  Everyday tests retain actual interruption-to-delivery AI, adverse phalanx/navigation regressions,
  and exact 3.7/6.9-second completion/race boundaries. The clue-overlap seed `ember-70` runs daily.
- Generate the shared 100-world fixture lazily inside selected tests; importing/discovering a
  filtered test file no longer constructs the whole corpus.
- Check each crate-to-exit route once instead of inside every intervention-face iteration:
  **20 → 4 searches per tribute seed**, preserving all four route assertions and face checks.
- Everyday work coverage partitions empty/partial/last-tick/full elapsed time and retains all
  **five states/seven branches** with **319 generated paths / 480 cyclic steps**. Extended coverage
  retains the original **410 vertices / 6,529 graph edges / 8,206 paths / 480 cyclic steps**.
  The complete everyday report remains **22 machines / 105 states / 226 branches**.
- Write core and exhaustive model reports separately. Extended-only runs preserve the core report;
  a started but failed core/model run writes incomplete status rather than retaining a stale pass.

Reports under ignored `test-results/`: `test-timing-before.json`, the intermediate
`test-timing-core-after.json`, `test-timing-full-after.json`, `machine-model-report.json`, and
`machine-model-extended-report.json`. The intermediate core report is **not** the final 301-test
timing; the final measurement above is the actual `npm test` console result. The reusable
`tests/timingReporter.ts` is available through `npm run test:timings`, with `TEST_TIMING_FILE`
for separate captures. It reports failures; Node still controls exit status and test selection.

#### Checks actually run

- Full profiled suite: **319 pass**, including all extended cases and the original every-tick
  work graph. A subsequent report-only failure-status guard was covered by the final everyday run;
  it did not change a model, fixture assertion or test-selection rule.
- Final required commands: `npm run format:check` (**150 files**), `npm run lint`, **`npm test`
  (301 pass, typecheck included)** and `npm run build` pass. Existing bundle-size warning remains.
- **47 focused core model/work tests** pass. Core reports still enforce every exported machine,
  every declared state and branch, and retain the tests rejecting unreachable/uncovered models.
- **30 isolated script probes** pass on **Node 22.18.0, 24.22.3 and 26.0.0**. Each runtime executes
  ten combinations of actual npm scripts with core/extended sentinel failures, proving default,
  models, extended, full and timing commands select the intended cases and propagate failure.
  The fixture stubs typechecking to isolate script dispatch; full source typechecking is the
  separately recorded command above. Reporter JSON records the failing sentinel correctly.
- The probe also compares old/new full inventories and asserts **301 core + 18 extended = 319**,
  complete **22/105/226** coverage, and **8,206** exhaustive work paths.
- **47 focused model/work checks also passed on Node 24.22.3**, the CI runtime. An empty-name
  discovery run of `world.test.ts` finished in **0.28s**, confirming the corpus is not eagerly
  generated. Actionlint, diff-whitespace and `npm run prepare` pass; the installed hook still
  calls `npm run check` without bypassing checks.

**Independent review: READY, no blockers.** Attributed reviewer evidence:

- Compared old/new full inventories and original assertion/corpus loops; all 315 original named
  contracts remain. Compared the old exhaustive work model against `workModel(true)` over all
  **410 vertices / 6,529 edges**, including candidate events, resulting contexts and invariant body;
  they match. Fresh compact coverage retains all five states/seven branches.
- **Nine isolated report-lifecycle probes** pass for failure, partial selection, extended-only
  core-report preservation and separate complete reports. **Seven targeted timing regressions**
  pass, including exact decimal, prior-tick, tie and fractional-carry cases.
- Filtered discovery across all **35 test files** took **3.24s**, without large eager corpus work.
  Saved reports and diff hygiene were checked. The reviewer reused full-suite, build and
  cross-version evidence instead of repeating broad tests or browsers.

`npm run check` remains the pre-commit command and now uses the everyday gate. The Pages workflow
is configured to require **`npm run check:full`** before build/deploy; its new configuration has not
yet been run on GitHub. Full checks remain required locally for relevant generation, timing,
cargo/model/test-selection changes and releases. Ordinary animation edits use the faster gate
plus affected browser verification. No gameplay browser suite was repeated for this tooling-only
change. At this T2 checkpoint the reviewed changes were uncommitted and animation had not begun;
the A0 entry above records the subsequent delivery.

### P7 — public repository and hosted delivery — 2026-11-20 (complete)

**P7 is published and verified at `3934e17eb90884dbecf2b4e31ca44459e9b58d12`.** The parent pushed
the reviewed local configuration to `origin/main`, confirmed the repository is public
(`isPrivate: false`), and created Pages with `POST /repos/tmbritton/the-hollow-crown/pages`,
`build_type=workflow`. The public HTTPS site is live:

- **Play:** https://tmbritton.github.io/the-hollow-crown/
- **Source:** https://github.com/tmbritton/the-hollow-crown
- **Successful deployment:** [GitHub Actions run 44745698117](https://github.com/tmbritton/the-hollow-crown/actions/runs/44745698117)

#### Actual GitHub Actions result

Parent-reported run **44745698117** succeeded at the full commit above, completing at
**2026-11-20T13:44:59Z**. The **build job took 8m 47s** and **deployment took 15s**. CI passed
the required `npm run check`, root build/production browser smoke, and Pages build/project-path
browser smoke before uploading and deploying the verified site artifact.

#### Actual hosted production result

The parent ran this against the deployed site, not a local preview:

```sh
DEMO_URL=https://tmbritton.github.io/the-hollow-crown/ npm run test:production
```

It passed **five reported checks with zero browser/network errors**. The saved
`test-results/production-the-hollow-crown.json` was read for this delivery record: its URL is
the HTTPS demo above, all **31 requests** remain under `/the-hollow-crown/`, and `errors` is empty.
The report covers seeded bootstrap/rendering, real map/movement input, held F/release, seed entry,
random regeneration, quality/menu resume, and absence of development hooks and external assets.
`window.__dungeon` is absent even with `?debug`; F2 makes no Inspector request.

The parent read and reviewed the actual hosted
`test-results/production-the-hollow-crown-{lowered,defending}.png` captures, confirming the rendered
game, controls and correct lowered/raised shield poses. These hosted results and the GitHub run
are attributed to the parent; this documentation-only delivery does not rerun browser suites.
The hosted report/captures replace the same-named earlier local project-path artifacts; the local
results below remain historical evidence. Generated artifacts remain ignored.

The independent prepublish **READY, no blockers** verdict and earlier local checks are retained
below with their original qualifications. **P8 directional ragdolls are next, not implemented;
P9 skeleton debris follows P8.**

### P7 — independent prepublish review — 2026-11-20 (historical prepublication checkpoint)

The independent prepublish reviewer returned **READY, no blockers**. The user authorized the
normal-hook commit of the intended P7 local configuration. **The repository is still private;
Pages setup/deployment and hosted verification remain pending**, owned by the parent after the
commit hash is returned. P8/P9 remain queued after publication.

The following are **attributed reviewer results**, not additional local implementation runs:

- Actionlint and diff checks pass, along with **four server-helper tests on Node 24.22.3**.
- URL/base, custom-port, query, owned cleanup, reused-server and remote-server probes pass.
- All official action pins and metadata were independently confirmed.
- Root and project-path production reports each show **five checks / zero errors**; all **four
  lowered/raised-shield captures** were reviewed. The reviewer reused the recorded **315 tests,
  full checks and build** below.
- GitHub inspection confirms administration access, Actions enabled, private repository visibility
  and no Pages site (**404**). This establishes setup readiness, not a deployed result.

No production corrections or repeated browser suites were required. The normal commit hook runs
`npm run check` (tests/typecheck, lint, format). Raw `docs/notes.md` remains excluded from the commit.

### P7 — local release configuration — 2026-11-19 (historical pre-review checkpoint)

Implemented against **P6b `806a27b`**. This is local build/release verification, **not a hosted
deployment or independent-review approval**. Read-only repository/API inspection confirms private
visibility, default `main`, `has_pages: false`, and Pages **404**. Parent review, commit, visibility,
Pages setup, push/deploy and hosted verification remain pending; P8/P9 follow publication.

#### Red → green

With the baseline root bundle and the new real-browser/path-aware preview fixture:

```sh
vite build
DEMO_URL=http://localhost:4187/the-hollow-crown/ npm run test:production
```

The browser failed **before the Pages build fix** with:
`Runtime request escaped deployment base /the-hollow-crown/: http://localhost:4187/assets/index-jOJsluc9.js`.
This tests emitted URLs and actual browser requests rather than matching source configuration.
`build:pages` now passes `--base=/the-hollow-crown/` to the existing checked build; `preview:pages`
passes the same option to preview. The helper forwards a local smoke URL's pathname as preview's
base and retains existing strict-port ownership/failure cleanup. Remote URLs start no local process.

One root fixture attempt stopped at a hidden regeneration button: `#loading.done` remains set
between runs. Waiting for the new scene's welcome toast fixed the fixture; no runtime change.
The successful final browser batch was:

```sh
npm run test:production  # existing root build
npm run build:pages
DEMO_URL=http://localhost:4187/the-hollow-crown/ npm run test:production
```

Both **Chromium/SwiftShader** smokes pass with **five reported checks / zero errors**, sequentially,
at 960×640 with a **120s browser deadline**. They verify:

- Explicit MOURNING-731 navigation bootstraps, renders, and loads JS/CSS and dynamic shader chunks
  from the same origin under the chosen base. Project capture contains **31 requests** including
  the document; all requests remain beneath `/the-hollow-crown/`.
- Real M toggles the map; D updates its rendered player marker; X cancels. Ordinary R/wheel input
  frames the hero, and held F/release produces captures for visual review.
- Menu seed entry selects BUILT-WORLD; random regeneration clears its seed query; both retain
  the deployment pathname. Low quality persists, and button/Escape menu/resume works.
- `?debug` exposes no `window.__dungeon`; F2 issues no Inspector request. No external asset,
  failed request, HTTP error, page error or console error is observed.

Reviewed `test-results/production-{root,the-hollow-crown}-{lowered,defending}.png`: all four show
the rendered dungeon, lowered side shield versus raised frontal shield and lowered weapon.
Defense damage/latch invariants retain the P5/P6 evidence; this smoke exercises production input
and presentation. Reports: `test-results/production-root.json` and `production-the-hollow-crown.json`.
Generated Pages HTML was inspected: entry, preload and CSS URLs all use the project prefix.
The generated JS search found no `__dungeon`, `ShowInspector`, `@babylonjs/inspector`, `localhost:`
or `github.io`. All captures/reports/build output remain ignored.

#### Required checks and workflow validation

Commands ran under **Node 24.22.3** through `npm exec --yes --package=node@24 -c '…'`.
After targeted green, one complete batch ran `npm ci && npm run format:check && npm run lint &&
npm test && npm run build`:

| Check | Actual result |
| --- | --- |
| `npm ci` using existing lockfile | Pass, 177 packages installed, audit reports zero vulnerabilities |
| `npm run format:check` | Pass, **148 files** |
| `npm run lint` | Pass |
| `npm test` including strict typing | **315 passed / 310.11s**; models **22 machines / 105 states / 226 branches** |
| `npm run build` including strict typing | Pass, **689 modules**, Vite **0.592s**, existing large-chunk warning |
| `npm run build:pages` during targeted batch | Pass, **689 modules**, Vite **0.624s**, same warning |
| `actionlint .github/workflows/pages.yml` | Pass, official **1.7.12** binary; download digest matched GitHub release metadata |

The final full build leaves `dist/` in **root mode**; rebuild with `npm run build:pages` before
manual project preview. Source/runtime assets were unchanged between both smoke passes and final build.
No broad gameplay browser suite or unrelated visual suite was repeated. Owned previews on **4173/4187**
and browsers closed after both failure and success; listener checks showed both ports free.

GitHub `releases/latest` and `git/ref/tags/<version>` were queried directly for each official action;
all refs below resolve to **commit** objects, and full SHAs are pinned in the workflow:

| Action | Actual release | Verified commit |
| --- | --- | --- |
| `actions/checkout` | `v7.0.1` | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node` | `v7.1.0` | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| `actions/configure-pages` | `v6.0.0` | `45bfe0192ca1faeb007ade9deae92b16b8254a0d` |
| `actions/upload-pages-artifact` | `v5.0.0` | `fc324d3547104276b827a68afc52ff2a11cc49c9` |
| `actions/deploy-pages` | `v5.0.1` | `368f82528645a54fb793d4d04e342629a3f51346` |

The Pages actions' tagged `action.yml` contracts were read. The workflow uses only `contents: read`
while installing/checking/building/testing, uploads only final Pages `dist/`, then grants only the
deploy job `pages: write` / `id-token: write`, with `github-pages` environment/output URL. It runs
on main pushes or manual main dispatch, with serialized non-cancelling concurrency. Configure Pages
does not auto-enable the site; the publisher must first select **GitHub Actions** as the Pages source.
README records exact publication and remote-smoke commands. Workflow execution on GitHub remains
unverified until the parent publishes. No agents, staging, commit, push or GitHub settings changes.

### P6b — final independent review and delivery — 2026-11-19 (complete, READY; historical checkpoint)

The final independent reviewer returned **READY**, clearing both production blockers. **P6b is
complete**, and the user approved its normal-hook feature commit. The containing commit records
the phalanx feature against P6a **`c3641c2`**. **P7 publishing is next; P8/P9 remain queued after P7.**

The following are **attributed final-review results**, not additional implementation runs:

- Fresh **24 circular arrangements** all hit within **12.9167s**, at most **2 route submissions**,
  minimum separation **0.90282044**, maximum step **0.02**. The adverse original seeded approach
  hits at **13.1333s**.
- Both javelin entity orders hit the earlier ally at **z=.8471111515**, preserving **100 player HP /
  44 ally HP**; crossbow controls retain the original rules. **600 independent geometry-oracle
  comparisons** and contact-boundary checks pass.
- Recovery lifecycle probes pass: live obstruction removal, target loss/return/reacquisition,
  spearman death and same-ID target replacement. The reviewer's bounded-obstruction fixture
  settles by **30s, not 20s**, remains held through **120s**, then hits **4.23s** after the blocking
  body dies. This is a separate probe from the local cramped/immobile fixtures below.
- Group model **10 states / 47 branches / 1,950 paths** and attack model **4 / 13 / 210** pass.
  Pure navigation/progression checks preserve the altar gate. Diff, **13 captures**, phalanx
  **8-check** report and combat **15-check** report were reviewed. The reviewer reused the existing
  **315-test / full-check / build** evidence.
- A non-blocking numerical observation is confined to roughly **3.3e-9** around exact tangency;
  offsets of **±1e-7** classify correctly. No production change was requested for this roundoff.

No new browser or broad implementation test run was needed for this approval. The normal commit
hook runs the repository's required tests/typecheck, lint and format checks. Raw `docs/notes.md`
remains user-owned and excluded; the parent's P7–P9 planning edits are preserved. P1 remains closed.

### P6b — independent-review corrections — 2026-11-19 (verified before final READY review)

Independent review returned **BLOCKED** on two production defects: reachable ranks could remain
holding forever, and javelin body selection depended on ECS iteration order. Both now have local
failing-before-fix regressions and passing corrections. Re-review was pending at this checkpoint;
the final **READY** verdict above clears both blockers.
The earlier **305-test** implementation result below is retained as a **pre-review baseline**.

#### Red → green

Before production edits, `node --test --test-name-pattern='review:' tests/phalanx.test.ts`
failed **0 pass / 3 fail** in **4.32s**:

| Reproduction | Before | After |
| --- | --- | --- |
| Flat circular gathering: shields `(1.5,0)`, `(0,-1.5)`, `(-1.5,0)`; spear `(0,1.5)`; hero `(.575,7)` | **60s**, `holding`, **0 impacts / 100 HP**, forward clearance free | First hit **12.9167s**, **90 HP**, one impact |
| Original MOURNING-731 stable gathering; hero `(-2,-61)` | **20s**, `holding`, **0 impacts / 100 HP** | First hit **13.1333s**, **88 HP**, one impact |
| In-flight javelin `(0,.8,h=.85)`, velocity `+z 10`; ally `(-.455,1)`, hero `(.455,1.02)` | Player-first **90 HP**, ally-first **100 HP** | Both **100 HP**, no friendly damage; first contact **z=.8471111514857935** |

The preliminary red attempt also used an overly tight per-frame movement assertion: the existing
shared motor can finish a sub-0.025 connector with a **0.02** step. That test-only bound was corrected
and all three actual failures were rerun **before** changing production code.

- **Formation fix — `src/koboldSquads.ts`:** retain pending local detours while holding. After the
  chart's one-second hold, poll at most twice per second and prepare at most one slot route plus
  one bounded yield per living member. The chart's existing `canReform` event fact now admits routed
  recovery without requiring every direct connector to be clear. Search/progress caches record the
  target, anchor/heading, nearby external bodies, blockers and door state. Repeated attempts require
  changed external geometry or **0.25** improvement in the best total remaining route/slot distance.
  No additional phase flag/chart or independent attack clock was introduced.
- **Bound correction discovered during focused verification:** the first recovery version passed
  the reported cases but failed the existing cramped-stairs hold assertion (**55 pass / 1 fail** in
  the wider focused batch). A bounded probe exposed a whole-keep route and repeated yielding.
  The final fix limits assembly routes to **12 units**, including routes internally replanned by
  the navigator, and requires the progress above. The strict existing hold assertion is retained
  and strengthened: **15–30s** in the unchanged cramped fixture adds **zero routes or movement**.
  The immobile-adapter fixture likewise adds zero routes in its second 15 seconds. Ordinary return
  routes are unaffected by this formation-only limit.
- **Javelin fix — `src/combat.ts`:** analytically intersect horizontal cylinder and vertical slab
  intervals for every living non-owner body in each existing flight substep; choose the earliest
  entry, with entity-ID ties. This handles grazing entry/exit between samples, stationary/vertical
  flight, reverse travel and current jump elevation. Check terrain/doors only up to the earliest
  contact, preserving earlier cover while allowing a body hit before later cover in that substep.
  Friendly interception consumes the projectile without damage. Crossbow selection/allegiance is
  unchanged. Actor views are sampled once per projectile-system update; pool caps are unchanged.

**Final regression metrics:** all **24 circular role permutations** land a hit within **12.9167s**,
with at most **2 route submissions**, minimum separation **0.90282044**, maximum step **0.02**.
Repositioning the same threat to `(2,3)` also produces damage (**80 HP** at the end of that fixture).
`tests/projectile-contact.test.ts` exercises **108 cases** across six insertion orders: 24 rotated/
reverse edge cases, 12 grazing/nearer-hostile cases, 24 stationary/inside/away/vertical cases,
24 airborne/sloped-flight cases, 18 before/after-cover/closed-door cases, and six crossbow controls.

#### Checks actually run for this correction

- Phalanx/projectile focused batch: **23 passed**, **8.61s** at the initial green checkpoint.
  Subsequent bounds correction: **7 focused regressions passed**, including both reports, the
  24 permutations, narrow-hold behavior and immobile adapter. Final strengthened seeded-hold
  and both existing physical-return regressions: **3 passed**, **14.83s**.
- Focused models pass: group **10/10 states / 47/47 branches / 1,950 generated paths / 480 cyclic
  steps**, attack **4/4 / 13/13 / 210 / 480**. Added the noncohesive-but-routable reform event
  partition; no machine states or transition branches changed. The final full model report is
  complete at **22 machines / 105 atomic states / 226 branches**.
- One fresh **Chromium/SwiftShader phalanx pass: 8 checks**, zero errors, **24.24s** including owned
  server lifecycle. Added actual original-seed and circular-rank recovery using Babylon collision
  adapters, plus the real in-flight edge interception in both ECS orders. Seeded recovery hits at
  **13.1667s / 88 HP**, minimum separation **0.90031539**; circular recovery hits at **12.9667s /
  90 HP**, minimum separation **0.90688869**. Both use **2 route submissions**. The report's attack
  counter is cumulative across fixtures; health loss proves a new impact in each recovery case.
- One fresh **Chromium/SwiftShader combat pass: 15 checks**, successful report, **66.50s** including
  server lifecycle. Pursuit, shared movement/body collision, corpse/water behavior, crossbows,
  doors/locked gates, resets and regeneration pass.
- Reviewed both new recovery captures and all eleven refreshed phalanx views in the three contact
  sheets. They show completed front/rear ranks, the exposed opening, spear contact/release and
  threat-facing retreat. The seeded recovery view retains the original stable furniture/collision.
- Reused the earlier **social 15 / defense 9 / tribute 9** browser evidence for unchanged activity,
  held-input, work/cargo and lifecycle paths. Current formation behavior is covered by the new
  phalanx suite; current pure/model/full tests include social return and tribute takeover. No full
  gameplay, Firefox or unrelated browser rerun.

| Final required check | Result |
| --- | --- |
| `npm run format:check` | Pass, **148 files** |
| `npm run lint` | Pass |
| `npm test` including strict typing | **315 passed**, **304.51s** |
| `npm run build` including strict typing | Pass, **689 modules**, Vite **0.580s**; existing chunk warning |

Lint, full tests and build each ran **once after targeted verification**. The first final-check
prefix stopped at formatting in `tests/phalanx.test.ts`, before lint/tests/build; formatting that
file and rerunning the batch passed. No failed/incomplete test run is counted as a pass.

Artifacts remain `test-results/chromium-phalanx-report.json`, `chromium-combat-report.json`,
`chromium-phalanx-recovery-{seeded,circle}.png`, refreshed `chromium-phalanx-sheet-{1,2,3}.png`
and the complete `machine-model-report.json`. Browser runs were sequential, with **240s per-suite
deadlines**, owned **5187** servers and cleanup; no 5173/5187 listener or owned test browser remains.

**Attributed independent-review passes**, not rerun or newly claimed local probes: 96 rotated
lane/corpse cases, all four action-clock boundaries, eight pre-impact death/interrupt and boolean
compatibility checks, five competing phase-guard checks, and complete group/attack models. Those
passes did not override the two reported blockers; the fixes awaited independent re-review at this
checkpoint. The final **READY** verdict above clears them. No agents, staging or commits were used
for the correction. Raw notes and existing services untouched. **P7 remains
next, P8/P9 follow publication, and P1 remains closed.**

### P6b — physical phalanx encounter — 2026-11-19 (pre-review implementation baseline)

Recovered the saved implementation against **`c3641c2`** after the reported interruption.
Runtime, rendering, fixtures and documentation were preserved. No production correction was
needed during this recovery. The attack model now also exercises `LONG_THRUST` and
`THROW_JAVELIN` with their actual authored durations/impacts and checks that an in-flight action
retains its kind/timing. **P6b is ready for independent review, not yet independently approved.**

#### Design and bounded behavior

- Each original four-member group physically assembles **three shield bearers ahead of one
  spearman**. Lateral spacing **1.15**, rear separation **1.2**, right-hand lane **0.575** units.
  Advance **1.1 units/s**, turning **0.65 radians/s**, ordinary terrain/door/living-body collision.
- The synchronous group chart owns assembly, engagement, opening, attack selection, recovery,
  hold, withdrawal, return and defeat. Individual `Attack` still owns impact/release/cooldown.
  A **0.6s** center-shield opening is genuinely vulnerable, remains open through the attack,
  then closes for **1.25s recovery**; coordinated actions also require **1.25s engagement**.
- Long thrust: **3.8 range / 12 damage / 0.35s impact / 0.85s duration**. Javelin:
  **9 launch range / 10 damage / 0.4s release / 0.9s duration**, travelling **10 units/s**.
  Impact/release rechecks the actual lane, forward aim, range, elevation, terrain and living
  interceptors. Javelins stop on friendly bodies without friendly damage; crossbow allegiance
  remains unchanged. Projectiles share the **32-live-entity cap**; one fixed 32-instance shaft
  pool is added. Blood/dust/block fragments retain the shared **192** cap.
- At **two casualties**, **≤35% combined surviving health**, or **spearman loss**, survivors
  withdraw at **0.85 units/s**, retaining threat-facing shields. Actual survivor offsets,
  **0.13-unit** cohesion gating and the slowest grounded pace keep withdrawal together.
  Water retains its **52%** speed factor; blocked withdrawal holds without snapping or healing.
- Assembly uses at most **17 footprint candidates**, a **six-second deadline**, twelve route
  rounds (at most one slot route and one yield route per member/round), and up to **16 local
  yield candidates**. Holding submits no routes until clearance permits reform. This deliberately
  does not implement single-file choke traversal: narrow/entangled approaches may remain in a
  defensive hold until clearance or the threat changes. The seeded stairs case verifies this;
  roomy stable/treasury cases attack from their original social positions.

#### Recovered evidence and new checks

No saved initial P6b failing-test log was found; **no interrupted-agent red result or final-check
pass is inferred**. The first resumed focused run was green. Saved browser reports were inspected
before reuse: phalanx **21:42:42**, social **21:43:12**, combat **21:44:25** local time, all after
the last runtime edit at **21:42:23** on November 19. Later phalanx-fixture editing only increases
navigation timeout. Defense/tribute reports predated P6b and were replaced by fresh runs below.
Older P6a/P5 entries retain their historical qualifications.

| Check actually run during recovery | Result |
| --- | --- |
| Focused phalanx, squad, combat and defense pure tests | **51 passed**, 20.99s |
| Focused squad model, social, independent objectives, off-screen tribute and survivor takeover | **6 passed**, 34.63s |
| Extended attack-kind model | **1 passed**, 0.41s command duration |
| `npm run format:check` | Pass, **147 files** |
| `npm run lint` | Pass |
| `npm test` (includes strict typing) | **305 passed**, **298.37s** |
| `npm run build` (includes strict typing) | Pass, **689 modules**, Vite build **0.602s**; existing large-chunk warning |

The four required final commands each ran **once**, after targeted checks. Complete model report:
**22 machines / 105 atomic states / 226 transition branches**. Squad: **10/10 states, 47/47
branches, 1,885 generated paths, 480 cyclic steps**. Attack: **4/4 states, 13/13 branches,
210 generated paths, 480 cyclic steps**, including all four action kinds. The full run also
includes the 100-seed tribute population/routes and three-seed sole-spearman takeover regressions.

Focused commands:

```sh
node --test --test-concurrency=1 tests/phalanx.test.ts tests/kobold-squad.test.ts tests/combat.test.ts tests/defense.test.ts
node --test --test-concurrency=1 --test-name-pattern='koboldSquad|actual offscreen|survivor takes|remote shared|resolve independently|a social pack' tests/models.test.ts tests/tribute.test.ts tests/social.test.ts
node --test --test-name-pattern='model coverage and invariants: attack' tests/models.test.ts
```

#### Browser and visual review

All relevant suites use headless **Chromium/SwiftShader**. Saved, complete, unchanged-runtime
reports reused rather than repeating their passes:

- **Phalanx: 6 checks**, zero errors, eleven captures. Real collision-adapter advance, front/rear
  ranks, vulnerable opening, actual thrust/throw damage, travel/release pose, backward withdrawal,
  modal pause, fresh groups and one javelin pool after regeneration.
- **Social: 15 checks**, zero errors. Four-member cards/hacky-sack/smoke, threat interruption,
  physical ranks or safe hold, return and drawn/stowed corpse equipment.
- **Combat: 15 checks**, successful report. Existing species fixtures, pursuit/moving strikes,
  living collision, full-speed corpses/water, shared doors/locked gate, cancellation, respawn
  and regeneration. These isolated species fixtures do not replace the intact phalanx checks.

Fresh suites ran sequentially through owned **localhost:5187** Vite scopes with a **240s per-suite
deadline**. Each closed its browser in `finally`; the server helper closed only its owned session:

- **Defense: 9 checks**, zero errors, **19.40s** including server startup/cleanup. Real F input,
  melee/bolts, guarded movement/stairs/corpse contact, jump/X, focus/menu/inspection/hidden tab,
  teleport/death and role-aware regeneration latch checks.
- **Tribute: 9 checks**, zero errors, **117.16s** including server startup/cleanup. Physical
  off-screen deliveries, real pointer interception/E recovery, surviving-role takeover, independent
  shrine outcome, modal/work pauses, HUD and regeneration. Three repeated same-seed samples remain
  **2,291 meshes / 28 materials / 4 textures / 49 effects / 34 shader sources**. These software
  checks establish bounded resources, not a hardware FPS benchmark.

Equivalent reusable suite invocation (the temporary recovery runner additionally enforced the
deadline and printed elapsed time):

```sh
DEMO_URL=http://localhost:5187 node --input-type=module -e 'import { withViteServer } from "./tests/testServer.ts"; await withViteServer(process.env.DEMO_URL, "dev", () => import("./tests/defense-browser.ts"));'
# Repeat separately with tests/tribute-browser.ts.
```

**Actual visual review:** composed and inspected three contact sheets from all eleven retained
phalanx captures. Front/side show three broad shields and the distinct rear rank. Opening clears
the center chest/lane; side load/impact views show the shaft extending to the hero. Throw windup
and flight show the shorter weapon leaving the hand. Retreat front/side show the surviving guard
still toward the hero, separated from the fallen members. The front thrust view partially hides
the shaft behind the hero; the side impact view supplies the readable contact. Also inspected the
seeded hacky-sack engagement and refreshed tribute-carrier capture.

Artifacts under ignored `test-results/`: `chromium-phalanx-report.json`,
`chromium-phalanx-sheet-{1,2,3}.png`, the eleven `chromium-phalanx-*.png` source views,
`chromium-social-report.json`, `chromium-combat-report.json`, `chromium-defense-report.json`,
`chromium-tribute.json` and the complete `machine-model-report.json`.

Final checks found no **5173/5187** listener or owned Vite/Playwright browser process. Existing
**4096/tailnet 8443** services and raw `docs/notes.md` were untouched. No subagents, staging or
commits. **P7 is next; P8 directional ragdolls and P9 skeleton debris remain queued after P7.**
P1's application investigation stays closed; no cause or fix for the machine freeze is claimed.

### P6a — four-member squad foundation — 2026-11-19 (complete, independent review READY; historical baseline)

Baseline **`975c533`**. Three existing packs each start with **three shield bearers and one
spearman**: **12 kobolds / 24 enemies**, with no new rooms. ECS `koboldSquad` owns the synchronous
`idle / assembling / engaging / returning / defeated` chart and one target entity reference.
Original member/role/slot references persist through casualties; each actor retains its own chart.
Shared perception and damage drive real decisions/work interruption, assembly guard, ordinary melee,
navigation and return/yield. P6b's physical phalanx and special attacks/withdrawal remain planned.

#### Final independent review — READY

The final reviewer cleared the role-aware defense-test blocker and reported **no other issues**.
It inspected the **9-check / zero-error defense report**, the complete **22 machines / 100 states /
196 branches** model report and the **291-test** result after all corrections. The existing build
remains valid. These are attributed reviewer findings, reusing the implementation verification.
The prior independent 100-seed/1,100-route, 24-home-permutation and 1,260-pose probes remain attributed
below. The **18 + 5 continued gameplay checks** retain their timeout qualification.

**P6a is complete and authorized for its normal-hook feature commit; P6b is next, not started.**
The containing feature commit records P6a. P5 remains **`975c533`**.

#### Independent review and test correction

The independent reviewer reported **no production defect**, but returned **BLOCKED** on the
obsolete defense-browser regeneration assertion that no enemy has a defense component. Its focused
MOURNING-731 reproduction evaluated the original line-434 expression to **true** and failed
`true !== false`, with exactly **nine** shield-bearing enemies. This is the supplied reviewer red
evidence; the broad suite was not rerun just to reproduce that known failure.

The following are **attributed reviewer results**, not additional local verification runs:

- **8 squad tests** and squad model **5 states / 17 branches / 1,302 paths / 480 cyclic steps**.
- **100 other seeds**, exact populations across **300 squads**, and **1,100 work routes**.
- **24 circular home permutations**, minimum separation **0.908**, maximum step **0.04833**,
  with no overlap or teleport.
- **1,260 poses / 237,600 mesh corners**, passing shadow/envelope checks (reported worst envelope
  value **0.664**); shield-facing dot **1**; death/regeneration checks, old mesh disposal and zero errors.
- Reviewed idle, engaged and assembly captures; reused the recorded broad implementation results.

The test now asserts exactly **9 shield bearers with defense**, **3 spearmen without defense**,
and **8 skeletons / 4 goblins without defense**, checking every enemy's role/capability pairing.
The hero's regeneration-held-F, repeated keydown, key-up and fresh-press latch sequence is retained.
No production code changed for this review correction. The tribute artifact path below is corrected
to the actual `test-results/chromium-tribute.json`.

**Local green checks after correction:** one Chromium defense-suite run passes **all 9 checks**,
with zero errors (`test-results/chromium-defense-report.json`). `npm run typecheck`,
`npm run format:check` (**143 files**) and `npm run lint` pass. One full `npm test` run after all
corrections passes **291 tests in 363.82s**, including both return regressions and all **22 machines /
100 states / 196 branches**. The full model report is complete again. The existing build and
squad/social, tribute and gameplay browser results are reused. Owned 5187 Vite/browser scopes were
closed; raw notes and existing services were untouched. No agents, staging or commits.
Follow-up review was pending at that correction checkpoint; the final **READY** verdict above
clears the blocker.

#### Red → green

- Before production edits, `node --test --test-name-pattern='squad|100 deterministic'
  tests/kobold-squad.test.ts tests/tribute.test.ts` failed **0 pass / 2 fail**: missing squad module
  and **21 !== 24**. Role/reference/behavior contracts were authored in that initial test file.
- The strengthened **100-seed tribute corpus** passes with exact 8/4/12 species totals, four
  members and three-shield/one-spear roles in each pack, four social participants, live occupancy,
  reserved intervention approaches, three reliquaries and reachable pre-altar work routes.
  Longest shrine/cache route: **126 tiles**. Existing scene, keep/history and portrait fixtures pass.
- Three seeded sole-spearman survivors physically collect and deliver their predecessor's dropped
  cargo. All-four off-screen deliveries, original-reference replacement rejection, shared-alert
  interruption at the ready-work boundary, recovery and independent/simultaneous shrine outcomes pass.
- Browser discovery: one return retained a **64s** route around a temporary ally obstruction.
  `--test-name-pattern='long detour' tests/kobold-squad.test.ts` failed before cadence-based refresh.
- Browser discovery: two members occupying each other's homes stayed returning beyond **90s**.
  `--test-name-pattern='physically yields' tests/kobold-squad.test.ts` failed before deterministic
  first-displaced-slot yielding. Both fixes use ordinary routes, living clearance and the current
  squad lifecycle. Final browser returns: **3 / 2 / 5 seconds**, each below the asserted 20s bound.

#### Checks actually run

- Initial required batch after focused tests: **format, lint, npm test, build all pass**;
  **289 tests** in **284.91s**. This precedes the two return regressions/fixes above. There was
  **one full npm-test run at that implementation checkpoint**; the later 291-test review-correction
  run above includes both return fixes.
- Final affected batch after corrections: **25 squad/combat tests + 6 focused model/social/tribute
  tests = 31 passing tests**, followed by format, lint and build (including strict type checking).
  Formatting covers **143 files**. Existing bundle-size warning only.
- Full-run model coverage: **22 machines / 100 states / 196 branches**. Squad: **5/5 states,
  17/17 branches, 1,302 generated paths, 480 cyclic steps**. The filtered model run also passed;
  the review-correction full run has refreshed `test-results/machine-model-report.json` with the
  complete machine catalog.

Final focused commands:

```sh
node --test tests/kobold-squad.test.ts tests/combat.test.ts
node --test --test-name-pattern='actual offscreen|survivor takes|remote shared|resolve independently|a social pack|koboldSquad' tests/tribute.test.ts tests/social.test.ts tests/models.test.ts
npm run format:check
npm run lint
npm run build
```

#### Browser and visual results

Chromium/SwiftShader suites ran sequentially on owned **http://localhost:5187** (5173 absent):

- **Squad/social: 15 checks**, all three four-member activities; shared assembly/engagement,
  ordinary melee, living separation, bounded physical return and drawn/stowed death equipment.
  `test-results/chromium-social-report.json`, no errors.
- **Tribute: 9 checks**; real E/pointer combat, all-four physical deliveries, dropped cargo,
  recovery/takeover, independent shrine outcome, modal pause, HUD and regeneration resources.
  `test-results/chromium-tribute.json`, no errors.
- **Gameplay: 18 checks + 5 continued checks**. The combined social/tribute/gameplay shell scope
  hit its **600s** tool budget after the main core route, collisions, hazards, inspection and quality
  checks passed. `test-results/chromium-report.json` truthfully retains that timeout/closed-page
  result, with no browser errors. Only the remaining regeneration tail was continued through a
  temporary test-only branch (subsequently removed): CINDER-42 and VIOLET-7 physical completion,
  resource cleanup, local assets and zero shader/browser errors all pass in
  `test-results/chromium-p6a-regeneration-report.json`. This is not an uninterrupted 23-check run.
- Final repeated MOURNING-731 regeneration: **2,284 meshes / 28 materials / 4 textures / 52 effects /
  34 shader sources**. Counts stabilize; this is not a hardware performance benchmark.

Reviewed actual four-role idle and engaged captures:

- `test-results/chromium-social-hackysack.png`
- `test-results/chromium-squad-hackysack-engaged.png`
- `test-results/chromium-social-smoke.png`
- `test-results/chromium-squad-smoke-engaged.png`
- Card idle/assembly/engaged views were reviewed too; ordinary walls partially occlude one member
  in some card views. The stable/treasury views clearly show all four, their three shields and the
  spearman's longer weapon. Tribute packing/carrier/delivered-exit captures were also reviewed.

Earlier browser attempts exposed the two return defects; a focused smoke attempt regenerated before
initial scene readiness and logged shader errors. The fixture now waits for readiness, stops its live
loop and normalizes only setup positions. Those failed attempts are not counted as successful passes.
All owned browser/Vite scopes, including the timed-out scope, cleaned up; a final port check found no
5173/5187 listeners. Existing 4096/tailnet 8443 services and raw notes were untouched. No agents,
staging or commits at those implementation/correction checkpoints. **Final independent review is
READY**, as recorded above.

### P5 — held-F frontal shield — 2026-11-19 (complete, independent review READY; historical baseline)

Baseline **`be29b8c`** (committed P4, independent review READY). Shared optional ECS defense uses
the synchronous XState `actorDefense` chart. Only the player opts in; the same component/request
boundary is available for future kobold shield bearers. A **120° inclusive front arc** uses
authoritative movement heading and incoming attack travel. It blocks all accepted frontal melee/
bolt damage before health mutation; side/rear attacks and untyped hazards still damage. Source
identity remains separate from direction, so a moved/dead shooter cannot reverse a bolt's front.

#### Independent review — READY, no P5 blockers

The independent reviewer reported the following passing checks. These are **attributed review
results**, not newly run implementation checks:

- **12 defense tests**; defense model **3/3 states, 4/4 branches, 21 generated paths and
  480 cyclic steps**.
- **11,316 angular cases**; **7,776 latch traces / 38,880 transitions**;
  **180 bolt width/support/arc cases**; **5 work-boundary cases** and **9 held-input/reset cases**.
- Focused real-browser windup interruption/F, modal/text input, jump, gold effect pool,
  regeneration and head checks, with **no errors**.
- Gold/blood particle counts **12/14 → 0/14 → 0/0**, shared cap **192**, stable mesh counts,
  and old-pool disposal on regeneration.
- Built-output development-debug identifiers: **zero matches**.

The reviewer corrected **two fixture issues**; those earlier failed attempts are not counted as
passes. No P5 production correction was required. Review reused the implementation's **281-test /
full-check / build** evidence and Chromium **defense 9 / combat 15** results below.
**P5 is complete and the user authorized its normal-hook feature commit**, recorded by this
entry's containing commit. **P6a squad coordination is next, not started.** P4 is **`be29b8c`**.

#### Test-first evidence and focused checks

```sh
node --test tests/defense.test.ts
node --test tests/defense.test.ts tests/models.test.ts
node --test tests/defense.test.ts tests/combat.test.ts tests/objective-work.test.ts
```

- **Before production changes:** initial defense run **1 pass / 4 fail**. Frontal melee left
  **94 rather than 100 HP**; frontal bolts left **93 rather than 100 HP**. Moved/dead shooter and
  block-then-rear scenarios also failed on real health loss. Existing range/cover/door/elevation
  guards passed. After lifecycle/model contracts were added, both files failed on the absent
  `src/machines/actors/defense.ts` module.
- **Green focused defense/model run:** 34 tests at that checkpoint. The final focused defense/
  combat/work batch passes **52 tests**, including all **12 defense tests**. No checks were weakened.
- Arc coverage uses three headings and eight relative angles for each hit type: straight front,
  both exact 60° boundaries, both 60.001° misses, both sides and rear (**48 combinations**).
  Bolts also test shooter relocation/death, missing owner, friendly-shield passage, cover and height.
- Blocks preserve the exact health-chart snapshot, grant no invulnerability and emit no blood.
  An immediate rear hit and terrain hazard still hurt. Invalid/nonpositive damage produces no
  feedback; invalid/zero direction cannot grant immunity. Particle count stays at most 192 and
  block fragments expire. Corpse, jump and concurrent raw-attack states cannot defend.
- Tests cover the last unresolved swing boundary and already-committed impact, target retention,
  autoswing suspension/release, ready-but-uncommitted work cancellation, opt-in kobold capability,
  jump/stop/teleport release latch, duplicate/repeated input, exact walk/run traces and 52% water.
- Defense model: **3/3 states, 4/4 branches, 21 generated paths and 480 cyclic steps**. Events
  partition eligible/ineligible and fresh/repeated presses, plus release/cancel in every state.
  Full totals: **21 machines / 95 declared atomic states / 179 branches**.

#### Affected browser and visual checks

Each full targeted suite ran once, sequentially, with owned temporary Vite on **5187**:

```sh
DEMO_URL=http://localhost:5187 node --input-type=module -e 'import { withViteServer } from "./tests/testServer.ts"; await withViteServer(process.env.DEMO_URL, "dev", () => import("./tests/defense-browser.ts"));'
DEMO_URL=http://localhost:5187 node --input-type=module -e 'import { withViteServer } from "./tests/testServer.ts"; await withViteServer(process.env.DEMO_URL, "dev", () => import("./tests/combat-browser.ts"));'
```

- **Chromium defense: 9 checks**, zero page/console errors. Real F down/up raises/lowers guard;
  melee and bolts block from the front and damage from behind. Moving the shooter after launch
  does not change the result. F at the last windup frame cancels damage, holds the selected enemy
  and suppresses autoswing; release permits the ordinary timed attack.
- Guarded walk/run retain **4.8 / 7.4 units/s** and matching flat/corpse position/speed traces.
  Guard remains raised through the actual seeded ramp route, with correct arrival/support height.
  Jump/X require a new press. Blur/menu/inspection/hidden/death/teleport clear the shield pose;
  physically held F repeats cannot resume it, but release/new press works. Modified F, an unowned
  repeat after release, repeated valid downs, and held-F regeneration all pass. Enemies have no
  defense component after regeneration.
- **Chromium combat: 15 checks**, zero page/console errors. Existing pursuit, moving attacks,
  living-body blocking, full-speed corpse/water traversal, door/gate commands, particles, reset,
  death/respawn and regeneration pass.
- **Capture review:** initial front/block screenshots put the skeleton in front of the shield;
  the first also retained the fading loading overlay. The ramp close-up looked into a wall.
  A **capture-only refresh** hid UI (and the attacker for the isolated raised views), settled
  presentation/cutaways without combat steps, and used a higher ramp angle. No production pose
  correction or second gameplay pass was needed. Four refreshed views were reviewed: front face
  clearly across the chest, shield thickness and placement ahead of the body from the side,
  sword down, block fragments at the shield, and supported ramp pose. The measured shield normal
  has **forward dot 1.0**, center **0.35000002 units ahead**, height **1.02966 above support**.

```sh
DEMO_URL=http://localhost:5187 DEFENSE_CAPTURES_ONLY=1 node --input-type=module -e 'import { withViteServer } from "./tests/testServer.ts"; await withViteServer(process.env.DEMO_URL, "dev", () => import("./tests/defense-browser.ts"));'
```

Artifacts (ignored):

- `test-results/chromium-defense-report.json` — the complete nine-check gameplay pass.
- `test-results/chromium-defense-visual-report.json` — four-view refresh, geometry and errors.
- `test-results/chromium-defense-{raised-front,raised-side,frontal-block,ramp}.png` — reviewed views.
- `test-results/chromium-defense-{walk,run}-{floor,corpse}.png` — initial moving samples;
  their HUD health/flash can retain earlier fixture damage and are not health assertions.
- `test-results/chromium-combat-report.json` and `chromium-combat-*.png` — affected combat pass.
- `test-results/machine-model-report.json` — complete current model coverage.

#### Final required checks

| Command | Result |
| --- | --- |
| `npm run format:check` | Pass, 140 files |
| `npm run lint` | Pass |
| `npm test` | **281 passed**, including strict typing, models and multi-seed generation; 277.55s |
| `npm run build` | Pass; existing large-chunk warning |

Format/lint each ran once after targeted checks. The first `npm test` attempt stopped during
typechecking on the capture helper's `Node.remove()`; it was corrected to `parentNode.removeChild`.
The next command was terminated at its **240s tool deadline** while generation was still running,
with no assertion failures. A **600s-budget rerun completed all 281 tests**, then built production.
The cleanup line received a scoped formatting/lint recheck. This records the failed/incomplete
attempts rather than treating them as passes. No full-browser, Firefox, production-smoke or
hardware-performance rerun is claimed; those older results below remain historical baselines.

Browser and owned Vite scopes closed in `finally`; existing OpenCode **4096** / tailnet **8443**
services were untouched. Raw `docs/notes.md` is unmodified. The implementation checkpoint used no
subagents, staging or commits and awaited independent review. The subsequent **READY** verdict
above clears that gate. P1 remains closed, P2 accepted, P3/P4 committed; **P6a is next**, with
P6b–P7 planned.

### P4 — skeleton lurch — 2026-11-19 (complete, independent review READY)

Baseline **`9f8e1d7`**. The implementation is render-only: a small stateless gait layer gives
skeletons a long left-leg load and quicker right-leg catch-up (**64/36** of measured stride),
bounded rib lean/roll/twist and trailing skull angles. It uses the existing travel-driven stride
and fade, and shares its stance/swing mapping with foot placement. Attack blending still follows
locomotion; weapon arms are unchanged and the skull layer yields to wind-up/impact. No motor,
collision, navigation, support, jump, damage-clock or machine definitions changed.

#### Independent review — READY, no blockers

The independent reviewer reported the following passing results. These are **attributed review
checks**, not a new implementation verification run:

- **23 targeted tests**.
- **6,480 ordinary-baseline poses**, all exact matches.
- **50,000 phase samples / 75 seams**.
- **8,640 actual skeleton frames / 6,162 plants**, with zero violations.
- Skull scale, reset, teleport and death probes.
- Diff check and visual review of skeleton captures **1–4**, ordinary control and reset views.

The reviewer reused the **268-test/full-check/build** evidence and the affected animation results
with **732 contacts** below. No code corrections were required. **P4 is complete at `be29b8c`,
committed with normal hooks.** At that delivery checkpoint **P5 held-F defense was next, not
started.** P3 is complete at **`9f8e1d7`**.

#### Test-first and focused checks

```sh
node --test tests/skeleton-gait.test.ts tests/corpse-terrain.test.ts
node --test tests/skeleton-gait.test.ts tests/corpse-terrain.test.ts tests/locomotion.test.ts tests/foot-placement.test.ts
```

- The first run also exposed a test-world `blockers` typo. With that fixture corrected and before
  production edits, the gait/corpse run was **9 pass / 2 fail**: mirrored left/right leg motion and
  a left foot released at 52% of the intended long loading phase.
- Green focused run: **23 tests**. Contracts cover asymmetry versus ordinary walking, complementary
  stance duration, periodicity/continuity, bounded torso/head offsets, stationary/blocked fade,
  airborne cadence, stop/teleport, actual 1.65-unit movement and unchanged navigation/attack/jump
  state. The shared contact regression asserts the rendered load-bearing sole as well as its plant.
- Pure contact sweeps: **24 flat crossings / 4,392 foot samples / 360 contacts**, including 72
  retained-anchor contacts; **20 ramp crossings / 3,880 samples / 294 contacts**. Maximum
  penetration **1.1553e-7**. The existing **886 ordinary turning stance samples** remain green.

#### Affected browser and visual review

The affected suite was run with an owned temporary server because 5173 was absent:

```sh
DEMO_URL=http://localhost:5187 node --input-type=module -e 'import { withViteServer } from "./tests/testServer.ts"; await withViteServer(process.env.DEMO_URL, "dev", () => import("./tests/animation-browser.ts"));'
```

- **Final animation pass succeeds**, with zero page/console errors, **32 corpse crossings / 732
  surface contacts**, maximum penetration **0.0000032682**. Skeletons are now included in both
  directions of the real seeded stair/corpse sweep. Foot/pelvis caps remain 0.46/0.14.
- **46 shared pose captures** retain player/other-enemy motion, attack, jump, death and grounding
  checks. Added **40 consecutive motor-driven captures** (five sequences of eight frames),
  plus **four reset captures**. Same-mesh ordinary control and lurch have identical position
  traces; flat/corpse lurch traces also agree exactly. The reference temporarily selects ordinary
  kobold gait on the skeleton mesh at the same requested 1.65 speed; it is not an old-build capture.
- The moving-attack sequence checks the ordinary weapon-arm blend every step and samples the
  existing **0.25-second** impact. The head lurch is negligible at impact; legs keep traversing.
  Render sampling preserves authoritative position, measured speed, support, jump and swing state.
  Authored mesh corners fit the unchanged **four-unit observation envelope**.
- Stop and teleport produce neutral torso/head and clear plants on the next sample; settled death
  clears them too. Visible-window blur preserves the existing enemy-simulation policy and clears
  hero motion. Regeneration creates neutral skulls, zero stride and empty plants.
- **Visual review:** the ordinary control stays upright with even alternation. Lurch frames
  36–60 show the ribs/skull tipped forward over the long load; frame 72 shifts back through the
  short catch-up, with the skull lagging. The front stair view makes asymmetric shoulder loading
  and bent knees visible. Corpse frames 48–72 raise the feet over the ribs/pelvis; sword frames
  38/43/47 distinguish wind-up, impact and follow-through. Stop/teleport return to the upright
  silhouette and death settles to the existing fallen pose.

**Iteration qualifications:** two incomplete suite attempts failed the inherited stationary
skeleton high-contact comparison. Its artificial 7.4 speed was corrected to 1.65, then its corpse
placement was centred beneath the new footfall: the old location sampled a low forearm edge
(sole 0.1505 versus flat swing 0.0764), rather than the intended high ribs/pelvis. A third attempt
passed assertions but failed off-viewport sheet cropping; the writer now renders each sheet
directly. The final complete suite passes. A narrow sequence-only run supported early visual
review; stair/weapon cameras were corrected. Following the successful pass, visual review found
a tribute coffer at the origin because the fixture stopped before its renderer's first update.
The fixture now performs that update; **only the 44 skeleton captures/assertions were refreshed**,
through `/tmp/opencode/p4-sequences.mjs`, with a separate current skeleton report. There were no
production fixes from these fixture issues and no combat, movement, full-game or Firefox repeat.

Artifacts (ignored):

- `test-results/chromium-animation-report.json` — complete affected pass, including skeleton samples.
- `test-results/chromium-animation-poses.png` — 46 shared poses.
- `test-results/chromium-skeleton-report.json` — final sequence-only refresh and reset results.
- `test-results/chromium-skeleton-sequences.png` — final 44-frame sheet.
- `test-results/chromium-skeleton-sequence-{0..5}.png` — ordinary, flat, stairs, corpse, attack,
  then reset views, respectively.

#### Required final checks

After targeted verification, each command ran **once**:

| Command | Result |
| --- | --- |
| `npm run format:check` | Pass, 137 files |
| `npm run lint` | Pass |
| `npm test` | **268 passed**, including strict typing and model/generation/gameplay coverage |
| `npm run build` | Pass; existing large-chunk warning |

Models remain **20 machines / 92 states / 175 branches**. Browser and owned Vite processes were
closed in `finally`, including failed attempts. Existing OpenCode 4096/tailnet 8443 services were
untouched. Raw `docs/notes.md` remains unmodified and excluded from the feature commit. The
implementation checkpoint used no subagents, staging or commit; the subsequent independent
**READY** review above clears the delivery gate. P1 remains closed, P2 accepted at `726af8a`,
P3 complete at `9f8e1d7`; P5 is next, not started, and P6–P7 remain planned.

### P3 — blocked-floor click/hold fallback — 2026-11-19 (complete, final independent review READY)

Resumed restored partial P3 work against accepted P2 **`726af8a`**. The user's corpse-traversal
clarification required no P2 fix. **Final independent review returned READY, clearing both
route-quality blockers. P3 is complete at `9f8e1d7`, committed with normal hooks.**
At that P3 delivery checkpoint P4 skeleton gait was next, not started. Raw `docs/notes.md` was
untouched and excluded from the commit.

#### Final independent review — READY

The final reviewer reported the following checks passing; these are **attributed review results**,
not another local verification batch:

- **17 partial-navigation tests**.
- **24 route/tie cases**: four rotations plus 20 cases; both reported route-quality blockers cleared.
- **72 body-cache/gate cases**.
- **100 stable held updates**, with zero new plans.
- Remote-body probe: **one initial plan**, then **16 held updates totalling 1.31 ms**.
- Diff check, browser report and capture review passed.

The reviewer reused the implementation's **263-test/full-check/build** results and the **16-check
Chromium movement pass** below. Its **139 ms cold-search** sample remains a documented, bounded,
non-blocking limitation; no hardware-FPS claim or general elimination of search hitches is made.
P3 is recorded by **`9f8e1d7`**, with P2 retained as **`726af8a`**. Historical pre-fix
qualifications below remain intact.

#### Independent review correction — verified before final review

The first independent review reported **BLOCKED** on two route-quality issues. Its **20
navigation/partial tests** and **12 additional rotated/enclosing, cage-release, door-collider,
relock, precise-arrival and settled-hold probes** passed. These are reviewer-attributed results,
not newly claimed local probes. The earlier **259-test/check/build / 15-movement-check** results
below remain the pre-fix baseline.

**Red first:** `node --test tests/partial-navigation.test.ts` produced **13 pass / 3 fail** before
production corrections. The new tests measure actual motor travel between commands:

| Reproduction | Before | After |
| --- | --- | --- |
| `[-9,9]²`, 6×6 central blocker plus 2×1 blocker at (4,0); start (-5,0), complete (0,0), (4,3), (4,-3) | Third command **24.634 units**, back around old west side; fresh **7.219** | **7.219 units**, via (6,0); rotated case also **7.219**, via (0,6) |
| 2×8 blocker, start (4,0), click (0,0) | Far endpoint **(-1.3203125,0)**, **13.877 units** | Near endpoint **(1.3203125,0)**, **2.674 units** |
| Opposing X/Z approaches | Positive X and Z took the far face; negative controls were short | All four approaches take their near face, **2.674 units** each |
| MOURNING-731 distant body, total x displacement **0.016**, 16 held updates at 120 ms | **4 plans**, **67.6 ms** total held-update time | **1 initial plan**, **0.85 ms** total for all subsequent hold updates |

- **Route cache:** reuse lazily checked directed graph connections instead of reconstructing a
  path through an old origin. After movement, current safe starting connections seed new parents
  and graph travel costs. An unchanged origin can reuse its exhausted tree only with unchanged
  body geometry. Cached and fresh route quality now agree in the reported physical traversal.
- **Endpoint ties:** candidates within **0.001 units** of the minimum target distance prefer the
  shorter graph-travel estimate, with deterministic coordinate ties only afterward. Refinement of
  the chosen approach still strictly improves target distance. An intermediate version applied
  the tie band during local alignment; the existing off-centre test rejected z=**0.337773** for
  requested **0.37**. Restricting that preference to candidate selection restored precision.
- **Distant motion:** compute occupied grid cells and swept directed-edge decisions only in each
  live body's small footprint. Reuse requires those decisions and door lock/open/collider state
  to agree. Body coordinates are not rounded. Exact body geometry remains relevant around the
  route and throughout the region of potentially better frontier anchors. Start connections,
  sub-cell candidates, smoothed segments and physical movement always use current geometry.
  Edges incident to an occupied cell are excluded from the signature: that cell already prevents
  traversal, and inside-body escape direction must not create irrelevant invalidations.
- **Safety coverage:** route entry and death still trigger replans. A **0.06-unit** same-cell
  frontier shift remains visible to held input. Another fixture moves a small body onto a swept
  edge while **all grid-cell occupancy results stay identical**; the cache invalidates and the
  actual motor arrives via a clear detour. Existing locked/closing gate, body release, exact AI/
  work, no-progress and precise-arrival cases pass. No machine definitions/guards changed.

**Costs and limits:** the remote-site fixture performs an initial selection search, so its timed
body-aware plan starts with warm static terrain: red plans cost **29.0 / 24.8 / 21.3 / 21.1 ms**;
the corrected single plan costs **38.2 ms**. The gain is avoiding irrelevant repeated plans, not a
claim that all searches became faster. The separate cold **4,213-tile** probe now uses **3,369
clearance calls**, taking **175.8 ms** in the final focused batch; 120 cursor-drift samples add
**118 calls / one additional plan**. Full-suite concurrent samples were **378.1 ms cold**, **84.7
ms** for the warm-terrain body-aware plan and **1.99 ms** for the 16 held updates. These timings
include host/JIT/load variation and are not hardware-FPS claims. Graph-occupancy changes anywhere
still invalidate conservatively; fast-moving distant actors can therefore still cause fresh
searches. Cold searches remain synchronous. Routing is the existing tile graph plus bounded
frontier refinement and smoothing, not a globally optimal continuous-space solver.

| Correction check actually run | Result |
| --- | --- |
| Focused partial/navigation/occupancy/locomotion/combat | **60 passed**, including **17 partial-navigation contracts** |
| Strict typing | Pass before browser; also included in full tests/build |
| `npm run format:check`, `npm run lint`, `npm test`, `npm run build` | Each run **once** after focused/browser checks; **263 tests** pass; existing bundle warning |
| Models | **20 machines / 92 states / 175 branches**, unchanged |
| Affected Chromium movement | **One pass, 16 checks**, no page/console errors |
| `git diff --check` | Pass |

The movement suite now actually travels to the opposing side of the same furniture before
clicking its blocked floor again, retaining the navigator/cache and asserting the short near-side
approach. Reviewed the first/opposite effective-ring captures plus refreshed lava and gate views.
The new capture is `test-results/chromium-movement-partial-opposite.png`; the report remains
`test-results/chromium-movement-report.json`. There was no browser retry or broader browser run
for this correction. The existing **5173** server was absent at the availability check; the test
used an owned **5187** server through `withViteServer`. Server and browser cleanup completed;
no pre-existing services were stopped or reconfigured. At that correction checkpoint follow-up review
was pending; the final **READY** verdict above subsequently cleared both blockers.

#### Initial implementation — observed red → green (pre-review baseline)

- The first resumed run of partial navigation, navigation, occupancy, locomotion and combat was
  **53 pass / 0 fail**. There is no retained evidence here for the interrupted implementer's
  initial red, and none is claimed.
- Three new audit regressions failed before correction: partial suite **10 pass / 3 fail**.
  Active held input retained endpoint **(-0.495361, 0.07)** after the gate opened instead of the
  exact **(3.1, 0.07)** request. A newly closed gate stopped travel at **x=-0.921071**, about
  **0.426** short of its safely reachable frontier. A rejecting physical adapter caused **12
  held-command restarts in five seconds** instead of one settled command.
- Corrections revalidate active held-command geometry, replan obstructed floor routes toward
  the original request, and retain the actual stopped position after the existing stuck timeout.
  **56 focused tests pass**, including gate/body release, exact-goal pursuit and existing corpse/
  water invariants. The partial suite has **13 contracts**. The inherited blocker fixtures lacked
  required IDs; the preliminary strict-type failure was corrected before final checks.

#### Initial semantics and bounds (pre-review baseline)

- `{ partial: true }` is explicit floor-input opt-in. Default AI, pursuit, door-capable and work
  routes keep their existing exact-goal behavior. Reachable floor coordinates are retained;
  fallback searches only the current reachable component, never a world-nearest point across a
  barrier. A picked floor is required; empty-space clicks cancel.
- Graph edges and final smoothed routes use swept furniture/door clearance, tile-boundary support
  checks, height limits and live cylindrical occupancy. Walls, void, lava and locked/closed gates
  remain barriers. The marker and ordinary arrival brake follow the **effective** destination.
- The finite tile graph visits each cell at most once per search. Only exhausted components are
  reused, connected back to the current position by a checked bridge. Door lock/open/physical
  collider state and live body position/support/size invalidate dynamic reachability; corpse
  geometry is absent. Static cells/edges are local to one immutable generated world.
- Frontier refinement is bounded to **1.5 units** from reached anchors, **12 bisections** and
  **10 eight-way refinement passes**. It requires at least **0.025** improvement and displacement.
  This remains the game's tile-graph router with local continuous refinement, not an exhaustive
  continuous-space planner or proof of a globally optimal path through sub-cell-only passages.
- Unchanged settled/failed holds do no new searches. Small cursor drift or changed-obstruction
  retries run at most every **500 ms**; explicit clicks and substantial cursor changes are
  immediate, and movement still probes live clearance every tick. Cancellation clears input/
  component caches; successful arrival uses the existing `ARRIVE` event. No machine definition
  changed, so existing navigation/door and other model partitions remain applicable.
- Large-component probe: **4,213 tiles / 3,332 cold clearance calls**, then **2 total plans / 90
  additional calls** across 120 drifting held samples in two seconds. The isolated focused cold
  search took **149 ms** here (full-suite concurrent sample **243 ms**); these are descriptive
  CPU observations, not a hardware-FPS claim. Broad live-body invalidation is conservative and
  can incur a fresh component search when an actor moves.

#### Initial checks actually run (pre-review baseline)

| Check | Result |
| --- | --- |
| Focused navigation/occupancy/locomotion/combat | **56 passed** |
| `npm run format:check`, `npm run lint` | Pass; each final required command run once |
| `npm test` | **259 passed**, including strict types, generation, work/pursuit and models |
| Machine coverage | **20 machines / 92 atomic states / 175 branches**, unchanged |
| `npm run build` | Pass; existing large-chunk warning |
| Final Chromium movement | **15 checks**, no page/console errors |
| `git diff --check` | Pass |

The final movement pass exercises real clicks/holds at blocked furniture, unreachable lava floor
and floor beyond the locked altar gate, effective-ring placement and settled immobility, precise
accessible detours/work faces, stairs, dynamic closure, real E opening, modal partial-route retry,
keyboard/X, inspection/focus cleanup and regeneration. Its first three assertion runs exposed
gate-fixture assumptions: the original ray hit the door rather than floor, the new partial endpoint
occupied the anti-crush zone, and approaching too soon legitimately reopened the closing leaf.
The corrected side-view/longer-approach fixture asserts the actual closed collider before testing E.
Those fixture failures are not claimed as production door defects.

One intervening attempt failed at `page.goto` because the external **5173** server was unavailable.
No pre-existing service was stopped/reconfigured. The final successful run used
`DEMO_URL=http://localhost:5187` with `withViteServer`; its owned server and browser closed in
`finally`. No full gameplay, additional rendering suite, Firefox or production-browser rerun.

Reviewed the new furniture/lava/gate captures and ordinary route capture: rings are on safe
floor beside the obstacle, with the gate approach on the locked side. Artifacts:

- `test-results/chromium-movement-report.json`
- `test-results/chromium-movement-partial-{furniture,lava,gate}.png`
- `test-results/chromium-movement-route.png`

### P2 — full-speed corpse traversal — 2026-11-19 (`726af8a`, final independent review READY)

Implemented against P1 **`6378d61`**. Final independent review cleared both the original contact
and ramp rotation-math blockers. **P2 is committed at `726af8a` and accepted by the user.** P3's
subsequent implementation is recorded above. At this P2 checkpoint raw untracked `docs/notes.md`
was read but not edited or staged.
**P1's application investigation is closed at the user's direction**: no
retained application memory leak was established. System configuration and driver diagnosis are
outside project scope; the earlier host observations are historical, not an active follow-up.

#### Final independent review — READY

The reviewer reported **READY**, with all P2 blockers cleared. These results are attributed to
the independent reviewer and were not rerun as another local verification batch:

- **10 targeted tests** passed.
- **4,005 rendered-chain round trips** passed, maximum endpoint error **4.22e-8**; near-zero
  lateral offsets remain stable. **12 reach-boundary probes** passed.
- Original flat goblin penetration: **4.35e-8**. Exact translated uphill goblin: **4.60e-9**.
  The rotated downhill running case had **eight contacts and no penetration**.
- **50 zero-time samples** showed zero drift. Airborne, focus-loss, teleport and corpse-removal
  probes passed. Diff-whitespace check passed.
- Review reused the implementation's **246-test/full-check/build** results, **28 crossings /
  575 contacts** animation report and reviewed captures below; no broad repeat was needed.

The user's explicit **“proceed”** authorized the feature commit with normal hooks, subsequently
recorded as **`726af8a`**. The raw user notes were excluded. At that checkpoint P3 had not started;
P1's scope closure is preserved.

#### Ramp rotation-math correction — verified after interruption

- **Attributed follow-up:** the original edge reproduction cleared; the reviewer found one new
  blocker on translated ramps. Near-zero down-distance made `atan2(side, down)` amplify lateral
  roundoff into ±π/2 roll. Its prior five terrain tests, normal probes and 42-capture review passed
  apart from this new ramp finding. Those remain attributed results, not fresh local runs.
- **Recovered state:** HEAD remained `6378d61`; the solver was still the old implementation and
  the new math test was present. All results in this section were actually run after resumption.
  The recovered animation test had **2,340 trailing NUL bytes** after its final closing brace;
  only that invalid tail was removed before browser verification. No system diagnosis/configuration.
- **Red first:** `node --test tests/foot-placement.test.ts` failed **0 pass / 3 fail** before the
  solver edit. A requested lateral offset of `-1e-15` became **-0.18** and the rendered vertical
  displacement became **-0.144** for the negative-forward case. Broader feasible lateral targets
  and neutral-origin continuity failed too. The assertions use actual Babylon transform nodes,
  not a duplicate inverse formula.
- The added real-seed stair sweep failed **6 pass / 1 fail**, reproducing the exact goblin
  **3.7 speed / frame 36** case: final foot **(-51.998093, 14.325648)**, surface **-0.780000**,
  sole **-0.848665**, penetration **0.068665363**, roll **π/2**. It uses the production motor,
  gait/foot solver and the actual settled vest dimensions over `MOURNING-731`'s generated ramp.
- **Analytic fix:** invert the actual `Rx(hip) * Rz(roll) * Rx(knee)` chain. With
  `a = upper + lower*cos(knee)` and `b = lower*sin(knee)`, lateral reach is `a*sin(roll)`:
  `roll = asin(clamp(side/a))`, `hip = -atan2(forward, down) - atan2(b, a*cos(roll))`.
  Long targets project radially to **0.499** reach; the region inside **0.04** projects downwards
  while preserving tiny horizontal offsets. Infeasible lateral targets project onto the chain's
  lateral boundary at the same extension and sagittal direction. This handles the whole feasible
  workspace and neutral singularity, rather than applying a side epsilon or extra iterations.
- **Bounds/ownership:** the existing **four** frame-local contact passes, **0.46** contact cap and
  **0.14** pelvis cap remain. No changes to the motor, water, occupancy, navigation, support,
  jump or combat elevation. Ordinary turning plants are checked on flat and sloping floor.
- **Focused green:** **28 tests** across inverse geometry, corpse terrain, jumping and locomotion.
  The inverse test checks **150 feasible rendered targets**, near-zero lateral offsets, origin
  continuity, reach limits and both sides of the lateral feasibility boundary. Terrain coverage:

  | Actual rendered-foot oracle | Result |
  | --- | --- |
  | 24 flat/rotated crossings, 4,392 foot samples | 428 contacts, max penetration **6.21e-8** |
  | 16 translated uphill/downhill crossings, 2,472 samples | 196 contacts, max **6.74e-8** |
  | Ordinary walk/run turns on flat floor and continuous stairs | **886** retained stance samples pass |

- **One affected animation-browser pass:** explicit `MOURNING-731` regeneration, stopped render
  loop and ordinary `moveActor` → `animateActors`. **28 crossings**: the previous 12 plus 16
  uphill/downhill goblin, kobold and walking/running player cases, with ordinary and rotated
  corpse headings. Each sole is compared with the sampled surface at its **actual x/z and real
  floor height** every frame. **575 contacts**, worst penetration **0.000003269** (limit 0.005).
  The reported goblin uphill crossing's maximum is **4.61e-9**. Support remains `heightAt`,
  elevation remains support, landing count stays zero, and each ramp route changes real height.
- Reviewed **46 pose captures**, including four new ramp poses. The first ramp row was partly
  obscured by a wall; the test camera now stays inside the corridor. A separate **four-view
  capture-only probe** refreshed just those views in
  `test-results/chromium-animation-ramp-contacts.png`, which supersedes the obscured ramp row in
  `chromium-animation-poses.png`. The unobstructed captures show bounded, bent-knee steps in both
  directions. No second full animation-suite pass; no combat/movement/full-browser rerun.
- After targeted verification, `npm run format:check`, `npm run lint`, `npm test` and
  `npm run build` each ran **once**, all passing: **246 tests**, strict typing and unchanged
  **20 machines / 92 states / 175 branches**. Existing bundle-size warning remains. Browser/server
  cleanup used `finally` and the shared owned-server scope. `git diff --check` passes.
  Reports: `test-results/chromium-animation-report.json` plus the captures above.
- At this implementation checkpoint, independent review was pending and no commit, staging or
  subagents had been used. The final **READY** verdict above clears the correction; raw notes remain
  untouched and P1 remains closed by user direction.

#### First independent review correction — final reachable foot contact (historical baseline)

- **Attributed review:** BLOCKED on one foot-contact regression, no other blockers. The reviewer
  passed **5,000 sampler-versus-triangle cases** (maximum error `1e-7`), lifecycle probes, and a
  **21-corpse / 461-part / 120-update** cache probe with zero repeated inversions. These are
  reviewer-reported results, not repeated measurements in this correction.
- **Red first:** added moving normal-speed/rotated regressions before runtime edits. The focused
  corpse suite was **4 pass / 1 fail**. Its final-position oracle catches a foot below a 0.42-high
  torso even when the desired target sampled clear floor. The browser independently reproduced
  the exact reviewer case at **goblin speed 3.7, frame 37**: retained anchor
  `(-0.341620, -0.182485)`, actual foot `(-0.280187, -0.182398)`, surface **0.42**, sole
  **0.071882**, penetration **0.348118**. Kobold speed 2.9 reproduced **0.338019**; the rotated
  kobold fixture reached **0.381863**. The pure fixture uses the actual settled vest dimensions;
  the browser uses complete production rigs and `moveActor` → `animateActors`.
- Initial browser fixture attempts disabled the subjects by comparing fresh `Actor` view object
  identity. That fixture was corrected to compare entity IDs before the recorded gameplay red.
  The pure oracle explicitly checks positive corpse surfaces; ordinary flight-phase floor pose
  tolerances are not treated as this corpse regression.
- **Fix:** ordinary forward-kinematics math computes the final foot endpoint after the existing
  leg reach clamp, lateral roll or normal running-flight pose. Up to **four bounded solve/sample
  passes** recheck that endpoint and resolve contact, recomputing both feet after pelvis assistance.
  Corrections are frame-local and capped at the existing **0.46 / 0.14** limits; they cannot add
  height across frames or bodies. High contact permits deeper knee folding instead of the former
  0.08 minimum down-distance that itself clipped tall torsos. Domain movement/support/jump and
  melee elevation, the corpse sampler and its cache are unchanged by this correction.
- **Pure green:** **23 focused tests** across corpse terrain, jumping and locomotion. The new
  moving test covers **24 crossings / 4,392 actual foot samples**, with **428 surface contacts**
  including **116 retained-anchor contacts**. Maximum penetration: **0.000033674** units.
- **Browser green:** only the affected Chromium animation suite was rerun, through the owned
  `withViteServer` scope; the browser closes in `finally`. Its **12 complete production-rig
  crossings** cover skeleton 1.65, kobold 2.9, goblin 3.7/5.2 and player 4.8/7.4, each with
  corpse headings 0 and 0.61 radians. **265 actual surface contacts** pass the **0.005-unit**
  penetration limit at every frame; worst measured penetration is **0.000061007**. The original
  goblin crossing's maximum is **4.35e-8**. Both foot positions, not just peak lift, are tested.
  Support/elevation and landing counts stay zero; soles remain finite and below 0.65.
- The refreshed **42-capture** sheet includes the original 38 comparisons and four moving-edge
  views: goblin frames 37/43, rotated kobold frame 47 and rotated walking player frame 25.
  Reviewed those captures for bent-knee contact and ordinary stride progression. Existing pose,
  attack-clock, volume, jump/landing and focus-reset assertions also pass. Reports remain
  `test-results/chromium-animation-{poses.png,report.json}`; JSON includes each crossing's worst
  actual-position sample. Combat/movement/full-gameplay browsers were not repeated.
- After targeted passes, required `npm run format:check`, `npm run lint`, `npm test` and
  `npm run build` each ran **once for the correction**, all passing. **241 tests**, including
  strict types and unchanged **20 machines / 92 states / 175 branches**; existing bundle-size
  warning remains. The full pure run follows AGENTS.md's code-change requirement. Earlier combat
  and movement browser results below are reused; no new sampler-performance or hardware claim.

#### Initial implementation — red → green (pre-review baseline)

- Initial `node --test tests/occupancy.test.ts tests/corpse-terrain.test.ts`: **9 pass / 3 fail**.
  The full-speed assertion failed at `player: corpse`; the 4.8-unit/s crossing trace dropped toward
  2.496 instead of matching unobstructed travel. Geometry contracts failed on the missing module.
- Replaced the old slowdown assertions with exact player/goblin/kobold/skeleton travel equality
  over single/overlapping corpses, walking/running traces, and 52% water-only/no-stacking checks.
  Living occupancy, safe routing, support and combat elevation assertions remain active.
- The first geometry implementation exposed stale child transforms after rotating a parent in the
  same scene render ID (**13 pass / 1 fail**). Changed nodes now synchronize parent-first before
  sampling. A later repeated-identical-transform contract failed (**3 pass / 1 fail**) on new
  inverse/box allocation; value-equal matrices now reuse weakly keyed cached data. The tilted-box
  fixture was first lowered so its expected slope was not obscured by the intentional height cap.
- **50 focused tests passed** across corpse geometry, occupancy, jumping, locomotion and combat.
  Four new geometry/foot contracts cover actual orientation/sloped surfaces, different floors,
  hidden/living/falling exclusion, swing-only anticipation, bounded highest-surface overlaps,
  300 repeated foot samples per actor kind, removal/fresh ECS, stop/teleport and airborne bypass.

#### Semantics

- Corpse geometry never enters movement speed, collision, navigation, support height or jump state.
  Water alone applies **0.52** to grounded speed. Existing melee/projectile elevation stays derived
  from real support plus actual jump height. Living actors still block and stairs use real terrain.
- Death poses update before one shared render-only terrain sample. After **0.62s**, visible authored
  voxel parts provide oriented boxes. Vertical slab intersection gives the drawn top at each foot;
  overlap uses the highest surface, capped at **0.46**. Swing-only preview extends **0.35** units
  along travel. The leg solver adds bounded clearance and up to **0.14** visual pelvis assistance.
- Off-body poses use ordinary footing. Repeated poses cannot accumulate offsets. The same solver
  handles player/enemy rigs under attacks; actual jumps bypass corpse stepping. Stance anchors clear
  through the shared stop path and existing rig resets. Death still reveals stowed equipment.

#### Initial implementation checks (pre-review baseline)

| Check | Result |
| --- | --- |
| `npm run format:check`, `npm run lint` | Pass; each required command run once after targeted checks |
| `npm test` | **240 passed**, including strict typing and all pure/model/generation tests |
| Machine coverage | **20 machines / 92 states / 175 branches**; no new machine |
| `npm run build` | Pass; existing large-chunk warning |
| Chromium combat | **15 checks**, including six 48-frame flat/corpse/water crossings |
| Chromium movement | **13 checks**, including actual stairs, routes, doors and cleanup |
| Chromium animation | **38 captures**, including ten added corpse/species comparisons |
| `git diff --check` | Pass |

Browser entrypoints were run sequentially through `withViteServer('http://localhost:5173', 'dev',
...)`, importing `tests/combat-browser.ts`, `tests/animation-browser.ts` and
`tests/movement-browser.ts`. Browsers close in `finally`; the shared scope cleans owned servers
and preserves reused ones. Chromium uses SwiftShader, so these are correctness/visual checks.
There was one animation-only rerun after capture review corrected the goblin comparison to its
actual ranged action; both animation runs passed. No broad gameplay, Firefox, production-browser,
resource-profile or hardware-GPU rerun is claimed for P2.

Combat's real motor path has identical clear-floor/corpse **position and speed at every sampled
walk/run step**, a greater-than-0.15 increase in peak foot height, water speed within 0.001 of
52%, and zero support/combat elevation or landing-count changes. Existing live pursuit, damage,
living-body separation, menu/focus, respawn and fresh-world tests also pass. Movement independently
checks floor picking, ordinary stairs, furniture/doors, inspection and regeneration.

The pose sheet shows flat versus raised bent-knee contact and swing clearance, including moving
player sword attacks and all enemy species (goblin ranged action). Attack elapsed time and arm pose
match their flat-ground controls; sole heights stay between -0.02 and 0.6, visual root lift at most
0.18 including normal running bounce, and authoritative jump/support/elevation stay zero. Reviewed
the final sheet and refreshed moving-combat capture. Artifacts:

- `test-results/chromium-animation-poses.png` and `chromium-animation-report.json`
- `test-results/chromium-combat-report.json` and `chromium-combat-running-contact.png`
- `test-results/chromium-movement-report.json`

### P1 — resource investigation/fixes — 2026-11-19 (independent review READY; `6378d61`)

Baseline **`123b9a9`**. Resource-fix slice delivered; independent review returned **READY**, no blockers.
This fixes reproduced allocation churn and a test-server failure-path leak. **It does not prove
the original computer freeze fixed.** Earlier feature/browser results below remain baselines.

The user closed the application investigation on **2026-11-19**. No retained application leak was
established. System configuration and driver diagnosis are outside project scope; the host evidence
and limitations below are retained as historical context, not further work.

#### Host evidence and scope

The parent supplied a read-only host audit: **31 GiB RAM / ~20 GiB available / zero swap**,
Vite RSS **2,444,048 KiB (~2.33 GiB)** and combined OpenCode RSS about **4.5 GiB**. Boot `-1`
logs at **Nov 18 13:48–13:51** contain NVIDIA **615.78.08** TLB invalidation failures,
**Xid 62 (PMU halt)** and **Xid 154 (recovery)**, with no matching host OOM found in that audit.
These are attributed evidence, not measurements repeated by this implementation. A single RSS
snapshot does not establish a Vite/OpenCode leak; driver faults do not establish that the game's
heap caused them. No OS, drivers, services or pre-existing user processes were changed.

#### Red → green

- `node --test tests/last-ember-rendering.test.ts`: after correcting a missing-worker fixture,
  **3 pass / 1 fail**, observing **110 detached `ObjectiveRecord.get()` snapshots/update** instead
  of the allowed five. These reads each call `structuredClone`; state was read repeatedly inside
  the twelve-seal loop. Existing visual-state assertions already passed before the fix.
- Cached only the derived state **within one synchronous update**. XState objective/focus/work
  lifecycles remain authoritative. Subsequent updates reread progress and outcomes; tests cover
  work pulse, restoration, corruption/fracture, cleansing/repair, disabled focus and scenario removal.
- **4/4 renderer tests pass**, then **8/8 focused renderer/server tests pass**. One final isolated
  renderer run also passed with the real `CustomMaterial` types used by the fixture.
- An isolated temporary-port probe of the old startup sequence injected a browser-launch rejection
  before its `try/finally`; the owned Vite server still answered afterward. The probe's own process
  group was cleaned in `finally`. Killing only npm in a separate normal-teardown probe **did stop
  serving here**, so no observed normal-teardown orphan is claimed.
- `node --test tests/test-server.test.ts` failed first on the missing helper. Four passing contracts
  now cover callback/launch rejection and normal return, preserving a reused external server,
  readiness timeout/early exit/spawn error, and termination of an owned descendant listener even
  after its parent exits. `tests/browser.ts` and `tests/production.ts` place launch and cleanup in
  the shared scope. Browser close also survives page/report failures. Direct Vite startup avoids
  npm/shell indirection, with strict ports and a 20s readiness deadline; POSIX teardown signals only
  the newly created process group and awaits the child.

#### Measured allocation/CPU-path cost

| Probe | Before | After |
| --- | --- | --- |
| Detached reads per seal update, same idle-state fixture | **110** | **5** |
| Reads over 240 updates | **26,400** | **1,200** |
| Equivalent at 60 updates/s (arithmetic, not observed FPS) | **6,600/s** | **300/s** |
| Chromium synchronous update time, 12 yielding batches × 20 | **215.3 ms total; 0.897 ms/update** | **12.2 ms total; 0.051 ms/update** |
| Initial Node null-engine probe, 240 updates after 20 warmups | **122.65 ms wall / 140.42 ms process CPU** | **11.18 ms wall / 36.68 ms process CPU** |

Read count is the regression assertion; timing is descriptive and includes JIT/GC/host noise.
The Node green run overlapped the lightweight server test/browser startup; a later isolated typed
fixture run measured **9.22 ms wall / 14.79 ms process CPU**, also five reads/update. These are
bounded CPU-path observations, not a whole-game speedup or hardware-GPU frame-rate benchmark.

#### Bounded browser/resource results

`RESOURCE_REPORT=test-results/resource-baseline.json npm run test:resources` reproduced the
read-budget failure before the fix. `npm run test:resources` then passed. **Chromium/SwiftShader**,
**640×360**, low quality, `MOURNING-731`; one browser at a time, with a **60s deadline after launch**.
The script exercises real keyboard movement, one second of menu idle, resume, then three identical
regenerations. Each regeneration runs **120 fixed steps in ten 12-step batches**, yielding between
tasks and rendering; no long synchronous simulation. Old scenes are disposed and work systems
retired. CDP `HeapProfiler.collectGarbage` runs only in this isolated test browser, between raw and
collected heap samples. The report records the renderer string and CPU task/script counters.

| Three-regeneration samples | Before | After |
| --- | --- | --- |
| Raw used JS heap (MiB) | **150.31 / 133.70 / 136.16** | **158.73 / 129.06 / 147.85** |
| Post-GC used JS heap (MiB) | **98.89 / 99.58 / 100.22** | **98.91 / 99.65 / 100.29** |
| Backing storage bytes after GC | **15,690,980 each** | **15,691,438 each** |
| Meshes / materials / textures | **2,151 / 28 / 4 each** | **2,151 / 28 / 4 each** |
| Effects / generated shader sources | **55 / 34 each** | **55 / 34 each** |
| ECS entities / scenes / objective-work systems | **5,738 / 1 / 1 each** | **5,738 / 1 / 1 each** |
| DOM nodes / JS event listeners | **317 / 75 each** | **317 / 75 each** |

Active/pause/resume keeps one render loop; the controlled regeneration phase intentionally stops
it and renders explicitly. Menu idle freezes simulation (before **step 59 → 59**, after **53 → 53**)
and resume advances it. After-fix paused post-GC heap is **98.05 → 98.33 MiB**. Counts plateau;
post-GC heap increases about **1.38 MiB** over the three after samples, similar to **1.33 MiB** before,
within the test's **8 MiB** allowance. This demonstrates substantial transient allocation and no
whole-world retained-heap increase in this short sample. It does **not** establish an indefinite heap
plateau or reduced retained memory. Browser-native/GPU memory and long-run host stability are unproven.

The first browser fixture run was rejected for incomplete warmup (loading skipped most requested
steps). The corrected fixture waits for scene readiness and asserts exactly 120 steps per cycle;
only its corrected before/after reports are summarized above. An initial Vite optimization reload
also required explicit same-seed regeneration before sampling, consistent with the game's refresh rules.

#### Implementation checks actually run before review

- `npm run format:check`, `npm run lint`, `npm test`, `npm run build`: each required command ran
  **once after targeted passes**, all green; **236 tests**, strict types, **20 machines / 92 states /
  175 branches**. Build retains its existing large-chunk warning.
- Bounded resource/dev smoke: **pass** (`test-results/resource-report.json`); corrected red report
  preserved as `test-results/resource-baseline.json`. Both completed without the deadline firing.
- `npm run test:production`: **pass**, shaders/rendering, seed regeneration, menus, quality settings
  and absent development hooks, using the owned-server lifecycle.
- `git diff --check`: **pass**, including the documentation updates.
- Render-state assertions establish unchanged materials/scales/rotations across transitions; no
  intended visual change, so no new screenshot comparison. No broad gameplay suite, cross-browser
  rerun or hardware-GPU stress was performed for this slice.

#### Independent review — READY

The reviewer reported **8 targeted tests**, **3 adversarial cleanup cases** and `git diff --check`
passing, with no blockers. The additional cases cover a SIGTERM-resistant leader, a descendant
surviving leader exit, and stalled readiness. Review reused the implementation's **236-test**,
build, resource and production results above; no broad repeat was performed. These are attributed
independent results. The user authorized the feature commit with the normal pre-commit hook.

**At the P1 checkpoint, P2 corpse traversal was next.** The original host/driver freeze was not
explained or claimed fixed. Terminal objective-work sampling and possible duplicate visibility queries
were unmeasured audit candidates, not established causes. The user subsequently closed the application
investigation and excluded system/driver diagnosis from project scope. Parent priority edits are retained;
raw `docs/notes.md` is untouched and excluded from the feature commit.

### Independent royal tribute plan (O4) — 2026-11-19

Implemented against **`9be81bb`** (O3 committed, independently reviewed READY).
**Independent O4 review returned READY**, with no blocking findings.

#### Test-first evidence

- Initial `node --test tests/tribute.test.ts tests/models.test.ts` failed on missing
  `src/tribute.ts` and `src/machines/world/cargo.ts`, before production implementation.
- A real off-screen porter delivered once, then stalled returning to the cache. The focused
  corner regression failed because `goTo` accepted a route whose first `steer` returned null.
  Tile-boundary support partitioning now rejects that short unsupported corner; the real porter
  delivers all four crates. Ordinary movement/navigation regressions and full gameplay pass.
- Follow-up targeted tests reproduced **4 pass / 2 fail**: blocked work appeared Interrupted,
  and a retired scenario tried assigning through its removed work system. Both now pass.
- The first broad run exposed a damaged-world report fixture trying to recompute tribute sites
  from replaced tiles. Generated sites now persist as plain blueprint data; validation still
  rejects inaccessible routes. The report and original geometry fixtures pass.
- Browser fixture corrections handled CSS-capitalized labels, the new five-clock reset contract,
  and ordinary social tests explicitly isolating gatherings from the pack's new job priority.

#### Checks actually run

| Check | Result |
| --- | --- |
| Strict typing, `npm run format:check`, `npm run lint`, `git diff --check` | Pass |
| `npm test` | **228 passed**, including pure/generation/model tests |
| Cargo model | **5/5 states, 7/7 branches**, 70 generated paths, 480 cyclic steps |
| All models | **20 machines / 92 atomic states / 175 transition branches** |
| `npm run build` | Pass; existing large-chunk warning remains |
| `npm run test:tribute`, then Firefox | **9 checks each** |
| `npm run test:last-ember` | **14 Chromium checks** |
| `npm run test:objective-work` | **17 Chromium checks** |
| `npm run test:movement` | **13 Chromium checks** |
| `npm run test:combat` | **14 Chromium checks** |
| `npm run test:social` | **9 Chromium checks** |
| `npm run test:browser` | **23 Chromium checks**, three physically completed seeded keeps |
| `npm run test:production` | Pass, including absence of development hooks |

The new **100 `tribute-*` seed** corpus checks deterministic sites, reserved and reachable
pickup/intervention/delivery routes, safe initial population approaches, four unique crates,
three declared existing kobolds, 21 total enemies and three unchanged core reliquaries.
Longest shrine/cache route: **126 tile steps**, ~26s walking plus 36s ordinary restoration,
versus at least **112s** packing/unloading plus real porter travel. Combat/obstructions can delay
either side; this is a geometric response budget. Existing O3 and generation corpora also pass.

Pure integration covers pickup without credit, remote/blocked work, last-boundary damage/death,
denial while pickup is ready, original-instance ownership, survivor takeover, terminal replay,
partial deliveries, recovery/respawn/reset, and simultaneous independent O3/O4 completion.
Three additional keeps (`CINDER-42`, `VIOLET-7`, `tribute-12`) physically exercise survivor pickup
and delivery; MOURNING-731's live AI delivers all four through ordinary doors and corpse terrain.

Both tribute browser suites use real E and pointer combat with deterministic isolation fixtures.
They verify active off-screen clocks, shrine-first independence, ordinary lethal interception,
E recovery once, real survivor travel, partial thwarting, terminal delivered loot, menu/inspection
pause, blur, checkpoint respawn and fresh regeneration. Three repeated same-seed regenerations
per browser have stable resource counts and no page errors. Chromium samples: **2,151 meshes,
28 materials, 4 textures, 47 effects, 34 generated shader sources** in that fixture.

Reviewed cargo/carrier, drop, hatch, recovered cache and 1440×900 / 600×900 / 400×800 / 900×600
agenda captures, plus refreshed social/movement/combat captures. Reports/captures are under
`test-results/{chromium,firefox}-tribute*`. Rendering suites ran sequentially and close browsers
in `finally`. No new full Firefox, hardware profile, gallery or standalone report export is claimed.

Independent review reran 228 tests/check/build, tribute in both browsers, Chromium objective-work,
Last Ember, movement, combat and social, plus production smoke. Twenty-five additional pickup/delivery
probes passed for damage/death, ownership/resource replacement, interruption, height/obstruction,
recovery/replay and retirement. Exact 1,200-tick pickup and 480-tick delivery boundaries passed.
The reviewer inspected cargo/drop/hatch/packing and responsive agenda captures. Its non-blocking
README scenario-version correction was applied; documentation-only cleanup required no browser rerun.

### First playable Last Ember contest (O3) — 2026-11-19 (committed baseline)

Implemented from clean **`d698f27`** (O2), committed as **`9be81bb`**. **Independent review returned READY**, with no blockers.

#### Test-first and correction evidence

- Initial `node --test tests/last-ember.test.ts` failed with `ERR_MODULE_NOT_FOUND` for
  `src/lastEmber.ts`, before production implementation. It already specified the generated
  sites, six-seal race outcomes, finite recovery/rewards, kill semantics and autonomous navigation.
- Focus lifecycle/model tests failed on missing `src/machines/world/focus.ts` and the missing
  ECS `focus` component before implementation. Its final model covers **2/2 states, 1/1 branch,
  4 generated paths and 480 cyclic steps**. Total model coverage: **19 machines / 87 states /
  168 transition branches**; existing work/objective model partitions remain covered.
- Self-review's E-interception regression failed **10 pass / 1 fail** at **`ember-70`**:
  the shrine work radius overlapped `portrait-10`'s viewing approach. Placement now excludes
  overlapping work/viewing approaches and validation rejects final overlap. Both real-browser
  E tests pass for this seed. Scene retry evidence explicitly records `trial-23`'s rejected
  former attempt 1 (missing promised site) and accepted attempt 2.
- Final capture review exposed stale “disable the focus” instructions after recovery. The focused
  monster-first/contested run failed **both tests** before correction. Clock text now reports
  completed cleansing/repair while preserving the original lost/contested lifecycle; completed
  profanation is historical, rather than falsely describing the cleansed shrine as still corrupted.
- Early browser fixture corrections waited for inspection-camera exit before restarting work,
  sampled the visible target caption before the killing steps, and adapted old assumptions to
  the extra rite/worker and installed O3 plan. Screenshot review corrected short-window toast
  overlap and captured the shrine from its work face to make the pose/seals readable.

#### Final checks

| Check | Result |
| --- | --- |
| `npm run format:check`, `npm run lint`, strict typing, `git diff --check` | Pass |
| `npm test` | **214 passed**, including pure, generation, work and model tests |
| `npm run build` | Pass; existing large-chunk warning remains |
| `npm run test:last-ember`, then Firefox | **14 checks each** |
| `npm run test:objective-work`, then Firefox | **17 checks each** |
| `npm run test:combat`, then Firefox | **14 checks each** |
| `npm run test:discoveries`, then Firefox | **17 checks each** |
| `npm run test:inspection` | **13 Firefox checks** |
| `npm run test:movement` | **13 Chromium checks** |
| `npm run test:animation` | Pass, **28 existing pose captures**; O3 work poses have separate captures |
| `npm run test:social` | **9 Chromium checks** |
| `npm run test:browser` | **23 Chromium checks**, three physically completed seeded keeps |
| `npm run test:production` | Pass, including absence of development hooks |
| `npm run report:generation` | **100 valid seeds**, 12 explained gallery selections exported |

The new pure corpus additionally checks **100 `ember-*` seeds** for deterministic, reserved,
pre-altar routes to shrine/focus/clue, distinct E approaches, the real goblin's terrain route and
unchanged 21-enemy/four-goblin population. Longest shrine/focus route: **128 tile steps**;
largest accepted zero-based attempt: **2**. Six 20s enemy cycles permit a ~57s geometric margin
over that route at walking speed plus six 6s hero cycles. Combat, dynamic occupancy and doors
still create real delays; this is not a hardware or difficulty benchmark.

Real-browser checks cover off-screen AI navigation/work, visible clocks, E work/disable/clue,
X/floor/target input, luring/return, ordinary lethal pursuit, partial-cycle interruption,
menu/inspection/blur/teleport/death, committed respawn state, all three race outcomes and finite
recovery, known-name boundaries, optional loss followed by Crown victory, and regeneration.
The simultaneous browser race waits 84s, then starts the 36s hero rite to meet the rival at 120s.
No raw objective contributions or replacement plan are used for O3 outcomes. Specific fixtures
freeze/reposition unrelated actors for deterministic outcomes; live-worker and full-route checks
exercise actual AI. The O2 suite separately covers same-boundary damage/death and hidden tabs.

Reports: `test-results/{chromium,firefox}-last-ember.json`, plus same-prefix PNGs for hero/goblin
work, clue, restored/cleansed/fractured states, interruption, disabled focus, named worker and
600×900 / 400×800 / 900×600 layouts. Reviewed those captures and refreshed relevant combat,
inspection and movement images. The corpus export includes scenario version/sites/worker policy.
The first combined full-browser command hit its 300s shell budget after 19 successful checks;
the standalone 600s-budget rerun passed all 23, including CINDER-42 and VIOLET-7 and resource cleanup.
No fresh full Firefox suite, large gallery or hardware profile is claimed for O3.

Independent review reran 214 tests/check/build, all listed browser suites and production smoke.
It also validated 100 additional seeds (maximum shrine/focus route 130 tiles; accepted attempt 3),
12 autonomous worker simulations, 48 reordered outcome/interruption/recovery probes, and 12
exact-60 Hz boundary races covering both rites and early/tied/late completion. All passed.
The reviewer inspected desktop, narrow and short-window UI plus worker/focus/outcome captures.

### Physical interruptible objective work (O2) — 2026-11-19 (historical baseline)

Completed against clean O1 **`6f79a97`**. Final independent review is **READY**, with both
duration-boundary blockers cleared and no remaining blockers. Committed as **`d698f27`**;
at that historical checkpoint O3 had not started.

#### Final independent review — READY

The reviewer reported **202 tests/checks and the production build passing**, the **1,200-duration
sweep over 4,323,600 fixed ticks**, and **17 objective-work checks in each of Chromium and Firefox**.
It also passed **46 additional below/above-boundary, half-step and carry-reset probes**. Both the
original fractional-duration blocker and the remaining decimal-race blocker are cleared.
These are attributed independent-review results, separate from the implementation runs below.
O2 was complete and authorized for its feature commit; O3 was then the next feature.

#### Decimal work-unit timebase correction

- Follow-up reviewer reproduced 6.9s × 3 credit versus three 2.3s × 1 cycles resolving
  monster-first; its original 198 checks passed, with no other reported blockers.
- Before production edits, `node --test tests/objective-work.test.ts`: **19 pass / 4 fail**.
  The installed race emitted `corrupted` instead of `fractured`. The 1,200-duration sweep
  (0.1–120s in tenths, **4,323,600 actual ticks**) reproduced **3.7 → 3.6999999999999997** and
  **6.9 → 6.8999999999999995**, still `working`; half-final-frame and restarted 6.9s cases
  also missed completion. Existing immediately-below-duration tests passed.
- `node --test tests/models.test.ts`: **20 pass / 1 fail**, on the new 3.7s/222-tick trace.
  `npm run test:objective-work` failed in Chromium before the fix at absolute step **422**
  (activation 8 + 414 work steps), rival **3/completed**, hero **0/lost**, `monster-first`.
- The clock now uses compensated **60 Hz work units**, a strict unit comparison and elapsed
  seconds derived as **units/60**. Conversion retains the signed fractional remainder around
  the nearest simulation boundary, avoiding both `8.3 * 60 > 498` drift and multiplication
  collisions at adjacent doubles. There is no completion epsilon. Binding/machine validation
  rejects nonfinite scaled durations; tick overfill is clipped before conversion. Carry resets
  across interruption, blocking, cancellation and settlement.
- All 1,200 durations now finish on their intended boundary. Regression coverage includes
  genuinely incomplete values immediately below 3/120 seconds and `23/60`, an authored duration
  immediately above `11/60`, a half-completed final step, and fresh cycles after each reset path.
- Focused work/model run: **44 passed**. Final `npm run format:check`, `npm run lint`, `npm test`
  (**202 tests**, including strict typing), `npm run build` and `git diff --check` pass.
  Final work model: **5/5 states, 7/7 branches, 8,206 generated paths, 480 cyclic steps**;
  total model coverage remains **18 machines / 85 states / 167 branches**. Vite retains its
  existing large-chunk warning.
- Sequential `npm run test:objective-work` and `BROWSER=firefox npm run test:objective-work`:
  **17 checks each**, no page errors. At work step 413, hero/rival progress is **0/2**, no outcome;
  step 414 commits both final contributions, yielding **3/3 contested** and one outcome retained
  for another 60 steps. Absolute final steps: **424 Chromium / 439 Firefox**. Evidence is under
  `decimalRace` in `test-results/{chromium,firefox}-objective-work.json`; the earlier three-second
  race and all prior work checks also pass. No rendering change or new screenshots.
- Final review was pending at this checkpoint; the READY verdict above clears the correction.
  Prior verification below is historical; no separate local rerun of reviewer-only probes is claimed.

#### First duration correction (historical seconds-based baseline)

- Reviewer reported a late three-second completion that changed an equal-time race to monster-first;
  its other 97 lifecycle probes passed (reviewer results, not an additional local run).
- Before production edits, `node --test tests/objective-work.test.ts`: **15 pass / 4 fail**.
  At 180 × `1/60`, elapsed was **2.9999999999999942**, status `working`. Durations
  **4, 5, 6, 8, 25, 30, 60, 120** were also late (120 ended at **119.99999999999447**).
  Conversely, the old tolerance accepted actually incomplete **2.9999999999999996** seconds.
  The installed capacity-three race (hero 3s × 3 credit; rival three 1s × 1 cycles) emitted
  `corrupted`/monster-first instead of `fractured`/contested.
- `node --test tests/models.test.ts`: **20 pass / 1 fail**, on the new generated 180-fractional-tick
  trace. `npm run test:objective-work` failed the same race in Chromium's real main loop:
  activation step 10 → commit step **190**, rival **3/completed**, hero **0/lost**.
- Work now uses Kahan compensated summation and a strict duration comparison. The numerical carry
  resets with cycle lifecycle transitions; the public work snapshot contract is unchanged.
  Exact boundary, no-early-credit (including the previous representable doubles below 3 and 120),
  partial final-frame and installed race regressions all pass.
- `node --test tests/objective-work.test.ts tests/models.test.ts`: **40 pass**.
  The work model covers **5/5 states, 7/7 branches, 3,185 generated paths, 480 cyclic steps**;
  total coverage remains **18 machines / 85 states / 167 branches**.
- `npm run format:check`, `npm run lint`, `npm test` (**198 tests**, including strict typing),
  `npm run build`, and `git diff --check` pass. The existing large-chunk warning remains.
- Sequential `npm run test:objective-work` and `BROWSER=firefox npm run test:objective-work`:
  **16 checks each**, no page errors. At work step 179, hero/rival progress is **0/2**, no outcome;
  at 180, **3/3 contested**, with both contributions in one batch and one latched outcome after
  another 60 steps. Absolute final commit steps were **190 Chromium / 204 Firefox**, reflecting
  their pre-fixture startup time. Before/boundary evidence is under `timingRace` in
  `test-results/{chromium,firefox}-objective-work.json`. No rendering change or new screenshots.
- Follow-up review was pending at this checkpoint; initial O2 browser/production checks below are
  historical baselines.

#### Initial O2 verification (before duration correction)

- Test-first commands `node --test tests/objective-work.test.ts` and
  `node --test tests/models.test.ts` failed on missing `src/objectiveWork.ts` and
  `src/machines/actors/work.ts`. The preimplementation Chromium browser run failed fetching the
  missing work module from Vite. The contracts/assertions preceded implementation.
- Local self-review reproduced two further regressions before fixing them: the pure retained
  partial-handle case returned **1 credit instead of 0** (**14 pass / 1 fail**), and the browser's
  retained old system accepted `advance` after regeneration (**13 preceding checks passed**).
  Shared cancellation now clears the action chart; commit rejects detached/replaced handles;
  regeneration explicitly retires the old service and cancels all assignments.
- An intermediate browser fixture failed with enemy progress **0 instead of 1** because removing
  its AI retained prior movement state. The fixture now calls the production `stopActor` operation.
- Final `npm run format:check`, `npm run lint`, `npm test` (**194 tests**, including strict typing)
  and `npm run build` pass. Vite retains the existing >500 kB chunk warning. Focused work/model
  run: **36 tests**. New work model: **5 states / 7 branches**, **102 generated paths / 480 cyclic
  steps**; totals **18 machines / 85 states / 167 branches**.
- `git diff --check` passes; generated reports/captures remain ignored.
- `npm run test:objective-work` and `BROWSER=firefox npm run test:objective-work`: **15 checks
  each**, sequentially. Real keyboard movement, pointer attack/nonlethal hit and fresh-cycle
  resumption, species AI movement, generated door E/collider access, solid furnishing denial,
  off-screen work, menu/inspection/visibility pause, blur, teleport, checkpoint respawn,
  completion-boundary melee death, a two-ready-cycles/third-party-kill race and stale-run/reset
  behavior all pass. Hidden-tab suspension
  dispatches the real visibility handler with a deterministic `document.hidden` fixture.
  Reports: `test-results/{chromium,firefox}-objective-work.json`.
- Sequential affected regressions: `npm run test:combat` (**14 Chromium**), `npm run test:movement`
  (**13 Chromium**), `npm run test:jump` (**8 Chromium**), `npm run test:inspection` (**13 Firefox**),
  and `npm run test:production` all pass. Reviewed refreshed combat-running-contact,
  movement-route and inspection-high-detail screenshots. This slice adds no work pose/HUD artwork.
- The fixture installs real work in the existing seeded world; normal worlds have no dummy clock.
  O3 still owns Last Ember authoring, autonomous job priorities, work/clock presentation, outcome
  effects and multi-seed pacing. Broader gallery, discovery and hardware results below are historical.

### Objective domain foundation (O1) — 2026-11-19 (historical baseline)

Completed against committed D1 **`e6591df`**; final independent review is **READY**. This slice adds
the pure objective record, lifecycle machine and typed ECS slot. Runtime work/scenario/UI wiring
remains O2–O4; browser, gallery and hardware measurements below retain their historical qualifications.

#### Final independent review — READY

The reviewer confirmed both input-boundary blockers resolved and reported **42 focused tests**
passing (**22 objective contracts**), with **17 machines / 80 states / 160 branches** covered.
The reviewer also reran the original blocker probes and **18 malformed-reason cases**, plus type
checking, formatting, lint and diff-whitespace checks: all passed. These are attributed reviewer
results, separate from the implementation's full-suite/build checks below. No new browser checks
are claimed. O1 was complete at this checkpoint; O2 had not yet started.

#### Structural-input review correction

- Independent review reported 37 targeted tests and 3,136 oracle combinations passing, with two
  input-boundary blockers and no other blockers. Those are reviewer-reported results, not a new
  oracle run in this correction.
- Test-first `node --test tests/objectives.test.ts`: **17 pass / 5 fail** before production edits.
  A structurally enriched contribution's retained `work.cycle` changed from **1 to 99** after caller
  mutation; an `onCommit` method poisoned `snapshot()` with `DataCloneError`. Enriched conditions
  and plans also threw on `onCancel`; the rejected-step fixture showed **step 0** and discovery /
  activation already committed instead of the original step-null, undiscovered/dormant snapshot.
- Plan and step boundaries now project declared fields (including nested contracts and arrays)
  before validation/mutation. History persists only declared contribution fields. Optional work
  reasons are validated before commit. No caller metadata or callbacks enter runtime records.
- All five regressions pass, including post-submit mutations, exact equivalence to plain-contract
  inputs, clone-safe snapshots and full-snapshot rejection atomicity. Correcting either a condition
  or participant reason succeeds at the same step with the same action ID and all expected outcomes.
- `node --test tests/objectives.test.ts tests/models.test.ts`: **42 pass**; `npm run typecheck`,
  `npm run format:check`, `npm run lint`, `npm test` (**178 tests**) and `npm run build` pass.
  `git diff --check` passes. Model coverage remains **17 machines / 80 states / 160 branches**;
  Vite retains its existing large-chunk warning. No browser suites were run for this pure correction.
- Follow-up review was pending at this checkpoint; the READY verdict above clears both corrections.

#### Initial O1 implementation baseline (before independent review)

- Initial red: `node --test tests/objectives.test.ts` failed with `ERR_MODULE_NOT_FOUND` for
  `src/objectives.ts`; `node --test tests/models.test.ts` failed with the same error for
  `src/machines/world/objective.ts`. Both test files/specifications preceded implementation.
- Follow-up red: `node --test tests/objectives.test.ts` reported **15 pass / 2 fail** before
  corrections: `undefined` instead of `Route obstructed` in the aggregate work reason, and
  `Missing expected exception` for an exclusive monster rival with announcements disabled.
  A preceding edit had a missing brace in a new test fixture (`ERR_INVALID_TYPESCRIPT_SYNTAX`);
  that fixture was corrected before the assertion-based red run.
- Final focused run: `node --test tests/objectives.test.ts tests/models.test.ts` — **37 pass**,
  followed by a passing `npm run typecheck`. The 17 objective contracts include **216** plan /
  contribution / condition permutations, duplicate/conflicting action IDs, fresh eligibility,
  blocked/interrupted resumption, irreversible disruption/dependency precedence, terminal replay,
  independent clocks/races, actual credited overfill, group takeover, ECS lifetime, detached
  contracts and transactional plan/batch/history limits. Additional permutations cover simultaneous
  disruption reasons, repeated dependency invalidation and group readiness.
- Objective model: **5/5 states, 5/5 branches**, **154 generated paths**, **480 cyclic steps**;
  empty/partial/full progress and invalid/partial/exact/overfill/over-limit credits are documented
  finite partitions. Total model coverage is **17 machines / 80 atomic states / 160 branches**.
- `npm run format:check`, `npm run lint`, `npm test` (**173 tests**, including strict typing),
  `npm run build`, and `git diff --check` pass. Vite retains its existing large-chunk warning.
- No browser suites were added or run for this pure-domain slice. Local self-review addressed the
  two regressions, removed redundant race flags, and checked detached nonempty receipts and limits.
  Independent review was pending at that checkpoint; its two findings are corrected above.
  No subagents were launched and no commit was made.

### Within-run discovery record (D1) — 2026-11-18

Implemented against `cd415d1`. Initial independent review found a camera-occlusion blocker.
Follow-up review accepted the correctness correction but found excessive per-query preparation.
**Final independent review cleared both corrections and approved the feature for commit.**

#### Observation performance correction — 2026-11-19

- Test-first material-backed cost regression: four warm queries over 1,000 unchanged off-ray
  meshes caused **8,000 matrix calls and 600 thin-bound refreshes** instead of zero. Further
  first-failing bounds contracts exposed 21 off-ray rig-child preparations, 203 inversions for
  200 off-ray particles, and geometry past the finite ray endpoint entering triangle picking.
  All now pass. Materials are explicitly attached after construction; a merged two-box gap test
  proves the fixtures exercise triangles, not Babylon's no-material bounding-box fallback.
- Frozen scenery is indexed into 16-unit spatial buckets once per world, with membership,
  matrix-version and hierarchy invalidation. Authored rig envelopes reject off-ray articulated
  descendants before preparing them; the animation suite validates character and steed envelopes,
  including 28 captured character poses. Live public transform inputs are compared, parents sync
  once, and only changed nodes use non-forced matrix computation. No visibility outcome is cached.
- Dynamic effect writers maintain bounds at upload time, with no bounds refresh for empty
  zero-scale pools. Static bounds are reused; finite per-instance checks precede inversion.
  Material-backed regressions cover moving parents, cutaways, camera-dependent billboards,
  reparenting, new/removed meshes, unfreezing and replacing instance uploads without stale data.

CPU probe: `PROBE_LABEL=before node tests/observation-profile.ts` and then
`PROBE_LABEL=after node tests/observation-profile.ts`, with the corresponding
`BROWSER=firefox` runs, sequentially. Each phase uses **100 warmup + 400 measured steps** after
fixture settling. `MOURNING-731`, **1440×900, 2,097 meshes, all 22 rigs enabled**, AI removed,
one selected invulnerable ordinary goblin. A/B/A is actual observation / known-visible control /
actual observation. There are no scene renders inside the measured loop.

| Browser / version | Actual A mean ms | Control B mean ms | Actual A2 mean ms | A2 p95 ms |
| --- | ---: | ---: | ---: | ---: |
| Chromium before | 9.155 | 1.315 | 7.614 | 8.900 |
| Chromium after | 4.158 | 1.756 | 3.276 | 4.700 |
| Firefox before | 11.533 | 2.505 | 12.338 | 19.000 |
| Firefox after | 4.690 | 2.520 | 4.360 | 6.000 |

- Instrumented warm query, both browsers: **5,125 total matrix calls / 3,397 forced calls /
  36 thin-bound refreshes before**, versus **2 / 0 / 0 after**. An actual animated-step query
  uses **60 matrix calls in Chromium / 61 in Firefox**, all non-forced, and zero bounds refreshes.
  A final failing probe exposed 90 calls from distant animated steeds before their authored
  envelopes were registered. The budget allows up to 64 calls for pose-phase variation.
  The final actual-A2 observation portion averaged **1.484 ms Chromium / 1.803 ms Firefox**;
  observation still has a measurable CPU cost. These are local CPU measurements, not GPU/FPS
  or hardware performance guarantees. The control includes current renderer-owned bounds work.
- Reports are `test-results/{chromium,firefox}-observation-cpu-{before,after}.json`. The probe
  asserts deterministic preparation budgets rather than machine-dependent timing thresholds.
- `npm run format:check`, `npm run lint`, `npm test` (**155 tests**, including typing and
  13 material-backed observation contracts), and `npm run build` pass. Existing chunk warning
  remains. Discovery **17 each browser**, combat **14 each browser**, Firefox inspection **13**,
  Chromium animation **28 captures**, Chromium social **9**, and production smoke pass.
  Rendering suites ran sequentially. The initial combined browser command hit its 240-second
  harness timeout just as social started; social was rerun independently and passed all nine.
- Reviewed the refreshed animation sheet, social smoke and revealed-remains captures. Both
  browsers retain the rendered-pillar and real projectile knowledge boundaries.
- Final independent review reran all listed checks and found no blockers. A 400-case comparison
  against unindexed triangle picking matched all results (234 visible / 166 occluded). Its
  A/B/A mean CPU samples were 3.714/1.646/3.147ms in Chromium and 4.438/2.405/4.228ms in Firefox;
  final observation-only means were 1.406/1.695ms. Warm queries retained two matrix calls,
  zero forced updates and zero bounds refreshes. Animated queries retained 60/61 non-forced calls.

#### Camera-occlusion correction baseline (before performance review)

- Added the reviewer's `MOURNING-731` / 1440×900 entrance-pillar regression before the fix.
  Both `npm run test:discoveries` and `BROWSER=firefox npm run test:discoveries` failed at
  `camera-hidden melee victim is not a witnessed death or visible remains`. The pixel oracle
  measured **zero changed pixels** when disabling the victim (shadows/glow excluded), but the
  old code recorded `Witnessed the death of a kobold. Killed by a skeleton.` after ordinary
  melee impact. Four render-adapter contracts also failed first on the missing module.
- Added `CameraObservation`: finite rays to actual rig surfaces, rendered-scene geometry,
  current cutaway/door transforms, visibility/layer filtering and real thin-instance transforms.
  Invisible collision/selection proxies cannot occlude or establish observation. Victims,
  non-player killers, target captions and remains share this camera check in addition to the
  existing player-perception checks.
- Work is bounded to three sample rays per observation, with cached sample membership and
  Babylon broad-phase rejection before triangle checks. Results are recomputed for changed
  cameras/poses/scenery; already-recorded remains skip queries. There is no every-actor
  per-frame triangle scan. Geometry sampling remains deliberately conservative for partially
  exposed actors and shader-discarded surfaces.
- The cutaway unit regression initially also exposed stale same-render-ID transforms:
  shrinking the wall still returned false. Explicit current world-matrix preparation fixed it.
  Thin-instance tests distinguish actual instances from the unrendered source mesh and cover
  moving instance bounds.
- **146 tests** pass under `npm test`, including strict typing and four new Babylon null-engine
  geometry contracts. `npm run format:check`, `npm run lint`, `npm run build`, and
  `git diff --check` pass. Build retains the existing large-chunk warning.
- Discovery browser suite: **17 checks each in Chromium and Firefox**. New checks cover a
  fully camera-hidden ordinary melee death, no hidden target-caption grant, later camera-revealed
  unidentified remains with no inferred killer, and an actual crossbow launch/travel/impact
  whose visible victim does not reveal the pillar-hidden shooter. The projectile fixture was
  adjusted until the pixel oracle confirmed both idle and firing poses were fully hidden.
- Reran Firefox inspection (**13 checks**) and Chromium/Firefox combat (**14 each**), then
  `npm run test:production` (rendering/shaders, regeneration, menus, quality and no dev hooks):
  all pass. Rendering suites ran sequentially.
- Reviewed the new `test-results/{chromium,firefox}-discoveries-pillar-*.png` captures: the
  victim/shooter are hidden by rendered masonry, and the changed camera reveals remains with
  the explicit unknown-killer account. Broader gameplay/gallery/performance results remain
  their historical baselines. The reviewer's pre-correction 200-seed result was not rerun as
  a separate corpus in this correction; the normal generation tests ran under `npm test`.

#### Initial D1 implementation baseline (before independent review)

- Test-first run: `node --test tests/discoveries.test.ts tests/keep-presentation.test.ts
  tests/combat.test.ts` failed in three places before implementation: missing `src/discoveries.ts`,
  no lethal-impact callback (`[]` instead of the victim/source event), and the entrance granting
  the undisclosed founding fact. The first `node tests/discoveries-browser.ts` run failed at
  `run-owned discovery component must exist` before runtime integration.
- Seven new pure discovery contracts, one presentation-link regression and one lethal-event
  contract now pass. They cover detached evidence/snapshots, explicit fact grants, stable seeded
  placement IDs despite array/counter changes, once-only events, unknown killers, ECS ownership,
  respawn retention, same-seed reset and cross-kind observation order.
- A later test-first ordering regression failed with `[undefined, undefined]` instead of
  cross-kind ordinals `[0, 3]`; entries now retain actual insertion order even at identical
  simulation timestamps. A browser width regression failed before bounding the expanded record
  to a readable 540px card.
- Initial browser integration exposed a missed remains observation immediately after regeneration:
  zero events instead of one, with nonfinite projected coordinates before the first scene render.
  Observation now refreshes camera view/projection matrices before screen checks. The same fixture
  and an explicit offscreen negative case pass in both browsers.
- `npm run format:check`, `npm run lint`, `npm test` (**142 pure/model tests**, including strict
  type checking), and `npm run build` pass. The build reports its existing large-chunk warning.
  No machines were added or modified; model coverage remains **16 machines / 75 states / 155 branches**.
- `npm run test:discoveries` and `BROWSER=firefox npm run test:discoveries`: **14 checks each** pass.
  Real E inspection and target clicks record only presented evidence; generation, proximity,
  distant/occluded/offscreen selection and unseen deaths do not grant hidden facts. Ordinary
  pursuit produces a witnessed death with its actual observed source; an unseen source remains
  unknown. Later remains reveal neither an unlearned name nor biography nor killer.
- The same suite verifies repeat discovery/event deduplication, pause-menu record contents and
  narrow layout, real entrance and altar checkpoint respawns, healing after repeat rest,
  successful chest/altar/crown interactions, denied pre-altar claiming, and same/different-seed
  regeneration. Each new run relearns only the freshly presented entrance initially.
- Existing targeted regressions pass: Firefox inspection **13 checks**; Chromium and Firefox
  combat **14 checks each**, including the three named-inhabitant captions, moving attacks,
  cancellation, death and regeneration. Rendering suites ran sequentially.
- Reviewed discovery inspection, named-target and desktop/480px record captures, plus relevant
  inspection/combat captures. The record uses the existing pause modal, bounded scrolling and
  readable wrapping. Art and seeded layouts retain the existing `layout-v3 / keep-v4` baseline;
  the metadata correction removes unspoken fact links without changing generated history/text.
- Captures/reports: `test-results/{chromium,firefox}-discoveries-*`, `inspection-report.json`,
  and `{chromium,firefox}-combat-report.json`. Broader full-gameplay, movement, social, production
  smoke and gallery checks remain their previously recorded baselines; they were not rerun for D1.

### Moving pursuit attacks — 2026-11-18

- Click-locked player pursuit now advances during melee wind-up, impact and recovery.
  Clear close approaches update every simulation step, with a tighter pursuit arrival brake;
  stationary targets still have a stopping distance. Damage retains its existing impact clock,
  range, elevation and cover checks. Moving attack animation preserves gait and foot contact.
- Goblins flee at **5.2 units/second**, above the player's **4.8** walk and below the **7.4**
  Shift-run. Other goblin movement retains its existing speed.
- Three new pure regressions failed first on the old movement lock/flee speed. They now pass:
  moving pursuit lands both ordinary hits, fleeing speed stays between walk and run, and escaped
  or newly occluded targets cannot be hit through range, furniture or a locked door.
- `npm run format:check`, `npm run lint`, `npm test` (**133 pure/model tests**, including strict
  type checking), and `npm run build` pass. The build retains its existing large-chunk warning.
- `npm run test:combat` and `BROWSER=firefox npm run test:combat`: **14 checks each** pass,
  including real held-click/Shift pursuit of a live fleeing goblin, moving wind-up/recovery,
  two timed strikes, living-body separation, cancellation, respawn and regeneration.
- Chromium movement: **13 checks**; jump: **8 checks**; animation: **28 pose captures** pass.
  The new animation comparison checks the leg excursion across all four moving-sword poses;
  its initial two-pose comparison sampled similar parts of the gait cycle and was corrected.
- Reviewed the animation sheet and Firefox moving wind-up/contact captures: the sword action
  remains readable over distinct strides, and the chase produces visible blood at impact.
  Final format/lint/typecheck and diff-whitespace checks pass. Broader full-gameplay, social,
  production-smoke and gallery results below remain their recorded feature baselines.

- Independent pre-commit review found no blockers: 56 focused tests, 1,124 generated-world
  close-pursuit probes, target stop/reversal and door probes, and nine Chromium moving-swing
  lifecycle cases pass. The reviewer also inspected the moving combat and animation captures.

### Named inhabitants (N1) — 2026-11-18

- Test-first identity/lifecycle/report contracts failed before implementation. The browser
  then failed on the missing visual identifier before ornament/target presentation was added.
  Five pure contracts now cover 60 seeded keeps, all profiles, ordering independence, factual
  card-game fallback, fixed health/hostility, corpse persistence, regeneration and report isolation.
- The corpus exposed `trial-24`: a card player can stand on a corridor landing. Its new
  regression failed before resolving the home room through the actual gathering center.
- `npm run check`: **130 pure/model tests**, strict type checking, lint and formatting pass.
  `npm run build` passes. Identity is **layout-v3 / keep-v4**; the content-version change also
  advances versioned semantic recipe/history streams, so geometry fixtures were refreshed.
- Combat: **13 checks each in Chromium and Firefox**, exercising all three ornaments and
  factual captions through real targeting. Review found HUD overlap at 600/900px; added a
  failing rectangle-intersection regression, fixed responsive width budgets, and reran both
  browser suites successfully. Follow-up independent review cleared the issue.
- Full Chromium gameplay: **23 checks**; social: **9 checks**; generation-browser agreement,
  production smoke, 100-seed export and refreshed **48-view gallery** pass. Five regenerations
  stabilize at **2,097 meshes, 28 materials, 4 textures, 48 effects and 34 shader sources**.
- Independent review also passed **29 focused tests and 500 additional seeds**: exactly one
  named inhabitant and 21 enemies per keep, with 187 dealers, 147 lookouts and 166 watchkeepers.
  Three additional doorway-home cases used their gathering room correctly.
- Reviewed normal and 600/900px captions plus crown-clasp, mourning-band and token close-ups.
  Two initial Chromium close-up captures were blank following viewport resize; waiting for
  rendering frames before explicit resize/render fixed the capture fixture, and the refreshed
  screenshots were reviewed. Firefox close-ups also show the distinct ornaments.
- The broad unlabeled profile/architectural-art gate remains open; named identity is delivered.

### Integrated forge/bakery recipes (S1b) — 2026-11-18

- World/report integration contracts failed on missing scene provenance before implementation.
  Both recipes now commit their props and reserved work paths before background furnishing.
  Final-world tests cover 100 additional seeds, all orientations, optional omissions, real
  navigation to work faces, shared prop identity, detached reports and damaged-path rejection.
- `npm run check`: **125 pure/model tests**, strict type checking, lint and formatting pass.
  `npm run build` and production smoke pass. Generation identity is now **layout-v3 / keep-v3**;
  golden geometry fixtures were intentionally refreshed. `trial-23` pins the current retry
  constraint; `trial-27` remains a historical regression in the gallery.
- Movement: **13 checks each in Chromium and Firefox**, including rendered recipe colliders
  and real floor-click arrival/return at every showcase work face. The capture camera was
  widened after an initial fixture projected a work face under the HUD.
- Full Chromium gameplay: **23 checks**, including physical completion of three seeds.
  Social: **9 Chromium checks**. Development report agreement and the 100-seed export pass.
- Refreshed **48-view gallery** and five same-seed regenerations pass. All five samples have
  **2,077 meshes, 28 materials, 4 textures, 48 effects and 34 shader sources**. Compared with
  the earlier gallery, this adds no material/texture/effect category; timing is not a hardware
  measurement. Reviewed movement room captures, grayscale overview, and retry/high-door room
  views: work furniture and broad central lanes remain readable.
- Independent review found no blockers: **33 focused tests** and **500 additional seeds**,
  checking 1,000 scenes, 3,345 props and 22,309 reserved points against swept clearance,
  runtime navigation, ECS reference ownership and deterministic regeneration.
- Physical heraldry, causal contact detail and profile-specific composition remain broader
  procedural-content follow-ups; this delivers the two bounded placement recipes.

### Bounded scene planner (S1a) — 2026-11-18

- Test-first planner contracts failed on the missing API before implementation. Six tests
  now exercise both workspaces in narrow/full rooms at every cardinal orientation, bounded
  retries and optional omissions, connected work paths, ramp/collider rejection, deterministic
  ordering, serializability and input isolation.
- `npm run check`: **123 pure/model tests**, type checking, lint and formatting pass.
  `npm run build` passes with the existing large-chunk warning.
- Shared placement geometry was extracted without changing the running generator; historical
  world digest checks still pass. Runtime recipe integration/browser review is S1b.
- Independent review reproduced a thin-barrier crossing. The regression failed before sharing
  runtime navigation's swept-box test with planner edges. Follow-up review cleared the fix
  with 26 targeted tests and eight additional barrier/detour probes. Exact anchor-budget and
  failed-required-pair rollback fixtures also pass.

### Linked portraits and room evidence — 2026-11-18

- `npm run check`: **117 tests**, strict type checking, lint and formatting pass.
  `npm run build` and production smoke pass, with the existing bundle-size warning.
- Test-first presentation contracts failed before implementation. Thirty seeds check all
  three monarch subjects, matching houses, painting dates within reigns, shared core traits
  and valid portrait fact references. Separate targeted fixtures check idempotence, direct
  progression text and entity-order independence.
- Independent review reproduced an entity-order-dependent subject swap. A new regression
  failed before the fix; painting randomness now uses placement identity and mandatory
  subject selection uses a total deterministic order. Exact subtitle/date assertions were
  added, and the founder-history browser check was named accurately.
  Follow-up review cleared the blocker and verified 768 portrait-metadata comparisons across
  reversed/shuffled/renumbered entity collections from 32 seeds.
- `npm run test:inspection`: **13 Firefox checks** pass, including shared evidence in three
  room captions and linked portrait captions. `npm run test:portraits`: four distinct GPU
  paintings pass. Reviewed `inspection-high-detail.png`, `keep-altar-history.png` and portrait
  captures; the longer text remains framed at normal and narrow viewport sizes.
- `npm run test:browser`: **23 Chromium checks** pass, including three complete seeds.
  The full Firefox gameplay pass remains the T1 baseline; current Firefox coverage is the
  inspection and portrait suites above.
- Generation-browser agreement, 100-seed metadata export, **48-view gallery** and five
  stable same-seed regenerations pass for `layout-v2` / `keep-v2`. Geometry-only digests were
  captured before presentation edits and remain unchanged afterward.
- This is linked narrative/portrait presentation. Architectural heraldry, composed scenes,
  memorable inhabitants and the full visually distinguishable profile gate remain planned.

### Shared keep identity foundation — 2026-11-18

- Test-first keep contracts failed before the new API existed; five checks now cover
  reproducibility, 200-seed profile/chronology/reference integrity, semantic-stream isolation,
  caller-mutation isolation and pinned `layout-v2` / `keep-v1` identity fixtures.
- Keep data is generated once before layout retries. Historical whole-blueprint digests,
  excluding only the added `keep` field, still match both first-attempt and retry seeds.
- `npm run check`: **113 tests**, strict type checking, lint and formatting pass.
- `npm run build`, `npm run test:generation` and `npm run report:generation` pass. The
  100-seed export now includes detached keep facts; browser and Node reports agree.
- Independent review found no blockers. Added its requested pinned identity/semantic-ID
  fixtures, nested bidirectional report isolation checks and current-version documentation.
- This delivers generated data and diagnostic access. Portrait and room presentation
  connections are a subsequent slice, not yet a visually distinct keep-profile release.

### Live-blocker traversal and refreshed hardware sample — 2026-11-18

- Added a deterministic stationary-skeleton browser fixture. It failed before the driver
  fix at waypoint `[0,2]`, blocked by the living body. The driver now uses ordinary timed
  combat to clear nearby blockers and rebuilds its independent terrain route afterward.
  Physical movement, actor collision and the altar/throne completion assertions remain active.
- `npm run test:browser` and `BROWSER=firefox npm run test:browser`: **23 checks each pass**,
  completing `MOURNING-731`, `CINDER-42` and `VIOLET-7`. This resolves the G3 follow-up below.
- `npm run check`: **108 pure/model tests**, type checking, lint and formatting pass.
  `npm run build` passes with the existing large-chunk warning.
- Independent review found no blockers. Added its requested finite-immunity restoration
  assertion and reran the Chromium suite successfully.
- `npm run profile` completed a fresh **high-quality**, 1920×1080, RTX 2070 / Chromium
  159.0.8154.6 run. An earlier combined-command run exhausted its shell budget; only the
  completed standalone run is used here. Ten room means range from **16.76–18.07 ms**
  (**55.3–59.7 FPS**); the throne sample's p95 is **34.7 ms**. Draw calls range **345–684**,
  geometry totals **188,770 mesh triangles**, and sampled JS heap is approximately
  **140–172 MB**. Inspector opened/closed and no browser errors were recorded.
  `test-results/hardware-profile.json` contains the per-room values. Low-quality hardware
  sampling and generation-latency measurements remain Phase 0 follow-ups.

### Development reports and visual seed gallery — 2026-11-18

- `npm run check`: **108 tests**, type checking, lint and formatting pass.
- `npm run build` and `npm run test:production`: pass; production retains no debug harness.
- Test-first `npm run test:generation` initially failed because the report method was absent.
  It now passes normal-load isolation, browser/Node agreement, detached initial state even
  after live blueprint changes, and replacement on regeneration.
- `npm run gallery:generation`: **12 seeds / 48 views**, color/grayscale overviews and five
  repeated `MOURNING-731` regenerations pass. The five samples each contain **2,100 meshes,
  28 materials, 4 textures, 48 cached effects and 34 generated shader sources**.
- Reviewed the overview sheets and individual smithy/altar captures. Increased the fixed
  radius from 32 to 40 after initial review showed cropped near-side altars. Broad floor
  paths and room landmarks are now visible in color and grayscale.
- Cross-engine social placement differs by floating-point roundoff; agreement checks use
  a `1e-9` position tolerance and exact comparisons for all other report data.
- Independent review's two findings were fixed: excluded stale FPS/accumulating draw-call
  counters from manually rendered gallery metadata, and strengthened initial-state coverage.
- **Broader-suite follow-up:** `npm run test:browser` passed its first eleven checks, then
  its static keyboard landmark autopilot hit physical collision twice at different route
  waypoints with live actors. Full-suite completion is not claimed for this update; the
  traversal driver is the next investigation. Existing full-browser passes below are historical.

Artifacts: `test-results/generation-gallery/{index.html,report.json,overview.png,overview-grayscale.png}`.

### Generation analysis and seed corpus — 2026-11-18

- `npm run check`: **106 tests**, strict type checking, lint and formatting pass.
- `npm run build`: passes with the existing large-chunk warning.
- `npm run report:generation`: exports **100 valid seeds** and **12 unique, explained
  gallery selections** to `test-results/generation-corpus.json`. Every sampled world has
  21 seeded enemies, a reachable required route, and an intact pre-altar throne gate.
- Test-first checks cover detached/serializable reports, provenance, graph counts, an
  obstructed route with known distance, and final enemy/social placement agreement.
- Independent review identified biased gallery fill toward smaller layouts. A controlled
  regression failed on the old selection; the fix distributes remaining slots across the
  remaining area range. Added the requested encounter coordinate/group/activity assertions.

### Versioned generation diagnostics — 2026-11-18

- Test-first diagnostic contract failed before implementation (missing API/module), then all
  four new checks passed. Historical world digests cover both a first-attempt seed and a
  retrying seed; `trial-27` records its exact failed furniture-clearance constraint.
- `npm run check`: **101 tests** and strict type checking pass; lint and formatting pass.
- `npm run build`: passes with the existing large-chunk warning.
- Independent sub-agent review found no blocking issues and compared **103 seeds** against
  the preceding generator implementation with identical worlds. Both suggested test
  improvements (exact rejection and retry-world digest) were incorporated.
- No runtime rendering/input behavior changed; the new API is pure generation diagnostics.
  Browser and hardware results below retain their stated earlier baselines.

### Mouse movement routing fix — 2026-11-18

Reproduced fresh-world floor clicks reporting “No clear route” with living enemies present.
The player was already excluded from its own occupancy query. The click handler passed a
Babylon `Vector3` into navigation, where object spread omitted its accessor-backed `x`/`z`
coordinates and caused swept occupancy checks to reject otherwise clear routes.

Click routing now uses the authoritative actor transform. Navigation explicitly copies
coordinate values for route origins, destinations, and occupancy probes. Added a regression
using real Babylon vectors with a distant actor, an occupied destination, and a body detour;
the browser suite now checks a fresh-world click and arrival before removing enemy bodies.
Both new regressions failed before the fix and pass afterwards.

- `npm run format:check`: passes across 78 configured files.
- `npm run lint`: passes with no diagnostics.
- `npm test`: strict type checking and all **97 pure/model tests** pass.
- `npm run build`: passes with Vite's large-chunk size warning.
- `npm run test:movement` and `BROWSER=firefox npm run test:movement`: **12 checks each** pass,
  including the new live-occupancy click, held steering, furniture, stairs, gates, and resets.
- `npm run test:combat`: all **12 Chromium checks** pass, including body separation,
  pursuit, floor-command cancellation, and door interactions.

Reviewed `test-results/chromium-movement-live-actors.png`,
`test-results/firefox-movement-live-actors.png`, and `test-results/chromium-movement-route.png`:
the player starts toward the visible destination ring on clear entrance floor. Other browser,
production-smoke, and hardware results below retain their earlier baselines.

### Pre-commit hook update — 2026-11-18

Added **simple-git-hooks 2.14.0** with a version-controlled pre-commit configuration in
`package.json`. The hook runs `npm run check`: tests, linting, then Oxfmt checks, stopping
at the first failure.

- `npm run prepare`: installed `.git/hooks/pre-commit`; a subsequent `npm install` also
  ran the `prepare` lifecycle automatically.
- `git hook run pre-commit`: passed strict type checking, all **96 pure/model tests**,
  Oxlint with no diagnostics, and Oxfmt checks across **78 files**.
- `npm run build`: passed with Vite's large-chunk size warning.

Browser and hardware results retain their earlier baselines below.

### Oxfmt and Oxlint tooling update — 2026-11-18

Installed **Oxfmt 0.79.0** and **Oxlint 1.94.0**, the npm `latest` releases at the time of
installation, as exact development dependencies. Oxfmt replaces Prettier with the existing
single-quote and 100-column settings. Oxlint enables correctness checks for source, tests,
and Vite configuration, with warnings failing the npm lint command.

Verified on Node.js 26.0.0:

- `npm run format` and `npm run format:check`: pass across all 78 configured files.
- `npm run lint`: passes with no diagnostics.
- `npm test`: strict type checking and all **96 pure/model tests** pass.
- `npm run build`: strict type checking and production bundling pass; Vite reports its
  large-chunk size warning.

The formatting/linting runs required no source or test changes. Browser, screenshot, and
hardware checks retain their previously recorded baselines below.

### Jump and movement-driven animation refinement

**Space now jumps; X cancels travel and combat.** Jumping preserves keyboard movement, running, click routes and selected targets, with one jump per press. The trajectory has a two-frame preload and exact constant-gravity integration; changes in stair support preserve world-space flight. Landing speed drives a damped compression spring. Ground-navigation clearance remains active through flight; airborne elevation affects melee/projectile hit tests and ground hazards. Focus loss, menus, inspection, teleport, death and regeneration clear airborne state.

Animation now uses actual displacement for facing, acceleration-driven lean/banking, cadence-dependent running bounce, articulated knees, bounded stance anchors and two-bone ground-contact correction. Cover crouches and the cape use analytic springs. Sword curves preserve velocity through contact. Camera height and the ground ring stay attached to the support plane.

Current verification: **96 pure/model tests**, **8 Chromium jump checks**, **11 movement checks**, **12 combat checks**, **9 social checks**, and the **24-pose rendered animation suite**, plus strict type checking, formatting and production build. Browser checks were run sequentially. The animation checks include rendered stance/landing sole heights, and social checks cover seated/standing foot contact. Reviewed the jump preload, rising/tucked/apex/falling/contact/compression/settle captures in `test-results/chromium-animation-poses.png`. Reports include `test-results/chromium-jump-report.json` and `test-results/chromium-animation-report.json`.

### Earlier animation principles update

The character pass adds a brief counter-motion/load before starting, push-off extension, braking recoil and cape settle, and volume-preserving local-axis squash/stretch. Running blends continuously into longer strides, forward lean, bent-elbow arm pumps, torso counter-rotation, flight and compressed landings. Melee follows the authoritative impact clock; crossbows aim and recoil separately. Deaths buckle, fall, compress and rebound; social gestures include preparation and follow-through with a continuous receiver-to-kicker handoff.

Verification includes **86 pure/model tests**, **11 Chromium movement checks**, **12 Chromium combat checks**, **9 Chromium social checks**, and a dedicated rendered animation check covering **16 poses**, volume conservation, forward sword reach at impact, crossbow muzzle alignment, and focus-loss cleanup. Reviewed `test-results/chromium-animation-poses.png` alongside the start/stop and social captures. Type checking, formatting and the production build also pass. The full browser, Firefox, production-smoke and hardware results below retain their previously recorded baselines.

The supplied reference video's English auto-captions were retrieved and converted into a timestamped transcript at `ref/procedural-animation-bootcamp-transcript.md`. It is explicitly labeled as automatic transcription, with rolling-caption duplicates removed and recognition errors retained. The local `ref/` directory is git-ignored.

### Actor occupancy and corpse terrain update

Living actors now block both hostiles and allies through shared swept-body collision. Route searches use live occupancy, and occupied checkpoints choose nearby reachable floor. Corpses remain traversable and slow all actors to 52% speed, matching water without stacking.

This update passes **79 pure/model tests**, **12 Chromium combat checks**, **11 Chromium movement checks**, and **9 Chromium social checks**, plus type checking, formatting, and the production build. New regressions cover high-speed tunnelling, allied head-on movement, a cornered goblin, moving route blockers, elevation, occupied respawns, and corpse slowdown/recovery. Rendered combat checks verify body separation, collision-proxy synchronization, and corpse traversal. Floor-only browser fixtures remove body components alongside hiding/freezing enemies; actor collision is exercised separately with live rendered actors. Other browser/production-smoke results below are the preceding baseline.

### Earlier automated-check summary

This table retains the pre-implementation-path baselines. The dated entries above record
newer checks and test counts; a newer targeted run does not imply every historical suite
was rerun for that feature.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passes with `strict`, unused-code checks, and erasable TypeScript syntax across source, tests, and Vite configuration |
| `npm run format:check` | All 78 configured files pass Oxfmt checks; earlier updates used Prettier |
| `npm run lint` | Oxlint correctness checks pass with no diagnostics |
| `npm test` | 97 passing tests: generation, ECS/combat, occupancy (including render-vector route endpoints), navigation, inspection, locomotion/action poses, jumping, springs, leg solving, statechart invariants/model coverage, and social gathering behavior |
| `npm run test:models` | 19 checks: every production machine covered, all 75 declared atomic states and 155 transition branches reached, invariants checked on generated traces, and negative fixtures proving missed coverage fails |
| `npm run build` | Strict type checking and production build succeed |
| `npm run test:production` | Built shaders, rendering, seed changes, menus, and quality settings work; development hooks are absent |
| `npm run test:browser` | 22 passing Chromium gameplay/rendering/resource checks |
| `BROWSER=firefox npm run test:browser` | 22 passing Firefox gameplay/rendering/resource checks |
| `npm run test:portraits` | Earlier dedicated portrait baseline; current full-browser and inspection suites also verify portrait behavior |
| `npm run test:inspection` | 11 passing checks for held-key handling, text editing, close-up detail, camera restoration, resizing, cancellation, and regeneration |
| `npm run test:movement` | 12 passing Chromium checks for fresh-world clicks with live occupancy, real clicks, hold-to-steer, keyboard override, eased stopping, obstacles, stairs, doors, modal/focus cancellation, and high-DPI/low-quality picking |
| `npm run test:animation` | 24 rendered pose captures; jump/landing, foot contact, volume preservation, run-specific mechanics, weapon alignment, recovery and focus-loss reset pass |
| `npm run test:jump` | 8 checks: Space taps/holds, flight/body synchronization, routes, running, sealed gates, lava, modal/focus cleanup, teleport and regeneration |
| `BROWSER=firefox npm run test:movement` | The same 12 movement checks pass in Firefox, including fresh-world clicks with live occupancy |
| `npm run test:combat` | 12 passing real-input ECS/combat checks, including actor blocking, allied separation, corpse slowdown, held pursuit, repeated strikes, effects, moving targets, cancellation, door clicks/locks, death and regeneration |
| `BROWSER=firefox npm run test:combat` | Earlier dedicated Firefox baseline; the current full Firefox route and social-alert suites pass |
| `npm run test:social` | 9 passing Chromium checks: stable gatherings, visible activity props, threat interruption/weapon drawing, and return to each activity |
| `BROWSER=firefox npm run test:social` | The same 9 social checks pass in Firefox |
| `npm run profile` | Earlier hardware baseline; the profiler is type-checked, but hardware measurements were not rerun for this update |

Both full browser runs complete `MOURNING-731`, `CINDER-42`, and `VIOLET-7`. The test discovers routes from each generated layout and advances the actual player controller and collision system through them. The keyboard route driver releases before its final waypoint and waits for eased movement to settle before interacting. The non-fighting landmark autopilot temporarily grants the test player immunity while keeping AI active; ordinary damage/death are checked independently. Teleports isolate hazards and individual rendering/interaction checks. Floor-navigation tests hide and freeze enemies to prevent enemy selection from replacing a floor command; combat browser tests use controlled encounters with real input, simulation, collision and rendering.

The TypeScript migration was verified using Node.js 26.0.0. Node.js 22.18+ is required for native execution of the `.ts` test scripts; both `npm test` and `npm run build` run the type checker first. No `any` annotations or TypeScript error-suppression directives were introduced. Shared contracts describe world data, discriminated entity variants, rendering state, inspection targets, and the optional development harness.

Covered behavior:

- Fresh seeds on ordinary loads and refreshes, including refreshes of older pinned URLs; explicit seed links reproduce their world when opened.
- Materially different spatial layouts, connectivity, room shapes, prop placements, and reliquary locations. Diversity tests require over 90 distinct room-position, connection, and chest-layout signatures in the 100-seed sample.
- Directional furnishings face the nearest cardinal direction toward the room center, with reachable front clearance. Validation rejects outward-facing thrones, ovens, and furnaces.
- Keyboard movement and pause/resume.
- Left-click routes, continuous held-pointer steering, destination replacement, keyboard override, Space jumping and X cancellation.
- Increased travel speeds (4.8 walking / 7.4 running), brief acceleration/deceleration, precise destination arrival, and procedural start/stop transitions.
- Click routes preserve character clearance around furniture, avoid lava/void, use supported stairs, and respect closed or dynamically closing doors.
- Pause, inspection, focus loss, and regeneration clear queued movement and momentum. Mouse input is blocked during inspection and menus.
- Closed-door collision, opening doors, and preventing closure on the player.
- Click-to-approach/open doors, capability-aware door navigation, and locked-gate preservation.
- Indexed ECS component attachment/replacement/removal, actor composition, and reference-based registration of generated world data.
- Skeleton wandering and attacks on living enemies; goblin flight, hiding, cover-to-peek transitions and ranged fire; kobold group alerts and distinct flanking positions.
- Thirty additional social seeds verify 21 enemies, deterministic activities and gathering positions, and navigation-safe spawning. A pack whose first spawn leaves insufficient nearby space can use another safe room position before gathering placement.
- Separate skeleton, goblin, and kobold machines select tactics through typed perception events. Alerted social creatures leave their activity; survivors return after target memory expires. Relayed pack alerts cannot indefinitely refresh each other's lifetime.
- Sticky enemy targeting, moving-target pursuit, repeated timed sword attacks, animation blending, cancellation before impact, and no melee damage through cover.
- Dodgable, swept crossbow projectiles blocked by furniture and doors. Enemy attacks use the same player/enemy health and damage system.
- Persistent passable corpses that slow movement, blood versus skeleton dust, bounded particle/projectile entity lifetimes, and clean world replacement.
- Traversing stairs up and down with correct floor elevation.
- Reduced speed in water and over corpses; overlapping slow terrain does not stack.
- Lava damage and safe respawning.
- A safe main route through water, stairs, and the forge.
- The throne gate remaining locked until the altar is activated.
- Altar activation, gate unlocking, and the completion dialog.
- Optional chest rewards.
- Furnished butchery, blacksmith, bakery, and stable, with two animated lizard steeds.
- Royal portrait rendering and eye-level camera inspection without accidentally awarding a chest reward. Portrait placement avoids taking over other landmarks' reserved interaction spots.
- Held gameplay letters cancel native text actions on both initial and repeated keydowns; typing in the seed field remains functional.
- High-quality filtered 2048px shadows, MSAA/FXAA, and pixel-aware lighting transitions.
- Quality changes and viewport resizing.
- Repeated regeneration with reset progression and bounded rendering resources.
- No external requests or imported image/model assets during play.
- No JavaScript or shader errors in the passing runs.

## Visual review

The current social update was reviewed in `chromium-social-cards.png`, `chromium-social-hackysack.png`, and `chromium-social-smoke.png`: seated card players surround a cloth with cards and stakes; hacky-sack participants face a shared animated ball; smokers hold pipes with rising voxel puffs. Weapons are hidden while relaxing and restored on alert. Both browser suites verify these transitions.

Reviewed rendered screenshots of the entrance, flooded gallery, forge, altar, throne room, all four themed rooms, alternate layouts, and four head-on royal portraits. Also reviewed the altar from all four camera orientations and in grayscale.

- The adventurer remains visible in the reviewed orientations.
- Camera-facing walls retract with corresponding changes to their cast shadows.
- The water, lava, altar, and throne have distinct shapes and visual treatments.
- Landmarks, character silhouettes, and walkable surfaces remain distinguishable in grayscale.
- Shader surfaces and props render correctly without imported textures.
- Portraits display distinct faces, crowns, beards/hair, robes, skin tones, and backgrounds. All artwork is computed in a shared lit shader from per-painting attributes.
- Reviewed the gold click-destination ring and close-up push-off/stopping poses. Start has a forward lean and staggered legs; stop counter-leans with a planted stance and cape settling.
- Reviewed the three enemy silhouettes, sword strike/recovery pose, red target ring and health bars, bright blood fragments, pale bone dust, and collapsed skeleton corpse in the combat captures.

### Character lighting verification

The earlier full-browser baseline checked that all **28 character parts** remained in the shadow caster list and received shadows, and that the non-emissive body materials used scene lighting. The articulated leg update adds four parts, bringing the hero to 32; those parts use the same shadow-registration path. The earlier suite also performed GPU readbacks with the hero's shadow casters enabled/disabled, then with a nearby test light switched between red and blue. Its Firefox run measured **3,066 darkened ground pixels** in the shadow probe and **406 changed torso pixels** in the colored-light probe. Those GPU-readback measurements have not been rerun for the jump update.

### Reusable close-up inspection

Portrait inspection changes the same shader artwork from 32 × 40 to 128 × 160 pixels, adding fine facial features, hair strands, jewelry, embroidery, and canvas texture. A same-camera GPU comparison confirms that the detailed image differs while the royal identity attributes remain unchanged.

Checks cover movement/input blocking, run-timer pause, player visibility, eye-level framing, narrow-viewport resizing, E/Escape/button exits, cancellation during entry, and regeneration during inspection. The camera's target, angles, radius, FOV, and near plane are restored, and the normal portrait detail returns. Generic controller tests use an arbitrary tablet target rather than a portrait.

Screenshots are generated under `test-results/` by the browser and profile scripts; they are not application assets.

## Hardware performance baseline

The following profile was recorded for the expanded dungeon before the inward-facing placement, inspection, movement, and ECS/combat updates. It is retained as an older rendering baseline; hardware performance has not been re-profiled for combat.

Reference run: **Chromium 159.0.8154.6**, Linux, **NVIDIA GeForce RTX 2070**, WebGL2 through ANGLE/OpenGL ES, **1920 × 1080**, high quality, seed `MOURNING-731`.

Each area is warmed up, then sampled for 120 animation frames. Draw counts include shadow/effect passes. These are measured desktop results, not the software-rendered Chromium smoke-test FPS.

| Area | Mean frame time | Approx. FPS | 95th-percentile frame time | Draw calls |
| --- | ---: | ---: | ---: | ---: |
| Entrance | 17.31 ms | 57.8 | 18.1 ms | 490 |
| Water | 17.32 ms | 57.7 | 18.1 ms | 315 |
| Stairs | 17.32 ms | 57.7 | 18.1 ms | 397 |
| Lava | 17.29 ms | 57.8 | 18.0 ms | 445 |
| Altar | 17.34 ms | 57.7 | 18.1 ms | 344 |
| Throne | 17.28 ms | 57.9 | 18.0 ms | 318 |
| Butchery | 17.28 ms | 57.9 | 18.0 ms | 375 |
| Blacksmith | 17.38 ms | 57.5 | 18.1 ms | 368 |
| Bakery | 17.36 ms | 57.6 | 18.2 ms | 390 |
| Stable | 17.34 ms | 57.7 | 18.1 ms | 343 |

The Chromium run is close to the 60 FPS planning target, at approximately 58 FPS with the expanded dungeon and high-quality antialiasing. Low quality is available for slower devices.

The profiled world contains approximately **166,638 mesh triangles**, including collision geometry; instanced geometry is not multiplied in this storage count. Recorded JS heap samples were approximately **109–136 MB** during the ten-area pass, with garbage collection causing normal fluctuations.

## Regeneration/resource checks

Five consecutive regeneration samples include different layouts and two identical final seeds. The repeated `MOURNING-731` samples stabilized at:

- 2,012 scene meshes, including collision meshes, architecture, character parts, enemy rigs, social props, health displays and fixed effect pools.
- 28 materials.
- 4 scene-tracked runtime textures/render targets (post-process internal buffers are managed separately by Babylon).
- 51 cached effects after regeneration and initial rendering.
- 34 compiled custom shader source entries, including the shared portrait material.

Exploring additional areas can compile additional material variants. Regenerating releases those effects and returns to the same initial counts. A shader-cache growth issue discovered during testing was fixed by disposing scene resources, releasing old effects, and removing generated custom shader source entries.

## Implementation decisions finalized during the build

- All state-machine definitions are grouped under `src/machines/`; each monster kind has its own machine. XState pure transitions keep gameplay synchronous and driven by simulation ticks, with no machine-owned wall-clock timers or subscriptions.
- `xstate/graph` generates shortest paths extended over each candidate outgoing event, including self-loops and forbidden attempts. The model suite executes 2,753 generated paths plus 9,600 deterministic cyclic steps across its input scenarios. Continuous context is partitioned for finite exploration, so coverage is explicit state/branch coverage rather than an unbounded-path proof.
- Model invariants cover dead actors, one-impact attacks, mutually exclusive commands, protected health, valid navigation waypoints/door capabilities, lock preservation, single-claim loot, progression gates, inspection cleanup, modal visibility, pointer ownership, stale Inspector requests, and replacement UI deadlines. Every exported production machine must have a specification.
- `CustomMaterial` handles banded lit surfaces instead of a custom node-material lighting stack.
- Upper walls retract geometrically rather than using fragment-shader cutouts, so visible geometry and shadows stay synchronized.
- An irregular grown graph receives seeded room roles, footprints, branches, and loops. Item placement is validated against prop-aware navigation; failed candidates retry deterministically.
- Four themed rooms are guaranteed, including their defining furnishings and two lizard steeds.
- Royal portrait identities and appearance traits are generated as plain data; a shared material renders the paintings without image textures.
- All normal game dependencies are local bundles. The Inspector is dynamically loaded only in development.
- A small typed ECS with indexed queries supports attachable components. Movement, door use, attacks, health, collision adapters and animation are shared by player and enemies; generated objects and ambient render behaviors are also registered entities.
- Effect simulation uses transient entities with fixed-size thin-instance render pools (192 hit particles and 32 bolts maximum). Corpses retain their rigs rather than allocating replacement meshes.

Current state-machine/social reports include `test-results/machine-model-report.json`, `test-results/chromium-social-report.json`, and `test-results/firefox-social-report.json`. Full browser, targeted movement/combat/inspection, portrait, and hardware reports retain their existing filenames in `test-results/`; the table above distinguishes current runs from earlier baselines.
