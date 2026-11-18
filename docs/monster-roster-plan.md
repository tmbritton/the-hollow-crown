# The Hollow Crown — low-level monster roster

## Selection

Build toward **16 monster types**, retaining the existing skeleton, ranged goblin, and pack-fighting kobold and adding **13 types**. The first implementation milestone for roster breadth is **12 playable types**; the final four add more specialized behavior.

Source: **Dungeons & Dragons 4th Edition Monster Manual**, first printing, June 2008, [local reference](../ref/Monster%20Manual.pdf). The level index on printed p. 284 provides the low-level shortlist; the selections below were checked against their individual statistics and tactics. All page references are printed book pages.

Interpret “fairly low-level” as **levels 1–5**, with level 1–3 creatures providing most regular opposition and level 4–5 creatures appearing as later threats or room champions. Book levels and roles describe the source entries. Health, damage, attack timing, control durations, and population sizes need tuning for this game's single real-time hero.

The roster supports four themes: **the keep's undead inhabitants, goblinoid raiders, a kobold brood with trained beasts, and dungeon vermin/occult intruders**. Room names refer to roles in the seeded layout; challenge should also consider distance along the accessible route, since room order changes between seeds.

## Chosen roster

“Existing” means the game already has a broad implementation to develop toward the named reference; it does not mean the full book stat block is implemented.

| # | Monster type | Book level and role | Page | Dungeon placement | Distinctive gameplay and counterplay |
| --- | --- | --- | --- | --- | --- |
| 1 | **Skeleton** — existing | 3 Soldier | 234 | Crypt, armory, throne | Relentless armed guard with deliberate sword attacks. Bait its wind-up and reposition; later add a readable guard/punish mechanic. |
| 2 | **Goblin Sharpshooter** — existing ranged goblin | 2 Artillery | 137 | Bakery, smithy, treasury | Normally shoots from cover; obeys a hobgoblin's melee charge until bloodied, then retreats and resumes shooting. Force its morale break or eliminate the commander. |
| 3 | **Kobold Skirmisher** — existing kobold | 1 Skirmisher | Stable, stairs, passages | Packs seek different attack angles and exploit an isolated target. Keep the pack on one side or separate members at a doorway. |
| 4 | **Zombie** | 2 Brute | Butchery, crypt | Slow, heavy slam and a telegraphed grab. Keep moving and attack after its committed swing; its victim can still fight while held. |
| 5 | **Dire Rat** | 1 Brute | Bakery, supplies, flooded gallery banks | Low-slung pack attacker emerging around furniture. A weak individual threat that makes Cleave useful against a small group. |
| 6 | **Guard Drake** | 2 Brute | Lizard stable, kobold-held passages | A compact reptilian guard whose bite becomes more dangerous near its allies. Separate it from its handler or pack. |
| 7 | **Hobgoblin Soldier** | 3 Soldier | 139 | Armory, guarded passage | Orders goblins into melee and throws projectiles from behind them. Advances into melee when its goblin front line has retreated or fallen. |
| 8 | **Bugbear Warrior** | 5 Brute | 135 | Treasury, butchery; room champion | Large humanoid silhouette, heavy morningstar, and an ambush/knockdown strike. Avoid its conspicuous wind-up and punish the recovery. |
| 9 | **Fire Beetle** | 1 Brute | 30 | Cinder Forge, blacksmith, bakery hearth | Glowing glands telegraph a short frontal fire spray. Move around its flank and attack while the spray recharges. |
| 10 | **Goblin Hexer** | 3 Controller (Leader) | 137 | Treasury, raider-held workroom | Normally uses hexes and a vexing cloud; under hobgoblin orders, charges with its rod until bloodied, then retreats to ranged casting. Interrupt its casts or break the squad's command. |
| 11 | **Deathjump Spider** | 4 Skirmisher | 246 | Stairs, crypt recesses, ruined passages | Crouch, leap to a marked landing point, then poison/slow on contact. Step out of the landing area and strike during recovery. |
| 12 | **Ghoul** | 5 Soldier | 118 | Butchery or deeper crypt; room champion | Fast claws briefly immobilize, followed by a dangerous bite. Interrupt or knock it back during the follow-up; avoid repeated control chains. |
| 13 | **Stirge** | 1 Lurker | 248 | Flooded gallery, damp passages | Flying bloodsucker that latches on after a telegraphed approach. Dodge the approach, hit the attached creature, or shake it off. |
| 14 | **Ochre Jelly** | 3 **Elite** Brute | 202 | Low flooded chamber, treasury side room | A slow acid blob that splits when first bloodied. Make space for the split and control the two smaller bodies. |
| 15 | **Imp** | 3 Lurker | 63 | Smithy, occult side chamber, treasury | Brief vanish/reposition followed by a poison sting. Track its visual disturbance and punish the reveal. |
| 16 | **Deathlock Wight** | 4 Controller | 262 | Throne room; named final guardian | Grave bolts impede movement, a fear blast creates distance, and a cast reanimates a fallen undead guard. Use cover, close in, and interrupt the resurrection. |

