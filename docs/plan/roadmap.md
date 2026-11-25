# The Hollow Crown Implementation Roadmap

- **Source**: [Implementation path](../implementation-path.md), [Effect refactor plan](../effect-refactor-plan.md); `/var/home/tom/Documents/Tom's Vault/Notes/Game Demo Notes.md` (original nine encounter notes; twelve Practice Room Notes, lines 13–25); player observations; [README](../../README.md), [docs index](../README.md), [AGENTS](../../AGENTS.md), [CPU7 results](../cpu7-integrated-results.md), [CPU workloads](../../tests/cpu-workloads.ts).
- **Expansion sources**: [4e incorporation plan](../4e-incorporation-plan.md) (item numbers and milestones A–D); [monster roster plan](../monster-roster-plan.md) (waves A–C).
- **Updated**: 2026-11-24
- **Status**: active

## Overview

The Hollow Crown puts one adventurer in a compact living dungeon: Epic 0 adopted synchronous Effect [generation](../generation-authoring.md), while movement and combat run in the fixed-step ECS. **Next: Epic 14**, using Epic 13's completed practice room to make mouse travel dependable before retiring keyboard navigation. Epic 1's rendered dungeon hitch investigation remains independent and open; neither it nor Epic 14 waits for the other. After both, deliver Epics 2–5, then 7–12; Epic 6 remains optional. Numbers are stable IDs, not priorities; story plans belong later at `docs/plan/epic-N/story-M.md`.

Epic 15 is a separate opt-in visual study, not a prerequisite for the delivery queue.

## Progress

- Epics: 2/16 complete
- Stories: 13/59 complete

