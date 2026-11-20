# Implementation progress

Execution record for [implementation path](implementation-path.md). Started **2026-11-18**.

## Current position

- Planning/source audit complete; working tree was clean at baseline `2654e65`.
- Selected the procedural-content Phase 0 prerequisites as the first delivery sequence.
- Planning committed as `822ec0c`; the pre-commit baseline passed all 97 tests, lint and format.
- **Completed G1–G3, T1, I1–I2, S1a–S1b, N1, GF1, D1 (`e6591df`), O1 (`6f79a97`) and O2
  (`d698f27`), O3 (`9be81bb`) and O4 (`123b9a9`). Independent O4 review returned READY.**
- **P1 resource-fix slice committed as `6378d61`; independent review READY, no blockers.** Seal rendering now performs
  at most five detached objective reads per update instead of 110; owned test-server startup/failure
  cleanup is covered. No retained application memory leak was established; the user closed the
  investigation on 2026-11-19 and excluded system configuration/driver diagnosis from project scope.
  The user's `docs/notes.md`
  takes priority over further roadmap expansion: stability, corpse traversal, blocked-click fallback,
  skeleton gait, held-F defense, declarative kobold phalanxes, then public repository/Pages release.
  **P2 is committed at `726af8a`; final independent review returned READY and the user accepted traversal.**
  **P3 is complete; final independent review returned READY, clearing both route-quality blockers.**
  Its feature commit is authorized. **P4 skeleton gait is next, not started**; P5–P7 remain planned.
  Dependency order and acceptance gates are in `implementation-path.md`.
  The original notes remain the user's source of intent.
- P2 ramp correction: **246 tests**, strict typing, format/lint/build pass after resumption.
  The affected Chromium animation suite passes **28 moving-contact crossings / 46 captures**,
  with a separate corrected four-view ramp capture. Earlier combat **15**
  and movement **13** checks remain the pre-review baseline and were not repeated.
  Water alone slows grounded travel; corpse stepping is render-only for every actor.
  Final review passed 10 targeted tests, 4,005 rendered-chain round trips, 12 reach-boundary probes,
  original flat/ramp cases and lifecycle/reset checks; it reused the full verification and captures.
- Initial P3 resumed the restored partial edits against **`726af8a`**. **56 focused tests**, then **259
  full tests**, strict typing, format/lint/build and **15 Chromium movement checks** pass. Actual
  red regressions cover active-cache invalidation, closing-door progress and repeated stuck commands.
  Reviewed effective-ring captures; **20 machines / 92 states / 175 branches**, no chart changes.
- P3 review correction: actual-travel cached detour **24.634 → 7.219 units**; opposing-side
  equivalent endpoints **13.877 → 2.674 units**. Distant 0.016-unit body motion over 1.92s now
  retains one held plan, with current-geometry frontier/edge invalidation coverage. **60 focused /
  263 full tests**, format/lint/build, and **one 16-check Chromium movement pass** all pass.
  Final independent review is **READY**. Attributed checks: **17 partial tests**, **24 route/tie
  cases**, **72 body-cache/gate cases**, 100 stable holds with zero new plans, and report/capture/diff
  checks. Review reused the 263-test/full-check/build and 16-check movement results. Its cold search
  sample was **139 ms**, a documented bounded, non-blocking limitation.
- O4: **228 pure/model tests**, strict typing, format/lint/build; **20 machines / 92 states /
  175 branches**. Tribute browsers: **9 checks each** in Chromium and Firefox. Chromium O3 **14**,
  O2 **17**, movement **13**, combat **14**, social **9**, full gameplay **23**, and production smoke
  pass. New 100-seed routes/population/pacing and three-seed physical takeover checks pass.
- O3: **214 pure/model tests**, strict typing, format/lint/build pass; **19 machines / 87 states /
  168 branches**. Last Ember **14**, objective work **17**, combat **14**, discoveries **17** each
  in Chromium and Firefox; Firefox inspection **13**; Chromium full **23**, movement **13**,
  social **9**, animation **28 captures**, production smoke and 100-seed report export pass.
  New 100-seed O3 traversal/interaction coverage and screenshot review are recorded below.
- Historical O2 decimal timebase correction: **202 tests**, strict typing, formatting, lint and build pass. Model totals:
  **18 machines / 85 states / 167 branches**. Objective-work browser checks pass **17 each**
  in Chromium and Firefox, sequentially. Chromium combat **14**, movement **13**, jump **8**,
  Firefox inspection **13**, and production smoke retain their initial O2 verification baseline.
  Implementation used no subagents; independent-review results are attributed below.
- O1 verification after both input-boundary review corrections: **178 tests**, strict typing,
  formatting, lint and build pass. Objective
  model coverage added five states/five branches; that baseline covered 17 machines / 80 states / 160 branches.
- Latest D1 checkpoint: 155 pure/model/geometry tests, lint, formatting and build pass; 17 discovery
  checks and 14 combat checks in each browser, plus 13 Firefox inspection checks pass.
  Production smoke, 28 animation captures and nine Chromium social checks also pass. The CPU
  A/B/A probe and preparation-budget regressions pass; precise timings are in `VERIFICATION.md`.
  Other browser/gallery/performance results remain the recorded earlier feature baselines.
- Final independent O1 review returned **READY**, clearing both input-boundary blockers. O2's
  final independent review also returned **READY**, clearing both duration-boundary blockers.
  Reviewer checks, including 46 additional boundary/half-step/carry-reset probes, are attributed below.

## Feature tracker

