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
  **P3 is complete at `9f8e1d7`; final independent review returned READY, clearing both route-quality blockers.**
  **P4 skeleton gait is complete at `be29b8c`, independent review READY with no blockers.
  P5 held-F defense is complete at `975c533`, independent review READY with no blockers.
   P6a four-member squad foundation is complete at `c3641c2`, final independent review READY**;
   physical phalanx **P6b is complete at `806a27b`, final independent review READY with both blockers cleared**.
   **P7 is complete and published at `3934e17`, following independent prepublish review READY.**
   The public repository and HTTPS Pages demo are live. GitHub run **44745698117** succeeded;
   the parent's actual hosted smoke passed **five checks with zero errors**, with reviewed captures.
   **T2 faster test feedback and A0 motion review are implemented and verified, independent review READY.**
   **A1 shared rigs, A2 coordinated solver and A3 locomotion/grounding are complete and independently reviewed READY.**
   A2 implements the bounded numerical target solver and existing-mesh browser fixtures, including
   simultaneous feet/grips, body correction, orientation, limits and explicit infeasibility.
   A3 now supplies live semantic poses, slope-aware sole targets and bounded final-contact checks.
    **A4 action/equipment/work/social migration is implemented, verified and independently reviewed READY.**
    **A5 articulated tails is implemented, verified and independently reviewed READY.**
   **A6 shield motion is complete and independently reviewed READY; both review blockers cleared.**
   **A7 rig cutover/handoff is complete, final independent review READY; landing blocker cleared.**
   **P8 directional/seed-varied ragdolls are complete, final independent review READY; both contact blockers cleared.**
   **P9 skeleton breakup is complete and independently reviewed READY; no current-scope blockers.**
   See [ragdoll contract](ragdoll-deaths.md), [animation roadmap](animation-roadmap.md)
   and the [complete A0 inventory/baseline](animation-baseline.md).
  Dependency order and acceptance gates are in `implementation-path.md`.
  The original notes remain the user's source of intent.
