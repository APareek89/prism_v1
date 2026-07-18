# Prism Codex — handoff

last-synced: 0c441bb · branch: `codex/product-hardening-qa` · workspace: `/Users/anandpareek/Documents/Prism_codex`

## Objective

Ship a real-input AI-Native Engineering Index: GitHub supplies delivery/team evidence, developers opt into metadata-only Codex/Claude telemetry, and deterministic MAIN/HARNESS calculations remain owned by `lib/scoring`/`services/engine`.

## Current state

- ✅ Shipped through Configuration milestone PR #14: real-data UI, GitHub/Supabase/Resend/OTLP/PR-link connections, Admin calculation lab, lab-only dogfooding, deterministic scoring, role-aware configuration/actions, and Render `https://prism-v1.onrender.com` (see git log + `Learning.MD`).
- ✅ Live scope remains `APareek89/prism-measurement-lab`; the 2026-07-18 run produced 10 PRs, 23 commits, 13 KPI rows, 5 index rows, function index `46.1667`/L2/medium, and 8 real employee insights. No synthetic `public.*` rows.
- 🟡 Product-hardening branch complete: Configure input focus survives typing; Connect has a back path; Index opens Admin details in a new tab; L2 definitions and honest prior-period states appear on Overview/My View; Overview includes grounded wins/gaps; My View fetches only the active tab; all primary routes fit 390px.
- 🟡 Telemetry audit: historical GPT-5.6 sessions are real but persisted with zero counters because the OTLP normalizer missed Codex `*_token_count`/`slug` attributes. New events capture them without double-counting cached input; historical discarded attributes cannot be reconstructed, so UI says “Counters not captured.” Real Claude history also exists for the owner.
- 🟡 Analytics comparisons use selected calendar windows, preserve prior-only providers, associate verified links with the PR merge window, and remain unavailable until a complete real baseline exists. Daily becomes comparable on the next measured day; weekly/monthly need 7/30-day prior coverage.
- 🟡 Enterprise connection guidance covers local, remote/cloud workstation, centrally managed rollout, and Claude Code on Vertex AI. The installer must run where the coding agent executes; it does not collect OpenAI-hosted Codex cloud activity.
- ✅ Verification on this branch: 310 tests, workspace typecheck/lint/build, diff check, authenticated browser flows with zero console errors, and 390px overflow checks for Overview, Configure, My View Connection, and My View Performance.

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

- Commit, push, open/merge the product-hardening PR, then verify Render health and authenticated production surfaces; do not include unrelated untracked `integration-map.md` or `prd-visual.html`.
- Owner confirms Data processing and unchanged Index v1, then repository/people/access configuration; no consent step is auto-approved.
- GitHub safeguard: at `https://github.com/settings/installations/143692925`, leave only `APareek89/prism-measurement-lab`; GitHub-selected repos remain authoritative on setup callbacks.
- Verify a Resend domain before team rollout; `DIGEST_FROM_EMAIL` remains blank. Full FMEA/paid evals require explicit owner approval.

**Session efficiency:** 🎯 55% product/data fixes · 🔧 30% wiring + browser/build QA · 🔁 15% environment/rework