| ID | Status | Test-first evidence | Verification / review | Commit |
| --- | --- | --- | --- | --- |
| G1 | Complete | Four contract tests failed on missing API, then passed; historical first-attempt/retry geometry digests | 101 tests, typecheck, lint, format, build pass; independent review cleared, two test improvements applied | `592a84e` |
| G2 | Complete | Report contract failed before API; review regression reproduced biased gallery sampling | 106 tests, typecheck, lint, format, build and 100-seed export pass; both review findings addressed | `4c3820c` |
| G3 | Complete | Real browser failed on missing report API before implementation | 108 tests/check/build, targeted browser, production, 48 captures and 5 regeneration checks pass; both review findings fixed | `8ad2d83` |
| T1 | Complete | Stationary skeleton fixture failed at `[0,2]` before fix | 23 full-browser checks pass in Chromium and Firefox; 108 tests/check/build pass; review suggestion applied | `bb56640` |
| I1 | Complete | Keep contract failed before API; 200-seed chronology/reference invariants | 113 tests/check, build, generation browser and corpus pass; all review findings addressed | `624f8d4` |
| I2 | Complete | Presentation contract failed before API; review regression reproduced swapped painting identities | 117 tests/check/build, Firefox inspection 13 and portraits, Chromium full 23, production, generation and gallery pass; follow-up review cleared | `a2ba6cf` |
| S1a | Complete | Initial contracts failed on missing module; review regression reproduced thin-barrier crossing | 123 tests/check/build pass; independent follow-up review cleared the swept-clearance fix | `a65c239` |
| S1b | Complete | World/report contracts failed on missing scene provenance; final-world navigation over 100 additional seeds | 125 tests/check/build, both movement browsers, Chromium full/social, production, generation and gallery pass; independent 500-seed review cleared | `2e93f62` |
| N1 | Complete | Identity/report and visual tests failed first; corpus doorway-home and review HUD-overlap regressions failed before fixes | 130 tests/check/build, both combat browsers, full/social, production, generation and gallery pass; independent review cleared | `4f45a2c` |
| GF1 | Complete | Moving-pursuit, escaped/occluded-target and goblin flee-speed regressions failed first | 133 tests, format/lint/build, both combat browsers, Chromium movement/jump/animation pass; independent review cleared | `cd415d1` |
| D1 | Complete | Hidden melee death reproduced first; follow-up cost regression failed with 8,000 matrix calls / 600 bounds refreshes over four off-ray queries | 155 tests, format/lint/build; discovery 17 and combat 14 each browser, inspection 13, animation 28, social 9, production and CPU probes pass; independent review cleared | `e6591df` |
| O1 | Complete | Initial missing APIs and reason/visibility regressions; five review regressions reproduced metadata retention and partial commits | 178 tests, format/lint/build pass; independent READY review: 42 focused tests, original probes and 18 malformed-reason cases | `6f79a97` |
| O2 | Complete | Initial missing-module/lifetime reds; both duration corrections reproduced false monster-first results; decimal sweep and pure/model/browser regressions precede work-unit fix | 202 tests/check/build, 1,200-duration sweep, work 17 each browser; independent READY review cleared both blockers and passed 46 additional probes | `d698f27` |
| O3 | Complete | Missing scenario API and focus model failed first; `ember-70` reproduced shrine stealing the clue's E approach before correction | 214 tests/check/build, 100 O3 seeds, Last Ember 14 each browser plus regression suites; independent review READY | `9be81bb` |
| O4 | Complete | Missing tribute/cargo APIs; actual return-route stall, blocked-status and retired-scenario regressions failed before corrections | 228 tests/check/build, 100 tribute seeds, both tribute browsers, affected regressions/full Chromium/production pass; independent review READY | `123b9a9` |
| P1 | Complete; application investigation closed by user | Seal budget failed at 110 reads/update; isolated startup-failure probe left Vite live; helper contracts failed before implementation | 236 tests, format/lint/build, bounded Chromium resources/dev smoke and production smoke pass; independent review READY: 8 targeted tests, 3 adversarial cleanup probes, diff check. System diagnosis outside scope | `6378d61` |
| P2 | Complete; user accepted, final independent review READY | Original edge red: 0.348118 penetration. Follow-up math tests 0 pass/3 fail; translated ramp reproduced 0.068665 penetration before analytic inverse fix | 246 tests, format/lint/build; animation 28 crossings/575 contacts and reviewed captures; final review cleared all blockers with targeted geometry/contact/lifecycle probes | `726af8a` |
| P3 | Complete; final independent review READY | Initial audit 10 pass/3 fail; review regressions 13 pass/3 fail: actual-travel old-root detour, far-side equal endpoint and distant-motion replans | 60 focused / 263 full tests, format/lint/build, 16 Chromium movement checks; final review cleared both blockers with 17 partial tests, 24 route/tie and 72 body-cache/gate cases plus stable-hold/performance/capture checks | This commit |
| P4 | Next, not started | Species-specific skeleton lurching gait; see implementation-path.md | Animation follows authoritative movement and collision | — |
| P5–P7 | Planned, before new roadmap expansion | See current priority table in implementation-path.md | User gameplay notes and release request | — |

## Work log

### P3 — final independent review and delivery — 2026-11-19

- Final independent reviewer returned **READY**, clearing both the old-root route detour and
  far-side endpoint tie blockers. Attributed results: **17 partial-navigation tests**, **24
  route/tie cases** (four rotations plus 20 cases), and **72 body-cache/gate cases** passed.
- **100 stable held updates** produced zero new plans. The remote-body probe retained one initial
  plan, with **16 held updates totalling 1.31 ms**. The cold search sample was **139 ms**: bounded,
  documented and non-blocking. Diff, report and capture checks passed. These are reviewer-reported
  results, not another local verification batch or a hardware-performance claim.
- Review reused the implementation's **263-test/full-check/build** results and **16-check movement
  pass**. Earlier pre-fix results below retain their historical qualifications.
- **P3 is complete and its feature commit is authorized with normal hooks.** This delivery entry's
  containing commit records P3. **P4 skeleton gait is next, not started.** P2 remains accepted at
  `726af8a`; P1 remains closed. Raw `docs/notes.md` is untouched and excluded from the feature commit.

### P3 — route-quality review correction — 2026-11-19

- Independent review reported **BLOCKED** on two route-quality defects: cached paths returned
  through the previous search origin, and equal target distances selected a far face by world
  coordinates. Its **20 navigation/partial tests** and **12 additional rotated/enclosing,
  cage-release, collider/relock and arrival/settle probes** passed. Those are attributed reviewer
  results; the earlier **259-test / 15-browser-check** batch remains the pre-fix baseline.
- **Red first:** three new contracts produced **13 pass / 3 fail**. Actual `moveActor` travel
  between `(0,0)`, `(4,3)`, `(4,-3)` reproduced **24.634 units** versus fresh **7.219**; positive
  X/Z approaches chose the far endpoint and travelled **13.877**, while negative-side controls
  travelled **2.674**. The distant-body fixture made **four plans** over 16 held updates/1.92s.
- **Fix:** cache checked directed graph connections, then rebuild parents/costs from current
  supported connectors after movement. Within a **0.001-unit** target-distance tie, prefer the
  shorter graph-travel estimate. Local refinement remains strictly target-distance driven;
  the existing off-centre precision test caught an intermediate tie-band alignment regression.
  Both rotated cached routes now travel **7.219**, via `(6,0)` / `(0,6)`; all four opposing-side
  cases travel **2.674**, ending at the near **±1.3203125** face.
- **Bounded reuse:** dynamic signatures track actual occupied cells and swept directed edges in
  each body's small footprint. Exact geometry remains relevant along the route and throughout
  the potentially better-frontier region. Remote sub-cell movement that preserves connectivity
  no longer reruns a held search. Start connectors, smoothing/refinement and motor clearance use
  live geometry. Tests cover route entry/death, same-cell frontier movement and an edge becoming
  blocked while both endpoint cells stay free. No machine/guard changes.
- Focused **60 tests** and strict typing pass. One affected Chromium movement pass passed
  **16 checks** after all corrections, including real opposite-side clicks after actual travel.
  Reviewed the opposing furniture rings and refreshed lava/gate captures. Port 5173 was absent;
  the owned **5187** server and test browser were cleaned up. Pre-existing services were untouched.
- Required format/lint/test/build commands each ran **once** after focused/browser checks:
  **263 tests**, strict types and **20 machines / 92 states / 175 branches** pass; existing bundle
  warning remains. No broader browser repeat, staging, commit or subagents; notes untouched.
- **Performance/limits:** distant-motion red held cost **67.6 ms / four plans** becomes **0.85 ms /
  one initial plan** across all 16 hold updates. The fixture first warms terrain during remote-site
  selection; its green initial body-aware plan costs **38.2 ms**. A separate cold 4,213-tile probe
  uses **3,369 clearance calls**, **175.8 ms** in the focused batch; cached cursor drift adds 118
  calls. Timings are descriptive, not FPS guarantees. Topology-changing remote movement still
  invalidates conservatively, and searches remain synchronous. Full details are in VERIFICATION.md.
- At this correction checkpoint follow-up independent review was pending. Both reported blocker
  reproductions were green; the final **READY** verdict above subsequently cleared the review gate.

### P3 — initial blocked-floor click/hold fallback (pre-review baseline) — 2026-11-19

- Resumed the prior implementer's restored edits against **`726af8a`**. The user accepted P2;
  the reported corpse slowdown was an old-page/live-reload expectation, not another traversal defect.
  No interrupted-agent red result is claimed: the first resumed focused run passed **53/53**.
- Added three regressions before fixing them: **10 pass / 3 fail** in partial navigation.
  Opening a gate left the active endpoint at **-0.495361** instead of **3.1**; a closing gate
  stopped the actor at **-0.921071**, short of its **-0.495** frontier; an immobile physical
  adapter restarted the held route **12 times in five seconds**. All now pass, including body
  departure, cancellation and fresh input. Missing IDs in the inherited test blockers were
  corrected after the initial strict-type check; final typing passes.
- Floor-only opt-in preserves exact reachable targets and ordinary AI/pursuit/work calls.
  Finite reachable-component search plus bounded sub-cell refinement selects safe progress;
  swept terrain/door/body checks apply to graph edges and smoothing. The gold ring is the effective
  endpoint. Held-command/component caches invalidate for door/collider or live geometry changes,
  throttle small-drift retries, and remember settled/failed physical stops. Existing `ARRIVE`,
  `CANCEL`, `PROBE` and stuck-timeout semantics remain chart-owned; no new guards/transitions.
