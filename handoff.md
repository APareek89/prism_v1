# Prism Codex — handoff

last-synced: fae0846 · branch: `codex/final-reset-handoff` · workspace: `/Users/anandpareek/Documents/Prism_codex`

## Objective

Deliver a clearer AI-Native Engineering Index plus a real-input MVP: GitHub defines delivery evidence/team membership, each developer opts into Codex or Claude Code metadata, and deterministic MAIN/HARNESS calculations remain unchanged.

## Current state

- ✅ Shipped: decision-first real-data UI, GitHub team/evidence sync, exact-email Supabase/Resend login, per-user Codex/Claude metadata-only OTEL, deterministic scoring boundary, no demo rows, private GitHub repo, and Render deployment (see git log and `Learning.MD`).
- ✅ Shipped: installer and OTLP collector routes accept their own invite/bearer credentials without a browser session; management routes remain Supabase-protected. PR #6 is merged and the hosted invalid-invite path returns plain-text 410 rather than HTML.
- ✅ Shipped: PR #7 added the temporary admin-only calculation lab. It replays the existing assembler + deterministic engine, expands every KPI/dimension contribution, and joins it to real commits, PRs, sessions, links, insights, and recommendations. Render `/admin` passed authenticated production QA with no console error or horizontal overflow.
- ✅ Real evidence prepared: private `APareek89/prism-measurement-lab` has five merged PRs, ten feature/test/fix commits plus its bootstrap commit, recognized GPT co-author trailers, and 14 passing tests. PR #5 deliberately captured a failing evidence-contract test before the fix so rework/course-correction is inspectable.
- ✅ Clean slate live: APareek89 App installation `143692925` and both repo scopes now point only to `APareek89/prism-measurement-lab`. The reset removed all historical evidence/computed/narrative rows while preserving 4 employees, roles, connector configuration, index config, and both personal telemetry connections. The 2026-07-18 run contains only 6 lab PRs, 12 AI-trailer commits (2 GitHub-attributed to APareek89), 0 post-reset sessions, fresh index/KPI rows, and one deterministic recommendation.
- ✅ PR #22 reviewed separately at `/Users/anandpareek/Documents/prism_pr22_review`: its standout addition is a Claude `PostToolUse(Bash)` plugin that sends `{sessionId, repo, prNumber}` to a tokenless route and links an ingested session to a PR at 0.99. It also adds multi-tenant organizations/RLS/signup/invites, signed GitHub install state, org-scoped webhook routing, an ROI statement, and optional per-org ingest tokens. It does not add broader GitHub event ingestion or a remote OTLP collector; its plugin does not support Codex.

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

## Hard boundaries

- `services/engine` owns every score; this feature added no score/index changes.
- MAIN/HARNESS stay separate; no dollars/hours-saved claims; no synthetic rows in `public.*`.
- Stored telemetry excludes prompts, responses, source code, commands, tool inputs/outputs, and unknown OTLP attributes.

## Gotchas / next

- Test user action: request the APareek89 work-email login at the Render URL, open `/me`, generate Codex or Claude Code setup, run the fresh command, start a new tool session, and refresh status.
- The original 10 lab commits used an unlinked noreply address and remain honestly unattributed; PR #6 uses `142583211+APareek89@users.noreply.github.com`, so its two commits appear in APareek89's person-level Admin trace. Do not patch historical attribution in SQL.
- GitHub App installation settings still grant access to both `APareek89/prism` and the lab. Saving that configuration fired the setup callback, which temporarily mirrored both repos and reingested 22 old PRs. The final transaction cleared them again and re-pinned the internal connector/function scopes to only the lab. For a durable GitHub-side guard, remove `APareek89/prism` from installation 143692925 and leave only `prism-measurement-lab`; any future setup callback treats GitHub's selected-repo list as authoritative.
- Selectively port PR #22's `pr_link_ingest` table, Claude plugin, route, and linker seam into the current monorepo after adapting them to hashed telemetry connections. Do not wholesale cherry-pick the 49-file older-app PR. Multi-tenancy and the ROI statement are separate product decisions.
- `DIGEST_FROM_EMAIL` is blank (the local Resend API key exists). This does not block hosted auth mail, which uses `AUTH_FROM_EMAIL` or Resend's owner-only default sender. Verify a Resend domain and set both sender variables before inviting the broader team; digest delivery stays off until its sender is configured.
- Inngest was upgraded to patched `^3.54.2`. `npm audit --omit=dev` still reports one transitive LangSmith high advisory whose offered fix requires the LangChain 0.x → 1.x major upgrade; the affected public-prompt/tracing surfaces are not exposed by Prism, so treat that upgrade as a separate compatibility project.
- Add the hosted `/auth/callback` to Supabase Auth redirect URLs as defense-in-depth/fallback, and add the hosted `/api/connectors/github/install` URL to the GitHub App setup/callback configuration.
- Exact AI-session → repo/branch/PR, verification, context-read, and review-loop evidence still needs the metadata-only Prism Bridge/production adapter.
- `Loop.MD` remains offered. Full FMEA and paid coaching golden evals require owner approval.

**Session efficiency:** 🎯 ~55% Admin trace + dogfooding evidence · 🔧 ~35% verification/deployment · ⏸ ~10% GitHub installation approval gate
