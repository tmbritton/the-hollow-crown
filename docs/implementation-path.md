# Implementation path

Started **2026-11-18**. This is the execution order for the planning documents, not a claim
that their proposed systems already exist. Track actual work in
[implementation progress](implementation-progress.md).

## Product direction — compact living scenarios

The **2026-11-20** [game-direction decision](game-direction.md) focuses this game on smaller dungeon
floors, tight scenarios and simulation depth behind approachable single-adventurer controls.
Future content work should build and play a few scenarios, including experiments with
circumstance-driven dangerous turns, before committing to a generalized scenario framework.
Prototype pitches are provisional; their selection, order and escalation rules await playtesting.
A large persistent dungeon world remains a possible follow-up game.

Continue **A6–A7 → P8 → P9 → EF0–EF4** before further procedural-feature expansion. EF5 remains a
separate follow-up. The direction establishes how to explore content after these gates, rather
than introducing a new implementation slice ahead of the existing queue.

## Current priority — user gameplay notes

The dependency-ordered sequence through O4 is delivered. The user-directed notes in
`docs/notes.md` take precedence over further roadmap expansion. Work in this order, keeping
each slice test-first, independently reviewed and committed:

| ID | Slice | Acceptance / verification |
| --- | --- | --- |
| P1 | Investigate application resource growth | Resource-fix slice delivered at `6378d61`, independent review READY. Bounded measurements found excess snapshot allocation and test-server failure cleanup defects, now fixed; no retained application memory leak was established. Investigation closed at the user's direction on 2026-11-19. System configuration and driver diagnosis are outside project scope. |
| P2 | Make corpses traversal-friendly — `726af8a`, accepted, review READY | Corpse speed penalties removed for player and enemies; procedural stair-stepping/contact animation uses rendered body surfaces. Water slowdown, living-body blocking, stable footing and cancellation/reset are preserved. Final independent review cleared both contact and ramp-rotation blockers. |
| P3 | Move toward blocked floor clicks — `9f8e1d7`, complete, final review READY | Unreachable floor requests approach the closest safely reachable point. Route clearance, void/door/locked-gate rules, precise arrival and settled holds are preserved. Cached routes reroot after travel; equally close approaches prefer shorter travel. Final independent review cleared both route-quality blockers. Verified results are in the progress tracker and VERIFICATION.md. |
| P4 | Give skeletons a lurching gait — `be29b8c`, complete, independent review READY | Distance-sampled 64/36 load/catch-up timing, rib lean/twist and trailing skull. Shared foot grounding and attack priority retained. 268 tests/full checks, affected animation pass and reviewed motion sequences. Independent review found no blockers; attributed probes are in progress/verification records. |
| P5 | Hold F to defend — `975c533`, complete, independent review READY | Shared opt-in ECS `actorDefense` chart; inclusive 120° frontal melee/projectile block, travel-vector bolt direction, forward shield/lowered weapon, full-speed grounded movement, attack/work interruption and release latch across jump/cancellation/resets. Independent review found no blockers; implementation checks and attributed review probes are recorded in the progress tracker and VERIFICATION.md. |
| P6a | Introduce declarative kobold squad coordination — `c3641c2`, complete, independent review READY | Three existing packs now have three shield bearers and one spearman each (24 enemies). ECS group charts own shared targeting, bounded assembly, engagement, return/yield and defeat; individual charts remain. Final review cleared the role-aware defense-test blocker, with no production defects or other issues. See progress/verification records. |
| P6b | Deliver the phalanx encounter — `806a27b`, complete, final independent review READY | Slow coordinated ranks, vulnerable shield opening, rear thrust/javelin and shielded withdrawal. Both review blockers cleared: bounded local-detour recovery and earliest swept javelin interception. 315 tests/full checks; phalanx 8/combat 15 browser checks; final independent geometry, lifecycle, bounded-hold, progression and capture review pass. See VERIFICATION.md for attributed evidence and limits. |
| P7 | Publish the repository and GitHub Pages demo — `3934e17`, complete | Independent prepublish review READY, no blockers. Public repository and HTTPS Pages demo deployed successfully by run 44745698117; required checks and root/project browser smokes pass in CI. Parent's actual hosted smoke passes five checks, zero errors, with reviewed shield/input captures. See VERIFICATION.md for commit, run URL, timings and attributed evidence. |
| T2 | Faster test feedback — implemented, verified, review READY | At its checkpoint: core 301 / 26.79s versus the old 303.11s full run. Full 319-case coverage remains about 302s and is required in CI. Core retains all 22 machines / 105 states / 226 branches; original 8,206 work paths remain extended. |
| A0 | Animation motion-review baseline — implemented, verified, independent review READY | 30 clips / 60 camera sequences / 856 world-pose samples; real input and fixed/slow playback, contact/grip-proxy metrics, 25-actor CPU/allocation/resource baseline and complete migration inventory. 302 everyday tests, affected animation and production smoke pass. See [baseline](animation-baseline.md). |
| A1 | Shared humanoid rig definitions and bindings — complete, independent review READY | All 25 actors use typed semantic anatomy/profiles, quaternion pose/history buffers and one final binding writer. 428 samples match A0 within 2.384e−7; render identity, selection, reset and cost checks pass. See [rig foundation](rig-foundation.md). |
| A2 | Coordinated full-body IK — complete, independent review READY | Four-pass bounded solver, simultaneous contacts/grips, orientation/limits, explicit priorities and residuals. 323 everyday tests; 1,210 actual-mesh browser samples, resource plateau and bounded costs. See [solver contract](rig-solver.md). |
| A3 | Locomotion and grounding migration — complete, independent review READY | All living actor kinds compose semantic poses and coordinated sole targets. 330 tests; 428 A0-identical authority samples, final sole/plant checks, animation/movement/jump/production passes and bounded cost/resource checks. See [grounding contract](rig-grounding.md). |
| A4 | Action, equipment, work and social migration — complete, final independent review READY | Shared action layers, coordinated grips, solved sockets and semantic collapse. 336 tests, 428 A0-identical authority samples, actual shaft/cargo/death regressions, affected browsers and production smoke. All three review blockers cleared; see [action contract](rig-actions.md). |
| A5 | Humanoid-with-tail kobold rig — final independent review READY | Four tapered segments on all twelve kobolds, drawn anatomy/equipment/masonry clearance and stable fallback/corpse settling. Full360/final core342 gates, dense geometry and prolonged-contact regressions, affected suites and production pass; see [tail contract](rig-tails.md). |
| A6 | Shield anticipation and reaction — complete, final independent review READY | Actor/run-owned accepted-block batches, supporting preparation, coordinated lowering, constraint-aware reversal, bounded recoil and phalanx counter-motion. Full377/core359, actual browser body/grip/contact/lane checks and production pass; both review blockers cleared. See [shield contract](rig-shields.md). |
| A7 | Rig cutover and death-physics handoff — complete, final independent review READY | Semantic-only pose/reset ownership; detached world/joint/body velocities, death rebasing and pre-stop lethal metadata. Full383/core366, 84 handoffs, real landing/support regressions, 428 catalog samples and cross-system/root/Pages smoke pass. Landing blocker independently cleared; see [handoff contract](rig-handoff.md). |
| P8 | Directional ragdoll deaths — complete, final independent review READY | Final-pose transfer, seeded launch/spin variation, constrained anatomy/tails, physical walls/treads and frozen relocated remains. Full389 checkpoint/core373, eleven browser sequences, 24 structural-contact cases, real melee/bolt/javelin, all-24 stress, pause/reset/respawn and root/Pages smokes pass. Both contact blockers independently cleared; see [contract](ragdoll-deaths.md). |
| P9 | Skeleton breakup and settled bone decoration — queued after P8 | Skeleton deaths launch separated procedural body parts instead of retaining an intact corpse. Parts collide and settle as non-interactive set decoration. Reuse the death-motion foundation; preserve death/discovery semantics, bounded resources, pause and regeneration cleanup, with real-browser visual checks. |

