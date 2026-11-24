# EF1 — Extract stages and classify failures

- **Task source**: `docs/plan/roadmap.md:33–35`; `docs/effect-refactor-plan.md:65–145,189–205`
- **Epic / Story**: 0 / 2; blocked on reviewed EF0 oracle and budgets
- **Status**: proposed
- **Branch**: main

## Goal

Make expected candidate rejection a domain result while keeping today's synchronous generator authoritative. A broken navigator must not look like a missing piece of furniture.

## Acceptance criteria

- [ ] No dependency changes. Both public signatures, default seed, option validation, exhaustion class/message/report, all ordered reasons and every EF0 output match. Unexpected defects escape by reference.
- [ ] Stages are ordinary synchronous functions. Keep identity/history once per generation, explicit attempt number, original RNG algorithms/keys/salts/draws, search and insertion order, fresh attempt-local mutable data. Apply presentation once after acceptance. ECS registers original accepted objects.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Site missing versus navigator defect | `tests/generation-stages.test.ts` | Real missing tribute/Ember inputs produce old reasons; throw a sentinel Error with the *same message* during navigation: strict equality to caught sentinel, no second attempt | Broad validation catch masks the sentinel |
| Multiple invalid sites | same | Several real failed checks append all reasons in traversal order; placement failure skips validation | Characterizes existing ordering; typed stage missing |
| Limit boundaries | same | 0, NaN, fractional, 41 fail before history/RNG; injected rejects then success at last slot; 40 rejects → exact report numbered 0–39, no slot 40 | No injectable seam; public invalid-option cases should already pass |
| Candidate isolation | `tests/scenes.test.ts`, `tests/generation-stages.test.ts` | Force anchor veto after planning: snapshot props/entities/reservations before and after; optional socket absence is success. Mutate first rejected candidate; next candidate and prior caller inputs clean | Existing bounded search should pass; injection unavailable |
| Replay and ECS identity | `tests/generation.test.ts` | A/B/A independent mutable reports/tiles/RNG; strict equality of registered door and interaction target to accepted object, mutation visible to world | Characterization green on original; fails on cloning |

## Design

Extract in existing execution order, with parity checks between moves. Move `buildAttempt` sections to coarse layout, reservation and placement functions, then full validation. Pass the same local random cursor where previously shared; keep derived streams where previously independent. Pull `key`, spatial lookup, height and reachability primitives below generation/navigation; preserve `world.ts` exports for existing callers. Inspect imports from planners/report/Navigator; no lower layer may import an orchestration barrel. Do not split inner loops solely to create stages.

### State model

Plain tagged outcomes suffice, no new XState actor. Validate options → invalid (throw legacy RangeError) or initialize → attempt(i). Placement rejection records placement reasons; otherwise validate → validation rejection or accepted. Either rejection advances only when `i+1 < limit`, else exhausted. Accepted applies presentation and returns. Defect in any state exits immediately; terminal states permit no further transitions. Table-test counts and invalid continuations. EF1 retains exactly the current outer policy, for replacement in EF2.

### Ports and adapters

One internal typed table of stage functions with explicit seed/attempt/keep/candidate arguments, production defaults and per-call test overrides, not process-wide mutable hooks. Classify missing-site conditions at `generation/tribute.ts` and `generation/lastEmber.ts` where facts are known; narrow typed result or branded rejection, not message matching. Keep public blueprint helpers compatible if they must throw. Move navigator work outside expected-rejection handlers. Pure validator accumulates ordered strings; map tags (`PlacementRejected`, `ValidationRejected`, `InvalidGenerationOptions`, `GenerationExhausted`) to existing boundary values in one place. No FS, clock, Effect or Babylon imports needed in these contracts.

### Alternatives rejected

Catch-all conversion or snapshotting a partially mutated candidate would hide defects and make rollback depend on deep copies. Discard failed private candidate; commit a planned anchor only on success.

## File changes

| File | Change | Why |
| --- | --- | --- |
| `src/world.ts`, `src/generation/stages.ts`, `src/generation/errors.ts` | Extract stages/outcomes, retain public exports and sole plain loop | Prepare an independently testable boundary |
| `src/generation/{tribute,lastEmber}.ts`, `src/navigation.ts`, proposed `src/worldSpatial.ts` and spatial consumers | Selective site checks and inward imports | Avoid exception masking and facade cycles |
| Tests listed above; EF0 fixtures read-only | Exercise seam and live reference contract | Detect drift beyond summary equality |

## Edge cases and failure modes

A missing invariant inside a recipe is not an omitted optional decoration. Never classify an unknown throw as candidate rejection. Do not regenerate fixtures to resolve ordering differences.

## Verification

```sh
node --test tests/generation-stages.test.ts tests/generation.test.ts tests/scenes.test.ts tests/generation-report.test.ts tests/generation-fixtures.test.ts
npm test && npm run build && npm run check:full
npm run report:generation
npm run test:generation
```

Last command uses story 1's owned main-only dev server and `DEMO_URL`. Full gate includes lint/format, extended Last Ember/tribute, scene and model suites.

## Risks and rollout

Move shared spatial dependencies first; smoke native imports from both world and navigation entry points. Stop on first golden difference, diagnose first differing field/stage, keep prior stage boundary until green.

## Out of scope

Effect installation, new recipes or salts, changing validation, diagnostic collector, application lifecycle and EF5.