- **56 focused tests** passed. Final Chromium movement verification passes **15 checks**:
  actual pointer clicks and holds at furniture, unreachable lava floor and a locked gate, precise
  reachable routes, stairs, dynamic closure, real E opening, modal retry, focus/inspection and
  regeneration. The gate fixture needed a side view (its old ray selected the door), then enough
  closing distance for the existing anti-crush chart to settle before arrival. These were fixture
  corrections, not changes to door behavior. Three incomplete assertion runs preceded the final
  pass; another attempt could not connect to the external 5173 server.
- Final pass used `DEMO_URL=http://localhost:5187` through `withViteServer`, which closed its
  owned server; all test browsers closed in `finally`. No pre-existing service was stopped or
  reconfigured. Reviewed furniture/lava/gate effective-ring and ordinary route captures.
- Required format/lint/test/build commands each ran **once after focused verification**, all
  passing: **259 tests**, strict typing, unchanged **20 machines / 92 states / 175 branches**;
  existing bundle-size warning. Full evidence, artifact paths and limits are in VERIFICATION.md.
- At this initial checkpoint independent review was pending; its subsequent findings and corrections
  are recorded above. No commit, staging or subagents. User-owned `docs/notes.md` remained untouched;
  P4–P7 remain planned.

### User scope clarification — 2026-11-19

- Close the resource investigation and continue gameplay work. No retained application memory
  leak was established by the bounded checks. System configuration and driver diagnosis are
  outside this project; earlier host observations remain historical evidence, not an active task.
- P1's measured application/tooling fixes stand. No cause or fix for the original machine freeze
  is claimed.

### P2 — full-speed corpse traversal and render-only stepping — 2026-11-19

#### Final independent review — READY

- The reviewer cleared **all P2 blockers**. Attributed results: **10 targeted tests** and **4,005
  rendered-chain round trips**, maximum error **4.22e-8**; near-zero lateral offsets remain stable.
  **12 reach-boundary probes** pass. Original flat goblin penetration is **4.35e-8**, exact uphill
  goblin **4.60e-9**, and a rotated downhill run has **eight contacts with no penetration**.
- **50 zero-time samples** have zero drift. Airborne, focus-loss, teleport and corpse-removal
  probes pass, as does the diff check. These are reviewer-reported checks, not additional local runs.
- Review reused the implementation's **246-test/check/build** results, **28-crossing / 575-contact**
  browser report and reviewed captures. No broad repeat was requested or performed for review.
- The user's explicit **“proceed”** authorized the normal-hook feature commit, subsequently
  recorded as **`726af8a`**. At this P2 checkpoint P3 was next and not yet started. P1 remains
  closed by user direction. Raw `docs/notes.md` was untouched and excluded from staging.

#### Ramp rotation-math correction — resumed and verified

- Follow-up review cleared the first edge reproduction but found that near-zero lateral roundoff
  at zero down-distance caused ±π/2 hip roll and new ramp penetration. After interruption, the
  on-disk solver was still old; verification was rerun rather than inferred from prior reports.
- **Red:** all three new inverse-geometry tests failed; the real-seed ramp regression had
  **6 pass / 1 fail**, reproducing goblin frame 36 at **0.068665363** penetration with π/2 roll.
- **Fix:** analytically invert the rendered Rx/Rz/knee chain using `asin(side/a)` and the correct
  sagittal hip angle. Reach, lateral feasibility and the neutral-origin region have bounded,
  continuous projections. The four contact passes and 0.46/0.14 caps are unchanged.
- **Green:** **28 focused tests** include 150 feasible rendered targets, singular/boundary tests,
  24 flat and 16 translated uphill/downhill crossings, and 886 ordinary turning stance samples.
  Pure maximum penetration is below **6.74e-8**. One affected Chromium animation pass checks
  **28 crossings / 575 contacts**, max **0.000003269**, plus 46 pose captures. Four obscured ramp
  views were recaptured alone with a corrected camera; reviewed the unobstructed result at
  `test-results/chromium-animation-ramp-contacts.png`. No broad browser repeat.
- The recovered animation test contained 2,340 trailing NUL bytes; only the invalid tail was
  removed. Required format/lint/test/build commands then ran once after targeted verification:
  **246 tests**, strict types and unchanged model coverage pass, with the existing bundle warning.
- At this implementation checkpoint no commit, staging or subagents had been used; independent
  review was the next gate. The final READY verdict above clears that gate. Raw notes are untouched
  and P1's application investigation remains closed. Full evidence is in VERIFICATION.md.

#### First independent review correction (historical baseline)

- Review returned **BLOCKED** on final-foot contact, with no other blockers. Attributed reviewer
  checks passed 5,000 sampler/triangle comparisons, lifecycle probes and a 21-corpse/461-part cache
  probe with zero repeated inversions. The sampler/cache are unchanged by this correction.
- New pure moving regression failed **4 pass / 1 fail** before runtime edits. The real-browser
  regression exactly reproduced **0.348118** penetration at goblin speed 3.7/frame 37, where a
  clear-floor retained anchor became a foot inside the torso after reach clamping. Normal kobolds
  and rotated crossings failed too. Browser subjects are selected by entity ID, correcting an
  initial fixture-only visibility error from comparing freshly created Actor views.
- The solver now computes the actual reachable endpoint and resamples its surface after each of
  up to four bounded passes. Frame-local corrections retain the 0.46 foot/0.14 pelvis caps;
  high contact allows deeper knee folding. Running-flight poses are checked too. Domain movement,
  support, jump and melee elevation remain unchanged.
- **Green:** 23 focused tests; the pure sweep covers **24 crossings / 4,392 foot samples**, including
  116 retained-anchor contacts, with maximum penetration **0.000033674**. The only affected browser
  rerun is animation: **12 crossings**, worst penetration **0.000061007**, and **42 reviewed captures**
  including four moving-edge poses. Existing combat/movement browser evidence is reused.
- Required format/lint/test/build commands ran once after targeted passes: **241 tests**, strict
  types and unchanged model coverage pass; existing bundle warning remains. No commit or subagents.
  **Follow-up independent review is pending.** Details and attributed evidence are in VERIFICATION.md.

#### Initial implementation (pre-review baseline)

- Baseline **`6378d61`**. Implemented only P2; raw untracked `docs/notes.md` remains untouched
  and unstaged. No commit or subagents. Independent review is the next delivery gate.
- **Red:** `node --test tests/occupancy.test.ts tests/corpse-terrain.test.ts` initially had
  **9 pass / 3 fail**: the player still slowed over a corpse, a complete walk trace differed
  from clear ground, and the new sampler module was absent. Existing slowdown expectations
  were deliberately replaced with exact full-speed traces, not relaxed bounds.
- **Implementation:** removed corpse footprints from occupancy/speed selection; only grounded
  water applies 0.52. All four actor kinds share the unchanged motor/clearance. Settled death
  poses update before the shared terrain sample, independent of entity order. A pure vertical
  slab query samples actual oriented voxel boxes; nearby swing preview and contact feed the
  existing leg solve. Maximum corpse height is 0.46 and visual pelvis assistance 0.14, never sums.
  Support, navigation, collision, camera/rings, jump and melee elevation remain authoritative.
- **Corrections:** the geometry test first caught stale rotated child matrices between renders
  (**13 pass / 1 fail**); parent-first synchronization now dirties changed transforms. A follow-up
  unchanged-box test failed (**3 pass / 1 fail**) after its tilted fixture was lowered below the
  height cap. Matrix-value caching now reuses box/inverse data even when settled poses are assigned
  again; weak mesh keys do not retain old worlds. Stop/teleport clear stance anchors.
- **Green:** **50 focused movement/geometry/jump/locomotion/combat tests**, then final required
  commands each ran once: format, lint, **240 tests** (including strict types/models), build.
  **20 machines / 92 states / 175 branches**, no new chart. Existing bundle-size warning remains.
