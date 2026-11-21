# A3 — locomotion and grounding migration

**2026-11-20. Implemented and verified; independent review READY.** Living actors now use the
[A2 solver](rig-solver.md) for locomotion/contact presentation. A4's
[action, equipment, work/social and temporary-death migration](rig-actions.md) is now verified and
independently reviewed READY. The compatibility section below records the A3 checkpoint.

## Ownership and pipeline

`Components.rigPose` owns `GroundedLocomotion`, its authored semantic pose, retained solver buffers
and two contact records. `rig.footPlants` references the same plant objects for existing debug/reset
consumers. There is no second contact registry or gameplay state.

```text
measured travel + locomotion/action/jump clocks
  → existing authored curves, blend priority and analytic springs
  → canonical humanoid local pose
  → stance/swing/flight plan and slope-aware sole targets
  → coordinated pelvis/limb solving with final-contact refinement
  → final binding application and fixed-step history
```

`actorRendering.ts` composes the distance-driven gait, skeleton 64/36 lurch, crouch, backsteps,
jump/landing and upper-body action curves into semantic joints. Living poses no longer call
`placeFeet()` or translate legacy leg channels into the final pose. A7 moves the historical analytic
geometry/contact reference to `tests/historical-foot-placement.ts` and removes remaining compatibility.

The root stays at **actor X/Z and authoritative support + jump elevation**. Pelvis translation
carries bob, run lift and corpse assistance. Heading retains eased facing and immediate guard/
squad-facing policy. Volume-preserving root scale is accounted for by target generation, including
the inverse-transpose relationship between terrain normal and scaled sole plane.

Body correction permits at most **0.20 local units downward/horizontally**, with no additional
upward correction. Explicit corpse assistance remains at most **0.14 world units**. This lets
the solver reconcile a raised foot and low support foot without extending either leg. Support,
speed, water slowdown, occupancy, route clearance, attack clocks and jump state are read-only inputs.

## Contact policy

- Contacts record stance/swing/flight/unsupported mode, plant, release reason/count, phase and
  final plant error. Required stance support has priority zero; swing and running-flight goals
  have lower priority. Real airborne jumps and authored kicking release contact.
- World plants refer to the **sole centre**, including the profile's toe offset. Turn/reach,
  swing, running flight, jump preload, stopping and unsupported terrain release them explicitly.
  An exhausted stance plant cannot be reacquired repeatedly before its phase changes.
- Profile metadata describes actual boot/foot half-width and half-depth. Planning samples a
  footprint, constructs a bounded slope orientation, and anticipates nearby corpse edges.
- Corpse surfaces union by maximum, capped at **0.46 units**. Swing uses the greater of ordinary
  clearance and obstacle height, rather than stacking another full lift on a tall body.
- Each whole-body pass checks the final sole centre, four drawn corners and two ankle references.
  Penetration adjusts the next target within the same **four-pass** budget. Live refinement returns
  the latest checked candidate rather than restoring an earlier pose with stale clearance.
  Residuals still expose infeasible targets.
- Corpses remain passable at full speed; water alone slows grounded movement to 52%.

The ceiling is **66 floor-height queries and 74 corpse-surface queries per actor/sample**. Distant
corpse boxes are culled once to the anatomy/scale/stride envelope. The full-body ceiling remains
**four passes / 16 limb solves**; A5 raises the shared FK ceiling to **273 joint evaluations** for
the 24-joint tailed extension (249 for the unchanged core). Planning FK, when needed for running
flight, is separate and bounded by the definition size. Tail-only clearance runs after this solve;
see [its independent budget](rig-tails.md).

### Once-per-frame presentation

The completed sample owns its contact decisions. Repeating identical clock/pose inputs returns
that snapshot instead of planning again from its own newly released plants. The retained request
uses fixed numerical storage and compares actor/animation identity, animation time, position,
heading, motion/jump facts, pose channels, overlays, contact state, world/tile-map identity and
corpse descriptor references. No new simulation clock or wall-clock timer is introduced.

Advancing time, changed inputs, new/changed/retired corpse geometry and reset invalidate the
snapshot. Generated floor geometry is immutable during a run; a development tool that mutates
floor tiles in place without advancing a step must reset grounding explicitly. Regeneration
creates new world/rig state. Reset drops cached actor/animation/world/corpse references.

## Compatibility boundary for A4 (historical A3 checkpoint)

Upper-body actions retain their clocks/blend fields. Numerical Euler values remain binding hints
only: a hint is used only if it matches the final solved matrix. Solved legs skip obsolete hints;
X hinges retain their full signed bend rather than an equivalent small pitch plus π yaw/roll.
Only the binding writes scene-node transforms.

Root-mounted shields/long weapons receive the equivalent local visual-lift offset. A4 replaces
these attachments with solved grips. On stop/death handoff, the binding captures actual current
node transforms into compatibility channels once. Reset restores all anatomical hip translations/
rotations; the temporary death curve settles captured hip X/Z and yaw continuously. A4/A7 later
replace this compatibility handoff with the complete pose-layer contract.

## Verification

```sh
node --test tests/rig-grounding.test.ts tests/rig-grounding-bindings.test.ts
npm run test:rig
# Compare historical gameplay/travel clocks, not the intentionally changed poses:
A0_POSE_REPORT=test-results/animation-review-catalog.json npm run test:rig
npm run test:animation
npm run test:movement
npm run test:jump
npm run build && npm run test:production
```

Recorded results:

- **330 everyday tests**, including seven new A3 tests; typecheck, lint, format (**175 files**) and
  build pass. Models remain **22 machines / 105 states / 226 branches**.
- **428 samples / 30 clips** match preserved A0 gameplay/movement/action clocks exactly. Maximum
  actual sole-corner penetration **2.553e−7**, planted-sole horizontal error **4.316e−6**, and
  semantic-FK/rendered-joint mismatch **5.644e−6**. Mesh/material/shadow/observation identity and
  actual selection pass. Catalog samples use at most **38** terrain queries per actor.
- Animation's real moving corpse crossings, slopes, actions, jumps, skeleton sequences and resets
  pass. Movement **16**, jump **8**, and local production **5** checks pass.
- Eight selected clips replay identically from gameplay and side cameras. The generated viewer
  was exercised at 1× then ¼×; side sheets and dense animation/skeleton captures were inspected.
  The viewer samples 60 Hz simulation at 10 Hz, not every rendered frame.
- Integrated 25-actor/four-corpse/four-action-kind fixture: **1.8625ms mean / 2.50ms p95**, after
  60 warmup +240 measured updates. Whole-workload terrain lookups peak at **840**. This is below
  the prior 2.2/3.4ms investigation thresholds; it is a software-rendered CPU fixture, not GPU FPS.
- Original **2,291 meshes / 397 nodes / 28 materials / 4 textures / 5,767 entities** plateau through
  workload and three regenerations. CDP's **189,387,920-byte** statistical allocation estimate
  includes setup/warmup/yields/instrumentation and collected objects, not retained heap.
- Independent review cleared repeated-release and incomplete reset/death-channel blockers.
  Follow-up covered **44** invalidations, **640** production NullEngine frames with three zero-time
  repeats each, **48** actual corpse-render invalidations and **300** affine products.

The worst remaining visible issue is root-mounted/stowed equipment and carry/grip placement,
assigned to A4. The corpse-height cap remains deliberate; diagnostics distinguish capped contact
from uncapped drawn geometry. See [VERIFICATION.md](../VERIFICATION.md) for red/fix evidence,
performance qualifications and attributed review checks.
