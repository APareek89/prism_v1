# Prism — instructions for Claude Code

Prism is the **AI-Native Engineering Index** — a Next.js + Supabase app that measures the ROI of
Claude Code usage in engineering. It is built (M0–M5) and runs locally on http://localhost:3000.

## Start of EVERY session
1. **Read [`handoff.md`](handoff.md) first.** It is the living source of truth: status, architecture,
   key decisions, gotchas, connectors, and how Claude sessions link to repos.
2. Skim [`docs/architecture/README.md`](docs/architecture/README.md) for the doc index + mental model.

## End of meaningful work — keep the handoff current
After you finish a meaningful chunk (a fix, a feature, a milestone, a decision), **update `handoff.md`**
(status line, any new decision/gotcha, the commits list) and commit it, so the *next* session stays
oriented. Treat `handoff.md` as the project's memory — a session that doesn't update it loses continuity.

## Hard rules (do not violate)
- **No dummy/synthetic data — ever.** Only real ingested data. The only DB seed is `index_config` v1.
  The retired `v3.*` preview and its seed tooling were removed on 2026-07-17. Every product route
  reads real `public.*` evidence or shows an honest empty state.
- **Column truth = `supabase/migrations/*.sql`.** Before trusting any query, validate columns against the
  LIVE DB: `select <cols> from public.<table> limit 0` (via `pg` + `SUPABASE_DB_URL`,
  `node --env-file=.env.local`). This bit us repeatedly — subagents guess column names.
- **Authentication is always real Supabase Auth + RLS.** There is no demo-user fallback or service-role
  page-read bypass. See `lib/db/_base.ts` + `lib/auth/session.ts`.
- **Determinism boundary:** all numbers come from `lib/scoring` (pure, LLM-free); LangGraph agents in
  `lib/agents` ONLY narrate — never compute a score.
- **Migrations:** data owns `0001–0021`; automation appends `0030+`. Never redefine existing tables.

## Workflow = PRs (dogfooding)
Prism measures its own development. Do work on a branch → PR → merge, and **keep the
`Co-authored-by: Claude` commit trailer** so Prism links the AI session to the PR. See
[`docs/dogfooding.md`](docs/dogfooding.md).

## Run / verify
`npm run dev` (:3000) · `npm run test` · `npm run typecheck` · `npm run build` ·
`npm run db:migrate` · `npm run inngest:dev` (durable pipeline).