This includes melee pressure, pack tactics, ranged harassment, formation defense, area denial, ambushes, attachment, a splitting enemy, and a resurrection caster. The hexer adds a distinct caster archetype within the goblin family; the other additions provide new creature identities and silhouettes.

## Adaptation details

### Familiar enemies with stronger identities

- **Skeleton:** the book's standard skeleton is a level 3 soldier, while the separate Decrepit Skeleton is a level 1 minion. Use the standard entry as the current guard's reference. An early fragile variant can later use the decrepit entry. The book's marking and opportunity-attack rules can become a visible guard stance after the player has a reliable repositioning tool.
- **Goblin Sharpshooter:** the current cover/peek/bolt behavior already closely matches its independent role. Add a short-sword melee profile for commanded charges, then return to the crossbow after a bloodied retreat. Preserve dodgable projectiles and communicate both attack modes.
- **Kobold Skirmisher:** the book gives it both mob attack and combat advantage. Translate coordinated positioning into a modest, visible bonus with a cap; avoid multiplying damage for every pack member without a limit.

### New regular enemies

- **Zombie:** begin with slow movement, a heavy slam, and a distinct shambling animation. Add its grab after shared control/escape behavior exists. The book's automatic death on a critical hit can inspire an execution opening later; it requires a defined critical/finisher system first.
- **Dire Rat:** use its pack hunting as the defining mechanic. The book's bite transmits Filth Fever, a multi-stage disease tied to rests and healing surges. A short-run first version uses the bite and pack pressure; any later wound debuff should be identified as our adaptation.
- **Guard Drake:** implement its nearby-ally bite bonus with a clearly defined faction/pack relationship. Reuse procedural lizard construction ideas from the stable, with a separate combat rig, collision shape, and hostile silhouette.
- **Hobgoblin Soldier:** use the command–ranged support–melee sequence specified below as its primary behavior. Equip it with thrown javelins for support and a shield/flail for close combat. This user-requested sequence and ranged loadout extend the book's soldier. Phalanx defense can later become modest damage reduction beside another hobgoblin, visibly lost when the formation separates; mark/slow mechanics can follow the effects system.
- **Fire Beetle:** its fire spray is a **recharge 5–6** attack, not an encounter power. Give it a recurring, telegraphed attack with its own timer. The glowing glands are an excellent readable procedural visual.
- **Goblin Hexer:** start with a visible projectile hex and a small vexing cloud. Use a brief weakened effect to represent offensive disruption in our contact-based combat. Give it a melee rod profile so it follows the same hobgoblin charge/bloodied-retreat rules as other goblins. Full blindness, ally attack redirection, and extra-action granting are later extensions. Its encounter-limited cloud uses the agreed 60-second baseline.

### More demanding threats

