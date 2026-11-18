# The Hollow Crown — 4e incorporation plan

## Recommendation

Adapt 4e's **tactical choices, power structure, and exploration rewards** to the existing solo, real-time dungeon crawler. The best first expansion is a small martial ability kit with recovery, crowd control, and positional attacks. Follow that with meaningful reliquary rewards and more deliberate encounters.

The reference is the June 2008 first-printing **Dungeons & Dragons 4th Edition Player's Handbook**, `ref/4e.pdf`. Page references below use the book's printed page numbers. The proposed names, timings, numerical tuning, encounter compositions, and real-time conversions are design suggestions for this game.

The companion [low-level monster roster](monster-roster-plan.md) draws from `ref/Monster Manual.pdf`: **16 selected types at book levels 1–5**, with a first implementation milestone of 12 playable types. It records source pages, real-time adaptations, room assignments, factions, and low-to-high-effort implementation waves.

Its [raider squad behavior](monster-roster-plan.md#raider-squad-behavior-goblins-forward-hobgoblins-behind) specifies the goblin–hobgoblin relationship: hobgoblins order healthy goblins into melee and throw projectiles from behind them; bloodied goblins retreat and shoot; once the goblin front line has retreated or fallen, hobgoblins advance into melee. This coordination belongs with the initial faction/monster expansion and uses ordinary AI orders alongside the cooldown-based power system.

Effort estimates are rough **focused developer working days for a small playable version**, including essential UI, procedural presentation, and verification. Later estimates assume the stated foundations exist; they are incremental, not standalone quotes. Content breadth and balancing are the main sources of uncertainty.

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
- A shared ECS for player/enemies, movement, attack wind-up/impact/recovery, health, projectiles, and corpses.
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

First abilities:

| Ability | Gameplay purpose | 4e inspiration |
| --- | --- | --- |
| Cleave | Hit the primary target and deal smaller damage to one other enemy in reach | Cleave, p. 77 |
| Heavy Strike | A committed, high-damage attack with limited availability | Brute Strike, p. 78 |
| Second Wind | Spend a recovery opportunity to regain health | Second Wind, p. 291 |
| Hamstring, after item 9 | Catch a retreating archer or disengage from a pursuer | Steel Serpent Strike, p. 78 |
| Shield Drive, after item 10 | Move an enemy out of cover or toward a hazard | Tide of Iron, p. 77 |

**Implementation:** introduce `src/abilities.ts` for definitions/resolution and ability state in `src/ecs.ts`; connect input, AI, animation, and HUD to that shared path. Add per-ability timers alongside the existing shared attack cooldown. Ability recharge is independent of item 8. Keys `1–4` are available; `Q/R` already rotate the camera and Space cancels movement/attacks.

**Real-time translation:** use the cooldown mapping above, with 60 seconds as the encounter-power baseline. Each ability should create a different decision about timing, target, or position. Strong powers should be worth using when available, while the repeatable kit keeps the player active between cooldowns.

### 8. Encounter objectives and momentum — optional later expansion

**Effort:** 3–6 days. **Value:** medium–high after the combat kit works. **Source:** pp. 258–259, 286.

- Track authored/seeded encounter groups, objective completion, and reward claims when structured fights need them.
- Keep group membership stable when enemies pursue across doors and rooms.
- Reward objectives or distinct group completions once, independently of the cooldown system.
- Optionally add action-point-inspired momentum: complete two distinct objectives/groups to earn a capped consumable extra-action/combo opportunity. Spending it consumes the charge, with no per-encounter activation rule.

**Implementation:** a proposed `src/encounters.ts`, encounter IDs on enemies, once-only reward claims, and objective feedback. Re-entering an unfinished fight, repeated altar interaction, and respawning must not duplicate milestones or rewards. Schedule this alongside encounter templates and progression rewards; powers and healing can ship earlier with their own timers.

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

**Implementation:** `src/actors.ts`, `src/navigation.ts`, collision adapters, shared hazards, and ability resolution. Dynamic actor occupancy needs explicit handling; the current navigation model primarily covers world geometry. Swept movement prevents tunneling, and forced displacement should cancel/replan stale pursuits.

### 11. Area powers, temporary zones, and tactical encounter templates

**Effort:** 6–12 days after powers/conditions. **Value:** very high. **Source:** zones, p. 59; wizard spells, pp. 159–161; area geometry and targeting, pp. 270–273; difficult terrain, p. 284.

- Add a radial burst, a frontal blast, and one persistent hazard/slow zone with ground previews and enemy wind-up telegraphs.
- Prototype an ice patch that slows movement or a burning rune that damages actors remaining inside it.
- Apply line-of-effect checks from the actual effect origin to each target. A wall must stop a blast even when the target is within the radius.
- Give AI movement costs for harmful terrain, with bounded replanning when zones appear or expire.
- Build a few seeded compositions around terrain and complementary tactics: melee pressure with a ranged enemy of the same faction, a hazard-control caster, and a throne guardian with a bloodied phase.
- Use the raider squad's role reversal as a signature mixed encounter: hobgoblins support charging goblins at range, then take over melee as individual goblins become bloodied and retreat to shooting.

**Implementation:** shape queries, pooled zone rendering, shared hazards, weighted navigation, and encounter definitions. Our real-time blast can use a frontal wedge; the book's blast is a square area. Enemy role variants and the throne guardian are game-specific designs built from these mechanics. The PHB provides player roles and powers; it does not provide the Monster Manual's enemy roster or a complete encounter-budget system.

## 4. High effort — larger progression and adventure features

### 12. Equipment and short-run build progression

**Effort:** 2–3 weeks. **Value:** high. **Source:** advancement/retraining, pp. 27–29; feats, pp. 192–201; magic items, pp. 223–226.

- Turn reliquaries into choices among a small number of meaningful items: a weapon modifier, a defensive relic, and a movement relic.
- Use a few equipment slots and explicit replacement choices. Item powers use the same ability system as class powers.
- Add two or three run milestones that grant a feat or ability choice; reward objectives and completed challenges as well as fighting.
- Let the smithy provide a bounded upgrade choice and the altar provide retraining.

**Why it costs more:** item definitions, ownership/equipping, reward generation, choice UI, stat recomputation, procedural equipment visuals, and combination balancing. Items such as fire weapons or movement boots depend on the earlier effects and movement systems. The three existing chests give this feature a natural delivery mechanism.

### 13. Skills, traps, secrets, and utility rituals

**Effort:** 2–4 weeks for a small connected set. **Value:** high for exploration. **Source:** pp. 178–189, 258–263, 298–300; Knock, p. 307; Speak with Dead, p. 312.

- Start with Perception, Thievery, and Arcana/Religion as simple trained capabilities.
- Build one trap with several approaches: notice it, disable it, time a crossing, or spend a resource to neutralize it.
- Give ordinary side locks a key/skill/magic solution and a clear cost or consequence for each route.
- Add two utility rituals: reveal an optional hidden cache, and question a corpse for a seeded clue. Ordinary-lock opening is a useful third ritual.
- Tie a compact multi-step challenge to an existing room, such as stabilizing the forge with several successful interactions before it vents.

**Implementation:** new interaction variants, skill/challenge state, ritual costs and execution, clue authoring, and generation validation. Separate ordinary locks from progression seals; the current altar unlock loop unlocks every locked door, which needs refinement before side locks are introduced. Guarantee that required progression remains achievable for every build. Full skill-challenge construction rules are in the Dungeon Master's Guide; the PHB supplies the concept and skill uses.

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

## Recommended delivery order

### Milestone A — make the current hero more interesting

Ship bloodied feedback, Second Wind on a 60-second cooldown, one knowledge/side objective, and Cleave through a minimal shared ability path. Introduce a small blessing choice once stat modifiers are centralized.

**Success:** a player makes deliberate decisions about recovery, groups of enemies, and an optional exploration reward during a normal run.

### Milestone B — make position and resources matter

Add conditions, shared hazards, Shield Drive, and mechanical flanking. Tune the 60-second baseline against observed fight lengths and time between ability uses. Introduce damage types when an actual power or blessing uses them.

**Success:** a player can slow a fleeing goblin, escape a kobold surround, and push a skeleton into lava; doors, stairs, and altar progression remain reliable. Cooldowns are readable and consistent across combat, exploration, pause, and respawn. Players have useful actions available while their stronger powers recharge.

### Milestone C — turn the dungeon into a coherent combat slice

Add one temporary zone, two or three encounter templates, a throne guardian, and a small set of meaningful reliquary rewards. Add encounter-completion tracking where these objectives need it. Then expand either the exploration systems or the next character kit according to playtest results.

**Success:** encounters ask different questions, treasure changes the player's choices, and the final fight rewards techniques learned earlier in the dungeon.

## Suggested first showcase encounter

Use the existing forge and lava basin. Place two skeletons on safe floor with enough space to maneuver and clear approaches to the exit.

1. The player can engage them separately or position for Cleave.
2. Shield Drive creates an opportunity to push one into the lava.
3. A bloodied cue clearly communicates the remaining threat.
4. Second Wind creates a recovery decision if the player takes damage.
5. Used abilities continue recharging as the player explores onward; a prolonged fight can allow a second activation when its timer expires.

This exercises ability execution, positioning, hazards, feedback, and cooldown pacing in one existing room. It is a stronger initial proof than building several complete classes at once.

## Verification for implementation milestones

- **Rules:** threshold transitions; healing limits; temporary HP absorption; condition expiry/stacking; effect attribution; one impact per attack; clear interruption behavior.
- **Spatial:** per-target area occlusion; opposing-side flanking; shoves against walls/doors; supported movement on stairs; consistent hazards for player and enemies; valid teleport endpoints if introduced.
- **Lifecycle:** independent cooldowns advancing only with simulation time; commitment/cancellation behavior; consistent timers across room transitions and death/respawn; once-only rewards; regeneration resetting abilities and clearing transient effects/intents.
- **Generation:** deterministic encounters/rewards; valid placement and approaches; progression with different kits and ordinary/progression locks.
- **Browser play:** real-key ability activation, target selection, cancellation, pause/inspection/focus handling, legible effects at the normal camera distance, and completion of several seeds.
- **Pacing:** time between useful ability activations; repeat uses during long fights; whether players habitually wait for cooldowns before proceeding; the effect of repeatable healing on dungeon tension.

Extend the existing pure combat/navigation/world tests and focused combat browser checks as these systems land. The current combat performance baseline has not been hardware-profiled, so measure the zone/encounter expansion with the project's profiler before increasing simultaneous actors and effects substantially.
