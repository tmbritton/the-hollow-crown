# Agent guide — The Hollow Crown

## Project context

The Hollow Crown is a browser-based, code-generated dark-fantasy voxel dungeon. It uses
Babylon.js, XState 5, strict TypeScript, Vite, and plain DOM/CSS/canvas UI. The game is a
static client-side application; dependencies and exact versions are in `package.json`.

- Read `README.md` for current gameplay, architecture, and run instructions.
- Use `VERIFICATION.md` for recorded results, noting which entries are historical baselines.
- Consult `docs/README.md` before working from a roadmap. Plans describe proposed work unless
  explicitly marked implemented; source and tests establish current behavior.
- Preserve the graphic art direction: angular silhouettes, broad shadows, restrained color
  accents, and readable landmarks and walkable surfaces.
- All game art is procedural. Generate geometry, materials, portraits, and animation in code;
  keep runtime assets locally bundled and UI fonts system-provided.

## Setup and commands

Use npm and the existing `package-lock.json`. Node.js **22.18+** is required because tests
execute TypeScript directly with Node's native type stripping. The game requires WebGL2.

```sh
npm install
npm run dev             # http://localhost:5173 by default
npm run typecheck       # source, tests, and Vite config
npm run format:check
npm run lint            # Oxlint correctness checks; warnings fail
npm test               # typecheck + everyday regressions and all machine state/branch coverage
npm run test:extended  # broad seed corpora, exhaustive timing/model paths and long simulations
npm run test:full      # typecheck + core and extended tests in one run (CI/release gate)
npm run test:models    # everyday model coverage; also typechecks
npm run test:timings   # full suite with ranked timings and an ignored JSON report
npm run build          # typecheck, then production bundle in dist/
npm run preview        # http://localhost:4173 by default
```

- `npm install` / `npm ci` install the pre-commit hook using `simple-git-hooks` via `prepare`.
  The hook runs `npm run check`: everyday tests (including type checking), linting, then Oxfmt checks
  across the working tree, stopping on failure. Run `npm run prepare` after editing the hook
  configuration in `package.json`. Format corrections with `npm run format` and stage them.
- Run a focused pure test with `node --test tests/navigation.test.ts` (substitute the relevant
  file). Direct Node test commands do not typecheck and include any extended cases in that file.
- Top-level test names starting with `[extended] ` are the explicit slow group. `npm test`
  excludes them; `test:extended` selects only them; `test:full` and `test:timings` include both
  groups. Corpus fixtures must be lazy so discovery/name filtering does not generate them.
  Suite commands cap file concurrency at four. `test:core` is the everyday runner without typing.
- CI/Pages runs `npm run check:full` (full tests, lint, format) before building/deploying. Run it
  locally for generation/corpus, objective timing, long cargo traversal or model-partition changes,
  test-selection changes, cross-cutting concerns, and before releases; use focused tests during
  iteration. Ordinary animation/input changes use the everyday gate plus affected browser checks.
- Everyday models still require every exported machine and all declared states/branches. The
  exhaustive work-clock graph is additional extended coverage. Reports are separate:
  `machine-model-report.json` and `machine-model-extended-report.json` under `test-results/`.
- `npm run format` uses Oxfmt for all source/test TypeScript, `vite.config.ts`, `tsconfig.json`,
  and the Oxfmt/Oxlint JSON configs. For a small change, format only edited files to keep the
  diff focused. The format scripts do not cover Markdown, HTML, or CSS.
- `npm run lint` uses Oxlint for source, tests, and Vite config; `npm run lint:fix` applies
  safe automatic fixes. Review fixes, then format and rerun checks.
- Pure tests use `node:test` and `node:assert/strict`. Browser suites are standalone Node
  scripts using Playwright, invoked through the npm scripts below.

### Browser and visual checks

Install browser binaries with `npx playwright install chromium firefox` when needed.

- `npm run test:browser` runs the full gameplay/rendering suite and starts a development
  server on port 5173 if needed. `BROWSER=firefox npm run test:browser` selects Firefox.
- Targeted suites require an already-running development server:
  `npm run test:movement`, `npm run test:combat`, `npm run test:defense`, `npm run test:social`,
  `npm run test:animation`, `npm run test:jump`, `npm run test:inspection`, and
   `npm run test:portraits`. `npm run test:phalanx` checks adverse rank recovery, coordinated ranks,
   opening/thrust/throw, swept flight-edge interception, withdrawal, pause and regeneration in Chromium.
