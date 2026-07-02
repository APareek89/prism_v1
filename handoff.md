# Prism — Handoff / Session Continuity

> Compact status doc. Read this first if you're picking up the build in a new session.
> **What Prism is:** a local-first web app that measures & improves the ROI of Claude Code
> spend in software engineering. One "AI-Native Index (L1)" refracts into four L2 sub-indexes
> (Usage · Efficiency · Effectiveness · Proficiency). Numbers are deterministic; an LLM only
> narrates. Persona = engineering developers. Deploy target = **Render** (not Vercel).

**Repo:** `/Users/anandpareek/Documents/prism` · **GitHub:** `APareek89/prism` (private).
**Local URL:** `npm run dev` → http://localhost:3000 (the preview instance runs on :3070).

---

## Status at a glance
| Milestone | State |
|---|---|
| **M0 — Scaffold** (schema + RLS + deterministic scoring engine + keyless shell) | ✅ DONE |
| **M1 — Full faithful UI** (4 views + drill-in, empty states, read layer) | ✅ DONE |
| **M2 — Connectors + pipeline** (GitHub/Claude/Sentry, AI→PR link, onboarding, ingest→score, Admin wiring) | ✅ DONE |
| **M3 — Scoring fidelity** (per-PR revert/AI-lines/agentic/rework signals, stored config honored) | ✅ DONE |
| **M4 — Insights + automation** (LangGraph agents, Inngest daily pipeline + on-demand full loop, Resend email, deterministic recommendations + adoption, learning-studio courses) | ✅ DONE |
| **M5 — Demo polish + end-to-end** | ✅ DONE (verified on real data) |

**Verified live (2026-07-01):** both connectors are **connected** (the earlier "clean slate" note was
stale). Claude Code ingested **287 `~/.claude` sessions**; GitHub backfilled **8 merged dogfood PRs**
(#1–#8). On-demand pipeline runs clean (`ok:true`) → `kpi_daily`(13) + `index_daily`(3). Index is
`L0 / low` for the self employee — **correct**, because **`pr_ai_link`=0**: no Claude session links to
any PR yet (session `branch=HEAD`, no sha/trailer on the session side), so every AI-denominated KPI is
0/null. Fixing the AI→PR link is the key next piece.

**Session 2026-07-01 — 3 wiring fixes + AI→PR link (all merged to `main`):**
- **PR #9** — (1) persist per-KPI `signal_count` (was computed then dropped in `kpiRowsFor`/`toKpiDb`) →
  improvement + "what's going well" insights now generate; (2) read layer + email show the engine's **stored
  band** (`bandLabelForStored`) not an L1 bucket; (3) `prTitle` gates "AI-assisted" on `aiLinked`.
- **PR #10 — AI→PR link now FIRES.** Claude Code writes a first-party **`pr-link` event** ({sessionId,
  prRepository, prNumber}) to the session log; used as an exact `pr_link`@0.99 join key. Migration **`0033`**
  adds `cc_sessions.pr_refs` + extends the `pr_ai_link.method` CHECK. After re-run: `pr_ai_link` **0 → 50**,
  self employee **band L0 → L1**, `ai_assisted_pr_share` **0 → 100**, Effectiveness gets a real AI denominator,
  blame captured 724 AI lines.

