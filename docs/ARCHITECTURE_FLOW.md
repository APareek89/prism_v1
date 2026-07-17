# Prism architecture flow

This is the user-facing decision flow. The Connect MVP adds real GitHub and per-user AI-tool inputs while keeping the deterministic scoring boundary unchanged. Live connector rows remain visibly separate from the v3 demo scoring world until a production ingestion adapter is promoted.

```mermaid
flowchart LR
  K["GitHub App installation"] --> A["Live public raw evidence"]
  L["Personal Codex / Claude opt-in"] --> M["Metadata-only OTLP collector"]
  M --> A
  A -. "production adapter pending" .-> B["Deterministic MAIN + HARNESS engine"]
  V["v3 preview evidence"] --> B
  B --> C{"Role / route context"}
  C -->|"Leader"| D["Function decision view"]
  C -->|"Coach"| E["People support view"]
  C -->|"Developer"| F["Private impact + growth view"]
  C -->|"Model owner"| G["Versioned configuration"]
  D --> H["Evidence"]
  E --> H
  F --> H
  H --> I["Prioritized action"]
  G --> J["Recompute"]
  J --> B
```

## Alignment

- `services/engine` remains the only owner of index calculations.
- `/connect` reads real `public.*` connector-control/raw tables; primary scoring views continue to read the isolated `v3.*` preview and retain the demo disclosure.
- GitHub installation is organization/account-level. Codex and Claude Code are connected per person through a hashed one-time invite and a personal collector token.
- The OTLP boundary allowlists session/model/token/turn/prompt-length/success metadata and discards bodies plus unknown attributes before persistence.
- `apps/web/lib/v3/read.ts` and `rollup.ts` remain the read/display boundary.
- The web app may derive presentation labels, counts, sorting, and prioritization from already-computed rows; it may not recalculate scores.
- The agent coaching flow consumes deterministic facts and produces grounded narrative only.
- Configuration remains append-only: save a version, then recompute all views.

## Gates at a glance

| Gate | Enforcer | Threshold / behavior |
|---|---|---|
| MAIN publish | deterministic engine | confidence at least 0.40 |
| MAIN L0 | deterministic engine | AI-assisted share below 15% |
| MAIN L5 | deterministic engine | multiplier signal required |
| HARNESS | deterministic engine | separate index and confidence; never mixed into MAIN |
| Agent grounding | agent pipeline | unsupported numeric claims are repaired once, then dropped |

## File index

| Stage | Owner files |
|---|---|
| Shell and navigation | `apps/web/components/layout/*` |
| Live connection setup | `apps/web/app/(views)/connect/page.tsx`, `apps/web/components/connect/ConnectClient.tsx` |
| Personal OTLP ingest | `apps/web/app/api/connect/telemetry/**`, `apps/web/lib/connectors/telemetry/**` |
| Connection schema | `apps/web/supabase/migrations/0034_connect_mvp.sql` |
| Function view | `apps/web/app/(views)/function/page.tsx` |
| Team and member views | `apps/web/app/(views)/team/**` |
| Private workspace | `apps/web/app/(views)/me/page.tsx`, `apps/web/components/v3/MyView.tsx` |
| Model configuration | `apps/web/app/(views)/configure/page.tsx`, `ConfigureTable.tsx` |
| Reads and rollups | `apps/web/lib/v3/read.ts`, `rollup.ts` |
| Deterministic scoring | `services/engine` |