- Movement, combat, and social suites also support `BROWSER=firefox`. Animation, jump and defense
  use Chromium; inspection and portraits use Firefox.
- Development-browser scripts accept `DEMO_URL` (default `http://localhost:5173`). When
  using a custom URL, start that server yourself.
- `npm run build && npm run test:production` checks the built application and absence of
  development hooks. The production script starts or reuses preview at port 4173.
- `npm run profile` requires a running dev server and a graphical desktop; it uses headed
  Chromium and the local GPU. Software-rendered smoke-test FPS is not a hardware benchmark.
- Run rendering-heavy suites sequentially. Review relevant screenshots as well as assertions
  for visual changes. Reports and captures go to `test-results/`.

For reproducible development checks, open `/?debug&seed=MOURNING-731`. The typed
`window.__dungeon` harness exists only with `?debug` in development builds. Opening an
explicit seed link reproduces a world, but refreshing deliberately starts a fresh random
run, even from a seeded URL. Use a new navigation or the harness/menu to repeat a seed.

## Code map

- `src/main.ts`, `src/gameTypes.ts`, `src/engine.ts`: application composition, engine/scene
  lifecycle, fixed-step loop, input, interactions, and debug contracts.
- `src/world.ts`, `src/worldTypes.ts`: seeded world generation, spatial data, support heights,
  placement, and progression validation.
- `src/ecs.ts`, `src/worldEntities.ts`: typed component registry, reference-based world
  registration, and shared door updates.
- `src/actors.ts`, `src/combat.ts`, `src/social.ts`: shared actor behavior, encounters,
  attacks/effects, and seeded social activities.
- `src/koboldSquads.ts`, `src/attackKinds.ts`, `src/phalanxPoses.ts`: bounded physical rank
  geometry/unit movement, shared attack contracts, and clock-sampled spear/throw presentation.
- `src/navigation.ts`, `src/occupancy.ts`: floor picking, routing, clearance and live actor
  collision. `src/corpseTerrain.ts`, `src/corpseRendering.ts`: render-only fallen-body sampling.
- `src/locomotion.ts`, `src/jump.ts`, `src/footPlacement.ts`, `src/animationCurves.ts`,
  `src/actionPoses.ts`: motion, ballistic jumps, ground contact, and procedural poses.
- `src/machines/`: statecharts grouped into `actors/`, `monsters/`, `navigation/`, `world/`,
  and `ui/`; `statechart.ts` is the synchronous transition adapter.
- `src/buildDungeon.ts`, `src/geometry.ts`, `src/themedProps.ts`, `src/materials.ts`,
  `src/renderTypes.ts`: procedural architecture, batching, furnishings, shaders, and render
  contracts. `src/royalty.ts` and `src/portraits.ts` handle seeded royal artwork.
- `src/player.ts`, `src/actorRendering.ts`, `src/enemyRendering.ts`, `src/socialRendering.ts`:
  player input/rig construction, shared visual/collision adapters, and enemy/social rendering.
- `src/inspection.ts`: reusable inspection sessions and camera restoration.
  `src/ui.ts`, `src/dom.ts`, `src/style.css`, and `index.html`: HUD, map, menus, and DOM access.
- `tests/*.test.ts`: pure and model tests. `tests/models/cases.ts` defines machine scenarios
  and invariants; `tests/models/coverage.ts` implements generated coverage checks.

## Implementation conventions

### TypeScript

- Follow `.oxfmtrc.json`: single quotes, 100-column print width, and Oxfmt formatting.
  `.oxlintrc.json` configures correctness checks and browser/Node environments. Use explicit
  `.ts` extensions for local imports and `import type` for types.
- Keep strict typing, unused-code checks, and `erasableSyntaxOnly` intact. Avoid syntax
  requiring runtime TypeScript transforms, such as enums and constructor parameter properties.
- Narrow discriminated entities on `entity.type` and check optional render references.
  Prefer typed contracts and existing `src/assert.ts` / `src/dom.ts` helpers over `any`,
  unchecked casts, or error-suppression directives.
- Follow existing Babylon submodule imports and required side-effect registrations. Runtime
  Babylon imports in modules executed directly by Node need resolvable `.js` paths, as in
  `src/inspection.ts`; Vite-only extensionless imports are not a Node resolution guarantee.
