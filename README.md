# The Hollow Crown

A playable, entirely code-generated dark-fantasy voxel dungeon built with **Babylon.js, XState 5.33.4, strict TypeScript, and HTML canvas**. The art direction draws on Hades' elevated compositions, Darkest Dungeon's atmosphere, and Mike Mignola's angular silhouettes and graphic shadows.

## Run

Requires **Node.js 22.18+** (Node 24 LTS or newer recommended) and a desktop browser with WebGL2. Test scripts use Node's native TypeScript type stripping.

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. The development server prints its address if that port is occupied.

```sh
npm run build
npm run preview
```

The production build is in `dist/`; preview normally runs at **http://localhost:4173**. It can be deployed as a static website. Babylon.js is bundled locally; the game makes no CDN requests.

## Play

| Input | Action |
| --- | --- |
| Left-click the floor | Follow a safe path; approach the closest reachable point if blocked |
| Hold left mouse on the floor | Continuously steer toward the cursor |
| Click / hold an enemy | Pathfind into reach and repeatedly attack until it dies |
| Click a closed door | Approach and open it if unlocked |
| WASD / arrow keys | Move relative to the camera |
| Shift | Run |
| Space | Jump (one jump per press) |
| X | Cancel travel, pursuit, and attacks |
| E | Interact: doors, chests, altar, portraits, throne; begin shrine work, disable its hostile focus, or recover nearby loose tribute |
| E / Escape while inspecting | Return to the overhead view |
| Q / R | Rotate the overhead camera by 90° |
| Mouse wheel | Zoom |
| M | Toggle the explored-room map |
| Escape / pause button | Pause, read the within-run record, enter a seed, regenerate, or change quality |
| F2 | Babylon Inspector, development build only |

**Objective:** find and kindle the violet altar, pass through the newly unsealed throne-room gate, and claim the Hollow Crown. Water slows you down; lava damages you. Death returns you to the entrance, or to the altar after activation. Three optional reliquaries restore health and count toward the completion summary.

The route changes with the seed: explore the branching passages and watch the minimap for unexplored chambers. Activating the altar reveals the throne's crown marker. The minimap is north-up even when the camera rotates and automatically fits each generated layout.

### Optional contest: the Last Ember

Approaching the **entrance shrine** (within four units of its work face) or entering the
**smithy** activates the contest and announces its visible rival clock. The existing smithy
goblin must walk to the anvil's profaning focus, then complete **six 20-second work cycles**.
It defends itself against ordinary hostile species and the player, abandoning unfinished work
while fighting or moving. It returns after losing a threat and keeps working off-screen.

At the shrine, **E** starts repeated six-second restoration cycles; **X**, movement, targeting,
jumping or damage interrupts unfinished work. Completed seals remain. Reading the inscription
in the **entrance portrait** teaches the old rite: two seals per cycle instead of one. You can
also lure or kill the unique worker, or approach the anvil and press **E** to disable its focus.
The clock announces the plan, but reveals the worker's name only after its visible target caption.

- **Restore first:** restore six seals, thwart profanation and receive +30 health once.
- **Goblin first:** the shrine becomes corrupted and original restoration is permanently lost.
  Disable the focus, then perform one six-second cleansing at the shrine for +10 health once.
- **Same-step completion:** the ward fractures. Disable the focus, then perform one six-second
  repair for +15 health once. Neither exclusive victory is installed.
- Killing the worker or disabling the focus **after** profanation cannot rewrite that outcome.

Menus, portrait inspection and hidden tabs pause simulation. Focus loss, teleport and death
cancel unfinished hero work; respawn preserves committed seals, disabled equipment and outcomes.
Regeneration resets everything. These optional outcomes never replace the altar-before-throne goal.

### Independent rival: royal tribute

The shrine/smithy warning also announces **Carry away the royal tribute — 4**. Entering the
stairs or stable can activate this plan separately. The existing **three stairs kobolds** supply
one porter at a time; the other survivors retain their ordinary species behavior. Four gold-bound
crates occupy a reserved **stairs cache**, separate from the three core reliquaries. Each porter
must reach a crate, spend **20 uninterrupted seconds packing it**, carry it through ordinary
navigation, then spend **8 uninterrupted seconds unloading at the marked stable hatch**. Only
that delivery fills one clock segment. The clock remains in the scrolling agenda off-screen.

- **Intercept:** ordinary combat interrupts packing/unloading. Killing a carrier drops its
  undelivered crate at its feet. A surviving original pack member must travel to the drop and pack
  it again before carrying it. Goblin/kobold hostility is unchanged.
- **Recover:** press **E** within reach of a loose crate, including an uncollected cache crate.
  It is secured once for **+10 health**, even if a porter had claimed it but not finished pickup.
  Recovery is immediate; the hero does not acquire a carried inventory item. Delivered crates
  cannot be recovered by killing their former porter.
- **Outcome:** four deliveries complete the theft. If no original worker survives, or every
  remaining crate has been recovered, further deliveries are thwarted. Partial deliveries stay
  recorded; remaining undelivered crates can still be recovered after the plan is thwarted.

Restoring, corrupting or repairing the shrine does not stop tribute deliveries; tribute outcomes
do not resolve the shrine contest. Menus, inspection and hidden tabs pause both. Hero command
cleanup, teleport and checkpoint respawn preserve committed deliveries/recoveries and cargo;
regeneration replaces the whole run. Gold floor sockets identify the cache and a barred hatch
with violet lamps identifies the exit. Packing/unloading poses follow actual work time.

**Within-run record:** expand the record in the pause menu to reread visited room captions,
inspected portraits and identified inhabitants. Each source is recorded once, when its caption
is presented. Successful reliquary claims, altar kindling and claiming the crown also leave
entries. Discoveries survive death and checkpoint respawn; every regeneration starts a new
record, even when you enter the same seed. The new entrance caption is immediately learned again.
This record is held in memory for the current run.

Click movement routes around furniture, walls, and lava, and respects closed/locked doors. Reachable floor clicks retain their precise destination. For blocked or disconnected floor, the hero approaches the closest safely reachable point toward the request; the **gold ring marks that effective destination**. Holding the mouse keeps steering, but a settled or immobile hero stays still until the request or obstruction changes. Floor commands never open doors or bypass the altar gate. **Click a closed door** to approach and open it, or use **E** in reach. Enemy pursuit can open intervening unlocked doors automatically. A new floor click replaces the command; WASD/arrows immediately take control. Normal speed is **4.8 units/second**, or **7.4 while holding Shift**, with short acceleration/deceleration easing and a precise arrival brake. Water still slows you down.

The adventurer briefly loads against travel before pushing off, then braces, recoils and settles on stopping. Running blends into a **longer stride**, forward lean, bent-elbow arm pumps and opposing torso twist, with a short flight phase and compressed landings. Both gaits advance from measured travel and share a continuous phase. Local-axis squash/stretch preserves apparent volume; the cape follows through behind the action. Living actors block each other regardless of allegiance: enemies can be cornered, allies cannot stack, and click/AI routes go around occupied space when possible. **Corpses are passable at full speed** for the player and enemies. Feet lift and bend into procedural stair-like steps over settled bodies while walking or running, including moving attacks. Water still slows grounded travel to **52% speed**, including over corpses; overlapping bodies add no penalty. Pause, inspection, focus loss, and regeneration clear pending travel, momentum and deformed poses.

