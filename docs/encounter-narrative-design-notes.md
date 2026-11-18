# Encounter narrative design — notes from Narrative Sorcery

**Status:** reference analysis and proposed design direction; the scenario systems below are not implemented.

**Date:** 2026-11-18.

## Source

Jon Ingold, inkle, **[Narrative Sorcery: Coherent Storytelling in an Open World](https://www.youtube.com/watch?v=HZft_U4Fc-U)**, GDC 2017. The GDC upload is dated 2020-12-08 and runs 59 minutes.

Local reference files, under the git-ignored `ref/` directory:

- [720p video](../ref/narrative-sorcery-HZft_U4Fc-U.mp4), approximately 264 MB, with audio.
- [Full timestamped transcript](../ref/narrative-sorcery-transcript.md), including Q&A.
- [Original English captions](../ref/narrative-sorcery-HZft_U4Fc-U.en-orig.vtt).
- [State-tree slide at 29:30](../ref/narrative-sorcery-state-trees.png).
- `narrative-sorcery-HZft_U4Fc-U.info.json` and `.description` retain source metadata.

Read the complete transcript and checked the state-tree slide. The transcript comes from automatic captions: rolling duplicates and timing markup were removed, but recognition errors remain. The observations below paraphrase the talk; Hollow Crown examples are our proposed adaptations.

## Main recommendation

**Generate a situation, then let several locally coherent encounters respond to how the player discovers and changes it.**

A scenario can connect a warning, a social gathering, a fight, a discovery, and an aftermath. Each encounter should work when reached first, revisited, interrupted, or encountered after another actor has changed the situation. Its presentation reads shared facts and the player's actual knowledge.

This complements the [procedural content improvement plan](procedural-content-improvement-plan.md): Compton's talk informs the construction of distinctive places and inhabitants; Ingold's talk informs their response to exploration and consequences. The [4e plan](4e-incorporation-plan.md#17-budgeted-encounter-generation-and-pacing) supplies tactical composition and threat budgets. A good scenario needs all three.

## Lessons and relevant passages

| Passage | Lesson from the talk | Application to The Hollow Crown |
| --- | --- | --- |
| [11:23–20:37](https://www.youtube.com/watch?v=HZft_U4Fc-U&t=683s) | Replace a rigid meet–fetch–return sequence with encounters that handle different arrival orders. Ingold develops the peasant and wolf example, including retreat and an alternative ending. | A guard, its warning, and the thing it protects exist before a player reads a clue. Discovering the aftermath first is a supported entry point. |
| [20:37–25:50](https://www.youtube.com/watch?v=HZft_U4Fc-U&t=1237s) | Defensive logic: guard individual options and lines against current circumstances; provide a competent fallback. | Check that a speaker is alive and present, a relevant object still exists, and an action remains possible. Exhausted encounters settle into a quiet, traversable aftermath. |
| [25:50–34:01](https://www.youtube.com/watch?v=HZft_U4Fc-U&t=1550s) | Track plot and knowledge separately from the encounter scripts. High-water-mark states imply earlier causal states and do not regress when earlier information is repeated. | Shared discovery facts let any clue surface recognize prior learning. Use monotonic history only where the implication is actually valid. |
| [35:02–38:41](https://www.youtube.com/watch?v=HZft_U4Fc-U&t=2102s) | Plots can begin through multiple sources. Eligible characters can deliver the next useful clue, avoiding repetition and fragile single-source information. | Portraits, inscriptions, and landmarks can reveal complementary facts about the same oath. A destroyed or missed optional source cannot remove the only essential instruction. |
| [38:41–41:15](https://www.youtube.com/watch?v=HZft_U4Fc-U&t=2321s) | Encounters can be reusable situations rather than fixed locations. Contextual content pools can vary pressure, rest, and activity. | Select compatible scenes using terrain, participants, player knowledge, and pacing. Spatial requirements and combat budgets remain hard constraints. |
| [46:58–49:31](https://www.youtube.com/watch?v=HZft_U4Fc-U&t=2818s) | Freedom makes knowledge unpredictable. Alternative routes can share important narrative beats at their bottlenecks. | Put indispensable altar/gate explanations on supported approach routes and at the interaction itself; optional history can remain discoverable in different orders. |
| [49:31–52:38](https://www.youtube.com/watch?v=HZft_U4Fc-U&t=2971s) | Accept unseen variants and the testing cost. A required serpent accidentally became unavailable after the player fled its first appearance. | Separate encounter presentation from resolution. Retreat or first discovery must never consume an unresolved required encounter. |
| [53:10–54:46](https://www.youtube.com/watch?v=HZft_U4Fc-U&t=3190s) | Graphical scenes impose geometry constraints that prose encounters can avoid. | A portable encounter needs validated floor space, cover, door access, actor clearance, and readable staging before it can be placed. |
| [55:48–58:53](https://www.youtube.com/watch?v=HZft_U4Fc-U&t=3348s) | Automated traversal finds dead ends but misses some continuity errors. Authored, deterministic responses can produce substantial variation through player state alone. | Combine model/path tests with human scene review. Use the seed to construct the situation, and explicit state to select its response. |

Ingold's comparisons with other open-world games express his design argument in a 2017 talk; they should not be treated as universal claims about those games or current narrative tools.

## What the current game already supplies

- `src/combat.ts::seedEnemies` chooses safe positions for a fixed room/species/count roster. It seeds actors, then their social groups; it does not yet generate authored scenario relationships.
- `src/social.ts` supplies cards, hacky sack, and smoke gatherings with stable membership/home data. Species behavior handles interruption and return.
- The ECS owns actor health, movement, behavior, and persistent corpses. Other species can fight each other: a dead creature is not necessarily a player kill.
- `src/main.ts::interact` and the interaction statecharts already handle inspection, once-only chest claiming, and altar-to-throne progression.
- Navigation validation and model-based tests provide a foundation for checking scenario reachability and state transitions.

The proposed keep histories, named inhabitants, discovery records, encounter objectives, and expanded factions remain roadmap work. Existing social behavior gives us visible starting situations; a new scenario layer would connect those situations to shared meaning and remembered consequences.

## Keep different kinds of state explicit

| State | Example | Ownership / rule |
| --- | --- | --- |
| Generated facts | A particular monarch appointed this watchkeeper to guard this reliquary. | Immutable, seeded blueprint with stable entity/fact IDs. |
| Current world state | The watchkeeper is alive; the reliquary is open; the gate is unlocked. | Read authoritative ECS/interactions. Avoid a second narrative copy of health, doors, or chest state. |
| Player knowledge | The player learned the oath, recognized its emblem, or observed the remains. | Record discovery at an actual presentation/observation event; world truth alone does not imply player knowledge. |
| Local encounter memory | This warning has been presented; the player returned after meeting the guard. | Small persistent encounter state scoped to its instance. Explicitly define meaningful visits. |
| Historical events and claims | Who killed the guard, whether the player witnessed it, whether the chest reward was claimed. | Bounded event records and once-only claim IDs. Preserve through checkpoint respawn within the run. |

### Apply high-water marks carefully

For a genuinely ordered discovery, learning a detailed fact may imply understanding its prerequisite. Re-reading the introductory clue should not erase that progress. Independent evidence should remain independent facts rather than being forced into one ordinal ladder.

The talk's wolf example assumes a causal chain in its authored context. Our simulation allows other actors to kill a guard while the player is elsewhere. Therefore `guard dead` cannot imply `player killed guard`, `player saw guard`, or `player knows guard is dead`.

Likewise, current AI states such as socializing, pursuing, and returning are reversible. Keep their existing statecharts. An eventual reanimation system would distinguish the historical fact of a death from the actor's current alive state.

A compact state summary also does not prove the player's motive or the exact order of events. A chronicle can say what was recorded; it should not invent a revenge story from two unrelated deaths.

## A small encounter authoring contract

Extend the planned `SceneRecipe`, `EncounterPlan`, and discovery contracts rather than creating a competing world model. For each authored scenario, specify:

1. **Premise and participants:** linked facts, named roles, and stable actor/object IDs.
2. **Placement requirements:** compatible room features, actor budget, cover, approaches, escape space, and any dependent clue surfaces.
3. **Entry variants:** unknown situation, informed arrival, repeat visit, interrupted attempt, and resolved aftermath.
4. **Action guards:** current actor/object availability, player knowledge where relevant, supported capabilities, and unclaimed rewards.
5. **Events and effects:** what advances knowledge, changes the world, or records a resolution. Apply world changes through existing domain systems.
6. **Outcome rules:** explicitly distinguish discovery, temporary withdrawal, death, actual escape, and any later negotiated resolution.
7. **Revisit policy:** what persists, what may repeat, and what becomes quiet after exhaustion.
8. **Fallback:** safe traversal and an ordinary usable interaction when optional content is inapplicable.

Keep guards explicit and comprehensible. Stable fact IDs allow a clue to move or gain another source without making other scenes depend on the internal branches of its script.

## First prototype: The Watchkeeper's Oath

**Proposed scope:** one named skeleton drawn from the existing population, a linked royal inscription or portrait, and one of the existing reliquaries. Bind them through the planned keep identity. Placement must find a compatible guard/reliquary room and a reachable clue surface; current random chest placement does not guarantee this arrangement. Reject or simplify the optional motif deterministically if it cannot fit.

The skeleton continues to use ordinary movement/combat. The new work is its identity, factual links, contextual presentation, and observation/event tracking. Claiming the reliquary uses the existing chest interaction; the scenario does not add a kill requirement to the chest or change the altar gate.

| Player history | Coherent encounter response |
| --- | --- |
| Reads the oath before meeting the guard | The clue establishes the emblem and duty; later presentation can identify the watchkeeper. |
| Meets the guard before finding the clue | Present the visible armed skeleton and emblem without assuming its name or history is known. Later inspection supplies context. |
| Defeats it before reading anything | The inscription remains meaningful: it identifies a figure whose remains the player may already recognize. |
| Retreats and returns | Query the actual actor and chest state. If alive, the same guard remains available under existing AI behavior; the first visit did not resolve the encounter. |
| Finds it dead after another creature killed it | Present the aftermath without granting player-kill credit or pretending the player witnessed the fight. |
| Reaches and opens the reliquary while the guard lives | Record the real claim. The guard remains alive; claimed treasure is distinct from defeating the guard. |
| Returns after claiming it, or respawns at the checkpoint | Keep the chest claimed and retain relevant discoveries. Avoid repeated reward or discovery notifications. |

Three presentations—warning, meeting, aftermath—can already produce different personal stories without adding another monster type. The scenario's success criterion is whether players connect the evidence and can describe what happened in their run.

After this works, apply the same pattern to an existing kobold gathering: introduce a recognizable card dealer and royal tokens, then let later observations reflect the actual surviving group. Bargaining, surrender, alarm propagation, and deliberate theft interactions require their own gameplay contracts before becoming supported outcomes.

## Clue distribution and pacing

- Associate every clue with a stable fact and sources that plausibly communicate it. Choose an unseen eligible clue; when all relevant facts are known, offer a concise acknowledgment or no new notification.
- Use multiple sources for essential knowledge, including a guaranteed explanation at the required interaction. Repeatedly inspecting one painting should not manufacture facts the painting cannot express.
- Preserve real progression dependencies. Knowing about the altar does not kindle it, and discovering the throne early does not unlock its gate.
- Begin with seeded placement/pacing at generation time. A runtime content pool is a later option for contextual text and uncommitted ambient content; it must not reroll claimed treasure, resurrect a cleared room, or move an observed encounter to manufacture drama.
- Any later adaptive selector needs deterministic inputs and recorded decisions for replay/debugging. Optional intensity adjustments still obey reserved threat and reinforcement budgets.
- Local consequences can stay local until an actual communication mechanism spreads them. The talk's contrast between isolated villages and a tightly connected city is a useful scope lesson for our future faction/alarm system.
- If a scenario advances without the player, author the trigger and tell explicitly. A meaningful simulation event can change a situation; repeatedly crossing a room boundary should not silently manufacture escalation.

## Verification to require when implemented

Use the existing model-test framework for any new production statecharts, plus integration traces through the real world:

- Visit clue and encounter in both orders; include direct discovery with no prior warning.
- Leave before acting, retreat during a fight, and return repeatedly.
- Resolve the relevant world event before meeting its clue source; include off-screen infighting and absent/dead participants.
- Observe that unknown information stays unknown until actually presented or witnessed.
- Revisit exhausted content: traversal remains possible, claims do not repeat, and no stale action references a missing actor.
- Respawn within a run and regenerate a new run: verify the intended persistence/reset boundary.
- Keep an unresolved required encounter available after withdrawal. Validate physical reachability and eventual re-entry eligibility, not merely the existence of a state transition.
- Check every supported placement against cover, actor clearance, doors, and altar-before-throne progression over the seed corpus.
- Review the rendered scene and text together. A state trace can be legal while a caption describes the wrong visible situation.

## Relationship to the existing roadmap

1. Add the knowledge/world-state distinction to the planned generated facts and discovery work.
2. Use the watchkeeper prototype to connect **Phase 1 shared identity**, **Phase 3 memorable inhabitants**, and a small subset of **Phase 4 discovery tracking**. A full journal UI can follow independently.
3. Let **Phase 5 adventure/encounter planning** select and place validated scenario recipes alongside the 4e threat templates.
4. Expand to alarms, alternative resolutions, and portable environmental encounters after their underlying mechanics and geometry contracts exist.

The next useful design artifact is one complete scenario with an entry-order/outcome table and a few readable variants. That will test whether the architecture produces memorable encounters before we build a large content catalog.