- **Browsers:** sequential Chromium/SwiftShader combat **15**, movement **13**, animation **38
  captures**. Six 48-frame flat/corpse/water crossings cover walking and running; clear/corpse
  position and speed traces match exactly while rendered feet rise. Stairs, door clearance,
  living-body blocking, pursuit, damage, modal/focus cleanup, respawn and regeneration pass.
  The animation fixture checks player and all enemy gaits under attacks, unchanged attack clock/
  arm pose and bounded soles. Capture review prompted one animation-only rerun to use the actual
  goblin ranged action; both runs passed. No full gameplay, cross-browser or hardware pass.
- Reviewed the final `chromium-animation-poses.png` flat/corpse comparisons and refreshed moving
  combat capture. Reports are under `test-results/`; details are in `VERIFICATION.md`. Updated
  README and AGENTS with the new game feel/render-only contract. P1's application investigation
  has since been closed at the user's direction; its earlier host observations and qualifications
  are retained only as historical evidence, not an active follow-up.

### P1 — bounded resource investigation and reproduced fixes — 2026-11-19

- Baseline **`123b9a9`**. Preserved the parent's priority-queue edits; read but did not edit or
  stage the user's untracked `docs/notes.md`. Implementation used no subagents. Independent review
  subsequently returned **READY**, with no blockers; the user authorized the feature commit.
- **Attributed host evidence from the parent:** 31 GiB RAM, about 20 GiB available, no swap;
  Vite RSS **2,444,048 KiB (~2.33 GiB)**, combined OpenCode processes about **4.5 GiB**. Previous
  boot (`-1`), Nov 18 13:48–13:51: NVIDIA **615.78.08** TLB invalidation failures, **Xid 62 PMU
  halt / Xid 154 recovery**, with no matching host OOM found in that audit. These are supplied
  observations, not new measurements or proof that application allocations caused the freeze.
- **Red:** after correcting a missing-worker test fixture, the null-engine seal regression had
  **3 pass / 1 fail** at **110 reads/update** (26,400 detached snapshots in 240 updates). The real
  browser independently failed the same five-read budget after passing its resource checks.
  An earlier browser fixture failed because steps ran before scene readiness; it now explicitly
  awaits loading and asserts all 120 steps actually ran in each regeneration.
- **Fix:** sample chart-derived `LastEmber.state` once within each synchronous renderer update.
  No cross-frame cache or parallel lifecycle flags. Materials, pulse/scale, fracture rotations,
  progress, recovery, focus disabling and scenario removal have fresh-update regressions.
- **Before/after:** Chromium synchronous seal-update CPU-path time for 240 updates was
  **215.3 → 12.2 ms** (**0.897 → 0.051 ms/update**); detached reads **110 → 5**, a **95.45%**
  reduction (6,600 → 300/s if called at 60 Hz). These isolated measurements are not GPU FPS.
- **Tooling failure:** an isolated temporary-port probe injected launch rejection at the old
  pre-`try` boundary and found Vite still serving. Normal npm-parent termination did stop that
  server here; the suspected normal-teardown orphan was not reproduced. Added a shared owned
  server scope around startup/launch/page/report operations. It starts Vite directly, uses a
  strict port, bounds readiness and reaps its POSIX group, including a surviving descendant.
  The contract file failed on the missing helper first; four tests then passed for success/failure,
  external-server reuse, timeout/exit/spawn errors and parent-exit/descendant cleanup.
- **Bounded resources:** Chromium SwiftShader only, low quality, 640×360, 60s browser deadline,
  real input/menu pause/resume, at most 12 fixed steps per yielding batch, three regenerations.
  Both before/after retain **2,151 meshes / 28 materials / 4 textures / 55 effects / 34 shader
  sources / 5,738 ECS entities / 1 scene / 1 work system**, with 317 DOM nodes and 75 listeners.
  Post-GC heap: before **98.89 / 99.58 / 100.22 MiB**; after **98.91 / 99.65 / 100.29 MiB**.
  Raw heap varies much more (after **158.73 / 129.06 / 147.85 MiB**). Counts plateau; the small
  retained-heap increase is similar before/after, within the 8 MiB regression budget, and is not
  proof of indefinite stability. No retained-heap improvement is claimed from the churn fix.
- **Implementation checks before review:** required format/lint/test/build commands each ran once after targeted passes:
  **236 tests**, strict typing and **20 machines / 92 states / 175 branches** pass. Bounded resource
  regression supplies the dev smoke; production smoke passes separately. Existing bundle warning
  remains. No blanket browser-suite rerun, hardware-GPU stress or screenshot comparison was needed
  for this data-identical render fix. Full measurements/reproduction are in `VERIFICATION.md`.
- **Independent review — READY:** reviewer reported **8 targeted tests**, **3 adversarial cleanup
  cases** (SIGTERM-resistant leader, descendant after leader exit, stalled readiness) and diff check
  passing, with no blockers. It reused the implementation's 236-test/build/resource/production
  results rather than repeating broad suites. These are attributed reviewer results. The normal
  pre-commit hook remains the required final commit check. **At that checkpoint P2 was next.**
- **Historical limitations at delivery:** original GPU/host freeze diagnosis and long-duration/
  native-memory behavior were unproven. Terminal objective-work sampling and possible duplicate
  visibility queries were unmeasured audit candidates. The user subsequently closed the application
  investigation and excluded system configuration/driver diagnosis from project scope.

### O4 — independent royal tribute plan — 2026-11-19

- Baseline **`9be81bb`** (O3 committed, review READY). Implementation and independent review
  were separate delivery gates; the final reviewer returned READY.
- **Red:** `node --test tests/tribute.test.ts tests/models.test.ts` failed on missing tribute and
  cargo-machine modules before production edits. The authored contracts covered deterministic
  routes, unique cargo ownership, physical pickup/delivery, ready-boundary death/interruption,
  recovery, persistent partial deliveries, independent/simultaneous outcomes and off-screen AI.
- The actual porter delivered once then stalled returning through a room corner. A focused
  regression showed `goTo` succeeding while the first `steer` returned null. Support checks now
  partition at tile crossings so long smoothing segments cannot miss short unsupported intervals.
  The original porter completes four deliveries; three additional seeded survivors physically
  recover and deliver their predecessor's dropped crate.
- Two later regression failures preceded fixes: blocked cargo was mislabeled Interrupted, and
  an old scenario attempted assignment after work retirement. Both pass. A damaged-world report
  fixture also exposed recomputation of authored sites; sites now remain plain generated data,
  with final route validation separate from the detached blueprint read API.
- Added four ECS cargo charts, existing-pack serial porter selection, shared O2 phase/task
  validation, same-batch delivery receipts, E recovery, persistent clock, procedural coffers,
  cache sockets, hatch and carry pose. Normal hostility, living bodies, corpses and doors remain
  authoritative. Composition installs once; no scenario submits a separate O1 update.
- **Green:** 228 tests and build pass, including 20-machine model coverage and 100 new tribute
  seeds (longest shrine/cache route 126 tiles, unchanged 21 enemies/three core reliquaries).
  Both tribute browser runs pass nine checks; three repeated regenerations per browser stabilize
  scene resources. Sequential Chromium O3/O2/movement/combat/social/full gameplay and production
  checks pass. Detailed actual results and reviewed captures are in `VERIFICATION.md`.
- Browser fixtures were updated for five freshly composed clocks and to isolate idle social
  gatherings from the stairs pack's new porter priority. Assertions still exercise real movement,
  combat, social interruption/return, and reset behavior. No new hardware/gallery claim.
- Independent review returned READY after rerunning 228 tests/check/build, both tribute browsers,
  Chromium work/Last Ember/movement/combat/social and production smoke. Twenty-five additional
  resource/ownership/interruption probes passed, including exact 1,200/480-tick work boundaries.
  Its only finding was a stale README scenario revision, corrected before commit.
- User feedback identified excessive duplicated browser verification. The delivery loop now records
  focused iteration, one affected-browser pass, and review-specific probes instead of blanket reruns.