**Space jumps while preserving movement, a click route, or the selected enemy.** A two-frame preload leads into a constant-gravity arc, about 1.02 units high with 0.64 seconds of flight. You can steer and run in the air; holding Space produces one jump. Takeoff interrupts an unresolved attack while keeping its target, and pursuit/attacking resumes on landing. Airborne elevation is used by melee/projectile hit tests; water slowdown and lava contact damage resume when grounded. Jumping keeps the existing ground-navigation clearance for furniture, living actors, walls, doors and void edges. **X** cancels travel and combat; a jump already in flight still lands normally. Menus, inspection, focus loss, teleport and respawn reset flight safely.

Characters turn toward measured velocity and lean into acceleration, braking and turns. Articulated knees and two-bone leg solving keep stance feet near sampled ground heights, with short world-space foot plants released at reach limits or action changes. Running bounce follows cadence and gravity. Analytic damped springs absorb landing speed, ease cover crouches, and carry cape motion through interruptions. Sword interpolation carries velocity through contact instead of stopping at every intermediate pose. The overhead camera and ground ring follow the support plane through jumps.

Corpse contact samples the actual oriented voxel boxes after the death pose settles (0.62s).
The shared foot solver takes the highest nearby surface, adds swing-phase clearance, and rechecks
the final reachable foot after leg solving, including retained plants and running-flight poses.
The analytic leg inverse matches the rig's hip X/Z and knee X rotation order, with bounded reach
and stable lateral contact even at zero down-distance on stairs.
It uses a small visual pelvis rise for knee room. Corpse contact is capped at 0.46 units and pelvis
assistance at 0.14; overlapping bodies cannot accumulate height. These are render-only adjustments: floor
support, camera/rings, navigation, jump state and melee/projectile elevation remain unchanged.

### Enemies and combat

Each dungeon seeds **21 enemies** outside the entrance and altar rooms:

- **8 skeletons:** slow, lurching wanderers at **1.65 units/second**. They pursue nearby living characters, including goblins and kobolds, but ignore other skeletons. They cannot operate doors.
- **4 goblins:** take smoke breaks when unaware of threats. In combat, these ranged skirmishers retreat, break line of sight using cover, crouch while hiding, and peek out to fire crossbow bolts. They flee at **5.2 units/second**, slightly faster than your walk; hold **Shift** to close the gap at 7.4. Bolts travel through the world and can be dodged or stopped by walls, furniture, and doors.
- **9 kobolds in three packs:** gather for seeded card games, hacky sack, or smoke breaks. They put away weapons, face their gathering, and use activity-specific poses and procedural props. Detected threats interrupt activities; packs share alerts, regroup, and approach distinct front/side/rear positions around their target. Survivors return to their gathering after losing the threat; a lone survivor takes a smoke break. Pack members have staggered attack cooldowns.

Card mats, dealt cards and stakes remain after a game is interrupted. Hacky-sack passes synchronize with kicks; smoking uses pipes, embers, and a bounded thin-instance puff pool. Gathering positions are validated against the same floor and prop clearance as movement.

Skeletons load the left leg through a longer forward/sideways sag, then take a shorter, quicker
catch-up step. The ribs twist and the skull trails their recovery. This procedural lurch follows
measured travel: blocked movement cannot keep cycling it, and stopping fades it back to neutral.
Its **64/36 stance split** drives both leg timing and shared foot grounding, including ramps and
corpse steps. Upper-body attack blends take priority over the lurch, keeping wind-up and impact
readable while the legs continue. Speed, collision, support, jump and damage timing remain
authoritative. Stop/teleport, rig reset, settled death and regeneration clear the added pose;
visible-window blur retains the existing policy of clearing hero input while enemies keep acting.

Each keep names a **profile-linked existing inhabitant**: an Ashen Foundry skeleton watchkeeper,
a Drowned Court goblin lookout, or a Pilgrim Redoubt kobold card dealer. A simplified gathering
uses the truthful “Token Keeper” title instead. A crown clasp, mourning band or royal tokens
identify the character. Selecting it nearby with a clear view shows its name, home, usual behavior and a link to the
keep's founding house. Its health, hostility and species tactics follow the ordinary rules;
the identity stays with it through pursuit, return and death.

The Last Ember also names the existing smithy goblin as its ward-breaker. In Drowned Court keeps
this is the same named lookout; other profiles have a second named character. No enemies are
added, replaced or given different health/hostility rules.

The record distinguishes witnessing the named inhabitant's death from later finding its remains.
Observation requires an enabled character within eight units, an unobstructed player sightline,
and a rendered body surface visible from the camera during active play. Pillars, furnishings
and current wall cutaways can hide a character even when the player has a clear sightline.
An unseen killer stays unknown; an
inhabitant whose caption you never read is described only by species. Later discoveries never
rewrite an earlier uncertain account. Routine unnamed deaths are not journal entries.

Clicking an enemy locks onto it: the player follows its changing position and swings on entering melee reach, **continuing the chase through wind-up, the strike, and recovery**. Walk/run strides continue beneath the upper-body sword animation, and close pursuit continually updates its approach to a moving target. The player stops beside a stationary target rather than running into it. Holding the button keeps that target even as the enemy and camera move; releasing retains the command. Click another enemy to retarget, or click the floor / press WASD or X to cancel. A red ground ring and health display identify the target.

Damage occurs at the strike's impact, with range and cover checked again. Living characters emit red blood fragments; skeletons emit pale bone dust. Dead enemies collapse into persistent, non-blocking corpses until regeneration. Death returns the player to the checkpoint with 2.5 seconds of protection. Chests and the altar still restore health.

Sword wind-up, contact and follow-through are sampled against that same impact clock. Crossbows have a separate aim/recoil/settle motion. Deaths buckle before falling, compress on contact and rebound briefly into their final corpse pose. Card gestures, pipe puffs and hacky-sack kicks also have preparation and follow-through; the receiver prepares before a pass arrives. These render-only curves keep controls, collision and damage timing authoritative.

## What is procedural?

- A grown, irregular thirteen-room graph: different room positions, role assignments, branches, loops, corridor offsets, and elevation connections for each seed.
- Rectangular, chamfered, and cross-shaped rooms with varied dimensions and pool/bridge configurations.
- Randomly placed and rotated altar, throne, reliquaries, pillars, shrine, supplies, and other props. Reliquaries move between rooms as well as within them.
- Directional furnishings—including thrones, ovens, furnaces, shrines, racks, and stalls—face toward the room center. Placement reserves reachable space in front and retries positions that cannot fit an inward orientation.
- Floors, masonry, pillars, door frames, stairs, bridges, throne, altar, sarcophagi, chests, barrels, crates, bones, and character geometry.
- Stone variation, tile seams, wood grain, graphic lighting bands, water ripples/foam, animated lava fissures, fire, embers, and altar runes.
- Shared walk/run/start/stop/jump/attack/death animation, enemy models, blood and dust particles, crossbow bolts, door hinges, chest lids, floating votives, and flickering lights.
- Four themed workspaces: a butchery, blacksmith, bakery, and underground lizard stable. Furnishings include hanging cuts, cleavers, furnaces, anvils, bread ovens, loaves, flour sacks, feed troughs, tack, and two animated saddled lizards.
- Forge and bakery recipes coordinate a furnace/anvil or oven/preparation-table pair, with optional tool, cooling, bread and flour sockets. Work paths connect their inward-facing approaches to the room center before background furnishings are placed; cramped arrangements retry bounded alternatives and omit optional supports.
- Three keep-history profiles—**Ashen Foundry, Drowned Court, and Pilgrim Redoubt**—with a shared house and three successive monarchs. Entrance, crypt, altar, and throne captions refer to the same history; the altar still gives direct gate-unlocking instructions.
- Framed 32 × 40 pixel-art royal portraits depict those linked monarchs, sharing the house palette and each subject's core appearance while varying the painting composition. **E** moves the camera to an eye-level close-up with a factual name/date/history caption and switches the artwork to **128 × 160** detail. Movement pauses during inspection; **E**, **Escape**, or the return button restores the overhead view.

