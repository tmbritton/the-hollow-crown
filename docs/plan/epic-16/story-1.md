# Identify removable work and pin a scaling reference

- **Task source:** `docs/plan/roadmap.md:138–139`
- **Epic / Story:** Epic 16 / Story 16.1
- **Status:** proposed; evidence not yet collected
- **Branch:** `main`, baseline `3a35753`, `/var/home/tom/Projects/the-hollow-crown`

## Goal

Determine whether a tile query has a credible path to halving the cost of stationary shrine picking without changing what the player points at. Deliver a reproducible reference and a decision, not a faster picker. The [startup report](../../epic14-startup-fps.md#current-main-cursor-query-trial-2026-11-24) records a negative diagnostic result (5.690 → 11.596 ms/frame despite fewer selections), unequal probes and an incomplete clean campaign after a GPU fault. Neither that run nor the older shrine/floor contrast measures removable work on this revision.

## Acceptance criteria

- [ ] Freeze a test-only exhaustive oracle independent of any shortlist. Record known local hits and exact work for identical queries with zero and ten distant populated rooms; commit the replay recipe and manifest, not just totals.
- [ ] Collect fresh matched real-hardware evidence on the actual shrine. Distinguish exclusive work a tile query would avoid from retained exact tests, writer costs and non-pick work. Archive provenance, per-visit rows, spread and the calculation below.
- [ ] Publish one disposition under the frozen rules. Only **positive feasibility**, independently checked, opens 16.2; even then there is no delivered speedup. A valid negative is a useful investigation result; an interrupted or unavailable measurement is not a negative.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Known hits, not self-comparison | `tests/cursor-reference.test.ts` | Real Babylon geometry/materials: shrine through a hole, nearer opaque cover returns floor, translated pickable instance, equal-depth owners and enemy at the existing tie margin. Assert intended ID, mesh, instance and distance before comparing traces. | Red: frozen reference and hit DTO absent; characterization should pass against current behavior. |
| Same ray, two populations | same | Require exactly ten populated off-ray rooms added, unchanged local hit sequence and writes, exhaustive visits increase; distinct mesh/instance exact-entry counters (including misses), not predicates relabelled as intersections. | Red: missing replay and counters. |
| Attribution ledger | `tests/cursor-evidence.test.ts` | Synthetic nested scopes, multiple ticks/frame, no-pointer upkeep, one-time build, paired totals and ranges. Double-counted scopes, missing rates or uncharged work cannot produce a pass. | Red: no ledger/decision. |
| Decision boundaries | same | Table-test each disposition, equality at threshold, noisy pairs, mismatch, missing visit, software renderer, broken parity and hardware loss; terminal decisions reject further samples. | Red: no evidence policy. |

## Design

**Freeze the reference first.** Snapshot the semantics of `src/main.ts:188–241` and `src/enemyRendering.ts:297–304` in tests: sync proxies, exhaustive nearest enemy and owned surface, conditional exhaustive cover, enabled/visible and thin-picking filters, artwork exclusions, scene order and `+0.0001` enemy tie. Use actual triangles and instance transforms. Capture result class, stable owner/operation, winning surface and instance, distance (absolute tolerance `1e-5` world units; IDs/order exact). Cross-check against the current browser path, not an archived prototype. Separate cold owner-map construction from warm picks.

**Scaling replay (test only).** Use a fixed horizontal local ray toward an owned shrine with a pickable thin batch, opaque door and live proxy in the local room. Pin their numeric transforms, camera/ray, insertion order and expected hits in the fixture. Replay 60 warm-up then 240 queries, alternating the same two local door transforms (blocked/exposed) before each query. Compare A = local only, B = same local objects plus ten copies of a room offset perpendicular to the ray by `64*i` units (`i=1..10`, room half-width < 16). Each copy contains four opaque walls, one owned prop, one enabled proxy and a pickable batch of eight instances, fixed for this replay. No extra remote animation; identical write count/order and local triangle/instance geometry in A/B. Three fresh AB/BA/AB pairs, same instrumentation; log per-case hit sequence, visits, syncs, admitted candidates, mesh and individual instance exact tests and mean/p95 time/query; build separately. NullEngine suffices for correctness, not hardware claims. Future indexed scaling limit: **zero additional admitted candidates, exact mesh/instance tests or query-time syncs** for these disjoint rooms, no whole-scene walk, identical hits on every query. Do not require exhaustive work or elapsed time to stay flat; no stopwatch asserts in CI.

**Hardware workload and cap (diagnostics only).** Before expensive collection, verify a healthy headed Chromium WebGL2 canvas on the matched RTX 2070 desktop using normal user access. Record full source/lockfile and probe diff/hash, browser, CPU/GPU/driver, actual renderer, refresh, load/power profile, build flags. Use independent fresh navigations, same minified diagnostic bundle, `?seed=MOURNING-731`, 24 live enemies, entrance hero/camera, High, effective Tuned settings (60° lens, 35% fisheye, palette off, ink 4, corner wear 40), 1920×1080 CSS; log DPR/backing size, matrices, topology, poses and door state. At preflight resolve displayed pixels via the lens; freeze an out-of-reach `prop:shrine-entrance-0` / restore, clear floor and no canvas input. Previous pixels are hints only. Hold one synthetic move from ready, isolate physical input, no click, debug stepping or simultaneous builds. Verify target/cues throughout native ticks 180–480. Stop on mismatched state, foreground loss or invalid renderer.

Use three shrine baseline visits, one floor and one idle for attribution (not control repeat statistics). Collect counts in a separate matched count-mode visit per case: same hooks for like comparisons; aggregate counters at actual enumeration, forced matrix, exact mesh and per-instance intersection boundaries in installed Babylon. Mark unavailable depths unknown, never infer triangle work from candidates. Timing mode uses coarse pass boundaries plus sampled stacks or matched batched replay of isolated stages, **not a clock per predicate/instance**. For each shrine visit save a synchronized ray/geometry and writer-rate trace for a paired diagnostic replay. Alternate replay order exhaustive/local-list, local-list/exhaustive, exhaustive/local-list. Local-list is a precomputed conservative list of *all* overlapped tile occupants for those sampled rays, not the winning mesh list: derive it offline from synchronized bounds, include uncertain/large bounds and all relevant instances in order. Both arms execute the same exact kernel and same timing boundaries; require full hit parity and reconcile exhaustive replay time/work with the native pick (difference in mean ≤10% per visit, else inconclusive). This is an estimate of avoided work, not a live index. No extra cadence matrix, candidate implementation, population campaign or tuning. At most one replacement visit across the study for documented capture contamination, never after a device fault.

**Cost ledger and precommitted decision.** For each visit report inclusive pick ms/native frame (mean/p95); break out enemy/object/cover enumeration, sync, exact mesh and instance work, including retained local work. Record eligibility/outline separately, fixed ticks/frame, rig ms/tick and ms/frame, render submission CPU and asynchronous GPU separately where available. Do not add nested timers, count unrelated tick/render savings, or assign unexplained residuals to removable work. Credit at most the smaller of matched replay savings and non-overlapping attributable off-ray time in the native trace; leave unresolved samples uncredited.

Charge traversal/list assembly, dedup/order, bounds refresh, membership diff/removal/insertion and invalidation at writers **including work outside hover**. Record per-frame writer counts by kind (moving/posed/reparented meshes, doors, thin matrices/batches, lifecycle changes); count occupied/crossed tiles and old/new memberships, not just changed owners. Estimate unit costs with one small matched scratch-array/map replay of these operations on captured occupancies on the same hardware (three batches after warm-up, 240 frames/batch, both timing arms equally instrumented); use largest batch cost/rate times observed demand, including unchanged checks and allocation/cleanup. Document units and multiply out cost per native frame; bound unobserved costs conservatively or withhold positive. List initial registration ms and memory separately; do not amortize cold work into an apparent warm win.

Let `P` be measured baseline inclusive shrine mean ms/frame, `R` credited removable time, `U` upper estimated recurring costs not already in retained work, `S = R − U`, `Q = P − S`. Publish all three `(P,R,U,S,Q)` rows, median and max−min within-side spreads, including calibration error. **Positive** only if all three `S > 0`, median `Q ≤ 0.5 × median P`, and median `S` exceeds the larger of the `P` and `Q` spreads plus maximum absolute replay calibration error. Require parity, measured scaling reference, explained cost bounds and matched hardware. Report floor/idle displacement estimates even when pick is zero; unknown maintenance is not free. Valid complete evidence missing the numerical gate → **negative**, stop; no threshold relaxation or more samples. Bad attribution, unmatched or incomplete capture after starting → **stopped/inconclusive** with last valid evidence. No working matched hardware before start → **pending**. Neither opens 16.2. Reopen only on restored comparable hardware for incomplete evidence or a new evidenced bottleneck for a valid miss. The [cursor trial's](../cursor-query.md) clean FPS, tails and control retention tests belong to 16.4, not this gate.

### State and boundaries

Pure test-side decision over typed evidence: `planned + unavailable → pending`; `planned + preflightOK → collecting`; mismatch/fault during preflight or collection → `stopped`; `collecting + complete → positive | negative | stopped` using the guards above. Reject every other event, including additions to terminal runs. Effects are write report/stop, executed by the runner. No gameplay machine. Ports are a hit sampler, monotonic batch clock and evidence sink; Babylon scene, Playwright/native timing and filesystem are test adapters wired by the test runner. Policy takes plain records; fake clock/records for unit tests.

### Alternatives rejected

Reinstalling the old index repeats a failed experiment. Counting rejected meshes or skipping all exact tests overstates savings. Running the full historical A/B cadence trial before an intervention adds cost without answering which work is removable.

## File changes (future implementation)

| File | Change | Why |
| --- | --- | --- |
| `tests/cursor-reference.ts`, `tests/cursor-reference.test.ts` | Frozen exhaustive scene adapter, deterministic two-size fixture and assertions | Independent oracle reusable by 16.2–3 |
| `tests/cursor-evidence.ts`, `tests/cursor-evidence.test.ts` | Typed ledger, reducer and table cases | Audit the gate without hardware |
| `tests/cursor-attribution.ts` | Standalone bounded browser runner, scratch diagnostic build/probes and matched replay | No probes or dual path in shipped game |
| `docs/epic14-startup-fps.md` | Append revision-specific recipe, raw artifact paths/hashes, table and verdict | Preserve historical findings; raw visits under ignored `test-results/epic16/` |

## Edge cases and failure modes

Thin-instance bounds-only hits, stale parent matrices, equal depth, cutaways, same ID but different surface, and wrong displayed pixel invalidate comparisons. Record frame denominators when catch-up ticks vary. Reject partial windows, missing writers and inconsistent hit classes rather than substituting zero. On context loss, Xid/reset-required or device disappearance stop immediately: no resets, reboot requests, driver/clock/power changes or software fallback.

## Verification (implementation phase only)

```sh
node --test tests/cursor-reference.test.ts tests/cursor-evidence.test.ts
npm run typecheck
npm run lint
npm run format:check
npm test
npm run check:full
npm run build
npm run test:production
# With npm run dev in a separate terminal, sequentially:
npm run test:epic14
# Only after healthy matched hardware preflight; diagnostic runner, not CI:
node tests/cursor-attribution.ts
```

Review raw rows, hit manifests and bundle identities independently. Record actual outcomes; a passing browser interaction test does not supply a hardware profile.

## Risks and scope

The largest risk is a favorable replay that excludes necessary candidates or shifts cost to writers. Conservative inclusion, calibration, explicit upkeep and a fail-closed evidence gate limit that risk. Only the plan is changed in this phase. No index, production picking/input changes, hardware recovery, FPS claim, roadmap checkbox or work on 16.2–4.
