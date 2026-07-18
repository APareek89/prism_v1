# Prism Codex — handoff

last-synced: 547528a · branch: `main` · workspace: `/Users/anandpareek/Documents/Prism_codex`

## Objective

Ship a real-input AI-Native Engineering Index: GitHub supplies delivery/team evidence, developers opt into metadata-only Codex/Claude telemetry, and deterministic MAIN/HARNESS calculations remain owned by `lib/scoring`/`services/engine`.

## Current state

- ✅ Shipped through Configuration milestone PR #14: real-data UI, GitHub/Supabase/Resend/OTLP/PR-link connections, Admin calculation lab, lab-only dogfooding, deterministic scoring, role-aware configuration/actions, and Render `https://prism-v1.onrender.com` (see git log + `Learning.MD`).
- ✅ Live scope remains `APareek89/prism-measurement-lab`; the 2026-07-18 run produced 10 PRs, 23 commits, 13 KPI rows, 5 index rows, function index `46.1667`/L2/medium, and 8 real employee insights. No synthetic `public.*` rows.
- ✅ Product hardening shipped in PR #16 / main `8b60b82`: Configure input focus survives typing; Connect has a back path; Index opens Admin details in a new tab; L2 definitions and honest prior states appear on Overview/My View; Overview includes grounded wins/gaps; active tabs fetch only their own data; all primary routes fit 390px.
- ✅ Telemetry audit shipped: historical GPT-5.6 sessions are real but persisted with zero counters because the privacy normalizer missed Codex `*_token_count`/`slug` attributes. New events capture them without cache double-counting; unrecoverable history says “Counters not captured.” Real Claude history also exists for the owner.
- ✅ Selected calendar comparisons preserve prior-only providers, associate verified links with the PR merge window, and wait for complete real baselines. Daily becomes comparable on the next measured day; weekly/monthly need 7/30-day prior coverage.
- ✅ Local, remote/cloud workstation, centrally managed, and Claude Code on Vertex guidance is live. The installer runs where the coding agent executes; it does not collect OpenAI-hosted Codex cloud activity.
- ✅ Verification: 310 tests, workspace typecheck/lint/build, diff check, authenticated local + production browser flows with zero console errors, and 390px checks for Overview, Configure, My View Connection/Performance. Render deploy `dep-d9dq5drbc2fs73fjb8q0` is live with `production`/`demoMode:false`/`db:ok`.

## Product/architecture decisions

- 2026-07-17 — GitHub connection is organization/function level; Codex/Claude consent and identity are per person; Supabase claiming uses one exact normalized email.
- 2026-07-18 — Admin is read-only presentation over production assembler/engine; OTLP is the activity feed; PostToolUse adds only exact `{sessionId, repo, prNumber}` evidence.
- 2026-07-18 — Missing evidence is insufficient/unavailable, never zero or synthetic; non-positive provider timestamps fall back to observed/receipt time.
- 2026-07-18 — Configuration is sequential/audited; index versions are append-only; roles are server-enforced; operating filters never recompute the published index.
- 2026-07-18 — Codex cached tokens are a subset of input: persist non-cached input plus cache-read separately so totals count each token once.
- 2026-07-18 — Management insights may roll up latest real employee narratives when no function KPI narrative exists; the rollup identifies the person and never computes a score.

## Hard boundaries

- `services/engine`/`lib/scoring` own every score; agents narrate only. No synthetic product rows, hours-saved claims, or unverified cost/ROI.
- Stored telemetry excludes prompts, responses, source code, commands, tool inputs/outputs, and unknown OTLP attributes.

## Next

- Owner confirms Data processing and unchanged Index v1, then repository/people/access configuration; no consent step is auto-approved.
- GitHub safeguard: at `https://github.com/settings/installations/143692925`, leave only `APareek89/prism-measurement-lab`; GitHub-selected repos remain authoritative on setup callbacks.
- Verify a Resend domain before team rollout; `DIGEST_FROM_EMAIL` remains blank. Full FMEA/paid evals require explicit owner approval.

**Session efficiency:** 🎯 55% product/data fixes · 🔧 30% wiring + browser/build QA · 🔁 15% environment/rework