**Model alignment (2026-07-02, PR #11):** the scoring model is now canonically documented in
**`docs/scoring-model.md`** — dimensions + MECE rule (file KPIs by measurement point, not cause),
all 13 KPIs w/ formulas + anchors + live status, the 8 flagged anchors needing review, per-KPI
diagnostic trees (H0 "is the number real?" first), control-group gap, telemetry unlock, privacy
line, and the open-decisions backlog. Read it before changing any KPI/weight/anchor.
**v1.1 (PR #12):** multiplier signal → OUT of the weighted index (now "AI Leaders" recognition +
L5 gate; code change queued); **agent-harness KPI family proposed** — 13 verification-harness ·
14 review-loop · 15 context-continuity (Goodhart guardrails documented).

## MODEL SPEC v3.0 (2026-07-02) — ⚠ SPEC IS AHEAD OF THE APP
The model was iterated through 3 feedback rounds in the **model lab** (`~/Documents/prism-model-lab`,
run `node server.mjs` → localhost:4600; per-row 💬 feedback in `feedback.json`; shareable read-only
copy: https://prism-model-lab-anand-pareeks-projects.vercel.app — feedback buttons only work on
localhost). `docs/scoring-model.md` mirrors the lab (v3.0 sync PR by background agent). Lab source
of truth: `prism-model-lab/public/content.js`.

**v3.0 decisions (owner-approved, NOT yet in code):**
1. **Two indexes.** MAIN index = Usage 15% · Efficiency 35% · Outcomes 50% (Core-6: KPIs 1 ai-share,
   3 cadence, 4 iterations, 6 tokens, 7 revert, 10 rework). **HARNESS index** = KPIs 12 skills-authored,
   13 verification, 14 review-loop, 15 continuity — equal weights, scored SEPARATELY (proficiency is a
   driver; inside the main index it double-counts).
2. **🔗 Linkage engine** (ex-KPI 11): never scored; within-person tests of harness-gap→outcome links
   (verification→reverts/rework · review-loop→reverts+review burden · continuity→iterations/tokens ·
   skills→repeat sessions). This is how "no harness caused your reverts" gets proven, not asserted.
3. **Removed/demoted:** KPI 2 agentic-depth → diagnostic signal · KPI 5 edit-survival → diagnostic
   signal · KPI 8 retention REMOVED (may only return with a human-baseline control) · **Cost/USD
   dropped everywhere — tokens only** · multiplier = AI Leaders recognition + L5 gate only.
4. **KPI 7:** ALL post-merge reverts count (self-caught included); who-caught routes the ACTION
   (self→verification coaching, other→review gate). Detection prefers GitHub-native revert linkage.
5. **KPI 9 rebuilt = "Change reliability"** on an evidence ladder: T1 rollback/hotfix ≤48h
   (GitHub deploy events — DORA, scores, no Sentry needed) · T2 new-error regression (Sentry,
   hygiene-gated ≥90%) · T3 user-impact corroboration · T4 value signal (flags+usage, parked).
   Tier badge on every number; promote to core after one clean T1 month. Sentry = optional enrichment.
6. **Cadence rule:** scoring = daily batch; coaching = realtime in-flow (Addendum B plugin, rules
   C1–C6, local eval ≤500ms, prompt text never leaves the machine).
7. **Backend build order** (Data & Integration tab): P1 Core-6 main index → P2 Harness index (parser
   extensions only — data already on disk) → P3 KPI 9 T1 (GitHub Deployments) → P4 telemetry/org
   rollout + coaching plugin → P5 optional enrichment (Sentry/PagerDuty/extra perms).

**APP vs SPEC gap:** the PRODUCTION app still runs the v1 model — 13 KPIs, weights 10/25/40/25,
retention/CFR/acceptance in the engine, multiplier scored, single index. Nothing in
`apps/web/lib/scoring` has been changed for v3.0 (parked, still 143 tests green). When the owner
says "implement v3.0" for real data, follow scoring-model.md's open-decisions table.

## V3 PREVIEW APP (branch `feat/v3-preview`, 2026-07-02) — BUILT · PR OPEN · DO NOT MERGE

A full v3.0 preview on DETERMINISTIC DUMMY DATA (owner-approved exception, scoped to Postgres
schema `v3` only — recorded in CLAUDE.md; `npm run v3:reset` rebuilds the identical dataset).
All work on this single branch; local only; PR open for architecture review with the backend
teammate — **do not merge until the owner says so.**

**Workspace restructure (the collaboration contract, git-mv'd, history preserved):**
- `apps/web` — the Next.js app (owner's domain). v1 moved unchanged; v3 UI added under `/v3`.
- `services/engine` — v3 scoring+insights+recs. Pure/deterministic/LLM-free, 47 unit tests
  (incl. the lab Dev X worked example 21.8→L1). `npm run v3:recompute`.
- `services/ingest` — TEAMMATE's domain: v3 migrations, annotated deterministic seed
  (10 archetypes; the seed doubles as the ingestion spec), README = ingestion contract.
- `packages/contract` — types generated from the live v3 schema (`npm run generate -w packages/contract`);
  the only package all three import. Import rules: web→engine API only · nobody imports ingest.

**What works end-to-end on :3010 (`.claude` launch `prism-dev`, or root `npm run dev` on :3000):**
`/v3` team dashboard (10 archetypes, BOTH indexes, gates/bands/confidence, sortable, drill-down) ·
`/v3/me` (Index tab: no actions · Live coaching: timed SIMULATED replay of `v3.coaching_events` ·
Growth: CSS/SVG course grid + confirmed-hypothesis improvement areas + real `v3.user_context`
inserts w/ optimistic UI + driving-improvement strip) · `/v3/configure` (whole model FROM the DB,
weight edit, delete-KPI w/ proportional same-index redistribution summing to 100, save → NEW
`config_versions` row → recompute → "config vN" chip everywhere). Verified in-browser (Playwright);
screenshots committed at `docs/v3-preview/screenshots/`.

**Teammate reading order:** (1) `services/ingest/README.md` · (2) `services/ingest/scripts/seed.mjs`
(annotated table-by-table spec) · (3) `docs/scoring-model.md` · (4) `packages/contract`.

**Preview decisions logged (revisit at real implementation):** per-KPI weights = dimension weights
split equally inside each dimension (arithmetically identical to spec §2, gives Configure a per-KPI
editor) · KPI 1 counts any-method links post-hardening, KPI 4 exact `pr_link` only · KPI 6 scores
tokens_in+out, cache-read is a diagnostic share · revert PRs excluded from shipped-work
denominators · self-caught revert insight keyed `ROUTE` (not H2) · confidence formula is a
published preview shape (recalibrate) · engine asOf derived from data (no wall clock).

**Gotchas found this session:** pg returns timestamptz as `Date` + bigint/numeric as strings —
both engine (`run.ts`) and web (`lib/v3/db.ts`) register type parsers (ISO strings + Numbers) ·
creating a SECOND `pg.Client` inside a Next dev route hangs at teardown — routes must reuse the
pool (`recomputeWith(client)`) · persist is batched (chunked multi-row inserts; was ~1000 round
trips ≈ 90s, now ~5s) · the Claude-Preview browser mis-renders streamed Suspense on this app —
use the Playwright MCP for browser verification.

**UI rule (owner correction, 2026-07-02): the v3 preview uses the EXISTING app UI — no new
design.** /v3 renders inside the standard AppShell (root layout untouched, exactly as on main)
and is built ONLY from globals.css classes + existing components: MetaStrip/ViewBody chrome,
`.seg` section nav, `.note` for the DEMO DATA banner, `.mem/.av` roster table, `.hero/.idxcard/
.bignum` index hero, `.subrow` spectrum bars, `.insitem`+`.tag2` insights, `.pritem/.prtag` recs,
`.commlog/.commitem/.stchip` coaching stream, `.course` cards, `.wellitem` improvement areas,
`.linkbtn/.pill` controls. v3 band NAMES (Dormant/Basic/Productive/Workflow/Power/Multiplier)
ride in the v1 chip style; numeric confidence maps to the v1 ConfidenceChip bands. Do not add
bespoke stylesheets to /v3.

## Next session — paste-ready prompt (for the owner)
```
Continue the Prism project at /Users/anandpareek/Documents/prism, branch feat/v3-preview
(v3.0 PREVIEW on dummy data — BUILT, PR open, DO NOT MERGE).
FIRST read, in order: (1) handoff.md — especially the "V3 PREVIEW APP" section (restructure
map, preview decisions, gotchas); (2) docs/scoring-model.md — the v3.0 spec the preview
implements; (3) CLAUDE.md — hard rules incl. the scoped v3-schema dummy-data exception;
(4) services/ingest/README.md — the ingestion contract my backend teammate will review.
ENVIRONMENT: Node 22 via `export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"`;
dev server: launch config `prism-dev` → :3010 (verify in-browser with the PLAYWRIGHT MCP,
not the Claude-Preview browser — it mis-renders this app's streamed Suspense);
data: `npm run v3:reset` then `npm run v3:recompute` (deterministic).
THEN DO, in order:
1. Run a multi-agent adversarial review (Workflow tool) over `git diff main...feat/v3-preview`
   with these finder lenses: owner-requirement compliance · model fidelity vs
   docs/scoring-model.md (anchors/gates/bands/weights/linkage) · engine correctness (window
   boundaries, null-honesty, double counting, pg coercions) · architecture boundaries (no NEW
   code touching public.*, import rules web→engine/contract only, nobody imports ingest,
   keyless boot, v1 lib/scoring unchanged) · UI/API bugs (optimistic updates, config save
   race, validation) · seed determinism. Verify each finding with 2 skeptic agents before
   accepting it. NOTE: workflow scripts reject the literal tokens for wall-clock/random
   calls even inside prompt strings — phrase prompts as "unseeded randomness / wall-clock
   time" instead.
2. Fix confirmed critical/major findings on this branch; keep engine tests + typecheck +
   build green (`npm run test:engine`, `npm run typecheck`, `npm run build`); re-verify
   affected pages via Playwright; commit with the Co-Authored-By: Claude trailer; push.
3. Process any review comments I or my teammate left on the PR
   ("feat: v3.0 preview — workspaces split + dummy-data demo").
HARD RULES: never write synthetic data outside schema v3 · never touch apps/web/lib/scoring
(parked v1) · do NOT merge the PR · update handoff.md before ending.
```

**Still open (follow-ups, no code yet):**
1. **Over-linking** — the repo-scoped `coauthor`@0.60 fallback cartesian-links every same-repo session↔PR
   (22 of 50 links; each of 10 PRs tied to all 5 sessions). Suppress it when `pr_link` already covers a PR +
   de-dupe cwd-split sessions. Violates the no-false-links rule; inflates per-PR iteration attribution.
2. **`ai_code_retention_30d` premature 0** — freshly-merged AI lines (<30d, not re-checked) score 0 instead
   of pending/null, dragging Effectiveness 100→66.7 and L1 ~46.5→33.2.
3. **Function-scope improvement panel empty** — engine emits `kpi_daily` only at employee scope, so function
   has no rows for its improvement agent (persist function KPIs, or aggregate employee KPIs).

---

## Stack & layout
Next.js 15 (App Router) + React 19 + TS · Supabase (Postgres + RLS + Auth) · Inngest (M4) ·
**LangGraph + LangChain (TS, in-process)** for insight agents (M4) · Resend email (M4) ·
connectors: GitHub App, Claude Code local `~/.claude` `.jsonl`, Sentry.

```
app/            App Router — (views)/{function,team,team/[memberId],me} · admin · auth · api/*
components/     panels/* · admin/* · charts/* · ui/* · layout/*  (ports docs/reference/prism_dashboard.html)
lib/
  scoring/      DETERMINISTIC engine (pure, LLM-free, 143 unit tests). Entry: computeDaily()
  connectors/   github/* · claude-code/* · sentry/* · link/* · identity · blame · barrel index.ts
  pipeline/     assemble → computeDaily → persist; run.ts; app/api/pipeline/run
  onboarding/   provision.ts (provisionEmployee, ensureSelfEmployee)
  db/           read modules (DTOs) + onboarding.ts; _base.ts (db() client resolver)
  ui/           view-models.ts (DTO contract)
  auth/ config/ supabase/ types/    cross-cutting
supabase/migrations/   0001–0021 (schema+RLS+seed) · 0030 (attribution kind).  seed = config only
docs/
  superpowers/specs/   design + architecture specs
  architecture/ownership-map.md   single-owner rules (READ before adding files)
  reference/prism_dashboard.html   the approved pixel design
scripts/db-migrate.mjs   portable pg migration runner (no Supabase CLI needed)
```

## Run it
```bash
nvm use                      # Node 22
npm install                  # (.npmrc sets legacy-peer-deps)
npm run db:migrate           # apply supabase/migrations to SUPABASE_DB_URL
npm run dev                  # http://localhost:3000
npm run test:scoring         # 143 deterministic tests
npm run build                # must pass; used for Render
```
Migrations use `node --env-file=.env.local scripts/db-migrate.mjs` (the `db:migrate` script).
`--check` inspects the target without applying.

## Env (`.env.local`, gitignored — never commit)
Set: `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`,
`ANTHROPIC_API_KEY`, `GITHUB_APP_ID/PRIVATE_KEY(base64 PEM)/WEBHOOK_SECRET/CLIENT_ID/CLIENT_SECRET`,
`CLAUDE_LOCAL_SESSIONS_DIR=~/.claude`, `DEMO_MODE=true`, `DEMO_USER_EMAIL`. Blank/optional: `SENTRY_*`,
`RESEND_API_KEY` (M4), `INNGEST_*` (M4 cloud), `LEARNING_STUDIO_BASE_URL` (M4).

## Live DB state (Supabase project fgdqzwlliriyjnwfsnjz)
- `functions`: 1 (bootstrap id `00000000-0000-0000-0000-0000000000f1`, name "My Engineering").
- `index_config`: 1 (v1, weights 10/25/40/25, cold-start anchors). **Only seed. No dummy data.**
- `employees`: 1 — the `is_demo` "You" (email = DEMO_USER_EMAIL). org = me = team.
- `cc_sessions`: 279 real sessions (from `~/.claude`). `gh_prs`: 0 (until GitHub installed).
- `kpi_daily`/`index_daily`: computed (L0/insufficient until PRs).

---

## Key decisions (divergences from the original PRD)
1. **Render, not Vercel** (`next.config` standalone + serverExternalPackages; `render.yaml` stub).
2. **No dummy data — ever.** Only seed is `index_config` v1. Empty/awaiting-signal states until real
   data. (A build agent once created a fake "avastone" employee — deleted; watch for this.)
3. **org = me = team today, multi-employee-ready** — nothing hardcoded to one user; scoring aggregates
   over N (median), RLS multi-user, GitHub org-sync onboards joiners.
4. **Agents = LangGraph + LangChain (TS, in-process)** — narrative only, never the numeric score.
5. **DEMO_MODE auth**: no real Supabase session, so `getAuthUser` binds to the real `is_demo` employee
   via service-role, and `lib/db/_base.ts db()` **reads via service-role in DEMO_MODE** (RLS would deny
   a session-less anon). Production (DEMO_MODE off) uses the RLS client — real enforcement.
6. **Portable pg migration runner** (Supabase CLI not installed). RLS helpers live in `public` schema
   (hosted Supabase denies `CREATE` in `auth`; `auth.uid()` is still used).

## Gotchas / lessons (avoid repeating)
- **Column drift**: subagents guess Supabase column names. ALWAYS read `supabase/migrations/*.sql` as
  the source of truth and validate queries with `select <cols> from public.<t> limit 0` against the
  live DB (the M1/M2 verifier technique). Real cols: employees `name/designation/claude_account_uuid/
  match_status`; connectors `last_sync_at/config_jsonb`; index_config `version/weights_jsonb`; insights
  `evidence_jsonb`; recommendations `ref/rationale` (no title/body); comms_log no `subject`.
- **`insights.kind`** ∈ {improvement, change, pr_level, **attribution**} (0030 added attribution).
- **Migration numbering**: data owns 0001–0021; 0030 = attribution; M4 pipeline tables → **0031+**.
- Real `~/.claude` = per-session `.jsonl`; usage on `message.usage`, model `message.model`, repo/branch
  from `cwd`/`gitBranch`, **no** top-level `account_uuid`; cost derived (pricing.ts).
- Don't write map-key separators as raw `\x00` bytes (makes files binary) — use `\x1f` text escape.

## Automation loop (M4) — how it runs
`POST /api/pipeline/run` (Admin "Run pipeline now") and the Inngest daily function both call
`lib/pipeline/full-loop.ts runFullLoop({functionId,date})` = runPipeline (score) → runInsightsForScope +
runPrLevel (LangGraph agents → `insights`) → deriveAndStoreRecommendations (`recommendations`) →
assignCourses (`courses`) → monitorAdoption → queueDigests (`comms_log`/`comms_outbox`).
- **Agents** (`lib/agents/*`): LangGraph TS, narrative only. Numbers computed in `lib/agents/assemble.ts`;
  LLM schemas have NO numeric fields; `grounding.ts` drops any fabricated number. In DEMO_MODE (or no
  ANTHROPIC key) `mock-model.ts` produces schema-valid canned narration — **runs keyless**. Graph SKIPS a
  scope when confidence < 0.40, so with no GitHub PRs the index/insights stay empty (correct).
- **Recommendations/adoption** (`lib/recommendations/*`, `lib/adoption/*`): pure deterministic rules, no
  LLM. Fire on real session/KPI data; adoption re-verifies from the same data and advances status.
- **Email** (`lib/email/*` + `supabase/functions/send-digest`): digest is RENDERED + QUEUED in-app; the
  Deno Edge Function holds RESEND_API_KEY and sends. Blank RESEND key ⇒ queues, no-op send.
- **Courses** (`lib/courses/*`): maps weak dimension → ALS course; completion is Prism-owned via
  `app/api/courses/check`. ALS repo read at `~/Documents/agentic-learning-studio`.
- **Inngest** (`inngest/*`, `app/api/inngest`): daily cron `0 6 * * *` + on-demand event; run
  `npm run inngest:dev` for the local durable dev server.

## Connectors — how data flows in
Everything writes **raw evidence** tables via the service-role client; the scoring engine reads them.
Connectors are keyless-safe (a not-configured one writes nothing, never throws). Pipeline order:
`ingest.github → ingest.claude_code → ingest.sentry → link.ai_to_pr → blame.refresh → assemble →
computeDaily → persist` (then M4: insights → recs → courses → adoption → comms).

- **GitHub** (`lib/connectors/github/*`): App auth (base64 PEM → installation token). On connect it lists
  the installation's repos → `functions.repo_ids`, then `backfill()` paginates merged+open PRs, fetches
  per-file diffs + commits, computes RAW sizing (`files + hunks + 2·modules + 3·blast`), detects reverts
  (≤14d), and extracts `Co-authored-by: Claude` trailers → `gh_commits.ai_assisted`. Author handle →
  employee via `identity.ts`. Writes `gh_prs`, `gh_commits`, `blame_snapshots`. Webhooks
  (`/api/connectors/github/webhook`) keep it live; "Run pipeline now" backfills without webhooks.
- **Claude Code** (`lib/connectors/claude-code/*`): reads `~/.claude/**/*.jsonl` (the **local** demo path).
  `parser.ts` folds `message.usage` tokens, `message.model`, and derives repo/branch from top-level
  `cwd`/`gitBranch`; cost is DERIVED via `pricing.ts` (no top-level `account_uuid` in local files).
  `session-map.ts` upserts `cc_sessions` (unique on `session_id,repo`) bound to the is_demo self employee.
  Writes `cc_sessions`.
- **Sentry** (`lib/connectors/sentry/*`): releases→`deploys`, incidents→`incidents` (change-failure/MTTR).
  Optional — degrades to "insufficient signal" when unconfigured.
- **AI→PR link** (`lib/connectors/link/ai-to-pr.ts`): correlates a `cc_session` to a merged `gh_pr` and
  writes `pr_ai_link {method, confidence}`. This is what makes a PR "AI-assisted" for the KPIs.

## How a Claude session links to a repo/PR  ← key mental model
A `cc_session` carries `repo` (from the session's `cwd`) and `branch` (from `gitBranch`). The AI→PR link
matches it to a `gh_pr` by, in order: **branch** (`session.branch == pr.head_ref`) · **coauthor** (the
PR's commits have a `Co-authored-by: Claude` trailer) · **sha** overlap. So to generate linked data:
**do the work with Claude Code *inside the connected repo's directory*, on a feature branch, then open a
PR from that branch.** The session (cwd=repo, branch=feature-x) then links to the PR (head_ref=feature-x).
- `CLAUDE_LOCAL_SESSIONS_DIR=~/.claude` is GLOBAL — the scan ingests ALL your Claude sessions across every
  repo; each maps to its own repo via `cwd`. Only sessions/PRs for the **connected** repo(s)
  (`functions.repo_ids`) get AI→PR-linked and feed Effectiveness/Efficiency; other-repo sessions still
  count toward Usage/tokens.
- The self employee's `github_handle` must equal the repo's PR author (set to **`APareek89`**) or PRs land
  unmatched. Set via the roster, or already done for this demo.

## GitHub connect (current state)
- App = **`prismai1989`** (App ID 4181826). "Connect GitHub" now redirects to the **install** flow
  (`/apps/prismai1989/installations/new`), fixed in PR #6 (was wrongly using the OAuth authorize URL).
- Because "Request user authorization (OAuth) during installation" is ON, the Setup URL is disabled; GitHub
  post-install redirects to the **User authorization Callback URL** (set it to
  `http://localhost:3000/api/connectors/github/install`) WITH `installation_id` → our callback connects +
  backfills.
- Repo seeded with **6 real dogfood PRs** (#1–#6, all Claude-coauthored). `functions.repo_ids` =
  `{APareek89/prism}`, self employee `github_handle=APareek89`. DB is a **clean slate** (connectors
  not_configured, no ingested data) awaiting the live connect.

## Testing status / next
End-to-end loop is verified working: connect → sessions → PR → **AI-linked** → scored → narrated, on real data.
Next up are the three follow-ups above (over-linking, retention premature-0, function-scope KPIs). Agent
`ai_slop` verdict stays inert until per-PR agentic/rework signals land on `gh_prs` columns; revert/re-prompt
verdicts work today.

## Commits (main)
`5c6d1e7` spec → `816f330` architecture → `1eb3bf8` M0 → `a72694d` db fixes → `a452bb3` M1 →
`41e2050`/`5ac1eff`/`02cd431` M2 → `9d98a71` M3+M4 → `35da916` M5 docs. Then dogfood PRs #1–#11 (#1–#6 reset/docs/PR-template/install-flow · #7 handoff connectors · #8 CLAUDE.md ·
**#9 scoring+display wiring** · **#10 AI→PR link + migration 0033** · #11 scoring-model doc).
Repo: `APareek89/prism` (private). Workflow going forward = PRs (see `docs/dogfooding.md`).