- **CPU performance is the current workstream**, per the user's **2026-11-21** decision. CPU0
  precedes CPU1 → CPU2 → CPU3 → CPU4 → CPU5 → CPU6a → CPU6b → CPU7. The historical
  `3cfb378` measurements remain historical. **CPU0–CPU3 are independently reviewed READY**.
  The [CPU0 desktop hardware baseline](cpu-baseline.md) pins the expensive replan and confirms
  instrumentation parity. Astra's [final independent CPU4 review](../VERIFICATION.md#cpu4--final-independent-review)
  returned **APPROVE with zero findings**. The [final independent CPU5 review](../VERIFICATION.md#cpu5--final-independent-review)
  returned **APPROVE**. The cap/replacement regression landed in `f3fa9a3`.
  [CPU6a received final independent **APPROVE**](../VERIFICATION.md#cpu6a--animation-geometry),
  including both follow-ups, at `96849ae`. The [exact CPU6b retained subset](../VERIFICATION.md#cpu6b--retained-full-rate-subset)
  received final independent **APPROVE** for correctness only. Scheduler/LOD is deferred and the
  whole-frame criterion remains unmet. The [CPU7 investigation](cpu7-integrated-results.md) was
  independently approved as a negative report, not performance acceptance.
- **Effect adoption remains before the next procedural-feature expansion, after CPU7.**
  EF0–EF4 establish composed generation, typed failures and bounded local tracing;
  EF5 is a separate resource-lifecycle follow-up. See the [refactor plan](effect-refactor-plan.md).
  The source evaluation/scratch prototype does not constitute production implementation.
- P6b review correction: actual reds reproduced **0 impacts / 100 HP** after 60s circular and 20s
  seeded assembly, plus javelin **90 versus 100 HP** by ECS order. Local-detour/progress recovery
  and earliest swept body contact fix both. **315 tests in 304.51s**, format (**148 files**), lint
  and build pass; one fresh phalanx **8** / combat **15** browser pass. All 24 circular arrangements
  hit by **12.92s**; the original adverse stable approach hits by **13.13s** in pure simulation.
  Models remain **22/105/226**; group paths now **1,950**. Prior social/defense/tribute browser
  evidence is reused. **Final independent review returned READY**, passing fresh geometry/lifecycle/
  hold/progression probes and clearing both blockers. The user approved the normal-hook feature
  commit; this containing commit records P6b.
- P6b pre-review recovery baseline: **51 focused tests + 6 squad/model/social/tribute checks**, then extended attack-kind
  model coverage pass. Final format (**147 files**), lint, **305 tests in 298.37s** and build each
  passed once. Complete models: **22 machines / 105 states / 226 branches**. Reused saved current
  phalanx **6**, social **15**, combat **15** browser passes; fresh sequential defense **9** and
  tribute **9** pass. Reviewed eleven phalanx views in three contact sheets. No initial P6b red
  log survived; none is claimed. No production fix was needed during recovery. Details and bounded
  choke/hold behavior are recorded in VERIFICATION.md. Independent approval was pending at that
  recovery checkpoint; the final READY review above supersedes it.
- P6a review correction: **291 full tests**, typecheck/format/lint and **9 defense-browser checks**
  pass. The reviewer found no production defect; its blocker was an obsolete no-enemy-defense test,
  now corrected to the nine shield roles. **Final independent review is READY**, clearing that blocker.
  Existing build,
  squad/social **15**, tribute **9**, gameplay **18 + 5 continuation** and visual results are reused.
  Model coverage remains **22 machines / 100 states / 196 branches**. The containing feature commit
  records P6a; raw user notes are excluded.
- P5: **52 focused / 281 full tests**, strict typing, format/lint/build pass. One Chromium defense
  pass (**9 checks**) and combat pass (**15 checks**); four corrected front/side/block/ramp views
  reviewed through a capture-only refresh. **21 machines / 95 states / 179 branches**. Independent
  review returned **READY**, reusing those checks and passing the attributed angular, latch,
  projectile, work, input, pool and regeneration probes recorded below. Normal-hook commit approved.
- P4: **23 focused / 268 full tests**, strict typing, format/lint/build pass. Affected Chromium
  animation passes **32 corpse crossings / 732 contacts**, **46 shared pose captures** and
  **44 new skeleton sequence/reset captures**. Reviewed flat/control, stairs, corpse, attack and
  reset views; **20 machines / 92 states / 175 branches**, no new chart. Independent review
  returned **READY**: 23 targeted tests, 6,480 exact ordinary-pose matches, 50,000 phases/75 seams,
  and 8,640 skeleton frames/6,162 plants with zero violations, plus skull/reset and visual checks.
  These are attributed reviewer results; the reviewer reused the implementation's full checks.
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
| P3 | Complete; final independent review READY | Initial audit 10 pass/3 fail; review regressions 13 pass/3 fail: actual-travel old-root detour, far-side equal endpoint and distant-motion replans | 60 focused / 263 full tests, format/lint/build, 16 Chromium movement checks; final review cleared both blockers with 17 partial tests, 24 route/tie and 72 body-cache/gate cases plus stable-hold/performance/capture checks | `9f8e1d7` |
| P4 | Complete; independent review READY, no blockers | 9 pass / 2 fail before production edits: mirrored legs and prematurely released left plant | 23 focused / 268 full tests, format/lint/build; Chromium animation 32 crossings/732 contacts, 46 shared + 44 skeleton captures; independent phase/contact/baseline/reset and visual review passed | `be29b8c` |
| P5 | Complete; independent review READY, no blockers | 1 pass / 4 fail on actual frontal health loss before production edits, then lifecycle/model contracts failed on missing defense module | 52 focused / 281 full tests, format/lint/build; Chromium defense 9, combat 15; 21 machines / 95 states / 179 branches; independent targeted geometry/latch/work/input/pool/regeneration review passed | `975c533` |
| P6a | Complete; final independent review READY, no blockers | Missing squad module and 21≠24 population reds; detour/swapped-home reds; reviewer reproduced obsolete no-enemy-defense assertion | 291 full after all corrections; typecheck/format/lint; defense 9; prior build/social 15/tribute 9/gameplay 18+5 reused; final review clears role-aware assertion | `c3641c2` |
| P6b | Complete; final independent review READY, both blockers cleared | Review regressions fail 0/3 before fixes: circular/seeded rank stalls and ECS-order javelin interception | 315 tests/full checks; models 22/105/226; phalanx 8/combat 15; final review: fresh 24 arrangements, 600 geometry-oracle comparisons, lifecycle/hold/progression probes and 13 captures | `806a27b` |
| P7 | Complete; public repository and hosted demo verified; independent prepublish review READY | Real project-path browser rejected root-built `/assets/index-…js` before Pages build fix | Local 315 tests/full checks/build and independent probes pass. GitHub run 44745698117 succeeds (build 8m 47s, deploy 15s), including CI root/project smokes. Parent's actual hosted smoke: five checks, zero errors; hosted lowered/defending captures reviewed | `3934e17` |
| T2 | Implemented and verified; independent review READY | Profile: 315 tests / 303.11s; broad seed/timing sweeps, repeated route searches and exhaustive model prefixes dominate | At T2 checkpoint: core 301 / 26.79s, full 319 / 301.57s; all original contracts retained, models 22/105/226 plus 8,206 extended work paths | `e86dd09` |
| A0 | Complete; independent review READY | Browser red at missing `animation.pause`; review exposed reset freeze, abbreviated opening and capped diagnostic surface | 302 core tests, format/lint/build; controls and 25-actor baseline, 30 clips/60 views/856 samples, existing animation and root production smoke; review corrections independently cleared | `e86dd09` |
| A1 | Complete; independent review READY | Missing rig/binding module reds; actual entering/leaving-lava regression failed before authoritative-position fix | 309 core tests; format/lint/build; 428 A0-matched samples, identity/selection/history/resource checks; animation, movement16, jump8, production5 pass; independent matrix/socket/invalid-input probes pass | `d23ced6` |
| A2 | Complete; independent review READY | Missing solver module, then persisted scale/reporting/limit/pole/fold review reds | 323 core tests; typecheck/lint/format/build; 968 FK, 300 scaled-binding and 1,210 browser samples; animation pass, captures reviewed, resource plateau; independent continuity probes clear blockers | `279bec5` |
| A3 | Complete; independent review READY | Missing grounding module; high stacked corpse/swing lift; preserved release-frame and hip reset/death regressions failed before fixes | 330 tests; format/lint/build; 428 A0-identical authority samples, bounded final contacts; animation/movement16/jump8/production5; 1.863/2.50ms integrated CPU; independent lifecycle/geometry review READY | `279bec5` |
| A4 | Complete; final independent review READY | Missing module, scale/envelope/reset regressions; persisted review reds for torso intersection, slung cargo shear and spear death bounds/clearance | 336 tests/check/build; 428 A0-identical authority samples; 252 actual shaft/torso, 144 cargo-handoff and 2,714 corpse-age samples; affected browsers/production5. Independent follow-up clears all blockers | `c353fef` |
| A5 | Complete; final independent review READY | Initial module/clearance reds; independent corpse, anatomy/equipment and masonry defects; prolonged partial-contact snap reproduced before correction | Full360/final core342 checks, build/affected browsers/production; all-member geometry and prolonged settling/release. Independent review clears all four blockers; investigated CPU band accepted | `688e491`; review fixes in containing delivery |
| A6 | Complete; final independent review READY | Event/motion/preparation reds; counter-turn, dormant-work, metadata and heading regressions; moving-stair and moving-release geometry reds | Full377/core359, build/production; actual shield/body/contact/lane checks, feasible reversal continuity, interruption/camera replays and affected browsers; 428 A0-identical authority samples. Both blockers independently cleared | Containing delivery |
| A7 | Complete; final independent review READY | Missing history module, retired-snapshot and lethal-landing reds; Euler-independent geometry assertions retained | Full383/core366, 84 catalog handoffs, real melee/lava landing and stair controls, 428 A0-identical authority samples, cross-system browsers and root/Pages smokes; stable resources. Landing blocker independently cleared | Containing delivery |
| P8 | Complete; final independent review READY | Missing-module, scaled-parent/frozen-contact, door/waist regressions; review's actual upper-plank/base penetration and replay reds | Full389 checkpoint/core373; eleven death sequences, 24 structural-contact cases and 24-death stress, real attacks, lifecycle, affected suites/root/Pages smokes. Independent original door repro, 18 door/16 wall/four all-frame masonry cases and lifecycle probes clear R1/R2/C1 | Containing delivery |
| P9 | Complete; independent review READY | Missing separated mode/envelope reds; actual eleven-chunk and named-skull browser checks | Full395/core377; seven breakup sequences, 24 structural contacts, all-24 stress, combat15/discoveries17/animation and root/Pages production. Independent six-case geometry, 15-unit skull support/occlusion, negative range/LOS and identity/reset probes pass | Containing delivery |
| CPU0 | Complete; independent follow-up READY | Missing module; persisted callback duplication, observer leak and no-attack fixture reds | Full400 checkpoint/final core382; recipe-2 45-window baseline/phalanx/native batch and replay. Reviewer clears all three findings with native callback, rollback and real phalanx probes; prior unaffected matrix reused. Both production paths/isolation pass; subsequent RTX 2070 baseline recorded | Containing delivery |
| CPU1–CPU4 | CPU1–CPU3 independently reviewed READY; CPU4 independently approved with zero findings | Door queries → stationary collision → route hitches → nearby candidates | See [verification](../VERIFICATION.md#cpu4--final-independent-review) for per-slice evidence | Through `242b520` |
| CPU5 | Independently approved; later cap/replacement coverage landed | Settled transform publication and scene-owned resource retirement | Fresh reviewer hardware: 4,344 → 0 unchanged root writes, 1.0–1.2 → 0.2 ms death advance; full 434 and 3 resets. [Later regression](../VERIFICATION.md#cpu5--final-independent-review): full 435 | `f3fa9a3` |
| CPU6a | Final independent APPROVE, including both follow-ups | Demand-driven clearance, certified geometry reuse, indexed settled contacts and one combined surface budget | [Closeout](../VERIFICATION.md#cpu6a--animation-geometry): 37 fresh focused tests and static/diff checks; existing 456-test full gate and matched RTX 2070 replay | `96849ae` |
| CPU6b | Exact retained subset: final independent APPROVE for correctness only; scheduler/LOD deferred, whole-frame criterion unmet | Full-rate ownership, development attribution and parity tests only | [Subset evidence](../VERIFICATION.md#cpu6b--retained-full-rate-subset): 46 fresh focused tests; typecheck, lint, format and production isolation passed; 459 full tests and hardware/browser results reused | `88a297e` |
| CPU7 | Investigation independently approved; no performance acceptance | Integrated desktop study on the retained tree | [Results and scorecard](cpu7-integrated-results.md): measured budgets unmet, matched-start speedup inconclusive, GPU attribution unresolved | Uncommitted on `main` |
| EF0–EF4 | Next in the agreed queue, before new procedural features | Fresh baseline, stage/error contracts, Effect pipeline, tracing and application cutover | Acceptance gates in effect-refactor-plan.md; production adoption not started | — |
| EF5 | Separate follow-up after EF4 | Run-owned construction, partial-failure cleanup and retirement | Evaluate against completed animation/physics resources; not a prerequisite for content after EF4 | — |

## Work log

### CPU0 — reproducible profiling and current baseline — 2026-11-21/22

- **Review correction checkpoint:** initial independent verdict NOT READY for callback duplication,
  partial observer acquisition leakage and a phalanx fixture that never attacked. Saved reds precede
  microtask-boundary restoration, immediate rollback registration and a real motor-backed rank fixture.
  New regression checks pass completion, throw/cancel, both application-loop positions and zero leaks.
- Recipe **2**, source `e8b4bc7a5adc9fcb2e00444fec19a0b527caa59a370f7da348b1edf5076d1307`:
  **45 windows / 10,044 samples** plus exact pinned replay. Corrected phalanx shows movement, opening,
  thrust/impact/recovery and health100→88 in all six mode/repetition cells. Original phalanx windows
  are excluded; 96 unaffected earlier controlled windows are reused with their source attribution.
  Final check382/31.41s, type/lint/format211, lifecycle/regressions and both production paths pass.
  **Independent follow-up READY:** three callback positions, throws/cancellation/restoration errors,
  regeneration, four partial-registration cases and fresh real phalanx movement/thrust/HP88 pass.
  The reviewer independently audits the current reports/source/replay and reuses broad gates.
  No current-scope blocker remains. The initial implementation checkpoint below remains historical.

- Committed the requested animation-aware planning update as `013079c` with normal hooks
  (377 tests, lint/format). CPU0 follows in a separate commit.
- Added bounded DEV-only timing/count sessions, source/recipe/environment reports, controlled
  off/coarse/detailed parity, original-loop frame/catch-up sampling and exact request replay.
  Setup/stop/exception/disposal restore original descriptors and callbacks; both production bases
  erase diagnostic code. No gameplay optimization or machine transition was introduced.
- Final source hash and measurements are in [cpu-baseline.md](cpu-baseline.md): **141 windows /
  42,948 samples / 22 cases**, 129 controlled windows with identical gameplay/pose fingerprints and
  repeatable detailed work counts, plus twelve clock-driven native windows. Pinned failed treasury
  replan: 3,207 nodes, 196.6–211.6ms coarse; exact-input/result replay passes.
- Full400/309.71s and core382/32.03s, typing/lint/format, CPU lifecycle, both builds/isolation/production
  paths pass. Original source shape and authored/inactive-fixture qualifications are explicit.
  Hardware launch timed out at 15s; software results are diagnostic. Independent review was pending
  at that initial checkpoint; the correction and READY follow-up above supersede it.

### CPU workstream reconciled with delivered animation — 2026-11-21

- Audited source at `3bf6bb4` against the original `3cfb378` measurement baseline. A6 adds a
  time-sensitive accepted-block mailbox; A7 owns completed fixed-step pose/velocity history;
  P8 steps physical deaths inside `animateActors`; P9 separates anatomy and extends terrain/
  observation beyond the root. The historical all-living timing table is not a current profile.
- Expanded CPU0's matrix/counters for shield transitions, cold lethal capture/admission, active
  articulated/separated physics, settled publication/contact work and real-frame catch-up. Real
  damage fixtures distinguish physical deaths from synthetic no-handoff collapse.
- CPU1's scope includes per-island door-key reads; CPU2's gates protect support velocity and
  stationary reactions. CPU4 keeps living collision separate from physical treads/bone terrain.
  CPU5 now targets lifecycle-safe merge groups/frozen-matrix reuse; CPU6a targets extending the
  existing corpse caches with per-piece bounds.
- CPU6b must prove fixed-step physics/feedback/history consumers before reducing pose frequency.
  Specified future catch-up-position block/death regressions, off-root observation and active/settled budgets.
  CPU0 remains next and the slice order is unchanged. This source-backed documentation audit makes
  no optimization or new timing claims; commands, paths and contracts are checked against current files.

### CPU performance queue promoted — 2026-11-21

- User requested P9 review confirmation, fixes if needed, commit/push, and CPU performance work
  next. Confirmed the existing independent READY verdict with no current-scope blockers; reviewed
  production code remains unchanged. The containing delivery records P9 and this scheduling decision.
- Promoted the existing CPU plan to **CPU0 → CPU1 → CPU2 → CPU3 → CPU4 → CPU5 → CPU6a → CPU6b → CPU7**.
  CPU0 refreshes the older `3cfb378` investigation against completed rigs, ragdolls and bone debris.
  CPU2 retains an independent baseline comparison; CPU6a/b retain separate review gates.
- EF0–EF4 follow CPU7 and still precede further procedural content. Updated the global queue,
  planning index, game direction and related plans; CPU implementation/performance gains are not
  claimed by this documentation-only scheduling change.

### P9 — skeleton breakup — 2026-11-21

- Baseline `14f441c`, clean and pushed. Eleven existing anatomical body groups release their joints;
  a separate seeded scatter stream adds bounded per-chunk variation. The skull retains jaw/eyes,
  the hand retains its blade, and the pelvis mesh follows its semantic body.
- Tests first failed on separated mode, distant-chunk bounds and occlusion. Per-piece terrain patch
  unions preserve distant support; live physics envelopes and one surface/chunk keep camera/player
  perception tied to the same actual bone. No new logical deaths, meshes or gameplay interactions.
- Full395/351.55s and core377/31.17s, typing/lint/format202, root/Pages builds and both production
  smokes pass. Seven breakup sequences, 24 structural contacts, eleven shared death scenarios,
  all-24 stress, skeleton lifecycle, combat15/discoveries17/animation pass. Three regeneration
  resource counts remain stable. See [contract](skeleton-breakup.md) and VERIFICATION.md.
- 448 captures, 14 sampled normal/quarter-speed sequences and representative motion/settled views
  inspected. **Independent review READY:** six entry/settle/reset cases, full relative-transform and
  solid-tread SAT checks, a skull 15.05 units from its root, actual off-root occlusion, negative
  player-range/LOS and once-only discovery. Max final overlap1.133e−5; zero page errors. Broad gates
  reused. Brief impacts/inherited entry overlaps and coarse crowded piles remain qualified in the
  verification record. The containing delivery records the user-authorized P9 commit.

### A7 — semantic cutover and death handoff — 2026-11-21

- Rebased/pushed reviewed A6 as `7e6616d`, preserving incoming CPU plan `058e159` and both
  documentation-index additions. A7 removes legacy nodes/sample/capture/commit, Euler hints and
  render blend aliases; the old foot algorithm remains solely a historical test oracle.
- TDD history/module and retirement reds preceded the snapshot/lifecycle contracts. Lethal capture
  precedes cancellation; rebasing replaces root velocity once and retains articulation. Existing
  age-sampled collapse remains active. See [handoff contract](rig-handoff.md).
- Full383/303.05s and final core365/29.41s, typing/lint/format194, root/Pages builds and both
  production smokes pass. Cross-system movement16/jump8/combat15/defense9/phalanx8/social15/work17/
  tribute9, animation/actions, tails4488/clearance and shield transitions pass.
- 84 catalog handoffs compare drawn joint velocities and immutable death/reset data; rig428 retains
  exact A0 authority and stable resources. CPU3.1175/4.10ms mean/p95 is qualified software-rendered
  fixture evidence. 13 clips/26 camera sequences played normal/quarter speed; five sheets inspected.
  Initial independent review found stale airborne Y inherited on grounded death; current motor
  support velocity fixes it. Persisted real melee/lava red now passes before/after publication,
  retaining both stair-direction controls. Corrective core366/29.61s, handoff/jump/movement and
  both build/production paths pass. **Final independent review READY:** original 144 snapshots/
  3,024 joints/1,728 bodies math and all-25 retirement checks, plus follow-up 64 motor cases and
  20 browser boundaries/lava confirm support/ballistic separation and reset cleanup. Broader checks
  are explicitly reused. This containing delivery records reviewed A7.

### A6 — shield preparation and confirmed-block reaction — 2026-11-20

- Followed TDD: missing component/module and live guard-preparation failures preceded implementation;
  focused reds also cover counter-turn continuity, 480 unnecessary dormant spring calls and unusable
  optional contact metadata. A moving-stair browser red corrected flight-foot compression without
  weakening the contact threshold.
- Actor/run-owned accepted-block batches feed the shared action rig. Immediate protection surrounds
  supporting anticipation, bounded directional recoil, controlled lowering, current-clock phalanx
  preparation/opening and tail follow-through. Existing Defense/squad charts retain all authority.
- Final full gate377/299.59s plus typing/lint/format191/build/production pass. Shield
  browser checks real input/melee, 1,056 replay frames, 960 moving stair frames and 132 gate frames;
  controls match hit runs' gameplay exactly. Rig428 matches A0 authority; affected defense/phalanx/
  animation/actions/tail suites pass. Ten playback tracks and temporal sheets inspected.
- Initial independent review was NOT READY: moving release intersected the body/head and re-press
  unnecessarily reset feasible placement/velocity. Persisted red preceded coordinated body release,
  scale-aware board height and minimum protective-frame projection. New transition suite passes
  600 phase-varied release/control frames, twelve reversals and sixteen opening interruptions.
  Feasible reversals now retain exact corners/velocity. A final TDD fix resolves accepted recoil in
  the actual eased render heading after release.
- Final cost3.195/4.00ms mean/p95, unchanged resource plateau. See [contract](rig-shields.md) and
  `VERIFICATION.md` for caps, evidence and qualifications. Final everyday gate359/29.43s passes.
- **Final independent review READY**, clearing both blockers: 22 focused native tests, real input,
  240 release/control frames, 48 reversals (ten feasible cases with exact pose/all-velocity continuity),
  twelve attack interruptions, 360 all-slot turning/burst frames, 180 carry frames, sixteen live-target
  opening/casualty cases and twelve rendered-heading adapter cases. Six corrected captures inspected;
  broad checks/cost/resource evidence reused. Remaining immediate restoration and baseline pauldron/
  temporary-collapse limits are documented. This containing delivery records reviewed A6.

### A5 — independent review corrections — 2026-11-20

- Automatically reviewed at the user's request; `AGENTS.md` now mandates this after future
  implementations and verification, without another prompt. The reviewer initially returned
  NOT READY for settled corpse reactivation, missing posed anatomy/equipment, and inward wall trim.
  A follow-up caught prolonged oscillation in partially blocked contacts. All four are corrected.
- Bound numerical surface snapshots now cover actual limbs/equipment/cargo; complete body poses
  precede stable-ID tail solving. Shared masonry profiles cover physical overhangs. Settled tails
  never dodge visitors. Infeasible poses retain stable contact state, clear spring drive, and release
  within a revalidated summed angular-rate cap. Proximal seam exemptions are explicit; prop visibility
  is published on the first frame. See [updated contract](rig-tails.md).
- Full corrective gate **360 pass / 295.87s**; final render follow-up **342 pass / 29.17s**, typing,
  lint/format185 and build pass. Final tail catalog4488, A0-authority428, all-member geometry2640,
  neighbor128 and five real wall offsets pass. Four prolonged cases settle exactly and release;
  reversed ECS order and first-frame visibility have zero mismatches. Final affected browsers and
  production pass; unchanged defense/discovery/extended evidence reused where appropriate.
- **Final independent review READY.** Attributed final probes: pure7, full-animation2400 steps,
  frozen-contact4800 steps across both subjects, release720 steps; zero late movement/velocity,
  bounded release and no reported-clear intersections. Nine real-death cases retain exact entry,
  sampling, settled and rewind behavior. The optional regression pin was applied and rechecked.
- Resource plateau remains 2382 meshes /495 nodes /28 materials /4 textures /5719 entities. Final
  CPU3.238/4.10ms prompted one trace/recheck; 3.163/3.90ms comparable result. Reviewer accepts the
  investigated band with limited headroom, without a portable timing guarantee. Full attribution,
  bounds and remaining stable-infeasibility limitation are recorded in `VERIFICATION.md`.
- Initial implementation is `688e491`; this containing commit records the reviewed corrections
  and automatic-review workflow. A6 shield anticipation/reaction is next.

### A5 — articulated kobold tails — 2026-11-20 (initial delivery checkpoint at `688e491`)

- Shared immutable humanoid-with-tail extension adds four pelvis-rooted tapered links to all
  twelve kobolds. Semantic pose/history, final bindings, shadows, observation and corpse surfaces
  include the chain. A pelvis-bound haunch joins it to the body; stowed shields sit 0.06 higher.
- Bounded angular follow-through samples actual pelvis motion and gait, jump, action and retreat.
  Whole-chain clearance projects a tucked pose against floors/treads, walls/props, doors, nearby
  bodies and equipment/cargo. Zero-time sampling, reset and age-sampled death retain single ownership.
- Six pure tests and a dedicated browser suite pass. Initial red: missing tail module. Browser
  reds corrected coarse navigation cells being mistaken for walls, conservative stair/body boxes,
  a stowed-shield root clash, coarse tuck transitions and yaw-dependent death counter-rotation.
- Final **342 tests / 31.05s**, typecheck/lint/format (183 files) and build pass. Tail browser:
  **34 sequences / 4,488 frames**, both actual roles, no blocked samples or own-equipment overlaps,
  minimum drawn floor clearance **0.002190**, mesh/FK error below 1e−5. Additional rear-wall/door,
  door-open release, teleport/history and both-role carry/combat/resume checks pass.
- Rig browser: **428 A0-identical authority samples**, existing contact/grip tolerances and stable
  **2,382 meshes / 495 nodes / 28 materials / 4 textures / 5,719 entities** through three regenerations.
  Animation, defense9, phalanx8, rig-actions, discoveries17 and root production5 pass.
- **13 clips / 26 camera replays / 380 samples**, normal/quarter-speed playback exercise and five
  inspected temporal sheets. Gameplay/side tail, social, formation and collapse captures inspected.
- Cost initially **3.682/4.50ms**. A bounded trace identified repeated distant door chart reads;
  proximity-first reads and tile reuse produce **2.905/3.70ms**, within the A5 investigation thresholds.
  See [VERIFICATION.md](../VERIFICATION.md) for measurement qualifications and [contract](rig-tails.md).
- Implementation/verification complete. This containing commit records the user-requested A5
  delivery. **Independent review remains pending.** A6 shield anticipation/reaction is next.

### A4 — action, equipment, work/social and temporary death migration — 2026-11-20

- `rigPose.actions` owns the shared numerical layers, grip intents and attachment frames. Weapons,
  shields, social props and cargo use solved sockets; required hand/foot constraints share one
  bounded solve. The porter carries its coffer in front and explicitly slings it for combat without
  changing logical ownership. Collapse samples from a captured solved pose and authoritative corpse age.
- Six new pure/NullEngine tests and the strengthened reset regression cover same-clock release,
  interruption, cargo/guard handoff, sampling-independent collapse and actual nonuniform-scale bindings.
  Browser-derived regressions fixed a 4.154-unit observation bound miss, stale directly-installed
  settled-corpse heading and epsilon scale retention across camera replays.
- Final `npm run check`: **336 pass / 28.53s**, typecheck, lint and format (**179 files**).
  Final build and root production smoke pass. Models remain **22 machines / 105 states / 226 branches**.
- Rig browser: **428 samples / 30 clips**, exact A0 authority parity, actual required grip maximum
  **2.575e−6**, unchanged bounded feet/plant tolerances and stable resources through regeneration.
  Animation, combat15, defense9, phalanx8, social15, tribute9, objective-work17 and discoveries17 pass.
- **18 clips / 36 camera replays / 520 samples**, normal then quarter-speed viewer exercise; five
  temporal sheets and relevant gameplay/production captures inspected. Integrated workload is
  **2.368/3.00ms mean/p95** after review corrections; historical cost/profiling is retained in VERIFICATION.md.
- Independent review reproduced shaft-through-torso, slung cargo shear and underground/out-of-bound
  dead spears. The persistent browser regression failed first. Side-on stance, rigid slung frame,
  supported collapse arm/wrist and a complete throw/death envelope now pass **252 shaft/stair frames,
  144 cargo-handoff frames and 2,714 corpse-age samples**. Radius is conservatively **4.8** against
  measured **4.666063**. Initial corrected review exposed the missing post-release boundary; all
  55 throw entry frames are now covered.
- **Final independent review READY, all blockers cleared.** Follow-up independently checks 385
  boundary samples with zero FK/direct-sampling differences, 0.078999 minimum spear clearance and
  0.175258 minimum margin inside the actual observation sphere. Final rig/phalanx/animation/
  discoveries/production checks pass; controls plus three affected motion clips were refreshed.
  This containing commit records the reviewed A4 delivery; A5 articulated tails is next.
  See [contract](rig-actions.md).

### A3 — live locomotion and grounding migration — 2026-11-20

- All living rigs now compose canonical semantic poses and coordinated sole targets. Gait/lurch,
  acceleration/crouch springs, backsteps and jump/landing keep existing authoritative clocks.
  Visual bob/lift/corpse assistance moves beneath the fixed gameplay root. See [contract](rig-grounding.md).
- Slope-aware actual-foot footprints and final corner/ankle checks share the solver's four-pass
  budget. Plants reference sole centres; stance has higher priority than swing/flight. Foot contact
  and pelvis assistance retain 0.46/0.14 caps. Terrain/corpse queries are capped at 66/74 per actor.
- Seven new pure/NullEngine tests pass. Initial red: missing grounding module. Browser iteration
  caught 0.488-unit uphill skeleton penetration from stacking full swing lift on a high corpse;
  using maximum clearance and final ankle checks fixes it. The root-lift oracle now reads actual
  hip lift; equivalent Euler branches preserve existing weapon and hinge tests.
- Review reproduced **0.622-unit** repeated-sample sole movement on a release frame and retained
  **−0.121-unit hip Z / 3.099-rad thigh yaw** through reset/death. Persisted regressions failed
  before fixed-step presentation snapshots and complete hip-channel cleanup. Independent recheck
  **READY**, including 44 invalidation cases, 640 production frames with repeated zero-time reads,
  48 rendered-corpse changes and 300 affine products.
- Final `npm run check`: **330 tests / 29.47s native elapsed**, lint and format (**175 files**);
  build passes. Models remain **22/105/226**. No production statechart or authoritative rule changes.
- Final browser sequence: rig **428 samples / 30 clips**, **zero A0 authority drift**;
  max actual sole penetration **2.553e−7**, sole plant drift **4.316e−6**, FK/binding error
  **5.644e−6**. Animation, movement **16**, jump **8**, and root production **5** pass.
- Integrated 25-actor/four-corpse workload is **1.8625ms mean / 2.50ms p95**, with **840** maximum
  terrain lookups/update. Earlier samples above the investigation threshold prompted bounded CPU
  sampling, affected-FK work, corpse-envelope filtering and affine/binding optimization. Historical
  standalone samples and allocation qualifications are retained in VERIFICATION.md.
- Eight selected clips / 16 camera replays pass; normal then quarter-speed viewer playback was
  exercised and motion sheets inspected alongside dense gait/contact captures. Original scene
  resources plateau through three regenerations. Equipment/carry grip placement remains A4's
  largest visible migration task. This delivery combines A2 and A3.

### A2 — coordinated full-body target solver — 2026-11-20

- Implemented explicit target spaces, weighted priorities, release, bounded body compensation,
  unequal-length limb IK, socket orientation, joint limits and final residuals. Solver buffers
  are retained; gameplay/history remain caller-owned. See [contract and scale/fallback policy](rig-solver.md).
- Initial regression failed on the missing solver. Review then reproduced binding-incompatible
  logical-joint scaling, bend-pole/fold/antipodal discontinuities, omitted-orientation success,
  zero-weight required release, π-wrap and cumulative-scale failure. Persisted regressions were
  run red before fixes. Final independent review **READY**, all blockers cleared.
- **323 everyday tests / 28.15s native elapsed** pass; typecheck, lint, format (**172 files**) and
  production build pass. Two redundant test-array spreads were corrected after the lint check;
  focused regressions and lint/format/typecheck/build passed afterwards. Models remain **22/105/226**.
- **968** continuous pure samples use independent Babylon FK; **300** supported-scale endpoint
  comparisons use actual mesh bindings, max mismatch **1.786e−7**. Final Chromium solver pass:
  **1,210 samples**, max sole error **6.248e−8**, hand error **0.009902**, and corner penetration
  **6.748e−8**. Repeated rendering/solving and three regenerations pass.
- Isolated 25-rig solve mean/p95 **1.185 / 2.20ms**, observed **2 passes / 8 limbs / 147 joints**;
  hard ceiling **4 / 16 / 249**, zero terrain queries. Separate existing A0 workload **1.221 / 1.90ms**,
  42 terrain lookups. See verification for allocation scope and integrated A3 timing qualification.
- Existing animation browser passes. Reviewed solver front/side/gameplay and animation captures;
  legacy sword/pipe placement remains the worst visible equipment issue for A4. One browser
  iteration caught an unpinned initial world in the resource comparison; explicit seeded regeneration
  fixes the fixture. Final original scene counts plateau after temporary-helper disposal.

### Effect adoption plan — 2026-11-20 (planning only)

- Added [effect-refactor-plan.md](effect-refactor-plan.md), preserving the source evaluation's
  findings and defining EF0–EF4 as a pre-content generation refactor, with EF5 scoped separately.
- User requested scheduling before more procedurally generated features, while continuing the
   current animation work. A2 was next at this planning checkpoint; the insertion point follows
   the animation/death-physics queue.
- The plan covers deterministic stage composition, selective typed failures, fresh attempt state,
  bounded local traces, synchronous API compatibility, cost measurements and per-slice gates.
  Application/dependency adoption remains planned.

### A1 — shared humanoid definitions and bindings — 2026-11-20

- Added the 20-joint shared definition, four immutable profiles, chains/limits, anatomical sockets
  and coarse body mappings; independent local/world quaternion FK and reusable affine socket output.
- ECS `rigPose` owns numerical channels, local/current/previous buffers and the binding. Existing
  samplers write the temporary numerical bridge; only bindings apply final transforms. Explicit
  logical head/hand frames reuse all existing scene geometry. See [architecture](rig-foundation.md).
- Missing-module tests failed first. The independent review then exposed a real stale-root bug:
  entering/leaving lava returned `stone/lava` instead of `lava/stone`. The new real-browser
  regression failed before `movePlayer` switched to current authoritative terrain coordinates.
- Seven new pure tests; **309 everyday tests / 28.71s native elapsed**, typecheck, lint, format
  (**164 files**) and build pass. Models remain **22/105/226**.
- **428** catalog samples match preserved A0 within **2.384e−7**. Render identity, shadows,
  observation references and real ray selection pass. FK/rendered-joint delta is **5.644e−6**;
  counts stay **2,291 meshes / 397 nodes / 28 materials / 4 textures** across three regenerations.
  Cost: **1.127ms mean / 1.50ms p95**, **42 tile lookups**; allocation qualifications in verification.
- Existing animation passes, including an explicit ordinary-gait control assertion. Movement's
  obsolete 21-enemy expectation was corrected to the implemented 24; its **16** checks pass.
  Jump **8** and local production **5** checks pass. Relevant captures were inspected.
- Independent review returned **READY**, clearing the terrain blocker and passing bounded matrix,
  history, socket and invalid-definition probes. A2 coordinated full-body IK is next.

### T2 — faster test feedback before animation — 2026-11-20 (verified, review READY)

- User asked to investigate and shorten/segment slow tests before A0. Measured the unmodified
  315-test suite on Node 26: **303.11s** test-runner elapsed. The largest case was the 100-seed
  tribute corpus (**247.18s under concurrent load**); other generation sweeps and exhaustive
  clock/model tests also dominated. Individual overlapping times are not additive wall time.
- Added complementary native Node core/extended/full groups with four file workers. The commit
  gate stays `npm run check` but now uses core; Pages CI requires `npm run check:full`.
- Preserved broad corpora, all 1,200 durations and long tribute scenarios as extended tests;
  made eager 100-world setup lazy and removed 16 repeated crate/exit searches per tribute seed.
  Added representative world/site fixtures, retaining the `ember-70` clue regression every day.
- Core work-model partitions cover the same five states/seven branches; the original **8,206**
  every-tick paths still run in extended coverage. Exact 3.7/6.9-second regressions remain core.
- Final everyday gate: **301 passed / 26.79s** (28.82s including typing/npm overhead).
  Full profiling run: **319 passed / 301.57s**, all 315 original named contracts plus four added
  checks; no deleted coverage. Full wall time is approximately unchanged, not claimed faster.
- Format (**150 files**), lint, typecheck and build passed. Thirty failure/filter/reporter probes
  using the actual npm scripts passed on Node **22.18.0, 24.22.3 and 26.0.0**. Full model coverage
  remains **22 machines / 105 states / 226 branches**; reports distinguish core/exhaustive paths.
- Another **47 model/work checks** passed on Node 24.22.3; filtered world discovery took **0.28s**.
  Actionlint, diff checks and hook preparation pass. Independent review returned **READY**, checking
  all original names, exact exhaustive model equivalence over 410 vertices/6,529 edges, nine
  report-lifecycle probes and seven timing regressions. Its full filtered discovery took 3.24s;
  it reused broad verification rather than rerunning it.
- A0–A7/P8/P9 remain unimplemented. Existing staged publication records and animation-planning
  edits were preserved; raw user notes remain untouched. At this historical T2 checkpoint its
  edits were uncommitted and A0 was next after compaction; the current tracker records A0 delivery.
  Full details are in VERIFICATION.md.

### Animation roadmap and compaction handoff — 2026-11-20 (planning only)

- User requested a written full-body IK implementation plan before compaction, a reusable
  humanoid-with-tail rig for kobolds, conversion of existing animations, and shield anticipation
  and reaction. Added [animation-roadmap.md](animation-roadmap.md) as the detailed continuation of
  the demo's animation plan and this delivery queue.
- A0–A7 precede P8/P9: motion-review baseline, rig contracts/bindings, coordinated IK, locomotion
  migration, action/social/work migration, articulated tails, shield response and complete cutover/
  physics handoff. Immediate next implementation is **A0**, after the user resumes.
- Source audit confirmed current analytical leg IK, procedural upper-body/action poses, the
  existing rigid kobold tail box, instant held-F defense, and time-sampled death collapse. The plan
  replaces the tail stub with an articulated chain rather than duplicating it. It preserves
  movement/combat clocks and distinguishes the later physical ragdoll takeover from living IK.
- Preserved the already staged P7 publication records and the user's untracked raw notes. This
  request changes documentation only; no new rig, physics, tail or animation code is claimed.
  The earlier P7 entry below records its historical next step before this new ordering decision.
- Documentation checks: source contracts, referenced paths, existing npm commands and roadmap
  ordering were cross-checked; tracked/staged and new-file diff-whitespace checks passed. No
  gameplay, browser or build suite was run for this documentation-only change.

### P7 — public repository and hosted delivery — 2026-11-20 (complete)

- Parent pushed **`3934e17eb90884dbecf2b4e31ca44459e9b58d12`** to `origin/main`, confirmed
  **`isPrivate: false`**, and created Pages with **`build_type=workflow`**. The public source is
  https://github.com/tmbritton/the-hollow-crown and the live HTTPS demo is
  **https://tmbritton.github.io/the-hollow-crown/**.
- Parent-reported [GitHub Actions run 44745698117](https://github.com/tmbritton/the-hollow-crown/actions/runs/44745698117)
  **succeeded** at that commit, completed **2026-11-20T13:44:59Z**: **build 8m 47s / deploy 15s**.
  Required checks, root build/browser smoke and Pages build/project-path smoke all passed in CI.
- Parent ran `DEMO_URL=https://tmbritton.github.io/the-hollow-crown/ npm run test:production`:
  **five checks, zero browser/network errors**. The saved report was read for this record; its
  HTTPS URL is correct, all **31 requests** stay under the project path, and errors are empty.
  Seed/bootstrap, map/movement, defense input, regeneration, quality and menus pass;
  `window.__dungeon` is absent and F2 issues no Inspector request.
- Parent read the actual hosted lowered/defending captures and confirmed the rendered game,
  controls and shield poses. These are attributed hosted/CI results, not newly rerun local suites.
  The hosted report/captures now occupy the earlier local project-path artifact filenames.
- **P7 is complete at `3934e17`. P8 directional ragdolls are next, not implemented; P9 skeleton
  debris follows P8.** This delivery-record change is documentation-only; raw notes remain
  untouched and excluded. Earlier local and independent-review qualifications are retained below.

### P7 — independent prepublish review and local delivery — 2026-11-20 (historical prepublication checkpoint)

- Independent prepublish review returned **READY, no blockers**. The user authorized the intended
  P7 local configuration commit with normal hooks. Commit `3934e17` records that local delivery;
  **public visibility, Pages setup/deployment and hosted verification remain pending**.
- **Attributed reviewer results:** actionlint and diff checks; **four server-helper tests** under
  **Node 24.22.3**; URL/base, custom-port, query, owned cleanup, reused-server and remote-server
  probes all pass. Official action pins and metadata were independently confirmed.
- The reviewer checked the root and project-path production reports (**five checks each, zero
  errors**) and all **four defense captures**, and reused the recorded **315-test/full-check/build**
  evidence. These are attributed review results, not a new local browser/full verification batch.
- Reviewer GitHub inspection confirms administration access, enabled Actions, private visibility
  and absent Pages (**404**). Parent publication begins after receiving the commit hash. No hosted
  success is claimed. Raw notes remain excluded; P8/P9 remain queued after P7 publication.

### P7 — local release configuration — 2026-11-19 (historical pre-review checkpoint)

- Baseline **`806a27b`**, P6b complete. Read the guide, README and planning index/path/progress.
  Read-only GitHub checks confirm origin `git@github.com:tmbritton/the-hollow-crown.git`, private
  visibility, default `main`, `has_pages: false` and Pages API **404**. No settings were changed.
- **Red first:** enhanced real production browser test plus path-aware preview rejected the
  baseline root bundle's request to `http://localhost:4187/assets/index-jOJsluc9.js` outside
  `/the-hollow-crown/`. Added explicit `build:pages` / `preview:pages` scripts passing Vite's base;
  root development retains its defaults. The same subpath check then passed.
- Official Actions workflow pins GitHub-release/tag-verified commits for checkout **7.0.1**,
  setup-node **7.1.0**, configure-pages **6.0.0**, upload-pages-artifact **5.0.0** and deploy-pages
  **5.0.1**. Node 24 / `npm ci` / `npm run check`, sequential root/project production smokes,
  **dist-only** upload, main-only push/dispatch, concurrency and environment URL are configured.
  Build gets contents-read; only deploy gets pages-write/id-token-write. No external runtime host.
- `DEMO_URL` now supports hosted Pages and local project mounts. Local preview forwards its base
  through the existing strict-port ownership/cleanup helper; remote sites start no local server.
  Smoke covers seed navigation, both menu regeneration paths, quality persistence, map/movement,
  held-F/release captures, actual asset paths and absence of debug/Inspector requests/errors.
  A fixture-only failed root attempt exposed the retained `#loading.done` across regeneration;
  readiness now also waits for the new welcome toast. No game/UI change was required.
- One successful **root** and one successful **project-path** Chromium/SwiftShader smoke, sequentially,
  each with five reported checks, zero errors and a 120s browser deadline. Reviewed all four
  lowered/raised-shield captures. Final `npm ci`, format (**148 files**), lint, **315 tests / 310.11s**
  and build passed under **Node 24.22.3**. Models remain **22/105/226**; build **689 modules**, existing
  chunk warning. Required full checks ran once after targeted green. Actionlint **1.7.12** passes.
- README contains publication targets and exact local/hosted commands, marked **pending**. Parent
  owns independent review, normal-hook commit, public visibility, Pages Actions-source setup,
  push/deploy and hosted smoke. **P7 is not published or independently approved.** No agents,
  staging, commit or push; raw notes remain untracked. Owned 4173/4187 previews and browsers closed;
  existing services/system settings untouched. P8/P9 stay queued after P7; P1 remains closed.

### P6b — final independent review and delivery — 2026-11-19

- Final independent review returned **READY**, clearing both the reachable-formation stall and
  ECS-order javelin-interception blockers. **P6b is complete**, and the user approved its feature
  commit with normal hooks. The containing commit records delivery against P6a **`c3641c2`**.
- Attributed fresh reviewer results: **24 circular arrangements** hit by **12.9167s**, maximum
  **2 plans**, minimum separation **0.90282044**, maximum step **0.02**; adverse original seed hits
  at **13.1333s**. Both javelin orders contact the ally at **.8471111515**, retaining player **100** /
  ally **44 HP**, with original crossbow rules. **600 geometry-oracle comparisons** and contact
  boundaries pass. The small exact-tangency roundoff observation is non-blocking (VERIFICATION.md).
- Reviewer lifecycle probes pass: obstruction removal, target loss/return/reacquisition, spearman
  death and same-ID target replacement. Its separate blocked fixture settles by **30s, not 20s**,
  stays held through **120s**, and hits **4.23s** after the blocking body dies. Group model
  **10/47/1,950**, attack **4/13/210**, pure navigation/altar-gate progression, diff, **13 captures**
  and phalanx **8** / combat **15** reports pass. The reviewer reused **315 tests/full checks/build**.
- These are attributed independent checks, not repeated implementation runs. Approval requires no
  production edits or additional browser suite. The normal commit hook runs tests/typecheck, lint
  and format. Raw notes remain untouched and excluded; parent planning edits are included.
  **P7 is next; P8/P9 stay queued after publication; P1 stays closed.** No agents or P7 implementation.

### P6b — independent-review corrections — 2026-11-19

- Reviewer returned **BLOCKED** on two production issues. Locally reproduced both before runtime
  edits: **0 pass / 3 fail**. Exact circular setup stayed holding for **60s**, original MOURNING-731
  stable approach for **20s**, both **0 impacts / 100 HP**. Edge javelin hit the hero for **10** only
  when the hero preceded its nearer friendly interceptor in the ECS query. A preliminary test's
  per-step bound was corrected for the existing sub-0.025 arrival connector before rerunning reds.
- Holds now preserve useful local routes. After one second, a bounded half-second-cadence recovery
  probe accepts a routed detour or yield, then the existing chart owns reassembly. Further retries
  require changed target/external geometry or **0.25** progress in best remaining route/slot distance.
  A focused **55 pass / 1 fail** checkpoint exposed the cramped stairs entering repeated recovery;
  a probe found a whole-keep detour. The final **12-unit formation-route limit** and progress gate
  preserve the strict narrow-hold test. Extended tests show zero new plans/movement from 15–30s in
  the cramped case, and zero new plans in the immobile adapter's second 15 seconds.
- Javelins use earliest swept horizontal-cylinder/vertical-slab contact, with deterministic ID ties.
  Terrain/doors are checked to that contact, preserving before/after cover ordering. Friendlies stop
  the shot without damage; crossbow behavior is unchanged. No new chart lifecycle or render nodes.
- All **24 circular role arrangements** now hit within **12.9167s**, max **2 plans**, min separation
  **0.90282044**, max step **0.02**. Repositioned threat takes damage too. Original stable case hits
  at **13.1333s**. **108 projectile cases** cover six insertion orders, rotations/reverse/zero/vertical
  travel, grazing, airborne/sloped height, cover/doors and crossbow controls. Original edge contact
  is **z=.8471111514857935**, hero **100 HP** in both orders.
- Focused phalanx/projectile **23**, correction-focused **7**, final strengthened hold/return **3**
  and affected models pass. Model group **10/47/1,950/480**, attack **4/13/210/480**; complete catalog
  **22 machines / 105 states / 226 branches**. The reform partition now includes noncohesive ranks.
- Sequential Chromium/SwiftShader passes, once each: **phalanx 8 / 24.24s**, **combat 15 / 66.50s**,
  with owned server lifecycle included. Real seeded/circular recovery hits at **13.1667s / 12.9667s**,
  two plans each, minimum separations **0.90031539 / 0.90688869**. Both browser edge orders consume
  the shot at the same earlier friendly contact. Reviewed two new recovery views and eleven refreshed
  action/rank views in contact sheets. Prior social **15**, defense **9**, tribute **9** evidence reused.
- Final **315 tests / 304.51s**, lint, format (**148 files**) and build (**689 modules**, Vite **0.580s**)
  pass. Lint/full tests/build each ran once; the first prefix stopped at a regression-file format
  issue, corrected before those commands ran. Existing bundle warning only. No broader browser repeat.
- Reviewer-attributed passes retained: **96 lane/corpse cases**, four action clocks, eight pre-impact
  death/interrupt/boolean-compatibility probes, five competing guards and group/attack models. These
  are separate from local evidence and do not constitute approval of the corrections.
- Independent re-review was pending at this checkpoint; the final **READY** verdict above clears
  both blockers. Owned browser/Vite processes closed; raw notes and existing services untouched.
  No agents, staging or commit were used for the correction. P7 remains next, P8/P9 follow
  publication; P1 closed.

### P6b — recovered implementation and completed verification — 2026-11-19

- Preserved saved runtime/rendering/fixture work against **`c3641c2`** and the parent's queue edits.
  No production correction was needed. Added the two phalanx action kinds to the existing attack
  model, using actual duration/impact contracts and invariant action identity/timing. Original
  test-first P6b failures were not retained; the first resumed focused batch passed **51/51**.
- Physical **3-front/1-rear** ranks advance at **1.1 units/s**; turn cap **0.65 rad/s**, lateral
  spacing **1.15**, rear separation **1.2**, lane **0.575**. Shared chart owns a **0.6s** vulnerable
  opening; individual `Attack` owns **3.8-range/12-damage thrust** or **9-range/10-damage javelin**.
  Recovery and minimum engagement are **1.25s** each. Friendly living bodies stop javelins without
  damage; the shared projectile cap is **32** with one reusable shaft pool.
- Half casualties, **35% surviving health**, or lost spearman trigger **0.85 units/s** backward
  withdrawal with threat-facing shields. Survivor offsets, **0.13** cohesion gating, ordinary
  terrain/body/gate clearance and slowest-member water pacing prevent overlap or teleport.
  Six-second assembly, 17 candidate footprints and bounded route/yield rounds lead to a defensive
  hold when cramped; there is no single-file choke traversal. Seeded roomy gatherings attack;
  the cramped stairs fixture holds safely. Four original porter roles, including lone spearman
  takeover, continue to use ordinary work/tribute behavior after threat loss.
- Recovery checks: **51 focused** in **20.99s**, **6 focused model/social/tribute** in **34.63s**,
  extended attack model in **0.41s**. Final required format/lint/npm-test/build commands each ran
  **once**, all passing: **147 formatted files**, **305 tests / 298.37s**, **689 build modules**
  (Vite **0.602s**, existing chunk warning). Complete models **22/105/226**; squad **10 states /
  47 branches / 1,885 paths / 480 cyclic steps**, attack **4/13/210/480**.
- Inspected saved reports and runtime timestamps before reusing current Chromium/SwiftShader
  phalanx **6**, social **15** and combat **15** passes. Defense/tribute reports predated P6b;
  fresh sequential runs pass **9 each** in **19.40s / 117.16s** including server lifecycle, with
  zero errors. Three tribute regeneration samples stabilize at **2,291 meshes / 28 materials /
  4 textures / 49 effects / 34 shader sources**. Software timing is not hardware FPS.
- Composed and actually inspected **three contact sheets / eleven views**: front, side, opening,
  thrust preparation/contact/front, throw preparation/flight and retreat front/side. Shields,
  rear lane, exposed chest, reaching shaft and threat-facing survivors are readable; side thrust
  supplies contact obscured by the hero in the front view. Also reviewed seeded engagement and
  tribute carrier views. Artifacts and exact commands are in VERIFICATION.md.
- Owned browser/Vite scopes used **5187** and a **240s per-suite deadline**, then closed. Final
  check found no 5173/5187 listeners or owned test-browser processes. Existing services and raw
  notes were untouched. No agents, staging or commits. **Independent review is the next gate;
  P7 remains the next feature, with P8/P9 queued afterward.** P1 remains closed.

### Interrupted phalanx work and new user notes

- Resumed from committed P6a `c3641c2`. P6b runtime, model and browser-test changes survived
  the interruption; unrecorded checks are not assumed to have passed.
- Added P8 directional ragdoll deaths and P9 skeleton breakup to the queue after the original
  list through publishing P7, as requested. The user's raw `docs/notes.md` remains untouched.
- The user reported another machine freeze and requested continuation. P1's application
  investigation remains closed; system configuration and driver diagnosis remain outside scope.

### P6a — final independent review and delivery — 2026-11-19

- Final independent reviewer returned **READY**, clearing the role-aware defense-test blocker and
  finding no other issues. The reviewer inspected the **9-check, zero-error defense report**, the
  complete **22-machine / 100-state / 196-branch** model report and the **291-test** post-correction
  result; the existing production build remains valid. These are attributed review findings.
- Earlier independent production probes remain attributed below: **100 other seeds / 1,100 work
  routes**, **24 home permutations**, **1,260 poses / 237,600 mesh corners**, and lifecycle/visual
  checks. Broad verification was reused. The gameplay evidence remains **18 checks + five continued
  checks after a tool timeout**, not an uninterrupted 23-check run.
- **P6a is complete and authorized for its normal-hook feature commit.** This entry's containing
  commit records the feature. **P6b is next, not started**; its handoff is the existing original
  membership/role/slot references, shared chart state/target, center/heading and `approach(member)`.
  P5 remains **`975c533`**. Raw `docs/notes.md` is untouched and excluded; no new agents or service
  operations were used for delivery.

### P6a — independent review test correction — 2026-11-19

- Reviewer returned **BLOCKED** on one obsolete test expectation and reported **no production
  defect**. Its focused MOURNING-731 regeneration probe found exactly nine enemy defense components:
  the old `some(has('defense')) === false` assertion failed **true !== false**. That supplied red
  evidence was reused; no broad red rerun was needed.
- Updated only the test's role/capability assertions: nine shield-bearing kobolds have defense;
  three spearmen, eight skeletons and four goblins do not. Every enemy is checked individually.
  Existing hero regeneration/hold/repeat/key-up/fresh-press latch cases remain intact. Corrected
  VERIFICATION.md's tribute report link to `test-results/chromium-tribute.json`.
- **Attributed reviewer passes:** eight squad tests; model **5 states / 17 branches / 1,302 paths /
  480 cyclic steps**; 100 other seeds with exact populations, **300 groups / 1,100 work routes**;
  **24 circular home permutations** with minimum separation **0.908**, maximum step **0.04833**, no
  overlap/teleport; **1,260 poses / 237,600 mesh corners** passing shadow/envelope checks (reported
  worst envelope value **0.664**), shield-facing dot **1**, death/regeneration, disposed old meshes
  and zero errors. Idle/engaged/assembly captures were reviewed. These are reviewer-supplied results;
  broad implementation results were reused.
- **Local checks:** the affected Chromium defense suite ran **once**, passing all **9 checks** with
  zero errors. Typecheck, format (**143 files**) and lint pass. One full **npm test** run after all
  corrections passes **291 tests in 363.82s**; model report complete at **22 / 100 / 196**. The prior
  289-test/31-focused implementation evidence remains qualified below. Existing build and
  squad/social, tribute and gameplay browser results were not repeated.
- No production edits, agents, staging or commit for this correction. Raw notes and existing
  services untouched; owned **5187** Vite/browser scopes cleaned up. Follow-up review was pending
  at this correction checkpoint; the final independent **READY** verdict above clears the gate.

### P6a — four-member squad foundation — 2026-11-19

- Baseline **`975c533`**. Read the guide, README, docs index/path/progress, user notes and applicable
  monster plan. Current source remained authoritative. No agents, staging or commits; raw notes
  untouched. Independent review was the next delivery gate at this implementation checkpoint;
  the final **READY** verdict above clears it. P6b remains planned.
- **Red first:** new squad contracts failed on the missing module; the strengthened 100-seed
  population/work contract failed at **21 versus 24** before production edits. Contracts cover
  original entity/role identity, shared perception/damage alerts, real movement/melee/return,
  casualties/defeat, target loss/replacement and fresh regeneration.
- Three existing packs now each contain **three shield bearers and one spearman**: **12 kobolds,
  24 enemies**. The ECS group owns a synchronous XState lifecycle and authoritative target reference;
  individual species charts remain. Bounded assembly and role-bearing radial approaches feed normal
  navigation/occupancy. Shield bearers opt into P5 defense while assembling. Procedural drawn/stowed
  shields and long spears distinguish roles; death restores only drawn equipment.
- Tribute's original roster is four. Shared combat interrupts ready work before commit. The added
  spearman physically recovers/delivers a predecessor's drop as sole survivor in **three seeds**;
  all four off-screen deliveries and independent/same-step Last Ember outcomes pass. A fixture that
  killed the independent smithy worker before asserting its clock unresolved was corrected.
- **100 tribute seeds** preserve 8 skeletons/4 goblins, three reliquaries, four safe social slots,
  interaction/work approaches and pre-altar routes; longest shrine/cache route remains **126 tiles**.
  Existing keep/portrait stream fixtures pass. The independent scenario revision is
  `last-ember-v1+tribute-v2+kobold-squads-v1`; layout-v3/keep-v4 remain stable.
- Initial required checks ran once after targeted checks: **289 tests**, format/lint/typecheck/build
  pass. Model totals are **22 / 100 / 196**; squad coverage is **5 states / 17 branches / 1,302 generated
  paths / 480 cyclic steps**. An initially excessive Cartesian model partition was reduced to the
  meaningful time/target/cohesion/casualty/return boundaries without weakening branch coverage.
- Browser iteration found two genuine return problems and each received a pure failing regression
  before its fix: a stale temporary-occupancy detour took **64 seconds**, and two original members
  occupied each other's social approaches indefinitely. Returning squads now refresh home routes on
  the existing THINK cadence; the first displaced slot can physically yield to a clear nearby point.
  No formation teleport or collision bypass. Final physical returns are **3s cards / 2s hacky sack /
  5s smoke**. Focused-fixture startup now waits for initial scene readiness before regeneration and
  normalizes only its setup positions; a premature-regeneration shader error was not counted as a pass.
- Final **31 focused tests**, format/lint/typecheck/build pass after corrections. The full test suite
  was not repeated. Chromium squad/social **15** and tribute **9** pass with no errors. The optional
  cross-cutting gameplay pass completed **18 checks**, including the full core route, before the
  combined 600s shell budget expired; only its remaining **five** layout/regeneration/asset/error
  checks were continued, all passing. No repeat of the successful main gameplay checks.
- Reviewed the four-role idle/engaged stable and treasury views and card-game views, plus tribute
  work/delivery captures. Some card views have ordinary wall occlusion; stable/treasury captures
  show all four roles clearly. See VERIFICATION.md for paths and timeout qualifications.
- P6b can consume the live `members`/`living`, chart `state`/`target`, `center`/`heading` and current
  `approach(member)` contract. Physical ranks, slow advance, opening cues, rear thrusts/javelins and
  coordinated backward withdrawal are deliberately still planned. Owned **5187** Vite/browser
  scopes are closed; existing 4096/tailnet 8443 services were untouched.

### P5 — independent review and delivery — 2026-11-19

- Independent reviewer returned **READY, no P5 blockers**. These are attributed reviewer results,
  not another implementation verification batch: **12 defense tests**; model **3/3 states,
  4/4 branches, 21 generated paths and 480 cyclic steps**; **11,316 angular cases**;
  **7,776 latch traces / 38,880 transitions**; **180 bolt width/support/arc cases**;
  **5 work-boundary cases** and **9 held-input/reset cases**.
- Focused real-browser windup/F, modal/text input, jump, gold effect pool, regeneration and head
  checks passed with **no errors**. Gold/blood counts progressed **12/14 → 0/14 → 0/0**;
  the shared cap stayed **192**, mesh counts were stable, and regeneration disposed the old pool.
  Built-output development-debug identifiers had **zero matches**.
- The reviewer corrected **two fixture issues**. Those preceding failed attempts are not counted
  as passing runs. No P5 production correction was required.
- Review reused the implementation's **281-test/full-check/build**, **9 defense-browser checks**
  and **15 combat-browser checks**. The existing implementation qualifications below are retained.
- **P5 is complete and the user approved its normal-hook feature commit.** This entry's containing
  commit records P5. **At that P5 checkpoint, P6a squad coordination was next, not started.** P4 remains **`be29b8c`**;
  raw `docs/notes.md` is untouched and excluded. No new agents were used for delivery.

### P5 — held-F frontal shield — 2026-11-19 (pre-review checkpoint)

- Baseline **`be29b8c`**, the committed and independently reviewed P4. Read the guide, README,
  docs index/path/progress and raw notes. P1 remains closed, P2 accepted and P3/P4 committed.
  Raw `docs/notes.md` remains untouched. No subagents, staging or commits were used.
- **Red first:** the initial five combat regressions ran before production edits: **1 pass /
  4 fail**. A front melee hit left **94 HP**, a front bolt **93 HP**, and moved/dead-shooter and
  immediate-rear-hit scenarios also reproduced absent blocking. Existing impact-time range,
  cover, door and elevation guards passed. Added lifecycle, work, attack-boundary and model
  contracts next; both test files then failed on the missing defense-machine module.
- **Design:** optional ECS `defense` owns the synchronous XState **`actorDefense`** chart with
  lowered/raised/release-latched states. Only the player opts in now; a kobold can use the same
  component and shared request boundary. Inclusive **120°** arc follows authoritative movement
  heading. Melee supplies live impact direction; bolts supply travel velocity, separately from
  source identity/hostility/death attribution. Existing species/populations remain ordinary.
- Blocks cause no health/protection transition, blood, chip damage or resource cost. Side/rear
  attacks and hazards remain effective. Six short gold fragments at most share the existing
  192-particle cap and use a fixed thin-instance pool/material. Collision/cover/elevation and
  attack clocks retain their existing authority.
- Raising interrupts own attack/work and suspends pursuit/autoswing, retaining selection;
  release resumes ordinary pursuit/cooldown. Floor navigation and walk/run stay active at full
  speed. Jump preload lowers guard, and jump/X/modal/focus/death/teleport cancellation requires
  release and a fresh press. Regeneration and modified/repeated keydown cannot revive a hold.
  The rig turns the broad shield face forward, keeps the weapon lowered and clears offsets/yaw
  on reset without a parallel animation lifecycle.
- **Green:** **52 focused defense/combat/work tests**. The new defense file has 12 tests,
  including 48 heading/arc/hit-type combinations; friendly/self/missing/dead projectile sources,
  invalid directions/amounts, corpse/jump/raw-attack states, health snapshot identity, bounded
  feedback, exact attack interruption, ready work cancellation and normal movement/water rules.
  The focused model run passed; defense adds **3 states / 4 branches / 21 generated paths /
  480 cyclic steps**, partitioning fresh/repeated and eligible/ineligible presses.
- **Browser:** one successful affected pass each: Chromium defense **9**, combat **15**, no
  console/page errors. Real F down/up/repeat and modal handlers, melee/bolts, rear damage,
  release/resume, normal-speed corpse crossings and actual seeded ramp navigation pass. Screenshot
  review found an obscured front view/loading overlay and a wall-obscured ramp view; a separate
  capture-only pass refreshed four views, with gameplay results retained. The shield normal has
  forward dot **1.0**, center **0.35000002 units** ahead and about **1.03 units** above support.
  Reviewed the solid front shield, side thickness, lowered sword and brief block fragments.
- **Final checks:** format (140 files), lint, **281 tests** including strict types, and build pass;
  **21 machines / 95 states / 179 branches**. The first final test command stopped at a screenshot
  helper's `Node.remove()` typing error; it now uses `parentNode.removeChild`. The next run exceeded
  the tool's 240s budget during generation, with no assertion failures; the complete rerun passed
  in **277.55s** under a 600s budget. Build retains the existing large-chunk warning. No full
  browser, cross-browser or production-smoke repeat was needed. Artifact paths and exact commands
  are in `VERIFICATION.md`.
- Browser and owned **5187 Vite** scopes cleaned up. Existing OpenCode 4096/tailnet 8443 services
  were untouched. At this implementation checkpoint **P5 awaited independent review**; the
  subsequent READY verdict above clears that gate. P6–P7 remained planned.

### P4 — independent review and delivery — 2026-11-19

- Independent reviewer returned **READY, no blockers**. Attributed passing checks: **23 targeted
  tests**, **6,480 exact ordinary-baseline pose matches**, **50,000 phase samples / 75 seams**,
  and **8,640 actual skeleton frames / 6,162 plants with zero violations**.
- Skull scale, reset, teleport and death probes passed, as did the diff check and review of
  skeleton captures **1–4**, ordinary control and reset views. These are reviewer-reported
  results, not another implementation verification batch.
- Review reused the implementation's **268-test/full-check/build** evidence and browser results
  with **732 contacts**. No code corrections were required.
- **P4 is complete at `be29b8c`, committed with normal hooks.** At that delivery checkpoint,
  **P5 held-F defense was next, not started.** P3 remains complete
  at **`9f8e1d7`**. Raw `docs/notes.md` remains untouched and excluded from the feature commit.

### P4 — skeleton lurch implementation — 2026-11-19 (pre-review checkpoint)

- Baseline **`9f8e1d7`**. Read the guide, README, docs index/path/progress and raw notes;
  P1 remains closed and P2 accepted at `726af8a`. Raw `docs/notes.md` is untouched. No agents,
  staging or commit at this implementation checkpoint; the subsequent READY review above clears
  that gate.
- **Red first:** after fixing a test-world `blockers` fixture typo, the focused gait/corpse run
  had **9 pass / 2 fail** before production edits: skeleton legs were mirrored, and ordinary
  timing released the left plant at 52% of the cycle. The new asymmetry/phase contracts now pass.
- Added a small pure gait sampler with **64/36** load/catch-up phases shared by the leg poses
  and foot solver. Ribs sag/roll/twist, and an optional skeleton-only skull pivot trails them.
  Measured stride/blend remain the existing animation state; no new lifecycle chart or clock.
  Attack blending follows locomotion, leaves weapon arms intact, and suppresses skull lurch.
- **23 focused tests** pass, including bounded/continuous phases, blocked/airborne cadence,
  unchanged actual 1.65 travel/action state, reset, 24 flat and 20 ramp corpse crossings.
  Pure maximum contact penetration is **1.16e-7**; ordinary turning/contact coverage remains green.
- The affected Chromium animation suite passes **32 crossings / 732 surface contacts**, maximum
  penetration **0.000003269**, plus 46 shared poses and 44 new motion/reset captures. Five
  eight-frame sequences use actual motor steps: same-mesh ordinary control, flat lurch, stairs,
  corpse and moving attack. Four boundaries cover blur policy, stop, teleport and death;
  regeneration verifies fresh neutral skeleton rigs. All captured poses fit the existing envelope.
- Browser iteration exposed fixture issues: two aborted runs corrected the old player-run-speed
  skeleton sample and its old footfall's low forearm contact; the fixture now uses 1.65 and centres
  the corpse ribs/pelvis under the timed feet. A third run passed assertions but failed an
  off-viewport sheet crop. The final full animation pass succeeds. Narrow sequence-only runs
  supplied visual review and the final refresh; there was no combat/movement/full-game repeat.
- Reviewed the visible long forward sag and quick recovery against the upright ordinary control,
  side-to-side loading on stairs, raised knees/soles over corpses, and distinct sword wind-up,
  impact and recovery. Corrected stair/weapon framing. After the full pass, a capture-only renderer
  initialization fixed a coffer left at the origin by the paused fixture; refreshed just the 44
  skeleton captures and their report. Full details/artifact paths are in `VERIFICATION.md`.
- Required **format, lint, npm test and build each ran once after targeted checks**, all passing:
  **268 tests**, strict types, unchanged **20 machines / 92 states / 175 branches**. Existing
  bundle-size warning only. Port 5173 was absent; every browser/server scope used owned 5187 and
  cleaned up in `finally`. Existing OpenCode/tailnet services were untouched.

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
- **P3 is complete at `9f8e1d7`, committed with normal hooks.** At that delivery checkpoint
  **P4 skeleton gait was next, not started.** P2 remains accepted at
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

- P6a is complete with final independent review READY; no remaining P6a blocker. **P6b is next**,
  using the documented squad contracts for the physical phalanx encounter.
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
