# Break the visible right angles

- **Task source**: `docs/plan/roadmap.md:365–367`; panel and comparison contract at lines 353–359.
- **Epic / Story**: 15 / 4; depends on completed 15.1.
- **Status**: proposed
- **Branch**: `epic-15-visual-experiments`

## Goal

Let the player drag **Corner wear** in the Dojo and see the same room acquire leaning masonry, tapered pillars and chipped door and stair silhouettes. The experiment is whether those shapes break up the apparent right angles at gameplay zoom without suggesting a different route. Original remains the control; wear changes neither the seed's contents nor what the player can do.

## Acceptance criteria

- [ ] Tuned has a labelled 0–100% slider and numeric value (default 0). Drag, arrows and numeric edits update the current scene without advancing a round, moving the camera or issuing game input. Original forces zero; reselecting Tuned restores wear, Copy includes the saved value, Reset restores zero. Lens, Fisheye, ink and palette remain independent. No panel or treatment by default in ordinary dungeon play.
- [ ] In matched Dojo and `MOURNING-731` views, wear visibly changes the outer profiles, not just surface shading. Inspect masonry bases, courses, caps and cutaway corners, both pillar builds, the closed and swinging door, and the stair run and arrival. No new daylight through joints, floating trim, false ledges or loss of the hero behind cutaways at any of the four camera sides, near or far.
- [ ] Rebuilding the same seed reproduces the same chips; rotating, zooming and scrubbing wear back to a value do not resample them. Zero after full wear matches the untreated fixed view. No additional mesh/material per chip, change to chunk or cutaway ownership, or expansion of thin instances to individual meshes.
- [ ] Matched inputs give identical floor/door/foe picks and gameplay results, including pillar clearance, door opening, stair path and support, actor poses and grips. Generation, placement, collisions and routes are unchanged.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Wear recipe | `tests/visualTrial.test.ts`, `tests/models/cases.ts` | Zero default; finite/clamped edits only in Tuned; saved vs effective value across select, copy and reset. Exercise existing EDIT partitions rather than adding a machine. | Missing recipe key; edit rejected. |
| Seeded profiles | `tests/cornerWear.test.ts` (new) | Compare actual vertices: zero gives source outline; mid/max give bounded skew, taper and clipped corners. Repeated seed/key and reversed emission order agree; a second seed changes the profile. Check shared endpoints across face/material/chunk boundaries, finite outward triangles and unchanged tread plane on representative thin, rotated and stepped parts. | No profile emitter. |
| Live input and restoration | `tests/visual-trial-panel.ts` | Real slider, keyboard, copy, mode switch and practice reset; visible wear updates at fixed tick, no leaked camera/game command. | Missing control. |
| Silhouette and parity replay | `tests/visual-trial-wear.ts` (new) | Use existing fixture, probes, camera and output helpers; compare geometry, captures, resource counts and action checkpoints as below. Include a positive change check for each subject so two identical untreated runs cannot pass. | Tuned image/geometry identical to Original. |

## Design

1. **Describe wear in local coordinates.** Add a small Babylon-free function producing profile vertices/faces from dimensions, role and a stable cosmetic key (`seed`, wall lattice endpoint/course or prop/entity/tile ID and part). Derive samples by semantic key, not a traversal counter or the existing decoration RNG. Scale fixed offsets by wear; bound them by local dimensions. Reuse one corner solution across the faces that meet there. Pin mating boundaries where separate moving groups cannot share an offset. Preserve deliberate mortar gaps rather than inventing new ones.
2. **Emit into the existing artwork.** Extend `Batcher` only for opted-in profile faces: retain face masks, winding, normals, UVs, tint, room-band/landing attributes, shadow registration and existing material/group keys. Leave `box` and the collision-only batch untouched. Use slanted end profiles for perimeter and practice partition masonry; keep the upper groups' original pivot and base seam through cutaway scaling. Taper the Dojo shaft and dungeon pillar courses relative to the full pillar height, not anew per course. Clip exposed corners on door frame/outer planks in root/hinge-local space; leave latch, seal, pivot and interaction target alone. Clip the exposed stair nosing/riser outline without moving the walkable tread plane or opening holes between tiles. Don't simply chip the thin overlay if the underlying square edge still dominates the silhouette.
3. **Apply edits at the render boundary.** Register only affected visual batches/door parts in a scene-owned wear adapter in trial-capable scenes. Retain original vertex data and derive targets once on first use; on value change update the same mesh's buffers from the immutable source (including indices/normals for clipped faces), not the previous slider position. Restore original buffers and bounds exactly at zero. No geometry work on unchanged frames; release handles on disposal and rebind on regeneration. Keep existing thin-instance rubble/effects untouched. Never feed worn vertices to pick, terrain, collision, placement or rig systems.

