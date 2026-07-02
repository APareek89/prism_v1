# Prism docs index

Start here to navigate the design + build docs.

| Doc | What it covers |
|---|---|
| [`../../handoff.md`](../../handoff.md) | **Session-continuity summary** — status, run steps, decisions, gotchas. Read first. |
| [`../../README.md`](../../README.md) | Quick start + milestones |
| [`../testing.md`](../testing.md) | End-to-end testing path (reset → connect → PRs → run pipeline) |
| [`../dogfooding.md`](../dogfooding.md) | How Prism measures its own development via PRs |
| [`../scoring-model.md`](../scoring-model.md) | **Canonical scoring model (spec v3.0)** — two-index structure (MAIN Core-6 15/35/50 + separate HARNESS index), linkage engine, KPI reference w/ trust + cadence, diagnostic trees, coaching (Addendum B), estimations, build order. App still implements v1 — gap table at top |
| [`ownership-map.md`](ownership-map.md) | **Single-owner rules** — read before adding files (migrations, clients, types, auth) |
| [`../superpowers/specs/2026-06-30-prism-mvp-design.md`](../superpowers/specs/2026-06-30-prism-mvp-design.md) | The MVP design spec (divergences, milestones) |
| [`../superpowers/specs/2026-06-30-prism-architecture.md`](../superpowers/specs/2026-06-30-prism-architecture.md) | Full file-by-file architecture |
| [`../reference/prism_dashboard.html`](../reference/prism_dashboard.html) | The approved pixel design the UI ports |

## The one-line mental model
Deterministic scoring engine (`lib/scoring`, LLM-free) turns real connector data into
`index_daily`/`kpi_daily`; LangGraph agents (`lib/agents`) narrate those numbers (never
compute them); the Inngest pipeline runs the daily loop; the four views render it.
