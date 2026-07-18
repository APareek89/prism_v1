# Prism Codex — handoff

last-synced: 15dbeab · branch: `main` · workspace: `/Users/anandpareek/Documents/Prism_codex`

## Objective

Ship a real-input AI-Native Engineering Index: GitHub supplies delivery/team evidence, developers opt into metadata-only Codex/Claude telemetry, and deterministic MAIN/HARNESS calculations remain owned by `lib/scoring`/`services/engine`.

## Current state

- ✅ Shipped through Configuration milestone PR #14: real-data UI, GitHub/Supabase/Resend/OTLP/PR-link connections, Admin calculation lab, lab-only dogfooding, deterministic scoring, role-aware configuration/actions, and Render `https://prism-v1.onrender.com` (see git log + `Learning.MD`).
- ✅ Live scope remains `APareek89/prism-measurement-lab`; the 2026-07-18 run produced 10 PRs, 23 commits, 13 KPI rows, 5 index rows, function index `46.1667`/L2/medium, and 8 real employee insights. No synthetic `public.*` rows.
- ✅ Product hardening shipped in PR #16 / main `8b60b82`: Configure input focus survives typing; Connect has a back path; Index opens Admin details in a new tab; L2 definitions and honest prior states appear on Overview/My View; Overview includes grounded wins/gaps; active tabs fetch only their own data; all primary routes fit 390px.
- ✅ Telemetry audit shipped: historical GPT-5.6 sessions are real but persisted with zero counters because the privacy normalizer missed Codex `*_token_count`/`slug` attributes. New events capture them without cache double-counting; unrecoverable history says “Counters not captured.” Real Claude history also exists for the owner.
- ✅ Selected calendar comparisons preserve prior-only providers, associate verified links with the PR merge window, and wait for complete real baselines. Daily becomes comparable on the next measured day; weekly/monthly need 7/30-day prior coverage.
- ✅ Local, remote/cloud workstation, centrally managed, and Claude Code on Vertex guidance is live. The installer runs where the coding agent executes; it does not collect OpenAI-hosted Codex cloud activity.
- ✅ `codex/agentic-insights-top-nav` is feature-complete locally: primary navigation is a responsive top bar; contextual section rails remain for My View, My Actions, Configuration, and Admin; the “My Engineering” badge/sidebar are gone.
- ✅ Organization insights now come from privacy-safe aggregate KPI facts only (maximum 3 strengths + 3 opportunities). Private My View insights expose observation, interpretation, alternative explanation, controllable action, expected signal, verification, guardrail, and confidence reason.
- ✅ Admin → Agentic Flow selects a real organization/person and persisted insight/recommendation, then shows candidate ownership, stage ledger, evidence snapshot, grounding validation, and the complete output contract. Seven validated Mermaid sources document all major flows.
- ✅ Narrative batches use stable candidate ids, exact score-stamped configuration, per-item grounding, a single repair batch, coherent same-day replacement, provider time/output bounds, and three-lane bounded fan-out. Real full-loop latency fell from 251.1s to 131.8s; score math was not changed.
- ✅ PR presentation now reads persisted verdict/ref/size metadata, so UUID fragments cannot become PR numbers and “no revert” cannot mislabel a clean PR. My View shows real `#1`–`#10` evidence correctly.
- ✅ Verification: 317 tests (47 engine + 270 web), workspace typecheck/build, diff check, Mermaid 7/7, authenticated desktop/mobile browser flows with zero console errors, 390px `scrollWidth === innerWidth`, and two successful real-data pipeline runs. Full FMEA is in `docs/FMEA-agentic-insights-top-nav.md`; all P0/P1 findings are resolved. Paid eval was not run.
- ✅ PR #19 squash-merged as `15dbeab`; Render deploy `dep-d9dtt961a83c73c19ak0` is live at `https://prism-v1.onrender.com`. Production health reports `production` / `demoMode:false` / `db:ok`; authenticated Overview and Admin Agentic Flow pass with zero console errors and 390px no-overflow.

## Product/architecture decisions

- 2026-07-17 — GitHub connection is organization/function level; Codex/Claude consent and identity are per person; Supabase claiming uses one exact normalized email.
- 2026-07-18 — Admin is read-only presentation over production assembler/engine; OTLP is the activity feed; PostToolUse adds only exact `{sessionId, repo, prNumber}` evidence.
- 2026-07-18 — Missing evidence is insufficient/unavailable, never zero or synthetic; non-positive provider timestamps fall back to observed/receipt time.
- 2026-07-18 — Configuration is sequential/audited; index versions are append-only; roles are server-enforced; operating filters never recompute the published index.
- 2026-07-18 — Codex cached tokens are a subset of input: persist non-cached input plus cache-read separately so totals count each token once.
- 2026-07-18 — Organization prompts receive aggregate KPI medians/coverage/signal totals only; employee ids and employee narratives are forbidden at that boundary.
- 2026-07-18 — Agent prose must carry the exact deterministic candidate id. Position is never ownership; unsupported items repair once or drop without shifting another candidate's math.
- 2026-07-18 — Insight priority uses the exact config version stamped on the current score. Agents remain narrative-only and never compute or change the score.
- 2026-07-18 — Independent opportunity/change/strength lanes may run concurrently with a hard maximum of three; real-provider calls are bounded to 45 seconds and 4,096 output tokens.

## Hard boundaries

- `services/engine`/`lib/scoring` own every score; agents narrate only. No synthetic product rows, hours-saved claims, or unverified cost/ROI.
- Stored telemetry excludes prompts, responses, source code, commands, tool inputs/outputs, and unknown OTLP attributes.

## Next

- Owner confirms Data processing and unchanged Index v1, then repository/people/access configuration; no consent step is auto-approved.
- GitHub safeguard: at `https://github.com/settings/installations/143692925`, leave only `APareek89/prism-measurement-lab`; GitHub-selected repos remain authoritative on setup callbacks.
- Verify a Resend domain before team rollout; `DIGEST_FROM_EMAIL` remains blank. Paid evals still require separate explicit owner approval.
- P2 hardening from the completed FMEA: durable grounding-drop counters, a cross-process function/date pipeline lock, and an atomic active-recommendation capacity check.

## Recent commits

- `a05a319` — sync prior shipped handoff to main (#18).
- `fcb9e97` — agentic insight contract, admin trace, top navigation, privacy-safe organization flow, and full QA/FMEA.
- `15dbeab` — squash merge of the completed feature and handoff through PR #19; deployed live.

**Session efficiency:** 🎯 55% product/data fixes · 🔧 30% wiring + browser/build QA · 🔁 15% environment/rework
