# Reset and try again

- **Task source**: `docs/plan/roadmap.md:84–86`
- **Epic / Story**: 13 / 13.2; depends on the authored practice room (13.1)
- **Status**: proposed
- **Branch**: `main` at `08b8ce2`

## Goal

Let a player repeat a movement, door or targeting exercise immediately. One action returns them to the same empty practice room in the current page. A player who wants to practise attacking can explicitly start a round with one existing foe; nobody has to fight to use or reset the room.

## Acceptance criteria

- [ ] A visible, named native **Reset practice** button works in one click or keyboard activation, without opening a menu or confirming. Offer a labelled, unbound gameplay shortcut (candidate: T; verify bindings first). Preserve Q/R camera rotation and browser shortcuts.
- [ ] Reset from travel, an opened door, pursuit, combat or defeat restores the authored spawn, starting health, closed unlocked door and lone idle hero. No queued destination, interaction, held steering, attack target, corpse or effect resumes on later ticks. A new command works normally.
- [ ] Reset keeps the document, URL and engine; it neither picks a seed nor invokes dungeon generation. Bare and seeded dungeon play retain their controls, population and restart behavior.
- [ ] A separate **Start single-foe practice** action starts a fresh round with exactly one existing enemy outside melee reach on reachable floor. A real click selects it, the hero pursues, and an ordinary in-reach attack resolves. Repeated requests never stack foes, including after a kill; reset always selects the empty round.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| ---- | ---- | --------------- | ------------------ |
| Round requests | `tests/practiceRoom.test.ts` | Table-test both actions for each ready variant, loading and non-practice. A counting fake receives exactly one requested authored build per accepted action and zero seed/generator calls, including with a seed in the query. | Red: no round commands. |
| Independent mutable layout (13.1 carryover) | `tests/practiceRoom.test.ts` | In two builds, identify the corresponding door by ID and tile by key. Assert distinct door and tile objects separately; mutate one door and check the other stays closed, then mutate one tile height and check the other's original numeric height. Do not compare against another potentially aliased build. | May already pass; verify each assertion goes red separately if just doors or just tile values are shared. |
| Single-foe setup | `tests/practiceRoom.test.ts` | Compare quiet and opt-in rosters and reachable standable spawn outside hero reach. Verify the one actor is registered in the real ECS with existing combat components, no squad or objectives. | Red: only hero supported. |
| Dirty room → reset → usable room | `tests/movement-browser.ts` | In one document record spawn/HP and document sentinel. Actually open the door, start distant click travel and observe displacement; activate reset mid-travel. Check sentinel, hero/HP, closed collision, empty roster and no destination; step forward and verify no drift, then reopen via ordinary controls. Repeat via shortcut, including reset from held steering. | Red: no visible reset or shortcut. |
| Opt-in → pursue → hit → reset | `tests/movement-browser.ts` | Use the named control repeatedly; assert bounded roster. Click the projected enemy mesh from out of reach, observe hero target and closing distance before player-sourced impact in reach (not merely enemy AI approaching). Allow the hero to take damage; reset, check restored HP and absent foe/target/effects over subsequent steps. In another round reset during pursuit before impact, then opt in again to prove picking still works. Use dev observations only, not debug commands to spawn, move or attack. | Red: no opt-in or combat lifecycle. |
| Production controls and isolation | `tests/production.ts` | At root and Pages base without debug, activate opt-in then reset by accessible name; verify a visible change from foe-round to empty-ready controls, retained document sentinel/URL and playable HUD. Check keyboard activation, practice controls absent from dungeon, local assets, no console errors or debug API. Keep refresh smoke separate: refresh cannot count as reset. | Red: controls missing. |

## Design

Reuse `main.ts:start` as the scene replacement boundary. It already unloads UI, resets movement, retires the old game, resets frame timing, and selects `buildPracticeRoom` before the dungeon provider. Pass the requested practice roster explicitly into this build (including retry); default direct entry to quiet. Never call the regenerate button handler, which evaluates `freshSeed()` before calling `start`. Build the new player, ECS, door, collision, scene and navigation budget together instead of teleporting the old actor and trying to unwind each subsystem.

For the opt-in build, use the existing skeleton actor/brain construction at a deterministic authored point reachable without opening the door. Supply the actor alongside the player **before** combat, navigator scheduling and enemy rendering are wired. Reuse the regular mesh picking, pursuit, attack clock, damage and death paths. Do not call `seedEnemies`: it expects dungeon rooms and also installs social groups, squads and scenario actors.

### State model

Use a typed round variant `quiet | singleFoe` on the practice request; it denotes which round was built, not whether an actor is currently alive. Combine this with existing session readiness, not a second asynchronous session chart. Resolve commands in one pure decision:

