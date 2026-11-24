# EF3 — Explain a rejected seed locally

- **Task source**: `docs/plan/roadmap.md:39–41`; `docs/effect-refactor-plan.md:146–162,228–244`
- **Epic / Story**: 0 / 4; depends on EF2
- **Status**: implemented at `a423dae`; see [verification](../../../VERIFICATION.md#ef1ef4--generation-refactor-and-adoption-decision) and the [trace walkthrough](../../generation-authoring.md#read-an-execution-trace).
- **Branch**: main

## Goal

An author can open one execution and see which stage rejected attempt zero of `trial-23`, why it rejected it, and which attempt succeeded. This must be evidence from the running pipeline, not a reconstruction from its final report.

## Acceptance criteria

- [ ] Real spans have IDs, parents, completion outcomes and elapsed times, correlated with seed, versions, attempt and available room/recipe. Errors keep their domain meaning; no native spans or Error objects retained. Timing never enters `GenerationTrace`, `GenerationReport`, RNG or selection.
- [ ] Versioned local JSON snapshots obey all caps below, including on defects, long reasons, failed sinks and repeated resets. DEV **and** debug required in browser; optional local Node export. Production/no-op has no collector, extra requests, clock reads for collection or per-tile instrumentation.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Actual pipeline parentage | `tests/generation-diagnostics.test.ts` | Run `trial-23`; assert root→attempt→ordered real stages, attempts 0 and 1 closed as validation rejections (inaccessible meat rack, then missing Last Ember site), attempt 2 accepted. Compare exact reasons with EF0; fake monotonic clock proves spans enclose work | EF2 no-op yields no records |
| Close on every exit | same | Success, rejection, exhaustion and injected sentinel defect close retained spans exactly once; defect rethrown by identity. If truncating children, retained parent still closes | No outcome/bracketing yet |
| Stress retention | same | Overflow run/record/byte caps independently, multibyte strings, enormous error with cyclic cause, many seed IDs. Assert UTF-8 serialized size, finite label vocabulary, dropped counts, no arbitrary object fields, detached snapshot mutation, reset/dispose then new run | Unbounded arrays or final-export-only clipping fail |
| Diagnostics cannot affect selection | same | Throw during open, annotate, close, snapshot/export; compare actual off/on/broken outputs and exhaustion reports with goldens; defects unchanged, bounded local warning visible even when sink fails | Throwing sink can replace stage outcome |
| Real consumers | `tests/generation-browser.ts`, `tests/production.ts` | DEV/debug getter returns detached trace for regenerated seed, normal page lacks hook; production even with `?debug` lacks hook, exporter code and telemetry | Getter absent in dev; absence tests characterize production |

## Design

Use EF2's service at actual coarse stage entry and exit. Install an explicit local tracer adapter compatible with the pinned runtime or bracket each stage directly through the service; native spans alone do not export anything. Wrap only diagnostic operations in a nonthrowing boundary, never wrap domain execution in its catch. Close from the real exit before propagating it. Propagate parent handle down the stage calls, not through a global current span. Instrument layout/reservation/placement/validation where executed; source room/recipe from real stage context, omit when unknown. Failure category/reason and attempt index should explain the retry without inspecting mutable world state.

### State model

Collector lifecycle empty → run open → finalized on success/failure/defect → retained or evicted FIFO. A span handle moves open → closed once; unknown/duplicate/retired handles rejected locally without affecting generation. Reset invalidates all handles and releases buffers; dispose disables new recording. Test reset during open and late close. Disabled service is stateless. State decisions return record/drop commands; clock and storage live in adapter.

### Ports and adapters

Generation-owned sync diagnostics port accepts only whitelisted primitive fields. Inject clock/ID source in collector tests. Retain at most 4 runs **including active**, 256 span records/run (open included), 64 KiB UTF-8 serialized envelope/run including metadata, 256 UTF-8 bytes per string and 1 warning code/run with saturating counts. Bound attribute count by schema; reserve header/close/truncation space before accepting records, count rejected additions rather than buffering them. Truncate before encoding/object traversal; never serialize arbitrary causes, worlds, scenes, registries or closures. Bound open handles and parent depth too. Limit exceeded → `truncated`, dropped counts and original terminal status; no orphan records. Metrics keyed only by fixed stage/outcome, never by seed/room identifiers. Test bytes after JSON escaping. Snapshot copies primitive records, not collector internals.

Wire no-op by default. `main.ts` uses guarded dev-only dynamic import before first debug generation; extend typed debug contract with execution snapshot separate from `generationReport()`. Node corpus/gallery opt in explicitly via tooling composition; write versioned sidecars in ignored `test-results/`, one run at a time, never append to deterministic report. Node file error → bounded tooling warning, not a failed generation. No endpoint or global telemetry SDK.

### Alternatives rejected

Wrapping the whole generator yields no rejection location; storing native spans and slicing at export leaves retained memory unbounded.

## File changes

| File | Change | Why |
| --- | --- | --- |
| `src/generation/{pipeline,stages,diagnostics}.ts` | Actual bracketing and bounded primitive context | Correct nesting/outcomes |
| `src/generation/localDiagnostics.ts`, `src/main.ts`, `src/gameTypes.ts`, `tests/browserTypes.ts` | Local collector and opt-in typed getter | Detached author visibility without production surface |
| `tests/generation-{corpus,gallery}.ts` and tests above | Optional sidecars, bounds and isolation checks | Usable Node and browser evidence |

## Edge cases and failure modes

If only space for parent remains, drop child and count it. Handle a throwing sink even while closing a defect span; never lose original cause. Keep a fixed warning flag outside failing sink. No-op must skip building attributes and sampling clocks.

## Verification

```sh
node --test tests/generation-diagnostics.test.ts tests/generation-report.test.ts tests/generation-fixtures.test.ts
npm test && npm run build && npm run check:full
npm run report:generation && npm run test:generation && npm run gallery:generation
```

Exercise sidecar option as well as default mode; inspect `trial-23` trace versus deterministic report. Follow story 1's isolated server rule; root production smoke with owned preview `DEMO_URL` and `npm run test:production`; inspect shipped module graph and request list (same-origin telemetry would also be a failure).

## Risks and rollout

DEV code imported statically can inflate production even without a global. Inspect Vite chunks and repeat EF0 raw/gzip check; reject unverifiable or unbounded observability.

## Out of scope

Remote export, persistent schema migration, Epic 1 frame/hitch profiling, simulation spans and EF5.
