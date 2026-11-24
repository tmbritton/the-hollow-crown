# Click what E can use

- **Task source**: `docs/plan/roadmap.md:109–111`
- **Epic / Story**: 14 / 4; depends on 14.3
- **Status**: proposed
- **Branch**: main (planning baseline `d7f6562`)

## Goal

Hover an object to see what a click will use, then approach and use that specific object. E keeps its current in-reach selection rules. Neither method gains privileges the other lacks.

## Acceptance criteria

- [ ] In practice a legal door shows a restrained yellow geometry outline, the pillar does not. Click uses the outlined door, including an open leaf, without changing intent on mouse-up. No cue through opaque cover.
- [ ] Compare equivalent dungeon fixtures for open/close, chest, altar, portrait inspection, throne, shrine work, focus disabling and loose tribute: same reach, height, line of sight, prerequisites, HP, progression, evidence, work and UI outcomes for E and click. Test locked, spent and already delivered cases too.
- [ ] From outside reach, click takes a legal approach on reachable floor and acts at most once after revalidation. It cannot open unrelated doors, inspect through cover, operate a neighbor, replay rewards or claim the throne before kindling. Hover alone has no gameplay effects.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Identity and parity table | Proposed `tests/player-interaction.test.ts` | Each target kind and stale/ineligible counterpart; E uses nearby priority, click uses exact ID and expected operation. Change state between click and arrival; count effects. | Red: E currently scans tribute/ember/nearest, click path only opens doors. |
| Real outline and arrival | `tests/movement-browser.ts`, `tests/inspection-browser.ts`, `tests/browser.ts` | Practice door vs pillar; ordinary run approach, occlusion and overlapping picks; compare equivalent E state. | Red: no shared cue, no portrait/chest click. |
| Scenario parity | `tests/last-ember-browser.ts`, `tests/tribute-browser.ts`, `tests/objective-work-browser.ts` | Click exact focus, shrine and loose crate; move away from work or let another actor take cargo en route. | Red: scenario sites are not click targets. |

## Design

Split `main.ts:interact` into selection and execution. A plain target reference contains run identity, stable ID, kind and intended operation (e.g. close, not toggle). E selects the current nearby candidate in existing priority order; click resolves the foremost visible surface to one object/enemy/floor using the absolute ray and deterministic depth/tie rule. Geometry adapters map child meshes/instances to owners, including open leaves and non-ECS scenario props. An occluder is not transparent just because it lacks an interaction ID. Publish the same result for feedback and click; refresh on camera/eligibility changes. A distant **eligible approach** is distinct from **usable now**; never outline a locked, invisible or unreachable action as available.

**State/events/effects:** idle → approaching(ref) on valid out-of-reach click; immediate use if in reach. Use existing budgeted navigator to reach a legal visible approach, not the object's center. On arrival, resolve same run/ID, operation, reach, height, sight and current eligibility again, consume intent once, then invoke existing domain operation and UI effects. Failure, replacement, lifecycle cancel or disposal clears pending use; UP alone does not. An invalid selected ID never falls back to `interact()`/nearest. Keep E's inspection-close behavior modal-only. Held floor updates remain floor-only.

**Ports/adapters:** pure use policy consumes target facts and returns approach/use/rejection. `main.ts` wires world/ECS, scenario runtimes, navigation, renderer and UI. Extend scenario APIs to address exact IDs without duplicating reward logic. Use a small shared pick result for 14.6, not a second hover ray with different filters. Reject simulating E at arrival: another nearer object or tribute can steal the action.

## File changes

| File | Change | Why |
| --- | --- | --- |
| `src/main.ts`, proposed `src/playerInteraction.ts`, `src/combat.ts` | Share targeted eligibility/execution; replace player-only open-door shortcut without changing AI. | One operation and one owner per click. |
| `src/buildDungeon.ts`, `src/lastEmberRendering.ts`, `src/tributeRendering.ts`, `src/enemyRendering.ts` | Expose visible geometry ownership and a non-pickable outline. | Depth arbitration and truthful cue. |
| `src/lastEmber.ts`, `src/tribute.ts` | Resolve exact site/crate, validate and consume once. | Avoid proximity-only substitution. |
| Tests above, `tests/models/cases.ts` | Cover targeting, arrival, abort and parity; model any new chart. | Test world effects independently of rendering. |

## Edge cases and failure modes

Door changes state mid-route, crate carried off, entity reused after regen, modal begins during approach: abandon old request. Repeated click on spent chest must not replay healing. Blocked door-close remains subject to existing occupancy policy until 14.5.

## Verification

```sh
npm test && npm run typecheck && npm run lint && npm run format:check && npm run check:full && npm run build
# Against npm run dev; compare screenshots of hover and occlusion at gameplay zoom.
for s in movement browser inspection portraits discoveries objective-work last-ember tribute combat; do npm run "test:$s" || exit 1; done
```

## Risks and rollout

Merged scenery may not identify an individual owner. Add bounded target geometry only where necessary and verify it cannot win through cover. Use parity fixtures before enabling the pointer path for each target family.

## Out of scope

No door swing relaxation yet, enemy cursor art, new E interaction types or changes to scenario progression.