### State model and ports/adapters

Reuse `visualTrialMachine`: Original + EDIT is rejected; Tuned + finite recognized EDIT clamps the saved value and emits `apply`; invalid edits have no effect. SELECT applies effective settings without changing the preset; RESET restores defaults; COPY emits the saved recipe with mode. Extend `ViewSettings`/`VIEW_RANGES`, not the state set. The existing `applyView` and `copySettings` ports already separate the chart from Babylon and the DOM. Wire wear through `main.ts` and the existing trial renderer; profile generation is a pure transformation, not a service or a second lifecycle machine.

### Alternatives rejected

- Per-face random jitter would separate shared corners; per-chip meshes would defeat batching. Neither is needed for a broad angular silhouette.
- Regenerating the world on slider input would invalidate a same-tick comparison. A screen-space treatment would not change the door or stair profile in motion.

## File changes

| File | Change | Why |
| --- | --- | --- |
| `src/visualTrial.ts`, `src/ui.ts`, `index.html` | Add recipe key/range and bind labelled inputs like the existing ink control. | One preset and input-isolation path. |
| `src/cornerWear.ts` (new), `src/geometry.ts` | Pure seeded profiles; adapt face emission and reversible mesh updates. | Test joins without Babylon; preserve batching. |
| `src/buildDungeon.ts`, `src/visualTrialRendering.ts`, `src/main.ts` | Tag only affected architecture and pass scene-owned wear application to the trial renderer. | Both fixtures use actual game art; gameplay buffers stay separate. |
| Tests listed above | Add focused core, model and real-browser checks. | Cover decisions, drawn geometry and authoritative parity independently. |
| `README.md`, `VERIFICATION.md` | Document control and reproduction; record actual evidence and limitations after verification. | Keep 15.1 controls and timing conclusions intact. |

## Edge cases and failure modes

- Thin trim, negative chunk coordinates, perpendicular walls and different-height neighbors: cap cuts by the smaller dimension, pin seams, omit a cut rather than invert a face. Check both door axes and partial opening; chips follow the moving leaf, not a world-space mask.
- Rapid 100 → 0 → 50 edits or a reset while Tuned: no accumulated drift, stale mesh writes or additional scene resources. Reapply the saved practice recipe only through the existing settings owner. Ordinary non-trial builds retain the original path.

## Verification

Future implementation gates (Node 22.18+, from this worktree):

```sh
node --test tests/cornerWear.test.ts tests/visualTrial.test.ts
npm run test:models
npm run check:full  # typecheck, full tests, lint and format check
npm run build
npm run dev        # leave running; run the following sequentially in another shell
node tests/visual-trial-browser.ts --panel
node tests/visual-trial-wear.ts
npm run test:browser
```

Use graphical Chromium with the 15.1 reset Dojo round and pinned dungeon route (stairs, landmark, occupied room). Compare Original, Tuned zero and full wear with other treatments at defaults; include a midpoint detail and repeat the seed via fresh explicit navigation. Lock viewport, quality, orbit/target, near/far zoom, action ticks and inputs. Reuse untouched 15.1 controls for matched baseline frames; assert camera and state equality before comparing images. Inspect paired stills at all four sides and short matched motion through cutaway rotation, door swing and stair traversal. Save settings, checkpoints and captures to a fresh ignored `test-results/visual-trial/15.4/` run; never overwrite controls.

Replay identical screen coordinates and compare picked tile/entity ID, door state, blocked/passed pillar approach, route waypoints, step positions and sampled support heights through stair ascent/descent. Compare seed layout/placement fingerprints and fixed-tick rig/grip transforms. Check live mesh, material, batch and thin-instance counts across scrubbing and equivalent resets; no per-chip growth. Report mismatches by seed, subject, tick and camera, not just a gallery of pleasing stills.

## Risks and rollout

An exaggerated cut can read as an opening where movement is blocked. If fixed-view review finds one, reduce that profile's bound or pin its contact edge; don't move the collider. If silhouettes remain square at far zoom, record which subject/view failed rather than counting any pixel difference as success. Keep the experiment opt-in pending 15.5.

## Out of scope

No floor-plan, physics, RNG-stream, interaction, actor or default art changes. No new assets, general mesh framework, combined treatment verdict, hardware timing rerun, `--measure`, rebaseline or performance claim.
