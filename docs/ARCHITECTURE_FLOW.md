# Prism architecture flow

This is the real-only user and evidence flow. GitHub defines the team, Supabase Auth links a login to one discovered employee, and that developer explicitly connects Codex or Claude Code. The deterministic scoring boundary remains unchanged.

```mermaid
flowchart LR
  K["GitHub App installation"] --> T["Real team + delivery evidence"]
  T --> L["Supabase email login"]
  L --> M["My workspace command"]
  M --> N["Metadata-only OTLP collector"]
  N --> A["Live public raw evidence"]
  T --> A
  A --> B["Deterministic MAIN + HARNESS engine"]
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
- Every product route reads real `public.*` rows through the authenticated RLS client; connector and pipeline writes use narrowly scoped service-role paths.
- GitHub installation is organization/account-level. Codex and Claude Code are connected per person through a hashed one-time invite and a personal collector token.
- A login claims only an active, unclaimed employee whose normalized email exactly matches the Supabase user. The first linked real user bootstraps the initial admin role.
- The OTLP boundary allowlists session/model/token/turn/prompt-length/success metadata and discards bodies plus unknown attributes before persistence.
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
| Supabase identity linking | `apps/web/lib/auth/session.ts`, `workspace.ts`, `apps/web/app/auth/**` |
| Private workspace | `apps/web/app/(views)/me/page.tsx`, `apps/web/components/connect/WorkspaceTelemetryCard.tsx` |
| Model configuration | `apps/web/app/(views)/configure/page.tsx` |
| Real-data reads | `apps/web/lib/db/**`, `apps/web/lib/connectors/telemetry/store.ts` |
| Deterministic scoring | `services/engine` |