There are **no imported models, image textures, sprites, animation clips, fonts, or environment maps**. Shadows and glow use runtime-generated render targets. UI uses system fonts, CSS, text symbols, and a second canvas for the map.

The generator builds a connected spatial graph, assigns room roles, reserves passage clearance, and places gameplay objects before decoration. Navigation validation includes prop footprints and interaction approaches; the throne is a gated leaf, preventing an accidental bypass. Invalid candidates are retried deterministically.

Ordinary page loads and every browser refresh generate a fresh random seed. Random runs leave the URL unpinned. Opening an explicit link such as `/?seed=MOURNING-731`, or entering a seed in the pause menu, reproduces that world; refreshing it starts a new random run. To share the current world, use the seed displayed in the HUD/menu in a `?seed=` link. The revised generator changes what earlier-version seeds produce.

## Implementation

| File | Responsibility |
| --- | --- |
| `src/worldTypes.ts` | Rooms, tiles, connections, props, and discriminated entity types |
| `src/world.ts` | Deterministic generation, tile heights, room graph, progression validation |
| `src/generation/` | Version identity, semantic RNG streams, keep history/presentation, scene recipes and shared placement geometry, diagnostic reports and corpus selection |
| `src/ecs.ts` | Typed component registry, entity lifecycle and indexed component queries |
| `src/worldEntities.ts` | Generated world registration and shared door animation/collision system |
| `src/actors.ts` | Actor composition and shared movement, stopping, teleport and intent handling |
| `src/actorRendering.ts` | Shared ellipsoid collision adapter and locomotion/attack/death rig animation |
| `src/combat.ts` | Seeded encounters, enemy decisions, pursuit, attack timing, health/death, projectiles and particle simulation |
| `src/machines/` | Typed XState charts organized into `monsters/`, `actors/`, `navigation/`, `world/`, and `ui/` |
| `src/social.ts` / `src/socialRendering.ts` | Seeded social gatherings, activity coordination, and procedural cards, hacky sacks, pipes and smoke |
| `src/enemyRendering.ts` | Procedural enemy rigs, selection, health bars and pooled effect rendering |
| `src/geometry.ts` | Exposed-face box batching, mesh parts, thin instances |
| `src/buildDungeon.ts` / `src/renderTypes.ts` | Procedural architecture/props, collision proxies, typed lights and animations |
| `src/themedProps.ts` | Workshop furnishings, ovens, stable fixtures, and animated lizard steeds |
| `src/royalty.ts` / `src/portraits.ts` | Seeded royal identities, pixel-art shader, and wall-mounted frames |
| `src/inspection.ts` | Typed inspection targets, camera transitions, framing, lifecycle, and camera restoration |
| `src/discoveries.ts` | Pure within-run knowledge record, explicit source disclosures, observed events and detached read snapshots |
| `src/objectives.ts` | Pure run-owned objective clocks, fresh work-condition batches, deduplicated contributions and atomic exclusive races (O1) |
| `src/objectiveWork.ts` | ECS work assignments/sites, simulation-only action cycles and post-combat commit validation (O2) |
| `src/lastEmber.ts` / `src/lastEmberRendering.ts` | Composable Last Ember plan, authoritative interactions/outcome effects, knowledge-filtered clocks and procedural seals (O3) |
| `src/tribute.ts` / `src/cargo.ts` / `src/tributeRendering.ts` | Independent four-delivery plan, bounded porter selection, ECS cargo lifecycle/recovery and procedural cargo/hatch (O4) |
| `src/observation.ts` | Bounded camera-to-rendered-surface visibility checks for target captions, deaths, killers and remains |
| `src/materials.ts` | Typed material palette and GLSL liquid/fire/magic effects |
| `src/navigation.ts` | Height-aware floor picking, exact/partial tile routing, swept-clearance smoothing, and dynamic door/body checks |
| `src/occupancy.ts` | Swept living-body collision, sliding and live route occupancy |
| `src/corpseTerrain.ts` / `src/corpseRendering.ts` | Pure oriented-box surface/stride sampling and the shared render-only fallen-body adapter |
| `src/locomotion.ts` | Movement speeds, acceleration/deceleration, and procedural start/travel/stop animation |
| `src/skeletonGait.ts` | Stateless distance-sampled skeleton lurch and shared stance/swing phase mapping |
| `src/jump.ts` | Frame-rate-independent jump trajectory, preload, airborne elevation and landing impacts |
| `src/footPlacement.ts` | Bounded stance anchors, floor sampling and two-bone leg solving |
| `src/animationCurves.ts` / `src/actionPoses.ts` | Smooth/velocity-continuous curves, analytic springs, volume-preserving deformation, jump/attack/death/social poses |
| `src/player.ts` | Voxel adventurer, camera-relative input adapter, and destination marker |
| `src/main.ts` / `src/gameTypes.ts` | Engine, fixed-step updates, interactions, progression, and game/debug contracts |
| `src/engine.ts` | Babylon engine with a typed effect-cache diagnostic |
| `src/ui.ts` / `src/dom.ts` / `src/style.css` | HUD, minimap, typed DOM access, menus, responsive layout |

### Type checking, formatting, and linting

`tsconfig.json` enables `strict`, unused-code checks, and `verbatimModuleSyntax` for all application code, tests, and `vite.config.ts`. Type-only imports keep domain contracts out of runtime bundles. Entity types narrow on `entity.type`; for example, only doors have a lock and only portraits have royal identity data. Rendering references are optional until scene construction, with explicit checks where required.

`InspectionController` stores an active session containing its target and saved camera pose, so idle state cannot accidentally use an absent target. DOM helpers verify element types before accessing canvas, input, and dialog APIs.

```sh
npm run typecheck
npm run format
npm run format:check
npm run lint
npm run lint:fix
```

Oxfmt formats source/test TypeScript, Vite and TypeScript configuration, and the Oxfmt/Oxlint
JSON configs. `.oxfmtrc.json` preserves single quotes and a 100-column print width. Oxlint
checks source, tests, and Vite configuration using correctness rules; warnings fail the lint
command. `.oxlintrc.json` enables browser globals and Node globals for tests and Vite config.
`npm run lint:fix` applies safe automatic fixes; review them and run formatting afterward.

Both `npm test` and `npm run build` run the type checker. Vite handles browser transpilation; Node executes test `.ts` files directly, without injecting helpers into Playwright's serialized browser callbacks. `erasableSyntaxOnly` enforces that compatibility. Dependency declarations are skipped with `skipLibCheck`; project code and tests are fully checked.

### Pre-commit checks

`npm install` and `npm ci` install the pre-commit hook through the `prepare` script and
`simple-git-hooks`. Its configuration is version-controlled in `package.json`.

Every commit runs `npm run check`, which executes these checks in order across the working tree:

1. `npm test` — strict type checking and all pure/model tests.
2. `npm run lint` — Oxlint, with warnings treated as failures.
3. `npm run format:check` — Oxfmt formatting validation.

