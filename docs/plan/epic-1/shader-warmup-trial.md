# Shader warmup before player control: one matched hardware trial

- **Task source**: user-approved Epic 1 follow-up; `docs/encounter-trace-v4.md:3–12`, `docs/encounter-baseline.md:126–157`.
- **Epic / Story**: Epic 1, ad-hoc performance experiment
- **Status**: proposed; no candidate measured or retained
- **Branch**: `epic-1-encounter-hitch` in `/var/home/tom/Projects/the-hollow-crown-epic-1`

## Goal

Trade a bounded increase in time until the dungeon accepts input for a demonstrably shorter first movement hitch. The completed v4 RTX 2070 batch found shader-preprocessing CPU stacks in the first moving render in all three reduced and three no-alert door visits, absent in the next moving callback. That neighbor did catch-up work; the trace neither identifies a particular variant nor measures GPU execution. Test one intervention: prepare the distinct variants expected in this generated level at its applied quality while the player is still loading.

## Acceptance criteria

- [ ] Normal startup and regeneration await the same preparation before the existing READY transition. An inventory audit shows what each prepared key covers, including initially invisible and later activated draws; a separate diagnostic observes that keys actually requested during first movement were prepared before control.
- [ ] No change in fixed-step order, inputs, world, visuals, draw participation or R6 witnesses. Preparation neither plays a hidden encounter nor advances simulation. No debug dependency in the player build.
- [ ] Each timing row identifies the scene generation, effective quality, timing endpoints, first displacement and following interval. Never combine startup from one generation with movement from another as a same-load observation.
- [ ] Seal reconstructible parent, frozen replay and candidate identities, preregister once, and report the bounded comparison below. A valid negative completes the **experiment**, not the performance feature. Retain only if every retention gate passes.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Variant equivalence | `tests/shader-warmup.test.ts` | Duplicate geometry with equal compile inputs yields one job; same material with distinct attributes, light defines, instancing or pass yields distinct jobs. Low excludes High-only passes; hidden expected draws included; empty list finishes. | Fail: no variant planner |
| Load ownership | `tests/models/cases.ts`, `tests/shader-warmup.test.ts` | Fake pending compiler: no READY/control until both prerequisites complete; failure, cancellation, superseding quality/scene, duplicate and late completions cannot release control or retain old resources. Cover every transition/guard. | Fail: scene readiness alone releases control |
| Actual renderer contract | `tests/shader-warmup-browser.ts` (new) | Low/High, seed 795 plus a different generated layout: compare prepared vs observed program signatures through movement, door, combat and effects; verify enabled states, shadow list, clock and visuals restored, normal regeneration works. Exercise built non-debug entry as well as diagnostic DEV entry. | Fail: no coverage evidence or completion boundary |
| Generation/timing join | `tests/encounter-clock.test.ts`, `tests/encounter-report.test.ts` | Synthetic timestamps separate navigation, reset, playable, launch and first moving frame; reject wrong generation/quality, late poll, missing displacement or missing successor. Accept historical schema for read-only history only. | Fail: current startup metric begins after warmup |
| Decision boundaries | `tests/encounter-report.test.ts` | Independent parent/frozen spreads, three signs, strict spread inequality, inclusive startup cap, secondary regression, invalid witness, missing registration and incomplete matrix. | Fail: no combined startup/movement verdict |

## Design

**Before editing runtime**, run `git status --short`, record branch/HEAD, and use `sourceManifest` / `validateSourceArchive` (`tests/encounter-source.ts`) to seal the actual pre-trial inputs in a unique ignored directory: binary tracked patch including deletions, input-scoped untracked bytes, lockfile, per-file hashes and reconstructed digest. Refuse private inputs. Reconstruct and validate in a disposable checkout; HEAD alone is not this dirty parent. Do not stash, clean or reset the working tree. Independently verify the pinned frozen R6 index/manifest, all visits and source (`f14ca2d5…`), and v4 archive. Never regenerate reports in sealed directories. Make isolated runnable copies; document and hash any identical **measurement-only** overlay on all three arms, recording both original and measured identities and an audited candidate-minus-parent runtime diff. No preparation in either reference.

**Production boundary.** `src/main.ts:start` sends LOAD, clears movement/clock, disposes the previous scene, releases engine effects and deletes generated custom shader sources. It generates and binds the new game, resets UI and calls `applyQuality` (scaling, shadows, glow, FXAA samples) before `scene.executeWhenReady`. Today that callback checks scene identity, sends READY, dismisses loading and focuses canvas. Keep those effects together. Prepare after real quality and render resources exist, before READY. Keep presentation rendering during loading compatible with readiness; do not call `tick` or `renderUpdate` to fabricate a warm frame. Ensure no elapsed loading time becomes catch-up input on release.

