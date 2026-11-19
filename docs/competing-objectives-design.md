# Competing objectives — a level with several agendas

**Status:** authoritative user-directed target. O1 is complete and independently reviewed at
`6f79a97`; O2's physical work and runtime boundaries are complete and independently reviewed at
`d698f27`. **O3 (§6) is complete at `9be81bb`, independently reviewed READY.**
The Last Ember now has physical worker navigation/defense, visible clocks, all three
race outcomes and finite recovery. **O4's independent cargo/carrier plan is implemented,
independently reviewed READY.**
See [implementation progress](implementation-progress.md).

**Date:** 2026-11-18.

## Design direction

**Each level contains several objectives belonging to different participants. Players choose which opportunities to pursue while monsters advance visible plans of their own. The player can race those plans, interrupt their execution, or remove their means of success.**

Here, a level means the current generated keep. This design does not require a multi-floor campaign.

The user's requirements are:

- Multiple objectives can coexist in one level.
- Only some objectives are available for the player to pursue.
- Monsters can own and work toward their own objectives.
- Active competing monster clocks are visible to the player.
- Finishing a player objective can race a monster's completion.
- Killing relevant monsters or disrupting their work can thwart their objectives.

This extends the [progress-clock design](progress-clock-design-notes.md) from player-triggered danger to **independent, interruptible enemy activity**. It combines the objective structures from [Ravenloft](ravenloft-scenario-design-notes.md) with [order-independent encounters and shared facts](encounter-narrative-design-notes.md).

## 1. An objective has an owner and a place in the world

An objective belongs to a player, a particular creature, a group, or eventually a faction. Its owner identifies whose plan it is; its **executors** are the actual actors capable of doing the work. A group plan can survive one worker's death if an eligible survivor can take over.

Separate these questions:

| Question | Example |
| --- | --- |
| **Does the objective exist in this seed?** | This keep has a shrine sabotage scenario, but no evacuation/heist scenario. |
| **Who can pursue it?** | The hero can restore the shrine. The profaners can corrupt it. The hero can disrupt their plan without adopting it. |
| **Are its prerequisites currently satisfied?** | A peaceful resolution requires a living participant; an optional rite requires its evidence. |
| **Does the player know about it?** | An optional discovery can remain unknown, while an active threatening plan is announced with its clock. |
| **Is work currently possible?** | The ritual exists and remains unresolved, but its only worker is fighting or cannot reach the focus. |
| **What has resolved?** | The shrine was restored, its corruption was completed, or the enemy plan was permanently thwarted. |

Availability, knowledge, and progress are separate. Displaying a monster objective does not turn it into a player quest. Selecting a player objective in the UI does not start or stop the other participants' work.

Player opportunities may be unconditional, unlocked by discovery, unlocked by another outcome, or mutually exclusive. For example, a later choice to preserve a relic can exclude consuming it for power. An unavailable discovered objective should explain its unmet condition or why it was lost.

## 2. Monster clocks advance because monsters act

An enemy executor has a concrete job:

1. Reach the relevant place through ordinary navigation.
2. Acquire access to the required object, material, or position.
3. Perform a readable work action.
4. Commit a contribution when that action completes.
5. Continue, defend itself, repair an interruption, or abandon the job according to its behavior.

Examples include channeling at a ritual focus, carrying supplies to an exit, preparing a siege mechanism, or reaching an alarm bell. Work can take simulation time, but the timer runs only while the executor is actually eligible and performing it. A clock cannot keep advancing as though a dead or blocked worker were still busy.

An objective can remain active off-screen. Its execution follows the same simulation rules, and its visible clock continues to report progress. A creature's choice to defend itself temporarily creates a tactical opening: drawing a ritualist into combat can buy time even if the player cannot defeat it yet.

Each plan declares how it starts: active at the beginning of the run, awakened by a world milestone, or activated by a clear regional event. A relevant enemy clock is announced when it activates, independently of whether the player has accepted an associated objective. Activation timing, travel distance, and work duration must allow a meaningful response window.

Use explicit role priorities: a worker may defend itself when threatened and resume work after losing the threat; an escort may protect a carrier; a saboteur may prioritize finishing a nearly completed action. Existing species behavior remains the foundation, but objective work requires new intents and tested interruption rules.

