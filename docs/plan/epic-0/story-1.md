# EF0 — Freeze fixtures and cost budgets

- **Task source**: `docs/plan/roadmap.md:19–32`; `docs/effect-refactor-plan.md:91–162,170–187,290–316`
- **Epic / Story**: 0 / 1; after the reviewed CPU7 investigation, not conditional on an FPS win
- **Status**: proposed
- **Branch**: main

## Goal

Make the current generator, not a reconstruction of it, the oracle for adoption. Finish this story before extracting a helper, changing a catch, or adding Effect to the application.

## Acceptance criteria

- [ ] A durable, versioned manifest and canonical outputs can be checked offline from a clean checkout. Record source revision, applicable source/lock hashes, clean generation inputs, exact options, generator/content/scenario versions, serializer version and per-entry SHA-256. Repeat capture in a fresh process and compare bytes. Normal tests can read but never update expectations.
- [ ] Exact world, ordered trace and initial `createGenerationReport` covered for all 100 `GENERATION_CORPUS_SEEDS`, plus `ember-70`, `tribute-12` and any additional adverse seeds found in the scenario tests. Include default success, `trial-27`, `trial-23` retry and its real one-attempt `GenerationError` (name, message and entire ordered report). Record observed outcomes, not inferred rejection reasons.
- [ ] The evidence sheet contains actual baseline values, absolute ceilings calculated by the protocol below and an independently repeatable exact-version probe. If either evidence set is missing, EF1 stays blocked.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Canonical representation sensitivity | `tests/generation-fixtures.test.ts` | Changing a tile, Set insertion order, optional omitted socket or reason order changes bytes; equal independent graphs compare equal | Fails without a lossless encoder (plain JSON collapses Maps/Sets) |
| Frozen oracle | same | Named successes and exhaustion checked against read-only artifacts; perturb one captured value in memory and demand a mismatch at that seed/path | Missing fixture first; green on untouched generator after capture |
| Extended manifest coverage | same | `[extended]` case checks every seed/limit, digest and ordered output once; filtered discovery reads/generates no corpus | Missing entries/manifest |
| Target probe | disposable npm sandbox | Typed required service, sync success/fail/die and async interruption/finalization run in native Node and bundled browser | Unresolved import before candidate installation; incompatible candidates fail their specific probe |

## Design

1. Inventory `world.ts` exports/callers (including spatial imports via navigation), `identity.ts`, ECS registration, startup/retirement in `main.ts`, scripts, resource and animation measurements. Record default seed/options, presentation timing and error contracts. Capture before any production diff. Use object-key normalization only for records; preserve array, Map entry and Set iteration order, full precision, absent versus undefined, exceptional numeric values and shared references where relevant. Use tagged encodings, not projections of summary counts. Store compressed per-seed payloads under `tests/fixtures/`, not just ignored corpus JSON. Compare one seed at a time; show first differing path. Runtime reference identity also needs EF1's live test.
2. Record a baseline kit (source snapshot without `.git`, harness, lockfile, tool versions, command lines and raw samples) independent of the Epic 1 worktree. Measure generation only, diagnostics off: fixed order MOURNING-731, trial-23, trial-27, ember-70, tribute-12. Per process discard two warm cycles then time ten cycles per seed; five fresh processes, elapsed ms median/p95 by seed. Separately use Node inspector heap allocation sampling with fixed 32 KiB interval and collected-object sampling enabled; attribute sampled bytes to generation per completed cycle, aggregate over batches, not retained heap deltas. Extend identical batch lengths on both sides if too few samples. Time cold `import('./src/world.ts')` and process start-to-exit of a minimal native `node --test` import-only file in 20 fresh processes each (same warm filesystem cache; not whole-suite elapsed). Publish raw data, repeat spreads and median of repeat statistics.
3. Freeze these **allowed additions** before cutover (B = corresponding EF0 baseline): generation median `max(2 ms, 0.10 B)`, p95 `max(5 ms, 0.15 B)` per seed; allocated bytes/world `max(256 KiB, 0.15 B)`; cold import and native test start median `max(100 ms, 0.25 B)` each. Production root Vite aggregate shipped JS raw +256 KiB and per-file gzip summed +64 KiB, same gzip level (9), report initial-load JS separately and all emitted asset totals; no extra remote fetch. No increase in stable same-seed post-ready mesh/material/texture/target/cache counts or growth across resets. Record latest shipped animation fixture/budgets from VERIFICATION/CPU7 (including existing misses); on matched hardware require warm animation p95 ≤ B + `max(0.3 ms, 0.10 B)` with unchanged quality/population. No new promise of a frame-rate target. Do not substitute scratch esbuild numbers for these measurements.
4. Log CPU/GPU/driver, hardware acceleration, Node/npm/browser/OS, power mode, viewport, seed/quality and workload counters. Baseline twice in quiet windows; at EF4 alternate baseline/candidate order on same host. No benchmarks alongside builds, browser suites or Epic 1 profiling. Observe host load before/during; defer on competing CPU/GPU load, thermal change, software GPU for animation, or baseline spread larger than allowance. Retry one quiet session; if still noisy mark inconclusive/block, never loosen limits to fit the candidate.
5. Verify `npm view effect@4.1.5 version engines exports dist.integrity` against npm; reference only. If unavailable/incompatible, probe a specific published stable candidate from `npm view effect versions --json` against its own docs/source. In disposable copy with identical TS config, Node ≥22.18, Vite and lock, run `npm install --ignore-scripts --save-exact effect@<candidate>`, strict typecheck, native `.ts` test, production Vite root/base smoke executing the probe with local assets only. Verify typed exit/cause unwrapping and cancellable async mismatch on that release. Record one literal version, resolved integrity, release-specific APIs and commands/results **before** EF2; do not install into main here. No passing release → block, not `latest` or a semver range.

