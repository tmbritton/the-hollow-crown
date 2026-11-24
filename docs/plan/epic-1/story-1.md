# Record approach and controls

- **Task source**: `docs/plan/roadmap.md:46–59`
- **Epic / Story**: Epic 1 / Story 1.1
- **Status**: proposed
- **Branch**: `epic-1-encounter-hitch`
- **Depends on**: none; supplies the recipe for [1.2](story-2.md).

## Goal

Make the reported hitch replayable in the game the player actually sees. CPU7's near-rank, forced-alert fixture and its unrendered door test answer different questions; its native run starts at the stable. Preserve all three. Add a separately versioned `encounter-v1` recipe, not a new CPU7 result.

## Acceptance criteria

- [ ] From a fresh seeded full world, all 24 enemies living, normal AI, objectives and rig updates enabled, record continuous rendered native RAF from before sight through the target pack's first resolved attack. No alert injection, actor placement at slots, teleport across the trigger, synthetic frame stepping or scripted damage in the window.
- [ ] Identify pack and members by stable IDs. Record approach, first alert, actual travel toward slots, physical rank readiness, opening, and checked impact (including miss) or projectile release by simulation tick **and** enclosing callback. A wind-up or chart state alone does not prove a strike.
- [ ] Replay a comparable closed-door approach, normal opening and physical crossing, with no enemy alert at any tick. Replay the encounter with a pinned smaller living roster, preserving the target pack, route, input, camera, quality and warmup. List IDs alive, visible in the camera, active in simulation and settled as remains separately at boundaries; do not infer activity from visibility.
- [ ] Save complete visits, including early alert, stalls, blocked door, unresolved attack and setup failures. Deliver valid witnesses for all three cases; failed visits document limits, not acceptance or speedup.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Replay synthetic tick facts | `tests/encounter-recipe.test.ts` | All legal and illegal transitions, two events in one callback, opening without impact, reset/timeout | Red: witness reducer missing |
| Verify controls | `tests/encounter-recipe.test.ts` | Mid-crossing alert later cleared still fails; wrong pack, moving remains, changed input or population invalidates visit | Red: no eligibility check |
| Real input witness | `tests/encounter-browser.ts` | Three fresh worlds; actual door flags/crossing and attack event agree with tick log; second visit has no held keys or old observers | Red: no encounter driver |

## Design

Scout `MOURNING-731` first in untimed DEV play. Freeze seed, pack IDs, approach waypoints, ordinary movement key/interaction edges relative to fixed ticks, camera settings, door ID/side, fixed warmup count and measurement limits **before** timing. Drive the normal input consumer before each fixed update; don't schedule progression with sleeps or alter NPC decisions. Keep measured movement under the existing application render loop, not `cpu.frame()` or a second RAF loop. Capture compact tick facts locally; no Playwright round trips, screenshots or serialization per frame. Take visual witnesses on separate visits.

Choose the door control with comparable travel distance, speed, view and opening state; document unavoidable geometry differences. For reduced population, pin non-pack IDs and use normal lethal handoff in setup only. Advance both worlds the same fixed warmup, verifying all selected deaths have settled and target actors and doors match before starting. Log setup-induced differences in objectives/visibility; if they change the encounter, reject the control. Three untimed scouting attempts per case; if a route cannot witness the sequence, stop, retain failures and revise/version the recipe explicitly. Freeze a finite tick/callback budget from scouting, with the live session deadline as a separate guard. No tuning in this story.

### State model

- **States/events**: a test-harness reducer consumes ordered tick facts. `setup → approach` on validated warmed start; encounter: `approach → alerted → travelling → ranked → open → resolved` on the corresponding observations above. Door: `approach → opening → crossed` on door motion and player crossing the threshold. Only accept `crossed` after checking the entire no-alert window. Check the unaware precondition during setup too.
- **Transitions/effects**: ordinary ticks accumulate evidence without advancing; a repeated observation is not a second milestone. Process multiple facts in tick order. Unexpected order, timeout, context loss, reset or retirement before completion → invalid with reason and last tick. Terminal states reject further input. Pure reducer returns append/finish commands; runner flushes the bounded buffer, releases input and restores the loop/hooks in `finally`.

### Ports and adapters

The recipe owns plain input edges and observation records, not Babylon objects. Its driver supplies movement intent, tick/callback observations and a result sink. Wire to `src/main.ts`'s DEV harness, `createCpuProfile().live`, squad/individual attack evidence and Playwright/file output at the edge. Fakes feed the same records in Node. No second gameplay statechart; witness states describe observations only.

### Alternatives rejected

Reusing `phalanxWorkload` would remove the approach and other enemies. Polling once per frame loses transitions in catch-up ticks; lowering population in the shipping game tests a different feature.

## File changes

| File | Change | Why |
| --- | --- | --- |
| `tests/encounter-recipe.ts`, `tests/encounter-recipe.test.ts` | Add lazy versioned case definitions, pure validation and tests | Keep `tests/cpu-cases.ts` and `tests/cpu-workloads.ts` frozen |
| `src/cpuProfile.ts`, `src/main.ts` | DEV-only tick/input and callback seam around the existing native loop; reuse session teardown | Correlate facts without forcing time |
| `tests/encounter-browser.ts` | New capture entry point; reuse `tests/cpu-profile.ts` hardware launch, `rendererKind`, `withViteServer` and identity conventions | Own strict-port server and one fresh seeded navigation per visit |

## Edge cases and failure modes

An alert during warmup, another pack's hit, an unsettled death or a door that opened but was never crossed is not success. On timeout retain every recorded fact and first missing milestone. Hidden tab, software/unknown renderer, dropped evidence or a reused server from another checkout invalidates hardware capture; do not silently retry until green.

## Verification

From this worktree on a graphical desktop, after implementing the proposed runner (defaults: all three cases, both qualities; unique output under `test-results/encounter/`):

```sh
node --test tests/encounter-recipe.test.ts
CPU_GPU=hardware CPU_REPEATS=1 CPU_MODES=off CPU_LABEL=witness DEMO_URL=http://127.0.0.1:5471 node tests/encounter-browser.ts
npm run check:full
npm run build
npm run test:production
```

Separately start `npm run dev -- --strictPort` on 5173; run `npm run test:movement`, `npm run test:phalanx` and `npm run test:combat` sequentially. Verify input, rank and impact against an untimed visual replay. The hardware runner must launch headed Chromium, verify the actual WebGL2 renderer, archive raw evidence and the source manifest specified in 1.2 even on a dirty tree. This single visit is a witness, not a baseline.

## Risks and rollout

Tick observers can cause the hitch they measure. Store only scalar transitions and outer timestamps in the outcome lane; take full state snapshots outside it. Confirm clean teardown on regeneration and absence of DEV hooks in production.

## Out of scope

No new tactics, encounter balance, generation budgets, performance verdict or CPU7 fixture edits.
