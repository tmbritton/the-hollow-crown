# Ravenloft — adventure, scenario, and encounter inspiration

**Status:** source analysis and proposed Hollow Crown adaptations; these scenario mechanics are not implemented.

**Date:** 2026-11-18.

## Source and scope

Read the complete [local `ravenloft.pdf`](../ref/ravenloft.pdf): the **Dungeons & Dragons: Castle Ravenloft Board Game — Adventure Book**, containing thirteen adventures. The file has 17 PDF pages; adventure pages **3–15** have matching printed and PDF page numbers. Page 17 identifies this copy as a fan-produced visual redesign of the adventure book. Reviewed the page images as well as extracted text, which contains OCR errors and omits some illustrated read-aloud material.

This is a compact collection of board-game scenarios. Its referenced monster, treasure, encounter, and power cards are separate components; their complete rules are not supplied here. The recommendations below borrow the adventure structures, with original Hollow Crown settings and explicit adaptations for one real-time hero.

## Main lesson

**A small set of rooms, creatures, and interactions can support very different adventures when the objective, pressure, and resolution change.**

The book repeatedly reuses its dungeon components while changing what the players care about: reach an exit, keep treasure unspent, protect a transforming companion, disrupt a ritual, intercept escaping enemies, or remove a villain's sources of recovery.

For The Hollow Crown, define three related layers:

- **Adventure:** the run's overall purpose and pacing, such as claiming the Crown or a future extraction mode.
- **Scenario:** a connected situation spanning one or more rooms, such as a guardian sustained by a distant relic.
- **Encounter:** a local decision or interaction within that situation: read the warning, confront the guardian, disrupt the relic, or inspect the aftermath.

