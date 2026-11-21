# Game direction — compact, living dungeon scenarios

**Decision date:** 2026-11-20.

**Status:** chosen product direction from the design discussion. Scenario pitches below are
playtest candidates, not implemented features or an approved delivery sequence. Current gameplay
is documented in the [project README](../README.md); scheduling belongs to the
[implementation path](implementation-path.md).

> A compact dark-fantasy adventure in a dungeon that would keep doing things if you stood still.

## Chosen scope

Keep this game focused on **smaller dungeon floors and tight, replayable scenarios**, drawing on
Castle Ravenloft's compact adventure structures. There is ample room to explore procedural
generation and simulated interactions within that scope. A large, persistent, semi-open dungeon
world is a possible follow-up game, rather than the target scale for this one.

The player directly controls one adventurer. The desired depth is in the world: inhabitants have
their own activities, needs, competing objectives and responses to events. Keep the controls
approachable rather than asking the player to manage jobs, settlements or many characters through
a RimWorld- or Dwarf Fortress-style management interface.

**Build a few scenarios and see how they play before settling the detailed design.** This is the
chosen development approach; the discussion does not establish an exact floor size, session
length, scenario catalog or universal dramatic structure.

## Simulation the player can understand and influence

- Give inhabitants business beyond attacking the hero: work, transport, protection, social
  activity and plans that can continue while the player pursues something else.
- Ground consequential activity in actual actors, places, resources and routes. Work should
  stop when its executor cannot perform it; a delivery should require actual arrival.
- Let a small set of actions have contextual consequences. Opening a door, interrupting work
  or removing an object can affect several participants without needing a separate control
  for every tactic.
- Make causes and intentions readable through movement, carried objects, work poses, inspection
  and concise feedback. Players need enough information to make choices and understand outcomes.
- Prefer interactions players can notice and influence over hidden simulation detail with no
  effect on their decisions. A small floor makes recurring inhabitants and changed rooms easier
  to recognize.

The existing Last Ember contest and royal tribute theft provide useful foundations: physical
workers, visible competing clocks, interruptible work, transported cargo and persistent within-run
outcomes. They are currently optional activities alongside the altar-before-throne objective;
standalone scenario victories and the transformations below are future experiments. See
[competing objectives](competing-objectives-design.md) for the delivered contracts.

## Circumstance-driven escalation

Explore a mid-scenario transformation inspired by the discussion's haunted-house/“haunt” idea:
the player learns the situation, a circumstance changes it, and the dungeon becomes much more
dangerous. “Mid-scenario” describes a dramatic turn, not an exact halfway timer.

A trigger could be a completed NPC ritual, a disturbed tomb, a removed protective object or a
particular inhabitant's death. Player actions, NPC actions and their interactions can all provide
the cause. The changed phase should grow out of the existing situation rather than simply
increasing enemy health or spawning unrelated opposition.

Useful prototype principles:

- Foreshadow danger and communicate the actual trigger and consequences when the change occurs.
- Let inhabitants respond too: priorities, destinations or threatened possessions might change.
  These are candidate behaviors, not claims about current AI capabilities.
- Make earlier exploration and preparation useful in the changed situation. Known routes,
  preserved resources and interrupted plans should retain their consequences.
- Preserve understandable ways to resolve the scenario after the turn. Escape, containment or
  completing the original objective under greater pressure are possibilities to test.
- Avoid making curiosity predictably harmful or every scenario an unannounced countdown.
  Existing visible-clock and activation rules remain the foundation for competitive deadlines.

Whether a turn is inevitable, preventable, or present only in some scenarios remains open. Test
those alternatives rather than imposing a mandatory catastrophe on every run.

## Procedural generation within a bounded adventure

Generate meaningful situations as well as layouts: who possesses an important object, where
plans intersect, which routes connect work sites, what clues are available and what preparations
can affect a later crisis. Use coherent authored scenario structures with bounded variation.

Begin with a few playable situations built from supported mechanics. Let playtests identify the
parts worth reusing before committing to a generalized scenario framework or a large content
catalog. The existing generation determinism, reachability and bounded-resource requirements
still apply; changed phases will need their own progression and resolution checks when built.

## Candidate playtests

These contrasting examples capture questions from the discussion. Their names, selection,
ordering, mechanics and budgets remain provisional. The theft is a suggested low-cost starting
point because its underlying activity already exists, not a selected next implementation task.

| Candidate | Experiment | Question |
| --- | --- | --- |
| **The theft** | Promote tribute interception and recovery into a standalone objective, with interference from other inhabitants. | Is the living situation compelling without a major reversal? |
| **The failing ward** | Extend the rival-work premise so a preventable failure changes the dungeon's danger and available responses. | Does choosing between prevention, preparation and another objective create interesting decisions? |
| **The disturbed tomb** | Recovering the objective triggers a dangerous second phase; earlier exploration and intervention shape the return journey. | Does a reliable dramatic turn produce a satisfying adventure? |

A useful first prototype has a clear objective, a compact floor with route choices, a few
interacting activities and a recognizable resolution. Include a defining change where that is
the experiment, and consider imperfect success as well as clean victory or defeat.

After playing, record concrete observations:

1. Did the player understand what the inhabitants were doing?
2. Did that understanding change a decision?
3. Did anything surprising happen that still made causal sense?
4. Did preparation matter after escalation, when present?
5. Would another run support a genuinely different approach?

Use those observations to revise the scenarios and select reusable systems. Automated correctness
checks support this process but do not establish that a scenario is enjoyable.

## Decisions left to playtesting

- Frequency, timing, preventability and severity of scenario transformations.
- How often avoidance, interference, theft or future social interactions can replace combat,
  rather than only improving the odds of a fight.
- Floor size, session length, number of competing activities and amount of procedural variation.
- Scenario-specific victory, imperfect success, failure, escape and checkpoint/respawn rules.

## Scheduling and related plans

With A0–A7/P8/P9 complete, the user's **2026-11-21** scheduling update makes
**CPU0 → CPU1 → CPU2 → CPU3 → CPU4 → CPU5 → CPU6a → CPU6b → CPU7 → EF0–EF4** the next queue,
followed by further procedural-feature expansion. See the [CPU plan](cpu-performance-plan.md)
and [implementation path](implementation-path.md). EF5 remains a separate follow-up. The
[Effect generation adoption gate](effect-refactor-plan.md) still precedes additional generated
encounters/objectives.

After those gates, use small scenario experiments to guide content expansion. The
[procedural content plan](procedural-content-improvement-plan.md) supplies generation foundations,
the [Ravenloft notes](ravenloft-scenario-design-notes.md) supply adventure structures, and the
[competing-objectives design](competing-objectives-design.md) supplies autonomous agenda contracts.
Older scenario pitches remain a source of ideas; this direction favors learning from playable
examples over treating their historical recommendation order as a fixed catalog to implement.