- **Bugbear Warrior:** the book combines stealth, combat advantage, and a special knockdown/daze attack. Start with a staged ambush from behind existing cover and a heavy telegraphed strike. Add a brief stagger when the condition system is ready. Skullthumper and Predatory Eye are encounter powers, so use the 60-second baseline with their activation conditions.
- **Deathjump Spider:** this particular spider **does not spin webs**. Its signature is a poisonous leaping attack. Validate its landing and traversal against walls, closed doors, floor support, and progression gates. Death from Above is at-will in the book; Prodigious Leap is a separate encounter movement power. Give the combat pounce a shorter recovery timer and the exceptional escape leap a 60-second cooldown.
- **Ghoul:** the book's claw-to-bite sequence can repeatedly immobilize and stun. For a solo hero, use a short root, a readable follow-up wind-up, and a brief immunity window after control ends. Preserve normal attacks while movement is restricted so the player has counterplay even when special abilities are cooling down.
- **Stirge:** retain attachment and blood drain. Keep the attached stirge targetable and provide an ordinary escape interaction independent of the player's 60-second powers. Cap simultaneous attachments on the hero and end drain immediately when detached or killed. A supported-floor hover movement mode is a practical first implementation of its flight.
- **Ochre Jelly:** the source is an **elite**, with two-monster encounter weight (glossary p. 281). Treat it as an isolated room event. Its split occurs on becoming bloodied, not on being struck by a particular damage type. Split only once; both children inherit the spent split flag, share the remaining health budget, and award one combined reward. A lethal hit must not create survivors. Use validated floor space for both children. The source's squeezing under doors and inability to climb steps need explicit movement policies; start with a low, level room and ordinary solid-door boundaries.
- **Imp:** build a readable stalk–vanish–sting–retreat loop. The book's Tail Sting recharges through Vanish, rather than a die roll or once-per-encounter rule. Use a timed vanish cycle and event-gated sting availability. Brief shimmer, disturbance, and reveal cues preserve counterplay. Initial hover follows valid room navigation; true free flight can follow later.
- **Deathlock Wight:** the source is a **standard level 4 controller**, not a solo monster. A named throne-guardian version is our adaptation, supported by a small number of guards. Grave Bolt becomes a dodgable projectile with brief movement impairment; Horrific Visage becomes a telegraphed push. Reanimate is an encounter power and uses a 60-second cooldown. The source excludes minions and restores about a quarter of maximum HP; use an ordinary fallen skeleton/zombie as its target. Bound eligible corpses, interrupt the cast, and prevent duplicate kill rewards. Replace healing-surge drain with a short, explicitly adapted weakened effect if a drain mechanic is needed.

## Cooldowns and low-level tuning

Follow the recharge distinctions on Monster Manual p. 7:

| Source mechanic | Real-time adaptation |
| --- | --- |
| At-will attacks | Normal wind-up/recovery; additional short ability cooldowns where repeated control or mobility needs pacing. |
| Encounter powers | **60 seconds per ability**, retaining required targets and trigger conditions. |
| Recharge-die attacks | Individually tuned recurring timers. Trial a fire-beetle spray around 8–12 seconds; this is a gameplay starting point, not a literal round conversion. |
| Event-recharged powers | Keep the relevant event, bounded by the actor's action timers; for example, Vanish enables the imp's next sting. |
| First-bloodied transformations | Preserve the one-time threshold trigger. A cooldown expiring does not create a second “first bloodied” event or let split offspring reproduce indefinitely. |

Start powers ready when enemies become available for combat, then require valid target selection and a wind-up. Stagger decisions and openings so a group does not discharge every special attack simultaneously. Timers use simulation time and freeze when gameplay pauses, as described in the [4e incorporation plan](4e-incorporation-plan.md).

For a single low-level hero:

- Introduce each new behavior in a small, readable fight before combining it with another mechanic.
- Keep poison, root, and stagger durations short and their indicators clear. Let damage-over-time effects refresh or use the strongest application rather than grow without bound.
- Place a high-pressure controller or champion with limited support. Elite rank and control combinations matter as much as printed level.
- Give enemies explicit counterplay: dodge a wind-up, break sight, interrupt, separate allies, or exploit recovery.
- Add ordinary attacks and mobility opportunities between the hero's longer cooldowns so progress does not depend on waiting a minute before every room.

## Dungeon population and example fights

The target is a **16-type catalog**, with **at least 12 distinct selected types in a standard full dungeon** once the full roster lands. Use seeded selection and room-capacity constraints rather than simply increasing the old fixed 21-enemy population. Begin near the current total population, then tune counts and champion frequency through playtesting.

The entrance and altar remain recovery spaces in the population design. Select suitable combat rooms by role, route depth, free floor area, and available cover. Large jelly placement and multiple-body split clearance need explicit validation.

These are proposed solo-game compositions, not the book's party-sized encounter budgets:

