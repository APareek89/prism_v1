# Prism Codex — handoff

last-synced: 4cc43fe · branch: `codex/telemetry-time-hook-reliability` · workspace: `/Users/anandpareek/Documents/Prism_codex`

## Objective

Deliver a clearer AI-Native Engineering Index plus a real-input MVP: GitHub defines delivery evidence/team membership, each developer opts into Codex or Claude Code metadata, and deterministic MAIN/HARNESS calculations remain unchanged.

## Current state

- ✅ Shipped: decision-first real-data UI, GitHub team/evidence sync, exact-email Supabase/Resend login, per-user Codex/Claude metadata-only OTEL, deterministic scoring boundary, no demo rows, private GitHub repo, and Render deployment (see git log and `Learning.MD`).
- ✅ Shipped: installer and OTLP collector routes accept their own invite/bearer credentials without a browser session; management routes remain Supabase-protected. PR #6 is merged and the hosted invalid-invite path returns plain-text 410 rather than HTML.
- ✅ Shipped: PR #7 added the temporary admin-only calculation lab. It replays the existing assembler + deterministic engine, expands every KPI/dimension contribution, and joins it to real commits, PRs, sessions, links, insights, and recommendations. Render `/admin` passed authenticated production QA with no console error or horizontal overflow.
- ✅ Real evidence prepared: private `APareek89/prism-measurement-lab` has five merged PRs, ten feature/test/fix commits plus its bootstrap commit, recognized GPT co-author trailers, and 14 passing tests. PR #5 deliberately captured a failing evidence-contract test before the fix so rework/course-correction is inspectable.
- ✅ Clean slate live: APareek89 App installation `143692925` and both repo scopes now point only to `APareek89/prism-measurement-lab`. The reset removed all historical evidence/computed/narrative rows while preserving 4 employees, roles, connector configuration, index config, and both personal telemetry connections. The 2026-07-18 run contains only 6 lab PRs, 12 AI-trailer commits (2 GitHub-attributed to APareek89), 0 post-reset sessions, fresh index/KPI rows, and one deterministic recommendation.
- ✅ PR #22 reviewed separately at `/Users/anandpareek/Documents/prism_pr22_review`: its standout addition is a Claude `PostToolUse(Bash)` plugin that sends `{sessionId, repo, prNumber}` to a tokenless route and links an ingested session to a PR at 0.99. It also adds multi-tenant organizations/RLS/signup/invites, signed GitHub install state, org-scoped webhook routing, an ROI statement, and optional per-org ingest tokens. It does not add broader GitHub event ingestion or a remote OTLP collector; its plugin does not support Codex.
- ✅ PR #10 merged and Render deployed: migration `0035` is applied live, the existing personal installer adds a metadata-only `PostToolUse(Bash)` PR bridge for both Codex and Claude Code beside OTLP, the authenticated route double-checks repo scope and verifies the PR through the GitHub App, and the linker consumes only an exact connection/session match at `pr_link@0.99`. The public machine route returns JSON 401 without redirecting to sign-in.
- ✅ Admin now expands the unchanged engine result into literal raw-evidence, anchor-normalization, L2, L1, confidence, publication, and band equations, plus a verified-beacon pending/linked ledger. Web tests pass (256), workspace typecheck and production build pass, the secret scan is clean, and all diagrams validate.
- ✅ Lab dogfooding PRs #7 and #8 added six correctly attributed Codex-coauthored commits (score calculation ledger + honest report trend) and 20 passing tests. Live GitHub ingest, real-session hook verification, recalculation, and browser QA remain in progress.
- ✅ Real Codex session `019f755c-…` created lab PR #9 with two more coauthored commits and 23 passing tests. Nine OTLP events arrived through the personal bearer and one verified PR-link beacon is stored; migration `0036` repaired the provider's zero OTLP timestamps from immutable receive times without changing any score input or formula.

## Product/architecture decisions