### O3 — playable Last Ember contest — 2026-11-19

- Started from verified clean **`d698f27`**. Read the authoritative competing-objectives §6,
  implementation path/progress, O1/O2 APIs, generation/placement, ECS, work/combat, discovery,
  rendering and statechart/model contracts. Independent review subsequently cleared the feature.
- **Test first:** `node --test tests/last-ember.test.ts` failed on missing `src/lastEmber.ts` before
  implementation. Outcome, once-only reward, clue, unique-worker death, off-screen navigation/
  defense and 100-seed route contracts were authored first. The focus model and component test
  subsequently failed on missing `src/machines/world/focus.ts` / `focus` before that lifecycle
  was added. Existing O1/O2 charts own the race/work transitions; focus adds two states/one branch.
- Local review added a first-failing interaction regression: **10 pass / 1 fail**, `ember-70`,
  “ember:shrine must not steal E from portrait-10.” Portrait placement now excludes those work
  approaches, and final validation rejects overlapping E approaches. Real E inspection of that
  regression seed passes in both browsers. A temporary-obstruction case also checks final
  navigation validation, no off-screen credit and no disclosure of an unseen cause.
- Final screenshot review caught stale recovery directions after cleansing/repair. The focused
  monster-first/contested tests failed **0 pass / 2 fail** before correction. Live clock copy now
  preserves the historical loss/fracture while reporting recovery already completed, and describes
  completed profanation in the past tense instead of claiming the cleansed shrine is still corrupted.
- Reused the entrance shrine, reserved smithy anvil approach and entrance portrait; no late
  blocker placement. `workSite` attaches to actual prop ECS entities. Missing/inaccessible sites
  reject through existing bounded generation retries. Added independent `last-ember-v1` identity
  without rerolling established keep/art streams. `trial-23` now accepts attempt 2: its previous
  attempt 1 lacks a promised site. Updated its explicit trace/digest fixture after inspection.
- Activation: within four units of the shrine's approach or entering the smithy, with immediate
  visible warning/clock. Six 20s rival cycles; six 6s hero cycles, two seals per cycle after
  actual clue inspection. Method amount/revision revalidate both work boundaries. Ordinary
  threat perception/tactics take priority; assigned idle workers navigate to the authored face.
  The existing smithy goblin is named, retaining its N1 identity where applicable. Population
  remains 21 enemies/four goblins; there is no replacement or hostility change.
- All race results and later kill/disable semantics are implemented. Cleansing/repair are separate
  one-segment, six-second follow-ups gated by the latched original outcome and disabled focus.
  Rewards are once-only +30/+10/+15 health; outcome effects consume only emitted IDs with a replay
  ledger. Required progression remains separate. Lifecycle state derives from O1/O2/focus charts.
- Run composition calls `prepareLastEmber`, then installs the plan **once**. The README documents
  O4 fragment concatenation before that installation. An integrated independent-clock fixture
  continues through restoration and completes without replacing its record/system or sharing rewards.
- Added compact persistent clocks with observed/learned name/reason filtering; twelve procedural
  seals and work poses follow actual clocks. Inspected desktop, named-worker, 600×900, 400×800 and
  900×600 captures. Corrected a short-window warning/agenda overlap found during screenshot review.
- **Checks actually run:** 214 pure/model tests including strict typing, format/lint/build,
  `git diff --check`; 100 O3 seeds plus existing multi-seed suites; `report:generation` exports
  100 valid corpus seeds and 12 selections. O3 maximum shrine/focus path: **128 tile steps**;
  largest accepted zero-based attempt: **2**. Travel at 4.8 plus 36s work is ~63s versus the
  minimum 120s rival work; this is a geometry budget, not measured combat difficulty.
- Sequential browsers: Last Ember **14 each**, O2 work **17 each**, combat **14 each**, discoveries
  **17 each**, Firefox inspection **13**, Chromium movement **13**, social **9**, animation
  **28 captures**, production smoke. Chromium full suite **23**, including physical completion
  of MOURNING-731/CINDER-42/VIOLET-7 with ordinary AI/collision. Its initial combined command
  timed out at 300s after 19 passes; standalone rerun with a 600s budget passed all 23.
- Updated old fixtures to select the profile standout specifically, select the portrait entry
  instead of the newly appended rite, expect fresh O3 clocks after regeneration, and introduce a
  real threat in the final-frame AI interruption test (idle assigned actors now service their job).
  These retain the original assertions' purpose. New real-input tests also cover optional loss
  followed by altar/throne victory. Reports/captures remain ignored under `test-results/`.
- Remaining delivery gate: **independent review**, then any authorized future commit. The existing
  large-bundle build warning persists. Broader gallery/hardware/Firefox full-suite results remain
  historical unless explicitly listed above. O4 cargo/carriers are not implemented here.

### O2 final independent review — READY

- Reviewer cleared both duration-boundary blockers and reported **202 tests/checks and the build
  passing**, the **1,200-duration sweep over 4,323,600 fixed ticks**, and **17 objective-work
  checks each in Chromium and Firefox**.
- The reviewer also passed **46 additional below/above-boundary, half-step and carry-reset probes**.
  No blockers remain. These are attributed independent results, separate from the implementation
  runs recorded below.
- At this historical checkpoint O2 was ready for its feature commit (subsequently `d698f27`);
  O3 had not started.

### O2 final-review correction — decimal simulation timebase — 2026-11-19

- Follow-up reviewer reported the remaining 6.9s/three 2.3s race blocker; its original 198 checks
  passed with no other blockers. Before production edits, `node --test tests/objective-work.test.ts`
  reproduced **19 pass / 4 fail**. The installed race emitted `corrupted`, and the 1,200-duration
  sweep (0.1–120s in tenths, all actual fixed ticks) included **3.7 → 3.6999999999999997** and
  **6.9 → 6.8999999999999995**, both still working. Partial-last-frame and restarted 6.9s cases
  also remained unfinished. Existing immediate-below-boundary checks passed.
- `npm run test:objective-work` reproduced monster-first in the main loop at absolute step
  **422** (activation 8 + 414 work steps): rival **3/completed**, hero **0/lost**.
  Added conversion-boundary regressions where raw multiplication collapses distinct values:
  immediately below `23/60`, and an authored duration immediately above `11/60`.
- The extended model also failed before production edits (**20 pass / 1 fail**) on a generated
  3.7-second/222-tick trace. Production now accumulates compensated 60 Hz units, converts both
  ticks and durations relative to their nearest simulation boundary with the signed remainder
  retained, compares units strictly, and exposes elapsed seconds as units/60. No epsilon snapping.
  The carry resets on cycle lifecycle transitions; binding validation rejects nonfinite scaling.
- The 1,200-duration sweep now passes all **4,323,600 actual fixed ticks**, including each last
  incomplete frame. Previous immediate-below-duration tests, new multiplication-boundary cases,
  half-final-step work, and interrupted/blocked/cancelled/settled carry resets pass.
- Final checks: **202 full tests** including typing, format/lint/build and `git diff --check` pass.
  The focused work/model run passed **44 tests**. Final work model: **8,206 generated paths /
  480 cyclic steps**, all five states/seven branches, including decimal and finite-overflow partitions.
- Both work browser suites passed **17 checks each**, sequentially. At work step 413: hero **0**,
  rival **2**, no outcome. Step 414: both **3/contested**, two final contributions in one batch,
  one outcome still latched after another 60 steps. Absolute final steps were **424 Chromium /
  439 Firefox**; `decimalRace` in the JSON reports retains before/boundary snapshots.
- Final review was pending at this checkpoint; the READY verdict above clears both timing blockers.
  No commits or agents were used at this checkpoint. The prior 198-check result is reviewer-reported;
  older verification below remains a historical baseline. Existing large-chunk warning persists.

### O2 first duration correction — historical seconds-based baseline — 2026-11-19

