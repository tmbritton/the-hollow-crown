# Planning documents

Start with [game direction](game-direction.md) for the chosen scope and open playtest questions;
use [implementation path](implementation-path.md) for the dependency-ordered delivery queue.

| Document | Purpose |
| --- | --- |
| [Game direction](game-direction.md) | Chosen compact, simulation-heavy scenario direction: approachable single-adventurer controls, autonomous agendas, circumstance-driven escalation and provisional playtest candidates. |
| [Implementation path](implementation-path.md) | Dependency-ordered feature slices and the test-first, verification, review, commit workflow. |
| [Implementation progress](implementation-progress.md) | Delivery tracker, checks and review. P1–P7 delivered; P7 published at `3934e17`. T2/A0, A1–A7 and P8–P9 independently reviewed READY. |
| [CPU performance plan](cpu-performance-plan.md) | Next delivery queue after P9: CPU0 refreshes the historical `3cfb378` baseline, then CPU1–CPU7 address door/obstacle queries, idle collision, route hitches, nearby colliders, scene traversal and animation scheduling, with correctness and hardware acceptance gates. |
| [Animation roadmap](animation-roadmap.md) | Shared humanoid/tailed rigs, complete animation migration, shield motion and death physics. A0–A7 and P8–P9 independently reviewed READY. |
| [Animation baseline](animation-baseline.md) | A0 review controls, complete 30-clip inventory, reproducible captures, current foot/grip defects, 25-actor baseline and initial A1/A2 budgets. |
| [Rig foundation](rig-foundation.md) | Implemented A1 semantic anatomy/profiles, pose and socket APIs, ECS ownership, compatibility/final-writer boundaries and parity/cost verification. |
| [Rig solver](rig-solver.md) | Implemented A2 coordinated body/limb IK, target spaces and priorities, binding-compatible scale, singular projections, operation budgets and actual-mesh verification. |
| [Rig grounding](rig-grounding.md) | Implemented A3 living pose/contact migration, slope-aware soles, fixed gameplay anchor, bounded final-surface checks, presentation snapshots and reset/death handoff. |
| [Rig actions](rig-actions.md) | Implemented A4 action/work/social layers, coordinated grips, solved equipment/cargo sockets and semantic temporary collapse; final geometry checks and independent READY review. |
| [Rig tails](rig-tails.md) | Reviewed A5 four-segment anatomy, drawn-surface/masonry clearance, stable fallback and corpse settling, bounded work and actual-mesh verification. |
| [Rig shields](rig-shields.md) | A6 accepted-block events, immediate protective targets, supporting anticipation, controlled lowering/recoil and phalanx presentation; TDD and actual-mesh checks. |
| [Rig handoff](rig-handoff.md) | A7 semantic-only pose ownership, fixed-step world velocities, detached/rebased death snapshots, pre-stop blow/motion capture and reset/disposal retirement. |
| [Ragdoll deaths](ragdoll-deaths.md) | P8 directional launches with seeded variation, bounded articulated physics, world/tread contacts, relocated remains and reset/disposal ownership. |
| [Skeleton breakup](skeleton-breakup.md) | P9 separated anatomical chunks, seeded scatter, per-piece terrain coverage, scattered-remains perception and bounded settled decoration. |
| [Effect refactor plan](effect-refactor-plan.md) | Planned composable generation stages, typed failures and bounded local tracing, with a separate run-scope follow-up. EF0–EF4 follow CPU7 and precede further procedural-feature expansion. |
| [Procedural content improvement plan](procedural-content-improvement-plan.md) | Shared keep identities, composed scenes, memorable inhabitants, discoveries, adventure grammars, and seed-review tooling. Further expansion follows the Effect gate and uses compact scenario playtests to guide reusable content systems. |
| [Encounter narrative design notes](encounter-narrative-design-notes.md) | Jon Ingold's Narrative Sorcery talk: order-independent encounters, defensive logic, player knowledge, consequences, and a proposed watchkeeper scenario. |
| [Ravenloft scenario design notes](ravenloft-scenario-design-notes.md) | Thirteen board-game adventures distilled into objective structures, staged reveals, pressure, remote weaknesses, alternative resolutions, and proposed dungeon scenarios. Historical recommendations inform the playtest-led direction. |
| [Progress-clock design notes](progress-clock-design-notes.md) | Blades in the Dark obstacle/danger clocks, scenario mappings, and a proposed six-segment restoration/four-segment disturbance prototype. |
| [Competing objectives design](competing-objectives-design.md) | User-directed multi-objective levels, visible autonomous monster clocks, player availability, direct races, and kill/disruption counterplay. Delivered O1–O4 provide foundations for compact living scenarios. |
| [Dungeon demo plan](dungeon-demo-plan.md) | Original demo goals, art direction, technical design, and delivery milestones. Includes historical prototype decisions. |
| [4e incorporation plan](4e-incorporation-plan.md) | Tactical abilities, cooldowns, encounter budgets, exploration systems, rewards, and delivery dependencies. |
| [Monster roster plan](monster-roster-plan.md) | Low-level creature catalog, faction/squad behavior, implementation waves, and acceptance criteria. |

See the project [README](../README.md) for current controls and run instructions, and [VERIFICATION.md](../VERIFICATION.md) for recorded implementation results. Roadmap entries describe proposed work unless explicitly marked implemented.

Source-code paths such as `src/world.ts` in these plans are relative to the repository root. Markdown links are relative to the document containing them. Local source references and video transcripts are in [`../ref/`](../ref/); that directory is git-ignored.