## 3. Thwarting has several meanings

| Intervention | Immediate effect | What persists / what might happen next |
| --- | --- | --- |
| **Draw the worker away or interrupt its action** | Work stalls; the unfinished contribution is cancelled or paused according to the action contract. | Previously committed progress remains. The worker can return and resume. |
| **Eliminate an executor** | That actor can no longer contribute. | A unique-executor plan is thwarted. A group-owned plan can continue only through its declared eligible survivors. |
| **Destroy or permanently disable essential equipment** | The plan loses a required dependency. | It is thwarted if no authored repair or replacement exists. Killing its participants is unnecessary. |
| **Take or deny a required resource** | Work stalls or becomes impossible. | Surviving actors can try to recover it only if the scenario supports that behavior. |
| **Undo completed work** | A defined amount of progress is removed, with a matching world change. | Only explicitly reversible objectives support regression. Ordinary damage does not automatically subtract objective progress. |
| **Finish an opposing objective** | The world may invalidate the enemy plan. | Restoring a ward can make its profanation impossible. Unrelated enemy plans continue. |
| **Obstruct the approach** | The worker must reroute, operate an ordinary door if capable, or stall. | A temporary obstacle is a delay. A permanently impossible plan needs a declared recovery or thwarted outcome. |

The clock panel should make the distinction visible: **Working**, **Interrupted**, **Blocked**, **Completed**, or **Thwarted**, with a short explanation when known.

Killing a ritualist after its ritual completes does not undo an already summoned creature. Killing a carrier after a delivery does not recover the delivered supplies automatically. Prevention and reversing an accomplished outcome are different interactions.

For group plans, replacement workers come from a bounded, seeded roster. They travel to the workplace and obey ordinary collision and capability rules. There are no invisible replacements keeping a clock alive. A dead leader does not automatically defeat every plan of its faction.

## 4. Relationships between objectives

Connect objectives explicitly rather than treating every clock as part of one global race:

- **Competes with:** restoration versus profanation of one shrine; retrieval versus destruction of one cache.
- **Disables:** destroying a ritual focus permanently thwarts its summoning objective.
- **Unlocks:** deciphering an oath enables a more effective rite or an optional peaceful resolution.
- **Helps:** interrupting enemy preparations buys time without resolving the player goal.
- **Shares a resource:** two plans need the same relic, worker, or route, creating an explicit allocation/conflict problem.
- **Independent:** the player may restore the shrine while scavengers continue trying to escape elsewhere.

Completing a player clock resolves its declared relationships. It does not freeze the level or cancel unrelated objectives. Some monster successes can remove an optional reward; others can change a route, activate bounded opposition, or create a recovery objective.

### Race outcomes must be authored

For each direct race, specify player-first, monster-first, and simultaneous-completion outcomes. If both accomplishments can coexist, preserve both. If the goals require mutually exclusive world states, define a single contested outcome instead of making an object simultaneously purified and corrupted or giving the same relic to two owners.

Resolve accepted contributions as a batch after the tick's authoritative world/combat changes. For the first work-action implementation, a worker killed or interrupted at that commit boundary contributes nothing from its unfinished action; contributions committed in earlier steps remain. Evaluate race outcomes after all valid same-step contributions so iteration order does not choose the winner.

Required altar-before-throne progression remains validated in the initial implementation. Enemy victory in an optional contest changes that scenario's outcome. Whole-run loss or alternative victory rules belong to an explicitly designed adventure mode with its own response and reachability guarantees.

## 5. Example level: the contested reliquary

The ordinary Crown objective remains available. A generated level can also contain the following agendas; these numbers illustrate design structure rather than tuned balance.

