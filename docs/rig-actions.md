# A4 — action layers and solved equipment attachments

**2026-11-20. Implemented and verified; final independent review READY.**
This follows [A3 grounding](rig-grounding.md). A5 articulated tails is the next feature.
A6 shield anticipation/reaction and A7 compatibility removal remain planned.

## Ownership

`rigPose.actions` owns `ActionRig`: attack/social/work blend samples, explicit equipment intent,
two reusable hand targets, eight reusable attachment matrices, and the temporary death capture.
`rig.attackBlend`, `attackPose`, `socialBlend` and `socialPose` remain compatibility accessors to
that same state. No new gameplay chart, independent work timer or presentation event queue is added.

`actorRendering.ts` composes measured locomotion, these action layers, jump/landing and secondary
motion. `GroundedLocomotion` plans soles and asks the action layer for grips before its existing
coordinated solve. Required grips and support feet share the **four-pass / 16-limb-solve** budget.
The retained-input key includes action mode, opening, extension, pitch and release, so a release
at an otherwise identical clock cannot reuse an attached hand. Repeated samples read the completed
pose; final application does not advance action or work time.

`RigBinding.attach()` registers a root-parented node against a named final frame. `FrameAttachment`
applies a fixed local offset using the already-computed inverse root. Geometry, materials, shadow
registration and scene ownership remain procedural. Social props register their drawn surfaces in
the actor's existing observation array. Cargo's run-owned renderer reads the owner's cargo frame;
it does not acquire ownership or complete deliveries through a pose.

## Frame and grip policy

| Presentation | Frame owner and contact policy |
| --- | --- |
| Sword / ordinary enemy weapon | Final right-hand socket owns the handle; existing impact-clock curves and moving lower-body gait remain authoritative inputs. Interrupted upper-body samples fade from the last action pose. |
| Crossbow | One action-owned aim/recoil frame, explicit trigger and support grips. Barrel follows the actor-facing line; recoil samples the existing attack curve. The existing gameplay projectile origin and release are unchanged. |
| Guard / phalanx opening | One shield frame and its actual hand strap. The gate shield covers the existing lane, moves aside on the existing opening clock and restores on the existing guard boundary. Instant defense is preserved. |
| Long spear | One shaft frame, two fixed grips and a side-on torso with counterturned head. Bounded fore/aft lunge centres the shoulders between grips without pushing the torso through the shaft. The flat thrust retains the unscaled right-hand lane `(0.4, 0.85, 0.1)` plus extension; the 45° ready pose follows visual lift and centres over the feet. |
| Javelin | Single throwing grip; support hand explicitly releases. `Swing.resolved` releases the throwing hand and hides the held javelin on the actual release step. Ordinary projectile rendering owns flight. |
| Cards / pipe | Final right-hand socket; smoking supplies a mouth-height hand target. Puffs originate at the drawn ember. Card gestures retain their social phase. |
| Hacky sack | Existing pass/kick clocks and explicit kicking-foot release; ball endpoints now use solved right-foot frames. |
| Work | Existing `work.elapsed` samples the shared work layer, including packing/unloading. Equipment is stowed during work and social activity. Real work eligibility, interruption and completion remain in O2. |
| Carried tribute | An action-owned forward crate frame with two side grips. During actual threat/attack/guard intent, cargo is explicitly slung to the solved back position with an orthonormalized rigid frame, freeing combat hands without inheriting unrenderable world shear. This releases carry grips without dropping, recovering or delivering logical cargo. Unloading still holds carried cargo with both hands. |
| Stowed equipment | Solved chest/back socket, including crossbows and ordinary weapons as well as squad role equipment. |

Action origins use unscaled gameplay units. Attachment orientation/shape inherits root scale
**before** its local rotation, matching the actual mesh hierarchy. A uniform world-space frame
beneath a nonuniform root would require shear that one TRS node cannot represent. Required hand
orientations use the frame's explicitly orthonormalized basis; final mesh grips are checked
independently of solver residuals.

The complete action/death-entry sweep reaches **4.666063 root-normalized units**, including
post-release hand poses that re-equip the long spear on death. The conservative broad-phase
observation envelope is **4.8**, with all enabled drawn corners checked; living collision,
selection proxies, navigation footprints and gameplay attack ranges do not expand.

