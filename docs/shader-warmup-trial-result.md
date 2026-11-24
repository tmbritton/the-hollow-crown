# Shader warmup trial — timed primary tranche, not eligible for retention

## Status

The resumed pass collected all six reduced/Low/off primary pairs on foreground RTX 2070/Wayland, in AB/BA/AB order against each reference. The candidate had a smaller first-displacement interval in every pair, but the measured startup penalties failed the 100 ms cap against both references. A page-lifecycle error also invalidated every pair under the admission rule. **Do not retain the runtime change.** These are real paired readings, not an eligible outcome or a valid negative for the full experiment. No control matrix was run after those gates failed.

The working checkout retains its original runtime. The candidate and its tests are in the ignored `test-results/encounter/shader-trial-lboASK/candidate/` checkout. The original plan was not edited, and the first `CPU_TRIAL` stayed byte-identical.

## Timed primary tranche

All times in milliseconds, reference → candidate. Deltas in parentheses are candidate minus reference. R6 columns use the navigation and regeneration boundaries from the same page; first movement is from the Low regenerated scene after its separate 489-tick warmup. Ordinary High uses a separate navigation to the dev-served player with no debug harness, no reset, and real W input. It is not a cold-driver-cache or built-bundle timing claim.

| Reference/repeat | First-displacement interval | Approach max | Low regeneration → playable | High navigation → playable (R6 page) | High navigation → playable (ordinary) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Parent 1 (AB) | 65.8 → 35.2 (−30.6) | 65.8 → 47.5 | 1616.5 → 2991.7 (+1375.2) | 2501.7 → 4599.7 (+2098.0) | 3125.0 → 5427.9 (+2302.9) |
| Parent 2 (BA) | 81.7 → 26.1 (−55.6) | 81.7 → 41.3 | 2387.5 → 2915.8 (+528.3) | 3525.4 → 4725.3 (+1199.9) | 4186.1 → 5197.7 (+1011.6) |
| Parent 3 (AB) | 83.3 → 32.5 (−50.8) | 83.3 → 56.3 | 1942.4 → 3299.6 (+1357.2) | 2479.9 → 4911.7 (+2431.8) | 2815.1 → 5345.4 (+2530.3) |
| Frozen 1 (AB) | 107.4 → 19.2 (−88.2) | 107.4 → 19.4 | 2392.2 → 2241.7 (−150.5) | 3607.1 → 4016.7 (+409.6) | 14801.6 → 4390.3 (−10411.3) |
| Frozen 2 (BA) | 69.4 → 22.0 (−47.4) | 69.4 → 34.4 | 1649.5 → 2264.9 (+615.4) | 2733.2 → 3833.1 (+1099.9) | 2934.0 → 4993.7 (+2059.7) |
| Frozen 3 (AB) | 105.3 → 22.7 (−82.6) | 105.3 → 34.9 | 2275.7 → 2094.7 (−181.0) | 3824.5 → 3827.5 (+3.0) | 4121.0 → 4129.6 (+8.6) |

The first-displacement median reductions were **50.8 ms** versus parent (reference/candidate spreads 17.5/9.1 ms) and **82.6 ms** versus frozen (38.0/3.5 ms). Approach maximum median reductions were **27.0** and **70.4 ms** (spreads 17.5/15.0 and 38.0/15.5 ms). Median startup deltas for Low reset, R6-page High navigation and ordinary High navigation were **+1357.2 / +2098.0 / +2302.9 ms** against parent and **−150.5 / +409.6 / +8.6 ms** against frozen; the cap applies to every pair, not the median. The 14801.6 ms frozen ordinary navigation is retained, not trimmed or retried. Ordinary W gaps were 101.2→83.2, 120.2→138.8, 96.5→109.8 against parent and 132.7→44.3, 102.0→85.2, 156.8→107.9 against frozen. Raw rows retain first work, next movement, catch-up tick counts, phase distributions and endpoints.

The first attempt stopped at `parent-1-parent` with `Humanoid rig must be bound before animation`. The single bounded replacement preserved all three source digests, registration bytes, browser and order. Its external runner recorded the full error stack and completed the requested primary measurements as diagnostic evidence, without waiving admission. Each of the 12 sides reported one error through the visibility-change handler → `resetMovement` → `stopPlayer` → `resetActorRig`. The runner did not timestamp or tag errors by page, so the evidence does not certify that they were confined to context teardown. Native v4 start/input/physical parity otherwise matched and within-pair terminal snapshots matched excluding camera presentation. Repairing the shared lifecycle fault would be separate from this trial; it is not grounds to reclassify the readings or retry slow visits.

### Timed artifacts and verification

