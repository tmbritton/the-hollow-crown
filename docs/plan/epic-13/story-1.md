# Enter and move around

- **Task source**: `docs/plan/roadmap.md:81–83`. The listed dependency on 1.3 is delivery order only for this request; use the controls on `main` without changing or claiming Epic 1 work.
- **Epic / Story**: 13 / 13.1
- **Status**: proposed
- **Branch**: `main`

## Goal

Open `?room=practice` directly into a quiet, editable greybox where the player can try the actual dungeon hero, camera, movement and door interaction. Change the content supplied to the game, not the way the hero plays. The ordinary dungeon remains the default.

## Acceptance criteria

- [ ] The README links to `https://tmbritton.github.io/the-hollow-crown/?room=practice` alongside normal play. Direct navigation and refresh work at `/` and `/the-hollow-crown/` with no debug flag, seed entry, dungeon generation or server rewrite. Normal and seeded dungeon links still start normal play.
- [ ] One bounded floor, one solid pillar, one closed unlocked door in a partition, and walkable landing space beyond it. The spawn sees the exercise from the dungeon overhead camera. No enemies, objectives, clocks advancing a scenario, or objective prompts at start or after walking through.
- [ ] Clicking floor beyond the pillar takes the hero around it; steering directly into it never clips through. Holding the mouse steers as the pointer moves. WASD or arrows take over from travel relative to the camera, Shift runs, Space jumps and lands, holding/releasing F raises/lowers the shield, and X cancels travel without resuming it on the next tick.
- [ ] Direct movement cannot cross the closed door. Clicking it from outside reach approaches and opens it; on a fresh visit E outside reach does not open it, E within reach does. After the swing clears, walk through the opening without a key or quest.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Select content before construction | `tests/practiceRoom.test.ts` | Feed missing, unknown and practice selections with/without seed to a pure dispatcher with counting providers. Only practice calls the authored provider; dungeon provider never called on that path. | Red: no selector/provider seam. |
| Layout and clearance | `tests/practiceRoom.test.ts` | Two builds have equal layout but independent mutable door/tiles. With actual navigation clearance, straight path hits pillar, a route reaches floor beyond, closed doorway blocks direct travel and opened doorway admits it. Spawn, approach and landing have support. | Red: no authored layout. |
| Real controls and quiet start | `tests/movement-browser.ts` | Direct entry; assert lone hero and empty objective work. Use real pointer/keyboard and existing dev observations, not harness movement commands. Sample positions on the detour; move pointer while held; rotate camera and check keyboard displacement; compare walk/run over equal simulation steps, observe jump/landing and held/released guard, cancel a distant target and check it stays cancelled. | Red: practice URL boots a populated dungeon. |
| Door from either input | `tests/movement-browser.ts` | In separate fresh visits use click from afar vs E outside then inside reach; observe approach before opening, closed collision, swing clearance and crossing. Bound waits on state/progress, not arbitrary sleeps. | Red: no stable practice doorway. |
| Published entry and default isolation | `tests/production.ts` | Fresh context at configured base + query; assert identifiable room label, playable canvas, same room on reload, assets within base, no console errors/dev API. Navigate back to bare base and retain existing seed/menu smoke. | Red: no practice entry/label in production. |

## Design

Author the layout in one plain-data module: floor outline, partition/gap, pillar footprint, door orientation and spawn. Derive support tiles, bounds, blockers, geometry placement and test destinations from that description. Leave at least a hero-width route beside the pillar and clearance on both sides of the door swing. Allocate fresh mutable objects per load. Don't use a lucky dungeon seed or hide unwanted meshes: invisible colliders, actors and objective work would survive.

In `src/main.ts` select the world source **before** `generateDungeonWithReport`. Split dungeon-only preparation from common scene startup. Both use `createPlayer`, the same overhead camera/follow, `SupportTiles`, ECS registration, `CombatSystem`, route budget, terrain candidates and fixed-step order. Supply just the hero to combat in practice. Do not call `seedEnemies`, Last Ember/Tribute preparation, clue binding or objective installation there; group their update/render/HUD consumers behind the same scenario boundary. Audit startup, map, tick, failure and disposal paths for unconditional dungeon lookups. Don't silence generation failures or loosen `validateDungeon` to accept practice.

