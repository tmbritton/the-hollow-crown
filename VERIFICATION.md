# Verification — The Hollow Crown

## Result

The playable exploration/combat demo uses a **typed ECS, XState 5.33.4, and strict TypeScript**, verified in Chromium and Firefox. Application code, all test scripts, and Vite configuration pass type checking. The production build also passes a separate smoke test. The state-machine/social update adds independent species charts, generated model-based coverage, and visible card games, hacky sack, and smoke breaks.

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

### Automated checks

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
