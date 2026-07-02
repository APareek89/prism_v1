# services/ingest — the v3 ingestion domain (backend teammate)

This workspace is the **ingestion contract** for Prism v3.0. Today it contains no live
connectors — only the three things a backend engineer needs to build them:

1. **`migrations/v3_*.sql`** — the `v3` schema: the raw tables your connectors will fill,
   the computed tables the engine owns (never write those), the config tables the
   Configure tab reads, and `v3.user_context` (written only by the web app).
2. **`scripts/seed.mjs`** — the deterministic dummy seed. **Read it as the spec**: every
   section is annotated with the real source · method · phase (from
   `docs/scoring-model.md` §11) and the natural key its upsert uses. A real connector
   replaces a seed section 1:1 — same table, same columns, same upsert key.
3. This README — the rules that keep the numbers trustworthy.

## Read first (in order)
1. `docs/scoring-model.md` — the v3.0 model spec (what every raw field powers).
2. `scripts/seed.mjs` — the annotated table-by-table ingestion spec.
3. `packages/contract` — the generated TS types for every `v3.*` row.

## Ownership boundaries (the collaboration contract)
| Workspace | Owner | Writes |
|---|---|---|
| `services/ingest` | **you** | `v3.developers/repos/prs/commits/sessions/skills/deploy_events/coaching_events` (raw only) |
| `services/engine` | app owner | `v3.ai_pr_links/kpi_daily/index_daily/insights/recommendations` (computed) |
| `apps/web` | app owner | `v3.user_context` only |
| `packages/contract` | shared | nothing — types only; the ONLY package all three may import |

Import rules: `web → engine` public API only · nobody imports `ingest` · `ingest`
imports `contract` only.

## The rules your connectors must honor
- **Raw rows only.** Never pre-compute a KPI, a link, or a verdict. Example: for KPI 10
  you write `message`, `linked_issue_kind`, `hunk_overlap_pr` — the ENGINE applies the
  evidence ladder (bug issue link → `fix:` type → pattern).
- **Nulls stay nulls.** A missing denominator must reach the engine as absence, not 0 —
  the engine renders "insufficient signal", never a fake zero.
- **Idempotent upserts on natural keys** (per table, as annotated in the seed):
  `developers.handle` · `repos.repo` · `prs(repo,number)` · `commits.sha` ·
  `sessions.session_key` · `skills(developer_id,name)` · `deploy_events.deploy_key` ·
  `coaching_events(developer_id,ts,rule_id)`.
- **Cadence:** capture is realtime where the source pushes (GitHub webhooks, plugin
  hooks, deploy webhooks) + scheduled backfill; **scoring is always a daily batch** run
  by the engine — your job ends at the raw tables.
- **Privacy:** never ingest prompt/response text or source-code content. Length flags,
  booleans, and counts only (`sessions.first_prompt_chars` is the pattern).
- **Scope:** everything lives in schema `v3`. Any migration referencing `public.*` is
  rejected by `scripts/migrate.mjs`.

## Commands (repo root)
```bash
npm run v3:migrate    # apply pending v3 migrations (tracked in v3._v3_migrations)
npm run v3:seed       # deterministic dummy seed (idempotent, re-run friendly)
npm run v3:reset      # drop schema v3 cascade → migrate → seed
npm run v3:recompute  # engine: raw → links → KPIs → indexes → insights → recs
```

## What replaces the seed, per source (build order P1 → P4)
| Phase | Connector | Fills |
|---|---|---|
| P1 | GitHub App (PRs, commits, diffs, native revert linkage) | `prs`, `commits`, `repos` |
| P1 | Claude Code session scan (local logs today) | `sessions` (basics), `skills` |
| P2 | Parser extensions (data already on disk) | `sessions.verification_events/review_pass/context_read_at_start` |
| P3 | GitHub Deployments webhooks | `deploy_events` |
| P4 | OTLP telemetry + Prism coaching plugin | `coaching_events`, fleet-wide `sessions` |
