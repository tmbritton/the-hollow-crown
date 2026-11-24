# Generation authoring

This is the supported boundary for new procedural content after the [Epic 0 delivery decision](ef4-results.md#epic-0-delivery-closeout).
Generation latency is still inconclusive. Keep algorithms plain and synchronous; Effect coordinates
generation, not rendering, simulation, or per-tile work.

## Add a required stage without changing the retry rules

Use the smithy/bakery workshop pair as a worked example. For a new required placement step, start
in `placeCandidate` in [`stages.ts`](../src/generation/stages.ts), after `reserveCandidate` has
established the reserved routes. Use final validation for constraints that depend on the whole
placed world, not as a second placement pass.

1. **Plan with explicit inputs.** Follow `planScene(identity, room, space, options)` in
   [`scenes.ts`](../src/generation/scenes.ts): read tiles, reservations and blockers from `space`;
   build props and reachable work approaches in local scratch state. A failed anchor discards
   that scratch state and tries the next anchor within the local budget. The planner never mutates
   the world. In `placeCandidate` the adapter commits `result.scene`, its reserved points and
   prop footprints only after `status: 'placed'`.
2. **Give new work its own random stream.** `planScene` uses
   `randomStream(identity, 'scene-layout', sceneId)` with `` sceneId = `scene:${room.id}` ``. Socket
   and appearance streams use distinct domains and stable role IDs. For a new feature pick a
   new domain and stable room/slot ID, not an array index that moves with insertion order.
   [`randomStream`](../src/generation/random.ts) includes the seed and generator/content versions.
   Preserve existing draw order, attempt salt, stream keys, search order and insertion order;
   don't consume the legacy topology/furnishing cursor. Keep history is built once per run.
3. **Return an expected failure only when required work is impossible.** A missing required work
   prop tries another anchor; exhausting the local search returns `status: 'rejected'` with a
   reason and anchor count. The adapter maps that result to `PlacementRejected` with an ordered
   `reasons` array. A missing optional bakery bread/flour socket instead stays on the accepted
   scene as `socket: null, reason: 'omitted'`. Final checks can return `ValidationRejected`.
   Don't catch thrown invariant or navigation defects and convert them into rejections.
4. **Leave retry and publication to the existing boundary.** [`pipeline.ts`](../src/generation/pipeline.ts)
   optionally wraps recipe work via `observeRecipe` and retries only typed placement/validation
   failures, starting a fresh candidate at the next zero-based attempt (40 attempts by default).
   Presentation runs only on acceptance. The [sync runner](../src/generation/run.ts) exposes
   exhaustion as `GenerationError` with the attempt report; unexpected defects escape unchanged.
   The app offers retry for exhaustion without publishing a failed scene. Don't add another loop,
   a Promise, timer, fork, or filesystem access. Use [`world.ts`](../src/world.ts) for generation
   and [`worldSpatial.ts`](../src/worldSpatial.ts) for spatial helpers alone.

For a new placement test, constrain `planScene` with explicit `anchors`: cover no viable anchor
(rejection without mutation), a viable later anchor, and a viable required pair with missing
optional sockets. At the pipeline level, check typed rejection advances the attempt, a thrown
sentinel escapes by identity, and a successful attempt commits only its own props and reservations.
Start with the existing scene, stage and pipeline tests:

```sh
node --test tests/scenes.test.ts tests/generation-stages.test.ts tests/generation-pipeline.test.ts tests/generation-diagnostics.test.ts
npm run check:full
```

Do not update the frozen EF0 oracle to hide a refactor difference. Intentional future seed/content
revisions need their own fixture/version decision. Scene installation registers accepted objects
by reference.

## Read an execution trace

With dependencies installed, start `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`
(choose another free port if needed). Open `http://127.0.0.1:5173/?debug&seed=trial-23` in a new
tab. Navigate to the link again to reproduce it; refresh deliberately picks a random seed. Once
loaded, open the browser console:

```js
const { runs, warning } = window.__dungeon.generationExecution();
const run = runs.findLast(r => r.seed === 'trial-23');
if (!run) throw new Error('Open the trial-23 debug link in the dev server first');
console.log({ outcome: run.outcome, truncated: run.truncated, dropped: run.dropped, warning });
console.table(run.spans.map(s => ({
  span: s.id, parent: s.parent, stage: s.stage, attempt: s.attempt,
  room: s.room, recipe: s.recipe, outcome: s.outcome, ms: s.elapsedMs,
  reasons: s.reasons.join('; '),
})));
```

Follow `generation → attempt → layout / reservation / placement / validation` by matching `parent`
to `span`. Recipe spans are children of placement and show the room and recipe. For `trial-23`,
attempt **0** rejects at validation for the inaccessible meat-rack front, attempt **1** rejects for a missing
Last Ember shrine/focus/clue, and attempt **2** succeeds. The presentation span runs after the
accepted attempt. `generationReport()` describes the deterministic initial world; durations and
span IDs are not part of that report. Local snapshots are detached, retain up to four runs with
at most 256 spans and 64 KiB of serialized data per run, and flag truncation. A
`diagnostic-sink-failed` warning means a diagnostic operation failed without changing generation.

To write a Node sidecar, run `GENERATION_TRACE_SEED=trial-23 npm run report:generation`; the
schema-1 execution snapshot is `test-results/generation-execution.json`. With the dev server
still running, `DEMO_URL=http://127.0.0.1:5173 GENERATION_TRACE_SEED=trial-23 npm run gallery:generation`
exports the matching selected browser run, if present, to `test-results/generation-gallery/execution.json`.
Neither sidecar changes the deterministic report. Ordinary production builds ship no collector
or trace/fault-injection hook. Trace durations locate work; they are not measurements against
the frozen diagnostics-off budget.
