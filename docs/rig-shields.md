# A6 — shield anticipation, confirmed-block reaction and recovery

**2026-11-20. Implemented and verified; final independent review READY.**
This follows [A5 tails](rig-tails.md). A7's complete cutover/physics snapshot remains next.

## Ownership and authority

- `Components.blockFeedback` owns `BlockFeedback`, created with the actor's exact entity and ECS
  references. `CombatSystem.damage` publishes `BLOCK_ACCEPTED` only inside its successful guard
  branch, after life, hostility, damage and invulnerability checks. Existing attack range, cover,
  doors, elevation and projectile contact checks still precede that call.
- Each immutable diagnostic event includes run/target/source identity, actor-local sequence,
  simulation time, impact kind, damage-derived magnitude, normalized world travel and contact.
  Projectile hits supply their actual body-contact point. Missing or non-finite optional contact
  metadata falls back to an explicitly labelled body-surface estimate.
- The mailbox keeps **one pending simulation-time batch**, five bounded integer sums and one latest
  diagnostic event. Positive/negative direction contributions use separate nonnegative bins;
  quantization and saturation make same-step combination independent of hit iteration order.
  Count saturates at 65,535; delivered reaction power at two. There is no unbounded event list.
- A different timestamp replaces an unconsumed old batch. Consumption rejects stale/replaced owner
  components, dead actors, future times and events older than 1/30s. It clears the pending batch
  exactly once. Regenerated actors own fresh mailboxes. Stop/teleport, jump, rig reset and death
  retire pending feedback. Rejected hits, sparks and predicted overlap never generate reactions.
- `rigPose.actions.shield` owns `ShieldMotion`: six continuous springs (placement, aperture,
  supporting load, frontal/lateral recoil and counter-turn) plus sampled input history.
  It reads existing Defense/squad snapshots; it cannot enable blocking, move the gameplay anchor,
  delay release/impact, complete work or extend vulnerability. No production statechart was added.

## Pose sequence

**Raise and hold:** the required shield frame is protective immediately on a raised/re-raised guard
or authoritative gate restoration. Supporting shoulder/torso load and coordinated elbow/leg motion
provide preparation and damped settling around that frame. Reversals retarget the current placement
and aperture springs. An already protective frame retains its exact pose and velocity; only an unsafe
frame is projected toward guard. Twelve bounded bisections find the first protective point on that
path, discarding only velocity directed through the active boundary. Repeated hold does not restart
the load. This reconciles current-pose reversal with same-step protection without a canonical reset.

The planner and mesh builders share immutable board dimensions. Protection checks the actual board
frame's forward normal (dot at least 0.9802), forward clearance and body/gate ray intersection, with
a 0.005 slab margin. A currently unprotected shield can still require an immediate projection; this
does not delay blocking or pretend that a discontinuous necessary boundary correction is smooth.

**Lower:** gameplay defense becomes ineffective immediately. The last held/opening frame blends
toward the current **pre-solve authored hand**, with a small outward arc and quaternion interpolation
in the root's scale-bearing basis. This is an acyclic target: it never follows its own previous IK
result. The forward/outward arc clears the centerline before restoring running torso lean; the body
blend and board height respect the current authored root scale. Required hand attachment remains
until the visual handoff finishes. Other actions' required
grips retain priority. Forced modal/focus/teleport/death resets clear channels immediately; ordinary
release/X permits controlled follow-through.

**Confirmed block:** a positive-time sample consumes the batch and adds bounded directional impulses.
World travel is resolved in the actual rendered heading, including eased turning after release.
Shield recoil transfers through the constrained hand, shoulder and torso with a small grounded pelvis
brace; the tail receives bounded counter-motion through its existing constrained spring chain.
Frontal recoil is capped at 0.075, lateral recoil at 0.04, body load/counter-turn at 0.08. Burst energy
and angular velocities are bounded. Recovery follows the current guard/opening/lowering target.
Ground bracing fades during procedural running flight so it cannot drive short legs into a stair.

**Phalanx:** the final 0.18s of the existing advance clock supplies a preparatory load; the opening
clock supplies its release. A smooth 0.25s shield-opening curve remains inside the existing 0.6s
warning, fully exposed during the actual spear action. The torso counter-turn and compensating gaze
settle through interruptions/restoration. While guarded, the shield still covers the physical spear
lane, including during confirmed recoil. No chart duration or defense arc changes.

Zero-time inspection neither integrates springs nor drains events. Completed pose requests include
the new target channels; repeated reads are idempotent. Quiet springs at their exact targets do no
integration work. The same shared four-pass/16-limb solve revalidates hands and feet; transitional
placement adds one authored FK traversal (20 or 24 joints). The protective projection evaluates only
the board frame, never another full-body solve loop.

## Verification and reproducible review

```sh
node --test tests/block-feedback.test.ts tests/rig-shield.test.ts
npm run test:rig:shield       # running development server required
npm run test:rig:shield:transitions
npm run test:defense
npm run test:phalanx
```

TDD reds preceded the component/motion implementation, live guard preparation, counter-turn
continuity and dormant-spring optimization. A moving-stair browser red exposed 0.001146-unit flight
sole penetration; grounded-only bracing restores 0.000907 or better without weakening the threshold.
The old instant-release arm assertion now verifies controlled lowering and final settle; hard reset
assertions remain. The rig geometry oracle recognizes the still-required grip during lowering.
The initial independent review found moving-release body intersections and unconditional reversal
snaps. A persisted browser red reproduced those defects before the coordinated release and
constraint-aware projection fixes. A later pure red caught recoil using motor rather than rendered
heading after release; the live rendering adapter now supplies the eased heading.

The dedicated browser suite exercises real F/melee input, immediate protection/release, normal
lowering, rapid reversal, repeats, jump/modal reset, directional/strong/batched hits, rear-hit
rejection, exact repeated reads, actual grips/soles and kobold-tail response. It replays player and
shieldbearer control/impact sequences from shield-side and gameplay cameras, adds 960 both-direction
stair frames with exact control-versus-hit motor/health parity, and checks the actual gate mesh's
lane coverage through opening/recovery and confirmed recoil.
The transition regression adds 600 phase-varied release/control frames, real F/run/release, twelve
reversal cases and sixteen opening interruptions (target loss, retreat, invalid action and death).
It measures actual mesh separation independently of production geometry helpers. Smaller existing
pauldron overlaps are compared with free-motion controls rather than claimed eliminated.

`test-results/rig-shield-motion.html` has ten playback tracks, 60 Hz simulation captured at 10 Hz.
Normal and quarter-speed playback were exercised; shield-side and gameplay sheets were inspected.
Corrective release and reversal captures are saved as `test-results/rig-shield-*.png`. Feasible
one-frame reversals have zero corner jump and retain placement velocity. Deeper unprotected lowers
still require immediate boundary projection; discrete equipment stowing remains unchanged from A4.

Recorded checks, bounds/cost measurements and review attribution belong in
[VERIFICATION.md](../VERIFICATION.md). The first review was NOT READY; final independent follow-up
cleared both moving-release clearance and reversal-continuity blockers before this delivery.