A failed check stops the hook and blocks the commit. To fix formatting, run `npm run format`
and stage the corrected files. Run `npm run check` manually for the same checks, or
`npm run prepare` to reinstall the hook after changing its configuration.

### Entity/component architecture

`game.ecs` is the runtime registry. Player, enemies, doors, interactables, props, obstacles, rooms, tiles, render batches, projectiles, and hit particles have entity IDs and attachable components. Generated world data is registered **by reference**, preserving the existing pure generation/validation pipeline and preventing duplicate door or interaction state. A batched mesh can render many logical floor/prop entities efficiently.

The `run` entity owns a `discoveries` component, independent of actor health and generated world
truth. Replacing the ECS replaces knowledge; respawning the player does not. UI code holds the
same component reference and presents only its detached snapshot in the record panel.

Scenario installation attaches `objectives`, `objectiveWork`, `lastEmber` and `tribute` to the `run` entity.
Actor `work` components own assignments/action charts. The actual shrine/anvil prop entities own
their `workSite` components; the anvil's `focus` chart exposes irreversible disabling through the
site's enabled accessor. The runtime advances work around movement/combat and consumes newly emitted
outcomes after hazards, before respawn. Every ordinary world installs the composed plan once.

Components describe transform, health, actor capabilities, movement, navigation, attack state, AI, interaction intent, corpse state, collision adapters, render rigs, and effects. Indexed queries visit only entities with the requested components; adding/removing components updates those indexes immediately. `Actor` is a checked view over these components, not an inheritance hierarchy or another copy of state.

```ts
import { Health } from './src/machines/actors/health.ts';

const entity = game.ecs.create('breakable-urn')
  .add('transform', { x: 3, z: 2, h: 0, heading: 0 })
  .add('health', new Health(20));

for (const candidate of game.ecs.query('transform', 'health')) {
  const health = candidate.require('health');
  // A system can now operate on every matching entity.
}
entity.remove('health');
game.ecs.remove(entity.id);
```

`createActor` composes the standard character components. Player input and AI supply intents to the same movement/pathfinding/door and combat systems. Babylon collision and visual rigs are separate adapters. A door-opening capability distinguishes clever actors from skeletons; locked gates block everyone. New component types belong in the `Components` interface, with systems querying the combinations they require.

The fixed-step order is door state → objective prework → player intent/pursuit and movement → enemy decisions/movement and shared attacks → projectiles/particles → terrain damage → objective commit validation → player respawn → shared rig animation. Menus, inspection and hidden tabs suspend simulation. Blood/dust are capped at 192 live particle entities and bolts at 32; fixed thin-instance pools render them without allocating new meshes per hit. Corpse entities retain their original meshes.

### Floor-navigation contracts (P3; complete, independently reviewed READY)

`Navigator.goTo(from, requested)` keeps the existing exact-goal contract for AI, pursuit and
objective work. Only floor input opts into `{ partial: true }`; `destination` and `path` then
describe the effective endpoint, which also drives the ordinary arrival brake and gold ring.
An unreachable request searches the finite reachable tile component, then refines its nearest
safe frontier within 1.5 units of reached anchors. Every graph edge, refined connection and
smoothed segment checks terrain/support, furniture, doors and living occupancy. A fallback must
improve target distance by at least 0.025 units; genuinely immobile cases install no travel.
Endpoints within 0.001 units of the best target distance prefer the shorter graph-travel estimate
from the current position. Local refinement then aligns the chosen approach precisely.

`followFloor(from, requested, now)` reuses unchanged held commands, including arrival and failure.
Small cursor drift and changed-obstruction retries are limited to one per 500 ms; immediate
steering probes still prevent entry into newly blocked space. Checked graph connections are reusable
while door locks/open/collider state and live occupied cells/swept directed edges agree. After travel,
route parents and costs are rebuilt from current starting connections, without returning through an
old search origin. Distant sub-cell body movement can preserve those graph decisions; exact geometry
near the route or any potentially better frontier still invalidates held commands. Start connections,
refinement, smoothing and physical movement always check current body geometry. Changes to graph
occupancy anywhere remain conservative invalidations; cold searches are still synchronous.
Physical stuck cancellation remembers the actual stop; explicit cancellation clears input/search
caches. Static terrain caches belong to one generated world. The existing navigation chart owns
travel state; successful arrival uses its existing `ARRIVE` event.

### Declarative state machines

All state-machine definitions live under `src/machines/`:

- `monsters/skeleton.ts`, `monsters/goblin.ts`, `monsters/kobold.ts`: independent species machines. Shared perception contracts and the factory live alongside them. Species charts select named effects; combat systems carry out pathfinding, pursuit, fleeing and attacks.
- `actors/`: attack wind-up/impact/recovery/death, mutually exclusive pursuit/door commands, health/protection/death, locomotion phases, and interruptible objective work cycles.
- `navigation/`: route following, waiting for an opening door, arrival and blocked/stuck cancellation.
- `world/`: door locks/opening/closing, one-way chest claiming, altar-to-crown progression, and objective terminal lifecycles.
- `ui/`: loading/play/menu/inspection/victory, independent tab visibility and map visibility, inspection-camera transitions, held-pointer modes, transient feedback, and asynchronous Inspector requests.

`Statechart` uses XState's `initialTransition` and `transition` APIs. Simulation sends explicit tick events; no wall-clock timers, background actors, or subscriptions run gameplay. Snapshot-backed accessors expose familiar `health.current`, `attack.target`, door flags, and inspection state without maintaining competing flags. Rendering interpolations, collision/path searches, and numerical geometry remain ordinary functions. UI-only fading accepts an explicit presentation timestamp.

World blueprints remain deterministic plain data. Runtime door/chest views bind to their charts by reference. Replacing a world discards its snapshots; there are no machine timers to stop. Inspector request generations reject stale asynchronous imports after cancellation or regeneration.

### Model-based testing

```sh
npm run test:models
```

The latest XState includes model-testing tools in **`xstate/graph`**. `tests/models/` generates paths to every modeled state and extends each path with every candidate event, including ignored/invalid attempts and self-loops. Inspector microstep data measures every declared transition branch, including guards and eventless transitions. Invariants are checked after each stable step, and the pure simulation adapter is compared against a live XState actor.

The suite currently covers **20 machines, 92 declared atomic states, and 175 transition branches**. Adding an exported machine, unreachable state, or uncovered branch fails the suite. Negative fixtures verify that the coverage checks really fail. Timers and other continuous values use documented finite partitions; deterministic bounded walks exercise longer cycles rather than claiming exhaustive enumeration of infinitely many paths. The report is written to `test-results/machine-model-report.json`.

### Rendering choices

- Lit surfaces use Babylon `CustomMaterial`, extending standard lighting with shader-generated patterns and banding. This keeps shadow reception and thin instances working together without duplicating Babylon's lighting system.
- Liquids, flame, and altar circles use custom GLSL `ShaderMaterial` effects.
- Static geometry is grouped by material and spatial chunk; rubble and pooled embers use thin instances.
- Three nearby point lights are reused, alongside hemisphere fill and a directional shadow light. Shadow casters are restricted to the player's vicinity.
- High quality uses a 2048px shadow map with high-quality percentage-closer filtering and up to 4× MSAA. Pixel-aware shader transitions and a final FXAA pass smooth lighting and effect edges while preserving the banded look; HUD text is outside the post-processing pass.
- Every character part remains in the high-quality shadow caster list and receives shadows. Side-oriented key lighting makes the cast shadow visible from the default camera, and lit character materials respond to nearby colored lights.
- Camera-facing upper wall sections retract geometrically. Their shadows follow the same geometry, while invisible collision walls remain intact.
- The ellipsoid controller uses `moveWithCollisions` with explicit world-matrix refreshes between fixed steps. Smooth sampled support heights cover the visible stair steps.
- Regeneration disposes the scene and render targets, releases cached GPU effects, and removes generated custom shader source entries.
- Low quality lowers render resolution and disables shadows/glow.