| Room/event | Starting composition | What the fight teaches |
| --- | --- | --- |
| Bakery infestation | 2 dire rats | Track small attackers around furniture; use Cleave against clustered targets. |
| Stable defense | 2 kobold skirmishers + 1 guard drake | Separate the drake from its allies and keep the pack in front. |
| Armory raider squad | 1 hobgoblin soldier + 2 goblin sharpshooters | Goblins charge while the hobgoblin throws javelins. Bloody each goblin to reverse their roles, or attack the commander to break its orders. A later two-hobgoblin version demonstrates shared command and phalanx defense. |
| Forge crossing | 1 fire beetle + 1 kobold skirmisher | Dodge a blast while managing melee pressure and nearby lava. |
| Butchery champion | 1 ghoul, initially alone | Recognize the claw-to-bite sequence and interrupt its follow-up. |
| Treasury raiders | 1 bugbear warrior + 1 goblin hexer | Choose between interrupting the controller and exploiting the brute's recovery. Reserve for a later optional room. |
| Drowned chamber | 1 ochre jelly, with clear maneuvering space | React to a one-time split and control two threats without being cornered. |
| Stairs ambush | 1 deathjump spider | Read the landing marker and dodge a committed pounce. |
| Damp passage | 1–2 stirges | Deal with attachment before sustained damage accumulates. |
| Occult side room | 1 imp | Track disappearance/reappearance and punish a reveal. |
| Throne | 1 named deathlock wight + 1–2 ordinary skeleton guards | Use cover, resist displacement, and interrupt Reanimate. |

For the throne fight, claiming the crown requires both altar activation and guardian defeat. The current interaction only checks altar progression, so the final-fight objective needs an explicit completion flag.

## Factions and coexistence

### Unalerted social behavior

Social creatures gather at seeded, navigation-safe activity spots. Groups can play cards, pass a hacky sack, or take a smoke break; solitary creatures use a suitable solo activity. Activity-specific poses, put-away weapons, and visible props communicate that they are unaware. A detected hostile interrupts the activity and activates combat behavior. After the threat is lost, survivors return to their assigned gathering, with a solo fallback if too few remain for the group game. These activity and return states belong in each monster kind's own machine.

This foundation is implemented for the current goblins and kobold packs. Future raider squads can use the same gathering data while their own machines handle hobgoblin orders and morale.

Replace species inequality as the hostility rule before introducing mixed groups:

- **Oathbound dead:** skeletons, zombies, ghouls, and the deathlock wight cooperate under a shared controller/faction.
- **Keep raiders:** goblin sharpshooters/hexers, hobgoblins, and bugbears cooperate. Hobgoblins command the goblins in their local squad using the behavior below.
- **Kobold brood:** skirmishers, trained guard drakes, and assigned fire beetles share allegiance.
- **Unbound creatures:** rats, spiders, stirges, jellies, and unbound imps use explicit local hostility/neutrality rules. A bound imp can join its master's faction.

Species, faction, pack, and combat role are separate fields. This lets a trained drake cooperate with kobolds while a wild drake behaves differently, and prevents skeletons from attacking allied zombies simply because their types differ. Retain deliberate cross-faction infighting where useful.

### Raider squad behavior: goblins forward, hobgoblins behind

**User-directed behavior:** hobgoblins order goblins to charge into melee. Goblins obey until bloodied, then retreat and shoot projectiles. Hobgoblins provide thrown-projectile support while their goblins are attacking, then enter melee once the goblin front line has retreated. This becomes the selected hobgoblin soldier's behavior and uses the existing goblin types.

| Squad phase | Goblins | Hobgoblins |
| --- | --- | --- |
| Order and charge | Healthy goblins accept a local charge order, draw melee weapons, and pursue the shared target. | Signal the order and move into ranged-support positions. |
| Goblin front line active | Charging goblins attack in melee until individually bloodied. | Throw javelins while at least one ordered goblin is still charging or fighting. |
| Some goblins bloodied | Each bloodied goblin immediately abandons its charge, retreats to safe firing distance/cover, and resumes projectile attacks. Healthy goblins continue melee. | Continue ranged support while the remaining goblin front line holds. |
| Goblin front line exhausted | Surviving goblins fight at range, retreating again if threatened. | Once all assigned charging goblins have retreated or died, draw melee weapons and advance. |

