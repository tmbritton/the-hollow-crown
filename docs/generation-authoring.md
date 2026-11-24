# Generation authoring

The [EF4 adoption gate](../VERIFICATION.md#ef1ef4--generation-refactor-and-adoption-decision)
is still open. This guide describes the implementation, not approval to expand content.

## Add a required stage without changing the retry rules

1. Follow the plain stage contracts in [`stages.ts`](../src/generation/stages.ts). For example, a
   required workshop pair takes the candidate's room, placement space and generation identity.
   Plan its anchor, work prop and reachable paths off to the side; commit its reserved points and
   furnishings only after the pair is accepted. A failed anchor is a local search result, not
   grounds to abandon the entire candidate while other anchors remain.
2. Give genuinely new randomized features a semantic stream key via
   [`randomStream`](../src/generation/random.ts), scoped to the feature/stable room or slot. Do not
   take a new draw from the shared topology/furnishing cursor. The existing layout stream and its
   draws, attempt salt, placement stream keys, search order and insertion order are compatibility
   contracts. Keep identity is constructed once per generation, not once per attempt.
3. If the stage cannot meet a required constraint after its own bounded search, return a typed
   `PlacementRejected` (or `ValidationRejected` for final validation), with deterministic ordered
   reasons. A missing optional bread/flour socket remains an omission recorded on the accepted
   plan, not a retry. A thrown invariant violation is a defect: don't catch it to manufacture a
   rejection. The enclosing [`pipeline.ts`](../src/generation/pipeline.ts) owns the only candidate
   retry. It discards the private rejected candidate and advances its index; it applies
   presentation only once on acceptance. No Promise, timer, fork or filesystem access belongs in
   the synchronous generation graph.
4. Write tests for local rollback, optional omission, typed rejection, and thrown defects. Use
   `generateDungeon` / `generateDungeonWithReport` from `world.ts`. Do not update the frozen EF0
   goldens to hide a refactor difference; intentional future seed/content revisions need their own
   fixture/version decision. Scene installation registers accepted objects by reference.

## Read an execution trace

Open `/?debug&seed=trial-23` in a development build (navigate to the link; refresh picks a random
seed). In the console:

```js
const run = window.__dungeon.generationExecution().runs.at(-1);
console.table(run.spans.map(s => ({
  span: s.id, parent: s.parent, stage: s.stage, attempt: s.attempt,
  room: s.room, recipe: s.recipe, outcome: s.outcome, ms: s.elapsedMs,
  reasons: s.reasons.join('; '),
})));
```

Follow `generation → attempt → layout / reservation / placement / validation`. Recipe spans are
children of actual placement work and show the room and recipe. For `trial-23`, attempt **0**
rejects at validation for the inaccessible meat-rack front, attempt **1** rejects for a missing
Last Ember shrine/focus/clue, and attempt **2** succeeds. The presentation span runs after the
accepted attempt. `generationReport()` describes the deterministic initial world; durations and
span IDs are not part of that report. Local snapshots are detached, retain up to four runs, and
mark truncated data rather than retaining unlimited records. A `diagnostic-sink-failed` warning
means a diagnostic operation failed without changing generation.

To write a Node sidecar, run `GENERATION_TRACE_SEED=trial-23 npm run report:generation`; the
schema-1 execution snapshot is `test-results/generation-execution.json`. Giving the same flag to
`npm run gallery:generation` exports the matching selected browser run, if present, in
`test-results/generation-gallery/execution.json`. Neither sidecar changes the deterministic
report. Ordinary production builds ship no collector or trace/fault-injection hook.
