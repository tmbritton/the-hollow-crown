# Implementation progress

Execution record for [implementation path](implementation-path.md). Started **2026-11-18**.

## Current position

- Planning/source audit complete; working tree was clean at baseline `2654e65`.
- Selected the procedural-content Phase 0 prerequisites as the first delivery sequence.
- Planning committed as `822ec0c`; the pre-commit baseline passed all 97 tests, lint and format.
- **Completed G1–G3, T1, I1–I2, S1a–S1b and N1. Next: D1 within-run discovery record.**
- Latest checkpoint: 130 pure/model tests, lint, formatting and build pass; 23 Chromium full
  checks, 13 combat checks in each browser, nine Chromium social checks, production smoke,
  generation checks and the refreshed 48-view gallery pass. Per-feature details are below.

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
| N1 | Complete | Identity/report and visual tests failed first; corpus doorway-home and review HUD-overlap regressions failed before fixes | 130 tests/check/build, both combat browsers, full/social, production, generation and gallery pass; independent review cleared | This commit |
| D1 | Next | Pending | Once-only learned facts/observed events, inspection integration, respawn persistence and regeneration reset | — |
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

## Follow-ups and blockers

- No current correctness blocker. G3's full-browser follow-up is resolved by T1.
- Phase 0 diagnostic/gallery implementation and high-quality hardware sampling are done.
  Low-quality hardware sampling and generation-latency reporting remain to complete its
  full performance baseline; do not claim Phase 0 entirely complete yet.
- Shared architectural heraldry, composition-driven profile differences and the full
  Phase 1 art/readability gate remain open. Captions/palettes alone do not satisfy that gate.
- S1's anchor/socket placement and integration are delivered. Causal contact detail and
  profile-led composition can build on these recipes during the broader visual-identity gate.
- Next D1: a within-run record of learned facts and actual observed events, keyed by stable
  IDs. Start test-first with deduplication, respawn retention and regeneration reset, then
  integrate portrait inspection and observed named inhabitants. Persistent exports remain later.
