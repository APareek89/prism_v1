# Prism Codex — handoff

last-synced: 704a04a · branch: `codex/anthropic-top-p-compat` · workspace: `/Users/anandpareek/Documents/Prism_codex`

## Objective

Ship a real-input AI-Native Engineering Index: GitHub supplies delivery/team evidence, developers opt into metadata-only Codex/Claude telemetry, and deterministic MAIN/HARNESS calculations remain owned by `lib/scoring`/`services/engine`.

## Current state

- ✅ Shipped: real-data UI, GitHub App sync, Supabase/Resend login, personal Codex/Claude OTLP installers, Connect flow, temporary Admin calculation lab, private `APareek89/prism_v1`, and Render at `https://prism-v1.onrender.com` (details in git log + `Learning.MD`).
- ✅ Clean measurement scope: live function/connector plus every persisted GitHub row contain only `APareek89/prism-measurement-lab`; auth identities, roles, index config, and personal telemetry connections were preserved.
- ✅ PR-link enrichment: PRs #10–#12 added hashed-bearer `/pr-link`, exact connection/session matching, GitHub verification, repo-scope checks, Codex + Claude PostToolUse installers, `gh pr create` intent guard, zero-timestamp repair, and Admin pending/linked evidence. No prompt/code/command/tool payload is persisted.
- ✅ Real dogfooding: lab PRs #7–#10 added 11 correctly attributed Codex-coauthored commits. The fresh Codex PR #10 run produced 75 OTLP events and an automatic verified beacon; PRs #9/#10 are linked at `pr_link@0.99`.
- ✅ 2026-07-18 rerun: 10 real merged PRs, 23 commits, 3 Codex sessions, 2 beacons/links, 141 blame lines, 13 KPI rows, and 5 index rows. Function result = `46.1667`, band `L2`, medium confidence; scope remains only the lab repo.
- ✅ Agent compatibility verified locally: omitting LangChain 0.3's invalid `top_p=-1` for Claude 4.6 produced 8 real scoped insights and 10 PR-level outputs with zero agent errors; PR/deploy still pending.

## Product/architecture decisions

- 2026-07-17 — GitHub connection is organization/function level; Codex/Claude consent and identity are per person.
- 2026-07-17 — Missing evidence is honest insufficient/empty state; no placeholder/demo rows in `public.*`.
- 2026-07-17 — Supabase owns login identity/session; Resend is mail transport; employee claiming uses exact normalized email only.
- 2026-07-18 — Admin is read-only presentation over the production assembler + engine; it may expand returned values into literal equations but never copy/recompute formulas.
- 2026-07-18 — OTLP stays the activity/token feed; PostToolUse adds only `{sessionId, repo, prNumber}` exact-link evidence.
- 2026-07-18 — A beacon links only after bearer identity, dual repo scope, GitHub PR verification, and exact `(connection_id, source_session_id)` match.
- 2026-07-18 — Non-positive provider time means absent; use observed time or immutable collector receipt time, never 1970.

## Hard boundaries

- `services/engine`/`lib/scoring` own all scores; agents narrate only. MAIN/HARNESS remain separate.
- No synthetic product rows, hours-saved claims, or unverified dollars/ROI claims.
- Stored telemetry excludes prompts, responses, source code, commands, tool inputs/outputs, and unknown OTLP attributes.

## Next

- Finish PR for the Anthropic `top_p` compatibility fix, deploy, verify `/admin` equations + both verified links + real agent outputs in an authenticated desktop/mobile browser.
- GitHub-side safeguard: at `https://github.com/settings/installations/143692925`, remove `APareek89/prism`, leave only `APareek89/prism-measurement-lab`, and save; internal DB scope is pinned but setup callbacks treat GitHub's selected repos as authoritative.
- Then implement the owner’s next major milestone in this same task: admin-only Configuration workflow/RBAC/data consent/index versioning/org-team setup; enhanced Overview/My View; My Actions; Org Actions. Preserve real-only data and server-enforced authorization.
- `DIGEST_FROM_EMAIL` remains blank; verify a Resend domain and set sender variables before broad team invitations. Full FMEA/paid evals still require owner approval.

**Session efficiency:** 🎯 ~55% enrichment/Admin evidence · 🔧 ~30% live connector/deployment verification · 🔁 ~15% provider compatibility repairs
