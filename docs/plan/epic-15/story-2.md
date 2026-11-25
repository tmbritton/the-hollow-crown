# Story 15.2 — Compose the room in three values

- **Task source**: [roadmap lines 360–362](../roadmap.md#L360-L362); inherits the [live comparison controls, lines 353–359](../roadmap.md#L353-L359).
- **Epic / Story**: 15 / 15.2; dependency 15.1 delivered (see `VERIFICATION.md`, “Pinned visual comparisons”).
- **Status**: proposed
- **Branch**: `epic-15-visual-experiments`

## Goal

At far gameplay zoom the player should see a landing, a path across the floor, a hazard and a shrine as distinct shapes, not have to resolve individual tiles. Trial three broad values of one hue per room against a dark saturated void. Let the player adjust hue and how much architecture falls into shadow in the existing practice panel, without changing the camera or the round.

## Acceptance criteria

- [ ] Both entry points still start in Original. Palette-only and camera-only Tuned comparisons are possible. Switching back restores the untreated floor, lighting, fog and background at the same orbit, zoom and simulation state.
- [ ] In Tuned, labelled Room hue (degrees) and Shadow coverage (%) ranges and exact numeric fields update the same scene on the next frame. Pointer/keyboard edits do not command the game. Copy, re-entry, mode switching, round reset and settings reset obey the delivered 15.1 contract, including the short viewport.
- [ ] With the palette enabled, show icy blue stairs with small amber lights, a purple chamber and a green shrine. Dark, mid and light architectural masses remain ordered and chromatic across the control ranges. Even the deepest shadow and empty background are neither black nor neutral grey; bright contrasting hues mark focal points, not every tile or piece of trim.
- [ ] Increasing coverage expands the dark area on a fixed lit view; it does not just dim the whole frame. Coplanar safe floor has no regular seams, checks or scratch noise. Preserve actual steps, drop edges, bridge, liquid boundary, character shadows and wall cutaways.
- [ ] On matched far views a reviewer can point to the landing, safe floor, hazard and shrine without labels, map or close-up texture. Record the indicated positions against actual world features. A missing or misidentified feature is a failed check, not evidence of better readability.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Trial edits and isolation | `tests/visualTrial.test.ts`, `tests/models/cases.ts` | Default/disabled control, valid and rejected edits, both bounds, copy/re-entry/reset, remembered Tuned recipe; palette edits leave Lens/Fisheye alone | Red: keys and treatment selection absent |
| Swatches and thresholds | `tests/roomPalette.test.ts` (new) | Stair/chamber/altar roles, passage fallback, hue wrap, ordered luminance and nonzero chroma after RGB8 rounding, monotonically growing dark classification for fixed light samples at 0/50/100% | Red: no palette policy |
| Panel to rendered frame | `tests/visual-trial-panel.ts`, targeted palette probe | Real drag, arrows and numeric entry change floor hue/shadow area; switch away/back, copy and reset, verify no hero intent, camera change or recreated scene | Red: no controls or pixel response |
| Matched room details | `tests/visual-trial-palette.ts` (new) | Current Original vs treated vs restored Original: sample void, lit/shaded masonry and a flat multi-tile strip away from shadow/geometry boundaries; reject unchanged treatment, repeated floor lines and unrestored control | Red: floor retains tile pattern; no treatment |

## Design

**What to take from the studies.** In the primary checkout's `ref/images/753329154_…jpg`, the pale purple floor connects the bridge to the dais against a deep violet surround; the yellow faces and blue lights occupy very little area. `902591866_…jpg` uses broad warm planes to separate levels. Borrow the allocation of light and color, not the hatching, black ground or assets.

**Where the grid comes from.** `src/materials.ts:50–82` adds wood grain, floor hash/seam/inset/scratch or masonry flecks, then mixes the lit result only 72% toward its bands. `buildDungeon.ts:152–179` also bakes random tint per tile into `Batcher` vertex colors and overlays trim on steps. Removing the seam expression alone leaves a checkerboard. Leave the Original path and decoration RNG consumption intact. On treated architecture bypass both the patterns and tint; classify incident light (including received shadows), not final noisy albedo. Use two ordered thresholds, with derivative-width antialiasing only at boundaries. Move the dark cutoff through a bounded interior range so neither endpoint flattens the landing. Map classes to three swatches, not three multipliers on the old material. Match scene clear and distance fog to a saturated ink hue; verify final pixels after fog/glow.

**Room assignment.** Derive a small role at scene build from existing tile room/surface: stairs and passage stairs blue, altar green, ordinary rooms/Dojo purple; unowned passage floor uses a stable chamber fallback. Room hue is the Dojo's dominant hue (0–360°, default 275°); rotate the other base hues by the same offset (stairs 210°, altar 145° at default). Coverage 0–100%, default 50%, controls a threshold, not a promise about the percentage of screen pixels. Build the three swatches with a positive saturation floor and separated display luminances. Keep true elevation boundaries and reserve contrast for landing tops, the shrine focus and small existing flame/rune lights. Give lava/water a broad, identifiable surface and shore rather than depending on the existing animated cracks/waves for recognition. Keep actors, indicators, portraits and UI on their own materials.

Carry room role on batched environment vertices (a constant per face, independent of tint); resolve prop/wall ownership from the supporting tile, not the player's current room. Use the same bounded set of environment shader uniforms across chunks. Distinguish environment draws from shared actor materials; do not globally recolor every use of `stone` or `bone`. Reuse thin-instance groups with a role attribute where needed. Slider edits change uniforms and scene colors, not geometry, meshes or shader definitions.

### State model and ports

Extend `visualTrialMachine`, not the game session. `original(saved)` always applies control and rejects edits. `tuned(saved)` accepts a palette enable switch (default off to preserve camera-only recipes) and finite hue/coverage edits clamped via `VIEW_RANGES`; unknown/nonfinite edits have no effect. `SELECT` in either state applies the selected effective recipe without losing saved values, including on self-selection. `RESET` in either restores all saved defaults and applies; `COPY` serializes mode and all saved settings including enable, hue and coverage without a transition. Round reset rebinds the saved session to the live scene; reload starts Original. No second chart for continuous slider movement.

Keep palette selection and threshold math pure TypeScript. The existing `applyView` and `copySettings` callbacks are the ports: `src/main.ts` wires effective settings to scene-local Babylon material/fog and camera adapters; `bindVisualTrialPanel` translates DOM events and handles clipboard fallback. No gameplay dependencies on shaders, clipboard or DOM; reuse the dev-only dungeon trial entry for evidence, not a production dungeon panel.

### Alternatives rejected

- A fullscreen posterization pass colors actors and feedback and cannot recover room ownership or remove a baked grid reliably.
- Changing global lights on room entry makes two visible rooms share one hue and causes pops at doorways. Materials or meshes per tile would discard existing spatial batching.

## File changes (planned implementation)

| File | Change | Why |
| --- | --- | --- |
| `src/roomPalette.ts` (new), `src/visualTrial.ts`, `src/machines/ui/visualTrial.ts` | Role/swatches/thresholds, bounds and saved/effective settings | One reproducible recipe |
| `index.html`, `src/ui.ts` | Extend existing disclosure and paired range/number bindings | Accessible live edits, same input boundary |
| `src/materials.ts`, `src/buildDungeon.ts`, `src/geometry.ts` | Tag environment batches; branch architectural and liquid shading, retain Original | Remove both sources of grid without changing support or batching |
| `src/main.ts`, `src/visualTrialRendering.ts` | Apply/restore palette and clear/fog on active scene; leave camera math alone | Scene lifetime owns GPU state |
| Test files above | Extend existing model/panel cases and reuse `tests/visual-trial-fixture.ts` for focused pairs | Pin policy separately from actual WebGL output |
| `README.md`, `VERIFICATION.md` | Describe new controls; record actual run, recipes, views, failures and evidence paths | Reproducible handoff, not adoption |

## Edge cases and failure modes

- Hue 360° equals 0° visually; preserve the entered number in copied settings. Coverage extremes must leave a visible safe-floor/void distinction. Test final swatches rather than banning `Color3.Black()` used internally to disable specular light.
- At room/chunk boundaries and rotating cutaways, the same face keeps its role. No per-tile color discontinuity on continuous floor; legitimate door thresholds and stair risers stay visible. No change to pick meshes, collision or routes.
- After toggles, practice reset or scene disposal, no stale fog, duplicate observers or extra material per edit. Missing clipboard permission still gives selectable settings; missing ignored references must not affect the build.

## Verification

After implementation, from this worktree (Node 22.18+):

```sh
node --test tests/roomPalette.test.ts tests/visualTrial.test.ts
npm run test:models
npm run check:full  # full tests including typecheck, lint, format check
npm run build
npm run dev         # leave running; in another terminal run sequentially:
node tests/visual-trial-browser.ts --panel
node tests/visual-trial-palette.ts
```

Use one Chromium WebGL2 capture session, High, nominal 1280×720/DPR 1, baseline 0.65-rad Lens and zero Fisheye. Use the delivered reset Dojo inputs and fresh `/?debug&seed=MOURNING-731` route (passage-13 stair at tick 430). Pin one far view each of Dojo, stair landing, lava/bridge and altar; for features outside the route use fixed camera targets from that seed's world data, explicitly labelled supplemental stills, not route outcomes. Capture Original/Tuned at the same tick, camera target/angles, logical radius 36, viewport and actual framebuffer; reject mismatches. Add one near floor crop across several tile boundaries and one short matched turn across the landing to inspect seams or band shimmer. Use one fixed Dojo crop to compare coverage endpoints with hue held fixed. Compare restored Original against the first Original using the delivered decoded-pixel tolerance. Record landmarks identified before revealing the annotated key. Save stills, turn samples, settings and checkpoint manifest to a fresh ignored `test-results/visual-trial/15.2/` run directory; never overwrite 15.1 controls or reports. Stop after these probes; document a failed or unavailable view, do not hunt for a more flattering seed.

## Risks and rollout

Fog can erase band separation and glow can spread a jewel accent across the floor. Inspect the actual far frame, not just palette swatches. If the reviewer loses a hazard or landing, record the view and leave the trial unaccepted; do not solve it with tile outlines. Ship only as a selectable practice experiment, Original by default. Disabling the palette is the immediate rollback.

## Out of scope

No imported art, new room layouts, simulation or camera/picking changes, ink contours (15.3), chipped geometry (15.4), combined-treatment study, Low/High performance matrix or adoption decision (15.5). Do not run `--measure`, reopen the stopped 15.1 Lens/Fisheye performance campaign, change its budgets or infer a performance win from these captures.
