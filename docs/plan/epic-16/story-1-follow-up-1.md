# Fail closed on malformed scaling evidence

- **Task source**: `docs/plan/roadmap.md:138–139`; third review rejection of the [16.1 checkpoint](story-1.md).
- **Epic / Story**: Epic 16 / Story 1, follow-up 1
- **Status**: proposed; hardware decision pending
- **Branch**: `main`

## Goal

Make a malformed scaling report stop the evidence run with a reason, even when the defect is in the last sample. A valid serialized reference must still pass the scaling check; that is not a hardware verdict.

## Acceptance criteria

- [ ] `validateScaling(input: unknown)` returns `null` for the frozen reference and a scaling-specific reason for invalid JSON values, without coercion or exceptions.
- [ ] Check the frozen recipe and exact collection sizes before traversing each collection: three AB/BA/AB pairs, two visits per pair, 240 samples per visit. Validate every required field before using it.
- [ ] `collecting + complete` with otherwise valid evidence and invalid scaling yields `stopped`, a scaling reason and exactly `['report', 'stop']`.

## Test plan (write these first)

Start from `measureScaling` with an incrementing fake clock. JSON-round-trip the report and change one field per named case. Run the focused tests before editing policy; record both a thrown-error red and a false-acceptance red.

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Broken containers | `tests/cursor-evidence.test.ts` | Drive the completion transition with absent/null/scalar/array in place of a report, recipe, visit, sample, work or hit record. Test missing, array-like, short and overlong collections at each array level, including samples in the final visit. Assert the stopped contract above. | Red: a null visit or sample throws; outer-pair controls already pass. |
| Wrong primitive | same | Mutate recipe values, rooms, write, each work counter, hit kind/id/mesh/instance/distance and sample/build/summary times. Include missing fields, numeric strings, booleans and singleton arrays. | Red: distance `"5.5"` or `[5.5]` on an exposed hit passes subtraction in `sameHit`. |
| Reference control | `tests/cursor-reference.test.ts` | Validate the unmodified serialized reference, including blocked floor and exposed object hits; retain existing wrong-order/work/timing checks. | Green control before and after. |

## Design

Keep the producer's `ScalingReport` type. Treat `Evidence.scaling` as unknown at the decision boundary. In the pure validator, narrow non-null, non-array records and actual arrays first. Compare recipe fields against the frozen constants by key, checking vector and order dimensions before indexing; do not stringify or recursively walk arbitrary input. Use only recipe-owned bounds.

For each visit check rooms, positive finite build/summary times and sample shape. For every sample require the expected numeric write, all nine exact numeric work counters, and finite nonnegative `ms`. Check the expected hit variant, string mesh and object ID, integer instance and finite numeric distance **before** applying the existing `1e-5` tolerance. Recompute mean/p95 only from validated samples. Return the first scaling reason with field or index context. Reuse the existing completion transition; no new state, port or I/O.

### Alternatives rejected

A cast or catch around the typed comparator cannot detect coercible values that compare successfully.

## File changes

| File | Change | Why |
| --- | --- | --- |
| `tests/cursor-scaling-policy.ts` | Narrow unknown input before frozen comparisons. | Own the validation in one place. |
| `tests/cursor-evidence.ts` | Widen only the scaling input field. | Do not imply parsed evidence is trusted. |
| `tests/cursor-evidence.test.ts`, `tests/cursor-reference.test.ts` | Add mutation cases and serialized control; mutate typed fixture copies before assigning to the unknown field. | Exercise the public decision and the real producer. |

## Edge cases and failure modes

`{length: 240}` is not a sample array. Reject 241 rows rather than truncating. A single zero-duration sample is allowed; an all-zero visit still fails the existing positive summary rule.

## Verification

```sh
node --test tests/cursor-evidence.test.ts tests/cursor-reference.test.ts  # red, then green
npm run check  # everyday tests, typecheck, lint, format
npm run build
```

## Risks and rollout

An overstrict guard could reject real captures. Use the reference control and independently review the whole validation path, not just the original failing rows.

## Out of scope

Checkpoint only: no hardware collection, feasibility decision, performance claim, gameplay change or roadmap checkmark. Story 16.2 remains blocked.
