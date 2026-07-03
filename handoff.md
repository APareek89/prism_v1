# Prism v1 — Handoff / Session Continuity

> Read this first when picking up the build. **This repo (`~/Documents/Prism v1`) is the
> canonical, integrated app** — there is no v1/v3 split anymore. Local only: no remote, no PRs
> (owner decision, 2026-07-02). The old repo `~/Documents/prism` is reference-only
> (its PR #17 was closed unmerged; branch `feat/v3-preview` kept for history).

**What Prism is:** a local-first web app measuring & improving the ROI of Claude Code spend in
engineering. **One app, four tabs — Function · Team · My view · Configure — the approved v1 UI
(docs/reference/prism_dashboard.html design system) powered by the v3.0 scoring model** on a
deterministic demo dataset. Numbers are deterministic and LLM-free; narration is templated
(keyless). Persona = engineering developers.

---

## Status at a glance (2026-07-02)

| Piece | State |
|---|---|
| Workspace restructure (apps/web · services/engine · services/ingest · packages/contract) | ✅ DONE |
| v3 schema + deterministic 10-archetype seed (schema `v3` only; public.* untouched) | ✅ DONE (checksum-verified reproducible) |
| Engine v3 (Core-6 main index · separate Harness index · linkage engine · tier-badged KPI 9 · insights · ranked recs) | ✅ DONE — 47 unit tests incl. the lab Dev X example (21.8 → L1) |
| **Unified UI** — Function/Team/My view/Configure on the v3 engine, v1 design | ✅ DONE (verified in-browser, tab by tab) |
| Configure loop (edit weights · delete-KPI w/ proportional redistribution · save → new config version → full recompute → all views flip together) | ✅ DONE (active = config v5) |
| Growth actions → real `v3.user_context` rows (optimistic UI, survives reload) | ✅ DONE |
| **Agentic coaching flow** (LLM good/bad insights · course picks · practice suggestions, grounded, per-dev, on-demand) | ✅ DONE (2026-07-03, live-verified with claude-sonnet-4-6) |
| Pipeline coherence (Function median = median of Team rows; same insight/rec rows across views) | ✅ VERIFIED against DB |
| v1 Admin section | ❌ REMOVED (owner decision) — `/admin` 404s |
| Old v1 scoring | 🅿 PARKED — `apps/web/lib/scoring` untouched, its 143 tests still green (241 web tests total) |

**Build health:** `npm run typecheck` / `npm run build` green for all 4 workspaces ·
288 tests pass (47 engine + 241 web).

## What was done today (2026-07-02) — the short story
1. Repo converted to npm workspaces (git-mv, history preserved); contract types generated from
   the live `v3` schema (`packages/contract`).
2. `v3` Postgres schema + deterministic seed: 10 archetypes (star-with-harness, no-harness
   shipper, cold-starter, greenfield-only, over-generator, burst-user, context-hand-carrier,
   quota-capped, review-skipper, steady-median), RAW rows only, every section annotated —
   the seed doubles as the teammate's ingestion spec (`services/ingest/README.md`).
3. Pure engine: AI→PR link ladder (pr_link .99 → sha .95 → branch .80 → coauthor .60 with
   coauthor-suppression hardening — 686 cartesian links suppressed on this dataset), Core-6
   KPIs + Harness-4 + KPI 9 T1, anchors/gates/bands/confidence per spec, within-person linkage
   engine, deterministic insights (H0-first) + recommendations ranked by (100−score)×weight.
4. UI went through 3 iterations on owner feedback — final state: **no /v3 section**; the four
   v1 tabs themselves render the v3 model, reusing the v1 skeletons exactly
   (.top/.daterow/.hero/idxcard/spectrum/roster/.ins/.prlist/.commlog/.course/.wellitem).
   DEMO DATA banner renders once in AppShell (all views are demo).
5. Function = squad rollup (median of published dev scores, band, dims, tokens-only card,
   linkage-engine card, top improvements aggregated by ref); Team = sortable roster with BOTH
   indexes → drill-in per member (`/team/[handle]`); My view = Index / Live coaching (simulated
   replay) / Growth (courses + confirmed-hypothesis improvement areas + user_context writes);
   Configure = the whole model from `v3.kpi_catalog ⋈ v3.data_points`, versioned saves.
6. Fresh repo cut here ("Prism v1"), Admin removed, initial commits made; old repo's PR #17
   closed unmerged.

## AGENTIC FLOW (added 2026-07-03) — how it works
Owner boundary: INDEX MATH STAYS DETERMINISTIC; once indexes exist, the agent reads the
developer's OWN inputs and produces artifacts. Chain (apps/web/lib/v3/agents/):
`facts.ts` (deterministic assembly: KPIs+meta · indexes · engine findings · coaching
outcomes · user_context adoptions · org skills · repo flags · course catalog → one FACTS
block) → `run.ts` (3 tool-forced structured calls via `model.ts`: good/bad · course picks ·
suggestions) → grounding gate (numbers must appear in FACTS; 1 repair retry, then drop;
reuses lib/agents/grounding.ts) → code-level ref validation (course/KPI/skill ids) →
`v3.agent_artifacts` (migration v3_0006), pinned to (date, config_version).
UI: My view Index tab = "Coaching agent — your read" (good `.wellitem` / bad `.insitem`,
provenance chip, Run/Re-run button → POST /api/v3/agent) · Growth = Coach's picks +
typed suggestions (skill/verification/prompt/context/process) with "I adopted this" →
user_context ref `agent-suggestion:<title>` → NEXT run sees it under ALREADY ADOPTED and
builds on it (the loop closes). Keyless fallback: deterministic mock (`mock.ts`,
model='mock'). Gate = ANTHROPIC_API_KEY presence (DEMO_MODE does NOT force mock — decision).
GOTCHA: the installed @langchain/anthropic (0.3.x) sends top_p=-1 which current Claude
models reject — the agent uses @anthropic-ai/sdk directly with tool-forced output instead.

## PENDING — tomorrow's backlog (rough priority order)
1. **user_context → Function rollup.** Growth clicks land in `v3.user_context` but only feed
   the My-view "what's driving improvement" strip. Add the management-facing evidence card on
   Function (adoption counts per developer/action — the spec's "score must move itself" loop).
2. **Adoption re-verification loop.** Recommendations have no status lifecycle yet
   (open → in-progress → adopted, re-verified FROM DATA at day-14). Needs engine support +
   storage (status on `v3.recommendations` or a small status table); parked v1 `lib/adoption`
   is the pattern to mirror.
3. **Per-KPI drill-down evidence pages.** `kpi_daily.meta` already stores the trust
   mitigations (per-PR link methods, working-day list, audited revert list w/ who-caught,
   rework pairs + evidence tiers, dead-end sessions, verification breadth) — nothing renders
   them yet. These ARE the spec's trust story (§5 mitigation column).
4. **Trend / deltas.** Only one compute date exists (as-of 2026-07-01) → no trend cards or 7d
   deltas anywhere. Options: extend the seed a second window back, or run the engine at
   multiple as-of dates (deriveWindow already takes its date from the data).
5. **Multi-agent adversarial review** of the whole build (never ran — first attempt hit the
   workflow validator: phrase agent prompts as "unseeded randomness / wall-clock time", never
   the literal call tokens). Lenses: spec fidelity vs docs/scoring-model.md · engine
   correctness (window boundaries, null-honesty, pg coercions) · boundaries (nobody imports
   ingest; web→engine API only; no new public.* access) · seed determinism · UI/API races.
6. **Hypothesis coverage.** Insights implement a per-KPI subset of the lab's H-trees; extend
   (4-H4 model mismatch, 7-H4 timing pattern, 9-H1/H2 controls, 12-H0 capture paths …) as the
   dummy data allows.
7. **Open model decisions** (docs/scoring-model.md §12): KPI 13 rate/breadth blend (70/30
   proposed), confidence-formula calibration, KPI 9 promotion after one clean T1 month.
8. **Real ingestion (teammate).** Replace seed sections 1:1 per `services/ingest/README.md`
   (P1 GitHub App → P2 parser extensions → P3 deployments → P4 telemetry/plugin). Live
   coaching stays a replay simulation until the P4 plugin exists.
9. **Agent hardening.** Batch "run for all 10 devs" action · surface agent artifacts on the
   member drill-in and a team-level rollup of common suggestions · unit tests for facts
   assembly + grounding round-trip (mock path) · rate/cost guard on the API route.
10. **Housekeeping.** Decide fate of parked v1 code (lib/scoring, old panels, connectors,
   DEMO_MODE auth — keep parked vs delete at real-data implementation); create a remote for
   this repo if/when wanted; CLAUDE.md still references the old dogfooding-PR workflow (no
   remote here yet); old `~/Documents/prism` cleanup.

## Run it
```bash
export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"   # shell default node is v18 — too old
npm install
npm run v3:reset        # drop schema v3 → migrate → seed (deterministic, safe to re-run)
npm run v3:recompute    # engine: raw → links → KPIs → indexes → insights → recs
npm run dev             # :3000 — or: cd apps/web && npx next dev -p 3030
npm run test            # 288 tests · npm run test:engine for the 47 engine tests
```
Env: `.env.local` at repo root (gitignored, symlinked into apps/web). Needs `SUPABASE_DB_URL`
(same Supabase project as before — demo data lives ONLY in schema `v3`).

## Key decisions (today, on top of the v3.0 spec)
- **One app.** The v1 views were replaced in place; URLs stay `/function /team /team/[handle]
  /me /configure`. Band names are the v3 set (Dormant/Basic/Productive/Workflow/Power/Multiplier).
- **Per-KPI weights** = dimension weights split equally within dimension (arithmetically
  identical to spec §2; gives Configure a per-KPI editor; main + harness each sum to 100).
- KPI 1 counts any-method links post-hardening; **KPI 4 exact pr_link only**; KPI 6 =
  tokens_in+out in-scope, cache-read is diagnostic, **no dollars anywhere**; revert PRs excluded
  from shipped-work denominators; who-caught routes the ACTION never the score; KPI 13 scores
  RATE (breadth reported alongside); engine asOf derived from data (no wall clock).
- Function rollup = **display-level medians** over published per-dev scores (`lib/v3/rollup.ts`);
  the engine itself stays per-developer.
- Confidence formula is a published preview shape (recalibrate with real data): main =
  merged/12·.5 + sessions/20·.3 + aiPrs/8·.2; harness = aiPrs/8·.6 + connectedSessions/20·.4;
  publish floor 0.40 → honest "Insufficient" (jin's harness demonstrates it).

## Gotchas (cost us real time today — don't repeat)
- **ONE dev server per node_modules.** Two Next dev servers sharing `node_modules/.cache`
  corrupt each other's webpack cache → every asset 404s → pages render unstyled ("v1 looks
  destroyed"). Recovery: kill servers, `rm -rf apps/web/.next node_modules/.cache`, start one.
- Deleting/renaming files while the dev server runs can corrupt `.next` (`Cannot read
  properties of undefined ('/_app')` or phantom-module errors). Same recovery. Stale
  `.next/types` also breaks `tsc` after route deletions — scrub `.next` first.
- pg returns timestamptz as `Date`, bigint/numeric as strings — engine (`run.ts`) and web
  (`lib/v3/db.ts`) register type parsers (ISO strings + Numbers). Engine compares ISO strings.
- A SECOND `pg.Client` inside a Next route hangs at teardown — reuse the pool
  (`recomputeWith`). Engine persist is batched (chunked multi-row inserts; ~5s not ~90s).
- Verify UI in a real browser via the **Playwright MCP** (the Claude-Preview browser
  mis-renders this app's streamed Suspense) — and LOOK at the screenshot before claiming
  fidelity.
- **The UI rule (owner, stated twice — do not regress): only the v1 design system.**
  globals.css classes + existing treatments. No bespoke stylesheets, no new shells, no new
  chip styles.

## Next session — paste-ready prompt
```
Continue Prism at "/Users/anandpareek/Documents/Prism v1" (LOCAL repo, no remote/PRs).
This is the UNIFIED app: four tabs (Function/Team/My view/Configure), v1 UI, v3.0 model,
deterministic demo data in Postgres schema v3.
FIRST read, in order: (1) handoff.md — today's state + the PENDING backlog; (2)
docs/scoring-model.md — the v3.0 model spec; (3) CLAUDE.md — hard rules incl. the scoped
v3 dummy-data exception; (4) services/ingest/README.md — the ingestion contract.
ENVIRONMENT: export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" (default node is
v18). Dev server: cd apps/web && npx next dev -p 3030 (ONE dev server at a time — see the
webpack-cache gotcha in handoff). Data: npm run v3:reset + npm run v3:recompute. Verify UI
with the Playwright MCP and LOOK at screenshots.
HARD RULES: v1 design system only (no new styling) · synthetic data only in schema v3 ·
apps/web/lib/scoring stays parked · update handoff.md before ending.
Work the PENDING list top-down unless I say otherwise, starting with #1 (user_context →
Function rollup) and #2 (adoption re-verification loop). After reading, give me the current
state in 5 lines and wait for my instruction.
```

---

## Architecture map (stable since the restructure)
```
apps/web            Next.js 15 app — the four views + /api/v3/{config,user-context,recompute}
  app/(views)/      function · team · team/[memberId] · me · configure  (v3-powered, v1 UI)
  components/v3/    TeamTable · detail (hero/spectrum/KPI tables/insights/recs) · MyView ·
                    CoachingReplay · GrowthTab · ConfigureTable
  lib/v3/           db.ts (pool + type parsers) · read.ts (pinned reads) · rollup.ts (function medians)
  lib/scoring, lib/db, lib/agents, lib/connectors …   PARKED v1 (tested, unused by the views)
services/engine     pure v3 engine (src/*.ts, 47 tests) + run.ts (DB IO) + cli.ts (v3:recompute)
services/ingest     v3 migrations + deterministic seed (= ingestion spec) + reset + README
packages/contract   shared types generated from the live v3 schema (npm run generate -w packages/contract)
docs/               scoring-model.md (v3.0 spec) · reference/prism_dashboard.html (approved design)
```
Model lab (planning artifact): `~/Documents/prism-model-lab` (`node server.mjs` → :4600);
`public/content.js` is the spec the doc mirrors; the feedback.json queue was fully processed.
