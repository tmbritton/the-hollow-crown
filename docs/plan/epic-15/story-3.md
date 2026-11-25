# Story 15.3 — Outline what the player must follow

- **Task source**: [roadmap, lines 363–364](../roadmap.md#L363-L364); live controls and matched views [lines 353–359](../roadmap.md#L353-L359).
- **Epic / Story**: 15 / 3; depends on delivered 15.1.
- **Status**: proposed
- **Branch**: `epic-15-visual-experiments`

## Goal

Try a dark violet contour that lets the player follow a moving hero, foe and chosen landmark without turning the whole dungeon into a line drawing. Judge it by whether the blade and shield remain legible in motion, not just whether a still looks different. Original stays untouched.

## Acceptance criteria

- [ ] In Tuned, dragging **Ink width** or using its arrow keys changes the current scene immediately. Show the numeric width (0–4 framebuffer pixels, whole-pixel slider steps; 0 = off). No movement, attack, pick, zoom, camera jump or round restart. The setting is independent of palette, Lens and Fisheye; switching modes retains it, Copy includes it, numeric re-entry reproduces it and Reset returns it to zero.
- [ ] At a representative thick setting, living hero and foes have readable exterior contours, as do framed portrait landmarks (including `portrait-15` on the pinned route). Weapon and shield read separately; no joint seams, tile grid, general prop outlines or ink on unselected scenery.
- [ ] Matched approach, swing and shield-raise views read against both lit floor and shadow. Ink tracks the drawn pose without popping on rotation; intact walls hide it and a real cutaway reveals only the visible shape. Hover/target feedback remains distinguishable and picking unchanged.
- [ ] Original and Tuned at zero width introduce no ink pass or changed image. Reset, repeated toggles and scene replacement leave no stale subjects or accumulating render resources. No new pickable, shadow-casting or collision geometry.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Width follows the existing trial contract | `tests/visualTrial.test.ts`, `tests/models/cases.ts` | Exercise Original rejection, finite Tuned edits at/beyond bounds, invalid input, effective vs saved width, Copy and Reset through recorded port effects. | Valid width edit not recognized; default/copy field missing. |
| Live control | `tests/visual-trial-panel.ts` | Drag, arrow, copy, switch back and re-enter a width using the real panel; compare rendered view, scene identity and gameplay input before/after. Repeat at short viewport. | Labeled control missing. |
| Visible silhouettes only | new `tests/visual-trial-ink.ts` | Freeze/replay the same pose at widths 0, 2 and 4. Check changed pixels at an exposed contour and increasing thickness, unchanged joint/floor interiors and an opaque-wall region in front of a known subject. Include a positive exposed view so “nothing drawn” cannot pass. | No positive contour signal. |

First run the existing untreated comparison on the unchanged checkout; keep that evidence separate from the new red tests. Get the settings tests green, wire the control, then make the rendered checks pass. Do not weaken baseline tolerances to accommodate ink.

## Design

**Settings and effects.** Add `inkWidth` to `ViewSettings`, `DEFAULT_VIEW` and `VIEW_RANGES`. Keep the two existing chart states: Original rejects EDIT and applies defaults; Tuned accepts known finite edits, clamps to range and emits `apply`. SELECT applies the corresponding view without clearing saved values; RESET applies defaults and COPY emits saved numbers in either mode. Reuse `VisualTrialPorts` and the range/numeric input bindings; no second toggle, chart or mutable copy of panel state. Babylon work stays behind `applyView` in the scene composed by `main.ts`.

**Render the outside of a subject, not the edges of its parts.** Use one scene-owned, depth-tested screen-space mask of existing drawn meshes. Identify subjects from actor/render bindings and the portrait render roots, not mesh-name substrings or a scan every frame. Give the connected body parts one label per actor; give the held weapon and shield their own labels so their visible profiles survive overlap. Exclude effects, hover/target markers, detached remains and other props. Use the same current transforms, visibility and cutaway decisions as the color draw. Compare against visible scene depth (including non-subject occluders); a subject-only depth buffer cannot reject a wall.

Composite a bounded pixel band along visible label boundaries, favoring the inside of the visible subject so ink cannot bleed onto a nearer wall. Preserve thin blade/shield fill at maximum width. Sample in render-target pixels; resize with the framebuffer. Composite before scene distortion and outside the HUD; never touch the pointer transform. Allocate only for positive effective width, update width without reallocating, release owned targets, pass and callbacks on disable/dispose. Keep unrelated passes intact regardless of enable order.

**Alternatives rejected.** Per-voxel shells draw the joints and multiply meshes; a full-scene normal/depth edge filter inks floors and masonry; reusing hover highlighting makes a permanent contour look like an interaction. None tests the intended silhouette.

## File changes

Expected implementation footprint (not changes made by this plan):

| File | Change | Why |
| --- | --- | --- |
| `src/visualTrial.ts`, `index.html`, `src/ui.ts` | Add width/default/range and labeled range/value pair. | Reuse the generic chart EDIT and panel input isolation. |
| `src/main.ts`, `src/visualTrialRendering.ts`, new `src/inkContours.ts` | Supply scene subjects from current bindings; own the optional mask/composite in a rendering adapter. | Keep subject selection, depth and disposal out of simulation; preserve camera pass order. |
| `tests/visualTrial.test.ts`, `tests/models/cases.ts`, `tests/visual-trial-panel.ts`, new `tests/visual-trial-ink.ts` | Add the focused checks above; reuse route and combat/defense fixtures rather than making another capture framework. | Test the policy separately from actual pixels and input. |
| `README.md`, `VERIFICATION.md` | Explain width/units and record only checks actually run and captures inspected. | Make settings and findings reproducible. |

## Edge cases and failure modes

- No foe, hidden gear, death or practice reset: omit missing/inactive subjects; never resurrect a disposed mesh for the mask. Re-enable on a fresh scene using its own bindings.
- Overlapping actors, a partly hidden shield or a cutaway transition: nearest visible surface wins. Test both sides of the wall boundary, not just a fully hidden actor. Leave existing character shadows unchanged.
- Changing width while fisheye is active must not double-distort or detach another pass. Cycle both orders, resize and regenerate; compare pass/target counts to the starting scene after disabling.

## Verification

From this worktree, Node 22.18+; use a running dev server (`npm run dev`) and run headed Chromium/WebGL2 checks sequentially. The ink script below is the proposed focused check.

```sh
node --test tests/visualTrial.test.ts
npm run test:models
npm run check:full    # typecheck, full core + extended suite, lint, format check
npm run build
node tests/visual-trial-browser.ts --panel
node tests/visual-trial-browser.ts
node tests/visual-trial-ink.ts
```

1. **Control:** run the existing non-timing paired script before and after implementation. Use the preserved 15.1 `before-*` controls and their manifests for the reset Dojo and fresh `MOURNING-731` route; check trace, camera, four turns, both zooms and clips. If controls are absent, capture with `--baseline` on the untreated checkout into a fresh `VISUAL_TRIAL_OUTPUT` first. Never replace historical evidence or bless a post-change baseline.
2. **Isolate ink:** in a separate `test-results/visual-trial/15.3` run directory save width-only pairs (palette off, default lens, fisheye zero). Match seed, viewport/DPR, quality, orbit, zoom, inputs and fixed ticks. Use the practice route past the pillar and door to the optional skeleton and the dungeon route past the portrait, stairs and occupied Bakery. Compare gameplay traces and actual floor/door/foe picks; do not treat the historical wide/fisheye Tuned recipe as an ink comparison.
3. **Action and occlusion:** reuse the combat/defense setup for a real swing and shield raise. Pin the approach, wind-up, impact and raised-guard ticks from action state. Repeat on lit and shadow backgrounds; capture paired stills and short rotation sequences including near/far views, an intact occluder, partial cover and a revealed cutaway. Exercise neutral, hovered and targeted foe at the same pose. Inspect frames at gameplay size for blade direction, shield face, stable contour, visible-only pixels and distinct feedback. Record settings, ticks, views and any misread; mismatched poses or a missing shield raise invalidate the pair.

## Risks and rollout

The main risk is a plausible still that hides a combat tell or draws a hidden actor during rotation. Require the motion/occlusion evidence above; flag the failing view instead of promoting the variant. Keep the treatment opt-in with width zero by default even if the comparison succeeds.

## Out of scope

No changes to gameplay, rig poses, targeting, camera math, palette design or chipped geometry. No adoption decision, combined-style study or Low/High performance matrix (15.5). Do not run `--measure`, reopen the stopped 15.1 timing trial, revise budgets or infer a performance result from these captures.