Stories 0.1–0.4 were independently approved and published at `a423dae`. Story 0.5 closes with generation latency accepted as an unresolved follow-up; the [delivery decision and original performance verdict](../ef4-results.md#epic-0-delivery-closeout) are recorded separately.

## Epics

### Epic 0 — Adopt Effect at the generation boundary

- [x] **Epic 0 complete**

Use Effect to compose required generation stages and explain why a candidate failed without changing which world a seed produces. Keep geometry, RNG and search in ordinary functions; the fixed-step ECS, XState clocks, combat, navigation and rig solvers stay outside Effect.

- **Depends on**: Reviewed animation/death foundation and the CPU7 investigation, not a CPU performance pass verdict.
- **Scope**: Generation baseline, typed recovery, synchronous cutover, local stage traces and a pre-content release decision.

#### Stories

- [x] **Story 0.1 — EF0: Freeze fixtures and cost budgets** — Audit current callers, imports and resources. Select an exact release compatible with strict TypeScript, native Node tests and local browser bundling; 4.1.5 is a research reference, not a required pin. **Depends on**: Epic 0 prerequisites only.
  - Preserve canonical worlds and ordered reports for the fixed corpus, `MOURNING-731`, `trial-23` and adverse/rejected seeds. Keep expensive fixtures lazy.
  - Record hardware, versions, warmup and repeats for generation median/p95, sampled allocations, cold import/test start, browser resource counts, animation cost and production Vite raw/gzip sizes. Set acceptable deltas **before** refactoring; prototype timings are not budgets.
- [x] **Story 0.2 — EF1: Extract stages and classify failures** — Without adding a dependency, expose plain stage inputs and an injection point for failures. Keep `randomFrom`/`randomStream`, salts, draw and iteration order, history independent of retries, and ECS door/interaction object identity. **Depends on**: 0.1.
  - Distinguish invalid options (no attempt; `RangeError`), expected placement/validation rejection (all reasons in order), and exhaustion (`GenerationError.report`). Optional omission succeeds; an injected defect stops with its original cause instead of becoming a retry.
  - Match EF0 worlds/reports exactly. Show that a rejected anchor or attempt leaves no reservations or props behind and success on the final allowed attempt starts no further work.
- [x] **Story 0.3 — EF2: Cut over to one synchronous pipeline** — Install the selected exact version via npm and the lockfile. Interpret the pipeline once behind `generateDungeon` / `generateDungeonWithReport`; remove the old attempt loop and keep diagnostics a replaceable no-op service by default. **Depends on**: 0.2.
  - Retry only expected candidate rejections, sequentially, with fresh attempt identity and state; accept the first valid candidate within 40 attempts or the caller's smaller limit. Re-execute the same Effect and interleave seeds: no shared RNG cursor, report or candidate; results match EF0.
  - Verify public signatures and errors in Node and browser. Forbid promises, sleeps and background fibers in the sync graph; inject accidental async work, interrupt and observe the fiber on `AsyncFiberError`, and prove it cannot write late.
- [x] **Story 0.4 — EF3: Explain a rejected seed locally** — Trace generation → attempt → stage, with seed/version, room/recipe and failure context. Store timing and trace IDs in a separate versioned execution envelope, never in deterministic reports or generation decisions. **Depends on**: 0.3.
  - Expose detached snapshots only through the DEV/debug harness and local tooling. Cap records, payload and retained runs; indicate truncation, use bounded metric labels and retain no worlds or scenes.
  - Explain a rejection followed by success; close spans on defects too. Verify tracing off/on and a failing sink produce identical worlds/reports, reset clears retained data, and production exposes no collector or telemetry requests.
- [x] **Story 0.5 — EF4: Decide readiness for procedural content** — Route startup, menu regeneration, debug, corpus and gallery callers through the same facade. Inject failure at the application boundary: show an error without publishing a partial world or updating disposed state; preserve seed/refresh and readiness behavior. **Depends on**: 0.4.
  - Compare the complete EF0 corpus and rejection reports exactly; inspect representative gallery captures. Recheck EF0 cost budgets, full correctness/model and resource suites, browser play, and root/Pages production smokes. Do not rewrite fixtures to obtain parity.
  - Remove migration switches; document required stages, optional omissions, RNG, recovery and traces for content authors. The architecture and delivery closeout were independently approved. The original latency gate remains inconclusive.

### Epic 1 — Capture the encounter hitch

- [ ] **Epic 1 complete**

CPU7 documented missed desktop budgets, not a matched speedup or a cause for this hitch. Its phalanx fixture starts near rank, forces alert, disables other enemies and does not render; the doorway fixture is also unrendered, and native `live-*` starts at the stable.

- **Depends on**: none
- **Scope**: Add a versioned encounter recipe alongside the frozen fixtures. Establish a comparison gate for encounter runtime changes in Epics 1–5, separate from EF0's generation budgets.

#### Stories

- [ ] **Story 1.1 — Record approach and controls** — Start a fresh seeded full world with all 24 enemies, rigs, objectives and AI active. Drive ordinary player movement under rendered hardware native RAF from before sighting the unaware pack through its first resolved attack. **Depends on**: none.
  - Witness approach, alert, slot travel, formed rank, opening and impact/release by tick and callback; flag early alerts, stalls or missing phases rather than trimming them out.
  - Replay a comparable door opening/crossing with verified **no alert**, and full versus reduced living population with the same target pack, path, camera and quality. Record who is alive, visible, active or settled; keep deaths and settling outside the comparison window.
- [ ] **Story 1.2 — Publish the baseline and comparison gate** — Freeze inputs, revision, warmed actor/door state, hardware, viewport and quality. Run at least three fresh repeats per case at Low and High; alternate before/after order in later comparisons. **Depends on**: 1.1.
  - Use `off` (outer timing only) for FPS, interval and callback p95/p99/max and share over 16.7 ms. Tag each worst interval with phase, preceding callback work and following catch-up tick count; record the 0–5 tick histogram, separating startup from between-callback intervals.
  - Use separate development-only coarse/detailed runs for tick, squad/route requests and work credits, occupancy/door probes, rig solve and render submission. Do not add nested timers or call submission wall time GPU time. If attribution remains ambiguous, request a matched GPU/compositor trace, not a quality cut.
  - For **each subsequent encounter story that changes runtime behavior**, compare to its parent and the frozen baseline: report repeat spread, phase durations and worst frames for encounter and controls. Reject unmatched starts or missing evidence for speedup claims; report intended behavior changes separately. Investigate reproducible tail regressions before proceeding.
- [ ] **Story 1.3 — Decide whether to fix a measured hotspot** — Select one contributor only if the baseline distinguishes it from doorway and population effects. Otherwise record the unresolved question and the next discriminating measurement. **Depends on**: 1.2.
  - Retain a bounded change only with a repeatable improvement beyond spread in the affected phase, intact gameplay and no displaced hitch in controls. A negative finding closes the investigation, not the performance target.

### Epic 13 — Greybox controls room

- [x] **Epic 13 complete**

Give the user a direct way to play the actual hero without starting a dungeon run. The deliverable is the room itself; the user can try it at their own pace and choose any follow-up.

- **Depends on**: None outstanding. Epic 1 closeout was the original scheduling dependency, waived for delivery.
- **Scope**: One quiet greybox room with an obstacle, an unlocked door and a fast reset. No enemies or objectives by default.

#### Stories

- [x] **Story 13.1 — Enter and move around** — Provide a direct entry alongside normal dungeon play. Use the dungeon hero, overhead camera and existing input, navigation and collision rather than a second controller. **Depends on**: 1.3 (original scheduling dependency; Epic 13 was explicitly started independently).
  - As shipped: floor click beyond a pillar, held mouse steering, camera-relative WASD/arrows, held Shift to run, Space to jump, held F defense and X to cancel travel. These are the baseline controls, not the target bindings for Epic 14.
  - Click the closed, unlocked door to approach and open it, or press E within reach; walk through the doorway.
- [x] **Story 13.2 — Reset and try again** — Restore the hero and room to the same quiet start with one action, without reloading the page or generating a dungeon. **Depends on**: 13.1.
  - Reset after opening the door or starting a move: the door is closed, the hero is back at the start with starting health, and no travel or attack command carries over.
  - If the user wants to try attack targeting, allow one opt-in existing foe: click it to pursue and attack in reach. Reset removes it; no fight is required.

### Epic 14 — Make the mouse-driven hero playable

- [ ] **Epic 14 complete**

Use the same hero and inputs in practice and the dungeon. First make travel reliable with the mouse alone, then teach the player what a click will do and let them switch from attacking to defending without fighting the controls.

- **Depends on**: 13.2 (complete); start 14.1 now.
- **Scope**:
  - Floor steering, bindings, object interaction and truthful pointer feedback.
  - Attack and shield response, followed by a distinct reaction to damage received.

#### Stories

- [x] **Story 14.1 — Steer past the map edge** — Keep a held floor command active when the cursor leaves the walkable map. **Depends on**: 13.2.
  - Hold out past a practice-room edge, then sweep along it: travel toward the nearest safely reachable square to the invalid click, with the gold ring at the effective destination. Steer back onto valid floor without releasing; exact reachable clicks stay precise.
  - Repeat across a dungeon void or disconnected floor. Settle without jitter at the legal frontier; never step onto unsupported floor or cross a sealed gate.
- [ ] **Story 14.2 — Get clear of an obstacle by mouse** — Make a reachable detour work even when the hero starts pressed against scenery. **Depends on**: 14.1.
  - Click beyond the practice pillar, steer around its corner while held, then reverse away from contact without a key or reset. Repeat beside dungeon furniture and a doorway with living blockers present.
  - When no path fits, stop without repeated retries; a clear new request or a blocker moving away permits progress. No clipping, teleport or change to the shared route budget.
- [ ] **Story 14.3 — Switch to mouse travel and toggle running** — After both travel checks pass, retire WASD and its arrow-key movement alias. Use the [Diablo II PC shortcut guide](https://www.wowhead.com/diablo-2/guide/keyboard-shortcuts-pc) to reserve future menu keys (notably C for character and I for inventory) rather than binding movement to them. **Depends on**: 14.2.
  - In both modes, rotate left/right with `[` / `]` instead of Q/R; press the run toggle once to run after release and again to walk. Held-key repeat must not flip it. Check bindings, including practice reset, for conflicts; align help, README and real-input checks with the delivered map.
  - Remove the explicit X stop command, not cancellation itself: replace pursuit with a floor click and interrupt shrine work by moving. Preserve cleanup of pending travel, attacks, work, held defense and poses on pause/inspection, blur/hidden tab, teleport, death/respawn, practice reset and regeneration. No stale held input resumes play.
- [ ] **Story 14.4 — Click what E can use** — Give each world interaction a mouse approach to the picked object and the same eligibility and outcome as E in reach. **Depends on**: 14.3.
  - Hover the practice door before clicking: distinguish an actionable object from scenery (try a yellow geometry outline). The cue and click use the same pick; neighboring objects, occlusion and changing eligibility must not redirect or falsely promise an action.
  - Compare E and click in equivalent dungeon states: doors, chests, altar, portraits, throne, shrine work, disabling the focus and recovering loose tribute. Approach legally, recheck reach and state on arrival, and never double-claim, inspect through cover or skip progression.
- [ ] **Story 14.5 — Close a door from its swing path** — Let the closing leaf sweep through the hero just as the opening leaf can, without requiring precise positioning. **Depends on**: 14.4.
  - In practice, stand in the sweep, close by click, then repeat with E. The hero is neither pushed through the threshold nor trapped; once closed the door blocks travel until reopened.
  - Repeat from the other side in a dungeon. Closed doors still block routes and attacks; floor steering cannot operate them and the locked throne gate still requires the altar.
- [ ] **Story 14.6 — Preview the actual enemy pick** — Show a locally generated animated pixel-art skeleton hand in ordinary play. Over a pickable enemy switch to a pixel-art sword and put a red ground ring beneath that enemy before the click. **Depends on**: 14.5.
  - Hover, leave and return to the practice skeleton: preview alone never starts pursuit or changes selection. Click engages exactly the previewed foe; release retains the command.
  - Rotate over overlapping enemies and an interactable in the dungeon. Sword/ring, object highlight and click agree on one actual pick; clear obsolete cues on occlusion, death, modal entry or reset without losing a valid committed target merely on pointer exit.
- [x] **Story 14.7 — Attack on reach and defend on demand** — Accepted in the Practice Room playtest: defense still requires timing, but the player can interrupt a swing to guard and get back into the fight. Delivered in `9364596` ahead of the hover feedback in 14.6.
  - Clicking selects the enemy; the hero pursues into reach and starts the usual sword wind-up. Damage still requires a valid target in reach at impact.
  - Raising the shield interrupts the swing and clears its cooldown. Releasing F ends protection immediately and resumes pursuit; the next swing can start when the shield finishes lowering (240 ms). See [shield timing verification](../../VERIFICATION.md#player-shield-release-timing).
- [ ] **Story 14.8 — Show the hero taking a hit** — Follow the responsiveness playtest with a readable player hit reaction driven by accepted damage, not the hero's own attack animation. **Depends on**: 14.7.
  - At gameplay zoom compare the hero swinging, taking an unblocked skeleton hit, and blocking it frontally in practice. Only damage received produces the hurt pose; a block keeps its shield recoil and no HP loss.
  - Repeat during a dungeon exchange. The pose must not determine damage, interrupt eligibility, delay defense or change attack clocks; death/respawn and reset leave no lingering flinch.

### Epic 2 — Assemble and reform on real terrain

- [ ] **Epic 2 complete**

An alerted pack should break from its activity immediately and run to reachable slots. Change travel to the rank, not the original membership or the rules for fighting from it.

- **Depends on**: Epic 1 encounter investigation and Epic 14 controls closeout.
- **Scope**: Slot assignment, scoped occupancy, obstacle recovery and narrow pursuit.

#### Stories

- [ ] **Story 2.1 — Rally to assigned slots** — The group chart assigns destinations; each original member requests its own route under the shared 24-credit fixed-tick budget. Show attention on alert and run to the slot rather than advancing at formed-rank speed. **Depends on**: 1.3 and 14.8.
  - Reuse the controls room for an opt-in encounter with the existing kobold squad. Start before alert so the player can approach from either side of the pillar, watch the squad rally, then reset to the same unaware squad and immediately try a different approach. Keep the empty room as the default for controls practice.
  - Update the README/AGENTS living-blocker contract and tests for one intentional exception: same-pack movement may pass through packmates only while assembling/reforming. Apply it consistently to route and motor; require separated slots before engagement. No snaps, enemy/player pass-through, terrain/door bypass, or change to hit, projectile or shield interception.
  - Compare alert-to-first-motion, rank-ready and first attack against baseline; verify bounded retries/hold and safe cancellation on casualty, target loss or withdrawal, including interruption mid-crossing.
- [ ] **Story 2.2 — Regroup beyond an obstacle** — Select a reachable footprint beyond furniture or a bend and let members run different legal paths to it. Keep useful progress instead of issuing fresh searches every tick. **Depends on**: 2.1.
  - Demonstrate split, reform and an actual attack on a seeded obstructed approach. A sealed or too-small passage ends in bounded hold; retry on meaningful change without oscillation or starvation.
- [ ] **Story 2.3 — Pursue two abreast** — Use a 2×2 where the normal three-shield front cannot fit, then expand in clear space. Assume the rear shield bearer temporarily stows its shield for a spear; a javelin is an alternative to test, not a new permanent role. **Depends on**: 2.2.
  - Show the switch, a legal rear-bearer hit/release through an actual open lane, friendly interception when blocked, and restoration of guard/loadout. No compact attack through walls, allies or a closed shield.
  - Test wide–narrow–wide and narrower-than-two routes. Preserve immutable roles/slots, including withdrawal on loss of the original spearman, at most two survivors, or ≤35% combined surviving health; blocked withdrawal still holds together.

### Epic 3 — Give flanks and close quarters readable answers

- [ ] **Epic 3 complete**

Respond to a changing fight without removing the player's opening. Keep threat loss, retreat, crossbow skirmishing and return to social or objective work ahead of inappropriate attacks.

- **Depends on**: Epic 2
- **Scope**: End guards, broken ranks, shield shove and cornered goblins.

#### Stories

- [ ] **Story 3.1 — Turn the exposed end** — Let the threatened end face a circling player while the chart orders a reform. Assume capped turns and a committed recovery rather than instant tracking. **Depends on**: 2.3.
  - Demonstrate a slow flank being covered and a timely flank still landing; retain the visible 0.6-second center opening and vulnerable spear action. Reversing direction must not trigger endless slot swaps.
- [ ] **Story 3.2 — Fight when ranks break** — Give separated, combat-eligible kobolds a usable spear attack instead of idle shield holding. End assembly pass-through before fighting. **Depends on**: 3.1.
  - Witness draw, wind-up, checked impact or miss, recovery and rejoin; the fallback neither promotes a replacement spearman nor overrides latched withdrawal, cargo ownership or return to work.
- [ ] **Story 3.3 — Shove with a shield** — Assume the closed end guards can shove while the center bearer serves the spear lane. Tune eligibility and reach in playtest. **Depends on**: 3.1.
  - Show a telegraph and recovery; one valid impact displaces the player or another eligible living entity through collision-checked movement. Verify miss, frontal defense and blocked displacement at a wall or gate; no repeated pushes from one swing.
- [ ] **Story 3.4 — Draw a dagger only when trapped** — Keep goblin flight, cover and crossbow fire as the default. Use a dagger at melee reach only after bounded escape checks establish no usable exit. **Depends on**: 2.3.
  - Contrast a true dead end with an open flank, a pending route and a transient obstruction. Witness a telegraphed hit/miss, then return to skirmishing when escape opens and resume interrupted work after threat loss.

### Epic 4 — Give kobolds a bird-like stride

- [ ] **Epic 4 complete**

Use one procedural digitigrade skeleton for both kobold roles within the existing rig pipeline. The new silhouette should read from overhead without changing support height, collision, reach or attack timing.

- **Depends on**: Epic 3
- **Scope**: Leg IK, measured gait, articulated tail and death continuity.

#### Stories

- [ ] **Story 4.1 — Solve the digitigrade leg** — Build a raised-hock, toe-supported leg chain and bounded IK for the kobold profile. Carry its semantic joints through mesh binding, pose history and death handoff in the same slice. **Depends on**: 3.1–3.4.
  - Check drawn toe plants on floors, stairs and corpses, reach limits, grips and cargo clearance for both roles. Kill a moving and a guarding kobold: final drawn joints and velocities transfer once to the ragdoll, settle and reset without snapping or stale bindings.
- [ ] **Story 4.2 — Couple bird gait and tail** — Drive an ostrich-like walk/run from measured distance, with the tail tip swaying toward the advancing leg. Layer small bounded vertical jitter from actor seed and simulation phase, not render calls. **Depends on**: 4.1.
  - Compare overhead and side captures of rally, turn, stop and backstep. Check planted toes, no gait cycling against a wall, and tail clearance around shields, cargo, neighbors and terrain.
  - Repeated samples of one tick agree; pause/resume, teleport, lethal handoff and regeneration neither reroll the motion nor inject velocity. Recheck full-pack solve cost during rally.

### Epic 5 — Review the playable encounter

- [ ] **Epic 5 complete**

Judge the integrated encounter against the original route, not just isolated demonstrations. Keep playability and performance verdicts separate.

- **Depends on**: Epics 1–4
- **Scope**: Matched replay, adverse encounters and independent review.

#### Stories

- [ ] **Story 5.1 — Make the acceptance decision** — Replay the baseline and both controls, then playtest unseen seeds with obstacles, flanks, casualties and interrupted jobs. Have an independent reviewer inspect raw repeats, actual attacks and untimed gameplay captures. **Depends on**: 4.2.
  - Publish phase-by-phase deltas, worst intervals/catch-up, repeat spread and invalid comparisons; classify each hitch and CPU7 budget as met, missed, untested or inconclusive with its own evidence. Do not infer GPU limits or M1 results from desktop FPS.
  - Verify all nine notes against witnessed behavior. Run model/branch coverage, affected movement/phalanx/combat/rig/handoff and objective suites, full checks, build and production diagnostic-isolation smoke. Record regressions and retain/rework/defer decisions before closing.

### Epic 6 — Evaluate run-owned cleanup (optional)

- [ ] **Epic 6 complete**

Schedule this follow-up separately after EF4 and a fresh audit of animation and death-physics resources. Adopt a run scope only if it simplifies construction, failure and retirement; it need not wait for Epics 1–5.

- **Depends on**: Epic 0 only.
- **Scope**: Run-owned acquisition, publication and teardown, separate from engine/application lifetime.

#### Stories

- [ ] **Story 6.1 — EF5: Keep a constructed run alive until retirement** — Audit scene, inspection, objectives, render pools, shader caches and physics ownership. Register release at acquisition, clean up partial acquisition locally and leave Babylon-owned children to their scene. **Depends on**: 0.5; schedule only after the resource audit.
  - Publish only a fully constructed game; retain its scope until replacement/teardown and close exactly once in cache-safe order. Define failure UI and active-game reference handling; reject retired owners and stale readiness callbacks.
  - Inject failure at each acquisition and during finalization; verify remaining cleanup, no partial publication or late writes, and stable resource counts through repeated seeded regeneration. Check ordinary play/reset and inspect rig/physics captures before deciding whether to retain the change.

### Epic 7 — Milestone A: recovery, Cleave and discovery

- [ ] **Epic 7 complete**

Give the existing hero three decisions in a normal run: when to heal, how to group enemies and whether to pursue a clue. Numbers below are starting assumptions for real-time play, not tabletop balance guarantees.

- **Depends on**: 5.1 for the reviewed encounter baseline; 0.5 before generated objectives or rewards.
- **Scope**: Items 1–4 and the first slice of item 7.

#### Stories

- [ ] **Story 7.1 — Show bloodied status (1)** — Mark the player and selected enemy at or below half maximum HP; let a wounded independent goblin seek more distant cover. **Depends on**: 5.1.
  - Test exact half, healing across it and lethal damage. Distinguish current status from a once-only trigger; neither is an order to charge.
- [ ] **Story 7.2 — Commit Second Wind (2, 7)** — Give a short, interruptible heal for 25% of maximum HP an action-bar slot; leave held F defense instant. **Depends on**: 7.1.
  - Start each ability's own timer on valid wind-up commitment; invalid use costs nothing, later interruption gives no refund. Show remaining time and readiness. Shared recovery prevents incompatible actions; effect duration is separate.
  - Trial 60 seconds for encounter-strength powers. Advance only in active fixed-step play, including exploration; pause/inspection freeze timers, room changes/kills/altar/respawn preserve them, and regeneration resets them.
- [ ] **Story 7.3 — Land Cleave on a second target (7)** — Share target, shape, action clock and effect definitions with Second Wind and a committed Heavy Strike. Keep basic attacks available on normal recovery. **Depends on**: 7.2.
  - With real key input, hit the primary and at most one eligible secondary in reach; a miss or interruption cannot duplicate damage. Check action tells at gameplay zoom and independent recharge on the bar.
- [ ] **Story 7.4 — Follow a clue and choose a blessing (3, 4)** — Record passive enemy tells and an inspected portrait clue leading to an optional objective. Offer one of three explained blessings through an idempotent claim. **Depends on**: 0.5, 7.3.
  - Demonstrate Cleave positioning, a risky heal and a visible optional payoff in one run. No roll hides progression instructions; derive stats from base plus modifiers, including HUD, healing cap and checkpoint health.

### Epic 8 — Wave A: eight types and a local chain of command

- [ ] **Epic 8 complete**

Replace species-based hostility before spawning mixed squads. Start the solo encounter budget here so extra types change the questions a room asks rather than simply adding bodies.

- **Depends on**: 0.5, Epic 7; preserve the encounters reviewed in 5.1.
- **Scope**: Wave A; items 17, 18 and the readiness portion of 20.

#### Stories

- [ ] **Story 8.1 — Define allies, enemies and readiness** — Give Skeleton, Goblin Sharpshooter and Kobold Skirmisher separate species, faction, local squad, combat role, rank, movement and rig definitions. **Depends on**: 7.4.
  - Test oathbound dead, keep raiders, kobold brood and explicit unbound/neutral relationships for perception, targeting, support and projectile interception. Preserve deliberate infighting, existing pack roles and jobs. Distinguish distracted gatherings from ready guards; threat loss restores the appropriate activity.
- [ ] **Story 8.2 — Select fights that fit (17)** — After EF4, record seed-stable templates, members and placements using solo threat costs distinct from book level/rank/XP. Keep generation separate from live completion. **Depends on**: 0.5, 8.1.
  - Select by faction, route depth, cover, floor and escape space; use bounded deterministic simpler fallbacks. Budget neighboring groups converging, reserved reinforcements, traps and overlapping control. Keep entrance/altar clear and objective workers/routes viable; don't inflate population to hit diversity.
- [ ] **Story 8.3 — Introduce the two brutes and a minion pilot (18)** — Teach Zombie's slow slam and Bugbear Warrior's cover ambush with distinct silhouettes and punishable recovery. Trial the optional Decrepit Skeleton after Cleave. **Depends on**: 8.2.
  - Stagger wind-ups; one damaging contact (including secondary Cleave) kills a minion, an avoided swing does not. Variants never count as new selected types.
- [ ] **Story 8.4 — Separate the beasts from their allies** — Introduce Dire Rat pack pressure in the bakery and Guard Drake's nearby-ally bite in a brood room. **Depends on**: 8.2.
  - Click and hit both quadrupeds at their drawn sizes; separating the drake from a qualifying ally removes its bonus. Verify safe approaches, distinct deaths and room to maneuver.
- [ ] **Story 8.5 — Reverse the raider front line** — Add Hobgoblin Soldier to reach **8 types**. One deterministic local leader issues revisioned orders to visible, in-range, same-squad goblins; orders are AI decisions, not 60-second powers. **Depends on**: 3.4, 8.3, 8.4.
  - Show healthy sharpshooters draw swords and charge while hobgoblins throw along clear lanes. At ≤50% HP each living goblin cancels unresolved melee, retreats, then shoots; sticky morale survives healing and replacement orders. The truly trapped dagger is self-defense, never a renewed charge. Death wins over retreat.
  - Healthy front-liners keep fighting. When the last retreats, dies or stays unreachable, hobgoblins advance; brief recovery does not trigger handoff. Test blocked throws, direct pressure, no subordinates, deterministic leader replacement or disbanding, target loss and reset. Reversing AI order must not change the result.

### Epic 9 — Milestone B: win position in the forge

- [ ] **Epic 9 complete**

Use shared impact and movement rules for both sides. The forge showcase should reward positioning without making waiting for a special power the best move in every room.

- **Depends on**: Epic 8 and the shove in 3.3.
- **Scope**: Items 5, 6, 9 and 10; extend item 7 with Hamstring and Shield Drive.

#### Stories

- [ ] **Story 9.1 — Resolve typed hits and flanking (5, 6)** — Give weapon, fire and radiant hits an attributed damage path; demonstrate a radiant blessing against undead. **Depends on**: 8.5.
  - Show resistance/weakness and protection before HP loss. At impact, two allied actors must threaten opposite sides with reach, line of effect and ability to act; show one capped advantage, not one multiplier per ally.
- [ ] **Story 9.2 — Let the hero catch a fleeing goblin (9)** — Add Hamstring through a shared timed-condition system: slow, immobilize, weaken, one ongoing damage type and temporary HP. **Depends on**: 9.1.
  - Verify visible expiry, refresh/strongest rules, fixed-tick damage and non-additive temporary HP for either side. A rooted actor can still attack; action-preventing effects cancel only unresolved impacts.
- [ ] **Story 9.3 — Drive a skeleton into lava (10)** — Generalize 3.3's collision-checked shove for player Shield Drive without changing the end guard's attack. Separate safe navigation, voluntary short step and forced displacement; hazards affect all vulnerable actors. **Depends on**: 3.3, 9.2.
  - Deterministically push onto hazardous floor, not through bodies, solids, locked gates or unsupported void; replan stale pursuit. Demo two forge skeletons, Cleave, lava, a bloodied cue and Second Wind, then escape a kobold surround with a validated step.
  - Check doors, stairs and continued recharge leaving the room. Record fight length, repeat uses and waiting to heal; tune short mobility separately from encounter-strength powers.

### Epic 10 — Milestone C: rooms with different tactical problems

- [ ] **Epic 10 complete**

Teach areas and counterplay one enemy at a time before mixing them. Deliver Wave B and the trap/reward portion of Milestone C; the guardian and integrated C demo follow in Epic 11.

- **Depends on**: Epic 9 and the EF4-gated selector in 8.2.
- **Scope**: Wave B; items 8, 11–13 and 17–19.

#### Stories

- [ ] **Story 10.1 — Read a blast and a cloud (11)** — Add Fire Beetle's recurring frontal spray and Goblin Hexer's bolt and encounter-strength vexing cloud. Share radial burst, frontal blast and persistent zone targeting. **Depends on**: 9.3.
  - Preview footprints, test obstruction from origin per target and bound hazard-aware route updates. Separate sight from physical obstruction. The hexer obeys local orders with a rod, breaks morale and resumes ranged casting; a beetle's recharge is not the cloud's 60-second timer.
- [ ] **Story 10.2 — Evade a pounce and interrupt a bite** — Add Deathjump Spider's marked, supported landing and Ghoul's brief claw-root into a telegraphed bite. Finish the zombie grab, adjacent hobgoblin defense and bugbear special strike on the shared effects path. **Depends on**: 10.1.
  - Demonstrate escape or interruption on basic actions with specials cooling down; prevent chained control, wall-crossing pounces and progression bypass. Distinguish normal pounce recovery from the exceptional leap's recharge.
- [ ] **Story 10.3 — Populate a twelve-type dungeon (11, 17, 18)** — Use commander-and-troops, double-line and battlefield-control templates; include one authored champion with a priced signature tell, not just extra HP. **Depends on**: 8.2, 10.2.
  - Wave B: **12 playable types**. From here on, verify **at least 12 distinct selected types in each standard seeded full dungeon**, not across the corpus; reproduce placements, preserve routes and solo escape space. No minion, champion or split child counts toward diversity.
- [ ] **Story 10.4 — Cross or silence the dart room (13, 19)** — Budget a guard and telegraphed dart mechanism together. Give the player a safe path to a lever, a destructible emitter and the option to lure the guard into a nonselective lane. **Depends on**: 10.3.
  - Track discovery independently of disabling. Dodge, interrupt disarm and destroy in live play; disabling survives respawn. Update visuals, blockers and projectile cover together. Protected seals are not destructible; breaking objects earns no kill credit.
- [ ] **Story 10.5 — Resolve a fight and claim its parcel (8, 12)** — Bind stable group IDs across rooms to explicit completion outcomes. Reserve three reliquary offers and one distinct optional reward at generation, using blessings before inventory. **Depends on**: 7.4, 10.4.
  - Neither temporary retreat nor walking past a group is completion. Verify usable offers, no reroll by opening order, no duplicate reward across nested objectives, death or altar use, and fresh claims on regeneration. Optional rewards never gate the crown or recharge powers.

### Epic 11 — Wave C and the Milestone C throne demo

- [ ] **Epic 11 complete**

Add the four specialized types only with bounded lifecycles and ordinary counterplay. Make the guarded throne a test of skills taught earlier, not a party-sized boss health pool.

- **Depends on**: Epic 10.
- **Scope**: Wave C, altar-plus-guardian progression and integrated cost review.

#### Stories

- [ ] **Story 11.1 — Escape a latch and track a vanish** — Introduce Stirge's targetable attachment and Imp's shimmer–vanish–sting on supported-floor hover routes. **Depends on**: 10.5.
  - Cap simultaneous attachments; ordinary input can detach or kill the stirge and immediately stop drain. Vanish enables one sting; test picking, walls, gates and cleanup on death/reset.
- [ ] **Story 11.2 — Split one elite, not its reward** — Reserve a level room and two legal body positions for Ochre Jelly. **Depends on**: 10.5.
  - First nonlethal bloodied transition splits once; children share remaining HP, inherit the spent trigger and give one combined reward. Test lethal threshold crossing, blocked space and actor caps without phantom survivors.
- [ ] **Story 11.3 — Interrupt Reanimate and earn the throne** — Add Deathlock Wight as a named standard controller behind limited guards, with grave bolts, a telegraphed fear push and a 60-second interruptible Reanimate. **Depends on**: 10.5, 9.3.
  - Target bounded logical deaths of ordinary skeletons/zombies, not minions or arbitrary bone meshes. Reconstruct one valid body at partial HP; no duplicate defeat reward, overlapping corpse or late resurrection after interruption/reset.
  - Gate crown claim on **both** altar activation and guardian defeat. Verify neither alone suffices; respawn preserves committed outcomes and regeneration starts fresh.
- [ ] **Story 11.4 — Review sixteen types in rendered play** — Finish Milestone C across several seeds: teach a simple fight, reverse a raider line, solve a dart room, claim a parcel and defeat the guardian. **Depends on**: 11.1–11.3.
  - Count **16 playable types**, each recognizable and tactically distinct, with ≥12 per standard dungeon. Check solo completion for every offered kit, selecting varied/attached bodies, corpses, hit effects, peak cross-room pressure and once-only rewards.
  - Before raising simultaneous actors/effects, repeat 1.2's hardware Low/High encounter and population controls plus a versioned peak roster/zone/respawn run. Compare matched starts, interval tails, worst phase, catch-up and resources across regenerations. Report changed populations separately; unmatched or unavailable hardware is inconclusive, not a speedup. Hold expansion on regressions; require independent review, full generation/model checks and production smoke.

### Epic 12 — Milestone D: optional exploration and consequences

- [ ] **Epic 12 complete**

Make discovery and room state matter without a required skill roll. Schedule this slice after the combat demo; choose further equipment or kit breadth from play evidence.

- **Depends on**: 11.4; not required for Milestone C.
- **Scope**: Items 11–14, 19 and 20; later experiments are listed below.

#### Stories

- [ ] **Story 12.1 — Find and open a side route (3, 13)** — Layer trained Perception, Thievery and Arcana/Religion over dependable clues. Separate ordinary side locks from the altar seal. **Depends on**: 11.4.
  - Demonstrate a key/tool route and a trained alternative with a stated cost. Basic danger and progression clues remain available to every kit; optional training never opens the throne early.
- [ ] **Story 12.2 — Stabilize or vent the forge (11, 13, 19)** — Offer distinct tool and lore approaches to a persistent multi-step challenge. Add one beneficial terrain feature and a once-tippable brazier using shared zones. **Depends on**: 12.1.
  - Success awards one parcel; failure vents visibly and forfeits the bonus but leaves safe passage. No repeat-stage farming or unbounded fire chains; show the terrain's benefit to eligible enemies as well as the hero.
- [ ] **Story 12.3 — Stop a local alarm (20)** — Let a sentry warn existing budgeted allies of a last-known position, not continually reveal the player. **Depends on**: 8.1, 10.3, 12.1.
  - Contrast intercepting the alarm with a nearby squad preparing/searching. Relays retain identity and expiry; no infinite alerts or spawned reinforcements. Tactical retreat is not surrender.
- [ ] **Story 12.4 — Playtest the next build choice (12, 14)** — Review the forge and alarm outcomes and choose one small progression experiment: bounded equipment replacement for the Knight, or one additional solo kit. **Depends on**: 12.2, 12.3.
  - Compare an explicit slot swap with the existing blessing baseline, or demo Rogue mobility/opening or Arcanist ranged control through the same ability bar. Verify every offered kit can finish the altar and guardian; defer broader inventory, smithy upgrades/retraining and the remaining kits until the choice proves useful.

### Epic 15 — Test a three-value dungeon in motion

- [ ] **Epic 15 complete**

Test whether a room composed of a few large color shapes makes the route and the fight easier to read. Use the 13 local studies in `ref/images/` (ignored) for room palettes, and [Hellboy Web of Wyrd](https://store.steampowered.com/app/2160480/Hellboy_Web_of_Wyrd/) for broad graphic shadows and characters that stay distinct in motion.

- **Depends on**: Epic 13's completed practice room. Schedule separately; keep Epic 14 next and Epic 1's baseline unchanged.
- **Scope**: Compare palette, outlines and silhouettes separately, then together in the practice room and a pinned dungeon. End with an adoption decision, not a default art change.

#### Stories

- [x] **Story 15.1 — Pin two playable comparisons** — Keep the current renderer as the control and make each trial opt-in. Capture a reset practice round and the same route in `MOURNING-731` before changing the look.
  - Add a small, collapsible practice-room panel. Introduce bounded sliders with their treatments: room hue and shadow coverage (15.2), ink width (15.3) and corner wear (15.4). Show each name and numeric value; dragging or using arrow keys updates the same scene immediately without sending pointer or keyboard commands to the game.
  - Add a live **Lens** slider from wide to long showing vertical FOV in degrees (baseline: 0.65 rad, about 37°, in `src/main.ts`). Adjust orbit distance to keep the hero the same on-screen size: Lens changes perspective, not zoom. At both extremes, rotate past a wall and verify cutaways reveal the hero and clicks still pick the visible floor, door and foe.
  - Add a live **Fisheye** strength slider independent of Lens and zoom: 0% is off; 100% gives strong barrel distortion. Distort only the scene, not the HUD or panel. At both extremes, check that clicks near screen edges pick the visible floor, door or foe under the pointer.
  - Switch between Original and Tuned at the same orbit angle and gameplay zoom without losing settings. Include Lens and Fisheye in comparison, reset to defaults and copied numeric settings so paired captures can be reproduced without restarting practice.
  - In practice, pass the pillar, open the door and fight the optional skeleton. In the dungeon, include stairs, a landmark and an occupied room; match starting state, inputs, action ticks, viewport, camera and quality between versions.
  - Save paired views at all four camera orientations and near/far gameplay zooms, plus short motion clips. Set acceptable frame-time and draw-call deltas before judging variants.
- [x] **Story 15.2 — Compose the room in three values** — Compare the partial lighting bands and floor grid/noise in [`src/materials.ts`](../../src/materials.ts) with broad light, mid and dark shapes. **Depends on**: 15.1.
  - Give each room one dominant hue against a dark saturated background. Try an icy blue stairwell with small amber lights, a purple chamber and a green shrine; reserve jewel accents for focal points. Use neither pure black nor neutral grey, even in deep shadow.
  - Suppress tile seams and fine noise rather than outlining the grid. At far zoom, identify the stair landing, safe floor, hazard and shrine without relying on texture detail.
- [x] **Story 15.3 — Outline what the player must follow** — Trial thick, dark chromatic contours on the hero, foes and selected landmark silhouettes, not every voxel or internal joint. **Depends on**: 15.1.
  - Compare the same approach, swing and shield raise with and without contours. Keep weapon and shield distinct against both lit floor and shadow; lines must not flicker on rotation, show through walls or masquerade as hover and target feedback.
- [x] **Story 15.4 — Break the visible right angles** — Trial render-only seeded skew on masonry, tapered pillars and chipped door and stair profiles. Aim for no apparent right angles in the room silhouette, not a different floor plan. **Depends on**: 15.1.
  - Inspect corners and cutaways from each camera side. Repeat the seed: chips stay put, adjacent faces meet without cracks, and no cosmetic draw changes generation or placement.
  - Click the same floor, door and foe and traverse the same stairs in both versions. Preserve picking, collision, navigation, support heights, actor rigs and grips; keep material/chunk batching and thin instances rather than adding a mesh per chip or outline.
- [ ] **Story 15.5 — Decide which treatments to keep** — Replay both comparisons with individual treatments and the combined look. **Depends on**: 15.2–15.4.
  - Have the player identify walkable edges, doors, hazards, the selected foe and attack wind-up while moving, rotating and zooming. Record misreads against the control and the view where each occurred; a strong still does not excuse a lost combat tell.
  - Repeat matched Low/High runs on the same hardware; compare frame-interval p95/p99, repeat spread, draw calls and resource counts after reset/regeneration. Record adopt, revise or reject per treatment against the agreed limits and readability results. Unmatched runs are inconclusive; leave defaults alone pending approval.

## Out of scope

- Epic 15 does not import reference art, remodel the keep, change simulation or roll out a new default style. The lighting trials are not hitch fixes or substitutes for Epic 1's measurements.

- Epic 14 reserves menu bindings; it does not build character or inventory screens, import Diablo II assets, or redesign combat balance. The practice room stays empty by default; use its opt-in skeleton and the actual dungeon, not a second combat controller.
- Epic 13 adds no rogue, ranged or spellcasting actions, loadouts, or control redesign. It needs no editor, art pass, formal play study or port of a mechanic to the dungeon. The later kit choice in 12.4 stays separate; the room does not replace Epic 1's dungeon measurements.
- Population cuts, lower quality defaults, lighting changes and reviving CPU6b scheduler/LOD: controls are diagnostic, not proposed fixes. Keep full-rate simulation and presentation.
- Unrelated keep variants and adventure grammars: EF4 permits new content but does not authorize a generator replacement. Existing animation, death, competing-objective and scenario initiatives keep their own contracts.
- Wider Effect migration, workers, remote telemetry and persistent schemas: the pilot needs only synchronous generation and bounded local diagnostics. EF5 addresses run lifetime, not a new simulation runtime.
- Later tactical variants: item 8's capped momentum after two distinct completions needs pacing evidence; it is not a recharge mechanism. Item 10's charge/pull/slide and teleport need endpoint and gate tests beyond Shield Drive. Longer daily-inspired recharge (~180 seconds) is provisional; no literal rests, party XP or daily resource economy.
- Later exploration (13, 15): optional cache/corpse rituals and lineage puzzles need authored, deducible clues. Full stealth/search and a surrender-for-clue outcome need quality-independent perception, last-known positions and explicit resolution credit; an alarm or morale break alone grants neither.
- Party tactics (16) and goal-driven relics (21) are optional later experiments: companions, commands, marking and revival change solo balance; a three-attitude royal relic needs meaningful equipment and once-only objective choices first. Neither is a milestone prerequisite.
- Additional roster variants, disease tracks, unrestricted flight and universal ally ghosting are not needed for the 16-type catalog. Keep the scoped assembly exception; no expansion of pass-through to mixed factions.