**Goblin rules**

- Bloodied means current HP is **at or below 50% of maximum**. Check the threshold after damage and before the next AI action. A lethal hit resolves death instead of retreat.
- Bloodied retreat takes priority over orders and cancels an unresolved melee wind-up. An impact that already happened remains resolved, and existing cooldowns keep running.
- Record a sticky `moraleBroken` flag for that spawned goblin. Another command or healing above half health does not send it straight back into melee; a newly spawned goblin starts fresh. This avoids charge/retreat oscillation without encounter-boundary detection.
- Treat retreat and ranged fighting as separate stages: create distance or reach cover, then fire. If cornered, the goblin may defend itself in melee while looking for an escape; it still refuses a renewed charge.
- Goblins without a valid commander use their normal independent ranged/cover behavior. The charge rule applies to both selected goblin types: sharpshooters use their short swords and hexers their rods, then fall back to bolts or ranged magic respectively.

**Hobgoblin rules**

- Track the ordered goblins in a **local squad**, rather than counting every goblin in the dungeon. A goblin charging toward the target counts as front-line support even before its first hit.
- The switch happens when the last participating goblin **starts retreating**, dies, or becomes persistently unable to reach the target. A fleeing goblin does not need to arrive at cover before the hobgoblin advances. A brief stun or attack recovery does not remove a goblin from the front-line count.
- With no healthy, reachable goblins available, the hobgoblin starts in melee. It must not wait forever for a dead, isolated, or path-blocked subordinate.
- Directly threatened hobgoblins can defend themselves in melee during the support phase. If the threat leaves, they resume ranged support while their front line remains active. Once committed to the main melee advance, they stay committed while their target remains valid.
- Javelins use the shared dodgable projectile system. Support AI seeks a clear firing lane around allies; a blocked lane causes repositioning or holding fire. World geometry and closed doors continue to block shots.

**Orders and leadership**

- Assign one active order-giver per squad using a deterministic priority. Other hobgoblins share the same target/front-line snapshot and follow the same support-to-melee transition, avoiding conflicting orders.
- Deliver orders only to living, same-faction, same-squad goblins within a local command range and a valid communication path. For the initial implementation, use visibility plus range; once accepted, pursuit can continue through ordinary door navigation.
- An order carries a commander ID, target ID, and revision. Only update it when the command changes, so repeated AI ticks do not cancel and restart an attack or path.
- If the commander dies or becomes persistently unavailable, another eligible squad hobgoblin takes over. If none remains, surviving goblins abandon the order and revert to independent ranged tactics. Bloodied goblins keep their broken-morale state under a replacement commander.
- Clear orders whose target dies or becomes invalid. Retarget using the squad's actual perception/memory and issue a fresh order only to eligible goblins.
- Orders are ordinary AI coordination. They can be issued when needed, with a short presentation debounce, independently of the **60-second special-power cooldowns**.

**Presentation and player decisions**

- Show a pointing/weapon gesture and a short “Charge!” bark when an order is issued; a brief text cue works before audio exists.
- Give goblins a visible melee-weapon switch, a bloodied panic cue, and a turn/run animation before they draw ranged weapons.
- Show hobgoblins put away their throwing weapon and advance with shields raised when the front line breaks.
- This gives the player three readable approaches: pressure the goblins until their morale breaks, eliminate the commander to dissolve the charge, or bypass the goblins and directly pressure the ranged hobgoblins. Wounded goblins remain dangerous ranged opponents after withdrawing.

**Implementation:** add squad membership, command state, morale state, and separate melee/ranged attack profiles to the actor definitions. Compute squad decisions from one shared snapshot per AI update, then let each actor produce an intent for the existing movement/attack systems. Build this in Wave A alongside factions and the hobgoblin; add hexer participation when Wave B introduces it.

## Implementation order: low to high effort

### Wave A — strengthen the existing foundation: 8 types total

Keep skeleton, goblin sharpshooter, and kobold skirmisher. Add **zombie, dire rat, guard drake, hobgoblin soldier, and bugbear warrior**.

