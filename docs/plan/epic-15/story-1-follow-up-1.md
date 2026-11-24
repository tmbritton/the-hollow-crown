# Story 15.1 follow-up 1 — Keep published evidence after a concurrent failure

- **Task source**: Third review of [Story 15.1](story-1.md); [`tests/visual-trial-output.ts:25–54`](../../../tests/visual-trial-output.ts#L25-L54); [roadmap, lines 353–359](../roadmap.md#L353-L359).
- **Epic / Story**: 15 / 15.1
- **Status**: proposed
- **Branch**: `epic-15-visual-experiments`

## Goal

A panel run that returns an evidence path must still be readable if an overlapping baseline subsequently fails. Baseline reserves a previously absent root, but timing, paired and panel writers can immediately use it as their parent. Creating that directory first does not confer ownership of everything later written beneath it. This supplement changes rollback only; the [complete original plan](story-1.md) and [verification record](../../../VERIFICATION.md#story-151--pinned-visual-comparisons) remain in force.

## Acceptance criteria

- [ ] Across all ordered pairs of baseline, timing, paired and panel on one output root, failure removes only the failing invocation's staging contents. No peer loses an active stage, published path or artifact bytes. A refused reservation never enters capture or performs cleanup.
- [ ] Ordinary capture/validation or rename failure publishes no partial result, rejects with the failure and leaves no owned `.pending`. An empty reservation can be released without deleting any sibling data. Existing overwrite guards, return paths and the single rename after validation remain unchanged.
- [ ] Focused regressions, full checks and build pass without writing to the historical trial directory or reopening the stopped experiment.

## Test plan (write these first)

Use `node:test` and `node:assert/strict` in `tests/visualTrialOutput.test.ts`. Give each case a fresh temporary parent and an initially absent child root. Use the real publisher and filesystem; callbacks write distinct nested marker files instead of launching Chromium.

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Panel publishes before baseline fails | `tests/visualTrialOutput.test.ts` | In baseline's capture callback, write a partial marker, await a complete panel publication to the same root, save its returned path and read its bytes, then throw a specific validation error. Outside the callback assert that error, re-read the exact panel bytes at that path, and assert baseline `.pending` and baseline `evidence` are absent. | Red: the second read gets `ENOENT` because rollback removed the root. |
| Ordered mode pairs | Same | Parameterize the schedule above. Where both writers are admitted, assert inner publication survives outer failure. For a second baseline (after any mode), or a second timing while timing is reserved, assert the inner call rejects before capture, then let the outer writer publish and verify its bytes. Include paired/paired and panel/panel. | Baseline then timing/paired/panel lose the inner publication; other rows protect existing behavior. |
| Peer still staging during rollback | Same | Hold a panel callback after its marker write using a deferred promise; wait for its ready signal inside baseline capture, fail baseline, then release panel and await its publication. Check the panel marker and absence of failed baseline output. Release gates and settle writers before fixture teardown, even on assertion failure. | Red: panel cannot rename its deleted stage. |
| Isolated failure and retry | Same | For each mode, throw after a staged write, check no failed output or stale reservation blocks a fresh invocation, then publish successfully. Keep the existing legacy-file, overwrite and paired-rerun tests. | Compatibility guard: already green. |

## Design

### State model

Keep ownership visible in the helper's linear control flow. `unreserved → reserved` only on exclusive reservation; refusal is terminal with no effects. `reserved → staging` only after exclusive `mkdir(stage)` succeeds. Only `staging` grants authority to recursively remove that stage. If stage creation fails, do not remove the entry whose creation failed. Capture success permits `rename(stage, evidence)`; successful rename ends ownership of the staged tree and returns the published path. Capture or rename failure discards the owned stage, then attempts to release the empty reservation. Published and failed calls are terminal; no cleanup transition exists from published. Scoped error handlers suffice; no gameplay statechart or lifecycle flags are needed.

### Ports and adapters

Keep `publishVisualTrial(root, mode, validateAndCapture)` as the boundary. The injected callback writes only under its stage; the Node filesystem helper owns reservation, rename and rollback. The browser runner remains the composition root. No new storage abstraction is needed: a temporary-directory integration test exercises the actual filesystem operations that determine ownership.

Use recursive removal only on the successfully created `.pending`. Release a directory reserved by this invocation with a **non-recursive** `rmdir(run)`; this matters most when `run === root`. A nonempty-directory result means leave it intact; absence requires no further action. Never release the common parent created opportunistically by a non-baseline writer. Preserve the capture/publication error; if cleanup itself fails unexpectedly, surface both causes rather than retrying with a broader delete.

### Alternatives rejected

- Listing the root before recursively deleting it leaves a race between inspection and deletion. An empty-directory removal lets the filesystem enforce the condition in one operation.
- Serializing all writers or changing the baseline evidence layout would change supported overlap or reader paths to solve a rollback defect.

## File changes

| File | Planned implementation change | Why |
| --- | --- | --- |
| `tests/visualTrialOutput.test.ts` | Add the ordered overlap and rollback cases above. | Distinguish private staging from shared evidence without timing assumptions. |
| `tests/visual-trial-output.ts` | Narrow rollback targets and separate reservation from successful stage creation. | Enforce the same ownership rule for all four writers. |

## Edge cases and failure modes

- A failed baseline alone can release its empty root; if a peer has created a child, baseline must leave the root and a subsequent baseline must still refuse it. Never sweep other entries to make a retry possible.
- Occupied timing files, an existing `timing-run`, and an existing baseline root still fail preflight. A permissions error is not evidence that a directory is empty or owned.
- An interrupted process may leave staging behind. Recovery of stale runs is not part of ordinary rollback; guessing ownership on startup would reintroduce deletion risk.

## Verification

From the named worktree on Node 22.18+, run the output test first to establish red, then after the fix run:

```sh
node --test tests/visualTrialOutput.test.ts tests/visualTrialCamera.test.ts tests/visualTrialMedia.test.ts tests/visualTrial.test.ts
npm run check:full  # typecheck, core + extended tests, lint, format
npm run build
```

Report actual results separately from historical passes. Have a fresh reviewer check every recursive removal target and the full Story 15.1 criteria against the retained evidence, not just the new test. This plan is not a delivery verdict.

## Risks and rollout

The principal compatibility risk is leaving an empty fixed-name reservation that prevents retry; the isolated failure test detects it. The converse risk is deleting another writer's output to clear a reservation; the overlap tests check paths and bytes after rollback, not just that both callbacks ran. No migration or change to existing artifacts is required.

## Out of scope

Do not replace the original plan, verification history, captures or timing reports; change no renderer, camera, media thresholds, routes or budgets. The bounded three-pair trial stopped without tuning: practice met both budgets, dungeon exceeded the +1 draw/frame budget in every pair (median +73.251 draws; median p95 delta +7.3 ms against +2 ms). No replacement pairs, hardware rerun, promotion of Tuned, roadmap completion or unblocking of dependent stories follows from this cleanup fix.
