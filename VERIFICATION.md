# Verification — The Hollow Crown

## Result

The playable exploration/combat demo uses a **typed ECS, XState 5.33.4, and strict TypeScript**, verified in Chromium and Firefox. Application code, all test scripts, and Vite configuration pass type checking. The production build also passes a separate smoke test. The state-machine/social update adds independent species charts, generated model-based coverage, and visible card games, hacky sack, and smoke breaks.

### P2 — full-speed corpse traversal — 2026-11-19 (final independent review READY)

Implemented against P1 **`6378d61`**. Final independent review cleared both the original contact
and ramp rotation-math blockers. **P2 is delivered and its feature commit is authorized**; P3 is
next, not started. Raw untracked `docs/notes.md` was read but not edited or staged.
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

The user's explicit **“proceed”** authorizes the feature commit with normal hooks. The P2 tracker
records this delivery as its containing commit; the generated hash is returned after committing.
The raw user notes are excluded. P3 has not started and P1's scope closure is preserved.

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