| Current context | Reset | Start single-foe practice |
| --- | --- | --- |
| Ready quiet | Rebuild quiet (even if apparently pristine) | Rebuild singleFoe |
| Ready singleFoe, including ended encounter | Rebuild quiet | Already selected; no build, offer reset for another round |
| Loading/retired or dungeon | Unavailable; no effect | Unavailable; no effect |

An accepted build enters the existing loading lifecycle immediately. Only the current request's ready callback publishes the new round; stale ready notifications are rejected. On failure use existing failure/retry handling, not a half-ready round. Defeat must not lock out the reset button. Actor death changes ECS state, not the round variant. Do not add a new exported machine merely to select a constructor argument; cover all decisions in the table.

### Ports and adapters

The practice policy accepts domain commands and returns either a typed rebuild request or an explicit unavailable/already-selected result. `main.ts` executes the rebuild through the existing content provider seam, composing authored layout, roster, scene and UI. DOM buttons and keydown are two adapters to that same decision; neither manipulates actors or doors. Use plain functions and injected counting providers in tests; no new service registry, browser globals in policy or production test API.

### Alternatives rejected

- Reload/query navigation loses document state; a dungeon regeneration shortcut also obscures whether generation was skipped.
- In-place rewind or late enemy insertion would require coordinating existing navigation, combat, picking, rendering and disposal owners individually. Fresh authored round construction already wires those owners consistently; label the opt-in as starting a round, not adding to the current one.

## File changes

| File | Change | Why |
| --- | --- | --- |
| `src/practiceRoom.ts` | Round decision and authored opponent position. | Keep policy deterministic and testable. |
| `src/main.ts`, `src/combat.ts` | Route practice commands through the existing restart lifecycle and assemble zero or one ordinary enemy; factor only the single-actor setup shared with seeding as needed. | Preserve dungeon generation, targeting and fixed-step behavior. |
| `index.html`, `src/ui.ts`, `src/style.css` | Named practice-only buttons, shortcut hint, visible focus, selected/loading availability and usable placement outside canvas input. | Expose actions without stealing pointer or keyboard gameplay. |
| `tests/practiceRoom.test.ts`, `tests/movement-browser.ts`, `tests/production.ts` | Add contracts above. | Cover policy, real play and shipped UI separately. |
| `README.md`, `VERIFICATION.md` | Document local/Pages controls and fresh-round behavior; record only checks actually run. | Keep player instructions and evidence current. |

## Edge cases and failure modes

- Ignore shortcut auto-repeat, modifiers, text editing and modal keyboard input. Keep button activation from also jumping, steering or clicking through to terrain. Clearing held keys on reset must not let repeat events restart motion without a fresh press; check pointer release across replacement too.
- Two quick actions while loading must not queue another build or revive a disposed scene. Bind listeners once; leave only one live scene, route budget and actor binding set after repeated cycles. Keep errors and retry reachable.
- An open or swinging door must reset both its shared interaction record and physical passability. A dead hero or foe, including ragdoll presentation, must not survive the scene boundary.

## Verification

On Node 22.18+ run the focused red tests, then the green checks below. Start `npm run dev` separately for targeted browser suites; run rendering suites sequentially. Use bounded readiness/step observations, not sleeps. Inspect captures for button legibility, keyboard focus and unobstructed floor/foe picking.

```sh
node --test tests/practiceRoom.test.ts
npm test                 # typecheck + everyday tests, including model coverage
npm run lint
npm run format:check
npm run check:full       # cross-cutting lifecycle: full tests, lint and format
npm run test:movement
BROWSER=firefox npm run test:movement
npm run test:combat
npm run test:resources
npm run build && npm run test:production
npm run build:pages && DEMO_URL=http://localhost:4173/the-hollow-crown/ npm run test:production
```

Run the Pages smoke with a preview serving the Pages base (`npm run preview:pages` if starting it separately); do not reuse a root preview with the wrong base. Exercise `/?room=practice` locally and `/the-hollow-crown/?room=practice` from the production bundle. Keep the normal dungeon checks in both runs.

## Risks and rollout

The main risks are stale input/ready callbacks and an opponent visible but not registered for picks or attacks. Verify repeated resets with input pending, check disposal/resource bounds, and require an actual player hit in the browser. Gate the feature by the existing practice selection only. It needs no migration; removing the practice commands should leave the 13.1 room and normal dungeon intact.

## Out of scope

No new ability, enemy type, AI lesson, squad encounter, combat balance change, generated practice dungeon, persistent settings or key rebinding. No roadmap updates, deployment or runtime changes in this planning task.