- Keep Playwright `page.evaluate` callbacks self-contained: pass serializable arguments and
  access browser-side state there rather than closing over Node-side values.

### Simulation and state ownership

- Components in `src/ecs.ts` own runtime entity state. `Actor` is a checked view over those
  components; extend `Components` and query required combinations for new systems.
- Generated objects are registered by reference. Preserve shared door/interaction identity
  rather than introducing independent copies of mutable state.
- Player input and AI provide intents to the same movement, navigation, door, and combat
  systems. Keep Babylon rendering and collision adapters separate from domain logic.
- `MoveIntent.facing` can keep guard heading independent of travel. Phalanx phase/target/action
  selection belongs to the group chart; individual `Attack` owns impact/release. Keep opening
  vulnerability authoritative, body-safe spear lanes, bounded holds and survivor retreat offsets.
  Javelins share the projectile cap and stop on friendly living bodies without friendly damage;
  crossbow allegiance rules remain unchanged.
- Gameplay advances at fixed `1 / 60` steps. Preserve the order in `main.ts`: doors, player
  pursuit/movement, combat updates, then shared rig/effect rendering. Animation follows
  authoritative movement and impact clocks; visual poses must not decide damage or collision.
- Define state machines under `src/machines/` using the `Statechart` adapter and explicit
  events/ticks. Keep clocks caller-owned; gameplay charts use synchronous transitions without
  `after`, `invoke`, `spawn`, background actors, or subscriptions. Use snapshot-backed
  accessors instead of parallel state flags.
- Every exported production machine needs a model specification in `tests/models/cases.ts`.
  Extend event partitions and invariants when changing guards or transitions: the suite fails
  on missing machines, unreachable declared states, or uncovered transition branches.

### Generation, movement, and rendering

- Keep generation deterministic and plain-data based. Use `randomFrom` and seeded streams;
  keep retries bounded and deterministic. Reserve passages and interaction approaches before
  decoration, and preserve `validateDungeon` checks and multi-seed coverage.
- Maintain the altar-before-throne gate, reachable landmarks/reliquaries, prop-aware clearance,
  and inward-facing furniture with reachable front space when changing placement.
- Domain positions use `x`/`z` horizontally and `h` for support height. Use `tileAt` / `heightAt`
  for terrain and ramps. Jump elevation is separate from support height; jumping retains
  ground-navigation clearance for obstacles, doors, living actors, and void edges.
- Keep living actors blocking and corpses passable at full speed for every actor. Water alone
  slows grounded travel to 52%. Sample drawn corpse surfaces only for bounded procedural foot
  contact/clearance and visual pelvis assistance; never change support, collision, navigation,
  jump state or melee elevation from corpse geometry. Overlapping corpses take the highest
  surface rather than stacking offsets. Route, collision, interaction and rendering must agree.
- Preserve cancellation/reset behavior for menus, inspection, focus loss, teleport, death,
  and regeneration, including pending commands, momentum, jumps, and deformed poses.
- Reuse material/spatial batching and bounded thin-instance effect pools. Keep scene,
  render-target, effect-cache, and generated shader cleanup working across regeneration.
- Preserve character shadow participation and camera-facing wall cutaways with intact
  collision. Quality settings should change presentation, not gameplay state or routes.
- Keep the Inspector and `window.__dungeon` behind development guards.

## Verification and repository hygiene

- For code changes, run `npm run format:check`, `npm run lint`, `npm test`, and `npm run build`,
  plus the targeted browser suite for affected behavior. Everyday pure/model tests already run
  under `npm test`; use the focused model command during statechart iteration. Run the extended/full
  gate when the changes meet the criteria above; CI always requires the full gate before release.
- Add meaningful regression coverage for changed gameplay or generation invariants. For
  rendering/input changes, exercise the real browser path and inspect relevant captures.
- For documentation-only changes, check commands, paths, and claims against current files.
- Update `README.md` when controls, architecture, or setup change. Record new verification
  results in `VERIFICATION.md` only for checks actually run; retain historical qualifications.
- `node_modules/`, `dist/`, `test-results/`, logs, and `ref/` are ignored. Keep generated output
  out of source changes. Local reference material in `ref/` may be absent in a fresh checkout.
