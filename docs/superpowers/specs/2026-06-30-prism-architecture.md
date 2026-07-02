# Prism — Full App Architecture (file-by-file)

**Date:** 2026-06-30 · **Repo root:** `/Users/anandpareek/Documents/prism` (paths below are repo-relative — **no `prism/` prefix**).
**Companion:** `2026-06-30-prism-mvp-design.md` (the spec). This doc adds the **agentic framework = LangGraph + LangChain (TypeScript, in-process)** and the **multi-employee-ready** requirement (org=me=team today; code generalizes to N people who join the GitHub org), and resolves the cross-subsystem collisions a review pass found.

---

## 0. Resolved decisions (single-owner reconciliations)
A 7-architect design pass + critic surfaced overlaps; these are the locked resolutions every file below obeys:

1. **One owner per concern.** Migrations are owned by the data layer (`0001–0021`); pipeline/automation appends **net-new** tables at `0030+` only — never redefining employees/attribution/RLS/indexes. One Supabase client module trio, one generated-types file, one auth resolver (`lib/auth/session.ts`), one window helper, one provisioning service (`lib/onboarding/provision.ts`), one GitHub webhook receiver.
2. **Scope enum unified** to `{function, team, employee}` everywhere (DB `scope_kind`, scoring, agents). A PR is a **prLevel input**, not a scope.
3. **Determinism boundary.** All numbers (L1/L2, rankings, est_impact, band, confidence, deltas, PR verdict class) computed in `lib/scoring`. LangGraph agents receive them read-only and emit **only narrative**; `lib/agents/grounding.ts` rejects any number not in the provided set. Deterministic **recommendations + adoption live in the pipeline subsystem**; agents only narrate.
4. **Keyless M0/M1 boot.** No Anthropic client constructed at import (lazy + `DEMO_MODE` mock). `next build` runs with an empty `.env.local`. No dummy data — empty/awaiting-signal states everywhere; only seed is `index_config` v1.
5. **Render, not Vercel.** `next.config` `output:'standalone'` + `serverExternalPackages` for `@langchain/*`+`inngest`; `render.yaml` blueprint stub + healthcheck.
6. **Claude Code reality (landmine #1).** Real `~/.claude` is **per-session `.jsonl`**, token usage on `message.usage`, model on `message.model`, repo/branch from `cwd`+`gitBranch`, **no top-level `account_uuid`**, cost often absent. Parser globs `**/*.jsonl`, folds per-line usage, **derives cost** (`pricing.ts`), keys by `sessionId`+`cwd`, and binds to an employee via **Admin BYO mapping** (account_uuid stays nullable for the OTEL path).
7. **Course completion (landmine #2).** The learning studio's `/api/check` is stateless/per-question with no pass-record and no ALS-user→employee bridge. Completion is therefore **Prism-owned**: a course iframe posts answers to `app/api/courses/check` (proxying ALS `/api/check`), Prism aggregates per-lesson and sets `knowledge_check_passed_at` on all-pass; the ALS-user↔employee link is persisted at assignment. (Confirm the exact ALS branch at M4.)

---

## 1. Top-level tree
```
prism/
├─ app/                         # Next.js App Router (UI + API routes)
│  ├─ (views)/                  #   function · team · team/[memberId] · me  (shared period header)
│  ├─ admin/                    #   connectors · roster · config · sizing
│  ├─ auth/                     #   sign-in + magic-link callback (+ DEMO bypass)
│  └─ api/                      #   inngest · pipeline · connectors · courses · webhooks · health · admin
├─ components/                  # presentational React (ports prism_dashboard.html)
├─ lib/
│  ├─ scoring/                  # deterministic engine (pure, LLM-free, unit-tested)
│  ├─ connectors/               # github · claude-code · sentry · link · onboarding
│  ├─ agents/                   # LangGraph + LangChain (TS, in-process) — narrative only
│  ├─ recommendations/ adoption/ courses/ email/   # automation (deterministic + email)
│  ├─ pipeline/                 # Inngest step harness, gate, roster fan-out
│  ├─ db/ supabase/ auth/ config/ types/ onboarding/ charts/ nav/  # cross-cutting
├─ inngest/                     # client, events, daily-pipeline (12 steps), course poller
├─ supabase/                    # migrations + send-digest Edge Function + config-only seed
├─ scripts/                     # cron targets (trigger-daily, poll-courses)
├─ docs/                        # specs (this file) + ownership-map + pipeline doc
├─ .env.local / .env.example / render.yaml / next.config.js / tsconfig.json / package.json / vitest.config.ts
```

---

## 2. Cross-cutting foundation (`lib/types`, `lib/config`, `lib/supabase`, `lib/auth`, root) — **M0**
The single source of truth every subsystem imports.

| File | Purpose | M |
|---|---|---|
| `package.json` | Pin deps + scripts. next15/react19/ts5.6, @supabase/{supabase-js,ssr}, inngest, **@langchain/langgraph ^0.2 · @langchain/core ^0.3 · @langchain/anthropic ^0.3**, @anthropic-ai/sdk, zod, octokit/@octokit/{webhooks,auth-app}, resend, papaparse, date-fns; dev: vitest, supabase CLI. | M0 |
| `tsconfig.json` | Strict TS, App Router, `@/*` path aliases. | M0 |
| `next.config.js` | Render-portable: `output:'standalone'`, `serverExternalPackages:['@langchain/*','inngest']`, image allowlist. | M0 |
| `.env.example` / `.env.local` | Authoritative env contract (committed) / gitignored real-keys (scaffolded empty, keyless boot). Adds `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY`, `LEARNING_STUDIO_BASE_URL`, `DEMO_USER_EMAIL`. | M0 |
| `render.yaml` | Blueprint stub: one web service + `healthCheckPath:/api/health` + commented Cron Job POSTing `/api/pipeline/run`. | M0 |
| `README.md` | Setup/run, milestone map, org=me=team-but-N-ready note, no-dummy-data contract. | M0 |
| `docs/architecture/ownership-map.md` | **First M0 task**: single owners for migrations, clients, types, auth, window, rec/adoption, webhook, provisioning. | M0 |
| `lib/config/env.ts` | One zod-validated env loader; required server vars throw, connector/agent keys optional (keyless boot); public vs server split. | M0 |
| `lib/config/flags.ts` | `DEMO_MODE`, `APP_ENV`, `isDemoMode()/isLocal()/isProd()`. | M0 |
| `lib/config/models.ts` | LLM model/provider config: `claude-sonnet-4-6` narrative, `claude-haiku-4-5` classifier, `LLM_PROVIDER` switch. | M0 |
| `lib/config/constants.ts` | Window days (28 rolling / 90 sizing), confidence bands, `SMALL_COHORT_N=8`, periods, ROUTES. | M0 |
| `lib/config/attribution.ts` | Per-employee `attribution_mode` resolver (matched/unmatched/byo) — decouples identity from "counts toward AI rates". | M0 |
| `lib/types/{db,scoring,agents,connectors,auth,onboarding,index}.ts` | Hand-authored row types mirroring SQL + shared scoring/agent/connector/auth/onboarding contracts; **shared enums (Band/ConfidenceBand/SizeBucket/Dimension/AttributionMode/KpiId) defined once**; barrel `@/types`. | M0 (onboarding M2) |
| `lib/types/database.generated.ts` | `supabase gen types typescript` output; re-exported by `lib/db`. | M0 |
| `lib/supabase/{server,admin,browser}.ts` | The **one** client trio: RLS server client (RSC/API) · service-role (pipeline/webhook/onboarding only) · browser (anon, interactive Admin). | M0 |
| `lib/auth/session.ts` | The **one** auth resolver: Supabase user → `employees` row → roles; in `DEMO_MODE` returns the seeded `is_demo` employee (no magic-link). | M0 |
| `lib/auth/roles.ts` | Role resolution + `can(user,capability)` per §12.5 (manager can't see reports' raw PRs; admin-only config). | M0 |
| `lib/auth/demo-signin.ts` | `DEMO_MODE`-only dev sign-in server action; hard-throws if `DEMO_MODE` false. | M0 |
| `lib/auth/guards.ts` | `withAuth/withAdmin/withRole` wrappers for routes/actions. | M0 |
| `app/auth/sign-in/page.tsx` · `app/auth/callback/route.ts` | Magic-link form (+ "Continue as demo" when DEMO_MODE) · code→session callback. | M0 |
| `middleware.ts` | Session refresh + route protection; DEMO short-circuit; matcher **excludes** `/api/inngest`, `/api/**/webhook`, `/api/webhooks/*`, `/api/pipeline/*`, `/api/courses/*`, `/api/health`, static. | M0 |
| `lib/onboarding/provision.ts` | The **one** idempotent employee-provisioning service (upsert by handle/email, set attribution+match status, takes `function_id`). | M2 |
| `lib/onboarding/roster-csv.ts` · `org-sync.ts` | CSV importer (papaparse+zod) · GitHub org-member webhook→provision + backfill. Both call `provision.ts`. | M2 |
| `app/api/webhooks/github/route.ts` | **The single** GitHub App webhook receiver: membership→org-sync, PR/push→connector ingest. | M2 |
| `app/api/admin/{roster,attribution}/route.ts` | Admin-only roster CRUD / attribution-mode + Claude-uuid linking. | M2 |
| `app/api/health/route.ts` | 200 + db status for Render healthcheck + smoke checks. | M0 |
| `tests/config/env.test.ts` · `tests/auth/roles.test.ts` · `tests/onboarding/provision.test.ts` | Keyless-boot, access-model, and N-ready idempotent provisioning tests. | M0/M2 |

---

## 3. Data layer / Supabase / RLS (`supabase/migrations`, `lib/db`) — **M0**
One migration per concern; deny-by-default RLS keyed to `auth.uid()→employee`.

**Migrations (data owns 0001–0021; automation appends 0030+):**
`0001_extensions` (pgcrypto, citext) · `0002_enums` (app_role, attribution_mode, connector_type, size_bucket, confidence_band, index_band, rec_kind, rec_status, course_status, comms_channel, **scope_kind=function|team|employee**) · `0003_functions_employees` (incl. `employees.user_id→auth.users`, attribution + onboarding columns) · `0004_employee_roles` (M2M role grants) · `0005_index_config` (versioned weights/anchors/sizing) · `0006_connectors` · `0007_github_raw` (gh_prs, gh_commits) · `0008_claude_sessions` (cc_sessions) · `0009_deploys_incidents` · `0010_blame_pr_link` · `0011_kpi_index_daily` (composite PKs → idempotent recompute) · `0012_insights_recs_courses_comms` · `0013_indexes` · `0014_rls_helpers` (`current_employee()`, `is_admin()`, `has_role()`, `manages_employee()`, `in_function()`) · `0015_rls_enable` (all tables) · `0016_rls_policy_self` (My view) · `0017_rls_policy_function` (function/team aggregates) · `0018_rls_policy_manager` (coaching, **not** raw PRs) · `0019_rls_policy_admin` · `0020_triggers` (freeze config, updated_at, config_version FK) · `0021_seed_index_config` (**only seed — config v1, no employees/PRs/scores**).
`supabase/config.toml` · `supabase/seed.sql` (config-only guard with no-dummy-data header comment).

**`lib/db` (typed query modules, all parameterized by function_id/employee_id):**
`_base.ts` (client switch, trailing-window helpers, pagination) · `schemas.ts` (zod row/jsonb validators) · `index.ts` (barrel) · `functions.ts` · `employees.ts` (`listByFunction`, `getByGithubHandle/ClaudeUuid/UserId`) · `onboarding.ts` (low-level upsert CRUD used by the provisioning service) · `connectors.ts` · `indexConfig.ts` (append-only) · `ghPrs.ts` · `ccSessions.ts` (flags unmatched/BYO) · `deploys.ts` · `blame.ts` · `prAiLink.ts` · `kpiDaily.ts` · `indexDaily.ts` (`getFunctionL1`=median read; empty→EmptyState) · `insights.ts` · `recommendations.ts` · `courses.ts` (completion only on `knowledge_check_passed_at`) · `commsLog.ts`.
Tests: `__tests__/schemas.test.ts` (M0) · `__tests__/rls.policy.test.ts` (M0, local `supabase start`, asserts §12.5 with transient in-test users — rolled back, never persisted).

---

## 4. Scoring engine (`lib/scoring`) — **M0, deterministic, LLM-free, 100% pure**
Raw rows → `kpi_daily` + `index_daily`. No DB/network/clock; run date passed in. **Aggregation is N-member-native** (median over members; single user = N=1 of the same path).

| File | Purpose |
|---|---|
| `types.ts` · `constants.ts` | Shared vocabulary; KPI→dimension map, inversion flags, min-signal thresholds, winsorize p5/p95, cold-start sizing, `SMALL_COHORT_N`, tie-break band. |
| `math.ts` | median/percentile/winsorize/clamp/safeDiv/weightedMean/tertiles (most-tested leaf). |
| `config.ts` · `defaults/index-config.default.ts` | Parse+validate `index_config` → typed `ScoringConfig` (stamps `config_version`); canonical default (Usage .10/Eff .25/Effness .40/Prof .25 + cold-start anchors + sizing). |
| `sizing.ts` | `size_score = files + hunks + 2·modules + 3·blast`; frozen 90-day tertiles; cold-start S≤6/M7-18/L>18; **`needsTieBreak()` hook only** (±10% of boundary; LLM never primary). |
| `kpis/{usage,efficiency,effectiveness,proficiency}.ts` + `kpis/index.ts` | The 12 KPI raw-value formulas (within-bucket where required) + per-member aggregator emitting raw values + signal counts. |
| `normalize.ts` | Anchor floor→target → [0,100], inversion flip, winsorize, clamp, **cap at target** (not percentile). |
| `index-score.ts` | Per-member L2 weighted-mean + L1 = Σ(weight·L2); carries `config_version`, `tokens_per_pr`. |
| `banding.ts` | L0–L5 (L0 gate AI-active<0.15; L5 gate multiplier>0). |
| `confidence.ts` | Σ qualifying L2 weights → High/Med/Low/Insufficient; N<8 drops a band; `shouldSuppressL1` (<0.40) → drives empty states. |
| `tokens-per-pr.ts` | tokens/PR cost lens + cacheRead share + compaction signal (feeds TokenLens + attribution agent). |
| `aggregate.ts` | **Function L1 = median over N members**; re-band/re-confidence at function scope. |
| `anti-gaming.ts` | Centralized guards: within-bucket only, cap-at-target, skill-credit-requires-output, BYO/unmatched dropped, self-revert excluded. |
| `window.ts` | 28-day compute / 90-day sizing windows; resolve Daily/Weekly/Monthly → trend granularity + delta baseline (presentation only). |
| `compute-daily.ts` | Orchestrates the pure pipeline per run-date over `members[]` → ready-to-persist `kpi_daily`+`index_daily` payloads. |
| `index.ts` | Public barrel. |
| `__fixtures__/rows.ts` + 13 `*.test.ts` | Deterministic test-only fixtures (incl. N=3 multi-member) + exhaustive unit tests (math, sizing, each KPI group, normalize, index, banding, confidence, **aggregate median-over-N**, anti-gaming, config, end-to-end empty→suppressed-L1). |
| `vitest.config.ts` (root, see §9) | node env for `lib/**`, jsdom for `components/**`. |

---

## 5. Connectors (`lib/connectors`, `app/api/connectors`) — **M2** (status route M1)
Write **only** raw evidence + connector status; no scores, no narrative. Identity resolves through one chokepoint; org-member sync onboards new joiners.

| Area | Files | Purpose |
|---|---|---|
| Core | `types.ts` · `registry.ts` · `status.ts` · `errors.ts` · `window.ts` · `index.ts` (barrel: `ingestGitHub/ingestClaudeCode/ingestSentry/refreshBlame/linkAiToPr/runMemberSync`) | Connector interface, health, shared windows, thin pipeline entrypoints. |
| GitHub | `github/{client,index,backfill,webhook,diff,sizing,commits,reverts,org-sync}.ts` | App auth/Octokit; REST/GraphQL backfill; webhook dispatch; pure diff→files/hunks; modules/blast + raw `size_score` (not the S/M/L bucket — that's scoring); coauthor-trailer parse; 14-day revert detection; **org-member sync→unmatched employees**. |
| Identity | `identity.ts` | Single chokepoint: github_handle/account_uuid/email → `employees.id` (+ attribution_mode). |
| Claude Code | `claude-code/{index,local-sessions,parser,pricing,session-map,otel-stub,byo}.ts` | **Landmine #1 fixes:** glob `**/*.jsonl`, fold `message.usage`, **derive cost** (`pricing.ts`), repo/branch from `cwd`/`gitBranch`, key by sessionId+cwd; map to employee (BYO binding); OTEL path stubbed (`OTEL_LOG_USER_PROMPTS` off); BYO/unmatched/missing-stream classification → exclude from AI rates + confidence penalty. |
| Sentry | `sentry/{index,client,releases,incidents}.ts` | releases→deploys, issues→incidents, `change_failed`/MTTR; **graceful degradation** (F3→insufficient signal, fall back to F1/F2/F4); **fallback:** default-branch merges as deploys when releases absent. |
| Link | `link/ai-to-pr.ts` · `link/match-keys.ts` | branch+coauthor+sha → `pr_ai_link` with method+confidence (pure, unit-tested; correlational, never in the score). |
| Blame | `blame.ts` | AI-attributed lines → `blame_snapshots`; re-check `alive_at_30d`. |
| API routes | `app/api/connectors/github/{webhook,install,install/callback,sync-members}` · `claude-code/{scan,otel}` · `sentry/connect` · `status` · `employees/{match,upload}` | Connect/backfill/scan triggers (the Admin actions) + status read for awaiting-signal chrome + roster match/CSV onboarding. |
| Tests | `__tests__/{sizing,link-match,cc-parser,identity}.test.ts` | sizing/diff, link confidence, **real .jsonl parser**, many-employee mapping + onboarding + BYO. |

---

## 6. Agent layer — LangGraph + LangChain (TypeScript, in-process, `lib/agents`) — **M4**
Numbers in (from scoring), **narrative out**. Four nodes; grounding gate; no Python service.

**LangGraph design:**
- **`state.ts`** — `Annotation.Root` State channels: `scope ∈ {function,team,employee}` (+ a separate prLevel run), `scopeId`, `date`, `configVersion`, computed `l1`/`l2{usage,eff,effness,prof}`/`band`/`confidence`, `ValueVsAnchor[]` (raw, norm, **anchor floor/target**, weight, dimension, met_min_signal), `DeltaRow[]` (vs baseline), `EvidenceRow[]`, `PrRecord[]`, `tokensPerPr`, and reducer-backed outputs `insights[]`/`recommendations[]`/`diagnostics[]`.
- **`assemble.ts`** (added by critique) — maps scoring outputs + `index_daily`/`kpi_daily` diffs into State channels so **agents never re-derive numbers**; called by the insights pipeline step.
- **`graph.ts`** — `StateGraph`: scope-insights graph `improvement-area → change-governance → improvement-attribution` (+ a separate compiled prLevel graph); conditional edges skip nodes when `confidence<0.40` or no evidence; exports compiled runnables.
- **`model.ts`** — **lazy** `ChatAnthropic` (sonnet-4-6 narrator temp 0, haiku-4-5 classifier) + `withStructuredOutput(zod)`; gated by `DEMO_MODE`/mock so keyless M1 never constructs the SDK.
- **`schemas.ts`** — zod output schemas (narrative fields + `evidenceRefs[]` only; numeric fields deliberately absent so the model can't return a score).
- **`grounding.ts`** — anti-hallucination gate: every `evidenceRefs` id must exist and every quoted number must appear in the provided set; one repair retry else drop.
- **`nodes/{improvement-area,change-governance,pr-level,improvement-attribution}.ts`** — the four agents. `pr-level` classifies `{re-prompt|revert|ai-slop|clean}` **in code** (`classifyPr`), LLM writes only reason+fix.
- **`prompts/{system,improvement-area,change-governance,pr-level,improvement-attribution}.ts`** — grounded templates ("narrate provided numbers only; cite evidenceRefs").
- **`tools/evidence.ts`** — minimal `fetchEvidence` tool (no arithmetic).
- **`run.ts`** — entrypoints `runInsightsForScope`/`runPrLevel` invoked by Inngest steps 9; persists to `insights` (idempotent per date,scope,scopeId).
- **`mock-model.ts`** (M1) — schema-valid canned narration so the graph/pipeline run end-to-end **keyless** before keys are added.
- `index.ts` barrel · `__tests__/{grounding,pr-classify}.test.ts` · `__tests__/fixtures.ts` · `README.md` (TS-LangGraph decision + Python-service alternative).

> **Determinism:** rankings/est_impact/verdict-class are scoring's; agents narrate. `recommendations`+`adoption` are **owned by the pipeline subsystem** (§7), agents import `RecommendationCandidate` and narrate the rationale only — the duplicate `lib/agents/recommendations/*` is removed.

---

## 7. Pipeline + automation (`inngest`, `lib/pipeline`, `lib/recommendations`, `lib/adoption`, `lib/courses`, `lib/email`, `supabase/functions`) — **M4** (harness M0)
Durable 12-step daily Inngest function, idempotent per `(date, function_id)`, fans out over **all** active members.

| Area | Files | Purpose |
|---|---|---|
| Inngest core | `inngest/client.ts` · `inngest/events.ts` · `inngest/functions/index.ts` · `app/api/inngest/route.ts` | Typed client/events; serve route (M0 so `inngest dev` works early). |
| Daily pipeline | `inngest/functions/daily-pipeline.ts` + `steps/{ingest-github,ingest-claude-code,ingest-sentry,blame-refresh,link-ai-to-pr,kpi-compute,normalize,index-compute,insights-generate,recommend,monitor-adoption,comms-send}.ts` | The 12 steps. **Step 5 (link) is the GATE**: insufficient signal → steps 6–8 **skipped, never faked**. Steps 9–12 degrade gracefully. |
| Harness | `lib/pipeline/{trigger,status,roster,gate,context}.ts` | `pipeline_runs`/`pipeline_steps` idempotency; `listFunctionMembers` fan-out; gate logic; immutable per-run context (frozen config + window + members). |
| On-demand | `app/api/pipeline/run/route.ts` · `app/api/pipeline/status/[runId]/route.ts` · `scripts/trigger-daily.ts` | Admin "Run now" + live per-step status + Render-cron CLI target. |
| Recommendations | `lib/recommendations/{engine,store}.ts` + `rules/{index,types,skill-reuse,skill-author,size-discipline,acceptance-rate,cache-efficiency,revert-rate,course-nudge}.ts` | **Deterministic** rules → `recommendations` with evidence deltas; one open rec per (member,kind,ref). |
| Adoption | `lib/adoption/{monitor,predicates,transitions}.ts` | Re-verify each rec from the same data (skill now used / authored / exploratory turns dropped / cacheRead up / knowledge-check passed) → status machine. |
| Courses | `lib/courses/{catalogue,client,assign,poll,store}.ts` · `app/api/courses/check/route.ts` | **Landmine #2 fix:** weak-dimension→ALS slug; assign if uncovered; **Prism-owned knowledge-check** (`app/api/courses/check` proxies ALS `/api/check`, aggregates, sets `knowledge_check_passed_at` on all-pass); ALS-user↔employee link persisted at assignment. `app/api/webhooks/learning-studio/route.ts` stubbed for a future callback. |
| Email | `lib/email/{render,template,data,outbox}.ts` · `app/api/webhooks/resend/route.ts` · `supabase/functions/send-digest/{index,resend,types,deno.json}.ts` | In-process per-employee digest render (§10.1, no LLM) → `comms_outbox`; **Edge Function holds the only Resend key**; open/delivery webhook → `comms_log`. |
| Net-new migrations | `supabase/migrations/0030_pipeline_runs.sql` · `0031_comms_outbox.sql` · `0032_rls_pipeline_courses.sql` | Status/outbox tables + RLS (admin-only / service-role-only) — append-only, no redefinition. |
| Tests/docs | `lib/email/__tests__/render.test.ts` · `lib/recommendations/__tests__/rules.test.ts` · `lib/adoption/__tests__/transitions.test.ts` · `inngest/functions/__tests__/daily-pipeline.test.ts` · `docs/pipeline.md` | Render/empty-suppress, rule thresholds, transition gating, step-order/gate/idempotency/fan-out. |

---

## 8. UI / routing / components (`app`, `components`) — **M1** (shell + tokens M0)
Ports `prism_dashboard.html` faithfully; RSC views call `lib/db` and pass DTOs to presentational components; **EmptyState** is the no-dummy-data primitive.

| Area | Files | Purpose |
|---|---|---|
| Shell/tokens | `app/layout.tsx` · `app/globals.css` (exact `:root` tokens) · `app/tokens.ts` (typed hue mirror) · `app/page.tsx` (→/function) · `components/layout/{AppShell,Sidebar,MetaStrip,AdminNav}.tsx` · `components/brand/PrismLogo.tsx` · `lib/nav/routes.ts` · `lib/format.ts` | Fonts, dark instrument-panel chrome, prism logo + "One light · four signals", responsive + focus + reduced-motion. (M0) |
| Views | `app/(views)/layout.tsx` · `(views)/function/page.tsx` · `(views)/team/page.tsx` · `(views)/team/[memberId]/page.tsx` · `(views)/me/page.tsx` · `(views)/me/courses/[courseId]/page.tsx` · `app/admin/{layout,page}.tsx` | The 5 routes; member-detail on its own route; `/me` reuses `MemberDetail` via current-employee resolve; Admin fully interactive day one. |
| Panels | `components/panels/{IndexHero,SpectrumPanel,TokenLens,InsightList,ChangeList,RosterTable,MemberDetail,GoingWellList,RecommendationList,CourseCard,CommsLog}.tsx` | The dashboard blocks. `RosterTable`/`MemberDetail` loop over N members; `IndexHero` suppresses L1→EmptyState when confidence<0.40. |
| Charts | `components/charts/{TrendChart,BarTrend}.tsx` · `lib/charts/scale.ts` | Inline-SVG only (no chart lib). |
| Admin | `components/admin/{AdminConnectors,AttributionSelector,AttributionBadge,RosterUpload,IndexConfig,SizingRule}.tsx` | Connect cards + "Run pipeline now", the matched/unmatched/BYO onboarding controls, CSV upload, versioned config + sizing display. |
| UI kit | `components/ui/{EmptyState,Panel,BandChip,ConfidenceChip,DeltaArrow,StatusPill,ProgressBar,Skeleton,BackLink}.tsx` · `lib/ui/view-models.ts` | Primitives + DTO types (member-agnostic). `view-models` imports agent/scoring **types only** (keyless). |
| App files | `app/not-found.tsx` · `app/error.tsx` · `app/loading.tsx` | 404 / error boundary / suspense skeletons. |
| Tests | `components/__tests__/{IndexHero,RosterTable,EmptyState}.test.tsx` | Lock L1-suppression, 0/1/N roster, empty-state variants. |

---

## 9. Multi-employee readiness (org=me=team today, N-ready in code)
- **Identity is data, not constants:** `employees.user_id→auth.users`, `employee_roles` M2M, SQL `current_employee()` + TS `lib/auth/session.ts` resolve any JWT to its own employee/roles/function. RLS is written per-role, holds for many concurrent users.
- **Aggregation is N-native:** `scoring/aggregate.ts` computes Function L1 = **median over `members[]`**; the demo is just N=1. `compute-daily.ts` loops members. `confidence.ts` implements the N<8 cohort rule.
- **Pipeline fans out:** every step iterates `listFunctionMembers(functionId)`; insights/recs/adoption/courses/digest are per `employee_id`; `comms_outbox` gets one row per employee.
- **UI is loops:** `RosterTable.map`, dynamic `/team/[memberId]`, shared `MemberDetail`.
- **Onboarding path for new GitHub-org members:** `connectors/github/org-sync.ts` (webhook + backfill) → `lib/onboarding/provision.ts` (the one service) → matched/unmatched/BYO; plus Admin CSV (`roster-csv.ts`) and manual add. A new joiner appears in the roster and is scored/emailed on the next run with zero code change.

---

## 10. Milestone roll-up
- **M0 (no keys):** root config + env (keyless boot) + ownership-map; full Supabase schema + RLS + config-only seed; the entire **deterministic scoring engine + unit tests**; auth (Supabase + DEMO bypass) + middleware + health route; design tokens + shell; Inngest serve route. `next build` green on empty `.env.local`.
- **M1 (no keys, no dummy data):** all 4 views + drill-in ported faithfully rendering **empty/awaiting-signal**; Admin fully interactive; agent **mock-model** so graphs run keyless. **→ PAUSE for keys + connect sources.**
- **M2:** GitHub + Claude-Code (`.jsonl`) + Sentry connectors writing raw tables; sizing + AI→PR link; onboarding/org-sync.
- **M3:** scoring wired to real rows → `kpi_daily`/`index_daily`; views light up.
- **M4:** LangGraph agents + Inngest 12-step pipeline + Resend digest + deterministic recommendations + Prism-owned course completion + adoption monitoring.
- **M5:** end-to-end real run + polish.

---

## 11. Open items confirmed at build time
- ALS exact branch (`staging` vs `library-rich-codex`) + the `/api/check` per-question contract — confirm by reading the cloned repo at M4 (completion is Prism-owned regardless).
- Real `~/.claude` `.jsonl` field shapes — verify against live files at M2; `pricing.ts` cost table kept current.
- Render prod daily trigger (Inngest Cloud vs Render Cron) — deploy-time, both emit the same event.
