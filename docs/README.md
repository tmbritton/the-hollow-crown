# Planning documents

| Document | Purpose |
| --- | --- |
| [Implementation path](implementation-path.md) | Dependency-ordered feature slices and the test-first, verification, review, commit workflow. |
| [Implementation progress](implementation-progress.md) | Delivery tracker, checks and review. P1–P7 delivered; P7 published at `3934e17`. T2/A0 and A1–A4 independently reviewed READY. A5 articulated tails is next. |
| [Animation roadmap](animation-roadmap.md) | Shared humanoid/tailed rigs, complete animation migration, shield motion and later death physics. A0–A4 implemented and independently reviewed READY; A5–A7/P8/P9 planned. |
| [Animation baseline](animation-baseline.md) | A0 review controls, complete 30-clip inventory, reproducible captures, current foot/grip defects, 25-actor baseline and initial A1/A2 budgets. |
| [Rig foundation](rig-foundation.md) | Implemented A1 semantic anatomy/profiles, pose and socket APIs, ECS ownership, compatibility/final-writer boundaries and parity/cost verification. |
| [Rig solver](rig-solver.md) | Implemented A2 coordinated body/limb IK, target spaces and priorities, binding-compatible scale, singular projections, operation budgets and actual-mesh verification. |
| [Rig grounding](rig-grounding.md) | Implemented A3 living pose/contact migration, slope-aware soles, fixed gameplay anchor, bounded final-surface checks, presentation snapshots and reset/death handoff. |
| [Rig actions](rig-actions.md) | Implemented A4 action/work/social layers, coordinated grips, solved equipment/cargo sockets and semantic temporary collapse; final geometry checks and independent READY review. |
| [Effect refactor plan](effect-refactor-plan.md) | Planned composable generation stages, typed failures and bounded local tracing, with a separate run-scope follow-up. Scheduled after the animation/death-physics queue and before further procedural-feature expansion. |
| [Procedural content improvement plan](procedural-content-improvement-plan.md) | Shared keep identities, composed scenes, memorable inhabitants, discoveries, adventure grammars, and seed-review tooling. Further feature expansion follows the Effect generation adoption gate. |
| [Encounter narrative design notes](encounter-narrative-design-notes.md) | Jon Ingold's Narrative Sorcery talk: order-independent encounters, defensive logic, player knowledge, consequences, and a proposed watchkeeper scenario. |
| [Ravenloft scenario design notes](ravenloft-scenario-design-notes.md) | Thirteen board-game adventures distilled into objective structures, staged reveals, pressure, remote weaknesses, alternative resolutions, and proposed dungeon scenarios. |
| [Progress-clock design notes](progress-clock-design-notes.md) | Blades in the Dark obstacle/danger clocks, scenario mappings, and a proposed six-segment restoration/four-segment disturbance prototype. |
| [Competing objectives design](competing-objectives-design.md) | User-directed multi-objective levels, visible autonomous monster clocks, player availability, direct races, and kill/disruption counterplay. Current target for the objective-system slice. |
| [Dungeon demo plan](dungeon-demo-plan.md) | Original demo goals, art direction, technical design, and delivery milestones. Includes historical prototype decisions. |
| [4e incorporation plan](4e-incorporation-plan.md) | Tactical abilities, cooldowns, encounter budgets, exploration systems, rewards, and delivery dependencies. |
| [Monster roster plan](monster-roster-plan.md) | Low-level creature catalog, faction/squad behavior, implementation waves, and acceptance criteria. |

See the project [README](../README.md) for current controls and run instructions, and [VERIFICATION.md](../VERIFICATION.md) for recorded implementation results. Roadmap entries describe proposed work unless explicitly marked implemented.

Source-code paths such as `src/world.ts` in these plans are relative to the repository root. Markdown links are relative to the document containing them. Local source references and video transcripts are in [`../ref/`](../ref/); that directory is git-ignored.
