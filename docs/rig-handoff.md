# A7 — rig cutover and death handoff

**2026-11-21. Implemented and verified; final independent review READY.**
This completed the animation migration after [A6 shields](rig-shields.md). At A7 delivery the
age-sampled collapse remained active. [P8](ragdoll-deaths.md) now consumes the handoff for physical
enemy deaths; immediate hero respawn is preserved.

## Single pose owner

All 30 catalog rows use semantic poses, coordinated contacts/grips, constrained secondary motion and
the final binding. `src/rigs/legacy.ts`, `sampleLegacy`, mesh-to-pose capture, legacy Euler hints and
render-component blend aliases are removed. `actorRendering.ts` composes numerical layers; it never
writes anatomical scene nodes. Heading/cape presentation belongs to `rigPose`. Geometry construction
and actual-mesh oracles retain render references; live layers use semantic joints and sockets.
`LocomotionPose` remains a pure authored curve/layer input, not a mesh adapter.

`binding.reset(position?, heading?)` restores semantic rest transforms and clears contacts, action/
shield/tail state and history. The old foot-placement algorithm is solely a historical regression
oracle in `tests/historical-foot-placement.ts`; production uses `rigs/grounding.ts`. Bindings retain
existing meshes, parents, materials, shadow/selection registrations and socket frames.

## Published history and snapshot contract

`rigPose.history: PoseHistory` owns one additional preallocated world buffer. `begin(dt)` supplies
the step duration; the final body application (or final constrained tail application) publishes it.
Identical zero-time reads retain history; changed zero-time poses reset the derivative rather than
inventing an impulse. Reset/first publication has zero derivatives. Root disposal retires history
and removes binding/handoff components; further application/snapshot reads reject retirement.

`history.snapshot(rebase?)` creates a detached, frozen `PoseSnapshot` on demand:

- Shared immutable definition; final column-major affine world matrices, root basis in the first
  sixteen values, and sampled duration.
- World linear velocities at each joint origin (units/s), and world-axis angular velocities (rad/s).
  Angular velocity uses the shortest quaternion delta after forward-first Gram–Schmidt scale/shear
  removal. Authored visual scale remains in the pose matrices.
- Eleven coarse body records, or fifteen with a tail: semantic joint, nearest mapped ancestor body,
  current center/joint anchor, unit quaternion, stable authored dimensions, center linear and angular
  velocity. Definitions retain topology, rest frames, axes and limits for the later backend.

Rebasing rigidly rotates/translates the last solved pose to the actual death position/heading.
Joint/body inherited velocity is `rotated(sampled velocity − sampled root velocity) + pre-stop motor
velocity`: root translation is counted once while articulation/turning remain. Extraction happens
only for snapshot requests, avoiding a per-frame quaternion pass.

## Lethal boundary

`CombatSystem.damage` captures `Components.deathHandoff` **before `stopActor`** on an accepted lethal
hit, then installs it once after cancellation. It carries exact run/target/source references, time,
damage magnitude, kind, normalized 3D incoming travel when available, death position/heading,
pre-stop velocity and detached pose. Swept projectiles supply vertical travel. Hazards have no
invented direction. Headless simulations retain metadata with `pose: null`. Nonlethal, blocked,
invulnerable and duplicate death hits do not create another handoff.

Airborne inheritance uses pre-stop ballistic velocity; grounded vertical inheritance uses the current
motor-step support derivative (`movement.supportVelocity`), never the rendered root's jump-inclusive
history. The motor samples it from actual support change, clears it on locked/stationary steps, and
stop/teleport clears it. Reset/respawn and disposal retire the component. Later collapse cannot mutate
the snapshot. P8 explicitly replaces the procedural writer before simulating bodies and supplies
impulse tuning, collision/settling and bounded resource ownership. A7 itself added no physics dependency.

## CPU6b stage ownership

The binding's numerical body stage finishes action sockets using complete joint matrices; its
draw stage writes body nodes, equipment visibility and attachment transforms. During living
grounding it synchronously copies local TRS (including the root), local matrices and globals from
its own same-definition solver. It never borrows solver arrays or copies solver history. Reset,
authored edits and collapse still evaluate the binding's own locals.
These stages still run together on each fixed tick. A tailed actor publishes history only after
its final constrained tail. Corpse physics owns its exact entry and subsequent affine publications.

| Read | Time and owner |
| --- | --- |
| Lethal handoff and witness | Damage uses the previous completed pose, rebased to the event transform, and captures motion before stopping the actor. Drawn geometry is already current for the event camera. |
| Corpse surfaces, living equipment and cargo, tail neighbors | Fixed tick; publish corpse contacts before feet, body and cargo before tail clearance, and retain final pair validation. |
| Shadow list, observation, inspection and picking | Read the already-written last completed pose. A display with zero ticks does not write rig poses, consume reactions or publish history. |

There are no distance/visibility tiers, deadlines or pending draw records in the retained path.
See the [retained subset verification](../VERIFICATION.md#cpu6b--retained-full-rate-subset) and
the separate [historical trial](../VERIFICATION.md#cpu6b--fixed-step-presentation-trial).

## Verification

```sh
node --test tests/rig-handoff.test.ts tests/rig-bindings.test.ts
npm run test:rig:handoff       # running dev server required
npm run test:rig:handoff:landing
npm run test:rig
npm run check:full
npm run build && npm run test:production
npm run build:pages
DEMO_URL=http://localhost:4187/the-hollow-crown/ npm run test:production
```

The handoff suite checks 84 lethal entry points across all 28 living catalog rows against drawn
hand/foot/tail positions and velocities, repeats, death rebasing, once-only inheritance, detachment
and reset. The two death rows retain collapse regressions. Cross-system, cost/resource and sampled
visual evidence is in [VERIFICATION.md](../VERIFICATION.md). Initial independent review found a
landing/support-channel defect; the persisted real-melee/lava red and both stair-direction controls
now pass. Independent follow-up cleared the correction before delivery.
