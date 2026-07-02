# Ownership map (single owner per concern)

The architecture was designed by parallel subsystem agents; this map prevents the duplication a
review pass found. **One owner, one location** for each shared concern. Read before adding files.

| Concern | Single owner | Notes |
|---|---|---|
| **Supabase migrations** | `supabase/migrations/0001–0021` (data layer) | Automation appends **net-new** at `0030+`. `0030` = insights `attribution` kind (applied). M4 pipeline_runs/comms_outbox/RLS → `0031+`. Never redefine employees / attribution / RLS / indexes elsewhere. |
| **Supabase clients** | `lib/supabase/{server,admin,browser}.ts` | `server` = RLS (RSC/API) · `admin` = service-role (pipeline/webhook/onboarding only) · `browser` = anon. No other client modules. |
| **Generated DB types** | `lib/types/database.generated.ts` | Re-exported by `lib/db`. Regenerated via `npm run db:types`. |
| **Auth resolution** | `lib/auth/session.ts` | The one JWT→employee→roles resolver (+ DEMO_MODE bypass). No `getAuthContext`/`getCurrentEmployee` duplicates. |
| **Trailing-window math** | `lib/scoring/window.ts` | 28-day compute / 90-day sizing. Connectors import it. |
| **Scope enum** | `{function, team, employee}` | DB `scope_kind`, scoring, agents — all agree. A PR is a *prLevel input*, not a scope. |
| **Shared enums** | `lib/types` (Band, ConfidenceBand, SizeBucket, Dimension, AttributionMode, KpiId) | The scoring engine keeps a self-contained copy in `lib/scoring/types.ts` for M0 (pure/independent); **reconcile to a single import at M3** when the UI first consumes scoring. |
| **Recommendations + adoption** | pipeline subsystem (`lib/recommendations/*`, `lib/adoption/*`) | Deterministic. Agents narrate only and import `RecommendationCandidate`. No `lib/agents/recommendations/*`. |
| **Scoring→agent input assembly** | `lib/agents/assemble.ts` | Maps scoring outputs + `index_daily`/`kpi_daily` diffs into LangGraph State so agents never re-derive numbers. |
| **GitHub webhook receiver** | `app/api/connectors/github/webhook/route.ts` | The single receiver (a GitHub App posts to ONE URL). Routes membership → org-sync, PR/push → ingest. |
| **Employee provisioning** | `lib/onboarding/provision.ts` | The one idempotent service. `identity.ts` resolves then calls it; `lib/db/onboarding.ts` is the low-level CRUD it uses. |
| **Anthropic client** | `lib/agents/model.ts` | **Lazy** construction inside node calls, gated by DEMO_MODE/mock — so M1 builds keyless. |

## Keyless-boot invariant
`next build` and `npm run test:scoring` must pass with an **empty `.env.local`**. No module may
construct a Supabase or Anthropic client at import time in a way that throws without keys.

## No-dummy-data invariant
The only seed is `index_config` v1 (+ one bootstrap `functions` row). No synthetic employees, PRs,
or scores anywhere. Test fixtures live only in `__tests__`/`__fixtures__` and are never imported by
app or pipeline code.
