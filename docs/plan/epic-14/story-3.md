# Switch to mouse travel and toggle running

- **Task source**: `docs/plan/roadmap.md:106–108`
- **Epic / Story**: 14 / 3; gated on both 14.1 and 14.2 mouse playtests
- **Status**: proposed
- **Branch**: main (planning baseline `d7f6562`)

## Goal

Use mouse destinations for all hero travel. Use brackets for camera rotation and the freed R for run/walk, following the roadmap's [Diablo II shortcut reference](https://www.wowhead.com/diablo-2/guide/keyboard-shortcuts-pc). Keep C and I free for future menus, T for practice reset, E for use, Space for jump and F for held defense.

## Acceptance criteria

- [ ] In both modes each of WASD and the four arrows produces zero movement from rest and neither redirects nor cancels a live route. X does not stop; Q/R do not rotate. Shift alone no longer selects run speed. Verify keys are unbound, not mapped to simulated held mouse.
- [ ] `BracketLeft` / `BracketRight` rotate one quarter turn in opposite directions; an absolute click still goes to the displayed floor after rotation. One R down/up latches run, repeat downs do not toggle, a second fresh press returns to walk. Compare actual speed on the same clear floor.
- [ ] A new floor click replaces pursuit before impact and moving interrupts shrine work. Pause, inspection, blur, tab hidden, teleport, death/respawn, practice reset and regeneration clear queued route/attack/work, pointer, held defense, jump/momentum and transient pose. Held/repeated events cannot resume the old command on return.
- [ ] Practice and ordinary controls/help, README and real-input checks describe only live bindings. 14.7 guard interrupt/release timing remains unchanged.

## Test plan (write these first)

| Test | File | Behavior pinned | Expected first run |
| --- | --- | --- | --- |
| Binding matrix | `tests/movement-browser.ts` | Actual key events in both URLs: idle and active-route negatives, brackets, R repeat/release and distance, T reset only in practice. Positive floor tests use real screen points. | Red: W moves, X cancels, R rotates. |
| Command replacement | `tests/combat-browser.ts`, `tests/objective-work-browser.ts`, `tests/last-ember-browser.ts` | Engage a real target or start real work, then click reachable floor. Assert old target/work is gone and no delayed impact/work completion. | Add inert-X control first (red); replacement must still pass. |
| Lifecycle matrix | `tests/defense-browser.ts`, `tests/inspection-browser.ts`, `tests/movement-browser.ts` | Enter each boundary with meaningful pending input, then tick after return with no fresh press. Check effects on position, HP, work, target and guard, not just cleared keys. | New latch/repeat cases red; retain existing cleanup assertions. |

## Design

**State/events/effects:** session gait is walk or run. Fresh unmodified gameplay R-down toggles; up rearms, repeat/duplicate down does nothing. Lifecycle cancellation clears transient input and resets gait to walk; require a fresh down, never reconstruct state from OS repeat. Rotation likewise responds to fresh bracket presses. Ignore game shortcuts in editable fields, native buttons, modals and browser modifier chords. Keep T/button reset and inspection exit accessible. Fixed-step locomotion takes route and gait, not a camera-relative keyboard vector. Keep shared `moveActor` direction support for non-player callers.

**Ports/adapters:** DOM input in `main.ts` translates physical codes into game commands; test gait and cancellation independently of DOM. Remove movement-key reads in `player.ts` **and** key-driven cancel/work paths in `main.ts`/debug stepping. Keep single lifecycle stop path, including preventing stale budget publication. Do not implement mouse steering by synthesizing WASD or by pointing relative to the hero. Do not implement future menus.

## File changes

| File | Change | Why |
| --- | --- | --- |
| `src/main.ts`, `src/player.ts`, `src/locomotion.ts` | Remove keyboard direction/override, Shift speed and X handler; route command edges and gait. | True removal, not an invisible alias. |
| `index.html`, `src/ui.ts`, `README.md` | Audit HUD, help, ordinary/practice instructions and reset text. | One delivered map. |
| `tests/movement-browser.ts`, `tests/production.ts`, `tests/browser.ts`, `tests/resources-browser.ts` | Replace moving-key/stop scenarios with real floor picks and arrival, preserve minimap, resource and rendered movement assertions without production debug hooks. | Smoke must prove travel, not merely detect a changed frame. |
| `tests/jump-browser.ts`, `tests/animation*-browser.ts`, `tests/rig-*-browser.ts`, `tests/defense-browser.ts`, `tests/combat-browser.ts` | Give jump, gait, guard, rig and pursuit scenarios actual destinations, bracket rotation and latched gait; retain original motion/impact assertions. | Do not silently turn moving cases into stationary ones. |
| `tests/*-browser.ts`, dev harness and pure tests | Audit literal codes, lowercase aliases, key arrays passed to step helpers and narrative check labels. Migrate inspection/discoveries, generation, objective-work, Last Ember and any other live caller. | Negative key tests are intentional; historical reports and actor-level motor fixtures are not gameplay bindings. |

## Edge cases and failure modes

Simultaneous F + R must not lower the shield; losing focus while F or mouse is down cannot restart pursuit. A click under a rotated camera must use current client coordinates; fixtures may project known world points for setup, but must dispatch real input and observe actual travel. Test attempting to type a seed containing reserved keys.

## Verification

Run scripts sequentially against `npm run dev`, including every browser runner changed by the audit:

```sh
npm test && npm run typecheck && npm run lint && npm run format:check && npm run check:full
for s in browser movement jump animation animation:review combat defense rig:shield inspection discoveries generation resources objective-work last-ember; do npm run "test:$s" || exit 1; done
npm run build && npm run test:production
npm run build:pages && DEMO_URL=http://localhost:4187/the-hollow-crown/ npm run test:production
```

## Risks and rollout

Do not retire keys until the two preceding travel stories pass without them. Inventory every old-key test by scenario before editing; require a replacement positive assertion or an explicit retired-binding negative, never just delete a failing case.

## Out of scope

No click interactions beyond existing capability, new menus, replacement stop shortcut or changes to combat/defense clocks.
