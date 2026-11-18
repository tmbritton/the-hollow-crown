# The Hollow Crown — 4e incorporation plan

## Recommendation

Adapt 4e's **tactical choices, power structure, and exploration rewards** to the existing solo, real-time dungeon crawler. The best first expansion is a small martial ability kit with recovery, crowd control, and positional attacks. Follow that with budgeted, terrain-aware encounters, one interactive trap, and meaningful reliquary rewards.

References are the June 2008 first-printing **Dungeons & Dragons 4th Edition Player's Handbook** (PHB), [local reference](../ref/4e.pdf), and **Dungeon Master's Guide** (DMG), [local reference](../ref/dmg.pdf). Unqualified page references refer to the PHB; DMG references are labeled explicitly. All references use printed book pages. The proposed names, timings, numerical tuning, encounter compositions, and real-time conversions are design suggestions for this game.

The companion [low-level monster roster](monster-roster-plan.md) draws from the [local Monster Manual](../ref/Monster%20Manual.pdf): **16 selected types at book levels 1–5**, with a first implementation milestone of 12 playable types. It records source pages, real-time adaptations, room assignments, factions, and low-to-high-effort implementation waves.

Its [raider squad behavior](monster-roster-plan.md#raider-squad-behavior-goblins-forward-hobgoblins-behind) specifies the goblin–hobgoblin relationship: hobgoblins order healthy goblins into melee and throw projectiles from behind them; bloodied goblins retreat and shoot; once the goblin front line has retreated or fallen, hobgoblins advance into melee. This coordination belongs with the initial faction/monster expansion and uses ordinary AI orders alongside the cooldown-based power system.

Effort estimates are rough **focused developer working days for a small playable version**, including essential UI, procedural presentation, and verification. Later estimates assume the stated foundations exist; they are incremental, not standalone quotes. Content breadth and balancing are the main sources of uncertainty.

## DMG review — recommended additions

The DMG contributes most strongly to **how the dungeon assembles and resolves challenges**. The following are proposals for implementation; the detailed entries distinguish book rules from this game's adaptations.

| Priority | System or refinement | Where it belongs | DMG source | Smallest useful delivery |
| --- | --- | --- | --- | --- |
| High | Budgeted encounters, role combinations, and difficulty pacing | Items 11 and 17 | pp. 54–64, 104–105 | Three templates selected by route depth, threat budget, and usable room geometry |
| High | Interactive traps with several countermeasures | Item 13, small slice in Milestone C | pp. 85–89; worked example p. 213 | One telegraphed dart trap that can be dodged, disabled, or destroyed |
| High | Terrain with distinct movement, sight, and combat effects | Items 10–11 and 19 | pp. 43–44, 60–69 | Shared hazard rules, one beneficial zone, and one usable environmental prop |
| High | Passive discoveries and dependable progression clues | Item 3 | pp. 26–27, 41 | A clue layer for portraits, hazards, and enemy tells; no mandatory hidden roll |
| High | Planned reward parcels and explicit completion outcomes | Items 8 and 12 | pp. 120–126 | Seeded rewards distributed among reliquaries and a side objective |
| Medium | Minion variants and authored champion upgrades | Item 18 | pp. 54–55, 174–185 | Fragile skeleton support, then a champion with one signature behavior |
| Medium | Multi-step challenges with useful failure outcomes | Item 13 | pp. 72–81 | Stabilize the forge or open an optional royal cache through several actions |
| Medium | Monster readiness, local alarms, and bounded reinforcements | Item 20, feeding item 15 | pp. 36–37, 41, 86 | Disturbed social groups prepare defenses; an alarm alerts an existing squad |
| Later | Relics whose powers respond to player choices | Item 21 | pp. 164–165 | One royal relic with goals and three visible attitudes |

**Source-version policy:** the supplied DMG is the first printing. Its numerical tables are source evidence, not a ready-made balance model for a single real-time hero. In particular, keep skill DCs, challenge success/failure limits, monster scaling, and damage tuning configurable; any later errata-based rules should be identified separately. Encounter budgets can exist without player XP or character levels, and trap counterplay can exist before trained skills.

## Power recharge decision — real-time cooldowns

Use **a 60-second cooldown per ability as the starting conversion for a 4e encounter power**. Powers recharge through elapsed gameplay time, both during combat and exploration. This supports wandering enemies, retreat, and fights spanning several rooms without requiring encounter-boundary detection.

| Power category | Starting treatment |
| --- | --- |
| At-will/basic attacks | Repeatable after normal attack recovery. |
| Encounter-strength powers, including Second Wind | 60-second cooldown, tuned individually after playtesting. |
| Daily-inspired major powers | Longer per-ability cooldown; 180 seconds is a provisional first test when these are introduced. |
| Frequently used mobility/positioning tools | Shorter per-ability cooldowns where needed to keep movement decisions frequent; tune separately from encounter-strength attacks. |

Cooldown rules:

- Each ability has its own timer, while the shared action/recovery lock prevents overlapping incompatible actions.
- Start the timer when a validated action commits to its wind-up. Invalid activation attempts consume nothing; cancellation or interruption after commitment does not refund the timer.
- Advance timers in the fixed simulation update. Pause, close-up inspection, and suspended gameplay freeze them.
- Display remaining time on the action bar and give a clear ready cue.
- Room transitions and enemy deaths do not reset timers. Proposed checkpoint policy: altar interaction and respawn preserve remaining timers; a new dungeon starts with abilities ready.

The intended result is roughly one use in a short fight, with repeat uses available in longer fights. Actual encounter lengths will determine whether 60 seconds feels right. Keep at-will attacks and some frequent tactical actions useful while stronger powers recharge. Cooldown-based healing also permits recovery by waiting between fights; evaluate that pacing explicitly during playtests.

## Existing foundation

- Thirteen seeded rooms, branching routes, doors, water, lava, cover, an altar checkpoint, three reliquaries, and a throne objective.
- A shared ECS for player/enemies, movement, attack wind-up/impact/recovery, health, projectiles, and corpses. Living actors block one another regardless of allegiance; routes account for occupancy, and passable corpses slow movement like water.
- Skeleton pursuit, goblin cover/retreat/ranged attacks, and coordinated kobold positioning.
- Inspection UI, royal portrait identities, an explored-room map, and procedural character/effect rendering.

Important implementation facts:

| Existing code | Consequence for the plan |
| --- | --- |
| `src/combat.ts`: attacks resolve from range/cover or projectile contact; damage and cooldowns depend on actor kind | Introduce explicit ability definitions and a shared effect resolver as the active ability set grows. Contact-based resolution already suits real-time play. |
| `src/ecs.ts`: a swing stores one target and a melee/ranged flag | Area attacks, self-targeted powers, conditions, and separate power recharges need additional contracts. |
| `src/combat.ts`: `hostile()` treats different actor kinds as enemies | Cooperative flanking, support enemies, and companions need explicit relationships. A mixed-species encounter currently produces infighting. |
| `src/navigation.ts`: safe paths reject lava; routing is unweighted breadth-first search | Forced movement needs its own traversal policy; tactical avoidance of temporary hazards needs movement costs and updated route selection. |
| `src/main.ts`: lava damage is applied only to the player | Environmental damage must become an actor-wide system before shoves into lava work consistently. |
| `src/main.ts`: the altar restores health; death restores the player while enemy casualties persist | Preserve ability timers separately from health restoration and once-only reward claims. |
| Enemy spawns are fixed by room role; there is no encounter lifecycle, inventory, level progression, or skill system | Encounter objectives and rewards are a later feature; ability recharge can work directly from simulation time. |

## 1. Low effort — immediate additions

### 1. Bloodied feedback and a simple behavior change

**Effort:** 0.5–2 days. **Value:** high. **Source:** p. 293; an example bloodied-dependent power appears on p. 78.

- Derive `bloodied` when current HP is at or below half maximum HP.
- Show an unmistakable marker on the target health bar and a restrained player HUD cue.
- Give one enemy variant a response: for example, a wounded goblin seeks more distant cover, or a skeleton briefly accelerates its next attack.
- Distinguish continuous below-half effects from one-time threshold triggers, so healing across the threshold cannot repeatedly trigger a one-shot effect.

**Implementation:** `src/combat.ts`, `src/enemyRendering.ts`, `src/ui.ts`, `src/style.css`. Health data and goblin retreat behavior already exist. The specific enemy response is our adaptation of the bloodied threshold.

### 2. Second Wind on a 60-second cooldown

**Effort:** 1–2 days. **Value:** very high. **Source:** pp. 291, 293.

- Give the player a recovery ability that restores 25% of maximum HP on a 60-second cooldown.
- Require a short, readable committed action, creating a decision about when it is safe to heal.
- Display its remaining cooldown and bind it to an unused key such as `F`.
- Recharge through normal gameplay time, using the cooldown rules above.

**Implementation:** recovery/cooldown state, input handling in `src/main.ts`, shared healing logic, and a HUD indicator. The book's Second Wind also gives a temporary defense bonus and consumes a daily healing surge. The proposed adaptation uses timed recharge; a defense bonus can follow the shared effects system.

### 3. Knowledge rewards and small optional quests

**Effort:** 1–3 days for one objective and a few entries. **Value:** medium–high. **Source:** knowledge skills, pp. 179–180; quests and rewards, pp. 258–260.

- Make portrait inspection reveal usable royal history: a clue about the altar, a reliquary, or an enemy tactic.
- Add one optional objective using existing events, such as inspecting three distinct royal portraits or recovering the three reliquaries.
- Reward it with a visible completion entry and, once item 4 exists, a small blessing.
- Add concise enemy knowledge to the target HUD: “uses cover,” “alerts its pack,” or “cannot open doors.”

**Implementation:** `src/royalty.ts`, portrait inspection callbacks, `src/main.ts`, and `src/ui.ts`. Start with fixed authored clue templates populated from seeded world data. Target information belongs in the normal HUD; the current close-up inspection mode pauses simulation.

**DMG refinement — passive discovery (pp. 26–27, 41):** the book uses passive checks of `10 + skill bonus` to reveal information without interrupting play, and explicitly says essential information should be given rather than lost to a failed check. For our initial capability-based system, reveal basic clues on entering sight/range and deeper details through inspection or training. A portrait might identify the guardian's resurrection tactic; a trained observer might identify a trap's control panel. Keep altar/throne instructions and immediate danger telegraphs available to every kit. Record discovered facts once, without repeated per-frame rolls or search-button rerolling. An optional portrait-to-reliquary puzzle can use authored hints, following DMG p. 81.

## 2. Small–medium effort — compact systems with visible payoffs

### 4. Feat-inspired blessings

**Effort:** 2–4 days. **Value:** high. **Source:** feats, pp. 192–201; retraining, p. 28.

- Offer a choice of three blessings at the first altar activation or from a reliquary.
- Begin with a small pool: increased maximum HP, improved Second Wind, or modest movement improvement.
- Present the actual benefit and record the choice in the HUD.
- Compute effective stats from base values plus modifiers; repeated interactions must not permanently multiply an already-modified value.
- Make healing caps, checkpoint restoration, and the player HUD use `health.max`; those paths currently assume 100 HP.

**Implementation:** a small modifier/choice component, an idempotent reward claim, and selection UI. Conditional effects such as stronger attacks against bloodied enemies can follow the damage pipeline. This gives runs variation before a full inventory exists.

### 5. Combat advantage and meaningful flanking

**Effort:** 3–5 days. **Value:** high. **Source:** pp. 279–280, 285; rogue Sneak Attack, p. 117.

- Give coordinated kobolds a visible damage bonus when allied attackers threaten opposite sides of the target.
- Check both attackers' melee reach, line of effect, and ability to act at impact time.
- Represent the result as a single per-attacker/per-target combat-advantage predicate; multiple qualifying reasons do not multiply the bonus.
- Later, let player powers create brief openings that use the same predicate and enable a rogue-style bonus strike.

**Implementation:** geometry checks in combat and explicit ally/hostile relationships. Prototype the bonus conservatively, for example +20% damage, with a “Flanked” cue. This converts the book's +2 attack-roll bonus into the current contact-based combat model. Attacking someone's back alone is a separate possible rule; the book's flanking requires an ally.

### 6. Typed damage and readable weaknesses

**Effort:** 3–5 days. **Value:** medium now, high with powers and loot. **Source:** power keywords, p. 55; resistance/vulnerability, pp. 276–277.

- Introduce a damage event carrying source, amount, type, and ability ID.
- Begin with weapon, fire, and radiant damage; introduce additional types alongside actual content that uses them.
- Add one obvious interaction, such as an altar blessing that makes the sword effective against a particular undead variant.
- Resolve resistance, vulnerability, temporary protection, and HP loss in a consistent order, and communicate the result.

**Implementation:** `CombatSystem.damage()`, projectile data, health/effect components, and hazard callers. The book uses flat resistance/vulnerability values; choose and document the game's scaling deliberately. Weaknesses assigned to our existing enemies are content decisions.

## 3. Medium effort — the main tactical expansion

### 7. Data-driven powers and a small action bar

**Effort:** 5–10 days for the framework and a first damage/healing kit. **Value:** highest. **Source:** pp. 54–59; fighter examples, pp. 77–78.

Build an ability definition around:

- Target mode, range, target relationship, and shape.
- Wind-up, impact, recovery, and cancellation rules.
- Per-ability cooldown duration and runtime remaining time, separate from attack recovery.
- Damage/healing/effect payloads and a procedural animation/effect identifier.
- Separate effect lifetime and trigger policy from ability recharge. DMG p. 41 gives approximately five minutes for an effect lasting “until the end of the encounter”; that is distinct from an encounter power's availability. Use individually tuned effect durations here rather than assigning every effect the 60-second recharge duration.

First abilities:

| Ability | Gameplay purpose | 4e inspiration |
| --- | --- | --- |
| Cleave | Hit the primary target and deal smaller damage to one other enemy in reach | Cleave, p. 77 |
| Heavy Strike | A committed, high-damage attack with limited availability | Brute Strike, p. 78 |
| Second Wind | Spend a recovery opportunity to regain health | Second Wind, p. 291 |
| Hamstring, after item 9 | Catch a retreating archer or disengage from a pursuer | Steel Serpent Strike, p. 78 |
| Shield Drive, after item 10 | Move an enemy out of cover or toward a hazard | Tide of Iron, p. 77 |

**Implementation:** introduce `src/abilities.ts` for definitions/resolution and ability state in `src/ecs.ts`; connect input, AI, animation, and HUD to that shared path. Add per-ability timers alongside the existing shared attack cooldown. Ability recharge is independent of item 8. Keys `1–4` are available; `Q/R` already rotate the camera, Space jumps, and X cancels movement/attacks.

**Real-time translation:** use the cooldown mapping above, with 60 seconds as the encounter-power baseline. Each ability should create a different decision about timing, target, or position. Strong powers should be worth using when available, while the repeatable kit keeps the player active between cooldowns.

### 8. Encounter objectives and momentum — optional later expansion

**Effort:** 3–6 days. **Value:** medium–high after the combat kit works. **Source:** pp. 258–259, 286.

- Track authored/seeded encounter groups, objective completion, and reward claims when structured fights need them.
- Keep group membership stable when enemies pursue across doors and rooms.
- Reward objectives or distinct group completions once, independently of the cooldown system.
- Optionally add action-point-inspired momentum: complete two distinct objectives/groups to earn a capped consumable extra-action/combo opportunity. Spending it consumes the charge, with no per-encounter activation rule.

**Implementation:** a proposed `src/encounters.ts`, encounter IDs on enemies, once-only reward claims, and objective feedback. Re-entering an unfinished fight, repeated altar interaction, and respawning must not duplicate milestones or rewards. Schedule this alongside encounter templates and progression rewards; powers and healing can ship earlier with their own timers.

**DMG refinement — completion and reward eligibility (pp. 120–123):** killing, routing, capturing, and successfully resolving an actual noncombat challenge can earn rewards. Simply walking around an unengaged monster is not automatically a defeated encounter. Define each objective's accepted outcomes, such as `defeated`, `disabled`, or an authored `negotiated`/`bypassed` resolution. An enemy's temporary retreat is not completion. Keep group rewards, quest rewards, and claimed treasure distinct; linked traps and monsters must not accidentally award the same encounter reward twice.

The book awards an action point after two encounters without an extended rest and explicitly excludes quest completion from that count. Counting objectives and capping momentum here are deliberate adaptations. Give each qualifying challenge one stable momentum credit; opening a reward chest or completing the quest attached to that same challenge must not add another. This tracking remains independent of cooldown recharge.

### 9. Shared conditions and temporary protection

**Effort:** 4–8 days after the ability/damage foundation. **Value:** very high. **Source:** pp. 277–279, 293–294.

- Start with **slowed**, **immobilized**, **weakened**, one ongoing-damage effect, and temporary HP.
- Use readable durations in seconds and explicit refresh/stacking rules. For example, the strongest slow applies, repeated applications refresh duration, and temporary HP uses the higher grant rather than summing.
- Make ongoing damage tick at a fixed gameplay cadence, independently of rendering frame rate.
- Surface icons/remaining duration and a clear temporary-HP layer.
- Add brief knockdown once the rig supports recovery from prone. Longer stuns and domination require substantially more control/AI design.

**Implementation:** a proposed `src/effects.ts`, ECS effect data, movement/attack gating, damage resolution, animation, and HUD. A movement-only restriction should still allow attacks; action-preventing conditions must cancel pending impacts consistently. Run condition updates before the actions they can prevent, for both the player and AI.

### 10. Push/pull/slide, charge, and safe repositioning

**Effort:** 5–10 days for a shove and short step first. **Value:** very high. **Source:** pp. 284–287, 292.

- Start with Shield Drive: push an enemy a short distance while respecting walls, furniture, closed doors, occupied space, and elevation.
- Add a short player repositioning action with an explicit endpoint and collision validation.
- Make environmental damage apply to every vulnerable actor, enabling a shove into lava.
- Distinguish ordinary safe navigation, voluntary ability movement, and forced displacement. Lava is hazardous floor, whereas void and solid obstacles have different rules.
- Add charge/pull/slide variants using the same movement foundation. Teleportation follows once destination and progression constraints are explicit.

**DMG refinement — displacement into danger (p. 44):** difficult terrain does not consume extra forced-movement distance; blocking terrain still stops it. A creature forced into hindering terrain gets a saving throw before entry; success leaves it prone at the edge and prevents a following attacker from occupying that space. **Proposed first-slice rule:** keep Shield Drive's collision-valid shove into lava deterministic and label this as our adaptation. If enemy pushes can cause lethal falls later, add a readable edge-catch/escape response rather than an invisible random rescue. Treat unsupported void separately from hazardous floor, and give players and enemies the same documented displacement rules unless an ability says otherwise.

**Implementation:** `src/actors.ts`, `src/navigation.ts`, `src/occupancy.ts`, collision adapters, shared hazards, and ability resolution. Reuse the shared living-actor occupancy and swept body collision, with an explicit traversal policy for forced displacement. Forced displacement should cancel/replan stale pursuits.

### 11. Area powers, temporary zones, and tactical encounter templates

**Effort:** 6–12 days after powers/conditions. **Value:** very high. **Source:** zones, p. 59; wizard spells, pp. 159–161; area geometry and targeting, pp. 270–273; difficult terrain, p. 284.

- Add a radial burst, a frontal blast, and one persistent hazard/slow zone with ground previews and enemy wind-up telegraphs.
- Prototype an ice patch that slows movement or a burning rune that damages actors remaining inside it.
- Apply line-of-effect checks from the actual effect origin to each target. A wall must stop a blast even when the target is within the radius.
- Give AI movement costs for harmful terrain, with bounded replanning when zones appear or expire.
- Build a few seeded compositions around terrain and complementary tactics: melee pressure with a ranged enemy of the same faction, a hazard-control caster, and a throne guardian with a bloodied phase.
- Use the raider squad's role reversal as a signature mixed encounter: hobgoblins support charging goblins at range, then take over melee as individual goblins become bloodied and retreat to shooting.

**Implementation:** shape queries, pooled zone rendering, shared hazards, weighted navigation, and encounter definitions. Our real-time blast can use a frontal wedge; the book's blast is a square area. Enemy role variants and the throne guardian are game-specific designs built from these mechanics. DMG pp. 54–59 supplies the role/template/budget framework developed in item 17; monster identities remain in the companion roster.

**DMG refinement — terrain contracts (pp. 43, 60–66):** distinguish difficult terrain (movement cost), blocking terrain (solid obstruction), challenging terrain (risky traversal), hindering terrain (dangerous or impassable), obscured terrain (visibility), and cover. Represent these as combinable properties rather than one exclusive surface label. Smoke should not stop a projectile merely because it obscures sight; low cover should not behave like a full-height wall. Area attacks test obstruction from their effect origin, and creatures do not provide cover against those attacks in the book. Split perception, line of effect, movement support, and physical projectile collision as content needs them. Include sufficient approach and escape space for a solo melee hero.

**Fantastic terrain shortlist (DMG pp. 67–69):**

| Source feature | Proposed use | Dependency / scope |
| --- | --- | --- |
| Font of Power, p. 68 | A forge rune modestly increases fire damage while occupied; eligible enemies can exploit it too | Typed damage and zone modifiers; first beneficial terrain candidate |
| Ember Moss, pp. 67–68 | A clearly marked floor patch increases fire damage taken | Typed damage; cap overlapping modifiers. The book's extra fire damage is the inspiration, not a general fire-spread simulation |
| Cloudspore, p. 67 | A disturbed growth emits a temporary concealment cloud | Separate sight from line of effect; one discharge per run is our short-run conversion |
| Sacred Circle, p. 68 | A royal ward grants a modest defensive benefit to its attuned faction | Our adaptation of the book's alignment-dependent attack bonus; provides a reason to contest a position |

Start with one of these, not the whole catalog. Healing terrain such as the Pillar of Life (p. 68) is a later experiment because free stationary healing overlaps Second Wind and the altar. Teleporters (p. 69) need destination/progression validation and an arrival latch so paired pads do not bounce an actor forever. Blood Rock (p. 67) depends on a critical-hit system; it is not an immediate fit for contact-based damage.

## 4. High effort — larger progression and adventure features

### 12. Equipment and short-run build progression

**Effort:** 2–3 weeks. **Value:** high. **Source:** advancement/retraining, pp. 27–29; feats, pp. 192–201; magic items, pp. 223–226.

- Turn reliquaries into choices among a small number of meaningful items: a weapon modifier, a defensive relic, and a movement relic.
- Use a few equipment slots and explicit replacement choices. Item powers use the same ability system as class powers.
- Add two or three run milestones that grant a feat or ability choice; reward objectives and completed challenges as well as fighting.
- Let the smithy provide a bounded upgrade choice and the altar provide retraining.

**Why it costs more:** item definitions, ownership/equipping, reward generation, choice UI, stat recomputation, procedural equipment visuals, and combination balancing. Items such as fire weapons or movement boots depend on the earlier effects and movement systems. The three existing chests give this feature a natural delivery mechanism.

**DMG refinement — reward parcels (pp. 125–126):** plan a finite reward allocation for the whole run, then assign it to locations and objectives. In the book, a default five-character party receives ten parcels across a level: four magic items and six monetary parcels, with adjustments for party size. Adopt the allocation method, not those quantities or the campaign economy.

- Seed three reliquary offers and one optional-objective reward, with an early useful choice, complementary later choices, and a distinct optional payoff. Reserve rewards before exploration so opening order cannot reroll their contents.
- Use blessings as the first parcel contents, letting a small reward allocator ship before inventory. Estimate **2–4 days after item 4 and basic objective claims**, included in the later equipment work rather than an additional full inventory estimate.
- Ensure offers are usable by the current kit and avoid duplicate capped benefits. If a guardian carries a claimable item later, reserve it from the same allocation instead of adding unbudgeted loot.
- Persist claims across death and altar use; clear them on a new dungeon. Keep required progression independent of finding an optional parcel.

### 13. Skills, traps, secrets, and utility rituals

**Effort:** 2–4 weeks for a small connected set. **Value:** high for exploration. **Source:** pp. 178–189, 258–263, 298–300; Knock, p. 307; Speak with Dead, p. 312.

- Start with Perception, Thievery, and Arcana/Religion as simple trained capabilities.
- Build one trap with several approaches: notice it, disable it, time a crossing, or spend a resource to neutralize it.
- Give ordinary side locks a key/skill/magic solution and a clear cost or consequence for each route.
- Add two utility rituals: reveal an optional hidden cache, and question a corpse for a seeded clue. Ordinary-lock opening is a useful third ritual.
- Tie a compact multi-step challenge to an existing room, such as stabilizing the forge with several successful interactions before it vents.

**Implementation:** new interaction variants, skill/challenge state, ritual costs and execution, clue authoring, and generation validation. Separate ordinary locks from progression seals; the current altar unlock loop unlocks every locked door, which needs refinement before side locks are introduced. Guarantee that required progression remains achievable for every build. DMG pp. 72–89 supplies the construction rules below.

#### Earlier slice — one interactive trap

**Effort:** 4–7 days after damage/projectile and interaction foundations; part of this feature's overall scope. **Source:** DMG pp. 85–89, 213. Bring this slice into Milestone C; trained skills and rituals can follow.

- Define a trap's discovery cues, trigger geometry, target policy, telegraph, attack/recovery cycle, countermeasures, and disabled/destroyed state. Track whether it has been discovered separately from whether it is active. DMG roles are **blaster, lurker, obstacle, and warder**; use them to describe its encounter contribution.
- Start with the **dart-firing suit of armor** from Kobold Hall (p. 213), adapted to a readable wind-up and dodgable projectile. It is a simpler fit than a pit requiring falling, climbing, and rescue behavior.
- Provide a visible safe route and at least two ways to neutralize it: reach a control lever or destroy its firing mechanism. Add Thievery as a faster disarm and Arcana as an option for magical variants later. A dangerous disarm channels in active simulation and can be interrupted; paused inspection only reveals information.
- Specify whether each trap affects every creature or recognizes intruders. The book contains both kinds; faction immunity should be authored, not an accidental consequence of actor-only hostility checks. Let a nonselective trap hurt enemies lured into its lane.
- Distinguish a temporary delay from permanent disabling. Freeze timers on pause, cap repeated triggers, and preserve destruction/disabling across checkpoint respawns. Include the trap in the encounter budget and reserve safe interaction approaches during generation.

**Implementation:** proposed `src/traps.ts`, ECS trap/interaction data, and explicit states under `src/machines/world/`, using the existing explicit simulation-tick pattern. Reuse projectile and effect resolution; make the firing mechanism a narrowly scoped destructible object through item 19. Kobold Hall's dart trap and skull-skull device (pp. 213–215) are useful examples of monsters exploiting machinery, rather than a reason to copy its five-PC populations.

#### Multi-step challenges and optional puzzles

**Effort:** 3–6 days for one challenge after reusable interactions and rewards; broader skill/ritual content remains within the original 2–4 week estimate. **Source:** DMG pp. 72–81.

- Define a goal, available approaches, progress target, failure limit, costs, and explicit success/failure outcomes. Persist progress when interrupted or when the player leaves the room.
- Separate **primary actions** that advance the objective from supporting actions that reveal a clue, improve a later attempt, or remove a hazard. Tools, known lore, or a ritual can open another approach or supply one automatic success.
- The supplied first-printing table on p. 72 uses success/failure limits of **4/2, 6/3, 8/4, 10/5, and 12/6** for complexities 1–5. The book budgets a challenge as a number of same-level monsters equal to its complexity (pp. 73–74). Store these concepts as data; a short solo challenge needs separately tuned action counts and risk.
- **Forge prototype:** decipher its operating order, release a pressure valve, and stabilize the binding rune. Trial three successful stages before two mistakes, explicitly our adaptation. A physical/tool-based route remains available to every kit; training gives a safer or shorter alternative. Each stage has a distinct state, so repeating an already-solved interaction cannot farm progress.
- Success safely shuts down the vents and grants one reward. Failure releases a telegraphed burst and locks out the bonus, while leaving a safe onward route. This follows the DMG's principle that failure changes the situation instead of ending the adventure.
- Show meaningful progress, available approaches, and the consequence of failure. Prefer spatial actions, choices, and committed interactions over repeatedly clicking for a favorable random roll. If checks are introduced, define DCs and retry costs deliberately rather than copying the first-printing table on p. 42.
- A portrait/royal-lineage puzzle is a separate optional content type: seed the solution and clues together, offer a hint through knowledge/inspection, and verify that the answer is deducible. Do not turn every single lock or clue into a multi-step challenge.

### 14. Distinct character kits

**Effort:** 2–4 weeks for three compact kits after the shared systems. **Value:** high replayability. **Source:** roles, pp. 15–16; fighter, pp. 75–78; rogue, pp. 116–119; wizard, pp. 156–161.

- **Knight:** cleave, shield drive, recovery, and a defensive stance.
- **Rogue:** mobility, an opening-producing strike, and a strong payoff against exposed targets.
- **Arcanist:** a ranged attack, a slowing spell, a burst, and a temporary zone.
- Give each a small active kit and one distinctive passive, with procedural silhouettes and readable attack effects.
- Balance each for solo completion; party-oriented defender and leader mechanics become more useful with allies.

**Why it costs more:** class selection, varied targeting/input, additional animations and effects, three complete progression paths, and enemy/dungeon balance across all three. Add classes incrementally after the Knight proves the shared ability model.

### 15. Stealth and alternate resolutions

**Effort:** 2–4 weeks for a restrained implementation. **Value:** medium–high. **Source:** Perception/Intimidate, pp. 186–187; Stealth, p. 188; vision/light, p. 262; concealment, pp. 280–281.

- Introduce enemy awareness, last-known position, searching, and a readable detection indicator.
- Use cover and authored light categories for stealth. Gameplay illumination should come from world data so graphics-quality changes cannot alter detection.
- Enable a surprise opening attack and one alternate resolution, such as a wounded goblin yielding a clue or passage.

**Why it costs more:** the current `clearSight()` conflates visibility and attack obstruction, and AI memory tracks a live target. Stealth needs separate perception/line-of-effect rules, believable search behavior, and authored consequences. Cosmetic darkness alone does not supply those systems.

### 16. Companions and party tactics

**Effort:** 3–6+ weeks for one useful companion and basic commands. **Value:** potentially high; largest shift in moment-to-moment play. **Source:** roles, pp. 15–16; fighter marking, p. 76; warlord, pp. 143–145; triggered actions, p. 268; opportunity attacks, p. 290.

- Add one companion with follow/hold/focus commands and a support action.
- Develop real defender marking, support abilities, ally flanking, and a downed/revive state.
- Pair opportunity-attack rules with a readable safe disengagement action and clear threat indicators.

**Why it costs more:** faction-aware targeting, follower navigation through doors/stairs, occupancy and congestion, command UI, support decisions, and checkpoint handling for multiple actors. The ECS is reusable, but player-role composition and encounter balance both change substantially.

Longer campaigns, persistent character saves, paragon-style specialization, and a broad ancestry/class catalog can build on these systems. Each requires its own content and progression scope beyond a single 5–10 minute dungeon run.

## 5. DMG-derived systems — proposed implementation slices

These entries extend the existing roadmap. Their effort assumes the dependencies named below and overlaps the corresponding encounter, exploration, and progression work above.

### 17. Budgeted encounter generation and pacing

**Effort:** 3–6 days for an authoring budget and three templates after monster definitions/factions. **Value:** very high. **Source:** DMG pp. 54–64, 104–105, 193–195. **Schedule:** begin with roster Wave A; integrate into Milestone C.

**Book rule:** choose an encounter level, then budget `standard-monster XP at that level × number of PCs`. At the same level, four minions are approximately one standard monster, an elite counts as two, and a solo as five. Traps/hazards can replace monsters in that budget. The DMG's sample templates assume five PCs.

**Game adaptation:** use an internal threat budget without introducing player levels or XP. Preserve source level/rank/XP as reference metadata and assign each adapted enemy a separately tunable threat cost. Book ratios are a starting comparison, not proof that a particular fight is fair for one real-time hero. The level-3 elite jelly is a larger commitment than a standard level-3 enemy; the roster's named wight remains a standard controller with authored support, not automatically a five-monster solo.

| DMG template | Hollow Crown application | Required space / counterplay |
| --- | --- | --- |
| Commander and Troops, p. 58 | Existing proposed hobgoblin–goblin squad | Reachable commander, retreat positions, readable order and handoff cues |
| Double Line, pp. 58–59 | An undead guard screening a deathlock wight | Cover from bolts and a route to pressure the caster |
| Battlefield Control, p. 58 | One hexer with light melee support, or a trap replacing the controller | A safe escape lane and enough room to avoid the control zone |
| Wolf Pack, p. 59 | Kobolds or rats with coordinated angles | Maneuvering room and a way to avoid a complete surround |

- Choose a template by faction, room role, accessible route depth, cover, maneuvering area, and reward importance. Select only compositions that fit both the budget and the geometry. Give rejected placements a deterministic simpler fallback.
- Budget qualitative pressure too: simultaneous ranged lanes, overlapping control, flankers, and trap coverage. Start with at most one heavy-control threat in an ordinary fight; tune through play rather than stacking individually affordable enemies.
- Vary simple teaching fights, mixed fights, an optional champion, and the finale. Respect the roster's type-diversity target without crowding every room or increasing the old population mechanically.
- Reserve any reinforcements up front. Consider neighboring groups that can join through doors when evaluating peak pressure; room-local budgets alone do not bound a cross-room fight.
- Record template, budget, members, and placement constraints in seeded encounter definitions. Authoring/population can ship before runtime completion tracking in item 8.

**Implementation:** replace the fixed room/kind/count array in `src/combat.ts::seedEnemies` with a pure seeded selector, using world geometry and roster definitions. Keep generated definitions separate from runtime completion state. Measure time to resolve, damage taken, overlapping threats, and cooldown waiting to calibrate costs.

### 18. Minion variants and authored champions

**Effort:** 2–4 days for one minion variant; 3–6 more for one champion after powers/conditions. **Value:** high encounter variety. **Source:** DMG pp. 54–55, 174–185. **Schedule:** minion pilot after Cleave; champion in Milestone C.

- Add separate rank and combat-role fields to game definitions. A minion is fragile but can still be dangerous; an elite is not simply a different species. Begin with the roster's optional **Decrepit Skeleton** variant, without counting variants toward the sixteen selected monster types.
- The book destroys a minion on any damage, including Cleave's secondary damage and damage without an attack roll, but excludes damage from a missed attack. In our contact-based system, an actual damaging contact, secondary effect, or hazard can kill the 1-HP variant; an avoided swing cannot. If miss-damage powers arrive later, preserve that distinction explicitly.
- Give minions a recognizable broken silhouette and simple attack. Keep crowd size modest and stagger wind-ups so a mob offers a Cleave payoff without unavoidable synchronized damage.
- Use the DMG's monster customization method for a small, authored champion catalog: one base creature plus a signature modifier, visible tell, and revised threat cost. Examples are a shield-bearing tomb sentinel or a fire-attuned forge brute. New powers and resistances must be reflected in the budget, not just the name.
- DMG p. 185 emphasizes extra opportunities to act and a first-bloodied recharge for elites, rather than HP alone. Translate this into one telegraphed phase change or once-only follow-up. If using a recharge override, declare it per ability; it must not silently reset all 60-second timers. Retain recovery windows and escape from control for the solo hero.
- The jelly's split and guardian's reanimation retain their roster-specific lifecycle/reward rules. Do not apply generic champion modifiers that duplicate their special triggers or multiply spawned bodies.

**Implementation:** monster definitions, bloodied trigger state, shared abilities, rendering variants, and item 17's costs. Broad random affix combinations and literal party-sized solo HP/action multipliers are outside this first slice.

### 19. Destructible mechanisms and environmental actions

**Effort:** 3–6 days for a small shared object-damage contract and two props after typed damage/interactions. **Value:** high reuse across traps and exploration. **Source:** DMG pp. 42, 64–66. **Schedule:** alongside the first trap; expand after Milestone C.

- Make selected objects valid damage targets with durability, material, affected damage types, and an intact/broken state. The DMG derives object HP from size and material and gives objects poison, psychic, and necrotic immunity. Adopt an explicit object profile rather than running objects through species-hostility or living-creature condition rules.
- Start with a destructible dart mechanism and an interactable brazier that tips once to create a short-lived burning patch. The latter adapts the environmental stunt example on p. 42; it uses ordinary interaction, shared zones, and a committed action rather than requiring a new character power.
- Give repeatable hazards lower sustained damage than costly one-use bursts. Reuse the damage pipeline and resolve affected actors uniformly; no unrestricted chain reactions in the first prototype.
- Breaking cover must update navigation blockers, projectile obstruction, interaction state, and its visual representation together. Mark selected breakables separately from batched decoration so the apparent destruction matches gameplay geometry.
- Restrict breakable doors to authored ordinary doors. Progression seals, load-bearing walls, the altar, and the throne need explicit protected profiles. An object cannot supply on-kill healing or momentum intended for meaningful hostile targets (DMG p. 40).

**Implementation:** ECS object durability and target-category data, `src/worldEntities.ts`, `src/worldTypes.ts`, combat/effect targeting, and blocker/render synchronization. This supports trap destruction and later physical lock bypasses through one contract.

### 20. Readiness, alarms, and encounter consequences

**Effort:** 1–2 days for readiness cues on existing social states; 3–6 more for local alarm propagation after perception/relationship contracts. **Value:** medium–high. **Source:** DMG pp. 36–37, 41, 86. **Schedule:** readiness with roster work; alarms as an incremental step toward item 15.

- The book distinguishes **asleep, distracted, ready, and alert** creatures. Map current cards/smoking/hacky-sack states to distracted readiness and guards to ready; sleep can be a later variant. Readiness changes detection/response and preparation, rather than granting a free opening against every idle creature.
- Add an explicit alarm event with source position, faction, range or connected-room reach, and expiry. A bell, warder trap, or escaping sentry can put a nearby squad on alert. A received alarm supplies a last-known location, not continuous knowledge of the player's position.
- Alerted enemies take defensive positions or begin a bounded search. Relayed alerts retain their original event ID/expiry, extending the existing social-alert approach without creating endless alert loops.
- Use pre-existing, budgeted guards as the first reinforcements. A fleeing creature travels to a valid ally/escape destination; it does not spawn unlimited replacements. Player pursuit, closing a door, or destroying the alarm offers counterplay where the authored communication rules permit it.
- Distinguish tactical withdrawal, escape, surrender, and death. The roster's bloodied goblin retreat continues into ranged combat and must not be treated as surrender or a defeated encounter. Add one optional surrender/clue outcome only after interaction and reward handling support it.

**Implementation:** species machines under `src/machines/monsters/`, shared perception/event data, squad relationships, room connectivity, and encounter objectives. Full light-based stealth remains item 15.

### 21. Goal-driven royal relics — later experiment

**Effort:** 4–8 days for one relic after item/reward, objective, and modifier systems. **Value:** strong thematic fit, lower immediate priority. **Source:** DMG pp. 164–165.

Artifacts in the DMG have goals and an attitude toward their wielder, measured by **concordance**. Actions aligned with those goals increase their power; contrary actions can diminish it. The book normally starts concordance at 5, uses five attitude bands, and gives artifacts a story-driven departure.

Adapt this to one royal relic recovered early enough to matter during the run: for example, a signet that rewards restoring royal wards and discovering its monarch's history. Use three clearly communicated attitudes and a modest passive/power change at each threshold. Show the relevant goals and attitude; visible progress is our adaptation of the book's hidden score. Count each qualifying objective once and recompute bonuses from the current attitude, preventing repeated altar or portrait interactions from farming power.

The Crown itself can use this model if play eventually continues after claiming it. For the current victory-on-claim structure, use a carried relic or a run-end judgment instead. This is an optional progression/narrative feature after the core combat slice.

### DMG material to defer

- **Disease tracks (pp. 49–50):** useful for a longer expedition with rests and treatment. The rat roster's Filth Fever does not translate naturally into a five-minute run; poison/short conditions already cover the immediate combat need.
- **Full aquatic, mounted, and free-flight combat (pp. 45–48):** require new traversal, targeting, and control models. Existing water and supported-floor hover enemies have smaller implementation scopes.
- **Wilderness survival, settlement/campaign simulation, and planar travel (pp. 130–163):** mainly longer-campaign content rather than the next dungeon systems.
- **Replacing the dungeon generator with random roll tables (pp. 190–195):** the existing seeded graph and progression validation are a better foundation. Borrow feature variety and encounter selection methods within its constraints.

## Recommended delivery order

### Milestone A — make the current hero more interesting

Ship bloodied feedback, Second Wind on a 60-second cooldown, one knowledge/side objective with dependable discovery cues, and Cleave through a minimal shared ability path. Introduce a small blessing choice once stat modifiers are centralized. Record role/rank metadata as monster definitions arrive; a minion variant is a useful small follow-up to Cleave.

**Success:** a player makes deliberate decisions about recovery, groups of enemies, and an optional exploration reward during a normal run.

### Milestone B — make position and resources matter

Add conditions, shared hazards, Shield Drive, and mechanical flanking. Make the proposed deterministic shove-into-lava rule explicit. Tune the 60-second baseline against observed fight lengths and time between ability uses. Introduce damage types when an actual power or blessing uses them. Start the encounter budget/selector alongside faction and roster work so later content has a placement contract.

**Success:** a player can slow a fleeing goblin, escape a kobold surround, and push a skeleton into lava; doors, stairs, and altar progression remain reliable. Cooldowns are readable and consistent across combat, exploration, pause, and respawn. Players have useful actions available while their stronger powers recharge.

### Milestone C — turn the dungeon into a coherent combat slice

Add one temporary zone, two or three budgeted encounter templates, a throne guardian, and seeded blessing/relic rewards distributed through a small parcel allocation. Add encounter-completion tracking where these objectives need it; claiming the throne requires both altar activation and guardian defeat. Include one dart-trap room with a safe route, reachable control, and destructible firing mechanism. Treat that trap as part of the room's threat budget.

**Success:** encounters ask different questions, a trap has multiple readable solutions, treasure changes the player's choices, and the final fight rewards techniques learned earlier in the dungeon. Different seeds preserve suitable approach space and a manageable peak threat level.

### Milestone D — optional exploration and consequence slice

Add the forge challenge, passive/trained discovery, ordinary lock alternatives, one beneficial terrain feature, and a local alarm outcome. Expand equipment or introduce the next character kit according to playtest results. Goal-driven relics follow once these choices and rewards have enough substance to support them.

**Success:** a player can resolve a challenge through different approaches, a failed optional task changes the room without blocking the run, and an alarm changes nearby enemy preparation without producing unbounded reinforcements.

## Suggested first showcase encounter

Use the existing forge and lava basin. Place two skeletons on safe floor with enough space to maneuver and clear approaches to the exit.

1. The player can engage them separately or position for Cleave.
2. Shield Drive creates an opportunity to push one into the lava.
3. A bloodied cue clearly communicates the remaining threat.
4. Second Wind creates a recovery decision if the player takes damage.
5. Used abilities continue recharging as the player explores onward; a prolonged fight can allow a second activation when its timer expires.

This exercises ability execution, positioning, hazards, feedback, and cooldown pacing in one existing room. It is a stronger initial proof than building several complete classes at once.

**Follow-up DMG showcase:** use an armory/crypt dart mechanism with one guard and safe cover. The player can dodge along the safe approach to its lever, destroy the emitter, or lure the guard into the firing lane if the trap is nonselective. Later training adds a faster disarm. This exercises shared object damage, telegraphs, targeting policy, and a non-kill solution before the full skill system.

## Verification for implementation milestones

- **Rules:** threshold transitions; healing limits; temporary HP absorption; condition expiry/stacking; effect attribution; one impact per attack; clear interruption behavior.
- **Spatial:** per-target area occlusion; opposing-side flanking; shoves against walls/doors; supported movement on stairs; consistent hazards for player and enemies; valid teleport endpoints if introduced.
- **Lifecycle:** independent cooldowns advancing only with simulation time; commitment/cancellation behavior; consistent timers across room transitions and death/respawn; once-only rewards; regeneration resetting abilities and clearing transient effects/intents.
- **Generation:** deterministic encounters/rewards; valid placement and approaches; progression with different kits and ordinary/progression locks.
- **Browser play:** real-key ability activation, target selection, cancellation, pause/inspection/focus handling, legible effects at the normal camera distance, and completion of several seeds.
- **Pacing:** time between useful ability activations; repeat uses during long fights; whether players habitually wait for cooldowns before proceeding; the effect of repeatable healing on dungeon tension.
- **Encounter budgets:** deterministic selection/fallbacks; role/rank costs; trap and reinforcement inclusion; neighbor-group convergence; room clearance; roster diversity without exceeding population constraints.
- **Traps and objects:** trigger/telegraph cadence; selective versus nonselective targeting; interruptible disarms; once-only disabling/destruction; synchronized cover/blocker updates; no ordinary object bypass of progression seals.
- **Challenges and discovery:** essential clues available to every kit; distinct stage progress; interruption/respawn persistence; useful success and failure outcomes; no repeat-action farming; generated puzzles have sufficient clues.
- **Rewards and consequences:** fixed parcel allocation; usable choices; one claim per source; no double momentum from nested objectives; retreat versus defeat; alert expiry/deduplication; first-bloodied and relic-goal events occur only as specified.

Extend the existing pure combat/navigation/world tests and focused combat browser checks as these systems land. The current combat performance baseline has not been hardware-profiled, so measure the zone/encounter expansion with the project's profiler before increasing simultaneous actors and effects substantially.