### State model and ports

No production lifecycle change. Capture (explicit offline writer) and verify (read-only comparator) are distinct entry points. Pure encoding/comparison consumes plain domain values; FS, gzip, clock, heap profiler and process launcher belong in Node tooling. Browser measures via existing debug adapter.

### Alternatives rejected

Post-extraction snapshots, self-comparison and generation reports alone cannot detect a deterministic change to interior geometry. Sampling process RSS cannot measure allocation churn.

## File changes

| File | Change | Why |
| --- | --- | --- |
| `tests/generation-fixtures.test.ts`, `tests/generation-fixtures.ts`, `tests/ef0-contract.ts` | Lazy checks, encoder and immutable reference digests; see [offline recapture](../../ef0-baseline.md#checks-and-reproduction) for historical payloads | Full parity independent of future implementation |
| `tests/capture-generation-baseline.ts`, `tests/measure-generation.ts`, cold-start test fixture | Explicit capture/measurement adapters | Repeatable without updating goldens during tests |
| `docs/ef0-baseline.md` | Inventory, provenance, pin, absolute budget table, protocol and evidence | Reviewable contract for EF1–4 |

## Edge cases and failure modes

Unknown value type → fail encoding rather than omit it. Missing/corrupt artifact → fail closed. Never capture a rejected candidate by pretending the public API returned it; freeze its observable trace. If the existing generator changes during capture, discard capture and restart from identified pre-refactor inputs.

## Verification

```sh
node --test tests/generation-fixtures.test.ts tests/generation.test.ts tests/scenes.test.ts tests/generation-report.test.ts
npm test && npm run build && npm run check:full
npm run report:generation
```

For **all stories**, launch a main-only dev server with `npm run dev -- --host 127.0.0.1 --port "$P" --strictPort` on a freshly checked free nondefault port. Verify the owned child is alive and serving this root; export `DEMO_URL=http://127.0.0.1:$P`. Never accept an already reachable endpoint (testServer can reuse it); fail/reselect on bind conflict. Run `npm run test:generation`, `npm run gallery:generation`, `npm run test:resources`, `npm run test:animation` sequentially for the reference evidence. Save captures and counters outside transient overwritten outputs. Use finite per-suite deadlines, fresh browser contexts and finally/trap cleanup only of owned child groups/browsers. For production use separate owned strict-port previews matching each freshly built `dist` and pass their exact base URLs (see story 5). Do not start, inspect, stop or reuse Epic 1's server/worktree. `check:full` includes full native suite, lint and format; build and npm test both typecheck.

## Risks and rollout

Baseline first, then isolated compatibility experiment. Review artifacts and budgets before admitting EF1; retain immutable B kit for matched EF4 reruns.

## Out of scope

Production dependency edits, generator refactoring, content changes, renderer tuning, EF5 and Epic 1.