P1's resource-fix slice is committed as **`6378d61`**. **P2 corpse traversal is committed at
`726af8a`, accepted by the user and independently reviewed READY.** **P3 blocked-floor
click fallback is complete at `9f8e1d7`; final independent review returned READY.**
**P4 skeleton gait is complete at `be29b8c`, independently reviewed READY with no blockers.
P5 held-F defense is complete at `975c533`, independently reviewed READY with no blockers.
P6a is complete at `c3641c2`, independently reviewed READY with no remaining blockers.
P6b is complete at `806a27b`; final independent review returned READY and cleared both blockers.**
**P7 is complete and published at `3934e17`.** Independent prepublish review returned READY with
no blockers; the parent made the repository public, deployed through GitHub Actions and verified
the actual hosted production game. **T2 test-feedback work is implemented and independently
reviewed READY. A0 motion review is also implemented and independently reviewed READY.
A1 shared rigs, A2 coordinated solving and A3 live locomotion/contact migration are also complete
and reviewed READY. A4 action/equipment/work/social migration is also verified and independently
reviewed READY. A5 articulated tails is implemented, verified and independently reviewed READY.
A6 shield motion is implemented, verified and independently reviewed READY; both blockers cleared.
A7 and P8 are implemented, verified and independently reviewed READY. P9 is next.**
P1's application investigation is closed; its bounded checks
do not establish a cause or fix for the original machine freeze.