| Objective | Owner / availability | Progress and consequence | Player options |
| --- | --- | --- | --- |
| **Restore the Last Ember — 6** | Player; available at the optional shrine | Completed ward interventions restore the shrine and prevent further profanation. | Work directly, find the matching rite, or first interrupt the enemy worker. |
| **Profane the Last Ember — 6** | A named goblin ward-breaker; enemy-only, with a visible active clock | Completed sabotage cycles at its focus corrupt the shrine and close the original restoration opportunity. | Kill the unique ward-breaker, disable its focus, lure it away, or finish restoration first. |
| **Recover the old rite** | Player; offered only when relevant evidence exists and is discovered | A factual discovery unlocks a stronger restoration method. This small version needs no separate clock. | Spend time investigating while other plans continue, or use the ordinary method. |
| **Carry away the royal tribute — 4** | A separate kobold group; enemy-only, with a visible active clock | Distinct deliveries to an exit remove a bounded optional cache. | Intercept carriers, recover undelivered cargo, or block a supported route. |

The goblin and kobolds are separate groups under current species-hostility behavior. Any cooperation or shared faction assignment awaits the planned faction system. Objective work and focus disabling are implemented in O3; cargo ownership and deliveries are implemented in O4, pending independent review.

This creates a route decision: finishing the shrine quickly may allow the tribute to leave; intercepting carriers may give the ward-breaker time to corrupt the shrine. Killing the ward-breaker first can remove that pressure but costs travel and combat time. Learning the rite may repay the detour by reducing the work needed afterward.

Not every objective needs to be achievable in one run. Optional outcomes can trade off, but the map should make the choice understandable and preserve the required completion path.

## 6. First playable objective-system slice

**Implemented O3, 2026-11-19; independent review READY.** The following describes the delivered
scope. The authored activation is approach to the entrance shrine (four units from its work face)
or entry into the smithy. Restoration uses six 6-second cycles; the entrance portrait's factual
rite gives two seals per cycle. Profanation requires six 20-second cycles at the forge anvil.
The named executor is the existing smithy goblin; it retains the profile-linked identity when
already named. Restore/cleanse/repair heal 30/10/15 once, with separate follow-up objective IDs.
Sites reuse reserved geometry and are validated before the altar; no hidden replacement actor
or equipment repair exists. See README for controls, composition APIs and exact pause/cancel rules.

Build a small version of the example before introducing several competing groups:

- One optional shrine restoration objective and its six-segment clock.
- One named goblin executor with a six-segment profanation clock.
- One reachable, disableable focus.
- One optional clue that improves the player's restoration contribution.
- Existing movement, living-actor collision, ordinary combat, and a new readable work action.

The enemy starts work after a clear scenario activation and keeps working off-screen if uninterrupted. Its per-contribution duration is a tuning parameter chosen against travel, combat, and player work times. Repeated work cycles receive distinct contribution IDs; replaying the completion event from one cycle cannot count twice.

Define these outcomes:

| Event | Result |
| --- | --- |
| **Player completes restoration first** | The shrine becomes restored, its outcome is claimed once, and the dependent profanation objective is thwarted. The goblin remains a real actor if still alive. |
| **Goblin completes profanation first** | The shrine becomes corrupted and the original restoration objective is lost. A declared cleansing follow-up can become available after the focus is disabled; it has its own identity and outcomes. |
| **Both complete in the same step** | The ward fractures: neither exclusive endpoint is installed. Record a contested outcome and expose a finite repair interaction after the hostile focus is disabled. |
| **Goblin dies before completion** | Its unique-executor objective is thwarted; restoration remains available with existing progress. |
| **Player disables the focus before completion** | Profanation is permanently thwarted; the living goblin may fight, but cannot continue this ritual. |
| **Goblin is temporarily displaced or engaged** | Profanation stalls and retains completed progress. Resume only when it can return and work again. |

The follow-up uses the same shrine and a once-only interaction rather than silently resetting the original race. It can produce a lesser recovery outcome; it cannot duplicate a successful restoration's reward. If the focus was already disabled, that prerequisite is already satisfied. Once profanation has completed, later killing the goblin or disabling the focus does not retroactively change who won.

Within-run respawn preserves committed progress, actor deaths, disabled equipment, and resolved outcomes. It clears unfinished hero work. Regeneration replaces all of them. Menus, inspection, and hidden-tab suspension follow the existing simulation pause policy.

After this slice works, add the second independent monster plan and evaluate whether the player has enough information and travel time to make an interesting choice between them.

### Delivered O4 scope (pending independent review)

