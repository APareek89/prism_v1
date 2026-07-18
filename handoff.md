# Prism Codex — handoff

last-synced: 2917023 · branch: `main` · workspace: `/Users/anandpareek/Documents/Prism_codex`

## Objective

Ship a real-input AI-Native Engineering Index: GitHub supplies delivery/team evidence, developers opt into metadata-only Codex/Claude telemetry, and deterministic MAIN/HARNESS calculations remain owned by `lib/scoring`/`services/engine`.

## Current state

- ✅ Shipped: real-data UI, GitHub App sync, Supabase/Resend login, personal Codex/Claude OTLP installers, Connect flow, temporary Admin calculation lab, private `APareek89/prism_v1`, and Render at `https://prism-v1.onrender.com` (details in git log + `Learning.MD`).
- ✅ Clean measurement scope: live function/connector plus every persisted GitHub row contain only `APareek89/prism-measurement-lab`; auth identities, roles, index config, and personal telemetry connections were preserved.
- ✅ PR-link enrichment: PRs #10–#12 added hashed-bearer `/pr-link`, exact connection/session matching, GitHub verification, repo-scope checks, Codex + Claude PostToolUse installers, `gh pr create` intent guard, zero-timestamp repair, and Admin pending/linked evidence. No prompt/code/command/tool payload is persisted.
- ✅ Real dogfooding: lab PRs #7–#10 added 11 correctly attributed Codex-coauthored commits. The fresh Codex PR #10 run produced 75 OTLP events and an automatic verified beacon; PRs #9/#10 are linked at `pr_link@0.99`.
- ✅ 2026-07-18 rerun: 10 real merged PRs, 23 commits, 3 Codex sessions, 2 beacons/links, 141 blame lines, 13 KPI rows, and 5 index rows. Function result = `46.1667`, band `L2`, medium confidence; scope remains only the lab repo.
- ✅ Agent compatibility shipped in PR #13: omitting LangChain 0.3's invalid `top_p=-1` for Claude 4.6 produced 8 real scoped insights and 10 PR-level outputs with zero agent errors; Render health and authenticated Admin QA passed.
- ✅ Configuration milestone shipped in PR #14 / main `2917023`: migration 0037 adds zero-seed audited configuration/action tables; Admin follows Connection → Data → Index → Organization → Access; approved categories and measurement start gate future pipeline/analytics inputs; all KPI weights/directions/anchors and section-specific before/after evidence are visible; Member/Manager/Management/Admin capabilities drive navigation and guarded routes.
- ✅ Product flow split cleanly: Overview adds real delivery/token/provider metrics, repo/team/manager operating filters, and deterministic delta decomposition; My View has Connection + Performance only; My Actions owns recommendation acknowledgement and official resources; Org Actions turns real gaps/insights into accountable experiments without causality claims. Repo filters narrow PR/link evidence while tokens remain people-scoped until sessions have a canonical repo join key.
- ✅ Owner connection policy is confirmed from 2026-07-18 with GitHub live, Codex + Claude Code offered, and both terminal + email methods. Data-processing approval remains intentionally unconfirmed for the owner to review.
- ✅ Verification: 309 tests, typecheck, production build, migration/live-column checks, all 4 Mermaid diagrams, and authenticated desktop/mobile QA passed. Render deploy `dep-d9dp8s67r5hc73ctbmm0` is live at `https://prism-v1.onrender.com`; production health returned `demoMode:false` / `db:ok`, and authenticated Overview, Configuration, My Actions, Org Actions, and Admin had zero console errors or warnings.

## Product/architecture decisions

- 2026-07-17 — GitHub connection is organization/function level; Codex/Claude consent and identity are per person.
- 2026-07-17 — Missing evidence is honest insufficient/empty state; no placeholder/demo rows in `public.*`.
- 2026-07-17 — Supabase owns login identity/session; Resend is mail transport; employee claiming uses exact normalized email only.
- 2026-07-18 — Admin is read-only presentation over the production assembler + engine; it may expand returned values into literal equations but never copy/recompute formulas.
- 2026-07-18 — OTLP stays the activity/token feed; PostToolUse adds only `{sessionId, repo, prNumber}` exact-link evidence.
- 2026-07-18 — A beacon links only after bearer identity, dual repo scope, GitHub PR verification, and exact `(connection_id, source_session_id)` match.
- 2026-07-18 — Non-positive provider time means absent; use observed time or immutable collector receipt time, never 1970.
- 2026-07-18 — Database roles retain their stable enum values but present as Member (`developer`), Manager, Management (`function_lead`), and Admin; capabilities are enforced server-side and mirrored in navigation.
- 2026-07-18 — Configuration is sequential and audited. A weight change appends a frozen `index_config` version; it never rewrites an old `index_daily` row or recomputes in the browser.
- 2026-07-18 — Management filters narrow operating evidence only. They never recompute a published index in the UI, and a repository filter cannot narrow tokens until session metadata carries a canonical repo join key.
- 2026-07-18 — “Actioned” records human intent only. Adoption and impact require later evidence; USD remains unavailable unless a provider-reported `cost_usd` exists.

## Hard boundaries

- `services/engine`/`lib/scoring` own all scores; agents narrate only. MAIN/HARNESS remain separate.
- No synthetic product rows, hours-saved claims, or unverified dollars/ROI claims.
- Stored telemetry excludes prompts, responses, source code, commands, tool inputs/outputs, and unknown OTLP attributes.

## Next

- Owner reviews and confirms Data processing in Configuration. Then confirm unchanged Index v1, repository/people structure, and access roles; no consent step is auto-approved.
- GitHub-side safeguard: at `https://github.com/settings/installations/143692925`, remove `APareek89/prism`, leave only `APareek89/prism-measurement-lab`, and save; internal DB scope is pinned but setup callbacks treat GitHub's selected repos as authoritative.
- `DIGEST_FROM_EMAIL` remains blank; verify a Resend domain and set sender variables before broad team invitations. Full FMEA/paid evals still require owner approval.

**Session efficiency:** 🎯 ~65% configuration + role-aware product flow · 🔧 ~25% real analytics/actions + live schema · 🔁 ~10% browser/build verification
