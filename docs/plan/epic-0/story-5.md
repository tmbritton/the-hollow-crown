# EF4 — Decide readiness for procedural content

- **Task source**: `docs/plan/roadmap.md:42–44`; `docs/effect-refactor-plan.md:246–265,290–319`
- **Epic / Story**: 0 / 5; after EF3, final pre-content gate
- **Status**: proposed
- **Branch**: main

## Goal

Prove adoption in the game that ships: a failed generation leaves a usable retry action and nothing disposed still running. Admit content only if the unchanged seed corpus, actual stage traces, resource checks and measured costs justify the new boundary.

## Acceptance criteria

- [ ] Startup seed link, refresh, explicit menu rebuild, fresh regeneration, another-run, debug, gallery and Node corpus use the single generation facade. No legacy orchestration or migration switch. Opening a seed link reproduces it; refreshing deliberately does not pin it.
- [ ] A real initial or replacement `GenerationError` shows failure with seed/reason, no READY, no stale report or active game, no update/render/input/debug step of retired objects. A visible user retry works without reload and installs exactly one working render loop. No partial scene created on generation failure. Unexpected defect is reported distinctly, never converted to expected retry.
- [ ] All EF0 bytes, caps and matched budgets pass; captures inspected, root and Pages smoke pass locally without debug hooks or new requests. Independent review **READY** plus demonstrated recovery and usable bounded trace required; no grandfathered parity or cost failures.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Session transition matrix | `tests/models/cases.ts`, `tests/generation-session.test.ts` | Failed→LOAD→loading→current READY plays; stale READY while loading/failed rejected; repeated failure then success. Spies count old cleanup once and no reads after retirement | Existing chart handles LOAD but does not own stale active reference |
| Initial failure and retry | `tests/generation-browser.ts` | Via DEV/debug-only one-shot bootstrap injection, generate `trial-23` with limit 1 through real pipeline. Observe FAIL caption/retry, null game/report, zero scenes, no page error; click retry (normal limit), play/step/render, exactly one loop | Startup catch skips runRenderLoop; no visible retry path |
| Replacement failure and retry | same, `tests/resources-browser.ts` | From ready world exercise menu start through same one-shot limit. Retain old scene/objective handles for assertions, observe disposal/retirement and cleared references. Deliver stale readiness, input and several RAFs while failed; counters for old ticks/renders unchanged, no thrown getter or second disposal. Retry twice/follow with normal regen: one live scene, no growth | Disposed `game` survives synchronous throw from menu path |
| Caller parity and production | `tests/generation-browser.ts`, `tests/production.ts` | Pinned/reload/random/menu semantics and debug report after retry; production ignores debug/fault inputs, no collector or new network endpoints on either base | Existing seed tests characterize success; new failure isolation absent |

## Design

`main.ts:start` currently disposes old resources before `generateDungeonWithReport`, but leaves global `game` pointing at the old scene. The top-level catch only covers bootstrap; `scene.render()` is outside `ui.ready` and initial failure skips loop registration. Fix this at the common application boundary, not by wrapping the click handler or just hiding the canvas.

### State model

Use existing `machines/ui/session.ts` for modes. LOAD from any valid mode → loading(new generation token); invalidate old token/report, detach active game *before* executing retirement using captured old reference. Preserve inspector/inspection, objective retirement, scene disposal, `engine.releaseEffects` and generated shader cleanup order. Generate synchronously before allocating a candidate scene. On typed exhaustion → failed(token, seed, summary), no active game; render failure caption as text plus retry control. Failure UI must remain reachable without debug/menu. Retry → LOAD, same requested seed/pin semantics at normal budget. Successful construction publishes new reference/report together; READY only for matching token and still-current scene. Reject stale completion or input/step requiring an active game in all other states. Never swallow unrelated exceptions or retry them as placements; use distinct startup/defect reporting. No writes to URL claiming a failed publication. Test valid and rejected transitions including a late old READY during a *new* load.

### Ports and adapters

Keep existing engine lifetime and XState UI adapter; no new general resource manager. Use narrow generation function injection at bootstrap/regen (production default existing facade); for browser tests a DEV **and debug** one-shot option drives actual bounded exhaustion, not an unrelated mocked FAIL event. Strip the control from production. Register render loop once after engine initialization independent of first generation result; guard active-game access in frame, input, inspector, HUD, debug/profile/step getters, teardown and readiness callbacks. When unavailable provide explicit inactive result/error according to contract, never expose retired state. Keep last attempted seed for retry separately from active game and deterministic report. For newly acquired resources before an in-scope failure release what was acquired, without double ownership; generated world failure precedes creation of `Scene`. Do not redesign arbitrary Babylon partial construction here.

