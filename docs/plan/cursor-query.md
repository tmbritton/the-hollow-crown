# Reduce the cost of picking the entrance shrine

- **Task source:** Ad-hoc follow-up to `docs/epic14-startup-fps.md:9–42,56–63`. Preserve the delivered interaction and preview contracts in `docs/plan/epic-14/story-4.md` and `story-6.md`; roadmap lines 111 and 117 are complete.
- **Epic / Story:** ad-hoc; no roadmap change.
- **Status:** proposed; no implementation or measurement in this phase.
- **Branch:** `main`, baseline `7f389bb26097eeb1c00f22692ceebae1b0cf97d1`, `/var/home/tom/Projects/the-hollow-crown`.

## Goal

Make holding the pointer still over the out-of-reach entrance shrine cheaper without changing what the player sees or clicks. Historically `d7f6562` → `ccdc078` stepped from 16.7 to 33.3 ms median RAF interval in all three shrine pairs (12.59–15.11 FPS lost). Picking cost 6.15 ms/frame at the shrine versus 1.05 on floor; eligibility was only 0.47 ms at the shrine. A missed refresh is not 16.6 ms of picker CPU. Floor lost throughput without a median step; idle was mixed, and sustained single-digit FPS did not reproduce. Test the cursor hypothesis against **current main**, not against those historical times.

## Acceptance criteria

- [ ] For identical live rays and world states the indexed query agrees with the exhaustive reference on floor/enemy/object, stable ID, nearest surface/instance and hit distance (numeric tolerance only, not an ambiguous ID). No substitute center, bounding-box or walkability hits.
- [ ] Hover, primary down and held steering keep 14.4/14.6 behavior: exact eligible owner/operation, hand/outline or sword/ring, no hover side effects, no click stolen by a nearer unrelated use candidate. Preview tracks world changes without pointer motion; down samples now, even before another frame. Old scene/preview resources are released.
- [ ] Deterministic parity tests, existing browser and production gates pass. In the bounded RTX trial below, the affected pick time **and** clean shrine cadence improve beyond repeat spread without a displaced control regression. Fewer predicate calls alone do not deliver the feature.

## Test plan (write these first)

Keep a test-only copy of the unoptimized selection path; compare against independent exhaustive Babylon picks on synchronized geometry at the same tick, not candidate-vs-candidate. Assert the known intended ID in constructed fixtures too. Characterization cases should already pass for the reference. Confirm each new candidate contract red before wiring it, then green; no timing assertions in CI.

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Bounded work with identical result | `tests/cursor-query.test.ts` (new; Node test, NullEngine fixture) | Many off-ray fixed meshes, live actors and one shrine. Count admitted exact candidates and forced proxy matrices; off-ray groups do not incur child picks. Floor miss skips occlusion. | Red: reference scans the scene and forces every proxy. |
| Exact surfaces and ties | same | Ray through a mesh hole, between instances, into a translated/rotated instance, through a faded wall, against opaque cover and two equidistant owners in reversed insertion order. Enemy at and either side of hit distance + 0.0001. | Red: new candidate adapter absent; naive bounds/first-hit shortcut gives wrong ID. |
| Live change without an intervening render | same | Move/reparent parent and posed child, swing door, move/kill/disable actor, change thin matrix/batch count, freeze/unfreeze, add/remove/reorder meshes and replace same-length scene list. Requery same point after each event. | Red: static-only registration misses new nearest surface. |
| Retirement and fresh run | same | Cold → ready → dirty/rebuilt → retired, including duplicate dispose and rejected reads. Regenerate with reused IDs/different meshes; no old hits, observers or retained outline meshes. | Red: no scene query lifecycle contract. |
| Real preview vs click | `tests/epic14-browser.ts` | In dungeon and practice, hold a point, rotate/zoom/move a rig or door underneath, change eligibility and cutaway. Assert hovered ID, actual outlined meshes/ring, no change to committed pursuit/work/HP. Change target after preview but before down; assert **new** ID/operation. Leave canvas, blur, inspect, pause, reset: no stale cue. | Reference characterization green; red on candidate integration until live geometry and down use same resolver. |

## Design

`src/main.ts:188–241` builds a per-game surface-owner map, picks an enemy, picks an owned surface, then (only for a potential target) finds the nearest visible occluder. `src/enemyRendering.ts:297–304` forces every pick proxy's world matrix before a scene-wide pick. Target only those traversals. Keep `refreshPreview`, `pointerSample` (including lens mapping), use eligibility, floor projection and command dispatch authoritative.

