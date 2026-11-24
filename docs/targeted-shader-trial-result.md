# Rig reset and targeted shader trial

**Current status: targeted preparation adopted on the Epic 1 branch, with the measured load
penalty explicitly accepted.** See the [32-pair efficacy study and adoption decision](targeted-shader-efficacy.md).
The original capped trial still **rejected** the candidate: once unlocked, its first valid
reduced/Low/parent pair improved the first-displacement interval from 65.4 to 28.7 ms, but
regeneration was +113.1 ms against the +100 ms cap. That stopped the registered run; neither
that verdict nor the prior broad warmup result was revised. The separate efficacy study used
the same source without a startup veto and did not pool the stopped trial's pair.

## Historical status — initial locked attempt

**Lifecycle fix implemented; shader trial then incomplete, not eligible for retention.** The desktop
reported locked at initial check, after correctness work, and at the registered preflight. No
headed Chromium, hardware draw audit, timed visit, ordered pair, or replacement was run. There
is no measured pass or failure of the 8 ms, spread, 100 ms, or control gates. Nothing was
committed or pushed; the previous trial and unrelated work were preserved.

## Review follow-up — revised registration

- Persisted `pageshow` resets elapsed time **and** the fixed-step remainder without relying on a
  subsequent visibility event. The headless test seeds an 8 ms partial tick, simulates a 5 s
  gap, and observes the actual first scene render 10 ms after restore. Before the fix that frame
  took five ticks; afterward it took none. This is a persisted-event replay, not a native BFCache hit.
- Lifetime transitions publish ownership before invoking callbacks. A terminal hide raised from
  `stop` takes effect immediately, but engine release waits for the in-flight stop to unwind and
  supersedes any pending scene release. Three test-first cases (reset, replacement, termination)
  reproduced recursive stop before the fix and now prove a single release and no later binding.
- The real-navigation regression now **requires** trusted non-persisted `pagehide`, one instrumented
  engine dispose entry/return, and trusted hidden `visibilitychange`, in that order and in the
  same outgoing generation/document. Both ordinary and regenerated R6 pages passed. Context
  close and synthetic replay are additional checks, not substitutes for the durable navigation journal.
- The timing runner's shared `withTrialPage` path leaves the external page-error listener attached
  through close and reads a synchronous outgoing-document journal after real same-origin navigation.
  It installs the landing route only after measuring the endpoints. It rejects missing, reordered
  or untrusted evidence and any page errors. The exact teardown path passed clean and rejected
  injected and missing-journal cases on both page types of **all three sealed arms**. The injected
  `rigBinding` stack was durable even though Playwright reported no external error for it. This
  strict Chromium event-order contract can invalidate a visit on browser drift; that is not a
  timing failure and must not be retried automatically.

The first hardware attempt used **`test-results/encounter/targeted-shader-review-v2/`**. The
original registration and archives remain historical, not runnable by the revised runner. The
revised `CPU_TRIAL.json` SHA-256 is
`3f3055cfec4dea9458a37085369452b223dfebc1ab6ceccc3b333d827408e5db`. Reconstructed, validated arm digests:

| Arm | Input-scoped SHA-256 |
| --- | --- |
| Parent | `0328c03031d2ca711ea680a5ef69cd4d76c32bf55f4a7758449d9777b68c0ece` |
| Frozen R6 | `fcfcf7de48e1cf22dfc2263c75cae2a2f55627f527b2532f392498993bf25eb0` |
| Candidate | `7b05984391c6788b8cc1fa27537468d97c1ed07d0c3af2ff4c32b80782be878c` |

Offline preflight passed source archives, runner hashes and strict-port root/nonce checks. The
historical 54 frozen visits and six v4 admissions were rechecked during freeze. ScreenSaver
`GetActive` still returned `true` at preflight and final check. Neither `kde-inhibit` hardware
command was launched. The schedule, workloads and thresholds did not change.

```sh
# All JSON output paths must be new. Use a fresh directory to repeat freeze/preflight.
TRIAL="$PWD/test-results/encounter/targeted-shader-review-v2"
RIG_OUTPUT=test-results/encounter/rig-review-new.json node tests/rig-lifecycle-browser.ts
for arm in parent frozen candidate; do
  node tests/targeted-shader-teardown-browser.ts \
    "test-results/encounter/teardown-review-new-$arm.json" "$TRIAL/$arm" "review-$arm" || break
done
```

Recorded headless artifacts under `test-results/encounter/`: `review-rig-resume-red.json`,
`review-rig-green.json`, `review-teardown-parent.json`, `review-teardown-frozen.json` and
`review-teardown-candidate-complete.json`. An earlier aggregate command hit its outer timeout
during the candidate missing-evidence checks; the standalone candidate run completed.

## Lifecycle evidence

Against the reconstructed no-warmup parent, the deterministic sequence on both the ordinary W
page (generation 1) and 795 door R6 page (generation 2) reproduced the original stack:
non-persisted `pagehide` → engine disposal returns → `visibilitychange` → `resetMovement` →
`stopPlayer` → `resetActorRig` → `rigBinding` throws. Subsequent blur and duplicate terminal hide
also threw (six external page errors across the two replay pages). The lifecycle-only fix had
zero external errors and exactly one observed replay disposal per page. Evidence under
`test-results/encounter/`: `targeted-rig-red.json` and `targeted-rig-green.json`. The same-origin
journal then captured **trusted navigation** on both pages (`targeted-rig-{red,green}-journal.json`):
on red, visibility change followed disposal return and produced the same exception on both pages;
on green, the order remained and neither page errored. The independent Playwright listener stayed
attached through context close; the navigation journal was necessary because the runner did not
receive those two unloading-document errors as Playwright events. The prior foreground trial's
untagged exception still cannot be assigned to its pages retroactively.