- Reviewer reported the three-second boundary/race blocker, with 97 other lifecycle probes
  passing. Before production edits, `node --test tests/objective-work.test.ts` reproduced
  **15 pass / 4 fail**: 180 fixed ticks left elapsed at **2.9999999999999942**; durations
  **4, 5, 6, 8, 25, 30, 60, 120** also finished late; an actually incomplete
  **2.9999999999999996** seconds was rounded up; the capacity-three race emitted `corrupted`
  rather than `fractured`.
- The expanded finite model failed its generated 180-fractional-tick trace (**20 pass / 1 fail**).
  `npm run test:objective-work` also failed before production edits: at runtime step **190**
  (activation step 10 + 180 work steps), rival progress was **3/completed**, hero **0/lost**,
  and `monster-first` was latched. Independent review was pending at this checkpoint; no commit or agents.
- Replaced naive summation/tolerance with a chart-owned Kahan carry and strict `elapsed >= duration`
  completion. Start, interruption, cancellation and settlement reset the carry. Public work snapshots
  retain their existing fields. No callback, assignment, commit-boundary or scenario API changed.
- Four new regression contracts now pass, covering every listed duration's exact boundary,
  one-frame/half-frame incompletion, representable values immediately below 3/120 seconds, and
  the installed capacity-three race. The model explicitly enumerates the three-second action's
  180 fractional ticks: **3,185 generated paths / 480 cyclic steps**, all five states/seven branches.
- Final checks: **40 focused work/model tests**, **198 full tests** including typing,
  format/lint/build and diff-whitespace checks pass. Sequential objective-work browsers:
  **16 each in Chromium/Firefox**. Both show hero **0**, rival **2**, no outcome at work step 179;
  step 180 credits both to **3**, emits only `fractured`/contested and remains latched for 60 more
  steps. Reports retain before/boundary snapshots. Existing build chunk warning remains.
- Follow-up review was pending at this checkpoint. The reviewer's other 97 lifecycle probes are attributed results,
  not a separately rerun local suite; other initial O2 browser results below remain historical.

### O2 — physical interruptible objective work — 2026-11-19

- Clean baseline confirmed at O1 `6f79a97`. Scope: physical ECS work, two-phase simulation
  advancement/commit validation, interruption, lifetime identity and existing pause/reset paths.
  Last Ember authoring remains O3. The initial implementation used no subagents and made no commit.
- Before implementation, `node --test tests/objective-work.test.ts` failed with
  `ERR_MODULE_NOT_FOUND` for `src/objectiveWork.ts`. The real Chromium run
  `node tests/objective-work-browser.ts` failed fetching that same missing module from Vite.
  Pure contracts and browser movement/menu/impact/reset assertions were written first.
- Model tests also failed on the missing `src/machines/actors/work.ts` before implementation.
- A later retained-handle regression failed **14 pass / 1 fail**: reattaching a cancelled
  partial component credited **1 instead of 0**. Cancellation now retires its chart cycle,
  and the commit boundary clears detached/replaced pending handles before they can be reused.
- A subsequent real-browser stale-run regression failed after regeneration: a retained old
  system still accepted `advance`. Explicit run retirement now cancels all assignments and
  detaches the system before scene/ECS replacement; retained callbacks fail closed.
- Run-owned work service, actor-owned assignments and site components read actual health,
  combat, navigation, support, geometry, dependencies and prerequisites. Unique cycle IDs bind
  actual actor/site instances. Advance precedes movement/combat; one commit batch follows all
  combat/projectiles/hazards and precedes respawn/rendering. Partial and ready cycles both revalidate.
- Menus/inspection/hidden tabs freeze simulation; hero cleanup cancels unfinished work. Visible
  blur clears hero commands but continues enemy simulation, matching the existing pause policy.
  Committed history survives respawn. No default clock/scenario, work pose or objective HUD was added.
- **194 pure/model tests**, format/lint/build pass. O2 adds **15 simulation contracts** and a
  five-state/seven-branch model (102 generated paths / 480 cyclic steps). Browser work checks:
  **15 each in Chromium/Firefox**, including the two-ready-cycles/third-party-kill race. Sequential
  regressions: Chromium combat **14**, movement **13**,
  jump **8**, Firefox inspection **13**, production smoke. Reviewed refreshed combat-contact,
  movement-route and portrait-inspection captures. Existing large-bundle warning persists.
- API handoff is in `README.md`: `installObjectiveWork`, `activate`, `discover`, `assign`,
  `advance`/`commit`, `cancelWork`, detached work snapshots and `retire`. O3 supplies reserved
  workstations, job/navigation priorities, clock presentation and outcome effects. Resource/method
  changes must be represented by the availability sample's revision. Independent review was pending
  at this checkpoint; it was subsequently cleared above.

### Planning — 2026-11-18

- Read the project guide, current gameplay/architecture/verification, documentation index,
  procedural-content plan, progress-clock guidance and competing-objective requirements.
- Inspected the generator, world contracts, validation tests, ECS and debug harness contracts.
- Created an implementation path with feature boundaries, acceptance gates and the
  test-first → implementation → checks → independent review → fixes → commit loop.

### G1 — versioned diagnostics

- Added `generateDungeonWithReport`, explicit `layout-v2` / `demo-v1` identity, bounded
  attempt traces and `GenerationError`. Normal generation retains the same default budget.
- Test-first command: `node --test tests/generation.test.ts` failed before implementation.
- Review compared 103 seeds against the prior implementation with no world differences.
  Tightened the known rejection reason and retrying-seed digest as requested.
- Full checks passed; review also ran generation/world tests (13 checks).

### G2 — analysis and corpus

- Added detached graph, gate reachability, tile-route, geometric clear-floor and initial
  enemy/social placement reports. Shared the validator's flood traversal with distance
  analysis so diagnostic paths use the same terrain/gate rules.
- Added `npm run report:generation`, a fixed 100-seed corpus and a twelve-seed selection
  with explicit showcase/regression/outlier/distribution reasons.
- Independent review found biased low-area gallery fill; a failing controlled regression
  preceded the fix. Added encounter coordinates, group and activity checks against real
  registered-world/player seeding as requested. All 106 tests and export/build checks pass.

### G3 — development report and gallery

- Added a guarded initial report snapshot and real-browser isolation/persistence/regeneration checks.
- Captured twelve selected seeds × four views with explicit simulation steps; exported safe
  offline HTML, resource metadata and color/grayscale overview sheets. All five same-seed
  resource samples match. Reviewed screenshots and widened the camera to keep altars in frame.
- Review fixes exclude invalid frozen-loop performance counters and exercise a live blueprint
  mutation to distinguish initial capture from recomputation. Targeted checks pass after fixes.
- Full-browser traversal failed at this stage; T1 below subsequently resolved it.

### T1 — live-blocker traversal

- Reproduced the static driver's failure with a deliberately placed stationary skeleton.
- Added bounded ordinary pursuit/attacks when blocked, then replanned from the actual
  position. Retained independent terrain routing and physical collision; no actor deletion
  or direct damage. Per-walk protection is restored in `finally`.
- Both Chromium and Firefox now pass all 23 full-suite checks. Independent review found
  no blockers; its requested finite-immunity restoration assertion passes in Chromium.
- Completed a fresh high-quality desktop-GPU profile (ten rooms, Inspector open/close).
  See `VERIFICATION.md` for actual measurements and the earlier interrupted-run qualification.

### I1 — shared keep history

- Added three authored profile families, shared houses, three successive monarchs, semantic
  fact/person/event IDs and chronological events. `world.keep` is generated once before
  retries and appears as detached metadata in the generation report.
- Extracted the existing RNG unchanged and added versioned domain/object streams. Historical
  geometry digests remain identical; content metadata is now `keep-v1`.
- Review improvements pin all three profile-family identities and test nested report isolation.
- Visible portrait/room evidence is I2; this feature does not claim the full profile art gate.

### I2 — linked portraits and room evidence

- Bound accepted geometry to three monarch subjects and valid painting years, shared house
  palettes/core traits and factual inspection captions. Entrance/crypt/altar/throne captions
  refer to the generated history while keeping the altar gate instruction explicit.