- Initial registration and measured source archives: `timed-primary/`. Registration SHA-256 `adda38f647460e4863769684c8452e1ddf1f26117798e051af1a9771f4406dbb`; the copy in the repair directory is byte-identical. Measured parent `ff69cf478280a69f86a020499be8efad6eb3b7d8bd02434093c71548c0790d64`, frozen `e6243738b10a1e7fe5f03783ab52772a459f9c372169d2df5259f7d48e374cec`, candidate `314417f5c52f9af2f4b55f6c56da389a3164854b3bfcf63d97d2f3e31e23fd87`.
- All 12 sides, six pairs, and report: `timed-primary-repair/primary-report.json` (SHA-256 `54e8164e344b18e69c7cd9433954b89b4a5476079992e00222911bdec3029ba9`). `timed-primary-repair/SHA256SUMS` covers the raw data, report, repair runner, registration, initial rejection and overlay manifest; its SHA-256 is `21c4d3bb387b337f5401308fb68add28e39d8e63eed814d2ee2ce80b2bc2e880`.
- Overlay: `src/shaderTrialObservation.ts` and `src/encounterCapture.ts` are hash-identical across arms; the composition hooks are in each `src/main.ts`. The frozen replay uses the already-established v4 capture/recipe correction. `timed-primary/overlay.json` records original-versus-measured path hashes and candidate-minus-parent differences. Timing used neither draw-key auditing nor CPU scopes or traces.
- From the artifact root, the original capture command was `CPU_TRIAL="$PWD/timed-primary/CPU_TRIAL.json" kde-inhibit --screenSaver --power node candidate/tests/shader-trial-run.ts run`. The diagnostic continuation used `candidate/test-results/shader-trial-repair.ts run "$PWD/timed-primary-repair"` with the same wrapper and registration. Do not rerun into either sealed output directory.
- Recomputed source digests and validated all three reconstruction archives after collection; confirmed registration identity, six pair order stamps, terminal comparisons, and the original 54 frozen visits and six v4 trace admissions. On the measured candidate, `npm run typecheck`, `npm run format:check`, `npm run lint`, and the four focused Node test files (15 tests) passed. The pre-existing long browser suite was stopped before timing to avoid competing work. Full suites were not rerun for the timing overlay.

## Observed renderer effects

The diagnostic used foreground Chromium 159.0.8154.6, Wayland, RTX 2070 (615.78.08), WebGL2, 800×450 viewport, effective DPR 0.9999999812016114, fresh browser contexts and an owned strict-port Vite root. Hardware runs were wrapped in `kde-inhibit --screenSaver --power`. The diagnostic measured coverage, not timings: at the application READY boundary it enumerated Babylon's ready cache keys, then observed the pass and program key on actual indexed/array draw submissions. It selected first movement by changed player x/z, not a fixed callback index.

| Regenerated scene | Quality | Ready cache keys, control → candidate | First moving draw signatures absent at READY, control → candidate | Distinct draw signatures absent at READY across visit, control → candidate |
| --- | --- | ---: | ---: | ---: |
| 795, R6 no-alert door | Low | 48 → 69 | 5 → 0 | 10 → 0 |
| 795, R6 reduced combat | High | 50 → 73 | 3 → 0 | 12 → 0 |
| MOURNING-731, ordinary W | Low | 48 → 69 | 10 → 0 | 11 → 0 |
| MOURNING-731, ordinary W | High | 50 → 73 | 11 → 0 | 12 → 0 |

The control's absent keys predominantly add `NONUNIFORMSCALING` on the camera pass, including custom material programs with vertex colors and the applied light/shadow defines. High also missed `NONUNIFORMSCALING` in the directional shadow map. The candidate's actual first-moving draws used 35 / 43 / 40 / 48 pass-and-key signatures, respectively. Total signatures vary with the frames' visible draws; cache membership is not a pixel-parity or draw-count comparison. The candidate door crossed at tick 666 without alert; reduced resolved with the `THROW_JAVELIN` release at tick 1432. Matching those witnesses does not establish native v4 parity for the complete matrix.

## Implementation and limitations

