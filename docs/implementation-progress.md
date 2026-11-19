# Implementation progress

Execution record for [implementation path](implementation-path.md). Started **2026-11-18**.

## Current position

- Planning/source audit complete; working tree was clean at baseline `2654e65`.
- Selected the procedural-content Phase 0 prerequisites as the first delivery sequence.
- Planning committed as `822ec0c`; the pre-commit baseline passed all 97 tests, lint and format.
- **Completed G1–G3, T1, I1–I2, S1a–S1b, N1, GF1, D1 (`e6591df`), O1 (`6f79a97`) and O2.
  O2's final independent review is READY. Next: O3, the first playable Last Ember contest
  (not started).**
- O2 decimal timebase correction: **202 tests**, strict typing, formatting, lint and build pass. Model totals:
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
| O2 | Complete | Initial missing-module/lifetime reds; both duration corrections reproduced false monster-first results; decimal sweep and pure/model/browser regressions precede work-unit fix | 202 tests/check/build, 1,200-duration sweep, work 17 each browser; independent READY review cleared both blockers and passed 46 additional probes | This commit |
| O3–O4 | Planned | Pending | Pending | — |

## Work log

### O2 final independent review — READY

- Reviewer cleared both duration-boundary blockers and reported **202 tests/checks and the build
  passing**, the **1,200-duration sweep over 4,323,600 fixed ticks**, and **17 objective-work
  checks each in Chromium and Firefox**.
- The reviewer also passed **46 additional below/above-boundary, half-step and carry-reset probes**.
  No blockers remain. These are attributed independent results, separate from the implementation
  runs recorded below.
- O2 is complete and authorized for its feature commit with normal hooks. O3 is next and has
  not started; this delivery ends with O2.

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

## Follow-ups and blockers

- O2 is complete with final independent review READY and no remaining blockers.
  O3's Last Ember scenario, work/clock presentation and multi-seed pacing are next; O3 has not started.
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
