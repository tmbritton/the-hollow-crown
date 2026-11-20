# Effect adoption — procedural workflows and resource ownership

**Status:** planned; no production adoption has started. **Date:** 2026-11-20.

**Scheduling:** complete the current animation work first. A2/A3 are delivered; continue the
existing A4–A7 and P8/P9 sequence in the [implementation path](implementation-path.md).
Schedule EF0–EF4 below **before the next expansion of procedurally generated features**—new
scene recipes, keep variants, adventure grammars, or generated encounters/objectives. The default
insertion point is after P9; if content work is rescheduled, carry this prerequisite with it.

EF5 is a separately scoped resource-lifecycle follow-up, evaluated after the generation pilot.
It is not required to resume content work once EF4's adoption gate passes.

## 1. Goal and rationale

Use Effect to compose meaningful procedural operations with typed failures, explicit service
requirements, and useful execution traces. Keep the domain algorithms deterministic and readily
testable, and preserve the authoritative fixed-step simulation.

The intended improvements are:

- **Composition:** required generation stages share one execution/error model; optional placement
  outcomes remain explicit data, and recovery policy stays at the appropriate enclosing stage.
- **Reliability:** expected placement rejection is distinct from a programming defect; resource
  acquisition can eventually be paired with run-owned cleanup.
- **Testability:** inject stage failures and diagnostic services to exercise recovery, isolation,
  and partial-build cleanup alongside the existing geometry and model tests.
- **Observability:** correlate seed, versions, attempts, rooms, recipes, failures, and stage costs
  without changing the deterministic generation report.

This refactor does not add content. Retain the existing visual composition, art direction, seed
interpretation, progression, actor population, gameplay timing, and resource budgets at cutover.

### Research checkpoint, not a production baseline