Four unique optional crates in the stairs room, one existing three-kobold roster and a declared
stable hatch. One porter at a time performs 20s packing, real travel and 8s unloading; only a
validated delivery advances the four-segment clock. Death drops only undelivered cargo; surviving
original workers travel to recover it. E secures nearby loose cargo for +10 health once per crate.
All remaining cargo denied or no surviving original workers thwarts further deliveries, preserving
earlier progress. Four deliveries permanently complete the theft. Neither outcome resolves O3.

Both warnings activate at the shrine/smithy; entering stairs/stable can activate tribute earlier.
The 100 tribute seeds' longest shrine/cache route is 126 tile steps, allowing ~26s walking plus
36s restoration against a minimum 112s porter work plus travel. This is a geometric response budget,
not a combat-difficulty guarantee. Both plans share one O2 installation and post-combat commit.
See README for API, controls and persistence; VERIFICATION records actual checks.

## 7. Visible clocks without an overloaded HUD

**Every active monster objective that competes with or threatens the player's current opportunities must have a visible clock.** It is announced at activation, even when its executor is in another room. This refines the earlier general possibility of hidden clocks: hidden competitive deadlines are outside this design's initial scope.

Show:

- Objective name and responsible creature/group when known.
- Progress out of capacity and an unmistakable completion consequence.
- Working/stalled/resolved status, with the reason when the player has evidence for it.
- A target region or known location, plus discovered means of disruption.

Keep active competing clocks available in a compact agenda strip or persistent expandable panel while the selected player objective is highlighted. The broader map/agenda view includes all announced active plans. Choosing to track a different objective changes presentation only. Dormant optional opportunities can remain undiscovered until found.

Showing a strategic progress clock is a deliberate information grant. It need not reveal an unseen actor's exact position, its hidden biography, or an unwitnessed killer's identity. A stalled clock can report that work has stopped while leaving its cause unknown. Contextual text and the discovery journal still follow the actual knowledge rules.

World feedback should reinforce the panel: ritual pulses, changing ward geometry, moving carriers, or a working mechanism. A visible frozen clock and an idle worker should agree.

## 8. Generation, runtime ownership, and pacing

Extend the proposed `AdventurePlan` with a **level objective plan**: objective IDs, owners, eligible participants, executor assignments, targets, resources, availability/activation conditions, clock definitions, relationship edges, disruption policies, and outcome definitions.

Assign a bounded objective workload. For the first slice, one actor services one work assignment at a time; later groups need an explicit assignment policy so one worker cannot contribute to several clocks simultaneously. Resolve references through the ECS and authoritative interaction state. Objective state must not duplicate health, corpse, door, or item ownership facts.

Reserve both work sites and intervention routes during generation. Include travel time, interruptions, nearby encounters, and potential convergence when budgeting pressure. A race's fairness depends on reachable routes and available actions, not merely equal segment counts. All resource/focus placements needed for a promised disruption method must be reachable.

Begin with one autonomous rival, then a small number of simultaneous plans. Seed selection can leave some opportunities dormant or exclude them entirely. Once active, an objective's rules do not secretly change because the player is winning, losing, looking elsewhere, or ignoring it.

## 9. Acceptance when implemented

- Player eligibility, discovery, activation, and workability are independently represented.
- Monster work advances while the player pursues another goal, with visible updates and the declared activation policy.
- Idle, dead, interrupted, unreachable, or unequipped executors cannot generate work contributions.
- Killing the unique executor or permanently disabling its dependency thwarts the plan; a supported takeover uses only an eligible, physically present survivor.
- Delay, regression, and permanent thwarting have distinct effects and readable presentation.
- Work cannot duplicate through repeated callbacks, actor replacement, re-entry, or respawn.
- Simultaneous completion and same-step death/interruption follow the authored commit and conflict rules.
- Completing one goal affects only its declared relationships; other plans continue.
- Monster-first and contested outcomes leave their promised follow-ups reachable and preserve core progression.
- Optional goals can be unavailable or lost without being falsely shown as completable.
- Across seeds, initial warning plus travel/intervention opportunities provide a meaningful response window.
- Browser checks show the clocks and actual actor work agreeing, including off-screen work, interruption, and focus destruction.
- New exported machines receive model specifications; integrated goal/actor/geometry behavior receives separate simulation and browser coverage.
