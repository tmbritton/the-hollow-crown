# A0 — motion inventory and review baseline

**2026-11-20. Implemented; independent review READY.** Starting evidence for
[A1–A7](animation-roadmap.md), not acceptance of the future solver's contact tolerances.

## Reproduce

Start `npm run dev`, then run:

```sh
npm run test:animation:review
ANIMATION_SCENARIOS=controls,baseline npm run test:animation:review
ANIMATION_SCENARIOS=catalog ANIMATION_CLIPS=spearman/thrust,shieldbearer/opening npm run test:animation:review
npm run test:animation
```

`DEMO_URL` selects an already-running dev server. Groups are `controls`, `catalog`, `baseline`, or
`all` (default). Unknown groups/clips fail; clip IDs are in `tests/animation-review-fixture.ts`.
The runner has an eight-minute deadline and `finally` browser cleanup. Capture stops automatic
rendering and reads the canvas immediately after explicit rendering. Step batches cap at 120;
CPU measurement yields every 12 steps.

Ignored outputs: `test-results/animation-review[-GROUPS][-selected].json` and `.html`, plus
`animation-review-overlay.png`. The HTML viewer supports 1×/¼× playback, pause and stepping.
It presents **10 Hz captures of 60 Hz simulation**, not 60 fps video; sampled images cannot
establish every-frame smoothness. Review at normal speed before slow playback. The existing
animation suite retains its denser ground-contact and skeleton regressions.

Recorded runs: `animation-review-catalog.{json,html}` contains **30 clips / 60 camera sequences /
856 pose samples**. Controls/costs are in `animation-review-controls-baseline.json`. The final
cutaway correction was checked with controls, ascending/descending stairs and cards in
`animation-review-controls-catalog-selected.{json,html}`; its stair views supersede initially
occluded side captures. Eight supporting contact sheets and the corrected stair/card sheet were
reviewed locally. These artifacts are not source assets.

### Interactive development API

Open `/?debug&seed=MOURNING-731` and use the console:

```js
const review = window.__dungeon.animation;
review.pause();
review.camera('side', 'player'); // 'gameplay' also available; null restores the saved camera
review.overlay(true);
review.step(1);                 // 1–120 fixed steps; honors ordinary modal pause
review.sample('player');        // detached world-pose/contact snapshot; no animation tick
review.play(0.25);              // real render-loop playback, still fixed 1/60 simulation
review.overlay(false);
review.camera(null);
review.play();
```

Keyboard/pointer events remain real inputs. Playback scales the accumulator, not the simulation
step or action clocks. Extra renders and samples never invoke the animation writer. Cameras follow
position at a fixed angle; reversing does not orbit the review camera. Gameplay framing is alpha
−π/4, beta **0.64**, radius **27**. Side framing is beta **1.25**, radius **6.5**, with alpha selected
from initial heading. Actual parameters are recorded per sequence. Paused review cameras apply
the ordinary facing-wall cutaway policy and restore prior scales when released; collision proxies
remain separate. Regeneration clears camera/overlay references while preserving playback rate, so
ordinary debug sessions keep playing. Fixtures explicitly pause before regeneration.

The controller and diagnostic math load only inside **DEV + `?debug`**. Production has no review
global, overlay or review chunk.

## Complete migration inventory

Catalog setup authors intent/chart facts and exercises existing production motor, clock and pose
code. It isolates presentation: it is not an AI, combat-outcome or objective-credit test. Controls
separately exercise real W/F input through the full game tick.