`src/rigLifecycle.ts` owns the `absent → live → absent/terminal` lifetime and checks replacement
generation. Retirement is now published before callbacks; the outgoing rig stays physically bound
until stop completes and release runs. Terminal is absorbing. Persisted hide retains the owner;
visibility still drives the existing UI/clock transition. The live `rigBinding` assertion
is unchanged. The persisted-event headless replay (`targeted-rig-resume.json`) verified no hidden
ticks, no resumed movement without fresh input, then working W input. It simulates the persisted
events; it does not claim a native BFCache hit on this browser.

## Candidate and correctness evidence

At this historical stage, shader preparation was wired only in the isolated `candidate` checkout.
The generator verified the original hardware `browser-red.json`
before freezing its 21 distinct quality/pass/source/full-define signatures. Each was absent at
READY on an observed first-moving draw and has a scale-off sibling that was ready there. The
candidate resolves the generated shader token from the scene, uses the actual ready sibling's
shader source and attribute/instance inputs, and changes only the registered scale define. It
does not visit all submeshes, render a hidden pass, advance gameplay, add FXAA/glow work, or patch
transforms. The explicit preparation transition rejects stale generations and late completions;
the adapter owns polling, cancellation, context loss and scene-bound effect references.

An initial fixed-parent headless audit found nine scale misses on door/Low and did not complete
the High combat witness. In the final headless candidate audit (`targeted-draw-registered.json`), all
**8 / 9 / 10 / 11** registered signatures actually submitted on the four visits were ready, with
one residual unregistered miss per visit. It issued **10 / 11 / 10 / 11** registered compile
requests, with no sampled render/tick/visibility/scale/caster mutation across those requests and
no candidate effect handle surviving regeneration. Door crossed and ordinary W moved; the headless High
reduced visit hit its wall deadline, so that run did not establish combat release. This is
software-renderer correctness evidence, not RTX coverage or performance. Do not widen the
signature list to absorb headless residuals. Review Babylon private-cache compatibility, the
effect-template binding contract and async retirement before considering retention.

## Historical registration and commands

For reference only: these were the commands from the pre-adoption Epic 1 source with the
existing ignored source evidence and installed lockfile dependencies. The sealed run is closed;
do not run into those paths or generate a no-warmup parent from the current shipping entry point.

```sh
# Revised, sealed and offline-preflighted; use this path for the first hardware attempt.
TRIAL="$PWD/test-results/encounter/targeted-shader-review-v2"

# For a fresh reconstruction rather than using the sealed one, choose a never-used path:
# TRIAL="$PWD/test-results/encounter/targeted-shader-new"
# node tests/targeted-shader-run.ts freeze "$TRIAL"
# node tests/targeted-shader-run.ts preflight "$TRIAL"

# Run only after explicit unlock. Do not start other browser/check work alongside this.
test "$(qdbus org.freedesktop.ScreenSaver /ScreenSaver org.freedesktop.ScreenSaver.GetActive)" = false &&
  CPU_GPU=hardware kde-inhibit --screenSaver --power \
    node tests/targeted-shader-browser.ts "$TRIAL/candidate" "$TRIAL/hardware-audit.json" &&
  test "$(qdbus org.freedesktop.ScreenSaver /ScreenSaver org.freedesktop.ScreenSaver.GetActive)" = false &&
  kde-inhibit --screenSaver --power node tests/targeted-shader-run.ts run "$TRIAL"
```

Historical `targeted-shader-registered` SHA-256:
`a311f75ea565431f803b54b2eb3b4693514a131994fd439d561296fcaaf495f7`.
Its arm source digests (not the revised registration) are:

| Fixed arm | Input-scoped SHA-256 |
| --- | --- |
| Dirty parent | `3109edf7733af54b7ba39f4f63ba78f9fbe70185e29fa501343f6613a1b0afd1` |
| Frozen R6 (v4 compatible) | `7eb50ce4936d18e061e6dba41a66666abd576e31b93102d5f0360b8129cdb627` |
| Targeted candidate | `12882c6d36a5d2a99362ba238eaa6d1d94df86fd498b6fbb5787c32eb7979196` |

`overlay.json` records source evidence and candidate-minus-parent paths. `source-{parent,frozen,candidate}/`
contain manifests, binary patches and untracked overlays; the frozen arm starts from the prior
verified v4-compatible passive overlay, not from old outcome times. The three arms use identical
passive load markers, encounter capture and reset-owner module. Offline preflight rechecked the
previous registration seal, the 54 frozen visits, all six native v4 admissions, source archives,
runner and strict-port roots. The hardware runner refuses to start while locked, requires the
candidate's exact-source untimed audit, and uses the registered primary interleaving before any
controls. An invalid attempt is recorded and stops; there is no automatic retry. Do not rerun
into files already written. A setup replacement requires separate documented authorization and
capture in the original order; valid slow pairs are never eligible for replacement.

## Verification

- Review follow-up: `npm run check:full` passed (528 passed, one skip; typecheck, lint and
  format passed). `npm run build && npm run test:production` and `npm run test:movement` against
  an owned strict-port server passed. The headless regressions above are correctness checks only.
- Focused Node tests (lifecycle, targeted preparation, report): 17 passed. The new API tests
  first failed on missing modules/exports; the replay and draw audit supplied behavioral reds.
- `npm run check:full`: 525 passed, one skip; typecheck, lint and format passed. The initial
  tool invocation timed out; the subsequent full invocation completed.
- `npm run test:movement`: passed against an owned strict-port dev server, including focus loss
  and regeneration. `npm run build && npm run test:production`: passed; production smoke confirms
  real movement, regeneration and absence of the development global/Inspector.
- No independent review was available in this tool session. This is not a release approval.
