# Progress clocks — scenario progress and pressure

**Status:** proposed design and implementation guidance; scenario clocks are not yet implemented.

**Date:** 2026-11-18.

## Source

John Harper / One Seven Design, **Blades in the Dark SRD**, using the [supplied Markdown source](https://github.com/amazingrando/blades-in-the-dark-srd-content/blob/main/Blades-in-the-Dark-SRD.md) and the [official Progress Clocks page](https://bladesinthedark.com/progress-clocks).

Saved an [unmodified local SRD snapshot](../ref/blades-in-the-dark-srd.md) with a [source/revision record](../ref/blades-in-the-dark-srd-source.md). Reviewed **Progress clocks**, **Effect**, **Consequences and Harm**, **Gathering Information**, and relevant **Downtime activities** passages. The clock rules below are paraphrased; Hollow Crown scenarios, event policies, and numerical prototypes are our adaptations.

## Recommendation

**Use clocks as a shared way to express multi-step obstacles, accumulating danger, and competing objectives. Advance them through meaningful game events.**

This gives the [Ravenloft scenarios](ravenloft-scenario-design-notes.md) a common progress/pressure vocabulary and connects to [Ingold's encounter state and knowledge separation](encounter-narrative-design-notes.md). The player should understand what is changing, what can influence it, and what completion means.

**User-directed extension:** the [competing objectives design](competing-objectives-design.md) makes levels contain several agendas, with visible monster-owned clocks that advance through actual enemy work. Players can race, kill the executor, or disrupt its dependencies. That is the current playable objective-system target; the player-triggered Last Ember example below remains a smaller clock-mechanics reference.

The SRD's central principles are particularly useful here:

- **Name the obstacle, leaving the method open.** A patrol, unstable ward, or suspicious servant can have several supported solutions.
- **Reflect the situation.** The clock displays progress caused by events; it does not justify inventing events that never happened.
- **Use clocks for complexity.** An ordinary door opening or single relic claim can remain an immediate interaction.
- **Show meaningful advances.** More segments represent more involved obstacles, not a demand for more identical button presses.

## Source rules and our translation

| SRD guidance | Hollow Crown application |
| --- | --- |
| [Progress clocks](../ref/blades-in-the-dark-srd.md#progress-clocks): 4 segments for a complex obstacle, 6 for a more complicated one, 8 for a daunting one. | Start with these readable capacities. Tune them against available decisions and action opportunities, rather than treating capacity as combat difficulty or elapsed seconds. |
| [Effect](../ref/blades-in-the-dark-srd.md#effect): limited, standard, and great effects tick 1, 2, and 3 segments respectively. | Author effect sizes for supported actions. Preparation can improve an action's contribution; the game resolves the actual interaction through its existing real-time rules. |
| [Complications](../ref/blades-in-the-dark-srd.md#complication): minor, standard, and serious complications can tick 1, 2, or 3 danger segments. | A confirmed alarm report, a broken ward, or a deliberately risky action can advance pressure by a stated amount. Each requires a real causal event. |
| Position and effect are separate; an action can accomplish much while exposing the actor to serious consequences. | Preview both benefit and cost: for example, `+3 Ward restoration / +2 Disturbance`. Larger progress need not be the safest choice. |
| A complication should not negate an already successful action. | A completed ritual step remains completed even if it awakens guards. Apply progress and consequence together. |
| [Simple obstacles](../ref/blades-in-the-dark-srd.md#simple-obstacles) resolve without an extended clock. | Keep the first Borrowed Heart vessel interaction as a once-only event. Add a clock only if a later version genuinely involves multiple stages or approaches. |

The prototype uses deterministic, authored responses to simulation events. Its scope is progress and pressure; it does not require the SRD's action-roll, stress, trauma, or downtime systems. The SRD also has a separate result-to-progress schedule for downtime projects, so its 1/2/3 effect guidance should not be described as a universal rule for every clock use.

## Clock patterns worth keeping

| Pattern | Source behavior | Candidate use |
| --- | --- | --- |
| **Progress / obstacle** | Track cumulative effort against a complex obstacle. | Restore the Last Ember's ward through several physical interventions. |
| **Danger** | Consequences accumulate until a threat comes to fruition. | Disturbance awakens a reserved group; evidence of intrusion causes a local alarm. |
| **Racing** | Two opposed clocks compete; simultaneous completion can have a mixed outcome. | Reach an extraction point before a rival seals the route, or search a chamber before a hazard overtakes it. Explicitly author what each outcome changes. |
| **Linked** | Completing one clock unlocks another. | A later multi-stage vessel: expose its binding, then sever it. An actual physical prerequisite remains required even if the player already knows the solution. |
| **Mission** | A window of opportunity closes or changes the mission. | A future heist's awakening deadline. Specify whether progress comes from milestones or active simulation time. |
| **Tug-of-war** | Events can fill and empty the clock. | A servant's agitation or a contested ward, once relevant interactions and counteractions exist. Learned facts remain learned even when agitation changes. |
| **Long-term project / faction** | Projects track extended work; faction goals advance during downtime and through player interference. | Later persistent expeditions or a bounded faction plan. Our current short run has no downtime phase, so any within-run version needs its own declared triggers. |

These are compositional patterns. A race can pair ordinary progress counters; linked stages belong to a scenario's statechart. They do not require seven unrelated runtime systems.

## First clock prototype: The Last Ember

Extend the proposed [optional shrine scenario](ravenloft-scenario-design-notes.md#the-last-ember--complete-work-under-pressure). Use two visible clocks:

- **Shrine Ward — 6 segments.** Filling it restores the shrine and resolves the restoration objective.
- **The Dead Stir — 4 segments.** Filling it awakens one pre-reserved group, once. It changes the encounter while leaving restoration possible.

This is a paired progress/danger encounter. Danger filling first is an escalation, rather than the failed objective of a strict race.

### Actions and meaningful preparation

Proposed starting values for playtesting:

| Supported intervention | Ward progress | Danger | Requirement / commitment |
| --- | ---: | ---: | --- |
| Carefully restore an unused ward station | +2 | 0 | Complete an interruptible interaction while exposed to the existing encounter. |
| Apply the matching rite at an unused station | +3 | 0 | Have actually discovered the relevant rite, then perform the interaction. Reading the clue alone does not restore the ward. |
| Force power through an unused station | +3 | +2 | Explicitly choose the stronger, dangerous intervention; preview both effects before commitment. |
| Cross the marked outer ward seal for the first time | 0 | +2 | An optional shorter approach with a visible warning. Confirm the actual crossing and record it once per scenario. |

Provide at least three reachable stations so the ordinary route can supply six progress without finding optional lore. Each station commits one contribution and changes visibly. The stations supply power toward a common ward; success at six does not claim every station has been restored. Clue sources refer to stable generated facts and remain useful in any discovery order.

The marked shortcut also supplies an independent danger event: crossing it and then forcing one station reaches danger 4 while restoration is only 3. Two forced stations via the quiet approach reach both endpoints together. Three careful interventions via that approach restore the ward without filling danger. Validate both approach routes and all three outcomes.

The distinction comes from action count, exposure, preparation, and consequences. Each supported intervention needs a real animation/interaction contract; holding a key or replaying an input event must not repeatedly award completed work.

### Outcomes

- **Ward fills while danger remains incomplete:** restore the shrine, grant its once-only outcome, and close the unfinished disturbance clock. Existing enemies continue to obey their actual state.
- **Danger fills first:** awaken the reserved group once, latch the completed danger clock, and let the player continue restoring the ward.
- **Both fill in the same resolution step:** the shrine is restored **and** the group awakens. The successful restoration is retained.
- **All reserved enemies are already dead or unavailable:** do not resurrect or duplicate them to satisfy the presentation. Resolve the disturbance with an appropriate aftermath. Preparing the room can legitimately reduce its consequence.
- **Retreat or death before completion:** retain committed station contributions and clock state within the run. Cancel the hero's unfinished interaction. This event-driven pilot gains no additional danger merely because the player waits or returns.
- **Regeneration:** replace the entire scenario instance, clock state, consumed contributions, and claim records.

Reserve the additional actors within the existing encounter/neighbor-pressure budget and give them valid approach routes. The optional shrine is separate from the altar checkpoint and its required throne-unlocking role.

## Applying clocks to the other scenarios

### The King's Borrowed Heart

Keep the initial remote vessel as a simple once-only interaction, as already proposed. A later substantial version could link **Binding exposed → Bond severed**, with multiple valid ways to expose the binding. An earlier clue can improve an intervention; it cannot bypass a physical requirement that still exists.

The guardian's health remains authoritative in the combat system. The clock tracks work on its binding, rather than becoming a parallel health bar. Finding the vessel after the guardian's death resolves against the actual aftermath.

### The Servant Who Remembers

A complex later version can track **The old oath understood** through distinct discoveries and **Agitation** as reversible current state. Appropriate evidence or actions may calm it; visibly provocative actions may raise agitation. The accepted peaceful outcome must connect to actual targeting and behavior changes.

Known facts remain in the discovery record. An investigation clock summarizes substantial research; it cannot erase a fact the player has already seen or require re-reading a solved clue to unlock arbitrary progress.

### The Procession at the Gate

A clock can summarize **Supplies lost** as identified carriers actually escape, with an explicit threshold consequence. Each carrier contributes once. Stopping a carrier changes the real actor/cargo outcome and prevents that contribution.

If a clock visualizes approach distance instead, derive it from the actual route state. It must not advance while the supposed carrier is dead, blocked, or somewhere unrelated. An obstructed route needs a defined AI/scenario outcome rather than an indefinitely running deadline.

### Local alarms and faction plans

An **Alarm raised** danger clock can accumulate confirmed local reports or mechanism activations. A report carries its original event ID; relaying it to three actors does not create three fresh disturbances. Filling it produces a bounded consequence such as repositioning existing guards or activating one reserved group.

The existing monster target-memory and social-alert systems continue to own perception. A scenario clock does not give a faction permanent knowledge of the player's position. Broader faction plans depend on the planned faction/communication contracts.

## Proposed runtime contract

Extend the planned scenario/encounter definitions with clock data; keep generated definitions and mutable run state separate.

| Part | Required information |
| --- | --- |
| **Definition** | Stable scenario/clock IDs, label, segment capacity, what progress means, event eligibility, effect amounts, visibility, and outcome links. |
| **Mutable state** | Current progress, inactive/active/resolved status, committed contributions, and once-only threshold/outcome records. Owned through the ECS scenario state. |
| **Trigger** | A typed domain event carrying its source, semantic event/contribution ID, simulation step, and relevant context. |
| **Progress policy** | Monotonic or explicitly reversible; bounds; activation prerequisites; excess-progress handling. |
| **Lifecycle policy** | Retreat, interrupted action, checkpoint respawn, scenario resolution, and regeneration behavior. |
| **Presentation** | What the player has discovered, current visible progress, why it changed, and what the endpoint means. |

### Resolution rules

1. **Resolve the cause first.** A channel completes, a report is delivered, or a carrier reaches its destination. Raw key presses, animation frames, and attempted actions do not count as completion events.
2. **Apply each eligible contribution once per clock.** One event may intentionally affect several clocks. Deduplication must allow that while rejecting a repeated delivery to the same clock. Use bounded per-scenario records or objective-owned consumed flags.
3. **Resolve coupled progress together.** Calculate changes from one pre-resolution snapshot, clamp to bounds, and evaluate joint outcomes after the changes. Simultaneous completion follows the authored mixed outcome rather than actor iteration order.
4. **Latch completion effects.** A completed alarm cannot repeatedly activate guards. Reversible clocks can move down while active; completed outcomes remain spent unless a recipe explicitly defines a bounded repeat cycle.
5. **Keep linked-stage policy explicit.** The first version discards excess progress at a completed stage and requires a new eligible event for the next stage. Backward links/cycles are excluded from the pilot. Complex recycling is a later, separately specified mechanic.
6. **Read authoritative world facts.** Do not copy health, actor existence, chest claims, or door state into independent narrative flags. A displayed world condition that already has an owner should be derived from that owner.

Use the repository's synchronous `Statechart` adapter for lifecycle/phase transitions where needed. Fixed-step simulation supplies events and any elapsed-time updates. A clock itself does not start wall-clock timers or background actors. Menus, inspection, and hidden-tab suspension follow existing simulation rules; focus loss cancels a pending hero interaction without awarding partial work as a completed action.

Off-screen advancement is a per-scenario decision: a genuine active enemy process continues under its declared rules, while the earlier event-driven Last Ember example advances only from its declared station and ward-seal events. The [autonomous rival version](competing-objectives-design.md#6-first-playable-objective-system-slice) adds a working enemy executor. Visibility alone must not manufacture a cause or erase a completed consequence.

## Presentation

- Use a restrained segmented ring or angular seal, consistent with the existing procedural UI. No external artwork is needed.
- Show a short label, `current / total`, and the endpoint consequence. Distinguish progress and danger through labels/icons as well as color.
- Display the selected player objective alongside all announced active competing monster clocks in a compact agenda strip or persistent expandable panel. Distant executors remain represented while their plans threaten current opportunities. Dormant optional objectives can remain undiscovered.
- Briefly identify a real change: “Forced surge: Ward +3, Disturbance +2.” A short visual pulse should support the event, not delay or decide it.
- At dangerous choices, show the expected contribution and cost before commitment. Active competitive monster clocks are visible from activation; unknown lore or an unseen executor's exact position can remain undiscovered.
- Couple major progress to the environment: a brazier lights, a ward line stabilizes, a bell rings, or guards visibly mobilize. The UI and scene read the same resolved state.

## Delivery and verification

The current playable target is [one player restoration goal versus one autonomous monster profanation goal](competing-objectives-design.md#6-first-playable-objective-system-slice), with visible clocks and both combat and focus-disruption counterplay. The earlier progress/danger pair remains a compact mechanics fixture. Add a second independent monster plan after the first contest works; this remains the objective-system follow-up to the Watchkeeper/Borrowed Heart sequence.

Meaningful acceptance checks when implemented:

- The ordinary approach can complete the objective without optional knowledge or unavailable abilities.
- Duplicate events and re-entry do not repeat progress, claims, or threshold effects; one valid event can affect both clocks.
- Equivalent same-step event batches produce the same outcome regardless of actor iteration order, including simultaneous completion.
- No progress before an action commits; interruption, focus loss, and teleport clear pending work correctly.
- Clamp/overflow and linked-stage behavior follow the declared policy.
- Reversible progress never deletes historical discoveries or unspends a completed consequence.
- Retreat and respawn retain the intended committed state; regeneration discards it.
- Dead/missing/blocked actors cannot produce fictional reports, escapes, or reinforcement duplicates.
- Clock UI matches the world, and pressure does not leak through pause or inspection.
- New exported machines receive model specifications in `tests/models/cases.ts`; placement and causal cross-entity behavior also receive integration/browser coverage.

## Attribution

This work is based on **Blades in the Dark**, found at [bladesinthedark.com](https://bladesinthedark.com/), a product of **One Seven Design**, developed and authored by **John Harper**, and licensed under the [Creative Commons Attribution 3.0 Unported license](https://creativecommons.org/licenses/by/3.0/). The rules are summarized here; the Hollow Crown examples and software design are adaptations.
