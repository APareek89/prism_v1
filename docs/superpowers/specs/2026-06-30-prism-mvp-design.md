# Prism — AI-Native Engineering Index — MVP Design

**Date:** 2026-06-30
**Status:** Approved (pending user spec review)
**Authoritative sources:** `Prism_MVP_PRD.md` (the *what* + formulas), `prism_dashboard.html` (the *how it looks*), `Prism_ClaudeCode_BuildPrompt.md` (mission).
This spec records the **deltas and concrete build decisions** layered on top of those documents. Where this spec is silent, the PRD governs. Where this spec diverges from the PRD, **this spec wins** (the divergences are explicitly listed in §2).

---

## 1. Objective
Build Prism: a local-first web app that measures and improves the ROI of Claude Code spend in software engineering. MVP persona = **Engineering, developers only**. Four views (Function / Team / My view / Admin), three connectors (GitHub, Claude Code, Sentry), a deterministic daily scoring pipeline, three insight agents, and an email automation loop. Runs entirely locally until the MVP is proven; deploy target is **Render.com** (not Vercel).

## 2. Divergences from the PRD / build prompt (user decisions, 2026-06-30)
These override the PRD/build-prompt where they conflict:

1. **Hosting = Render, not Vercel.** Build a portable Next.js app (no Vercel-specific APIs). Ship a `render.yaml` blueprint stub for later deploy. Local dev is the only target until MVP is proven.
2. **No dummy / synthetic data — ever.** The PRD's `seed/` script of ~6 synthetic engineers is **dropped entirely** (not even a hidden toggle). The app starts empty and only populates from the user's real connectors.
3. **org = me = team = function.** One person is the whole unit: a single `functions` row + a single `employees` row (the user, `is_demo=true`). Team roster = just that one row. Function L1 = the user's L1.
4. **Empty / "awaiting signal" states everywhere** until real data exists. This is spec-aligned with the PRD confidence model (`confidence < 0.40 → suppress L1, show partials`): with zero PRs, confidence is *Insufficient* and L1 is suppressed.
5. **Pipeline orchestration = Inngest** (kept from PRD), runnable locally via `inngest dev`; on Render later, a Render Cron Job invokes the on-demand trigger.
6. **Email = Resend** via a Supabase Edge Function (SMTP left as commented fallback in env).
7. **Local auth = Supabase Auth + real RLS, plus a `DEMO_MODE`-gated dev sign-in** so the user isn't chasing magic-links on every reload. RLS rules are real and enforced.

## 3. Stack
- **Next.js (App Router) + TypeScript**, React Server Components for the four views; API routes for connectors/config/upload/pipeline trigger. Local: `next dev`. Prod: Render Web Service.
- **Supabase** — Postgres + Row Level Security + Auth. Schema (PRD §6) and RLS (PRD §12.5) as SQL migrations under `supabase/migrations/`.
- **Inngest** — durable daily pipeline (PRD §8), `step.run` per stage, idempotent per `(date, function_id)`, on-demand trigger for the demo. Serve route `/api/inngest`.
- **Anthropic API** — three insight agents only. Default model `claude-sonnet-4-6`; cheaper tier `claude-haiku-4-5` for any classification. `LLM_PROVIDER` configurable. **No LLM in the numeric score.**
- **Resend** — daily digest, sent by a Supabase Edge Function triggered by the pipeline's `comms.send` step.
- **Connectors:** GitHub App (install + webhook + REST/GraphQL backfill); Claude Code via local `~/.claude` session files (`CLAUDE_LOCAL_SESSIONS_DIR`, the `ccusage`-style JSON) for the demo, with the OTEL collector path stubbed for production; Sentry free Developer tier.

## 4. Measurement engine (deterministic — PRD §4 is authoritative)
Implemented in `lib/scoring/`, pure functions, LLM-free, unit-tested:
- **Sizing** (`sizing.ts`): `size_score = files + hunks + 2·modules + 3·blast`; frozen tertiles over trailing-90-day merged PRs; cold-start `S ≤ 6 · M 7–18 · L > 18`; optional LLM tie-break only within ±10% of a threshold (never primary).
- **KPIs** (`kpis.ts`): the 12 KPIs with the exact formulas in PRD §4.2.
- **Normalization** (`normalize.ts`): anchor-based (floor→target), winsorized p5/p95, clamp [0,100], cap at target. Cold-start anchors from PRD §4.4.
- **Index** (`index.ts`): L2 = weighted KPI avg; L1 = Σ(weight×L2) with weights `Usage 10% · Efficiency 25% · Effectiveness 40% · Proficiency 25%` from `index_config`.
- **Banding** (`banding.ts`): PRD §4.5 (L0 gate on AI-active < 0.15; L5 gate on multiplier signal > 0).
- **Confidence** (`confidence.ts`): sum of L2 weights meeting min-signal thresholds; bands High/Medium/Low/Insufficient; small cohort N<8 drops one band.
- **Aggregation:** Function L1 = **median** of member L1s (here, one member). Each computed score records `config_version`. Anti-gaming rules enforced in code (within-bucket only; cap at target; skill counts only if session produced output; versioned config).

