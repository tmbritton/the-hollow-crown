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
| Left-click the floor | Follow a safe path to the gold destination ring |
| Hold left mouse on the floor | Continuously steer toward the cursor |
| Click / hold an enemy | Pathfind into reach and repeatedly attack until it dies |
| Click a closed door | Approach and open it if unlocked |
| WASD / arrow keys | Move relative to the camera |
| Shift | Run |
| Space | Cancel travel, pursuit, and attacks |
| E | Open/close doors, open a chest, activate the altar, inspect a portrait, claim the throne |
| E / Escape while inspecting | Return to the overhead view |
| Q / R | Rotate the overhead camera by 90° |
| Mouse wheel | Zoom |
| M | Toggle the explored-room map |
| Escape / pause button | Pause, enter a seed, regenerate, or change quality |
| F2 | Babylon Inspector, development build only |

**Objective:** find and kindle the violet altar, pass through the newly unsealed throne-room gate, and claim the Hollow Crown. Water slows you down; lava damages you. Death returns you to the entrance, or to the altar after activation. Three optional reliquaries restore health and count toward the completion summary.

The route changes with the seed: explore the branching passages and watch the minimap for unexplored chambers. Activating the altar reveals the throne's crown marker. The minimap is north-up even when the camera rotates and automatically fits each generated layout.

Click movement routes around furniture, walls, and lava, and respects closed/locked doors. **Click a closed door** to approach and open it, or use **E** in reach. Enemy pursuit can open intervening unlocked doors automatically. A new floor click replaces the command; WASD/arrows immediately take control. Normal speed is **4.8 units/second**, or **7.4 while holding Shift**, with short acceleration/deceleration easing and a precise arrival brake. Water still slows you down.

The adventurer pushes off and leans forward when starting, blends into a travel-driven stride, then braces and plants the feet while the cape settles on stopping. Pause, inspection, focus loss, and regeneration clear pending travel and momentum.

### Enemies and combat

Each dungeon seeds **21 enemies** outside the entrance and altar rooms:

- **8 skeletons:** slow, simple wanderers. They pursue nearby living characters, including goblins and kobolds, but ignore other skeletons. They cannot operate doors.
- **4 goblins:** take smoke breaks when unaware of threats. In combat, these ranged skirmishers retreat, break line of sight using cover, crouch while hiding, and peek out to fire crossbow bolts. Bolts travel through the world and can be dodged or stopped by walls, furniture, and doors.
- **9 kobolds in three packs:** gather for seeded card games, hacky sack, or smoke breaks. They put away weapons, face their gathering, and use activity-specific poses and procedural props. Detected threats interrupt activities; packs share alerts, regroup, and approach distinct front/side/rear positions around their target. Survivors return to their gathering after losing the threat; a lone survivor takes a smoke break. Pack members have staggered attack cooldowns.

Card mats, dealt cards and stakes remain after a game is interrupted. Hacky-sack passes synchronize with kicks; smoking uses pipes, embers, and a bounded thin-instance puff pool. Gathering positions are validated against the same floor and prop clearance as movement.

Clicking an enemy locks onto it: the player follows its changing position, stops in melee reach, and blends from movement into wind-up, sword strike, and recovery. Holding the button keeps that target even as the enemy and camera move; releasing retains the command. Click another enemy to retarget, or click the floor / press WASD or Space to cancel. A red ground ring and health display identify the target.

Damage occurs at the strike's impact, with range and cover checked again. Living characters emit red blood fragments; skeletons emit pale bone dust. Dead enemies collapse into persistent, non-blocking corpses until regeneration. Death returns the player to the checkpoint with 2.5 seconds of protection. Chests and the altar still restore health.

## What is procedural?

- A grown, irregular thirteen-room graph: different room positions, role assignments, branches, loops, corridor offsets, and elevation connections for each seed.
- Rectangular, chamfered, and cross-shaped rooms with varied dimensions and pool/bridge configurations.
- Randomly placed and rotated altar, throne, reliquaries, pillars, shrine, supplies, and other props. Reliquaries move between rooms as well as within them.
- Directional furnishings—including thrones, ovens, furnaces, shrines, racks, and stalls—face toward the room center. Placement reserves reachable space in front and retries positions that cannot fit an inward orientation.
- Floors, masonry, pillars, door frames, stairs, bridges, throne, altar, sarcophagi, chests, barrels, crates, bones, and character geometry.
- Stone variation, tile seams, wood grain, graphic lighting bands, water ripples/foam, animated lava fissures, fire, embers, and altar runes.
- Shared walk/start/stop/attack/death animation, enemy models, blood and dust particles, crossbow bolts, door hinges, chest lids, floating votives, and flickering lights.
- Four themed workspaces: a butchery, blacksmith, bakery, and underground lizard stable. Furnishings include hanging cuts, cleavers, furnaces, anvils, bread ovens, loaves, flour sacks, feed troughs, tack, and two animated saddled lizards.
- Framed 32 × 40 pixel-art royal portraits. **E** moves the camera to an eye-level close-up and switches the same artwork to **128 × 160** with finer facial features, hair strands, jewelry, embroidery, and canvas texture. The monarch's identity remains the same. Movement pauses during inspection; **E**, **Escape**, or the return button restores the overhead view.

