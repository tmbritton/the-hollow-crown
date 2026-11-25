# Story 14.3 follow-up 1 — worker interruption and lost R keyup

**Proposed after the third integrated review.** Prove that arrival alone interrupts the Last Ember worker, and restore the first fresh R press after focus loss without weakening duplicate protection during focused play.

## Tests first / acceptance criteria

- **Last Ember (`tests/last-ember-browser.ts:318`):** On `MOURNING-731`, confirm `goblin:smithy:0` is alive and working, and record positive profanation progress. Keep `at('focus')` as the threat; remove the projected `lure` click. That point picks the living worker, not clear floor. Advance fixed ticks without attacking: assert the same living worker targets the hero, leaves the focus, stops working, and progress stays at the recorded value. Withdraw with `at('shrine')`; within a bounded number of ticks observe that worker back at the focus working and progress increasing. Do not substitute a dead, absent, or replacement worker for an interruption.
- **R latch (`tests/travel-controls.test.ts`, `tests/epic14-browser.ts`):** Reproduce R down → blur → release outside the page (no game keyup) → refocus. Gait must be walk on return; a repeat must leave it there and the first non-repeat down must select run. Verify actual travel speed in the browser. While focused, a second non-repeat down or OS repeat must not toggle again, even across an in-focus cancel; keyup then a fresh press must toggle normally.

## Smallest change

Keep the gait/key transition pure in `src/travelControls.ts`. Distinguish **input lost** (any state → walk/released) from **cancel while focused** (any state → walk, preserve held/released). Retain the existing down/up guards. In `src/main.ts`, send input lost through the existing movement cleanup on blur, hidden document, or pagehide; overlapping loss notifications are harmless. Do not release the latch on every reset: a duplicate down after a focused cancel would start running. No new input manager, picking changes, or worker AI changes.

## Closeout on the integrated tree

Run `node --test tests/travel-controls.test.ts`. With `npm run dev` running, run `npm run test:last-ember`, `BROWSER=firefox npm run test:last-ember`, `npm run test:epic14`, and `npm run test:movement` sequentially. Finish with `npm run check:full` (typecheck, tests, lint, format), then `npm run build && npm run test:production`. Record actual outcomes, including any blocked checks, and obtain independent re-review of both findings before claiming closure. Prior passes are not evidence for the lost-keyup or living-worker cases.