### Reusing inspection mode

Any interactable entity can expose an `inspection` descriptor; the main interaction system delegates to it without checking for portraits:

```ts
import type { InspectionTarget } from './src/inspection.ts';

entity.inspection = {
  id: entity.id,
  title: 'An engraved tablet',
  subtitle: 'A closer look',
  description: 'An inscription worn smooth by the years.',
  getView: () => ({
    focus: worldSpaceCenter,       // Babylon Vector3
    direction: towardViewer,       // Babylon Vector3, from the object toward the viewer
    distance: 2.35,
    width: 2.15, height: 2.8,       // bounds used for responsive framing
  }),
  onEnter: () => enableDetail(),
  onExit: () => restoreDetail(),
} satisfies InspectionTarget;
```

`InspectionController` handles entering, viewing, leaving, resize-aware framing, early cancellation, and cleanup. Target callbacks manage object-specific presentation; application callbacks manage the caption and player visibility. Portraits update a per-mesh detail attribute on the shared shader rather than creating a new texture or material.

An optional `InspectionTarget.discovery: DiscoveryEvidence` describes the exact information
delivered by that caption. `UI.openInspection` commits it when the dialog opens, including an
inspection cancelled during camera entry; merely building the descriptor or showing an E prompt
does not teach anything. `portraitDiscovery`, `landmarkDiscovery` and `inhabitantDiscovery`
construct plain evidence from seeded presentation metadata. Fact links include only what the
caption actually communicates, rather than all facts associated with a monarch or location.

### Knowledge and objective consumers

`DiscoveryRecord` exposes `present(evidence, at)`, `recordEvent(event, at)`, `knows(factId)`,
`hasDiscovery(id)`, `hasEvent(kind, subjectId)`, and `snapshot()`. Mutation methods return whether
an entry was newly recorded. Callers own the simulation timestamp and the presentation/observation
checks; the domain module never looks up world truth or infers related facts. Entries retain a
shared monotonic `order` across discoveries and events, including observations in the same step.
Repeated sources cannot change their first text, timestamp, fact grant, or uncertainty.

Portrait discovery IDs use seeded placement, landmarks use room roles, and the standout uses
its semantic inhabitant ID. Event IDs combine kind and subject. Snapshots contain detached
`identity` (seed and generator/content versions), `discoveries`, `events`, and learned `factIds`.
Seed/version identity describes the initial world, **not a unique run instance**: always resolve
the current ECS component after regeneration. Objective availability and world completion must
remain separate from `knows`/`hasDiscovery`. The discovery record owns neither objective clocks
nor persistence.

The combat system's optional `onDeath(victim, source)` callback fires synchronously only after
an accepted lethal hit creates a corpse. The runtime filters that event by observation before
recording it; corpse scans can record only `remains-found`, never reconstruct a kill or killer.

`CameraObservation` is the render adapter for that observation boundary. It tests at most three
actual surfaces from the rig's largest parts. Frozen scenery has a per-world spatial index;
finite-segment bounds, conservative rig envelopes and per-instance bounds reject candidates
before triangle picking. Only changed, relevant transforms are synchronized, parent first,
without recursively forcing ancestors. Camera changes, cutaways, doors, reparenting and scene
membership changes remain current even between renders. Invisible collision/selection proxies
are excluded. Broad-phase data is cached, but visibility outcomes are not. Already-recorded
remains skip visibility work.

The authored rigs use a four-unit root-local envelope (`ACTOR_OBSERVATION_RADIUS`), checked
against the shared animation pose captures and consecutive skeleton gait/attack sequences.
Ambient creatures provide their own authored envelope,
also checked by that suite. Envelopes only reject candidates; actual rendered triangles
still decide occlusion. New rig geometry/poses must fit that envelope or expand it. Dynamic effect
writers use `updateInstanceMatrices` with their uploaded CPU array to refresh active pool bounds
once per update; empty zero-scale pools skip bounds work. Observation queries never rebuild
instance bounds. This remains conservative geometry sampling: a tiny exposed limb or a gap in a
shader-discarded surface may not suffice to grant knowledge.

Gameplay key handlers cancel native letter-key text actions, including repeats, while leaving text fields and browser shortcuts available.

### Objective domain foundation (O1)

`new ObjectiveRecord(plan)` creates a pure run record. `get(id)` and `snapshot()` return detached
plain data; `resolveStep(batch)` returns detached contribution receipts and **only newly emitted
outcomes**. O1 is complete and independently reviewed. O2 supplies physical work and runtime
boundaries below; O3 authors the first playable Last Ember scenario and clock presentation.
Existing altar-to-throne gameplay still uses its own chart.

Both input boundaries project only declared fields into detached contracts before validation or
mutation, including nested owners, outcomes and participants. Structurally richer objects may carry
adapter metadata/callbacks; these are ignored. Optional condition/participant reasons must be nonempty
when supplied. Rejected batches preserve the entire record and permit a corrected same-step retry.

- Definitions separate an owner (`player`, `actor` or `group`) from an explicit actor-ID roster.
  Fresh `ObjectiveConditions` separately describe prerequisites (`available`) and each participant's
  dynamic `eligible` / `working`, `interrupted`, `blocked` or `idle` status. Conditions are samples,
  not copies of health, navigation or resource state.
- `discover` and `activate` are separate, monotonic grants. Visibility is discovery **or** an authored
  activation announcement. Exclusive monster rivals must announce on activation, even if unavailable;
  announcement does not grant discovery, player eligibility or any journal facts.
- Gather one `ObjectiveStep` after authoritative world/combat changes, using a strictly increasing
  integer simulation-step index. Supply fresh conditions for unresolved objectives on each call;
  omitted conditions fail closed. Repeated/decreasing steps throw, preventing accidental split-batch
  winners. Pausing means not advancing/calling the resolver.
- Supply completed work-action candidates in `contributions`. Only active, unresolved, available
  objectives with an eligible working participant accept credit. Action IDs are run-wide: identical
  duplicates credit once; conflicting payloads within a batch all reject; later replays never change
  the first result. Rejected/interrupted IDs are also retired. A new work cycle needs a new ID.
- `disruptions` permanently thwart explicit objectives; `invalidatedDependencies` permanently
  invalidate only definitions listing that essential dependency. These take precedence over current
  candidates. Prior committed progress and terminal outcomes persist. Temporary denial belongs in
  conditions, allowing progress-preserving resumption or a declared roster survivor's takeover.
- Exclusive `races` pair two objectives and author `playerFirst`, `monsterFirst` and `contested`
  outcome IDs. All valid contributions land before race evaluation. Player-first completes restoration
  and thwarts its rival; monster-first completes the rival and loses the player opportunity; a tie
  marks both contested and emits one outcome. Terminal records cannot change. Unpaired clocks complete
  independently, and a previously thwarted rival retains its original outcome when the survivor wins.
