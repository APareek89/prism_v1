# Prism Codex — handoff

last-synced: f17c605 · branch: `codex/admin-measurement-reset` · workspace: `/Users/anandpareek/Documents/Prism_codex`

## Objective

Deliver a clearer AI-Native Engineering Index plus a real-input MVP: GitHub defines delivery evidence/team membership, each developer opts into Codex or Claude Code metadata, and deterministic MAIN/HARNESS calculations remain unchanged.

## Current state

- ✅ Shipped: decision-first real-data UI, GitHub team/evidence sync, exact-email Supabase/Resend login, per-user Codex/Claude metadata-only OTEL, deterministic scoring boundary, no demo rows, private GitHub repo, and Render deployment (see git log and `Learning.MD`).
- ✅ Shipped: installer and OTLP collector routes accept their own invite/bearer credentials without a browser session; management routes remain Supabase-protected. PR #6 is merged and the hosted invalid-invite path returns plain-text 410 rather than HTML.
- ✅ Shipped: PR #7 added the temporary admin-only calculation lab. It replays the existing assembler + deterministic engine, expands every KPI/dimension contribution, and joins it to real commits, PRs, sessions, links, insights, and recommendations. Render `/admin` passed authenticated production QA with no console error or horizontal overflow.
- ✅ Real evidence prepared: private `APareek89/prism-measurement-lab` has five merged PRs, ten feature/test/fix commits plus its bootstrap commit, recognized GPT co-author trailers, and 14 passing tests. PR #5 deliberately captured a failing evidence-contract test before the fix so rework/course-correction is inspectable.
- ⏸ Reset gated by GitHub: App installation 143692925 uses selected repositories and still exposes only `APareek89/prism`; the owner must add `APareek89/prism-measurement-lab` in GitHub installation settings before the destructive clean-slate reset and replacement sync.

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
- Owner action: open `https://github.com/settings/installations/143692925`, configure the `prismai1989` installation, add `prism-measurement-lab` to selected repositories, and save. Device flow is disabled and the `gh` OAuth token cannot modify a GitHub App installation, so this one GitHub UI approval cannot be automated.
- After approval, verify the installation client can list the lab, change both connector `config_jsonb.repo_ids` and `functions.repo_ids` to only `APareek89/prism-measurement-lab`, transactionally clear the 16 historical evidence/computed/narrative tables scoped to the function, run the 2026-07-18 pipeline, and verify `/admin` shows only fresh lab evidence.
- `DIGEST_FROM_EMAIL` is blank (the local Resend API key exists). This does not block hosted auth mail, which uses `AUTH_FROM_EMAIL` or Resend's owner-only default sender. Verify a Resend domain and set both sender variables before inviting the broader team; digest delivery stays off until its sender is configured.
- Inngest was upgraded to patched `^3.54.2`. `npm audit --omit=dev` still reports one transitive LangSmith high advisory whose offered fix requires the LangChain 0.x → 1.x major upgrade; the affected public-prompt/tracing surfaces are not exposed by Prism, so treat that upgrade as a separate compatibility project.
- Add the hosted `/auth/callback` to Supabase Auth redirect URLs as defense-in-depth/fallback, and add the hosted `/api/connectors/github/install` URL to the GitHub App setup/callback configuration.
- Exact AI-session → repo/branch/PR, verification, context-read, and review-loop evidence still needs the metadata-only Prism Bridge/production adapter.
- `Loop.MD` remains offered. Full FMEA and paid coaching golden evals require owner approval.

**Session efficiency:** 🎯 ~55% Admin trace + dogfooding evidence · 🔧 ~35% verification/deployment · ⏸ ~10% GitHub installation approval gate
