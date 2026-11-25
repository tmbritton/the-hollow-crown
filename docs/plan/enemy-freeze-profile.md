# Manual enemy freeze comparison

- **Task source**: Ad-hoc user request, “three manual playtest variants … with practical profiling”
- **Epic / Story**: ad-hoc
- **Status**: proposed
- **Branch**: `experiment/enemy-freeze-profile`, base `main` at `0b4b9e1`

## Goal

Let a player compare three fresh visits to the same dungeon entrance: normal enemies, enemies making no new decisions, and enemies acting normally with their living poses held still. Show enough on-screen evidence to distinguish a change in frame cadence from a change in the amount of enemy work per frame. This is a playable diagnostic, not a performance fix.

## Acceptance criteria

- [ ] Three copyable production links work under the Pages base without `debug`, a console, special build or Inspector. All start at the same seed, spawn, population, camera, quality and original production picker. Control uses both ordinary update paths with the same probes as the treatments.
- [ ] Bare, invalid and practice URLs retain ordinary behavior, including random-on-refresh semantics; no profile HUD, sample allocation, per-actor timing calls, persisted toggle or public debug API.
- [ ] Decisions off leaves enemies present, pickable, blocking, damageable and animated. Poses off leaves decisions, movement, combat and objective outcomes running; living enemy limbs stay still while roots track the actors. Hero, visibility and death presentation continue in both.
- [ ] A completed HUD result identifies variant, actual seed, window, frame count, HUD FPS, raw frame interval median/p95 in ms, and mean fixed ticks, measured decision/rig CPU ms and work counts **per rendered frame**, including zero-tick frames. No GPU attribution or pass/fail speed threshold.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Launch policy | `tests/enemy-freeze-profile.test.ts` | Exact allowlist, duplicate/unknown rejection, practice exclusion, pinned profile reload vs ordinary reload | Fail: no launch policy |
| Window and denominator | same | Fake timestamps across ready, boundary, pause, restart and disposal; 0/1/multiple ticks, 140 ms raw stall despite 80 ms sim cap, known quantiles, non-nested CPU sums and actual invocation counts; every transition including invalid events | Fail: no collector |
| Combat boundary | `tests/enemy-freeze-combat.test.ts` | Same seeded fixture: control and poses match ordinary tick snapshots; decisions suppress solo/squad/reactive intents but not player pursuit, an already launched projectile, hit/death or corpse aging | Fail: no selective gate |
| Drawn pose boundary | `tests/enemy-freeze-browser.ts` (dev fixture) | Step identical inputs via existing dev harness. Compare actor transforms, HP, targets, objective state at equal ticks in control/poses; compare drawn joint locals and root world position/yaw on a moving enemy. Exercise hide/reveal, picking, player animation, kill while frozen, handoff/settled remains and regeneration. Decisions fixture verifies live rig updates and no autonomous actions | Fail: treatment indistinguishable from control |
| Public links | same script (production fixture) | Open three fresh built URLs, read actual HUD and completed windows, assert equal seed/settings, finite ordered intervals, positive work in control and zero only for suppressed category, player input still works; bare/invalid URL and no `window.__dungeon` even with `debug`. Never assert FPS improves | Fail: no panel or results |

## Design