- Snapshots expose lifecycle `status`, derived `workStatus` and known reasons independently from
  availability/visibility. Terminal conditions retain their last sample. These are domain read models;
  future UI must apply its knowledge boundary before presenting reasons or actor details.

The boundary is deliberately small: explicit race pairs and essential-dependency references.
Outcome-triggered availability is supplied through subsequent authoritative conditions; there is no
general relationship-rule evaluator. O2 owns physical work, interruption/cancellation and assignment
validation; O3 consumes authored outcome IDs for once-only world changes and recovery opportunities.
Resolve the current ECS record after regeneration, preserve it across respawn, and clear unfinished
hero work in the work adapter.

`OBJECTIVE_LIMITS` bounds a plan to 32 objectives, 32 roster participants and 32 dependencies per
objective, and integer capacities/contributions to 1–64. A batch accepts at most 256 candidates and
a record remembers at most 4,096 distinct submitted action IDs, including rejections. Overflow and
invalid references/duplicate definitions reject before mutation; duplicate replays remain legal at
the history limit. Same-step overfill is allocated by action ID, saturates at capacity, and records
actual credited segments. Objective, race and global outcome IDs are validated; an objective may
belong to only one exclusive pair.

The objective lifecycle model partitions progress into empty/partial/full at capacity two, with
negative, zero, fractional, nonfinite, exact, overfill and over-limit credit events and all four
terminal results. Domain tests cover batch permutations, isolation, deduplication and limits beyond
that finite machine partition.

### Physical objective work (O2; `d698f27`, complete and independently reviewed)

`installObjectiveWork(ecs, world, plan, bindings)` installs a fresh O1 record and work system on
the existing `run`. Each binding supplies `objectiveId`, an ECS `siteId`, a positive `duration`
in simulation seconds, and optional integer `amount` (default one). Each objective needs one binding.
Attach `workSite: { approach: { x, z, h }, radius, enabled }` to the actual site entity; the radius
must be in `(0, 2]`. Its approach is supported, navigable floor in front of the object. Installing
a new plan replaces progress; use installation once per run, rather than as an assignment reset.
Timing uses compensated **60 Hz work units**: a normal `1/60` step contributes exactly one unit,
and snapshots expose seconds as `units / 60`. Both ticks and authored durations convert relative
to the nearest simulation boundary while retaining their signed fractional remainder. This avoids
decimal multiplication drift without an early-completion epsilon. Duration scaling must stay finite;
overfill is clipped before conversion. Interruption, cancellation and settlement reset the carry.

- `activate(...ids)` / `discover(...ids)` queue separate grants for the next commit. Activation
  announcements retain O1's visibility contract and do not teach journal facts. No camera/render
  visibility check gates work: eligible off-screen actors keep working during active simulation.
- `assign(actor, objectiveId)` accepts only a living current ECS instance in the declared roster,
  with at most one assignment. It returns false rather than replacing an assignment. O3 selects
  jobs and drives ordinary navigation/species priorities; assignment itself neither teleports nor
  suppresses AI. `cancelWork(actor)` in `actors.ts` retires the unfinished cycle and detaches it.
- The optional side-effect-free `availability()` samples authoritative prerequisites and returns
  `{ available, reason?, revision? }`. Include the actual resource/method identity or version in
  `revision` whenever it can change during a cycle. Temporary denial cancels partial work while
  preserving committed progress. Health remains solely in the existing health component.
- O1 essential dependency IDs resolve through the ECS. Removal, death/corpse, or a disabled
  dependency `workSite` permanently thwarts its dependent objectives. Losing every declared
  non-player executor also thwarts that plan. Survivors must be assigned and physically present;
  player death instead preserves the objective for checkpoint recovery.
- `advance(step, dt)` runs **before movement/combat**. Only active, available, living, grounded,
  stationary and unengaged workers accrue time. Support height, work-face distance, props, living
  bodies, actual door collision and clear access are checked through shared world/navigation APIs.
  Both the actor and its approach must be occupiable; looking through a closed door is insufficient.
- `commit(step)` runs **after combat/projectiles and terrain damage, before respawn/rendering**.
  It revalidates every partial/ready cycle against current facts, exact actor/site/dependency
  instances, position, resource revision and cycle identity. Attack, accepted damage and jump
  hooks also invalidate transient interruptions. All surviving completed actions enter one O1
  batch, so a same-step kill cannot credit work or manufacture a tie. Earlier commits remain.
- Cycle IDs are run-wide and allocated afresh after interruption; their internal pending records
  bind actual ECS instances, never just actor IDs. There is no completion-callback API. Duplicate
  advance/commit calls and stale systems reject. `commit` returns O1 receipts/new outcomes for
  O3's once-only world effects. Do not also submit raw batches to that installed record.
- `actor.entity.get('work')?.snapshot()` returns detached assignment/status/cycle/elapsed/duration
  data. Objective snapshots are the last committed world sample; work snapshots reflect immediate
  cancellation. UI must still apply O1's visibility and D1's evidence boundaries to details/reasons.
- Keyboard/floor/target commands and X cancel hero work. Menu, inspection and focus-loss cleanup
  also cancel it; teleport and death use the shared stop path. Menu/inspection/hidden-tab pauses
  freeze enemy cycles without catch-up. Visible-window blur follows the existing policy: hero
  commands clear, but enemy simulation continues. `retire()` cancels every assignment and detaches
  the system before regeneration, rejecting retained old-run callbacks.

O3 extends availability samples with optional integer `amount` (1–64): learned methods can change
credit without replacing a clock or reinstalling the plan. Amount and revision are both sampled at
advance/commit; a change invalidates the partial cycle. `job(actor)` returns an active, available
assignment's real approach and optional `workSite.facing`. Species perception runs first; only an
unengaged actor services the job instead of its ordinary idle activity. Threats keep normal tactics.

### Composed Last Ember and tribute plans

O3 is complete at **`9be81bb`**. O4 is implemented and independently reviewed READY.
`prepareLastEmber(ecs,
world, player)` attaches the scenario and sites and returns `{ scenario, plan, bindings }` without
installing O1/O2. `prepareTribute(ecs, world, player)` similarly attaches cargo/sites and returns
`{ scenario, plan, bindings }`. `main.ts` concatenates both fragments before **one installation**,
with one `advance` and one post-hazard `commit` per fixed step. Last Ember consumes only its own
new outcomes. Tribute's terminal result is derived from O1, with cargo transfers committed inside
O2; neither scenario calls `ObjectiveRecord.resolveStep` separately.

O4 extends bindings with a side-effect-free `task(actorEntity): WorkTask | null` selector.
`WorkTask` supplies `siteId`, `duration` and optional `cargo: { id, operation: 'pickup' | 'deliver' }`.
Without a selector, the existing static binding is the task. O2 validates the exact resource/entity,
owner, lifecycle revision, phase, site and duration at both boundaries. Cargo work requires amount
one. Pickup settles a real action with **zero clock credit**; delivery changes cargo to terminal
`delivered` only alongside its accepted one-segment receipt. `availability().thwarted` supplies a
permanent resource-exhaustion reason in that same O1 batch, taking precedence over unfinished work.

Each cargo ECS entity owns its `Cargo` lifecycle (`loose → claimed → carried → delivered`, plus
`recovered` and nonterminal drops), transform and pickup work site. Claims bind original executor
instances, not just IDs. `synchronizeCargo` runs at both O2 boundaries, follows the supported carrier
position and releases cargo after death/removal. `Tribute.update()` selects one bounded porter;
`nearby()` / `recover()` implement the actual player-access checks. `clock`, `recovered` and `agenda()`
are read views; the agenda announces group/route/progress without inventing hidden names or causes.