- Kept layout RNG/geometry stable; content version advances to `keep-v2` for changed presentation.
- Review found paintings swapped subjects when entity arrays were reversed. Added a failing
  regression, then keyed painting streams by placement with a total assignment ordering.
- All 117 pure/model checks, 13 Firefox inspection checks, four-portrait GPU check, 23 Chromium
  full checks, production smoke, generation browser/corpus and refreshed gallery pass.

### S1a — bounded scene planner

- Added pure forge/bakery recipe planning with semantic prop IDs, a focal/work pair, two
  optional roles, twelve relative sockets per role and at most 96 anchor candidates.
- Paths connect each work face to the room center before later support props are placed.
  Existing reservations, colliders, blocked tiles and ramp support constrain placement.
  Failed required pairs retry anchors transactionally; optional roles retry sockets then omit.
- `node --test tests/scenes.test.ts` failed first on the missing planner. Six passing
  contracts include both recipes in 13- and 17-tile rooms at all four orientations,
  unreachable/blocked/outward anchors, mutation isolation and tile-order independence.
- Review reproduced a path crossing a thin collider between clear cell centers. A failing
  regression preceded the fix: planner edges now use the same exact swept-box test as runtime
  navigation. Follow-up review passed 26 targeted tests and eight rotated/detour barrier probes.
  Added its requested exact anchor-budget and failed-required-pair rollback fixtures.
- `npm run check` passes all 123 tests, lint and formatting; `npm run build` passes.
  This is the standalone planner; runtime integration and rendered checks follow in S1b.

### S1b — integrated scene recipes

- Replaced independent smithy/bakery furnishing rolls with transactional recipe placements.
  The accepted props retain ordinary world/ECS identity and collision registration; subsequent
  pillars, supplies and rubble respect their reserved work paths. Reports clone provenance.
- Test-first world/report assertions failed before integration. Two new pure contracts exercise
  final decorated worlds, actual navigation, report isolation and invalidated work paths.
- Advanced to `layout-v3` / `keep-v3`; intentionally refreshed geometry fixtures, preserving
  the original topology stream and the old retry seed as a historical gallery comparison.
- 125 pure/model tests/check/build, 13 movement checks in each browser, 23 Chromium full checks,
  nine social checks, production smoke, generation/corpus and 48-view gallery all pass.
  The five repeated gallery resource samples match; screenshots retain readable central routes.
- Independent review cleared the integration after 33 focused tests and 500 extra seeds,
  including swept reserved-network connectivity, workface round trips and ECS references.

### N1 — one memorable existing inhabitant

- Selected a profile-linked skeleton watchkeeper, goblin lookout or actual card-playing kobold
  after final enemy/social placement. A simplified gathering gets the honest keeper fallback.
  Names use a separate semantic stream; identity owns stable initial home/group/fact references.
- Added at most five existing-material ornament meshes and a factual target caption. The
  existing population, health, hostility and behavior charts continue to govern the character.
- Test-first identity/report failures and missing-rendered-marker failure preceded implementation.
  Added the failing `trial-24` doorway-home regression after the corpus exposed it.
- Advanced content to `keep-v4`; 130 pure/model tests/check/build, both combat browsers (13 each),
  Chromium full (23) and social (9), production, generation/corpus and the refreshed gallery pass.
- Independent review checked another 500 seeds and found a responsive caption collision. Its
  600/900px non-intersection regression failed first, then passed in both browsers after the CSS
  fix. Follow-up review cleared the feature. Refreshed/reviewed resized Chromium close-ups after
  correcting a capture-only WebGL resize race; all three ornaments are visible in close-up.

### GF1 — moving pursuit attacks (user-requested game-feel detour)

- Click-locked player pursuit now swings in range while moving through the entire attack.
  Close clear approaches refresh each fixed step; a tighter pursuit arrival brake prevents
  lagging behind moving targets. Stationary targets still have a stopping distance.
- Layered sword animation over the moving leg gait and retained normal foot placement.
  Goblin fleeing is 5.2 units/second, slightly faster than walking but catchable with Shift.
- Three failing pure regressions preceded the fix. All 133 pure/model tests, formatting,
  lint and build pass; combat passes 14 checks in each browser. Chromium movement (13),
  jump (8) and the expanded 28-pose animation sheet pass. Reviewed moving combat/pose captures.
- Scope follows the user's click-locked chase clarification. D1 remains the next roadmap slice.
  Independent review cleared the feature after 56 focused tests, 1,124 close-pursuit probes
  and nine real-browser moving-swing lifecycle probes. Suggested additional persisted foot
  contact/lifecycle assertions are non-blocking follow-ups.

### D1 — within-run discoveries and observed events

- Added a pure `DiscoveryRecord` owned by the ECS `run` entity. Explicit presented evidence
  teaches only its listed facts; snapshots detach all data. Stable portrait placement,
  inhabitant and landmark IDs deduplicate sources. Events deduplicate by kind/subject, and
  shared ordinals preserve actual observation order even within one simulation timestamp.
- Actual room captions, portrait inspection dialogs and nearby visible named-target captions
  commit evidence. Corrected pre-existing metadata that linked captions to unspoken facts.
  Generated truth, text, layouts and versioned identities otherwise retain the baseline.
- Added synchronous accepted-lethal-hit notification to combat. Runtime observation requires
  active play, a nearby enabled on-screen actor and a clear player sightline. Named-inhabitant
  deaths and later remains are distinct; unseen sources and unlearned names stay unknown.
  Successful reliquary, altar and crown interactions record once-only events independently
  of health restoration. Routine unnamed deaths are outside this small record.
- The pause menu contains a bounded, readable within-run record. Both checkpoint respawns
  preserve entries; every regeneration replaces the component, including the same seed.
  The newly presented entrance is learned again. No save/export/annotation or objective system.
- Initial pure run failed on the missing module, absent death callback and extra entrance
  founding grant; the browser failed on the missing run component before integration.
  Later first-failing same-step ordering and menu-width tests preceded their fixes. Browser
  integration caught uninitialized camera matrices after regeneration; refreshing them fixed
  the missing aftermath observation. See `VERIFICATION.md` for commands and exact results.
- All required checks pass: **142 pure/model tests**, strict typing, lint, formatting and build.
  **14 discovery and 14 combat checks in each browser**, plus **13 Firefox inspection checks**
  pass. Reviewed desktop/narrow journal, portrait, named-caption and existing regression captures.
- Initial independent review subsequently found the camera-occlusion blocker addressed below.
  No commit was made and no subagents were launched. The
  next objective implementer can use `knows`, `hasDiscovery`, `hasEvent` and detached snapshots,
  while keeping objective ownership/eligibility/activation and world truth independent.

### D1 review correction — rendered camera occlusion

- Reproduced the reviewer's entrance pillar fixture in Chromium and Firefox before changing
  implementation. Disabling the fully hidden victim changed zero pixels, but ordinary melee
  still produced a witnessed death and identified skeleton killer. Both browser runs failed
  the new no-event assertion. The new render-adapter test file failed on its missing module.
- Added a shared render-side `CameraObservation` adapter. Up to three actual rig-surface rays
  test visible scene geometry, including current cutaways and real thin instances. Invisible
  collision and selection proxies are excluded. Only sample membership is cached; transforms
  and camera visibility remain live. Already-known remains avoid further queries.
- Four null-engine contracts cover geometry/proxy separation, cutaway and camera changes,
  thin-instance placement/bounds and bounded sampling. A failing same-render-ID cutaway check
  preceded explicit current-matrix preparation.
- Browser regressions verify hidden melee deaths grant nothing, later visible remains retain
  unknown identity/killer, target captions wait for actual camera visibility, and a real
  launched/travelling bolt does not identify its camera-hidden shooter. Pixel checks validate
  that the fixture really hides the actor rather than relying on world/collision geometry.