These work alongside the existing [procedural content plan](procedural-content-improvement-plan.md), [Ingold encounter notes](encounter-narrative-design-notes.md), and [4e encounter budgets](4e-incorporation-plan.md#17-budgeted-encounter-generation-and-pacing).

## What each adventure contributes

The middle column describes the supplied book; the final column is our adaptation.

| Adventure and source page | Distinctive structure | Useful Hollow Crown direction |
| --- | --- | --- |
| **1. Escape the Tomb**, [p. 3](../ref/ravenloft.pdf#page=3) | Solo escape. Discovering white-arrow tiles advances a sun track; sunset wakes Strahd. Reaching the secret stairway wins, including after he wakes. | An awakening changes traversal into a pursuit. Use a visible escalation threshold and a reachable escape, rather than treating the threshold as an automatic loss. |
| **2. Find the Icon of Ravenloft**, [p. 4](../ref/ravenloft.pdf#page=4) | Finding the Chapel places its guards and the Icon, then increases encounter pressure. Victory requires both defeating those guards and recovering the Icon. | Discovery changes the local situation. Define a stable guard set and a separate claim condition; either can be completed first. |
| **3. Klak's Infernal Artifact**, [p. 5](../ref/ravenloft.pdf#page=5) | Chaos changes the resource rules before the laboratory is found. The finale requires defeating Klak and destroying a separately attackable artifact. | Make the source of a room's strange behavior a real objective. A machine, its operator, and the consequences of disabling it are distinct state. |
| **4. Daylight Assault**, [p. 6](../ref/ravenloft.pdf#page=6) | Collect treasure and extract. Consumed treasure stops counting toward the goal; sunset increases pressure. | A future heist mode can ask whether to spend a useful resource now or preserve it for extraction. The return journey becomes part of the adventure. |
| **5. The Final Transformation**, [p. 7](../ref/ravenloft.pdf#page=7) | Kavan transforms when isolated from Heroes or sharing a tile with a Monster. Removing that danger while a Hero is present reverses it. Reaching the fountain begins a five-step cure under enemy pressure; killing him loses. | Escort tension can come from a companion's changing state and relationship to threats, not only an escort health bar. Requires explicit follower and transformation systems. |
| **6. Destroy the Dracolich**, [p. 8](../ref/ravenloft.pdf#page=8) | The boss reveal also places a distant laboratory containing its phylactery. Destroying that object deals 10 damage to the boss; defeating the boss is the victory condition. | A remote weakness offers a meaningful detour. The source does **not** make destroying the object a mandatory invulnerability key. |
| **7. Adventure: Impossible**, [p. 9](../ref/ravenloft.pdf#page=9) | A solo player sends successive Heroes through the ongoing dungeon. Three selected villain lairs are spread across separate eight-tile packets. | Build an expedition from spaced threats and persistent accomplishments. A succession-of-heroes mode would be a later use of multiple character kits. |
| **8. Horror of the Howling Hag**, [p. 10](../ref/ravenloft.pdf#page=10) | Separated starts in a bounded 5 × 5 layout; a central ritual requires five progress steps. The hag can relocate and return after defeat while the ritual remains active. Victory requires both disruption and her defeat. | Spatial pressure plus an incomplete objective can sustain a recurring antagonist. Make the recurrence's cause visible and interruption progress persistent. |
| **9. Gauntlet of Terror**, [p. 11](../ref/ravenloft.pdf#page=11) | Hidden groups move toward the exit. Escaping Monsters damage the town's finite reserve and award no kill XP. Victory has a separate defeated-Monster target. | Give enemies an objective beyond chasing the player: escape, reach a bell, carry away supplies, or breach a ward. Interception changes target priority. |
| **10. Blood and Fog**, [p. 12](../ref/ravenloft.pdf#page=12) | Escape through another exit, with a pursuer's reveal scheduled before the exit and a deliberately themed encounter deck. Undead kills cannot cancel encounter cards. | Coordinate atmosphere, pressure rules, and reveal order. A threat-first, exit-later escape should be authored into the route structure. |
| **11. Rampaging Golem**, [p. 13](../ref/ravenloft.pdf#page=13) | Either destroy the golem or accumulate three calming reactions. Item reactions are shuffled at setup; players can spend XP to reveal a reaction before risking an item. | Knowledge can support a genuine non-kill resolution. Seed a consistent response pattern and provide discoverable evidence before a costly attempt. |
| **12. The Hunt for Strahd, Part 1**, [p. 14](../ref/ravenloft.pdf#page=14) | Preparation items, a variable bodyguard, and two ordered reveal packets. The explicit victory rule requires defeating both the bodyguard and Strahd; the ending points toward his hidden crypt. | Build an escalation sequence with preparation and an identifiable transition. A selected lieutenant changes tactics while retaining the adventure's structure. |
| **13. The Hunt for Strahd, Part 2**, [p. 15](../ref/ravenloft.pdf#page=15) | Investigate and destroy coffins. Intact coffins restore Strahd's health when he occupies their tile; finding his crypt establishes a final stand. Victory requires his defeat and all coffins destroyed. | Disabling recovery sites gives exploration a direct effect on a later fight. Define the complete objective set in advance so victory is provable. |

## Design techniques worth adopting

### 1. Randomize within a designed progression

Several adventures place a special tile within a narrow draw window, commonly positions 9–12 or 9–13. Adventures 10 and 12 use ordered packets so one reveal precedes another; Adventure 7 distributes three villain lairs across three packets.

The useful principle is **bounded uncertainty within an authored sequence**. A shuffled tile-draw position is not equivalent to graph distance in our already-generated dungeon. Our `AdventurePlan` should express early/middle/late placement constraints using reachable route depth and progression dependencies. If one physical event truly must precede another, validate that ordering across branches and loops. Optional clues can still be found in any order.

Commit the accepted world at generation time. Avoid silently moving a discovered landmark to force the desired sequence.

### 2. Give each scenario one defining change

The book's situations are easy to explain: sunset wakes a pursuer; reaching the fountain begins a cure; coffins heal the vampire. That rule changes decisions immediately.

Author a concise scenario card:

1. **Goal:** what success means to the player.
2. **Setup:** actors, objects, spatial requirements, and resource budget.
3. **Trigger:** the event that changes the situation.
4. **Pressure:** the consequence of delay or a competing demand.
5. **Resolutions:** the exact accepted success/failure outcomes.
6. **Aftermath:** persistent changes, rewards, and revisits.

Add the clue and entry-order variants from the Ingold notes. A useful first sentence should explain what is different about this encounter before introducing new rules.

### 3. Make success depend on the relevant facts

The source contains several useful goal forms:

- **Both:** defeat the named guards **and** claim the relic; defeat the hag **and** disrupt the ritual.
- **Either:** destroy **or** pacify the golem.
- **Reach:** escape through the appropriate exit while alive.
- **Progress:** complete several cure or disruption steps under pressure.
- **Preserve:** retain enough treasure or prevent the protected reserve reaching zero.
- **Prepare:** remove a boss's support before confronting it, where that action is beneficial rather than mandatory.

The objective should reference specific actors, objects, and claims. “Every monster currently in the room is dead” is fragile when creatures roam, reinforcements join, or different species fight. Treasure possession, player kill credit, actual world resolution, and player knowledge remain separate.

### 4. Use space to create competing priorities

The phylactery is deliberately distant; the hag's ritual is central while Heroes begin apart; the gauntlet sends enemies toward a defended exit. These are spatial relationships with gameplay consequences.

Our recipes should reserve those relationships explicitly: distance between linked objectives, accessible side routes, a defensible work area, or an interceptable enemy path. A room label alone cannot guarantee the intended encounter.

For one hero, tune travel time and threat pressure so a single actor can actually service the competing demands. Simultaneous obligations designed for a group often need sequential stages or a reliable way to interrupt one threat.

### 5. Let information change the solution

The golem's reaction table is established at setup, and revealing a reaction has value because the player can act on it. This is a strong fit for our procedural portraits and connected history.

Our adaptation should correlate responses with the generated character's history: a familiar emblem calms an oathbound servant; a symbol of its betrayer provokes it. A portrait, inscription, and workplace can expose complementary evidence. Revealing a fact changes the player's understanding, not the underlying response table.

### 6. Treat pressure as an explicit resource

The sun tracks on pp. 3 and 6 advance on particular exploration events, **not elapsed real time**. Their thresholds change the threat rather than immediately ending the adventure.

For our first pressure experiment, use clearly signaled, once-only events such as opening a named seal or crossing a marked boundary for the first time. Inspecting a portrait, opening a menu, or repeatedly crossing the same threshold should not create hidden pressure. If a later scenario uses time, define it in active simulation time and explain it before commitment.

Reserve reinforcements and cap active threats. A board-game instruction to add a Monster each turn needs a deliberate real-time schedule and budget. The source's healing-surge scarcity also cannot be assumed when our hero currently respawns at a checkpoint; each proposed failure condition needs an explicit relationship to respawn.

The [Blades-derived progress-clock design](progress-clock-design-notes.md) gives these objectives and pressures a shared event-driven representation, including explicit simultaneous outcomes and reversible versus persistent progress.

## Four Hollow Crown scenario pitches

These are original adaptations, not additional source adventures.

### The King's Borrowed Heart — remote weakness

**Sources:** Adventure 6, p. 8; the linked person/object objective in Adventure 3, p. 5.

A named oathbound guardian is sustained by a vessel in another chamber. A portrait or inscription identifies the connection. The player can confront the guardian directly or take the detour to sever the bond and weaken it.

- **Small first version:** use an existing skeleton and one new interactable. Disabling the vessel causes a single, clearly communicated damage event through the shared combat system. Tune the benefit for our combat; the book's 10 damage is not a conversion ratio.
- **Placement:** both the guardian and vessel are reachable before the throne gate. Reserve a genuine detour and usable interaction approach.
- **Different orders:** disabling the vessel first changes the later fight; discovering it mid-fight suggests retreat and return; finding it after the guardian dies gives an appropriate aftermath without inventing a second kill or reward.
- **Persistence:** vessel disabling and the guardian's actual death survive checkpoint respawn. Regeneration creates a new scenario. Off-screen infighting still counts as a world event without automatically becoming player knowledge.
- **Dependencies:** scenario/object identity, a new interaction contract, and a once-only effect. Named presentation can reuse the planned watchkeeper identity. No additional monster species is required.

This is the strongest **mechanical follow-up** to the proposed Watchkeeper's Oath narrative prototype: it turns the connected history into a route and combat decision.

### The Last Ember — complete work under pressure

**Sources:** the fountain cure in Adventure 5, p. 7, and ritual disruption in Adventure 8, p. 10.

An optional shrine can be restored through several short, visible actions while a finite group attempts to interrupt the work. Each completed stage changes the shrine's geometry or light, so progress is readable without relying only on a bar.

- The player decides whether to make progress, eliminate a threat, or withdraw.
- Completed stages persist; an interrupted current action can be retried. Define damage, movement, and focus-loss interruption behavior explicitly.
- Threats come from reserved actors or a bounded reinforcement allocation, with readable approach lanes.
- Use a separate optional shrine initially. The existing altar remains a dependable checkpoint and progression landmark.
- **Dependencies:** staged interaction, progress presentation, objective persistence, and bounded encounter activation. A companion is unnecessary for this first version.

The [clock prototype](progress-clock-design-notes.md#first-clock-prototype-the-last-ember) specifies a six-segment Shrine Ward and four-segment The Dead Stir track. Supported interventions trade preparation and exposure against restoration speed and disturbance; both clocks can complete together without undoing the restored shrine.

The subsequent [user-directed competing-objective design](competing-objectives-design.md) adds a different playable variant: restoration races a living enemy's profanation work. Killing its unique executor, disabling its focus, or drawing it away can thwart or delay that plan. The earlier disturbance pair remains an event-driven example; the autonomous contest is the current objective-system target.

### The Servant Who Remembers — pacify or defeat

**Source:** Adventure 11, p. 13.

A royal servant recognizes fragments of its former life. Related portraits, heraldry, and workshop objects reveal which gestures or offerings can release it from its duty. The player may instead fight it.

- Generate a small, fixed set of meaningful responses with the keep's history, then place enough reachable evidence to support the peaceful route.
- Each distinct successful step counts once. Repeatedly presenting the same fact cannot farm progress.
- A mistaken attempt produces a readable, bounded consequence and preserves a viable resolution.
- Pacification is a real terminal encounter outcome with appropriate targeting and collision behavior; it is different from an AI target briefly expiring.
- **Dependencies:** nonhostile/resolved actor handling, knowledge-driven interactions, and unified reward claims. Physical offerings additionally need an item/possession contract. Start with knowledge or fixed scene interactions if inventory is still absent.

### The Procession at the Gate — intercept an enemy plan

**Source:** Adventure 9, p. 11.

A finite group is making for an outer gate carrying something the keep cannot afford to lose. Visible direction and destination make its purpose legible. The player decides where to intercept and which creature to prioritize.

- Give actors a real navigation goal; they defend themselves when intercepted and resume only according to explicit behavior rules.
- The protected reserve loses value only on a confirmed, once-only arrival/escape event. A creature taking cover or retreating from melee has not escaped.
- Branches and ordinary doors offer interception choices, but the scenario must retain a resolvable outcome when a route is obstructed. It must not wait forever for an unreachable actor.
- Start with one compatible species/group and an optional outcome. An alternate whole-run defense mode can follow later.
- **Dependencies:** goal-driven enemy behavior, escape attribution, objective UI, and validated travel-time/peak-threat budgets.

## Larger adventure variants to keep for later

- **A heist before the keep awakens** (pp. 3, 6, 12): treasure value, expenditure, a dangerous return route, and a signaled escalation. Requires carried-resource and extraction rules; current reliquaries are immediate healing/claim interactions rather than inventory.
- **The unwilling heir** (p. 7): a rescued person periodically becomes the threat. Requires follower navigation through doors, actor allegiance/targeting changes, transformation tells, and a solo-viable rescue condition.
- **The scattered resting places** (p. 15): investigate and disable a bounded set of recovery sites before or during a guardian fight. Requires environmental effects, explicit objective completeness, and clear behavior when the guardian is encountered early.
- **Successive claimants** (p. 9): a finite succession of heroes inherits the same expedition. Requires distinct kits and an explicit persistence/failure policy beyond current checkpoint respawning.

Introduce escape/heist/succession victory conditions as explicit future adventure modes. Initial optional scenarios fit inside the current altar-before-throne adventure; they do not silently replace its objective or invalidate its progression checks.

## Practical authoring and validation

Use the already proposed `AdventurePlan`, `EncounterPlan`, `SceneRecipe`, discovery facts, and once-only claim contracts. The source suggests adding explicit reveal/activation conditions, compound outcomes, pressure thresholds, and persistent aftermath to those definitions.

Validate the questions that distinguish these scenarios:

- Can the player reach each required interaction and return, including after a stage changes the world?
- Does a supposedly ordered reveal remain ordered through alternate paths and doors?
- Are all members of a required objective set assigned once, with no inaccessible leftover target?
- Does resolving an object before its linked actor, or vice versa, produce the right result?
- Do retreat, off-screen actor deaths, checkpoint respawn, and repeated entry preserve valid state and once-only rewards?
- Can a solo hero meet a hold/escort/interception obligation with ordinary abilities and supported movement?
- Do pressure transitions have an observable cause, bounded effects, and correct pause/inspection behavior?
- Can players explain the goal and the scenario's defining rule from the scene and feedback?

New production statecharts would receive the project's existing model specifications; spatial and cross-entity properties need generation/integration checks too. These are proposed acceptance checks, not claims of implemented scenarios.

## Recommended sequence

1. Keep the **Watchkeeper's Oath** as the first proof of identity, linked clues, and order-aware presentation.
2. Add **The King's Borrowed Heart** to make those relationships mechanically useful with a compact remote-object interaction.
3. Add **The Last Ember** to prove staged objectives and bounded pressure.
4. Add **The Servant Who Remembers** when resolution/targeting contracts support a peaceful outcome; add **The Procession** when objective-driven AI is ready.
5. Use the proven components to offer a small catalog of adventure structures alongside the existing encounter budget and population plans.

Together, the sources now cover four complementary questions: **Compton—what makes this place distinctive? Ingold—how does it respond coherently to the player's history? The DMG—what makes its challenges tactically sound? Ravenloft—what are we trying to accomplish here, and what changes while we try?**
