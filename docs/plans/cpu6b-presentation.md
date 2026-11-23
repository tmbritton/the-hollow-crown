# CPU6b — separate presentation solving from simulation frequency

- **Task source**: [CPU performance plan](../cpu-performance-plan.md), lines 455–510 (task and gates), 123–146 (contracts), 196–222 and 512–560 (measurement and verification).
- **Epic / Story**: CPU performance / CPU6b, after CPU6a.
- **Status**: round 2 repair candidate. Full-rate publication remains; see the
  [verification record](../../VERIFICATION.md#cpu6b--round-2-profiler-attribution-and-hardware-gate) for measured
  versus outstanding gates. No tier scheduler has been accepted.
- **Branch**: `main`, baseline `96849ae`.

## Goal

When a displayed frame contains several simulation ticks, pay for the visible result rather than repeatedly drawing intermediate poses nobody sees. A shield must still react to both of two consecutive blocks, and a character killed between frames must fall from the same pose with the same momentum as at one tick per frame. Distance may change presentation cost, never what inhabitants do or what the player learns.

## Acceptance criteria

- [ ] With every actor at full detail, the stage split alone matches the baseline. With scheduling enabled, equal tick-indexed inputs reproduce routes, transforms, actions, impacts/releases, damage, objectives, respawns and death admission/seed order at 0/1/multiple ticks per display. No wall clock, quality setting or camera tier selects gameplay results.
- [ ] Accepted blocks integrate exactly once on their simulation timestamp; zero-tick displays consume none. Protective frame, lowering, re-raise position/velocity, phalanx opening and tail recoil meet the existing shield/clearance gates.
- [ ] At every lethal slot in a catch-up batch, compare completed-pose matrices, adjacent-step velocities, exact entry publication, physical trajectories, dwell/settle tick, final contacts, attribution and retirement to the single-step oracle. Active articulated and separated deaths lose no steps or terrain updates. Hero respawns on the same tick without debris.
- [ ] Visible/near/player/inspected actors, shadow casters and required neighbors have current drawn poses before use. Matched-time sequences pass existing sole, grip, shield, tail and handoff tolerances without return-frame snapping, sliding or altered attack cadence. Paused samples are idempotent.
- [ ] Equivalent workload reports show fewer redundant bindings and identify which solves, if any, were safely avoided. Gains survive whole-frame measurement beyond run spread; do not count migrated work as saved. Record unmet targets. Document stage ownership, tier bounds and tested model partitions before acceptance.

## Test plan (write these first)

Characterize `96849ae` first. Keep the old one-tick/full-detail path as the comparison in the fixture until the staged path passes. Red checks below target the new contract; existing parity assertions should already pass on the oracle.

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Clock partitions | `tests/presentation-schedule.test.ts` (new) | Replay 120 ticks as `[1]`, `[0,1]`, `[2]`, `[4]` and repeating `[0,1,3,0,4]`; same completed-tick trace, zero extra advances on display. Compare both at shared displayed ticks and at each event. | Red: no separate tick/publication interface. |
| Feedback and lethal slots | `tests/block-feedback.test.ts`, `tests/rig-handoff.test.ts`, `tests/cpu-regressions-browser.ts` | For slots 1–4 in four-step batches replay same-time and successive accepted blocks, then real lethal damage in the selected slot (start preceding blocks in prior batch where necessary). Repeat on/off camera, landing and opening/withdrawal. Compare shield spring state, history, killer/witness and exact seeded entry before physical motion. | Red for naive final-tick-only advancement; lost reactions or stale history. |
| Physics and geometry consumers | `tests/ragdoll.test.ts`, `tests/skeleton-breakup.test.ts`, `tests/observation.test.ts`, `tests/cpu-regressions-browser.ts` | Compare ordinary and scattered deaths through active→settled, off-root same-piece discovery/occlusion, corpse crossing and final release of resources; reverse ECS insertion for living tail/contact fixtures. | Red if display flush is the only publication point. |
| Tier transitions and lifecycle | `tests/presentation-schedule.test.ts`, `tests/models/cases.ts` | Cross both hysteresis boundaries, refresh deadline, rotate/zoom on a zero-tick frame, inspect a deferred actor, teleport, remove/replace same ID, regenerate three times. No stale publication or accumulated pause debt. | Red: no deadline, promotion or retirement contract. |
| Actually drawn cadence and work | `tests/cpu-regressions-browser.ts`, `tests/cpu-profile.ts` | Drive real tick/render stages with controlled batches plus real RAF Low/High; collect mesh sequences and per-stage counts. Four eligible ticks in one display require at most one final draw publication per eligible actor, apart from separately identified consumer refreshes. | Red: `binding.apply` runs each living tick. |

## Design

1. **Split first; keep frequency unchanged.** `main.ts:721–737` currently calls `animateActors` after objective work and hero respawn. Preserve the accumulator and its 80 ms cap (`main.ts:1065–1092`). Keep doors → player pursuit/movement → combat/hazards → objective commit → respawn. At tick end retain `actorRendering.ts:70–120` ordering: death owner advance once at 1/60, synthetic collapse, then publish current corpse contacts before living feet. Never replace N calls with one N/60 call: ragdoll advance clamps its input. Keep exact entry before first integration, active matrices, per-piece bounds, quiet time, overflow and final frozen publication on their existing paths.
2. **Separate advancing, solving and writing.** Advance heading, stride, action clocks, landing impulses, equipment/feedback, springs and stateful foot/tail dynamics with existing single-step inputs and subdivisions. No new dt from the display loop. Separate numerical completed poses/history from Babylon node writes in `rigs/bindings.ts` (today body/tail apply also finalize history). Complete history once after the final semantic tail pose, not once per write. Retain adjacent numerical solves for every actor that could die; retain full apply where a solver, equipment offset, detached shape capture or contact actually needs drawn matrices. Keep extraction on demand. Only defer a solve proven stateless from completed inputs or reuse a proven unchanged result; do not approximate intermediate history. Demonstrate parity with unconditional solve/apply before enabling either optimization.
3. **Define reads by time.** In accepted damage, before cancellation, use the last completed numerical pose rebased to the event transform; materialize required draw/shape frames without advancing history. Inherit motor, support or ballistic velocity exactly once. Witness at damage time against the camera and coherent geometry available to the baseline at that event, never the next display camera. Pin release/impact sockets at their existing event boundary without moving the attack clock. Publish the final settled affine surfaces before foot sampling; publish body/equipment and carried crate before stable-ID tail solving and final unordered pair validation. In `renderUpdate`, resolve camera/inspection first, flush demanded geometry **before** shadow bounds, UI observation, remains discovery, picking or draw. A pick/inspection outside the loop must also request current geometry before reading it. Keep player and camera tests on the same scattered piece.
4. **Tier only the remaining presentation work.** Use conservative current envelopes (including weapon, cargo and shadow reach), not last-frame active meshes. Unknown layout, ambiguous visibility, event-critical actors and the CPU6a contact dependency set default to full. Promote immediately; proposed demotion only after four consecutive completed ticks outside the expanded full-detail envelope. Distant actors may defer pure visual solves/writes to the final display sample with a proposed maximum age of four simulation ticks (flush at deadline even without a display). Pin margins and test both sides against the actual camera/shadow volumes. Refresh synchronously on re-entry, inspection or demanded read even on zero-tick frames. Deduplicate by completed revision, not frame count. Do not run springs twice on a promotion.

### State model and adapters

Run-owned scheduling records keyed by entity **and binding identity** carry tier, last completed/published revision and outside count. Full + sustained exclusion → deferred; deferred + demand → full and publish; deadline → refresh without promotion; reset → invalidate revisions/history; retirement → discard. A display event may materialize, never advance. Use caller-owned tick events, pure eligibility guards and explicit write requests executed by the existing rig adapter. If expressed as a statechart use the synchronous project adapter and cover every exported state/guard in the model suite. `main.ts` composes camera/shadow demand and tick/display calls; combat remains independent of Babylon scheduling policy.

### Alternatives rejected

- Move all animation after catch-up or scale spring/physics dt: discards feedback and intermediate contacts and corrupts the lethal boundary.
- Derive velocities from sparse display frames or replay an unbounded queue on death: wrong denominator or a new lethal hitch. Prefer fewer skipped solves to an unverifiable handoff.
- Cull by root frustum or quality alone: misses shadow-only geometry, carried equipment, neighboring tails and off-root bones.

## File changes (expected during implementation)

| File | Change | Why |
| --- | --- | --- |
| `src/main.ts`, `src/actorRendering.ts` | Split fixed advancement/consumer preparation from final publication; wire display and debug stepping through the same boundaries. | Actual accumulator and actor ordering live here. |
| `src/presentationSchedule.ts` (new), `src/rigs/bindings.ts`, `src/rigs/history.ts` | Bounded eligibility/revision policy; separate semantic completion from eligible writes. | Allow a display refresh without publishing another history sample. |
| `src/deathHandoff.ts`, `src/deathPhysics.ts`, `src/corpseRendering.ts`, `src/observation.ts` | Audit event reads and add explicit synchronous preparation only where needed. | Keep physical ownership, contact and knowledge boundaries intact. |
| `src/cpuMetrics.ts`, tests listed above | Development-only stage counters, deterministic replay and capture evidence. | Distinguish eliminated work from work moved into event handlers. |
| `README.md`, `docs/rig-handoff.md`, `tests/models/cases.ts`, `VERIFICATION.md` | Document scheduling/consumer table, lifecycle partitions and measured results. | Architecture and model coverage are acceptance gates, not later cleanup. |

## Edge cases and failure modes

- No ticks, long hidden/menu pause or inspection → no simulation debt, mailbox consumption, repeated history or physics. Inspection camera may sample a different actor. Visible blur clears movement, not ongoing world time.
- Teleport/hero respawn → invalidate old transforms and derivatives before re-use. Disposal/replacement → no surviving subscriptions, records or late writes. Active/frozen islands and the synthetic no-handoff path are distinct populations.
- Stationary shield, released javelin, transferred cargo or disabled tail → motor displacement is not a dirty flag. Force dependency publication, including withdrawal of old surfaces. If demand cannot be bounded conservatively, run full detail.

## Verification

Gate commands; completed results are recorded in `VERIFICATION.md`. Use Node 22.18+ and run browser jobs serially with `npm run dev` in a separate terminal.

```sh
node --test tests/presentation-schedule.test.ts tests/block-feedback.test.ts tests/rig-handoff.test.ts tests/rig-bindings.test.ts tests/rig-shield.test.ts tests/ragdoll.test.ts tests/skeleton-breakup.test.ts tests/observation.test.ts
npm run test:models && npm run typecheck && npm run format:check && npm run lint && npm test
npm run check:full
for s in cpu cpu:regressions rig rig:solver rig:actions rig:tails rig:tails:clearance rig:shield rig:shield:transitions animation defense social rig:handoff rig:handoff:landing ragdoll ragdoll:contacts skeleton:breakup discoveries inspection jump phalanx combat; do npm run "test:$s" || exit 1; done
BROWSER=firefox npm run test:combat && BROWSER=firefox npm run test:social
CPU_CASES=all CPU_REPEATS=3 CPU_LABEL=cpu6b-matrix npm run profile:cpu
CPU_GPU=hardware CPU_CASES=live-low,live-high CPU_MODES=off,coarse CPU_LABEL=cpu6b-live npm run profile:cpu
node tests/cpu6b-visual-browser.ts
npm run build && npm run test:cpu:production && npm run test:production
npm run build:pages && DEMO_URL=http://localhost:4187/the-hollow-crown/ npm run test:production
```

**Workload evidence.** Alternate baseline/candidate order, label outputs separately, record revision/source hash, renderer/host/load, camera path, quality, seed, warmup, tick counts and populations. Start with `MOURNING-731`, 120 warmup/240 measured ticks at entrance/stable and the later 361–660 window. Include shield/phalanx, cargo, accepted melee/projectile/hazard deaths, settled crossing and separately labelled 24-enemy burst. Record tier population, fixed advances, living solves, bindings, deadlines and event refreshes by reason **per tick and per displayed frame**, physics substeps, terrain work and resource peaks/plateaus. Fingerprint events, poses and lifecycle with tracing on/off. Time cold admission, active-only, frozen and whole scenario separately. Report p50/p95/max and spread for tick, presentation and whole frame; label inclusive timers. One presentation per synthetic tick is not evidence of real catch-up savings.

For the A/B, build `96849ae` in a detached worktree and the candidate in this
worktree. In each, run `vite build --config <absolute path to tests/cpu6b-bench.config.ts>
--outDir <local benchmark directory>` using the pinned Vite, then run
`node tests/cpu6b-bench.ts <baseline directory> <candidate directory> <label>` from the candidate.
This deliberately exposes the existing test frame driver in both **local benchmark builds** only.
Do not deploy them. Run the regular root/Pages production smoke on ordinary builds instead.
Round 2 defaults to four paired repeats per quality/window (AB/BA/AB/BA), 384 displayed
frames and 672 measured ticks per build visit. `CPU_WINDOWS=low-120 CPU_REPEATS=2 CPU_FRAMES=240`
selects the early Low screening run for an individual ablation. Run visits serially without
test suites or builds in the background. The window numbers are warmup ticks; the report
includes raw samples for narrower slices. Read `grounding.solve` as part of `grounding`;
transfer, action-frame completion and body draw are separate. Tail clearance, tail writes and
history are not charged to the living body draw subtotal.

**Visual cadence evidence.** Save matched-time mesh samples and consecutive displayed frames, not just endpoint screenshots: compare single-step vs grouped frames at 30/60/120 Hz and mixed cadence. Inspect planted soles, grips, shield projection and reversal, tail clearance, weapon release and airborne→landing→death, including the last hidden and first visible/inspection sample after camera rotation. Compare Low/High with identical inputs. Keep captures and reports in ignored `test-results/`; link actual findings in the implementation closeout. Software rendering is diagnostic; if hardware is unavailable leave the hardware gate pending.

## Risks and rollout

Land parity tests and full-rate stage separation first. Enable final-state binding next, then tier eligibility one dependency class at a time. Reject a class if parity, work bounds or visual checks fail; keep its full-rate path and report the cost. If no eligible work produces a material benefit, report the gate unmet rather than weakening history or physics. Obtain independent review of the verified implementation and follow up on findings before declaring CPU6b ready.

### Round 1 implementation boundary

The write-only trial was rejected. The round 1 candidate transfers the living grounding solver's
completed local and global matrices into binding-owned storage, and avoids redundant body/limb
calculations within the solve. No solving, contact refinement, history sample, mesh write or
physics step moves to the display clock. No solve is reused merely because an actor is offscreen.
Pose history remains independently owned, including the completed tail and both adjacent samples.
The solver falls back to full traversals for unrecognized definitions; the binding still evaluates
authored/reset/collapse locals directly. See the [ownership table](../rig-handoff.md#cpu6b-stage-ownership).

## Out of scope

No commits. CPU7 integrated FPS acceptance, GPU changes, new assets, gameplay/AI throttling, lower physics budgets, new routing and reopening CPU5/CPU6a optimizations are not CPU6b work.