- Installed Babylon 9.37.0 was the renderer reference. `ThinEngine.createEffect` keys effects by shader sources/tokens and full defines, not material name or mesh ID. `Scene.isReady` is not sufficient: it skips some mesh readiness paths and checks existing effects, not every future transform, activation or pass configuration.
- The prototype snapshots generated submeshes before R6 retirement. It includes disabled renderables, thin instance pools, the fixed nearest-light pool, owner-reported scale changes on cutaways, creatures, rigs and health fills, and the Last Ember seal material alternatives. Permanent pick/collision proxies are not draw jobs. High adds the shadow caster and glow mask jobs and awaits glow layer readiness; both qualities await FXAA. No simulation step or alternate render is used to prepare a variant.
- `src/shaderWarmup.ts` owns the pure transition and job deduplication. `src/shaderWarmupRendering.ts` is the Babylon adapter. It uses detached `SubMesh` wrappers, actual mesh and pass inputs, and a sequential readiness queue. Candidate `src/main.ts` owns the pre-READY generation/quality revision, timeout, context-loss and cancellation hooks; `enemyRendering.ts` and `lastEmberRendering.ts` expose their variant inputs. The draw audit is opt-in DEV code (`src/shaderWarmupAudit.ts`, `src/engine.ts`, `tests/shader-warmup-browser.ts`).
- Specific review risks: the adapter uses Babylon submesh wrapper and scale-state internals, and transfers effect ownership to scene-lifetime references. The diagnostic establishes ready key membership, not an effect-object lifetime trace, exhaustive pass/alternate coverage, exact visibility restoration, or absence of first-bind/driver work. Regeneration and built input were exercised, but pending-compiler resource disposal, injected failure/context loss, fast quality changes and the planned integrated model cases are not verified.
- The resumed primary runner joins passive load/displacement data to signed visits and tests the necessary primary and startup gates. It does not implement the full matrix's secondary-tail verdict. The primary stop rule made controls unwarranted; the existing historical `startupMs` was not used as load-to-playable.

## Artifacts and reproduction

Root: `test-results/encounter/shader-trial-lboASK/`. All source digests below are input-scoped manifests, not commits.

| Artifact | Identity |
| --- | --- |
| Dirty parent (`source.json`, binary patch, untracked inputs, lockfile) | `9d3b7246a8b1c152d38b0071c6c026bba749fa0477cdfe3e9f53d31635e0137a` |
| Frozen R6 `baseline-r6-480ffe1b` | `f14ca2d53eac5f50f4864c00a8190ed9fbdd3cef50d180aa7587df9db6cc043f` |
| Trace `trace-r6-v4-31faeede` SHA256SUMS hash | `afdcf51994f6929bcd672f283e140368286f10e970889b5a6115375596816209` |
| Candidate source `candidate-source-97Hcfw` (includes draft timing overlay) | `3ddecd65762c04d8f01bab7954b91104d5c42d848cdf0fdfebb06168ade02902` |
| `browser-red.json` SHA-256 | `d799d33afc4e5f59de2cccf11ddcc7c250d9a29cb07a85535e94d7e6e3e1da0d` |
| `candidate-draw-audit.json` SHA-256 | `82629a6bd9ff9ecaa80b16fd3116d325eb6a6b3d2823f62d92dca7811e4f6d03` |

The parent was sealed before edits at HEAD `398a1cf01fdebf8c072741c3de20670012795439` on `epic-1-encounter-hitch`, reconstructed and validated in independent checkouts. `references.json` records the frozen index and manifest hashes and the six v4 admissions. The original frozen index, manifest, 54 visits, original v4 seal and six v4 admissions were reverified without regenerating anything in the sealed directories. The candidate archive includes a candidate-minus-parent path/hash audit.

To reproduce the candidate coverage from its isolated checkout, with installed dependencies and no server on 5471:

```sh
node --test tests/shader-warmup.test.ts tests/encounter-clock.test.ts \
  tests/encounter-report.test.ts tests/shader-trial-timing.test.ts
REQUIRE_PREPARED=1 CPU_GPU=hardware SHADER_AUDIT_OUTPUT="$PWD/../candidate-draw-audit-repro.json" \
  kde-inhibit --screenSaver --power node tests/shader-warmup-browser.ts
```

Use a new output filename for every reproduction. To reconstruct the source, use a local checkout of the recorded HEAD, apply `working-tree.patch` and overlay `untracked/`, then validate with `validateSourceArchive` and compare `sourceManifest` to the archived digest before running. The red coverage visit used the same diagnostic hooks with no warmup; its complete signature sets are in `browser-red.json`.

## Verification

- Focused Node tests: the new planner/ownership and timing tests first failed on absent modules; the browser coverage assertion failed on real draws without warmup. With the prototype, the focused run passed 15 tests and the strict RTX draw audit passed all four visits.
- `npm run typecheck`, `npm run format:check`, `npm run lint`, `npm test`: passed (502 core passes at the first candidate checkpoint). `npm run check:full`: test phase passed (520, one skip), but the command stopped at formatting while draft capture edits were in progress; standalone format, lint and typecheck passed after formatting. This is not a clean final aggregate rerun.
- `npm run build && npm run test:production`: passed. The production test exercised seeded bootstrap, real movement, quality persistence and regeneration without the diagnostic global or Inspector requests.