`World.roomById` currently promises every dungeon room. Give shared consumers a truthful playable-layout contract (actual rooms/lookup plus terrain, placements and spawn); keep the generated-world contract complete for generation/scenarios. Use the entrance room identity for practice spawn if useful. No casts, dummy pool/forge rooms or fictional connections to satisfy types. In `buildDungeon.ts` separate mandatory water-pool and lava-forge dressing from shared floor, wall, pillar and door construction. Register the same door object by reference with ECS, picker, actuator and collider; the authored pillar must have both route clearance and a motor collider.

### State, events and effects

Entry is an immutable `dungeon | practice` choice per page load, not a new running mode machine. Only `room=practice` selects the room; there it takes precedence over seed and reload randomization. All other values follow existing startup rules. `click floor`, `steer`, `manual move`, `cancel`, `jump`, `guard`, `request door`, `interact` and fixed-step ticks go to existing handlers/charts; do not mirror their state. A closed unlocked door accepts the normal in-reach open request, an out-of-reach click queues approach, an out-of-reach E leaves it closed. Existing swing state controls passability, not the URL or renderer. Focus loss/menu still clear held intents.

### Ports, adapters and alternatives

Use a small typed content factory/selection function, injected with authored and generated providers for dispatch tests. It needs a domain selection, not `Location`, Babylon or a DOM event. `main.ts` reads the URL and wires the selected provider; Babylon scene construction, input, UI and ECS registration remain the existing edge adapters. A separate HTML entry, copied controller, new input statechart or general-purpose level editor would add parallel behavior rather than test the real game. Editing the layout module is sufficient.

## Expected file changes (implementation only)

| File | Change and reason |
| --- | --- |
| `src/practiceRoom.ts` (new), `src/worldTypes.ts` | Editable layout/factory and narrow shared spatial contract; preserve generated invariants. |
| `src/main.ts`, `src/gameTypes.ts` | Dispatch at bootstrap and isolate dungeon-only scenario lifecycle; share input, camera, combat and loop. |
| `src/buildDungeon.ts`, `src/worldEntities.ts` | Accept playable layout at render/registration boundaries; keep existing door identity, collider publication and tile picking. Narrow dependent read-only signatures where required, not their algorithms. |
| `src/ui.ts`, `README.md` | Show practice room name instead of dungeon objectives; document direct production/local entry, normal URL and layout source. |
| `tests/practiceRoom.test.ts`, `tests/movement-browser.ts`, `tests/production.ts` | Add the red-first contracts above, preserving normal dungeon cases. |

## Edge cases and failure modes

- Hold movement against the partition, pillar, or floor edge, including during a jump: collision/support rules still apply. Clicking void must not teleport or bypass the partition.
- Rotate the camera or lower quality: visible floor/pillar/door remain pickable where appropriate; a cut-away wall still collides. Opening the door must not leave a stale navigation blocker.
- Reload with both seed and practice parameters: start the authored room. A link to the bare base exits practice; no query-only dev hook or global persisted preference.

## Verification (for implementation)

```sh
node --test tests/practiceRoom.test.ts
npm run typecheck
npm run lint
npm run format:check
npm test
npm run check:full
npm run build && npm run test:production
npm run build:pages && DEMO_URL=http://localhost:4187/the-hollow-crown/ npm run test:production
```

With `npm run dev` running in a separate terminal, run `npm run test:movement`, `npm run test:jump` and `npm run test:defense` sequentially in real Chromium. Inspect a room capture and play both door approaches: the door leaf, landing and route beside the pillar should read clearly at default zoom. Compare normal seeded play for camera, controls, objective HUD and locked-door progression. Record actual results only after implementation.

## Risks, rollout and scope

The main regression risk is treating dungeon-specific preparation as universal, or accidentally disabling it for normal play. Keep practice opt-in, exercise both boot paths in the same build, and retain existing generation and browser gates. Rollback is removal of the practice provider/entry without changing movement semantics. Story 13.2 owns the in-session reset and optional foe; page reload here is ordinary direct entry, not that feature. No attacks tutorial, key rebinding, Epic 1 changes or dependency sign-off, roadmap status changes, deployment, or runtime edits in this planning task.