- Introduce monster definitions for base stats, faction/role, movement profile, attacks, rig recipe, and hit/death effects.
- Implement local raider squads, hobgoblin orders and thrown projectiles, goblin melee/ranged switching, sticky bloodied retreat, and the hobgoblin melee handoff.
- Reuse humanoid construction for zombie, hobgoblin, and bugbear; give each a distinct silhouette and animation timing.
- Add quadruped locomotion and selection volumes for the rat and drake.
- Start with their basic tactical identities; grabs, formation effects, and special conditions can be layered onto the shared systems in Wave B.

### Wave B — active monster mechanics: 12 types total

Add **fire beetle, goblin hexer, deathjump spider, and ghoul**.

- Build telegraphed attack shapes, typed damage, brief conditions, and per-ability timers.
- Add a persistent cloud, a validated pounce, and readable control/escape behavior.
- Finish the zombie grab, hobgoblin formation benefit, and bugbear special strike; connect the hexer's melee rod and ranged spells to squad orders.
- This is the first acceptance milestone with at least a dozen playable monster types.

### Wave C — specialized encounters: 16 types total

Add **stirge, ochre jelly, imp, and deathlock wight**.

- Attachment/detachment and hovering.
- Split lifecycle, multiple collision bodies, health/reward attribution, and limited spawn budgets.
- Concealment/visibility and event-gated attacks.
- Reanimation of existing corpses, interrupted casts, and final-guardian progression.

### Main code touchpoints

- `src/ecs.ts`, `src/actors.ts`: replace fixed kind-to-stat assumptions with definitions; add factions, squad/command/morale state, abilities, and movement profiles.
- `src/combat.ts`: dispatch behavior through monster definitions; coordinate squad decisions, melee/ranged handoffs, and shared targeting/effects/cooldowns/damage resolution.
- `src/enemyRendering.ts`, `src/actorRendering.ts`: add humanoid, quadruped, arthropod, winged, and ooze rig strategies. The existing renderer assumes two arms/two legs and a small set of species.
- `src/navigation.ts`: support per-monster clearance and ability-specific traversal. Door operation, jumping, hovering, and splitting should all respect progression boundaries.
- `src/world.ts` / encounter population: seed role-appropriate placements, count distinct types, and validate approaches, floor area, and supported movement.
- `src/main.ts`, `src/ui.ts`: conditions, escape feedback, clear monster names, and throne-guardian completion.

## Additional variants after the core roster

These reuse established foundations and can widen encounter variety later:

- **Decrepit Skeleton** — level 1 minion, p. 234: fragile supporting guards.
- **Kobold Slinger** — level 1 artillery, p. 168: fire/glue ammunition using the projectile/effects systems.
- **Blazing Skeleton** — level 5 artillery, pp. 234–235: fiery ranged undead for the forge.
- **Gelatinous Cube** — level 5 elite brute, p. 202: a slow corridor encounter once engulf/escape and large-body navigation work.

The early roster already meets the type-count goal before these variants are added.

## Acceptance criteria

- Twelve distinct playable types at Wave B, sixteen at Wave C; each has a recognizable silhouette and at least one meaningful tactical difference.
- The standard full-dungeon generator selects at least twelve available types once the roster milestone permits it; repeated seeds reproduce archetypes and placements.
- Faction allies cooperate, deliberate enemies retain infighting, and AI cannot damage or chase the wrong faction accidentally.
- Raider squad checks cover accepted orders, exact half-health retreat, partial retreat while healthy goblins keep fighting, the last-goblin handoff, dead/unreachable subordinates, blocked firing lanes, direct pressure on hobgoblins, and commander death/replacement. Repeated commands or healing cannot override broken morale.
- The same squad scenario works with multiple hobgoblins and with a hexer; target death and regeneration clear stale orders, and AI update order does not change the squad's phase.
- Telegraphs, projectiles, pounces, grabs, clouds, and fear pushes respect appropriate range, obstruction, and movement rules.
- Escapes remain possible when the player's special powers are on cooldown; control/attachment combinations cannot indefinitely remove player agency.
- Jelly splitting and wight reanimation have bounded actor counts, valid placement, and once-only reward accounting. Enemy defeat, player respawn, and regeneration leave no stale attachment or cast state.
- All selected kits can complete the altar-to-throne route, and victory requires defeating the throne guardian once it is introduced.
- Browser checks cover clicking differently sized/flying/attached enemies, readable effects, correct corpses and hit particles, and stable performance with the revised population.