`planTribute` selects at most 81 candidates per room from the already-reserved central floor network,
then stores plain sites in `world.tribute`; `tributeBlueprint` returns a detached copy. Final generation
validates every pre-altar pickup/intervention and delivery route. Initial enemies/gatherings avoid those
faces. Identity is now `layout-v3 / keep-v4 / last-ember-v1+tribute-v1`, preserving layout/art RNG streams.
The 100 new tribute seeds retain 21 enemies and three reliquaries. Longest shrine/cache tile route is
126 steps: about 26s walking, plus 36s ordinary restoration, versus at least 112s porter work **plus
physical travel**. This geometric response budget excludes combat and dynamic obstruction delays.

`lastEmberPlan` authors restoration/profanation plus separate one-segment cleansing/repair clocks.
Follow-up availability reads the original terminal outcome and the actual focus component. Original
race outcomes never reset. `LastEmber.state` derives from O1 charts; its effect ledger only prevents
duplicate rewards. `startHero`, `disableFocus` and `nearby` check actual player approach/access.
`agenda(workerObserved)` filters owner names and reasons through D1 knowledge/observation; strategic
clock announcements do not create journal discoveries. Shrine captions are learned through E or the
hero's successful work, while the rite is learned only when its inspection caption opens.

`src/generation/lastEmber.ts` reuses the entrance shrine's reserved work face, the forge recipe's
anvil approach and an entrance portrait. Validation checks all three before the altar with ordinary
navigation and rejects interactions that could steal E from another authored approach. Missing or
invalid sites use the existing bounded 40-attempt generator. `last-ember-v1+tribute-v1` is a separate
scenario revision in generation identity/reports, preserving existing layout/keep RNG streams. Some seeds
now accept a later attempt; `trial-23` rejects its former attempt 1 because a promised site is missing.

The 100 O3 seeds retain 21 enemies and four goblins, with no replacement workers. Their longest
shrine/focus route is 128 tile steps; accepted attempts range from 0–2. At 4.8 units/s, that route plus
36 seconds of ordinary restoration takes about 63 seconds, versus 120 seconds of uninterrupted rival
work. This is a geometric response budget, not a guarantee against combat/obstruction delays.
Twelve procedural seals show work/progress and restored, corrupted, fractured or disabled equipment;
actor work poses follow actual O2 elapsed time.

## Verification

```sh
npm run typecheck
npm run format:check
npm run lint
npm test
npm run test:models
npx playwright install chromium firefox
npm run test:browser
BROWSER=firefox npm run test:browser
npm run build && npm run test:production
npm run test:resources
npm run test:portraits
npm run test:inspection
npm run test:discoveries
BROWSER=firefox npm run test:discoveries
npm run test:objective-work
BROWSER=firefox npm run test:objective-work
npm run test:last-ember
BROWSER=firefox npm run test:last-ember
npm run test:tribute
BROWSER=firefox npm run test:tribute
npm run test:movement
npm run test:animation
npm run test:jump
BROWSER=firefox npm run test:movement
npm run test:combat
BROWSER=firefox npm run test:combat
npm run test:social
```

The browser check starts a development server if needed, exercises the full game loop, completes three different seeds, and writes screenshots and JSON reports to `test-results/`. Chromium's automated smoke test explicitly uses software rendering for reproducibility; its FPS is not a hardware performance result.

`test:resources` is a bounded Chromium/SwiftShader resource regression at 640×360, low quality.
It exercises active play, menu pause/resume and three same-seed regenerations, measures seal-update
snapshot reads, and records raw/post-GC JS heap, DOM listeners and rendering/ECS counts in
`test-results/resource-report.json`. Work yields between batches of at most 12 simulation steps;
the browser has a 60-second deadline after launch. This short check detects allocation-budget and
resource-retention regressions, not long-running host/GPU stability. `RESOURCE_REPORT` overrides
the report filename for before/after comparisons.

The full browser, resource and production scripts reuse an existing server or own a direct Vite
child with a strict port. Their shared `tests/testServer.ts` scope cleans up owned processes on
startup, browser-launch and test failures as well as success; on POSIX it also terminates the
owned process group. Reused servers stay running.

The movement suite expects a running dev server. It sends real pointer/keyboard events, checks high-DPI and low-quality floor picking, routes around furniture and over stairs, checks doors and modal cancellation, and captures the destination marker and start/stop poses. Pure navigation and locomotion tests run with `npm test`.

