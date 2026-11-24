# Story 15.1 — Pin two playable comparisons

- **Task source**: [roadmap, lines 353–359](../roadmap.md#L353-L359); depends on Epic 13's practice room.
- **Epic / Story**: 15 / 15.1
- **Status**: proposed
- **Branch**: `epic-15-visual-experiments`

## Goal

Let a player switch between the current renderer (Original) and an opt-in camera treatment (Tuned) while playing the same practice round. Pin that round and one dungeon route, with control captures **before** changing the look, so later stories can compare what players see in motion without also changing what happens in the game.

## Acceptance criteria

- [ ] Practice and ordinary dungeon play start in Original. A small, initially collapsed practice panel shows labelled, bounded ranges and current numeric values. Dragging or pressing arrow keys in Tuned changes the next rendered frame, not the scene instance; no panel pointer, wheel or keyboard gesture issues a game command.
- [ ] Lens runs wide to long (proposed 60° to 25° vertical FOV; exact default 0.65 rad ≈ 37.24°). At fixed gameplay zoom, background perspective changes but the centered stationary hero's pixel height stays within 3% of Original at both ends. Rotate past a wall at each end: cutaway reveals the hero and clicks reach the visible floor, door and foe.
- [ ] Fisheye runs independently from 0% (no pass) to 100% (visibly strong outward bowing of straight scene edges). Neither FOV nor gameplay zoom changes. HUD and panel stay rectangular and clickable; at both strengths, clicks near screen edges reach the pictured floor tile, door and foe.
- [ ] Original/Tuned switches retain orbit angle, gameplay zoom and the saved Tuned values. Reset settings restores exact defaults without resetting the round. Copy exposes reproducible numeric settings, including Lens and Fisheye; a player can dial them back in and reproduce the view without restarting. Add room hue and shadow coverage **with 15.2**, ink width **with 15.3**, corner wear **with 15.4**, each following this same live range/value contract; no inert sliders now.
- [ ] Both playable routes, their tick-indexed inputs and matched checkpoint states are pinned below. Save Original/Tuned still pairs for both routes at four quarter-turns × near/far zoom, plus matched short motion clips for each route. Reject mismatched pairs; record frame-time and draw-call results against the predeclared budgets, not just screenshots.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Mode/event partitions | `tests/models/cases.ts` | Initial control, switch both ways, edit guard, bounds, reset and copy in each mode; saved values survive switching | Red: no trial chart |
| Projection and mapping | `tests/visualTrial.test.ts` | Radius × tangent invariant at zoom 18 and 36; exact neutral, independent axes, monotonic edge mapping and rejected off-image samples at two aspect ratios | Red: missing pure transforms |
| Matched route and capture inventory | `tests/visual-trial-browser.ts` (new) | First record untouched control; deliberately offset an action tick and reject the pair. Require all matched views, both clips per route and numeric manifests | Red: missing Tuned run or unmatched evidence |
| Operate actual panel during play | Same browser suite | Drag, release outside panel, use arrows, copy/reset/switch, then resume canvas input. Assert values, unchanged simulation intents, camera and scene identity; neutral frame matches control | Red: controls absent |
| Look and click at limits | Same browser suite | Cross both Lens ends with both Fisheye ends, rotate through cutaway, compare projected hero height with distortion off. Click independently identified visible targets near edges (outer 20%); assert destination tile, opened door and selected skeleton, not merely a non-null ray | Red: unchanged projection or picks miss drawn target |

## Design

### State model

Use a synchronous UI `Statechart`: **Original(saved)** or **Tuned(saved)**. `Select(mode)` selects the effective settings (baseline or saved); selecting the current mode explicitly retains it. `Edit(key,value)` in Tuned clamps a finite value to the range, updates saved and applies it; disable edits in Original and reject unknown/nonfinite edits in either mode. In either state `ResetSettings` replaces saved with defaults and reapplies effective settings; `Copy` retains state and emits the mode and losslessly serialized saved numbers with units. Reject other events. Effects are view application, panel refresh and user-initiated clipboard write, never gameplay intents. Native disclosure owns expanded/collapsed state. Keep settings session-local across practice round resets, not across reloads.

### Ports, adapters and composition

- Keep the numeric schema, effective-settings selector and projection/coordinate transforms plain TypeScript. UI-owned `applyView(settings)` and `copySettings(text)` callbacks suffice as ports. `src/main.ts` wires the practice DOM, clipboard and Babylon adapters to the chart; the development-only dungeon replay drives the same selection port without exposing a dungeon panel or production debug hook.
- Smooth **logical** zoom as today (wheel target 18–36). At render time derive actual orbit distance as `logicalRadius * tan(0.65 / 2) / tan(verticalFov / 2)` about the existing hero target. Never feed the compensated radius back as logical zoom. Keep orbit interpolation and cutaways on actual camera angle; respect inspection's separate camera ownership on entry/restore.
- Apply one optional scene-color pass with a monotone, aspect-aware radial sampling map. Define it from displayed pixel to undistorted source UV: picking uses that **same direction**, converting CSS canvas coordinates through the current viewport and back before `navigatePointer` constructs its ray. Share coefficients and conventions, including Y origin. Reject samples outside the drawn image rather than clicking a clamped border. Bypass allocation at zero and release the pass on scene retirement. DOM overlays are never shader inputs.
- **Simplification:** one scene, one saved preset, one native range per delivered treatment. No second renderer, persisted settings service, replay engine in production or statechart for slider drags. Reuse existing debug stepping/route fixtures wherever possible.

### Bounded comparison protocol

1. Before introducing visual changes, record an Original fixture for each workload. Practice: reset empty, start single-foe round, pass pillar, click/open door, engage skeleton and record a swing. Dungeon: fresh explicit `/?debug&seed=MOURNING-731` navigation (not refresh); walk one route over stairs past an identified landmark into an occupied room. Commit the successful route's concrete tile/entity IDs, ordered inputs, fixed 1/60 action ticks and checkpoint assertions; do not rediscover targets per variant. Use semantic target inputs for route parity; test real screen-space clicks separately.
2. Replay from identical start snapshots; check hero pose/position, door, actors/health, action phase and tick at each checkpoint. Fix viewport 1280×720, DPR 1, high quality, orbit target, beta and logical zoom. For each route pause on its keyed action tick and render at four settled quarter-turns × radii 18/36 without advancing simulation (16 pairs total). Save one paired 5-second clip per route covering movement and the encounter. Use Original and one pinned Tuned recipe (60°, 100%); record exact recipe, build, route, ticks, orientation, zoom and quality beside images/clips under `test-results/visual-trial/`. Do not compare a different camera angle to compensate for the lens.
3. **Performance trial, not a delivery target:** use one named desktop GPU and headed Chromium; record driver/browser, refresh rate and power mode. Replay each pinned action sequence at near zoom, then far zoom, identically in both modes. Warm shaders on one unmeasured replay; measure three paired route replays per workload, alternating which mode runs first, without screenshot/video overhead. Record per-run p95 displayed frame interval (ms) and mean draw calls/rendered frame, each paired Tuned-minus-Original delta, median and min–max across pairs. Before viewing results set allowed increases to **+2 ms p95 and +1 draw/frame** on each workload. All three pairs within both budgets = within budget; consistent excess on either metric = over budget; mixed outcomes = inconclusive. Reject divergent routes or changed hardware/settings; allow one replacement per workload for an invalid pair only. Stop there; no tuning, threshold relaxation or extra seeds to turn a miss into a pass.
4. **Delivery** requires working live controls, correct picks, reproducible pairs and an honest bounded report. A measured regression or noisy result does not promote a treatment or invalidate a working comparison tool; missing control evidence or unmatched gameplay does not count as delivery. Software-rendered smoke timings are not a hardware verdict.

### Alternatives rejected

- Changing FOV alone confounds perspective with zoom. Warping the whole page bends the HUD; warping only the image without mapping picks breaks edge interactions.
- Two simultaneous scenes double the workload and can diverge at combat ticks. Use replay for evidence and switch the same scene for play.

## File changes

| File | Planned change | Why |
| --- | --- | --- |
| `src/machines/ui/visualTrial.ts`, `src/visualTrial.ts` (new) | Mode chart, settings schema, pure transforms | One authority for effective parameters and pick math |
| `src/main.ts`, `src/gameTypes.ts`, `src/visualTrialRendering.ts` (new adapter) | Wire session, camera, distortion, ray and disposal; narrow dev-only replay access | Keep effects at existing game boundaries |
| `index.html`, `src/style.css`, `src/ui.ts` | Practice disclosure, ranges, value outputs and actions; isolate focused/captured input | Accessible adjustment without controlling hero |
| `tests/models/cases.ts`, `tests/visualTrial.test.ts`, `tests/visual-trial-browser.ts`, companion route fixture | Test transitions/math, replay both scenes, check pixels and actual click outcomes, emit captures and metrics | Repeatable red-to-green and visual evidence |
| `README.md`, `VERIFICATION.md` | Explain controls and replay command; record actual run IDs, artifact locations, budgets and outcomes | Others can repeat the comparison |

## Edge cases and failure modes

- Canvas resize, quality scaling or letterboxed pixels: recompute coordinate mapping from current bounds. Clicks on panel/blank pixels must not cancel work or move the player.
- Focus loss, drag cancellation and held keys: preserve existing input cancellation; don't swallow a release that leaves movement/defense stuck. Clipboard denied: offer selectable numeric text, not a false success message.
- Reset/regeneration or inspection mid-trial: detach old scene resources/listeners; reapply settings only to the active gameplay camera. Compare baseline before/after repeated toggles for radius drift or accumulating passes.

## Verification

From the named worktree on Node 22.18+, after implementation:

```sh
node --test tests/visualTrial.test.ts
npm run check:full  # full tests (including typecheck), lint, format check
npm run build
npm run dev         # leave running; next command in another terminal in this worktree
node tests/visual-trial-browser.ts
```

Run the proposed targeted Playwright suite sequentially in real WebGL2 Chromium. Inspect paired stills and clips for hero visibility during rotation, actual barrel distortion and undistorted HUD; run the timed portion headed on hardware separately from capture. Retain the manifest with artifacts, not just a pass count.

## Risks and rollout

Original remains the default and does not install a distortion pass. A post-process can cost a draw and widen frame-time tails: report both routes separately. If picking or framing fails, fix that contract before handing the fixture to 15.2–15.4; if only cost exceeds budget, leave the trial opt-in and document the result.

## Out of scope

Palette/shadow, ink and wear treatments themselves; choosing a winning look (15.5); changing world generation, collision, combat, production dungeon controls or Epic 1's performance baseline.
