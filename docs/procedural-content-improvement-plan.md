# The Hollow Crown — procedural content improvement plan

**Status:** roadmap in progress. Phase 0 diagnostics, fixed metadata corpus and visual gallery
are implemented, along with shared keep-history data and linked portrait/room captions.
See [implementation progress](implementation-progress.md) for verification and remaining
baseline, scene-composition and visual-identity gates. Unmarked work below remains proposed.

**Date:** 2026-11-18.

**First delivery:** three recognizably different keep identities, coordinated scenes in the forge and bakery, one memorable inhabitant per keep, and tools for comparing seeds.

## 1. Goal

Make each generated keep feel like a specific place with a connected history, recognizable inhabitants, and meaningful exploration decisions. A player should be able to describe what distinguished a run beyond its seed or room coordinates.

The first success question is: **can players recognize, describe, and remember three generated keeps differently?** Later milestones add different adventure structures and ways to retain those discoveries.

### Design references

- Kate Compton, [Practical Procedural Generation for Everyone](https://www.youtube.com/watch?v=WumyfLEa6bU). The local [timestamped transcript](../ref/practical-procedural-generation-for-everyone-transcript.md) contains automatic captions and may have recognition errors.
- Jon Ingold, [Narrative Sorcery: Coherent Storytelling in an Open World](https://www.youtube.com/watch?v=HZft_U4Fc-U). See the [encounter narrative design notes](encounter-narrative-design-notes.md) for order-independent scenes, defensive logic, and separate player-knowledge tracking, with a local transcript and proposed scenario prototype.
- [Castle Ravenloft board-game adventure book](../ref/ravenloft.pdf). See the [Ravenloft scenario design notes](ravenloft-scenario-design-notes.md) for bounded reveal order, compound objectives, pressure transitions, remote weaknesses, and alternative encounter resolutions.
- John Harper / One Seven Design, [Blades in the Dark SRD](https://github.com/amazingrando/blades-in-the-dark-srd-content/blob/main/Blades-in-the-Dark-SRD.md). See the [progress-clock design notes](progress-clock-design-notes.md) for event-driven objectives, danger, linked stages, and the Last Ember clock prototype.
- [Competing objectives design](competing-objectives-design.md): user-directed multi-objective levels with visible monster agendas, conditional player opportunities, races, and disruption through combat or world interactions.
- [Dungeon demo plan](dungeon-demo-plan.md): graphic art direction, topology-first generation, supported traversal, and rendering constraints.
- [4e incorporation plan](4e-incorporation-plan.md): encounter budgets, dependable clues, reward parcels, traps, and optional objectives.
- [Monster roster plan](monster-roster-plan.md): creature identities, faction relationships, squad behavior, and roster expansion.

| Lesson from the talk | Application here |
| --- | --- |
| Define a specific design space and learn the creator's process, 7:27–8:28 | Author a few keep profiles and explicit scene recipes with correlated decisions. |
| Replacement grammars, 12:39–13:09 | Assemble adventure relationships before spatial placement. |
| Hierarchical distribution and contact detail, 13:09–15:12 | Place focal objects, supporting clusters, and evidence of use together. |
| Parametric content, 15:42–17:16 | Give profiles meaningful controls such as occupation, neglect, dampness, and ritual importance. |
| Bounded generation, evaluation, and curation, 22:25–23:28 | Keep hard validity checks, add diagnostics and representative seed galleries. |
| Perceptual differentiation and characterful content, 25:01–26:34 | Spend detail on landmarks and selected inhabitants; retain quieter background surfaces. |
| Player ownership, 26:34–27:38 | Record discovered identities, annotations, and actual run events. |
| Data-driven authoring and visualization, 28:09–29:11 | Keep generated facts and recipes inspectable, serializable, and separate from rendering. |

## 2. Current foundation and constraints

### Already available

- Thirteen required room roles, seeded graph layouts, branches and loops, multiple footprints, stairs, water, lava, and a gated throne room.
- Deterministic bounded retries, reserved passages, prop-aware reachability, and generation checks over 100 seeds.
- Procedural architecture, themed workspaces, materials, royal portraits, and reusable close-up inspection.
- Three enemy archetypes, pack coordination, cover use, seeded social gatherings, and persistent corpses within a run.
- Shared actor movement, collision, attacks, and procedural animation. Space jumps; X cancels travel and attacks.
- A minimap, seed links, debug harness, browser checks, and profiling tools.

### Gaps this plan addresses

- Runs reuse the same room-role catalog, fixed enemy composition, and altar-to-throne objective.
- Royal identities are generated separately; there is no shared dynasty or history connecting portraits, tombs, occupants, and the Crown.
- Workspaces contain appropriate props, but a reusable system for relationships, activity traces, and placement provenance is missing.
- Structural seed differences are tested, but perceived identity, encounter rhythm, and discovery value need explicit review tools.
- There is no discovery journal, generator-versioned sharing contract, or persistent annotation system.

### Delivery boundaries

1. Retain the thirteen room roles, basic completion route, existing enemy catalog, and approximate population for the first delivery. A profile changes emphasis and relationships across that content.
2. Preserve the sculptural dark-fantasy style: strong silhouettes, broad shadow shapes, restrained accents, and quiet surfaces around navigation cues.
3. Keep world facts authoritative for geometry, collision, clues, and gameplay. Quality settings may change decorative density, never hazards, clues, allegiance, or available routes.
4. Required progression and essential clues remain accessible to the ordinary hero. Initial content cannot depend on proposed inventory, trained skills, powers, or new monster types.
5. Current jumping uses supported-floor navigation clearance. Any future jump-dependent route needs an explicit traversal contract and validation before it can enter the grammar catalog.
6. Use seeded recipes and authored text templates. The first delivery needs neither runtime language-model calls nor an extensive historical simulation.

## 3. Generated data and pipeline

Introduce a small generated-run blueprint around the existing world data. Keep authored definitions, generated facts, and mutable play state distinct.

### Proposed contracts

| Contract | Contents and responsibility |
| --- | --- |
| `GenerationIdentity` | Seed, generator version, content-catalog version, and stable IDs for generated objects. |
| `KeepProfile` | Dominant purpose, dynasty reference, catastrophe, occupation pattern, scarcity, and bounded art/pacing parameters. |
| `DynastyRecord` / `HistoryEvent` | Named monarchs, relationships, chronological events, symbols, and stable fact IDs. |
| `SceneRecipe` | Required room features, primary anchor, supporting sockets, interaction/route clearance, decoration rules, and resource budget. |
| `ScenePlacement` | Actual selected recipe, anchors, placed objects, linked facts, and placement/fallback reasons. |
| `InhabitantIdentity` | Name, species, group/home IDs, visual motif, authored behavioral profile, and associated facts. |
| `EncounterPlan` | Members, room/approach requirements, role and threat metadata, and permitted composition. Align with the existing combat roadmap. |
| `ScenarioClockDefinition` | Obstacle/danger label, segment capacity, eligible domain events, effect amounts, activation/outcome links, and visibility policy. Mutable progress belongs to runtime ECS scenario state. |
| `LevelObjectivePlan` | Player/monster-owned goals, eligibility and activation conditions, bounded executor assignments, work sites/resources, objective relationships, clock references, and disruption/outcome policies. |
| `AdventurePlan` | Progression dependencies, level objective plan, optional branches, rewards, route alternatives, and prerequisite capabilities. Initially preserves the current altar route. |
| `DiscoveryRecord` / `RunEvent` | Player-observed facts and actual events, stored separately from the initial generated blueprint. |
| `GenerationReport` | Rejections, fallback choices, distributions, resource counts, and reproducible diagnostics. |

These are proposed contracts, not claims that the corresponding systems already exist.

### Generation order

1. Resolve generator/content versions and generate the keep profile and shared historical facts.
2. Choose an adventure structure supported by the currently implemented mechanics. Initially use the existing altar-to-throne structure.
3. Build and embed the room graph, including required connectors and progression gates.
4. Reserve navigation, interaction approaches, landmark visibility, and encounter maneuvering space.
5. Place primary scene anchors and suitable cover; select encounters and social gathering locations against that geometry.
6. Add supporting decoration, traces of use, heraldry, and clue presentations linked to existing facts.
7. Validate the combined blueprint, including interactions between decoration and encounters; emit diagnostics.
8. Build render meshes and runtime ECS entities from the accepted blueprint.

Use independent seeded streams for identity/history, layout attempts, room recipes, encounters, portraits, and cosmetic detail. Derive child streams from stable semantic IDs. Adding a flour sack must not change the monarch, enemy roster, or dungeon topology. Layout retry numbers must not reroll the keep's history.

### Determinism and sharing

- Record the generator and content versions alongside the seed in diagnostics and future discovery exports.
- Keep one explicit public seed/version interpretation; avoid hidden dependence on iteration order or wall-clock time.
- Preserve stable IDs for facts and semantic roles rather than deriving identity from mutable array positions.
- Define what happens when a saved version is unavailable: retain the recorded discovery text/image and clearly identify that exact world regeneration is unavailable. Do not silently present a different world as the original.
- Keep existing fresh-load behavior during the first delivery. Later saved-discovery links need a deliberate, tested reopen/refresh policy.

## 4. Delivery phases

| Phase | Priority | Relative effort | Dependencies | Player or developer payoff |
| --- | --- | --- | --- | --- |
| 0. Baseline and seed gallery | Immediate | Small–medium | Existing generator/debug harness | Make differences and regressions visible. |
| 1. Shared keep identity | Immediate | Medium | Phase 0 baseline | History, names, symbols, and room emphasis belong together. |
| 2. Composed scene recipes | Immediate | Medium | Phase 1 | Workspaces look inhabited and deliberately arranged. |
| 3. Memorable inhabitants | High | Medium | Phases 1–2; current species behavior | A small number of recognizable actors/groups anchor each run. |
| 4. Discovery and ownership | Next | Medium | Stable IDs and facts from Phase 1 | Players retain, annotate, and share discoveries. |
| 5. Adventure grammar and encounter pacing | Next | Large | Phases 0–3 and relevant combat/interaction foundations | Seeds produce different decisions and routes through challenges. |
| 6. Release curation and hardening | Every delivery | Ongoing | The phases being shipped | Reliable progression, readable scenes, bounded runtime cost. |

Effort labels describe relative scope, not calendar commitments. Phase 4 and Phase 5 can proceed independently once their own prerequisites are ready. **The first playable delivery ends after Phase 3**, with Phase 6 checks applied.

### Phase 0 — baseline, diagnostics, and seed gallery

**Work**

- Add a development-only generator report with seed/version, attempt count, rejected constraints, room/connection graph, encounter placements, and resource counts.
- Export a fixed 100-seed metadata corpus. Select twelve representative seeds for a visual gallery, including compact/sprawling layouts and awkward room/door arrangements.
- Show room roles, pre/post-altar reachability, objective route length, branches, loops, encounters before the checkpoint, and available maneuvering space.
- Capture representative rooms from consistent camera angles, with optional grayscale thumbnails. Run captures sequentially in bounded batches and dispose scene resources between seeds.
- Record a fresh performance baseline before adding content; older hardware measurements are historical comparisons.
- Keep accepted showcase seeds and troublesome seeds as explicit fixtures. Showcase curation supplements ordinary random generation.

**Acceptance**

- A report can reproduce a failure or unexpected placement from its recorded identity.
- Every seed in the baseline corpus remains completable; existing bounded retry behavior is retained.
- Reports expose distributions and individual problem cases, rather than a single claimed measure of fun.
- Gallery generation has bounded memory use and a finite capture count.

**Likely touchpoints:** `src/world.ts`, `src/worldTypes.ts`, `src/gameTypes.ts`, `tests/world.test.ts`; proposed `src/generation/report.ts` and `tests/generation-gallery.ts`. Write generated reports/captures under `test-results/`.

### Phase 1 — shared keep identities and connected history

Author three initial profiles:

| Profile | Shared premise | Visible evidence and emphasis |
| --- | --- | --- |
| Ashen Foundry | A crown sustained by furnaces, labor, and an oath that outlived its rulers | Royal marks on tools and ironwork; warm workspaces; repair, fuel, and abandoned production. |
| Drowned Court | A dynasty entombed after the lower keep was deliberately flooded | Related portraits and memorials; waterlines and relocated possessions; dry gathering spaces above flooded rooms. |
| Pilgrim Redoubt | A sanctuary occupied by survivors and scavengers | Reused heraldry, tended shrines, improvised supplies, and contrasting sacred/occupied spaces. |

All three retain the required room roles and water/lava landmarks. Profile differences must include composition, connected facts, and inhabitants, beyond palette changes.

**Work**

- Define small compatible tables for founding purpose, dynasty, catastrophe, occupation, and scarcity. Start with authored combinations so causes and consequences remain coherent.
- Generate two or three linked monarchs and a short chronology. Store explicit facts such as `successorOf`, `sealedBy`, and `commemoratedAt`.
- Generate one heraldic motif and restrained palette relationships shared by portraits, selected architecture, and associated objects.
- Make portrait captions, room descriptions, memorial details, and altar wording refer to the same fact IDs. Generate the facts first and render text from them.
- Expose profile parameters in development tools for comparison without changing normal gameplay controls.

**Acceptance**

- Same seed and versions reproduce the same profile, names, chronology, and object/fact links.
- Related portraits agree about houses, succession, dates, and symbols; all referenced people and events exist.
- At least three separated locations communicate one shared fact through complementary evidence.
- Essential altar/throne instructions remain direct and correct for every profile.
- Reviewers can distinguish the three profiles in unlabeled gameplay screenshots and describe differences beyond color.

**Likely touchpoints:** `src/worldTypes.ts`, `src/world.ts`, `src/royalty.ts`, `src/portraits.ts`, `src/materials.ts`, and inspection descriptors; proposed `src/generation/identity.ts` and typed profile/history catalogs.

### Phase 2 — hierarchical scene recipes and evidence of use

Start with **forge and bakery recipes**, then apply the proven contract to shrine and stable scenes.

**Work**

- Describe a primary focal object, a small set of supporting objects, their orientation/spacing rules, and optional detail sockets.
- Reserve the work path and interaction approaches before placing supporting objects. Coordinate cover and social spaces with the encounter placement pass.
- Place details according to their causes: soot near heat, flour below preparation surfaces, hay near feeding points, rubble beneath damage, and candles around venerated objects.
- Add economical contact detail where props meet floors or walls. Keep broad surfaces quiet and hazards recognizable at the normal camera distance.
- Link profile facts to selected details: a royal seal on tools, a mourning banner reused as a card cloth, or possessions moved above a flood line.
- Return placement provenance and rejection reasons. Use deterministic fallbacks: retry a socket, simplify the cluster, then omit optional detail. Never consume a required approach to preserve decoration.
- Keep static detail batched and define maximum counts for each recipe. Decorative density can scale with quality without changing the accepted gameplay blueprint.

**Acceptance**

- Each pilot scene reads as one activity with a clear focal point and supporting arrangement.
- Fixtures cover narrow rooms, all supported orientations, stairs, doors, and nearby social groups.
- Decoration leaves reserved routes, door swings, interaction approaches, and escape lanes usable.
- Scene variation is visible at gameplay scale; grayscale review still identifies the hero, hazards, and exits.
- Adding or disabling cosmetic detail does not change history, progression, enemy selection, or safe navigation.
- Worst-case recipe cost stays within the baseline-informed render budget established in Phase 0.

**Likely touchpoints:** `src/world.ts`, `src/themedProps.ts`, `src/buildDungeon.ts`, `src/geometry.ts`, and `src/materials.ts`; proposed `src/generation/scenes.ts` and recipe catalogs.

### Phase 3 — characterful inhabitants with readable behavior

Start with **one named standout per keep** and associated group/home data, using the existing three enemy types.

**Work**

- Author three identity recipes: an oathbound skeleton watchkeeper, a cautious goblin lookout, and a kobold card dealer with stolen royal tokens.
- Correlate names, visual motifs, home scenes, social props, and known behavior with the generated history.
- Retain species silhouettes and attack tells. A named identity does not automatically imply increased HP or a new combat rank.
- Express initial personality through existing states and one bounded parameter where useful, such as a lookout's preferred cover distance. Add new state transitions only for a demonstrated gameplay need, with appropriate model tests.
- Surface a concise name and factual description in the existing target/inspection presentation. Any social-to-combat transition remains readable and interruptible under current rules.
- Keep group membership and identity stable through pursuit and return-to-home behavior.

**Dependencies and limits**

Mixed-species cooperation depends on the explicit faction and squad contracts in the [monster roster plan](monster-roster-plan.md#factions-and-coexistence). Until those exist, use valid current groups; a shared story affiliation must not accidentally change hostility. Champion mechanics, expanded monster types, and threat costs remain coordinated with the combat roadmap.

**Acceptance**

- Each standout has a visible identifier, a connected world fact, and a recognizable activity or tactical tendency.
- Players can describe the inhabitant by what they saw it do, not only by a generated title.
- Groups preserve collision, alert expiry, return behavior, and stable identity after interruptions.
- Named variants do not increase ordinary population or count as additional monster types for the roster milestone.

**Likely touchpoints:** `src/combat.ts`, `src/social.ts`, `src/socialRendering.ts`, `src/enemyRendering.ts`, `src/ecs.ts`, `src/ui.ts`, and species machines when behavior changes.

### First-delivery review gate — a coherent keep

Ship Phases 0–3 together only when:

1. Each of the three profiles produces a complete, playable dungeon across the validation corpus.
2. Two pilot room types visibly express their purpose and the keep's shared identity.
3. A player can connect evidence in at least three places and remember one inhabitant.
4. Profile differences survive unlabeled thumbnail/grayscale review and short playthroughs.
5. Navigation, readable combat, resource budgets, and regeneration stability pass the checks below.

If the profiles feel interchangeable, revise the authored relationships and compositions before multiplying profile counts.

### Phase 4 — discoveries, annotations, and sharing

**Work**

- Record inspected portraits, discovered facts, named inhabitants, and visited landmarks by stable ID.
- Add a compact journal and player annotations on discovered map locations; keep undiscovered facts out of the player-facing journal.
- Allow a player to retain a favorite keep and export a discovery card with seed/version, title, a short factual description, and an optional captured image.
- Record a bounded stream of meaningful actual events: an inspected monarch, a disturbed gathering, a witnessed retreat, a recovered reliquary, or altar activation.
- Build short chronicles from those recorded events. Do not invent an escape, reunion, motive discovery, or kill the simulation did not establish.
- Keep one-time discovery/claim IDs separate from health restoration and respawn. Preserve journal entries across death; identify entries from a different run explicitly.
- Define storage/export schemas and version handling. Saved discoveries are not a promise to restore every combat entity or replay the complete simulation.

**Acceptance**

- Repeated inspection, death, and altar use do not duplicate entries or rewards.
- Reopening a supported seed/version reproduces initial identities and associated facts.
- Unsupported versions retain readable saved discoveries and clearly communicate reproducibility limits.
- A run chronicle contains only recorded, player-observed events.

**Likely touchpoints:** inspection callbacks, `src/ui.ts`, `src/main.ts`, and event emitters in combat/social systems; proposed `src/discoveries.ts` with an explicit persistence boundary.

### Phase 5 — adventure grammars and encounter pacing

Begin with three authored motifs built from implemented mechanics:

1. **Fork and rejoin:** a short exposed route and a longer covered route reach the same destination.
2. **Optional risk and reward:** a side branch offers a reliquary or discovery, with its risk and return path readable before commitment.
3. **Anticipation and return:** reveal the sealed throne approach early, route through the altar, and return through a recognizable loop or supported shortcut.

**Work**

- Represent progression dependencies separately from room geometry. Limit rewrite depth and total nodes; embed a bounded adventure plan into the existing room-role catalog.
- Give each motif explicit entry/exit conditions, room requirements, minimum clear space, reward slots, and capability requirements.
- For multi-step objectives and accumulating danger, use the [scenario-clock contract](progress-clock-design-notes.md#proposed-runtime-contract). The [competing-objective slice](competing-objectives-design.md#6-first-playable-objective-system-slice) starts with player restoration versus actual monster profanation work, then adds an independent rival plan. Define simultaneous outcomes, once-only contributions, and respawn persistence.
- Generate several participant-owned objectives with explicit availability, activation, relationships, and work-site requirements. Keep active competing monster clocks visible and give the player reachable ways to delay or thwart them through combat and environmental interactions.
- Reserve safe approach/escape space and distribute quiet areas, teaching fights, pressure, and recovery along accessible route depth.
- Integrate the encounter selector with [4e encounter budgets](4e-incorporation-plan.md#17-budgeted-encounter-generation-and-pacing). Account for nearby groups joining a fight and budget qualitative pressure such as ranged lanes or control.
- Preserve the [roster expansion targets](monster-roster-plan.md#dungeon-population-and-example-fights) when those waves ship. Dominant keep identity must coexist with the required breadth of available monster types.
- Coordinate optional rewards with the existing parcel/objective plan. Allocate once during generation and preserve claims through respawn.
- Keep deterministic simpler motifs as fallbacks when a layout cannot support the preferred structure.

**Prerequisite gates**

- New ordinary key/lock relationships require typed unlock conditions first: the current altar interaction opens every locked door.
- Guardian-required victory depends on the planned guardian objective and completion state.
- Traps, beneficial zones, surrender, and movement-dependent shortcuts enter the catalog only after their gameplay contracts and validators exist.
- Initial motifs keep a normal supported route to required objectives; decorative hints cannot substitute for a validated solution.

**Acceptance**

- Validation models the progression states actually needed by each motif, including doors before and after altar activation.
- Optional failure, a missed discovery, or unavailable future abilities cannot make the required route impossible.
- Players can explain a different route or encounter decision across the three motifs.
- Encounter placements satisfy threat, geometry, cover, approach, and population constraints together.
- Scenario clocks reflect actual committed actions and world events; duplicate delivery, retreat, and respawn cannot repeat progress or rewards, and joint outcomes are independent of actor iteration order.
- Autonomous objective work requires living, capable executors and available dependencies. Eliminating a unique executor or disabling an essential focus thwarts the relevant plan; unrelated plans continue, and optional losses preserve a valid required route.
- Generation cannot loop indefinitely; reports identify why a motif was simplified or rejected.

**Likely touchpoints:** `src/world.ts`, `src/navigation.ts`, interaction/progression machines, and proposed `src/generation/adventure.ts`. Reuse the encounter/reward systems from the combat plan rather than creating parallel implementations.

## 5. Verification and performance gates

### Hard correctness

- Same seed and declared versions reproduce the semantic blueprint, stable IDs, facts, and accepted placements.
- All required room roles, connector support, interaction approaches, and progression states remain valid across at least 100 fixed seeds and an additional rotating seed corpus.
- Chronology and fact references are consistent; clue text agrees with actual locations and rules.
- Cosmetic RNG/quality changes cannot alter semantic content or traversal.
- Placement fallbacks, motif rewrites, effects, event logs, and generated detail have explicit bounds.
- Regeneration replaces the complete generated identity and runtime state without stale references.

### Expressive range and play review

- Inspect distributions for profile, scene recipe, inhabitant role, path length, optional branch count, and encounter pressure.
- Review both typical seeds and outliers. Keep regression seeds for awkward geometry and previously contradictory facts.
- Compare unlabeled images and complete short runs; record which features players actually noticed and which choices changed.
- Use several descriptive measurements and human review. Structural uniqueness alone is insufficient evidence of memorable play.

### Runtime cost

- Establish current reference measurements in Phase 0 for both quality presets. Record frame-time distribution, draw calls, mesh/triangle counts, memory, and generation latency.
- Set recipe-level detail limits from those measurements. Prefer existing chunks/instances/materials; avoid growing dynamic actors, shadow casters, or lights merely to add visual variety.
- Profile worst-case accepted seeds and at least five consecutive regenerations. Resource counts must stabilize and quality scaling must preserve gameplay facts.
- Keep debug galleries and generation overlays outside ordinary production play. Run browser capture suites sequentially.

### Checks to use as implementation lands

Existing checks: `npm test`, `npm run typecheck`, `npm run format:check`, `npm run lint`, and `npm run build`; targeted `test:movement`, `test:jump`, `test:combat`, `test:social`, `test:inspection`, and `test:animation` as the affected systems change. Run production/full-browser checks for shipped renderer or progression changes, and the hardware profiler for material increases in scene cost.

Proposed additions: pure tests for identity/history consistency, independent RNG streams, recipe placement/fallbacks, discovery persistence, adventure dependencies, and the seed-gallery/reporting tool. New state machines require the repository's existing model-based specifications. These additional tools/tests are planned, not currently available commands.

## 6. First implementation checklist

- [ ] Record the Phase 0 baseline and add generator diagnostics plus a twelve-seed visual gallery.
- [x] Define versioned generation identity, stable fact IDs, and independent RNG streams.
- [x] Author the three keep profiles and their compatible short histories.
- [ ] Connect related portraits, heraldry, room text, and altar evidence to shared facts.
  - [x] Linked portrait subjects/captions/core traits and entrance/crypt/altar/throne text.
  - [ ] Architectural heraldry and physical memorial evidence; full visual profile review.
- [ ] Build forge and bakery scene recipes with reserved gameplay space and bounded detail.
- [ ] Add one named inhabitant per keep, using current species and social/combat capabilities.
- [ ] Run the first-delivery review gate and revise weakly differentiated profiles.
- [ ] Update [verification records](../VERIFICATION.md) with actual measured results before marking the delivery complete.

The next scheduling decision after this slice is whether playtests favor deeper discovery/ownership or stronger adventure variation. Both build on the same generated facts, stable IDs, recipe constraints, and diagnostics.
