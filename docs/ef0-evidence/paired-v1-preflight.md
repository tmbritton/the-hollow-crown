# EF0 paired-v1 — preflight only, 2026-11-23

This is the historical preflight. The user later authorized implementation and moved undecided
generation latency to EF4 without changing any margins. The A/A campaign was not run and is
superseded by the [final A/B procedure](../ef4-results.md#final-candidate-latency-campaign--predeclared-not-started).

**Decision: no generation timing clearance.** No set of 16 separately reserved quiet windows was
available for this execution. A single host snapshot is not a booking or evidence that 16 blocks
would sample independent host conditions. Stopped before schedule freeze: **0/16 pairs, 0/32
timing processes, 0/16,000 timed worlds**. No campaign attempt or `paired-v1/` evidence directory
was created. This is not a negative A/A result. The old unpaired series remains inconclusive.

## Executed on `main` before runtime changes

Two independent `git archive` extractions of `398a1cf01fdebf8c072741c3de20670012795439`, each with
`npm ci --ignore-scripts --offline` and the same two timing-tool files overlaid. Read-only preflight
returned 0. Both roots checked against the Git blobs for `src/` and the package files and matched
the dependency inventory. Reported SHA-256:

| Input | Digest |
| --- | --- |
| Source inventory, both roots | `3e649038964d32b7db7aba92e9208ecc6399062941e9475469ef7834879ced2e` |
| Lockfile | `565e12186123643d38540a2773ff1253c081955952d1bfec3987cb67328fa93f` |
| Dependency inventory, both roots | `214d1e75fd032f8ff3c432f3fd55cbeb048e01bbba60fc0e7a8c0c6038c09c8d` |
| Harness | `ab7a754b183d3da4eac5206737bf580349e3b3cb50b6d2b075f30a4cf76b0fde` |
| Analyzer | `66d729f728f12b30182069fb805aa96937b4e9ede0bc4eb075a29b29b124926c` |
| Protocol | `728e3432ae97a6aa57339d337449ef3e1f56c05823da027a94bc85bb030e2191` |

Host snapshot at epoch `1795473368480` ms: Ryzen 5 2600X / 12 logical CPUs, Fedora x86-64 kernel
`7.2.9-ogc3.1.fc44.x86_64`, Node 26.0.0 / npm 11.12.1, `balanced-bazzite`, `acpi-cpufreq` /
`schedutil`, boosting enabled. Load average `[4.06, 3.30, 2.26]`, one runnable, k10temp `51.375 °C`,
no competing build/benchmark matched at that instant. `/proc/stat` counters (user through steal):
`[1666131, 105412, 235949, 9995530, 2863, 44999, 30346, 0]`; a single sample cannot estimate interval idle.

TDD red: `node --test tests/generation-pair-analysis.test.ts` failed with missing analyzer before
implementation. Green: **7 tests**, covering paired ranks, signs and bounds, original margin caps,
EF4 decision cases, invalid samples/order/identity, terminal stops, and opt-in import. `npm run
typecheck`, `npm run lint`, `npm run format:check`, `npm test` (**472**), `npm run build`, and
`npm run test:full` (**492**, after an initial combined run hit its shell timeout) passed. These
are tooling and correctness results, not calibration. No independent review of calibration
evidence was possible because no campaign was collected.

The historical A/A bookings and CLI have been retired. For the reproducible world/trace oracle
(not timing), use the [offline recapture instructions](../ef0-baseline.md#checks-and-reproduction).
