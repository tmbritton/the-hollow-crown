# CPU6a follow-up 1 — sample the current rig, reuse only certified publications

- **Task source**: Third CPU6a review, CHANGES REQUESTED; [CPU6a backlog contract](../cpu-performance-plan.md#cpu6a--only-construct-animation-geometry-when-needed) and [original implementation plan](cpu6a-animation-geometry.md).
- **Epic / Story**: CPU performance / CPU6a, living clearance geometry.
- **Status**: Implemented and included in the [final independent CPU6a **APPROVE**](../../VERIFICATION.md#cpu6a--animation-geometry).
- **Branch**: `main`, working tree over CPU5 `f3fa9a3`.

## Goal

A tail should avoid the equipment its neighbor draws now, not equipment the neighbor used to draw. Editing an attachment should cost one fresh body publication when next needed, not one on every subsequent demand if the renderer still owns all inputs.

## Acceptance criteria

- [x] An unowned replacement publishes exactly its current drawn body and tail members on demand. A newly attached clone appears; removing a still-enabled mesh withdraws it. With empty membership and no cargo there are zero enabled boxes (the review observed 34). In-place edits to the same unowned list or mesh are visible on the next demand.
- [x] After `ActorGeometry.edit` or `replace`, a demanded certified body publishes once from current world transforms; repeated unchanged requests return `false`, retain the body snapshot by identity and perform no surface checks or box builds. Each subsequent relevant invalidation refreshes the result on the first demand, even at a fixed root. No demand means no publication.
- [x] All eight world corners agree with the drawn mesh on re-entry; later publications do not mutate retained inspection corners. Tail-only work does not dirty unchanged bodies or skip a required final tail update.
- [x] Retain the original settled, replay and browser gates. No broader timing or acceptance claim from passing the two repros alone.

## Test plan (write these first)

Use isolated `node:test` cases with the existing Babylon binding fixture. Compare enabled membership in both directions using uniquely named fixture meshes. For the oracle, update the actual ancestors parent-first, transform the eight local min/max corner combinations by each mesh's world matrix and compare coordinates within the existing `1e-5` edited-piece tolerance. Do not derive expectations from the binding's source arrays or its sampled bounds.

| Test | File | Behavior pinned | Expected first run on current tree |
| --- | --- | --- | --- |
| Replacement membership at fixed root | `tests/rig-bindings.test.ts` | Warm an owned publication, replace the render component without registering an owner. Keep one original, omit another still enabled, add a rotated/offset drawn clone. Check exact members and corners; mutate the same list to empty and back; move/reparent the clone without changing list identity. Sample after each change. | Red: clone missing and old sources survive, including after clearing. |
| Owned layout reuse | `tests/rig-bindings.test.ts` | Extend the edited equipment fixture: change offset while unsampled, request once (`true`), retain snapshot, request again (`false`) after identical final writes. Repeat after `replace` adds and removes a visible piece. Compare corners and retained values separately from identity. | Geometry parity already green; unchanged demand currently returns `true` because `edited` stays set. |
| Invalidate one input at a time | `tests/rig-bindings.test.ts` | After a certified hit, vary articulation, equipment visibility, root enable, owned parent transform/scale, local bounds, disposal, cargo identity/revision and geometry revision. Expect miss then hit for certified inputs; unversioned cargo must keep missing. Swap to an unowned lookalike sharing the old root/list: mutate a child between demands and require current corners, never a hit. | Existing invalidations are guards; post-edit hits and unowned live corners expose the blockers. |
| Neighborhood exit and re-entry | `tests/rig-tail-clearance-browser.ts` | Extend the targeted neighbor fixture: while outside demand, edit the owned attachment or substitute an unowned list. At the inclusive boundary compare current membership and all corners before accepting clearance. Include a child under a tail link, then hide/remove it. For the owned case count one body publication on entry and none on unchanged overlapping demand; trace no body surface work on the hit. | Existing distance/order checks stay green; old-source replacement and permanent post-edit misses go red. |

## Design

Make two decisions in `src/rigs/bindings.ts`, not one. Today `publish` selects live sampling only for `geometry?.edited`, so an absent owner takes the authored branch. Conversely `sampleSurfaces` requires `!geometry.edited` for a body hit, so a valid owner can never reuse after its first edit.

| Current render | Geometry source on a miss (body or tail) | May skip a demanded body publication? |
| --- | --- | --- |
| Original closed, unedited layout for this binding | Existing authored sources and frame offsets | Yes, on a complete key match |
| Writer-owned edited layout | Current `render.meshes`, actual parent chain and local bounds | Yes, **only** with complete writer coverage and matching key |
| Unowned/replaced or ownership mismatch | Same live enumeration, even for a list of length zero | No; re-read each demand |

Use the existing `actorGeometry(render)` identity/ownership check, not structural equality or a revision number in isolation. Preserve the live branch's visibility/disposal filters, tail ancestry classification, authored root-join flags and surface budget; append separately supplied drawn cargo only to bodies. Missing render supplies no rig members. Do not clear `edited` after sampling: the new offset remains authoritative on the *next miss* too.

Keep the body key binding-local: final body writer revision, owner identity and revision, exact membership, effective root enablement, cargo identity and writer revision. Body dirty + no demand → defer; demand + miss → build then record successful publication; certified unchanged demand → return before visiting meshes. An uncertified read must not leave an earlier certificate valid for its newly published buffers. Keep tail-only publishing and copied inspection snapshots separate. Audit changed parentage: a member driven by an external mutable ancestor, visibility toggle or cargo writer not covered by those revisions must stay on live validation, not become certified merely because it was inserted via `replace`. Require further controlled writes to go through the writer; opt out where that guarantee cannot be made.

### Alternatives rejected

- Filtering old sources by list membership fixes removal but cannot discover a new clone or correct a changed parent transform.
- Always walking edited meshes fixes correctness but violates the unchanged-work contract. Conversely trusting list identity, freezing the list, or wrapping arbitrary replacements in a new owner cannot certify mesh or ancestor writes.

## File changes (future implementation)

| File | Change | Why |
| --- | --- | --- |
| `src/rigs/bindings.ts` | Separate source selection from the early body hit; preserve current key invalidations. | Both faulty branches are local to the binding. |
| `src/actorGeometry.ts` | Retain the closed-writer contract; narrow eligibility here only if needed to exclude unsupported layouts. | This owner knows the difference between writer edits and arbitrary replacements. |
| `tests/rig-bindings.test.ts` | Add independent replacement, reuse and invalidation cases above. | Isolate correctness from work avoided. |
| `tests/rig-tail-clearance-browser.ts` | Exercise demand, re-entry and both surface partitions on real actors. | Direct binding calls alone cannot establish same-step clearance. |

## Edge cases and failure modes

- Disabled ancestor, invisible or disposed child, removed but still drawn scene mesh → no enabled member unless both listed and drawn. Re-entry after an empty list must not resurrect old links.
- Same ID or same root after replacement/reset is not the same owner. Never reuse across bindings. Inspection at zero elapsed time is not a validity signal.
- Reparenting across the body/tail boundary changes partition; do not infer tail membership from a mesh name. Preserve ordered solve, candidate-specific checks and once-per-unordered-pair final validation.

## Verification

Capture the two independent reds before changing production code. After green, run:

```sh
node --test tests/rig-bindings.test.ts tests/rig-tail.test.ts tests/corpse-terrain.test.ts
npm run check:full  # typechecked core + extended tests, lint, format:check
npm run build
```

With `npm run dev -- --port 5173 --strictPort` in another terminal, run focused browser checks sequentially:

```sh
npm run test:rig:tails:clearance && npm run test:inspection && npm run test:cpu:regressions
```

Keep the [original verification gates](cpu6a-animation-geometry.md#verification-gates), including production checks, Firefox movement and hardware profile. All listed browser gates have passing round 2 runs. Distinguish carried-forward results from follow-up reruns; rerun affected gates if the diff widens. Preserve the matched RTX 2070 replay (`926cd1a6`, 614 probe locations), zero settled mesh visits/support lookups/list rebuilds over 180 ticks and zero paused mesh visits. If touching the measured path or updating performance evidence, repeat the documented matched run with CPU5 served on 5187: `CPU_GPU=hardware CPU5_URL=http://127.0.0.1:5187 node tests/cpu-animation-geometry-browser.ts`. Compare checkpoints before counts and timing spreads; the prior run did not establish a general FPS win.

## Risks and rollout

The main risk is a false hit with plausible-looking stale geometry. Review both the fast return and the source used on the next miss; require an independent recheck with same-list mutation and post-edit repeated demand. Keep CPU6a open until the recheck passes. If a writer cannot certify its inputs, pay for the live scan there rather than weakening the oracle or disabling reuse for every edited actor.

## Out of scope

No settled-cache redesign, demand radius/order change, tail collision-result cache, gameplay/physics changes, CPU6b scheduling, CPU7 acceptance or broad benchmark retuning. Review round 1 adds the same ancestor-ownership gate to living body reuse and settled contact reuse; open layouts keep live sampling.