## 5. Data model
Supabase migrations implement PRD §6 verbatim (`employees`, `functions`, `connectors`, `index_config`, `gh_prs`, `gh_commits`, `cc_sessions`, `deploys`, `incidents`, `blame_snapshots`, `pr_ai_link`, `kpi_daily`, `index_daily`, `insights`, `recommendations`, `courses`, `comms_log`). `index_config` is seeded with one versioned default row (weights + cold-start anchors + sizing rule). No other seed data.

## 6. Connectors (PRD §7)
- **GitHub** (`lib/connectors/github.ts`): App install + webhook + REST/GraphQL backfill; compute `modules/blast/size_score/size_bucket` on ingest; detect reverts ≤14d; join key = `head_ref` + `sha`.
- **Claude Code** (`lib/connectors/claude-code.ts`): demo path reads local `~/.claude` session JSON → `cc_sessions` (tokens in/out, cacheRead, cost, model, suggestions offered/accepted, `skill.name`, prompt length, accept/reject), map `account_uuid → employee`. OTEL path stubbed. `OTEL_LOG_USER_PROMPTS` stays **off**. BYO edge case (§7.2.1): unmatched/missing streams flagged in Admin, excluded from AI rates, drop confidence.
- **Sentry** (`lib/connectors/sentry.ts`): releases (`sha`→deploy) + incidents → `change_failed`, MTTR (F3). Graceful degradation when not wired (F3 → "insufficient signal"; Effectiveness from F1/F2/F4 at reduced confidence). Appendix A surfaced in Admin when the user connects Sentry.

## 7. Pipeline (PRD §8) — Inngest
`inngest/functions/daily-pipeline.ts`: the 12 steps (ingest github → ingest claude_code → ingest sentry → blame.refresh → link.ai_to_pr → kpi.compute → normalize → index.compute → insights.generate → recommend → monitor.adoption → comms.send). Idempotent per `(date, function_id)`; step 5 gates 6–8; each step writes a status row. On-demand trigger via `POST /api/pipeline/run` (the demo "run now" button in Admin).

## 8. Insight agents (PRD §9) — `lib/agents/`
Numbers in (deterministic), narrative out (Claude), every statement grounded in a provided value:
- **improvement-area** → ranked "top 5 to improve" (`{title, body, dimension, est_impact}`; ranking + est_impact computed in code).
- **change/governance** → "what moved the index" ▲/▼ driver list.
- **pr-level** → `{re-prompt | revert | ai-slop | clean}` + one-line reason + specific fix. AI-slop = AI hunks that merged but failed downstream (low 30d retention OR rework OR revert).
- **improvement attribution + "waste reduced"** (§9.2.1): ties each gain to its cause — improved prompting / skill usage / waste reduced (cacheRead share up, context compaction, skill reuse). Correlational, confidence-banded.

## 9. Automation (PRD §10)
- **Daily email digest** (Resend via Supabase Edge Function `supabase/functions/send-digest/`): structure from §10.1 (header L1+delta+band; spectrum vs squad; up to 3 PR call-outs; top recommendation; course nudge; CTA to My view). Delivery/open → `comms_log`.
- **Recommendations** (§10.2): skill recs (evidence delta) + deterministic process recs.
- **Courses** (§10.3): pre-generated by the agentic learning studio. Clone `github.com/APareek89/agentic-learning-studio@staging`, read its README/source for course schema, hosted course-site URL pattern, and knowledge-check completion signal (webhook vs polled); wire `courses` table + assignment + completion to what the repo exposes. Card opens the course site; completion only on knowledge-check pass. Assumptions stated inline if the repo is ambiguous.
- **Adoption monitoring** (§10.4): verify each recommendation from the same data (skill now used, skill authored, exploratory turns dropped, cacheRead up, knowledge-check passed); drive `suggested → acknowledged → in_progress → adopted/dismissed`.