Inventory the installed renderer's actual effect keys in an **untimed** diagnostic first. For each generated submesh/material and reachable draw configuration choose a representative with the real vertex layout, material/custom shader and defines, instancing/thin-instance mode, lights (including the runtime nearest-light pool), shadow receiving/casting, alpha and render pass. Include generated-but-disabled meshes, bounded gameplay effect pools, shadow map, glow and post-process variants when enabled. Derive expected configurations from builders/pass owners, not camera visibility, mesh names or a Cartesian product of hypothetical levels/qualities. Record any lazy effect factory and supply its equivalent render-only representative; if equivalence cannot be shown, stop as unsupported rather than silently narrowing coverage. Use Babylon's installed-version material/pass compilation/readiness APIs, await actual completion and verify key reuse against real draws. Deduplicate equivalent jobs, process a bounded queue (one outstanding job); release temporary representatives/listeners in all exits. No persistent cache across scenes or rewriting shaders.

### State model

Keep session `loading → playing` as sole gameplay gate. A small typed preparation transition owns the pending generation/quality revision: `begin → waitingScene → preparing → complete` on current scene-ready and all-jobs-ready respectively; complete emits READY once. Current error/timeout while pending → failed (cancel outstanding work and use visible FAIL path); new load/disposal supersedes pending work; a quality change during loading invalidates the revision and restarts preparation after applying quality. Already-playing quality selection keeps existing behavior; the next load uses that selection. Reject stale, duplicate and other invalid event/state pairs explicitly with no UI effect. Effects run outside the transition; do not create a second playing flag. Gate late async callbacks as well as the existing scene callback.

### Ports and adapters

Keep signature deduplication, job selection, transitions and paired verdicts pure. Inject a scene-owned variant inventory/compiler and monotonic clock at `main.ts`; Babylon objects remain in the render adapter. The DEV capture observes immutable generation/quality/time facts, never initiates compilation. Playwright and filesystem/archive handling stay in tests. Reuse session/encounter machinery rather than adding a general scheduler or telemetry service.

### Which startup is measured

`tests/encounter-browser.ts:323–359` first navigates to a **High** default dungeon, polls debug ready, changes `#quality`, then calls `encounter.run`. `src/encounterCapture.ts:435–442` calls `port.fresh(recipe.seed)` → **another** production `start`; the old effects are released. The encounter then prepares the population and runs 489 warmup ticks. `tests/encounter-report.ts` calls first frame entry minus post-warmup launch `startupMs`; keep that legacy figure under its own label. Neither that figure, Playwright poll latency, nor the initial High load measures Low regeneration.

1. Stamp navigation origin, `start` entry (before generation/disposal), applied quality and the synchronous playable boundary (READY/loading dismissal/input enabled) with the page monotonic clock, keyed by generation. Use the same passive markers on all arms. For the **first navigation** report navigation start → first playable, including bundle, engine and shader cost, at actual default High. Add a matched non-debug fresh-navigation check on each arm/repeat, same cache policy, observing ordinary first key movement without the encounter reset. Do not label a High navigation as a cold Low load.
2. For each R6 visit keep the real quality UI change **before** `port.fresh`, including High→High. Measure second `start` entry → second playable, not `run` → first captured frame. Assert requested/applied quality, dimensions and scene token at start, playable, warmed snapshot and first movement; assert exactly one production preparation for that revision on candidate, none on references. R6 reduced setup may retire actors before readiness: snapshot the generated-level inventory before observer setup can narrow it, and prove preparation/retirement ordering does not change the frozen warmed witnesses. Do not add a reset-specific warm call or silently change the recipe. If parity cannot be established, do not time.
3. With scopes off, record a minimal pre/post player x/z witness per approach callback identically on all arms. Select first actual displacement after ordinary recipe input, not hardcoded callback 2. Measure `entry[i+1] − entry[i]`, the gap following its work; also record work, ticks, next moving gap and next catch-up count separately. Report navigation, regeneration, 489-tick warmup and movement independently, never adding unrelated clocks. No trace/profiler or verbose effect-key logging in outcome visits.

### Preregistered comparison and stopping rule