### Alternatives rejected

Keeping disposed game as fallback, allowing two live scenes, reloading the page or installing a new loop per retry each hides a lifetime bug rather than fixing it.

## File changes

| File | Change | Why |
| --- | --- | --- |
| `src/main.ts`, `src/ui.ts`, `index.html`, `src/gameTypes.ts` | Common start/retire/fail/retry, guarded access and visible action | Safe initial and later generation failures |
| `src/machines/ui/session.ts`, `tests/models/cases.ts` | Reuse existing FAIL/LOAD/READY; extend branches/models only as needed | No second independent mode flag |
| `tests/generation-browser.ts`, `tests/resources-browser.ts`, `tests/production.ts`, `tests/browserTypes.ts`, focused session test | Real boundaries, guards and release checks | Detect stale activity and partial publication |
| `README.md`, `VERIFICATION.md`, `docs/implementation-progress.md`, `docs/generation-authoring.md` | Author guide, evidence and qualified verdict | Explicitly gate next content work |

## Edge cases and failure modes

No previous game on startup → retirement is empty. Repeated failure must clear stale success metadata each time. Don't make callbacks capture or mutate a retired run. Check failed → retry while menu/inspection had been open, and that the next generation cannot be marked ready by previous scene. Do not expose fault injection in production. Engine/WebGL initialization failure is not recoverable by regenerating a seed.

## Verification

1. Compare **all** frozen EF0 inputs including adverse seeds, retry and exhaustion. Run core/extended model coverage, route/scene search, simulation and ECS identity tests. Do not recapture goldens. Commands:

   ```sh
   node --test tests/generation-session.test.ts tests/generation-fixtures.test.ts tests/generation-pipeline.test.ts tests/generation-diagnostics.test.ts
   npm test && npm run check:full && npm run build
   npm run report:generation
   ```

2. Use story 1's owned strict-port dev server, exact `DEMO_URL`, deadlines and sequential cleanup. Run `npm run test:generation`, `npm run gallery:generation`, `npm run test:resources`, `npm run test:browser`, `npm run test:animation`, `npm run test:rig`, `npm run test:ragdoll`. Inspect baseline/candidate gallery pairs (showcase, retry, compact/sprawling, adverse routes), animation/physics captures and post-reset counters. Add Firefox `BROWSER=firefox npm run test:browser` for changed readiness/input/disposal, focused inspection/objective/rig-handoff or breakup checks for affected teardown paths. Record exact suites/URLs and outcomes.

3. Root then Pages, sequentially; each build replaces `dist`. From main only, choose separate free nondefault `$ROOT_PORT` and `$PAGES_PORT`. Start a preview you own with `npm run preview -- --host 127.0.0.1 --port "$ROOT_PORT" --strictPort` after root build, verify PID/root and readiness, then `DEMO_URL="http://127.0.0.1:$ROOT_PORT/" npm run test:production`; stop only owned preview. `npm run build:pages`, start `npm run preview:pages -- --host 127.0.0.1 --port "$PAGES_PORT" --strictPort`, verify owned preview then `DEMO_URL="http://127.0.0.1:$PAGES_PORT/the-hollow-crown/" npm run test:production`. Check locally bundled asset paths, captions/menu/seed gameplay, absent debug and collector, no unexpected requests or console errors. Never reuse a shared server, even if testServer accepts it.

4. Run EF0's **same harness** against its archived source and final candidate in quiet matched sessions. No Epic 1 worktree/server or concurrent timings. Publish per-seed median/p95, sampled allocation, cold import/test start, Vite raw/gzip, animation fixture and stable resources as B / candidate / delta / frozen limit / pass, with spread and load qualification. Report diagnostic overhead separately from disabled-path delivery costs. Missing/noisy evidence is not a pass.

## Risks and rollout

Audit every caller (including gallery and direct debug regen); remove temporary dual paths. Guide must walk a future required stage through explicit inputs/semantic RNG, typed rejection and enclosing retry, contrast optional omission, and show how to read a real `trial-23` trace. Independent reviewer checks evidence and guide against implementation. If parity, safety, resource limits, budgets or author value miss: record NOT READY, isolate cause, fix or reconsider adoption, leave prerequisite open. Record only checks actually run; CPU7 is not an FPS success claim.

## Out of scope

EF5 run scopes/general acquisition-finalizer redesign, worker/async generation, new content, Epic 1 performance acceptance, deployment or git operations.
