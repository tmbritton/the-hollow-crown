# Show the hero taking a hit

- **Task source**: `docs/plan/roadmap.md:121–123`; accepted combat contract at lines 118–120
- **Epic / Story**: 14 / 8; depends on delivered 14.7 (`9364596`), planned after 14.6
- **Status**: proposed
- **Branch**: main (planning baseline `d7f6562`)

## Goal

At gameplay zoom an unblocked skeleton hit should read as the hero recoiling, not as another sword swing. The reaction communicates damage already accepted; it cannot influence the next attack or defense decision.

## Acceptance criteria

- [ ] Compare practice captures at matched camera and scale: outgoing swing alone has no hurt pose, accepted nonlethal incoming hit visibly recoils and decays, frontal block has shield recoil but no flinch or HP loss. Repeat a real exchange in the dungeon.
- [ ] Exactly one reaction onset per accepted hit; misses, rejected damage, invulnerability, healing and the hero damaging an enemy produce none. Lethal damage goes directly to existing death handoff.
- [ ] With reaction on/off, same fixed inputs yield identical HP, impacts, eligibility, position, attack and guard clocks. Guard can interrupt wind-up, release ends protection immediately and next swing waits only the existing 240 ms lowering. No pose remains after respawn, teleport, reset or regeneration.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Damage outcome matrix | Proposed `tests/player-hurt.test.ts` | Use real combat acceptance for player vs other recipient, rejected/blocked/accepted/lethal; compare feedback sequence and HP. | Red: accepted damage has particles but no player hurt signal. |
| Pose envelope and parity | `tests/player-hurt.test.ts` | Sample fixed ticks at onset/peak/end, second hit, death and reset. Compare final semantic torso pose vs swing/block, and gameplay snapshots with and without presentation. | Red: no distinct recoverable hurt offset. |
| Readability in play | `tests/defense-browser.ts`, `tests/combat-browser.ts` | Real skeleton engagement in practice and dungeon; sample HP, final drawn hero silhouette and shield response on actual impact ticks. Press F during recovery, release, check resumed pursuit and swing timing. | Red: hurt capture not distinct despite HP loss. |

## Design

At `Combat`'s `target.health.damage(amount)` success boundary, publish a small run-local player-only feedback sample for a living survivor. Preserve existing work interrupt, particles, block path and lethal handoff order. Do not infer damage from HP polling, the attacker's animation or particles. Sample an upper-body recoil (short torso tuck/shoulder withdrawal with fast onset and return) as a semantic layer before rig solving. Grounded feet, root, collision body and weapon impact origin stay authoritative; shield protection and death pose have priority.

**State/events/effects:** neutral + accepted nonlethal hit → recoiling(sequence, start tick); new hit replaces the sample, never stacks offsets. Sample fixed simulation age, return to neutral after a bounded envelope (start with 180 ms; validate at gameplay zoom). Other outcomes cannot start/restart recoil. No ticking through pause; cancellation/reset/death clears sample and restores neutral rig. While shield raised preserve grip and shield targets even during recoil. Events have no combat effects. A tagged sample plus pure envelope is sufficient, no parallel attack statechart.

**Ports/adapters:** actor ECS owns feedback; combat writes an accepted event, rig reads it without a callback into combat. Inject caller-owned simulation time like `blockFeedback.ts`; composition at actor creation and fixed-step rig update. Reject hit-stun/cooldown or replacing the attack clip: either changes play or obscures the cause of the reaction.

## File changes

| File | Change | Why |
| --- | --- | --- |
| `src/combat.ts`, `src/ecs.ts`, `src/actors.ts` | Publish typed, player-owned feedback only for the surviving recipient; initialize and retire with actor/run. | Prevent wrong-recipient or stale hits. |
| `src/rigs/actions.ts`, `src/rigs/bindings.ts`, proposed `src/playerHurt.ts` | Bounded pose sampler and semantic composition/reset. | Avoid direct mesh writes fighting the final solver. |
| Tests above | Deterministic acceptance/pose comparisons plus paired visual evidence. | Verify legibility and clock independence separately. |

## Edge cases and failure modes

Unblocked rear hit while guarding is damage, not a frontal block. Multiple ticks for one event must not restart it. Consecutive hits replace rather than amplify. Death mid-recoil must preserve authoritative pre-stop handoff and never leak a living offset to the next hero.

## Verification

```sh
node --test tests/player-hurt.test.ts
npm test && npm run typecheck && npm run lint && npm run format:check && npm run check:full && npm run build
# Against npm run dev, inspect matched swing/hurt/block captures in each mode:
for s in combat defense animation rig:actions rig:shield:transitions rig:handoff; do npm run "test:$s" || exit 1; done
```

## Risks and rollout

An offset can be numerically nonzero but invisible at gameplay zoom, or it can pull hands off equipment. Review actual rendered poses and keep grip/contact assertions alongside the gameplay parity run. Tune only presentation amplitude/envelope if either visual comparison fails.

## Out of scope

No hit-stun, damage tuning, new NPC reaction, camera shake or changes to delivered 14.7 attack-on-reach and defense timing.