- **146 tests**, formatting, lint, strict typing and build pass. Discovery: **17 each browser**;
  combat: **14 each browser**; Firefox inspection: **13**; production smoke passes. Reviewed
  hidden-victim/shooter and revealed-remains captures. Follow-up review found the performance issue below.

### D1 performance review correction — 2026-11-19

- Follow-up review confirmed camera-occlusion correctness and found excessive matrix/bounds
  preparation before broad-phase rejection. Reproduced it before editing production: the
  material-backed 1,000-mesh cost regression failed with 8,000 matrix calls and 600 instance-bound
  refreshes over four warm queries. Both real-browser CPU probes failed their preparation budget.
- Added spatial indexing for frozen geometry, current-value/parent-first synchronization,
  conservative authored rig envelopes, finite-segment and per-instance rejection. Renderer
  uploads own active pool bounds; observation queries never rebuild them. Empty pools skip
  bounds updates. Index/cache invalidation is tested across hierarchy and scene changes.
- All null-engine fixtures now attach materials explicitly. A merged geometry gap verifies
  actual triangle picking. New first-failing regressions cover off-ray rigs/billboards/instances,
  finite ray length, scene membership and upload-cache replacement. The 28-pose animation suite
  checks that rendered character geometry fits the authored broad-phase envelope.
- Final CPU A/B/A means (ms/step): Chromium **4.158 / 1.756 / 3.276**, Firefox
  **4.690 / 2.520 / 4.360**. Prior implementation: Chromium **9.155 / 1.315 / 7.614**,
  Firefox **11.533 / 2.505 / 12.338**. Same seed/viewport, all rigs enabled, 100 warmup and 400
  measured no-render steps per phase. Warm-query matrix calls fall from 5,125 to two;
  forced calls and bounds refreshes are zero. Animated-step queries prepare 60/61 matrices;
  a final failing probe caught distant steeds before adding their authored envelopes. New pose
  assertions cover those envelopes too. These measurements still include nonzero
  observation overhead and are not GPU frame-rate claims.
- **155 tests**, format/lint/build, discovery **17 each**, combat **14 each**, inspection **13**,
  animation **28**, social **9** and production smoke pass. The long combined browser command
  timed out as social started; its standalone rerun passed. Captures were reviewed.
- Final independent review cleared both findings. Its 400-case unindexed triangle oracle matched
  all indexed results (234 visible / 166 occluded); its A/B/A CPU rerun confirmed bounded work
  and 1.406/1.695ms observation means in Chromium/Firefox. All 155 tests and listed browsers reran.

### O1 — objective clocks and atomic exclusive races — 2026-11-19

- Implemented against clean D1 `e6591df`. Added pure `ObjectiveRecord`, typed ECS component slot
  and synchronous XState lifecycle; gameplay installation remains with O2/O3.
- Owners, explicit rosters, fresh dynamic eligibility/prerequisites/work status, discovery and
  activation are independent. Active exclusive rivals must announce. Detached snapshots expose
  reasons and lifecycle without granting journal knowledge.
- One strictly increasing step batch validates transactionally, applies permanent disruption and
  dependency invalidation before unfinished contributions, deduplicates/retires action IDs, then
  resolves all clocks. Exclusive player-first/monster-first/contested outcomes latch once;
  independent plans and previously committed history persist. Bounds reject before mutation.
- Test-first: `node --test tests/objectives.test.ts` failed on missing `src/objectives.ts`;
  `node --test tests/models.test.ts` failed on missing `src/machines/world/objective.ts`.
  Later regression run failed in two assertions: blocked work returned no known reason, and an
  exclusive rival could disable activation announcements. Both were corrected after reproduction.
  An intervening malformed new test fixture failed parsing and was corrected before that red run.
- Seventeen domain contracts include 216 plan/contribution/condition order permutations,
  conflicting duplicate IDs, overfill, rejected-action replay, group survivor readiness, terminal
  idempotence, separate races, explicit dependencies, ECS actor replacement/reset, detached
  inputs/receipts/snapshots and transactional limit failures. The model documents finite numeric
  partitions and reaches all five lifecycle states/branches (154 paths, 480 cyclic steps).
- Local self-review removed redundant race flags in favor of lifecycle snapshots and added
  nonempty receipt/dependency isolation plus bounded-history checks. Independent review was pending
  at this checkpoint; its subsequent findings are addressed below. No subagents or commits.
- `npm run format:check`, `npm run lint`, `npm test` (**173 tests**, including typing),
  `npm run build` and `git diff --check` pass. Existing chunk warning persists. The final focused
  domain/model command passes 37 tests. Browser baselines remain historical: this pure slice adds
  no runtime wiring. See `README.md` for batch ordering, rejection/ID semantics and the O2 API handoff.

### O1 review correction — structural input boundaries

- Reviewer reported 37 targeted tests and 3,136 oracle combinations passing, with two blockers:
  contribution spreads retained caller metadata, and cloning rich conditions could fail after
  committing the step/discovery/activation. No other blockers were reported.
- Five new typed structural-input regressions failed first (**17 pass / 5 fail**): retained nested
  metadata changed history, callback fields caused `DataCloneError`, and the rejected batch left
  step 0 plus discovery/activation committed. Enriched plans reproduced the same cloning issue.
- Projected every declared plan/step contract and nested array before validation/mutation;
  contribution history explicitly stores only its declared fields. Optional condition/participant
  reasons now validate before commit. Extra adapter state and callbacks are ignored.
- Regression coverage verifies post-submit mutation isolation, plain/enriched equivalence,
  clone-safe history, whole-snapshot rejection atomicity and a corrected same-step/action-ID retry.
- **42 focused domain/model tests**, **178 full tests**, strict typing, format/lint/build and
  diff-whitespace checks pass. Existing build warning and historical browser qualifications remain.
  Follow-up review was pending at this checkpoint; it subsequently cleared both corrections below.

### O1 final independent review — READY

- Reviewer confirmed both input-boundary blockers resolved and reported **42 focused tests**
  passing, including **22 objective contracts**, with **17 machines / 80 states / 160 branches**.
- Reviewer also reran the original blocker probes and **18 malformed-reason cases**, plus
  type checking, formatting, lint and diff-whitespace checks: all passed. These are attributed
  reviewer results; the implementation's 178-test/build verification is recorded above.
- O1 is complete and authorized for the feature commit. No new browser checks are claimed.
  **At this historical O1 checkpoint, O2 was next and had not started.**

### O3 final independent review — READY

- Reviewer reran 214 tests/check/build and all listed O3 browser suites; no blockers found.
- Another 100 seeds retained reachable sites and population; longest shrine/focus route was
  130 tile steps, largest accepted attempt 3. Twelve new-seed workers navigated and committed.
- Forty-eight reordered outcome/interruption/recovery probes and twelve exact-boundary races
  passed, including ordinary/learned rites and one-tick early/tied/late completion.
- The independent reviewer inspected desktop/narrow/short-window clocks, work and outcome captures.

## Follow-ups and blockers

- O2 is complete at `d698f27`; O3 is complete at `9be81bb`; O4 completes the composed run plan
  with independent review READY. The dependency-ordered feature sequence through O4 is delivered.
- No current O1 correctness blocker: final independent review is READY. D1's camera-occlusion
  and CPU-cost corrections were also cleared; G3's full-browser follow-up is resolved by T1.
- Phase 0 diagnostic/gallery implementation and high-quality hardware sampling are done.
  Low-quality hardware sampling and generation-latency reporting remain to complete its
  full performance baseline; do not claim Phase 0 entirely complete yet.
- Shared architectural heraldry, composition-driven profile differences and the full
  Phase 1 art/readability gate remain open. Captions/palettes alone do not satisfy that gate.
- S1's anchor/socket placement and integration are delivered. Causal contact detail and
  profile-led composition can build on these recipes during the broader visual-identity gate.
- Runtime observation deliberately uses
  conservative proximity, player sightline and rendered camera-surface checks; it does not reconstruct
  unseen history. Seed/version metadata is not a unique run key, so future objective consumers
  must resolve the current ECS record after regeneration. Persistence/exports remain later.
