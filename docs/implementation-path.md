# Implementation path

Started **2026-11-18**. This is the execution order for the planning documents, not a claim
that their proposed systems already exist. Track actual work in
[implementation progress](implementation-progress.md).

## Chosen starting point

Start with Phase 0 of the [procedural-content plan](procedural-content-improvement-plan.md).
The current generator already validates 100 seeds, but has no versioned diagnostic export
or repeatable visual comparison tool. These are useful prerequisites for changing history,
scene composition, encounters, or objective placement without losing reproducibility.

The current gameplay baseline is thirteen room roles, 21 enemies, and the altar-before-throne
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

Each row may be split further if review reveals a coherent smaller feature. Later priorities
can change based on evidence from the corpus/gallery and play review. Broad roster expansion,
inventory, campaign persistence and alternative victory modes retain their roadmap dependencies.

## Delivery loop

1. Select the next dependency-ready feature and record its scope in the progress tracker.
2. Write meaningful failing tests for the behavior; run them and record the observed failure.
3. Implement the smallest coherent change, then refactor while tests pass.
4. Run `npm run format:check`, `npm run lint`, `npm test`, and `npm run build`.
   Run affected browser suites for runtime/input/rendering behavior and inspect their captures.
5. Request an independent sub-agent code review of the feature diff. Address findings and
   rerun the checks affected by any fixes. Record the review outcome.
6. Update documentation and verification records with only checks actually run. Inspect
   status, diff, and recent history; stage intended files and commit the feature with hooks.
7. Record the commit and continue to the next feature. Keep generated artifacts ignored.

Hardware performance measurements require the headed profiler and a usable graphical GPU
session. Software-rendered gallery timing is not a hardware baseline. Phase 0 is complete
only when its diagnostic/gallery work and applicable performance measurements are recorded.
