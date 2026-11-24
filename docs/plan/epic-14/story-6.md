# Preview the actual enemy pick

- **Task source**: `docs/plan/roadmap.md:115–117`
- **Epic / Story**: 14 / 6; depends on 14.5; preserve delivered 14.7
- **Status**: proposed
- **Branch**: main (planning baseline `d7f6562`)

## Goal

Give the gameplay canvas a locally drawn animated skeleton-hand cursor. Before a click, show a sword and a red ground ring only for the enemy that click would engage.

## Acceptance criteria

- [ ] On ordinary dungeon floor and in practice, the hand cycles through distinct crisp pixel frames with a fixed hotspot. A live pickable enemy under that hotspot changes hand to sword and places the red ring under its feet. No external images or requests.
- [ ] Enter, exit and re-enter the practice skeleton without changing target, route, wind-up or HP. Click commits exactly its ID; releasing or leaving the canvas does not cancel a valid pursuit. F retains the delivered interrupt and 240 ms lowering behavior.
- [ ] In dungeon overlap, rotation with pointer stationary, camera zoom, motion, occlusion or death can change the nearest visible pick. Sword/ring and 14.4 object outline never promise different targets. Modal/inspection, blur, reset, regeneration and disposal clear stale cues and restore normal UI cursor.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Pick to feedback | Proposed `tests/pointer-preview.test.ts` | Map floor, enemy, object, none and suspended to mutually exclusive cues; target ID is read-only. Same ray and depth tie produce same published and clicked ID. | Red: no preview projection. |
| Hover is not combat | `tests/combat-browser.ts` | Practice hover/leave/click/release; compare hovered ID, committed ID and attack clocks. Ordinary overlap and stationary-cursor rotation; kill target, enter modal and regenerate. | Red: ring currently reflects selection, not pre-click enemy. |
| Visual and cleanup | `tests/browser.ts`, `tests/resources-browser.ts` | Gameplay zoom captures of hand frames, sword and ring; repeated entry/reset does not grow mesh/material or cursor resources. | Red: no local hand animation or hover ring. |

## Design

**State/events/effects:** compose 14.4's pick result into inactive, hand, hand+object outline or sword+enemy ring. Sample latest absolute canvas point after camera/world changes, not just DOM move; on primary DOWN resolve current pick synchronously through the same arbiter. Entering/leaving a cue changes only presentation. Preview loss clears only preview; lifecycle stop still clears commands as specified in 14.3. Held floor steering does not become a new attack on hover. Keep the existing committed selection distinct; when previewing the selected enemy avoid doubled rings.

**Ports/adapters:** resolver consumes current visible hit distances/IDs and eligibility, presentation consumes only its result. `main.ts` wires the camera ray, enemy/object pick adapters and active canvas. Use tiny generated pixel masks and a pointer-events-none canvas overlay at client coordinates with a fixed hotspot and nearest-neighbor scaling; clip/hide at HUD boundaries, hide native cursor only while overlay is active. Reuse a single non-pickable red torus updated from live actor support height. Reject nearest projected center and a transparent overlay that intercepts clicks. Do not call combat.target to drive hover.

## File changes

| File | Change | Why |
| --- | --- | --- |
| `src/main.ts`, 14.4 pick resolver | Refresh one shared hit result for hover and actual click. | No independent priority rules. |
| `src/enemyRendering.ts` | Keep committed selection; add one reusable preview ring. | Preview never writes target. |
| Proposed `src/gameCursor.ts`, `src/style.css` | Procedural glyph frames, hotspot, visibility and cleanup. | Local, crisp art with capturable output. |
| Tests above | Compare ID, visual cues and unchanged combat state. | Catch misleading graphics even when targeting works. |

## Edge cases and failure modes

Stationary mouse while a nearer enemy crosses, an object opens, or a wall cutaway changes: refresh against visible geometry. Pointer over menu/another window must not leave a sword behind. Use stable depth ties and exclude cues themselves from pick candidates.

## Verification

```sh
npm test && npm run typecheck && npm run lint && npm run format:check && npm run check:full && npm run build
# Against npm run dev, sequentially; inspect captures at gameplay zoom:
npm run test:combat && npm run test:browser && npm run test:inspection && npm run test:resources && npm run test:defense
npm run test:production
```

## Risks and rollout

Hidden cursor over UI or mismatch on scaled canvases: test both quality levels, rotation and viewport offsets, including exit and immediate re-entry. Reuse frame resources; avoid per-frame textures or full-scene outline allocation.

## Out of scope

No targeting assist, changes to hitboxes, auto-engagement on hover or revision of 14.7.