There are **no imported models, image textures, sprites, animation clips, fonts, or environment maps**. Shadows and glow use runtime-generated render targets. UI uses system fonts, CSS, text symbols, and a second canvas for the map.

The generator builds a connected spatial graph, assigns room roles, reserves passage clearance, and places gameplay objects before decoration. Navigation validation includes prop footprints and interaction approaches; the throne is a gated leaf, preventing an accidental bypass. Invalid candidates are retried deterministically.

Ordinary page loads and every browser refresh generate a fresh random seed. Random runs leave the URL unpinned. Opening an explicit link such as `/?seed=MOURNING-731`, or entering a seed in the pause menu, reproduces that world; refreshing it starts a new random run. To share the current world, use the seed displayed in the HUD/menu in a `?seed=` link. The revised generator changes what earlier-version seeds produce.

## Implementation

| File | Responsibility |
| --- | --- |
| `src/worldTypes.ts` | Rooms, tiles, connections, props, and discriminated entity types |
| `src/world.ts` | Deterministic generation, tile heights, room graph, progression validation |
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
| `src/materials.ts` | Typed material palette and GLSL liquid/fire/magic effects |
| `src/navigation.ts` | Height-aware floor picking, tile routing, corner-clearance smoothing, and dynamic door checks |
| `src/locomotion.ts` | Movement speeds, acceleration/deceleration, and procedural start/travel/stop animation |
| `src/player.ts` | Voxel adventurer, camera-relative input adapter, and destination marker |
| `src/main.ts` / `src/gameTypes.ts` | Engine, fixed-step updates, interactions, progression, and game/debug contracts |
| `src/engine.ts` | Babylon engine with a typed effect-cache diagnostic |
| `src/ui.ts` / `src/dom.ts` / `src/style.css` | HUD, minimap, typed DOM access, menus, responsive layout |

### Type checking and formatting

`tsconfig.json` enables `strict`, unused-code checks, and `verbatimModuleSyntax` for all application code, tests, and `vite.config.ts`. Type-only imports keep domain contracts out of runtime bundles. Entity types narrow on `entity.type`; for example, only doors have a lock and only portraits have royal identity data. Rendering references are optional until scene construction, with explicit checks where required.

`InspectionController` stores an active session containing its target and saved camera pose, so idle state cannot accidentally use an absent target. DOM helpers verify element types before accessing canvas, input, and dialog APIs.

```sh
npm run typecheck
npm run format
npm run format:check
```

Both `npm test` and `npm run build` run the type checker. Vite handles browser transpilation; Node executes test `.ts` files directly, without injecting helpers into Playwright's serialized browser callbacks. `erasableSyntaxOnly` enforces that compatibility. Dependency declarations are skipped with `skipLibCheck`; project code and tests are fully checked.

### Entity/component architecture

`game.ecs` is the runtime registry. Player, enemies, doors, interactables, props, obstacles, rooms, tiles, render batches, projectiles, and hit particles have entity IDs and attachable components. Generated world data is registered **by reference**, preserving the existing pure generation/validation pipeline and preventing duplicate door or interaction state. A batched mesh can render many logical floor/prop entities efficiently.

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

The fixed-step order is door state → player intent/pursuit → shared movement → enemy decisions/movement and shared attacks → projectiles/particles → shared rig animation. Menus and inspection suspend simulation. Blood/dust are capped at 192 live particle entities and bolts at 32; fixed thin-instance pools render them without allocating new meshes per hit. Corpse entities retain their original meshes.

### Declarative state machines

All state-machine definitions live under `src/machines/`:

- `monsters/skeleton.ts`, `monsters/goblin.ts`, `monsters/kobold.ts`: independent species machines. Shared perception contracts and the factory live alongside them. Species charts select named effects; combat systems carry out pathfinding, pursuit, fleeing and attacks.
- `actors/`: attack wind-up/impact/recovery/death, mutually exclusive pursuit/door commands, health/protection/death, and locomotion phases.
- `navigation/`: route following, waiting for an opening door, arrival and blocked/stuck cancellation.
- `world/`: door locks/opening/closing, one-way chest claiming, and altar-to-crown progression.
- `ui/`: loading/play/menu/inspection/victory, independent tab visibility and map visibility, inspection-camera transitions, held-pointer modes, transient feedback, and asynchronous Inspector requests.

`Statechart` uses XState's `initialTransition` and `transition` APIs. Simulation sends explicit tick events; no wall-clock timers, background actors, or subscriptions run gameplay. Snapshot-backed accessors expose familiar `health.current`, `attack.target`, door flags, and inspection state without maintaining competing flags. Rendering interpolations, collision/path searches, and numerical geometry remain ordinary functions. UI-only fading accepts an explicit presentation timestamp.

World blueprints remain deterministic plain data. Runtime door/chest views bind to their charts by reference. Replacing a world discards its snapshots; there are no machine timers to stop. Inspector request generations reject stale asynchronous imports after cancellation or regeneration.

### Model-based testing

```sh
npm run test:models
```

The latest XState includes model-testing tools in **`xstate/graph`**. `tests/models/` generates paths to every modeled state and extends each path with every candidate event, including ignored/invalid attempts and self-loops. Inspector microstep data measures every declared transition branch, including guards and eventless transitions. Invariants are checked after each stable step, and the pure simulation adapter is compared against a live XState actor.

The suite currently covers **16 machines, 75 declared atomic states, and 155 transition branches**. Adding an exported machine, unreachable state, or uncovered branch fails the suite. Negative fixtures verify that the coverage checks really fail. Timers and other continuous values use documented finite partitions; deterministic bounded walks exercise longer cycles rather than claiming exhaustive enumeration of infinitely many paths. The report is written to `test-results/machine-model-report.json`.

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

Gameplay key handlers cancel native letter-key text actions, including repeats, while leaving text fields and browser shortcuts available.

## Verification

```sh
npm run typecheck
npm run format:check
npm test
npm run test:models
npx playwright install chromium firefox
npm run test:browser
BROWSER=firefox npm run test:browser
npm run build && npm run test:production
npm run test:portraits
npm run test:inspection
npm run test:movement
BROWSER=firefox npm run test:movement
npm run test:combat
BROWSER=firefox npm run test:combat
npm run test:social
```

The browser check starts a development server if needed, exercises the full game loop, completes three different seeds, and writes screenshots and JSON reports to `test-results/`. Chromium's automated smoke test explicitly uses software rendering for reproducibility; its FPS is not a hardware performance result.

The movement suite expects a running dev server. It sends real pointer/keyboard events, checks high-DPI and low-quality floor picking, routes around furniture and over stairs, checks doors and modal cancellation, and captures the destination marker and start/stop poses. Pure navigation and locomotion tests run with `npm test`.

The combat suite also expects a dev server. It uses real clicks/holds to verify pursuit, retargeting, attack poses, repeated damage, corpses, hit particles, cancellations, door clicks, respawn and regeneration. Pure ECS/AI tests cover skeleton hostility, goblin cover/flight/projectiles, kobold flanking, shared movement/doors, and bounded effect lifetimes. The floor-movement suite hides and freezes enemies to isolate floor selection; the full-route autopilot keeps AI active but grants the test player immunity during landmark traversal. Damage and death are checked separately.

The social suite also expects a dev server. It checks each activity's stable gathering, visible props and relaxed equipment, interruption by a visible threat, and return after the threat is lost. It captures `test-results/<browser>-social-{cards,hackysack,smoke}.png`. Pure social tests validate seeded placements and ensure relayed pack alerts expire instead of keeping every member permanently agitated.

```sh
npm run profile
```

The profiler requires a running dev server and a graphical desktop. It opens Chromium on the local GPU, samples ten areas at 1920 × 1080, captures all four camera orientations and a grayscale view, and checks that the Inspector opens and closes. The portrait check also expects a dev server and captures four head-on paintings to verify that their GPU-rendered appearances differ. See `VERIFICATION.md` for the recorded results.

The opt-in `?debug` query exposes a small `window.__dungeon` harness **only in development builds**. Tests use the same movement, collision, and interaction functions as normal play, advancing fixed simulation steps to make full-route checks deterministic.

## Demo scope

This release includes exploration and combat: traversal, three enemy archetypes, melee/ranged attacks, interactions, hazards, checkpoints, procedural visuals, and a completion state. Inventory, mobile touch controls, and sound remain future extensions.