## Collapse and reset

The temporary collapse now captures the solved semantic local pose once and samples toward the
existing `deathPose(age)` collapse using **corpse age**, rather than repeatedly blending mesh Euler
values. Initial local pose/scale and eased facing are retained, repeated inspection is idempotent,
and settled anatomy is exact at 0.62 seconds. Directly installed already-settled corpses use their
current authoritative heading instead of a stale earlier pose. The physical ragdoll handoff is P8.
Spearman collapse retains the captured pose at age zero, then turns the wrist outward and back while
the arm settles at a supported angle. The shaft remains attached and above the floor; only the
changed wrist FK needs recomputation after body FK. All 55 throw start/release/recovery entry frames
are checked across the complete temporary collapse.

Reset clears action targets/blends/death capture, resets anatomical translations, rotations and
scales, restores drawn equipment and hides stowed/throwing equipment. Clearing scale also removes
decomposition roundoff that previously leaked into the next camera replay. The numerical legacy
bridge remains for explicit reset/debug compatibility and authored Euler hints until A7; it no
longer owns action attachment transforms or the death layer.

## Verification and cost

- **336 everyday tests**, typecheck, lint, format and production build pass. Six new action tests
  include 610 multi-profile grip/support samples, 183 actual Babylon matrix comparisons under
  nonuniform scale, same-clock release, work/attack interruption, cargo/guard handoff and
  frame-independent collapse. The existing reset regression now covers scale roundoff.
- `test:rig`: **428 samples / all 30 clips**, exact A0 gameplay/action-clock parity. Maximum actual
  required grip error **2.575e−6**, final sole penetration **2.554e−7**, plant drift **4.316e−6**.
  Mesh/material/registration identity, selection and three-regeneration plateau pass.
- `test:rig:actions`: **252** actual thrust/uphill/downhill frames with zero intersections against
  the torso OBB expanded by 0.05; grip maximum **0.006815** and final sole penetration **0.000535**.
  Both-role cargo handoffs (**144 frames**) preserve actual matrices/corners within **1.208e−7**.
  **2,714** corpse-age samples preserve initial poses, repeated reads, required primary attachment,
  floor clearance and observation bounds. Independent follow-up clears all three geometry blockers.
- Animation, combat **15**, defense **9**, phalanx **8**, social **15**, tribute **9**, objective
  work **17**, discoveries **17**, and local root production **5** browser checks pass.
- **18 clips / 36 camera replays**, 520 sampled poses; exact replay equality. Normal/quarter-speed
  viewer playback exercised, five temporal side sheets and relevant combat/formation/carry/production
  captures inspected. After review fixes, controls plus thrust/throw/opening were refreshed in six
  camera replays; corrected impact/settled side and gameplay captures were also inspected. The
  review is 60 Hz simulation sampled at 10 Hz, not every-frame motion review.
- **2,334 meshes / 447 nodes / 28 materials / 4 textures / 5,719 entities** plateau. Compared with
  A3 this adds 43 procedural meshes and 50 attachment mounts, allocated at construction, not per tick.
  The 48 social props now belong to actor render arrays instead of separate render-wrapper entities.
- Final integrated 25-rig/four-corpse workload: **2.368ms mean / 3.00ms p95**, 60 warmup +240
  measured updates, maximum **882 terrain lookups/update**. Pre-review **2.943/4.00ms** triggered
  investigation against A3's 2.2/3.4ms thresholds. The bounded instrumented trace measured
  **4.59/6.90ms** and is not a comparable benchmark. Redundant socket/inverse-root work was removed;
  geometry corrections also changed constraint demand. Independent corrected measurement was
  **2.034/2.70ms**. Timing variance prevents a causal speedup claim. The reviewer accepts provisional
  next-slice investigation thresholds **3.2/4.5ms**, retaining hard solve/query ceilings
  **4 / 16 / 249 / 66 / 74**.

These are Chromium/SwiftShader CPU fixtures, not hardware FPS. Detailed red/fix evidence and
qualifications are in [VERIFICATION.md](../VERIFICATION.md). Remaining visible discontinuities are
the discrete equipment swaps and instant guard placement; A6 adds guard preparation/settling.
The rigid kobold tail is the next feature-sized art/animation change in A5.