The animation suite also expects a dev server. It checks **28 actual moving-rig corpse crossings** at normal enemy, fleeing, walk and run speeds, including rotated bodies and translated uphill/downhill stairs, comparing each final rendered sole against the surface at its actual x/z and real floor height every frame. It also samples production rigs in a stationary close-up fixture for deformation volume, distinct run poses, attack/recoil timing, jump/landing poses and focus-loss cleanup. The **46-pose comparison sheet** at `test-results/chromium-animation-poses.png` includes four moving-edge and four ramp contacts, running sword poses, corpse walk/run/contact/clearance, and flat-versus-corpse attacks for each enemy species (ranged for goblins). The jump browser suite uses real Space presses to check short taps, held-key behavior, click routes, running flight, gates, airborne lava protection, and modal/teleport/regeneration cleanup. Pure tests cover ballistic integration across tick rates, stairs, spring continuity, analytic leg solving and singularity/reach bounds, ordinary turning plants, moving-actor facing, anticipation, recovery, and the continuous hacky-sack handoff. Animation reference: [Animation Bootcamp: An Indie Approach to Procedural Animation](https://www.youtube.com/watch?v=LNidsMesxSE); the retrieved, timestamped English auto-caption transcript is in the local reference folder at `ref/procedural-animation-bootcamp-transcript.md`.

The combat suite also expects a dev server. It uses real clicks/holds to verify pursuit, retargeting, attack poses, repeated damage, corpses, hit particles, cancellations, door clicks, respawn and regeneration. Its walk/run crossing comparison checks identical clear-floor/corpse travel, raised rendered feet, water's 52% speed, and unchanged support/combat elevation. Pure ECS/AI tests cover skeleton hostility, goblin cover/flight/projectiles, kobold flanking, shared movement/doors, and bounded effect lifetimes. The movement suite first checks a fresh-world floor click and arrival with all living actor bodies present, then hides/freezes enemies and removes their body components to isolate the remaining floor-selection checks. The full-route autopilot keeps AI and living-body collision active, temporarily grants the test player immunity, and clears nearby blockers through ordinary pursuit and attacks before replanning physical travel. Damage and death are checked separately.

The social suite also expects a dev server. It checks each activity's stable gathering, visible props and relaxed equipment, interruption by a visible threat, and return after the threat is lost. It captures `test-results/<browser>-social-{cards,hackysack,smoke}.png`. Pure social tests validate seeded placements and ensure relayed pack alerts expire instead of keeping every member permanently agitated.

The objective-work suite expects a dev server and supports Chromium and Firefox. It installs
development-only bindings on existing actors/sites, then exercises the real fixed-step loop,
movement, attacks, doors, pause/inspection/visibility handlers, respawn and regeneration. Its
JSON reports are `test-results/{chromium,firefox}-objective-work.json`.

The Last Ember suite exercises the installed scenario with real E, X, movement/target clicks,
inspection and menu input. It covers navigation/off-screen work, luring, killing, focus intervention,
all race outcomes and recovery, cancellation/respawn/reset, optional failure with Crown victory,
knowledge boundaries, and desktop/narrow/short-window clocks. Reports and reviewed captures use
`test-results/{chromium,firefox}-last-ember*`. Scene placement and temporary actor fixtures make
specific outcomes deterministic; the full browser suite separately traverses three complete keeps
with ordinary AI and living collision enabled.

The tribute suite also supports both browsers and needs the dev server. It exercises installed
O3/O4 composition, real E restoration/recovery and pointer combat, off-screen AI deliveries,
survivor takeover, persistent partial/terminal cargo, menu/inspection pause, respawn and regeneration.
Reports and reviewed cargo/hatch/desktop/narrow/short-window captures use
`test-results/{chromium,firefox}-tribute*`. Three same-seed regenerations check stable scene resources.

The discovery suite expects a dev server and supports Chromium and Firefox. It uses real E,
target clicks and pause-menu controls with deterministic placement/step fixtures. It checks
presentation-only learning, deduplication, distant/occluded/offscreen information boundaries,
witnessed deaths versus aftermath, unknown killers, successful interaction events, both
checkpoint respawns and same/different-seed resets. Reports and desktop/narrow captures are
written to `test-results/<browser>-discoveries-*`.
Rendered-occlusion regressions use the existing entrance pillar, a zero-pixel-difference oracle,
ordinary melee impact, camera-revealed remains and a launched/travelling crossbow bolt whose
shooter stays hidden. Null-engine tests use real materials so picking exercises triangles,
including a gap inside a merged mesh's bounding box. They cover current transforms, invisible
proxies, thin instances, scene-index invalidation, off-ray preparation costs and the three-ray bound.

For a CPU-only observation regression probe (running dev server required):

```sh
node tests/observation-profile.ts
BROWSER=firefox node tests/observation-profile.ts
```

The probe uses `MOURNING-731`, 1440×900, 2,097 meshes, all 22 rigs enabled, frozen AI and a selected
invulnerable ordinary enemy. Each actual/control/actual phase warms 100 steps and measures 400
`__dungeon.step([], 1)` calls without rendering. The control substitutes known-visible observation.
Reports include timings and instrumented matrix/bounds work under `test-results/`; `PROBE_LABEL`
selects the report suffix. This measures CPU simulation/presentation overhead, not GPU FPS.

```sh
npm run profile
```

The profiler requires a running dev server and a graphical desktop. It opens Chromium on the local GPU, samples ten areas at 1920 × 1080, captures all four camera orientations and a grayscale view, and checks that the Inspector opens and closes. The portrait check also expects a dev server and captures four head-on paintings to verify that their GPU-rendered appearances differ. See `VERIFICATION.md` for the recorded results.

The opt-in `?debug` query exposes a small `window.__dungeon` harness **only in development builds**. Tests use the same movement, collision, and interaction functions as normal play, advancing fixed simulation steps to make full-route checks deterministic.

## Generation diagnostics

The generator also provides a pure `generateDungeonWithReport(seed)` API in `src/world.ts`.
It returns the accepted world and a JSON-safe trace with seed, generator/content versions,
zero-based attempt numbers, and placement/validation rejection reasons. A `GenerationError`
retains that trace if the bounded attempt budget is exhausted. Diagnostic callers can lower
`maxAttempts` (1–40) to reproduce a rejection. The current identity is `layout-v3` / `keep-v4`,
with scenario revision `last-ember-v1+tribute-v1`.
Scene recipes change seeded furniture layouts and can change which layout attempt is accepted;
the original topology RNG salt is retained. Older-version seed layouts are historical.
`world.keep` adds one of three authored
profiles (Ashen Foundry, Drowned Court, Pilgrim Redoubt), a shared house, three successive
monarchs and a short linked history. It is generated once before layout retries using
independent versioned semantic streams; cosmetic random draws cannot reroll it. Stable
person/fact/event IDs are scoped to that versioned run. `report.keep` is a detached snapshot.
Accepted placements are bound to those facts for portrait subjects, painting dates, palettes
and room captions. Painting streams use placement identity and deterministic ordering, so
reordering entity arrays cannot swap subjects. Broader architectural heraldry and profile-led
scene composition remain planned.

```sh
npm run report:generation
```

This exports `test-results/generation-corpus.json`: 100 fixed, validated seeds and twelve
explained gallery selections (showcase baselines, retry regression, layout/route outliers,
and area-distribution samples). Each report includes room/connection topology, branches and
loops, pre/post-altar reachability, required-route distances, final seeded enemy/social
placements, and logical resource counts. `src/generation/report.ts` analyzes a blueprint in
an isolated ECS, without advancing gameplay or attaching runtime state to the world.

Distances count four-neighbor tile steps with ordinary doors operable; they are not travel
times and exclude live actor occupancy. `openAreaTiles` counts safe 3×3 room-floor
neighborhoods as a conservative geometry proxy, not a combat-space or difficulty rating.
The JSON keeps individual measurements available for distribution/outlier analysis.

With the development server running:

```sh
npm run test:generation
npm run gallery:generation
```

`window.__dungeon.generationReport()` is available only in development with `?debug` and
returns a detached snapshot of initial generation, preserved through gameplay and replaced
on regeneration. The gallery captures twelve seeds sequentially, with entrance, smithy,
bakery and altar views at a fixed camera/viewport. Open
`test-results/generation-gallery/index.html` for labeled comparisons and a grayscale toggle.
The folder also contains color/grayscale overview images and `report.json`, including five
repeat-regeneration resource checks. The gallery advances one explicit simulation step per
view and excludes FPS/draw-call timing; it is a visual fixture rather than a hardware profile.
Both tools accept `DEMO_URL` and require an already-running server. Chromium captures can
take several minutes under software rendering.

`world.scenes` records both accepted workshop recipes, semantic prop identities, reserved work
paths, anchor attempts and socket outcomes. Scene props are shared by reference with ordinary
world props; `report.scenes` is detached. Each recipe tries at most 96 anchors and twelve relative
sockets per support, with at most four props. Required pairs must fit and connect; optional
supports fall back to omission. Existing static batching, materials and collision adapters render
them. The movement suite clicks every accepted work face and returns to the room center in the
showcase seed; pure tests validate final decorated scenes over an additional 100 seeds.

`src/generation/inhabitants.ts` selects the named character after enemy and social placement,
using stable actor IDs and its actual gathering. The ECS `inhabitant` component owns its initial
home/group identity and fact links; generation reports include a detached copy under the chosen
encounter. The visual identifier adds at most five small meshes using existing materials.

## Planning documents

Design roadmaps live in [`docs/`](docs/README.md):

- [Procedural content improvement plan](docs/procedural-content-improvement-plan.md) — shared keep identities, scene recipes, memorable inhabitants, discoveries, adventure structure, and generator review tools.
- [Dungeon demo plan](docs/dungeon-demo-plan.md) — demo goals, art direction, architecture, and milestones.
- [4e incorporation plan](docs/4e-incorporation-plan.md) — tactical abilities, encounters, exploration systems, and rewards.
- [Monster roster plan](docs/monster-roster-plan.md) — creature catalog, faction/squad behavior, and implementation waves.

## Demo scope

This release includes exploration and combat: traversal, three enemy archetypes, melee/ranged attacks, interactions, hazards, checkpoints, procedural visuals, and a completion state. Inventory, mobile touch controls, and sound remain future extensions.