| Existing motion / owner | Repeatable A0 evidence | Migration |
| --- | --- | --- |
| Idle, load/push, walk/run, brake/settle, reversal/lean — `locomotion.ts`, `actorRendering.ts` | `travel` on player, skeleton, goblin, shieldbearer and spearman; starts/ends still | A3 |
| Stairs, corpse stepping, running flight — `footPlacement.ts` | `player/stairs`, `player/stairs-down`, `player/corpse`; existing animation suite adds flat/rotated/uphill/downhill crossings for all species | A2/A3 |
| 64/36 lurch/skull lag — `skeletonGait.ts` | `skeleton/travel`; `tests/skeleton-animation.ts` covers ordinary control, stairs/corpse, moving strike and resets | A3 |
| Jump preload/flight/landing spring/cape — `jump.ts`, `actionPoses.ts` | `player/jump`; existing animation suite adds preload/apex/contact/settle and volume checks | A3 |
| Crouch/hide/peek, crossbow aim/recoil | `goblin/hide-peek`, `goblin/crossbow` | A3/A4 |
| Melee windup/contact/follow-through, still/travelling/interrupted | `player/melee`, `player/moving-melee`, `player/interrupt`; existing suite adds enemy moving attacks | A4 |
| Formation assembly, guarded advance/hold, backwards guard | `shieldbearer/formation`, `shieldbearer/retreat`; actual group outcomes remain in phalanx tests | A3/A4 |
| Opening, thrust, throw/release, guarded recovery — `phalanxPoses.ts` | `shieldbearer/opening`, `spearman/thrust`, `spearman/throw`; opening uses four original roles and the rear attack clock | A4/A6 |
| Defense/release, mid-swing cancellation | Real F press/release in controls; `player/guard`, `player/interrupt` | A4/A6 |
| Cards, pipe/smoke, kick/pass, stowed equipment — `socialRendering.ts` | `shieldbearer/cards`, `shieldbearer/smoke`, `shieldbearer/hackysack`, original seeded four-member gatherings | A4 |
| Shrine/focus work, packing/unloading, carried crate | `player/shrine`, `goblin/focus`, `shieldbearer/packing`, `shieldbearer/unloading`, `shieldbearer/carry`; sample existing 6/20/20/8-second clocks without claiming job completion | A4 |
| Buckle/collapse/settled remains — `deathPose` | `goblin/death`, `skeleton/death`; existing suite adds impact squash | A4, P8/P9 |
| Reset boundaries | Controls: pause/menu/regeneration/camera/overlay. Existing animation/skeleton checks: blur/stop/teleport/death/regeneration. Production: real menus/seed changes | All; A7 final cutover |

The kobold tail remains a rigid body decoration until A5. Ambient quadrupeds and world animation
are outside the humanoid inventory.

## Metrics and observed defects

Snapshots read actual world matrices, local rotations/scales, movement/action/work/defense facts,
sole centres/corners and ankle-to-plant offsets. Current rigs lack semantic hands/grips: hands are
explicit **forearm-end proxies** 0.27 units down the forearm; shield-mount/shaft distances are
proximity estimates, not solved grip residuals. Hidden/stowed equipment is excluded. A1/A2 replace
these estimates with declared sockets.

Both bounded contact-policy and **uncapped drawn-remains** clearance are reported. The latter
intersects settled oriented boxes on the same support layer, so the 0.46 contact cap cannot hide
taller geometry. Interpret living/planted samples separately from swing/flight/death.
`anchorError` is instantaneous ankle-to-anchor displacement, not accumulated foot sliding.

Starting defects, not new acceptance tolerances:

- **Worst visual error: root-mounted/floating equipment.** Spear proximity reaches about **0.85**
  units during thrust and **1.22** during throw; shieldbearer guard/opening is about **0.34**.
  The carried crate stays behind the body while arms reach forward. A1/A2/A4 must establish grips;
  these existing defects do not block recording the baseline.
- Actual sole-corner clearance reaches approximately **−0.080** on stairs and **−0.227** at a corpse
  edge. Existing ankle/contact-policy tests still pass. These broader samples motivate final sole
  validation in A2/A3; do not weaken the older regressions.
- Plant error reaches about **0.070** in guarded advance. Lowering guard snaps directly between
  poses, and tails remain rigid. These are A3/A5/A6 work.

Review inspected eight side-view contact sheets, the overlay, and corrected stair/card captures.
Viewer playback was exercised at 1× then ¼× for movement, attacks, opening, social and carry.
This is sampled baseline review, not final motion-quality acceptance.

## Cost and initial budget

Chromium **159.0.8154.6**, SwiftShader, **800×600**, seed **MOURNING-731**, existing high-quality
scene. Workload: **25 original rigs**, four settled corpses, repeated melee/crossbow/thrust/javelin
clocks; 60 warmup + **240 measured** updates. Travelling poses use stationary actor anchors;
motor, AI, diagnostic snapshots and scene rendering are excluded from CPU timing.

| Measurement | A0 |
| --- | ---: |
| `animateActors` warm mean / p95 | **1.06 / 1.70 ms** |
| Maximum / mean terrain-map lookups per update | **42 / 42** |
| CDP sampled allocation estimate, including setup/warmup/yields/instrumentation | **166,704,188 bytes** |
| Meshes / transform nodes / materials / textures | **2,291 / 397 / 28 / 4**, unchanged during workload and across three regenerations |

Allocation sampling includes collected objects at a 32 KiB interval; it is not exact allocation
count, retained heap or leak evidence. This is a CPU comparison fixture, not a GPU/FPS benchmark.

Initial A1 budget: no retained scene-resource growth or additional contact queries for a neutral
binding bridge. For A2, investigate warm mean above **2.2 ms** or p95 above **3.4 ms** on this same
fixture/environment before expanding cost. These are comparison budgets, not portable CI timing
assertions. Retain the four-whole-body-pass ceiling and publish explicit per-actor/query ceilings
with the solver instead of nesting unbounded contact corrections.