- One candidate, `name=reduced`, `quality=low`, `phase=approach`. Before **any** timed pair, freeze the same `CPU_TRIAL` bytes naming measured parent/frozen/candidate digests, hypothesis, code boundary, gameplay invariant, metrics, caps and stop rule. Record schedule and cache policy. Use fresh contexts, identical browser/profile/cache initialization per batch; do not claim cold driver caches. Match baseline host, unlocked foreground Wayland RTX 2070/WebGL2, driver/browser, viewport, DPR, dimensions, owned strict-port Vite root/nonce. Stop on mismatch, lock, reload, source drift or cleanup failure. Software is for correctness only.
- Follow `docs/encounter-baseline.md:126–157`: separate candidate vs immediate parent and candidate vs reconstructed frozen pairs, **AB/BA/AB** (A reference, B candidate), three repeat numbers per cell, shared pair ID within each pair. Each side captures full/door/reduced × Low/High × off/coarse/detailed; 12 batches of 18 visits = 216 matrix visits maximum before repairs. Run sequentially with no builds, traces or competing rendering. Native v4 signed start/terminal parity, input edges, populations, control no-alert crossing and phase witnesses required on each arm. Historical trailing snapshots are not exact terminal state; no new legacy exception. Validate per-batch hashes and after-source offline. One replacement pair maximum for a documented setup failure only; preserve failures. Never retry a slow valid observation.
- **Effect:** against *each* reference separately require all three paired reductions in reduced/Low/off approach worst interval **and** first-displacement interval. For each metric median(reference − candidate) must exceed both arms' respective max−min spreads and be at least 8 ms (about half a 60 Hz frame). Door/Low first movement must also improve in all three pairs as the no-alert mechanism control. Do not pool frames. Report ordered values, deltas, sample counts, ranges, phase tails, p95/p99/max and over-budget share; coarse/detailed only for parity and attribution.
- **Startup budget:** for each reference, candidate may add **at most 100 ms in every paired observation** for navigation-to-playable (including non-debug check) and selected-quality reset-to-playable in every off cell. Report absolute times and deltas, medians and ranges for both boundaries. This is a user-wait ceiling, not a compilation timeout. Equality passes the cap; missing boundary is invalid. Inspect first playable callbacks, warmup and subsequent phase/control tails for displaced work; block retention if any other off cell/phase worst interval regresses in all three pairs with median increase exceeding either arm's spread, or a repeatable new startup-adjacent hitch appears.
- Invalid comparison → incomplete, identify failed gate, no performance inference. Valid comparison failing any threshold → stop, do not retain runtime warmup or tune thresholds/coverage/repeats. Record what evidence would justify reopening. Passing → eligible for independent review of exact retained diff, not proof of GPU savings, sustained 60 FPS or an automatic roadmap check.

### Alternatives rejected

- `executeWhenReady` alone, one mesh per material, or warming only the traced doorway: none establishes coverage of later draw defines. A hidden camera tour or synthetic gameplay step would change the workload.
- Warming inside `encounter.run`, reusing the initial High cache, or comparing only to saved historical timings: each tests a different startup or loses matched order/source control.

## File changes

| File (future implementation) | Change | Why |
| --- | --- | --- |
| `src/main.ts`, new `src/shaderWarmup.ts` and `src/shaderWarmupRendering.ts` | Load ownership, pure job/transition policy, Babylon inventory and compilation | One player-facing preparation path |
| `src/encounterCapture.ts`, `tests/encounter-browser.ts`, `tests/browserTypes.ts` | Passive load/movement observations, generation joins and capture checks | Separate the two loads without benchmark-only behavior |
| `tests/encounter-report.ts`, tests listed above | Validate timing contract, parity, budgets and decision from signed raw rows | Repeatable offline verdict |
| New `docs/shader-warmup-trial-result.md` and unique ignored evidence directories | Record manifests, commands, ordered outcomes, failures and verdict | Preserve historical baseline/trace intact |

## Edge cases and failure modes

Empty inventory still requires scene readiness. On compile rejection, context loss, or a 10 s preparation deadline fail visibly, release temporary state, do not claim warm success. Test regeneration during an outstanding compile and switch quality twice; no late disposal of a replacement's resources. Check generated custom shader store/effect counts over repeated resets. Fail closed on coverage gaps, nonfinite timestamps, stale tokens, missing successor, unsigned archives or unverified environment. Record unavailable hardware as blocked, not a negative result.

## Verification

```sh
node --test tests/shader-warmup.test.ts tests/encounter-clock.test.ts tests/encounter-report.test.ts
npm run typecheck && npm run format:check && npm run lint && npm test
npm run check:full && npm run build && npm run test:production
npm run test:browser
node tests/shader-warmup-browser.ts
```

Run browser suites sequentially, outside timing. For each scheduled side from its isolated checkout use the existing paired command shape (absolute trial path; set pair, repeat and label from schedule):

```sh
CPU_GPU=hardware CPU_DISPLAY=wayland CPU_REPEATS=1 CPU_PAIR="$PAIR" \
 CPU_REPEAT_NUMBER="$N" CPU_TRIAL="$TRIAL" CPU_LABEL="$ARM" \
 DEMO_URL=http://127.0.0.1:5471 node tests/encounter-browser.ts
node tests/encounter-report.ts "$CAND_PARENT::$CAND_FROZEN" "$PARENT" "$FROZEN" "$TRIAL"
```

Lists are ordered new batch paths per the baseline gate. Replay from copies into new output, retain raw registration/hash evidence and check the original frozen hashes again afterward.

## Risks and rollout

Deduplicating too aggressively misses a first-use key; compiling every mesh separately hides the hitch in loading. Audit requested versus compiled signatures separately from timing and enforce the wait cap. Driver cache/order drift can swamp a real effect: report spreads rather than best visits. Keep the candidate isolated until the verdict; on a negative discard only its runtime delta, never revert unrelated dirty work.

## Out of scope

No gameplay, AI, lights/quality reductions, shader redesign, persistent disk caches, recipe changes, driver tuning or second optimization. This task writes this plan only: no runtime edits, captures, roadmap changes or commits.
