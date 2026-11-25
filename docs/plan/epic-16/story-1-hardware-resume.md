# Story 16.1 — Matched hardware resume (historical)

- **Task source:** [Roadmap, lines 138–145](../roadmap.md#L138-L145).
- **Status:** historical operator addendum for `main` at `30b02dd`, not a runbook or authorization to rerun.
- **Original goal:** obtain one auditable disposition under [Story 1’s frozen workload, visit cap, ledger and decision rule](story-1.md#design). The [scaling validator](story-1-follow-up-1.md), [writer and traversal accounting](story-1-follow-up-2.md) and [unresolved sweep rule](story-1-follow-up-3.md) still apply unchanged.

## Recorded outcome and current hold

The [hardware resume report](../../epic14-startup-fps.md#story-161-hardware-resume-on-30b02dd-2026-11-25)
records a successful matched, headed RTX 2070/WebGL2 preflight, followed by a `shrine-count`
stop due to writer trace overflow and checkpoint mismatches. With 0/3 complete count visits
and 0/5 native timing visits, the run remains **stopped/inconclusive**, not a negative
feasibility verdict. Story 16.2 remains blocked.

Independent approval of the offline follow-up did not clear a live capture. The unflagged
collector remains held before GPU probing, browser launch, or preflight. Do not attempt a
replacement visit with it. The [offline verification report](../../../VERIFICATION.md#story-161--offline-review-of-hardware-40phah)
explains the required redesign: non-mutating writer capture, independent checkpoints with
hooked/unhooked parity, and bounded live handoff and scratch replay that preserve native
scheduling and the frozen batch mix. Bounded offline transport alone does not meet that bar.

## Archived operator procedure (not for execution)

1. From the repository root on the matched Ryzen 5 2600X / RTX 2070 desktop, run `node tests/cursor-attribution.ts` **without flags**. Use the normal graphical session; leave the headed Chromium window foreground, with no physical pointer input, other suites or simultaneous builds. `--smoke` and `--scaling` alone cannot supply hardware evidence.
2. Require the runner’s pinned production inputs, probe and bundle hashes, actual WebGL2 renderer and foreground refresh to match the frozen setup. Match fresh `MOURNING-731` visits on 24 live enemies, camera, quality/lens, viewport and ready geometry. Verify the displayed out-of-reach entrance shrine/restore, clear floor and idle cases; match rays and geometry across timing and count visits. Do not substitute historical pixels or rows.
3. Preserve the entire fresh `test-results/epic16/` run directory, including partial captures, provenance, raw visits, scaling, replay, writer traces and `readout.json` when present. Record run ID/path, stage, reason and last valid evidence. Review parity, calibration and recurring costs (including floor/idle), then independently reconstruct the three shrine ledger rows and apply the frozen spread/error gate. An exit code alone is not a verdict.

## Original acceptance and stop rule

| Evidence | Operator action |
| --- | --- |
| Matched hardware unavailable before start | Record **pending**; no software fallback. |
| Preflight mismatch, lost foreground/device/context, incomplete capture, invalid attribution or unresolved upkeep | **Stopped/inconclusive**. Keep the evidence; never fill gaps with zero. On Xid/device fault stop immediately: no replacement visit, reset or recovery attempt. |
| Complete matched evidence misses the gate | **Negative**. Stop; do not sample again or tune the threshold. 16.2 stays blocked absent a newly evidenced bottleneck. |
| Complete matched evidence passes and independent review confirms it | **Positive feasibility**, not a delivered speedup. Plan 16.2 next; plan 16.3 and 16.4 in dependency order, not as part of this run. |

## Original test plan and verification if tooling is invalid

Before fixing anything, reduce the archived failure to a deterministic `node:test` case in the affected `tests/cursor-*.test.ts` suite. Show red for the specific capture, replay or admission defect; fix only the test-side adapter or pure policy implementation, not the frozen rule. Confirm green with `node --test <affected-test-file>`, retaining a valid control. Run `npm run check:full`, `npm run test:browser`, and `npm run build && npm run test:production` sequentially; with `npm run dev` running, run `npm run test:epic14`. Record actual results separately from hardware evidence. After review, any corrected capture starts with fresh provenance and a new run directory; never overwrite or splice the stopped run.