1. Enumerate registered alive/enabled enemy proxies and owned use surfaces directly, retaining scene order for equal distances. Synchronize live ancestor transforms before testing bounds; skip a whole rig only with a proven envelope covering the proxy **and** posed attachments. Otherwise synchronize and test it. Exact-test survivors, find nearest enemy and nearest owned surface independently. Neither hit → floor immediately.
2. Bound the cover query to the farther of the two exact distances plus a conservative numerical margin (never lengthen the original ray). This includes cover in front of either target without feeding an effectively infinite pointer ray to a cell loop. Extract only needed conservative candidate primitives from `src/observation.ts:11–58,133–287`: 16-unit XZ buckets for fixed meshes, dynamic meshes and rig envelopes, inclusive segment/box rejection, synchronized transforms and instance bounds. Do not call `CameraObservation.visible`: it samples actor centers, uses a different visibility policy, enables instance picking and accepts any blocker with `fastCheck`. Preserve observation behavior and its tests. Avoid an additional scene walk per candidate; count index validation/rebuild time, too.
3. Exact-test candidate geometry using Babylon's same triangle, side, world-distance and thin-instance transforms as the reference. Inspect the installed picker before replacing a call with `ray.intersectsMesh`: a base-mesh intersection alone is **not** a thin-instance query. If exact per-instance traversal cannot be matched, keep Babylon's nearest `pickWithRay` for that pass with candidate and instance rejection; measure its remaining scan. Unknown bounds admit rather than reject. Do not mutate global picker settings. Break equal mesh/instance depths in original traversal order, not bucket order. No `fastCheck` nearest selection.
4. Keep separate predicates: living actors use their enabled selection proxies; owned surfaces require enabled, visible, visibility ≥ 0.5. For cover retain thin-picking opt-in, player shadow mesh and selected enemy artwork exclusions; owned surfaces still count, other blockers must satisfy today's material and ring/marker exclusions. Read cutaway visibility, door parent transforms, actor pose, detached remains and moving tribute at query time, not at registration. Return enemy if `enemy.distance <= cover.distance + 0.0001` or no cover; otherwise return foremost cover's owner or floor. Do not let an AABB or a collision door decide a hit.

### State, events and effects

Cache scene membership/bounds, **never a resolved pick**. Scene-local lifecycle: start `dirty`; `dirty + query` rebuilds in scene order then queries (`ready`); `ready + query` validates topology/frozen versions then queries or rebuilds first. In either live state, membership/order/parent/frozen-index change → `dirty`; ordinary pose, visibility, door or instance writes remain live inputs, not deferred until next RAF. Instance writers must update conservative bounds before queries; if not guaranteed, bypass rejection for that batch. In either live state `dispose` → `retired` and remove observers, clear buckets, owner/reverse maps, rig references and scratch buffers; repeated dispose is idempotent. Retired reads return no pick and changes cannot revive it. Keep these transitions in one scene adapter, test the transition decisions apart from effects. No new gameplay statechart. Existing input lifecycle owns clear/re-enter; hover and synchronous down each generate a fresh absolute ray through the same port.

### Ports and adapters

One run-local cursor query port returns a discriminated floor/object ID/enemy ID; `main.ts` maps IDs to current actors and composes with existing feedback/use ports. Babylon adapter owns meshes, transforms, indices, observers and scratch; deterministic nearest/tie policy accepts plain distances/IDs. Inject fixture candidates for policy tests and real Babylon geometry for adapter tests. No DOM, timers, Babylon types or spatial cache in combat/navigation policy.

### Alternatives rejected

- Pointer-move-only caching, throttle or one-frame-old click: wrong for stationary pointer with moving geometry/camera or new eligibility.
- Collision grid, GPU color readback, center projection or any-hit occlusion: different surface/ordering semantics or another render pass. Do not redesign observation, routing or the renderer to make the experiment pass.

## Expected file changes

| File | Change and reason |
| --- | --- |
| `src/cursorQuery.ts` (new), `src/main.ts` | Scene-owned candidate query and shared call site; replace exhaustive sweeps only. |
| `src/enemyRendering.ts` | Expose the existing proxy/actor association to the adapter without forcing all matrices. |
| `src/observation.ts`, small shared render-query helper if needed | Reuse bounds/synchronization and writer-owned thin-instance data without importing observation policy. |
| `tests/cursor-query.test.ts`, `tests/epic14-browser.ts` | Differential and lifecycle tests above; retain exhaustive oracle only in tests. |
| `docs/epic14-startup-fps.md` | After verification append separate current-revision evidence/verdict; preserve historical data. Raw visits/profiles under ignored `test-results/`. |

## Edge cases and failure modes

