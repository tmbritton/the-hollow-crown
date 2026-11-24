# Close a door from its swing path

- **Task source**: `docs/plan/roadmap.md:112–114`
- **Epic / Story**: 14 / 5; depends on 14.4
- **Status**: proposed
- **Branch**: main (planning baseline `d7f6562`)

## Goal

The moving leaf can pass through the hero visually. The closed threshold remains a barrier in both directions; closing is never a means of forcing the hero across it.

## Acceptance criteria

- [ ] From the swing area, click to close in practice; reopen and repeat with E. From the other side repeat in a dungeon. Door reaches closed angle and holds, with no involuntary hero displacement; hero can retreat and reopen from their side.
- [ ] Even at the jamb or straddling the final footprint the hero has a legal way back without crossing a closed threshold. Closed doors block route, motor and attack sight immediately under existing close timing. Floor commands do not operate doors.
- [ ] NPC occupancy protection remains. Locked throne gate refuses use before altar; altar unlocks, does not silently open it.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Occupancy partitions | `tests/models/cases.ts`, `tests/navigation.test.ts` | Both axes/sides: hero in sweep vs NPC in threshold, close to rest, no oscillation, closed path blocked and same-side withdrawal available. | Red: hero blocks close command or reopens on occupied tick. NPC-only branch remains green. |
| Both use paths | `tests/movement-browser.ts`, `tests/combat-browser.ts` | Real clicks/E close while stationary; sample hero position and leaf angle until settled, then attempt floor travel and melee across it, reopen and walk through. Repeat opposite side and test sealed gate. | Red: occupancy refusal in hero-only case. |

## Design

Use 14.4's one door operation. Separate **who prevents closing** from **what blocks passage**. `main.ts` currently reserves the full swing; `updateDoors` samples living bodies again on ticks. Exclude only the hero from swing reservation and anti-crush reopen checks, consistently at command and tick. Retain NPC footprint/height checks. Drive route, collision and attack queries from the same referenced door state; leaf angle is presentation, not a new passability rule.

**State/events/effects:** retain locked/closed/opening/open/closing and existing reversal policy for NPCs. Eligible CLOSE with only hero nearby → closing → closed on ticks; locked OPEN/CLOSE is rejected, UNLOCK requires progression. Solid threshold is active on close. If hero intersects the final solid, keep last approached side (for centerline tie use last noncentral position); permit only clearance-increasing same-side retreat until clear, or explicit reopen. Reuse 14.2 separating-step proof; never slide, push or teleport on CLOSE. End any overlap exception on exit, reopen, teleport or reset.

**Ports/adapters:** domain reads occupancy facts by actor identity, not render-mesh contacts. `worldEntities.ts` supplies living sample, door machine returns state/angle, Babylon updates pivot and collider. Reject disabling all door collision for the animation or ignoring all living occupancy: both admit real crossings.

## File changes

| File | Change | Why |
| --- | --- | --- |
| `src/main.ts` / 14.4 interaction policy, `src/worldEntities.ts`, `src/livingCandidates.ts` | Filter reservation and tick samples by hero identity. | Neither caller can veto solely for hero in sweep. |
| `src/machines/world/interactions.ts`, `tests/models/cases.ts` | Pin occupied versus hero-only transitions and collider timing. | Prevent accidental reopening. |
| `src/navigation.ts`, `src/actors.ts`, tests above | Exercise same-side escape at final footprint; specialize only if shared separation cannot enforce it. | No trap or phase-through. |

## Edge cases and failure modes

Concurrent NPC entry still follows existing reopen policy. On rapid toggle discard outdated expected operation. Walking along or into the plane is not outward escape. Ignore dead or vertically separate occupants as before.

## Verification

```sh
npm run test:models && npm test && npm run typecheck && npm run lint && npm run format:check && npm run check:full && npm run build
# Against npm run dev:
npm run test:movement && npm run test:combat && npm run test:browser
```

## Risks and rollout

A visually closed but pathable door is worse than the original refusal. Require route, motor, sight and angle assertions on the same closed door before accepting either browser path.

## Out of scope

No changes to AI door capability, locks, altar progression, world placement or attack reach.