P5 establishes the defensive behavior needed by P6. P6a and P6b split the formation request into
reviewable slices. P7 follows the gameplay/stability pass. Historical broader art/performance
milestones remain recorded, but do not supersede this user-directed queue.

The two later additions to `docs/notes.md` are P8 and P9. The original list through P7 is now
complete, satisfying the user's requested ordering. The subsequent animation discussion adds the
shared full-body rig, tailed kobolds, complete animation migration and shield motion as prerequisites.
The [animation roadmap](animation-roadmap.md) contains their architecture, per-slice gates, migration
inventory and compaction handoff. Preserve the raw notes as the source of intent.

## Before the next procedural-feature expansion — Effect refactor

The user requested this scheduling boundary on **2026-11-20**. Continue the existing
**A6–A7 → P8 → P9** implementation queue after A5's review/delivery; A4 is independently reviewed READY.
Complete the generation
slices below before authoring additional procedural scene recipes, keep variants, adventure
grammars, or generated encounters/objectives. The default insertion point is after P9; if content
work moves, its Effect prerequisite moves with it.

The [Effect refactor plan](effect-refactor-plan.md) defines architecture, determinism and failure
contracts, implementation slices, measurements, and acceptance gates. All slices remain planned.

| ID | Slice | Acceptance / verification |
| --- | --- | --- |
| EF0 | Refresh baseline and select exact Effect version | Current corpus/seed fixtures, generation/import/resource and Vite bundle baselines; explicit cost budgets and toolchain compatibility. |
| EF1 | Extract generation stages and expected failures | Pure stage contracts; selective rejection handling; exact world/report and retry-budget parity. |
| EF2 | Compose the generation pipeline with Effect | One bounded recovery policy, fresh execution state, typed failures/services, compatible synchronous facade; simulation hot paths retain ordinary calls. |
| EF3 | Bounded local stage tracing | Useful seed/attempt/room/recipe traces; detached capped snapshots; diagnostic on/off parity and production debug isolation. |
| EF4 | Integrate callers and pass pre-content adoption gate | Full corpus, application/production and cost checks; independent review; authoring guide for subsequent procedural features. Completes the prerequisite. |
| EF5 | Run-owned construction and cleanup — separate follow-up | Evaluate after EF4; scope partial-build cleanup and regeneration resources against the completed animation/physics lifecycle. Not required to resume content after EF4. |

## Chosen starting point (historical)

Start with Phase 0 of the [procedural-content plan](procedural-content-improvement-plan.md).
The current generator already validates 100 seeds, but has no versioned diagnostic export
or repeatable visual comparison tool. These are useful prerequisites for changing history,
scene composition, encounters, or objective placement without losing reproducibility.

That historical gameplay baseline was thirteen room roles, 21 enemies, and the altar-before-throne
gate. The [competing-objectives design](competing-objectives-design.md) is the authoritative
objective-system target. Its autonomous work and race rules need their own tested slices;
the earlier player-triggered danger-clock proposal is a mechanics reference.

## Feature-sized delivery order

