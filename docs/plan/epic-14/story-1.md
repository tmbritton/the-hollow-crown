# Steer past the map edge

- **Task source**: `docs/plan/roadmap.md:100–102`
- **Epic / Story**: 14 / 1; depends on 13.2
- **Status**: proposed
- **Branch**: main (planning baseline `d7f6562`)

## Goal

Let the player keep steering along the edge of the room without finding a tiny strip of valid pixels. A click names a world destination, not a direction relative to the hero.

## Acceptance criteria

- [ ] In practice, hold beyond the edge, sweep parallel to it and return to an interior point. The hero follows all three requests without release; the gold ring marks the effective endpoint, never the void.
- [ ] In the dungeon, a void or disconnected target resolves to the closest safely reachable frontier. Every traversed segment has support and clearance; a closed gate remains closed. An exact reachable sub-tile pick stays exact.
- [ ] With the hero stopped and camera fixed, repeating the same invalid aim does not oscillate endpoints or restart an unchanged completed search.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Aim versus support | `tests/partial-navigation.test.ts` | Actual tile hit wins at its own elevation; on miss a downward ray yields absolute horizontal intent, not invented support. Compare reachable endpoint against an exhaustive small-grid reference including ties and a gated island. | Red for missing miss-to-intent path; existing pickGround miss test stays green. |
| Edge sweep | `tests/movement-browser.ts` | Absolute canvas mouse down/moves, no keys, in practice and seeded dungeon; observe route endpoint, marker and final position; return to floor still held. | Red: `navigatePointer` cancels on miss. |

## Design

Keep `pickGround` truthful. For a miss inside the gameplay canvas, intersect the same camera ray with a horizontal reference plane at the command's starting support height; retain that reference for the gesture. Pass the resulting finite forward intersection as *requested*, not walkable, to the existing partial route solver. Score only reachable clearance-proved endpoints by distance to request, with stable tie order. Test existing partial selection before changing it.

**State/events/effects:** primary DOWN enters floor or target as today. Only floor DOWN/held MOVE produces request/followFloor. UP ends steering, not the committed route; CANCEL retires gesture, reference height and route. Invalid projection produces no new route; hovering HUD or holding over an enemy never synthesizes a target click. Ring reads Navigator.destination, not aim.

**Ports/adapters:** `main.ts` converts current absolute client position, canvas bounds and camera to GroundRay; pure aim calculation consumes ray/height/tiles. Navigator owns legal endpoints and the shared budget. Reject clamping to map bounds (holes and sealed islands remain) and relative mouse deltas (camera changes break accuracy).

## File changes

| File | Change | Why |
| --- | --- | --- |
| `src/main.ts`, `src/navigation.ts` | Separate aim projection from supported hit; feed partial request on miss. | Preserve existing support and gate predicates. |
| `src/machines/ui/pointer.ts`, `tests/models/cases.ts` | Carry gesture reference through floor state and cover clear/replacement. | No stale plane after reset. |
| `tests/partial-navigation.test.ts`, `tests/movement-browser.ts` | Reference endpoint and real-input checks above. | Distinguish projection from routing failures. |

## Edge cases and failure modes

Parallel/upward ray, behind-camera intersection or missing world: no NaN or synthetic support. Rotate camera or move across stairs: use current ray and prefer actual surface. Invalidate cached proofs on changed gate or occupancy. Blur, inspection and regeneration retire pending work before it can publish.

## Verification

With `npm run dev` running for browser checks:

```sh
node --test tests/partial-navigation.test.ts
npm run test:movement
npm test && npm run typecheck && npm run lint && npm run format:check && npm run check:full && npm run build
```

## Risks and rollout

A closest geometric tile can be unreachable. Require the disconnected-map test and check swept movement, not just marker placement, before 14.2.

## Out of scope

No keyboard removal, automatic door use, obstacle escape rewrite or budget increase.