## 10. UI (port `prism_dashboard.html` faithfully) — `app/` + `components/`
- **Design tokens** copied exactly from the HTML `:root` into `globals.css` (colors, dimension hues Usage `#5b8def` / Efficiency `#2dd4bf` / Effectiveness `#f5a524` / Proficiency `#a78bfa`, fonts Space Grotesk / IBM Plex Sans / JetBrains Mono, prism logo + "One light · four signals").
- **Components:** `Sidebar`, `PeriodToggle`, `MetaStrip`, `IndexHero`, `SpectrumPanel`, `TrendChart`/`BarTrend` (inline SVG, no chart lib), `TokenLens` (Function only), `InsightList`, `ChangeList`, `RosterTable`, `MemberDetail`, `GoingWellList`, `CommsLog`, `CourseCard`, `AdminConnectors`, `AttributionSelector`, `RosterUpload`, `IndexConfig`, `SizingRule`, plus **`EmptyState`** (awaiting-signal treatment matching the dark instrument-panel aesthetic).
- **Routes:** `/function`, `/team`, `/team/[memberId]` (dedicated member-detail route + "← Back to squad"), `/me`, `/admin`. Period toggle swaps trend granularity + delta baseline.
- **Empty-state behavior:** all views render full chrome with empty/awaiting-signal content until `index_daily` has rows. Admin is fully interactive from day one.
- Quality floor: responsive to mobile, visible keyboard focus, reduced-motion respected.

## 11. Access control (PRD §12.5) — Supabase RLS
Enforced in migrations, not just documented: Developer → own My view + function aggregates; Manager → team aggregates + per-member coaching (not reports' raw PRs); Function lead → function + team aggregates; Admin → connectors/roster/config. No manager-facing per-engineer ranking export anywhere. (In the single-user demo the user holds all roles, but the policies are real and tested.)

## 12. Environment (`.env.local`, all placeholders to start)
`ANTHROPIC_API_KEY` (the user's "Claude Code API"), `LLM_PROVIDER=anthropic`, `ANTHROPIC_MODEL=claude-sonnet-4-6`, `ANTHROPIC_CLASSIFIER_MODEL=claude-haiku-4-5`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `CLAUDE_LOCAL_SESSIONS_DIR=~/.claude`, (`OTEL_INGEST_URL`/`OTEL_STORE_*` commented), `RESEND_API_KEY`, (`SMTP_*` commented), `APP_ENV=local`, `DEMO_MODE=true`. `.env.local` gitignored; `.env.example` committed.

## 13. Build milestones
- **M0 — Scaffold (no keys):** Next app + TS, design tokens/globals, Supabase schema + RLS migrations, `index_config` default, dev-bypass auth, `.env.local` + `.env.example`, `render.yaml`, README, scoring-engine package with unit tests (deterministic, no data needed).
- **M1 — Full UI (no keys, no dummy data):** all four views + member drill-in ported pixel-faithfully, rendering empty states, wired to Supabase queries (currently empty); Admin fully interactive (connect cards, roster=me, attribution, config/sizing display, CSV upload).
- **→ PAUSE:** user pastes real keys into `.env.local`, connects GitHub/Claude/Sentry in Admin, does real work.
- **M2 — Connectors:** GitHub + Claude Code (local sessions) + Sentry writing raw tables; sizing + AI→PR link.
- **M3 — Scoring live:** KPI compute → normalize → L1/L2 + confidence + tokens/PR → `index_daily`; Function/Team/My views light up on real data.
- **M4 — Insights + automation:** three agents; Inngest daily pipeline; Resend email digest; recommendations; learning-studio course wiring; adoption monitoring.
- **M5 — Demo polish:** end-to-end real run (connect → work → trigger → numbers + email), styling pass.

## 14. Definition of done (adapted from PRD §15)
A real person (you) is onboarded; the daily job computes your L1/L2 + tokens/PR on a 28-day window; all four views render with correct access control and look like the attached HTML; ≥1 PR-level insight and ≥1 recommendation are generated and delivered by email; adoption monitoring is wired; the Function view shows the cost lens and "what moved the index"; every score drills to its inputs and records its config version; the learning studio repo is cloned and the course flow opens the course site with knowledge-check completion. **No fabricated data anywhere** — empty until your real connectors populate it.

## 15. Open items (non-blocking, resolved during build)
- Learning studio completion mechanism (webhook vs polled) — confirm by reading the repo at M4 (PRD §16b).
- Exact `~/.claude` session JSON shape — verify against the live files at M2; adapt the parser.
- Whether to add a Render Cron Job vs Inngest Cloud for the prod daily trigger — decide at deploy time (post-MVP).
