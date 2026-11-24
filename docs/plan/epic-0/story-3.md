# EF2 — Cut over to one synchronous pipeline

- **Task source**: `docs/plan/roadmap.md:36–38`; `docs/effect-refactor-plan.md:91–145,207–226`
- **Epic / Story**: 0 / 3; after EF1 parity and EF0's exact pin evidence
- **Status**: implemented at `a423dae`; see [verification](../../../VERIFICATION.md#ef1ef4--generation-refactor-and-adoption-decision).
- **Branch**: main

## Goal

Interpret Effect once per generation request. A caller still receives a world (or throws) before returning to the event loop; existing callers do not need Effect, promises or new error handling.

## Acceptance criteria

- [ ] Exact verified npm dependency and integrity match EF0 and existing lockfile. One sequential recovery policy under both existing entry points, no legacy loop, switch, hidden fallback or duplicate production implementation.
- [ ] Typed failures and required service visible in pipeline signature; after provisioning the runner needs no environment. Fresh run-local state even when interpreting the same Effect value twice. Node and browser facade match EF0 and preserve failure identity.
- [ ] No async primitives in production graph, no Effect in RNG, geometry, search, XState, fixed-step or rig code. Test-only suspension is detected, interrupted, observed and unable to publish late.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Environment/typed exit | `tests/generation-pipeline.test.ts` | Compile-time expected error and diagnostics requirement; intentionally unprovided dependency cannot enter closed runner; isolated unsafe runtime probe fails, not a candidate retry | Missing pipeline/service |
| Run same value, then A/B/A | same | Different object/report/map references, mutation does not leak, history computed once/run, exact EF0 bytes. Trigger B from a stage seam inside A to test overlapping executions without concurrency | No reusable Effect |
| Count attempts/stages | same | Invalid options start zero; first accepted stops, last slot allowed, exhaust at caller limit and 40; a sentinel defect after one expected rejection stops immediately, strict-equal original throw (even if its message matches a rejection) | No typed cutover; naive runtime may wrap defect |
| Cancellable suspension | same | Inject cancellable deferred callback with unregister/finalizer and completion observer. Sync call fails explicitly, observer sees interrupted termination, release deferred completion and drain queued jobs: zero writes/publications | Naive sync runner can abandon suspended work |
| Public facade contract | `tests/generation.test.ts`, `tests/generation-browser.ts` | Direct Node and browser module calls return plain non-thenable values; default success, invalid `RangeError`, exhausted `instanceof GenerationError` with complete EF0 report, live door identity | Existing facade characterization; fails for wrapper errors or async return |

## Design

Recheck EF0 release, exports, lock and probe results; install using `npm install --ignore-scripts --save-exact effect@"$VERIFIED_VERSION"` with the **literal EF0 version** bound, no guessed tag or range. Review lock diff for unrelated upgrades. Compose EF1 coarse stages; only translate explicit domain rejection to typed failure. Thrown exceptions in synchronous stage evaluation are defects. Use pinned runtime's structured exit/cause inspection rather than assuming thrown runtime wrappers are public errors. Preserve exact sentinel object/value for a defect; do not squash, stringify or detect by message. Existing invalid options → compatible RangeError; exhaustion → existing GenerationError with original complete trace. Unknown/internal/interruption causes are not retriable placement failures.

### State model

Inside deferred construction per execution: validate → initialize(report, keep) → attempt i with fresh maps/sets/streams → append placement/validation rejection and advance i or exhaust → otherwise append accepted, present and return. Only rejection tags may transition back to attempt. Defect stops everywhere. Trace index starts at 0, limit 1–40 inclusive. Recovery is an explicit bounded sequential composition, not racing or retrying the whole program. After focused pipeline tests pass, route both exports via `run.ts` in the same slice and remove EF1's old loop; use goldens for comparison.

### Ports and adapters

Stage data stays plain; a minimal diagnostics capability is the only service, supplied once per invocation with a stateless no-op default. Never cache mutable world/report/stream in a Layer. Narrow sync runner owns interpretation. Use EF0-tested release-specific mechanism to retain a fiber handle on sync mismatch (`AsyncFiberError` where provided), observe completion and interrupt with a synchronous cancel hook before reporting boundary violation. No resuming generation, polling sleep or promise fallback. Reject release/adapter if it cannot establish cancellation of this controlled test. Audit imports for timers, promises, scheduler/fork calls and async services; cancellation cannot undo uncooperative external work, so disallow it at the source.

### Alternatives rejected

One Effect per tile or a whole-generator `sync` wrapper respectively adds hot-loop cost or leaves recovery untyped. Neither meets the pilot's purpose.

## File changes

| File | Change | Why |
| --- | --- | --- |
| `package.json`, `package-lock.json` | Exact verified runtime only | Reproducible Node/browser resolution |
| `src/generation/{pipeline,run,diagnostics}.ts`, `src/world.ts` | Composition, sync interpreter, no-op service and facade delegation | Sole authority for selection and error translation |
| Tests above and immutable EF0 comparator | Exercise typed boundary, real runtime and cancellation | Protect public behavior through cutover |

## Edge cases and failure modes

No test-only service → explicit wiring failure, not generation exhaustion. Reentrant runs do not share collectors or reports. Keep Babylon's shader `Effect` separate from generation imports. No background work allowed after failure.

## Verification

```sh
node --test tests/generation-pipeline.test.ts tests/generation-fixtures.test.ts tests/scenes.test.ts tests/generation.test.ts tests/generation-report.test.ts
npm test && npm run build && npm run check:full
npm run report:generation && npm run test:generation && npm run gallery:generation
```

Use EF0's isolated dev URL for browser commands. Smoke the built root via owned preview and its `DEMO_URL` with `npm run test:production`; review actual Vite output against EF0 early. No benchmark while Epic 1 is profiling.

## Risks and rollout

Native resolution cycles and wrapped errors can pass simple world tests: require import, negative and injected failure checks in addition to corpus parity. Stop cutover on any mismatch; restore prior orchestration rather than retaining a runtime toggle.

## Out of scope

Production collector, worker entry point, compiler/test tooling migration, app resource scopes, EF5 and content changes.