Use one query parameter and one seed constant. Publish these links in the README when implemented: [control](https://tmbritton.github.io/the-hollow-crown/?enemyProfile=control&seed=MOURNING-731), [freeze decisions](https://tmbritton.github.io/the-hollow-crown/?enemyProfile=decisions&seed=MOURNING-731), [freeze poses](https://tmbritton.github.io/the-hollow-crown/?enemyProfile=poses&seed=MOURNING-731). Only the recognized dungeon opt-in pins `MOURNING-731`, including reload. Keep the picker, view preset and pointer event path unchanged. A menu request for another world exits the experiment rather than silently reporting it under the pinned label.

1. **Decision gate.** In `CombatSystem.update`, separate `updateSquads` and formation intent creation, brain think/perception, ENGAGE/effect selection, AI routes/social choices and autonomous movement requests from shared resolution. Gate at the actual decision producers, including immediate squad alerts/replans from damage; do not merely stop think timers. Keep the normal motor, including deceleration, support, jumps and collision publication. Continue accepted routes (including pending searches) without initiating replacement searches, and resolve already committed door interactions, swing impacts and projectiles. Suppress new autonomous choices, not objective clocks or the commit boundary. Keep health, cooldowns, particles, death notifications, player movement and pursuit in their original order. No global early return from `tick` or `combat.update`.
2. **Pose gate.** `animateActors` runs per fixed tick, not per render callback. Initialize each living enemy once to a valid drawn pose before sampling. Hold local joints, skip living locomotion/layering, grounding/IK, local binding writes, tail demand/solve and pair checks for held tails. Keep the root and equipment visibility live. A logical social foot query rebases just the requested point, and a carried crate rides in a root-relative socket without solving a grip. At lethality rebase held joint and body transforms to authoritative elevation and heading; seed velocities from motor translation and shortest-arc root yaw, with no relative limb velocity. Keep hero pose passes, carried cargo, health bars, corpse contact publication, collapse, ragdolls and settled bodies outside the gate. Never disable an entire mesh tree to simulate a frozen pose. Test the drawn result, not just the skipped call count.
3. **Measure the work actually bypassed.** In each rendered callback start a frame tally; increment ticks at actual `tick(1/60)` execution. Time disjoint synchronous decision blocks (squad pass and individual brain/intent evaluations) and enemy-only living rig blocks: skipped history/heading prep, pose computation, local writes/history publication, and tail work. Count squad evaluations, individual evaluations and living actor poses updated separately; count a pose once per actor/tick, not once per joint/pass. Exclude shared movement resolution, root publication and visibility writes (even in the live adapter), player, initialization and death work. Verify these boundaries at `animateActors` and the real binding with injected time. Do not charge nested think calls twice. Sum across all ticks within a frame, then divide window totals by sampled frames, not ticks. Frame intervals measure cadence; CPU slices measure elapsed main-thread time around named code only.
4. **Window.** Use existing render-loop `now` before dt clamping or simulation speed scaling. First eligible callback anchors warmup; after 3 real seconds anchor a fresh sample at that callback. Collect complete start-to-start intervals through the first callback at or after 10 seconds of sampling. Pair each interval with the completed work tally from its starting callback. Snapshot the existing `engine.getFps()` HUD reading separately. Sort raw intervals once at completion; median averages middle values for even N, p95 uses nearest rank. Keep bounded storage (e.g. 16,384 frames; invalidate on overflow, never truncate silently). Render progress/result at existing HUD cadence, not per enemy. Keep final result readable while play continues.

### State model

Off has no session. For an opted-in scene use a pure tagged sampling state: `waiting`, `warmup(anchor)`, `sampling(anchor, totals, intervals)`, `complete(result)`. Eligible frame in waiting starts warmup; warmup frames below threshold remain there, crossing starts sampling; sampling frames append the previous completed frame and either remain or publish once. Complete ignores further frames by design. Ineligible frame/blur/hidden/menu/inspection before completion discards partial data and returns to waiting. World disposal from any state discards session; fresh authorized generation starts waiting. Invalid timestamps/overflow discard the partial window with a visible retry reason. Reject stale scene events. Keep this reducer local to the diagnostic, not a new gameplay chart.

### Ports and adapters

`main.ts` parses URL input once, owns the scene session and supplies the browser monotonic clock, existing engine FPS and frame eligibility. Combat/render code receives immutable mode and optional narrow work recorder; neither reads the URL nor writes DOM. Pure reducer consumes frame DTOs and returns progress/result; a DOM adapter presents them. Inject fake times/tallies in Node. No replacement render loop or dependency on DEV `cpuProfile`/`cpuTiming` in production.

### Alternatives rejected

- Kill/hide enemies or skip all combat/animation: changes draw population, collision, death work or hero behavior; cannot answer either comparison.
- Derive ms from FPS, clamped `dt` or scripted fixed ticks: loses real stalls and confuses per-tick work with per-frame cost.

## File changes

| File | Change | Why |
| --- | --- | --- |
| `src/enemyFreezeProfile.ts` (new) | Mode parsing, session transitions, recorder contract and summaries | Deterministic policy independent of Babylon/DOM |
| `src/main.ts` | Launch/exit, scene-owned clock adapter, tick and rendered-frame boundaries | Single composition root; preserve normal loop |
| `src/combat.ts` | Split and gate/count enemy decision producers, including event-driven paths | Keep shared resolution live |
| `src/actorRendering.ts`, `src/rigs/bindings.ts` | Split living rig work from root/visibility/history sync | Freeze only local presentation |
| `src/ui.ts` | Create compact text readout only on opt-in, clear on exit | No normal HUD change |
| Three test files above | Unit and Playwright coverage | Pin behavior and measurement, not hardware timings |
| `README.md` | Three links, protocol, metric definitions and limitations | Reproducible manual use |

## Edge cases and failure modes

- Empty work category or no fixed tick → zero work, not a missing frame. No valid intervals → no result. Hidden-tab gap → restart warmup, not a giant frame in the report.
- Failure, retry or rebuild → discard old collectors/bindings. No cross-tab persistence or stale frame attribution. Browser without WebGL2 keeps existing failure UI.
- Frozen local geometry may affect a ray hitting artwork; preserve ordinary picking rules and keep proxies aligned. Do not force equal hits by changing the picker.

## Verification

From the specified worktree only, Node 22.18+; proposed browser script accepts `DEMO_URL` and `--production` for the public-only assertions:

```sh
node --test tests/enemy-freeze-*.test.ts
npm test
npm run check:full
npm run build
npm run test:production
npm run test:cpu:production
# Start npm run dev in another terminal; run suites sequentially.
DEMO_URL=http://localhost:5173 node tests/enemy-freeze-browser.ts
npm run test:combat
npm run test:rig:handoff
# Start npm run preview in another terminal after the root build.
DEMO_URL=http://localhost:4173 node tests/enemy-freeze-browser.ts --production
```

`check:full` includes typecheck, full tests, lint and format. Also smoke the Pages base with `npm run build:pages`, `npm run preview:pages` and `DEMO_URL=http://localhost:4173/the-hollow-crown/ node tests/enemy-freeze-browser.ts --production` after stopping the root preview. Use software WebGL for functional browser evidence. Inspect pose/death captures, then obtain independent implementation review per AGENTS.

## Risks and rollout

For a manual comparison use fresh links sequentially in the same foreground browser, same viewport, quality, camera and pointer location (outside canvas), hands off at the entrance through completion. Record the three labeled result rows; use a separate visit for free play or combat. If interrupted, repeat the window. Enemy behavior diverges by design; elapsed CPU includes probe overhead and does not explain all frame time. Report observed numbers with conditions, not causal speedup or hardware conclusions. Roll out only behind the query; removing links and the optional wiring restores the ordinary path.

## Out of scope

No hardware run, GPU profiling, picker experiment, benchmark campaign, automatic scenario replay, optimization, telemetry upload, roadmap change or deployment. This plan does not record verification results for an unimplemented harness.