| ID | Feature | Acceptance / verification |
| --- | --- | --- |
| G1 | Versioned generation identity and bounded attempt diagnostics | Record seed, generator/content versions, accepted attempt and rejected constraints; same seed produces the same report; failed generation carries its trace; diagnostics do not alter accepted geometry. Pure regression tests. |
| G2 | Reproducible generation analysis and 100-seed corpus | Plain-data reports expose room graph, pre/post-altar reachability, required-route distances, branches/loops, encounter placement and resource counts. Fixed corpus remains valid; select twelve deterministic representative/outlier seeds. Export only under `test-results/`. |
| G3 | Development report access and bounded visual seed gallery | Debug harness exposes current initial-generation report; sequential captures use consistent cameras and scene regeneration. Gallery contains twelve seeds and representative rooms, with grayscale comparison. Browser assertions and screenshot review; production hooks remain absent. |
| T1 | Repair full-browser landmark traversal (discovered during G3) | Diagnose repeated collision failures with live actors; retain physical traversal and core progression assertions. Run full browser coverage and independent review before content work. |
| I1 | Shared keep identity and linked history | Three authored profiles, stable fact IDs, independent semantic RNG, coherent monarch succession and history. Test deterministic generation and reference integrity before connecting presentation. |
| I2 | Shared identity in portraits and world descriptions | Related portraits and at least three locations communicate the same generated facts; gameplay instructions stay accurate. Browser/inspection checks and visual review. |
| S1 | Forge and bakery scene recipes | Reserve focal anchors and routes, use bounded supporting sockets and deterministic fallbacks. Validate narrow rooms/orientations and multi-seed traversal; review composition and rendering cost. |
| N1 | One memorable inhabitant per keep | Existing species/population, stable identity/home/group, factual target text and a readable activity. Combat/social regressions and browser review. |
| D1 | Within-run discovery record | Separate learned facts from world state; once-only entries survive respawn and reset on regeneration. Integrate inspection and actual observed events. |
| O1 | Objective clocks and atomic race resolution | Independently represent ownership, eligibility, discovery and activation. Deduplicate contributions; resolve same-step results together; latch authored outcomes. Pure/model tests. |
| O2 | Interruptible objective work | Use authoritative actor/location/dependency facts; pause and cancel correctly; killed or interrupted workers cannot commit unfinished work. Simulation and browser coverage. |
| O3 | First playable Last Ember contest | Reachable shrine/focus/clue, named goblin worker, visible rival clock, restoration/profanation/contested outcomes and bounded recovery. Preserve required progression and verify multiple seeds. |
| O4 | Independent second rival plan | Add only after O3: bounded carriers/cargo, real deliveries and visible counterplay; unrelated goals continue independently. |

O1 is complete at `6f79a97`; O2 physical work/runtime boundaries are complete at `d698f27`, with
independent review READY. O3 is complete at `9be81bb` and independently reviewed: the playable
Last Ember scenario, physical worker priorities, clocks, outcomes and recovery are integrated.
Independent O3 and O4 reviews returned READY; O4 is committed at `123b9a9`. Its plan composes with O3 before the single
run installation; see README. The feature sequence above is implemented.

Each row may be split further if review reveals a coherent smaller feature. Later priorities
can change based on evidence from the corpus/gallery and play review. Broad roster expansion,
inventory, campaign persistence and alternative victory modes retain their roadmap dependencies.

## Delivery loop

1. Select the next dependency-ready feature and record its scope in the progress tracker.
2. Write meaningful failing tests for the behavior; run them and record the observed failure.
3. Implement the smallest coherent change, then refactor while tests pass.
4. Run `npm run format:check`, `npm run lint`, `npm test`, and `npm run build`.
   `npm test` is the everyday regression/model gate. Run `npm run check:full` locally for changes
   to generation/corpora, objective timing, long cargo traversal, model partitions or test selection,
   and for cross-cutting/release verification. CI always runs it before publishing. The explicit
   `test:extended` group retains broad sweeps and long simulations; it is not repeated per ordinary
   animation edit or by reviewers without a relevant concern.
   Run affected browser suites for runtime/input/rendering behavior and inspect their captures.
   During iteration, use focused failing regressions. Run one appropriate browser verification
   pass per feature; reserve full gameplay/cross-browser expansion for cross-cutting changes or
   unresolved concerns. Run rendering-heavy checks sequentially and close their browsers.
5. Automatically request an independent sub-agent code review after implementation and verification,
   before reporting it ready for delivery; do not wait for a user prompt. Address blocking findings,
   rerun affected checks and obtain a follow-up review. Record the attributed review outcome.
   Reviewers reuse recorded verification and prioritize diff inspection and independent targeted
   failure probes. Repeat broad suites only when findings, fixes or uncertain evidence justify it.
6. Update documentation and verification records with only checks actually run. Inspect
   status, diff, and recent history; stage intended files and commit the feature with hooks.
7. Record the commit and continue to the next feature. Keep generated artifacts ignored.

Hardware performance measurements require the headed profiler and a usable graphical GPU
session. Software-rendered gallery timing is not a hardware baseline. Phase 0 is complete
only when its diagnostic/gallery work and applicable performance measurements are recorded.
