# Animation roadmap — procedural full-body rigs and death physics

**Updated 2026-11-21. A0–A7 are implemented, verified and independently reviewed READY.
A7's final review clears the landing/support-velocity handoff blocker.
P8 and P9 are implemented, verified and independently reviewed READY.** See the [A0 baseline](animation-baseline.md),
[A1 rig foundation](rig-foundation.md), [A2 solver](rig-solver.md), [A3 grounding](rig-grounding.md),
[A4 actions](rig-actions.md), [A5 tails](rig-tails.md), and [A6 shields](rig-shields.md).

This develops the character-animation work in the [dungeon demo plan](dungeon-demo-plan.md#character)
and the animation deliveries in the [implementation path](implementation-path.md). It is the
implementation specification for the user's new rig request, not a second competing queue.
Actual delivery and verification belong in [implementation progress](implementation-progress.md)
and [VERIFICATION.md](../VERIFICATION.md).

## 1. Decision and delivery order

Build a shared, procedurally driven **full-body humanoid rig**, plus a **humanoid-with-tail**
extension for kobolds. Convert every existing actor animation to this pipeline. Add readable
shield anticipation, blocked-hit reaction and recovery. Then use the common rig for directional
ragdoll deaths and skeleton breakup.

```text
P1–P7 delivered
  → T2 faster everyday tests; full coverage retained in CI
  → A0 motion-review baseline
  → A1 shared rig definitions and bindings
  → A2 coordinated full-body IK
  → A3 locomotion and grounding migration
  → A4 action, equipment, work and social migration
  → A5 articulated kobold tails
  → A6 shield anticipation and reaction
  → A7 complete cutover and ragdoll handoff contract
  → P8 directional ragdoll deaths
  → P9 skeleton breakup and settled decoration
```

The original list through P7 is complete. This user-directed animation foundation now precedes
P8/P9; retain their IDs and requested death behavior. The user subsequently requested **T2 test
profiling/segmentation before animation**. Once that prerequisite is complete, **the first animation
slice after compaction was A0**, now delivered along with A1–A3. A4 action/equipment/work/social
migration is now verified and independently reviewed READY. Living locomotion and required
equipment grips use the coordinated solver. A5 articulated tails is now implemented and verified;
A6 shield motion is implemented, verified and independently reviewed READY;
the physics backend remains later work.

### Goals

- Improve weight, rhythm, anticipation, follow-through and responsiveness at the actual gameplay
  camera, as well as in close-up. IK supports authored motion; it does not choose acting or timing.
- Coordinate feet, pelvis, torso, shoulders, hands and head under simultaneous contact/grip goals.
  Merely wrapping the existing leg solver in a new class is not the full-body milestone.
- Give all twelve kobolds clearly articulated tails and the same reusable tailed-rig contract,
  including both squad roles, social activities, work, combat and retreat.
- Preserve intentional species differences: upright adventurer, skeleton 64/36 lurch, goblin
  crouch/skirmishing, and kobold shielded ranks/backsteps.
- Hand the final solved pose and velocities to death physics without a neutral-pose snap.

## 2. Starting point — verified source, not proposed features

Planning baseline: public release **`3934e17`**, including phalanx **`806a27b`**. The recorded
baseline is **315 tests / 22 machines / 105 states / 226 branches** and the published production
smoke. Those are historical results, not new checks performed by this planning change.

| Current implementation | Migration implication |
| --- | --- |
| `src/player.ts`, `src/enemyRendering.ts` construct rigid voxel parts under transform nodes | Keep procedural geometry/materials; bind those parts to semantic joints. Smooth skinning/imported animation assets are not required. |
| `Components['rig']` in `src/ecs.ts` stores limb arrays, optional head/equipment and blended poses | Replace positional assumptions with typed joint/chain/socket definitions and ECS-owned pose state. |
| `src/locomotion.ts` generates poses from measured travel and synchronous locomotion state | Retain cadence, start/stop curves and motion authority; convert outputs to rig layers and targets. |
| `src/footPlacement.ts` analytically solves two-bone legs, with stance anchors and final contact correction | Reuse its tested geometry where appropriate; generalize lengths/axes, then coordinate it with pelvis/spine/arm solving. |
| `src/actorRendering.ts` blends actions and directly writes body, limbs, equipment and death poses | Split sampling, solving and mesh application so each joint has one final writer. |
| `src/actionPoses.ts`, `src/phalanxPoses.ts`, `src/skeletonGait.ts`, `src/animationCurves.ts` provide authored curves and springs | Preserve their timing/art intent while removing direct dependence on a particular mesh hierarchy. |
| Kobolds already have a single rigid tail box in `src/enemyRendering.ts` | Replace that stub with an articulated tail chain; do not add a second tail. |
| Player shields attach through the arm; squad shields and long weapons have root-mounted presentation | Give equipment explicit grip frames and solve the hands to them without changing authoritative weapon lanes. |
| `src/corpseRendering.ts` / `src/corpseTerrain.ts` sample settled drawn geometry | Continue querying final rendered surfaces; adapt registration/caches to the new bindings and later physics poses. |
| Death currently uses `deathPose(age)` and `{ age }` corpse state | Migrate this temporary death animation too; physical ragdolls arrive in P8, not during the rig refactor. |

The current system runs no rigid-body ragdoll simulation. Stable lizard steeds are separate
ambient quadrupeds; their construction is a future rig-family reference, not a humanoid migration
target. Doors, portraits, environmental shaders and other world animation retain their own systems.

## 3. Ownership and architecture

### 3.1 Authoritative gameplay boundary

Keep the shared actor motor, support height, jump trajectory, occupancy, navigation, attack impact/
release clocks, defense arc and squad phase authoritative. A pose never decides damage, blocks,
projectile release, movement speed, route clearance or work completion.

- Movement remains fixed-step at `1 / 60`; presentation state advances once per simulation step.
  Extra `scene.render()` calls and zero-time pose inspection must not advance springs or consume
  events twice. Any render interpolation reads solved snapshots rather than resimulating them.
- Root position/heading come from gameplay. Pelvis/spine compensation is bounded visual movement
  beneath that anchor, not root motion fed back into the actor or collision proxy.
- Preserve instant held-F blocking, its inclusive 120° arc, cancellation latch and attack/work
  interaction. Preserve the phalanx opening/attack/recovery clocks and friendly javelin interception.
- Living actors continue blocking. Corpses remain passable at full speed; grounded water alone
  applies 52% speed. Visual contacts cannot change support, jump elevation or melee elevation.
- Menus, inspection, hidden tabs, focus loss, X, teleport, death, respawn and regeneration retain
  their existing gameplay policies. Clear/reset presentation anchors, impulses, velocities and
  equipment bindings appropriately; never resume a stale transition after teleport or a new run.

Use synchronous XState charts for discrete lifecycles that actually need states. Reuse existing
locomotion, attack, defense, work and squad charts; continuous poses, residuals and spring values
are numerical presentation data. Every new exported production machine needs a model case.

### 3.2 Data contracts — proposed, names may follow repository conventions

A1 implements definitions/profiles, pose/history buffers and mesh bindings. A2 implements targets,
bounded coordinated solving and residuals. A3 adds live contact state and semantic locomotion poses.
A7 now provides the final [velocity/death snapshot contract](rig-handoff.md).

| Contract | Responsibility |
| --- | --- |
| `RigDefinition` | Immutable semantic joints, parent topology, rest transforms, segment dimensions, joint axes/limits, limb chains, bend hints, sockets, and coarse physics-body mappings. |
| `RigProfile` | Species proportions, posture/gait tuning and enabled capabilities; equipment roles remain independent of species anatomy. |
| `PoseBuffer` | Preallocated local translations/rotations and evaluated world transforms, plus previous/current fixed-step snapshots. |
| `RigTargets` | Weighted/prioritized foot, grip, gaze and posture constraints, with explicit coordinate spaces and contact/release intent. |
| `AnimationState` | ECS-owned contacts, blend/transition values, secondary-motion state and bounded consumed-event identity; no duplicate gameplay flags. |
| `RigBinding` | Babylon adapter mapping final pose joints/sockets to existing procedural meshes, attachments, shadows and observation surfaces. |
| `PoseSnapshot` | Final world pose, root basis and linear/angular velocities for testing and the later physics handoff. |

Use semantic left/right names and typed capabilities instead of assuming array element meanings or
testing `actor.kind` throughout the solver. Distinguish anatomical **rig family**, species profile,
and combat role. `humanoid-with-tail` extends the shared humanoid definition; it is not a separate
copy of its arms, feet or solver.

Implemented A1 modules were `src/rigs/{types,humanoid,pose,legacy,bindings}.ts`; A7 removes `legacy.ts`. A2 adds
`{targets,ikMath,solver}.ts`; A3 adds `grounding.ts` and final-contact refinement. A4 adds
`{actions,attachments}.ts`. A5 adds `{tail,tailClearance}.ts`; A7 adds `src/rigs/history.ts` and `src/deathHandoff.ts`. Keep pure pose/constraint
math independently executable under Node; Babylon mesh mutation belongs in bindings. Current
transform-node meshes are a valid rendering backend; selecting Babylon `Skeleton`/skinning is
not a prerequisite. Do not add an unused physics dependency during A1–A6.

### 3.3 Shared anatomy

The logical root anchors a pelvis, a short spine/chest chain, neck/head, left/right shoulders,
upper arms, forearms and hands, and left/right thighs, shins and feet. Hands/feet have explicit
grip/sole frames. Mesh offsets are relative to these frames rather than hidden pivot conventions.

Define actual limb lengths and joint limits per profile. Start from today's neutral proportions;
preserve mask/hood, skull/ribs, snouts, ornaments, equipment and angular silhouettes. Add hand/head
nodes where today's geometry has no explicit pivot. Use stable rotation representations and
explicit local/world conversions; test nonuniform visual scale and the old near-zero IK cases.

Label every target's space (`world`, rig-local or joint-local). World vertical is Y; gameplay
support is `h` and jump height is separate. Local +Z is forward, +Y is up, and heading zero faces
world +Z. Socket offsets, pole/bend hints and physics joint frames must use declared bases.

Squash/stretch and cape movement remain visual layers. Preserve physical bone lengths in the
solver, or explicitly account for authored scale when generating targets; never let a late scale
operation silently break solved grips/contacts. Physics proxies later use stable dimensions.

### 3.4 Pose pipeline and full-body solve

```text
Gameplay snapshot + confirmed presentation events
  → sample distance/action-clock-driven base poses
  → layer posture, equipment intent and contact plans
  → build feet / hands / head / pelvis targets
  → bounded pelvis + spine/shoulder adjustment and limb IK
  → secondary motion constrained by contacts and joint limits
  → final world-space residual/contact check
  → store solved pose/velocity snapshot
  → apply once through render bindings
```

Start with a hierarchical, bounded solver: analytical limb IK plus limited pelvis/spine/shoulder
corrections, revisiting affected limbs as the body changes. Use at most **four whole-body passes**
as the initial budget; refine or justify a different bound with measurements. Include contact
corrections in that budget rather than nesting another four-pass loop inside every limb solve.
This must solve a combined scenario with both planted feet and a two-hand grip, not just independent
limbs.

Constraint policy:

1. Gameplay anchor and authored anatomy/reach limits are fixed constraints.
2. Grounded support feet and currently required weapon/shield grip constraints have explicit high
   priorities; a designated support hand may release when the action declares it.
3. Pelvis/chest posture and aim adjust within bounds to satisfy reachable contacts/grips.
4. Swing-foot clearance, gaze, head lag and secondary decoration use lower-priority adjustments.

Within a priority level, use a documented stable ordering/weight policy. Conflicting hard foot and
primary-grip targets must produce an explicit infeasible result; silently dropping one constraint
is not a successful solve. Secondary-hand release must be an authored action decision.

For incompatible goals, return bounded residuals and relax declared lower-priority targets. Do
not stretch bones, teleport the gameplay root, flip a knee/elbow, or iterate without a cap. Select
stable bend hints across straight-limb/zero-distance singularities. Retain the last valid pose
or a deterministic bounded projection when a request is infeasible.

Feet need explicit stance/swing contact plans, slope-aware sole frames and reachable swing arcs.
Keep travel-driven ordinary and skeleton phase mappings. Solve floor/corpse clearance at the
**final rendered foot position** after body adjustment. Retain the current 0.46 corpse-contact and
0.14 corpse-pelvis assistance caps initially; any later tuning must be visible and tested.

Two-hand equipment uses one weapon frame with separate grip sockets. Define whether the action
owns the weapon target or the primary hand owns the weapon; never create a cyclic parent/solver
dependency. Off-hand targets follow that frame. Release the throwing grip at the actual action
release, and retain current projectile launch origins/directions and body-safe spear lanes.

## 4. Humanoid-with-tail rig for kobolds

**Implemented in A5:** see [anatomy, clearance and verification](rig-tails.md). The requirements
below remain the acceptance contract. Final independent review is READY.

Use the same humanoid core with a pelvis-rooted chain of **four tapered tail segments** initially.
Make the tail readable from the overhead camera and side view using a strong curved silhouette,
existing materials, and a restrained tip shape. Length/width are art-tuned within the formation's
space budget rather than copied from a quadruped.

- Replace the existing rigid stub for all twelve kobolds, including shield and spear roles.
- Drive the tail with bounded, damped angular follow-through from actual pelvis acceleration,
  yaw/turn rate and gait. Add restrained idle settling, jump tuck, attack/recoil counter-motion
  and backward-retreat behavior; input against a wall must not generate perpetual running sway.
- Share the final pelvis transform, joint limits and pose buffer. Use a bounded chain solve or
  angular spring chain with floor/wall clearance and a final limit/contact pass. Tail inertia is
  presentation state; it does not displace the actor or change phalanx spacing.
- Check the spear lane, shield positions, rear rank, stairs, narrow doors, crouched card players,
  carried crates and the tail's own body. Prefer a tucked/bounded fallback over violent corrections
  when decorative contacts conflict. Avoid visible tail interpenetration in ordinary formations.
- Tails do not extend living collision, hit range, target selection or navigation footprints.
  Register their drawn geometry for shadows and observation, and for appropriate settled-remains
  sampling later. Re-evaluate A4's 4.8-unit observation envelope rather than assuming it.
- Reset every segment and its velocities on teleport/regeneration; pause it with simulation.
  The later P8 physics mapping includes the tail chain; it is not left attached to a live-animation
  writer while the rest of a dead kobold is simulated.

## 5. Migrate the existing animation catalog

Each row must run through shared pose buffers, targets and bindings by A7. Preserve action clocks,
selection/interaction semantics and established motion unless the row explicitly adds animation.

| Current behavior / sources | Rig migration and acceptance |
| --- | --- |
| Idle, start load/push, walk/run blend, stop brace, turning lean — `locomotion.ts`, `animationCurves.ts` | Preserve measured-distance cadence and deliberate anticipation; stable contacts through acceleration, collision, stopping and direction changes. |
| Stairs, corpse stepping, running flight poses — `footPlacement.ts`, `corpseTerrain.ts` | Coordinated pelvis/legs; real final soles clear sampled surfaces, retain full-speed travel and handle overlapping corpses by maximum surface. |
| Skeleton lurch and delayed skull — `skeletonGait.ts` | Preserve 64/36 asymmetry, readable sag/recovery and correct asymmetric foot contacts. |
| Jump preload/tuck/landing, landing compression and cape — `jump.ts`, `actionPoses.ts`, `actorRendering.ts` | Follow actual jump velocity/landing events; release foot plants, preserve ballistic authority and settle without double-counting the landing impulse. |
| Goblin crouch/hide/peek and crossbow aim/recoil | Preserve cover behavior and actual bolt release; stable weapon grip and a readable exposed firing pose. |
| Sword wind-up/impact/follow-through, including moving pursuit | Sample the existing action clock; retain travel beneath the upper-body strike and blend interruption from the current pose. |
| Phalanx assembly, advance, hold and backward withdrawal | Preserve heading independent of travel, live spacing, role equipment and readable protective front faces. |
| Long thrust, javelin draw/throw/release and shield opening — `phalanxPoses.ts` | Hands remain on grips; weapon lane, release/impact and vulnerability agree with gameplay. No floating root-mounted weapons after cutover. |
| Held defense, release and block feedback | Shared grip/guard targets, plus the anticipation/reaction sequence in section 6. |
| Cards, smoking and hacky-sack — `actionPoses.ts`, `socialRendering.ts` | Preserve synchronized passes/puffs and intentional kicking-foot release; hands meet cards/pipe where appropriate, with equipment stowed correctly. |
| Shrine/focus work, packing/unloading and tribute carrying — `objectiveWork.ts`, `tributeRendering.ts` | Sample work time, keep tools/crate grips consistent, and cancel poses with actual interruption. Do not grant work through a visual contact. |
| Existing collapse, settled remains and all reset paths | Convert the temporary `deathPose` to the rig; preserve corpse rendering/observations until P8/P9 deliberately replace it. |

A temporary compatibility adapter may translate old `LocomotionPose` output into rig layers.
Each migrated path relinquishes direct mesh writes; remove that adapter and obsolete limb-array
assumptions once all rows pass. Never keep both old and new systems updating the same joints.

## 6. Shield anticipation, reaction and recovery

**Implemented and verified; final independent review READY.** See [the A6 contract](rig-shields.md).
The requirements below remain the acceptance contract.

This is animation work on the shared rig, for the player and kobold shield bearers. Preserve the
responsive P5 defense contract and P6b counterplay.

### Raising / holding / lowering

- Add a brief shoulder/torso load and elbow preparation, followed by a decisive guard placement
  and damped settle. Lowering has controlled follow-through rather than an instantaneous pose reset.
- **No new guard startup delay:** the protective shield target must be valid on the same simulation
  step that defense becomes raised. Put anticipation in the supporting body/arm motion while the
  shield is already protective; do not animate an unprotected wind-back while claiming a block.
  A future gameplay wind-up would require a separate, explicit rule change and model tests.
- Reversing raise/lower midway blends from the actual current pose/velocity. Key repeat does not
  restart anticipation. Release/cancel makes defense ineffective immediately even if the visual
  arm is still settling. Forced reset clears the transition according to the existing modal policy.

### Confirmed impact reaction

- Emit a typed, once-only **accepted block** presentation event from the existing successful
  guard branch in `CombatSystem.damage`; include actor/run identity, direction, magnitude and
  contact information available from the hit. Do not infer hits from sparks, mesh overlap or
  predicted attacks, and do not react as a block to invulnerability-only rejection.
- Transfer the visual impulse through shield, forearm, shoulder and chest, with a small knee/
  pelvis brace and tailed-kobold follow-through. Recover toward the current guard target, not a
  stale pre-hit pose. Use stronger/weaker bounded reactions for actual incoming impacts.
- Preserve hand attachment and planted support. Recoil never changes guard eligibility, facing,
  the 120° arc, movement, health or stagger rules, and cannot expose the spear lane while the
  group is authoritatively guarded.
- Bound accumulated reaction energy and event storage. Several blocks in one step combine
  deterministically; repeated rendering cannot replay an event. Front/side/rear misses and
  cancelled attacks must not generate a false shield reaction.

### Phalanx opening and closing

- Add a readable preparatory brace before moving the shield aside, sampled from existing group
  clocks. While guarded, the shield still covers its assigned lane.
- During the existing vulnerable opening, carry the shield out of the spear lane with the hand
  attached and an intentional torso counter-motion. Keep the opening exposed through the existing
  attack interval, then restore guard with a controlled settle at the authoritative boundary.
- Handle interruption, target loss, role death, rapid guard changes and retreat without stale
  opening poses or repeated anticipation. Presentation never extends or shortens vulnerability.

Use existing chart snapshots plus explicit presentation inputs for these sequences. If a separate
presentation lifecycle chart is needed, it owns only pose phases, uses caller-owned ticks and gets
model coverage; it cannot enable or disable blocking independently of the defense/squad charts.

## 7. Feature-sized implementation slices

Each slice uses the repository's test-first → implementation → affected verification → independent
review → commit workflow. A0–A7 are implemented and independently reviewed READY. Later entries
are planned acceptance gates. A7 and its review correction are recorded in the containing delivery.

| ID | Deliverable / primary touchpoints | Test-first and review gate |
| --- | --- | --- |
| **A0 — complete, review READY** | Motion-review baseline, 30-clip migration inventory, development frame/slow playback and joint/contact/proxy overlays. See [recorded baseline](animation-baseline.md). | Four profiles/both kobold roles, 60 camera sequences/856 samples, real input controls, interrupted strike, uncapped drawn contact and grip-proxy defects, 25-actor CPU/allocation/resource baseline. Production smoke confirms development hooks absent. |
| **A1 — complete, review READY** | Typed 20-joint humanoid definitions/profiles, sockets, pose/history buffers, ECS `rigPose` and existing-mesh bindings through a numerical legacy bridge. See [foundation](rig-foundation.md). | Seven pure regressions; 428 browser pose samples match A0 within 2.384e−7. Material/shadow/observation/selection identity, fresh history and resource plateau verified; one final transform writer. 309 everyday tests and affected browsers pass. |
| **A2 — complete, review READY** | Full-body target solver: generalized limb IK, bounded pelvis/spine/shoulder adjustments, feet/hand orientation, priorities and residuals. See [solver contract](rig-solver.md). | 14 new pure tests; 968 temporal FK samples and 300 scaled actual-binding comparisons; 1,210 browser samples across all profiles/roles. Four-pass/16-limb/249-joint/zero-query ceiling; every body correction revalidates all end effectors. Review cleared scale, reporting, limit and singular-continuity blockers. |
| **A3 — complete, review READY** | Live semantic locomotion/grounding for all actor kinds: lurch, crouch, backsteps, jump/landing, slope-aware soles and final corpse/terrain checks. See [grounding contract](rig-grounding.md). | 330 tests; 428 samples across all 30 clips match A0 authority exactly. Final actual sole/plant errors below thresholds; animation, movement16, jump8, production5 pass. Eight selected clips reviewed; repeated-sample and reset/death-channel blockers cleared independently. |
| **A4 — complete, final independent review READY** | Shared action/work/social layers, coordinated hand targets, explicit equipment/cargo frames, solved socket adapters and semantic temporary collapse. See [action contract](rig-actions.md). | 336 tests; 428 samples/all 30 clips with exact A0 authority parity. Actual shaft/torso, scaled cargo and 2,714 death-age checks; affected browsers and production pass. Independent review clears three geometry blockers, complete throw/death envelope and provisional cost thresholds. |
| **A5 — complete, final independent review READY** | Shared 24-joint tailed extension, actual posed-surface/masonry clearance, stable bounded infeasible fallback and settled corpse ownership. See [tail contract](rig-tails.md). | Full360 and final core342 gates; 4,488 tail samples, all-member geometry, 128 neighbor placements, five masonry offsets, prolonged settling/release, first-frame visibility and exact ECS-order replay. Independent review clears all four blockers; accepted investigated CPU band and stable resources. |
| **A6 — complete, final independent review READY** | Shared supporting anticipation, coordinated lowering, constraint-aware reversal, typed accepted-block batches and bounded directional recoil/counter-motion. See [shield contract](rig-shields.md). | Event/motion/live-plan and review-geometry TDD reds; full377/core359; actual shield/body contacts and lane coverage, feasible reversal continuity, moving-stair parity, interruptions/resets and camera replays. Both review blockers independently cleared; gameplay charts unchanged and resources stable. |
| **A7 — complete, final independent review READY** | Semantic-only rig cutover and detached pose/velocity death handoff; see [contract](rig-handoff.md). | Every catalog row uses the rigs; full383/core366, 84 death entries, real landing/support controls, actual joint velocity/rebase/reset checks, 428 A0-identical authority samples, cross-system matrix and root/Pages smoke pass. Landing blocker independently cleared. |

### Definition of full migration

- Player, skeleton, goblin and both kobold roles use the shared humanoid core; all kobolds use its
  tail extension. Remaining species differences are profiles or intentional motion layers.
- Every existing actor animation in section 5 has a reproducible scenario and a verified rig path.
- `actorRendering.ts` becomes composition/application glue rather than the owner of independent
  per-species mesh rotation branches. Social/cargo renderers consume sockets, not hidden limb indices.
- No legacy branch overwrites solved joints, no body/tail secondary layer invalidates high-priority
  contacts, and no rendering callback mutates gameplay state.

## 8. Ragdoll and skeleton-breakup continuation

### A7 handoff contract; P8 physics implementation

P8 is now implemented; see [directional ragdolls](ragdoll-deaths.md) for the selected backend,
seeded variation, actual lifecycle/budgets and current verification. Final independent review is
READY, clearing both structural-contact blockers. The following acceptance contract was its basis.

Use one pose owner per entity/lifecycle:

```text
animated (procedural layers + IK)
  → simulated death (rigid bodies + joints)
  → settled remains (frozen final pose)
```

The rig definition supplies coarse segment/body mappings, joint frames/limits and optional tail
bodies. Capture the last solved pose and its fixed-step linear/angular velocities, rebased to the
actual death transform when necessary. Capture the killing blow's travel/impulse and the actor's
pre-stop motion **before** `stopActor` clears it. Count inherited root velocity exactly once;
teleport/reset deltas must never become a launch impulse.

P8 chooses and proves a physics backend with bounded fixed stepping, useful joint constraints,
static-world contacts, sleep/settle and disposal. A0–A7 do not choose a library or assume an engine
API. If a backend needs WASM or other runtime files, bundle them locally and verify the Pages base.
Use a small articulated body set, not one physical object per decorative voxel.

P8 must deliver exaggerated directional travel of several feet, wall impacts and stair falls.
Physics contacts need suitable wall/tread geometry from world data; a smooth character-navigation
ramp alone does not demonstrate tumbling over visible steps. Living movement stays on its current
motor. Dead bodies cannot push living actors, block routes or impose a speed penalty. Bind settled
corpse surface sampling and observation to the final pose, including relocated remains. Preserve
current hero respawn timing; any transient hero remains need separate bounded ownership.

The physics writer takes over once. Disable animation/IK/tail spring writes for the simulated
body, retain pause/inspection/hidden-tab policies, then sleep/freeze it within a bounded lifecycle.
Verify death during a leap, thrust, block reaction, work and turning; regeneration retires all
bodies, constraints, attachments and pending events. These P8 details refine the existing user
request rather than moving physics into the rig migration.

### P9 skeleton breakup

Implemented, verified and independently reviewed READY. See [the P9 contract](skeleton-breakup.md)
for the eleven-chunk mapping, terrain/observation bounds and measured verification. The following
acceptance contract was its basis.

Use the same death impulse and final pose, but release anatomical bone chunks instead of retaining
an intact skeleton corpse. Skull details stay with the skull; avoid a physics object for each
tiny eye-socket voxel. Pieces fly, collide and settle into non-interactive decoration. Bound active
simulation and retained geometry, preserve once-only death/discovery identity, and clean up per run.
Future roster reanimation must work from explicit logical death identity and a deliberate rebuild
policy, not assume an intact skeleton mesh still lies at the death coordinate.

## 9. Verification and performance gates

### Motion correctness and visual review

Use actual final world-space meshes/sockets as an independent oracle, not just the solver's
intermediate targets. Initial acceptance targets for reachable fixture poses are:

- Final planted sole penetration at most **0.001 world units** into sampled supported surfaces.
- Planted-foot horizontal drift at most **0.02 units** before an explicitly recorded release.
- Required hand/grip error at most **0.01 units**; orientation error at most **1°** where specified.
- Repeated zero-time solves drift at most **0.00001 units**; all transforms remain finite.
- No link-length or authored joint-limit violation beyond documented numerical tolerance.

These are proposed test thresholds, not measured performance or permission to weaken the existing
stronger regressions. Infeasible targets must expose residual/fallback status, not quietly count as
successful contact. Separate legitimate release/flight samples from planted-contact measurements.

Review continuous sequences at **normal speed first**, then slow motion, from gameplay and side
cameras. Include stride handoffs, start/stop/reverse, stairs both ways, rotated corpse edges, moving
attacks, block/release interruptions, phalanx opening/retreat, social/work and tails. Look for weight,
readable silhouette, foot sliding, knee flips, hand separation, mechanical oscillation and abrupt
equipment snaps. Screenshots/contact sheets support this review but do not establish motion quality
by themselves. Record the worst remaining visual error and whether it blocks the slice.

### Bounded cost and cleanup

- A0 uses the real **25 actors** (player plus 24 enemies) with today's rigs/tail stubs; compare the
  same scene after A5 with all twelve articulated tails. Exercise several corpses and relevant
  active action kinds in short, yielding batches.
- Preallocate pose/target/scratch buffers; bound chain lengths, whole-body passes, terrain/obstacle
  queries and presentation-event storage. Avoid per-frame whole-scene matrix preparation.
- Record warm-update mean/p95 CPU time, solve/query counts and allocations against the same A0
  fixture/environment. Set the numerical CPU budget from that baseline before expanding cost;
  operation ceilings are mandatory even if timing appears fast. Software rendering is not a GPU
  benchmark, and this work does not reopen system configuration/driver diagnosis.
- Cold setup and repeated regeneration must plateau in nodes, meshes, caches and event storage;
  no allocating or leaking rigs/equipment/tails on each animation update. Quality presets cannot
  alter gameplay, contacts required for consistent action presentation, or attack timing.

### Commands and delivery discipline

For each implementation slice: focused failing regression first, then the required
`npm run format:check`, `npm run lint`, `npm test`, and `npm run build` on the final code, plus the
affected browser pass. Use existing scripts according to the slice:

`npm test` now selects everyday regressions and full machine state/branch coverage. Broad seed
corpora, exhaustive timing/model paths and long cargo simulations use `npm run test:extended`;
`npm run check:full` runs both groups plus lint/format and is required by CI before publication.
Run that full gate locally when changing those systems/model partitions/test selection, or for
cross-cutting/release checks, rather than once per ordinary animation iteration. The profiling
command is `npm run test:timings`; measurements and selection policy are recorded in README.

- A0–A3: `npm run test:animation`; add movement/jump checks when their adapters change.
- A4: animation plus affected `test:combat`, `test:phalanx`, `test:social`, `test:objective-work`
  and `test:tribute` cases. Prefer selectable focused scenarios to repeating unrelated suites.
- A5–A6: tail/animation captures and affected `test:defense` / `test:phalanx` cases.
- A7: selected cross-system matrix, model coverage via `npm test`, and production root/Pages smoke
  for the migrated runtime. Add discovery/inspection checks when observation/bounds change.

The targeted development suites require a dev server; use their existing `DEMO_URL` support.
Scenario selectors/overlays are implemented in A0; see the baseline for their exact APIs. Keep
rendering-heavy runs sequential, give them deadlines, and close owned browsers/servers in `finally`.
Reviewers reuse trustworthy completed results and add targeted independent probes. Record only
checks actually run; normal commit hooks remain enabled. Publish verified animation slices through
the existing Pages workflow, with a hosted smoke for meaningful release changes.

## 10. Compaction / next-session handoff

1. Read `AGENTS.md`, `README.md`, `docs/README.md`, this roadmap and the current top of
   `docs/implementation-progress.md`; source/tests establish implementation status.
2. Inspect `git status`, staged and unstaged diffs before editing. At this planning checkpoint,
   P7's successful-publication documentation was already staged but uncommitted; preserve it.
   The user's `docs/notes.md` is untracked and must not be overwritten or automatically committed.
3. P7 is live at **https://tmbritton.github.io/the-hollow-crown/**. Source baseline is **`3934e17`**;
   the preceding phalanx feature is **`806a27b`**. Publication run **44745698117** and its hosted
   smoke are recorded in verification/progress; do not redo publishing setup.
4. T2 and **A0–A4** are implemented and independently reviewed READY. Read `docs/animation-baseline.md`,
   `docs/rig-foundation.md`, `docs/rig-solver.md`, `docs/rig-grounding.md` and
    [rig-actions.md](rig-actions.md) and [rig-tails.md](rig-tails.md). A5 is implemented/verified,
    with final independent review READY. A6 shield motion is implemented/verified, with final
    independent review READY. **A7 cutover** is complete and independently reviewed READY.
    P8 and P9 are complete and independently reviewed READY. Keep every catalog row in the
   migration checklist; a walking hero alone
   is not completion of the rig conversion.
5. The user scheduled [CPU0–CPU7](cpu-performance-plan.md) next on **2026-11-21**. Begin with CPU0's
   fresh post-P9 measurement baseline; retain the completed rig, handoff and scattered-remains
   contracts through optimization. EF0–EF4 follow CPU7 before procedural-feature expansion.

### Reference and continuity

The existing animation reference remains [Animation Bootcamp: An Indie Approach to Procedural
Animation](https://www.youtube.com/watch?v=LNidsMesxSE). The optional local auto-caption transcript
is `ref/procedural-animation-bootcamp-transcript.md` (ignored and possibly absent in a fresh clone).
Its motion-driven cadence, layered curves, springs, IK and animation/physics handoff inform the
approach; this roadmap's architecture and acceptance thresholds are project decisions.
