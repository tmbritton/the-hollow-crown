# Implementation progress

Execution record for [implementation path](implementation-path.md). Started **2026-11-18**.

## Current position

- Planning/source audit complete; working tree was clean at baseline `2654e65`.
- Selected the procedural-content Phase 0 prerequisites as the first delivery sequence.
- Planning committed as `822ec0c`; the pre-commit baseline passed all 97 tests, lint and format.
- **Completed G1–G3, T1, I1–I2, S1a–S1b, N1, GF1 and D1. Next: O1 objective clocks.**
- Latest D1 checkpoint: 155 pure/model/geometry tests, lint, formatting and build pass; 17 discovery
  checks and 14 combat checks in each browser, plus 13 Firefox inspection checks pass.
  Production smoke, 28 animation captures and nine Chromium social checks also pass. The CPU
  A/B/A probe and preparation-budget regressions pass; precise timings are in `VERIFICATION.md`.
  Other browser/gallery/performance results remain the recorded earlier feature baselines.
- Final independent D1 review cleared correctness and performance after the two corrections.
  Next action: implement O1 test-first, then O2–O4 in dependency order.

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
| D1 | Complete | Hidden melee death reproduced first; follow-up cost regression failed with 8,000 matrix calls / 600 bounds refreshes over four off-ray queries | 155 tests, format/lint/build; discovery 17 and combat 14 each browser, inspection 13, animation 28, social 9, production and CPU probes pass; independent review cleared | This commit |
| O1–O4 | Planned | Pending | Pending | — |

## Work log

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

## Follow-ups and blockers

- No current correctness blocker. Independent review cleared D1's camera-occlusion and CPU-cost
  corrections. G3's full-browser follow-up is resolved by T1.
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