- 2026-07-17 — GitHub connection is function/account-level; Codex and Claude Code consent is per person because telemetry originates on each developer machine.
- 2026-07-17 — Tonight's collector accepts OTLP/HTTP JSON and maps its bearer token directly to function → employee → provider; only token hashes are stored.
- 2026-07-17 — All product views use real `public.*` rows. Missing evidence stays insufficient, never false; the deterministic index calculation remains unchanged.
- 2026-07-17 — Local installers back up user config and replace only the selected tool's OTel settings; prompt/content logging remains disabled.
- 2026-07-17 — Owner retired the v3 demo exception. Missing data is an honest insufficient/empty state; neither UI, pipeline, nor a connector may create a placeholder employee.
- 2026-07-17 — Workspace identity claim is exact normalized email only. A successful first real login receives developer plus bootstrap admin; later users receive developer unless explicitly promoted.
- 2026-07-17 — Supabase Auth owns login identity and one-time tokens. `DIGEST_FROM_EMAIL` remains only the visible sender for optional Resend digest mail.
- 2026-07-17 — Hosted auth separates authority from transport: Supabase owns identity/tokens/sessions; Resend delivers the login link using `AUTH_FROM_EMAIL`.
- 2026-07-17 — Machine-to-machine telemetry endpoints are public only at middleware level and authenticate with one-time invite or bearer tokens; management endpoints still require Supabase sessions.
- 2026-07-18 — The Admin lab is a read-only presenter over `assembleMembers` + `computeDaily`; it may expose engine outputs and evidence provenance but must never copy or alter score formulas. Agent narration remains separate.
- 2026-07-18 — The clean-slate reset preserves authentication, employee identities/roles, GitHub connector installation, telemetry connections/tokens, and `index_config`; it removes historical evidence, computed rows, invites, communications, and narratives before syncing only the real dogfooding repository.
- 2026-07-18 — PR-link is additive enrichment, not a telemetry replacement: OTLP remains the activity/token feed; provider hooks send only `{sessionId, repo, prNumber}` and inherit identity from the existing hashed per-person collector connection.
- 2026-07-18 — A PR-link beacon becomes linkable only after bearer authentication, double internal repo-scope validation, GitHub App PR verification, and an exact `(connection_id, source_session_id)` match to a real session. No fuzzy time/author matching is allowed.
- 2026-07-18 — Admin may show numeric substitutions and consistency checks derived from returned engine values and raw evidence, but the calculations continue to execute only in the existing scoring modules.
- 2026-07-18 — A non-positive OTLP provider timestamp is missing metadata, not 1970 activity. Normalization tries observed time next and otherwise uses collector receipt time; existing zero-time events are repaired only from their immutable `created_at` values.

## Hard boundaries

- `services/engine` owns every score; this feature added no score/index changes.
- MAIN/HARNESS stay separate; no dollars/hours-saved claims; no synthetic rows in `public.*`.
- Stored telemetry excludes prompts, responses, source code, commands, tool inputs/outputs, and unknown OTLP attributes.

## Gotchas / next

- Test user action: request the APareek89 work-email login at the Render URL, open `/me`, generate Codex or Claude Code setup, run the fresh command, start a new tool session, and refresh status.
- The original 10 lab commits used an unlinked noreply address and remain honestly unattributed; PR #6 uses `142583211+APareek89@users.noreply.github.com`, so its two commits appear in APareek89's person-level Admin trace. Do not patch historical attribution in SQL.
- GitHub App installation settings still grant access to both `APareek89/prism` and the lab. Saving that configuration fired the setup callback, which temporarily mirrored both repos and reingested 22 old PRs. The final transaction cleared them again and re-pinned the internal connector/function scopes to only the lab. For a durable GitHub-side guard, remove `APareek89/prism` from installation 143692925 and leave only `prism-measurement-lab`; any future setup callback treats GitHub's selected-repo list as authoritative.
- Finish the current enrichment rollout: merge lab PR #9, create one additional real PR through the repaired Codex hook, ingest lab PRs #7–#10, run the pipeline, and verify Admin equations plus `pr_link@0.99` evidence.
- `DIGEST_FROM_EMAIL` is blank (the local Resend API key exists). This does not block hosted auth mail, which uses `AUTH_FROM_EMAIL` or Resend's owner-only default sender. Verify a Resend domain and set both sender variables before inviting the broader team; digest delivery stays off until its sender is configured.
- Inngest was upgraded to patched `^3.54.2`. `npm audit --omit=dev` still reports one transitive LangSmith high advisory whose offered fix requires the LangChain 0.x → 1.x major upgrade; the affected public-prompt/tracing surfaces are not exposed by Prism, so treat that upgrade as a separate compatibility project.
- Add the hosted `/auth/callback` to Supabase Auth redirect URLs as defense-in-depth/fallback, and add the hosted `/api/connectors/github/install` URL to the GitHub App setup/callback configuration.
- Exact AI-session → repo/branch/PR, verification, context-read, and review-loop evidence still needs the metadata-only Prism Bridge/production adapter.
- `Loop.MD` remains offered. Full FMEA and paid coaching golden evals require owner approval.

**Session efficiency:** 🎯 ~50% enrichment + Admin trace · 🔧 ~35% real OTLP/hook verification · 🔁 ~15% timestamp and hook-envelope repair