Parallel/grazing ray, inside bounds, zero-scale or empty instance pools and unknown transforms must not discard a real hit. A near-vertical ray or a very distant hit must not allocate an unbounded cell rectangle: intersect occupied index extent or fall back to iterating occupied buckets. An untrusted rig envelope, changed parent, new owner or matrix touched twice in one render ID must be handled before the next reader, including synchronous clicks. Clear camera/target cues on lifecycle exit without canceling a valid committed command merely because hover was lost.

## Verification (future implementation only)

```sh
node --test tests/cursor-query.test.ts
npm run typecheck
npm run lint
npm run format:check
npm test
npm run check:full
# With npm run dev in another terminal, run rendering suites sequentially:
npm run test:epic14
npm run build && npm run test:production
```

### Bounded RTX comparison and decision rule

- One candidate vs unmodified `7f389bb`; separate lockfile installs, identical minified production builds, no dev harness or probes in cadence bundles. Record revision/diff, browser, OS/driver, CPU, power profile/load, actual WebGL2 ANGLE RTX 2070 renderer, ~60 Hz desktop, 1920×1080 CSS, DPR/backing dimensions, High quality. No concurrent builds or profiling. No software-rendered FPS substitute.
- Fresh contexts/navigation to `?seed=MOURNING-731`, default entrance camera/hero, 24 live enemies, matched geometry, doors and target state. Match the **effective current game preset** on both sides (`GAME_VIEW`, 60° lens, 35% fisheye, palette off, ink 4, corner wear 40; record all values and matrices). Historical default High alone does not match camera projection or art. In untimed preflight verify pixels by actual projected/picked ID and capture both views. Historical `(1436,700)` shrine and `(920,580)` floor are starting points only. If projection changed, freeze one matching pair of coordinates for both builds before sampling: `prop:shrine-entrance-0` restore with same out-of-reach approach state; clear entrance floor; and no canvas input. If starts/IDs cannot match, stop as invalid.
- Three clean paired visits per case (shrine, floor, no pointer), alternating AB/BA/AB within each case, serial foreground pages, fresh run each time. One synthetic move at ready for pointer fixtures, isolate physical input; no click or stepping. From first post-ready RAF to first RAF ≥10 s later log raw intervals, FPS, median, p95, >100 ms count and worst interval; record navigation→ready separately. Keep cold/slow valid visits. Report each pair/delta and within-side max−min of repeat statistics, not pooled frames.
- Separate diagnostic bundles, same fixtures: three paired visits per shrine for pick timing spread, one pair per control for attribution, native ticks 180–480. Report mean and p95 inclusive pick ms/frame and break out enemy/proxy sync, object, index maintenance/candidate and exact cover work; include maintenance outside query. Record hits, rays, predicate/candidate vs actual exact work, preview eligibility/outline time, ticks/frame, tick ms/tick and per frame, rig time, `scene.render` CPU and separate async GPU timing. Do not sum inclusive stacks or CPU+GPU. Verify stable target/cues in attribution; no probes in the clean outcome.
- **Proposed retention threshold, frozen before implementation:** shrine payback must be material: at least halve median-of-visit mean inclusive pick cost (charge new upkeep), with every paired saving positive and median paired saving greater than the larger within-side spread. Require a clean shrine cadence win as well: all three paired FPS higher and median paired FPS gain greater than the larger within-side FPS spread; if baseline exhibits the historical 33.3-ms median step require recovery by one refresh in the median pair. Report whether 16.7 ms was actually recovered, not inferred from CPU savings. Reject repeatable worse median/p95 intervals or control FPS losses beyond their respective spread (all pairs worsening, median delta magnitude greater than larger range); investigate displaced long frames rather than averaging them away.
- Stop at the prescribed visits. Replace at most one invalid pair for documented input contamination, target/renderer/settings mismatch or broken capture; otherwise mark inconclusive. Hardware unavailable → pending. No extra samples for a noisy or negative result, threshold changes, retuning or alternate seeds. Parity failure blocks delivery. Valid miss → record negative result, do not retain optimization or claim FPS recovery; another trial needs fresh evidence of material cost. No global playability inference even on a pass.

## Risks and rollout

Most likely false win: cheaper pick obtained by silently missing occluders, using different visual defaults or shifting work to tick/index rebuild. Differential tests, matched preflight and inclusive timings are release gates. Keep the production change independently revertible; no permanent dual execution or debug hooks. Inspect regenerated scene resources and existing observation checks if shared code changes. Obtain independent review of exact retained diff and evidence.

## Out of scope

No route-budget, approach caching, actor animation, GPU submission, quality/preset tuning, idle-FPS fix, death/population experiment, control remapping or roadmap status changes. This plan neither implements the picker nor runs benchmarks.