The evaluation used application commit `d23ced6`, published **Effect 4.1.5**, and upstream source
commit [`66ab9920271ee7fec3be3f4e3b4438d9222578b1`](https://github.com/Effect-TS/effect/tree/66ab9920271ee7fec3be3f4e3b4438d9222578b1).
An isolated prototype preserved complete worlds/reports for `MOURNING-731` and `trial-23`, captured
nested spans, distinguished generation exhaustion from defects, and disposed a Babylon NullEngine
scene/mesh after an injected later failure. It passed strict TypeScript/native Node execution.

Exploratory Node FK timings for 25 twenty-joint rigs were 0.046 ms for ordinary calls, 0.052 ms
for one Effect around the whole operation, and 0.165 ms for one Effect per joint. An isolated
esbuild generation entry gained **33,368 gzip bytes** with the Effect adapter/services/spans.
These are neither browser frame-time measurements nor a Vite application bundle delta. Rebaseline
against the completed animation/death-physics implementation in EF0.

The scratch clone/probes were under `/tmp/opencode/effect-source` and
`/tmp/opencode/effect-evaluation`; they may disappear and are not implementation dependencies.
The durable contracts, source references, and verification requirements are recorded here.

## 2. Scope and architectural boundaries

| Area | Intended treatment |
| --- | --- |
| Whole generation, attempts, required placement and validation | Coarse composable Effects with explicit expected failures and bounded recovery |
| Keep/history generation, scene searches, RNG draws, reachability and geometry math | Ordinary functions called by those stages |
| Diagnostics/report export | Replaceable service; bounded local tracing, deterministic metadata kept separate |
| Runtime scene construction and retirement | Separate EF5 run-scope integration, after generation proves worthwhile |
| Animation/IK, navigation kernels, combat, objective clocks and statecharts | Retain synchronous domain functions, ECS ownership, XState snapshots and caller-owned clocks |
| Workers, remote telemetry, persistence schemas and broad test-tool migration | Future work driven by a concrete requirement |

### Proposed module shape

These filenames describe planned responsibilities; they do not exist yet:

- `src/generation/stages.ts`: plain candidate-building stages extracted from `world.ts`, with
  explicit inputs and attempt-local mutable state. Split further only when responsibility warrants it.
- `src/generation/errors.ts`: discriminated expected failures and stable report/legacy-error mapping.
- `src/generation/pipeline.ts`: Effect composition, sequential attempt selection, and presentation
  of the accepted world. Contains the single authoritative generation/recovery policy after cutover.
- `src/generation/diagnostics.ts`: diagnostic service contract and no-op implementation; keep a
  development collector/exporter behind development-only imports where feasible.
- `src/generation/run.ts`: the narrow synchronous compatibility boundary used by the existing
  `generateDungeon` / `generateDungeonWithReport` APIs.
- EF5 only: a run-lifecycle module owning acquisition, publication, retirement, and cleanup,
  extracted from `main.ts` after auditing the then-current renderer/physics resources.

Keep `World`, `GenerationIdentity`, `GenerationTrace`, placement results and recipe definitions
plain data. Seed/attempt/room are explicit domain inputs, not hidden ambient state. Services are
for capabilities such as recording diagnostics; avoid making every helper or data object a Layer.

Retain the current public generation signatures and exception compatibility for existing callers.
The synchronous facade may interpret the Effect pipeline once per generation; it must not maintain
a second attempt loop. Individual algorithms remain directly testable without an Effect runtime.
Resolve extraction/import cycles deliberately: lower-level spatial helpers must not depend on the
pipeline or runner through a generation facade.

## 3. Contracts to preserve

### Determinism and candidate ownership

1. Preserve `randomFrom` / `randomStream`, their algorithms, version salts, semantic identifiers,
   draw order, collection order, and accepted-attempt ordering. Effect's default random service is
   `Math.random`; its seeded generator uses a different algorithm and is not a replacement.
2. Create reports, candidate maps/sets, and mutable random streams inside each execution/attempt.
   Reusing an Effect value must produce a fresh run. Cached Layers must not retain a world, a
   report accumulator, or an advancing RNG cursor between executions.
3. Preserve the current maximum of 40 attempts and the caller's smaller valid limit. Keep history
   independent of layout retries. Accept the first valid attempt in deterministic order.
4. Keep search loops and optional socket omission inside the existing bounded planners. Rejecting
   an anchor or candidate must leave no committed props, reservations, entities, or render objects.
5. Retry only a newly initialized candidate with the next explicit attempt identity. Retrying an
   exhausted whole generator with the same seed repeats its failures; Effect retry is not rollback.
   Do not race candidates to choose whichever finishes first.
6. Retain original door/interaction object identity when registering the accepted world in ECS.
   Neither service provisioning nor diagnostics may introduce mutable world copies.

### Failure model and compatibility

Use a small tagged union, with names finalized during EF1:

| Failure | Ownership and policy |
| --- | --- |
| `InvalidGenerationOptions` | Boundary failure; no generation attempt. Compatibility facade preserves the current `RangeError`. |
| `PlacementRejected` | Expected candidate rejection, with ordered reasons and available room/recipe context; record and advance within budget. |
| `ValidationRejected` | Expected invalid candidate; retain all validation reasons, not only the first failure. |
| `GenerationExhausted` | Terminal expected failure containing the complete bounded `GenerationTrace`; facade preserves `GenerationError.report`. |
| Unexpected exception / invalid internal invariant | Defect; preserve the original cause and stop. Do not silently reinterpret it as missing furniture or retry it. |

Convert existing broad catches around tribute/Last Ember planning and validation into selective
handling at the actual source of expected rejection. Preserve legacy reason strings and ordering
for valid/rejected fixtures; detailed tags can live alongside them in execution diagnostics.
Optional decoration omission remains a successful bounded result, not a terminal failure.

Effect's error parameter covers modeled failures, not every possible JavaScript exception.
`Effect.sync` does not infer a typed failure from a thrown exception. Adapters must classify known
failures deliberately; recovery must not catch defects indiscriminately.

### Execution and lifecycle

- Run Effects at generation/tooling entry points, never once per tile, vertex, joint, or simulation
  tick. Preserve fixed-step system order, synchronous charts, and atomic objective commits.
- The generation facade remains synchronous. Effect's types do not distinguish sync from async;
  forbid sleeps, promises, async services and background fibers in its dependency graph. Test this
  boundary. If an `AsyncFiberError` is detected, interrupt/observe its fiber and fail explicitly;
  do not leave work running against a retired run. Verify cleanup behavior for the pinned release.
- A future worker/async entry point must have its own cancellation and publication contract.
  Fibers alone do not use more CPU cores or interrupt the interior of a long synchronous function.
- EF5 resources live until regeneration/teardown. Closing a construction-local scope immediately
  after returning a scene is invalid. Register cleanup as resources are acquired, including
  custom shader/cache cleanup not inferred by Babylon scene disposal.

### Observability

- Suggested span hierarchy: `dungeon.generate` → `attempt` → layout/reservation/placement/validation;
  add room/recipe spans only at meaningful composition boundaries.
- Record seed, generator/content/scenario versions, attempt, room, recipe and failure category as
  span attributes. Keep metric labels bounded; a seed is not a metric dimension.
- Preserve deterministic `GenerationTrace` / `GenerationReport` shape and serialization. Durations,
  timestamps and trace IDs belong to a separate, versioned execution envelope.
- Provide a bounded local collector with explicit record/payload caps, truncation metadata and
  detached serializable snapshots. Retain only bounded recent execution data, not worlds, scenes,
  ECS registries, closures or native spans with large captured failure objects.
- Effect's native tracer does not export spans. Wire the collector explicitly and make its absence
  cheap. Diagnostic recording failure must not change candidate selection or invalidate an otherwise
  valid world; expose a bounded diagnostic warning in tooling instead.
- Development visibility stays behind `import.meta.env.DEV` and the existing debug gate. Production
  introduces no remote telemetry or additional network requests. Node exporters write to ignored
  `test-results/`; local diagnostic timings never feed generation decisions.

## 4. Feature-sized implementation sequence

Follow the existing [delivery loop](implementation-path.md#delivery-loop): meaningful failing
tests, a small implementation, relevant verification, independent review, and normal-hook commits.
The following slices are all **planned**, not completed by the research prototype.

### EF0 — refresh baseline and pin the integration target

**Depends on:** the current animation/death-physics queue reaching the pre-content insertion point.

- Audit current generator/startup APIs, seed fixtures, imports, resources, and scripts. Recheck
  upstream version/docs; evaluate 4.1.5 as the research reference, then select and record an exact
  compatible release before dependency installation in EF2.
- Capture canonical worlds/reports for the fixed corpus and named rejection fixtures, including
  `MOURNING-731`, `trial-23`, and the current adverse scenario seeds. Keep expensive fixtures lazy.
- Establish generation median/p95, sampled allocations and cold import/test-start cost on a fixed
  workload; record browser/Node versions, warmup, sample counts and hardware qualifications.
- Record production Vite raw/gzip bundle sizes, generation-browser resource counts and the latest
  animation budget. Before comparing the refactor, write explicit acceptable latency/allocation/
  bundle deltas based on these measurements; research timings are not acceptance thresholds.

**Gate:** reproducible pre-refactor evidence exists, budgets are recorded, and the chosen version
works with the project's strict TS, native Node tests, browser bundling and locally bundled assets.

### EF1 — extract stage contracts and expected failures

**Depends on:** EF0. This is a dependency-free preparation slice.

- Extract candidate-building stages and validators without changing their order, random draws,
  optional-placement policy or world registration identity.
- Introduce typed rejection results/errors and mappings; replace broad exception masking while
  retaining existing public signatures and deterministic report messages.
- Define the minimal stage seam for fault injection. Keep direct domain arguments and existing
  pure placement APIs; avoid a framework of service wrappers around every helper.

**Test first:** known missing-site rejection versus an injected unexpected exception; all validation
reasons retained in order; final allowed attempt succeeds; next attempt is never tried; failed
candidate/anchor leaves inputs unchanged; repeated calls have independent reports/RNG state.

**Gate:** exact canonical world/report parity, existing scene-search invariants, full generation
coverage and compatible legacy exceptions. Unexpected defects now surface rather than being hidden.

### EF2 — compose the generation pipeline with Effect

**Depends on:** EF1.

- Install the selected exact `effect` version using npm and the existing lockfile. Keep standard
  TypeScript, Node test, formatting and lint tooling; no compiler-plugin or test-runner migration.
- Compose coarse stages with Effect, including selective candidate rejection recovery and the one
  explicit bounded attempt loop. Initialize all per-execution state lazily.
- Supply the diagnostics capability through a minimal service/Layer with a no-op implementation.
  Keep domain data explicit; avoid long-lived generation caches or detached fibers.
- Implement the synchronous runner and map modeled terminal failures to the existing public API.
  Route generation through this implementation and remove the superseded orchestration loop.
  Tests compare with preserved EF0 fixtures, rather than maintaining a second production generator.

**Test first:** typed failure/dependency propagation; expected failure versus defect; rerunning the
same Effect; interleaved independent seeds; exact retry budgets; missing-service failures in adapter
tests; accidental async execution is detected and terminated without a late state write.

**Gate:** public API/report/geometry parity and a single recovery policy; native Node and browser
compatibility; no Effect execution or timers introduced in simulation/animation hot paths.

### EF3 — bounded stage tracing and local diagnostics

**Depends on:** EF2.

- Add the span hierarchy and bounded collector described above. Capture expected rejections as
  traceable outcomes without changing the deterministic report or swallowing defects.
- Expose a detached execution report through the existing development harness, updating its typed
  contract. Support export alongside existing corpus/gallery tooling with explicit schema versioning.
- Verify the no-op/disabled path, payload limits, disposal/reset behavior, and diagnostic failure
  isolation. Avoid retaining renderer/world objects through traces or error causes.

**Test first:** nested parentage, completed spans on success/rejection/defect, diagnostics on/off
world equality, deterministic report serialization, bounded truncation, detached snapshots, and a
failing diagnostic sink that leaves generation outcomes unchanged.

**Gate:** a rejected/retried seed can be explained from a useful stage trace; retained diagnostic
data is bounded; production exposes no debug collector or new telemetry requests.

### EF4 — integrate callers and pass the pre-content adoption gate

**Depends on:** EF3. **This completes the refactor prerequisite for new procedural features.**

- Audit startup/menu regeneration, debug generation, corpus export and gallery generation for the
  single pipeline boundary. Preserve explicit-seed/refresh behavior and UI readiness semantics.
- Exercise typed generation failure through the actual application boundary: report the failure
  without publishing a partial world or permitting updates against disposed state. Keep this
  synchronous; a broader scene acquisition/lifecycle redesign belongs to EF5.
- Compare the complete fixed corpus and named fixtures with EF0, inspect representative gallery
  captures, and remeasure generation, cold-load/test-start costs and the actual Vite bundle delta.
- Publish a concise authoring guide showing how a future required stage composes, how optional
  omissions are represented, how random streams are derived, and where traces/failures are handled.
- Remove temporary migration switches and duplicate adapters. Record results and any measured
  tradeoffs in README/VERIFICATION and the progress tracker; mark adoption complete only here.

**Gate:** full correctness/resource/production checks pass within EF0 budgets, reviewer READY, and
the implementation demonstrates typed stage recovery plus usable tracing. If it fails the gate,
fix or revise the integration before expanding content; do not bless changed seed fixtures merely
to make the refactor pass. Reconsider adoption if its measured value does not justify its costs.

### EF5 — run-owned construction and cleanup (separate follow-up)

**Depends on:** EF4 and a fresh audit of resources added by A2–A7/P8/P9. Schedule separately.

- Introduce one run owner/scope for scene construction, inspection, objective retirement, generated
  shader/cache entries, render pools and death-physics resources. Keep application/engine lifetime
  separate. Reuse Babylon scene ownership for its child meshes/materials rather than double-owning them.
- Register release after each acquisition. Handle cleanup required by a partially failing acquisition
  inside that acquisition; a release callback cannot clean a resource it never received.
- Publish a game only after construction succeeds, keep its scope alive, and close it exactly once
  on replacement/teardown. Define failure UI and active-game reference handling explicitly. Preserve
  readiness-callback generation guards; a retired scene must not make the new run READY.
- Preserve cleanup ordering, especially shared engine effect caches and generated shader names.
  Avoid overlapping old/new scene ownership unless shared-cache safety is explicitly demonstrated.

**Test first:** failure after each acquisition boundary, cleanup when another finalizer fails,
idempotent retirement, rejected reuse of disposed owners, late readiness callbacks, repeated seeded
regeneration, and cancellation for any async construction that is actually introduced.

**Gate:** no partial publication or late mutation, stable resources across repeated regeneration,
ordinary play/reset behavior intact, and targeted browser/visual checks for the completed animation
and physics systems. Only adopt scoped ownership if it simplifies the actual lifecycle contract.

## 5. Verification and completion

Commands below already exist. Check their current requirements when implementation begins.

| Scope | Required evidence |
| --- | --- |
| Focused iteration | `node --test tests/generation.test.ts tests/scenes.test.ts tests/generation-report.test.ts`, plus new focused tests as added; direct Node commands do not typecheck |
| Every code slice | `npm run format:check`, `npm run lint`, `npm test`, `npm run build`; use `npm run check:full` for generation/corpus and cross-cutting changes, as required by AGENTS.md |
| Generation/corpus cutover | `npm run report:generation`, existing extended corpus/scene checks, canonical parity comparisons, `npm run test:generation` and representative `npm run gallery:generation` captures |
| Application/lifecycle integration | `npm run test:resources`, `npm run test:browser`, affected animation/rig/physics checks and relevant capture review; expand cross-browser checks when lifecycle findings warrant it |
| Production delivery | `npm run build && npm run test:production`; release also verifies the Pages base using the documented build/preview/production procedure |

Development-browser suites need a running server where documented in the project guide. Run
rendering-heavy checks sequentially, with bounded deadlines and owned browser/server cleanup.
Reuse completed full-gate evidence; rerun broad suites only for relevant changes, failures, or
unresolved concerns. Record only checks actually run. No new npm command is assumed by this plan.

### Before authoring the next procedural feature

- [ ] EF0–EF4 complete with recorded budgets, results, and independent review.
- [ ] Same-version worlds, rejection reports, reserved routes, optional omissions and object
      identities match the pre-refactor baseline; source and tests remain authoritative.
- [ ] Required-stage failure, defect propagation and repeat-execution isolation are tested.
- [ ] Traces explain a failed/retried run, remain bounded, and leave deterministic outputs unchanged.
- [ ] Existing gameplay clocks, statechart/model coverage, animation and regeneration contracts pass.
- [ ] Actual latency/allocation/import/bundle costs are recorded and within the agreed budget.
- [ ] The authoring guide and implementation tracker identify the supported Effect boundary.

EF5 may be delivered later without reopening the generation architecture. Worker parallelism,
remote tracing, persistent schemas and wider tool adoption require their own concrete use cases.

## 6. Library references

- [Effect v4 documentation](https://effect.website/docs/v4)
- [Running Effects and the synchronous boundary](https://effect.website/docs/v4/getting-started/running-effects/)
- [Runtime, generator composition, scopes and spans at the inspected revision](https://github.com/Effect-TS/effect/blob/66ab9920271ee7fec3be3f4e3b4438d9222578b1/packages/effect/src/internal/effect.ts)
- [Layer lifetime and memoization](https://github.com/Effect-TS/effect/blob/66ab9920271ee7fec3be3f4e3b4438d9222578b1/packages/effect/src/Layer.ts)
- [Native tracer/export behavior](https://github.com/Effect-TS/effect/blob/66ab9920271ee7fec3be3f4e3b4438d9222578b1/packages/effect/src/Tracer.ts)
- [Random service and seeded implementation](https://github.com/Effect-TS/effect/blob/66ab9920271ee7fec3be3f4e3b4438d9222578b1/packages/effect/src/Random.ts)

Recheck these APIs for the selected release at EF0/EF2. The dependency will be pinned by npm;
the source revision above records the evaluation, not a promise that upstream HEAD stays compatible.
